import type { GroupDecl, NodeDecl, ParsedDocument } from './types.js';

/** 라벨 안의 따옴표와 역슬래시만 막는다 */
export function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function quoteLabel(value: string): string {
  return `"${escapeLabel(value)}"`;
}

/**
 * 정규형으로 다시 쓴다. `정리` 명령이 쓰는 함수다.
 *
 * **이것은 저장 경로가 아니다.** 사람이 친 문서를 매번 이 결과로 덮으면 주석과
 * 줄 순서가 사라지고, 무엇보다 CRDT 에서 남이 같은 순간에 친 글자를 지운다.
 * 저장은 `edits.ts` 의 구간 수정으로 한다.
 *
 * 왕복 불변식은 **글자가 같은 것이 아니라 구조가 같은 것**이다 —
 * `parse(print(d))` 가 `d` 와 같은 노드·엣지·그룹을 내놓고, 한 번 더 찍으면
 * 글자까지 같아진다(멱등).
 */
export function print(doc: ParsedDocument): string {
  const out: string[] = [];

  const childGroups = new Map<string | undefined, GroupDecl[]>();
  for (const g of doc.groups) {
    const list = childGroups.get(g.parentId) ?? [];
    list.push(g);
    childGroups.set(g.parentId, list);
  }

  const nodesByGroup = new Map<string | undefined, NodeDecl[]>();
  for (const n of doc.nodes) {
    if (n.implicit) continue; // 선언이 없던 노드는 선언을 만들어 내지 않는다
    const list = nodesByGroup.get(n.groupId) ?? [];
    list.push(n);
    nodesByGroup.set(n.groupId, list);
  }

  const writeNode = (n: NodeDecl, indent: string) => {
    out.push(`${indent}${n.kind} ${n.id}${n.label === undefined ? '' : ` ${quoteLabel(n.label)}`}`);
  };

  const writeGroup = (g: GroupDecl, indent: string) => {
    out.push(
      `${indent}group ${g.id}${g.label === undefined ? '' : ` ${quoteLabel(g.label)}`} {`,
    );
    for (const n of nodesByGroup.get(g.id) ?? []) writeNode(n, `${indent}  `);
    for (const child of childGroups.get(g.id) ?? []) writeGroup(child, `${indent}  `);
    out.push(`${indent}}`);
  };

  const topNodes = nodesByGroup.get(undefined) ?? [];
  for (const n of topNodes) writeNode(n, '');

  const topGroups = childGroups.get(undefined) ?? [];
  if (topGroups.length > 0 && out.length > 0) out.push('');
  topGroups.forEach((g, i) => {
    if (i > 0) out.push('');
    writeGroup(g, '');
  });

  if (doc.edges.length > 0 && out.length > 0) out.push('');
  for (const e of doc.edges) {
    const op = e.style === 'arrow' ? '->' : '--';
    out.push(
      `${e.from} ${op} ${e.to}${e.label === undefined ? '' : ` ${quoteLabel(e.label)}`}`,
    );
  }

  return out.length === 0 ? '' : `${out.join('\n')}\n`;
}
