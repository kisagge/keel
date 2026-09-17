import { parse } from '@keel/dsl';
import { buildGraph } from '@keel/graph';
import { describe, expect, it } from 'vitest';
import { placeEdges, selfLoopPath } from '../src/edges.js';
import type { PlacedEdge } from '../src/edges.js';
import { distance, rectBottom, rectCenter, rectContains, rectRight } from '../src/geometry.js';
import type { Rect } from '../src/geometry.js';
import { approximateMeasureText } from '../src/measure.js';
import { DEFAULT_THEME } from '../src/theme.js';
import { expectAllFinite, graphOf, layoutOf, sceneOf } from './helpers/scene.js';

const theme = DEFAULT_THEME;

/** 접점이 노드 테두리 위에 있는지. `gap` 만큼 떨어진 것은 감안한다 */
function onBorderBand(rect: Rect, p: { x: number; y: number }): boolean {
  const center = rectCenter(rect);
  const dx = Math.abs(p.x - center.x);
  const dy = Math.abs(p.y - center.y);
  const slack = theme.edge.gap + 1e-6;

  const nearVertical = Math.abs(dx - rect.width / 2) <= slack && dy <= rect.height / 2 + slack;
  const nearHorizontal = Math.abs(dy - rect.height / 2) <= slack && dx <= rect.width / 2 + slack;
  return nearVertical || nearHorizontal;
}

describe('곧은 선', () => {
  it('양 끝이 노드 테두리 가까이에 선다', () => {
    const scene = sceneOf('service a\nservice b\na -> b');
    const edge = scene.edges[0];
    const from = scene.nodeById.get('a')?.rect;
    const to = scene.nodeById.get('b')?.rect;
    expect(edge && from && to).toBeTruthy();
    if (!edge || !from || !to) return;

    expect(onBorderBand(from, edge.path[0] ?? { x: 0, y: 0 })).toBe(true);
    expect(onBorderBand(to, edge.path[edge.path.length - 1] ?? { x: 0, y: 0 })).toBe(true);
  });

  it('노드 안으로 파고들지 않는다', () => {
    const scene = sceneOf('service a\nservice b\na -> b');
    const edge = scene.edges[0];
    const from = scene.nodeById.get('a')?.rect;
    if (!edge || !from) return;
    // 시작점은 테두리 근처이되 상자 한가운데는 아니다
    expect(distance(edge.path[0] ?? { x: 0, y: 0 }, rectCenter(from))).toBeGreaterThan(
      from.height / 2 - 1,
    );
  });

  it('점 둘짜리 폴리라인이다', () => {
    const scene = sceneOf('service a\nservice b\na -> b');
    expect(scene.edges[0]?.path).toHaveLength(2);
    expect(scene.edges[0]?.kind).toBe('straight');
  });

  it('테두리에 딱 붙지 않고 틈을 둔다', () => {
    const layout = layoutOf({ a: { x: 0, y: 0 }, b: { x: 400, y: 0 } });
    const scene = sceneOf('service a\nservice b\na -> b', layout);
    const from = scene.nodeById.get('a')?.rect;
    const start = scene.edges[0]?.path[0];
    if (!from || !start) return;
    expect(start.x).toBeCloseTo(rectRight(from) + theme.edge.gap, 6);
  });
});

describe('화살촉', () => {
  it('-> 는 있고 -- 는 없다', () => {
    const scene = sceneOf('service a\nservice b\nservice c\na -> b\nb -- c');
    const arrowed = scene.edges.find((e) => e.edge.style === 'arrow');
    const plain = scene.edges.find((e) => e.edge.style === 'line');
    expect(arrowed?.arrow).toBeDefined();
    expect(plain?.arrow).toBeUndefined();
  });

  it('꼭짓점이 폴리라인의 마지막 점이다', () => {
    const scene = sceneOf('service a\nservice b\na -> b');
    const edge = scene.edges[0];
    expect(edge?.arrow?.tip).toEqual(edge?.path[edge.path.length - 1]);
  });

  it('두 날개가 꼭짓점에서 같은 거리에 있다', () => {
    const scene = sceneOf('service a\nservice b\na -> b');
    const arrow = scene.edges[0]?.arrow;
    if (!arrow) return;
    expect(distance(arrow.tip, arrow.left)).toBeCloseTo(distance(arrow.tip, arrow.right), 6);
  });

  it('겨누는 쪽을 향한다', () => {
    const layout = layoutOf({ a: { x: 0, y: 0 }, b: { x: 400, y: 0 } });
    const arrow = sceneOf('service a\nservice b\na -> b', layout).edges[0]?.arrow;
    if (!arrow) return;
    // 오른쪽으로 가는 선이므로 날개가 꼭짓점보다 왼쪽에 있다
    expect(arrow.left.x).toBeLessThan(arrow.tip.x);
    expect(arrow.right.x).toBeLessThan(arrow.tip.x);
  });
});

