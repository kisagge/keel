import type { Graph, GraphGroup } from '@keel/graph';
import { describe, expect, it } from 'vitest';
import { rectBottom, rectContainsRect, rectRight } from '../src/geometry.js';
import { groupFillAlpha, placeGroups } from '../src/groups.js';
import { groupPadding } from '../src/stopgap-layout.js';
import { DEFAULT_THEME } from '../src/theme.js';
import { buildGroupTree } from '../src/tree.js';
import { expectAllFinite, graphOf, sceneOf } from './helpers/scene.js';

const theme = DEFAULT_THEME;

describe('그룹 테두리', () => {
  it('직속 노드를 담는다', () => {
    const scene = sceneOf('group g "묶음" {\n  service a\n  service b\n}');
    const g = scene.groupById.get('g');
    expect(g).toBeDefined();
    for (const node of scene.nodes) {
      expect(rectContainsRect(g?.rect ?? scene.contentBounds, node.rect)).toBe(true);
    }
  });

  /** 자식이 부모 밖으로 나가면 중첩이 화면에서 거짓말이 된다 */
  it('부모가 자식 그룹을 담고 여백이 최솟값 이상이다', () => {
    const scene = sceneOf(
      'group outer "바깥" {\n  service a\n  group inner "안" {\n    db b\n  }\n}',
    );
    const outer = scene.groupById.get('outer');
    const inner = scene.groupById.get('inner');
    expect(outer && inner).toBeTruthy();
    if (!outer || !inner) return;

    expect(rectContainsRect(outer.rect, inner.rect)).toBe(true);
    expect(inner.rect.x - outer.rect.x).toBeGreaterThanOrEqual(theme.group.minPadding);
    expect(rectRight(outer.rect) - rectRight(inner.rect)).toBeGreaterThanOrEqual(
      theme.group.minPadding,
    );
    expect(rectBottom(outer.rect) - rectBottom(inner.rect)).toBeGreaterThanOrEqual(
      theme.group.minPadding,
    );
  });

  it('깊이 세 겹도 차례로 담긴다', () => {
    const scene = sceneOf(
      'group a {\n  group b {\n    group c {\n      service x\n    }\n  }\n}',
    );
    const [a, b, c] = ['a', 'b', 'c'].map((id) => scene.groupById.get(id));
    expect(a && b && c).toBeTruthy();
    if (!a || !b || !c) return;
    expect(rectContainsRect(a.rect, b.rect)).toBe(true);
    expect(rectContainsRect(b.rect, c.rect)).toBe(true);
    expect(rectContainsRect(c.rect, scene.nodeById.get('x')?.rect ?? a.rect)).toBe(true);
  });

  it('라벨 띠는 테두리 위쪽에 붙어 있다', () => {
    const scene = sceneOf('group g "이름" {\n  service a\n}');
    const g = scene.groupById.get('g');
    expect(g?.labelRect.y).toBe(g?.rect.y);
    expect(g?.labelRect.height).toBe(theme.group.labelHeight);
    expect(g?.labelRect.width).toBe(g?.rect.width);
  });

  /**
   * 라벨을 테두리 안쪽에 두면 맨 위 노드를 가린다.
   *
   * **깊은 그룹으로 본다.** 얕은 그룹은 여백(24)이 라벨 높이(22)보다 커서
   * 라벨을 안쪽에 둬도 우연히 안 겹친다 — 얕은 것만 보면 이 검사는 아무것도
   * 묶지 못한다. 깊이 3 에서는 여백이 최솟값 10 이라 실제로 겹친다.
   */
  it('깊은 그룹에서도 라벨 띠가 노드를 덮지 않는다', () => {
    const scene = sceneOf(
      'group a {\n  group b {\n    group c {\n      group d "깊다" {\n        service x\n      }\n    }\n  }\n}',
    );
    const d = scene.groupById.get('d');
    const x = scene.nodeById.get('x');
    expect(d && x).toBeTruthy();
    if (!d || !x) return;

    // 여백이 라벨 높이보다 작아진 자리라야 이 검사가 뜻을 가진다
    expect(groupPadding(d.group.depth, theme)).toBeLessThan(theme.group.labelHeight);
    expect(x.rect.y).toBeGreaterThanOrEqual(rectBottom(d.labelRect));
  });
});

