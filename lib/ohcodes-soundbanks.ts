import type { DrumPart, NotePart, Part } from './ohcodes-language';

export const SOUNDBANKS = [
  { id: 'studio', name: 'Studio', kind: 'drum', family: 'Drums', description: 'Punchy kicks, clean snares, bright hats.' },
  { id: '808', name: '808', kind: 'drum', family: 'Drums', description: 'Long sub kicks and machine hats.' },
  { id: 'lofi', name: 'Lo-fi', kind: 'drum', family: 'Drums', description: 'Warm, rounded synthetic drums.' },
  { id: '909', name: '909', kind: 'drum', family: 'Drums', description: 'Short, punchy electronic drums with bright metal hats.' },
  { id: '606', name: '606', kind: 'drum', family: 'Drums', description: 'Compact, dry electronic drums.' },
  { id: 'house', name: 'House', kind: 'drum', family: 'Drums', description: 'Tight kicks, crisp snares and open hats.' },
  { id: 'techno', name: 'Techno', kind: 'drum', family: 'Drums', description: 'Low, dense kicks and metallic percussion.' },
  { id: 'boombap', name: 'Boom bap', kind: 'drum', family: 'Drums', description: 'Dry, softened drums with a round low end.' },
  { id: 'sub', name: 'Sub bass', kind: 'pitched', family: 'Bass', description: 'Clean sine bass with a little upper harmonic.' },
  { id: 'round-bass', name: 'Round bass', kind: 'pitched', family: 'Bass', description: 'Soft triangle bass with a short attack.' },
  { id: 'saw-bass', name: 'Saw bass', kind: 'pitched', family: 'Bass', description: 'Detuned, low-pass saw bass.' },
  { id: 'piano', name: 'Piano', kind: 'pitched', family: 'Keys', description: 'Synthesized piano-like struck harmonics, not a recording.' },
  { id: 'electric-piano', name: 'Electric piano', kind: 'pitched', family: 'Keys', description: 'Soft electric-keyboard harmonics.' },
  { id: 'organ', name: 'Organ', kind: 'pitched', family: 'Keys', description: 'Sustained drawbar-style harmonic layers.' },
  { id: 'sine', name: 'Sine lead', kind: 'pitched', family: 'Synth', description: 'Pure, rounded melodic tones.' },
  { id: 'saw', name: 'Saw lead', kind: 'pitched', family: 'Synth', description: 'Bright, slightly detuned saw layers.' },
  { id: 'square', name: 'Square lead', kind: 'pitched', family: 'Synth', description: 'Hollow square-wave lead.' },
  { id: 'fm', name: 'FM lead', kind: 'pitched', family: 'Synth', description: 'Bright frequency-modulated tones.' },
  { id: 'warm-pad', name: 'Warm pad', kind: 'pitched', family: 'Pad', description: 'Slow, filtered, detuned synthesizer layers.' },
  { id: 'strings', name: 'Strings', kind: 'pitched', family: 'Pad', description: 'Synthesized string-like ensemble pad.' },
  { id: 'air-pad', name: 'Air pad', kind: 'pitched', family: 'Pad', description: 'Soft upper harmonics with a long release.' },
  { id: 'pluck', name: 'Pluck', kind: 'pitched', family: 'Pluck', description: 'Quick triangle-wave pluck.' },
  { id: 'bell', name: 'Bell', kind: 'pitched', family: 'Pluck', description: 'Metallic FM bell with a decaying tail.' },
  { id: 'mallet', name: 'Mallet', kind: 'pitched', family: 'Pluck', description: 'Short, rounded struck harmonics.' },
  { id: 'guitar', name: 'Guitar', kind: 'pitched', family: 'Pluck', description: 'Synthesized plucked-string tone, not a guitar recording.' },
] as const;
export type SoundbankId = (typeof SOUNDBANKS)[number]['id'];
export type DrumSoundbankId = Extract<(typeof SOUNDBANKS)[number], { kind: 'drum' }>['id'];
export type PitchedSoundbankId = Extract<(typeof SOUNDBANKS)[number], { kind: 'pitched' }>['id'];
export const DEFAULT_SOUNDBANK: SoundbankId = 'studio';
const NOTE_DEFAULTS: Record<NotePart, PitchedSoundbankId> = { bass: 'sub', keys: 'electric-piano', piano: 'piano', synth: 'saw', pad: 'warm-pad', pluck: 'pluck', guitar: 'guitar' };
export function defaultSoundbank(part: Part, drumBank: SoundbankId = DEFAULT_SOUNDBANK): SoundbankId { return NOTE_DEFAULTS[part as NotePart] ?? drumBank; }
export function soundbankSupportsPart(bank: SoundbankId, part: Part) {
  return SOUNDBANKS.find((item) => item.id === bank)?.kind === (part in NOTE_DEFAULTS ? 'pitched' : 'drum');
}
export function validateSoundbank(part: Part, bank: SoundbankId) {
  if (!soundbankSupportsPart(bank, part)) throw new Error(`${part}: "${bank}" is a ${SOUNDBANKS.find((item) => item.id === bank)?.kind === 'drum' ? 'drum kit' : 'pitched sound'}. Choose a compatible timbre for this instrument.`);
  return bank;
}

