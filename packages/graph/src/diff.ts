import type { Graph, GraphEdge, GraphGroup, GraphNode } from './model.js';

/**
 * 두 판(version)의 **그래프**를 견준다.
 *
 * 텍스트 diff 가 아니다. 텍스트로 견주면 줄을 옮기거나 그룹을 다시 들여쓴 것이
 * 전부 "바뀜" 으로 나와, 정작 무엇이 달라졌는지 안 보인다. 사람이 알고 싶은
 * 것은 "무슨 노드가 생겼고 어떤 선이 끊겼나" 이므로 그 단위로 견준다.
 */

export type NodeField = 'kind' | 'label' | 'group';
export type EdgeField = 'label' | 'style';
export type GroupField = 'label' | 'parent';

export interface Changed<T, F> {
  readonly before: T;
  readonly after: T;
  readonly fields: readonly F[];
}

export interface Bucket<T, F> {
  readonly added: readonly T[];
  readonly removed: readonly T[];
  readonly changed: readonly Changed<T, F>[];
}

export interface GraphDiff {
  readonly nodes: Bucket<GraphNode, NodeField>;
  readonly edges: Bucket<GraphEdge, EdgeField>;
  readonly groups: Bucket<GraphGroup, GroupField>;
}

export function diffGraphs(before: Graph, after: Graph): GraphDiff {
  return {
    nodes: bucket(before.nodes, after.nodes, (n) => n.id, nodeFields),
    edges: bucket(before.edges, after.edges, (e) => e.key, edgeFields),
    groups: bucket(before.groups, after.groups, (g) => g.id, groupFields),
  };
}

export function isEmptyDiff(diff: GraphDiff): boolean {
  return [diff.nodes, diff.edges, diff.groups].every(
    (b) => b.added.length === 0 && b.removed.length === 0 && b.changed.length === 0,
  );
}

/** 화면 상단에 한 줄로 요약할 때 쓴다 */
export function countChanges(diff: GraphDiff): { added: number; removed: number; changed: number } {
  const buckets = [diff.nodes, diff.edges, diff.groups];
  return {
    added: buckets.reduce((sum, b) => sum + b.added.length, 0),
    removed: buckets.reduce((sum, b) => sum + b.removed.length, 0),
    changed: buckets.reduce((sum, b) => sum + b.changed.length, 0),
  };
}

function bucket<T, F>(
  before: readonly T[],
  after: readonly T[],
  keyOf: (item: T) => string,
  fieldsOf: (a: T, b: T) => F[],
): Bucket<T, F> {
  const beforeByKey = new Map(before.map((item) => [keyOf(item), item]));
  const afterByKey = new Map(after.map((item) => [keyOf(item), item]));

  const added: T[] = [];
  const changed: Changed<T, F>[] = [];

  for (const [key, afterItem] of afterByKey) {
    const beforeItem = beforeByKey.get(key);
    if (!beforeItem) {
      added.push(afterItem);
      continue;
    }
    const fields = fieldsOf(beforeItem, afterItem);
    if (fields.length > 0) changed.push({ before: beforeItem, after: afterItem, fields });
  }

  const removed = [...beforeByKey].filter(([key]) => !afterByKey.has(key)).map(([, item]) => item);

  return { added, removed, changed };
}

function nodeFields(a: GraphNode, b: GraphNode): NodeField[] {
  const fields: NodeField[] = [];
  if (a.kind !== b.kind) fields.push('kind');
  if (a.label !== b.label) fields.push('label');
  if (a.groupId !== b.groupId) fields.push('group');
  return fields;
}

function edgeFields(a: GraphEdge, b: GraphEdge): EdgeField[] {
  const fields: EdgeField[] = [];
  if (a.label !== b.label) fields.push('label');
  if (a.style !== b.style) fields.push('style');
  return fields;
}

function groupFields(a: GraphGroup, b: GraphGroup): GroupField[] {
  const fields: GroupField[] = [];
  if (a.label !== b.label) fields.push('label');
  if (a.parentId !== b.parentId) fields.push('parent');
  return fields;
}
