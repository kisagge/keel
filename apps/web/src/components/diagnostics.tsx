'use client';

import type { Diagnostic } from '@keel/dsl';

const severityColor: Record<Diagnostic['severity'], string> = {
  error: '#b91c1c',
  warning: '#b45309',
  info: 'var(--keel-muted)',
};

/**
 * 진단 목록.
 *
 * 밑줄만으로는 화면 밖의 잘못을 못 본다. 목록이 있으면 "선언 없이 만들어진
 * 노드" 같은 조용한 경고도 눈에 들어온다 — 오타가 새 노드가 되는 대가를
 * 여기서 갚는다.
 */
export function DiagnosticsList({
  diagnostics,
  onGoTo,
}: {
  readonly diagnostics: readonly Diagnostic[];
  readonly onGoTo: (position: number) => void;
}) {
  if (diagnostics.length === 0) {
    return (
      <p style={{ margin: 0, padding: '8px 12px', color: 'var(--keel-muted)', fontSize: 12 }}>
        문제 없음
      </p>
    );
  }

  return (
    <ul style={{ margin: 0, padding: '4px 0', listStyle: 'none', overflowY: 'auto', fontSize: 12 }}>
      {diagnostics.map((d) => (
        <li key={`${d.code}:${d.span.start}:${d.span.end}`}>
          <button
            type="button"
            onClick={() => onGoTo(d.span.start)}
            style={{
              display: 'block',
              width: '100%',
              padding: '4px 12px',
              border: 0,
              background: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              // 셋을 눈으로 갈라야 한다 — 경고를 알림과 같은 색으로 두면
              // "선언 없이 생긴 노드" 같은 조용한 경고가 목록에 묻힌다
              color: severityColor[d.severity],
            }}
          >
            {d.line + 1}행 · {d.message}
          </button>
        </li>
      ))}
    </ul>
  );
}
