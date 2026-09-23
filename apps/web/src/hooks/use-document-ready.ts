'use client';

import { useEffect, useState } from 'react';
import type { KeelDocument } from '../document/keel-document.js';
import { REMOTE_SYNC_TIMEOUT_MS, waitForLocal, waitForTimeout } from '../document/local-sync.js';
import type { Providers } from '../document/providers.js';

/**
 * 내용이 있기 전에는 에디터를 세우지 않는다.
 *
 * 빈 채로 띄우면 `yCollab` 이 나중에 도착한 변경을 반영하긴 하지만, 그 사이에
 * 사람이 글자를 치면 **아직 도착하지 않은 씨앗과 섞인다.** 문서는 CRDT 라
 * 안 깨져도 사람이 보기엔 글자가 엉뚱한 자리에 꽂힌다. 게다가 빈 문서는
 * 진단 목록에 오류를 띄워 켜자마자 빨간 줄을 보게 된다.
 *
 * 기다리는 규칙이 두 갈래다.
 *
 * 1. 로컬을 먼저 기다린다 — IndexedDB 라 빠르다. 다만 무한정 기다리지는
 *    않는다: `waitForLocal` 이 시간으로 가둔다(`local-sync.ts` 참고) —
 *    `y-indexeddb` 는 비동기 open 실패를 알릴 이벤트가 없어서, 안 가두면
 *    이 훅이 영영 안 풀린다.
 * 2. 그러고도 비어 있으면(첫 방문, 저장소 없음, 시간초과 전부 포함) 원격까지
 *    기다린다. 비어 있지 않으면 **즉시 띄운다** — 두 번째 방문부터는
 *    네트워크를 안 기다린다. 이 기다림도 무한정이 아니다 — `remoteTimedOut`
 *    참고.
 */
export interface DocumentReady {
  readonly ready: boolean;
  /**
   * 로컬에서 채울 수 없다 — 동기화는 끝났는데 문서가 비었거나, 저장소를 아예
   * 못 쓰거나(`providers.local === undefined`), 열리다 시간이 초과됐다. 세
   * 경우 모두 서버 없이는 채울 길이 없다는 점에서 같다.
   */
  readonly localCannotFill: boolean;
  /**
   * 로컬에서 못 채운 채로 원격 `'sync'` 를 `REMOTE_SYNC_TIMEOUT_MS` 만큼
   * 기다렸는데도 안 왔다. **포기가 아니다** — 원격 구독은 그대로 살아
   * 있어서, 이 값이 `true` 가 된 뒤에도 정말 붙으면 `ready` 가 뒤따라
   * 켜진다(자체 회복). 이 값은 "그때까지는 기다리지 않고 되돌릴 길을
   * 보여 준다" 는 신호일 뿐이다.
   */
  readonly remoteTimedOut: boolean;
}

export function useDocumentReady(
  keelDocument: KeelDocument,
  providers: Providers | undefined,
): DocumentReady {
  const [ready, setReady] = useState(false);
  const [localCannotFill, setLocalCannotFill] = useState(false);
  const [remoteTimedOut, setRemoteTimedOut] = useState(false);

  useEffect(() => {
    if (providers === undefined) return;
    let cancelled = false;
    let cancelRemoteTimeout: (() => void) | undefined;

    const done = (): void => {
      cancelRemoteTimeout?.();
      if (!cancelled) setReady(true);
    };

    void (async () => {
      await waitForLocal(providers.local);
      if (cancelled) return;
      // outcome 자체는 안 본다 — 'unavailable' 이 시간초과로 왔더라도(로컬이
      // 아니라 시계가 이긴 것뿐) 그 사이 원격이 이미 동기화를 끝내 내용이
      // 찼을 수 있다. 그런데도 outcome 만 보고 아래 'sync' 구독으로 내려가면
      // 다시는 안 올 이벤트를 기다리다 8 초 뒤 UnreachableServer 를 보여준다 —
      // 문서가 이미 메모리에 다 있는데도. 그래서 내용이 있는지만 본다
      if (keelDocument.source.length > 0) return done();

      // 로컬에서 못 채웠다(비었거나, 없거나, 시간초과). 서버가 채워 줄 때까지
      // 기다린다 — 이 구독은 아래 시간제한이 지나도 안 뗀다. 늦게라도 정말
      // 붙으면 이 콜백이 그때 불린다
      setLocalCannotFill(true);
      providers.remote.once('sync', done);

      // 여기까지 왔다는 것은 서버가 채워 주길 기다리고 있다는 뜻이다. 그
      // 기다림을 무한정 두면 `waitForLocal` 이 고치기 전의 그 영구 대기와
      // 같은 모양이 된다 — SSR 이 서버를 봤다고 했어도, 그 사이 끊겼을 수
      // 있다. 시간이 지나면 `remoteTimedOut` 만 켜고, 구독은 그대로 둔다
      const { promise: timedOut, cancel } = waitForTimeout(REMOTE_SYNC_TIMEOUT_MS);
      cancelRemoteTimeout = cancel;
      await timedOut;
      if (!cancelled) setRemoteTimedOut(true);
    })();

    return () => {
      cancelled = true;
      cancelRemoteTimeout?.();
      // `off('sync', done)` 은 여기 없다 — `once` 를 lib0 Observable 이 안에서
      // 감싸므로 그 래퍼가 실제로 등록된 리스너이고, `done` 자체로는 못
      // 찾아 뗀다. 걸어도 아무 일이 안 일어나는 코드라 지웠다. 새는 것을
      // 막는 것은 위의 `cancelled` 플래그(콜백이 불려도 `setReady` 를 안 함)와,
      // 같은 teardown 에서 provider 자체가 파괴되어 다시는 'sync' 를 안 내는
      // 것 둘이다
    };
  }, [keelDocument, providers]);

  return { ready, localCannotFill, remoteTimedOut };
}
