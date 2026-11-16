import { SpeechFeedbackService } from './SpeechFeedbackService';

export interface LocalSpeechCallbacks {
  onStatus: (message: string) => void;
  onReady: () => void;
  onSpeechDetected: () => void;
  onSpeechEnded?: () => void;
  onAudioLevel?: (level: number) => void;
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
}

function resampleTo16kHz(
  audioData: Float32Array,
  origSampleRate: number
): Float32Array {
  if (origSampleRate === 16000) {
    return new Float32Array(audioData);
  }
  const ratio = origSampleRate / 16000;
  const newLength = Math.round(audioData.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const srcIdx = i * ratio;
    const low = Math.floor(srcIdx);
    const high = Math.min(audioData.length - 1, low + 1);
    const weight = srcIdx - low;
    result[i] = audioData[low] * (1 - weight) + audioData[high] * weight;
  }
  return result;
}

function normalizeAndPadAudioBuffer(buffer: Float32Array): Float32Array {
  let maxAbs = 0;
  for (let i = 0; i < buffer.length; i++) {
    const abs = Math.abs(buffer[i]);
    if (abs > maxAbs) maxAbs = abs;
  }
  const scale = maxAbs < 0.005 ? 1 : Math.min(8, 0.85 / maxAbs);
  const padded = new Float32Array(buffer.length + 3200);
  for (let i = 0; i < buffer.length; i++) {
    padded[i] = Math.max(-1, Math.min(1, buffer[i] * scale));
  }
  return padded;
}

