import { evaluateNumber, splitTopLevel } from './ohcodes-expressions';

// Native Web Audio insert effects. One rack per instrument; source order is signal order.
export type EffectId = 'reverb' | 'delay' | 'filter';
export type Effect =
  | { id: 'reverb'; mix: number; decay: number }
  | { id: 'delay'; mix: number; rate: string; feedback: number }
  | { id: 'filter'; frequency: number };
export const EFFECTS = [
  { id: 'reverb', name: 'Reverb', description: 'mix % · optional decay seconds', template: '.effects("reverb", 25)' },
  { id: 'delay', name: 'Delay', description: 'mix % · note length · feedback %', template: '.effects("delay", 20, "1/8", 35)' },
  { id: 'filter', name: 'Filter', description: 'low-pass cutoff in Hz · 20–20000', template: '.effects("filter", 1800)' },
] as const;
export function searchEffects(query: string) {
  const value = query.trim().toLowerCase();
  return value ? EFFECTS.filter((effect) => `${effect.id} ${effect.name}`.toLowerCase().includes(value)) : [];
}

function numeric(raw: string | undefined, fallback: number, min: number, max: number, label: string) {
  if (raw === undefined) return fallback;
  const value = evaluateNumber(raw, label);
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be ${min}–${max}.`);
  return value;
}
function quoted(raw: string) { return raw.trim().match(/^(["'])([^"'\n]+)\1$/)?.[2].toLowerCase() ?? null; }
export function parseEffect(segment: string): Effect {
  const match = segment.match(/^\.\s*effects\s*\(([\s\S]*)\)$/);
  if (!match) throw new Error('Write an effect like .effects("reverb", 25). Type its name inside the parentheses to search.');
  const args = splitTopLevel(match[1], ',');
  const id = quoted(args[0]);
  if (!EFFECTS.some((effect) => effect.id === id)) throw new Error('Unknown effect. Choose "reverb", "delay", or "filter" inside .effects().');
  if (id === 'reverb') {
    if (args.length > 3) throw new Error('Reverb: .effects("reverb", mix %, decay seconds).');
    return { id, mix: numeric(args[1], 25, 0, 100, 'Reverb mix %'), decay: numeric(args[2], 2, .1, 8, 'Reverb decay seconds') };
  }
  if (id === 'delay') {
    if (args.length > 4) throw new Error('Delay: .effects("delay", mix %, "1/8", feedback %).');
    const rate = args[2] === undefined ? '1/8' : delayRate(args[2]);
    return { id, mix: numeric(args[1], 20, 0, 100, 'Delay mix %'), rate, feedback: numeric(args[3], 35, 0, 80, 'Delay feedback %') };
  }
  if (args.length > 2) throw new Error('Filter: .effects("filter", cutoff Hz). This is a low-pass filter.');
  return { id: 'filter', frequency: numeric(args[1], 1800, 20, 20000, 'Filter cutoff Hz') };
}

function delayRate(raw: string): string {
  const text = quoted(raw);
  // Dotted/triplet notation is musical syntax, not a decimal or identifier.
  const suffix = text?.match(/([.t])$/)?.[1] ?? '';
  const expression = text === null ? raw : suffix ? text.slice(0, -1) : text;
  const value = evaluateNumber(expression, 'Delay note length');
  const denominator = [2, 4, 8, 16, 32].find((unit) => Math.abs(value - 1 / unit) < 1e-12);
  if (!denominator) throw new Error('Delay note length: calculate 1/2, 1/4, 1/8, 1/16, or 1/32; quoted . is dotted and t is triplet.');
  return `1/${denominator}${suffix}`;
}

export function delaySeconds(rate: string, tempo: number, unit: number) {
  const match = rate.match(/^1\/(2|4|8|16|32)(\.|t)?$/);
  if (!match || tempo < 30 || tempo > 240 || !Number.isFinite(tempo) || ![2, 4, 8, 16].includes(unit)) throw new Error('Invalid delay timing.');
  return 60 / tempo * unit / Number(match[1]) * (match[2] === '.' ? 1.5 : match[2] === 't' ? 2 / 3 : 1);
}
export function effectLabel(effect: Effect) {
  return effect.id === 'filter' ? `filter ${effect.frequency} Hz` : effect.id === 'reverb' ? `reverb ${effect.mix}% / ${effect.decay}s` : `delay ${effect.mix}% / ${effect.rate} / ${effect.feedback}%`;
}
export function effectRackKey(effects: Effect[], tempo: number, unit: number) {
  return JSON.stringify([effects, effects.some((effect) => effect.id === 'delay') ? [tempo, unit] : null]);
}

const impulses = new WeakMap<BaseAudioContext, Map<number, AudioBuffer>>();
function reverbImpulse(context: BaseAudioContext, decay: number) {
  let cache = impulses.get(context);
  if (!cache) { cache = new Map(); impulses.set(context, cache); }
  const cached = cache.get(decay);
  if (cached) return cached;
  const length = Math.ceil(context.sampleRate * decay);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const samples = buffer.getChannelData(channel);
    let seed = 12345 + channel * 891;
    let smoothed = 0;
    for (let index = 0; index < length; index += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      smoothed = smoothed * .35 + (seed / 4294967296 * 2 - 1) * .65;
      const position = index / length;
      samples[index] = smoothed * Math.exp(-6.9 * position) * Math.min(1, index / (context.sampleRate * .006));
    }
  }
  if (cache.size >= 8) cache.delete(cache.keys().next().value!);
  cache.set(decay, buffer);
  return buffer;
}

export type EffectRack = {
  input: GainNode; output: GainNode; key: string; tail: number;
  enter(time: number): void; retire(time: number): number; fadeOut(time: number): number; dispose(): void;
};
export function createEffectRack(context: BaseAudioContext, effects: Effect[], tempo: number, unit: number): EffectRack {
  const nodes: AudioNode[] = [];
  const own = <T extends AudioNode>(node: T): T => { nodes.push(node); return node; };
  const input = own(context.createGain());
  const output = own(context.createGain());
  input.gain.value = 0;
  let cursor: AudioNode = input;
  let tail = .02;
  for (const effect of effects) {
    if (effect.id === 'filter') {
      const filter = own(context.createBiquadFilter());
      filter.type = 'lowpass';
      filter.frequency.value = Math.min(effect.frequency, context.sampleRate * .475);
      filter.Q.value = -3.0103; // Web Audio low-pass Q is dB: sqrt(1/2) gives a non-resonant cutoff.
      cursor.connect(filter); cursor = filter;
      continue;
    }
    if (effect.mix === 0) continue;
    const dry = own(context.createGain());
    const wet = own(context.createGain());
    const sum = own(context.createGain());
    dry.gain.value = 1 - effect.mix / 100;
    wet.gain.value = effect.mix / 100;
    cursor.connect(dry).connect(sum);
    if (effect.id === 'reverb') {
      const convolver = own(context.createConvolver());
      convolver.normalize = true;
      convolver.buffer = reverbImpulse(context, effect.decay);
      cursor.connect(convolver).connect(wet).connect(sum);
      tail += effect.decay;
    } else {
      const delay = own(context.createDelay(32));
      const feedback = own(context.createGain());
      const damping = own(context.createBiquadFilter());
      const seconds = delaySeconds(effect.rate, tempo, unit);
      delay.delayTime.value = seconds;
      feedback.gain.value = effect.feedback / 100;
      damping.type = 'lowpass'; damping.frequency.value = Math.min(6000, context.sampleRate * .475); damping.Q.value = -3.0103;
      cursor.connect(delay).connect(wet).connect(sum);
      delay.connect(damping).connect(feedback).connect(delay);
      tail += seconds * (effect.feedback === 0 ? 1 : 1 + Math.ceil(Math.log(.001) / Math.log(effect.feedback / 100)));
    }
    cursor = sum;
  }
  cursor.connect(output);
  // Old racks keep natural tails on edits; bound their lifetime and fade before disposal.
  tail = Math.min(32, tail);
  let disposed = false;
  return {
    input, output, key: effectRackKey(effects, tempo, unit), tail,
    enter(time) { input.gain.setValueAtTime(0, time); input.gain.linearRampToValueAtTime(1, time + .008); },
    retire(time) {
      input.gain.cancelScheduledValues(time);
      input.gain.setValueAtTime(1, time);
      input.gain.linearRampToValueAtTime(0, time + .008);
      output.gain.setValueAtTime(1, time + tail);
      output.gain.linearRampToValueAtTime(0, time + tail + .05);
      return time + tail + .05;
    },
    fadeOut(time) {
      output.gain.cancelScheduledValues(time);
      output.gain.setValueAtTime(1, time);
      output.gain.linearRampToValueAtTime(0, time + .05);
      return time + .05;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      nodes.forEach((node) => node.disconnect());
    },
  };
}

// Own outgoing connections and retired graphs so Stop clears all audible tails immediately.
export function createTrackEffects(context: AudioContext, track: GainNode, master: AudioNode) {
  let active: EffectRack | null = null;
  const retired = new Map<EffectRack, number>();
  const disconnect = (rack: EffectRack) => { try { track.disconnect(rack.input); } catch { /* Already disconnected. */ } rack.dispose(); };
  return {
    apply(effects: Effect[], tempo: number, unit: number, time: number) {
      if (active?.key === effectRackKey(effects, tempo, unit)) return;
      const next = createEffectRack(context, effects, tempo, unit);
      track.connect(next.input); next.output.connect(master); next.enter(time);
      if (active) retired.set(active, active.retire(time));
      // Rapid live edits must not accumulate dozens of convolution graphs on one track.
      if (retired.size > 4) {
        const oldest = retired.keys().next().value!;
        retired.set(oldest, oldest.fadeOut(time));
      }
      active = next;
    },
    collect(time: number) { retired.forEach((end, rack) => { if (time >= end) { disconnect(rack); retired.delete(rack); } }); },
    clear() { if (active) disconnect(active); active = null; retired.forEach((_, rack) => disconnect(rack)); retired.clear(); },
  };
}
export type TrackEffects = ReturnType<typeof createTrackEffects>;
