import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

// Exercise the actual TypeScript grammar without a React/browser dependency.
const modules = new Map();
function loadModule(name) {
  if (!['ohcodes-language', 'ohcodes-soundbanks', 'ohcodes-effects', 'ohcodes-project', 'ohcodes-song', 'ohcodes-editor', 'ohcodes-manual', 'ohcodes-scales', 'ohcodes-tracks', 'ohcodes-expressions'].includes(name)) throw new Error(`Unexpected test dependency ${name}`);
  if (modules.has(name)) return modules.get(name).exports;
  const module = { exports: {} };
  modules.set(name, module);
  const source = readFileSync(new URL(`./${name}.ts`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  new Function('exports', 'module', 'require', compiled.outputText)(module.exports, module, (specifier) => loadModule(specifier.replace(/^\.\//, '')));
  return module.exports;
}
const { STARTER, PARTS, NOTE_PARTS, INSTRUMENTS, drumRows, parsePassage, preparedPassage, readPassages, scoreHits, stepModel, toggleRowStep, resizeRowSteps, passageBarCount, rowSoundbank, rowVolume, rowEffects, draftSoundbank, setRowSoundbank, soundbankCompletion, completeSoundbank, effectCompletion, completeEffect, setRowEffect, notePitches } = loadModule('ohcodes-language');
const { EFFECTS, parseEffect, searchEffects, delaySeconds, createEffectRack, createTrackEffects, effectRackKey } = loadModule('ohcodes-effects');
const { readArrangement, setArrangement, renameSongPassage, namedSource } = loadModule('ohcodes-language');
const { rowGroove, passageHits, grooveCompletion, completeGroove, grooveParameterHint } = loadModule('ohcodes-language');
const { prepareSong, songFrame, updateSongPassage } = loadModule('ohcodes-song');
const { DRAFT_KEY, PREVIOUS_KEY, MAX_CODE_LENGTH, MAX_PROJECT_BYTES, DraftConflict, createProject, parseProject, prepareProject, projectFilename, projectFingerprint, serializeProject, saveDraft, replaceDraft } = loadModule('ohcodes-project');
const { SOUNDBANKS, drumVoices, pitchedPreset, scheduleDrumSound, schedulePitchedSound, scheduleTrackVolume, decibelsToGain, searchSoundbanks, defaultSoundbank, resolveSoundbank, midiFrequency } = loadModule('ohcodes-soundbanks');
const drumBanks = SOUNDBANKS.filter((bank) => bank.kind === 'drum');
const pitchedBanks = SOUNDBANKS.filter((bank) => bank.kind === 'pitched');
const song = (body, meter = '4/4') => `tempo 240\ntime ${meter}\n\npassage"A"{\n${body}\n}`;
const parse = (body, meter) => parsePassage(song(body, meter), 'A');
const hits = (score, part) => scoreHits(score).filter((hit) => !part || hit.part === part).map((hit) => hit.offset);

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} should be ${expected}`);
const strengths = (score, bar, part) => passageHits(score, bar).filter((hit) => hit.part === part).map((hit) => hit.velocity ?? 127);

const { scanCode, activeBrackets, instrumentCompletion, completeInstrument, parameterHelp, diagnoseCode } = loadModule('ohcodes-editor');
const { MANUAL_LESSONS } = loadModule('ohcodes-manual');
const { parseScale, degreePitch, searchScales } = loadModule('ohcodes-scales');
const { scaleCompletion, completeScale } = loadModule('ohcodes-language');
const { trackId, trackLabel, trackIsAudible } = loadModule('ohcodes-language');
const { selectionCompletion, completeSelection } = loadModule('ohcodes-editor');
const { createTrackMixer } = loadModule('ohcodes-tracks');
const { evaluateNumber, splitExpressionTokens, splitTopLevel } = loadModule('ohcodes-expressions');

test('arithmetic uses ordinary precedence, nested parentheses, unary signs and decimals', () => {
  for (const [expression, expected] of [
    ['10*8',80], ['2+3*4',14], ['(2+3)*4',20], ['24/3/2',4], ['8-3-2',3],
    ['-3*4',-12], ['-(3+4)',-7], ['+2 + -3',-1], ['--2',2],
    ['.5*(2+2)',2], ['1.25 + 2.5/2',2.5], [' 2 * (3 + (8 / 4)) ',10],
  ]) close(evaluateNumber(expression), expected);
  assert.deepEqual(splitExpressionTokens('C3*(1 + 1) (2 + 3) ~'), ['C3*(1 + 1)', '(2 + 3)', '~']);
  assert.deepEqual(splitTopLevel('10*8, (30+10)*2, 1/(4*2)', ','), ['10*8', ' (30+10)*2', ' 1/(4*2)'].map(x=>x.trim()));
});

test('arithmetic rejects unfinished syntax, nonfinite values and executable or unsupported input', () => {
  for (const expression of ['', ' ', '1+', '2**3', '1/0', '0/0', '1/(3-3)', '(1+2', '1+2)', '()', '1 2', '2(3)', 'NaN', 'Infinity', 'Math.random()', 'globalThis.process', '1;2', '0x10', '1%2', '1,2', '"8"', '1e309', '9'.repeat(500), '('.repeat(1000)+'1'+')'.repeat(1000)]) {
    assert.throws(()=>evaluateNumber(expression), undefined, expression.slice(0,60));
  }
  assert.throws(()=>splitExpressionTokens('(1 + 2'));
  assert.throws(()=>splitExpressionTokens('1 + 2)'));
});

test('tempo, time signature and Song bars evaluate expressions with their original limits', () => {
  const source = song('bd([1] []*(2+3))', '(3+3)/(2*4)').replace('tempo 240', 'tempo 60*2')+'\nsong{\n  "A" 2*4 // eight bars\n}';
  const score = parsePassage(source, 'A').bars[0];
  assert.equal(score.tempo,120); assert.equal(score.beats,6); assert.equal(score.unit,8);
  assert.deepEqual(readArrangement(source).entries,[{name:'A',bars:8}]);
  assert.equal(prepareSong(source).totalBars,8);
  assert.equal(renameSongPassage(source,'A','Verse'),source.replace('"A" 2*4','"Verse" 2*4'));
  assert.equal(parse('bd([]*4)', '(8/2)/4').bars[0].beats,4);
  for (const value of ['10*2','200+41','1/0','120+']) assert.throws(()=>parsePassage(song('bd([]*4)').replace('tempo 240',`tempo ${value}`),'A'));
  for (const meter of ['(1/2)/4','(8+9)/4','4/(2+1)','4/2/2','(1/0)/4']) assert.throws(()=>parse('bd([]*4)',meter));
  for (const bars of ['1/2','128*3','1/0','2+','0*4']) assert.ok(readArrangement(source.replace('2*4 // eight bars',bars)).error,bars);
});

test('numeric track modifiers and effect arguments compute before range checks', () => {
  const body='hh([1 1]*4).velocity(10*8, (30+10)*2).volume(-3*4).swing(50+5).effects("filter", 1000*(1+1)).effects("reverb", (10+5)*2, 1/2).effects("delay", 5*4, 1/(4*2), 7*5)';
  const score=parse(body).bars[0];
  assert.deepEqual(score.velocities.hh,[80,80]); assert.equal(score.volumes.hh,-12); assert.equal(score.swings.hh,55);
  assert.deepEqual(score.effects.hh,[{id:'filter',frequency:2000},{id:'reverb',mix:30,decay:.5},{id:'delay',mix:20,rate:'1/8',feedback:35}]);
  for (const modifier of ['velocity(64*2)','velocity(3/2)','velocity(1/0)','volume(-31*2)','volume(1/0)','swing(50-1)','swing(25*4)','effects("reverb",50*3)','effects("reverb",20,1/20)','effects("filter",10000*3)','effects("delay",20,"1/8",41*2)']) assert.throws(()=>parse(`hh([1]*4).${modifier}`),undefined,modifier);
});

test('delay expressions resolve only to supported sync rates and preserve dotted or triplet suffixes', () => {
  for (const [source,rate] of [['1/(4*2)','1/8'], ['"1/(4*2)"','1/8'], ['"1/(4*2)."','1/8.'], ['"1/(4*2)t"','1/8t'], ['(1+1)/8','1/4']]) {
    assert.equal(parseEffect(`.effects("delay",20,${source},35)`).rate,rate);
  }
  for (const rate of ['1/3','1/(8*8)','1/0','"1/(4*2"','"1/8tt"']) assert.throws(()=>parseEffect(`.effects("delay",20,${rate},35)`));
});

test('bracket repetition expands within a bar while drum and melodic timing stay distinct', () => {
  assert.deepEqual(passageHits(parse('bd([]*4)'),0),[]);
  assert.deepEqual(passageHits(parse('bd[]*4.0'),0),[]);
  assert.deepEqual(passageHits(parse('bd[]*8/2.0'),0),[]);
  assert.deepEqual(parse('hh([1 0]*(2+2))').bars[0].pattern.hh,['10','10','10','10']);
  assert.deepEqual(hits(parse('hh([1 0]*4)').bars[0]),[0,.25,.5,.75]);
  const melodic=parse('keys([C3]*4)').bars[0].noteEvents;
  assert.deepEqual(melodic.map(x=>[x.offset,x.duration]),[[0,1],[.25,1],[.5,1],[.75,1]]);
  assert.equal(parse('keys([C3])').bars[0].noteEvents[0].duration,4);
  const two=parse('bd([1]*4, []*(1+3))');
  assert.equal(two.writtenBars,2); assert.equal(hits(two.bars[0]).length,4); assert.equal(hits(two.bars[1]).length,0);
  assert.throws(()=>parse('bd([1]*3)'),/beat|bracket/i);
  assert.throws(()=>parse('bd([]*4, []*4, []*4, []*4, []*4)'),/four|4 bars/i);
});

test('repetition is bounded before expansion and never rounds invalid counts', () => {
  assert.equal(parse('keys([]*64)').bars[0].noteEvents.length,0);
  for (const count of ['0','-1','1/2','1/0','65','1000000000','2**2','(2+)']) assert.throws(()=>parse(`keys([]*${count})`),undefined,count);
  assert.throws(()=>parse('keys([]*64[])'));
  for (const pattern of ['keys([]*)','keys([]*(4)','keys([]*4 junk)','keys([[]]*4)']) assert.throws(()=>parse(pattern),undefined,pattern);
});

test('computed drum triggers keep compact binary steps and reject values other than zero or one', () => {
  const score=parse('hh([(2-1) (8/8)]*4)').bars[0];
  assert.deepEqual(score.pattern.hh,['11','11','11','11']);
  assert.equal(hits(score).length,8);
  assert.deepEqual(parse('hh([0101]*4)').bars[0].pattern.hh,['0101','0101','0101','0101']);
  assert.deepEqual(parse('hh([(3-3) 1]*4)').bars[0].pattern.hh,['01','01','01','01']);
  for (const value of ['(2+1)','(1/2)','(1/0)','(-1)']) assert.throws(()=>parse(`hh([${value}]*4)`));
});

test('melodic expressions resolve degrees and octaves without changing note weight semantics', () => {
  const degree=parse('keys([(1+2) (8/2)]).scale("C(1+2) major")').bars[0];
  assert.deepEqual(degree.noteEvents.map(x=>x.notes),[[52],[53]]);
  assert.deepEqual(degree.noteEvents.map(x=>x.duration),[2,2]);
  assert.deepEqual(parse('keys([C(1+2)&E3&G3])').bars[0].noteEvents[0].notes,[48,52,55]);
  assert.deepEqual(parse('keys([(1+2)&(3+4)]).scale("C3 major")').bars[0].noteEvents[0].notes,[52,59]);
  const weighted=parse('keys([C3*(1+1) G3])').bars[0].noteEvents;
  close(weighted[0].duration,8/3); close(weighted[1].duration,4/3);
  assert.deepEqual(parse('keys([C3*(1+1) G3])').bars[0].noteEvents,parse('keys([C3*2 G3])').bars[0].noteEvents);
  assert.deepEqual(parse('keys([(1*2) #((1+1)) b(1+2)]).scale("C3 chromatic")').bars[0].noteEvents.map(x=>x.notes),[[50],[51],[51]]);
  for (const body of ['keys([C3*(1/2) G3])','keys([C3*(8+9) G3])','keys([(3/2)]).scale("C3 major")','keys([1]).scale("C(1/2) major")','keys([C(10/4)])','keys([(1/0)]).scale("C3 major")']) assert.throws(()=>parse(body),undefined,body);
});

test('computed scale root completion retains its arithmetic instead of replacing it with a literal octave', () => {
  const source=song('keys([(1+2)&(3+4)]).scale("C(1+2) mi").volume(-3*4) // keep');
  const cursor=source.indexOf(' mi')+3, context=scaleCompletion(source,cursor);
  assert.ok(context);
  const options=searchScales(context.query);
  assert.ok(options.some(x=>x.id==='C(1+2) minor'));
  const next=completeScale(source,context,'C(1+2) minor').source;
  assert.equal(next,source.replace('C(1+2) mi','C(1+2) minor'));
  assert.deepEqual(parsePassage(next,'A').bars[0].noteEvents[0].notes,[51,58]);
});

test('quoted drum patterns evaluate repeat counts while retaining their one-bar timing', () => {
  assert.deepEqual(hits(parse('hh("x*(2+2)")').bars[0]),[0,.25,.5,.75]);
  assert.deepEqual(hits(parse('hh("x*(2 + 2) ~*(2+2)")').bars[0]),[0,.125,.25,.375]);
  for(const value of ['1/2','1/0','16*3','0','2**2']) assert.throws(()=>parse(`hh("x*(${value})")`));
});

test('Steps expands repeated or calculated rhythm only when edited and preserves modifier expressions', () => {
  const source=song('hat = hh([(2-1) 0]*4).volume(-3*4).velocity(10*8).effects("filter",1000*2) // keep this')+'\npassage"B"{\nhat = hh([]*4)\n}';
  const row=drumRows(source)[0];
  assert.deepEqual(stepModel(source,row).groups,['10','10','10','10']);
  assert.match(source,/\[\(2-1\) 0\]\*4/);
  const changed=toggleRowStep(source,row.key,2,1);
  assert.deepEqual(parsePassage(changed,'A').bars[0].pattern['@hat'],['10','10','11','10']);
  assert.ok(changed.includes('.volume(-3*4).velocity(10*8).effects("filter",1000*2) // keep this'));
  assert.ok(changed.endsWith('passage"B"{\nhat = hh([]*4)\n}'));
  const resized=resizeRowSteps(source,row.key,4);
  assert.deepEqual(hits(parsePassage(resized,'A').bars[0]),hits(parsePassage(source,'A').bars[0]));
  assert.equal(stepModel(resized,drumRows(resized)[0]).groups.length,4);
  assert.ok(resized.includes('.volume(-3*4).velocity(10*8)'));
});

test('Steps conversion retains internal multiline comments and does not leak into another row', () => {
  const source=song('hat = hh(\n  [(2-1) 0]*2 // first half 🎵\n  [10]*2 // second half\n).volume(-3*4) // hat level\nbd([]*4)');
  const row=drumRows(source)[0];
  const changed=toggleRowStep(source,row.key,3,1);
  assert.deepEqual(parsePassage(changed,'A').bars[0].pattern['@hat'],['10','10','10','11']);
  for(const comment of ['// first half 🎵','// second half','// hat level']) assert.equal(changed.split(comment).length,2,comment);
  assert.ok(changed.includes('.volume(-3*4)')); assert.ok(changed.includes('bd([]*4)'));
});

test('plain bracket patterns still reject trailing tokens and nested brackets after repetition support', () => {
  for(const body of ['bd([][][][]junk)','bd([][][][] 4)','bd([[]][][][])','keys([C3][[G3]])','keys([C3]**4)','keys([C3]*4junk)']) assert.throws(()=>parse(body),undefined,body);
});

test('effect sliders normalize only their edited effect and completion keeps other calculations intact', () => {
  const source=song('lead = keys([C(1+2)]*2).volume(-3*4).effects("reverb",10*2,1+1).effects("filter",1000*(1+1))');
  const row=drumRows(source)[0];
  const next=setRowEffect(source,row.key,0,{id:'reverb',mix:35,decay:3});
  assert.equal(next,source.replace('.effects("reverb",10*2,1+1)','.effects("reverb",35,3)'));
  const draft=source.replace('"reverb"','r'), cursor=draft.indexOf('.effects(r')+10;
  const context=effectCompletion(draft,cursor); assert.ok(context);
  assert.equal(completeEffect(draft,context,'reverb').source,source);
});

test('effect sliders preserve untouched argument expressions, spelling and comments in the same effect', () => {
  const source=song("keys([C3]).effects('reverb', 10*2, 1/2).volume(-3*4) // keep");
  const row=drumRows(source)[0];
  assert.equal(setRowEffect(source,row.key,0,{id:'reverb',mix:30,decay:.5}),source.replace('10*2','30'));
  assert.equal(setRowEffect(source,row.key,0,{id:'reverb',mix:20,decay:3}),source.replace('1/2','3'));
  assert.equal(setRowEffect(source,row.key,0,{id:'reverb',mix:20,decay:.5}),source);
  const multi=song('keys([C3]).effects(\n  "reverb",\n  10*2, // mix\n  1/2 // decay\n)');
  const changed=setRowEffect(multi,drumRows(multi)[0].key,0,{id:'reverb',mix:30,decay:.5});
  assert.equal(changed,multi.replace('10*2','30'));
  const defaults=song('keys([C3]).effects("reverb")');
  assert.equal(setRowEffect(defaults,drumRows(defaults)[0].key,0,{id:'reverb',mix:25,decay:3}),defaults.replace('.effects("reverb")','.effects("reverb", 25, 3)'));
  const delay=song('keys([C3]).effects("delay", 10*2, "1/(4*2)t", 7*5)');
  assert.equal(setRowEffect(delay,drumRows(delay)[0].key,0,{id:'delay',mix:30,rate:'1/8t',feedback:35}),delay.replace('10*2','30'));
});

test('computed meter drives silent instrument insertion and the Steps view', () => {
  const source='time (3+3)/(2*4)\npassage"A"{\n  bd\n}';
  const cursor=source.indexOf('bd')+2, context=instrumentCompletion(source,cursor);
  assert.ok(context); assert.equal(context.beats,6);
  const result=completeInstrument(source,context,'bd');
  assert.deepEqual(passageHits(parsePassage(result.source,'A'),0),[]);
  const model=stepModel(result.source,drumRows(result.source)[0]);
  assert.equal(model.beats,6); assert.equal(model.unit,8);
  assert.equal(instrumentCompletion(source.replace('(3+3)','(3+)'),cursor-1),null);
});

test('invalid calculated meters highlight their control line, including differently cased keywords', () => {
  for(const line of ['time (3+3)/(2+1)','TIME (3+3)/(2+1)','Time (3+3)/(2+1)']) {
    const source=`tempo 60*2\n${line}\npassage"A"{\n  bd([]*4)\n}`;
    const issue=diagnoseCode(source,'A');
    assert.ok(issue);
    assert.equal(source.slice(issue.from,issue.to),line);
  }
});

test('expressions survive project export and keep the elapsed Song and velocity phase', () => {
  const source=song('hh([1 1]*4).velocity(10*8,30*2,5*8)')+'\nsong{\n"A" 2*4\n}';
  assert.equal(parseProject(serializeProject(createProject('Math',source,'A'))).code,source);
  const score=parsePassage(source,'A');
  assert.deepEqual(strengths(score,1,'hh'),[40,80,60,40,80,60,40,80]);
  const changed=source.replace('10*8','10*9');
  assert.equal(songFrame(prepareSong(changed),5).songBar,6);
  assert.deepEqual(strengths(parsePassage(changed,'A'),1,'hh'),[40,90,60,40,90,60,40,90]);
  assert.ok(diagnoseCode(source.replace('10*8','10/0'),'A'));
  assert.deepEqual(strengths(score,1,'hh'),[40,80,60,40,80,60,40,80]);
});

const selectionTracks = 'chords = keys([C3&E3&G3])\nmelody = keys([C4][E4][G4][E4])\nkick = bd([1][][1][])\nhh("x*8")';
const audibleLabels = (body) => [...new Set(scoreHits(parse(body).bars[0]).map(trackLabel))].sort();
test('passage mute and solo select named and unnamed tracks without deleting patterns', () => {
  assert.deepEqual(audibleLabels(selectionTracks), ['chords','hh','kick','melody']);
  assert.deepEqual(audibleLabels(selectionTracks+'\nmute(chords, hh)'), ['kick','melody']);
  assert.deepEqual(audibleLabels(selectionTracks+'\nsolo(melody, kick)'), ['kick','melody']);
  for (const commands of ['solo(melody, kick)\nmute(kick)', 'mute(kick)\nsolo(melody, kick)']) {
    const parsed = parse(selectionTracks+'\n'+commands), bar = parsed.bars[0];
    assert.deepEqual([...new Set(scoreHits(bar).map(trackLabel))], ['melody']);
    assert.equal(parsed.trackBars.length, 4); assert.equal(bar.noteEvents.length,5);
    assert.equal(trackIsAudible(bar,{part:'bd',track:'kick'}),false);
  }
  assert.deepEqual(audibleLabels(selectionTracks+'\nmute(chords, chords)'),['hh','kick','melody']);
});

test('empty selection clears filters, comments and whitespace work, legacy source is supported', () => {
  assert.deepEqual(audibleLabels(selectionTracks+'\nmute()\nsolo( )'), audibleLabels(selectionTracks));
  assert.deepEqual(audibleLabels(selectionTracks+'\n  solo ( melody , kick ) // audition\n// mute(kick)'), ['kick','melody']);
  assert.deepEqual(scoreHits(parsePassage('bd([1][][][])\nmute(bd)','Passage 1').bars[0]),[]);
  assert.deepEqual(audibleLabels('mute = keys([C3])\nsolo = keys([D3])\nsolo(mute)'),['mute']);
  const safe = parse('__proto__ = keys([C3])\nconstructor = keys([D3])\nsolo(__proto__)');
  assert.deepEqual(scoreHits(safe.bars[0]).map(trackLabel),['__proto__']);
});

test('selection rejects unknown, ambiguous, repeated commands and malformed expressions', () => {
  for (const command of ['mute(Melody)','solo(keys)','mute(nope)']) assert.throws(()=>parse(selectionTracks+'\n'+command),/unknown track/);
  assert.throws(()=>parse('keys = keys([C3])\nkeys([D3])\nsolo(keys)'),/matches more than one/);
  assert.deepEqual(audibleLabels('bd("x ~")\nbd("~ x")\nsolo(bd)'),['bd']);
  for (const command of ['mute("kick")','mute(kick,)','solo(kick melody)','solo(kick);','solo(kick).volume(0)','mute(kick) solo(melody)','mute(kick + melody)','mute(1)','mute(\nkick\n)']) assert.throws(()=>parse(selectionTracks+'\n'+command),/comma-separated/);
  for (const command of ['mute(kick)\nmute(chords)','solo()\nsolo(kick)']) assert.throws(()=>parse(selectionTracks+'\n'+command),/one .* line/);
  for (const source of ['mute(kick)\n'+song(selectionTracks),song(selectionTracks)+'\nsolo(kick)']) assert.throws(()=>parsePassage(source,'A'),/inside a passage/);
});

test('selection remains passage-local and silent passages still occupy Song bars and export intact', () => {
  const source=song(selectionTracks+'\nmute(chords, melody, kick, hh)')+'\npassage"B"{\n'+selectionTracks+'\n}\nsong{\n"A" 4\n"B" 4\n}';
  assert.equal(scoreHits(parsePassage(source,'A').bars[0]).length,0);
  assert.equal(new Set(scoreHits(parsePassage(source,'B').bars[0]).map(trackLabel)).size,4);
  const arrangement=prepareSong(source); assert.equal(arrangement.totalBars,8);
  assert.equal(songFrame(arrangement,3).entry.score.name,'A');assert.equal(songFrame(arrangement,4).entry.score.name,'B');
  assert.equal(parseProject(serializeProject(createProject('Mute test',source,'A'))).code,source);
  assert.throws(()=>parsePassage(source.replace('hh)\n}', 'missing)\n}'),'A'),/unknown track/);
  assert.doesNotThrow(()=>parsePassage(source.replace('"A" 4','solo(missing)'),'B'),'unused Song draft must not break Live');
});

test('muting does not bypass syntax or resource limits, and unmuting keeps multi-bar velocity phase', () => {
  assert.throws(()=>parse('lead = keys([H3])\nmute(lead)'),/Unknown note/);
  const many=Array.from({length:17},(_,i)=>`hat${i} = hh("x*32")`).join('\n');
  assert.throws(()=>parse(many+'\nsolo(hat0)'),/512 musical events/);
  const body='lead = keys([C3], [D3][E3]).velocity(90,60,30,10)\nkick = bd([1][][][])';
  const all=parse(body), muted=parse(body+'\nmute(lead)');
  for(let bar=0;bar<8;bar++) {
    assert.equal(passageHits(muted,bar).some(hit=>hit.track==='lead'),false);
    const resumed=parse(body+'\nmute()');
    assert.deepEqual(passageHits(resumed,bar),passageHits(all,bar));
  }
  assert.equal(muted.bars.length,2);
});

test('selection diagnostics locate command names while note and effect errors keep their own location', () => {
  const bad=song(selectionTracks+'\nsolo(melody, wrong)');const issue=diagnoseCode(bad,'A');
  assert.equal(bad.slice(issue.from,issue.to),'wrong');
  const global=song(selectionTracks)+'\nmute(kick)';assert.equal(diagnoseCode(global,'A').from,global.lastIndexOf('mute'));
  for(const suffix of ['[H3]','[C3]).volume(20']) {
    const source=song(`lead = keys(${suffix})\nother = keys([C4])\nsolo(lead, other)`);
    const problem=diagnoseCode(source,'A');assert.ok(problem.from<source.indexOf('other ='),problem.message);
  }
  const keyword=scanCode('mute(kick)\nsolo(chords)').tokens.filter(t=>t.kind==='keyword');assert.equal(keyword.length,2);
});

test('inline selection completion is scoped, source-preserving, token-aware and excludes used names', () => {
  const source=song(selectionTracks+'\nsolo(me, kick) // keep')+'\npassage"B"{\nforeign = keys([C3])\n}';
  const cursor=source.indexOf('solo(me')+7, ctx=selectionCompletion(source,cursor);
  assert.deepEqual(ctx.options.map(o=>o.id),['melody']);
  const completed=completeSelection(source,ctx,'melody');assert.equal(completed.source,source.replace('solo(me,','solo(melody,'));
  assert.equal(completed.cursor,completed.source.indexOf('solo(melody')+11);
  const empty=song(selectionTracks+'\nmute()'), start=empty.indexOf('mute(')+5;
  assert.equal(selectionCompletion(empty,start).options.length,4);
  const middle=song(selectionTracks+'\nsolo(melody, kick)');const inside=middle.indexOf('solo(me')+7;
  assert.equal(completeSelection(middle,selectionCompletion(middle,inside),'melody').source,middle);
  assert.throws(()=>completeSelection(source.replace('melody =','renamed ='),ctx,'melody'),/tracks changed/);
  const ambiguous=song('keys = keys([])\nkeys([])\nsolo()');assert.deepEqual(selectionCompletion(ambiguous,ambiguous.indexOf('solo(')+5).options,[]);
});

test('selection completion never opens in comments, instruments, global space or Song order', () => {
  for(const source of [song(selectionTracks+'\n// solo(me)'),song('keys(\nsolo(me)\n)'),song(selectionTracks)+'\nsolo(me)',song(selectionTracks)+'\nsong{\nsolo(me)\n}']) {
    assert.equal(selectionCompletion(source,source.lastIndexOf('solo(me')+7),null);
  }
  const unfinished=song('keys(\nsolo(missing)');assert.equal(drumRows(unfinished)[0].text.trim(),'keys(');
});

test('mute gates post-effect output at the boundary and reuses routes on unmute', () => {
  const context=fakeAudio(), sources=new Set(), master={}, mixer=createTrackMixer(context,master,sources);
  const body='lead = keys([C3]).timbre("organ").effects("delay",50,"1/8",40)\nkick = bd([1][][][])';
  const all=parse(body).bars[0], muted=parse(body+'\nmute(lead)').bars[0];
  mixer.prepare(all,1);const outputs=context.nodes.filter(n=>n.links.includes(master));assert.equal(outputs.length,2);
  const event=scoreHits(all).find(hit=>hit.track==='lead');mixer.schedule(event,all,1,.5);
  const voices=[...sources], graphSize=context.nodes.length;mixer.prepare(muted,2);
  assert.deepEqual(outputs[0].gain.events.slice(-2),[[1,2],[0,2.02]]);
  assert.deepEqual(outputs[1].gain.events,[[1,1]]);assert.ok(voices.every(s=>s.stopTime<2.1));
  mixer.schedule(event,muted,2,.5);assert.equal(sources.size,voices.length,'muted hits never schedule even if called directly');
  mixer.prepare(all,3);assert.equal(context.nodes.length,graphSize);
  assert.deepEqual(outputs[0].gain.events.slice(-2),[[0,3],[1,3.02]]);
  mixer.clear();assert.ok(outputs.every(n=>n.disconnected));
  const fresh=fakeAudio(), silent=createTrackMixer(fresh,master,new Set());silent.prepare(muted,1);
  assert.equal(fresh.nodes.filter(n=>n.links.includes(master))[0].gain.events[0][0],0);silent.clear();
});

test('named melodic layers preserve simultaneous notes and independent sound, scale and mix', () => {
  const score=parse('chords = keys([1&3&5]).scale("C3 minor").timbre("organ").volume(-12).effects("reverb",20)\nmelody = keys([1][3][5][8]).scale("C4 major").timbre("piano").volume(-6).effects("filter",1000)\nkeys([C2]).volume(-18)');
  const bar=score.bars[0], events=scoreHits(bar);
  assert.equal(events.filter(e=>e.offset===0).length,3);
  assert.deepEqual(events.filter(e=>e.track==='chords')[0].notes,[48,51,55]);
  assert.deepEqual(events.filter(e=>e.track==='melody').map(e=>e.notes),[[60],[64],[67],[72]]);
  assert.equal(bar.timbres['@chords'],'organ');assert.equal(bar.timbres['@melody'],'piano');
  assert.equal(bar.volumes['@chords'],-12);assert.equal(bar.volumes['@melody'],-6);
  assert.equal(bar.effects['@chords'][0].id,'reverb');assert.equal(bar.effects['@melody'][0].id,'filter');
  assert.deepEqual(score.trackBars.map(trackLabel),['chords','melody','keys']);
  assert.deepEqual(events.filter(e=>!e.track)[0].notes,[36]);
});

test('named drum layers never deduplicate each other and retain independent loops and groove', () => {
  const score=parse('low = bd([1 1][][][], [][][][]).timbre("808").velocity(90,30).swing(60)\nhigh = bd("x*4").timbre("909").velocity(70,40,20)\nbd([1][][][])');
  assert.equal(scoreHits(score.bars[0]).filter(e=>e.offset===0).length,3);
  assert.deepEqual(passageHits(score,0).filter(e=>e.track==='low').map(e=>[e.offset,e.velocity]),[[0,90],[.15,30]]);
  assert.equal(passageHits(score,1).filter(e=>e.track==='low').length,0);
  assert.deepEqual(passageHits(score,1).filter(e=>e.track==='high').map(e=>e.velocity),[40,20,70,40]);
  const changed=parse('high = bd("x*4").velocity(70,40,20)\nlow = bd([1 1][][][], [][][][]).velocity(90,30).swing(60)');
  assert.deepEqual(passageHits(changed,2).filter(e=>e.track==='low').map(e=>e.velocity),[90,30]);
});

test('track identifiers are bounded, passage-local, case-sensitive and not executable variables', () => {
  assert.throws(()=>parse('lead = keys([C3])\nlead = bass([C2])'),/Track name "lead" is defined twice/);
  assert.throws(()=>parse(`${'a'.repeat(49)} = keys([])`),/too long/);
  for(const row of ['bad-name = keys([])','1name = keys([])','two names = keys([])','a = b','a = keys([]) + keys([])']) assert.throws(()=>parse(row));
  assert.throws(()=>parse(Array.from({length:65},(_,i)=>`t${i} = keys([])`).join('\n')),/64 instrument rows/);
  const source=song('lead = keys([C3])')+'\npassage"B"{\nlead = keys([D3])\nLead = keys([E3])\n}';
  assert.equal(parsePassage(source,'B').trackBars.length,2);
  const safe=parse('__proto__ = keys([C3])\nconstructor = keys([D3])\nkeys = keys([E3])\nkeys([F3])');
  assert.equal(scoreHits(safe.bars[0]).length,4);assert.equal({}.polluted,undefined);
  assert.equal(trackId({track:'keys',part:'keys'}),'@keys');
});

test('named source scanning keeps prefixes, multiline offsets and scoped row editing', () => {
  const source=song('  drums_1  = hh(\n    "x*8"\n  ).swing(60) // keep\n  time = keys([C3])')+'\npassage"B"{\n  drums_1 = hh([][][][])\n}';
  const rows=drumRows(source);assert.equal(rows.length,3);assert.notEqual(rows[0].key,rows[2].key);
  for(const row of rows) assert.equal(source.slice(row.start,row.start+row.text.length),row.text);
  const changed=toggleRowStep(source,rows[0].key,0,0);
  assert.match(changed,/drums_1  = hh\(\[01\]/);assert.ok(changed.endsWith('  drums_1 = hh([][][][])\n}'));
  assert.match(changed,/swing\(60\) \/\/ keep/);
  assert.equal(drumRows(setRowSoundbank(source,rows[0].key,'909'))[0].track,'drums_1');
  assert.equal(parsePassage(namedSource('tempo 120\ntime = keys([C3])'),'Passage 1').trackBars[0].track,'time');
});

test('named rows support empty instrument completion, scale/effect search and targeted slider edits', () => {
  const input=song('chords = ke','6/8');const at=input.indexOf('ke\n')+2;
  const completion=instrumentCompletion(input,at);assert.ok(completion);
  const filled=completeInstrument(input,completion,'keys').source;
  assert.match(filled,/chords = keys\(\[\]\[\]\[\]\[\]\[\]\[\]\)/);
  const source=song('chords = keys([1&3&5]).scale("C3 mi")\nmelody = keys([C4]).effects("reverb",10)');
  const ctx=scaleCompletion(source,source.indexOf('C3 mi')+5);
  const completed=completeScale(source,ctx,'C3 minor').source;assert.equal(diagnoseCode(completed,'A'),null);
  const row=drumRows(completed)[1];const altered=setRowEffect(completed,row.key,0,{id:'reverb',mix:35,decay:2});
  assert.equal(drumRows(altered)[0].text,drumRows(completed)[0].text);
  assert.equal(drumRows(altered)[1].text,'melody = keys([C4]).effects("reverb",35)');
  assert.deepEqual(rowEffects(drumRows(altered)[1]),[{id:'reverb',mix:35,decay:2}]);
  const duplicate=song('chords = keys([C3])\nchords = keys([D3])');const issue=diagnoseCode(duplicate,'A');
  assert.equal(issue.from,duplicate.lastIndexOf('chords'));assert.equal(duplicate.slice(issue.from,issue.to),'chords');
});

test('named tracks survive projects and song boundaries without sharing definitions', () => {
  const source=song('lead = keys([C3], [D3])')+'\npassage"B"{\nlead = keys([E3]).timbre("organ")\n}\nsong{\n"A" 4\n"B" 4\n}';
  const project=createProject('Layers',source,'B');assert.equal(parseProject(serializeProject(project)).code,source);
  const arrangement=prepareSong(source);const frame=songFrame(arrangement,4);
  assert.equal(frame.bar,1);assert.deepEqual(passageHits(frame.entry.score,0)[0].notes,[52]);
  assert.equal(frame.entry.score.bars[0].timbres['@lead'],'organ');
  const updated=prepareSong(source.replace('C3','F3'));assert.deepEqual(passageHits(songFrame(updated,2).entry.score,2)[0].notes,[53]);
});

test('audio mixer gives layered keys separate voices and separate effect/gain routes', () => {
  const context=fakeAudio(), sources=new Set(), master={};const mixer=createTrackMixer(context,master,sources);
  const bar=parse('chords = keys([C3]).timbre("organ").volume(-12).effects("reverb",20)\nmelody = keys([C4][D4]).timbre("sine").volume(-6).effects("filter",1000)').bars[0];
  mixer.prepare(bar,1);const events=scoreHits(bar);
  mixer.schedule(events[0],bar,1,.5);const chordSources=[...sources], stops=chordSources.map(s=>s.stopTime);
  mixer.schedule(events[1],bar,1,.5);mixer.schedule(events[2],bar,2,.5);
  assert.deepEqual(chordSources.map(s=>s.stopTime),stops,'melody must not truncate sustained chord');
  assert.ok(context.nodes.some(n=>n.kind==='convolver'));assert.ok(context.nodes.some(n=>n.kind==='filter'&&n.frequency.value===1000));
  const gainTargets=context.nodes.flatMap(n=>n.gain.targets.map(e=>e[0]));
  assert.ok(gainTargets.includes(decibelsToGain(-12)));assert.ok(gainTargets.includes(decibelsToGain(-6)));
  mixer.clear();for(const source of [...sources]) {source.stop(3);source.onended();}
  assert.ok(context.nodes.every(n=>n.disconnected));assert.equal(sources.size,0);
});

test('audio routes reuse unchanged tracks and retire renamed, removed or replaced instruments safely', () => {
  const context=fakeAudio(), sources=new Set(), mixer=createTrackMixer(context,{},sources);
  const first=parse('lead = keys([C3]).effects("delay",20,"1/8",30)').bars[0];
  mixer.prepare(first,1);const graphSize=context.nodes.length;mixer.prepare(first,3);assert.equal(context.nodes.length,graphSize);
  mixer.schedule(scoreHits(first)[0],first,3,.5);const old=[...sources];
  const replacement=parse('lead = bass([C2])').bars[0];mixer.prepare(replacement,4);
  assert.ok(old.every(s=>s.stopTime<=4.1));mixer.schedule(scoreHits(replacement)[0],replacement,4,.5);
  const empty=parse('').bars[0];mixer.prepare(empty,5);mixer.collect(38);mixer.clear();
  for(const source of [...sources]) source.onended();
  assert.ok(context.nodes.every(n=>n.disconnected));
});

test('repeated track renaming bounds retired routes and Stop clears all graph connections', () => {
  const context=fakeAudio(), mixer=createTrackMixer(context,{},new Set());
  for(let index=0;index<70;index++) mixer.prepare(parse(`track${index} = keys([])`).bars[0],1+index*.01);
  assert.ok(context.nodes.some(node=>node.disconnected),'oldest retired graphs must be collected even before 32 seconds');
  mixer.clear();assert.ok(context.nodes.every(node=>node.disconnected));
  const score=parse('keys([C3])\nbd([1][][][])').bars[0];
  mixer.prepare(score,3);assert.ok(context.nodes.some(node=>!node.disconnected),'Play after Stop creates fresh routes');
  mixer.clear();assert.ok(context.nodes.every(node=>node.disconnected));
});

test('scale roots include explicit octaves, accidentals, case-insensitive modes and MIDI limits', () => {
  for (let octave = -1; octave <= 9; octave++) assert.equal(parseScale(`c${octave} MAJOR`).root, (octave + 1) * 12);
  assert.equal(parseScale('bb2 minor').root, 46);
  assert.equal(parseScale('F#3 lydian').root, 54);
  for (const value of ['C major', 'C3', 'C3 harmonic', 'C-2 minor', 'G#9 major', 'C999 major', 'C3 major extra']) assert.throws(() => parseScale(value));
});

test('all scale modes and aliases map degrees to their exact intervals', () => {
  const modes = {
    major: [0,2,4,5,7,9,11], ionian: [0,2,4,5,7,9,11],
    minor: [0,2,3,5,7,8,10], aeolian: [0,2,3,5,7,8,10],
    dorian: [0,2,3,5,7,9,10], phrygian: [0,1,3,5,7,8,10],
    lydian: [0,2,4,6,7,9,11], mixolydian: [0,2,4,5,7,9,10],
    locrian: [0,1,3,5,6,8,10], chromatic: [0,2,4,5,7,9,11],
  };
  for (const [mode, intervals] of Object.entries(modes)) {
    const source = `synth([${Array.from({length:intervals.length + 1}, (_,i)=>i+1).join(' ')}]).scale("D3 ${mode}")`;
    assert.deepEqual(parse(source).bars[0].noteEvents.flatMap(event=>event.notes), [...intervals,12].map(n=>50+n), mode);
  }
  assert.equal(degreePitch('15',parseScale('C1 major')),48);
  assert.equal(degreePitch('15',parseScale('C1 chromatic')),48);
});

test('degrees share existing chord, rest, duration and swing semantics without changing explicit notes', () => {
  const score=parse('keys([1&3&5][0 3*2 5][~][C3&E3&5]).scale("C3 minor")').bars[0];
  assert.deepEqual(score.noteEvents.map(e=>e.notes),[[48,51,55],[51],[55],[48,52,55]]);
  assert.deepEqual(score.noteEvents.map(e=>[e.offset,e.duration]),[[0,1],[.3125,.5],[.4375,.25],[.75,1]]);
  for(const meter of ['3/4','6/8','7/8']) {
    const degrees=parse('bass([1 3][5 8]).scale("C2 major").swing(60).velocity(90,45)',meter);
    const notes=parse('bass([C2 E2][G2 C3]).swing(60).velocity(90,45)',meter);
    assert.deepEqual(passageHits(degrees,5),passageHits(notes,5));
  }
  assert.deepEqual(parse('keys([0][~][～][]).scale("C3 major")').bars[0].noteEvents,[]);
  assert.deepEqual(parse('keys([1&1&C3]).scale("C3 minor")').bars[0].noteEvents[0].notes,[48]);
});

test('chromatic uses altered seven-note degrees in both directions, never semitone serial numbers', () => {
  const up='1 #1 2 #2 3 4 #4 5 #5 6 #6 7 8';
  const down='8 7 b7 6 b6 5 b5 4 3 b3 2 b2 1';
  assert.deepEqual(parse(`synth([${up}]).scale("C3 chromatic")`).bars[0].noteEvents.flatMap(e=>e.notes),Array.from({length:13},(_,i)=>48+i));
  assert.deepEqual(parse(`synth([${down}]).scale("C3 chromatic")`).bars[0].noteEvents.flatMap(e=>e.notes),Array.from({length:13},(_,i)=>60-i));
  assert.deepEqual(parse('keys([1&b3&5&b7][#1*3 b2]).scale("D3 chromatic")').bars[0].noteEvents.map(e=>e.notes),[[50,53,57,60],[51],[51]]);
  assert.equal(degreePitch('13',parseScale('C3 chromatic')),69); // sixth in the next octave, not the octave root
  assert.deepEqual(parse('keys([b3 B3 Bb3 c3]).scale("C3 chromatic")').bars[0].noteEvents.map(e=>e.notes),[[51],[59],[58],[48]]);
  assert.deepEqual(parse('keys([b3]).scale("C3 minor")').bars[0].noteEvents[0].notes,[59]); // existing lowercase B note outside chromatic
  assert.throws(()=>parse('keys([#3]).scale("C3 minor")'),/Use chromatic/);
  assert.throws(()=>parse('keys([b1]).scale("C-1 chromatic")'),/below C-1/);
  assert.throws(()=>parse('keys([#1]).scale("G9 chromatic")'),/above G9/);
  for(const token of ['#0','b0','##1','#1.5']) assert.throws(()=>parse(`keys([${token}]).scale("C3 chromatic")`));
  const notes=parse('synth([C3 Db3][D3 Eb3]).swing(60)').bars[0];
  const degrees=parse('synth([1 b2][2 b3]).scale("C3 chromatic").swing(60)').bars[0];
  assert.deepEqual(scoreHits(degrees),scoreHits(notes));
});

test('scales are per melodic row, order-independent and never change drum triggers', () => {
  for(const part of NOTE_PARTS) assert.deepEqual(parse(`${part}([1&3&5]).timbre("piano").scale("C2 minor").volume(-9).effects("reverb",20)`).bars[0].noteEvents[0].notes,[36,39,43]);
  const score=parse('keys([1&3&5]).scale("C3 major")\nbass([1][8]).scale("C1 minor")\nbd([1000][][1][])');
  assert.deepEqual(score.bars[0].noteEvents.filter(e=>e.part==='bass').map(e=>e.notes),[[24],[36]]);
  assert.deepEqual(hits(score.bars[0],'bd'),[0,.5]);
  for(const part of PARTS) assert.throws(()=>parse(`${part}([][][][]).scale("C3 major")`),/melodic instruments only/);
  assert.throws(()=>parse('scale "C3 major"\nkeys([1])'),/Cannot read/);
  assert.throws(()=>parsePassage('scale "C3 major"\n'+song('keys([1])'),'A'),/Cannot read/);
});

test('invalid degrees and scales fail before producing a new score, including silent rows', () => {
  for(const token of ['-1','1.5','01','999999999999999999999','0&1']) assert.throws(()=>parse(`keys([${token}]).scale("C3 major")`));
  assert.throws(()=>parse('keys([1])'),/needs a scale/);
  assert.throws(()=>parse('keys([1]).scale("C3 major").scale("D3 minor")'),/defined twice/);
  for(const arg of ['', 'C3 major', '"C major"', '"C3 harmonic"', '"C10 minor"', '"C3 major",2']) assert.throws(()=>parse(`keys([]).scale(${arg})`));
  assert.deepEqual(parse('keys([1]).scale("G9 major")').bars[0].noteEvents[0].notes,[127]);
  assert.throws(()=>parse('keys([2]).scale("G9 major")'),/above G9/);
  assert.throws(()=>parse('keys([1&2&3&4&5&6&7&8&9]).scale("C3 major")'),/8 notes/);
});

test('scale search uses an explicit root octave and completes only the active modifier', () => {
  assert.deepEqual(searchScales('c2 m').map(x=>x.id),['C2 major','C2 minor','C2 mixolydian','C2 chromatic']);
  assert.equal(searchScales('D4 ').length,10);
  assert.deepEqual(searchScales('C'),[]);
  assert.deepEqual(searchScales('C10'),[]);
  const source=song('keys([1&3&5])\n  .scale("c2 mi") // retain\n  .timbre("piano").effects("reverb", 25)');
  const cursor=source.indexOf('c2 mi')+5;
  const completion=scaleCompletion(source,cursor);
  assert.ok(completion);
  const result=completeScale(source,completion,'C2 minor');
  assert.equal(result.source,source.replace('.scale("c2 mi")','.scale("C2 minor")'));
  assert.deepEqual(parsePassage(result.source,'A').bars[0].noteEvents[0].notes,[36,39,43]);
  assert.throws(()=>completeScale(source.replace('1&3&5','1&4&5'),completion,'C2 minor'),/changed/);
  for(const text of ['bd([1][][][]).scale("C2 m")','keys([C3]).timbre("C2 m")','keys([C3]) // .scale("C2 m")']) assert.equal(scaleCompletion(text,text.indexOf('C2 m')+4),null);
  const empty='keys([1]).scale("")';assert.equal(scaleCompletion(empty,empty.indexOf('"')+1),null);
  const draft='keys([1]).scale(c2 mi)';assert.ok(scaleCompletion(draft,draft.indexOf('mi')+2));
});

test('modifier name completion can add a scale to unresolved degrees, with no drum scale option', () => {
  const source=song('keys([1&3&5]).sc');const cursor=source.indexOf('.sc')+3;
  const context=grooveCompletion(source,cursor);assert.deepEqual(context.options,['scale']);
  const completed=completeGroove(source,context,'scale');
  assert.equal(completed.source[completed.cursor],'"');
  assert.equal(completed.source[completed.cursor-1],'"');
  assert.match(parameterHelp(completed.source,completed.cursor).modifier.help,/Root octave/);
  assert.equal(grooveCompletion('bd([][][][]).sc',15),null);
});

test('existing timbre, effect and groove completions and sliders work with scale degrees', () => {
  const timbre=song('keys([1&3&5]).scale("C3 minor").timbre(p)');
  const bank=soundbankCompletion(timbre,timbre.indexOf('timbre(p')+8);assert.ok(bank);
  assert.match(completeSoundbank(timbre,bank,'piano').source,/scale\("C3 minor"\)/);
  const effect=song('keys([1&3&5]).effects(r).scale("C3 minor")');
  const fx=effectCompletion(effect,effect.indexOf('effects(r')+9);assert.ok(fx);
  const complete=completeEffect(effect,fx,'reverb').source;
  const row=drumRows(complete)[0];
  assert.match(setRowEffect(complete,row.key,0,{id:'reverb',mix:40,decay:2}),/scale\("C3 minor"\)/);
  const groove=song('keys([1]).scale("C3 minor").v');
  assert.deepEqual(grooveCompletion(groove,groove.indexOf('.v')+2).options,['velocity']);
});

test('scale diagnostics locate the wrong argument or degree and stay isolated to selected passages', () => {
  const wrong=song('keys([1]).scale("C3 mystery")'); const issue=diagnoseCode(wrong,'A');
  assert.equal(wrong.slice(issue.from,issue.to),'.scale("C3 mystery")');
  const degree=song('keys([2]).scale("G9 major")');const error=diagnoseCode(degree,'A');assert.equal(degree.slice(error.from,error.to),'2');
  const missing=song('keys([3])');const missingError=diagnoseCode(missing,'A');assert.equal(missing.slice(missingError.from,missingError.to),'3');
  const valid=song('keys([1]).scale("C3 major")')+'\npassage"Draft"{\nkeys([1]).scale("invalid")\n}';
  assert.equal(diagnoseCode(valid,'A'),null);
});

test('scale scores work in multi-bar loops, Song reevaluation and project round trips', () => {
  const source=song('keys([1&3&5], [8]).scale("C3 major")')+'\nsong{\n"A" 8\n}';
  const score=parsePassage(source,'A');assert.equal(score.writtenBars,2);
  const changed=source.replace('C3 major','C3 minor');
  const frame=songFrame(prepareSong(changed),5);assert.equal(frame.bar,6);assert.equal(frame.songBar,6);
  assert.deepEqual(passageHits(parsePassage(changed,'A'),4)[0].notes,[48,51,55]);
  const project=createProject('Scale study',source,'A');
  assert.equal(parseProject(serializeProject(project)).code,source);
  assert.deepEqual(passageHits(score,0)[0].notes,[48,52,55]);
});

test('every Manual example is a complete playable project, including both passages and the Song order', () => {
  const examples = MANUAL_LESSONS.filter((lesson) => lesson.code);
  assert.equal(examples.length, 14);
  for (const lesson of examples) {
    assert.deepEqual(scanCode(lesson.code).issues, [], lesson.id);
    for (const passage of readPassages(lesson.code).passages) {
      assert.equal(diagnoseCode(lesson.code, passage.name), null, lesson.id);
      assert.ok(parsePassage(lesson.code, passage.name).bars.length > 0);
    }
    if (readArrangement(lesson.code).entries.length) assert.equal(prepareSong(lesson.code).totalBars, 16);
  }
});

test('Manual listening instructions agree with actual silence, hit timing and note duration', () => {
  const example = (id) => MANUAL_LESSONS.find((lesson) => lesson.id === id).code;
  const welcome = parsePassage(example('welcome'), 'Passage 1');
  assert.deepEqual(passageHits(welcome, 0), []);
  assert.deepEqual(hits(parsePassage(example('first-sound'), 'Verse').bars[0], 'bd'), [0]);
  const drums = parsePassage(example('drums'), 'Verse').bars[0];
  assert.deepEqual(hits(drums, 'bd'), [0, .5]);
  assert.deepEqual(hits(drums, 'sd'), [.25, .75]);
  assert.deepEqual(hits(drums, 'hh'), [0, .25, .5, .75]);
  const meter = parsePassage(example('meter'), 'Verse');
  assert.equal(meter.bars[0].beats, 6);
  assert.equal(meter.bars[0].unit, 8);
  assert.equal(passageHits(meter, 0).filter((hit) => hit.part === 'bd').length, 2);
  assert.equal(passageHits(meter, 1).filter((hit) => hit.part === 'bd').length, 3);
  const notes = scoreHits(parsePassage(example('notes'), 'Verse').bars[0]);
  assert.deepEqual(notes.filter((hit) => hit.part === 'keys').map((hit) => hit.duration), [4]);
  assert.deepEqual(notes.filter((hit) => hit.part === 'bass').map((hit) => hit.duration), [2, 2]);
  assert.deepEqual(notes.filter((hit) => hit.part === 'synth').map((hit) => hit.offset), [0, 1/12, 1/6, .75, .9375]);
  const computation = parsePassage(example('computation'), 'Verse');
  assert.equal(computation.bars[0].tempo,120);
  assert.deepEqual(hits(computation.bars[0],'bd'),[0,.5]);
  assert.deepEqual(strengths(computation,0,'hh'),[80,40,80,40]);
  assert.deepEqual(computation.bars[0].noteEvents.map(event=>[event.notes,event.duration]),[[[52],2],[[53],2]]);
});

test('syntax spans preserve every source character and ignore quoted/commented brackets', () => {
  const source = 'passage"🎹 [Verse]"{\n  keys([C3&E3&G3][~]).effects("reverb", 25) // ] ) }\n}';
  const scan = scanCode(source);
  assert.equal(scan.tokens.map((token) => source.slice(token.from, token.to)).join(''), source);
  assert.deepEqual(scan.issues, []);
  assert.equal(scan.pairs.length, 5);
  assert.equal(scan.tokens.filter((token) => token.kind === 'note').length, 3);
  const beat = source.indexOf('[C3');
  assert.deepEqual(activeBrackets(scan, beat + 3), [beat, source.indexOf(']', beat)]);
  assert.deepEqual(activeBrackets(scan, -1), []);
  assert.match(scanCode('bd([1)').issues[0].message, /Add \] before/);
  assert.match(scanCode('keys([C3]').issues[0].message, /Add \)/);
});

test('instrument completion uses passage meter and inserts only silence at the caret', () => {
  for (const meter of ['3/4', '6/8', '7/8', '16/16']) {
    const source = `time 4/4\npassage"A"{\ntime ${meter}\n  bd // keep me\n}\npassage"B"{\ntime 2/4\n}`;
    const cursor = source.indexOf('bd') + 2;
    const context = instrumentCompletion(source, cursor);
    assert.equal(context.beats, Number(meter.split('/')[0]));
    const result = completeInstrument(source, context, 'bd');
    assert.ok(result.source.includes(`  bd(${'[]'.repeat(context.beats)}) // keep me`));
    assert.equal(result.source[result.cursor - 1], '[');
    assert.equal(result.source[result.cursor], ']');
    assert.deepEqual(passageHits(parsePassage(result.source, 'A'), 0), []);
    assert.throws(() => completeInstrument(source.replace(meter, '5/4'), context, 'bd'), /changed/);
  }
  assert.deepEqual(instrumentCompletion(song('  p'), song('  p').indexOf('  p') + 3).options, ['piano', 'pad', 'pluck']);
});

test('instrument suggestions stay out of notes, comments, song orders, strings and existing rows', () => {
  for (const [source, cursor] of [
    ['// bd', 5], ['passage"bd"{\n}', 10], ['bd([][][][])', 2],
    ['song{\nbd\n}', 8], ['passage"A"{\nkeys([\nbd\n])\n}', 23],
    ['time 5/3\nbd', 11], ['time 0/4\nbd', 11], ['time 6/\nbd', 10],
  ]) assert.equal(instrumentCompletion(source, cursor), null, source);
  const insideNote = 'passage"A"{\nkeys([\n  bd\n])\n}';
  assert.equal(instrumentCompletion(insideNote, insideNote.indexOf('  bd') + 4), null);
});

test('effect and volume hints show units only inside real arguments', () => {
  for (const [modifier, expected] of [
    ['.effects("reverb", 25, 2)', '0.1–8'], ['.effects("delay", 20, "1/8", 35)', '0–80%'],
    ['.effects("filter", 1800)', '20000 Hz'], ['.volume(-6)', '0 dB'], ['.velocity(90)', '1–127'],
  ]) {
    const source = song(`bd([][][][])${modifier}`);
    const end = source.lastIndexOf(')');
    assert.ok(parameterHelp(source, end).modifier.help.includes(expected));
    assert.equal(parameterHelp(source, end + 1), null);
  }
  assert.equal(parameterHelp(song('bd([][][][]) // .effects("filter", 1800)'), song('bd([][][][]) // .effects("filter", 1800)').lastIndexOf(')')), null);
});

test('diagnostics use exact source offsets for missing brackets, notes, groove and effects', () => {
  for (const [body, marked, message] of [
    ['bd([1[][][])', '[', 'Add ]'],
    ['keys([H3])', 'H3', 'Unknown note'],
    ['bd([][][][])\n  .velocity(140)', '.velocity(140)', '1 to 127'],
    ['bd([][][][]).swing(90)', '.swing(90)', '50 and 75'],
    ['bd([][][][]).effects("reverb", 125)', '.effects("reverb", 125)', '0–100'],
    ['bd([][][][]).volume(7)', '.volume(7)', '-60 and +6'],
  ]) {
    const source = song(body);
    const issue = diagnoseCode(source, 'A');
    assert.ok(issue, body);
    assert.equal(source.slice(issue.from, issue.to), marked);
    assert.ok(issue.message.includes(message), issue.message);
  }
});

test('diagnostics respect passage isolation, valid arrangements and compiler semantics', () => {
  const source = 'tempo 120\ntime 4/4\npassage"A"{\nbd([1][][][])\n}\npassage"B"{\nbd([][][][]).velocity(200)\n}\nsong{\n"A" 4\n}';
  assert.equal(diagnoseCode(source, 'A'), null);
  assert.equal(source.slice(diagnoseCode(source, 'B').from, diagnoseCode(source, 'B').to), '.velocity(200)');
  const tempo = source.replace('120', '300');
  assert.equal(tempo.slice(diagnoseCode(tempo, 'A').from, diagnoseCode(tempo, 'A').to), 'tempo 300');
  for (const body of ['bd([1][][][]).velocity(90, 45).swing(60)', 'keys([C3maj D3min]).effects("delay", 20)', 'hh("x*8")', 'ins.drums']) assert.equal(diagnoseCode(song(body), 'A'), null);
  const duplicate = song('bd([][][][])\nbd([][][][])');
  const issue = diagnoseCode(duplicate, 'A');
  assert.equal(issue.from, duplicate.lastIndexOf('bd'));
  assert.match(issue.message, /defined twice/);
});

test('shared control errors never blame an innocent instrument or an earlier valid control', () => {
  for (const control of ['tempo 300', 'time 0/4', 'kit "missing-kit"']) {
    const source = `tempo 120\ntime 4/4\nkit "studio"\npassage"A"{\n${control}\nbd([][][][])\n}`;
    const issue = diagnoseCode(source, 'A');
    assert.equal(source.slice(issue.from, issue.to), control);
  }
  const unfinishedOther = song('bd([][][][])') + '\npassage"B"{\n  keys([C3';
  assert.equal(diagnoseCode(unfinishedOther, 'A'), null);
});

test('omitted groove modifiers and explicit straight/full strength keep every original event', () => {
  for (const body of ['bd([10][01][][1 1 1])', 'hh("x*8")', 'keys([C3maj D3min][][][])', 'synth([C4*3 G4])']) {
    const original = parse(body);
    const explicit = parse(`${body}.velocity(127).swing(50)`);
    assert.deepEqual(passageHits(explicit, 27), passageHits(original, 27));
    assert.equal(explicit.bars[0].swings[explicit.trackBars[0].part], 50);
  }
  const silent = parse('hh([][][][]).velocity(90, 45).swing(60)\nkeys([]).velocity(80).swing(75)');
  assert.deepEqual(passageHits(silent, 37), []);
});

test('velocity counts actual attacks, skips rests, shares a chord value and continues across loops', () => {
  const score = parse('hh([1 ~ 1][~ 1][][]).velocity(90, 45)\nkeys([C3&E3&G3][][][]).velocity(100, 70)');
  assert.deepEqual(strengths(score, 0, 'hh'), [90, 45, 90]);
  assert.deepEqual(strengths(score, 1, 'hh'), [45, 90, 45]);
  assert.deepEqual(strengths(score, 1001, 'hh'), [45, 90, 45]);
  assert.deepEqual(strengths(score, 0, 'keys'), [100]);
  assert.deepEqual(strengths(score, 1, 'keys'), [70]);
  assert.deepEqual(passageHits(score, 0).find((hit) => hit.part === 'keys').notes, [48, 52, 55]);
  const changed = parse('hh([1 ~ 1][~ 1][][]).velocity(110, 60, 30, 10)');
  assert.deepEqual(strengths(changed, 3, 'hh'), [60, 30, 10]);
  assert.deepEqual(strengths(changed, 0, 'hh'), [110, 60, 30]);
});

test('velocity phase respects independently looping silent and sounding written bars', () => {
  const score = parse('bd([1][][][], [1 1][][][], [][][][]).velocity(100, 70, 40, 10)\nsd([1][][][], [][][][], [][][][], [][][][]).velocity(80, 60, 20)');
  assert.equal(score.bars.length, 12);
  assert.deepEqual(strengths(score, 0, 'bd'), [100]);
  assert.deepEqual(strengths(score, 1, 'bd'), [70, 40]);
  assert.deepEqual(strengths(score, 2, 'bd'), []);
  assert.deepEqual(strengths(score, 3, 'bd'), [10]);
  assert.deepEqual(strengths(score, 12, 'bd'), [100]);
  assert.deepEqual(strengths(score, 12, 'sd'), [80]);
  assert.deepEqual(strengths(score, 16, 'sd'), [60]);
  assert.throws(() => passageHits(score, -1), /nonnegative/);
  assert.throws(() => passageHits(score, .5), /whole/);
});

test('swing moves straight subdivisions within each beat without moving bar or beat boundaries', () => {
  const events = scoreHits(parse('hh([1111][11][1][01]).swing(60)').bars[0]);
  const expected = [0, .3, .6, .8, 1, 1.6, 2, 3.6].map((beat) => beat / 4);
  events.forEach((event, index) => close(event.offset, expected[index]));
  assert.equal(events.length, expected.length);
  assert.deepEqual(hits(parse('bd([1][1][1][1]).swing(75)').bars[0]), [0, .25, .5, .75]);
  close(hits(parse('hh([01][][]).swing(60)', '3/4').bars[0])[0], .6 / 3);
  close(hits(parse('hh([01][][][][][]).swing(60)', '6/8').bars[0])[0], .6 / 6);
  const quote = parse('hh("x*8").swing(60)');
  const brackets = parse('hh([11][11][11][11]).swing(60)');
  assert.deepEqual(scoreHits(quote.bars[0]), scoreHits(brackets.bars[0]));
});

test('swing leaves triplets, irregular grids, rests and time weights as written', () => {
  for (const body of ['hh([111][111111][][101])', 'hh("x*12")', 'keys([C4 D4 E4][][][])', 'keys([C4 D4 E4])', 'keys([C4*3 G4])', 'keys([C4*2 D4*2][][][])', 'keys([C4 ~ D4][][][])']) {
    assert.deepEqual(scoreHits(parse(`${body}.swing(60)`).bars[0]), scoreHits(parse(body).bars[0]));
  }
});

test('melodic swing warps both gate boundaries and counts a swung chord as one hit', () => {
  const score = parse('keys([C3maj D3min][][][]).swing(60).velocity(100, 70)');
  const events = passageHits(score, 0);
  assert.equal(events.length, 2);
  close(events[0].offset, 0); close(events[0].duration, .6);
  close(events[1].offset, .6 / 4); close(events[1].duration, .4);
  assert.deepEqual(events.map((event) => event.velocity), [100, 70]);
  assert.deepEqual(events[1].notes, [50, 53, 57]);
  const long = scoreHits(parse('pad([C3maj]).swing(75)').bars[0])[0];
  assert.equal(long.duration, 4);
  const whole = scoreHits(parse('keys([C4 D4 E4 F4 G4 A4 B4 C5]).swing(60)').bars[0]);
  whole.forEach((event, index) => close(event.duration, index % 2 ? .4 : .6));
});

test('groove modifiers support every instrument and order without replacing volume, sound or effects', () => {
  for (const part of INSTRUMENTS) {
    const pattern = PARTS.includes(part) ? '[1 1][][][]' : '[C4 D4][][][]';
    const score = parse(`${part}(${pattern}).swing(62.5).effects("reverb", 20).volume(-6).velocity(100, 40)`);
    assert.deepEqual(score.bars[0].velocities[part], [100, 40]);
    assert.equal(score.bars[0].swings[part], 62.5);
    assert.equal(score.bars[0].volumes[part], -6);
    assert.equal(score.bars[0].effects[part][0].mix, 20);
    assert.deepEqual(strengths(score, 0, part), [100, 40]);
  }
});

test('invalid, empty, duplicated and unbounded groove parameters are rejected before playback', () => {
  for (const modifier of ['.velocity()', '.velocity(0)', '.velocity(128)', '.velocity(-1)', '.velocity(90.5)', '.velocity(90,)', '.velocity("90")', '.velocity(90).velocity(45)', `.velocity(${Array(65).fill(80).join(',')})`, '.swing()', '.swing(49)', '.swing(76)', '.swing("60")', '.swing(60).swing(60)', '.swing(Infinity)', '.swing(60e1)']) {
    assert.throws(() => parse(`bd([1][][][])${modifier}`), /velocity|swing|MIDI/);
  }
  assert.throws(() => parse('hh("x*8").velocity(90)\nhh("x*8").velocity(45)'), /different groove/);
  assert.throws(() => parse('hh("x*8").swing(60)\nhh("x*8").swing(65)'), /different groove/);
});

test('separate modifier lines and comments belong to the original row and retain source offsets', () => {
  const code = song('  hh([1 1][1 1][1 1][1 1]) // 🎵 groove\n\n  // quieter offbeat\n  .velocity(90, 45)\n  .swing(60)\n  .timbre("lofi")\n  sd([][1][][1])');
  const rows = drumRows(code);
  assert.equal(rows.length, 2);
  assert.ok(rows[0].text.includes('// quieter offbeat'));
  assert.ok(rows[0].text.endsWith('.timbre("lofi")'));
  assert.equal(code.slice(rows[1].start, rows[1].start + rows[1].text.length), rows[1].text);
  assert.deepEqual(rowGroove(rows[0]), { velocities: [90, 45], swing: 60 });
  assert.equal(parsePassage(code, 'A').bars[0].timbres.hh, 'lofi');
  const unfinished = song('hh([1][][][])\n .velocity(90,\nsd([][1][][1])');
  assert.equal(drumRows(unfinished).length, 2);
  assert.throws(() => parsePassage(unfinished, 'A'), /MIDI/);
});

test('inline groove search is cursor-aware, avoids duplicates and only inserts a chosen modifier', () => {
  const code = song('hh([1 1][][][]).volume(-6)\n .v // keep 🎹\nsd([][1][][1])');
  const cursor = code.indexOf('.v //') + 2;
  const context = grooveCompletion(code, cursor);
  assert.deepEqual(context.options, ['velocity']);
  const next = completeGroove(code, context, 'velocity');
  assert.equal(next.source, code.replace('.v //', '.velocity(90, 45) //'));
  assert.equal(grooveParameterHint(next.source, next.cursor).modifier.id, 'velocity');
  assert.deepEqual(strengths(parsePassage(next.source, 'A'), 0, 'hh'), [90, 45]);
  assert.throws(() => completeGroove(code.replace('[1 1]', '[1]'), context, 'velocity'), /changed/);
  for (const suffix of ['.', '.velocity(90).v', '.timbre("s")', '.swing(60).s']) {
    const source = song(`bd([][][][])${suffix}`);
    assert.equal(grooveCompletion(source, source.indexOf(suffix) + suffix.length), null);
  }
  const swing = song('bd([][][][]).s');
  assert.deepEqual(grooveCompletion(swing, swing.indexOf('.s') + 2).options, ['swing']);
  assert.deepEqual(hits(parsePassage(completeGroove(swing, grooveCompletion(swing, swing.indexOf('.s') + 2), 'swing').source, 'A').bars[0]), []);
});

test('parameter hints explain empty and partial arguments without rewriting or leaking into comments', () => {
  for (const suffix of ['.velocity(', '.velocity()', '.velocity(90, ', '.swing(', '.swing(60)']) {
    const code = song(`hh([][][][])${suffix}`);
    const cursor = code.indexOf(suffix) + suffix.length - (suffix.endsWith(')') ? 1 : 0);
    const hint = grooveParameterHint(code, cursor);
    assert.equal(hint.modifier.id, suffix.startsWith('.velocity') ? 'velocity' : 'swing');
    assert.ok(hint.modifier.help.length > 20);
  }
  const comment = song('bd([][][][]) // .velocity(90)');
  assert.equal(grooveParameterHint(comment, comment.indexOf('90') + 1), null);
  const quote = song('hh("x ~ x ~")');
  assert.equal(grooveParameterHint(quote, quote.indexOf('~') + 1), null);
});

test('sound/effect completions, sliders and step edits preserve groove modifiers exactly', () => {
  const code = song('hh([1 1][][][]).velocity(90, 45).swing(60).effects("reverb", 25).timbre("s") // keep');
  const bank = soundbankCompletion(code, code.indexOf('"s"') + 2);
  const next = completeSoundbank(code, bank, 'studio').source;
  const row = drumRows(next)[0];
  const edited = setRowEffect(next, row.key, 0, { id: 'reverb', mix: 40, decay: 2 });
  assert.ok(edited.includes('.velocity(90, 45).swing(60)'));
  const finer = resizeRowSteps(edited, row.key, 4);
  assert.deepEqual(scoreHits(parsePassage(finer, 'A').bars[0]), scoreHits(parsePassage(edited, 'A').bars[0]));
  assert.deepEqual(rowGroove(drumRows(toggleRowStep(finer, row.key, 2, 0))[0]), { velocities: [90, 45], swing: 60 });
  assert.throws(() => resizeRowSteps(edited, row.key, 6), /swung hit times/);
  const triplet = song('hh([000100][][][]).swing(60)');
  assert.throws(() => resizeRowSteps(triplet, drumRows(triplet)[0].key, 2), /swung hit times/);
  const effectDraft = next.replace('"reverb"', '"r"');
  const context = effectCompletion(effectDraft, effectDraft.indexOf('"r"') + 2);
  assert.ok(completeEffect(effectDraft, context, 'reverb').source.includes('.velocity(90, 45).swing(60)'));
});

test('velocity scales drum and chord envelopes before shared volume and effects without changing gate times', () => {
  for (const pitched of [false, true]) {
    const full = fakeAudio(); const quiet = fakeAudio();
    const run = (context, scale) => pitched
      ? schedulePitchedSound(context, {}, [48, 52, 55], 'piano', 1, .5, new Set(), undefined, scale)
      : scheduleDrumSound(context, {}, 'sd', 'studio', 1, new Set(), scale);
    run(full, 1); run(quiet, 45 / 127);
    const fullEnvelopes = full.nodes.filter((node) => node.kind === 'gain' && node.gain.events.length);
    const quietEnvelopes = quiet.nodes.filter((node) => node.kind === 'gain' && node.gain.events.length);
    fullEnvelopes.forEach((node, index) => node.gain.events.forEach(([level, time], point) => {
      close(quietEnvelopes[index].gain.events[point][0], level * 45 / 127);
      assert.equal(quietEnvelopes[index].gain.events[point][1], time);
    }));
    assert.deepEqual(full.nodes.filter((node) => node.startTime !== undefined).map((node) => [node.startTime, node.stopTime]), quiet.nodes.filter((node) => node.startTime !== undefined).map((node) => [node.startTime, node.stopTime]));
    for (const invalid of [0, -1, 1.1, NaN]) assert.throws(() => run(fakeAudio(), invalid), /strength/);
  }
});

test('quoted step conversion in odd meter cannot accidentally apply Swing to old offbeats', () => {
  const code = song('hh("~ x").swing(60)', '3/4');
  const row = drumRows(code)[0];
  assert.deepEqual(hits(parsePassage(code, 'A').bars[0]), [.5]);
  assert.throws(() => toggleRowStep(code, row.key, 0, 0), /swung hit times/);
  assert.throws(() => resizeRowSteps(code, row.key, 4), /swung hit times/);
  const triplet = resizeRowSteps(code, row.key, 6);
  assert.deepEqual(hits(parsePassage(triplet, 'A').bars[0]), [.5]);
  const removed = toggleRowStep(code, row.key, 1, 1);
  assert.deepEqual(hits(parsePassage(removed, 'A').bars[0]), []);
});

test('Song sections restart velocity while re-evaluation uses their retained local bar and projects round-trip', () => {
  const code = `song{\n"A" 3\n"A" 2\n}\n${song('hh([1 ~ 1][~ 1][][]).velocity(90, 45).swing(60)')}`;
  const plan = prepareSong(code);
  assert.deepEqual(Array.from({ length: 5 }, (_, elapsed) => {
    const frame = songFrame(plan, elapsed);
    return strengths(frame.entry.score, frame.bar - 1, 'hh');
  }), [[90, 45, 90], [45, 90, 45], [90, 45, 90], [90, 45, 90], [45, 90, 45]]);
  const changed = prepareSong(code.replace('90, 45', '100, 70'));
  const frame = songFrame(changed, 1);
  assert.deepEqual(strengths(frame.entry.score, frame.bar - 1, 'hh'), [70, 100, 70]);
  const saved = parseProject(serializeProject(createProject('Groove', code, 'A')));
  assert.equal(saved.code, code);
  assert.deepEqual(passageHits(prepareSong(saved.code).entries[0].score, 1), passageHits(plan.entries[0].score, 1));
});

const arranged = `tempo 240\ntime 4/4
song{
  "Intro" 2
  "Verse" 3
  "Intro" 1
}
passage"Intro"{
  bd([1][][][], [01][][][], [001][][][]).effects("reverb", 25)
}
passage"Verse"{
  time 3/4
  tempo 120
  keys([C3maj]).volume(-9)
}
passage"Unused draft"{
  synth([C4]).timbre("unfinished
}`;

test('song orders count bars, preserve repeated sections and compile only referenced passages', () => {
  const plan = prepareSong(arranged);
  assert.equal(plan.totalBars, 6);
  assert.deepEqual(plan.entries.map(({ name, bars }) => [name, bars]), [['Intro', 2], ['Verse', 3], ['Intro', 1]]);
  assert.equal(plan.entries[0].score.trackBars[0].length, 3);
  assert.equal(plan.entries[1].score.bars[0].beats, 3);
  assert.equal(plan.entries[1].score.bars[0].tempo, 120);
  assert.equal(plan.entries[0].score, plan.entries[2].score);
  assert.equal(plan.source, arranged);
});

test('song positions enter on exact section boundaries, restart repeated passages and finish once', () => {
  const plan = prepareSong(arranged);
  assert.deepEqual(Array.from({ length: 6 }, (_, elapsed) => {
    const frame = songFrame(plan, elapsed);
    return [frame.index, frame.bar, frame.songBar];
  }), [[0, 1, 1], [0, 2, 2], [1, 1, 3], [1, 2, 4], [1, 3, 5], [2, 1, 6]]);
  assert.equal(songFrame(plan, 6), null);
  assert.equal(songFrame(plan, 100), null);
  assert.throws(() => songFrame(plan, -1), /nonnegative/);
  assert.throws(() => songFrame(plan, .5), /whole bar/);
});

test('song re-evaluation keeps elapsed bars when lengths or order change, not a wrapped loop cursor', () => {
  const changed = setArrangement(arranged, [{ name: 'Verse', bars: 1 }, { name: 'Intro', bars: 8 }]);
  const frame = songFrame(prepareSong(changed), 5);
  assert.equal(frame.songBar, 6);
  assert.equal(frame.entry.name, 'Intro');
  assert.equal(frame.bar, 5);
  assert.equal(songFrame(prepareSong(setArrangement(arranged, [{ name: 'Intro', bars: 1 }])), 5), null);
});

test('song validation rejects invalid order shapes, limits, missing passages and unfinished referenced music', () => {
  for (const block of ['song{\n"Intro" 0\n}', 'song{\n"Intro" 257\n}', 'song{\n"Intro" 2.5\n}', 'song{\nIntro 8\n}', 'song{\n"Intro" 2', 'song("Intro", 2)']) {
    assert.ok(readArrangement(`${block}\n${song('bd([][][][])')}`).error);
    assert.throws(() => prepareSong(`${block}\n${song('bd([][][][])')}`));
  }
  assert.throws(() => prepareSong(arranged.replace('"Verse" 3', '"Missing" 3')), /Missing/);
  assert.throws(() => prepareSong(arranged.replace('"Verse" 3', '"Unused draft" 3')), /Unused draft/);
  assert.throws(() => prepareSong(`song{\n}\n${STARTER}`), /Add a song order/);
  assert.throws(() => prepareSong(`song{\n"Intro" 1\n}\n${arranged}`), /one song/);
  assert.ok(readArrangement(`song{\n${Array(129).fill('"Intro" 1').join('\n')}\n}`).error);
  assert.ok(readArrangement(`song{\n${Array(17).fill('"Intro" 256').join('\n')}\n}`).error);
});

test('unfinished or malformed Song drafts are isolated from valid Live passage compilation', () => {
  const broken = arranged.replace('song{\n  "Intro" 2\n  "Verse" 3\n  "Intro" 1\n}', 'song{\n "Intro" nonsense');
  assert.equal(parsePassage(broken, 'Intro').bars.length, 3);
  assert.ok(readArrangement(broken).error);
  assert.throws(() => parsePassage(song('song{\n"A" 8\n}\nbd([][][][])'), 'A'), /Cannot read|inside a passage/);
});

test('Song source controls keep other passages and effects exact, and work with legacy source', () => {
  const next = setArrangement(arranged, [{ name: 'Verse', bars: 8 }, { name: 'Intro', bars: 4 }]);
  assert.equal(next.slice(next.indexOf('passage"Intro"')), arranged.slice(arranged.indexOf('passage"Intro"')));
  assert.deepEqual(readArrangement(next).entries, [{ name: 'Verse', bars: 8 }, { name: 'Intro', bars: 4 }]);
  const legacy = setArrangement('tempo 120\ntime 4/4\nbd([][][][])', [{ name: 'Passage 1', bars: 4 }]);
  assert.equal(prepareSong(legacy).totalBars, 4);
  assert.equal(readPassages(legacy).passages[0].legacy, false);
  assert.equal(hits(parsePassage(legacy, 'Passage 1').bars[0]).length, 0);
  const removed = setArrangement(next, []);
  assert.equal(readArrangement(removed).region, null);
  assert.equal(parsePassage(removed, 'Intro').bars.length, 3);
  assert.throws(() => setArrangement('song{\n"A"', []), /Finish/);
  assert.throws(() => setArrangement(STARTER, [{ name: 'Passage 1', bars: NaN }]), /whole bars/);
  assert.equal(namedSource('song{\n"Passage 1" 2\n}\nbd([][][][])').includes('song{\n"Passage 1" 2\n}'), true);
});

test('renaming a passage changes every matching Song reference without rewriting comments or lengths', () => {
  const source = arranged.replace('  "Intro" 2', '  \'Intro\'   2 // Intro stays in this comment');
  const renamed = renameSongPassage(source, 'Intro', 'Opening');
  assert.ok(renamed.includes("  'Opening'   2 // Intro stays in this comment"));
  assert.deepEqual(readArrangement(renamed).entries.map((entry) => entry.name), ['Opening', 'Verse', 'Opening']);
  assert.equal(renamed.slice(renamed.indexOf('passage"Intro"')), source.slice(source.indexOf('passage"Intro"')));
});

test('Song controls retain handwritten comments even when reordering or removing the last section', () => {
  const source = setArrangement(STARTER, [{ name: 'Passage 1', bars: 4 }]).replace('  "Passage 1" 4', '  // intro idea\n  "Passage 1" 4 // keep this note');
  const changed = setArrangement(source, [{ name: 'Passage 1', bars: 8 }]);
  assert.ok(changed.includes('// intro idea'));
  assert.ok(changed.includes('// keep this note'));
  assert.equal(readArrangement(changed).entries[0].bars, 8);
  const empty = setArrangement(changed, []);
  assert.ok(empty.includes('// keep this note'));
  assert.equal(readArrangement(empty).region, null);
  const emoji = source.replaceAll('Passage 1', '段落 🎹');
  assert.ok(setArrangement(emoji, [{ name: '段落 🎹', bars: 8 }]).includes('// keep this note'));
});

test('Song effect updates change all occurrences of one passage without changing the playhead or order', () => {
  const plan = prepareSong(arranged);
  const score = parsePassage(arranged.replace('"reverb", 25', '"reverb", 60'), 'Intro');
  const changed = updateSongPassage(plan, score);
  assert.equal(changed.entries[0].score, score);
  assert.equal(changed.entries[2].score, score);
  assert.equal(changed.entries[1].score, plan.entries[1].score);
  assert.deepEqual([songFrame(changed, 4).index, songFrame(changed, 4).bar], [1, 3]);
  assert.equal(changed.totalBars, plan.totalBars);
});

test('song order round-trips through .ohcodes and autosave without a file version migration', () => {
  const project = parseProject(serializeProject(createProject('Arranged song', arranged, 'Verse')));
  assert.equal(project.version, 1);
  assert.equal(project.code, arranged);
  assert.equal(prepareSong(project.code).totalBars, 6);
  assert.equal(prepareProject(project).selected, 'Verse');
  const storage = new Map();
  const local = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  saveDraft(local, project, null);
  assert.equal(prepareSong(parseProject(local.getItem(DRAFT_KEY)).code).totalBars, 6);
});

test('the canonical starter is one silent bar, with a no-space passage header', () => {
  const score = parsePassage(STARTER, 'Passage 1');
  assert.equal(score.bars.length, 1);
  assert.equal(score.writtenBars, 1);
  assert.deepEqual(hits(score.bars[0]), []);
  assert.equal(readPassages(STARTER).passages[0].legacy, false);
});

test('rest tokens and ordinary spaces subdivide exactly one beat', () => {
  assert.deepEqual(hits(parse('bd([~ 1][][][])').bars[0]), [1 / 8]);
  assert.deepEqual(hits(parse('bd([1 1 1][][][])').bars[0]), [0, 1 / 12, 1 / 6]);
  assert.deepEqual(hits(parse('bd([～ 1][1 ~ 1][][])').bars[0]), [1 / 8, 1 / 4, (1 + 2 / 3) / 4]);
  assert.deepEqual(hits(parse('bd([  ][][][])').bars[0]), []);
});

test('time signatures determine brackets per bar and the step grid', () => {
  assert.deepEqual(hits(parse('bd([~ 1][][])', '3/4').bars[0]), [1 / 6]);
  const code = song('hh([~ 1][][][][][])', '6/8');
  assert.deepEqual(hits(parsePassage(code, 'A').bars[0]), [1 / 12]);
  assert.equal(stepModel(code, drumRows(code)[0]).unit, 8);
  assert.throws(() => parse('bd([][][][])', '3/4'), /3 beat brackets/);
  assert.throws(() => parse('bd([][][][])', '4/3'), /beat unit/);
});

test('comma-separated tracks independently loop at 1, 2, 3, and 4 bars', () => {
  const score = parse(`bd([1][][][], [01][][][], [001][][][])
sd([1][][][], [01][][][], [001][][][], [0001][][][])
hh([][1][][])
rim([][][1][], [][][][1])`);
  assert.equal(score.bars.length, 12);
  assert.equal(score.writtenBars, 4);
  assert.deepEqual(score.trackBars.map((track) => track.length), [3, 4, 1, 2]);
  for (let index = 0; index < 12; index += 1) {
    assert.deepEqual(hits(score.bars[index], 'bd'), [([0, 1 / 2, 2 / 3][index % 3]) / 4]);
    assert.deepEqual(hits(score.bars[index], 'sd'), [([0, 1 / 2, 2 / 3, 3 / 4][index % 4]) / 4]);
    assert.deepEqual(hits(score.bars[index], 'hh'), [1 / 4]);
    assert.deepEqual(hits(score.bars[index], 'rim'), [index % 2 ? 3 / 4 : 1 / 2]);
  }
});

test('multi-line wrappers and comments preserve bar boundaries', () => {
  const code = song(`  bd(
    [1][][][], // first bar [ignored]
    [~ 1][][][]
  )
  sd([][1][][])`);
  const rows = drumRows(code);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].lineIndex, 4);
  assert.equal(passageBarCount(readPassages(code).passages[0].body), 2);
  assert.deepEqual(hits(parsePassage(code, 'A').bars[1], 'bd'), [1 / 8]);
  assert.equal(stepModel(code, rows[0]).barCount, 2);
});

