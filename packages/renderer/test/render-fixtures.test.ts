import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@keel/dsl';
import { buildGraph } from '@keel/graph';
import { describe, expect, it } from 'vitest';
import { cullScene } from '../src/cull.js';
import { rectCenter, rectContainsRect, rectsIntersect } from '../src/geometry.js';
import type { Point } from '../src/geometry.js';
import { buildSpatialIndex, hitTest } from '../src/hit-test.js';
import { buildScene } from '../src/scene.js';
import type { Layout, Scene } from '../src/scene.js';
import { paintScene } from '../src/paint/scene.js';
import { childGroupsOf, buildGroupTree } from '../src/tree.js';
import { fitToContent } from '../src/viewport.js';
import { RecordingContext } from './helpers/recording-context.js';
import { expectAllFinite } from './helpers/scene.js';

/**
 * `dsl-roundtrip` 이 `fixtures/` 를 **전수**로 도는 방식을 한 패키지 옆으로 옮긴다.
 *
 * 목록을 손으로 들고 있으면 반드시 샌다. 여기서는 한 걸음 더 나가 **`dsl` 의
 * 픽스처까지 함께 돈다** — 거기에 `.keel` 파일을 하나 넣는 것만으로 렌더러
 * 검사에도 자동으로 들어온다. 패키지 경계를 넘는 대신 빠뜨릴 수가 없어진다.
 *
 * 걸리는 불변식은 "어떻게 생겼나" 가 아니라 **"성립하나"** 다 — 모양은 테마를
 * 바꾸면 달라지지만, 자손이 부모 안에 있다거나 노드 한가운데를 누르면 그 노드가
 * 잡힌다는 것은 무엇을 바꿔도 참이어야 한다.
 */

const DSL_FIXTURES = fileURLToPath(new URL('../../dsl/fixtures', import.meta.url));
const OWN_FIXTURES = fileURLToPath(new URL('../fixtures', import.meta.url));

interface Fixture {
  readonly name: string;
  readonly source: string;
}

function load(dir: string, prefix: string): Fixture[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.keel'))
    .sort()
    .map((f) => ({ name: `${prefix}/${f}`, source: readFileSync(join(dir, f), 'utf8') }));
}

const FIXTURES = [...load(DSL_FIXTURES, 'dsl'), ...load(OWN_FIXTURES, 'renderer')];

/** 흩어 놓되 상자 최대 너비(280)보다 넓게 벌려 겹치지 않게 한다 */
function scattered(ids: readonly string[]): Layout {
  const out = new Map<string, Point>();
  ids.forEach((id, i) => {
    out.set(id, { x: (i % 5) * 320, y: Math.floor(i / 5) * 320 });
  });
  return out;
}

const screen = { width: 1200, height: 900 };

