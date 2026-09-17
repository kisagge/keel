import type { Graph, GraphGroup } from '@keel/graph';
import { describe, expect, it } from 'vitest';
import { rectCenter, rectContainsRect } from '../src/geometry.js';
import { approximateMeasureText } from '../src/measure.js';
import { measureNodeBox, nodeTextStyle } from '../src/node-box.js';
import { EMPTY_LAYOUT, EMPTY_SCENE, buildScene } from '../src/scene.js';
import { groupPadding, stopgapPlacement } from '../src/stopgap-layout.js';
import { DEFAULT_THEME } from '../src/theme.js';
import { buildGroupTree } from '../src/tree.js';
import { expectAllFinite, graphOf, layoutOf, sceneOf } from './helpers/scene.js';

const theme = DEFAULT_THEME;

describe('노드 상자', () => {
  it('긴 이름이 넓은 상자를 만든다', () => {
    const short = sceneOf('service a "짧"').nodeById.get('a');
    const long = sceneOf('service a "아주 긴 서비스 이름"').nodeById.get('a');
    expect(long?.size.width).toBeGreaterThan(short?.size.width ?? 0);
  });

  it('최소·최대 너비로 물린다', () => {
    const tiny = sceneOf('service a "ㄱ"').nodeById.get('a');
    const huge = sceneOf(`service a "${'가'.repeat(200)}"`).nodeById.get('a');
    expect(tiny?.size.width).toBe(theme.node.minWidth);
    expect(huge?.size.width).toBe(theme.node.maxWidth);
  });

  it('종류가 달라도 높이는 같다', () => {
    const scene = sceneOf('service a\ndb b\nqueue c\nexternal d\nactor e');
    const heights = new Set(scene.nodes.map((n) => n.size.height));
    expect(heights).toEqual(new Set([theme.node.height]));
  });

  it('상자에 안 들어가는 이름은 잘려서 들어간다', () => {
    const placed = sceneOf(`service a "${'가'.repeat(200)}"`).nodeById.get('a');
    expect(placed?.label.endsWith('…')).toBe(true);
    expect(
      approximateMeasureText(placed?.label ?? '', nodeTextStyle(theme)),
    ).toBeLessThanOrEqual((placed?.size.width ?? 0) - theme.node.paddingX * 2);
  });

  it('라벨이 없으면 id 를 쓴다', () => {
    expect(sceneOf('service api').nodeById.get('api')?.label).toBe('api');
  });
});

describe('좌표 계약', () => {
  /**
   * 이 검사가 `Y.Map` 에 저장되는 값의 뜻을 붙들고 있다. 반올림이나 격자 맞춤이
   * 여기 끼어들면 남이 옮긴 자리가 조용히 달라진다.
   */
  it('중심이 레이아웃에 적힌 값과 정확히 같다', () => {
    const layout = layoutOf({ a: { x: 123.456, y: -78.9 } });
    const placed = sceneOf('service a\nservice b', layout).nodeById.get('a');
    expect(placed?.center).toEqual({ x: 123.456, y: -78.9 });
  });

  it('상자의 중심이 곧 그 좌표다', () => {
    const layout = layoutOf({ a: { x: 40, y: 20 } });
    const placed = sceneOf('service a', layout).nodeById.get('a');
    expect(rectCenter(placed?.rect ?? { x: 0, y: 0, width: 0, height: 0 })).toEqual({
      x: 40,
      y: 20,
    });
  });

  /** 이름을 고쳐 상자가 넓어져도 자리는 그대로여야 한다 — 중심으로 잡은 이유다 */
  it('이름이 길어져도 중심이 안 움직인다', () => {
    const layout = layoutOf({ a: { x: 100, y: 100 } });
    const before = sceneOf('service a', layout).nodeById.get('a');
    const after = sceneOf('service a "아주 긴 이름을 붙였다"', layout).nodeById.get('a');
    expect(after?.center).toEqual(before?.center);
    expect(after?.size.width).toBeGreaterThan(before?.size.width ?? 0);
  });
});