test('legacy grids, pipe bars, and quoted live rhythms remain playable', () => {
  assert.deepEqual(hits(parse('bd[1000][0100][][] | [][][1][]').bars[1]), [1 / 2]);
  assert.deepEqual(hits(parse('bd("x ~ x ~")').bars[0]), [0, 1 / 2]);
  assert.equal(hits(parse('hh("x*8")').bars[0]).length, 8);
  const score = parse('bd("x ~") | ("~ x")');
  assert.deepEqual(hits(score.bars[0]), [0]);
  assert.deepEqual(hits(score.bars[1]), [1 / 2]);
});

test('five bars, unfinished bars, unknown tokens, and unconnected chains are rejected', () => {
  assert.throws(() => parse(`bd(${Array(5).fill('[][][][]').join(', ')})`), /at most 4 bars/);
  assert.throws(() => parse('bd([][][][],)'), /after the comma/);
  assert.throws(() => parse('bd([2][][][])'), /1 for a hit/);
  assert.throws(() => parse('bd([1,1][][][])'), /1 for a hit/);
  assert.throws(() => parse('bd([][][][]).reverb(0.2)'), /not connected/);
  assert.throws(() => parse('violin([][][][])'), /Unknown instrument/);
  assert.throws(() => parse('bd([][][][]\nsd([][][][])'), /close the instrument/);
  assert.throws(() => parse('bd([][][][])\nbd([][][][])'), /defined twice/);
});