describe('픽스처 전수 렌더', () => {
  it('픽스처가 양쪽에 다 있어야 한다', () => {
    expect(FIXTURES.filter((f) => f.name.startsWith('dsl/')).length).toBeGreaterThan(0);
    expect(FIXTURES.filter((f) => f.name.startsWith('renderer/')).length).toBeGreaterThan(0);
  });

  for (const fixture of FIXTURES) {
    describe(fixture.name, () => {
      const graph = buildGraph(parse(fixture.source));
      const ids = graph.nodes.map((n) => n.id);

      const layouts: { name: string; layout: Layout }[] = [
        { name: '빈 레이아웃', layout: new Map() },
        {
          name: '하나만 고정',
          layout: new Map(ids.slice(0, 1).map((id) => [id, { x: 40, y: 40 }])),
        },
        { name: '전부 고정', layout: scattered(ids) },
      ];

      for (const { name, layout } of layouts) {
        describe(name, () => {
          const scene: Scene = buildScene(graph, layout);

          it('어디에도 NaN 이 없다', () => {
            expectAllFinite(scene.nodes);
            expectAllFinite(scene.edges);
            expectAllFinite(scene.groups);
            expectAllFinite(scene.contentBounds);
          });

          it('노드 하나당 상자 하나, 엣지 하나당 기하 하나다', () => {
            expect(scene.nodes).toHaveLength(graph.nodes.length);
            expect(scene.edges).toHaveLength(graph.edges.length);
            expect(scene.groups).toHaveLength(graph.groups.length);
          });

          it('그룹이 자손을 전부 담는다', () => {
            for (const placed of scene.groups) {
              for (const node of graph.nodes) {
                if (node.groupId !== placed.id) continue;
                const box = scene.nodeById.get(node.id);
                if (box === undefined) continue;
                expect(rectContainsRect(placed.rect, box.rect)).toBe(true);
              }
              for (const child of graph.groups) {
                if (child.parentId !== placed.id) continue;
                const box = scene.groupById.get(child.id);
                if (box === undefined) continue;
                expect(rectContainsRect(placed.rect, box.rect)).toBe(true);
              }
            }
          });

          it('노드 한가운데를 누르면 그 노드가 잡힌다', () => {
            const index = buildSpatialIndex(scene);
            for (const node of scene.nodes) {
              const hit = hitTest(index, scene, rectCenter(node.rect));
              expect(hit?.kind === 'node' && hit.node.id).toBe(node.id);
            }
          });

          it('내용 경계로 컬링하면 아무것도 안 버린다', () => {
            const visible = cullScene(scene, scene.contentBounds);
            expect(visible.nodes).toHaveLength(scene.nodes.length);
            expect(visible.edges).toHaveLength(scene.edges.length);
            expect(visible.groups).toHaveLength(scene.groups.length);
          });

          it('맞춰서 그려도 NaN 없이 save/restore 가 맞는다', () => {
            const ctx = new RecordingContext();
            paintScene(ctx, scene, fitToContent(scene.contentBounds, screen), screen, {
              devicePixelRatio: 2,
            });
            expect(ctx.badNumber()).toBeUndefined();
            expect(ctx.depthProblem()).toBeUndefined();
          });
        });
      }

      /**
       * 형제 그룹이 안 겹치는 것은 **임시 배치의 성질**이라 손으로 옮기지 않은
       * 경우에만 건다. 사람이 노드를 끌면 그룹이 따라가므로 겹칠 수 있고, 그것을
       * 막는 것은 ELK 가 할 일이다.
       */
      it('임시 배치에서는 형제 그룹이 안 겹친다', () => {
        const scene = buildScene(graph, new Map());

        const parents = new Set<string | undefined>(graph.groups.map((g) => g.parentId));
        for (const parent of parents) {
          const siblings = graph.groups
            .filter((g) => g.parentId === parent)
            .map((g) => scene.groupById.get(g.id))
            .filter((g): g is NonNullable<typeof g> => g !== undefined);

          for (let i = 0; i < siblings.length; i += 1) {
            for (let j = i + 1; j < siblings.length; j += 1) {
              const a = siblings[i];
              const b = siblings[j];
              if (a === undefined || b === undefined) continue;
              expect(rectsIntersect(a.rect, b.rect)).toBe(false);
            }
          }
        }
      });

      /**
       * 반올림한 장면 요약. 테마나 알고리즘을 고치면 리뷰에서 **diff 로** 보인다.
       * 단언이 아니라 눈으로 보는 자료다 — 바뀌었으면 왜 바뀌었는지 말할 수 있어야
       * 한다는 뜻이고, 일부러 바꿨으면 같이 갱신한다.
       */
      it('장면 요약이 그대로다', () => {
        const scene = buildScene(graph, new Map());
        const round = (n: number): number => Math.round(n);

        expect({
          nodes: scene.nodes.map((n) => ({
            id: n.id,
            rect: [round(n.rect.x), round(n.rect.y), round(n.rect.width), round(n.rect.height)],
            label: n.label,
          })),
          groups: scene.groups.map((g) => ({
            id: g.id,
            rect: [round(g.rect.x), round(g.rect.y), round(g.rect.width), round(g.rect.height)],
            empty: g.empty,
          })),
          edges: scene.edges.map((e) => ({
            key: e.key,
            kind: e.kind,
            points: e.path.length,
            arrow: e.arrow !== undefined,
            label: e.labelText,
          })),
        }).toMatchSnapshot();
      });
    });
  }
});

/** 자식 그룹 훑기가 실제로 돈다는 것만 확인한다 — 위 검사들이 이것에 기댄다 */
describe('나무 훑기', () => {
  it('최상위와 자식을 갈라 준다', () => {
    const graph = buildGraph(parse(FIXTURES.map((f) => f.source).join('\n')));
    const tree = buildGroupTree(graph);
    expect(childGroupsOf(tree, undefined)).toEqual(tree.rootGroups);
  });
});
