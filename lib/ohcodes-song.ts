import { preparedPassage, readArrangement, type PassageScore, type SongEntry } from './ohcodes-language';

export type PreparedSong = { source: string; entries: (SongEntry & { score: PassageScore })[]; totalBars: number };
export type SongFrame = { index: number; bar: number; songBar: number; entry: PreparedSong['entries'][number] };

export function prepareSong(source: string): PreparedSong {
  const draft = readArrangement(source);
  if (draft.error) throw new Error(draft.error);
  if (!draft.entries.length) throw new Error('Add a song order, like song{ followed by "Verse" 8 and a closing }.');
  let expanded = source;
  const scores = new Map<string, PassageScore>();
  // Compile every referenced passage before playback. Unused drafts may be unfinished.
  for (const entry of draft.entries) {
    if (scores.has(entry.name)) continue;
    try {
      const prepared = preparedPassage(expanded, entry.name);
      expanded = prepared.source;
      scores.set(entry.name, prepared.score);
    } catch (caught) { throw new Error(`Song section “${entry.name}”: ${caught instanceof Error ? caught.message : 'Could not read this passage.'}`); }
  }
  return { source: expanded, entries: draft.entries.map((entry) => ({ ...entry, score: scores.get(entry.name)! })), totalBars: draft.entries.reduce((total, entry) => total + entry.bars, 0) };
}

// Elapsed bars never wrap: re-evaluation keeps the Song playhead, even after editing lengths.
export function songFrame(song: PreparedSong, elapsed: number): SongFrame | null {
  if (!Number.isInteger(elapsed) || elapsed < 0) throw new Error('Song position must be a nonnegative whole bar.');
  let start = 0;
  for (let index = 0; index < song.entries.length; index += 1) {
    const entry = song.entries[index];
    if (elapsed < start + entry.bars) return { index, bar: elapsed - start + 1, songBar: elapsed + 1, entry };
    start += entry.bars;
  }
  return null;
}

export function updateSongPassage(song: PreparedSong, score: PassageScore): PreparedSong {
  return { ...song, entries: song.entries.map((entry) => entry.name === score.name ? { ...entry, score } : entry) };
}