test('invalid controls are not hidden by a later valid declaration', () => {
  assert.throws(() => parse('tempo nope\ntempo 120\nbd([][][][])'), /Write the tempo/);
  assert.throws(() => parse('time nope\ntime 4\/4\nbd([][][][])'), /Write the time/);
  assert.throws(() => parse('tempo 241\nbd([][][][])'), /30 and 240/);
});

test('an unfinished unrelated passage does not block the chosen passage', () => {
  const code = `${song('bd([1][][][])')}\n\npassage"Draft"{\n sd(`;
  assert.deepEqual(hits(parsePassage(code, 'A').bars[0]), [0]);
  assert.throws(() => parsePassage(code, 'Draft'), /closing }/);
});

test('ins.drums expands all eleven built-in parts as silent canonical rows', () => {
  const prepared = preparedPassage(song('ins.drums', '3/4'), 'A');
  assert.equal(drumRows(prepared.source).length, PARTS.length);
  assert.deepEqual(hits(prepared.score.bars[0]), []);
  assert.match(prepared.source, /ft\(\[\]\[\]\[\]\)/);
});

test('opening steps leaves the empty source unchanged; a click edits only its beat', () => {
  const row = drumRows(STARTER)[0];
  assert.deepEqual(stepModel(STARTER, row).groups, ['0000', '0000', '0000', '0000']);
  assert.match(STARTER, /bd\(\[\]\[\]\[\]\[\]\)/);
  assert.equal(toggleRowStep(STARTER, row.key, 1, 2), STARTER.replace('bd([][][][])', 'bd([][0010][][])'));
});

