'use client';

import { defaultKeymap } from '@codemirror/commands';
import { linter, lintGutter } from '@codemirror/lint';
import type { Diagnostic as CmDiagnostic } from '@codemirror/lint';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
import { parseSource } from '../document/derive.js';
import type { KeelDocument } from '../document/keel-document.js';

/**
 * 텍스트 쪽.
 *
 * `y-codemirror.next` 가 `Y.Text` 와 편집기를 잇는다. awareness 는 아직 없으므로
 * `null` 을 넘긴다 — 그 인자는 `if (awareness)` 로 감싸여 있어 원격 커서
 * 플러그인만 빠진다. 프레즌스가 올 때 채운다.
 *
 * 되돌리기는 문서가 들고 있는 하나를 그대로 쓴다. CodeMirror 의 자체 history 를
 * 쓰면 친 글자와 끈 노드가 다른 역사로 갈려, 사람이 "방금 뭘 되돌렸는지" 를
 * 못 따라간다.
 */
export function EditorPane({
  document: keelDocument,
  viewRef,
}: {
  readonly document: KeelDocument;
  readonly viewRef: RefObject<EditorView | null>;
}) {
  const host = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const parent = host.current;
    if (parent === null) return;

    /**
     * 진단은 **이미 파싱한 것을 그대로 넘긴다.** 린터 안에서 다시 파싱하면
     * 글자를 칠 때마다 같은 일을 두 번 한다.
     */
    const keelLinter = linter((view): CmDiagnostic[] => {
      const { document: parsed } = parseSource(view.state.doc.toString());
      return parsed.diagnostics.map((d) => ({
        from: d.span.start,
        to: Math.max(d.span.start + 1, d.span.end),
        severity: d.severity,
        message: d.message,
        source: d.code,
      }));
    });

    const view = new EditorView({
      parent,
      state: EditorState.create({
        /**
         * `yCollab`/`ySync` 는 **앞으로의 변화만** 관찰한다 — 만들어질 때
         * `Y.Text` 의 지금 내용을 편집기에 싣지 않는다. 여기서 `doc` 을 안
         * 채우면 편집기는 빈 채로 시작하고 `Y.Text` 는 씨앗을 쥔 채로 어긋나,
         * 첫 글자를 치는 순간 엉뚱한 자리에 꽂힌다.
         */
        doc: keelDocument.source.toString(),
        extensions: [
          lineNumbers(),
          lintGutter(),
          keelLinter,
          /**
           * CodeMirror 의 `history()` 는 **일부러 안 넣는다.** 넣으면 친 글자와
           * 끈 노드가 다른 역사로 갈려, 사람이 "방금 뭘 되돌렸는지" 를 못
           * 따라간다. `yUndoManagerKeymap` 이 문서의 역사 하나를 쓴다.
           */
          keymap.of([...yUndoManagerKeymap, ...defaultKeymap]),
          yCollab(keelDocument.source, null, { undoManager: keelDocument.undoManager }),
          EditorView.theme({
            '&': { height: '100%', fontSize: '13px' },
            '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
          }),
        ],
      }),
    });

    viewRef.current = view;
    return () => {
      viewRef.current = null;
      view.destroy();
    };
  }, [keelDocument, viewRef]);

  return <div ref={host} style={{ height: '100%', overflow: 'hidden' }} />;
}
