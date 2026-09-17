import type { PlacedEdge } from './edges.js';
import { distanceToPolyline, inflateRect, rectContains } from './geometry.js';
import type { Point, Rect } from './geometry.js';
import type { PlacedGroup } from './groups.js';
import type { PlacedNode, Scene } from './scene.js';

/**
 * 어느 것을 눌렀는지 고른다.
 *
 * ## 균일 격자를 쓴다 (R-tree 가 아니라)
 *
 * R-tree 의 장점은 균형을 지킨 채 하나씩 넣고 빼는 것이다. 그런데 여기서는
 * **키 입력마다 장면을 통째로 다시 세우므로** 색인도 통째로 버리고 다시 짓는다 —
 * 그 장점을 하나도 안 쓰고 균형 잡는 비용만 낸다. 격자는 비교 없이 한 번에 선다.
 *
 * 격자의 약점은 여러 칸에 걸치는 큰 물건인데, 여기서 그것은 정확히 **최상위
 * 그룹 테두리**다. 그래서 그룹은 색인에 아예 안 넣고 선형으로 훑는다. 수가 적어
 * 문제가 안 되고, 격자의 약점은 그대로 사라진다.
 *
 * ## z 순서는 그리는 순서의 역순이다
 *
 * 그리기는 그룹(얕은→깊은) → 엣지 → 노드 차례다. 그러니 집는 것은 노드 → 엣지 →
 * 그룹이다. 이 둘이 갈라지면 "보이는 것과 다른 것이 잡히는" 상태가 된다 —
 * `paint.test.ts` 가 둘을 맞대어 본다.
 *
 * ## 그룹은 테두리 띠와 라벨 줄만 맞는다
 *
 * 안쪽까지 맞게 하면 그룹 안 빈 곳을 눌렀을 때 그룹이 잡혀, 배경을 누르는 일이
 * 영영 안 된다 — 끌어서 고르기도, 빈 곳 눌러 선택 풀기도 못 하게 된다.
 */

export type Hit =
  | { readonly kind: 'node'; readonly node: PlacedNode }
  | { readonly kind: 'edge'; readonly edge: PlacedEdge }
  | { readonly kind: 'group'; readonly group: PlacedGroup };

/** 그리는 순서의 역순. 집는 쪽과 그리는 쪽이 이 하나를 같이 본다 */
export const HIT_ORDER = ['node', 'edge', 'group'] as const;

/** 한 물건이 이보다 많은 칸에 걸치면 격자에 안 넣고 따로 훑는다 */
const MAX_CELLS = 64;

interface Cell {
  readonly nodes: number[];
  readonly edges: number[];
}

export interface SpatialIndex {
  readonly cellSize: number;
  readonly cells: ReadonlyMap<string, Cell>;
  readonly oversizedNodes: readonly number[];
  readonly oversizedEdges: readonly number[];
}

function cellKey(gx: number, gy: number): string {
  return `${gx},${gy}`;
}

/** 사각형이 걸치는 칸의 범위. 음수 좌표에서도 맞아야 해서 `Math.floor` 를 쓴다 */
function cellRange(rect: Rect, cellSize: number) {
  return {
    minX: Math.floor(rect.x / cellSize),
    minY: Math.floor(rect.y / cellSize),
    maxX: Math.floor((rect.x + rect.width) / cellSize),
    maxY: Math.floor((rect.y + rect.height) / cellSize),
  };
}

export function buildSpatialIndex(scene: Scene, cellSize?: number): SpatialIndex {
  const size = cellSize ?? scene.theme.gridCell;
  const cells = new Map<string, Cell>();
  const oversizedNodes: number[] = [];
  const oversizedEdges: number[] = [];

  const insert = (rect: Rect, index: number, into: 'nodes' | 'edges', overflow: number[]): void => {
    const { minX, minY, maxX, maxY } = cellRange(rect, size);
    const count = (maxX - minX + 1) * (maxY - minY + 1);

    if (!Number.isFinite(count) || count > MAX_CELLS) {
      overflow.push(index);
      return;
    }

    for (let gx = minX; gx <= maxX; gx += 1) {
      for (let gy = minY; gy <= maxY; gy += 1) {
        const key = cellKey(gx, gy);
        const cell = cells.get(key) ?? { nodes: [], edges: [] };
        cell[into].push(index);
        cells.set(key, cell);
      }
    }
  };

  scene.nodes.forEach((n, i) => insert(n.rect, i, 'nodes', oversizedNodes));
  scene.edges.forEach((e, i) => insert(e.bounds, i, 'edges', oversizedEdges));

  return { cellSize: size, cells, oversizedNodes, oversizedEdges };
}

export interface HitOptions {
  /**
   * 선을 집을 때 봐주는 거리. **월드 단위**다.
   *
   * 화면에서 일정한 굵기로 느끼게 하려면 부르는 쪽이 `6 / zoom` 처럼 줌으로
   * 나눠서 넘겨야 한다. 안 그러면 확대했을 때 선이 지나치게 잘 잡힌다.
   */
  readonly edgeTolerance?: number | undefined;
}

/** 위에 있는 것 하나. 아무것도 없으면 `undefined` — 그때가 배경을 누른 것이다 */
export function hitTest(
  index: SpatialIndex,
  scene: Scene,
  world: Point,
  options: HitOptions = {},
): Hit | undefined {
  return hitTestAll(index, scene, world, options)[0];
}

/** 위에 있는 것부터 전부. 겹친 것을 차례로 보여 줄 때 쓴다 */
export function hitTestAll(
  index: SpatialIndex,
  scene: Scene,
  world: Point,
  options: HitOptions = {},
): Hit[] {
  const tolerance = options.edgeTolerance ?? scene.theme.edge.hitTolerance;
  const out: Hit[] = [];

  const cell = index.cells.get(
    cellKey(Math.floor(world.x / index.cellSize), Math.floor(world.y / index.cellSize)),
  );

  // 노드 — 나중에 그린 것이 위에 있다
  const nodeCandidates = [...(cell?.nodes ?? []), ...index.oversizedNodes].sort((a, b) => b - a);
  for (const i of nodeCandidates) {
    const node = scene.nodes[i];
    if (node !== undefined && rectContains(node.rect, world)) out.push({ kind: 'node', node });
  }

  // 엣지 — 획에 가깝거나 라벨 위
  const edgeCandidates = [...(cell?.edges ?? []), ...index.oversizedEdges].sort((a, b) => b - a);
  for (const i of edgeCandidates) {
    const edge = scene.edges[i];
    if (edge === undefined) continue;
    const onStroke = distanceToPolyline(world, edge.path) <= tolerance;
    const onLabel = edge.labelRect !== undefined && rectContains(edge.labelRect, world);
    if (onStroke || onLabel) out.push({ kind: 'edge', edge });
  }

  // 그룹 — 색인에 없다. 깊은 것이 위에 있다
  const groupHits: PlacedGroup[] = [];
  for (const group of scene.groups) {
    if (onGroupChrome(group, world, scene)) groupHits.push(group);
  }
  groupHits.sort((a, b) => b.group.depth - a.group.depth);
  for (const group of groupHits) out.push({ kind: 'group', group });

  return out;
}

/** 테두리 띠나 라벨 줄 위인가. 안쪽 빈 곳은 그룹이 아니라 배경이다 */
function onGroupChrome(group: PlacedGroup, world: Point, scene: Scene): boolean {
  if (rectContains(group.labelRect, world)) return true;
  if (!rectContains(group.rect, world)) return false;
  return !rectContains(inflateRect(group.rect, -scene.theme.group.hitBand), world);
}
