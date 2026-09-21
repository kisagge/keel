'use client';

import { useEffect, useState } from 'react';
import type { KeelDocument } from '../document/keel-document.js';
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
 * 1. 로컬을 먼저 기다린다 — IndexedDB 라 빠르다.
 * 2. 그러고도 비어 있으면(첫 방문) 원격까지 기다린다. 비어 있지 않으면
 *    **즉시 띄운다** — 두 번째 방문부터는 네트워크를 안 기다린다.
 */
export function useDocumentReady(
  keelDocument: KeelDocument,
  providers: Providers | undefined,
): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (providers === undefined) return;
    let cancelled = false;

    const done = (): void => {
      if (!cancelled) setReady(true);
    };

    void (async () => {
      await providers.local?.whenSynced;
      if (cancelled) return;
      if (keelDocument.source.length > 0) return done();

      // 로컬이 비었다. 서버가 채워 줄 때까지 기다린다
      providers.remote.once('sync', done);
    })();

    return () => {
      cancelled = true;
      providers.remote.off('sync', done);
    };
  }, [keelDocument, providers]);

  return ready;
}