describe('고정 여부', () => {
  it('레이아웃에 있으면 고정, 없으면 아니다', () => {
    const scene = sceneOf('service a\nservice b', layoutOf({ a: { x: 0, y: 0 } }));
    expect(scene.nodeById.get('a')?.pinned).toBe(true);
    expect(scene.nodeById.get('b')?.pinned).toBe(false);
  });

  it('임시 배치를 끄면 고정된 것만 남는다', () => {
    const scene = sceneOf('service a\nservice b', layoutOf({ a: { x: 0, y: 0 } }), {
      stopgap: false,
    });
    expect(scene.nodes.map((n) => n.id)).toEqual(['a']);
  });
});

describe('장면 세우기', () => {
  it('그래프 노드 하나당 상자 하나다', () => {
    const source = 'service a\ndb b\ngroup g {\n  queue c\n}\na -> c';
    const graph = graphOf(source);
    const scene = buildScene(graph, EMPTY_LAYOUT);
    expect(scene.nodes).toHaveLength(graph.nodes.length);
  });

  it('선언 없이 생긴 노드도 자리를 받는다', () => {
    const scene = sceneOf('web -> api');
    expect(scene.nodes.map((n) => n.id).sort()).toEqual(['api', 'web']);
    expect(scene.nodeById.get('api')?.node.implicit).toBe(true);
  });

  it('빈 문서는 빈 장면이다', () => {
    const scene = sceneOf('');
    expect(scene.nodes).toHaveLength(0);
    expect(scene.contentBounds).toEqual(EMPTY_SCENE.contentBounds);
  });

  it('내용 경계가 모든 상자를 담는다', () => {
    const scene = sceneOf('service a\nservice b\ngroup g {\n  db c\n}');
    for (const node of scene.nodes) {
      expect(rectContainsRect(scene.contentBounds, node.rect)).toBe(true);
    }
  });

  it('어디에도 NaN 이 없다', () => {
    const scene = sceneOf('service a\ngroup g {\n  group h {\n    db b\n  }\n}\na -> b');
    expectAllFinite(scene.nodes);
    expectAllFinite(scene.contentBounds);
  });

  it('같은 것을 넣으면 같은 장면이 나온다', () => {
    const source = 'service a\ngroup g {\n  db b\n  queue c\n}';
    expect(sceneOf(source).nodes).toEqual(sceneOf(source).nodes);
  });

  it('아무것도 기억하지 않는다 — 테마를 바꾸면 결과가 따라 바뀐다', () => {
    const source = 'service a';
    const wide = buildScene(graphOf(source), EMPTY_LAYOUT, {
      theme: { ...theme, node: { ...theme.node, minWidth: 400, maxWidth: 400 } },
    });
    expect(wide.nodeById.get('a')?.size.width).toBe(400);
    expect(sceneOf(source).nodeById.get('a')?.size.width).toBe(theme.node.minWidth);
  });
});

