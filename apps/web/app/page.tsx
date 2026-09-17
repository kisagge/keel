'use client';

import type { EditorView } from '@codemirror/view';
import type { Hit } from '@keel/renderer';
import { useCallback, useMemo, useRef, useState } from 'react';
import { YSyncConfig } from 'y-codemirror.next';
import { CanvasPane } from '../src/components/canvas-pane.js';
import { DiagnosticsList } from '../src/components/diagnostics.js';
import { EditorPane } from '../src/components/editor-pane.js';
import { Inspector } from '../src/components/inspector.js';
import type { InspectorTarget } from '../src/components/inspector.js';
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

  const source = useKeelDocument(keelDocument);
  const { document: parsed } = useMemo(() => parseSource(source), [source]);

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
        caption: undefined,
        position: node.span.start,
      };
    }

    const edge = parsed.edges.find((e) => e.key === selectedId);
    if (edge !== undefined) {
      return {
        kind: 'edge',
        id: edge.key,
        nodeKind: undefined,
        rawLabel: undefined,
        caption: `${edge.from} → ${edge.to}`,
        position: edge.span.start,
      };
    }

    const group = parsed.groups.find((g) => g.id === selectedId);
    if (group !== undefined) {
      return {
        kind: 'group',
        id: group.id,
        nodeKind: undefined,
        rawLabel: undefined,
        caption: `그룹 ${group.label ?? group.id}`,
        position: group.headerSpan.start,
      };
    }

    return undefined;
  }, [parsed, selectedId]);

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
        <EditorPane document={keelDocument} viewRef={viewRef} />
        <div style={{ borderTop: '1px solid var(--keel-border)', maxHeight: 160, minHeight: 0 }}>
          <DiagnosticsList diagnostics={parsed.diagnostics} onGoTo={goTo} />
        </div>
      </div>

      <div style={{ position: 'relative', minWidth: 0 }}>
        <CanvasPane document={keelDocument} selection={selection} onSelect={onSelect} />
        <Inspector
          target={target}
          document={keelDocument}
          onGoTo={goTo}
          onCleared={clearSelection}
        />
      </div>
    </main>
  );
}
