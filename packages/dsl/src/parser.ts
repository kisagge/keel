import { tokenize, type Token } from './lexer.js';
import {
  NODE_KINDS,
  type Diagnostic,
  type DiagnosticCode,
  type DiagnosticSeverity,
  type EdgeDecl,
  type EdgeStyle,
  type GroupDecl,
  type NodeDecl,
  type NodeKind,
  type ParsedDocument,
  type Span,
} from './types.js';

/**
 * 한 줄이 한 문장인 재귀 하강 파서.
 *
 * **절대 던지지 않는다.** 사람이 글자를 치는 도중의 문서는 언제나 문법에 어긋나
 * 있으므로, 깨진 줄은 진단으로 남기고 다음 줄에서 회복한다. 한 글자 쳤다고
 * 화면이 비면 쓸 수 없는 도구가 된다.
 */
export function parse(source: string): ParsedDocument {
  return new Parser(source).parse();
}

interface OpenGroup {
  id: string;
  label: string | undefined;
  parentId: string | undefined;
  line: number;
  headerStart: number;
  bodyStart: number;
  idSpan: Span;
  labelSpan: Span | undefined;
}

class Parser {
  private readonly tokens: Token[];
  private p = 0;

  private readonly nodes: NodeDecl[] = [];
  private readonly edges: EdgeDecl[] = [];
  private readonly groups: GroupDecl[] = [];
  private readonly diagnostics: Diagnostic[] = [];

  private readonly stack: OpenGroup[] = [];
  private readonly declaredIds = new Set<string>();
  private readonly edgeKeyCount = new Map<string, number>();

  constructor(private readonly source: string) {
    this.tokens = tokenize(source);
  }

  parse(): ParsedDocument {
    for (;;) {
      const t = this.peek();
      if (t.type === 'eof') break;

      if (t.type === 'newline') {
        this.p += 1;
        continue;
      }

      if (t.type === 'rbrace') {
        this.closeGroup(t);
        continue;
      }

      if (t.type === 'ident') {
        const next = this.peek(1);

        if (t.value === 'group' && next.type === 'ident') {
          this.parseGroup(t);
          continue;
        }

        if (isNodeKind(t.value) && next.type === 'ident') {
          this.parseNode(t, t.value);
          continue;
        }

        if (next.type === 'arrow' || next.type === 'line') {
          this.parseEdge(t);
          continue;
        }

        // `service` 로 시작했는데 뒤에 이름이 없는 경우가 여기로 온다.
        // 타이핑 중에 늘 지나가는 상태라 문구를 구체적으로 적는다.
        if (isNodeKind(t.value)) {
          this.report('error', 'expected-id', `'${t.value}' 다음에 이름이 필요하다`, t);
        } else if (t.value === 'group') {
          this.report('error', 'expected-id', "'group' 다음에 이름이 필요하다", t);
        } else {
          this.report('error', 'expected-target', `'${t.value}' 다음에 '->' 나 '--' 가 필요하다`, t);
        }
        this.skipLine();
        continue;
      }

      this.report('error', 'unexpected-token', `여기에 올 수 없는 것: '${t.value}'`, t);
      this.skipLine();
    }

    for (const open of this.stack) {
      this.diagnostics.push({
        severity: 'error',
        code: 'unclosed-group',
        message: `그룹 '${open.id}' 이 닫히지 않았다`,
        line: open.line,
        span: { start: open.headerStart, end: open.bodyStart },
      });
    }

    this.materializeImplicitNodes();

    this.diagnostics.sort((a, b) => a.span.start - b.span.start);

    return {
      source: this.source,
      nodes: this.nodes,
      edges: this.edges,
      groups: this.groups,
      diagnostics: this.diagnostics,
    };
  }

  // 문장

  private parseNode(kindTok: Token, kind: NodeKind): void {
    this.p += 1;
    const idTok = this.expectIdent();
    if (!idTok) return;

    const labelTok = this.maybeString();
    const end = labelTok ? labelTok.span.end : idTok.span.end;

    this.declare(idTok, `노드 '${idTok.value}'`);

    this.nodes.push({
      kind,
      id: idTok.value,
      label: labelTok?.value,
      groupId: this.currentGroupId(),
      implicit: false,
      line: kindTok.line,
      span: { start: kindTok.span.start, end },
      kindSpan: kindTok.span,
      idSpan: idTok.span,
      labelSpan: labelTok?.span,
    });

    this.endStatement();
  }

  private parseEdge(fromTok: Token): void {
    this.p += 1;
    const opTok = this.next(); // arrow | line — 이 자리에 온 것이 확인된 상태다
    const style: EdgeStyle = opTok.type === 'arrow' ? 'arrow' : 'line';

    const toTok = this.peek();
    if (toTok.type !== 'ident') {
      this.report('error', 'expected-target', `'${opTok.value}' 다음에 이름이 필요하다`, opTok);
      this.skipLine();
      return;
    }
    this.p += 1;

    const labelTok = this.maybeString();
    const end = labelTok ? labelTok.span.end : toTok.span.end;

    if (fromTok.value === toTok.value) {
      this.report(
        'warning',
        'self-edge',
        `'${fromTok.value}' 가 자기 자신을 가리킨다`,
        fromTok,
        toTok.span.end,
      );
    }

    /**
     * 열쇠에 **화살표 모양을 넣지 않는다.**
     *
     * 넣으면 `->` 를 `--` 로 바꾼 것이 버전 비교에서 "엣지가 사라지고 새 엣지가
     * 생겼다" 로 나온다. 사람이 알고 싶은 것은 "같은 선의 표시가 바뀌었다" 이므로
     * 양 끝점만으로 같은 선임을 알아본다.
     */
    const base = `${fromTok.value} ${toTok.value}`;
    const nth = this.edgeKeyCount.get(base) ?? 0;
    this.edgeKeyCount.set(base, nth + 1);

    this.edges.push({
      key: `${base} ${nth}`,
      from: fromTok.value,
      to: toTok.value,
      style,
      label: labelTok?.value,
      line: fromTok.line,
      span: { start: fromTok.span.start, end },
      fromSpan: fromTok.span,
      toSpan: toTok.span,
      opSpan: opTok.span,
      labelSpan: labelTok?.span,
    });

    this.endStatement();
  }

