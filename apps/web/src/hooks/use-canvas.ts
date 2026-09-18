'use client';

import {
  DEFAULT_THEME,
  DEFAULT_VIEWPORT,
  buildSpatialIndex,
  canvasPixelSize,
  fitToContent,
  hitTest,
  paintScene,
  screenToWorld,
} from '@keel/renderer';
import type { Ctx2D, Hit, Point, Scene, SpatialIndex, Viewport } from '@keel/renderer';
import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/**
 * 캔버스를 쥔다 — 엘리먼트, 크기, RAF 루프, 뷰포트.
 *
 * **뷰포트는 React state 가 아니라 ref 다.** 팬·줌은 `pointermove` 마다 바뀌고,
 * state 로 두면 프레임마다 React 재조정이 돈다. 그리기는 ref 만 읽으므로
 * 포인터를 아무리 흔들어도 재조정은 0회다.
 *
 * 장면도 ref 로 들고 있는다. 장면은 문서에서 나오지만 **그리는 쪽은 언제나 가장
 * 최근 것**을 봐야 하고, 그것을 state 로 두면 끌기 프레임마다 재조정이 된다.
 */

export interface UseCanvasOptions {
  /** 그릴 때마다 불린다. 끌기 중이면 끌고 있는 자리가 반영된 장면을 돌려준다 */
  readonly sceneAt: () => Scene;
  readonly selection: ReadonlySet<string>;
}

export interface UseCanvas {
  readonly canvasRef: (element: HTMLCanvasElement | null) => void;
  /** 다음 프레임에 한 번만 다시 그린다 */
  readonly invalidate: () => void;
  readonly viewportRef: RefObject<Viewport>;
  /** 화면 좌표를 월드 좌표로 */
  readonly toWorld: (screen: Point) => Point;
  /** 캔버스 안에서의 화면 좌표 */
  readonly toScreen: (clientX: number, clientY: number) => Point;
  readonly hitAt: (world: Point) => Hit | undefined;
  readonly fit: () => void;
  readonly setCursor: (cursor: string) => void;
}

export function useCanvas(options: UseCanvasOptions): UseCanvas {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const ctx = useRef<Ctx2D | null>(null);
  const viewportRef = useRef<Viewport>(DEFAULT_VIEWPORT);
  const sceneRef = useRef<Scene | null>(null);
  const indexRef = useRef<SpatialIndex | null>(null);
  const frame = useRef<number | null>(null);
  const cssSize = useRef({ width: 0, height: 0 });

  /**
   * 렌더 중에 ref 를 바로 고치면 안 된다 — 렌더는 순수해야 하고, React
   * Compiler 도 그것을 규칙으로 강제한다. 커밋 뒤에 도는 effect 에서 고친다.
   * `draw` 는 rAF 로 늦게 불리므로 커밋과 effect 사이의 틈은 문제가 안 된다.
   */
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const draw = useCallback(() => {
    frame.current = null;
    const context = ctx.current;
    if (context === null) return;

    const scene = optionsRef.current.sceneAt();
    sceneRef.current = scene;
    // 색인은 집을 때만 쓰므로 여기서 버리고 필요할 때 다시 세운다
    indexRef.current = null;

    paintScene(context, scene, viewportRef.current, cssSize.current, {
      selection: optionsRef.current.selection,
      devicePixelRatio: window.devicePixelRatio,
    });
  }, []);

  const invalidate = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = window.requestAnimationFrame(draw);
  }, [draw]);

  const resize = useCallback(() => {
    const element = canvas.current;
    if (element === null) return;

    const rect = element.getBoundingClientRect();
    cssSize.current = { width: rect.width, height: rect.height };

    const pixels = canvasPixelSize(cssSize.current, window.devicePixelRatio);
    element.width = pixels.width;
    element.height = pixels.height;
    invalidate();
  }, [invalidate]);

  const canvasRef = useCallback(
    (element: HTMLCanvasElement | null) => {
      canvas.current = element;
      if (element === null) {
        ctx.current = null;
        return;
      }
      // 어긋나면 여기서 컴파일이 깨진다 — 구조적 Ctx2D 가 실제 타입과 맞는지
      ctx.current = element.getContext('2d');
      resize();
    },
    [resize],
  );

  useEffect(() => {
    const element = canvas.current;
    if (element === null) return;

    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [resize]);

  useEffect(
    () => () => {
      // frame.current 를 null 로 되돌리지 않으면, React Strict Mode 의
      // 마운트→해제→재마운트 흉내(dev 전용)에서 이 해제가 실제 언마운트 없이
      // 불려도 frame.current 는 취소된 id 를 계속 들고 있게 된다. 그러면
      // invalidate() 의 문지기가 "이미 예약됨"으로 착각해 재마운트 뒤의
      // 모든 다시 그리기를 영원히 막는다.
      if (frame.current !== null) {
        window.cancelAnimationFrame(frame.current);
        frame.current = null;
      }
    },
    [],
  );

  const toScreen = useCallback((clientX: number, clientY: number): Point => {
    const rect = canvas.current?.getBoundingClientRect();
    if (rect === undefined) return { x: clientX, y: clientY };
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const toWorld = useCallback((screen: Point) => screenToWorld(viewportRef.current, screen), []);

  const hitAt = useCallback((world: Point): Hit | undefined => {
    const scene = sceneRef.current;
    if (scene === null) return undefined;

    indexRef.current ??= buildSpatialIndex(scene);
    return hitTest(indexRef.current, scene, world, {
      // 렌더러가 월드 단위라고 적어 둔 자리. 나눠야 화면에서 굵기가 일정하다
      edgeTolerance: DEFAULT_THEME.edge.hitTolerance / viewportRef.current.zoom,
    });
  }, []);

  const fit = useCallback(() => {
    const scene = sceneRef.current;
    if (scene === null) return;
    viewportRef.current = fitToContent(scene.contentBounds, cssSize.current);
    invalidate();
  }, [invalidate]);

  const setCursor = useCallback((cursor: string) => {
    if (canvas.current !== null) canvas.current.style.cursor = cursor;
  }, []);

  return { canvasRef, invalidate, viewportRef, toWorld, toScreen, hitAt, fit, setCursor };
}
