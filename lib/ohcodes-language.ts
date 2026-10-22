// ohcodes rhythm grammar. Source text stays authoritative; the step editor is a view of it.
import { DEFAULT_SOUNDBANK, defaultSoundbank, resolveSoundbank, validateSoundbank, type SoundbankId } from './ohcodes-soundbanks';
import { EFFECTS, parseEffect, type Effect, type EffectId } from './ohcodes-effects';
import { parseScale, degreePitch, searchScales, type InstrumentScale } from './ohcodes-scales';
import { evaluateNumber, splitExpressionTokens, splitTopLevel } from './ohcodes-expressions';
export const PARTS = ['bd', 'sd', 'hh', 'oh', 'cym', 'rd', 'rim', 't1', 't2', 't3', 'ft'] as const;
export type DrumPart = (typeof PARTS)[number];
export const NOTE_PARTS = ['bass', 'keys', 'piano', 'synth', 'pad', 'pluck', 'guitar'] as const;
export type NotePart = (typeof NOTE_PARTS)[number];
export const INSTRUMENTS = [...PARTS, ...NOTE_PARTS] as const;
export type Part = (typeof INSTRUMENTS)[number];
export function isDrumPart(part: Part): part is DrumPart { return (PARTS as readonly string[]).includes(part); }
export const PART_NAMES: Record<Part, string> = {
  bd: 'Bass drum', sd: 'Snare', hh: 'Closed hat', oh: 'Open hat', cym: 'Crash', rd: 'Ride',
  rim: 'Rim', t1: 'High tom', t2: 'Mid tom', t3: 'Low tom', ft: 'Floor tom',
  bass: 'Bass', keys: 'Keys', piano: 'Piano', synth: 'Synth', pad: 'Pad', pluck: 'Pluck', guitar: 'Guitar',
};
type Pattern = Record<string, string[]>;
type LivePattern = { part: Part; track?: string; slots: number; grid: number; hits: number[] };
export type TrackIdentity = { part: Part; track?: string };
export function trackId(track: TrackIdentity): string { return track.track === undefined ? track.part : `@${track.track}`; }
export function trackLabel(track: TrackIdentity): string { return track.track ?? track.part; }
export type PlaybackSelection = { mute: string[]; solo: string[] };
export function trackIsAudible(score: Pick<ParsedScore, 'selection'>, track: TrackIdentity): boolean {
  const id = trackId(track), selection = score.selection;
  return !selection || (!selection.solo.length || selection.solo.includes(id)) && !selection.mute.includes(id);
}
export type ParsedScore = {
  tempo: number; beats: number; unit: number; kit: string;
  pattern: Pattern; livePatterns: LivePattern[]; source: string;
  timbres: Record<string, SoundbankId>;
  volumes: Record<string, number>;
  effects: Record<string, Effect[]>;
  velocities: Record<string, number[]>;
  swings: Record<string, number>;
  trackParts?: Record<string, TrackIdentity>;
  selection?: PlaybackSelection;
  noteEvents: NoteEvent[];
};
export type PassageDraft = {
  name: string; start: number; end: number; bodyStart: number; bodyEnd: number;
  body: string; closed: boolean; legacy: boolean;
};
export type PassageScore = {
  name: string;
  // A bounded alignment cycle, not extra written bars. 3- and 4-bar tracks meet every 12 bars.
  bars: ParsedScore[];
  trackBars: (TrackIdentity & { length: number })[];
  writtenBars: number;
};
export type QueuedPassage = { score: PassageScore; restart: boolean };
export type DrumRow = TrackIdentity & { key: string; lineIndex: number; start: number; text: string };
const ROW_HEAD = new RegExp(`^[ \\t]*(?:([a-zA-Z_][a-zA-Z_0-9]*)[ \\t]*=[ \\t]*)?(${INSTRUMENTS.join('|')})\\b`);

export const STARTER = `tempo 122
time 4/4

passage"Passage 1"{
  bd([][][][])
}`;

function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b); }
function lcm(a: number, b: number) { return a * b / gcd(a, b); }
function defaultSubdivision(unit: number) { return Math.max(1, 16 / unit); }
export function emptyRow(part: Part, beats: number, _unit: number) { return `${part}(${'[]'.repeat(beats)})`; }
function emptyRows(beats: number, unit: number) { return PARTS.map((part) => emptyRow(part, beats, unit)).join('\n'); }

// Mask comments without changing offsets, so a click can change exactly one source character.
function maskComments(source: string) {
  let quote = '';
  let comment = false;
  return source.split('').map((char, index) => {
    if (char === '\n') { comment = false; return char; }
    if (comment) return ' ';
    if (!quote && char === '/' && source[index + 1] === '/') { comment = true; return ' '; }
    if (char === '"' || char === "'") quote = quote === char ? '' : quote || char;
    return char;
  }).join('');
}

function parenthesesDepth(source: string) {
  let depth = 0;
  let quote = '';
  for (const char of maskComments(source)) {
    if (char === '"' || char === "'") { quote = quote === char ? '' : quote || char; continue; }
    if (!quote && char === '(') depth += 1;
    if (!quote && char === ')') depth -= 1;
  }
  return depth;
}

export function drumRows(source: string): DrumRow[] {
  const rows: DrumRow[] = [];
  const occurrences = new Map<string, number>();
  const lines = source.split('\n');
  let start = 0;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const firstLine = lineIndex;
    let text = lines[lineIndex];
    const match = text.match(ROW_HEAD);
    if (match) {
      while (lineIndex + 1 < lines.length) {
        let nextIndex = lineIndex + 1;
        if (parenthesesDepth(text) <= 0) {
          // A modifier can continue on the next line, even after a comment/blank line.
          while (nextIndex < lines.length && !maskComments(lines[nextIndex]).trim()) nextIndex += 1;
          if (nextIndex >= lines.length || !/^\s*\./.test(maskComments(lines[nextIndex]))) break;
        }
        const next = lines[nextIndex];
        // An unfinished instrument must not consume the next instrument or passage.
        if (ROW_HEAD.test(next) || /^\s*(?:passage\b|tempo\b|time\b|kit\b|mute\b|solo\b|})/.test(next)) break;
        text += `\n${lines.slice(lineIndex + 1, nextIndex + 1).join('\n')}`;
        lineIndex = nextIndex;
      }
      const part = match[2] as Part;
      const identity = { part, ...(match[1] ? { track: match[1] } : {}) };
      const id = trackId(identity);
      const occurrence = occurrences.get(id) ?? 0;
      rows.push({ key: `${id}:${occurrence}`, ...identity, lineIndex: firstLine, start, text });
      occurrences.set(id, occurrence + 1);
    }
    start += text.length + 1;
  }
  return rows;
}

// Split only at bar separators, never inside beat brackets, quoted live patterns, or parentheses.
function splitBars(source: string) {
  const bars: string[] = [];
  let quote = '';
  let depth = 0;
  let brackets = 0;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"' || char === "'") { quote = quote === char ? '' : quote || char; continue; }
    if (quote) continue;
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === '[') brackets += 1;
    if (char === ']') brackets -= 1;
    if ((char === ',' || char === '|') && depth === 0 && brackets === 0) {
      bars.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  bars.push(source.slice(start).trim());
  return bars;
}

function parseLivePattern(part: Part, body: string): LivePattern {
  const tokens = splitExpressionTokens(body);
  if (!tokens.length) throw new Error(`${part}: use x for a hit or ~ for a rest in a quoted pattern.`);
  if (tokens.length > 64) throw new Error(`${part} live pattern can have up to 64 slots.`);
  const hits: number[] = [];
  let grid = tokens.length;
  tokens.forEach((token, index) => {
    const match = token.match(/^(x|~)(?:\*([\s\S]+))?$/);
    if (!match) throw new Error(`${part}: quoted patterns accept x, ~, spaces, and *repeat.`);
    const repeat = match[2] ? evaluateNumber(match[2], `${part} repeat`) : 1;
    if (!Number.isSafeInteger(repeat) || repeat < 1 || repeat > 32) throw new Error(`${part} repeat must be a whole number between *1 and *32.`);
    grid = lcm(grid, tokens.length * repeat);
    if (match[1] === '~') return;
    for (let step = 0; step < repeat; step += 1) hits.push((index + step / repeat) / tokens.length);
  });
  if (hits.length > 256) throw new Error(`${part} can trigger up to 256 hits per bar.`);
  return { part, slots: tokens.length, grid, hits };
}

