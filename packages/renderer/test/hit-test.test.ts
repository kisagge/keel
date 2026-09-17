import { describe, expect, it } from 'vitest';
import {
  distanceToPolyline,
  inflateRect,
  rectBottom,
  rectCenter,
  rectContains,
  rectRight,
} from '../src/geometry.js';
import type { Point } from '../src/geometry.js';
import { buildSpatialIndex, hitTest, hitTestAll } from '../src/hit-test.js';
import type { Hit } from '../src/hit-test.js';
import { DEFAULT_THEME } from '../src/theme.js';
import type { Scene } from '../src/scene.js';
import { layoutOf, sceneOf } from './helpers/scene.js';

const theme = DEFAULT_THEME;

const SOURCE = [
  'actor user "손님"',
  'service web "스토어프론트"',
  'service api "주문 API"',
  'db orders "주문 DB"',
  'group payment "결제" {',
  '  service pay "결제 서비스"',
  '  external toss "토스페이먼츠"',
  '}',
  'user -> web "주문하기"',
  'web -> api',
  'api -> orders "주문 저장"',
  'api -> pay "결제 요청"',
  'pay -> toss',
].join('\n');

/** 색인을 안 쓰고 무식하게 고르는 쪽. 격자가 이것과 같아야 한다 */
function bruteHit(scene: Scene, world: Point): Hit | undefined {
  for (let i = scene.nodes.length - 1; i >= 0; i -= 1) {
    const node = scene.nodes[i];
    if (node !== undefined && rectContains(node.rect, world)) return { kind: 'node', node };
  }
  for (let i = scene.edges.length - 1; i >= 0; i -= 1) {
    const edge = scene.edges[i];
    if (edge === undefined) continue;
    const onStroke = distanceToPolyline(world, edge.path) <= theme.edge.hitTolerance;
    const onLabel = edge.labelRect !== undefined && rectContains(edge.labelRect, world);
    if (onStroke || onLabel) return { kind: 'edge', edge };
  }

  const groups = scene.groups
    .filter(
      (g) =>
        rectContains(g.labelRect, world) ||
        (rectContains(g.rect, world) &&
          !rectContains(inflateRect(g.rect, -theme.group.hitBand), world)),
    )
    .sort((a, b) => b.group.depth - a.group.depth);

  const group = groups[0];
  return group === undefined ? undefined : { kind: 'group', group };
}

function idOf(hit: Hit | undefined): string | undefined {
  if (hit === undefined) return undefined;
  if (hit.kind === 'node') return `node:${hit.node.id}`;
  if (hit.kind === 'edge') return `edge:${hit.edge.key}`;
  return `group:${hit.group.id}`;
}

describe('격자 색인', () => {
  /**
   * 색인이 조용히 뭔가를 잃어버리는 것은 눈으로 못 찾는다 — 어떤 자리에서만
   * 클릭이 안 먹는다. 그래서 내용 전체를 촘촘히 찍어 무식한 쪽과 맞대어 본다.
   */
  it('무식하게 고른 것과 모든 자리에서 같다', () => {
    const scene = sceneOf(SOURCE);
    const index = buildSpatialIndex(scene);
    const bounds = inflateRect(scene.contentBounds, 60);

    const steps = 60;
    for (let ix = 0; ix <= steps; ix += 1) {
      for (let iy = 0; iy <= steps; iy += 1) {
        const world = {
          x: bounds.x + (bounds.width * ix) / steps,
          y: bounds.y + (bounds.height * iy) / steps,
        };
        expect(idOf(hitTest(index, scene, world))).toBe(idOf(bruteHit(scene, world)));
      }
    }
  });

  it('칸 크기를 바꿔도 답이 같다', () => {
    const scene = sceneOf(SOURCE);
    const bounds = scene.contentBounds;

    for (const cellSize of [16, 64, 192, 4096]) {
      const index = buildSpatialIndex(scene, cellSize);
      for (let i = 0; i <= 40; i += 1) {
        const world = {
          x: bounds.x + (bounds.width * i) / 40,
          y: bounds.y + (bounds.height * ((i * 7) % 41)) / 40,
        };
        expect(idOf(hitTest(index, scene, world))).toBe(idOf(bruteHit(scene, world)));
      }
    }
  });

  /** 아주 작은 칸이면 큰 물건이 한도를 넘어 따로 훑는 목록으로 간다 */
  it('한도를 넘긴 큰 물건도 찾아진다', () => {
    const scene = sceneOf('service a\na -> a');
    const index = buildSpatialIndex(scene, 1);
    expect(index.oversizedNodes.length + index.oversizedEdges.length).toBeGreaterThan(0);

    const center = rectCenter(scene.nodeById.get('a')?.rect ?? scene.contentBounds);
    expect(hitTest(index, scene, center)?.kind).toBe('node');
  });

  it('음수 좌표에서도 맞는다', () => {
    const scene = sceneOf('service a', layoutOf({ a: { x: -5000, y: -5000 } }));
    const index = buildSpatialIndex(scene);
    const center = rectCenter(scene.nodeById.get('a')?.rect ?? scene.contentBounds);
    const hit = hitTest(index, scene, center);
    expect(hit?.kind === 'node' && hit.node.id).toBe('a');
  });
});

