import type { Diagnostic } from '@keel/dsl';
import { describe, expect, it } from 'vitest';
import { toCmDiagnostics } from '../src/document/cm-diagnostics.js';

/** 자리 하나만 가리키는 진단 — 파서가 "여기서 빠졌다" 를 말하는 꼴 */
function pointAt(position: number): Diagnostic {
  return {
    severity: 'error',
    code: 'expected-id',
    message: '이름이 빠졌다',
    line: 0,
    span: { start: position, end: position },
  };
}

describe('toCmDiagnostics', () => {
  it('폭 0 인 진단을 최소 한 글자로 벌린다', () => {
    const [d] = toCmDiagnostics([pointAt(3)], 10);
    expect(d).toMatchObject({ from: 3, to: 4 });
  });

  it('문서 끝의 폭 0 인 진단을 문서 밖으로 내보내지 않는다', () => {
    // CodeMirror 는 doc.length 를 넘는 범위를 받으면 던진다.
    // 벌리기가 마지막 자리에서 딱 한 글자 넘어간다.
    const [d] = toCmDiagnostics([pointAt(10)], 10);
    expect(d?.to).toBeLessThanOrEqual(10);
    expect(d?.from).toBeLessThanOrEqual(d?.to ?? 0);
  });
});