export function resolveSoundbank(name: string): SoundbankId {
  const normalized = name.trim().toLowerCase();
  if (normalized === 'ohcodes studio' || normalized === 'ohsounds studio') return 'studio';
  if (normalized === 'lo-fi') return 'lofi';
  const bank = SOUNDBANKS.find((item) => item.id === normalized || item.name.toLowerCase() === normalized);
  if (!bank) throw new Error(`Unknown soundbank "${name}". Type inside .timbre() to find a built-in sound.`);
  return bank.id;
}

export function searchSoundbanks(query: string, part?: Part) {
  const name = query.toLowerCase().trim();
  return name ? SOUNDBANKS.filter((bank) => (!part || soundbankSupportsPart(bank.id, part)) && (bank.id.includes(name) || bank.name.toLowerCase().includes(name))) : [];
}

type ToneVoice = { kind: 'tone'; frequency: number; duration: number; level: number; drop: number; wave?: OscillatorType; lowpass?: number };
type NoiseVoice = { kind: 'noise'; duration: number; level: number; highpass: number; lowpass?: number };
export type DrumVoice = ToneVoice | NoiseVoice;

// Original ohcodes synth voices, not Kontakt or licensed sample recordings.
const STUDIO: Record<DrumPart, DrumVoice[]> = {
  bd: [{ kind: 'tone', frequency: 118, duration: .34, level: .95, drop: .36 }],
  sd: [{ kind: 'noise', duration: .16, highpass: 1100, level: .34 }, { kind: 'tone', frequency: 185, duration: .13, level: .24, drop: .72 }],
  hh: [{ kind: 'noise', duration: .045, highpass: 6500, level: .16 }],
  oh: [{ kind: 'noise', duration: .32, highpass: 5700, level: .14 }],
  cym: [{ kind: 'noise', duration: .75, highpass: 3600, level: .13 }, { kind: 'tone', frequency: 620, duration: .48, level: .06, drop: .94 }],
  rd: [{ kind: 'noise', duration: .27, highpass: 4200, level: .08 }, { kind: 'tone', frequency: 790, duration: .3, level: .11, drop: .98 }],
  rim: [{ kind: 'noise', duration: .035, highpass: 1700, level: .16 }, { kind: 'tone', frequency: 430, duration: .045, level: .2, drop: .86 }],
  t1: [{ kind: 'tone', frequency: 220, duration: .25, level: .45, drop: .72 }],
  t2: [{ kind: 'tone', frequency: 178, duration: .28, level: .5, drop: .68 }],
  t3: [{ kind: 'tone', frequency: 142, duration: .32, level: .55, drop: .65 }],
  ft: [{ kind: 'tone', frequency: 108, duration: .38, level: .6, drop: .62 }],
};

