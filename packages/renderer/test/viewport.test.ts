import { describe, expect, it } from 'vitest';
import { rectContainsRect, rectCenter } from '../src/geometry.js';
import type { Rect } from '../src/geometry.js';
import {
  DEFAULT_VIEWPORT,
  ZOOM_LIMITS,
  applyMatrix,
  canvasPixelSize,
  clampDevicePixelRatio,
  clampZoom,
  fitToContent,
  panBy,
  screenToWorld,
  setZoomAt,
  viewportMatrix,
  visibleWorldRect,
  worldToScreen,
  zoomAt,
} from '../src/viewport.js';
import type { Viewport } from '../src/viewport.js';
import { makeRandom, randomBetween } from './helpers/random.js';

const screen = { width: 800, height: 600 };

describe('월드와 화면', () => {
  it('되돌리면 제자리다', () => {
    const random = makeRandom(1234);

    for (let i = 0; i < 200; i += 1) {
      const v: Viewport = {
        x: randomBetween(random, -1000, 1000),
        y: randomBetween(random, -1000, 1000),
        zoom: randomBetween(random, 0.1, 4),
      };
      const p = { x: randomBetween(random, -1000, 1000), y: randomBetween(random, -1000, 1000) };

      const back = screenToWorld(v, worldToScreen(v, p));
      expect(back.x).toBeCloseTo(p.x, 6);
      expect(back.y).toBeCloseTo(p.y, 6);
    }
  });

  it('원점의 월드 좌표가 뷰포트의 x·y 다', () => {
    const v: Viewport = { x: 30, y: -12, zoom: 2 };
    expect(screenToWorld(v, { x: 0, y: 0 })).toEqual({ x: 30, y: -12 });
    expect(worldToScreen(v, { x: 30, y: -12 })).toEqual({ x: 0, y: 0 });
  });

  it('보이는 구역은 줌이 클수록 좁다', () => {
    const wide = visibleWorldRect({ x: 0, y: 0, zoom: 1 }, screen);
    const tight = visibleWorldRect({ x: 0, y: 0, zoom: 2 }, screen);
    expect(wide.width).toBe(800);
    expect(tight.width).toBe(400);
  });
});

describe('팬', () => {
  it('화면에서 끈 만큼 내용이 따라온다', () => {
    const v: Viewport = { x: 0, y: 0, zoom: 2 };
    const moved = panBy(v, 100, 50);
    // 화면에서 오른쪽으로 100px 끌면 월드는 왼쪽으로 50 만큼 간다
    expect(moved.x).toBe(-50);
    expect(moved.y).toBe(-25);
    expect(moved.zoom).toBe(2);
  });

  it('월드의 한 점이 화면에서 끈 만큼 움직인다', () => {
    const v: Viewport = { x: 10, y: 10, zoom: 1.5 };
    const p = { x: 40, y: 80 };
    const before = worldToScreen(v, p);
    const after = worldToScreen(panBy(v, 30, -20), p);
    expect(after.x - before.x).toBeCloseTo(30);
    expect(after.y - before.y).toBeCloseTo(-20);
  });
});

