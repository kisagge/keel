import type { Graph, GraphNode } from '@keel/graph';
import { EMPTY_RECT, rectOf, unionAll } from './geometry.js';
import type { Point, Rect, Size } from './geometry.js';
import { placeEdges } from './edges.js';
import type { PlacedEdge } from './edges.js';
import { placeGroups } from './groups.js';
import type { PlacedGroup } from './groups.js';
import { approximateMeasureText } from './measure.js';
import type { MeasureText } from './measure.js';
import { fitNodeLabel, measureNodeBox } from './node-box.js';
import { stopgapPlacement } from './stopgap-layout.js';
import { DEFAULT_THEME } from './theme.js';
import type { Theme } from './theme.js';
import { buildGroupTree } from './tree.js';

/**
 * 좌표 없는 그래프에 자리를 붙여 **그릴 수 있는 장면**으로 만든다.
 *
 * ## 레이아웃에 적는 `{x, y}` 는 노드의 **중심**이다
 *
 * 이 값은 그대로 `Y.Map` 에 들어가 모든 문서에 저장된다. 나중에 바꾸는 것은
 * 코드 수정이 아니라 **데이터 이전**이므로 여기 적어 둔다.
 *
 * 왼쪽 위로 잡지 않은 이유: 상자 폭은 라벨에서 나온다. 왼쪽 위를 저장하면
 * `api` 를 `주문 API` 로 고칠 때 상자가 오른쪽으로만 자라 노드가 튄다. 이름
 * 고치기는 이 도구의 일급 조작이다. 중심이면 양쪽으로 자라 제자리에 있고,
 * 엣지 계산도 어차피 중심에서 시작한다.
 *
 * 그래서 `PlacedNode.center` 는 레이아웃에 적힌 값과 **정확히** 같다.
 * 반올림도 격자 맞춤도 여기서 하지 않는다 — 그것은 끄는 쪽(`apps/web`)의 일이다.
 *
 * ## 자리가 없는 노드
 *
 * 레이아웃에는 **사람이 옮긴 노드만** 들어 있다. 나머지는 임시 배치가 놓는다
 * (`stopgap-layout.ts`). ELK 가 오면 그 파일만 갈아 끼우고 여기는 안 건드린다.
 *
 * ## 이 함수는 아무것도 기억하지 않는다
 *
 * 키 입력마다 통째로 다시 세운다. 안쪽에 캐시를 두면 밖에서 감쌀 수가 없으므로,
 * 나중에 `diffGraphs` 로 증분을 하려면 이 함수는 순수한 채로 남아야 한다.
 */

/** 사람이 끌어 옮긴 노드만 들어 있다. 미래의 `Y.Map<nodeId, {x,y}>` 와 같은 모양 */
export type Layout = ReadonlyMap<string, Point>;

export const EMPTY_LAYOUT: Layout = new Map<string, Point>();

/**
 * `buildScene` 이 실제로 쓰는 것은 읽기 하나뿐이다.
 *
 * `ReadonlyMap` 이 구조적으로 이것을 만족하므로 검사는 맨 `Map` 을 넘기고,
 * `apps/web` 은 `Y.Map` 을 얇게 감싸 **원격 갱신마다 1,000개를 복사하지 않아도**
 * 된다. 아무 데서도 레이아웃을 통째로 훑지 않으므로 지금 이렇게 두는 값이 0 이다.
 */
export interface LayoutReader {
  get(id: string): Point | undefined;
}

export interface PlacedNode {
  readonly id: string;
  readonly node: GraphNode;
  /** 레이아웃에 적힌 그 값. 반올림하지 않는다 */
  readonly center: Point;
  readonly size: Size;
  readonly rect: Rect;
  /** 상자 폭에 맞춰 잘린 글자. 그리는 쪽은 이것만 본다 */
  readonly label: string;
  /** 레이아웃에 자리가 있었다 = 사람이 옮겼다. ELK 가 다시 놓으면 안 되는 노드 */
  readonly pinned: boolean;
}

export interface SceneOptions {
  readonly measure?: MeasureText | undefined;
  readonly theme?: Theme | undefined;
  /** `false` 면 레이아웃에 없는 노드는 장면에서 빠진다. 기본 `true` */
  readonly stopgap?: boolean | undefined;
}

export interface Scene {
  readonly nodes: readonly PlacedNode[];
  readonly edges: readonly PlacedEdge[];
  /** **얕은 것부터.** 그대로 그리면 부모 위에 자식이 얹힌다 */
  readonly groups: readonly PlacedGroup[];
  readonly nodeById: ReadonlyMap<string, PlacedNode>;
  readonly edgeByKey: ReadonlyMap<string, PlacedEdge>;
  readonly groupById: ReadonlyMap<string, PlacedGroup>;
  /** 노드·그룹·엣지를 전부 담는 상자. `fitToContent` 에 그대로 넣는다 */
  readonly contentBounds: Rect;
  readonly theme: Theme;
}

export const EMPTY_SCENE: Scene = {
  nodes: [],
  edges: [],
  groups: [],
  nodeById: new Map(),
  edgeByKey: new Map(),
  groupById: new Map(),
  contentBounds: EMPTY_RECT,
  theme: DEFAULT_THEME,
};

export function buildScene(graph: Graph, layout: LayoutReader, options: SceneOptions = {}): Scene {
  const theme = options.theme ?? DEFAULT_THEME;
  const measure = options.measure ?? approximateMeasureText;
  const useStopgap = options.stopgap ?? true;

  const sizes = new Map<string, Size>();
  for (const node of graph.nodes) sizes.set(node.id, measureNodeBox(node, measure, theme));

  const tree = buildGroupTree(graph);
  const stopgap = useStopgap
    ? stopgapPlacement(tree, sizes, theme)
    : { centers: new Map<string, Point>(), emptyGroupSeeds: new Map<string, Point>() };

  const nodes: PlacedNode[] = [];
  for (const node of graph.nodes) {
    const size = sizes.get(node.id);
    if (size === undefined) continue;

    const pinnedAt = layout.get(node.id);
    const center = pinnedAt ?? stopgap.centers.get(node.id);

    // 자리가 없으면 장면에서 뺀다. 원점에 쌓아 두면 노드 더미가 생긴다
    if (center === undefined) continue;

    nodes.push({
      id: node.id,
      node,
      center,
      size,
      rect: rectOf(center, size),
      label: fitNodeLabel(node, size, measure, theme),
      pinned: pinnedAt !== undefined,
    });
  }

  const nodeRectById = new Map(nodes.map((n) => [n.id, n.rect]));
  const groups = placeGroups(tree, nodeRectById, stopgap.emptyGroupSeeds, theme);
  const edges = placeEdges(graph.edges, nodeRectById, theme, measure);

  return {
    nodes,
    edges,
    groups,
    nodeById: new Map(nodes.map((n) => [n.id, n])),
    edgeByKey: new Map(edges.map((e) => [e.key, e])),
    groupById: new Map(groups.map((g) => [g.id, g])),
    contentBounds:
      unionAll([
        ...nodes.map((n) => n.rect),
        ...groups.map((g) => g.rect),
        ...edges.map((e) => e.bounds),
      ]) ?? EMPTY_RECT,
    theme,
  };
}
