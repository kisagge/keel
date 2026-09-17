import { describe, expect, it, vi } from 'vitest';
import { createMeasure, parseSource, sceneOf } from '../src/document/derive.js';

describe('소스 읽기', () => {
  it('문서와 그래프를 함께 돌려준다', () => {
    const { document, graph } = parseSource('service a\nservice b\na -> b');
    expect(document.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
  });

  it('깨진 줄은 진단으로 남고 파서는 던지지 않는다', () => {
    const { document } = parseSource('service\n-> ->\nservice a');
    expect(document.diagnostics.length).toBeGreaterThan(0);
    expect(document.nodes.some((n) => n.id === 'a')).toBe(true);
  });
});

describe('장면 세우기', () => {
  it('그래프와 레이아웃으로 장면을 만든다', () => {
    const { graph } = parseSource('service a\nservice b');
    const scene = sceneOf(graph, new Map([['a', { x: 10, y: 20 }]]), createMeasure(undefined));

    expect(scene.nodes).toHaveLength(2);
    expect(scene.nodeById.get('a')?.center).toEqual({ x: 10, y: 20 });
    expect(scene.nodeById.get('a')?.pinned).toBe(true);
    expect(scene.nodeById.get('b')?.pinned).toBe(false);
  });

  /**
   * 끌기 중에는 그래프가 안 바뀌고 자리만 바뀐다. 두 단으로 나눠 두면
   * 프레임마다 파싱을 다시 하지 않는다.
   */
  it('자리만 바뀔 때 다시 파싱하지 않는다', () => {
    const { graph } = parseSource('service a');
    const measure = createMeasure(undefined);

    const first = sceneOf(graph, new Map([['a', { x: 0, y: 0 }]]), measure);
    const second = sceneOf(graph, new Map([['a', { x: 50, y: 0 }]]), measure);

    expect(first.nodeById.get('a')?.center).toEqual({ x: 0, y: 0 });
    expect(second.nodeById.get('a')?.center).toEqual({ x: 50, y: 0 });
  });
});

describe('글자 재기', () => {
  it('캔버스가 없으면 어림으로 잰다', () => {
    const measure = createMeasure(undefined);
    expect(measure('가나다', { fontSize: 14, fontFamily: 'x', fontWeight: 'normal' })).toBeGreaterThan(0);
  });

  /** 프레임마다 measureText 를 다시 부르는 것이 캔버스에서 가장 흔한 느려짐이다 */
  it('캔버스가 있으면 재되 같은 글자를 두 번 재지 않는다', () => {
    const measureText = vi.fn((text: string) => ({ width: text.length * 7 }));
    const ctx = { font: '', measureText };

    const measure = createMeasure(ctx);
    const style = { fontSize: 14, fontFamily: 'x', fontWeight: 'normal' as const };

    expect(measure('abc', style)).toBe(21);
    measure('abc', style);
    measure('abc', style);

    expect(measureText).toHaveBeenCalledTimes(1);
  });
});
