import { describe, expect, it } from 'vitest';
import {
  EMPTY_RECT,
  boundsOfPoints,
  clamp,
  distanceToSegment,
  inflateRect,
  pathLength,
  pointAtLength,
  rectBorderPoint,
  rectBottom,
  rectContains,
  rectOf,
  rectRight,
  rectUnion,
  rectsIntersect,
  segmentNormal,
  unionAll,
} from '../src/geometry.js';
import type { Point, Rect } from '../src/geometry.js';
import { makeRandom, randomBetween } from './helpers/random.js';

describe('사각형', () => {
  it('중심과 크기로 만든 사각형의 중심이 그대로다', () => {
    const r = rectOf({ x: 10, y: -4 }, { width: 80, height: 40 });
    expect(r).toEqual({ x: -30, y: -24, width: 80, height: 40 });
  });

  it('합집합은 자기 자신과 합쳐도 그대로다', () => {
    const r: Rect = { x: 3, y: 7, width: 20, height: 11 };
    expect(rectUnion(r, r)).toEqual(r);
  });

  it('합집합은 순서를 바꿔도 같다', () => {
    const a: Rect = { x: 0, y: 0, width: 10, height: 10 };
    const b: Rect = { x: -5, y: 3, width: 2, height: 40 };
    expect(rectUnion(a, b)).toEqual(rectUnion(b, a));
  });

  it('합집합은 두 사각형을 모두 담는다', () => {
    const a: Rect = { x: 0, y: 0, width: 10, height: 10 };
    const b: Rect = { x: 30, y: -20, width: 5, height: 5 };
    const u = rectUnion(a, b);
    expect(u.x).toBe(0);
    expect(u.y).toBe(-20);
    expect(rectRight(u)).toBe(35);
    expect(rectBottom(u)).toBe(10);
  });

  /**
   * 빈 것을 크기 0 인 사각형으로 돌려주면 원점에 유령 상자가 생긴다.
   * 없는 것은 없는 값으로 말한다.
   */
  it('하나도 없으면 합집합은 undefined 다', () => {
    expect(unionAll([])).toBeUndefined();
  });

  it('하나뿐이면 그것이 그대로 합집합이다', () => {
    const r: Rect = { x: 1, y: 2, width: 3, height: 4 };
    expect(unionAll([r])).toEqual(r);
  });

  it('크게 줄여도 음수 크기가 나오지 않는다', () => {
    const r = inflateRect({ x: 0, y: 0, width: 10, height: 4 }, -1000);
    expect(r.width).toBe(0);
    expect(r.height).toBe(0);
    // 뒤집히지 않고 가운데에서 멈춘다
    expect(r.x).toBe(5);
    expect(r.y).toBe(2);
  });

  it('부풀린 사각형은 원래 것을 담고 중심이 그대로다', () => {
    const r: Rect = { x: -3, y: 8, width: 20, height: 6 };
    const bigger = inflateRect(r, 7);
    expect(bigger.x).toBe(-10);
    expect(bigger.width).toBe(34);
    expect(rectContains(bigger, { x: r.x, y: r.y })).toBe(true);
  });

  it('테두리만 스쳐도 겹친 것으로 본다', () => {
    const a: Rect = { x: 0, y: 0, width: 10, height: 10 };
    const b: Rect = { x: 10, y: 0, width: 10, height: 10 };
    expect(rectsIntersect(a, b)).toBe(true);
    expect(rectsIntersect(a, { x: 10.5, y: 0, width: 1, height: 1 })).toBe(false);
  });

  it('테두리 위의 점은 안에 있는 것으로 본다', () => {
    const r: Rect = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectContains(r, { x: 0, y: 5 })).toBe(true);
    expect(rectContains(r, { x: 10, y: 10 })).toBe(true);
    expect(rectContains(r, { x: 10.001, y: 5 })).toBe(false);
  });

  it('점이 없으면 경계도 없다', () => {
    expect(boundsOfPoints([])).toBeUndefined();
  });

  it('점 하나의 경계는 크기가 0 이고 그 자리에 있다', () => {
    expect(boundsOfPoints([{ x: 4, y: -2 }])).toEqual({ x: 4, y: -2, width: 0, height: 0 });
  });
});

