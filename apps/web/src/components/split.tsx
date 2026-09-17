'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { DEFAULT_RATIO, clampRatio, loadRatio, saveRatio } from './split-ratio.js';

/**
 * 좌우 분할. 비율을 다루는 부분은 `split-ratio.ts` 에 있다.
 */
export function Split({ left, right }: { readonly left: ReactNode; readonly right: ReactNode }) {
  /**
   * 서버에서는 localStorage 가 없다. 첫 그리기는 기본값으로 하고 뒤에 맞춘다.
   *
   * rAF 로 한 틀 늦춰 부른다 — effect 몸통에서 곧바로 `setRatio` 를 부르면
   * 린터가 "동기 setState" 로 잡는다(진짜 문제는, 첫 그리기와 하이드레이션이
   * 서버와 같은 기본값을 봐야 어긋나지 않는다는 것이라 지연 자체가 목적이다).
   */
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setRatio(loadRatio()));
    return () => window.cancelAnimationFrame(id);
  }, []);

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
    setRatio(clampRatio((e.clientX - rect.left) / rect.width));
  }, []);

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.currentTarget.releasePointerCapture(e.pointerId);
      dragging.current = false;
      saveRatio(ratio);
    },
    [ratio],
  );

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
          if (e.key === 'ArrowLeft') setRatio((r) => clampRatio(r - 0.02));
          if (e.key === 'ArrowRight') setRatio((r) => clampRatio(r + 0.02));
        }}
        onBlur={() => saveRatio(ratio)}
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
