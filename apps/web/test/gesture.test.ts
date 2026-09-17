import { DEFAULT_VIEWPORT, buildScene } from '@keel/renderer';
import type { Hit, PlacedNode } from '@keel/renderer';
import { buildGraph } from '@keel/graph';
import { parse } from '@keel/dsl';
import { describe, expect, it } from 'vitest';
import {
  DRAG_THRESHOLD,
  IDLE,
  onPointerDown,
  onPointerMove,
  onPointerUp,
} from '../src/interaction/gesture.js';
import type { Gesture } from '../src/interaction/gesture.js';

function nodeHit(): { hit: Hit; node: PlacedNode } {
  const graph = buildGraph(parse('service a'));
  const scene = buildScene(graph, new Map([['a', { x: 0, y: 0 }]]));
  const node = scene.nodes[0];
  if (node === undefined) throw new Error('노드가 없다');
  return { hit: { kind: 'node', node }, node };
}

const at = (x: number, y: number) => ({ screen: { x, y }, world: { x, y } });

describe('누르기', () => {
  it('누르면 아직 아무 뜻도 아니다', () => {
    const g = onPointerDown(IDLE, at(0, 0), undefined, DEFAULT_VIEWPORT);
    expect(g.kind).toBe('pressed');
  });
});

describe('문턱', () => {
  /**
   * 문턱이 없으면 "고르려고 눌렀는데 1px 밀려서 노드가 움직이는" 일이 난다.
   * 손이 떨리는 사람에게는 노드를 고를 방법이 아예 없어진다.
   */
  it('문턱을 안 넘고 떼면 끌기가 아니라 고르기다', () => {
    const { hit, node } = nodeHit();

    const g: Gesture = onPointerDown(IDLE, at(0, 0), hit, DEFAULT_VIEWPORT);
    const moved = onPointerMove(g, at(DRAG_THRESHOLD - 1, 0));
    expect(moved.intent.kind).toBe('none');
    expect(moved.gesture.kind).toBe('pressed');

    const up = onPointerUp(moved.gesture, at(DRAG_THRESHOLD - 1, 0));
    expect(up.intent).toEqual({ kind: 'select', hit: { kind: 'node', node } });
    expect(up.gesture).toEqual(IDLE);
  });

  it('문턱을 넘으면 끌기로 바뀐다', () => {
    const { hit } = nodeHit();

    const g = onPointerDown(IDLE, at(0, 0), hit, DEFAULT_VIEWPORT);
    const moved = onPointerMove(g, at(DRAG_THRESHOLD + 1, 0));

    expect(moved.gesture.kind).toBe('dragging');
    expect(moved.intent.kind).toBe('drag-move');
  });
});

describe('끌기', () => {
  /** 잡은 자리를 기억해야 노드가 커서 밑으로 튀지 않는다 */
  it('잡은 자리를 지킨다 — 노드가 커서로 튀지 않는다', () => {
    const { hit, node } = nodeHit();

    // 노드 중심에서 오른쪽으로 20 떨어진 곳을 잡는다
    const grabAt = { x: node.center.x + 20, y: node.center.y };
    const g = onPointerDown(IDLE, { screen: grabAt, world: grabAt }, hit, DEFAULT_VIEWPORT);

    const to = { x: grabAt.x + 100, y: grabAt.y + 50 };
    const moved = onPointerMove(g, { screen: to, world: to });

    expect(moved.intent).toEqual({
      kind: 'drag-move',
      nodeId: 'a',
      at: { x: node.center.x + 100, y: node.center.y + 50 },
    });
  });

  it('떼면 그 자리를 문서에 적으라고 한다', () => {
    const { hit, node } = nodeHit();

    const g = onPointerDown(IDLE, at(node.center.x, node.center.y), hit, DEFAULT_VIEWPORT);
    const moved = onPointerMove(g, at(node.center.x + 100, node.center.y));
    const up = onPointerUp(moved.gesture, at(node.center.x + 100, node.center.y));

    expect(up.intent).toEqual({
      kind: 'commit-drag',
      nodeId: 'a',
      at: { x: node.center.x + 100, y: node.center.y },
    });
    expect(up.gesture).toEqual(IDLE);
  });
});

describe('팬', () => {
  it('배경을 끌면 화면이 따라온다', () => {
    const g = onPointerDown(IDLE, at(0, 0), undefined, DEFAULT_VIEWPORT);
    const moved = onPointerMove(g, at(50, 30));

    expect(moved.gesture.kind).toBe('panning');
    expect(moved.intent.kind).toBe('pan');
    if (moved.intent.kind !== 'pan') return;
    expect(moved.intent.viewport.x).toBe(-50);
    expect(moved.intent.viewport.y).toBe(-30);
  });

  /**
   * 팬은 누른 자리에서 재야 한다. 직전 자리에서 재면 반올림 오차가 쌓인다.
   *
   * **세 번 움직이는 것이 중요하다.** 첫 번째 움직임은 아직 `pressed` 라
   * 문턱을 넘는 전환 그 자체이고, `panning` 갈래는 두 번째부터 돈다. 두 번만
   * 움직이면 그 갈래를 딱 한 번 지나므로 "자리를 갱신하며 쌓이는" 버그가
   * 드러날 자리가 없다 — 세 번째에서야 어긋난다.
   */
  it('팬은 여러 번 움직여도 누른 자리에서 잰다', () => {
    const g = onPointerDown(IDLE, at(0, 0), undefined, DEFAULT_VIEWPORT);

    const first = onPointerMove(g, at(10, 0));
    if (first.intent.kind !== 'pan') throw new Error('팬이 아니다');
    expect(first.intent.viewport.x).toBe(-10);

    const second = onPointerMove(first.gesture, at(30, 0));
    if (second.intent.kind !== 'pan') throw new Error('팬이 아니다');
    expect(second.intent.viewport.x).toBe(-30);

    const third = onPointerMove(second.gesture, at(45, 0));
    if (third.intent.kind !== 'pan') throw new Error('팬이 아니다');
    expect(third.intent.viewport.x).toBe(-45);
  });

  it('배경을 눌렀다 그냥 떼면 선택을 푼다', () => {
    const g = onPointerDown(IDLE, at(0, 0), undefined, DEFAULT_VIEWPORT);
    const up = onPointerUp(g, at(0, 0));
    expect(up.intent).toEqual({ kind: 'select', hit: undefined });
  });
});

describe('노드가 아닌 것', () => {
  it('선을 눌렀다 끌면 노드 끌기가 아니라 팬이다', () => {
    const graph = buildGraph(parse('service a\nservice b\na -> b'));
    const scene = buildScene(graph, new Map());
    const edge = scene.edges[0];
    if (edge === undefined) throw new Error('선이 없다');

    const g = onPointerDown(IDLE, at(0, 0), { kind: 'edge', edge }, DEFAULT_VIEWPORT);
    const moved = onPointerMove(g, at(50, 0));

    expect(moved.gesture.kind).toBe('panning');
  });
});

describe('빈 상태', () => {
  it('누르지 않은 채 움직이거나 떼도 아무 일이 없다', () => {
    expect(onPointerMove(IDLE, at(10, 10))).toEqual({ gesture: IDLE, intent: { kind: 'none' } });
    expect(onPointerUp(IDLE, at(10, 10))).toEqual({ gesture: IDLE, intent: { kind: 'none' } });
  });
});