describe('선분', () => {
  it('선분 위의 점까지 거리는 0 이다', () => {
    expect(distanceToSegment({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(0);
  });

  it('선분 밖으로 나간 점은 가까운 끝점까지 잰다', () => {
    expect(distanceToSegment({ x: -3, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(5);
  });

  it('길이 0 인 선분은 점으로 본다 — 0 으로 나누지 않는다', () => {
    const d = distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 });
    expect(d).toBeCloseTo(5);
    expect(Number.isNaN(d)).toBe(false);
  });

  /** 촘촘히 뜯어 본 최소 거리와 닫힌 꼴이 같아야 한다 */
  it('닫힌 꼴이 촘촘히 재 본 값과 맞는다', () => {
    const random = makeRandom(20260917);

    for (let i = 0; i < 200; i += 1) {
      const p = { x: randomBetween(random, -50, 50), y: randomBetween(random, -50, 50) };
      const a = { x: randomBetween(random, -50, 50), y: randomBetween(random, -50, 50) };
      const b = { x: randomBetween(random, -50, 50), y: randomBetween(random, -50, 50) };

      let sampled = Number.POSITIVE_INFINITY;
      for (let s = 0; s <= 400; s += 1) {
        const t = s / 400;
        const d = Math.hypot(p.x - (a.x + (b.x - a.x) * t), p.y - (a.y + (b.y - a.y) * t));
        if (d < sampled) sampled = d;
      }

      expect(distanceToSegment(p, a, b)).toBeLessThanOrEqual(sampled + 1e-9);
      expect(distanceToSegment(p, a, b)).toBeCloseTo(sampled, 2);
    }
  });

  it('법선은 단위 길이이고 선분과 직각이다', () => {
    const a = { x: 1, y: 2 };
    const b = { x: 7, y: -3 };
    const n = segmentNormal(a, b);
    expect(Math.hypot(n.x, n.y)).toBeCloseTo(1);
    expect(n.x * (b.x - a.x) + n.y * (b.y - a.y)).toBeCloseTo(0);
  });

  it('길이 0 인 선분의 법선은 위쪽이다', () => {
    expect(segmentNormal({ x: 4, y: 4 }, { x: 4, y: 4 })).toEqual({ x: 0, y: -1 });
  });
});

describe('폴리라인', () => {
  const path: readonly Point[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 5 },
  ];

  it('길이는 마디를 더한 것이다', () => {
    expect(pathLength(path)).toBeCloseTo(15);
  });

  it('0 과 전체 길이는 양 끝점이다', () => {
    expect(pointAtLength(path, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAtLength(path, pathLength(path))).toEqual({ x: 10, y: 5 });
  });

  it('범위를 벗어나면 양 끝으로 물린다', () => {
    expect(pointAtLength(path, -100)).toEqual({ x: 0, y: 0 });
    expect(pointAtLength(path, 1000)).toEqual({ x: 10, y: 5 });
  });

  it('한가운데를 집는다', () => {
    expect(pointAtLength(path, 7.5)).toEqual({ x: 7.5, y: 0 });
  });

  it('비어 있어도 던지지 않는다', () => {
    expect(pathLength([])).toBe(0);
    expect(pointAtLength([], 5)).toEqual({ x: 0, y: 0 });
  });
});

describe('테두리 접점', () => {
  /**
   * 이 파일에서 가장 중요한 불변식이다. 접점이 테두리에서 벗어나면 선이 노드
   * 안으로 파고들거나 허공에서 끊긴다.
   */
  it('언제나 테두리 위에 있다', () => {
    const random = makeRandom(4242);

    for (let i = 0; i < 500; i += 1) {
      const rect = rectOf(
        { x: randomBetween(random, -200, 200), y: randomBetween(random, -200, 200) },
        { width: randomBetween(random, 10, 300), height: randomBetween(random, 10, 120) },
      );
      const toward = { x: randomBetween(random, -500, 500), y: randomBetween(random, -500, 500) };

      const p = rectBorderPoint(rect, toward);
      const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };

      const onVertical = Math.abs(Math.abs(p.x - center.x) - rect.width / 2) < 1e-9;
      const onHorizontal = Math.abs(Math.abs(p.y - center.y) - rect.height / 2) < 1e-9;
      expect(onVertical || onHorizontal).toBe(true);

      // 테두리 위이므로 닫힌 사각형 안이기도 하다
      expect(p.x).toBeGreaterThanOrEqual(rect.x - 1e-9);
      expect(p.x).toBeLessThanOrEqual(rectRight(rect) + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(rect.y - 1e-9);
      expect(p.y).toBeLessThanOrEqual(rectBottom(rect) + 1e-9);
    }
  });

  it('바로 오른쪽을 겨누면 오른쪽 변 한가운데다', () => {
    const rect: Rect = { x: 0, y: 0, width: 100, height: 40 };
    expect(rectBorderPoint(rect, { x: 999, y: 20 })).toEqual({ x: 100, y: 20 });
  });

  it('바로 위를 겨누면 윗변 한가운데다', () => {
    const rect: Rect = { x: 0, y: 0, width: 100, height: 40 };
    expect(rectBorderPoint(rect, { x: 50, y: -999 })).toEqual({ x: 50, y: 0 });
  });

  /** 같은 자리에 고정된 두 노드. NaN 이 장면으로 새면 안 된다 */
  it('중심을 겨누면 중심을 돌려준다', () => {
    const rect: Rect = { x: 0, y: 0, width: 100, height: 40 };
    const p = rectBorderPoint(rect, { x: 50, y: 20 });
    expect(p).toEqual({ x: 50, y: 20 });
    expect(Number.isNaN(p.x)).toBe(false);
  });
});

describe('조이기', () => {
  it('범위 안이면 그대로, 밖이면 물린다', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(50, 0, 10)).toBe(10);
  });

  it('유한하지 않은 값은 최솟값으로 떨어뜨린다', () => {
    expect(clamp(Number.NaN, 1, 10)).toBe(1);
    expect(clamp(Number.POSITIVE_INFINITY, 1, 10)).toBe(1);
  });
});

describe('빈 사각형', () => {
  it('크기가 0 이다', () => {
    expect(EMPTY_RECT).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});
