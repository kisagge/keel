import { indentOf, lineSpan, lineStarts } from './lines.js';
import { quoteLabel } from './printer.js';
import type { EdgeStyle, NodeKind, ParsedDocument, Span, TextEdit } from './types.js';

/**
 * 캔버스에서 일어난 일을 **텍스트의 그 자리만 고치는 수정 목록**으로 바꾼다.
 *
 * 이 패키지에서 가장 중요한 파일이다. 캔버스가 문서를 통째로 다시 쓰면
 * 두 가지가 동시에 깨진다 —
 *
 * 1. 사람이 쓴 주석과 줄 순서가 사라진다
 * 2. CRDT 에서 **문서가 둘로 불어난다.** 재 보니(직접 `Y.Doc` 둘을 붙여서) Yjs 는
 *    자리가 아니라 항목 단위로 지우므로, 통째로 쓰기가 "전부 지우고 전부 넣기"
 *    를 해도 내가 못 본 상대의 삽입은 내 지우기에 안 걸린다 — 병합이 아니라
 *    소멸이 된다는 말은 거짓이었다. 실제로는 양쪽이 각자 쓴 전문이 나란히
 *    살아남는다. 구간 수정일 때 4줄·진단 0 이던 것이 통째로 쓰기에서는
 *    7줄·진단 4 가 되고, 이음매에서 줄이 뭉개지고 같은 이름의 노드가 두 벌
 *    생긴다
 *
 * 그래서 모든 조작은 `TextEdit[]` 로 돌아가고, 호출한 쪽이 그것을 Y.Text 에
 * 그대로 적용한다.
 */

/** 수정을 실제 문자열에 적용한다. 테스트와 오프라인 계산용 */
export function applyEdits(source: string, edits: readonly TextEdit[]): string {
  const sorted = [...edits].sort((a, b) => b.from - a.from || b.to - a.to);

  let prevFrom = Number.POSITIVE_INFINITY;
  let out = source;
  for (const e of sorted) {
    if (e.to > prevFrom) {
      throw new Error(`겹치는 수정: [${e.from}, ${e.to}) 가 ${prevFrom} 뒤를 침범한다`);
    }
    out = out.slice(0, e.from) + e.insert + out.slice(e.to);
    prevFrom = e.from;
  }
  return out;
}

export function canUseId(doc: ParsedDocument, id: string): boolean {
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(id)) return false;
  if (RESERVED.has(id)) return false;
  if (doc.groups.some((g) => g.id === id)) return false;
  return !doc.nodes.some((n) => n.id === id);
}

const RESERVED = new Set(['service', 'db', 'queue', 'external', 'actor', 'group']);

export interface NewNode {
  readonly kind: NodeKind;
  readonly id: string;
  readonly label?: string | undefined;
  readonly groupId?: string | undefined;
}

export interface NewEdge {
  readonly from: string;
  readonly to: string;
  readonly style: EdgeStyle;
  readonly label?: string | undefined;
}

// 노드

export function planAddNode(doc: ParsedDocument, spec: NewNode): TextEdit[] {
  const text = nodeLine(spec);
  const group = spec.groupId === undefined ? undefined : doc.groups.find((g) => g.id === spec.groupId);

  if (group) {
    const starts = lineStarts(doc.source);
    const inner = doc.nodes.filter((n) => n.groupId === group.id && !n.implicit);
    const indent = `${indentOf(doc.source, group.line, starts)}  `;

    if (inner.length > 0) {
      const afterLine = Math.max(...inner.map((n) => n.line));
      return [lineInsertAfter(doc.source, afterLine, indent + text, starts)];
    }

    /**
     * 빈 그룹에는 여는 중괄호 **바로 뒤**에 넣는다. 헤더 줄 뒤에 넣는 방식은
     * `group g { }` 처럼 한 줄로 쓴 그룹에서 노드를 그룹 밖에 떨어뜨린다.
     */
    return [{ from: group.bodySpan.start, to: group.bodySpan.start, insert: `\n${indent}${text}` }];
  }

  const top = doc.nodes.filter((n) => n.groupId === undefined && !n.implicit);
  if (top.length > 0) {
    const afterLine = Math.max(...top.map((n) => n.line));
    return [lineInsertAfter(doc.source, afterLine, text)];
  }

  // 선언이 하나도 없으면 문서 맨 앞에 둔다 — 엣지보다 위가 읽기 좋다
  return [{ from: 0, to: 0, insert: `${text}\n` }];
}

