import type { Point, Rect } from '../geometry.js';
import type { Ctx2D } from './context.js';

/**
 * 경로 만들기.
 *
 * `ctx.roundRect` 를 쓰지 않는다 — node-canvas 에 없어서 서버 썸네일에서
 * 깨진다. `arcTo` 는 어디에나 있다.
 */

export function roundRectPath(ctx: Ctx2D, rect: Rect, radius: number): void {
  const r = Math.max(0, Math.min(radius, rect.width / 2, rect.height / 2));
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;

  ctx.beginPath();
  ctx.moveTo(rect.x + r, rect.y);
  ctx.arcTo(right, rect.y, right, bottom, r);
  ctx.arcTo(right, bottom, rect.x, bottom, r);
  ctx.arcTo(rect.x, bottom, rect.x, rect.y, r);
  ctx.arcTo(rect.x, rect.y, right, rect.y, r);
  ctx.closePath();
}

export function polylinePath(ctx: Ctx2D, points: readonly Point[]): void {
  const first = points[0];
  if (first === undefined) return;

  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i += 1) {
    const p = points[i];
    if (p !== undefined) ctx.lineTo(p.x, p.y);
  }
}

export function trianglePath(ctx: Ctx2D, a: Point, b: Point, c: Point): void {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.closePath();
}

export function ellipsePath(ctx: Ctx2D, center: Point, radiusX: number, radiusY: number): void {
  ctx.beginPath();
  ctx.ellipse(center.x, center.y, radiusX, radiusY, 0, 0, Math.PI * 2);
}
