'use client';

import { useEffect } from 'react';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';

/**
 * 서버에 **정말로 없는** 문서. 브라우저에 남은 사본을 지운다.
 *
 * 안 지우면 유령이 된다 — 멀쩡해 보이는 문서를 한참 고치는데 ws 는 404 로
 * 계속 거부당하고 그 작업은 영영 저장되지 않는다. 끊긴 채 편집하는 것보다
 * 나쁘다. 저쪽은 언젠가 붙지만 이쪽은 영영 안 붙는다.
 *
 * **`503` 에는 여기 오지 않는다.** 서버가 잠깐 아픈 사이에 사람의 오프라인
 * 작업을 우리가 없애면 안 된다.
 */
export function MissingDocument({ documentId }: { readonly documentId: string }) {
  useEffect(() => {
    const doc = new Y.Doc();
    let store: IndexeddbPersistence | undefined;
    try {
      store = new IndexeddbPersistence(documentId, doc);
      void store.clearData();
    } catch {
      // 저장소를 못 쓰면 지울 것도 없다
    }
    return () => {
      // `clearData()` 가 이미 지우는 길에서 `destroy()` 를 부른다. 여기서는
      // 화면이 닫히는 마당에 그 약속을 잡아 둘 곳이 없어 흘려 보낸다 —
      // `providers.ts` 의 `destroy()` 와 같은 이유다
      void store?.destroy();
      doc.destroy();
    };
  }, [documentId]);

  return (
    <main
      data-testid="missing-document"
      style={{ display: 'grid', placeItems: 'center', height: '100dvh', padding: 24 }}
    >
      <p style={{ color: 'var(--keel-muted)', textAlign: 'center' }}>
        그런 문서가 없다.
        <br />
        주소를 다시 확인한다.
      </p>
    </main>
  );
}