describe('줌', () => {
  /**
   * 이 파일에서 가장 중요한 성질이다. 어긋나면 확대할 때마다 보던 곳이 화면
   * 밖으로 밀려난다.
   */
  it('커서 밑의 월드 점이 제자리에 남는다', () => {
    const random = makeRandom(987654);

    for (let i = 0; i < 300; i += 1) {
      const v: Viewport = {
        x: randomBetween(random, -500, 500),
        y: randomBetween(random, -500, 500),
        zoom: randomBetween(random, 0.2, 3),
      };
      const cursor = { x: randomBetween(random, 0, 800), y: randomBetween(random, 0, 600) };
      const factor = randomBetween(random, 0.5, 2);

      const before = screenToWorld(v, cursor);
      const after = screenToWorld(zoomAt(v, cursor, factor), cursor);

      expect(after.x).toBeCloseTo(before.x, 6);
      expect(after.y).toBeCloseTo(before.y, 6);
    }
  });

  it('상한과 하한에서 멈춘다', () => {
    const v: Viewport = { x: 0, y: 0, zoom: 1 };
    expect(zoomAt(v, { x: 0, y: 0 }, 1000).zoom).toBe(ZOOM_LIMITS.max);
    expect(zoomAt(v, { x: 0, y: 0 }, 0.00001).zoom).toBe(ZOOM_LIMITS.min);
  });

  it('상한에 물려도 커서 밑 점은 그대로다', () => {
    const v: Viewport = { x: 7, y: 3, zoom: 3.9 };
    const cursor = { x: 640, y: 400 };
    const before = screenToWorld(v, cursor);
    const after = screenToWorld(zoomAt(v, cursor, 100), cursor);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('말이 안 되는 줌은 1 로 되돌린다', () => {
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(clampZoom(0)).toBe(1);
    expect(clampZoom(-2)).toBe(1);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it('값을 바로 정해도 커서 밑 점은 그대로다', () => {
    const v: Viewport = { x: -30, y: 90, zoom: 0.7 };
    const cursor = { x: 123, y: 456 };
    const before = screenToWorld(v, cursor);
    const after = screenToWorld(setZoomAt(v, cursor, 2.5), cursor);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });
});

describe('내용에 맞추기', () => {
  it('내용이 여백 안에 들어온다', () => {
    const content: Rect = { x: -200, y: -50, width: 1200, height: 900 };
    const v = fitToContent(content, screen, { padding: 40 });
    const visible = visibleWorldRect(v, screen);
    expect(rectContainsRect(visible, content)).toBe(true);
  });

  it('내용을 화면 한가운데에 둔다', () => {
    const content: Rect = { x: 100, y: 200, width: 400, height: 300 };
    const v = fitToContent(content, screen);
    const visible = visibleWorldRect(v, screen);
    expect(rectCenter(visible).x).toBeCloseTo(rectCenter(content).x, 6);
    expect(rectCenter(visible).y).toBeCloseTo(rectCenter(content).y, 6);
  });

  /** 노드 두 개짜리 다이어그램이 화면을 4배로 채우면 아무것도 안 보인다 */
  it('작은 내용을 억지로 키우지 않는다', () => {
    const v = fitToContent({ x: 0, y: 0, width: 20, height: 10 }, screen);
    expect(v.zoom).toBe(1);
  });

  it('상한을 넘겨 주면 그만큼은 키운다', () => {
    const v = fitToContent({ x: 0, y: 0, width: 20, height: 10 }, screen, { maxZoom: 4 });
    expect(v.zoom).toBeGreaterThan(1);
    expect(v.zoom).toBeLessThanOrEqual(ZOOM_LIMITS.max);
  });

  it('내용이 없거나 화면이 없으면 기본 뷰포트다', () => {
    expect(fitToContent({ x: 0, y: 0, width: 0, height: 0 }, screen)).toEqual(DEFAULT_VIEWPORT);
    expect(fitToContent({ x: 0, y: 0, width: 100, height: 100 }, { width: 10, height: 10 })).toEqual(
      DEFAULT_VIEWPORT,
    );
  });

  it('언제나 유한한 값이 나온다', () => {
    const random = makeRandom(55);
    for (let i = 0; i < 100; i += 1) {
      const v = fitToContent(
        {
          x: randomBetween(random, -5000, 5000),
          y: randomBetween(random, -5000, 5000),
          width: randomBetween(random, 0, 10000),
          height: randomBetween(random, 0, 10000),
        },
        screen,
      );
      expect(Number.isFinite(v.x)).toBe(true);
      expect(Number.isFinite(v.y)).toBe(true);
      expect(Number.isFinite(v.zoom)).toBe(true);
    }
  });
});

describe('변환 행렬', () => {
  /**
   * 그리는 쪽이 쓰는 변환과 히트테스트가 뒤집는 변환이 같은 셈이어야 한다.
   * 갈라지면 고해상도 화면에서 클릭이 몇 px 어긋난다.
   */
  it('행렬을 건 결과가 worldToScreen 에 배율을 곱한 것과 같다', () => {
    const random = makeRandom(31337);

    for (let i = 0; i < 200; i += 1) {
      const v: Viewport = {
        x: randomBetween(random, -300, 300),
        y: randomBetween(random, -300, 300),
        zoom: randomBetween(random, 0.2, 3),
      };
      const dpr = randomBetween(random, 1, 3);
      const p = { x: randomBetween(random, -300, 300), y: randomBetween(random, -300, 300) };

      const viaMatrix = applyMatrix(viewportMatrix(v, dpr), p);
      const viaScreen = worldToScreen(v, p);

      expect(viaMatrix.x).toBeCloseTo(viaScreen.x * dpr, 6);
      expect(viaMatrix.y).toBeCloseTo(viaScreen.y * dpr, 6);
    }
  });

  it('기울임이 없다', () => {
    const m = viewportMatrix({ x: 5, y: 5, zoom: 2 }, 2);
    expect(m.b).toBe(0);
    expect(m.c).toBe(0);
    expect(m.a).toBe(m.d);
  });
});

describe('화면 배율', () => {
  it('1 과 3 사이로 물린다', () => {
    expect(clampDevicePixelRatio(0.5)).toBe(1);
    expect(clampDevicePixelRatio(2)).toBe(2);
    expect(clampDevicePixelRatio(10)).toBe(3);
    expect(clampDevicePixelRatio(Number.NaN)).toBe(1);
  });

  it('캔버스 픽셀 크기는 정수다', () => {
    const size = canvasPixelSize({ width: 801, height: 599 }, 2);
    expect(size).toEqual({ width: 1602, height: 1198 });
    expect(Number.isInteger(canvasPixelSize({ width: 100.4, height: 33.3 }, 1.5).width)).toBe(true);
  });
});
