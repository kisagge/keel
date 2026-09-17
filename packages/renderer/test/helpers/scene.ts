import { parse } from '@keel/dsl';
import { buildGraph } from '@keel/graph';
import type { Graph } from '@keel/graph';
import { buildScene } from '../../src/scene.js';
import type { Layout, Scene, SceneOptions } from '../../src/scene.js';
import type { Point } from '../../src/geometry.js';

export function graphOf(source: string): Graph {
  return buildGraph(parse(source));
}

export function layoutOf(entries: Record<string, Point>): Layout {
  return new Map(Object.entries(entries));
}

export function sceneOf(source: string, layout: Layout = new Map(), options?: SceneOptions): Scene {
  return buildScene(graphOf(source), layout, options);
}

/**
 * 장면 어디에도 `NaN`·`Infinity` 가 없어야 한다.
 *
 * 이것 하나가 "렌더 루프가 없는 좌표를 찾는다" 부류를 통째로 잡는다 —
 * 숫자가 한 번 망가지면 화면 전체가 빈다.
 */
export function expectAllFinite(value: unknown, path = '$'): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`${path} 가 유한하지 않다: ${String(value)}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => expectAllFinite(item, `${path}[${i}]`));
    return;
  }
  if (value instanceof Map) {
    for (const [key, item] of value) expectAllFinite(item, `${path}.get(${String(key)})`);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) expectAllFinite(item, `${path}.${key}`);
  }
}
