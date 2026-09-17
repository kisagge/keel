import { describe, expect, it } from 'vitest';
import { countVisible, cullScene } from '../src/cull.js';
import { inflateRect, rectsIntersect } from '../src/geometry.js';
import type { Rect } from '../src/geometry.js';
import { DEFAULT_THEME } from '../src/theme.js';
import { visibleWorldRect } from '../src/viewport.js';
import { sceneOf } from './helpers/scene.js';
import { makeRandom, randomBetween } from './helpers/random.js';

const theme = DEFAULT_THEME;

const SOURCE = [
  '# 주문이 들어와서 결제까지',
  'actor user "손님"',
  'service web "스토어프론트"',
  'service api "주문 API"',
  'db orders "주문 DB"',
  'queue events "이벤트 큐"',
  'group payment "결제" {',
  '  service pay "결제 서비스"',
  '  external toss "토스페이먼츠"',
  '}',
  'user -> web "주문하기"',
  'web -> api',
  'api -> orders "주문 저장"',
  'api -> pay "결제 요청"',
  'pay -> toss',
  'api -> events "order.created"',
  'api -> api',
].join('\n');

describe('컬링', () => {
  /**
   * 무식하게 다 훑은 것과 **정확히 같은 집합**이어야 한다. 컬링이 조용히
   * 뭔가를 빠뜨리는 것은 눈으로는 못 찾는다 — 화면 구석에서 노드 하나가
   * 사라지는데 스크롤하면 돌아오는 식이다.
   */
  it('무식하게 훑은 것과 결과가 같다', () => {
    const scene = sceneOf(SOURCE);
    const random = makeRandom(777);

    for (let i = 0; i < 200; i += 1) {
      const world: Rect = {
        x: randomBetween(random, -600, 900),
        y: randomBetween(random, -600, 900),
        width: randomBetween(random, 10, 800),
        height: randomBetween(random, 10, 600),
      };

      const visible = cullScene(scene, world);
      const window = inflateRect(world, theme.cullMargin);

      expect(visible.nodes.map((n) => n.id)).toEqual(
        scene.nodes.filter((n) => rectsIntersect(n.rect, window)).map((n) => n.id),
      );
      expect(visible.edges.map((e) => e.key)).toEqual(
        scene.edges.filter((e) => rectsIntersect(e.bounds, window)).map((e) => e.key),
      );
      expect(visible.groups.map((g) => g.id)).toEqual(
        scene.groups.filter((g) => rectsIntersect(g.rect, window)).map((g) => g.id),
      );
    }
  });

  it('걸치기만 해도 남긴다', () => {
    const scene = sceneOf(SOURCE);
    const node = scene.nodes[0];
    if (!node) return;

    // 노드의 왼쪽 위 모서리에만 걸치는 뷰포트
    const world: Rect = { x: node.rect.x - 5, y: node.rect.y - 5, width: 6, height: 6 };
    expect(cullScene(scene, world, 0).nodes.map((n) => n.id)).toContain(node.id);
  });

  it('내용을 다 덮으면 아무것도 안 버린다', () => {
    const scene = sceneOf(SOURCE);
    const visible = cullScene(scene, scene.contentBounds);
    expect(visible.nodes).toHaveLength(scene.nodes.length);
    expect(visible.edges).toHaveLength(scene.edges.length);
    expect(visible.groups).toHaveLength(scene.groups.length);
  });

  it('멀리 떨어진 곳에서는 아무것도 안 남는다', () => {
    const scene = sceneOf(SOURCE);
    expect(
      countVisible(cullScene(scene, { x: 100000, y: 100000, width: 800, height: 600 })),
    ).toBe(0);
  });

  /** 획은 경로 위에 가운데로 그려지므로 1px 밖의 것도 절반이 넘어온다 */
  it('여백만큼은 밖의 것도 남긴다', () => {
    const scene = sceneOf('service a');
    const node = scene.nodes[0];
    if (!node) return;

    const justOutside: Rect = {
      x: node.rect.x + node.rect.width + theme.cullMargin / 2,
      y: node.rect.y,
      width: 10,
      height: 10,
    };
    expect(cullScene(scene, justOutside).nodes).toHaveLength(1);
    expect(cullScene(scene, justOutside, 0).nodes).toHaveLength(0);
  });

  it('그룹 순서가 흐트러지지 않는다', () => {
    const scene = sceneOf(
      'group a {\n  service x\n  group b {\n    service y\n  }\n}\ngroup c {\n  db z\n}',
    );
    const visible = cullScene(scene, scene.contentBounds);
    const kept = scene.groups.filter((g) => visible.groups.includes(g)).map((g) => g.id);
    expect(visible.groups.map((g) => g.id)).toEqual(kept);
  });

  it('뷰포트에서 바로 받은 구역으로도 돈다', () => {
    const scene = sceneOf(SOURCE);
    const world = visibleWorldRect({ x: 0, y: 0, zoom: 1 }, { width: 10000, height: 10000 });
    expect(cullScene(scene, world).nodes).toHaveLength(scene.nodes.length);
  });

  it('빈 장면도 던지지 않는다', () => {
    expect(countVisible(cullScene(sceneOf(''), { x: 0, y: 0, width: 100, height: 100 }))).toBe(0);
  });

  it('자기 고리는 노드 위쪽까지 걸쳐 있다', () => {
    const scene = sceneOf('service a\na -> a');
    const rect = scene.nodeById.get('a')?.rect;
    if (!rect) return;

    // 노드 바로 위쪽만 보는 뷰포트 — 노드는 안 보여도 고리는 보인다
    const above: Rect = { x: rect.x, y: rect.y - theme.edge.selfLoopHeight, width: rect.width, height: 4 };
    expect(cullScene(scene, above, 0).edges).toHaveLength(1);
  });
});