function parseBeat(part: Part, raw: string) {
  const steps = /^[01~～\s]*$/.test(raw) ? raw.replace(/\s/g, '').replace(/[~～]/g, '0') : splitExpressionTokens(raw).map((token) => {
    if (/^[01~～]+$/.test(token)) return token.replace(/[~～]/g, '0');
    let value: number;
    try { value = evaluateNumber(token, `${part} trigger`); }
    catch (error) { throw new Error(`${part}: inside a beat, use 1 for a hit and ~ (or 0) for a rest. ${error instanceof Error ? error.message : ''}`); }
    if (value !== 0 && value !== 1) throw new Error(`${part}: a computed drum trigger must equal 0 or 1. Use 1 for a hit and 0 for a rest.`);
    return String(value);
  }).join('');
  if (steps.length > 64) throw new Error(`${part}: use up to 64 subdivisions in one beat.`);
  return steps;
}

type NoteToken = { notes: number[]; weight: number };
export type NoteEvent = { part: NotePart; track?: string; offset: number; notes: number[]; duration: number; swingable?: boolean };
export type ScoreHit = TrackIdentity & { offset: number; notes?: number[]; duration?: number; velocity?: number };
const CHORDS: Record<string, number[]> = { maj: [0, 4, 7], min: [0, 3, 7], m: [0, 3, 7], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], m7: [0, 3, 7, 10], dom7: [0, 4, 7, 10], dim: [0, 3, 6], sus2: [0, 2, 7], sus4: [0, 5, 7] };
const NOTE_CLASS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function notePitches(value: string): number[] {
  const computed = value.match(/^([a-g][#b]?)\((.*)\)([a-z0-9]*)$/i);
  if (computed) {
    const octave = evaluateNumber(computed[2], 'Note octave');
    if (!Number.isSafeInteger(octave) || octave < -1 || octave > 9) throw new Error('Use notes within MIDI 0–127 (C-1 to G9), with a whole octave.');
    value = `${computed[1]}${octave}${computed[3]}`;
  }
  const note = value.match(/^([a-g])([#b]?)(-?\d{1,2})?$/i);
  const chord = note ? null : value.match(/^([a-g])([#b]?)(-?\d{1,2})?(maj7|min7|dom7|sus2|sus4|maj|min|dim|m7|m)$/i);
  const match = note ?? chord;
  if (!match) throw new Error(`Unknown note "${value}". Use C4, F#3, Bb3, C3&E3&G3, or C3maj7.`);
  const root = (Number(match[3] ?? 4) + 1) * 12 + NOTE_CLASS[match[1].toUpperCase()] + (match[2] === '#' ? 1 : match[2] ? -1 : 0);
  const notes = (chord ? CHORDS[chord[4].toLowerCase()] : [0]).map((interval) => root + interval);
  if (notes.some((midi) => midi < 0 || midi > 127)) throw new Error('Use notes within MIDI 0–127 (C-1 to G9).');
  return notes;
}
function parseNoteBeat(part: NotePart, raw: string, scale: InstrumentScale | null): NoteToken[] {
  const tokens = splitExpressionTokens(raw.trim().replace(/\s*&\s*/g, '&'));
  if (tokens.length > 64) throw new Error(`${part}: use up to 64 notes or rests inside one group.`);
  return tokens.map((token) => {
    const [pitch, ...factors] = splitTopLevel(token, '*');
    if (!pitch) throw new Error(`${part}: write a note like C4 or C4*2. * changes its share of this group.`);
    const weight = factors.length ? evaluateNumber(factors.join('*'), `${part} time weight`) : 1;
    if (!Number.isSafeInteger(weight) || weight < 1 || weight > 16) throw new Error(`${part}: use a whole time weight from *1 to *16.`);
    const pitches = splitTopLevel(pitch, '&');
    if (/^[~～0]$/.test(pitch) || pitches.length === 1 && /^\(/.test(pitch) && evaluateNumber(pitch, `${part} degree`) === 0) return { notes: [], weight };
    const notes = [...new Set(pitches.flatMap((value) => /^[+#\-]?(?:\d|\()/.test(value) || scale?.chromatic && /^b(?:\d|\()/.test(value) ? [degreePitch(value, scale)] : notePitches(value)))];
    if (notes.length > 8) throw new Error(`${part}: use up to 8 notes in one chord.`);
    return { notes, weight };
  });
}
type TrackBar = { groups: string[] | null; live: LivePattern | null; notes?: NoteToken[][]; source: string };

function splitRowTimbre(row: DrumRow) {
  const masked = maskComments(row.text);
  let quote = '';
  let depth = 0;
  let brackets = 0;
  let chainStart = -1;
  for (let index = 0; index < masked.length; index += 1) {
    const char = masked[index];
    if (char === '"' || char === "'") { quote = quote === char ? '' : quote || char; continue; }
    if (quote) continue;
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === '[') brackets += 1;
    if (char === ']') brackets -= 1;
    const decimalDot = char === '.' && (/\d/.test(masked[index + 1] ?? '') || /\d/.test(masked[index - 1] ?? '') && !/^[ \t]*[a-z]/i.test(masked.slice(index + 1)));
    if (char === '.' && !decimalDot && depth === 0 && brackets === 0) { chainStart = index; break; }
  }
  if (chainStart < 0) return { rhythm: row.text, rhythmEnd: masked.trimEnd().length, chainStart, chainEnd: masked.trimEnd().length, bankName: null };
  const chainEnd = masked.trimEnd().length;
  const chain = masked.slice(chainStart, chainEnd);
  return { rhythm: row.text.slice(0, chainStart), rhythmEnd: masked.slice(0, chainStart).trimEnd().length, chainStart, chainEnd, chain };
}

function chainSegments(chain: string) {
  const segments: { start: number; end: number; text: string }[] = [];
  let start = 0;
  let depth = 0;
  let quote = '';
  for (let index = 0; index < chain.length; index += 1) {
    const char = chain[index];
    if (char === '"' || char === "'") { quote = quote === char ? '' : quote || char; continue; }
    if (quote) continue;
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === '.' && index > start && depth === 0) {
      const text = chain.slice(start, index).trimEnd();
      segments.push({ start, end: start + text.length, text });
      start = index;
    }
  }
  const text = chain.slice(start).trimEnd();
  segments.push({ start, end: start + text.length, text });
  return segments;
}

function rowTimbreSyntax(row: DrumRow, allowDraft = false) {
  const syntax = splitRowTimbre(row);
  let bankName: string | null = null;
  let timbreStart = -1;
  let timbreEnd = -1;
  let volume = 0;
  let hasVolume = false;
  const effects: Effect[] = [];
  let velocities: number[] = [127];
  let swing = 50;
  let hasVelocity = false;
  let hasSwing = false;
  let scale: InstrumentScale | null = null;
  if (syntax.chainStart >= 0) for (const segment of chainSegments(syntax.chain!)) {
    const bank = segment.text.match(/^\.\s*timbre\s*\(\s*(["'])([^"'\n]+)\1\s*\)$/);
    const level = segment.text.match(/^\.\s*volume\s*\(([\s\S]*)\)$/);
    if (/^\.\s*scale\b/.test(segment.text)) {
      if (isDrumPart(row.part)) throw new Error(`${row.part}: .scale() is for melodic instruments only. Drums keep their 0/1 triggers.`);
      if (scale) throw new Error(`${row.part}: .scale() is defined twice. Use one scale per instrument.`);
      const match = segment.text.match(/^\.\s*scale\s*\(\s*(["'])([^"'\n]+)\1\s*\)$/);
      if (!match) throw new Error(`${row.part}: finish the scale like .scale("C3 major"). Include a root octave and scale name.`);
      scale = parseScale(match[2]);
    } else if (bank) {
      if (bankName !== null) throw new Error(`${row.part}: .timbre() is defined twice. Use one sound per instrument.`);
      bankName = bank[2]; timbreStart = syntax.chainStart + segment.start; timbreEnd = syntax.chainStart + segment.end;
    } else if (level) {
      if (hasVolume) throw new Error(`${row.part}: .volume() is defined twice. Use one level per instrument.`);
      volume = evaluateNumber(level[1], `${row.part} volume`); hasVolume = true;
      if (!Number.isFinite(volume) || volume < -60 || volume > 6) throw new Error(`${row.part}: volume must be between -60 and +6 dB. 0 keeps the original level.`);
    } else if (/^\.\s*effects\b/.test(segment.text)) {
      const effect = parseEffect(segment.text);
      if (effects.some((item) => item.id === effect.id)) throw new Error(`${row.part}: ${effect.id} is defined twice. Use one of each effect per instrument.`);
      effects.push(effect);
    } else if (/^\.\s*velocity\b/.test(segment.text)) {
      if (hasVelocity) throw new Error(`${row.part}: .velocity() is defined twice. Use one repeating sequence per instrument.`);
      const match = segment.text.match(/^\.\s*velocity\s*\(([\s\S]*)\)$/);
      if (!match) throw new Error(`${row.part}: write MIDI strengths like .velocity(90, 45), using whole numbers from 1 to 127.`);
      velocities = splitTopLevel(match[1], ',').map((value) => evaluateNumber(value, `${row.part} velocity`)); hasVelocity = true;
      if (velocities.length > 64 || velocities.some((value) => !Number.isSafeInteger(value) || value < 1 || value > 127)) throw new Error(`${row.part}: velocity uses 1–64 whole values from 1 to 127. Rests belong in the rhythm brackets.`);
    } else if (/^\.\s*swing\b/.test(segment.text)) {
      if (hasSwing) throw new Error(`${row.part}: .swing() is defined twice. Use one amount per instrument.`);
      const match = segment.text.match(/^\.\s*swing\s*\(([\s\S]*)\)$/);
      if (!match) throw new Error(`${row.part}: write .swing(60). Use 50–75%; 50 is straight timing.`);
      swing = evaluateNumber(match[1], `${row.part} swing`); hasSwing = true;
      if (swing < 50 || swing > 75) throw new Error(`${row.part}: swing must be between 50 and 75%. 50 is straight; 60 divides a beat 60:40.`);
    } else if (!(allowDraft && segment.text === '.')) {
      if (segment.text === '.' || /^\.\s*timbre\b[^)]*$/.test(segment.text)) throw new Error(`${row.part}: finish the soundbank like .timbre("studio").`);
      if (/^\.\s*volume\b/.test(segment.text)) throw new Error(`${row.part}: write a volume in dB, like .volume(-6), between -60 and +6.`);
      throw new Error(`${row.part}: this modifier is not connected. Use .timbre("sound-name"), .volume(-6), .effects("reverb", 25), .velocity(90, 45), or .swing(60).`);
    }
  }
  return { ...syntax, bankName, timbreStart, timbreEnd, volume, effects, velocities, swing, hasVelocity, hasSwing, scale };
}

export function rowSoundbank(row: DrumRow, fallback: SoundbankId = DEFAULT_SOUNDBANK) {
  const syntax = rowTimbreSyntax(row, true);
  return validateSoundbank(row.part, syntax.bankName ? resolveSoundbank(syntax.bankName) : defaultSoundbank(row.part, fallback));
}
export function rowVolume(row: DrumRow) { return rowTimbreSyntax(row).volume; }
export function rowEffects(row: DrumRow) { return rowTimbreSyntax(row).effects; }
export function rowGroove(row: DrumRow) { const { velocities, swing } = rowTimbreSyntax(row); return { velocities, swing }; }

export type SoundbankCompletion = { row: DrumRow; query: string; from: number; to: number; cursor: number };

export type ScaleCompletion = SoundbankCompletion;
export function scaleCompletion(source: string, cursor: number): ScaleCompletion | null {
  const row = drumRows(source).find((item) => cursor >= item.start && cursor <= item.start + item.text.length);
  if (!row || isDrumPart(row.part)) return null;
  const syntax = splitRowTimbre(row);
  if (syntax.chainStart < 0) return null;
  for (const segment of chainSegments(syntax.chain!)) {
    const prefix = segment.text.match(/^\.\s*scale\s*\(\s*/);
    const argument = segment.text.match(/^\.\s*scale\s*\(\s*(?:"([^"\n]*)"?|'([^'\n]*)'?|([^"'()\n]*))\s*\)?$/);
    if (!prefix || !argument) continue;
    const quoted = argument[1] !== undefined || argument[2] !== undefined;
    const value = argument[1] ?? argument[2] ?? argument[3];
    const from = row.start + syntax.chainStart + segment.start;
    const to = row.start + syntax.chainStart + segment.end;
    const start = from + prefix[0].length + (quoted ? 1 : 0);
    if (cursor < start || cursor > start + value.length) continue;
    const query = source.slice(start, cursor).trim();
    if (!query || !/^[a-z\d#+*/().\-\s]*$/i.test(query)) return null;
    // Completion changes a draft only; it must also work before degrees can compile.
    return { row, query, from, to, cursor };
  }
  return null;
}
export function completeScale(source: string, completion: ScaleCompletion, value: string) {
  const current = scaleCompletion(source, completion.cursor);
  if (!current || current.from !== completion.from || current.to !== completion.to || current.row.text !== completion.row.text || !searchScales(current.query).some((item) => item.id === value)) throw new Error('This instrument changed. Type inside .scale() again.');
  const scale = parseScale(value);
  const chain = `.scale("${value.includes('(') ? value : scale.name}")`;
  return { source: source.slice(0, current.from) + chain + source.slice(current.to), cursor: current.from + chain.length };
}

// Draft-only completion: no hint on a dot or empty argument, and no focus change.
export function soundbankCompletion(source: string, cursor: number): SoundbankCompletion | null {
  const row = drumRows(source).find((item) => cursor >= item.start && cursor <= item.start + item.text.length);
  if (!row) return null;
  try {
    const syntax = splitRowTimbre(row);
    if (syntax.chainStart < 0) return null;
    const segments = chainSegments(syntax.chain!);
    const segment = segments.find((item) => /^\.\s*timbre\b/.test(item.text));
    if (!segment) return null;
    const chain = segment.text;
    const prefix = chain.match(/^\.\s*timbre\s*\(\s*/);
    const argument = chain.match(/^\.\s*timbre\s*\(\s*(?:"([^"\n)]*)"?|'([^'\n)]*)'?|([^"'()\n]*))\s*\)?$/);
    if (!prefix || !argument) return null;
    const quoted = argument[1] !== undefined || argument[2] !== undefined;
    const value = argument[1] ?? argument[2] ?? argument[3];
    if (!/^[\w -]*$/.test(value)) return null;
    const localStart = syntax.chainStart + segment.start;
    const localEnd = syntax.chainStart + segment.end;
    const start = row.start + localStart + prefix[0].length + (quoted ? 1 : 0);
    if (cursor < start || cursor > start + value.length) return null;
    const query = source.slice(start, cursor).trim();
    if (!query) return null;
    // Validate other modifiers without requiring the draft sound name to resolve.
    rowTimbreSyntax({ ...row, text: `${row.text.slice(0, localStart)}.timbre("studio")${row.text.slice(localEnd)}` });
    parseTrack({ ...row, text: `${row.text.slice(0, localStart)}.timbre("studio")${row.text.slice(localEnd)}` });
    return { row, query, from: row.start + localStart, to: row.start + localEnd, cursor };
  } catch { return null; }
}

export function completeSoundbank(source: string, completion: SoundbankCompletion, bank: SoundbankId) {
  resolveSoundbank(bank);
  validateSoundbank(completion.row.part, bank);
  const current = soundbankCompletion(source, completion.cursor);
  if (!current || current.from !== completion.from || current.to !== completion.to || current.row.text !== completion.row.text) {
    throw new Error('This instrument changed. Type inside .timbre() again to complete its sound.');
  }
  const chain = `.timbre("${bank}")`;
  return { source: `${source.slice(0, current.from)}${chain}${source.slice(current.to)}`, cursor: current.from + chain.length };
}

export type EffectCompletion = SoundbankCompletion & { parameters: string };
// Like timbre search, hints only appear while typing the name inside the parentheses.
export function effectCompletion(source: string, cursor: number): EffectCompletion | null {
  const row = drumRows(source).find((item) => cursor >= item.start && cursor <= item.start + item.text.length);
  if (!row) return null;
  try {
    const syntax = splitRowTimbre(row);
    if (syntax.chainStart < 0) return null;
    for (const segment of chainSegments(syntax.chain!)) {
      const match = segment.text.match(/^\.\s*effects\s*\(\s*(?:"([^"\n)]*)"?|'([^'\n)]*)'?|([\w -]*))\s*(,[\s\S]*)?\)?$/);
      if (!match) continue;
      const prefix = segment.text.match(/^\.\s*effects\s*\(\s*/)!;
      const value = match[1] ?? match[2] ?? match[3];
      const quoted = match[1] !== undefined || match[2] !== undefined;
      if (!/^[\w -]*$/.test(value)) continue;
      const localStart = syntax.chainStart + segment.start;
      const localEnd = syntax.chainStart + segment.end;
      const start = row.start + localStart + prefix[0].length + (quoted ? 1 : 0);
      if (cursor < start || cursor > start + value.length) continue;
      const query = source.slice(start, cursor).trim();
      if (!query) return null;
      // Validate other modifiers, but do not interpret a half-written effect name/parameters.
      rowTimbreSyntax({ ...row, text: `${row.text.slice(0, localStart)}${row.text.slice(localEnd)}` });
      parseTrack({ ...row, text: `${row.text.slice(0, localStart)}${row.text.slice(localEnd)}` });
      const parameters = (match[4] ?? '').trimEnd();
      return { row, query, from: row.start + localStart, to: row.start + localEnd, cursor, parameters: parenthesesDepth(segment.text) === 0 ? parameters.replace(/\)$/, '').trimEnd() : parameters };
    }
  } catch { /* An incomplete rhythm or other modifier must stay an untouched draft. */ }
  return null;
}
export function completeEffect(source: string, completion: EffectCompletion, id: EffectId) {
  const preset = EFFECTS.find((effect) => effect.id === id);
  const current = effectCompletion(source, completion.cursor);
  if (!preset || !current || current.from !== completion.from || current.to !== completion.to || current.row.text !== completion.row.text) throw new Error('This instrument changed. Type inside .effects() again.');
  const chain = current.parameters ? `.effects("${id}"${current.parameters})` : preset.template;
  const row = { ...current.row, text: `${current.row.text.slice(0, current.from - current.row.start)}${chain}${current.row.text.slice(current.to - current.row.start)}` };
  rowTimbreSyntax(row);
  return { source: `${source.slice(0, current.from)}${chain}${source.slice(current.to)}`, cursor: current.from + chain.length };
}
export function setRowEffect(source: string, key: string, index: number, effect: Effect) {
  const row = drumRows(source).find((item) => item.key === key);
  if (!row) throw new Error('This instrument is no longer in the code.');
  const syntax = rowTimbreSyntax(row);
  const current = syntax.effects[index];
  if (!current || current.id !== effect.id) throw new Error('This effect changed. Select the instrument again.');
  const segment = chainSegments(syntax.chain!).filter((item) => /^\.\s*effects\b/.test(item.text))[index];
  const start = row.start + syntax.chainStart + segment.start;
  const end = row.start + syntax.chainStart + segment.end;
  const original = source.slice(start, end);
  const call = segment.text.match(/^(\.\s*effects\s*\()([\s\S]*)(\))$/)!;
  const bodyStart = call[1].length;
  const fields = (value: Effect): (number | string)[] => value.id === 'filter' ? [value.frequency] : value.id === 'reverb' ? [value.mix, value.decay] : [value.mix, value.rate, value.feedback];
  const previous = fields(current), next = fields(effect);
  const changed = next.map((value, field) => value !== previous[field]);
  if (!changed.some(Boolean)) return source;

  // Keep unchanged expressions, spacing, quotes and comments exactly as written.
  // Masked text has the same offsets as source, so only changed argument ranges move.
  let cursor = 0;
  const argumentsWithRanges = splitTopLevel(call[2], ',').map((argument) => {
    const from = call[2].indexOf(argument, cursor);
    cursor = from + argument.length;
    return { from: bodyStart + from, to: bodyStart + cursor };
  });
  const literal = (value: number | string) => typeof value === 'string' ? JSON.stringify(value) : String(value);
  const edits: { from: number; to: number; text: string }[] = [];
  next.forEach((value, field) => {
    const range = argumentsWithRanges[field + 1];
    if (changed[field] && range) edits.push({ ...range, text: literal(value) });
  });
  let lastChanged = changed.length - 1;
  while (!changed[lastChanged]) lastChanged -= 1;
  if (lastChanged + 1 >= argumentsWithRanges.length) {
    const from = argumentsWithRanges[argumentsWithRanges.length - 1].to;
    const missing = next.slice(argumentsWithRanges.length - 1, lastChanged + 1);
    edits.push({ from, to: from, text: `, ${missing.map(literal).join(', ')}` });
  }
  let chain = original;
  for (const edit of edits.sort((a, b) => b.from - a.from)) chain = `${chain.slice(0, edit.from)}${edit.text}${chain.slice(edit.to)}`;
  parseEffect(maskComments(chain));
  return `${source.slice(0, start)}${chain}${source.slice(end)}`;
}

export const GROOVE_MODIFIERS = [
  { id: 'velocity', name: 'Velocity', description: 'MIDI 1–127 · repeat per hit', template: '.velocity(90, 45)', help: '1–127, up to 64 values. One value per hit; rests do not advance. Chords use one value. 127 keeps the original level.' },
  { id: 'swing', name: 'Swing', description: '50–75% · 50 is straight', template: '.swing(60)', help: '50–75%. 50 is straight; 60 splits each beat 60:40. Straight eighths/sixteenths move; triplets and weighted notes stay as written.' },
  { id: 'scale', name: 'Scale', description: 'Root octave + mode · melodic instruments', template: '.scale("")', help: 'Root octave + mode: C3 major, C2 minor, D4 dorian. 1 is root, 8 is the next octave; 0 and ~ rest. Chromatic uses 1 #1 2 … or 7 b7 6 …, not 1–12. In chromatic, b3 is a flat degree; B3 is the note.' },
] as const;
export type GrooveId = (typeof GROOVE_MODIFIERS)[number]['id'];
export type GrooveCompletion = SoundbankCompletion & { options: GrooveId[] };

// Search only after a typed name (.v / .s), not a bare dot. No separate picker.
export function grooveCompletion(source: string, cursor: number): GrooveCompletion | null {
  const row = drumRows(source).find((item) => cursor >= item.start && cursor <= item.start + item.text.length);
  if (!row) return null;
  try {
    const syntax = splitRowTimbre(row);
    if (syntax.chainStart < 0) return null;
    for (const segment of chainSegments(syntax.chain!)) {
      const match = segment.text.match(/^\.\s*([a-z]+)$/i);
      if (!match) continue;
      const from = row.start + syntax.chainStart + segment.start;
      const to = row.start + syntax.chainStart + segment.end;
      const start = to - match[1].length;
      if (cursor <= start || cursor > to) continue;
      const query = source.slice(start, cursor).toLowerCase();
      const other = rowTimbreSyntax({ ...row, text: `${row.text.slice(0, from - row.start)}${row.text.slice(to - row.start)}` });
      const options = GROOVE_MODIFIERS.filter((modifier) => modifier.id.includes(query) && !(modifier.id === 'velocity' ? other.hasVelocity : modifier.id === 'swing' ? other.hasSwing : other.scale || isDrumPart(row.part))).map((modifier) => modifier.id);
      // A scale may be added after writing degrees; there is no implicit default scale.
      if (!options.includes('scale')) parseTrack({ ...row, text: `${row.text.slice(0, from - row.start)}${row.text.slice(to - row.start)}` });
      if (options.length) return { row, query, from, to, cursor, options };
    }
  } catch { /* Other invalid code must stay an untouched draft. */ }
  return null;
}

export function completeGroove(source: string, completion: GrooveCompletion, id: GrooveId) {
  const current = grooveCompletion(source, completion.cursor);
  const modifier = GROOVE_MODIFIERS.find((item) => item.id === id);
  if (!modifier || !current || !current.options.includes(id) || current.from !== completion.from || current.to !== completion.to || current.row.text !== completion.row.text) throw new Error('This instrument changed. Type .v or .s again.');
  return { source: `${source.slice(0, current.from)}${modifier.template}${source.slice(current.to)}`, cursor: current.from + modifier.template.length - (id === 'scale' ? 2 : 1) };
}

export function grooveParameterHint(source: string, cursor: number) {
  const row = drumRows(source).find((item) => cursor >= item.start && cursor <= item.start + item.text.length);
  if (!row) return null;
  const prefixText = row.text.slice(0, cursor - row.start);
  const lineStart = prefixText.lastIndexOf('\n') + 1;
  if (maskComments(prefixText).slice(lineStart) !== prefixText.slice(lineStart)) return null;
  const syntax = splitRowTimbre(row);
  if (syntax.chainStart < 0) return null;
  for (const segment of chainSegments(syntax.chain!)) {
    const prefix = segment.text.match(/^\.\s*(velocity|swing|scale)\s*\(/);
    if (!prefix) continue;
    const start = row.start + syntax.chainStart + segment.start + prefix[0].length;
    const end = row.start + syntax.chainStart + segment.end - (segment.text.endsWith(')') ? 1 : 0);
    if (cursor >= start && (cursor <= end || /^\s*$/.test(source.slice(end, cursor)))) return { row, cursor, modifier: GROOVE_MODIFIERS.find((item) => item.id === prefix[1])! };
  }
  return null;
}

export function draftSoundbank(source: string, row: DrumRow) {
  const document = readPassages(source);
  const passage = document.passages.find((item) => row.start >= item.bodyStart && row.start <= item.bodyEnd);
  const scoped = `${document.globals}\n${passage?.body ?? source}`;
  const kit = [...maskComments(scoped).matchAll(/^\s*kit\s*["']([^"']+)["']\s*$/gm)].at(-1);
  return rowSoundbank(row, kit ? resolveSoundbank(kit[1]) : DEFAULT_SOUNDBANK);
}

// Expand before musical interpretation; a repeated group keeps the same meaning
// as writing that group again. Bound expansion before allocating or scheduling.
function expandedGroups(part: Part, source: string) {
  const groups: string[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    while (/\s/.test(source[cursor] ?? '') && cursor < source.length) cursor += 1;
    if (cursor === source.length) break;
    if (source[cursor] !== '[') throw new Error(`${part}: put *repeat after a beat group, like [1 0]*4.`);
    const close = source.indexOf(']', cursor + 1);
    if (close < 0 || source.slice(cursor + 1, close).includes('[')) throw new Error(`${part}: finish each beat group with ]. Nested beat brackets are not supported.`);
    const group = source.slice(cursor + 1, close);
    cursor = close + 1;
    while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
    let repeat = 1;
    if (source[cursor] === '*') {
      const next = source.indexOf('[', cursor + 1);
      const end = next < 0 ? source.length : next;
      repeat = evaluateNumber(source.slice(cursor + 1, end), `${part} group repeat`);
      cursor = end;
    }
    if (!Number.isSafeInteger(repeat) || repeat < 1 || repeat > 64 || groups.length + repeat > 64) throw new Error(`${part}: use whole group repeats from 1 to 64, with up to 64 groups per bar.`);
    for (let index = 0; index < repeat; index += 1) groups.push(group);
  }
  return groups;
}

function parseTrack(row: DrumRow): TrackBar[] {
  const syntax = rowTimbreSyntax(row);
  if (syntax.bankName) resolveSoundbank(syntax.bankName);
  let body = maskComments(syntax.rhythm).replace(ROW_HEAD, '').trim();
  if (body.startsWith('(')) {
    // Remove the instrument wrapper only when it encloses the entire expression.
    let depth = 0;
    let quote = '';
    let close = -1;
    for (let index = 0; index < body.length; index += 1) {
      const char = body[index];
      if (char === '"' || char === "'") { quote = quote === char ? '' : quote || char; continue; }
      if (quote) continue;
      if (char === '(') depth += 1;
      if (char === ')' && --depth === 0) { close = index; break; }
    }
    if (close < 0) throw new Error(`${row.part}: close the instrument with ).`);
    if (close === body.length - 1) {
      const inner = body.slice(1, -1).trim();
      if (!/^["']/.test(inner)) body = inner;
    } else if (!/^[,|]/.test(body.slice(close + 1).trim())) {
      throw new Error(`${row.part}: finish the rhythm before adding .timbre("studio").`);
    }
  }
  const bars = splitBars(body);
  if (bars.length > 4) throw new Error(`${row.part}: write at most 4 bars. Separate bars with commas; fewer bars loop automatically.`);
  return bars.map((bar) => {
    if (!bar) throw new Error(`${row.part}: add beat brackets after the comma, or remove the comma to loop the previous bar.`);
    if (bar.startsWith('[')) {
      const beats = expandedGroups(row.part, bar);
      if (!isDrumPart(row.part)) return { groups: null, live: null, notes: beats.map((beat) => parseNoteBeat(row.part as NotePart, beat, syntax.scale)), source: bar };
      const groups = beats.map((beat) => parseBeat(row.part, beat));
      return { groups, live: null, source: bar };
    }
    const live = bar.match(/^\(\s*(["'])([\s\S]*?)\1\s*\)$/);
    if (live && isDrumPart(row.part)) return { groups: null, live: parseLivePattern(row.part, live[2]), source: bar };
    throw new Error(`${row.part}: use beat brackets like ${emptyRow(row.part, 4, 4)}. A comma starts the next bar.`);
  });
}

export function parseMeter(source: string) {
  const parts = splitTopLevel(source, '/');
  if (parts.length !== 2) throw new Error('Write the time signature like time 3/4 or time (3+3)/(2*4). Put division inside parentheses.');
  const beats = evaluateNumber(parts[0], 'Time signature beats');
  const unit = evaluateNumber(parts[1], 'Time signature beat unit');
  if (!Number.isSafeInteger(beats) || beats < 1 || beats > 16) throw new Error('A time signature can have 1 to 16 beats per bar, using whole beats.');
  if (![2, 4, 8, 16].includes(unit)) throw new Error('The beat unit must be 2, 4, 8, or 16.');
  return { beats, unit };
}

function controls(source: string) {
  let tempo = 120;
  let beats = 4;
  let unit = 4;
  let kit = 'ohcodes studio';
  for (const raw of maskComments(source).split('\n')) {
    const line = raw.trim();
    if (!line || line === 'ins.drums') continue;
    const tempoMatch = line.match(/^tempo\s+(.+)$/);
    const timeMatch = line.match(/^time\s+(.+)$/);
    const kitMatch = line.match(/^kit\s*["']([^"']+)["']$/);
    if (tempoMatch) {
      try { tempo = evaluateNumber(tempoMatch[1], 'Tempo'); }
      catch (error) { throw new Error(`Write the tempo like tempo 120 or tempo 60*2. ${error instanceof Error ? error.message : ''}`); }
      if (tempo < 30 || tempo > 240) throw new Error('Tempo must be between 30 and 240.');
    }
    else if (timeMatch) {
      ({ beats, unit } = parseMeter(timeMatch[1]));
    } else if (kitMatch) kit = kitMatch[1];
    else if (/^tempo\b/.test(line)) throw new Error('Write the tempo like tempo 120.');
    else if (/^time\b/.test(line)) throw new Error('Write the time signature like time 3/4 or time 6/8.');
    else {
      if (line.includes('=')) throw new Error('Write a named track like chords = keys([]). Use a name with letters, digits or underscores, starting with a letter or underscore. Track references and expressions are not supported.');
      const unknown = line.match(/^([a-z][a-z0-9]*)\s*[\[(]/i);
      if (unknown) throw new Error(`Unknown instrument ${unknown[1]}. Choose ${INSTRUMENTS.join(', ')}.`);
      throw new Error(`Cannot read: ${line}. Use an instrument name followed by beat brackets.`);
    }
  }
  return { tempo, beats, unit, kit };
}

// The passage list survives incomplete edits, while compilation validates only the chosen passage.
export function readPassages(source: string) {
  const passages: PassageDraft[] = [];
  const globals: string[] = [];
  let open: Omit<PassageDraft, 'body' | 'end' | 'bodyEnd' | 'closed'> | null = null;
  let offset = 0;
  for (const line of source.split('\n')) {
    const header = line.match(/^[ \t]*passage\s*(["'])([^"'\n]+)\1\s*\{\s*$/);
    if (header) {
      if (open) passages.push({ ...open, end: offset, bodyEnd: offset, body: source.slice(open.bodyStart, offset), closed: false });
      open = { name: header[2].trim(), start: offset, bodyStart: offset + line.length + 1, legacy: false };
    } else if (/^\s*}\s*$/.test(line) && open) {
      passages.push({ ...open, end: offset + line.length, bodyEnd: offset, body: source.slice(open.bodyStart, offset), closed: true });
      open = null;
    } else if (!open) globals.push(line);
    offset += line.length + 1;
  }
  if (open) passages.push({ ...open, end: source.length, bodyEnd: source.length, body: source.slice(open.bodyStart), closed: false });
  if (!passages.length) return { globals: '', passages: [{ name: 'Passage 1', start: 0, end: source.length, bodyStart: 0, bodyEnd: source.length, body: source, closed: true, legacy: true }] };
  return { globals: globals.join('\n'), passages };
}

export type SongEntry = { name: string; bars: number };
type SongRegion = { start: number; end: number; closed: boolean; lines: string[] };

// Keep Song drafts separate from instrument compilation: an unfinished order must not
// interrupt a Live passage, and source edits must retain the exact surrounding text.
function songRegions(source: string) {
  const passages = readPassages(source).passages.filter((passage) => !passage.legacy);
  const regions: SongRegion[] = [];
  let open: SongRegion | null = null;
  let offset = 0;
  for (const line of maskComments(source).split('\n')) {
    const end = Math.min(source.length, offset + line.length + 1);
    const inPassage = passages.some((passage) => offset >= passage.start && offset < passage.end);
    if (inPassage) {
      if (open) { open.end = offset; regions.push(open); open = null; }
    } else if (/^\s*song\b/.test(line)) {
      if (open) { open.end = offset; regions.push(open); }
      open = { start: offset, end, closed: false, lines: [line] };
    } else if (open) {
      open.end = end;
      if (/^\s*}\s*$/.test(line)) { open.closed = true; regions.push(open); open = null; }
      else open.lines.push(line);
    }
    offset = end;
  }
  if (open) regions.push(open);
  return regions;
}

export function readArrangement(source: string) {
  const regions = songRegions(source);
  const region = regions[0] ?? null;
  const entries: SongEntry[] = [];
  let error: string | null = null;
  if (regions.length > 1) error = 'Use one song{...} order per project.';
  else if (region) {
    if (!/^\s*song\s*\{\s*$/.test(region.lines[0])) error = 'Start the song order with song{ on its own line.';
    else if (!region.closed) error = 'Finish the song order with a closing }.';
    else {
      for (const line of region.lines.slice(1)) {
        if (!line.trim()) continue;
        const match = line.match(/^\s*(["'])([^"'\n]+)\1\s+(.+)\s*$/);
        if (!match) { error = 'Write a song section like "Verse" 8 (eight bars).'; break; }
        const name = match[2].trim();
        let bars: number;
        try { bars = evaluateNumber(match[3], 'Song bars'); }
        catch (caught) { error = caught instanceof Error ? caught.message : 'Cannot calculate song bars.'; break; }
        if (!name || name.length > 48 || !Number.isSafeInteger(bars) || bars < 1 || bars > 256) { error = 'Use a passage name of 1–48 characters and 1–256 whole bars per section.'; break; }
        entries.push({ name, bars });
      }
      if (!error && entries.length > 128) error = 'Use up to 128 sections in the song order.';
      if (!error && entries.reduce((total, entry) => total + entry.bars, 0) > 4096) error = 'Use up to 4096 bars in one song.';
    }
  }
  return { entries, region, error };
}

function withoutArrangement(source: string) {
  let result = source;
  for (const region of [...songRegions(source)].reverse()) result = `${result.slice(0, region.start)}${result.slice(region.start, region.end).replace(/[^\n]/g, ' ')}${result.slice(region.end)}`;
  return result;
}

export function setArrangement(source: string, entries: SongEntry[]) {
  const draft = readArrangement(source);
  if (draft.error) throw new Error(`${draft.error} Finish the order in text before using its controls.`);
  for (const entry of entries) {
    if (!entry.name.trim() || entry.name.length > 48 || /["'{}\r\n]/.test(entry.name) || !Number.isInteger(entry.bars) || entry.bars < 1 || entry.bars > 256) throw new Error('Choose a passage and 1–256 whole bars.');
  }
  if (entries.length > 128 || entries.reduce((total, entry) => total + entry.bars, 0) > 4096) throw new Error('Use up to 128 sections and 4096 bars.');
  const canonical = namedSource(source);
  const region = readArrangement(canonical).region;
  // Controls normalize the order's formatting, but never discard handwritten comments.
  const comments = region ? canonical.slice(region.start, region.end).split('\n').flatMap((line) => {
    const masked = maskComments(line);
    const at = line.split('').findIndex((char, index) => char === '/' && line[index + 1] === '/' && masked[index] === ' ');
    return at >= 0 ? [line.slice(at)] : [];
  }) : [];
  // Removing the final section removes the declaration; its comments remain in the source.
  const noteLines = comments.map((comment) => `  ${comment}`).join('\n');
  const block = entries.length ? `song{\n${noteLines ? `${noteLines}\n` : ''}${entries.map((entry) => `  "${entry.name}" ${entry.bars}`).join('\n')}\n}\n` : comments.length ? `${comments.join('\n')}\n` : '';
  if (region) return `${canonical.slice(0, region.start)}${block}${canonical.slice(region.end)}`;
  return block ? `${canonical.trimEnd()}\n\n${block}` : canonical;
}

export function renameSongPassage(source: string, oldName: string, newName: string) {
  const draft = readArrangement(source);
  if (draft.error) throw new Error('Finish the song order before renaming a referenced passage.');
  if (!draft.region) return source;
  const region = draft.region;
  // Change only the matching quoted name, preserving bars, comments and formatting.
  const block = source.slice(region.start, region.end).split('\n').map((line) => {
    const match = line.match(/^(\s*)(["'])([^"'\n]+)\2(\s+.+)$/);
    return match && match[3].trim() === oldName ? `${match[1]}${match[2]}${newName}${match[2]}${match[4]}` : line;
  }).join('\n');
  return `${source.slice(0, region.start)}${block}${source.slice(region.end)}`;
}

export function passageBarCount(body: string) {
  return Math.max(1, ...drumRows(body).map((row) => { try { return parseTrack(row).length; } catch { return 1; } }));
}

// Selection is passage-local and refers to track labels, never executable variables.
function playbackSelection(source: string, rows: TrackIdentity[]) {
  const selection: PlaybackSelection = { mute: [], solo: [] };
  const seen = new Set<string>();
  const remaining = maskComments(source).split('\n').map((line) => {
    const command = line.match(/^\s*(mute|solo)\b(?!\s*=)/)?.[1] as keyof PlaybackSelection | undefined;
    if (!command) return line;
    if (seen.has(command)) throw new Error(`${command}: use one ${command}(...) line per passage; put all names in that list.`);
    seen.add(command);
    const match = line.match(/^\s*(?:mute|solo)\s*\(\s*((?:[a-zA-Z_][a-zA-Z_0-9]*\s*(?:,\s*[a-zA-Z_][a-zA-Z_0-9]*\s*)*)?)\)\s*$/);
    if (!match) throw new Error(`${command}: use comma-separated track names, like ${command}(chords, kick). Use ${command}() to clear it.`);
    const labels = match[1].trim() ? match[1].split(',').map((label) => label.trim()) : [];
    for (const label of labels) {
      const ids = [...new Set(rows.filter((row) => trackLabel(row) === label).map(trackId))];
      if (!ids.length) throw new Error(`${command}: unknown track "${label}" in this passage. Use a named track or an unnamed instrument's name.`);
      if (ids.length > 1) throw new Error(`${command}: "${label}" matches more than one track. Give those rows distinct names.`);
      if (!selection[command].includes(ids[0])) selection[command].push(ids[0]);
    }
    return line.replace(/[^\n]/g, ' ');
  }).join('\n');
  return { selection, remaining };
}

export function parsePassage(source: string, name: string): PassageScore {
  const document = readPassages(source);
  const matching = document.passages.filter((passage) => passage.name === name);
  if (matching.length !== 1) throw new Error(matching.length ? `Use a different name for each passage: ${name} is duplicated.` : 'Choose a passage to play.');
  const passage = matching[0];
  if (!passage.closed) throw new Error(`Finish ${name} with a closing } before playing it.`);
  if (!passage.name || passage.name.length > 48) throw new Error('Use a passage name with 1–48 characters.');
  if (document.passages.length > 32) throw new Error('Use up to 32 passages in one session.');
  if (!passage.legacy && drumRows(document.globals).length) throw new Error('Put instrument rows inside a passage. Tempo and time can stay above the passages.');
  const globalSelection = maskComments(withoutArrangement(document.globals)).match(/^\s*(mute|solo)\b(?!\s*=)/m);
  if (globalSelection) throw new Error(`${globalSelection[1]}: put this line inside a passage, below its instruments.`);
  const rows = drumRows(passage.body);
  if (rows.length > 64) throw new Error('Use up to 64 instrument rows per passage.');
  const names = new Set<string>();
  for (const row of rows) if (row.track !== undefined) {
    if (row.track.length > 48) throw new Error(`Track name "${row.track}" is too long. Use 1–48 characters.`);
    if (names.has(row.track)) throw new Error(`Track name "${row.track}" is defined twice in this passage. Give each named track its own name.`);
    names.add(row.track);
  }
  let remaining = passage.body;
  for (const row of [...rows].reverse()) remaining = `${remaining.slice(0, row.start)}${row.text.replace(/[^\n]/g, ' ')}${remaining.slice(row.start + row.text.length)}`;
  const selected = playbackSelection(passage.legacy ? withoutArrangement(remaining) : remaining, rows);
  const config = controls(`${withoutArrangement(document.globals)}\n${passage.legacy ? withoutArrangement(selected.remaining) : selected.remaining}`);
  const defaultBank = resolveSoundbank(config.kit);
  validateSoundbank('bd', defaultBank);
  const tracks = rows.map((row) => {
    const bars = parseTrack(row);
    const bank = rowSoundbank(row, defaultBank);
    return { part: row.part, ...(row.track === undefined ? {} : { track: row.track }), bars, bank, volume: rowVolume(row), effects: rowEffects(row), ...rowGroove(row) };
  });
  const cycle = tracks.reduce((length, track) => lcm(length, track.bars.length), 1);
  const bars = Array.from({ length: cycle }, (_, index): ParsedScore => {
    const pattern = Object.fromEntries(PARTS.map((part) => [part, Array.from({ length: config.beats }, () => '')])) as Pattern;
    const livePatterns: LivePattern[] = [];
    const timbres = Object.fromEntries(INSTRUMENTS.map((part) => [part, defaultSoundbank(part, defaultBank)])) as Record<string, SoundbankId>;
    const volumes = Object.fromEntries(INSTRUMENTS.map((part) => [part, 0])) as Record<string, number>;
    const effects = Object.fromEntries(INSTRUMENTS.map((part) => [part, [] as Effect[]])) as Record<string, Effect[]>;
    const velocities = Object.fromEntries(INSTRUMENTS.map((part) => [part, [127]])) as Record<string, number[]>;
    const swings = Object.fromEntries(INSTRUMENTS.map((part) => [part, 50])) as Record<string, number>;
    const trackParts: Record<string, TrackIdentity> = {};
    const noteEvents: NoteEvent[] = [];
    const bankParts = new Set<string>();
    const binaryParts = new Set<string>();
    for (const track of tracks) {
      const id = trackId(track);
      const identity = { part: track.part, ...(track.track === undefined ? {} : { track: track.track }) };
      trackParts[id] = identity;
      if (bankParts.has(id) && timbres[id] !== track.bank) throw new Error(`${track.part} uses different soundbanks in this passage. Use one bank per instrument, or give each row a unique track name.`);
      timbres[id] = track.bank;
      if (bankParts.has(id) && volumes[id] !== track.volume) throw new Error(`${track.part} uses different volumes in this passage. Use one level per instrument, or name the tracks.`);
      volumes[id] = track.volume;
      if (bankParts.has(id) && JSON.stringify(effects[id]) !== JSON.stringify(track.effects)) throw new Error(`${track.part} uses different effects in this passage. Use one effect chain per instrument, or name the tracks.`);
      effects[id] = track.effects;
      if (bankParts.has(id) && (JSON.stringify(velocities[id]) !== JSON.stringify(track.velocities) || swings[id] !== track.swing)) throw new Error(`${track.part} uses different groove modifiers in this passage. Use one velocity sequence and swing amount per instrument, or name the tracks.`);
      velocities[id] = track.velocities;
      swings[id] = track.swing;
      bankParts.add(id);
      const bar = track.bars[index % track.bars.length];
      if (bar.groups) {
        if (binaryParts.has(id)) throw new Error(`${track.part} beat brackets are defined twice in this passage. Give each row a unique track name.`);
        if (bar.groups.length !== config.beats) throw new Error(`${track.part} needs ${config.beats} beat brackets per bar for time ${config.beats}/${config.unit}, like ${emptyRow(track.part, config.beats, config.unit)}.`);
        pattern[id] = bar.groups;
        binaryParts.add(id);
      } else if (bar.notes) {
        if (binaryParts.has(id)) throw new Error(`${track.part} beat brackets are defined twice in this passage. Give each row a unique track name.`);
        if (bar.notes.length > 64) throw new Error(`${track.part}: use up to 64 groups per bar. Groups divide the whole bar equally.`);
        binaryParts.add(id);
        const groupBeats = config.beats / bar.notes.length;
        bar.notes.forEach((tokens, group) => {
          const total = tokens.reduce((sum, token) => sum + token.weight, 0);
          let elapsed = 0;
          tokens.forEach((token) => {
            if (token.notes.length) {
              const subdivisions = bar.notes!.length * tokens.length / config.beats;
              const swingable = track.swing !== 50 && isStraightGrid(subdivisions) && tokens.every((item) => item.weight === 1) && Math.abs(group * groupBeats * subdivisions - Math.round(group * groupBeats * subdivisions)) < 1e-9;
              noteEvents.push({ ...identity, part: track.part as NotePart, notes: token.notes, offset: (group + elapsed / total) / bar.notes!.length, duration: token.weight / total * groupBeats, ...(swingable ? { swingable: true } : {}) });
            }
            elapsed += token.weight;
          });
        });
      } else if (bar.live) livePatterns.push({ ...bar.live, ...identity });
    }
    const score = { ...config, pattern, livePatterns, timbres, volumes, effects, velocities, swings, noteEvents, trackParts, selection: selected.selection, source: passage.body };
    if (noteEvents.reduce((count, event) => count + event.notes.length, 0) > 128) throw new Error('Use up to 128 pitched notes per bar across all instruments.');
    if (rawScoreHits(score).length > 512) throw new Error('Use up to 512 musical events per bar across all rows.');
    return score;
  });
  return { name, bars, trackBars: tracks.map((track) => ({ part: track.part, ...(track.track === undefined ? {} : { track: track.track }), length: track.bars.length })), writtenBars: Math.max(1, ...tracks.map((track) => track.bars.length)) };
}

export function namedSource(source: string) {
  if (!readPassages(source).passages[0].legacy) return source;
  const globals: string[] = [];
  const body: string[] = [];
  const regions = songRegions(source);
  let offset = 0;
  source.split('\n').forEach((line) => {
    (/^\s*(?:tempo|time|kit)\b(?!\s*=)/.test(line) || regions.some((region) => offset >= region.start && offset < region.end) ? globals : body).push(line);
    offset += line.length + 1;
  });
  return `${globals.join('\n')}\n\npassage"Passage 1"{\n${body.join('\n').trim().split('\n').map((line) => `  ${line}`).join('\n')}\n}`;
}

export function draftMeter(source: string) {
  const match = [...maskComments(source).matchAll(/^[ \t]*time[ \t]+([^\n]+)$/gm)].at(-1);
  try { if (match) return parseMeter(match[1]); } catch { /* Keep unfinished drafts editable. */ }
  return { beats: 4, unit: 4 };
}

export function preparedPassage(source: string, name: string) {
  const document = readPassages(source);
  const passage = document.passages.find((item) => item.name === name);
  let expanded = source;
  if (passage && /^\s*ins\.drums\s*$/m.test(`${document.globals}\n${passage.body}`) && !drumRows(passage.body).some((row) => isDrumPart(row.part))) {
    const meter = draftMeter(`${document.globals}\n${passage.body}`);
    const rows = emptyRows(meter.beats, meter.unit).split('\n').map((line) => `${passage.legacy ? '' : '  '}${line}`).join('\n');
    expanded = `${source.slice(0, passage.bodyEnd).trimEnd()}\n${rows}\n${source.slice(passage.bodyEnd)}`;
  }
  return { source: expanded, score: parsePassage(expanded, name) };
}

function isStraightGrid(subdivisions: number) { return Number.isInteger(subdivisions) && subdivisions >= 1 && (subdivisions & (subdivisions - 1)) === 0; }
function swingPosition(beat: number, swing: number) {
  const whole = Math.floor(beat + 1e-9);
  const fraction = Math.max(0, beat - whole);
  const split = swing / 100;
  return whole + (fraction <= .5 ? fraction * 2 * split : split + (fraction - .5) * 2 * (1 - split));
}
function rawScoreHits(score: ParsedScore) {
  const hits = new Map<string, ScoreHit & { swingable?: boolean }>();
  for (const [id, groups] of Object.entries(score.pattern)) groups.forEach((group, beat) => {
    const identity = score.trackParts?.[id] ?? { part: id as Part };
    [...group].forEach((trigger, step) => {
      if (trigger !== '1') return;
      const offset = (beat + step / group.length) / score.beats;
      hits.set(`${id}:${offset.toFixed(9)}`, { ...identity, offset, swingable: isStraightGrid(group.length) });
    });
  });
  score.livePatterns.forEach((pattern) => pattern.hits.forEach((offset) => hits.set(`${trackId(pattern)}:${offset.toFixed(9)}`, { part: pattern.part, ...(pattern.track === undefined ? {} : { track: pattern.track }), offset, swingable: isStraightGrid(pattern.grid / score.beats) })));
  score.noteEvents.forEach((event) => hits.set(`${trackId(event)}:${event.offset.toFixed(9)}`, event));
  return [...hits.values()].sort((a, b) => a.offset - b.offset);
}

export function scoreHits(score: ParsedScore, priorHits: Partial<Record<string, number>> = {}): ScoreHit[] {
  const counters = { ...priorHits };
  return rawScoreHits(score).map(({ swingable, ...hit }) => {
    const swing = score.swings[trackId(hit)];
    if (swingable && swing !== 50) {
      const start = swingPosition(hit.offset * score.beats, swing);
      const end = hit.duration === undefined ? undefined : swingPosition(hit.offset * score.beats + hit.duration, swing);
      return { ...hit, offset: start / score.beats, ...(end === undefined ? {} : { duration: end - start }) };
    }
    return hit;
  }).sort((a, b) => a.offset - b.offset).map((hit) => {
    const id = trackId(hit);
    const sequence = score.velocities[id];
    const index = counters[id] ?? 0;
    counters[id] = index + 1;
    return sequence.length === 1 && sequence[0] === 127 ? hit : { ...hit, velocity: sequence[index % sequence.length] };
  }).filter((hit) => trackIsAudible(score, hit));
}

// Derive phase from elapsed passage bars, not mutable playback counters. Re-evaluation
// keeps the same musical position, independent loops keep counting, and launches reset.
export function passageHits(passage: PassageScore, elapsedBars: number): ScoreHit[] {
  if (!Number.isSafeInteger(elapsedBars) || elapsedBars < 0) throw new Error('Use a nonnegative whole passage bar.');
  const index = elapsedBars % passage.bars.length;
  const cycles = Math.floor(elapsedBars / passage.bars.length);
  const counts: Partial<Record<string, number>> = {};
  passage.bars.forEach((bar, barIndex) => {
    const repeats = cycles + (barIndex < index ? 1 : 0);
    if (!repeats) return;
    rawScoreHits(bar).forEach((hit) => { const id = trackId(hit); counts[id] = (counts[id] ?? 0) + repeats; });
  });
  return scoreHits(passage.bars[index], counts);
}

export function stepModel(source: string, row: DrumRow) {
  if (!isDrumPart(row.part)) throw new Error(`${row.part}: write notes directly in the brackets; the 0/1 step helper is for drums.`);
  const document = readPassages(source);
  const passage = document.passages.find((item) => row.start >= item.bodyStart && row.start <= item.bodyEnd);
  const scoped = maskComments(passage ? `${document.globals}\n${passage.body}` : source);
  for (const line of scoped.split('\n')) if (/^\s*time\b(?!\s*=)/.test(line)) parseMeter(line.trim().replace(/^time\s*/, ''));
  const { beats, unit } = draftMeter(scoped);
  const bars = parseTrack(row);
  const groups = bars.flatMap((bar) => {
    if (bar.groups) {
      if (bar.groups.length !== beats) throw new Error(`Add ${beats} beat brackets per bar for time ${beats}/${unit}.`);
      return bar.groups.map((group) => group || '0'.repeat(defaultSubdivision(unit)));
    }
    const live = bar.live!;
    const subdivision = live.grid / gcd(live.grid, beats);
    if (beats * subdivision > 256) throw new Error('This rhythm needs more than 256 steps. Keep editing it in text.');
    const result = Array.from({ length: beats }, () => '0'.repeat(subdivision));
    live.hits.forEach((offset) => {
      const index = Math.round(offset * beats * subdivision);
      const beat = Math.floor(index / subdivision);
      const step = index % subdivision;
      result[beat] = `${result[beat].slice(0, step)}1${result[beat].slice(step + 1)}`;
    });
    return result;
  });
  if (groups.reduce((total, group) => total + group.length, 0) > 256) throw new Error('This row needs more than 256 steps. Keep editing it in text.');
  const isBinary = bars.every((bar) => Boolean(bar.groups));
  const directBrackets = isBinary && bars.every((bar) => /^(?:\[[01~～\s]*\]\s*)+$/.test(bar.source));
  return { groups, beats, unit, isBinary, directBrackets, barCount: bars.length };
}

function beatGroups(groups: string[], beats: number) { return groups.map((group, index) => `${index && index % beats === 0 ? ', ' : ''}[${group}]`).join(''); }
function replaceRow(source: string, row: DrumRow, text: string) { return `${source.slice(0, row.start)}${text}${source.slice(row.start + row.text.length)}`; }

export function setRowSoundbank(source: string, key: string, bank: SoundbankId) {
  resolveSoundbank(bank);
  const row = drumRows(source).find((item) => item.key === key);
  if (!row) throw new Error('This instrument is no longer in the code. Type inside .timbre() again.');
  validateSoundbank(row.part, bank);
  const syntax = rowTimbreSyntax(row, true);
  // Validate the rhythm independently, allowing selection to repair an unknown bank name.
  parseTrack({ ...row, text: syntax.rhythm });
  const insertion = syntax.timbreStart >= 0 ? syntax.timbreStart : syntax.chainStart < 0 ? syntax.rhythmEnd : syntax.chainStart;
  const end = syntax.timbreStart >= 0 ? syntax.timbreEnd : insertion + (syntax.chain === '.' ? 1 : 0);
  return replaceRow(source, row, `${row.text.slice(0, insertion)}.timbre("${bank}")${row.text.slice(end)}`);
}

function bracketRowText(row: DrumRow, groups: string[], beats: number) {
  const syntax = rowTimbreSyntax(row);
  // Quoted grids can span an odd meter. A binary conversion must not turn an
  // unswung existing attack into a swung one just by adding empty grid cells.
  if (syntax.swing !== 50) parseTrack(row).forEach((bar, barIndex) => {
    if (!bar.live || isStraightGrid(bar.live.grid / beats)) return;
    bar.live.hits.forEach((offset) => {
      const position = offset * beats;
      const beat = Math.floor(position + 1e-9);
      const fraction = Math.max(0, position - beat);
      const group = groups[barIndex * beats + beat];
      if (group?.[Math.round(fraction * group.length)] === '1' && isStraightGrid(group.length) && Math.abs(swingPosition(fraction, syntax.swing) - fraction) > 1e-9) throw new Error('This conversion would change your swung hit times. Keep editing this quoted rhythm in text.');
    });
  });
  // Expanded rhythms cannot be mapped one-to-one onto source brackets. Keep any
  // handwritten comments when materializing the edited row, plus every modifier.
  const comments = row.text.slice(0, syntax.rhythmEnd).split('\n').flatMap((line) => {
    const masked = maskComments(line);
    const at = line.split('').findIndex((char, index) => char === '/' && line[index + 1] === '/' && masked[index] === ' ');
    return at < 0 ? [] : [line.slice(at)];
  });
  return `${row.text.match(ROW_HEAD)![0]}(${beatGroups(groups, beats)})${row.text.slice(syntax.rhythmEnd)}${comments.length ? `\n${comments.join('\n')}` : ''}`;
}

export function toggleRowStep(source: string, key: string, beat: number, step: number) {
  const row = drumRows(source).find((item) => item.key === key);
  if (!row) return source;
  const model = stepModel(source, row);
  const group = model.groups[beat];
  if (group === undefined || step < 0 || step >= group.length) return source;
  const value = group[step] === '1' ? '0' : '1';
  if (model.directBrackets) {
    const bracket = [...maskComments(row.text).matchAll(/\[([^\[\]]*)\]/g)][beat];
    const positions = [...bracket[1].matchAll(/[01~～]/g)];
    if (!positions.length) {
      const index = bracket.index! + 1;
      return replaceRow(source, row, `${row.text.slice(0, index)}${group.slice(0, step)}${value}${group.slice(step + 1)}${row.text.slice(index + bracket[1].length)}`);
    }
    const index = bracket.index! + 1 + positions[step].index!;
    const written = value === '0' && /[~～\s]/.test(bracket[1]) ? '~' : value;
    return replaceRow(source, row, `${row.text.slice(0, index)}${written}${row.text.slice(index + 1)}`);
  }
  const groups = [...model.groups];
  groups[beat] = `${group.slice(0, step)}${value}${group.slice(step + 1)}`;
  return replaceRow(source, row, bracketRowText(row, groups, model.beats));
}

export const STEP_DIVISIONS = [1, 2, 3, 4, 6, 8] as const;
export function gridLabel(subdivision: number, unit: number) {
  if (subdivision === 3 || subdivision === 6) return `1/${unit * (subdivision === 3 ? 2 : 4)} triplet · ${subdivision}/beat`;
  return `1/${unit * subdivision} · ${subdivision}/beat`;
}

export function resizeRowSteps(source: string, key: string, subdivision: number) {
  if (!STEP_DIVISIONS.some((amount) => amount === subdivision)) throw new Error('Choose a supported note length.');
  const row = drumRows(source).find((item) => item.key === key);
  if (!row) return source;
  const model = stepModel(source, row);
  const swing = rowGroove(row).swing;
  const straightGroups = parseTrack(row).flatMap((bar) => bar.groups ? bar.groups.map((group) => isStraightGrid(group.length)) : Array.from({ length: model.beats }, () => isStraightGrid(bar.live!.grid / model.beats)));
  const groups = model.groups.map((group, groupIndex) => {
    const steps = Array.from({ length: subdivision }, () => '0');
    [...group].forEach((value, index) => {
      if (value !== '1') return;
      const position = index * subdivision / group.length;
      if (!Number.isInteger(position)) throw new Error('Some hits fall between this grid’s steps. Your rhythm is unchanged; choose a finer grid or edit it in text.');
      const before = straightGroups[groupIndex] ? swingPosition(index / group.length, swing) : index / group.length;
      const after = isStraightGrid(subdivision) ? swingPosition(position / subdivision, swing) : position / subdivision;
      if (Math.abs(before - after) > 1e-9) throw new Error('This grid would change your swung hit times. Your code is unchanged; keep a straight subdivision or edit it in text.');
      steps[position] = '1';
    });
    return steps.join('');
  });
  let text: string;
  if (model.directBrackets) {
    const brackets = [...maskComments(row.text).matchAll(/\[([^\[\]]*)\]/g)];
    text = row.text;
    for (let index = brackets.length - 1; index >= 0; index -= 1) {
      const bracket = brackets[index];
      text = `${text.slice(0, bracket.index)}[${groups[index]}]${text.slice(bracket.index! + bracket[0].length)}`;
    }
  } else text = bracketRowText(row, groups, model.beats);
  return replaceRow(source, row, text);
}

export function stepLabel(beat: number, step: number, subdivision: number) {
  if (step === 0) return String(beat + 1);
  if (subdivision === 2) return '&';
  if (subdivision === 4) return ['1', 'e', '&', 'a'][step];
  return `.${step + 1}`;
}
