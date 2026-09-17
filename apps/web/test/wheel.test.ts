import { DEFAULT_VIEWPORT, ZOOM_LIMITS, screenToWorld } from '@keel/renderer';
import { describe, expect, it } from 'vitest';
import { wheelToViewport } from '../src/interaction/wheel.js';

const cursor = { x: 400, y: 300 };

describe('그냥 휠', () => {
  it('화면을 민다 — 줌은 그대로다', () => {
    const next = wheelToViewport(DEFAULT_VIEWPORT, { deltaX: 0, deltaY: 100, ctrlKey: false }, cursor);
    expect(next.zoom).toBe(DEFAULT_VIEWPORT.zoom);
    expect(next.y).toBe(100);
  });

  it('가로 휠도 받는다', () => {
    const next = wheelToViewport(DEFAULT_VIEWPORT, { deltaX: 40, deltaY: 0, ctrlKey: false }, cursor);
    expect(next.x).toBe(40);
  });
});

describe('핀치(ctrl+휠)', () => {
  it('확대·축소한다', () => {
    const inward = wheelToViewport(DEFAULT_VIEWPORT, { deltaX: 0, deltaY: -100, ctrlKey: true }, cursor);
    const outward = wheelToViewport(DEFAULT_VIEWPORT, { deltaX: 0, deltaY: 100, ctrlKey: true }, cursor);

    expect(inward.zoom).toBeGreaterThan(DEFAULT_VIEWPORT.zoom);
    expect(outward.zoom).toBeLessThan(DEFAULT_VIEWPORT.zoom);
  });

  /** 확대할 때마다 보던 곳이 화면 밖으로 밀려나면 못 쓴다 */
  it('커서 밑의 월드 점이 제자리에 남는다', () => {
    const viewport = { x: 30, y: -10, zoom: 1.4 };
    const before = screenToWorld(viewport, cursor);

    const next = wheelToViewport(viewport, { deltaX: 0, deltaY: -120, ctrlKey: true }, cursor);
    const after = screenToWorld(next, cursor);

    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('줌 한계에서 멈춘다', () => {
    let viewport = DEFAULT_VIEWPORT;
    for (let i = 0; i < 200; i += 1) {
      viewport = wheelToViewport(viewport, { deltaX: 0, deltaY: -100, ctrlKey: true }, cursor);
    }
    expect(viewport.zoom).toBe(ZOOM_LIMITS.max);
  });

  it('어떤 값을 넣어도 유한하다', () => {
    for (const deltaY of [0, -1, 1, -10000, 10000]) {
      const next = wheelToViewport(DEFAULT_VIEWPORT, { deltaX: 0, deltaY, ctrlKey: true }, cursor);
      expect(Number.isFinite(next.x)).toBe(true);
      expect(Number.isFinite(next.y)).toBe(true);
      expect(Number.isFinite(next.zoom)).toBe(true);
    }
  });
});
