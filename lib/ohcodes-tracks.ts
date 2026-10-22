import { trackId, trackIsAudible, isDrumPart, type ParsedScore, type ScoreHit, type Part } from './ohcodes-language';
import { createTrackEffects, type TrackEffects } from './ohcodes-effects';
import { scheduleTrackVolume, scheduleDrumSound, schedulePitchedSound, type PitchedVoice } from './ohcodes-soundbanks';

type Route = { part: Part; gain: GainNode; output: GainNode; audible: boolean; effects: TrackEffects; voice?: PitchedVoice };
// A named track owns its gain, effect graph and melodic voice. Instrument type is not identity.
export function createTrackMixer(context: AudioContext, master: AudioNode, sources: Set<AudioScheduledSourceNode>) {
  const routes = new Map<string, Route>();
  const retired: { route: Route; until: number }[] = [];
  const dispose = (route: Route) => { route.effects.clear(); route.gain.disconnect(); route.output.disconnect(); };
  return {
    prepare(score: ParsedScore, time: number) {
      const identities = score.trackParts ?? {};
      for (const [id, route] of routes) if (!identities[id] || identities[id].part !== route.part) {
        route.voice?.stopAt(time);
        scheduleTrackVolume(route.gain, -60, time);
        route.gain.gain.linearRampToValueAtTime(0, time + .02);
        // Keep old effect tails, but bound both their lifetime and the number of retired tracks.
        retired.push({ route, until: time + 32 });
        routes.delete(id);
      }
      while (retired.length > 64) dispose(retired.shift()!.route);
      for (const [id, identity] of Object.entries(identities)) {
        const audible = trackIsAudible(score, identity);
        let route = routes.get(id);
        if (!route) {
          const gain = context.createGain();
          // Gate after the effects: mute also silences reverb/delay, not just new notes.
          const output = context.createGain();
          output.connect(master);
          output.gain.setValueAtTime(audible ? 1 : 0, time);
          route = { part: identity.part, gain, output, audible, effects: createTrackEffects(context, gain, output) };
          routes.set(id, route);
        }
        if (route.audible !== audible) {
          route.output.gain.setValueAtTime(route.audible ? 1 : 0, time);
          route.output.gain.linearRampToValueAtTime(audible ? 1 : 0, time + .02);
          if (!audible) route.voice?.stopAt(time);
          route.audible = audible;
        }
        scheduleTrackVolume(route.gain, score.volumes[id], time);
        route.effects.apply(score.effects[id], score.tempo, score.unit, time);
      }
    },
    schedule(hit: ScoreHit, score: ParsedScore, time: number, beatDuration: number) {
      const id = trackId(hit);
      const route = routes.get(id);
      if (!route || !trackIsAudible(score, hit)) return;
      const strength = (hit.velocity ?? 127) / 127;
      if (hit.notes && hit.duration) {
        route.voice?.stopAt(time);
        const voice = schedulePitchedSound(context, route.gain, hit.notes, score.timbres[id], time, hit.duration * beatDuration, sources, () => {
          if (route.voice === voice) route.voice = undefined;
        }, strength);
        route.voice = voice;
      } else if (isDrumPart(hit.part)) scheduleDrumSound(context, route.gain, hit.part, score.timbres[id], time, sources, strength);
    },
    collect(time: number) {
      routes.forEach((route) => route.effects.collect(time));
      for (let index = retired.length - 1; index >= 0; index--) {
        retired[index].route.effects.collect(time);
        if (time >= retired[index].until) { dispose(retired[index].route); retired.splice(index, 1); }
      }
    },
    clear() {
      routes.forEach((route) => { route.voice?.stopAt(context.currentTime); dispose(route); });
      routes.clear(); retired.forEach(({ route }) => dispose(route)); retired.length = 0;
    },
  };
}
