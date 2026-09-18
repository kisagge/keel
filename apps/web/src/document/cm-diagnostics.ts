import type { Diagnostic as CmDiagnostic } from '@codemirror/lint';
import type { Diagnostic } from '@keel/dsl';

/**
 * 파서의 진단을 CodeMirror 의 진단으로 옮긴다.
 *
 * 폭 0 인 진단이 온다. 파서는 "여기서 무언가가 빠졌다" 를 자리 하나로 가리키는데,
 * CodeMirror 는 폭 0 짜리 밑줄을 못 그린다. 그래서 최소 한 글자로 벌린다.
 *
 * 컴포넌트에서 떼어 둔 이유는 **문서 끝에서 벌리면 범위를 넘기 때문**이다.
 * 그 경계는 검사로 묶여 있다.
 */
export function toCmDiagnostics(
  diagnostics: readonly Diagnostic[],
  docLength: number,
): CmDiagnostic[] {
  return diagnostics.map((d) => {
    // 벌린 끝이 문서 밖으로 나가면 CodeMirror 가 던진다. 문서 끝에 붙은
    // 폭 0 짜리는 벌릴 자리가 없으므로 그대로 둔다.
    const to = Math.min(Math.max(d.span.start + 1, d.span.end), docLength);
    return {
      from: Math.min(d.span.start, to),
      to,
      severity: d.severity,
      message: d.message,
      source: d.code,
    };
  });
}