test('step clicks preserve spaces, rests, multi-line formatting, and other passages', () => {
  const code = `${song('  bd(\n    [~ 1][][][],\n    [1  ~][][][]\n  ) // 🔊 [do not edit]')}\n\npassage"B"{\n bd([][][][])\n}`;
  const row = drumRows(code)[0];
  const changed = toggleRowStep(code, row.key, 4, 1);
  assert.equal(changed, code.replace('[1  ~]', '[1  1]'));
  assert.equal(toggleRowStep(code, row.key, 0, 1), code.replace('[~ 1]', '[~ ~]'));
});

test('resizing preserves hit times and rejects incompatible coarser grids', () => {
  const code = song('bd([~ 1][][][], [1 0][][][])');
  const row = drumRows(code)[0];
  const changed = resizeRowSteps(code, row.key, 4);
  assert.deepEqual(parsePassage(changed, 'A').bars.map((bar) => hits(bar)), parsePassage(code, 'A').bars.map((bar) => hits(bar)));
  assert.throws(() => resizeRowSteps(code, row.key, 1), /unchanged/);
  assert.equal(code, song('bd([~ 1][][][], [1 0][][][])'));
});

test('step edits of quoted patterns convert to comma-separated wrapped beat syntax', () => {
  const code = song('bd("x ~") | ("~ x")');
  const changed = toggleRowStep(code, drumRows(code)[0].key, 1, 0);
  assert.match(changed, /bd\(\[1\]\[1\]\[0\]\[0\], \[0\]\[0\]\[1\]\[0\]\)/);
  assert.equal(parsePassage(changed, 'A').writtenBars, 2);
});

