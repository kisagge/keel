'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createMeasure, parseSource, sceneOf } from '../document/derive.js';
import type { KeelDocument } from '../document/keel-document.js';
import { withDrag, yMapReader } from '../document/layout-reader.js';
import type { Drag } from '../document/layout-reader.js';
import { useCanvas } from '../hooks/use-canvas.js';
import { useKeelDocument } from '../hooks/use-keel-document.js';
import { wheelToViewport } from '../interaction/wheel.js';

export function CanvasPane({ document }: { document: KeelDocument }) {
  const source = useKeelDocument(document);
  const [selection] = useState<ReadonlySet<string>>(() => new Set());

  const dragRef = useRef<Drag | undefined>(undefined);

  /**
   * 글자는 **진짜 캔버스로** 잰다. 어림 측정기와 실측이 어긋나면 상자 너비가
   * 화면에서만 달라져, 손으로 맞춘 자리가 미묘하게 밀린 것처럼 보인다.
   *
   * 그리는 캔버스가 아니라 따로 만든 것을 쓴다 — 마운트를 기다리지 않아도 되고,
   * 재는 일이 그리는 상태(`font` 속성)를 건드리지 않는다. 서버에서는 캔버스가
   * 없으므로 어림으로 떨어진다(그쪽은 어차피 안 그린다).
   */
  const measure = useMemo(() => {
    if (typeof window === 'undefined') return createMeasure(undefined);
    return createMeasure(window.document.createElement('canvas').getContext('2d') ?? undefined);
  }, []);

  const { graph } = useMemo(() => parseSource(source), [source]);
  // graphRef.current = graph 를 렌더 중에 바로 하지 않는다 — 렌더는 순수해야
  // 한다. sceneAt 은 rAF 로 늦게 불리므로 커밋 뒤 effect 에서 고쳐도 늦지 않다.
  const graphRef = useRef(graph);
  useEffect(() => {
    graphRef.current = graph;
  });

  const sceneAt = useCallback(
    () =>
      sceneOf(
        graphRef.current,
        withDrag(yMapReader(document.layout), dragRef.current),
        measure,
      ),
    [document, measure],
  );

  const canvas = useCanvas({ sceneAt, selection });
  const { canvasRef, invalidate, viewportRef, toScreen, fit } = canvas;

  // 문서가 바뀌면 다시 그린다
  useEffect(() => {
    invalidate();
  }, [source, invalidate]);

  // 레이아웃이 바뀌어도 다시 그린다 (남이 옮겼거나 되돌렸을 때)
  useEffect(() => {
    const onChange = () => invalidate();
    document.layout.observe(onChange);
    return () => document.layout.unobserve(onChange);
  }, [document, invalidate]);

  // 첫 장면은 내용에 맞춰 둔다
  useEffect(() => {
    const id = window.requestAnimationFrame(fit);
    return () => window.cancelAnimationFrame(id);
  }, [fit]);

  const onWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      viewportRef.current = wheelToViewport(
        viewportRef.current,
        { deltaX: e.deltaX, deltaY: e.deltaY, ctrlKey: e.ctrlKey },
        toScreen(e.clientX, e.clientY),
      );
      invalidate();
    },
    [invalidate, toScreen, viewportRef],
  );

  /**
   * React 의 `onWheel` 은 수동 리스너라 `preventDefault` 가 안 먹는다.
   * 브라우저가 페이지를 확대해 버리므로 직접 붙인다.
   */
  const wheelTarget = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const element = wheelTarget.current;
    if (element === null) return;
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  return (
    <div ref={wheelTarget} style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}
