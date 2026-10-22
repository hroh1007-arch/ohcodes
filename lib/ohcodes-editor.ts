// Read-only editor intelligence. Compilation and transport remain authoritative.
import { INSTRUMENTS, PART_NAMES, draftMeter, drumRows, emptyRow, grooveParameterHint, parseMeter, parsePassage, readArrangement, readPassages, trackId, trackLabel, type Part } from './ohcodes-language';

export type CodeToken = { from: number; to: number; kind: 'plain' | 'comment' | 'string' | 'keyword' | 'instrument' | 'note' | 'number' | 'rest' | 'modifier' | 'bracket' };
export type Diagnostic = { from: number; to: number; message: string };
const closing: Record<string, string> = { '[': ']', '(': ')', '{': '}' };

export function scanCode(source: string) {
  const tokens: CodeToken[] = [];
  const pairs: [number, number][] = [];
  const issues: Diagnostic[] = [];
  const stack: { char: string; at: number }[] = [];
  const pattern = /\/\/[^\n]*|"[^"\n]*(?:"|(?=\n|$))|'[^'\n]*(?:'|(?=\n|$))|\.[a-zA-Z]+|[A-Ga-g][#b]?-?\d+(?:maj7|maj|min7|min|m7|dim|aug|sus2|sus4|7|m)?|[a-zA-Z_][a-zA-Z_0-9]*|\d+(?:\.\d+)?|[~～]|[()[\]{}]/g;
  let end = 0;
  for (const match of source.matchAll(pattern)) {
    const from = match.index!;
    const value = match[0];
    if (from > end) tokens.push({ from: end, to: from, kind: 'plain' });
    let kind: CodeToken['kind'] = 'plain';
    if (value.startsWith('//')) kind = 'comment';
    else if (/^["']/.test(value)) {
      kind = 'string';
      if (value.length === 1 || value.at(-1) !== value[0]) issues.push({ from, to: from + 1, message: `Close this text with ${value[0]}.` });
    } else if (/^\./.test(value)) kind = 'modifier';
    else if (/^[a-zA-Z_]\w*$/.test(value) && /^[ \t]*=/.test(source.slice(from + value.length))) kind = 'keyword';
    else if (['passage', 'song', 'tempo', 'time', 'kit', 'ins', 'mute', 'solo'].includes(value)) kind = 'keyword';
    else if ((INSTRUMENTS as readonly string[]).includes(value)) kind = 'instrument';
    else if (/^[A-Ga-g][#b]?-?\d/.test(value) || /^[A-Ga-g](?:maj7|maj|min7|min|m7|dim|aug|sus2|sus4|7|m)?$/.test(value)) kind = 'note';
    else if (/^\d/.test(value)) kind = 'number';
    else if (/[~～]/.test(value)) kind = 'rest';
    else if (/^[()[\]{}]$/.test(value)) {
      kind = 'bracket';
      if (closing[value]) stack.push({ char: value, at: from });
      else {
        const open = stack.at(-1);
        if (!open) issues.push({ from, to: from + 1, message: `This ${value} has no opening bracket.` });
        else if (closing[open.char] !== value) {
          issues.push({ from: open.at, to: open.at + 1, message: `Add ${closing[open.char]} before this ${value}.` });
          // Recover at a matching outer delimiter; never invent a matching pair.
          while (stack.length && closing[stack.at(-1)!.char] !== value) stack.pop();
          if (stack.length) { const recovered = stack.pop()!; pairs.push([recovered.at, from]); }
        } else { stack.pop(); pairs.push([open.at, from]); }
      }
    }
    end = from + value.length;
    tokens.push({ from, to: end, kind });
  }
  if (end < source.length) tokens.push({ from: end, to: source.length, kind: 'plain' });
  for (const open of [...stack].reverse()) issues.push({ from: open.at, to: open.at + 1, message: `Add ${closing[open.char]} to close this ${open.char}.` });
  return { tokens, pairs, issues, unclosed: stack };
}

export function activeBrackets(scan: ReturnType<typeof scanCode>, cursor: number): number[] {
  if (cursor < 0) return [];
  const adjacent = scan.pairs.find(([a, b]) => a === cursor || b === cursor)
    ?? scan.pairs.find(([a, b]) => a === cursor - 1 || b === cursor - 1);
  const pair = adjacent ?? scan.pairs.filter(([a, b]) => a < cursor && cursor <= b).sort((a, b) => b[0] - a[0])[0];
  return pair ?? [];
}

export type InstrumentCompletion = { kind: 'instrument'; query: string; from: number; to: number; cursor: number; beats: number; unit: number; options: Part[] };
export function instrumentCompletion(source: string, cursor: number): InstrumentCompletion | null {
  const lineStart = source.lastIndexOf('\n', cursor - 1) + 1;
  const lineEnd = source.indexOf('\n', cursor);
  const before = source.slice(lineStart, cursor);
  const match = before.match(/^[ \t]*(?:[a-zA-Z_][a-zA-Z_0-9]*[ \t]*=[ \t]*)?([a-z][a-z0-9]*)$/i);
  if (!match || !/^[ \t]*(?:\/\/.*)?$/.test(source.slice(cursor, lineEnd < 0 ? source.length : lineEnd))) return null;
  const prefix = scanCode(source.slice(0, lineStart));
  if (prefix.unclosed.some((item) => item.char !== '{')) return null;
  const arrangement = readArrangement(source);
  if (arrangement.region && cursor >= arrangement.region.start && cursor <= arrangement.region.end) return null;
  const doc = readPassages(source);
  const passage = doc.passages.find((item) => cursor >= item.bodyStart && cursor <= item.bodyEnd);
  if (!passage) return null;
  const scope = `${doc.globals}\n${passage.body}`;
  // Do not guess a template size while the musician is editing an invalid meter.
  for (const line of scope.split('\n')) {
    const text = line.replace(/\/\/.*$/, '').trim();
    if (/^time\b(?!\s*=)/.test(text)) {
      try { parseMeter(text.replace(/^time\s*/, '')); } catch { return null; }
    }
  }
  const meter = draftMeter(scope);
  const query = match[1].toLowerCase();
  const options = INSTRUMENTS.filter((part) => part.startsWith(query));
  return options.length ? { kind: 'instrument', query, from: cursor - match[1].length, to: cursor, cursor, ...meter, options } : null;
}

export function completeInstrument(source: string, completion: InstrumentCompletion, part: Part) {
  const current = instrumentCompletion(source, completion.cursor);
  if (!current || current.from !== completion.from || current.to !== completion.to || current.query !== completion.query || current.beats !== completion.beats || current.unit !== completion.unit || !current.options.includes(part)) throw new Error('This line changed. Type the instrument name again.');
  const template = emptyRow(part, current.beats, current.unit);
  return { source: source.slice(0, current.from) + template + source.slice(current.to), cursor: current.from + part.length + 2 };
}

export function instrumentOptions(completion: InstrumentCompletion) {
  return completion.options.map((part) => ({ id: part, name: `${part} · ${PART_NAMES[part]}`, description: `${emptyRow(part, completion.beats, completion.unit)} · silent` }));
}

export type SelectionCompletion = {
  kind: 'selection'; command: 'mute' | 'solo'; query: string; from: number; to: number; cursor: number;
  options: { id: string; name: string; description: string }[];
};
export function selectionCompletion(source: string, cursor: number): SelectionCompletion | null {
  const start = source.lastIndexOf('\n', cursor - 1) + 1;
  const before = source.slice(start, cursor);
  const match = before.match(/^[ \t]*(mute|solo)[ \t]*\(\s*((?:[a-zA-Z_][a-zA-Z_0-9]*\s*,\s*)*)([a-zA-Z_][a-zA-Z_0-9]*)?$/);
  if (!match || scanCode(source.slice(0, start)).unclosed.some((item) => item.char !== '{')) return null;
  const passage = readPassages(source).passages.find((item) => cursor >= item.bodyStart && cursor <= item.bodyEnd);
  if (!passage) return null;
  const arrangement = readArrangement(source).region;
  if (arrangement && cursor >= arrangement.start && cursor <= arrangement.end) return null;
  const suffix = source.slice(cursor).match(/^[a-zA-Z_0-9]*/)?.[0] ?? '';
  const query = match[3] ?? '', from = cursor - query.length, to = cursor + suffix.length;
  const end = source.indexOf('\n', cursor);
  const rest = source.slice(to, end < 0 ? source.length : end).replace(/\/\/.*$/, '');
  if (!/^\s*(?:,\s*[a-zA-Z_][a-zA-Z_0-9]*\s*)*\)?\s*$/.test(rest)) return null;
  const used = new Set((match[2] + rest.replace(/\)/g, '')).split(',').map((name) => name.trim()));
  const rows = drumRows(passage.body);
  const labels = [...new Set(rows.map(trackLabel))];
  const options = labels.filter((label) => label.toLowerCase().includes(query.toLowerCase()) && !used.has(label))
    .filter((label) => new Set(rows.filter((row) => trackLabel(row) === label).map(trackId)).size === 1)
    .map((label) => ({ id: label, name: label, description: PART_NAMES[rows.find((row) => trackLabel(row) === label)!.part] }));
  return { kind: 'selection', command: match[1] as 'mute' | 'solo', query, from, to, cursor, options };
}

export function completeSelection(source: string, completion: SelectionCompletion, name: string) {
  const current = selectionCompletion(source, completion.cursor);
  if (!current || current.command !== completion.command || current.from !== completion.from || current.to !== completion.to || current.query !== completion.query || !current.options.some((option) => option.id === name)) throw new Error('These tracks changed. Type inside mute() or solo() again.');
  return { source: source.slice(0, current.from) + name + source.slice(current.to), cursor: current.from + name.length };
}

export function parameterHelp(source: string, cursor: number) {
  const groove = grooveParameterHint(source, cursor);
  if (groove) return groove;
  const row = drumRows(source).find((item) => cursor >= item.start && cursor <= item.start + item.text.length);
  if (!row) return null;
  const scan = scanCode(row.text);
  const local = cursor - row.start;
  if (scan.tokens.some((token) => token.kind === 'comment' && local >= token.from && local <= token.to)) return null;
  for (const token of scan.tokens.filter((item) => item.kind === 'modifier')) {
    const name = row.text.slice(token.from, token.to);
    const open = row.text.slice(token.to).match(/^\s*\(/);
    if (!open) continue;
    const start = token.to + open[0].length;
    const close = scan.pairs.find(([a]) => a === start - 1)?.[1] ?? row.text.length;
    if (local < start || local > close) continue;
    if (name === '.volume') return { row, cursor, modifier: { name: 'Volume', description: '−60 to +6 dB', help: '0 dB keeps the original level. Negative values turn this instrument down; positive values turn it up. Arithmetic works here, for example -3*4.' } };
    if (name !== '.effects') continue;
    const effect = row.text.slice(start, close).match(/^\s*(["'])(reverb|delay|filter)\1/i)?.[2].toLowerCase();
    const hints = {
      reverb: { name: 'Reverb', description: 'mix % · decay seconds', help: 'Mix 0–100%. Optional decay 0.1–8 seconds (default 2). Arithmetic works in numeric values. Example: .effects("reverb", 5*5, 1+1).' },
      delay: { name: 'Delay', description: 'mix % · note length · feedback %', help: 'Mix 0–100%. Length 1/2, 1/4, 1/8, 1/16 or 1/32; add . for dotted or t for triplet. Feedback 0–80%. Numeric expressions work, including 1/(4*2) for an eighth note.' },
      filter: { name: 'Filter', description: 'low-pass cutoff · Hz', help: '20–20000 Hz. Lower values soften the high frequencies. Arithmetic works here. Example: .effects("filter", 900*2).' },
    };
    if (effect && effect in hints) return { row, cursor, modifier: hints[effect as keyof typeof hints] };
  }
  return null;
}

function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'Finish this passage before playing it.'; }

// Use the real compiler, then isolate a failing row without changing its controls.
// This keeps editor feedback in agreement with playback, including future grammar changes.
export function diagnoseCode(source: string, passageName: string): Diagnostic | null {
  const doc = readPassages(source);
  const passage = doc.passages.find((item) => item.name === passageName) ?? doc.passages[0];
  const inScope = (at: number) => at >= passage.start && at <= passage.end || !doc.passages.some((item) => at >= item.start && at <= item.end);
  const structural = scanCode(source).issues.find((item) => inScope(item.from));
  if (structural) return structural;
  let message: string;
  try { parsePassage(source, passage.name); return null; } catch (caught) { message = errorMessage(caught); }
  const range = (from: number, length: number): Diagnostic => ({ from, to: Math.min(source.length, from + Math.max(1, length)), message });
  const rows = drumRows(passage.body);
  const selectionError = message.match(/^(mute|solo):/);
  if (selectionError) {
    const scan = scanCode(source);
    const candidates = [...source.matchAll(new RegExp(`^[ \\t]*${selectionError[1]}\\b(?!\\s*=)[^\\n]*`, 'gm'))]
      .filter((match) => inScope(match.index!) && !scan.tokens.some((token) => token.kind === 'comment' && match.index! >= token.from && match.index! < token.to));
    const label = message.match(/"([^"]+)"/)?.[1];
    const match = /inside a passage/.test(message) ? candidates.find((item) => item.index! < passage.start || item.index! > passage.end) : /one .* line/.test(message) ? candidates.at(-1) : candidates.find((item) => !label || item[0].includes(label));
    if (match) return range(match.index! + (label ? match[0].indexOf(label) : match[0].search(/\S/)), label?.length ?? match[0].trim().length);
  }
  // Selection names depend on the full passage; exclude them only while isolating row errors.
  const withoutSelection = (body: string) => body.replace(/^[ \t]*(?:mute|solo)\b(?!\s*=)[^\n]*/gm, (line) => line.replace(/[^\n]/g, ' '));
  let controlsOnly = passage.body;
  for (const row of [...rows].reverse()) controlsOnly = controlsOnly.slice(0, row.start) + row.text.replace(/[^\n]/g, ' ') + controlsOnly.slice(row.start + row.text.length);
  let sharedIssue = false;
  try { parsePassage(source.slice(0, passage.bodyStart) + withoutSelection(controlsOnly) + source.slice(passage.bodyEnd), passage.name); }
  catch (caught) { sharedIssue = errorMessage(caught) === message; }
  const named = message.match(/^Track name "([^"]+)"/);
  if (named) { const row = rows.filter((item) => item.track === named[1]).at(-1); if (row) return range(passage.bodyStart + row.start + row.text.indexOf(named[1]), named[1].length); }
  for (const row of sharedIssue ? [] : rows) {
    let isolated = passage.body;
    for (const other of [...rows].reverse()) if (other !== row) isolated = isolated.slice(0, other.start) + other.text.replace(/[^\n]/g, ' ') + isolated.slice(other.start + other.text.length);
    try { parsePassage(source.slice(0, passage.bodyStart) + withoutSelection(isolated) + source.slice(passage.bodyEnd), passage.name); }
    catch (caught) {
      if (errorMessage(caught) !== message) continue;
      const badNote = message.match(/^Unknown note "([^"]+)"/);
      if (badNote) { const at = row.text.indexOf(badNote[1]); if (at >= 0) return range(passage.bodyStart + row.start + at, badNote[1].length); }
      const degree = message.match(/(?:Degree|degree) "([^"]+)"/);
      if (degree) {
        const scan = scanCode(row.text);
        // Expressions span several highlighting tokens; never mistake a scale string or comment for a note.
        let at = row.text.indexOf(degree[1]);
        while (at >= 0) {
          const inBeat = scan.pairs.some(([open, close]) => row.text[open] === '[' && open < at && close >= at + degree[1].length);
          const tokenStart = /[\s[&]/.test(row.text[at - 1] ?? '');
          if (inBeat && tokenStart && !scan.tokens.some((item) => (item.kind === 'comment' || item.kind === 'string') && at >= item.from && at < item.to)) return range(passage.bodyStart + row.start + at, degree[1].length);
          at = row.text.indexOf(degree[1], at + 1);
        }
      }
      const modifier = /scale/i.test(message) ? 'scale' : /velocity/.test(message) ? 'velocity' : /swing/.test(message) ? 'swing' : /volume/.test(message) ? 'volume' : /soundbank|sound per|timbre/i.test(message) ? 'timbre' : /effect|mix %|decay|feedback|cutoff|Reverb|Delay|Filter/i.test(message) ? 'effects' : null;
      const at = modifier ? row.text.search(new RegExp(`\\.\\s*${modifier}\\b`)) : -1;
      if (at >= 0) {
        const open = row.text.indexOf('(', at);
        const end = scanCode(row.text).pairs.find(([start]) => start === open)?.[1];
        return range(passage.bodyStart + row.start + at, (end === undefined ? row.text.length : end + 1) - at);
      }
      return range(passage.bodyStart + row.start + row.text.search(/\S/), row.text.trimEnd().length - row.text.search(/\S/));
    }
  }
  const part = INSTRUMENTS.find((item) => message.startsWith(`${item} `));
  const duplicate = part && rows.filter((row) => row.part === part).at(-1);
  if (duplicate) return range(passage.bodyStart + duplicate.start + duplicate.text.search(/\S/), part.length);
  const control = /[Tt]empo/.test(message) ? 'tempo' : /time signature|beat unit|beats per bar/i.test(message) ? 'time' : /soundbank/i.test(message) ? 'kit' : null;
  const unreadable = message.match(/^Cannot read: (.*?)\. Use /)?.[1];
  const unknown = message.match(/^Unknown instrument (\w+)/)?.[1];
  let offset = 0;
  for (const line of source.split('\n')) {
    if (inScope(offset)) {
      if (control && new RegExp(`^\\s*${control}\\b`).test(line)) {
        try { parsePassage(line, 'Passage 1'); }
        catch (caught) { if (errorMessage(caught) === message) return range(offset + Math.max(0, line.search(/\S/)), line.trim().length); }
      }
      if (unreadable && line.trim() === unreadable || unknown && new RegExp(`^\\s*${unknown}\\b`).test(line)) return range(offset + Math.max(0, line.search(/\S/)), line.trim().length);
    }
    offset += line.length + 1;
  }
  return range(passage.start, Math.max(1, source.slice(passage.start).split('\n')[0].length));
}