test('source offsets remain exact after unicode names and comments', () => {
  const code = `// 🎧\npassage"音乐"{\n bd([~ 1][][][]) // 🎵\n}`;
  assert.equal(toggleRowStep(code, drumRows(code)[0].key, 0, 0), code.replace('[~ 1]', '[1 1]'));
});

test('meter comments do not change step timing or blank subdivisions', () => {
  const code = song('bd([][][][][][])', '6/8').replace('time 6/8', 'time 6/8 // eighth-note beats');
  const model = stepModel(code, drumRows(code)[0]);
  assert.equal(model.beats, 6);
  assert.equal(model.unit, 8);
  assert.deepEqual(model.groups, Array(6).fill('00'));
  assert.equal(parsePassage(code, 'A').bars[0].unit, 8);
});

test('per-instrument soundbanks do not alter rhythm or independent loop lengths', () => {
  const rhythm = 'bd([~ 1][][][], [1][][][], [1 1 1][][][])\nsd([][1][][1], [][1][][1], [][1][][1], [][1][][1])';
  const score = parse(rhythm.replace('[])\nsd', '[]).timbre("808")\nsd') + '.timbre("lofi")');
  const original = parse(rhythm);
  assert.equal(score.bars.length, 12);
  assert.equal(score.writtenBars, 4);
  for (let index = 0; index < 12; index += 1) {
    assert.deepEqual(hits(score.bars[index]), hits(original.bars[index]));
    assert.equal(score.bars[index].timbres.bd, '808');
    assert.equal(score.bars[index].timbres.sd, 'lofi');
    assert.equal(score.bars[index].timbres.hh, 'studio');
  }
});

