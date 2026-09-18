'use client';

import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { getRatio, getServerRatio, saveRatio, setRatio, subscribeRatio } from './split-ratio.js';

/**
 * 좌우 분할. 비율을 다루는 부분은 `split-ratio.ts` 에 있다.
 */
export function Split({ left, right }: { readonly left: ReactNode; readonly right: ReactNode }) {
  /**
   * `localStorage` 는 React 밖의 저장소라 `useSyncExternalStore` 가 정식
   * 통로다 — 이유는 `split-ratio.ts` 위쪽 주석에 적었다.
   */
  const ratio = useSyncExternalStore(subscribeRatio, getRatio, getServerRatio);

  const host = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const rect = host.current?.getBoundingClientRect();
    if (rect === undefined || rect.width === 0) return;
    setRatio((e.clientX - rect.left) / rect.width);
  }, []);

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragging.current = false;
    saveRatio(getRatio());
  }, []);

  return (
    <div
      ref={host}
      style={{
        height: '100%',
        display: 'grid',
        gridTemplateColumns: `${ratio * 100}% 6px 1fr`,
      }}
    >
      <div style={{ minWidth: 0, minHeight: 0 }}>{left}</div>

      {/* 손잡이. 키보드로도 옮길 수 있어야 하므로 진짜 분리자로 알린다 */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={Math.round(ratio * 100)}
        aria-label="편집기와 캔버스의 너비"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setRatio(getRatio() - 0.02);
          if (e.key === 'ArrowRight') setRatio(getRatio() + 0.02);
        }}
        onBlur={() => saveRatio(getRatio())}
        style={{
          cursor: 'col-resize',
          background: 'var(--keel-border)',
          touchAction: 'none',
        }}
      />

      <div style={{ position: 'relative', minWidth: 0, minHeight: 0 }}>{right}</div>
    </div>
  );
}
