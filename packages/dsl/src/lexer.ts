import type { Span } from './types.js';

export type TokenType =
  | 'ident'
  | 'string'
  | 'arrow' // ->
  | 'line' //  --
  | 'lbrace'
  | 'rbrace'
  | 'newline'
  | 'eof'
  | 'unknown';

export interface Token {
  readonly type: TokenType;
  /** ident 는 글자 그대로, string 은 따옴표를 벗기고 이스케이프를 푼 값 */
  readonly value: string;
  readonly span: Span;
  readonly line: number;
  /** string 토큰이 닫는 따옴표를 만나지 못한 채 줄이 끝났다 */
  readonly unterminated?: true;
}

const IDENT_START = /[A-Za-z_]/;
const IDENT_REST = /[A-Za-z0-9_-]/;

/**
 * 줄 단위 토크나이저.
 *
 * 주석(`#`)은 토큰으로 내보내지 않고 버린다 — 파서가 볼 일이 없다.
 * 다만 **줄바꿈은 토큰으로 낸다.** 이 문법은 한 줄이 한 문장이라, 줄바꿈이
 * 문장의 끝을 알려 주는 유일한 표시이기 때문이다. 이 덕분에 한 줄이 깨져도
 * 다음 줄부터 정상으로 돌아올 수 있다.
 */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 0;
  const n = source.length;

  const push = (type: TokenType, value: string, start: number, end: number, unterminated?: true) => {
    tokens.push(unterminated
      ? { type, value, span: { start, end }, line, unterminated }
      : { type, value, span: { start, end }, line });
  };

  while (i < n) {
    const c = source[i]!;

    if (c === '\n') {
      push('newline', '\n', i, i + 1);
      i += 1;
      line += 1;
      continue;
    }

    // 공백 (줄바꿈 제외)
    if (c === ' ' || c === '\t' || c === '\r') {
      i += 1;
      continue;
    }

    // 주석: 줄 끝까지 버린다
    if (c === '#') {
      while (i < n && source[i] !== '\n') i += 1;
      continue;
    }

    if (c === '{') {
      push('lbrace', '{', i, i + 1);
      i += 1;
      continue;
    }

    if (c === '}') {
      push('rbrace', '}', i, i + 1);
      i += 1;
      continue;
    }

    if (c === '-' && source[i + 1] === '>') {
      push('arrow', '->', i, i + 2);
      i += 2;
      continue;
    }

    if (c === '-' && source[i + 1] === '-') {
      push('line', '--', i, i + 2);
      i += 2;
      continue;
    }

    if (c === '"') {
      const start = i;
      i += 1;
      let value = '';
      let closed = false;
      while (i < n) {
        const ch = source[i]!;
        if (ch === '\n') break; // 문자열은 줄을 넘지 않는다
        if (ch === '\\' && i + 1 < n && source[i + 1] !== '\n') {
          value += source[i + 1];
          i += 2;
          continue;
        }
        if (ch === '"') {
          i += 1;
          closed = true;
          break;
        }
        value += ch;
        i += 1;
      }
      if (closed) push('string', value, start, i);
      else push('string', value, start, i, true);
      continue;
    }

    if (IDENT_START.test(c)) {
      const start = i;
      i += 1;
      while (i < n && IDENT_REST.test(source[i]!)) i += 1;
      push('ident', source.slice(start, i), start, i);
      continue;
    }

    push('unknown', c, i, i + 1);
    i += 1;
  }

  push('eof', '', n, n);
  return tokens;
}
