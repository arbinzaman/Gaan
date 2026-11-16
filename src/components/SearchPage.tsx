import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  Play,
  Heart,
  ExternalLink,
  ListPlus,
  Loader2,
} from 'lucide-react';
import { Playlist, Track } from '../types/music';
import {
  fetchYouTubeMetadata,
  getYouTubeSearchExternalUrl,
  parseYouTubeInput,
  searchLocalCatalog,
  searchYouTubeOnline,
} from '../services/YouTubeService';

interface SearchPageProps {
  libraryTracks: Track[];
  currentTrack: Track;
  favoriteIds: string[];
  playlists: Playlist[];
  youtubeApiKey: string;
  initialSearchQuery?: string;
  onPlayTrack: (track: Track) => void;
  onAddTrackToLibrary: (track: Track) => void;
  onToggleFavorite: (trackId: string) => void;
  onAddTrackToPlaylist: (playlistId: string, track: Track) => void;
}

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'riding', label: 'Riding' },
  { id: 'relaxing', label: 'Relaxing' },
  { id: 'bangla', label: 'Bangla' },
  { id: 'rock', label: 'Rock' },
  { id: 'pop', label: 'Pop' },
] as const;

export const SearchPage: React.FC<SearchPageProps> = ({
  libraryTracks,
  currentTrack,
  favoriteIds,
  playlists,
  youtubeApiKey,
  initialSearchQuery = '',
  onPlayTrack,
  onAddTrackToLibrary,
  onToggleFavorite,
  onAddTrackToPlaylist,
}) => {
  const [query, setQuery] = useState(initialSearchQuery);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [remoteResults, setRemoteResults] = useState<Track[]>([]);
  const [isSearchingRemote, setIsSearchingRemote] = useState(false);
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [playlistDropdownFor, setPlaylistDropdownFor] = useState<string | null>(null);

  useEffect(() => {
    if (initialSearchQuery) {
      setQuery(initialSearchQuery);
    }
  }, [initialSearchQuery]);

  const parsedUrl = useMemo(() => parseYouTubeInput(query), [query]);

  const localResults = useMemo(() => {
    const byCategory =
      selectedCategory === 'all'
        ? libraryTracks
        : libraryTracks.filter((t) => t.category === selectedCategory);

    if (!query.trim() || parsedUrl.videoId) {
      return byCategory;
    }

    return searchLocalCatalog(query, byCategory);
  }, [libraryTracks, query, selectedCategory, parsedUrl.videoId]);

  // Search online YouTube catalog automatically when user types a query
  useEffect(() => {
    if (!query.trim() || parsedUrl.videoId || query.trim().length < 2) {
      setRemoteResults([]);
      setIsSearchingRemote(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsSearchingRemote(true);
      const items = await searchYouTubeOnline(query, youtubeApiKey, true);
      if (!cancelled) {
        const localIds = new Set(libraryTracks.map((t) => t.youtubeId));
        setRemoteResults(items.filter((i) => !localIds.has(i.youtubeId)));
        setIsSearchingRemote(false);
      }
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, youtubeApiKey, parsedUrl.videoId, libraryTracks]);

  const handleLoadAndPlayUrl = async () => {
    if (!parsedUrl.videoId) return;
    setIsLoadingUrl(true);
    const track = await fetchYouTubeMetadata(
      parsedUrl.videoId,
      parsedUrl.playlistId
    );
    onAddTrackToLibrary(track);
    onPlayTrack(track);
    setIsLoadingUrl(false);
    setQuery('');
  };

  const combinedTracks = useMemo(
    () => [...localResults, ...remoteResults],
    [localResults, remoteResults]
  );

  return (
    <div className="mx-auto max-w-xl w-full space-y-4">
      {/* Unified Minimalist Search & URL Input */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search songs, artists, or paste a YouTube link..."
          className="w-full rounded-2xl border border-zinc-800/80 bg-obsidian-900/80 pl-11 pr-4 py-3.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500/60 focus:outline-none"
        />
        {isSearchingRemote && (
          <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-400 animate-spin" />
        )}
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setSelectedCategory(cat.id)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium shrink-0 transition ${
              selectedCategory === cat.id
                ? 'bg-emerald-500 text-obsidian-950 font-semibold'
                : 'border border-zinc-800/80 bg-obsidian-900/60 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Instant YouTube URL Card when link pasted */}
      {parsedUrl.videoId && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-emerald-300">
              YouTube Link Ready
            </p>
            <p className="text-xs text-zinc-400 truncate mt-0.5">
              Video ID: {parsedUrl.videoId}
            </p>
          </div>
          <button
            type="button"
            onClick={handleLoadAndPlayUrl}
            disabled={isLoadingUrl}
            className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-obsidian-950 hover:bg-emerald-400 transition shrink-0"
          >
            {isLoadingUrl ? 'Loading...' : 'Play & Save'}
          </button>
        </div>
      )}

      {/* Clean Minimal Track List */}
      <div className="rounded-3xl border border-zinc-800/60 bg-obsidian-900/60 backdrop-blur-xl divide-y divide-zinc-800/40 overflow-hidden">
        {combinedTracks.map((track) => {
          const isPlayingThis = currentTrack.youtubeId === track.youtubeId;
          const isFav = favoriteIds.includes(track.id);

          return (
            <div
              key={track.id}
              className={`flex items-center justify-between gap-3 p-3 transition ${
                isPlayingThis ? 'bg-emerald-500/10' : 'hover:bg-zinc-800/30'
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  onAddTrackToLibrary(track);
                  onPlayTrack(track);
                }}
                className="flex items-center gap-3 min-w-0 flex-1 text-left"
              >
                <img
                  src={track.thumbnail}
                  alt={track.title}
                  className="h-11 w-11 rounded-xl object-cover shrink-0 bg-zinc-900"
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-semibold truncate ${
                      isPlayingThis ? 'text-emerald-400' : 'text-zinc-100'
                    }`}
                  >
                    {track.title}
                  </p>
                  <p className="text-xs text-zinc-500 truncate">{track.artist}</p>
                </div>
              </button>

              <div className="flex items-center gap-1 shrink-0 relative">
                <button
                  type="button"
                  onClick={() => onToggleFavorite(track.id)}
                  aria-label="Favorite"
                  className={`p-2 rounded-full transition ${
                    isFav
                      ? 'text-rose-400'
                      : 'text-zinc-500 hover:text-zinc-200'
                  }`}
                >
                  <Heart className={`h-4 w-4 ${isFav ? 'fill-current' : ''}`} />
                </button>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      setPlaylistDropdownFor((prev) =>
                        prev === track.id ? null : track.id
                      )
                    }
                    aria-label="Add to playlist"
                    className="p-2 rounded-full text-zinc-500 hover:text-zinc-200 transition"
                  >
                    <ListPlus className="h-4 w-4" />
                  </button>

                  {playlistDropdownFor === track.id && (
                    <div className="absolute right-0 mt-1 w-44 rounded-2xl border border-zinc-800 bg-obsidian-900 p-1.5 shadow-2xl z-20">
                      {playlists.map((pl) => (
                        <button
                          key={pl.id}
                          type="button"
                          onClick={() => {
                            onAddTrackToPlaylist(pl.id, track);
                            setPlaylistDropdownFor(null);
                          }}
                          className="w-full text-left rounded-xl px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-emerald-500/15 hover:text-emerald-300 transition truncate"
                        >
                          {pl.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onAddTrackToLibrary(track);
                    onPlayTrack(track);
                  }}
                  aria-label={`Play ${track.title}`}
                  className="p-2 rounded-full text-zinc-300 hover:text-emerald-400 transition"
                >
                  <Play className="h-4 w-4 fill-current" />
                </button>
              </div>
            </div>
          );
        })}

        {combinedTracks.length === 0 && !isSearchingRemote && (
          <div className="p-8 text-center space-y-3">
            <p className="text-xs text-zinc-400">
              No local match for &ldquo;{query}&rdquo;. Find it on YouTube and paste its link above:
            </p>
            <a
              href={getYouTubeSearchExternalUrl(query, false)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-obsidian-950 hover:bg-emerald-400 transition"
            >
              <span>Search YouTube</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
