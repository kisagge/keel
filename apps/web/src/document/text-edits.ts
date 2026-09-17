import type { TextEdit } from '@keel/dsl';
import type * as Y from 'yjs';

/**
 * 구간 수정 목록을 `Y.Text` 에 얹는다.
 *
 * `packages/dsl` 의 설계 전부가 이 함수 하나를 위해 있었다. 캔버스가 문서를
 * 통째로 다시 쓰면 사람이 쓴 주석과 줄 순서가 사라지고, CRDT 에서는 같은 순간
 * 남이 친 글자가 **병합이 아니라 소멸**이 된다. 그래서 그 자리만 고친다.
 *
 * ## 먼저 전부 검사하고, 그다음에 얹는다
 *
 * `dsl` 의 `applyEdits` 는 문자열 사본에 얹으므로 중간에 던져도 남는 것이 없다.
 * 여기는 **여럿이 함께 보는 문서**를 직접 고친다. 반쯤 고치다 던지면 남의 화면에
 * 깨진 문서가 남고, 그것이 그대로 다른 사람에게 퍼진다.
 *
 * ## 뒤에서부터 얹는다
 *
 * 내림차순으로 가면 앞쪽 오프셋이 그대로 맞는다. 앞에서부터 가면 수정 하나마다
 * 뒤쪽 자리를 전부 다시 세어야 한다.
 *
 * ## 한 트랜잭션으로 묶는다
 *
 * `Y.Text` 의 `delete`·`insert` 는 하나하나가 제 트랜잭션을 연다. 안 묶으면
 * 수정 두 개가 갱신 **네 번**으로 날아가고(직접 재 봤다), 실시간 판에서 남의
 * 화면은 반쯤 고쳐진 문서를 실제로 본다 — 이 함수가 막겠다고 적어 둔 바로
 * 그것이 예외가 날 때만이 아니라 평소에도 새는 셈이다.
 *
 * 부르는 쪽이 이미 트랜잭션 안이면(`commands.ts` 가 그렇다) 중첩이 되는데,
 * Yjs 는 그것을 바깥 것에 합치고 **바깥 origin 을 지킨다.** 확인했다 —
 * 그래서 되돌리기가 보는 origin 이 안 바뀐다.
 */
export function applyTextEdits(ytext: Y.Text, edits: readonly TextEdit[]): void {
  if (edits.length === 0) return;

  const sorted = [...edits].sort((a, b) => b.from - a.from || b.to - a.to);

  // 검사는 트랜잭션 **밖**에서 한다 — 던지면 트랜잭션을 아예 열지 않는다
  let previousFrom = Number.POSITIVE_INFINITY;
  for (const edit of sorted) {
    if (edit.to > previousFrom) {
      throw new Error(`겹치는 수정: [${edit.from}, ${edit.to}) 가 ${previousFrom} 뒤를 침범한다`);
    }
    previousFrom = edit.from;
  }

  const apply = (): void => {
    for (const edit of sorted) {
      if (edit.to > edit.from) ytext.delete(edit.from, edit.to - edit.from);
      if (edit.insert.length > 0) ytext.insert(edit.from, edit.insert);
    }
  };

  const doc = ytext.doc;
  if (doc === null) {
    // 문서에 안 붙은 Y.Text. 묶을 트랜잭션이 없으니 그냥 얹는다
    apply();
    return;
  }
  doc.transact(apply);
}
