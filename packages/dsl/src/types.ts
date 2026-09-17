/**
 * KEEL DSL 의 구문 트리.
 *
 * 모든 선언이 **원본 텍스트에서의 위치(Span)를 들고 있다.** 이것이 이 패키지의
 * 존재 이유다 — 캔버스에서 노드 이름을 바꿨을 때 문서를 통째로 다시 쓰지 않고
 * 그 이름이 적힌 자리만 고쳐야 하기 때문이다.
 *
 * 통째로 다시 쓰면 CRDT 에서 **다른 사람이 같은 순간에 친 글자가 지워진다.**
 * 그래서 파서는 AST 가 아니라 위치를 보존한 CST 를 만든다.
 */

/** 원본 문자열에서의 반열린 구간 [start, end) */
export interface Span {
  readonly start: number;
  readonly end: number;
}

export type NodeKind = 'service' | 'db' | 'queue' | 'external' | 'actor';

export const NODE_KINDS: readonly NodeKind[] = ['service', 'db', 'queue', 'external', 'actor'];

/** `->` 는 방향이 있는 흐름, `--` 는 방향 없는 연결 */
export type EdgeStyle = 'arrow' | 'line';

export interface NodeDecl {
  readonly kind: NodeKind;
  readonly id: string;
  /** 없으면 화면에 id 를 그린다 */
  readonly label: string | undefined;
  readonly groupId: string | undefined;
  /**
   * 선언 없이 엣지에서만 쓰인 노드. `web -> api` 만 적어도 두 노드가 그려진다.
   * 편하지만 오타가 조용히 새 노드가 되므로 진단에 남긴다.
   */
  readonly implicit: boolean;
  readonly line: number;
  /** 문장 전체 (줄바꿈·꼬리 주석 제외) */
  readonly span: Span;
  readonly kindSpan: Span | undefined;
  readonly idSpan: Span;
  /** 따옴표를 포함한 라벨 구간. 라벨이 없으면 undefined */
  readonly labelSpan: Span | undefined;
}

export interface EdgeDecl {
  /**
   * 다시 파싱해도 같은 엣지를 가리키는 열쇠.
   * 배열 인덱스를 쓰면 앞 줄이 지워질 때 엉뚱한 엣지를 지운다.
   */
  readonly key: string;
  readonly from: string;
  readonly to: string;
  readonly style: EdgeStyle;
  readonly label: string | undefined;
  readonly line: number;
  readonly span: Span;
  readonly fromSpan: Span;
  readonly toSpan: Span;
  readonly opSpan: Span;
  readonly labelSpan: Span | undefined;
}

export interface GroupDecl {
  readonly id: string;
  readonly label: string | undefined;
  readonly parentId: string | undefined;
  readonly line: number;
  /** `group` 부터 여는 중괄호까지 */
  readonly headerSpan: Span;
  /** 여는 중괄호 다음부터 닫는 중괄호 앞까지 */
  readonly bodySpan: Span;
  /** `group` 부터 닫는 중괄호까지 */
  readonly span: Span;
  readonly idSpan: Span;
  readonly labelSpan: Span | undefined;
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  readonly severity: DiagnosticSeverity;
  /** 화면과 테스트가 문구가 아니라 이 코드로 판단한다 */
  readonly code: DiagnosticCode;
  readonly message: string;
  readonly line: number;
  readonly span: Span;
}

export type DiagnosticCode =
  | 'unexpected-token'
  | 'expected-id'
  | 'expected-target'
  | 'unterminated-string'
  | 'duplicate-id'
  | 'unclosed-group'
  | 'unexpected-close'
  | 'implicit-node'
  | 'self-edge';

/** 파싱 결과. 오류가 있어도 항상 만들어진다 — 읽어 낸 만큼은 그린다 */
export interface ParsedDocument {
  readonly source: string;
  readonly nodes: readonly NodeDecl[];
  readonly edges: readonly EdgeDecl[];
  readonly groups: readonly GroupDecl[];
  readonly diagnostics: readonly Diagnostic[];
}

/** 텍스트를 통째로 바꾸지 않고 구간만 고치는 단위 */
export interface TextEdit {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
}