const ELECTRONIC: Record<DrumPart, DrumVoice[]> = {
  bd: [{ kind: 'tone', frequency: 150, duration: .72, level: .88, drop: .3 }],
  sd: [{ kind: 'noise', duration: .2, highpass: 1800, level: .3 }, { kind: 'tone', frequency: 220, duration: .09, level: .18, drop: .78, wave: 'triangle' }],
  hh: [{ kind: 'noise', duration: .035, highpass: 8200, level: .12 }, { kind: 'tone', frequency: 7100, duration: .022, level: .025, drop: .96, wave: 'square', lowpass: 12000 }],
  oh: [{ kind: 'noise', duration: .43, highpass: 7500, level: .12 }, { kind: 'tone', frequency: 6800, duration: .12, level: .018, drop: .96, wave: 'square', lowpass: 12000 }],
  cym: [{ kind: 'noise', duration: .9, highpass: 6100, level: .1 }, { kind: 'tone', frequency: 1250, duration: .38, level: .035, drop: .98, wave: 'triangle' }],
  rd: [{ kind: 'noise', duration: .19, highpass: 6500, level: .065 }, { kind: 'tone', frequency: 1480, duration: .23, level: .075, drop: .98, wave: 'triangle' }],
  rim: [{ kind: 'tone', frequency: 720, duration: .045, level: .16, drop: .72, wave: 'triangle' }],
  t1: [{ kind: 'tone', frequency: 260, duration: .38, level: .36, drop: .65 }],
  t2: [{ kind: 'tone', frequency: 205, duration: .42, level: .4, drop: .6 }],
  t3: [{ kind: 'tone', frequency: 158, duration: .46, level: .44, drop: .58 }],
  ft: [{ kind: 'tone', frequency: 125, duration: .52, level: .48, drop: .52 }],
};

function mapKit(kit: Record<DrumPart, DrumVoice[]>, transform: (voice: DrumVoice, part: DrumPart) => DrumVoice): Record<DrumPart, DrumVoice[]> {
  return Object.fromEntries(Object.entries(kit).map(([part, voices]) => [part, voices.map((voice) => transform(voice, part as DrumPart))])) as Record<DrumPart, DrumVoice[]>;
}
const LOFI = mapKit(STUDIO, (voice): DrumVoice => voice.kind === 'noise'
    ? { ...voice, duration: voice.duration * .8, highpass: Math.min(voice.highpass * .45, 2800), lowpass: 4800, level: voice.level * .85 }
    : { ...voice, duration: voice.duration * .8, frequency: voice.frequency * .9, wave: 'triangle', lowpass: 1600, level: voice.level * .72 });
const NINE = mapKit(ELECTRONIC, (voice): DrumVoice => voice.kind === 'noise'
  ? { ...voice, highpass: voice.highpass * .78, duration: voice.duration * .86, level: voice.level * 1.08 }
  : { ...voice, frequency: voice.frequency * .84, duration: voice.duration * .62, wave: 'triangle', lowpass: 9000, level: voice.level * .9 });
NINE.bd = [{ kind: 'tone', frequency: 132, duration: .28, level: .83, drop: .37 }, { kind: 'noise', duration: .018, highpass: 1200, level: .08 }];
const SIX = mapKit(STUDIO, (voice): DrumVoice => voice.kind === 'noise'
  ? { ...voice, highpass: voice.highpass * 1.2, duration: voice.duration * .48, level: voice.level * .75 }
  : { ...voice, frequency: voice.frequency * 1.1, duration: voice.duration * .56, wave: 'triangle', level: voice.level * .65 });
const HOUSE = mapKit(STUDIO, (voice): DrumVoice => voice.kind === 'noise'
  ? { ...voice, highpass: voice.highpass * 1.12, lowpass: 12000, duration: voice.duration * .9, level: voice.level * .92 }
  : { ...voice, frequency: voice.frequency * .95, duration: voice.duration * .76, level: voice.level * .86, drop: voice.drop * .94 });
HOUSE.bd = [{ kind: 'tone', frequency: 145, duration: .24, level: .85, drop: .32 }, { kind: 'noise', duration: .012, highpass: 2200, level: .06 }];
const TECHNO = mapKit(ELECTRONIC, (voice): DrumVoice => voice.kind === 'noise'
  ? { ...voice, highpass: voice.highpass * .92, lowpass: 11000, duration: voice.duration * .72, level: voice.level * .9 }
  : { ...voice, frequency: voice.frequency * .72, duration: voice.duration * .88, wave: 'triangle', lowpass: 4800, level: voice.level * .82 });
