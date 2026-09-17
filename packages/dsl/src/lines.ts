import type { Span } from './types.js';

/** 각 줄이 시작하는 오프셋. 0번 줄은 늘 0 에서 시작한다 */
export function lineStarts(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

/** 줄바꿈을 **뺀** 줄의 구간 */
export function lineSpan(source: string, line: number, starts = lineStarts(source)): Span {
  const start = starts[line] ?? source.length;
  const next = starts[line + 1];
  const end = next === undefined ? source.length : next - 1;
  return { start, end };
}

/** 줄 앞의 공백을 그대로 돌려준다 — 그룹 안에 줄을 넣을 때 들여쓰기를 맞춘다 */
export function indentOf(source: string, line: number, starts = lineStarts(source)): string {
  const { start, end } = lineSpan(source, line, starts);
  let i = start;
  while (i < end && (source[i] === ' ' || source[i] === '\t')) i += 1;
  return source.slice(start, i);
}
