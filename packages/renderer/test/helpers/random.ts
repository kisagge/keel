/**
 * 씨앗을 받는 난수. 성질 검사를 많이 돌리되 **실패가 재현되게** 하려고 둔다.
 * `Math.random` 을 쓰면 가끔 지는 검사가 되어 아무도 안 믿게 된다.
 */
export function makeRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    // xorshift32
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

export function randomBetween(random: () => number, min: number, max: number): number {
  return min + random() * (max - min);
}
