import type { EdgeStyle, NodeKind, ParsedDocument } from '@keel/dsl';

/**
 * 그릴 수 있는 형태의 그래프.
 *
 * **좌표가 없다.** 자리는 문서가 아니라 레이아웃(사람이 옮긴 것과 ELK 가 놓은
 * 것)에 있고, 그것은 이 패키지 밖에서 다룬다. 여기서 좌표를 들고 있으면
 * "노드를 옮겼다" 가 문서를 바꾸는 일이 되어, 텍스트로 관리한다는 전제가 깨진다.
 */

export interface GraphNode {
  readonly id: string;
  readonly kind: NodeKind;
  /** 화면에 그릴 글자. 라벨이 없으면 id 를 쓴다 */
  readonly label: string;
  /** 사람이 적은 라벨. 없으면 undefined — 지우기/되돌리기가 이 값을 본다 */
  readonly rawLabel: string | undefined;
  readonly groupId: string | undefined;
  readonly implicit: boolean;
}

export interface GraphEdge {
  readonly key: string;
  readonly from: string;
  readonly to: string;
  readonly style: EdgeStyle;
  readonly label: string | undefined;
}

export interface GraphGroup {
  readonly id: string;
  readonly label: string;
  readonly rawLabel: string | undefined;
  readonly parentId: string | undefined;
  /** 최상위가 0. 그릴 때 테두리 안쪽 여백을 정하는 데 쓴다 */
  readonly depth: number;
}

export interface GraphProblem {
  readonly code: 'edge-to-group' | 'group-cycle';
  readonly message: string;
}

export interface Graph {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly groups: readonly GraphGroup[];
  readonly nodeById: ReadonlyMap<string, GraphNode>;
  readonly groupById: ReadonlyMap<string, GraphGroup>;
  /** 파서가 볼 수 없는, 구조를 세우면서 드러난 문제 */
  readonly problems: readonly GraphProblem[];
}

export const EMPTY_GRAPH: Graph = {
  nodes: [],
  edges: [],
  groups: [],
  nodeById: new Map(),
  groupById: new Map(),
  problems: [],
};

export function buildGraph(doc: ParsedDocument): Graph {
  const groupById = new Map<string, GraphGroup>();
  const problems: GraphProblem[] = [];

  const depths = groupDepths(doc, problems);

  for (const g of doc.groups) {
    groupById.set(g.id, {
      id: g.id,
      label: g.label ?? g.id,
      rawLabel: g.label,
      parentId: g.parentId,
      depth: depths.get(g.id) ?? 0,
    });
  }

  const nodes: GraphNode[] = doc.nodes.map((n) => ({
    id: n.id,
    kind: n.kind,
    label: n.label ?? n.id,
    rawLabel: n.label,
    groupId: n.groupId,
    implicit: n.implicit,
  }));

  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  /**
   * 끝점이 노드가 아닌 엣지는 버린다.
   *
   * 파서는 선언 없는 이름을 노드로 만들어 주지만 **그룹 이름은 예외**다 —
   * 그룹은 자리를 차지하는 테두리라 선을 이을 곳이 없다. 버리지 않고 두면
   * 렌더러가 없는 노드의 좌표를 찾다가 화면 전체가 멈춘다.
   */
  const edges: GraphEdge[] = [];
  for (const e of doc.edges) {
    for (const [end, id] of [
      ['from', e.from],
      ['to', e.to],
    ] as const) {
      if (!nodeById.has(id) && groupById.has(id)) {
        problems.push({
          code: 'edge-to-group',
          message: `'${id}' 는 그룹이라 선을 이을 수 없다 (${e.from} → ${e.to} 의 ${end})`,
        });
      }
    }
    if (!nodeById.has(e.from) || !nodeById.has(e.to)) continue;
    edges.push({ key: e.key, from: e.from, to: e.to, style: e.style, label: e.label });
  }

  return {
    nodes,
    edges,
    groups: [...groupById.values()],
    nodeById,
    groupById,
    problems,
  };
}

/**
 * 그룹의 깊이. 부모를 따라 올라가며 센다.
 *
 * 파서 문법상 그룹은 중첩으로만 만들어져 고리가 생길 수 없지만, 깊이 계산이
 * 고리를 만나면 영원히 돌기 때문에 **본 것을 기억하며 올라간다.** 값싼 보험이다.
 */
function groupDepths(doc: ParsedDocument, problems: GraphProblem[]): Map<string, number> {
  const parentOf = new Map(doc.groups.map((g) => [g.id, g.parentId]));
  const depths = new Map<string, number>();

  for (const g of doc.groups) {
    let depth = 0;
    let cursor = g.parentId;
    const seen = new Set<string>([g.id]);

    while (cursor !== undefined) {
      if (seen.has(cursor)) {
        problems.push({ code: 'group-cycle', message: `그룹 '${g.id}' 의 부모가 고리를 이룬다` });
        break;
      }
      seen.add(cursor);
      depth += 1;
      cursor = parentOf.get(cursor);
    }
    depths.set(g.id, depth);
  }

  return depths;
}

/** 그룹에 직접 들어 있는 노드들 (손자는 빼고) */
export function nodesInGroup(graph: Graph, groupId: string | undefined): GraphNode[] {
  return graph.nodes.filter((n) => n.groupId === groupId);
}

/** 어떤 노드에 닿는 모든 엣지 */
export function edgesTouching(graph: Graph, nodeId: string): GraphEdge[] {
  return graph.edges.filter((e) => e.from === nodeId || e.to === nodeId);
}
