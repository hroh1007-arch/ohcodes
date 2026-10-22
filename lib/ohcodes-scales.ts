// Scale degrees are resolved at compile time; the audio engine still receives MIDI notes.
import { evaluateNumber } from './ohcodes-expressions';

export const SCALES = [
  { id: 'major', intervals: [0, 2, 4, 5, 7, 9, 11], description: 'Major · Ionian' },
  { id: 'minor', intervals: [0, 2, 3, 5, 7, 8, 10], description: 'Natural minor · Aeolian' },
  { id: 'ionian', intervals: [0, 2, 4, 5, 7, 9, 11], description: 'Same as major' },
  { id: 'dorian', intervals: [0, 2, 3, 5, 7, 9, 10], description: 'Minor with a natural 6' },
  { id: 'phrygian', intervals: [0, 1, 3, 5, 7, 8, 10], description: 'Minor with a flat 2' },
  { id: 'lydian', intervals: [0, 2, 4, 6, 7, 9, 11], description: 'Major with a sharp 4' },
  { id: 'mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10], description: 'Major with a flat 7' },
  { id: 'aeolian', intervals: [0, 2, 3, 5, 7, 8, 10], description: 'Same as natural minor' },
  { id: 'locrian', intervals: [0, 1, 3, 5, 6, 8, 10], description: 'Minor with flat 2 and 5' },
  { id: 'chromatic', intervals: [0, 2, 4, 5, 7, 9, 11], description: '1 #1 2 … · 7 b7 6 … · 8 = octave' },
] as const;
export type InstrumentScale = { root: number; name: string; intervals: readonly number[]; chromatic: boolean };
const NOTE_CLASS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function parseScale(value: string): InstrumentScale {
  const match = value.trim().match(/^([a-g])([#b]?)(-?\d+|\([^\n]*\))\s+([a-z]+)$/i);
  if (!match) throw new Error('Write a scale with its root octave, like .scale("C3 major") or .scale("D2 dorian").');
  const mode = SCALES.find((item) => item.id === match[4].toLowerCase());
  if (!mode) throw new Error(`Unknown scale "${match[4]}". Choose ${SCALES.map((item) => item.id).join(', ')}.`);
  const accidental = match[2].toLowerCase();
  const octave = evaluateNumber(match[3], 'Scale root octave');
  if (!Number.isSafeInteger(octave)) throw new Error('Scale root octave must be a whole number.');
  const root = (octave + 1) * 12 + NOTE_CLASS[match[1].toUpperCase()] + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0);
  if (!Number.isSafeInteger(root) || root < 0 || root > 127) throw new Error('Scale root must be within MIDI 0–127 (C-1 to G9).');
  return { root, name: `${match[1].toUpperCase()}${accidental}${octave} ${mode.id}`, intervals: mode.intervals, chromatic: mode.id === 'chromatic' };
}

export function degreePitch(token: string, scale: InstrumentScale | null): number {
  if (!scale) throw new Error(`Degree "${token}" needs a scale on this instrument, like .scale("C3 major").`);
  const match = token.match(/^([#b]?)([1-9]\d*|\([^\n]*\))$/);
  if (!match) throw new Error(`Invalid scale degree "${token}". Use positive whole numbers; write arithmetic in parentheses, like (1+2). 0 or ~ alone is a rest.`);
  const degree = evaluateNumber(match[2], `Scale degree "${token}"`);
  if (!Number.isSafeInteger(degree) || degree < 1) throw new Error(`Invalid scale degree "${token}". Use positive whole numbers; write arithmetic in parentheses, like (1+2). 0 or ~ alone is a rest.`);
  if (match[1] && !scale.chromatic) throw new Error(`Scale degree "${token}" uses an accidental. Use chromatic for #/b degrees, or write an explicit note such as F#3.`);
  const index = degree - 1;
  const midi = scale.root + Math.floor(index / scale.intervals.length) * 12 + scale.intervals[index % scale.intervals.length] + (match[1] === '#' ? 1 : match[1] === 'b' ? -1 : 0);
  if (midi < 0) throw new Error(`Scale degree "${token}" is below C-1. Use a higher root octave or degree.`);
  if (!Number.isSafeInteger(midi) || midi > 127) throw new Error(`Scale degree "${token}" is above G9. Use a lower root octave or degree.`);
  return midi;
}

// Require a typed root with octave: never guess an octave while a musician is typing.
export function searchScales(query: string) {
  const match = query.trimStart().match(/^([a-g][#b]?(?:-?\d+|\([^\n]*\)))\s*([a-z]*)$/i);
  if (!match) return [];
  try { parseScale(`${match[1]} major`); } catch { return []; }
  return SCALES.filter((item) => item.id.includes(match[2].toLowerCase())).map((item) => {
    const scale = parseScale(`${match[1]} ${item.id}`);
    const id = match[1].includes('(') ? `${match[1][0].toUpperCase()}${match[1].slice(1)} ${item.id}` : scale.name;
    return { id, name: scale.name, description: item.description };
  });
}