TECHNO.bd = [{ kind: 'tone', frequency: 110, duration: .49, level: .76, drop: .33 }, { kind: 'tone', frequency: 68, duration: .21, level: .12, drop: .9, wave: 'triangle', lowpass: 650 }];
const BOOMBAP = mapKit(STUDIO, (voice): DrumVoice => voice.kind === 'noise'
  ? { ...voice, highpass: voice.highpass * .66, lowpass: 6700, duration: voice.duration * .67, level: voice.level * .94 }
  : { ...voice, frequency: voice.frequency * .97, duration: voice.duration * .73, wave: 'triangle', lowpass: 2500, level: voice.level * .81 });
const DRUM_KITS: Record<DrumSoundbankId, Record<DrumPart, DrumVoice[]>> = { studio: STUDIO, '808': ELECTRONIC, lofi: LOFI, '909': NINE, '606': SIX, house: HOUSE, techno: TECHNO, boombap: BOOMBAP };

export function drumVoices(part: DrumPart, bank: SoundbankId): DrumVoice[] {
  validateSoundbank(part, bank);
  return DRUM_KITS[bank as DrumSoundbankId][part];
}

type NoteLayer = { wave: OscillatorType; harmonic: number; level: number; detune: number };
export type PitchedPreset = { layers: NoteLayer[]; attack: number; decay: number; sustain: number; release: number; cutoff: number; fm?: { ratio: number; index: number } };
const layer = (wave: OscillatorType, harmonic = 1, level = 1, detune = 0): NoteLayer => ({ wave, harmonic, level, detune });
const preset = (layers: NoteLayer[], attack: number, decay: number, sustain: number, release: number, cutoff: number, fm?: PitchedPreset['fm']): PitchedPreset => ({ layers, attack, decay, sustain, release, cutoff, fm });
const PITCHED: Record<PitchedSoundbankId, PitchedPreset> = {
  sub: preset([layer('sine', 1, .86), layer('triangle', 2, .1)], .008, .08, .72, .09, 1400),
  'round-bass': preset([layer('triangle', 1, .8), layer('sine', 2, .12)], .012, .12, .58, .12, 1100),
  'saw-bass': preset([layer('sawtooth', 1, .42, -5), layer('sawtooth', 1, .42, 5)], .007, .1, .48, .08, 950),
  piano: preset([layer('sine', 1, .63), layer('sine', 2, .2), layer('sine', 3, .09), layer('sine', 4, .035)], .003, .2, .09, .18, 9000),
  'electric-piano': preset([layer('sine', 1, .75), layer('sine', 3, .13), layer('sine', 7, .035)], .006, .25, .16, .24, 6500),
  organ: preset([layer('sine', 1, .48), layer('sine', 2, .22), layer('sine', 3, .14), layer('sine', 4, .08), layer('sine', 8, .025)], .012, .025, .92, .055, 10000),
  sine: preset([layer('sine')], .012, .06, .7, .13, 12000),
  saw: preset([layer('sawtooth', 1, .44, -7), layer('sawtooth', 1, .44, 7)], .008, .1, .6, .13, 4500),
  square: preset([layer('square', 1, .72), layer('sine', 2, .12)], .007, .12, .52, .12, 3500),
  fm: preset([layer('sine', 1, .85)], .005, .15, .38, .18, 10000, { ratio: 2, index: 1.8 }),
  'warm-pad': preset([layer('sawtooth', 1, .34, -9), layer('sawtooth', 1, .34, 9), layer('triangle', 2, .12)], .14, .2, .65, .65, 2300),
  strings: preset([layer('sawtooth', 1, .4, -4), layer('sawtooth', 1, .4, 4), layer('sine', 2, .08)], .09, .15, .78, .45, 3800),
  'air-pad': preset([layer('sine', 1, .55), layer('sine', 2, .2, 6), layer('triangle', 3, .1, -6)], .16, .2, .55, .85, 7000),
  pluck: preset([layer('triangle', 1, .75), layer('sine', 2, .15)], .002, .09, .035, .085, 6200),
  bell: preset([layer('sine', 1, .72)], .002, .3, .04, .7, 12000, { ratio: 3.5, index: 1.4 }),
  mallet: preset([layer('sine', 1, .76), layer('sine', 3.99, .14)], .003, .13, .025, .16, 8000),
  guitar: preset([layer('triangle', 1, .67), layer('sine', 2, .17), layer('sine', 3, .08)], .003, .14, .06, .15, 4400),
};