test('soundbank syntax supports quotes, case, whitespace, and multi-line rhythms', () => {
  const code = song('  bd(\n [1][][][],\n [~ 1][][][]\n ).timbre( \'Lo-Fi\' ) // warm\n sd("x ~").timbre("808")');
  const score = parsePassage(code, 'A');
  assert.equal(score.bars[0].timbres.bd, 'lofi');
  assert.equal(score.bars[0].timbres.sd, '808');
  assert.equal(passageBarCount(readPassages(code).passages[0].body), 2);
  assert.equal(stepModel(code, drumRows(code)[0]).barCount, 2);
});

test('unknown, unfinished, duplicate, or unsupported chains are not silently ignored', () => {
  assert.throws(() => parse('bd([][][][]).timbre("missing")'), /Unknown soundbank/);
  assert.throws(() => parse('bd([][][][]).'), /finish the soundbank/);
  assert.throws(() => parse('bd([][][][]).timbre("studio"'), /finish the soundbank/);
  assert.throws(() => parse('bd([][][][]).timbre("studio").timbre("808")'), /defined twice/);
  assert.throws(() => parse('bd([][][][]).timbre("studio").reverb(0.2)'), /not connected/);
  assert.throws(() => parse('bd("x").timbre("studio")\nbd("~").timbre("808")'), /different soundbanks/);
});

test('selecting a bank writes only the target row and keeps all empty beats silent', () => {
  const code = `${song('  bd([][][][]) // 🎵\n  sd([][][][])')}\npassage"B"{\n  bd([][][][])\n}`;
  const changed = setRowSoundbank(code, drumRows(code)[0].key, '808');
  assert.equal(changed, code.replace('bd([][][][]) //', 'bd([][][][]).timbre("808") //'));
  assert.deepEqual(hits(parsePassage(changed, 'A').bars[0]), []);
  assert.equal(rowSoundbank(drumRows(changed)[0]), '808');
});

test('a bank selection replaces existing chains or a typed dot without duplication', () => {
  const code = song('  bd([~ 1][][][]).timbre(\'studio\') // comment');
  const changed = setRowSoundbank(code, drumRows(code)[0].key, 'lofi');
  assert.equal(changed, code.replace('.timbre(\'studio\')', '.timbre("lofi")'));
  const draft = song('bd([][][][]).');
  assert.equal(setRowSoundbank(draft, drumRows(draft)[0].key, '808'), draft.replace(').', ').timbre("808")'));
  assert.throws(() => setRowSoundbank(code, 'sd:99', '808'), /no longer/);
});

test('sound selection can repair an unknown bank without rewriting rhythm formatting', () => {
  const code = song('bd(\n [1][][][],\n [~ 1][][][]\n).timbre("wrong")');
  const changed = setRowSoundbank(code, drumRows(code)[0].key, 'studio');
  assert.equal(changed, code.replace('"wrong"', '"studio"'));
  assert.equal(parsePassage(changed, 'A').bars[0].timbres.bd, 'studio');
});

test('binary and quoted step editing keep soundbank chains and comments', () => {
  const binary = song('bd([~ 1][][][]).timbre("lofi") // mellow');
  assert.equal(toggleRowStep(binary, drumRows(binary)[0].key, 0, 0), binary.replace('[~ 1]', '[1 1]'));
  assert.match(resizeRowSteps(binary, drumRows(binary)[0].key, 4), /\.timbre\("lofi"\) \/\/ mellow/);
  const quoted = song('bd("x ~").timbre("808") // deep');
  const changed = toggleRowStep(quoted, drumRows(quoted)[0].key, 1, 0);
  assert.match(changed, /bd\(\[1\]\[1\]\[0\]\[0\]\)\.timbre\("808"\) \/\/ deep/);
  assert.equal(parsePassage(changed, 'A').bars[0].timbres.bd, '808');
});

test('legacy kit defaults match displayed banks, with per-row overrides', () => {
  const code = song('kit "lo-fi"\nbd([][][][])\nsd([][][][]).timbre("808")');
  const score = parsePassage(code, 'A');
  assert.equal(score.bars[0].timbres.bd, 'lofi');
  assert.equal(score.bars[0].timbres.sd, '808');
  assert.equal(draftSoundbank(code, drumRows(code)[0]), 'lofi');
  assert.throws(() => parse('kit "unknown"\nbd([][][][])'), /Unknown soundbank/);
});

test('inline soundbank search matches substrings of names, not descriptions', () => {
  assert.deepEqual(searchSoundbanks('s', 'bd').map((bank) => bank.id), ['studio', 'house']);
  assert.deepEqual(searchSoundbanks('DI', 'bd').map((bank) => bank.id), ['studio']);
  assert.deepEqual(searchSoundbanks('fi', 'bd').map((bank) => bank.id), ['lofi']);
  assert.deepEqual(searchSoundbanks('LO-F', 'bd').map((bank) => bank.id), ['lofi']);
  assert.deepEqual(searchSoundbanks('8', 'bd').map((bank) => bank.id), ['808']);
  assert.deepEqual(searchSoundbanks('o', 'bd').map((bank) => bank.id), ['studio', 'lofi', 'house', 'techno', 'boombap']);
  assert.deepEqual(searchSoundbanks('warm', 'bd'), []);
  assert.deepEqual(searchSoundbanks(''), []);
  assert.deepEqual(searchSoundbanks('no-such-bank'), []);
});

test('all drum kits supply distinct, bounded voices for all eleven drum parts', () => {
  for (const part of PARTS) {
    const voices = drumBanks.map((bank) => drumVoices(part, bank.id));
    assert.equal(new Set(voices.map((kit) => JSON.stringify(kit))).size, drumBanks.length);
    for (const layers of voices) {
      assert.ok(layers.length > 0);
      for (const voice of layers) {
        assert.ok(voice.duration > 0 && voice.duration <= 1);
        assert.ok(voice.level > 0 && voice.level <= 1);
      }
    }
  }
});

function fakeAudio() {
  const nodes = [];
  const param = () => ({ value: 0, events: [], targets: [], cancellations: [], setValueAtTime(value, time) { this.events.push([value, time]); }, linearRampToValueAtTime(value, time) { this.events.push([value, time]); }, exponentialRampToValueAtTime(value, time) { this.events.push([value, time]); }, cancelScheduledValues(time) { this.cancellations.push(time); }, setTargetAtTime(value, time, smoothing) { this.targets.push([value, time, smoothing]); } });
  const node = (kind) => {
    const result = { kind, gain: param(), frequency: param(), detune: param(), Q: param(), delayTime: param(), links: [], connect(next) { this.links.push(next); return next; }, disconnect(next) { if (next) this.links = this.links.filter((link) => link !== next); else { this.disconnected = true; this.links = []; } }, start(time) { this.startTime = time; }, stop(time) { this.stopTime = time; } };
    nodes.push(result);
    return result;
  };
  return { nodes, currentTime: 0, sampleRate: 48000, createGain: () => node('gain'), createBuffer: (channels, length, sampleRate) => { const data = Array.from({ length: channels }, () => new Float32Array(length)); return { length, sampleRate, numberOfChannels: channels, getChannelData: (channel) => data[channel] }; }, createBufferSource: () => node('noise'), createOscillator: () => node('tone'), createBiquadFilter: () => node('filter'), createDelay: () => node('delay'), createConvolver: () => node('convolver') };
}

test('the audio renderer schedules every bank/part and releases ended voices', () => {
  for (const bank of drumBanks) for (const part of PARTS) {
    const context = fakeAudio();
    const sources = new Set();
    scheduleDrumSound(context, {}, part, bank.id, 2, sources);
    assert.equal(sources.size, drumVoices(part, bank.id).length);
    for (const source of [...sources]) {
      assert.equal(source.startTime, 2);
      assert.ok(source.stopTime > 2);
      source.onended();
      assert.equal(source.disconnected, true);
    }
    assert.equal(sources.size, 0);
    assert.ok(context.nodes.every((node) => node.disconnected));
  }
});

test('audition voices have separate cancellation ownership from musical playback', () => {
  const context = fakeAudio();
  const live = new Set();
  const preview = new Set();
  scheduleDrumSound(context, {}, 'bd', 'studio', 1, live);
  scheduleDrumSound(context, {}, 'sd', '808', 1, preview, .8);
  for (const source of [...preview]) { source.stop(1.1); source.onended(); }
  assert.equal(preview.size, 0);
  assert.equal(live.size, 1);
  assert.equal([...live][0].stopTime, 1.36);
});

test('completion appears only inside a nonempty timbre argument', () => {
  for (const suffix of ['.', '.timbre(', '.timbre()', '.timbre("")']) {
    const code = song(`bd([][][][])${suffix}`);
    const cursor = suffix.endsWith(')') ? code.indexOf(suffix) + suffix.length - 1 : code.indexOf(suffix) + suffix.length;
    assert.equal(soundbankCompletion(code, cursor), null, suffix);
  }
  for (const suffix of ['.timbre(s)', '.timbre("s")', ".timbre('s')", '.timbre("s', '.timbre(s']) {
    const code = song(`bd([][][][])${suffix}`);
    const context = soundbankCompletion(code, code.indexOf(suffix) + suffix.indexOf('s') + 1);
    assert.equal(context?.query, 's', suffix);
    assert.equal(context?.row.part, 'bd');
  }
});

test('completion is cursor-aware and ignores rhythms, comments, effects, and other lines', () => {
  const code = song('bd([][][][]).timbre("studio") // .timbre(s)\nsd("x ~")');
  assert.equal(soundbankCompletion(code, code.indexOf('studio') + 1)?.query, 's');
  assert.equal(soundbankCompletion(code, code.indexOf('studio') + 6)?.query, 'studio');
  for (const cursor of [code.indexOf('studio') - 1, code.indexOf('studio') + 7, code.indexOf('//') + 14, code.indexOf('x ~') + 1]) {
    assert.equal(soundbankCompletion(code, cursor), null);
  }
  for (const row of ['bd([s].timbre(s)', 'bd("x .timbre(s)")', 'bd([][][][]).reverb(s)', 'bd([][][][]).timbre(s).reverb(1)']) {
    const draft = song(row);
    assert.equal(soundbankCompletion(draft, draft.indexOf('s)') + 1), null, row);
  }
});

test('completion repairs partial syntax without touching rhythm or surrounding source', () => {
  for (const draft of ['.timbre(s)', '.timbre("s")', ".timbre('s')", '.timbre("s', '.timbre(s', '.timbre( S )']) {
    const code = song(`  bd(\n [~ 1][][][],\n [1][][][]\n )${draft}\nsd([][][][]).timbre("808")`);
    const cursor = code.indexOf(draft) + draft.search(/[sS]/) + 1;
    const context = soundbankCompletion(code, cursor);
    assert.ok(context, draft);
    const next = completeSoundbank(code, context, 'studio');
    assert.equal(next.source, code.replace(draft, '.timbre("studio")'));
    assert.equal(next.cursor, next.source.indexOf('.timbre("studio")') + '.timbre("studio")'.length);
    assert.equal(parsePassage(next.source, 'A').bars[0].timbres.sd, '808');
  }
});

test('completion preserves trailing comments and targets the cursor passage', () => {
  const code = song('bd([][][][]).timbre("808")') + '\npassage"B"{\n  bd([1][][][]).timbre(s) // keep me\n}';
  const context = soundbankCompletion(code, code.indexOf('.timbre(s)') + '.timbre(s'.length);
  const next = completeSoundbank(code, context, 'studio');
  assert.equal(next.source, code.replace('.timbre(s)', '.timbre("studio")'));
  assert.equal(parsePassage(next.source, 'A').bars[0].timbres.bd, '808');
  assert.equal(parsePassage(next.source, 'B').bars[0].timbres.bd, 'studio');
  assert.throws(() => completeSoundbank(code.replace('[1]', '[~ 1]'), context, 'studio'), /changed/);
  assert.throws(() => completeSoundbank(code, context, 'missing'), /Unknown soundbank/);
});

test('the library has 8 complete drum kits and 17 distinct playable melodic presets', () => {
  assert.equal(drumBanks.length, 8);
  assert.equal(pitchedBanks.length, 17);
  assert.equal(new Set(SOUNDBANKS.map((bank) => bank.id)).size, SOUNDBANKS.length);
  const sounds = pitchedBanks.map((bank) => pitchedPreset(bank.id));
  assert.equal(new Set(sounds.map((sound) => JSON.stringify(sound))).size, sounds.length);
  for (const sound of sounds) {
    assert.ok(sound.layers.length > 0 && sound.layers.length <= 5);
    assert.ok(sound.attack > 0 && sound.decay > 0 && sound.release > 0 && sound.release <= 1);
    assert.ok(sound.sustain > 0 && sound.sustain <= 1);
    assert.ok(sound.cutoff > 0);
    assert.ok(sound.layers.every((voice) => voice.level > 0 && voice.level <= 1 && voice.harmonic > 0));
  }
});

test('every instrument starts silent and has a compatible default timbre', () => {
  const score = parse(INSTRUMENTS.map((part) => `${part}([][][][])`).join('\n')).bars[0];
  assert.deepEqual(scoreHits(score), []);
  for (const part of INSTRUMENTS) assert.equal(score.timbres[part], defaultSoundbank(part));
  assert.equal(score.timbres.bass, 'sub');
  assert.equal(score.timbres.keys, 'electric-piano');
  assert.equal(score.timbres.pad, 'warm-pad');
  assert.equal(score.timbres.guitar, 'guitar');
});

test('note names support octaves, sharps, flats, lowercase, and named chords', () => {
  assert.deepEqual(notePitches('C4'), [60]);
  assert.deepEqual(notePitches('a4'), [69]);
  assert.deepEqual(notePitches('F#3'), [54]);
  assert.deepEqual(notePitches('Bb3'), [58]);
  assert.deepEqual(notePitches('c'), [60]);
  assert.deepEqual(notePitches('C7'), [96]);
  assert.deepEqual(notePitches('C3maj7'), [48, 52, 55, 59]);
  assert.deepEqual(notePitches('Dm'), [62, 65, 69]);
  assert.deepEqual(notePitches('G3dom7'), [55, 59, 62, 65]);
  assert.deepEqual(notePitches('C4sus2'), [60, 62, 67]);
  assert.deepEqual(notePitches('C-1'), [0]);
  assert.deepEqual(notePitches('G9'), [127]);
  assert.throws(() => notePitches('C10'), /MIDI/);
  assert.throws(() => notePitches('H4'), /Unknown note/);
  assert.throws(() => notePitches('1'), /Unknown note/);
});

test('melodic notes and rests divide a beat without changing its duration', () => {
  const events = parse('synth([C4 D4 E4][~ G4][～ C5][0])').bars[0].noteEvents;
  assert.deepEqual(events.map((event) => event.notes), [[60], [62], [64], [67], [72]]);
  assert.deepEqual(events.map((event) => event.offset), [0, 1 / 12, 1 / 6, 3 / 8, 5 / 8]);
  assert.deepEqual(events.map((event) => event.duration), [1 / 3, 1 / 3, 1 / 3, 1 / 2, 1 / 2]);
});

test('note time weights divide their enclosing beat, including weighted rests', () => {
  const events = parse('synth([C4*3 G4][~*2 C4][C4*4][])').bars[0].noteEvents;
  assert.deepEqual(events.map((event) => event.duration), [3 / 4, 1 / 4, 1 / 3, 1]);
  assert.deepEqual(events.map((event) => event.offset), [0, 3 / 16, (1 + 2 / 3) / 4, 1 / 2]);
  for (const token of ['C4*0', 'C4*17', 'C4*1.5', 'C4**2']) assert.throws(() => parse(`synth([${token}][][][])`));
});

test('explicit and named chords schedule together as one attack', () => {
  const events = parse('keys([C3 & E3 & G3][C3maj7][C3&C3&G3][])').bars[0].noteEvents;
  assert.deepEqual(events.map((event) => event.notes), [[48, 52, 55], [48, 52, 55, 59], [48, 55]]);
  assert.deepEqual(events.map((event) => event.offset), [0, 1 / 4, 1 / 2]);
  assert.equal(scoreHits(parse('keys([C3&E3&G3][][][])').bars[0]).length, 1);
});

