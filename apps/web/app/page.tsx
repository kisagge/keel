'use client';

import type { EditorView } from '@codemirror/view';
import type { Hit } from '@keel/renderer';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { YSyncConfig } from 'y-codemirror.next';
import { CanvasPane } from '../src/components/canvas-pane.js';
import { DiagnosticsList } from '../src/components/diagnostics.js';
import { EditorPane } from '../src/components/editor-pane.js';
import { Inspector } from '../src/components/inspector.js';
import type { InspectorTarget } from '../src/components/inspector.js';
import { Split } from '../src/components/split.js';
import { removeNode } from '../src/document/commands.js';
import { parseSource } from '../src/document/derive.js';
import { createKeelDocument } from '../src/document/keel-document.js';
import { SEED } from '../src/document/seed.js';
import { useKeelDocument } from '../src/hooks/use-keel-document.js';

/**
 * 고른 것의 id.
 *
 * 노드·그룹 id 와 엣지 key 를 한 자루에 담아도 안전하다 — 파서가
 * `duplicate-id` 를 잡아 노드와 그룹 id 가 안 겹치고, 엣지 key 에는 빈칸이
 * 들어 있어(`"a b 0"`) id 와 절대 같아지지 않는다.
 */
function idOf(hit: Hit | undefined): string | undefined {
  if (hit === undefined) return undefined;
  if (hit.kind === 'node') return hit.node.id;
  if (hit.kind === 'edge') return hit.edge.key;
  return hit.group.id;
}