export function pitchedPreset(bank: SoundbankId): PitchedPreset {
  validateSoundbank('keys', bank);
  return PITCHED[bank as PitchedSoundbankId];
}
export function midiFrequency(midi: number) {
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) throw new Error('Use notes within MIDI 0–127 (C-1 to G9).');
  return 440 * 2 ** ((midi - 69) / 12);
}

export function decibelsToGain(db: number) {
  if (!Number.isFinite(db) || db < -60 || db > 6) throw new Error('Volume must be between -60 and +6 dB.');
  return 10 ** (db / 20);
}
export function scheduleTrackVolume(gain: GainNode, db: number, time: number) {
  gain.gain.setTargetAtTime(decibelsToGain(db), time, .008);
}
export type PitchedVoice = { endTime: number; stopAt: (time: number) => void };

// Chords share one envelope per note; carriers and FM modulators all belong to the transport.
export function schedulePitchedSound(context: AudioContext, output: AudioNode, notes: number[], bank: SoundbankId, time: number, duration: number, sources: Set<AudioScheduledSourceNode>, onEnded?: () => void, scale = 1): PitchedVoice {
  const sound = pitchedPreset(bank);
  if (!notes.length || notes.length > 8 || !Number.isFinite(duration) || duration <= 0 || duration > 32) throw new Error('Use 1–8 notes per chord and a positive note length of up to 32 seconds.');
  if (!Number.isFinite(scale) || scale <= 0 || scale > 1) throw new Error('Note strength must be greater than 0 and up to 1.');
  const floor = .0001 * scale;
  const frequencies = notes.map(midiFrequency);
  const envelopes: { gain: GainNode; valueAt: (time: number) => number }[] = [];
  const owned: OscillatorNode[] = [];
  const endTime = time + duration + sound.release + .02;
  let remainingSources = notes.length * sound.layers.length * (sound.fm ? 2 : 1);
  let cutoff = endTime;
  frequencies.forEach((frequency) => {
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = Math.min(sound.cutoff, context.sampleRate * .44);
    filter.connect(gain).connect(output);
    const level = .24 * scale / Math.sqrt(notes.length);
    const gateEnd = time + duration;
    const attackEnd = time + Math.min(sound.attack, duration * .25);
    const decayEnd = Math.min(gateEnd, attackEnd + sound.decay);
    gain.gain.setValueAtTime(floor, time);
    gain.gain.linearRampToValueAtTime(level, attackEnd);
    gain.gain.exponentialRampToValueAtTime(Math.max(floor, level * sound.sustain), decayEnd);
    gain.gain.setValueAtTime(Math.max(floor, level * sound.sustain), gateEnd);
    gain.gain.exponentialRampToValueAtTime(floor, gateEnd + sound.release);
    const sustain = Math.max(floor, level * sound.sustain);
    envelopes.push({ gain, valueAt: (at) => {
      if (at <= time) return floor;
      if (at < attackEnd) return floor + (level - floor) * (at - time) / (attackEnd - time);
      if (at < decayEnd) return level * (sustain / level) ** ((at - attackEnd) / (decayEnd - attackEnd));
      if (at <= gateEnd) return sustain;
      return sustain * (floor / sustain) ** Math.min(1, (at - gateEnd) / sound.release);
    } });
    const shared: AudioNode[] = [gain, filter];
    const started: OscillatorNode[] = [];
    sound.layers.forEach((voice) => {
      const oscillator = context.createOscillator();
      const voiceGain = context.createGain();
      oscillator.type = voice.wave;
      oscillator.frequency.value = Math.min(frequency * voice.harmonic, context.sampleRate * .44);
      oscillator.detune.value = voice.detune;
      voiceGain.gain.value = voice.level;
      oscillator.connect(voiceGain).connect(filter);
      shared.push(voiceGain);
      started.push(oscillator);
      if (sound.fm) {
        const modulator = context.createOscillator();
        const depth = context.createGain();
        modulator.frequency.value = Math.min(frequency * sound.fm.ratio, context.sampleRate * .44);
        depth.gain.setValueAtTime(frequency * sound.fm.index, time);
        depth.gain.exponentialRampToValueAtTime(Math.max(.001, frequency * .05), gateEnd);
        modulator.connect(depth).connect(oscillator.frequency);
        shared.push(depth);
        started.push(modulator);
      }
    });
    let remaining = started.length;
    started.forEach((source) => {
      owned.push(source);
      sources.add(source);
      source.onended = () => {
        sources.delete(source); source.disconnect();
        if (--remaining === 0) shared.forEach((node) => node.disconnect());
        if (--remainingSources === 0) onEnded?.();
      };
      source.start(time);
      source.stop(gateEnd + sound.release + .02);
    });
  });
  return { endTime, stopAt: (at) => {
    if (at >= cutoff) return;
    cutoff = at;
    const fadeStart = Math.max(time, context.currentTime, at - .008);
    envelopes.forEach(({ gain, valueAt }) => {
      if (typeof gain.gain.cancelAndHoldAtTime === 'function') gain.gain.cancelAndHoldAtTime(fadeStart);
      else {
        gain.gain.cancelScheduledValues(fadeStart);
        gain.gain.setValueAtTime(valueAt(fadeStart), fadeStart);
      }
      gain.gain.linearRampToValueAtTime(floor, Math.max(fadeStart, at));
    });
    owned.forEach((source) => { try { source.stop(Math.max(context.currentTime, at)); } catch { /* Already ended. */ } });
  } };
}