test('pitched tracks and drums keep independent loop lengths and meters', () => {
  const score = parse('bass([C2][][][], [D2][][][], [E2][][][])\nbd([1][][][], [01][][][], [001][][][], [0001][][][])');
  assert.equal(score.bars.length, 12);
  assert.deepEqual(score.bars.map((bar) => bar.noteEvents[0].notes), Array.from({length:12}, (_, index) => [[36], [38], [40]][index % 3]));
  assert.deepEqual(hits(parse('bass([~ C2][][])', '3/4').bars[0], 'bass'), [1 / 6]);
  assert.deepEqual(hits(parse('pad([C3maj7][][][][][])', '6/8').bars[0], 'pad'), [0]);
  assert.equal(parse('bass([C2][][])', '4/4').bars[0].noteEvents[0].duration, 4 / 3);
  assert.throws(() => parse(`bass(${Array(5).fill('[C2][][][]').join(', ')})`), /4 bars/);
});

test('ins.drums adds only silent drums beside existing melodic rows', () => {
  const code = song('ins.drums\nbass([C2][][][]).timbre("sub")');
  const prepared = preparedPassage(code, 'A');
  assert.equal(drumRows(prepared.source).length, PARTS.length + 1);
  assert.equal(prepared.score.bars[0].noteEvents.length, 1);
  assert.deepEqual(hits(prepared.score.bars[0], 'bd'), []);
  assert.match(prepared.source, /bass\(\[C2\]\[\]\[\]\[\]\)\.timbre\("sub"\)/);
});

test('melodic and drum timbres cannot silently replace each other', () => {
  assert.throws(() => parse('keys([C4][][][]).timbre("808")'), /drum kit/);
  assert.throws(() => parse('bd([1][][][]).timbre("piano")'), /pitched sound/);
  assert.throws(() => parse('kit "piano"\nbd([][][][])'), /pitched sound/);
  assert.equal(parse('kit "909"\nkeys([C4][][][])\nbd([1][][][])').bars[0].timbres.keys, 'electric-piano');
  assert.equal(parse('bass([C2][][][]).timbre("piano")').bars[0].timbres.bass, 'piano');
  assert.equal(resolveSoundbank('Electric Piano'), 'electric-piano');
  assert.equal(resolveSoundbank('BOOM BAP'), 'boombap');
});

test('pitched completion searches only compatible names and preserves all notes', () => {
  assert.deepEqual(searchSoundbanks('s', 'bass').map((bank) => bank.id), ['sub', 'round-bass', 'saw-bass', 'sine', 'saw', 'square', 'strings']);
  assert.deepEqual(searchSoundbanks('s', 'bd').map((bank) => bank.id), ['studio', 'house']);
  assert.deepEqual(searchSoundbanks('909', 'keys'), []);
  const code = song('  keys([C3&E3&G3][][][], [Dm][][][]).timbre(p) // keep\nbd([1][][][]).timbre("808")');
  const context = soundbankCompletion(code, code.indexOf('.timbre(p)') + '.timbre(p'.length);
  assert.equal(context.query, 'p');
  const next = completeSoundbank(code, context, 'piano');
  assert.equal(next.source, code.replace('.timbre(p)', '.timbre("piano")'));
  assert.equal(parsePassage(next.source, 'A').bars[1].timbres.keys, 'piano');
  assert.throws(() => completeSoundbank(code, context, 'studio'), /drum kit/);
  assert.throws(() => stepModel(next.source, drumRows(next.source)[0]), /for drums/);
});

test('pitched validation rejects duplicate rows, invalid notes, and excessive polyphony', () => {
  assert.throws(() => parse('piano([1][][][])'), /needs a scale/);
  assert.throws(() => parse('piano([C4][][][])\npiano([D4][][][])'), /defined twice/);
  assert.throws(() => parse('keys([C3&D3&E3&F3&G3&A3&B3&C4&D4][][][])'), /8 notes/);
  const chord = 'C3&D3&E3&F3&G3&A3&B3&C4';
  assert.equal(parse(`keys([${Array(16).fill(chord).join(' ')}][][][])`).bars[0].noteEvents.length, 16);
  assert.throws(() => parse(`keys([${Array(17).fill(chord).join(' ')}][][][])`), /128 pitched notes/);
});

test('pitched renderers schedule each preset at the requested pitch and clean every node', () => {
  assert.equal(midiFrequency(69), 440);
  assert.equal(midiFrequency(81), 880);
  for (const bank of pitchedBanks) {
    const context = fakeAudio();
    const sources = new Set();
    schedulePitchedSound(context, {}, [48, 52, 55], bank.id, 2, .5, sources);
    assert.ok(sources.size >= 3);
    assert.ok(context.nodes.filter((node) => node.kind === 'tone').some((node) => node.frequency.value === midiFrequency(48)));
    for (const source of [...sources]) { assert.equal(source.startTime, 2); assert.ok(source.stopTime > 2.46); source.onended(); }
    assert.equal(sources.size, 0);
    assert.ok(context.nodes.every((node) => node.disconnected), bank.id);
    for (const gain of context.nodes.filter((node) => node.kind === 'gain')) {
      assert.ok(gain.gain.events.every(([value, time]) => Number.isFinite(value) && Number.isFinite(time)));
    }
  }
});

test('pitched rendering validates inputs before allocating nodes', () => {
  for (const [notes, bank, duration] of [[[], 'piano', .5], [[60], 'studio', .5], [[128], 'piano', .5], [[60], 'piano', 0], [[60], 'piano', NaN]]) {
    const context = fakeAudio();
    assert.throws(() => schedulePitchedSound(context, {}, notes, bank, 0, duration, new Set()));
    assert.equal(context.nodes.length, 0);
  }
});

test('pitched and drum voices share transport ownership and stop together', () => {
  const context = fakeAudio();
  const sources = new Set();
  scheduleDrumSound(context, {}, 'bd', 'house', 1, sources);
  schedulePitchedSound(context, {}, [36], 'sub', 1, .5, sources);
  assert.ok(sources.size > 2);
  for (const source of [...sources]) { source.stop(1.1); source.onended(); }
  assert.equal(sources.size, 0);
  assert.ok(context.nodes.every((node) => node.disconnected));
});

test('melodic bracket counts divide a whole bar, not an obligatory beat grid', () => {
  for (const part of NOTE_PARTS) {
    assert.equal(parse(`${part}([C3&E3&G3])`).bars[0].noteEvents[0].duration, 4);
    const two = parse(`${part}([C3maj][Dm])`).bars[0].noteEvents;
    assert.deepEqual(two.map((event) => [event.offset, event.duration]), [[0, 2], [.5, 2]]);
    const four = parse(`${part}([C3&E3&G3][][][])`).bars[0].noteEvents;
    assert.equal(four.length, 1);
    assert.equal(four[0].duration, 1);
    assert.deepEqual(parse(`${part}([])`).bars[0].noteEvents, []);
  }
});

test('group contents divide their group, with proportional weights and explicit rests', () => {
  const triplets = parse('synth([C4 D4 E4])').bars[0].noteEvents;
  assert.deepEqual(triplets.map((event) => event.offset), [0, 1 / 3, 2 / 3]);
  assert.deepEqual(triplets.map((event) => event.duration), [4 / 3, 4 / 3, 4 / 3]);
  const weighted = parse('synth([C4*3 G4])').bars[0].noteEvents;
  assert.deepEqual(weighted.map((event) => [event.offset, event.duration]), [[0, 3], [.75, 1]]);
  assert.equal(parse('keys([C3maj*4])').bars[0].noteEvents[0].duration, 4);
  const rest = parse('bass([~ C2])').bars[0].noteEvents[0];
  assert.equal(rest.offset, .5);
  assert.equal(rest.duration, 2);
  assert.throws(() => parse('keys([C3][-][-][-])'), /Unknown note/);
});

test('melodic group duration follows the meter while drum grooves are unchanged', () => {
  assert.equal(parse('keys([C3maj])', '3/4').bars[0].noteEvents[0].duration, 3);
  assert.deepEqual(parse('bass([C2][G2])', '6/8').bars[0].noteEvents.map((event) => event.duration), [3, 3]);
  const score = parse('keys([C3maj], [Dm][G3maj], [C3][][][])\nbd([1][][1][])');
  assert.equal(score.bars.length, 3);
  assert.deepEqual(score.bars.map((bar) => bar.noteEvents.map((event) => event.duration)), [[4], [2, 2], [1]]);
  score.bars.forEach((bar) => assert.deepEqual(hits(bar, 'bd'), [0, .5]));
  assert.throws(() => parse('bd([1])'), /4 beat brackets/);
  assert.throws(() => parse(`keys(${Array(65).fill('[]').join('')})`), /64 groups/);
});

test('per-instrument dB levels work alone or on either side of timbre', () => {
  const score = parse('bd([1][][1][]).volume(-6)\nsd([][1][][1]).volume(-3.5).timbre("909")\nkeys([C3maj]).timbre("piano").volume(-9)').bars[0];
  assert.equal(score.volumes.bd, -6);
  assert.equal(score.volumes.sd, -3.5);
  assert.equal(score.volumes.keys, -9);
  assert.equal(score.volumes.hh, 0);
  assert.equal(score.timbres.sd, '909');
  assert.equal(score.noteEvents[0].duration, 4);
  assert.equal(rowVolume(drumRows(song('bass([C2]).volume( -.5 )'))[0]), -.5);
  for (const db of [-60, 0, 6]) assert.equal(parse(`keys([C3]).volume(${db})`).bars[0].volumes.keys, db);
  assert.deepEqual(hits(score, 'bd'), [0, .5]);
});

test('invalid or duplicate levels cannot be hidden by other modifiers', () => {
  for (const value of ['-61', '7', 'NaN', 'Infinity', '"-6"', '', '1e3', '-6, 1']) {
    assert.throws(() => parse(`keys([C3]).volume(${value}).timbre("piano")`), /volume/i);
  }
  assert.throws(() => parse('keys([C3]).volume(-6).volume(-9)'), /defined twice/);
  assert.throws(() => parse('bd("x").volume(-6)\nbd("~").volume(-9)'), /different volumes/);
  assert.throws(() => parse('keys([C3]).volume(-6).reverb(.2)'), /not connected/);
});

test('sound completion and replacement preserve volumes, whitespace and comments', () => {
  for (const row of ['keys([C3maj]).volume(-6).timbre(p) // keep', 'keys([C3maj]).timbre(p)  .volume(-6) // keep']) {
    const code = song(row);
    const context = soundbankCompletion(code, code.indexOf('.timbre(p)') + '.timbre(p'.length);
    assert.ok(context);
    const next = completeSoundbank(code, context, 'piano');
    assert.equal(next.source, code.replace('.timbre(p)', '.timbre("piano")'));
    assert.equal(parsePassage(next.source, 'A').bars[0].volumes.keys, -6);
  }
  const code = song('keys([C3maj]).volume(-6) // keep');
  const next = setRowSoundbank(code, drumRows(code)[0].key, 'piano');
  assert.equal(next, code.replace('.volume(-6)', '.timbre("piano").volume(-6)'));
  assert.equal(setRowSoundbank(next, drumRows(next)[0].key, 'organ'), next.replace('"piano"', '"organ"'));
});

test('step edits preserve instrument volume and drum groove positions', () => {
  const code = song('bd([~ 1][][][]).volume(-6).timbre("house") // keep');
  assert.equal(toggleRowStep(code, drumRows(code)[0].key, 0, 0), code.replace('[~ 1]', '[1 1]'));
  const resized = resizeRowSteps(code, drumRows(code)[0].key, 4);
  assert.match(resized, /\.volume\(-6\)\.timbre\("house"\) \/\/ keep/);
  assert.deepEqual(hits(parsePassage(resized, 'A').bars[0]), hits(parsePassage(code, 'A').bars[0]));
});

test('dB conversion and smoothing are scheduled at the bar boundary', () => {
  assert.equal(decibelsToGain(0), 1);
  assert.ok(Math.abs(decibelsToGain(-6) - .5011872336272722) < 1e-12);
  for (const db of [-61, 7, NaN, Infinity]) assert.throws(() => decibelsToGain(db));
  const gain = fakeAudio().createGain();
  scheduleTrackVolume(gain, -9, 12);
  assert.deepEqual(gain.gain.targets, [[decibelsToGain(-9), 12, .008]]);
});

test('long notes hold their gate for the full bar and respect the longest meter', () => {
  const context = fakeAudio();
  const sources = new Set();
  const score = parse('tempo 30\nkeys([C3maj])', '16/4').bars[0];
  const event = score.noteEvents[0];
  assert.equal(event.duration, 16);
  const voice = schedulePitchedSound(context, {}, event.notes, 'organ', 1, event.duration * 60 / score.tempo, sources);
  assert.ok(voice.endTime > 33);
  const envelope = context.nodes.find((node) => node.kind === 'gain' && node.gain.events.length);
  assert.ok(envelope.gain.events.some(([, time]) => time === 33));
  assert.throws(() => schedulePitchedSound(context, {}, [60], 'organ', 1, 32.1, sources));
  for (const source of [...sources]) source.onended();
  assert.equal(sources.size, 0);
  assert.ok(context.nodes.every((node) => node.disconnected));
});

test('a next note interrupts the old chord and FM modulators without touching the new note', () => {
  const context = fakeAudio();
  const sources = new Set();
  let ended = 0;
  const previous = schedulePitchedSound(context, {}, [48, 52, 55], 'bell', 1, 2, sources, () => { ended += 1; });
  const oldSources = [...sources];
  const next = schedulePitchedSound(context, {}, [50], 'bell', 3, 2, sources);
  const newSources = [...sources].filter((source) => !oldSources.includes(source));
  previous.stopAt(3);
  oldSources.forEach((source) => assert.equal(source.stopTime, 3));
  newSources.forEach((source) => assert.equal(source.stopTime, next.endTime));
  const oldEnvelope = context.nodes.find((node) => node.kind === 'gain' && node.gain.cancellations.length);
  assert.deepEqual(oldEnvelope.gain.cancellations, [2.992]);
  assert.deepEqual(oldEnvelope.gain.events.at(-1), [.0001, 3]);
  previous.stopAt(4);
  assert.equal(oldSources[0].stopTime, 3);
  oldSources.forEach((source) => source.onended());
  assert.equal(ended, 1);
  assert.equal(sources.size, newSources.length);
  newSources.forEach((source) => source.onended());
  assert.ok(context.nodes.every((node) => node.disconnected));
});

test('effects work on every drum and melodic part without changing the score timing', () => {
  for (const part of INSTRUMENTS) {
    const rhythm = PARTS.includes(part) ? `${part}([1][][1][])` : `${part}([C3][G3])`;
    const original = parse(rhythm).bars[0];
    const score = parse(`${rhythm}.effects("filter", 1800).volume(-6).effects("delay", 20, "1/8", 35).effects("reverb", 25)`).bars[0];
    assert.deepEqual(score.effects[part], [{ id: 'filter', frequency: 1800 }, { id: 'delay', mix: 20, rate: '1/8', feedback: 35 }, { id: 'reverb', mix: 25, decay: 2 }]);
    assert.deepEqual(scoreHits(score), scoreHits(original));
    assert.equal(score.volumes[part], -6);
    assert.deepEqual(score.effects[part === 'bd' ? 'keys' : 'bd'], []);
  }
  const score = parse('keys([C3], [D3][E3], [F3][][][]).effects("reverb", 12)');
  assert.equal(score.bars.length, 3);
  score.bars.forEach((bar) => assert.equal(bar.effects.keys[0].mix, 12));
});

test('effect defaults, percentages, bounds, quoting and delay note lengths are explicit', () => {
  assert.deepEqual(parseEffect('.effects("reverb")'), { id: 'reverb', mix: 25, decay: 2 });
  assert.deepEqual(parseEffect(".effects('DELAY')"), { id: 'delay', mix: 20, rate: '1/8', feedback: 35 });
  assert.deepEqual(parseEffect('.effects("filter")'), { id: 'filter', frequency: 1800 });
  for (const id of ['reverb', 'delay']) for (const mix of [0, .5, 100]) assert.equal(parseEffect(`.effects("${id}", ${mix})`).mix, mix);
  for (const rate of ['1/2', '1/4.', '1/8t', '1/16', '1/32']) assert.equal(parseEffect(`.effects("delay", 20, "${rate}", 80)`).rate, rate);
  for (const text of ['.effects(reverb)', '.effects("other")', '.effects("reverb", -1)', '.effects("reverb", 101)', '.effects("reverb", NaN)', '.effects("reverb", "25")', '.effects("reverb", 25, 0)', '.effects("reverb", 25, 9)', '.effects("delay", 20, "1/3")', '.effects("delay", 20, 8)', '.effects("delay", 20, "1/8", 81)', '.effects("filter", 19)', '.effects("filter", 20001)', '.effects("filter", 1800, 1)', '.effects("reverb",)', '.effects("delay", 20, "1/8", 35, 1)', '.effects()']) assert.throws(() => parseEffect(text), undefined, text);
  assert.throws(() => parse('keys([C3]).effects("reverb", 20).effects("reverb", 30)'), /defined twice/);
  assert.throws(() => parse('bd("x").effects("delay", 20)\nbd("~").effects("delay", 25)'), /different effects/);
});

test('effect completion stays inside a nonempty name and keeps other modifiers and comments', () => {
  for (const text of ['.effects(', '.effects()', '.effects("")', '.']) {
    const code = song(`keys([C3])${text}`);
    assert.equal(effectCompletion(code, code.indexOf(text) + text.length - (text.endsWith(')') ? 1 : 0)), null);
  }
  for (const draft of ['.effects(r)', '.effects("r")', ".effects('r')", '.effects("r', '.effects(r']) {
    const code = song(`keys([C3]).volume(-6)${draft}.timbre("piano") // keep`);
    // Unclosed parentheses/quotes cannot enclose another modifier; test them at the row end.
    const source = draft.endsWith(')') ? code : song(`keys([C3]).volume(-6).timbre("piano")${draft}`);
    const context = effectCompletion(source, source.indexOf(draft) + draft.indexOf('r') + 1);
    assert.ok(context, draft);
    const next = completeEffect(source, context, 'reverb');
    assert.equal(next.source, source.replace(draft, '.effects("reverb", 25)'));
    assert.equal(parsePassage(next.source, 'A').bars[0].volumes.keys, -6);
    assert.equal(parsePassage(next.source, 'A').bars[0].timbres.keys, 'piano');
  }
  assert.deepEqual(searchEffects('e').map((effect) => effect.id), ['reverb', 'delay', 'filter']);
  assert.deepEqual(searchEffects('VER').map((effect) => effect.id), ['reverb']);
  assert.deepEqual(searchEffects(''), []);
  const source = song('keys([C3]).effects("r", 42, 3).volume(-9) // .effects(r)');
  const context = effectCompletion(source, source.indexOf('"r"') + 2);
  assert.equal(completeEffect(source, context, 'reverb').source, source.replace('"r"', '"reverb"'));
  assert.equal(effectCompletion(source, source.indexOf('42') + 1), null);
  assert.equal(effectCompletion(source, source.indexOf('//') + 12), null);
  assert.throws(() => completeEffect(source.replace('C3', 'D3'), context, 'reverb'), /changed/);
});

