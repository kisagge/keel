import * as Y from 'yjs';

/**
 * 저장된 것에서 문서를 다시 세운다.
 *
 * **한 트랜잭션으로 묶는다.** 나눠 얹으면 `doc.on('update')` 가 재생 도중에
 * 여러 번 울려, 영속화 갈고리가 **방금 읽은 것을 도로 쓴다.** 로그가 복원할
 * 때마다 두 배로 불어난다.
 *
 * 스냅샷과 꼬리를 나눠 받는 이유는 호출하는 쪽이 DB 를 두 번 읽기 때문이다.
 * 여기서는 순서만 지킨다 — 스냅샷 먼저, 그다음 꼬리.
 */
export function restoreInto(
  doc: Y.Doc,
  snapshot: Uint8Array | undefined,
  tail: readonly Uint8Array[],
): void {
  doc.transact(() => {
    if (snapshot !== undefined) Y.applyUpdate(doc, snapshot);
    for (const update of tail) Y.applyUpdate(doc, update);
  }, RESTORE);
}

/** 복원이 낸 변화의 origin. 영속화 갈고리가 이것을 보고 도로 쓰지 않는다 */
export const RESTORE = Symbol('keel-restore');
