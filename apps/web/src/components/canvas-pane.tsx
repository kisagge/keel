'use client';

import type { Hit } from '@keel/renderer';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { moveNode } from '../document/commands.js';
import { createMeasure, parseSource, sceneOf } from '../document/derive.js';
import type { KeelDocument } from '../document/keel-document.js';
import { withDrag, yMapReader } from '../document/layout-reader.js';
import type { Drag } from '../document/layout-reader.js';
import { useCanvas } from '../hooks/use-canvas.js';
import { useKeelDocument } from '../hooks/use-keel-document.js';
import { IDLE, onPointerDown, onPointerMove, onPointerUp } from '../interaction/gesture.js';
import type { Gesture, Intent } from '../interaction/gesture.js';
import { wheelToViewport } from '../interaction/wheel.js';
import { TestHook } from './test-hook.js';

/**
 * `handleIntent` 의 `void` 반환이 컴파일러의 소진성 검사를 묵살하지 않도록
 * 한다. Intent 가 늘면 이 가드가 빌드를 깨뜨려 구현을 강제한다.
 */
function assertNever(value: never): never {
  throw new Error(`빠뜨린 의도 종류: ${String(value)}`);
}

export interface CanvasPaneProps {
  readonly document: KeelDocument;
  readonly selection: ReadonlySet<string>;
  readonly onSelect: (hit: Hit | undefined) => void;
}

export function CanvasPane({ document, selection, onSelect }: CanvasPaneProps) {
  const source = useKeelDocument(document);

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

  const [canDraw, setCanDraw] = useState(true);

  /** 캔버스 엘리먼트를 얻자마자 2D 컨텍스트가 나오는지 확인한다 */
  const attach = useCallback(
    (element: HTMLCanvasElement | null) => {
      canvasRef(element);
      if (element !== null) setCanDraw(element.getContext('2d') !== null);
    },
    [canvasRef],
  );

  // 문서가 바뀌면 다시 그린다
  useEffect(() => {
    invalidate();
  }, [source, invalidate]);

  /**
   * 고른 것이 바뀌어도 다시 그린다.
   *
   * `selection` 은 부모가 쥔 React state 라서 `onSelect` 를 부르는 것만으로는
   * 캔버스가 다시 그려지지 않는다 — `useCanvas` 안의 `optionsRef` 갱신은 커밋
   * 뒤 effect 인데, 그 전에 실행되는 무언가가 없으면 아무도 `invalidate()` 를
   * 안 부른다. 다음 팬·줌이나 끌기가 있을 때까지 파란 테두리가 안 보인다.
   */
  useEffect(() => {
    invalidate();
  }, [selection, invalidate]);

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

  const gestureRef = useRef<Gesture>(IDLE);

  const pointerAt = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      const screen = toScreen(e.clientX, e.clientY);
      return { screen, world: canvas.toWorld(screen) };
    },
    [canvas, toScreen],
  );

  const handleIntent = useCallback(
    (intent: Intent) => {
      switch (intent.kind) {
        case 'none':
          return;

        case 'select':
          onSelect(intent.hit);
          return;

        case 'pan':
          viewportRef.current = intent.viewport;
          invalidate();
          return;

        // 끌고 있는 자리는 **아직 문서가 아니다.** ref 에만 두고 그리기만 한다
        case 'drag-move':
          dragRef.current = { id: intent.nodeId, at: intent.at };
          invalidate();
          return;

        /**
         * 놓는 순간 문서가 된다. 중간 좌표까지 CRDT 에 넣으면 실시간 판에서
         * 업데이트 로그가 포인터무브 수만큼 불어난다.
         */
        case 'commit-drag':
          dragRef.current = undefined;
          moveNode(document, intent.nodeId, intent.at);
          invalidate();
          return;

        default:
          return assertNever(intent);
      }
    },
    [document, invalidate, onSelect, viewportRef],
  );

  const onPointerDownHandler = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      const at = pointerAt(e);
      gestureRef.current = onPointerDown(
        gestureRef.current,
        at,
        canvas.hitAt(at.world),
        viewportRef.current,
      );
    },
    [canvas, pointerAt, viewportRef],
  );

  const onPointerMoveHandler = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      const at = pointerAt(e);

      // 가리킨 것은 ref 도 state 도 아니고 커서 모양으로만 나타난다
      if (gestureRef.current.kind === 'idle') {
        canvas.setCursor(canvas.hitAt(at.world)?.kind === 'node' ? 'grab' : 'default');
        return;
      }

      const { gesture, intent } = onPointerMove(gestureRef.current, at);
      gestureRef.current = gesture;
      if (gesture.kind === 'dragging') canvas.setCursor('grabbing');
      handleIntent(intent);
    },
    [canvas, handleIntent, pointerAt],
  );

  const onPointerUpHandler = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.releasePointerCapture(e.pointerId);
      const { gesture, intent } = onPointerUp(gestureRef.current, pointerAt(e));
      gestureRef.current = gesture;
      canvas.setCursor('default');
      handleIntent(intent);
    },
    [canvas, handleIntent, pointerAt],
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
      <canvas
        ref={attach}
        onPointerDown={onPointerDownHandler}
        onPointerMove={onPointerMoveHandler}
        onPointerUp={onPointerUpHandler}
        onPointerCancel={onPointerUpHandler}
        style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
      />

      {/* 캔버스를 못 쓰는 브라우저. 에디터는 그대로 쓸 수 있다 */}
      {!canDraw && (
        <p
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            margin: 0,
            padding: 24,
            textAlign: 'center',
            color: 'var(--keel-muted)',
          }}
        >
          이 브라우저에서는 캔버스를 그릴 수 없다. 왼쪽 텍스트는 그대로 고칠 수 있다.
        </p>
      )}

      <button type="button" onClick={fit} style={fitButton}>
        맞춤
      </button>

      <TestHook sceneAt={sceneAt} viewportRef={viewportRef} />
    </div>
  );
}

const fitButton: CSSProperties = {
  position: 'absolute',
  right: 12,
  bottom: 12,
  padding: '6px 12px',
  border: '1px solid var(--keel-border)',
  borderRadius: 6,
  background: 'var(--keel-surface)',
  font: 'inherit',
  fontSize: 12,
  cursor: 'pointer',
};
