'use client';

/**
 * 서버에 못 붙었고, 이 브라우저에 채울 사본도 없다.
 *
 * "채울 사본이 없다" 는 두 갈래를 함께 가리킨다 — 로컬 저장을 아예 못 쓰는
 * 경우(`providers.local === undefined`)와, 로컬은 열렸지만 비어 있는 경우
 * (`localEmpty`, `use-document-ready.ts` 참고) 둘 다 서버 없이는 채울 길이
 * 없다는 점에서 같다. 이 화면으로 보내지 않으면 "불러오는 중" 이 영영 뜬다 —
 * 이 저장소가 가장 피하려는 결과다.
 */
export function UnreachableServer() {
  return (
    <main
      data-testid="unreachable-server"
      style={{ display: 'grid', placeItems: 'center', height: '100dvh', padding: 24 }}
    >
      <p style={{ color: 'var(--keel-muted)', textAlign: 'center' }}>
        서버에 연결할 수 없고, 이 브라우저에 사본도 없다.
        <br />
        연결이 돌아오면 새로고침한다.
      </p>
    </main>
  );
}
