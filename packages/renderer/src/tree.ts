import type { Graph, GraphGroup, GraphNode } from '@keel/graph';

/**
 * `parentId` 포인터를 걸어 다닐 수 있는 나무로 바꾼다.
 *
 * `Graph` 는 부모만 들고 있다. 그룹 테두리도, 임시 배치도, 자손 훑기도 전부
 * 자식이 필요하므로 한 번에 뒤집어 둔다.
 *
 * **여기가 이 패키지의 유일한 방어선이다.** `buildGraph` 는 `group-cycle` 을
 * 보고만 하고 `parentId` 는 그대로 둔다. 고리에 걸린 그룹은 최상위에서 닿지
 * 않으므로, 끊지 않으면 **장면에서 통째로 사라진다** — 화면에는 안 보이는데
 * 진단에는 남아 있어 무엇이 잘못됐는지 알 수 없는 상태가 된다.
 *
 * 그래서 고리에 걸린 그룹은 부모를 떼어 최상위로 올린다. 끊고 나면 이것은
 * 진짜 숲이라 아래쪽 코드는 `visited` 를 들지 않아도 되고, 나중에 부모를 따라
 * 올라가는 코드가 생겨도 영원히 돌 일이 없다.
 */

export interface GroupTree {
  readonly rootGroups: readonly GraphGroup[];
  readonly rootNodes: readonly GraphNode[];
  readonly childGroups: ReadonlyMap<string, readonly GraphGroup[]>;
  readonly childNodes: ReadonlyMap<string, readonly GraphNode[]>;
  /** 깊은 것부터. 그룹 테두리를 아래에서 위로 접을 때 이 순서로 돈다 */
  readonly postOrder: readonly GraphGroup[];
  /** 고리에 걸려 부모를 떼어 낸 그룹. 검사와 화면 진단이 본다 */
  readonly detachedGroupIds: readonly string[];
}

export function buildGroupTree(graph: Graph): GroupTree {
  const childGroups = new Map<string, GraphGroup[]>();
  const rootGroups: GraphGroup[] = [];

  /** 모르는 부모를 가리키면 최상위로 본다. 파서는 못 만들지만 여기서 안 깨져야 한다 */
  const parentOf = (g: GraphGroup): string | undefined =>
    g.parentId !== undefined && graph.groupById.has(g.parentId) ? g.parentId : undefined;

  for (const g of graph.groups) {
    const parent = parentOf(g);
    if (parent === undefined) {
      rootGroups.push(g);
      continue;
    }
    const siblings = childGroups.get(parent);
    if (siblings) siblings.push(g);
    else childGroups.set(parent, [g]);
  }

  // 최상위에서 닿는 것을 표시한다. 안 닿는 것은 고리 안에 있다
  const reachable = new Set<string>();
  const mark = (start: GraphGroup): void => {
    const stack = [start];
    while (stack.length > 0) {
      const g = stack.pop();
      if (g === undefined || reachable.has(g.id)) continue;
      reachable.add(g.id);
      for (const child of childGroups.get(g.id) ?? []) stack.push(child);
    }
  };
  for (const g of rootGroups) mark(g);

  const detachedGroupIds: string[] = [];
  for (const g of graph.groups) {
    if (reachable.has(g.id)) continue;

    // 고리를 끊는다 — 부모의 자식 목록에서 빼고 최상위로 올린다
    const parent = parentOf(g);
    if (parent !== undefined) {
      const siblings = childGroups.get(parent);
      if (siblings) {
        const at = siblings.indexOf(g);
        if (at >= 0) siblings.splice(at, 1);
      }
    }
    rootGroups.push(g);
    detachedGroupIds.push(g.id);
    mark(g);
  }

  const childNodes = new Map<string, GraphNode[]>();
  const rootNodes: GraphNode[] = [];
  for (const n of graph.nodes) {
    if (n.groupId === undefined || !graph.groupById.has(n.groupId)) {
      rootNodes.push(n);
      continue;
    }
    const siblings = childNodes.get(n.groupId);
    if (siblings) siblings.push(n);
    else childNodes.set(n.groupId, [n]);
  }

  return {
    rootGroups,
    rootNodes,
    childGroups,
    childNodes,
    postOrder: postOrderOf(rootGroups, childGroups),
    detachedGroupIds,
  };
}

/** 되도는 대신 스택으로 돈다. 아주 깊게 중첩된 문서에서 스택이 넘치지 않게 */
function postOrderOf(
  roots: readonly GraphGroup[],
  childGroups: ReadonlyMap<string, readonly GraphGroup[]>,
): GraphGroup[] {
  const out: GraphGroup[] = [];
  const stack: { group: GraphGroup; expanded: boolean }[] = [];

  for (let i = roots.length - 1; i >= 0; i -= 1) {
    const group = roots[i];
    if (group !== undefined) stack.push({ group, expanded: false });
  }

  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined) continue;

    if (frame.expanded) {
      out.push(frame.group);
      continue;
    }

    stack.push({ group: frame.group, expanded: true });
    const children = childGroups.get(frame.group.id) ?? [];
    for (let i = children.length - 1; i >= 0; i -= 1) {
      const child = children[i];
      if (child !== undefined) stack.push({ group: child, expanded: false });
    }
  }

  return out;
}

export function childGroupsOf(tree: GroupTree, groupId: string | undefined): readonly GraphGroup[] {
  return groupId === undefined ? tree.rootGroups : (tree.childGroups.get(groupId) ?? []);
}

export function childNodesOf(tree: GroupTree, groupId: string | undefined): readonly GraphNode[] {
  return groupId === undefined ? tree.rootNodes : (tree.childNodes.get(groupId) ?? []);
}
