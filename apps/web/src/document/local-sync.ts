/**
 * `y-indexeddb` 가 **비동기로** 못 열리는 경우를 시간으로 가둔다.
 *
 * `IndexeddbPersistence` 생성자는 `idb.openDB` 를 곧바로 부르지 않고 안에서
 * `.then(...)` 으로 잇는다. 그 열기가 거부되면(사생활 보호 창이 나중에
 * 막거나, 다른 탭이 스키마를 올려 버전이 꼬이는 등) 그 실패를 밖으로 알릴
 * 이벤트가 없다 — `whenSynced` 는 `'synced'` 이벤트가 나갈 때만 풀리는데,
 * 그 이벤트를 내는 콜백 자체가 절대 안 불린다.
 *
 * `connectProviders` 는 **동기적** 생성자 실패만 잡는다(`providers.ts`).
 * 이 함수는 그 나머지 — 생성자는 넘어갔지만 열기가 나중에 조용히 실패하는
 * 경우 — 를 가둔다. 못 잡으면 `useDocumentReady` 가 `whenSynced` 를 영영
 * 기다리고, "불러오는 중" 화면이 영영 안 바뀐다. 이 저장소가 가장 피하려는
 * 결과다.
 */
export const LOCAL_SYNC_TIMEOUT_MS = 4000;

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
