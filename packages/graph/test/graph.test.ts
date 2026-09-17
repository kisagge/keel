import { parse } from '@keel/dsl';
import { describe, expect, it } from 'vitest';
import { countChanges, diffGraphs, isEmptyDiff } from '../src/diff.js';
import { buildGraph, edgesTouching, nodesInGroup } from '../src/model.js';

const g = (src: string) => buildGraph(parse(src));

describe('그래프 세우기', () => {
  it('라벨이 없으면 id 를 글자로 쓴다', () => {
    const graph = g('service api\nservice web "스토어"');
    expect(graph.nodeById.get('api')?.label).toBe('api');
    expect(graph.nodeById.get('api')?.rawLabel).toBeUndefined();
    expect(graph.nodeById.get('web')?.label).toBe('스토어');
  });

  it('그룹의 깊이를 센다', () => {
    const graph = g('group a {\n  group b {\n    group c {\n      service x\n    }\n  }\n}');
    expect(graph.groupById.get('a')?.depth).toBe(0);
    expect(graph.groupById.get('b')?.depth).toBe(1);
    expect(graph.groupById.get('c')?.depth).toBe(2);
  });

  it('그룹에 직접 든 노드만 돌려준다', () => {
    const graph = g('group outer {\n  service a\n  group inner {\n    service b\n  }\n}');
    expect(nodesInGroup(graph, 'outer').map((n) => n.id)).toEqual(['a']);
    expect(nodesInGroup(graph, 'inner').map((n) => n.id)).toEqual(['b']);
  });

  it('노드에 닿는 엣지를 모은다', () => {
    const graph = g('a -> b\nb -> c\nc -> a');
    expect(edgesTouching(graph, 'b')).toHaveLength(2);
  });

  /**
   * 이것을 안 거르면 렌더러가 없는 노드의 좌표를 찾는다.
   * 렌더 루프 한가운데라 화면 전체가 멈춘다.
   */
  it('그룹을 가리키는 엣지는 버리고 이유를 남긴다', () => {
    const graph = g('group payment {\n  service pay\n}\nweb -> payment');
    expect(graph.edges).toHaveLength(0);
    expect(graph.problems.map((p) => p.code)).toContain('edge-to-group');
  });

  it('선언 없이 만들어진 노드도 그래프에 들어간다', () => {
    const graph = g('web -> api');
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(['api', 'web']);
    expect(graph.nodeById.get('web')?.implicit).toBe(true);
  });
});

describe('버전 비교', () => {
  it('같은 문서면 아무 차이가 없다', () => {
    const src = 'service a\nservice b\na -> b';
    expect(isEmptyDiff(diffGraphs(g(src), g(src)))).toBe(true);
  });

  it('줄 순서만 바꾼 것은 차이가 아니다', () => {
    // 텍스트로 견주면 전부 바뀐 것으로 나오는 자리다
    const before = g('service a\nservice b\na -> b');
    const after = g('service b\nservice a\na -> b');
    expect(isEmptyDiff(diffGraphs(before, after))).toBe(true);
  });

  it('주석과 들여쓰기를 고친 것도 차이가 아니다', () => {
    const before = g('group x {\nservice a\n}');
    const after = g('# 설명을 붙였다\ngroup x {\n    service a\n}');
    expect(isEmptyDiff(diffGraphs(before, after))).toBe(true);
  });

  it('생기고 없어진 노드를 가른다', () => {
    const diff = diffGraphs(g('service a\nservice b'), g('service a\nservice c'));
    expect(diff.nodes.added.map((n) => n.id)).toEqual(['c']);
    expect(diff.nodes.removed.map((n) => n.id)).toEqual(['b']);
  });

  it('무엇이 바뀌었는지까지 집어 준다', () => {
    const diff = diffGraphs(g('service a "옛"'), g('db a "새"'));
    expect(diff.nodes.changed).toHaveLength(1);
    expect([...(diff.nodes.changed[0]?.fields ?? [])].sort()).toEqual(['kind', 'label']);
  });

  it('그룹을 옮긴 것을 잡는다', () => {
    const before = g('group x {\n  service a\n}');
    const after = g('group x {\n}\nservice a');
    expect(diffGraphs(before, after).nodes.changed[0]?.fields).toEqual(['group']);
  });

  /**
   * 열쇠에 화살표 모양이 들어 있으면 이 검사가 진다 — 없어짐 1 + 생김 1 로
   * 나와서, 정작 "방향 표시가 바뀌었다" 는 말을 못 한다.
   */
  it('화살표 모양만 바꾼 것은 같은 선이 바뀐 것으로 본다', () => {
    const diff = diffGraphs(g('a -> b'), g('a -- b'));
    expect(diff.edges.added).toEqual([]);
    expect(diff.edges.removed).toEqual([]);
    expect(diff.edges.changed[0]?.fields).toEqual(['style']);
  });

  it('엣지 라벨이 바뀐 것을 잡는다', () => {
    const diff = diffGraphs(g('a -> b "옛"'), g('a -> b "새"'));
    expect(diff.edges.changed[0]?.fields).toEqual(['label']);
  });

  it('끝점이 바뀐 엣지는 다른 선으로 본다', () => {
    const diff = diffGraphs(g('a -> b'), g('a -> c'));
    expect(diff.edges.added.map((e) => e.to)).toEqual(['c']);
    expect(diff.edges.removed.map((e) => e.to)).toEqual(['b']);
  });

  it('요약 숫자를 센다', () => {
    const before = g('service a\nservice b\na -> b');
    const after = g('service a "이름"\nservice c\na -> c');
    expect(countChanges(diffGraphs(before, after))).toEqual({ added: 2, removed: 2, changed: 1 });
  });
});