// Playback and audition share this renderer; each owns a separate set of cancellable sources.
export function scheduleDrumSound(context: AudioContext, output: AudioNode, part: DrumPart, bank: SoundbankId, time: number, sources: Set<AudioScheduledSourceNode>, scale = 1) {
  if (!Number.isFinite(scale) || scale <= 0 || scale > 1) throw new Error('Drum strength must be greater than 0 and up to 1.');
  for (const voice of drumVoices(part, bank)) {
    const gain = context.createGain();
    const filters: BiquadFilterNode[] = [];
    let source: AudioScheduledSourceNode;
    if (voice.kind === 'noise') {
      const buffer = context.createBuffer(1, Math.max(1, Math.floor(context.sampleRate * voice.duration)), context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
      const noise = context.createBufferSource();
      noise.buffer = buffer;
      source = noise;
      const highpass = context.createBiquadFilter();
      highpass.type = 'highpass'; highpass.frequency.value = voice.highpass;
      filters.push(highpass);
    } else {
      const tone = context.createOscillator();
      tone.type = voice.wave ?? 'sine';
      tone.frequency.setValueAtTime(voice.frequency, time);
      tone.frequency.exponentialRampToValueAtTime(Math.max(35, voice.frequency * voice.drop), time + Math.min(voice.duration, .16));
      source = tone;
    }
    if (voice.lowpass) {
      const lowpass = context.createBiquadFilter();
      lowpass.type = 'lowpass'; lowpass.frequency.value = voice.lowpass;
      filters.push(lowpass);
    }
    gain.gain.setValueAtTime(.0001 * scale, time);
    gain.gain.linearRampToValueAtTime(voice.level * scale, time + .001);
    gain.gain.exponentialRampToValueAtTime(.0001 * scale, time + voice.duration);
    let node: AudioNode = source;
    for (const filter of filters) { node.connect(filter); node = filter; }
    node.connect(gain).connect(output);
    sources.add(source);
    source.onended = () => { sources.delete(source); source.disconnect(); gain.disconnect(); filters.forEach((filter) => filter.disconnect()); };
    source.start(time);
    source.stop(time + voice.duration + .02);
  }
}
