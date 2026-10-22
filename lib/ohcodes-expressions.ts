// A deliberately small numeric language. Never execute the user's source as JavaScript.
const MAX_EXPRESSION_LENGTH = 2048;
const MAX_TOKENS = 256;
const MAX_DEPTH = 32;
const MAX_MAGNITUDE = Number.MAX_SAFE_INTEGER;

type Token = { kind: 'number'; value: number } | { kind: '+' | '-' | '*' | '/' | '(' | ')' };

export function evaluateNumber(source: string, label = 'Number'): number {
  const fail = (message: string): never => { throw new Error(`${label}: ${message}`); };
  const checked = (value: number) => {
    if (!Number.isFinite(value) || Math.abs(value) > MAX_MAGNITUDE) fail('arithmetic result is too large; use smaller numbers.');
    return value;
  };
  if (source.length > MAX_EXPRESSION_LENGTH) fail(`expression is too long (maximum ${MAX_EXPRESSION_LENGTH} characters).`);
  const text = source.trim();
  if (!text) fail('enter a number or an arithmetic expression.');
  const tokens: Token[] = [];
  for (let index = 0; index < text.length;) {
    const char = text[index];
    if (/\s/.test(char)) { index += 1; continue; }
    if ('+-*/()'.includes(char)) {
      tokens.push({ kind: char as Exclude<Token['kind'], 'number'> });
      index += 1;
    } else {
      const number = text.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)/)?.[0];
      if (!number) return fail('use decimal numbers, +, -, *, /, and parentheses only.');
      tokens.push({ kind: 'number', value: checked(Number(number)) });
      index += number.length;
    }
    if (tokens.length > MAX_TOKENS) fail(`expression has too many terms (maximum ${MAX_TOKENS} tokens).`);
  }
  let cursor = 0;
  function atom(depth: number): number {
    if (depth > MAX_DEPTH) fail(`parentheses or signs are nested too deeply (maximum ${MAX_DEPTH}).`);
    const token = tokens[cursor++];
    if (!token) return fail('expected a number after the operator.');
    if (token.kind === 'number') return token.value;
    if (token.kind === '+') return atom(depth + 1);
    if (token.kind === '-') return checked(-atom(depth + 1));
    if (token.kind === '(') {
      const value = addition(depth + 1);
      if (tokens[cursor]?.kind !== ')') fail('close the arithmetic parentheses with ).');
      cursor += 1;
      return value;
    }
    return fail('expected a number or parentheses; write multiplication with a single *.');
  }
  function multiplication(depth: number): number {
    let value = atom(depth);
    while (tokens[cursor]?.kind === '*' || tokens[cursor]?.kind === '/') {
      const operator = tokens[cursor++].kind;
      const right = atom(depth);
      if (operator === '/' && right === 0) fail('cannot divide by zero.');
      value = checked(operator === '*' ? value * right : value / right);
    }
    return value;
  }
  function addition(depth: number): number {
    let value = multiplication(depth);
    while (tokens[cursor]?.kind === '+' || tokens[cursor]?.kind === '-') {
      const operator = tokens[cursor++].kind;
      const right = multiplication(depth);
      value = checked(operator === '+' ? value + right : value - right);
    }
    return value;
  }
  const result = addition(0);
  if (cursor !== tokens.length) fail('unexpected number or parenthesis; separate numbers with +, -, *, or /.');
  return Object.is(result, -0) ? 0 : result;
}

// Split argument lists without treating delimiters inside expressions or quotes as separators.
function splitOutside(source: string, delimiter: string | null): string[] {
  if (source.length > 32768) throw new Error('Expression list is too long.');
  const result: string[] = [];
  const stack: string[] = [];
  const closeFor: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  let quote = '', escaped = false, start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (closeFor[char]) {
      stack.push(closeFor[char]);
      if (stack.length > MAX_DEPTH) throw new Error(`Expression parentheses are nested too deeply (maximum ${MAX_DEPTH}).`);
      continue;
    }
    if (')]}'.includes(char)) {
      if (stack.pop() !== char) throw new Error(`Expression has an unmatched ${char}.`);
      continue;
    }
    if (!stack.length && (delimiter === null ? /\s/.test(char) : char === delimiter)) {
      const part = source.slice(start, index).trim();
      if (delimiter !== null || part) result.push(part);
      start = index + 1;
    }
  }
  if (quote) throw new Error('Expression has an unclosed quote.');
  if (stack.length) throw new Error(`Expression is missing ${stack[stack.length - 1]}.`);
  const last = source.slice(start).trim();
  if (delimiter !== null || last) result.push(last);
  return result;
}

export function splitTopLevel(source: string, delimiter: string): string[] {
  if (delimiter.length !== 1 || '()[]{}\"\''.includes(delimiter)) throw new Error('Expression delimiter must be one non-bracket character.');
  return splitOutside(source, delimiter);
}

// Rhythm events remain whitespace-separated; parentheses keep a weight expression together.
export function splitExpressionTokens(source: string): string[] {
  return splitOutside(source, null);
}
