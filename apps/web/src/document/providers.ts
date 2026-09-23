import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';
import type * as Y from 'yjs';

export interface Providers {
  readonly remote: WebsocketProvider;
  /** 저장소를 못 쓰면 `undefined`. 그때도 에디터는 열린다 */
  readonly local: IndexeddbPersistence | undefined;
  destroy(): void;
}

const WS_URL = process.env['NEXT_PUBLIC_KEEL_WS_URL'] ?? 'ws://localhost:4000';

/**
 * 같은 문서에 둘을 함께 붙인다.
 *
 * `local` 이 있어서 **연결이 끊긴 채 고쳐도 잃지 않는다.** 문제의 성격이
 * "작업물이 사라진다"(유실)에서 "아직 남들에게 안 보인다"(가시성 지연)로
 * 내려가고, 뒤쪽은 표시하면 되는 종류다.
 *
 * 로컬 저장은 **브라우저·출처마다 따로다.** 노트북에서 오프라인으로 고친
 * 것은 그 노트북이 다시 붙기 전까지 휴대폰에 안 보인다.
 */
export function connectProviders(documentId: string, doc: Y.Doc): Providers {
  let local: IndexeddbPersistence | undefined;
  try {
    local = new IndexeddbPersistence(documentId, doc);
  } catch {
    // 프라이빗 창이나 할당량 초과. 에디터가 안 열리는 것이 제일 나쁜 결과라
    // 조용히 로컬 저장 없이 돈다. 경고 문구는 연결 상태 쪽이 강하게 낸다
    local = undefined;
  }

  const remote = new WebsocketProvider(WS_URL, documentId, doc);

  return {
    remote,
    local,
    destroy() {
      remote.destroy();
      // `IndexeddbPersistence.destroy()` 는 약속을 돌려준다(진행 중이던 쓰기를
      // 마저 끝낸다). 화면이 닫히는 마당에 그 약속을 잡아 둘 곳이 없어 흘려
      // 보낸다 — 실패해도 다음에 열 때 IndexedDB 가 다시 처음부터 채워진다.
      // 다만 거부를 잡아는 둬야 한다 — `local-sync.ts` 가 다루는 바로 그
      // "비동기 open 이 조용히 실패하는" 경우 `destroy()` 도 거부할 수 있어서,
      // 안 잡으면 처리되지 않은 거부가 된다
      local?.destroy().catch(() => {});
    },
  };
}
