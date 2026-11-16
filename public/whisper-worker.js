import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

env.allowLocalModels = false;
env.useBrowserCache = true;

let transcriberPromise = null;

async function getTranscriber() {
  if (!transcriberPromise) {
    self.postMessage({
      type: 'status',
      message: 'Loading fast voice AI...',
    });
    transcriberPromise = pipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-tiny.en',
      {
        quantized: true,
        progress_callback: (prog) => {
          if (prog && prog.status === 'progress' && typeof prog.progress === 'number') {
            self.postMessage({
              type: 'status',
              message: `Loading voice AI (${Math.round(prog.progress)}%)...`,
            });
          }
        },
      }
    );
  }
  return transcriberPromise;
}

self.addEventListener('message', async (event) => {
  const data = event.data;
  if (!data) return;

  if (data.type === 'init') {
    try {
      await getTranscriber();
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to load voice model',
      });
    }
    return;
  }

  if (data.type === 'transcribe' && data.audio) {
    try {
      const transcriber = await getTranscriber();
      const audioArray =
        data.audio instanceof Float32Array
          ? data.audio
          : new Float32Array(data.audio);

      const output = await transcriber(audioArray, {
        return_timestamps: false,
        max_new_tokens: 16,
        temperature: 0,
      });

      const text = (output && typeof output.text === 'string' ? output.text : '').trim();
      self.postMessage({ type: 'result', text });
    } catch (err) {
      self.postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : 'Transcription error',
      });
    }
  }
});
