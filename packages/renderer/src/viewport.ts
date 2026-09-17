import { clamp, rectCenter } from './geometry.js';
import type { Point, Rect, Size } from './geometry.js';

/**
 * 월드와 화면 사이의 변환.
 *
 * `x`·`y` 는 **화면 (0,0) 에 보이는 월드 좌표**이고, `zoom` 은 월드 한 칸이
 * 화면에서 몇 px 인가다. 그래서 `screen = (world - origin) * zoom`.
 *
 * 그리는 쪽이 쓰는 변환과 히트테스트가 뒤집는 변환이 **같은 함수**여야 한다.
 * 그래서 `viewportMatrix` 가 페인트가 아니라 여기 있다 — 고해상도 화면에서
 * 클릭이 몇 px 어긋나는 버그가 이 둘이 갈라진 자리에서 난다.
 */

export interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

export interface ZoomLimits {
  readonly min: number;
  readonly max: number;
}

export const ZOOM_LIMITS: ZoomLimits = { min: 0.1, max: 4 };

export function worldToScreen(v: Viewport, p: Point): Point {
  return { x: (p.x - v.x) * v.zoom, y: (p.y - v.y) * v.zoom };
}

export function screenToWorld(v: Viewport, p: Point): Point {
  return { x: p.x / v.zoom + v.x, y: p.y / v.zoom + v.y };
}

/** 지금 화면에 보이는 월드 구역. 컬링이 이것을 받는다 */
export function visibleWorldRect(v: Viewport, screen: Size): Rect {
  return {
    x: v.x,
    y: v.y,
    width: screen.width / v.zoom,
    height: screen.height / v.zoom,
  };
}

/** 유한하지 않은 값은 1 로 되돌린다. 0 이 새면 다음 나눗셈에서 전부 무너진다 */
export function clampZoom(zoom: number, limits: ZoomLimits = ZOOM_LIMITS): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return 1;
  return clamp(zoom, limits.min, limits.max);
}

/** 화면에서 끈 만큼 옮긴다 — 줌이 클수록 월드에서는 덜 움직인다 */
export function panBy(v: Viewport, dxScreen: number, dyScreen: number): Viewport {
  return { x: v.x - dxScreen / v.zoom, y: v.y - dyScreen / v.zoom, zoom: v.zoom };
}

/**
 * 화면의 한 점을 붙든 채 줌을 바꾼다.
 *
 * 커서 밑에 있던 월드 점이 **그 자리에 그대로 있어야** 한다. 이것이 어긋나면
 * 확대할 때마다 보던 곳이 화면 밖으로 밀려난다.
 */
export function setZoomAt(
  v: Viewport,
  screenPoint: Point,
  zoom: number,
  limits: ZoomLimits = ZOOM_LIMITS,
): Viewport {
  const world = screenToWorld(v, screenPoint);
  const next = clampZoom(zoom, limits);
  return {
    x: world.x - screenPoint.x / next,
    y: world.y - screenPoint.y / next,
    zoom: next,
  };
}

export function zoomAt(
  v: Viewport,
  screenPoint: Point,
  factor: number,
  limits: ZoomLimits = ZOOM_LIMITS,
): Viewport {
  return setZoomAt(v, screenPoint, v.zoom * factor, limits);
}

export interface FitOptions {
  readonly padding?: number;
  readonly maxZoom?: number;
}

/**
 * 내용을 화면에 맞춘다.
 *
 * 기본 상한이 1 인 것은 일부러다 — 노드 두 개짜리 다이어그램이 화면을 4배로
 * 채우면 글자만 거대하고 아무것도 안 보인다.
 */
export function fitToContent(
  content: Rect,
  screen: Size,
  options: FitOptions = {},
  limits: ZoomLimits = ZOOM_LIMITS,
): Viewport {
  const padding = options.padding ?? 40;
  const maxZoom = Math.min(limits.max, options.maxZoom ?? 1);

  const usableWidth = screen.width - padding * 2;
  const usableHeight = screen.height - padding * 2;

  // 내용이 없거나 화면이 없으면 맞출 것이 없다
  if (content.width <= 0 || content.height <= 0 || usableWidth <= 0 || usableHeight <= 0) {
    return DEFAULT_VIEWPORT;
  }

  const zoom = clamp(
    Math.min(usableWidth / content.width, usableHeight / content.height),
    limits.min,
    maxZoom,
  );

  const center = rectCenter(content);
  return {
    x: center.x - screen.width / 2 / zoom,
    y: center.y - screen.height / 2 / zoom,
    zoom,
  };
}

/** 캔버스 2D 의 `setTransform` 인자. `a·d` 가 확대, `e·f` 가 옮김 */
export interface Matrix {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

/**
 * 뷰포트와 화면 배율을 하나의 변환으로 접는다.
 *
 * 그리는 쪽은 이것을 `setTransform` 에 그대로 넣고, 히트테스트는
 * `screenToWorld` 로 뒤집는다. 둘이 같은 셈이라는 것을 검사로 묶어 둔다.
 */
export function viewportMatrix(v: Viewport, dpr: number): Matrix {
  const scale = v.zoom * dpr;
  return { a: scale, b: 0, c: 0, d: scale, e: -v.x * scale, f: -v.y * scale };
}

export function applyMatrix(m: Matrix, p: Point): Point {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

/** 화면 배율. 1 아래로 내려가거나 3 위로 올라가면 득보다 실이 크다 */
export function clampDevicePixelRatio(dpr: number): number {
  return clamp(dpr, 1, 3);
}

/** 캔버스 엘리먼트의 `width`·`height` 에 넣을 값. 엘리먼트는 여기서 안 만진다 */
export function canvasPixelSize(cssSize: Size, dpr: number): Size {
  const ratio = clampDevicePixelRatio(dpr);
  return {
    width: Math.round(cssSize.width * ratio),
    height: Math.round(cssSize.height * ratio),
  };
}
