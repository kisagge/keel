import { buildGraph } from '@keel/graph';
import { parse } from '@keel/dsl';
import { buildScene } from '@keel/renderer';
import type { Point } from '@keel/renderer';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { withDrag, yMapReader } from '../src/document/layout-reader.js';

function layoutOf(entries: Record<string, Point>): Y.Map<Point> {
  const doc = new Y.Doc();
  const map = doc.getMap<Point>('layout');
  for (const [id, at] of Object.entries(entries)) map.set(id, at);
  return map;
}

describe('Y.Map 읽기', () => {
  it('적힌 자리를 그대로 돌려준다', () => {
    const reader = yMapReader(layoutOf({ a: { x: 1, y: 2 } }));
    expect(reader.get('a')).toEqual({ x: 1, y: 2 });
  });

  it('없는 것은 undefined 다', () => {
    const reader = yMapReader(layoutOf({}));
    expect(reader.get('없는놈')).toBeUndefined();
  });

  /** 복사하지 않으므로 나중에 들어온 자리도 그대로 보인다 */
  it('나중에 들어온 자리도 보인다', () => {
    const map = layoutOf({});
    const reader = yMapReader(map);
    expect(reader.get('a')).toBeUndefined();

    map.set('a', { x: 5, y: 5 });
    expect(reader.get('a')).toEqual({ x: 5, y: 5 });
  });
});

describe('끌기 덧씌우기', () => {
  it('끌고 있는 노드만 다른 자리를 준다', () => {
    const base = yMapReader(layoutOf({ a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }));
    const reader = withDrag(base, { id: 'a', at: { x: 500, y: 500 } });

    expect(reader.get('a')).toEqual({ x: 500, y: 500 });
    expect(reader.get('b')).toEqual({ x: 100, y: 0 });
  });

  it('끌고 있지 않으면 원래 것을 그대로 돌려준다', () => {
    const base = yMapReader(layoutOf({ a: { x: 0, y: 0 } }));
    expect(withDrag(base, undefined)).toBe(base);
  });

  it('레이아웃에 없던 노드도 끌면 자리가 생긴다', () => {
    const base = yMapReader(layoutOf({}));
    const reader = withDrag(base, { id: 'a', at: { x: 7, y: 8 } });
    expect(reader.get('a')).toEqual({ x: 7, y: 8 });
  });

  /**
   * 덧씌우기로 끌기를 푸는 값이 여기서 나온다 — 그룹 테두리는 자손들의
   * 직사각형 합집합이므로, 끌리는 노드를 따라 움직인다. 형제에게 가깝게
   * 끌면 테두리가 **따라 줄어든다.** 덧그리는 유령 없이 공짜로 얻는다.
   */
  it('노드를 형제에게 가깝게 끌면 그룹 테두리가 따라 줄어든다', () => {
    const graph = buildGraph(parse('group g "묶음" {\n  service a\n  service b\n}'));
    const base = yMapReader(layoutOf({ a: { x: 0, y: 0 }, b: { x: 200, y: 0 } }));

    const before = buildScene(graph, base).groupById.get('g');
    const after = buildScene(graph, withDrag(base, { id: 'b', at: { x: 40, y: 0 } })).groupById.get('g');

    expect(before && after).toBeTruthy();
    if (!before || !after) return;
    expect(after.rect.width).toBeLessThan(before.rect.width);
  });
});