describe('빈 그룹', () => {
  it('노드가 없어도 유한한 상자를 받는다', () => {
    const scene = sceneOf('group empty "빈 것" {\n}');
    const g = scene.groupById.get('empty');
    expect(g?.empty).toBe(true);
    expect(g?.rect.width).toBe(theme.group.emptySize.width);
    expect(g?.rect.height).toBe(theme.group.emptySize.height);
    expectAllFinite(scene.groups);
  });

  it('빈 그룹만 든 그룹도 선다', () => {
    const scene = sceneOf('group outer {\n  group inner {\n  }\n}');
    const outer = scene.groupById.get('outer');
    const inner = scene.groupById.get('inner');
    expect(inner?.empty).toBe(true);
    // 바깥은 안쪽 자리표를 감싸므로 비어 있지 않다
    expect(outer?.empty).toBe(false);
    expect(rectContainsRect(outer?.rect ?? { x: 0, y: 0, width: 0, height: 0 }, inner?.rect ?? { x: 0, y: 0, width: 1, height: 1 })).toBe(true);
  });

  it('빈 그룹 둘이 겹치지 않는다', () => {
    const scene = sceneOf('group a {\n}\ngroup b {\n}');
    const ra = scene.groupById.get('a')?.rect;
    const rb = scene.groupById.get('b')?.rect;
    expect(ra && rb).toBeTruthy();
    if (!ra || !rb) return;
    const apart =
      rectRight(ra) <= rb.x || rectRight(rb) <= ra.x || rectBottom(ra) <= rb.y || rectBottom(rb) <= ra.y;
    expect(apart).toBe(true);
  });

  it('자리표가 없어도 던지지 않고 유한한 상자를 준다', () => {
    const graph = graphOf('group g {\n}');
    const groups = placeGroups(buildGroupTree(graph), new Map(), new Map(), theme);
    expect(groups).toHaveLength(1);
    expectAllFinite(groups);
  });
});

describe('그리는 순서', () => {
  /** 부모를 먼저 깔고 자식을 얹어야 중첩이 눈에 보인다 */
  it('부모가 자식보다 앞선다', () => {
    const scene = sceneOf(
      'group a {\n  group b {\n    service x\n  }\n  group c {\n    service y\n  }\n}',
    );
    const order = scene.groups.map((g) => g.id);
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('c'));
  });

  it('모든 그룹이 한 번씩만 나온다', () => {
    const scene = sceneOf('group a {\n  group b {\n    service x\n  }\n}\ngroup c {\n  db y\n}');
    const order = scene.groups.map((g) => g.id);
    expect(order).toHaveLength(3);
    expect(new Set(order).size).toBe(3);
  });
});

describe('망가진 그래프', () => {
  it('부모가 고리를 이뤄도 그룹이 다 그려진다', () => {
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

    const placed = placeGroups(buildGroupTree(cyclic), new Map(), new Map(), theme);
    expect(placed.map((g) => g.id).sort()).toEqual(['a', 'b']);
    expectAllFinite(placed);
  });
});

describe('깊이에 따른 값', () => {
  it('여백은 줄고 채움은 짙어진다', () => {
    expect(groupPadding(0, theme)).toBeGreaterThan(groupPadding(2, theme));
    expect(groupFillAlpha(2, theme)).toBeGreaterThan(groupFillAlpha(0, theme));
  });
});

describe('내용 경계', () => {
  it('그룹 테두리까지 담는다', () => {
    const scene = sceneOf('group g "묶음" {\n  service a\n}');
    for (const g of scene.groups) {
      expect(rectContainsRect(scene.contentBounds, g.rect)).toBe(true);
    }
  });
});