describe('z 순서', () => {
  it('모든 노드는 제 한가운데에서 잡힌다', () => {
    const scene = sceneOf(SOURCE);
    const index = buildSpatialIndex(scene);

    for (const node of scene.nodes) {
      const hit = hitTest(index, scene, rectCenter(node.rect));
      expect(hit?.kind === 'node' && hit.node.id).toBe(node.id);
    }
  });

  /** 노드는 그룹 안에 있다. 노드를 눌렀는데 그룹이 잡히면 아무것도 못 고른다 */
  it('그룹 안 노드를 누르면 노드가 잡힌다', () => {
    const scene = sceneOf('group g "결제" {\n  service pay\n}');
    const index = buildSpatialIndex(scene);
    const hit = hitTest(index, scene, rectCenter(scene.nodeById.get('pay')?.rect ?? scene.contentBounds));
    expect(hit?.kind).toBe('node');
  });

  /**
   * 겹친 노드는 **나중에 그린 것**이 위에 있다. 이 검사가 없으면 집는 순서가
   * 그리는 순서와 어긋나도 아무도 모른다 — 임시 배치는 노드를 안 겹치게 놓으므로
   * 겹침은 사람이 손으로 옮겼을 때만 생긴다.
   */
  it('겹친 노드는 나중에 그린 것이 잡힌다', () => {
    const layout = layoutOf({ a: { x: 0, y: 0 }, b: { x: 30, y: 0 } });
    const scene = sceneOf('service a\nservice b', layout);
    const index = buildSpatialIndex(scene);

    const world = { x: 0, y: 0 };
    expect(rectContains(scene.nodeById.get('a')?.rect ?? scene.contentBounds, world)).toBe(true);
    expect(rectContains(scene.nodeById.get('b')?.rect ?? scene.contentBounds, world)).toBe(true);

    const hit = hitTest(index, scene, world);
    expect(hit?.kind === 'node' && hit.node.id).toBe('b');
  });

  it('선 위를 누르면 선이 잡힌다', () => {
    const layout = layoutOf({ a: { x: 0, y: 0 }, b: { x: 500, y: 0 } });
    const scene = sceneOf('service a\nservice b\na -> b', layout);
    const index = buildSpatialIndex(scene);
    const hit = hitTest(index, scene, { x: 250, y: 0 });
    expect(hit?.kind).toBe('edge');
  });

  it('선 라벨을 누르면 선이 잡힌다', () => {
    const layout = layoutOf({ a: { x: 0, y: 0 }, b: { x: 500, y: 0 } });
    const scene = sceneOf('service a\nservice b\na -> b "주문 저장"', layout);
    const index = buildSpatialIndex(scene);
    const anchor = scene.edges[0]?.labelAnchor;
    if (!anchor) return;
    expect(hitTest(index, scene, anchor)?.kind).toBe('edge');
  });

  it('선이 그룹을 가로지르면 그룹이 아니라 선이 잡힌다', () => {
    const scene = sceneOf('group g {\n  service inside\n}\nservice outside\noutside -> inside');
    const index = buildSpatialIndex(scene);
    const edge = scene.edges[0];
    if (!edge) return;

    // 획 한가운데 — 노드 밖이고 그룹 테두리도 아닌 자리
    const mid = edge.path[Math.floor(edge.path.length / 2)] ?? { x: 0, y: 0 };
    const hit = hitTest(index, scene, mid);
    expect(hit?.kind).toBe('edge');
  });
});