describe('자기 자신을 가리키는 선', () => {
  /**
   * 파서는 self-edge 를 경고로만 남기고 엣지를 그대로 넣는다. 안 그리면
   * 사람이 친 줄이 화면에서 통째로 사라진다.
   */
  it('파서가 경고만 하고 엣지는 그래프에 들어온다', () => {
    const doc = parse('service a\na -> a');
    expect(doc.diagnostics.map((d) => d.code)).toContain('self-edge');
    expect(buildGraph(doc).edges).toHaveLength(1);
  });

  it('고리로 그려진다', () => {
    const scene = sceneOf('service a\na -> a');
    const edge = scene.edges[0];
    expect(edge?.kind).toBe('self');
    expect(edge?.path.length).toBeGreaterThanOrEqual(4);
    expectAllFinite(edge);
  });

  it('고리가 노드 밖으로 나간다', () => {
    const scene = sceneOf('service a\na -> a');
    const rect = scene.nodeById.get('a')?.rect;
    const edge = scene.edges[0];
    if (!rect || !edge) return;
    expect(edge.path.some((p) => p.y < rect.y || p.x > rectRight(rect))).toBe(true);
  });

  it('상자가 노드 위와 오른쪽을 덮는다', () => {
    const scene = sceneOf('service a\na -> a');
    const rect = scene.nodeById.get('a')?.rect;
    const bounds = scene.edges[0]?.bounds;
    if (!rect || !bounds) return;
    expect(bounds.y).toBeLessThan(rect.y);
    expect(rectRight(bounds)).toBeGreaterThan(rectRight(rect));
  });

  it('같은 노드면 늘 같은 자리에 선다', () => {
    const rect: Rect = { x: 0, y: 0, width: 100, height: 44 };
    expect(selfLoopPath(rect, theme)).toEqual(selfLoopPath(rect, theme));
  });
});

describe('나란한 선', () => {
  it('같은 두 노드를 잇는 선들이 갈라진다', () => {
    const scene = sceneOf('service a\nservice b\na -> b\na -> b\na -> b');
    expect(scene.edges).toHaveLength(3);

    const middles = scene.edges.map((e) => e.path[1] ?? e.path[0]);
    const unique = new Set(middles.map((p) => `${p?.x ?? 0},${p?.y ?? 0}`));
    expect(unique.size).toBe(3);
  });

  it('하나뿐이면 안 벌린다 — 곧은 선이다', () => {
    expect(sceneOf('service a\nservice b\na -> b').edges[0]?.path).toHaveLength(2);
  });

  /** dsl 의 key 로 묶으면 a->b 와 b->a 가 다른 바구니라 겹친 채로 남는다 */
  it('방향이 반대인 선도 같은 쌍으로 보고 벌린다', () => {
    const layout = layoutOf({ a: { x: 0, y: 0 }, b: { x: 400, y: 0 } });
    const scene = sceneOf('service a\nservice b\na -> b\nb -> a', layout);
    expect(scene.edges).toHaveLength(2);

    const [first, second] = scene.edges;
    if (!first || !second) return;
    // 서로 다른 쪽으로 휘어야 한다
    expect(first.path).toHaveLength(3);
    expect(second.path).toHaveLength(3);
    expect(first.path[1]?.y).not.toBeCloseTo(second.path[1]?.y ?? 0, 3);
  });

  it('벌려도 접점은 여전히 테두리 근처다', () => {
    const scene = sceneOf('service a\nservice b\na -> b\na -> b');
    const from = scene.nodeById.get('a')?.rect;
    const to = scene.nodeById.get('b')?.rect;
    if (!from || !to) return;

    for (const edge of scene.edges) {
      expect(onBorderBand(from, edge.path[0] ?? { x: 0, y: 0 })).toBe(true);
      expect(onBorderBand(to, edge.path[edge.path.length - 1] ?? { x: 0, y: 0 })).toBe(true);
    }
  });
});

