import React, { useState } from 'react';
import {
  Play,
  Plus,
  Trash2,
  Heart,
  Shuffle,
  Download,
  Loader2,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';
import { Playlist, Track } from '../types/music';
import { fetchYouTubePlaylist } from '../services/YouTubeService';

interface PlaylistManagerProps {
  libraryTracks: Track[];
  favoriteIds: string[];
  playlists: Playlist[];
  recentlyPlayed: Track[];
  currentTrack: Track;
  onPlayTrack: (track: Track) => void;
  onPlayQueue: (tracks: Track[], startIndex?: number) => void;
  onToggleFavorite: (trackId: string) => void;
  onCreatePlaylist: (name: string, description: string) => void;
  onImportYouTubePlaylist: (title: string, tracks: Track[]) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onRemoveTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  onRemoveTrackFromLibrary: (trackId: string) => void;
}

type LibrarySubTab = 'playlists' | 'favorites' | 'recent' | 'saved';

const YOUTUBE_PLAYLIST_PRESETS = [
  'Coke Studio Bangla All Songs',
  'Bangla Band Rock Hits',
  'Bollywood Highway Ride Mix',
  'Arijit Singh Best Songs',
  'Atif Aslam Coke Studio',
  'English Night Drive Hits',
];

export const PlaylistManager: React.FC<PlaylistManagerProps> = ({
  libraryTracks,
  favoriteIds,
  playlists,
  recentlyPlayed,
  currentTrack,
  onPlayTrack,
  onPlayQueue,
  onToggleFavorite,
  onCreatePlaylist,
  onImportYouTubePlaylist,
  onDeletePlaylist,
  onRemoveTrackFromPlaylist,
  onRemoveTrackFromLibrary,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<LibrarySubTab>('playlists');
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [ytImportInput, setYtImportInput] = useState('');
  const [isImportingYt, setIsImportingYt] = useState(false);
  const [expandedPlaylistId, setExpandedPlaylistId] = useState<string | null>(
    playlists[0]?.id || null
  );

  const favoriteTracks = libraryTracks.filter((t) => favoriteIds.includes(t.id));

  const handleCreatePlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    onCreatePlaylist(newPlaylistName.trim(), '');
    setNewPlaylistName('');
    setShowCreateForm(false);
  };

  const handleImportYouTube = async (queryOrUrl: string) => {
    const target = queryOrUrl.trim();
    if (!target || isImportingYt) return;

    setIsImportingYt(true);
    const result = await fetchYouTubePlaylist(target);
    if (result.tracks.length > 0) {
      onImportYouTubePlaylist(result.title, result.tracks);
      setYtImportInput('');
    }
    setIsImportingYt(false);
  };

  const handleShufflePlay = (tracks: Track[]) => {
    if (tracks.length === 0) return;
    const shuffled = [...tracks].sort(() => Math.random() - 0.5);
    onPlayQueue(shuffled, 0);
  };

  return (
    <div className="mx-auto max-w-md w-full space-y-4">
      {/* Minimal Segmented Control */}
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex rounded-2xl border border-zinc-800/80 bg-obsidian-900/80 p-1">
          {(
            [
              { id: 'playlists', label: 'Playlists' },
              { id: 'favorites', label: 'Favorites' },
              { id: 'recent', label: 'Recent' },
              { id: 'saved', label: 'All Songs' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                activeSubTab === tab.id
                  ? 'bg-emerald-500 text-obsidian-950'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeSubTab === 'playlists' && (
          <button
            type="button"
            onClick={() => setShowCreateForm((prev) => !prev)}
            className="inline-flex items-center gap-1 rounded-xl border border-zinc-800 bg-obsidian-900 px-3 py-2 text-xs font-medium text-zinc-300 hover:text-white transition"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New</span>
          </button>
        )}
      </div>

      {/* Create Empty Custom Playlist Form */}
      {showCreateForm && activeSubTab === 'playlists' && (
        <form
          onSubmit={handleCreatePlaylist}
          className="flex gap-2 rounded-2xl border border-zinc-800 bg-obsidian-900 p-2.5"
        >
          <input
            type="text"
            required
            value={newPlaylistName}
            onChange={(e) => setNewPlaylistName(e.target.value)}
            placeholder="Custom playlist name..."
            className="flex-1 rounded-xl bg-obsidian-950 px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-obsidian-950 hover:bg-emerald-400"
          >
            Create
          </button>
        </form>
      )}

      {/* Playlists View */}
      {activeSubTab === 'playlists' && (
        <div className="space-y-4">
          {/* Import / Bring YouTube Playlist Box */}
          <div className="rounded-3xl border border-zinc-800/70 bg-obsidian-900/80 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                Bring YouTube Song Playlist
              </span>
              {isImportingYt && (
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Importing songs...
                </span>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleImportYouTube(ytImportInput);
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={ytImportInput}
                onChange={(e) => setYtImportInput(e.target.value)}
                placeholder="Paste YT Playlist URL or type mix (e.g. Bangla Hits)..."
                className="flex-1 rounded-xl border border-zinc-800 bg-obsidian-950 px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isImportingYt || !ytImportInput.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-obsidian-950 hover:bg-emerald-400 disabled:opacity-50 transition shrink-0"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Import</span>
              </button>
            </form>

            {/* One-Click YouTube Playlist Presets */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {YOUTUBE_PLAYLIST_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  disabled={isImportingYt}
                  onClick={() => handleImportYouTube(preset)}
                  className="rounded-full border border-zinc-800 bg-obsidian-950 px-3 py-1 text-[11px] font-medium text-zinc-400 hover:border-emerald-500/40 hover:text-emerald-300 shrink-0 transition"
                >
                  + {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Playlist Cards */}
          {playlists.map((playlist) => {
            const resolvedTracks = playlist.trackIds
              .map((id) => libraryTracks.find((t) => t.id === id))
              .filter((t): t is Track => Boolean(t));

            const isExpanded = expandedPlaylistId === playlist.id;
            const collageThumbs = resolvedTracks.slice(0, 4).map((t) => t.thumbnail);

            return (
              <div
                key={playlist.id}
                className="rounded-3xl border border-zinc-800/70 bg-obsidian-900/80 overflow-hidden transition"
              >
                {/* Playlist Card Header with 2x2 Cover Art Collage */}
                <div className="p-4 flex items-center gap-3.5">
                  <button
                    type="button"
                    onClick={() =>
                      resolvedTracks.length > 0 && onPlayQueue(resolvedTracks, 0)
                    }
                    className="relative h-16 w-16 rounded-2xl overflow-hidden bg-obsidian-950 shrink-0 border border-zinc-800/80 grid grid-cols-2 grid-rows-2 group"
                  >
                    {collageThumbs.length >= 4 ? (
                      collageThumbs.map((src, i) => (
                        <img
                          key={i}
                          src={src}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ))
                    ) : collageThumbs.length > 0 ? (
                      <img
                        src={collageThumbs[0]}
                        alt=""
                        className="col-span-2 row-span-2 h-full w-full object-cover"
                      />
                    ) : (
                      <div className="col-span-2 row-span-2 flex items-center justify-center text-zinc-600 text-xs">
                        YT
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                      <Play className="h-6 w-6 text-white fill-current" />
                    </div>
                  </button>

                  <div
                    onClick={() =>
                      setExpandedPlaylistId(isExpanded ? null : playlist.id)
                    }
                    className="min-w-0 flex-1 cursor-pointer"
                  >
                    <h3 className="text-sm font-bold text-white truncate">
                      {playlist.name}
                    </h3>
                    <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                      {resolvedTracks.length} songs
                      {playlist.description ? ` • ${playlist.description}` : ''}
                    </p>

                    <div className="mt-2 flex items-center gap-2">
                      {resolvedTracks.length > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPlayQueue(resolvedTracks, 0);
                            }}
                            className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-[11px] font-semibold text-obsidian-950 hover:bg-emerald-400 transition"
                          >
                            <Play className="h-3 w-3 fill-current" />
                            <span>Play</span>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleShufflePlay(resolvedTracks);
                            }}
                            className="inline-flex items-center gap-1 rounded-full border border-zinc-800 bg-obsidian-950 px-2.5 py-1 text-[11px] font-medium text-zinc-300 hover:text-white transition"
                          >
                            <Shuffle className="h-3 w-3" />
                            <span>Mix</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {!playlist.id.startsWith('playlist-') && (
                      <button
                        type="button"
                        onClick={() => onDeletePlaylist(playlist.id)}
                        aria-label="Delete playlist"
                        className="p-2 text-zinc-500 hover:text-rose-400 transition"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedPlaylistId(isExpanded ? null : playlist.id)
                      }
                      className="p-2 text-zinc-400 hover:text-white transition"
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expandable Playlist Songs */}
                {isExpanded && resolvedTracks.length > 0 && (
                  <div className="border-t border-zinc-800/50 bg-obsidian-950/50 divide-y divide-zinc-800/40 max-h-72 overflow-y-auto">
                    {resolvedTracks.map((track, idx) => {
                      const active = currentTrack.youtubeId === track.youtubeId;
                      return (
                        <div
                          key={`${playlist.id}-${track.id}-${idx}`}
                          className={`flex items-center justify-between gap-3 px-4 py-2.5 transition ${
                            active
                              ? 'bg-emerald-500/15'
                              : 'hover:bg-zinc-800/30'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => onPlayQueue(resolvedTracks, idx)}
                            className="flex items-center gap-3 min-w-0 flex-1 text-left"
                          >
                            <span className="text-[11px] font-medium text-zinc-500 w-4">
                              {idx + 1}
                            </span>
                            <img
                              src={track.thumbnail}
                              alt={track.title}
                              className="h-9 w-9 rounded-lg object-cover shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <p
                                className={`text-xs font-semibold truncate ${
                                  active ? 'text-emerald-400' : 'text-zinc-200'
                                }`}
                              >
                                {track.title}
                              </p>
                              <p className="text-[11px] text-zinc-500 truncate">
                                {track.artist}
                              </p>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onRemoveTrackFromPlaylist(playlist.id, track.id)
                            }
                            className="p-1.5 text-zinc-600 hover:text-rose-400 transition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Favorites / Recent / Saved Views */}
      {activeSubTab !== 'playlists' && (
        <div className="rounded-3xl border border-zinc-800/60 bg-obsidian-900/80 divide-y divide-zinc-800/40 overflow-hidden">
          {(activeSubTab === 'favorites'
            ? favoriteTracks
            : activeSubTab === 'recent'
            ? recentlyPlayed
            : libraryTracks
          ).map((track, idx) => {
            const active = currentTrack.youtubeId === track.youtubeId;
            const isFav = favoriteIds.includes(track.id);
            return (
              <div
                key={`${track.id}-${idx}`}
                className={`flex items-center justify-between gap-3 p-3 transition ${
                  active ? 'bg-emerald-500/10' : 'hover:bg-zinc-800/30'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onPlayTrack(track)}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left"
                >
                  <img
                    src={track.thumbnail}
                    alt={track.title}
                    className="h-10 w-10 rounded-xl object-cover shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-semibold truncate ${
                        active ? 'text-emerald-400' : 'text-zinc-100'
                      }`}
                    >
                      {track.title}
                    </p>
                    <p className="text-xs text-zinc-500 truncate">
                      {track.artist}
                    </p>
                  </div>
                </button>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onToggleFavorite(track.id)}
                    className={`p-2 rounded-full transition ${
                      isFav ? 'text-rose-400' : 'text-zinc-500 hover:text-zinc-200'
                    }`}
                  >
                    <Heart className={`h-4 w-4 ${isFav ? 'fill-current' : ''}`} />
                  </button>

                  {activeSubTab === 'saved' && track.category === 'custom' && (
                    <button
                      type="button"
                      onClick={() => onRemoveTrackFromLibrary(track.id)}
                      className="p-2 text-zinc-500 hover:text-rose-400 transition"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {activeSubTab === 'favorites' && favoriteTracks.length === 0 && (
            <p className="p-8 text-center text-xs text-zinc-500">
              No favorites saved yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