  private parseGroup(groupTok: Token): void {
    this.p += 1;
    const idTok = this.expectIdent();
    if (!idTok) return;

    const labelTok = this.maybeString();

    const brace = this.peek();
    if (brace.type !== 'lbrace') {
      this.report('error', 'unexpected-token', `그룹 '${idTok.value}' 에 '{' 가 없다`, idTok);
      this.skipLine();
      return;
    }
    this.p += 1;

    this.declare(idTok, `그룹 '${idTok.value}'`);

    this.stack.push({
      id: idTok.value,
      label: labelTok?.value,
      parentId: this.stack.at(-1)?.id,
      line: groupTok.line,
      headerStart: groupTok.span.start,
      bodyStart: brace.span.end,
      idSpan: idTok.span,
      labelSpan: labelTok?.span,
    });

    this.endStatement();
  }

  private closeGroup(brace: Token): void {
    this.p += 1;
    const open = this.stack.pop();
    if (!open) {
      this.report('error', 'unexpected-close', "짝이 없는 '}'", brace);
      this.endStatement();
      return;
    }

    this.groups.push({
      id: open.id,
      label: open.label,
      parentId: open.parentId,
      line: open.line,
      headerSpan: { start: open.headerStart, end: open.bodyStart },
      bodySpan: { start: open.bodyStart, end: brace.span.start },
      span: { start: open.headerStart, end: brace.span.end },
      idSpan: open.idSpan,
      labelSpan: open.labelSpan,
    });

    this.endStatement();
  }

  // 뒤처리

  /**
   * 선언 없이 엣지에서만 쓰인 이름을 노드로 만든다.
   *
   * `web -> api` 한 줄만 적어도 그림이 나오는 편의를 주되, **오타가 조용히 새
   * 노드가 되는 대가**가 있으므로 반드시 진단에 남겨 화면이 보여 줄 수 있게 한다.
   */
  private materializeImplicitNodes(): void {
    const groupIds = new Set(this.groups.map((g) => g.id));
    const nodeIds = new Set(this.nodes.map((n) => n.id));
    const seen = new Set<string>();

    for (const edge of this.edges) {
      for (const [id, span] of [
        [edge.from, edge.fromSpan],
        [edge.to, edge.toSpan],
      ] as const) {
        if (nodeIds.has(id) || seen.has(id)) continue;
        if (groupIds.has(id)) continue;
        seen.add(id);
        this.nodes.push({
          kind: 'service',
          id,
          label: undefined,
          groupId: undefined,
          implicit: true,
          line: edge.line,
          span,
          kindSpan: undefined,
          idSpan: span,
          labelSpan: undefined,
        });
        this.diagnostics.push({
          severity: 'info',
          code: 'implicit-node',
          message: `'${id}' 는 선언 없이 만들어졌다`,
          line: edge.line,
          span,
        });
      }
    }
  }

  // 도구

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.p + offset, this.tokens.length - 1)]!;
  }

  private next(): Token {
    const t = this.peek();
    if (t.type !== 'eof') this.p += 1;
    return t;
  }

  private expectIdent(): Token | undefined {
    const t = this.peek();
    if (t.type !== 'ident') {
      this.report('error', 'expected-id', '이름이 필요하다', t);
      this.skipLine();
      return undefined;
    }
    this.p += 1;
    return t;
  }

  private maybeString(): Token | undefined {
    const t = this.peek();
    if (t.type !== 'string') return undefined;
    this.p += 1;
    if (t.unterminated) {
      this.report('error', 'unterminated-string', '따옴표가 닫히지 않았다', t);
    }
    return t;
  }

  private declare(idTok: Token, what: string): void {
    if (this.declaredIds.has(idTok.value)) {
      this.report('error', 'duplicate-id', `${what} 이 이미 있다`, idTok);
      return;
    }
    this.declaredIds.add(idTok.value);
  }

  private currentGroupId(): string | undefined {
    return this.stack.at(-1)?.id;
  }

  /** 문장 뒤에 남은 것이 있으면 알리고 줄 끝까지 버린다 */
  private endStatement(): void {
    const t = this.peek();
    if (t.type === 'newline' || t.type === 'eof') return;
    if (t.type === 'rbrace') return; // `group g { }` 한 줄 표기를 허용한다
    this.report('error', 'unexpected-token', `줄 끝에 남은 것: '${t.value}'`, t);
    this.skipLine();
  }

  private skipLine(): void {
    for (;;) {
      const t = this.peek();
      if (t.type === 'eof') return;
      if (t.type === 'newline') {
        this.p += 1;
        return;
      }
      this.p += 1;
    }
  }

  private report(
    severity: DiagnosticSeverity,
    code: DiagnosticCode,
    message: string,
    at: Token,
    end = at.span.end,
  ): void {
    this.diagnostics.push({
      severity,
      code,
      message,
      line: at.line,
      span: { start: at.span.start, end },
    });
  }
}

function isNodeKind(value: string): value is NodeKind {
  return (NODE_KINDS as readonly string[]).includes(value);
}
