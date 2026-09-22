'use client';

import { useEffect, useState } from 'react';
import type { KeelDocument } from '../document/keel-document.js';
import { waitForLocal } from '../document/local-sync.js';
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
 *    네트워크를 안 기다린다.
 */
export interface DocumentReady {
  readonly ready: boolean;
  /**
   * 로컬에서 채울 수 없다 — 동기화는 끝났는데 문서가 비었거나, 저장소를 아예
   * 못 쓰거나(`providers.local === undefined`), 열리다 시간이 초과됐다. 세
   * 경우 모두 서버 없이는 채울 길이 없다는 점에서 같다.
   */
  readonly localEmpty: boolean;
}

export function useDocumentReady(
  keelDocument: KeelDocument,
  providers: Providers | undefined,
): DocumentReady {
  const [ready, setReady] = useState(false);
  const [localEmpty, setLocalEmpty] = useState(false);

  useEffect(() => {
    if (providers === undefined) return;
    let cancelled = false;

    const done = (): void => {
      if (!cancelled) setReady(true);
    };

    void (async () => {
      const outcome = await waitForLocal(providers.local);
      if (cancelled) return;
      if (outcome === 'synced' && keelDocument.source.length > 0) return done();

      // 로컬에서 못 채웠다(비었거나, 없거나, 시간초과). 서버가 채워 줄 때까지 기다린다
      setLocalEmpty(true);
      providers.remote.once('sync', done);
    })();

    return () => {
      cancelled = true;
      providers.remote.off('sync', done);
    };
  }, [keelDocument, providers]);

  return { ready, localEmpty };
}
