/* eslint-disable @typescript-eslint/no-base-to-string */
import { parse, planRemoveNode, planSetNodeKind, planSetNodeLabel } from '@keel/dsl';
import type { NodeKind, ParsedDocument, TextEdit } from '@keel/dsl';
import type { Point } from '@keel/renderer';
import { KEEL_LOCAL } from './keel-document.js';
import type { KeelDocument } from './keel-document.js';
import { applyTextEdits } from './text-edits.js';

/**
 * 캔버스에서 일어난 일을 문서에 얹는다.
 *
 * 모든 명령이 같은 꼴이다 — 지금 소스를 파싱하고, `plan*` 이 돌려준 구간 수정을
 * **한 트랜잭션**에 얹는다. 한 트랜잭션이어야 되돌리기가 그것을 한 걸음으로
 * 본다.
 *
 * 바뀔 것이 없으면 트랜잭션을 아예 안 연다. 빈 트랜잭션은 되돌리기 역사에 빈
 * 칸을 남겨, Cmd+Z 를 눌렀는데 아무 일도 안 일어나게 만든다.
 */

/**
 * 바뀌는 것이 없는 수정은 버린다.
 *
 * `planSetNodeLabel` 은 **같은 라벨로 고쳐도 빈 배열을 안 준다** — 같은 글자를
 * 다시 쓰는 수정을 준다(`planSetNodeKind` 는 `[]` 를 준다). 그대로 얹으면
 * 되돌리기 역사에 빈 칸이 생기고, 남의 화면에는 아무것도 안 바뀐 갱신이 날아간다.
 */
function meaningful(source: string, edits: readonly TextEdit[]): TextEdit[] {
  return edits.filter((edit) => source.slice(edit.from, edit.to) !== edit.insert);
}

/**
 * 명령 하나는 **되돌리기 한 걸음**이다.
 *
 * Yjs 는 짧은 사이에 일어난 수정을 한 걸음으로 묶는다(기본 500ms). 글자를 칠
 * 때는 그게 맞지만, 캔버스 조작은 한 번이 한 행동이다 — 이름을 고치고 곧바로
 * 노드를 끌면 `Cmd+Z` 한 번에 둘 다 되돌아가 버린다. 그래서 명령을 얹기 전에
 * 경계를 긋는다.
 */
function beginStep(document: KeelDocument): void {
  document.undoManager.stopCapturing();
}

function editText(document: KeelDocument, plan: (doc: ParsedDocument) => TextEdit[]): void {
  const source = document.source.toString();
  const edits = meaningful(source, plan(parse(source)));
  if (edits.length === 0) return;

  beginStep(document);
  document.doc.transact(() => applyTextEdits(document.source, edits), KEEL_LOCAL);
}

export function renameNode(
  document: KeelDocument,
  id: string,
  label: string | undefined,
): void {
  editText(document, (doc) => planSetNodeLabel(doc, id, label));
}

export function setNodeKind(document: KeelDocument, id: string, kind: NodeKind): void {
  editText(document, (doc) => planSetNodeKind(doc, id, kind));
}

/**
 * 노드를 지운다.
 *
 * `planRemoveNode` 가 노드 줄과 **거기 걸린 엣지 줄까지** 지운다. 엣지를
 * 남기면 파서가 그 이름을 암시 노드로 되살려, 지운 노드가 화면에 그대로 남는다.
 *
 * 레이아웃 자리도 **같은 트랜잭션에서** 지운다. 안 지우면 유령 좌표가 남아,
 * 같은 이름을 다시 만들었을 때 옛 자리로 튄다. 같은 트랜잭션이라야 되돌리기
 * 한 번에 글과 자리가 함께 돌아온다.
 */
export function removeNode(document: KeelDocument, id: string): void {
  const source = document.source.toString();
  const edits = meaningful(source, planRemoveNode(parse(source), id));
  const hadPlace = document.layout.has(id);
  if (edits.length === 0 && !hadPlace) return;

  beginStep(document);
  document.doc.transact(() => {
    applyTextEdits(document.source, edits);
    document.layout.delete(id);
  }, KEEL_LOCAL);
}

/**
 * 노드를 옮긴다. **텍스트는 안 건드린다** — 좌표는 문서가 아니다.
 *
 * 받은 값을 그대로 적는다. 반올림이나 격자 맞춤은 끄는 쪽의 일이고, 여기서
 * 손대면 렌더러의 "중심이 레이아웃에 적힌 값과 정확히 같다" 계약이 깨진다.
 */
export function moveNode(document: KeelDocument, id: string, at: Point): void {
  beginStep(document);
  document.doc.transact(() => document.layout.set(id, at), KEEL_LOCAL);
}