/**
 * 노드와 **그 노드가 걸린 엣지 줄까지** 지운다.
 *
 * 엣지를 남기면 파서가 그 이름을 암시 노드로 되살려, 지운 노드가 화면에
 * 그대로 남는다. 처음에 이것을 빠뜨려 "지워지지 않는 노드" 를 만들었다.
 */
export function planRemoveNode(doc: ParsedDocument, id: string): TextEdit[] {
  const starts = lineStarts(doc.source);
  const lines = new Set<number>();

  for (const n of doc.nodes) {
    if (n.id === id && !n.implicit) lines.add(n.line);
  }
  for (const e of doc.edges) {
    if (e.from === id || e.to === id) lines.add(e.line);
  }

  return removeLines(doc.source, lines, starts);
}

export function planSetNodeLabel(
  doc: ParsedDocument,
  id: string,
  label: string | undefined,
): TextEdit[] {
  const node = doc.nodes.find((n) => n.id === id);
  if (!node) return [];

  // 선언이 없던 노드에 이름을 붙이려면 선언부터 만들어야 한다
  if (node.implicit) {
    if (label === undefined) return [];
    return planAddNode(doc, { kind: node.kind, id: node.id, label });
  }

  if (node.labelSpan) {
    if (label === undefined) {
      return [{ from: node.idSpan.end, to: node.labelSpan.end, insert: '' }];
    }
    return [{ from: node.labelSpan.start, to: node.labelSpan.end, insert: quoteLabel(label) }];
  }

  if (label === undefined) return [];
  return [{ from: node.idSpan.end, to: node.idSpan.end, insert: ` ${quoteLabel(label)}` }];
}

export function planSetNodeKind(doc: ParsedDocument, id: string, kind: NodeKind): TextEdit[] {
  const node = doc.nodes.find((n) => n.id === id);
  if (!node) return [];
  if (node.implicit || !node.kindSpan) {
    return planAddNode(doc, { kind, id: node.id, label: node.label });
  }
  if (node.kind === kind) return [];
  return [{ from: node.kindSpan.start, to: node.kindSpan.end, insert: kind }];
}

/**
 * 이름(id)을 바꾼다 — 선언 한 곳이 아니라 **가리키는 모든 자리**를 함께 고친다.
 * 엣지를 놓치면 원래 노드가 암시 노드로 되살아난다.
 */
export function planRenameNodeId(doc: ParsedDocument, oldId: string, newId: string): TextEdit[] {
  if (oldId === newId) return [];
  if (!canUseId(doc, newId)) return [];

  const edits: TextEdit[] = [];
  const node = doc.nodes.find((n) => n.id === oldId);
  if (!node) return [];
  if (!node.implicit) edits.push(replaceSpan(node.idSpan, newId));

  for (const e of doc.edges) {
    if (e.from === oldId) edits.push(replaceSpan(e.fromSpan, newId));
    if (e.to === oldId) edits.push(replaceSpan(e.toSpan, newId));
  }
  return edits;
}

// 엣지

export function planAddEdge(doc: ParsedDocument, spec: NewEdge): TextEdit[] {
  const text = edgeLine(spec);
  if (doc.edges.length > 0) {
    const afterLine = Math.max(...doc.edges.map((e) => e.line));
    return [lineInsertAfter(doc.source, afterLine, text)];
  }
  if (doc.source.length === 0) return [{ from: 0, to: 0, insert: `${text}\n` }];
  const lastLine = lineStarts(doc.source).length - 1;
  return [lineInsertAfter(doc.source, lastLine, text)];
}