describe('그룹은 테두리만', () => {
  /**
   * 안쪽까지 맞으면 그룹 안 빈 곳을 눌렀을 때 그룹이 잡혀, 배경을 누르는 일이
   * 영영 안 된다 — 끌어서 고르기도, 빈 곳 눌러 선택 풀기도 못 한다.
   */
  it('그룹 안 빈 곳은 아무것도 안 잡힌다', () => {
    const layout = layoutOf({ inside: { x: 0, y: 0 } });
    const scene = sceneOf('group g "묶음" {\n  service inside\n}', layout);
    const index = buildSpatialIndex(scene);
    const rect = scene.groupById.get('g')?.rect;
    const node = scene.nodeById.get('inside')?.rect;
    if (!rect || !node) return;

    // 테두리 띠 안쪽이면서 노드 밖인 자리
    const world = { x: rectRight(node) + 5, y: rectCenter(node).y };
    expect(rectContains(rect, world)).toBe(true);
    expect(hitTest(index, scene, world)).toBeUndefined();
  });

  it('테두리 위를 누르면 그룹이 잡힌다', () => {
    const scene = sceneOf('group g "묶음" {\n  service a\n}');
    const index = buildSpatialIndex(scene);
    const rect = scene.groupById.get('g')?.rect;
    if (!rect) return;

    const onBorder = { x: rect.x + 1, y: rectBottom(rect) - 1 };
    const hit = hitTest(index, scene, onBorder);
    expect(hit?.kind === 'group' && hit.group.id).toBe('g');
  });

  it('라벨 줄을 누르면 그룹이 잡힌다', () => {
    const scene = sceneOf('group g "묶음" {\n  service a\n}');
    const index = buildSpatialIndex(scene);
    const labelRect = scene.groupById.get('g')?.labelRect;
    if (!labelRect) return;

    const hit = hitTest(index, scene, rectCenter(labelRect));
    expect(hit?.kind === 'group' && hit.group.id).toBe('g');
  });

  it('깊은 그룹의 테두리가 얕은 것보다 먼저 잡힌다', () => {
    const scene = sceneOf('group outer {\n  group inner {\n    service a\n  }\n}');
    const index = buildSpatialIndex(scene);
    const inner = scene.groupById.get('inner')?.rect;
    if (!inner) return;

    const onInnerBorder = { x: inner.x + 1, y: rectBottom(inner) - 1 };
    const hit = hitTest(index, scene, onInnerBorder);
    expect(hit?.kind === 'group' && hit.group.id).toBe('inner');
  });
});

describe('빈 곳과 여럿', () => {
  it('아무것도 없는 곳은 undefined 다', () => {
    const scene = sceneOf(SOURCE);
    const index = buildSpatialIndex(scene);
    expect(hitTest(index, scene, { x: 99999, y: 99999 })).toBeUndefined();
  });

  it('빈 장면에서도 던지지 않는다', () => {
    const scene = sceneOf('');
    expect(hitTest(buildSpatialIndex(scene), scene, { x: 0, y: 0 })).toBeUndefined();
  });

  it('겹친 것을 위에서부터 늘어놓는다', () => {
    const scene = sceneOf('group g "묶음" {\n  service a\n}');
    const index = buildSpatialIndex(scene);
    const labelRect = scene.groupById.get('g')?.labelRect;
    if (!labelRect) return;

    const all = hitTestAll(index, scene, rectCenter(labelRect));
    expect(all.length).toBeGreaterThan(0);
    // 노드가 섞여 있으면 노드가 먼저다
    const kinds = all.map((h) => h.kind);
    expect(kinds.indexOf('group')).toBe(kinds.length - 1);
  });

  it('봐주는 거리를 넓히면 멀리서도 선이 잡힌다', () => {
    const layout = layoutOf({ a: { x: 0, y: 0 }, b: { x: 500, y: 0 } });
    const scene = sceneOf('service a\nservice b\na -> b', layout);
    const index = buildSpatialIndex(scene);

    const away = { x: 250, y: 20 };
    expect(hitTest(index, scene, away)).toBeUndefined();
    expect(hitTest(index, scene, away, { edgeTolerance: 30 })?.kind).toBe('edge');
  });
});
