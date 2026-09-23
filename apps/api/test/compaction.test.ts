import { describe, expect, it } from 'vitest';
import { FOLD_THRESHOLD, foldPlan } from '../src/realtime/compaction.js';

/** seq 1n..n */
function seqs(n: number): bigint[] {
  return Array.from({ length: n }, (_, i) => BigInt(i + 1));
}

describe('foldPlan', () => {
  it('임계치와 같으면 접지 않는다', () => {
    expect(foldPlan(seqs(200), 200).shouldFold).toBe(false);
  });

  it('임계치를 넘으면 접는다', () => {
    expect(foldPlan(seqs(201), 200).shouldFold).toBe(true);
  });

  it('꼬리가 비면 접지 않는다', () => {
    expect(foldPlan([], 200).shouldFold).toBe(false);
  });

  it('관측한 마지막 seq 까지만 접는다', () => {
    // throughSeq 를 관측한 것보다 크게 잡으면, 스냅샷에 안 들어간 행을
    // 지우게 되어 문서가 사라진다. 절대 넘겨 잡지 않는다.
    const plan = foldPlan([10n, 11n, 12n], 2);
    expect(plan.throughSeq).toBe(12n);
  });

  it('seq 가 연속이 아니어도 마지막 것을 쓴다', () => {
    // 접기와 접기 사이에 다른 문서의 행이 끼면 seq 에 구멍이 난다.
    // seq 는 전역 시퀀스라 문서마다 연속이 아니다.
    const plan = foldPlan([5n, 9n, 40n], 2);
    expect(plan.throughSeq).toBe(40n);
  });

  it('기본 임계치는 200 이다', () => {
    expect(FOLD_THRESHOLD).toBe(200);
    expect(foldPlan(seqs(201)).shouldFold).toBe(true);
    expect(foldPlan(seqs(200)).shouldFold).toBe(false);
  });
});
