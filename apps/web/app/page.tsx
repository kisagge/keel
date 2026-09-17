'use client';

import type { EditorView } from '@codemirror/view';
import type { Hit } from '@keel/renderer';
import { useCallback, useMemo, useRef, useState } from 'react';
import { YSyncConfig } from 'y-codemirror.next';
import { CanvasPane } from '../src/components/canvas-pane.js';
import { DiagnosticsList } from '../src/components/diagnostics.js';
import { EditorPane } from '../src/components/editor-pane.js';
import { parseSource } from '../src/document/derive.js';
import { createKeelDocument } from '../src/document/keel-document.js';
import { useKeelDocument } from '../src/hooks/use-keel-document.js';
import { SEED } from '../src/document/seed.js';

function idOf(hit: Hit | undefined): string | undefined {
  if (hit === undefined) return undefined;
  if (hit.kind === 'node') return hit.node.id;
  if (hit.kind === 'edge') return hit.edge.key;
  return hit.group.id;
}

export default function EditorPage() {
  /**
   * `YSyncConfig` 를 넘기는 것이 핵심이다. CodeMirror 의 로컬 편집은 그 클래스의
   * 인스턴스를 origin 으로 쓰고, Yjs 는 origin 을 생성자로도 견주므로 클래스만
   * 넣어 두면 인스턴스를 손에 안 쥐어도 되돌리기에 걸린다.
   */
  const document = useMemo(() => createKeelDocument(SEED, [YSyncConfig]), []);
  /**
   * **문서를 정리하지 않는다.**
   *
   * `useEffect(() => () => document.destroy(), [])` 로 두면 안 된다. React 의
   * Strict Mode 는 개발 중 마운트→정리→재마운트를 한 번 흉내 내는데, 문서는
   * `useMemo(..., [])` 로 한 번만 만들어져 재마운트 때 다시 안 만들어진다.
   * 그래서 유령 정리가 부른 `destroy()` 가 그대로 남는다.
   *
   * 겉으로는 멀쩡해 보인다 — 글자도 고쳐지고 캔버스도 그려진다. 죽는 것은
   * 되돌리기뿐이다. 재 봤더니 `destroy()` 뒤에도 편집은 되는데 `canUndo()` 가
   * `false` 이고 `Cmd+Z` 가 아무 일도 안 한다. `UndoManager.destroy()` 가
   * `afterTransaction` 구독을 떼어 내고 아무도 다시 붙이지 않기 때문이다.
   *
   * 문서는 이 화면과 수명이 같고 화면은 한 장뿐이라, 안 지워도 잃는 것이 없다.
   * 나중에 **화면을 떠나지 않은 채 편집기만 내리는 길**이 생기면 그때는
   * 문서를 효과 안에서 만들어 만듦과 지움을 짝지어야 한다.
   */

  const source = useKeelDocument(document);
  const { document: parsed } = useMemo(() => parseSource(source), [source]);

  const viewRef = useRef<EditorView | null>(null);
  const goTo = useCallback((position: number) => {
    const view = viewRef.current;
    if (view === null) return;
    view.dispatch({ selection: { anchor: position }, scrollIntoView: true });
    view.focus();
  }, []);

  const [selectedHit, setSelectedHit] = useState<Hit | undefined>(undefined);
  const selection = useMemo(() => {
    const id = idOf(selectedHit);
    return new Set<string>(id === undefined ? [] : [id]);
  }, [selectedHit]);

  return (
    <main style={{ height: '100%', display: 'grid', gridTemplateColumns: '40% 1fr' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateRows: '1fr auto',
          borderRight: '1px solid var(--keel-border)',
          minHeight: 0,
        }}
      >
        <EditorPane document={document} viewRef={viewRef} />
        <div style={{ borderTop: '1px solid var(--keel-border)', maxHeight: 160, minHeight: 0 }}>
          <DiagnosticsList diagnostics={parsed.diagnostics} onGoTo={goTo} />
        </div>
      </div>

      <CanvasPane document={document} selection={selection} onSelect={setSelectedHit} />
    </main>
  );
}
