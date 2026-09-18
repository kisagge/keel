'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { KeelDocument } from '../document/keel-document.js';

/**
 * `Y.Text` 를 React 에 잇는다.
 *
 * Yjs 는 React 밖의 저장소이므로 `useSyncExternalStore` 가 정식 통로다.
 * `useEffect` + `useState` 로 흉내 내면 첫 그리기와 구독 사이에 틈이 생겨,
 * 그 사이에 들어온 갱신을 놓친다.
 *
 * **문서가 바뀔 때만** 다시 그린다 — 마우스를 움직이는 것과는 무관하다.
 */
export function useKeelDocument(document: KeelDocument): string {
  const subscribe = useCallback(
    (onChange: () => void) => {
      document.source.observe(onChange);
      return () => document.source.unobserve(onChange);
    },
    [document],
  );

  const getSnapshot = useCallback(() => document.source.toString(), [document]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