function cleanWhisperHallucinations(raw: string): string {
  const cleaned = raw
    .replace(/\[.*?\]|\(.*?\)|\*.*?\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const lower = cleaned.toLowerCase().replace(/[.,!?]/g, '').trim();
  if (
    !lower ||
    lower === 'you' ||
    lower === 'thank you' ||
    lower === 'thanks for watching' ||
    lower === 'subtitles by' ||
    lower === 'the' ||
    lower === 'bye'
  ) {
    return '';
  }

  return cleaned;
}

export class LocalSpeechEngine {
  private worker: Worker | null = null;
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private highpassNode: BiquadFilterNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private muteGainNode: GainNode | null = null;
  private callbacks: LocalSpeechCallbacks;
  private isRunning = false;
  private isModelReady = false;
  private isTranscribing = false;

  private preRollChunks: Float32Array[] = [];
  private speechChunks: Float32Array[] = [];
  private isSpeaking = false;
  private silenceStartMs = 0;
  private speechStartMs = 0;
  private muteUntilMs = 0;
  private noiseFloor = 0.005;
  private speakingAvgRms = 0.02;

  constructor(callbacks: LocalSpeechCallbacks) {
    this.callbacks = callbacks;
  }

  public isActivelySpeaking(): boolean {
    return this.isSpeaking;
  }

  public flushNow(): void {
    if (this.isSpeaking && this.audioCtx) {
      this.flushSpeechBuffer(this.audioCtx.sampleRate);
    }
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.muteUntilMs = performance.now() + 400;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch {
      this.isRunning = false;
      this.callbacks.onError(
        'Microphone permission denied. Please allow microphone access in your browser.'
      );
      return;
    }

    if (!this.isRunning) {
      this.stop();
      return;
    }

    if (!this.worker) {
      this.worker = new Worker('/whisper-worker.js', { type: 'module' });
      this.worker.onmessage = (event) => {
        const msg = event.data;
        if (!msg) return;

        if (msg.type === 'status') {
          this.callbacks.onStatus(msg.message);
        } else if (msg.type === 'ready') {
          this.isModelReady = true;
          this.callbacks.onReady();
        } else if (msg.type === 'result') {
          this.isTranscribing = false;
          this.callbacks.onSpeechEnded?.();
          const cleaned = cleanWhisperHallucinations(msg.text || '');
          if (cleaned) {
            this.callbacks.onTranscript(cleaned);
          } else {
            this.callbacks.onReady();
          }
        } else if (msg.type === 'error') {
          this.isTranscribing = false;
          this.callbacks.onSpeechEnded?.();
          this.callbacks.onError(msg.message || 'Voice engine error');
        }
      };

      this.worker.postMessage({ type: 'init' });
    } else if (this.isModelReady) {
      this.callbacks.onReady();
    }

    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    this.audioCtx = new Ctor();
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume().catch(() => {});
    }
    const sampleRate = this.audioCtx.sampleRate;

    this.sourceNode = this.audioCtx.createMediaStreamSource(this.stream);
    // High-pass filter at 85Hz removes low-frequency room/fan rumble
    this.highpassNode = this.audioCtx.createBiquadFilter();
    this.highpassNode.type = 'highpass';
    this.highpassNode.frequency.value = 85;

    this.processorNode = this.audioCtx.createScriptProcessor(4096, 1, 1);
    this.muteGainNode = this.audioCtx.createGain();
    this.muteGainNode.gain.value = 0;

    this.processorNode.onaudioprocess = (e) => {
      try {
        for (let ch = 0; ch < e.outputBuffer.numberOfChannels; ch++) {
          e.outputBuffer.getChannelData(ch).fill(0);
        }
      } catch {
        // Ignore
      }

      if (!this.isRunning) return;

      const now = performance.now();

      if (SpeechFeedbackService.isSpeaking()) {
        this.muteUntilMs = now + 450;
        if (this.isSpeaking) {
          this.isSpeaking = false;
          this.callbacks.onSpeechEnded?.();
        }
        this.speechChunks = [];
        this.preRollChunks = [];
        this.callbacks.onAudioLevel?.(0);
        return;
      }

      if (now < this.muteUntilMs) {
        this.callbacks.onAudioLevel?.(0);
        return;
      }

      const input = e.inputBuffer.getChannelData(0);
      const copy = new Float32Array(input.length);
      copy.set(input);

      let sum = 0;
      for (let i = 0; i < copy.length; i++) {
        const val = copy[i];
        sum += val * val;
      }
      const rms = Math.sqrt(sum / copy.length);
      const level = Math.min(100, Math.round(rms * 900));
      this.callbacks.onAudioLevel?.(level);

      if (!this.isModelReady || this.isTranscribing) return;

      const startThreshold = Math.max(0.011, Math.min(0.038, this.noiseFloor * 2.1));

      if (!this.isSpeaking) {
        this.noiseFloor = this.noiseFloor * 0.92 + Math.min(rms, 0.025) * 0.08;

        this.preRollChunks.push(copy);
        if (this.preRollChunks.length > 5) {
          this.preRollChunks.shift();
        }

        if (rms > startThreshold) {
          this.isSpeaking = true;
          this.speechStartMs = now;
          this.silenceStartMs = 0;
          this.speakingAvgRms = rms;
          this.speechChunks = [...this.preRollChunks, copy];
          this.preRollChunks = [];
          this.callbacks.onSpeechDetected();
        }
      } else {
        this.speechChunks.push(copy);
        this.speakingAvgRms = this.speakingAvgRms * 0.82 + rms * 0.18;

        const stopThreshold = Math.max(
          0.008,
          this.noiseFloor * 1.45,
          this.speakingAvgRms * 0.42
        );

        if (rms < stopThreshold) {
          if (this.silenceStartMs === 0) {
            this.silenceStartMs = now;
          } else if (now - this.silenceStartMs >= 420) {
            this.flushSpeechBuffer(sampleRate);
          }
        } else {
          this.silenceStartMs = 0;
        }

        if (now - this.speechStartMs >= 2800) {
          this.flushSpeechBuffer(sampleRate);
        }
      }
    };

    this.sourceNode.connect(this.highpassNode);
    this.highpassNode.connect(this.processorNode);
    this.processorNode.connect(this.muteGainNode);
    this.muteGainNode.connect(this.audioCtx.destination);
  }

  private flushSpeechBuffer(origSampleRate: number): void {
    this.isSpeaking = false;
    this.silenceStartMs = 0;

    if (this.speechChunks.length < 2 || !this.worker) {
      this.speechChunks = [];
      this.callbacks.onSpeechEnded?.();
      this.callbacks.onReady();
      return;
    }

    const totalLen = this.speechChunks.reduce((acc, c) => acc + c.length, 0);
    const merged = new Float32Array(totalLen);
    let offset = 0;
    for (const chunk of this.speechChunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    this.speechChunks = [];

    const resampled = resampleTo16kHz(merged, origSampleRate);
    const normalized = normalizeAndPadAudioBuffer(resampled);

    this.isTranscribing = true;
    this.callbacks.onStatus('Thinking...');
    this.worker.postMessage({
      type: 'transcribe',
      audio: normalized,
    });
  }

  public stop(): void {
    this.isRunning = false;
    if (this.isSpeaking) {
      this.isSpeaking = false;
      this.callbacks.onSpeechEnded?.();
    }
    this.speechChunks = [];
    this.preRollChunks = [];
    this.callbacks.onAudioLevel?.(0);

    if (this.processorNode) {
      try {
        this.processorNode.disconnect();
      } catch {
        // Ignore
      }
      this.processorNode = null;
    }
    if (this.highpassNode) {
      try {
        this.highpassNode.disconnect();
      } catch {
        // Ignore
      }
      this.highpassNode = null;
    }
    if (this.muteGainNode) {
      try {
        this.muteGainNode.disconnect();
      } catch {
        // Ignore
      }
      this.muteGainNode = null;
    }
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        // Ignore
      }
      this.sourceNode = null;
    }
    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch {
        // Ignore
      }
      this.audioCtx = null;
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
  }
}
