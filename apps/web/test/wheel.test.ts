import { DEFAULT_VIEWPORT, ZOOM_LIMITS, screenToWorld } from '@keel/renderer';
import { describe, expect, it } from 'vitest';
import { wheelToViewport } from '../src/interaction/wheel.js';

const cursor = { x: 400, y: 300 };

describe('그냥 휠', () => {
  it('화면을 민다 — 줌은 그대로다', () => {
    const next = wheelToViewport(DEFAULT_VIEWPORT, { deltaX: 0, deltaY: 100, deltaMode: 0, ctrlKey: false }, cursor);
    expect(next.zoom).toBe(DEFAULT_VIEWPORT.zoom);
    expect(next.y).toBe(100);
  });

  it('가로 휠도 받는다', () => {
    const next = wheelToViewport(DEFAULT_VIEWPORT, { deltaX: 40, deltaY: 0, deltaMode: 0, ctrlKey: false }, cursor);
    expect(next.x).toBe(40);
  });
});

/**
 * **Firefox 는 마우스 휠을 줄 단위로 보낸다** (`deltaMode: 1`, 한 칸에 3쯤).
 * 그것을 픽셀로 읽으면 한 칸에 3px 가 밀려, 화면이 안 움직이는 것처럼 보인다.
 * 한 칸이 손가락에 느껴질 만큼은 밀려야 한다.
 */
describe('델타 단위', () => {
  it('줄 단위(Firefox)를 픽셀로 바꾼다', () => {
    const line = wheelToViewport(
      DEFAULT_VIEWPORT,
      { deltaX: 0, deltaY: 3, deltaMode: 1, ctrlKey: false },
      cursor,
    );
    expect(line.y).toBeGreaterThan(30);
  });

  it('쪽 단위도 픽셀로 바꾼다', () => {
    const page = wheelToViewport(
      DEFAULT_VIEWPORT,
      { deltaX: 0, deltaY: 1, deltaMode: 2, ctrlKey: false },
      cursor,
    );
    expect(page.y).toBeGreaterThan(100);
  });

  /** 줄 단위 핀치도 같은 이유로 확대가 눈에 보여야 한다 */
  it('줄 단위 핀치도 눈에 보이게 확대한다', () => {
    const pixel = wheelToViewport(
      DEFAULT_VIEWPORT,
      { deltaX: 0, deltaY: -3, deltaMode: 0, ctrlKey: true },
      cursor,
    );
    const line = wheelToViewport(
      DEFAULT_VIEWPORT,
      { deltaX: 0, deltaY: -3, deltaMode: 1, ctrlKey: true },
      cursor,
    );
    expect(line.zoom).toBeGreaterThan(pixel.zoom);
  });
});

describe('핀치(ctrl+휠)', () => {
  it('확대·축소한다', () => {
    const inward = wheelToViewport(DEFAULT_VIEWPORT, { deltaX: 0, deltaY: -100, deltaMode: 0, ctrlKey: true }, cursor);
    const outward = wheelToViewport(DEFAULT_VIEWPORT, { deltaX: 0, deltaY: 100, deltaMode: 0, ctrlKey: true }, cursor);

    expect(inward.zoom).toBeGreaterThan(DEFAULT_VIEWPORT.zoom);
    expect(outward.zoom).toBeLessThan(DEFAULT_VIEWPORT.zoom);
  });

  /** 확대할 때마다 보던 곳이 화면 밖으로 밀려나면 못 쓴다 */
  it('커서 밑의 월드 점이 제자리에 남는다', () => {
    const viewport = { x: 30, y: -10, zoom: 1.4 };
    const before = screenToWorld(viewport, cursor);

    const next = wheelToViewport(viewport, { deltaX: 0, deltaY: -120, deltaMode: 0, ctrlKey: true }, cursor);
    const after = screenToWorld(next, cursor);

    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('줌 한계에서 멈춘다', () => {
    let viewport = DEFAULT_VIEWPORT;
    for (let i = 0; i < 200; i += 1) {
      viewport = wheelToViewport(viewport, { deltaX: 0, deltaY: -100, deltaMode: 0, ctrlKey: true }, cursor);
    }
    expect(viewport.zoom).toBe(ZOOM_LIMITS.max);
  });

  it('어떤 값을 넣어도 유한하다', () => {
    for (const deltaY of [0, -1, 1, -10000, 10000]) {
      const next = wheelToViewport(DEFAULT_VIEWPORT, { deltaX: 0, deltaY, deltaMode: 0, ctrlKey: true }, cursor);
      expect(Number.isFinite(next.x)).toBe(true);
      expect(Number.isFinite(next.y)).toBe(true);
      expect(Number.isFinite(next.zoom)).toBe(true);
    }
  });
});
