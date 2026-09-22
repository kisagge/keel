'use client';

/**
 * 서버에서 채울 길이 안 보이고, 이 브라우저에 채울 사본도 없다.
 *
 * "채울 사본이 없다" 는 세 갈래를 함께 가리킨다 — 로컬 저장을 아예 못 쓰는
 * 경우(`providers.local === undefined`), 로컬은 열렸지만 비어 있는 경우,
 * `waitForLocal` 이 시간초과로 포기한 경우(모두 `localCannotFill`,
 * `use-document-ready.ts` 참고) — 셋 다 서버 없이는 채울 길이 없다는 점에서
 * 같다.
 *
 * "서버에서 채울 길이 안 보인다" 도 두 갈래다 — SSR 시점에 이미 못 붙었던
 * 경우(`!serverReachable`)와, SSR 은 붙었다고 했는데 그 뒤로 원격 `'sync'`
 * 가 시간 안에 안 온 경우(`remoteTimedOut`, 예: 서버가 막 내려갔거나 네트워크가
 * 끊겼거나 프록시가 업그레이드를 거절한 경우). 뒤쪽은 "정말 끊겼다" 는
 * 확답이 아니라 "이 안에서는 확인이 안 됐다" 는 뜻이라, 문구를 그 둘 다에
 * 맞게 열어 둔다.
 *
 * 이 화면으로 보내지 않으면 "불러오는 중" 이 영영 뜬다 — 이 저장소가 가장
 * 피하려는 결과다. 원격 구독은 이 화면이 뜬 뒤에도 안 끊긴다(`use-document-ready.ts`
 * 의 `done`) — 그래서 "새로고침한다" 뿐 아니라 늦게라도 저절로 붙는 길도
 * 남아 있다.
 */
export function UnreachableServer() {
  return (
    <main
      data-testid="unreachable-server"
      style={{ display: 'grid', placeItems: 'center', height: '100dvh', padding: 24 }}
    >
      <p style={{ color: 'var(--keel-muted)', textAlign: 'center' }}>
        서버에 닿지 않는다 — 끊겨 있거나, 응답이 오래 걸린다.
        <br />
        이 브라우저에는 아직 이 문서의 사본이 없다.
        <br />
        잠시 후 새로고침해 다시 시도한다.
      </p>
    </main>
  );
}