describe('그룹 나무', () => {
  it('중첩을 부모–자식으로 뒤집는다', () => {
    const tree = buildGroupTree(graphOf('group a {\n  group b {\n    service x\n  }\n}'));
    expect(tree.rootGroups.map((g) => g.id)).toEqual(['a']);
    expect(tree.childGroups.get('a')?.map((g) => g.id)).toEqual(['b']);
    expect(tree.childNodes.get('b')?.map((n) => n.id)).toEqual(['x']);
  });

  it('깊은 것부터 훑는다', () => {
    const tree = buildGroupTree(graphOf('group a {\n  group b {\n    service x\n  }\n}\ngroup c {\n}'));
    expect(tree.postOrder.map((g) => g.id)).toEqual(['b', 'a', 'c']);
  });

  it('그룹 밖 노드는 최상위다', () => {
    const tree = buildGroupTree(graphOf('service a\ngroup g {\n  db b\n}'));
    expect(tree.rootNodes.map((n) => n.id)).toEqual(['a']);
  });

  /**
   * 파서로는 고리 있는 그룹을 만들 수 없고 `buildGraph` 는 보고만 하고 `parentId`
   * 를 그대로 둔다. 여기서 안 끊으면 최상위에서 닿지 않아 장면에서 통째로 사라진다.
   */
  it('부모가 고리를 이뤄도 그룹이 사라지지 않는다', () => {
    const groups: GraphGroup[] = [
      { id: 'a', label: 'a', rawLabel: undefined, parentId: 'b', depth: 0 },
      { id: 'b', label: 'b', rawLabel: undefined, parentId: 'a', depth: 0 },
    ];
    const cyclic: Graph = {
      nodes: [],
      edges: [],
      groups,
      nodeById: new Map(),
      groupById: new Map(groups.map((g) => [g.id, g])),
      problems: [],
    };

    const tree = buildGroupTree(cyclic);
    expect(tree.postOrder).toHaveLength(2);
    expect(tree.detachedGroupIds.length).toBeGreaterThan(0);
  });

  it('모르는 부모를 가리키면 최상위로 본다', () => {
    const groups: GraphGroup[] = [
      { id: 'a', label: 'a', rawLabel: undefined, parentId: '없는그룹', depth: 3 },
    ];
    const graph: Graph = {
      nodes: [],
      edges: [],
      groups,
      nodeById: new Map(),
      groupById: new Map(groups.map((g) => [g.id, g])),
      problems: [],
    };
    expect(buildGroupTree(graph).rootGroups.map((g) => g.id)).toEqual(['a']);
  });
});

describe('임시 배치', () => {
  const sizesOf = (source: string) => {
    const graph = graphOf(source);
    return new Map(
      graph.nodes.map((n) => [n.id, measureNodeBox(n, approximateMeasureText, theme)]),
    );
  };

  it('노드끼리 겹치지 않는다', () => {
    const scene = sceneOf(
      'service a\nservice b\nservice c\nservice d\nservice e\nservice f\nservice g',
    );
    for (let i = 0; i < scene.nodes.length; i += 1) {
      for (let j = i + 1; j < scene.nodes.length; j += 1) {
        const a = scene.nodes[i]?.rect;
        const b = scene.nodes[j]?.rect;
        if (a === undefined || b === undefined) continue;
        const apart =
          a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
        expect(apart).toBe(true);
      }
    }
  });

  it('그룹 안 노드가 그룹 밖 노드와 섞이지 않는다', () => {
    const scene = sceneOf('service outside\ngroup g {\n  service inside\n}');
    const outside = scene.nodeById.get('outside');
    const inside = scene.nodeById.get('inside');
    expect(inside?.center.y).toBeGreaterThan(outside?.center.y ?? 0);
  });

  it('빈 그룹에도 앉을 자리를 잡아 준다', () => {
    const graph = graphOf('group empty "빈 그룹" {\n}');
    const result = stopgapPlacement(buildGroupTree(graph), sizesOf('group empty {\n}'), theme);
    expect(result.emptyGroupSeeds.get('empty')).toBeDefined();
    expectAllFinite(result.emptyGroupSeeds);
  });

  it('같은 것을 넣으면 같은 자리가 나온다', () => {
    const source = 'service a\ngroup g {\n  db b\n}\nservice c';
    const graph = graphOf(source);
    const first = stopgapPlacement(buildGroupTree(graph), sizesOf(source), theme);
    const second = stopgapPlacement(buildGroupTree(graph), sizesOf(source), theme);
    expect([...first.centers]).toEqual([...second.centers]);
  });

  it('여백은 깊어질수록 줄되 최솟값에서 멈춘다', () => {
    expect(groupPadding(0, theme)).toBe(24);
    expect(groupPadding(1, theme)).toBe(18);
    expect(groupPadding(2, theme)).toBe(12);
    expect(groupPadding(9, theme)).toBe(theme.group.minPadding);
  });
});
