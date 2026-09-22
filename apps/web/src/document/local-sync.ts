/**
 * `useDocumentReady` 가 기다리는 두 원천(로컬 IndexedDB, 원격 websocket)
 * 각각을 시간으로 가둔다. 이 파일의 이름은 로컬 쪽에서 왔지만, 원격 쪽도
 * **같은 이유로** 가둬야 해서 함께 산다 — 아래 `waitForTimeout` 참고.
 *
 * ## 로컬: `y-indexeddb` 가 **비동기로** 못 열리는 경우
 *
 * `IndexeddbPersistence` 생성자는 `idb.openDB` 를 곧바로 부르지 않고 안에서
 * `.then(...)` 으로 잇는다. 그 열기가 거부되면(사생활 보호 창이 나중에
 * 막거나, 다른 탭이 스키마를 올려 버전이 꼬이는 등) 그 실패를 밖으로 알릴
 * 이벤트가 없다 — `whenSynced` 는 `'synced'` 이벤트가 나갈 때만 풀리는데,
 * 그 이벤트를 내는 콜백 자체가 절대 안 불린다.
 *
 * `connectProviders` 는 **동기적** 생성자 실패만 잡는다(`providers.ts`).
 * `waitForLocal` 은 그 나머지 — 생성자는 넘어갔지만 열기가 나중에 조용히
 * 실패하는 경우 — 를 가둔다. 못 잡으면 `useDocumentReady` 가 `whenSynced` 를
 * 영영 기다리고, "불러오는 중" 화면이 영영 안 바뀐다. 이 저장소가 가장
 * 피하려는 결과다.
 */
export const LOCAL_SYNC_TIMEOUT_MS = 4000;

/**
 * 원격: SSR 이 서버를 봤다고 했어도(`serverReachable`), 그 사이 끊겼을 수
 * 있다 — 서버가 막 내려갔거나, 네트워크가 끊겼거나, 프록시가 업그레이드를
 * 거절하는 경우 전부 `providers.remote.once('sync', ...)` 를 영영 안
 * 부른다. 로컬 쪽과 똑같은 모양의 영구 대기라, 똑같이 시간으로 가둔다.
 *
 * 8 초를 골랐다. 이 저장소의 e2e 검사가 실측한 정상적인 첫 동기화는 1 초
 * 안팎이다(`smoke.spec.ts` 의 씨앗 검사들). 느린 연결에서도 안 눌릴 만큼
 * 넉넉히 벌리면서, `y-websocket` 자체가 "이미 붙었던 연결이 끊겼다" 고
 * 판단하는 30 초 워치독(`smoke.spec.ts` 의 "끊기면 이 브라우저에만 있다고
 * 말한다" 검사 참고 — 다른 상황이지만 이 라이브러리가 재는 시간 감각의
 * 기준점이다)보다는 훨씬 짧게 잡아, "이대로는 안 될 것 같다" 는 신호를 그보다
 * 앞서 낸다.
 */
export const REMOTE_SYNC_TIMEOUT_MS = 8000;

export interface LocalLike {
  readonly whenSynced: Promise<unknown>;
}

/**
 * `local` 이 없으면(저장소를 아예 못 씀) 곧바로 `'unavailable'`.
 * 있으면 `whenSynced` 와 시간제한을 겨룬다 — 시간 안에 못 풀리면 그것도
 * `'unavailable'` 로, 열렸지만 빈 것과 같은 대접을 받는다(둘 다 로컬에서는
 * 채울 수 없다는 뜻이다).
 */
export function waitForLocal(
  local: LocalLike | undefined,
  timeoutMs: number = LOCAL_SYNC_TIMEOUT_MS,
): Promise<'synced' | 'unavailable'> {
  if (local === undefined) return Promise.resolve('unavailable');

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve('unavailable'), timeoutMs);
    void local.whenSynced.then(() => {
      clearTimeout(timer);
      resolve('synced');
    });
  });
}

/**
 * `timeoutMs` 뒤에 풀리는 약속 하나. **누구의 구독도 안 뗀다** — `waitForLocal`
 * 과 달리 이 함수는 "포기" 를 표현하지 않는다. 부른 쪽이 여전히 붙들고 있는
 * 이벤트 구독(예: `providers.remote.once('sync', ...)`)은 이 약속이 풀린
 * 뒤에도 그대로 살아 있다 — 늦게라도 진짜 붙으면 그 콜백은 그때 불린다.
 * 이 약속이 하는 일은 "그때까지 기다리지 않고 되돌릴 길을 보여 준다" 는
 * 신호 하나뿐이다.
 *
 * `cancel()` 은 기다리던 쪽이 먼저 끝났을 때(예: `done()` 이 먼저 불렸거나,
 * 컴포넌트가 언마운트됐을 때) 타이머를 치우는 용도다 — 안 치우면 사라진
 * 뒤에도 타이머가 남아 있다가 아무도 안 볼 상태를 켠다.
 */
export function waitForTimeout(timeoutMs: number): { promise: Promise<void>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout>;
  const promise = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  return { promise, cancel: () => clearTimeout(timer) };
}