export function planRemoveEdge(doc: ParsedDocument, key: string): TextEdit[] {
  const edge = doc.edges.find((e) => e.key === key);
  if (!edge) return [];
  return removeLines(doc.source, new Set([edge.line]), lineStarts(doc.source));
}

export function planSetEdgeLabel(
  doc: ParsedDocument,
  key: string,
  label: string | undefined,
): TextEdit[] {
  const edge = doc.edges.find((e) => e.key === key);
  if (!edge) return [];

  if (edge.labelSpan) {
    if (label === undefined) {
      return [{ from: edge.toSpan.end, to: edge.labelSpan.end, insert: '' }];
    }
    return [{ from: edge.labelSpan.start, to: edge.labelSpan.end, insert: quoteLabel(label) }];
  }

  if (label === undefined) return [];
  return [{ from: edge.toSpan.end, to: edge.toSpan.end, insert: ` ${quoteLabel(label)}` }];
}

// 도구

function nodeLine(spec: NewNode): string {
  return `${spec.kind} ${spec.id}${spec.label === undefined ? '' : ` ${quoteLabel(spec.label)}`}`;
}

function edgeLine(spec: NewEdge): string {
  const op = spec.style === 'arrow' ? '->' : '--';
  return `${spec.from} ${op} ${spec.to}${spec.label === undefined ? '' : ` ${quoteLabel(spec.label)}`}`;
}

function replaceSpan(span: Span, insert: string): TextEdit {
  return { from: span.start, to: span.end, insert };
}

/**
 * 어떤 줄 **뒤에** 새 줄을 넣는다.
 *
 * 줄의 끝(줄바꿈 앞)에 `\n새줄` 을 끼우는 방식이라, 문서가 줄바꿈으로 끝나지
 * 않는 경우에도 빈 줄이 생기지 않는다. 줄 시작에 `새줄\n` 을 넣는 방식으로
 * 하면 마지막 줄에서 어긋난다.
 */
function lineInsertAfter(
  source: string,
  line: number,
  text: string,
  starts = lineStarts(source),
): TextEdit {
  const { end } = lineSpan(source, line, starts);
  return { from: end, to: end, insert: `\n${text}` };
}

/**
 * 여러 줄을 지운다. 줄바꿈까지 함께 가져가되 **붙어 있는 줄은 하나로 합친다.**
 *
 * 합치지 않으면 문서의 마지막 줄과 그 앞줄을 같이 지울 때 구간이 한 글자
 * 겹친다 — 마지막 줄에는 뒤따르는 줄바꿈이 없어 대신 앞의 줄바꿈을 먹어야
 * 하는데, 그 줄바꿈이 앞줄의 구간에도 들어 있기 때문이다.
 * 노드 하나와 거기 걸린 엣지를 함께 지우는 것은 흔한 일이라 반드시 겪는다.
 */
function removeLines(source: string, lines: Set<number>, starts: number[]): TextEdit[] {
  const merged: { start: number; end: number }[] = [];

  for (const line of [...lines].sort((a, b) => a - b)) {
    const start = starts[line] ?? source.length;
    const next = starts[line + 1];
    const end = next ?? source.length;

    const last = merged.at(-1);
    if (last && start <= last.end) last.end = Math.max(last.end, end);
    else merged.push({ start, end });
  }

  return merged.map(({ start, end }) => {
    // 문서 끝까지 지우는 구간은 앞의 줄바꿈도 가져간다. 안 그러면 빈 줄이 남는다
    const from = end === source.length && start > 0 && source[start - 1] === '\n' ? start - 1 : start;
    return { from, to: end, insert: '' };
  });
}