test('timbre completion and drum step edits preserve effect chains exactly', () => {
  const code = song('bd([~ 1][][][]).effects("delay", 20, "1/8.", 35).timbre(h).effects("filter", 1800).volume(-6) // keep');
  const context = soundbankCompletion(code, code.indexOf('.timbre(h') + '.timbre(h'.length);
  const next = completeSoundbank(code, context, 'house').source;
  assert.equal(next, code.replace('.timbre(h)', '.timbre("house")'));
  const row = drumRows(next)[0];
  assert.equal(toggleRowStep(next, row.key, 0, 0), next.replace('[~ 1]', '[1 1]'));
  assert.deepEqual(rowEffects(row), rowEffects(drumRows(resizeRowSteps(next, row.key, 4))[0]));
});

test('slider source edits target one effect and preserve rhythm, spacing, comments and other passages', () => {
  const code = song('  keys([C3], [Dm]).effects("reverb", 25)  .volume(-6).effects("filter", 1800) // keep') + '\npassage"B"{\n keys([G3]).effects("reverb", 45)\n}';
  const row = drumRows(code)[0];
  const next = setRowEffect(code, row.key, 0, { id: 'reverb', mix: 45, decay: 3 });
  assert.equal(next, code.replace('.effects("reverb", 25)', '.effects("reverb", 45, 3)'));
  assert.equal(parsePassage(next, 'A').bars.length, 2);
  assert.equal(parsePassage(next, 'B').bars[0].effects.keys[0].mix, 45);
  assert.throws(() => setRowEffect(code, row.key, 0, { id: 'filter', frequency: 900 }), /changed/);
  assert.throws(() => setRowEffect(code, row.key, 0, { id: 'reverb', mix: 101, decay: 3 }), /0–100/);
});

test('synced delay respects denominator beats, dotted notes, triplets and tempo changes', () => {
  assert.equal(delaySeconds('1/8', 120, 4), .25);
  assert.equal(delaySeconds('1/8', 120, 8), .5);
  assert.equal(delaySeconds('1/8.', 120, 4), .375);
  assert.equal(delaySeconds('1/8t', 120, 4), 1 / 6);
  assert.equal(delaySeconds('1/2.', 30, 16), 24);
  const filter = [parseEffect('.effects("filter", 2000)')];
  assert.equal(effectRackKey(filter, 120, 4), effectRackKey(filter, 140, 8));
  assert.notEqual(effectRackKey([parseEffect('.effects("delay")')], 120, 4), effectRackKey([parseEffect('.effects("delay")')], 140, 4));
});

test('native effect routing is serial, has dry/wet paths and bounded feedback', () => {
  const context = fakeAudio();
  const effects = ['.effects("filter", 900)', '.effects("delay", 20, "1/8", 35)', '.effects("reverb", 25, .1)'].map(parseEffect);
  const rack = createEffectRack(context, effects, 120, 4);
  const filter = context.nodes.find((node) => node.kind === 'filter');
  const delay = context.nodes.find((node) => node.kind === 'delay');
  const convolver = context.nodes.find((node) => node.kind === 'convolver');
  assert.equal(rack.input.links[0], filter);
  assert.equal(filter.frequency.value, 900);
  assert.ok(Math.abs(filter.Q.value + 3.0103) < .0001);
  assert.equal(delay.delayTime.value, .25);
  assert.ok(context.nodes.some((node) => node.kind === 'gain' && node.gain.value === .35 && node.links.includes(delay)));
  assert.equal(convolver.buffer.numberOfChannels, 2);
  assert.equal(convolver.buffer.length, 4800);
  assert.ok(convolver.buffer.getChannelData(0).some((value) => value !== 0));
  assert.notDeepEqual(convolver.buffer.getChannelData(0), convolver.buffer.getChannelData(1));
  rack.enter(2);
  assert.deepEqual(rack.input.gain.events, [[0, 2], [1, 2.008]]);
  assert.ok(rack.retire(4) > 4);
  assert.deepEqual(rack.input.gain.events.slice(-2), [[1, 4], [0, 4.008]]);
  rack.dispose(); rack.dispose();
  assert.ok(context.nodes.every((node) => node.disconnected));
});

test('zero wet mix is transparent, impulse buffers are reused, old tails have a lifetime cap', () => {
  const context = fakeAudio();
  const dry = createEffectRack(context, [parseEffect('.effects("reverb", 0)'), parseEffect('.effects("delay", 0)')], 120, 4);
  assert.deepEqual(context.nodes.map((node) => node.kind), ['gain', 'gain']);
  assert.equal(dry.input.links[0], dry.output);
  dry.dispose();
  const one = createEffectRack(context, [parseEffect('.effects("reverb", 25, .1)')], 120, 4);
  const two = createEffectRack(context, [parseEffect('.effects("reverb", 40, .1)')], 120, 4);
  const convolvers = context.nodes.filter((node) => node.kind === 'convolver');
  assert.equal(convolvers[0].buffer, convolvers[1].buffer);
  const long = createEffectRack(context, [parseEffect('.effects("delay", 100, "1/2.", 80)')], 30, 16);
  assert.equal(long.tail, 32);
  one.dispose(); two.dispose(); long.dispose();
});

test('track rack changes retain old tails until collection; Stop disconnects all owned nodes', () => {
  const context = fakeAudio();
  const track = context.createGain(); const master = context.createGain();
  const controller = createTrackEffects(context, track, master);
  const effects = [parseEffect('.effects("delay", 20, "1/8", 35)')];
  controller.apply(effects, 120, 4, 1);
  const count = context.nodes.length;
  controller.apply(effects, 120, 4, 3);
  assert.equal(context.nodes.length, count);
  controller.apply([], 120, 4, 4);
  assert.equal(track.links.length, 2);
  controller.collect(4);
  assert.equal(track.links.length, 2);
  controller.collect(40);
  assert.equal(track.links.length, 1);
  controller.apply(effects, 100, 4, 41);
  controller.clear(); controller.clear();
  assert.equal(track.links.length, 0);
  assert.ok(context.nodes.slice(2).every((node) => node.disconnected));
  controller.apply([], 100, 4, 42); // Play after Stop starts a clean graph.
  assert.equal(track.links.length, 1);
  controller.clear();
});

test('rapid edits shorten oldest tails rather than accumulating unbounded graphs', () => {
  const context = fakeAudio(); const track = context.createGain(); const master = context.createGain();
  const controller = createTrackEffects(context, track, master);
  for (let bar = 0; bar < 30; bar += 1) {
    controller.collect(bar);
    controller.apply([parseEffect(`.effects("delay", ${bar + 1}, "1/2.", 80)`)], 30, 16, bar);
    controller.collect(bar + .1);
    assert.ok(track.links.length <= 5);
  }
  controller.clear();
  assert.equal(track.links.length, 0);
});

const project = (code = STARTER, name = 'My song', editingPassage = 'Passage 1') => createProject(name, code, editingPassage, '2026-10-12T20:00:00.000Z');
function fakeStorage() {
  const data = new Map();
  return { data, getItem(key) { return data.get(key) ?? null; }, setItem(key, value) { data.set(key, value); } };
}

test('project files round-trip the entire song, metadata, unicode, effects and independent loops', () => {
  const code = song('keys([C3maj], [Dm], [G3maj]).effects("reverb", 25).volume(-9)\nbd([1][][1][])') + '\n\npassage"副歌"{\n keys([G3maj]).timbre("piano").effects("filter", 1200)\n}';
  const original = project(code, '我的歌 🎧', '副歌');
  const restored = parseProject(serializeProject(original));
  assert.deepEqual(restored, original);
  assert.equal(restored.code, code);
  assert.equal(prepareProject(restored).selected, '副歌');
  assert.equal(parsePassage(restored.code, 'A').bars.length, 3);
  assert.deepEqual(parsePassage(restored.code, 'A').bars[0].effects.keys, [{ id: 'reverb', mix: 25, decay: 2 }]);
});

test('unfinished and invalid musical drafts are saved losslessly, but restore silent', () => {
  for (const code of ['passage"Draft"{\n keys([C3', 'tempo nope\nbd([][][][])', '', 'passage"A"{\n keys([not-a-note])\n}']) {
    const restored = parseProject(serializeProject(project(code, 'Draft', 'Draft')));
    assert.equal(restored.code, code);
    const prepared = prepareProject(restored);
    // Empty source is a valid silent legacy passage; the others must not play a substitute song.
    assert.deepEqual(scoreHits(prepared.score.bars[0]), []);
    if (code) { assert.equal(prepared.unfinished, true); assert.deepEqual(prepared.score.trackBars, []); }
  }
});

test('project file shape rejects wrong formats, missing fields, unsupported versions and oversized data', () => {
  const original = project();
  for (const raw of ['not-json', 'null', '[]', '{}', '"bd([1])"', JSON.stringify({ ...original, format: 'strudel' }), JSON.stringify({ ...original, version: 2 }), JSON.stringify({ ...original, code: 7 }), JSON.stringify({ ...original, name: 3 }), JSON.stringify({ ...original, editingPassage: undefined }), JSON.stringify({ ...original, updatedAt: 'never' }), JSON.stringify({ ...original, name: 'x'.repeat(81) }), JSON.stringify({ ...original, code: 'x'.repeat(MAX_CODE_LENGTH + 1) })]) assert.throws(() => parseProject(raw), undefined, raw.slice(0, 80));
  assert.throws(() => parseProject('x'.repeat(MAX_PROJECT_BYTES + 1)), /2 MB/);
  assert.throws(() => parseProject('🎧'.repeat(MAX_PROJECT_BYTES / 4 + 1)), /2 MB/);
});

test('project parsing drops foreign runtime fields and does not execute embedded text', () => {
  const original = project('// <script>do-not-run</script>\npassage"A"{\n bd([][][][])\n}', '<b>My song</b>', 'A');
  const restored = parseProject(JSON.stringify({ ...original, audioContext: {}, playing: true, credentials: 'not a project field', __proto__: { surprise: true } }));
  assert.deepEqual(restored, original);
  assert.equal('playing' in restored, false);
  assert.equal(prepareProject(restored).unfinished, false);
});

test('filename generation is portable and keeps project identity separate from passage names', () => {
  assert.equal(projectFilename('我的歌 🎧'), '我的歌 🎧.ohcodes');
  assert.equal(projectFilename(' Mix / Verse: take 1? '), 'Mix - Verse- take 1-.ohcodes');
  assert.equal(projectFilename('NUL'), 'song-NUL.ohcodes');
  assert.equal(projectFilename('...'), 'Untitled.ohcodes');
  assert.equal(projectFilename('  '), 'Untitled.ohcodes');
  assert.throws(() => createProject('bad\nname', STARTER, 'Passage 1'), /one line/);
  assert.equal(projectFingerprint(project(STARTER, ' Song ')), projectFingerprint(project(STARTER, 'Song')));
});

test('restoring an absent editing passage selects a real passage without altering the source', () => {
  const original = project(song('keys([C3maj])'), 'Song', 'Removed passage');
  const prepared = prepareProject(original);
  assert.equal(prepared.selected, 'A');
  assert.equal(prepared.score.name, 'A');
  assert.equal(prepared.score.bars[0].noteEvents[0].duration, 4);
  assert.equal(original.code, song('keys([C3maj])'));
});

test('ohcodes exports its new format while opening old .ohsounds projects losslessly', () => {
  const original = project(song('hh([1 1][1 1][1 1][1 1]).velocity(90, 45).swing(60)\nkeys([C3maj7]).effects("reverb", 25)'), '旧工程 🎹', 'A');
  assert.equal(original.format, 'ohcodes');
  const legacy = JSON.stringify({ ...original, format: 'ohsounds' });
  const restored = parseProject(legacy);
  assert.deepEqual(restored, original);
  assert.equal(JSON.parse(serializeProject(restored)).format, 'ohcodes');
  assert.deepEqual(passageHits(prepareProject(restored).score, 11), passageHits(prepareProject(original).score, 11));
  const unfinished = JSON.stringify({ ...original, format: 'ohsounds', code: 'passage"Draft"{\n hh([1', editingPassage: 'Draft' });
  const draft = parseProject(unfinished);
  assert.equal(draft.code, 'passage"Draft"{\n hh([1');
  assert.equal(prepareProject(draft).unfinished, true);
});

test('the rename retains storage keys, legacy draft bytes, previous drafts and stale-tab protection', () => {
  assert.equal(DRAFT_KEY, 'ohsounds.project.v1');
  assert.equal(PREVIOUS_KEY, 'ohsounds.project.previous.v1');
  const storage = fakeStorage();
  const original = project();
  const legacy = JSON.stringify({ ...original, format: 'ohsounds' });
  storage.setItem(DRAFT_KEY, legacy); storage.setItem(PREVIOUS_KEY, legacy);
  assert.deepEqual(parseProject(storage.getItem(PREVIOUS_KEY)), original);
  assert.equal(saveDraft(storage, parseProject(legacy), legacy), legacy);
  assert.equal(storage.getItem(DRAFT_KEY), legacy);
  const edited = project(STARTER + '\n// new edit');
  const saved = saveDraft(storage, edited, legacy);
  assert.equal(JSON.parse(saved).format, 'ohcodes');
  assert.equal(parseProject(saved).code, edited.code);
  assert.throws(() => saveDraft(storage, original, legacy), DraftConflict);
  replaceDraft(storage, original, edited, saved);
  assert.deepEqual(parseProject(storage.getItem(PREVIOUS_KEY)), edited);
});

test('old branded Studio kit aliases remain playable alongside the new name', () => {
  assert.equal(resolveSoundbank('ohsounds studio'), 'studio');
  assert.equal(resolveSoundbank('OHCodes Studio'), 'studio');
  const old = parsePassage('kit "ohsounds studio"\n' + song('bd([1][][1][])'), 'A');
  const renamed = parsePassage('kit "ohcodes studio"\n' + song('bd([1][][1][])'), 'A');
  assert.deepEqual(scoreHits(old.bars[0]), scoreHits(renamed.bars[0]));
  assert.deepEqual(old.bars[0].timbres, renamed.bars[0].timbres);
});

test('local autosave writes a valid draft and does not rewrite unchanged data on another tab opening', () => {
  const storage = fakeStorage();
  const raw = saveDraft(storage, project(), null);
  assert.deepEqual(parseProject(storage.getItem(DRAFT_KEY)), project());
  assert.equal(saveDraft(storage, { ...project(), updatedAt: '2026-10-12T20:05:00.000Z' }, raw), raw);
  const updated = saveDraft(storage, project(STARTER + '\n// still drafting'), raw);
  assert.notEqual(updated, raw);
  assert.equal(parseProject(updated).code, STARTER + '\n// still drafting');
});

test('stale-tab autosave and replacement cannot overwrite another tab or corrupt stored data', () => {
  const storage = fakeStorage();
  const raw = saveDraft(storage, project(), null);
  const foreign = serializeProject(project(STARTER + '\n// other tab'));
  storage.setItem(DRAFT_KEY, foreign);
  assert.throws(() => saveDraft(storage, project(STARTER + '\n// my edits'), raw), DraftConflict);
  assert.throws(() => replaceDraft(storage, project(), project(), raw), DraftConflict);
  assert.equal(storage.getItem(DRAFT_KEY), foreign);
  storage.setItem(DRAFT_KEY, '{broken');
  assert.throws(() => saveDraft(storage, project(), '{broken'));
  assert.equal(storage.getItem(DRAFT_KEY), '{broken');
});

test('replacing a project keeps the latest unsaved source, not an old debounced snapshot', () => {
  const storage = fakeStorage();
  const raw = saveDraft(storage, project(), null);
  const latest = project(STARTER + '\n// final unsaved keystroke');
  const opened = project(song('keys([C3maj])'), 'New song', 'A');
  const next = replaceDraft(storage, opened, latest, raw);
  assert.deepEqual(parseProject(storage.getItem(PREVIOUS_KEY)), latest);
  assert.deepEqual(parseProject(next), opened);
  const swapped = replaceDraft(storage, latest, opened, next);
  assert.deepEqual(parseProject(swapped), latest);
  assert.deepEqual(parseProject(storage.getItem(PREVIOUS_KEY)), opened);
});

test('explicit replacement keeps unreadable original bytes in the recovery slot', () => {
  const storage = fakeStorage(); const corrupt = '{original\npartial';
  storage.setItem(DRAFT_KEY, corrupt);
  const next = replaceDraft(storage, project(), project(), corrupt);
  assert.equal(storage.getItem(PREVIOUS_KEY), corrupt);
  assert.deepEqual(parseProject(next), project());
});

test('storage exceptions are surfaced and failed replacement leaves the current draft intact', () => {
  const storage = fakeStorage(); const raw = saveDraft(storage, project(), null);
  const blocked = { getItem: storage.getItem.bind(storage), setItem() { throw new Error('QuotaExceeded'); } };
  assert.throws(() => saveDraft(blocked, project(STARTER + '\n// latest'), raw), /QuotaExceeded/);
  assert.equal(storage.getItem(DRAFT_KEY), raw);
  assert.throws(() => replaceDraft(blocked, project(song('keys([C3])'), 'Imported', 'A'), project(), raw), /QuotaExceeded/);
  assert.equal(storage.getItem(DRAFT_KEY), raw);
  assert.throws(() => saveDraft({ getItem() { throw new Error('SecurityError'); }, setItem() {} }, project(), null), /SecurityError/);
});