export default function EditorPage() {
  /**
   * `YSyncConfig` 를 함께 넘긴다. CodeMirror 의 로컬 편집은 그 클래스의
   * 인스턴스를 origin 으로 쓰고, Yjs 는 origin 을 생성자로도 견주므로 클래스만
   * 넣어 두면 인스턴스를 손에 안 쥐어도 걸린다.
   *
   * **다만 지금은 이것이 없어도 돈다.** `y-codemirror.next` 0.3.6 의
   * `yUndoManager` 플러그인이 붙을 때 제가 쓰는 인스턴스를
   * `undoManager.addTrackedOrigin(...)` 으로 직접 등록한다
   * (`src/y-undomanager.js:98`). 빼 보고 확인했다 — 타자 되돌리기는 그대로 된다.
   *
   * 그래도 두는 이유는 그 등록이 **저 라이브러리의 사정**이기 때문이다. 판이
   * 바뀌거나 플러그인이 붙기 전에 생긴 편집이 있으면 기댈 곳이 없어진다.
   * 생성자 매칭 자체는 `keel-document` 의 검사가 따로 묶고 있다.
   */
  const keelDocument = useMemo(() => createKeelDocument(SEED, [YSyncConfig]), []);
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

  /**
   * **여기서 한 번만 파싱한다.** 나온 그래프를 캔버스에 그대로 넘긴다.
   *
   * 예전에는 이 줄이 그래프를 세워 놓고 버리고, `CanvasPane` 이 같은 글자를
   * 다시 파싱해 그래프를 또 세웠다 — 글자 하나 칠 때마다 파싱 두 번에 그래프
   * 두 번, 그중 하나는 만들자마자 버리는 것이었다. (편집기 안의 린터가 제
   * 상태를 보고 한 번 더 파싱하는 것은 어쩔 수 없다. 그쪽 주석에 적어 두었다.)
   */
  const source = useKeelDocument(keelDocument);
  const { document: parsed, graph } = useMemo(() => parseSource(source), [source]);

  const viewRef = useRef<EditorView | null>(null);
  const goTo = useCallback((position: number) => {
    const view = viewRef.current;
    if (view === null) return;
    view.dispatch({ selection: { anchor: position }, scrollIntoView: true });
    view.focus();
  }, []);

  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const onSelect = useCallback((hit: Hit | undefined) => setSelectedId(idOf(hit)), []);
  const clearSelection = useCallback(() => setSelectedId(undefined), []);

  const selection = useMemo(
    () => new Set<string>(selectedId === undefined ? [] : [selectedId]),
    [selectedId],
  );

  // 고른 것을 **매번 최신 문서에서 다시 찾는다.** 들고 있으면 곧 낡은 값이 된다
  const target = useMemo((): InspectorTarget | undefined => {
    if (selectedId === undefined) return undefined;

    const node = parsed.nodes.find((n) => n.id === selectedId);
    if (node !== undefined) {
      return {
        kind: 'node',
        id: node.id,
        nodeKind: node.kind,
        rawLabel: node.label,
        position: node.span.start,
      };
    }

    const edge = parsed.edges.find((e) => e.key === selectedId);
    if (edge !== undefined) {
      return {
        kind: 'edge',
        id: edge.key,
        caption: `${edge.from} → ${edge.to}`,
        position: edge.span.start,
      };
    }

    const group = parsed.groups.find((g) => g.id === selectedId);
    if (group !== undefined) {
      return {
        kind: 'group',
        id: group.id,
        caption: `그룹 ${group.label ?? group.id}`,
        position: group.headerSpan.start,
      };
    }

    return undefined;
  }, [parsed, selectedId]);

  /**
   * 캔버스 쪽의 글쇠 — `Delete` 로 지우고, `Esc` 로 선택을 풀고, `Cmd+Z` 로 되돌린다.
   *
   * **편집기 안에서 친 것은 건드리지 않는다.** 글자를 지우려고 누른 Delete 가
   * 노드를 지워 버리면 되돌릴 수 있어도 무섭다. 되돌리기도 마찬가지다 — 편집기
   * 안에서는 CodeMirror 의 `yUndoManagerKeymap` 이 같은 역사를 이미 부르므로,
   * 여기서 또 부르면 한 번 눌러 두 걸음이 되돌아간다.
   *
   * **되돌리기를 여기에도 둬야 하는 이유는 재서 알았다.** 노드를 끌고 나면
   * 초점이 `<body>` 에 있고, 그 역사를 부르는 글쇠는 편집기 안에만 있었다.
   * 그래서 `Cmd+Z` 가 아무 일도 안 했다 — 텍스트 창을 먼저 눌러야만 돌아갔다.
   * 문서와 자리를 `UndoManager` 하나로 묶은 값이 통째로 새고 있던 자리다.
   */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const inEditor = e.target instanceof HTMLElement && e.target.closest('.cm-editor') !== null;
      const inField =
        e.target instanceof HTMLElement &&
        ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName);
      if (inEditor || inField) return;

      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) keelDocument.undoManager.redo();
        else keelDocument.undoManager.undo();
        return;
      }
      // 윈도우·리눅스의 다시 하기. CodeMirror 쪽 키맵도 이것을 받는다
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        keelDocument.undoManager.redo();
        return;
      }

      if (e.key === 'Escape') {
        clearSelection();
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && target?.kind === 'node') {
        e.preventDefault();
        removeNode(keelDocument, target.id);
        clearSelection();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [clearSelection, keelDocument, target]);

  return (
    <Split
      left={
        <div
          style={{
            height: '100%',
            display: 'grid',
            gridTemplateRows: '1fr auto',
            minHeight: 0,
          }}
        >
          <EditorPane document={keelDocument} viewRef={viewRef} />
          <div style={{ borderTop: '1px solid var(--keel-border)', maxHeight: 160, minHeight: 0 }}>
            <DiagnosticsList diagnostics={parsed.diagnostics} onGoTo={goTo} />
          </div>
        </div>
      }
      right={
        <>
          <CanvasPane
            document={keelDocument}
            graph={graph}
            selection={selection}
            onSelect={onSelect}
          />
          <Inspector
            target={target}
            document={keelDocument}
            onGoTo={goTo}
            onCleared={clearSelection}
          />
        </>
      }
    />
  );
}