describe('망가진 자리', () => {
  /** 두 노드를 같은 좌표에 고정하는 것은 실제로 일어난다 */
  it('같은 자리에 고정된 두 노드도 NaN 을 안 만든다', () => {
    const layout = layoutOf({ a: { x: 100, y: 100 }, b: { x: 100, y: 100 } });
    const scene = sceneOf('service a\nservice b\na -> b', layout);
    expectAllFinite(scene.edges);
    expect(scene.edges[0]?.path.length).toBeGreaterThanOrEqual(2);
  });

  /** 같은 자리면 잴 방향이 없다. 선이 점으로 줄어들 뿐 좌표는 멀쩡해야 한다 */
  it('중심이 똑같으면 선이 한 점으로 오므라든다', () => {
    const layout = layoutOf({ a: { x: 100, y: 100 }, b: { x: 100, y: 100 } });
    const edge = sceneOf('service a\nservice b\na -> b', layout).edges[0];
    if (!edge) return;
    expect(edge.path).toHaveLength(2);
    expect(edge.path[0]).toEqual(edge.path[1]);
    expectAllFinite(edge);
  });

  it('상자가 겹쳐 있어도 유한한 선이 나온다', () => {
    const layout = layoutOf({ a: { x: 0, y: 0 }, b: { x: 1, y: 0 } });
    const edge = sceneOf('service a\nservice b\na -> b', layout).edges[0];
    if (!edge) return;
    expect(edge.path).toHaveLength(2);
    expectAllFinite(edge);
  });

  it('오므려도 화살촉은 선다', () => {
    const layout = layoutOf({ a: { x: 0, y: 0 }, b: { x: 0, y: 0 } });
    const arrow = sceneOf('service a\nservice b\na -> b', layout).edges[0]?.arrow;
    expect(arrow).toBeDefined();
    expectAllFinite(arrow);
  });

  it('자리 없는 노드에 걸린 선은 빠진다', () => {
    const graph = graphOf('service a\nservice b\na -> b');
    const onlyA = new Map([['a', { x: 0, y: 0, width: 100, height: 44 }]]);
    expect(placeEdges(graph.edges, onlyA, theme, approximateMeasureText)).toHaveLength(0);
  });
});

describe('선 라벨', () => {
  it('라벨이 있으면 자리와 글자가 함께 나온다', () => {
    const scene = sceneOf('service a\nservice b\na -> b "주문 저장"');
    const edge = scene.edges[0];
    expect(edge?.labelText).toBe('주문 저장');
    expect(edge?.labelAnchor).toBeDefined();
  });

  it('라벨이 없으면 둘 다 없다', () => {
    const edge = sceneOf('service a\nservice b\na -> b').edges[0];
    expect(edge?.labelText).toBeUndefined();
    expect(edge?.labelAnchor).toBeUndefined();
  });

  it('획 위에 앉지 않고 비켜 있다', () => {
    const layout = layoutOf({ a: { x: 0, y: 0 }, b: { x: 400, y: 0 } });
    const edge = sceneOf('service a\nservice b\na -> b "라벨"', layout).edges[0];
    if (!edge?.labelAnchor) return;
    // 가로선이므로 위로 비켜 있어야 한다
    expect(Math.abs(edge.labelAnchor.y)).toBeCloseTo(theme.edge.labelOffset, 6);
  });

  it('긴 라벨은 잘린다', () => {
    const edge = sceneOf(`service a\nservice b\na -> b "${'가'.repeat(100)}"`).edges[0];
    expect(edge?.labelText?.endsWith('…')).toBe(true);
  });

  it('상자가 라벨까지 감싼다', () => {
    const layout = layoutOf({ a: { x: 0, y: 0 }, b: { x: 400, y: 0 } });
    const edge = sceneOf('service a\nservice b\na -> b "주문 저장"', layout).edges[0];
    if (!edge?.labelAnchor) return;
    expect(rectContains(edge.bounds, edge.labelAnchor)).toBe(true);
  });
});

describe('장면에 붙는 것', () => {
  it('그래프 엣지 하나당 기하 하나다', () => {
    const graph = graphOf('service a\nservice b\nservice c\na -> b\nb -- c\na -> c');
    const scene = sceneOf('service a\nservice b\nservice c\na -> b\nb -- c\na -> c');
    expect(scene.edges).toHaveLength(graph.edges.length);
  });

  it('열쇠로 찾을 수 있다', () => {
    const scene = sceneOf('service a\nservice b\na -> b');
    const key = scene.edges[0]?.key ?? '';
    expect(scene.edgeByKey.get(key)?.key).toBe(key);
  });

  it('내용 경계가 선까지 담는다', () => {
    const scene = sceneOf('service a\na -> a');
    const bounds = scene.edges[0]?.bounds;
    if (!bounds) return;
    expect(scene.contentBounds.y).toBeLessThanOrEqual(bounds.y);
    expect(rectBottom(scene.contentBounds)).toBeGreaterThanOrEqual(rectBottom(bounds));
  });

  it('그룹을 가리키는 선은 애초에 그래프에 없다', () => {
    const scene = sceneOf('group g {\n  service a\n}\na -> g');
    expect(scene.edges).toHaveLength(0);
  });

  it('어디에도 NaN 이 없다', () => {
    const scene = sceneOf(
      'actor u\nservice web\nservice api\ndb orders\nu -> web "주문"\nweb -> api\napi -> orders\napi -> api\nweb -> api "두 번째"',
    );
    expectAllFinite(scene.edges);
  });
});

describe('선 기하 되풀이', () => {
  it('같은 것을 넣으면 같은 선이 나온다', () => {
    const source = 'service a\nservice b\na -> b "라벨"\na -> b';
    const first: PlacedEdge[] = [...sceneOf(source).edges];
    const second: PlacedEdge[] = [...sceneOf(source).edges];
    expect(first).toEqual(second);
  });
});
