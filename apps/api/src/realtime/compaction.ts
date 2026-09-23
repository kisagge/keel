/**
 * 로그가 이만큼 쌓이면 접는다. 재 보지 않고 고른 수다 —
 * 실제 편집 패턴에서 접기 비용과 복원 비용을 재서 고칠 자리다.
 */
export const FOLD_THRESHOLD = 200;

export interface FoldPlan {
  readonly shouldFold: boolean;
  /** 이 seq 까지를 스냅샷에 담았다고 적는다. 접지 않으면 뜻이 없다 */
  readonly throughSeq: bigint;
}

/**
 * 접을지, 어디까지 접을지 정한다.
 *
 * **`throughSeq` 를 넘겨 잡지 않는 것이 이 함수의 전부다.** 스냅샷은 지금
 * 메모리에 있는 문서에서 뜨는데, 그 사이에도 업데이트가 계속 들어온다.
 * 관측한 꼬리보다 큰 seq 를 적으면 **스냅샷에 안 들어간 행을 지우게 되어
 * 문서가 사라진다.** 작게 잡는 쪽은 안전하다 — 이미 담긴 것을 한 번 더
 * 재생할 뿐이고 Yjs 업데이트는 멱등이다.
 */
export function foldPlan(
  tailSeqs: readonly bigint[],
  threshold: number = FOLD_THRESHOLD,
): FoldPlan {
  if (tailSeqs.length <= threshold) return { shouldFold: false, throughSeq: 0n };
  return { shouldFold: true, throughSeq: tailSeqs[tailSeqs.length - 1]! };
}
