'use client';

import type { Hit } from '@keel/renderer';
import { useCallback, useMemo, useState } from 'react';
import { CanvasPane } from '../src/components/canvas-pane.js';
import { createKeelDocument } from '../src/document/keel-document.js';
import { SEED } from '../src/document/seed.js';

/** 고른 것의 id. 노드·그룹 id 와 엣지 key 를 한 자루에 담아도 안전하다 —
 *  파서가 duplicate-id 를 잡아 둘이 안 겹치고, 엣지 key 에는 빈칸이 들어 있다 */
function idOf(hit: Hit | undefined): string | undefined {
  if (hit === undefined) return undefined;
  if (hit.kind === 'node') return hit.node.id;
  if (hit.kind === 'edge') return hit.edge.key;
  return hit.group.id;
}

export default function EditorPage() {
  const document = useMemo(() => createKeelDocument(SEED), []);
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

  const [selectedHit, setSelectedHit] = useState<Hit | undefined>(undefined);
  const selection = useMemo(() => {
    const id = idOf(selectedHit);
    return new Set<string>(id === undefined ? [] : [id]);
  }, [selectedHit]);

  const onSelect = useCallback((hit: Hit | undefined) => setSelectedHit(hit), []);

  return (
    <main style={{ height: '100%' }}>
      <CanvasPane document={document} selection={selection} onSelect={onSelect} />
    </main>
  );
}
