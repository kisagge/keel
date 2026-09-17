/**
 * 분할 비율을 다루는 순수한 부분.
 *
 * 컴포넌트에서 떼어 둔 이유는 이 저장소의 방식 그대로다 — **검사할 값어치가
 * 있는 것은 순수 모듈로 내린다.** 물리기와 저장은 틀리기 쉬운데(사생활 보호
 * 창에서는 `localStorage` 를 읽는 것만으로 던진다) 컴포넌트 안에 있으면
 * jsdom 없이 검사할 방법이 없다.
 *
 * 비율은 `localStorage` 에 둔다. **문서가 아니라 보는 사람의 편의**이므로
 * `Y.Doc` 에 넣지 않는다 — 넣으면 내가 창을 넓힌 것이 남의 화면을 밀어 버린다.
 */

const KEY = 'keel:split';

export const MIN_RATIO = 0.2;
export const MAX_RATIO = 0.8;
export const DEFAULT_RATIO = 0.4;

/** 한쪽이 0 이 되면 되돌릴 손잡이가 화면에서 사라진다. 그래서 양쪽을 물린다 */
export function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return value > 0 ? MAX_RATIO : MIN_RATIO;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, value));
}

/** 못 읽으면 조용히 기본값으로 간다. 문서가 아니라 편의를 위한 값이다 */
export function loadRatio(): number {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return DEFAULT_RATIO;
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? clampRatio(value) : DEFAULT_RATIO;
  } catch {
    return DEFAULT_RATIO;
  }
}

export function saveRatio(ratio: number): void {
  try {
    localStorage.setItem(KEY, String(clampRatio(ratio)));
  } catch {
    // 못 적으면 그만이다
  }
}
