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
 *
 * 아래쪽의 `getRatio`/`getServerRatio`/`subscribeRatio`/`setRatio` 는
 * `useSyncExternalStore` 용 저장소다. `localStorage` 는 React 밖의 상태이므로
 * 정식 통로가 이것이다 — `use-keel-document.ts` 가 `Y.Text` 를 잇는 것과 같은
 * 이유다. `useEffect` + `useState` 로 흉내 내면(`setState` 를 이펙트 몸통에서
 * 곧바로 부르는 꼴이라 `react-hooks/set-state-in-effect` 가 맞게 잡는다)
 * 브라우저가 기본값을 한 번 **그려서 화면에 낸 뒤에야** 저장된 값으로
 * 고친다 — 그 사이 한 틀이 보인다.
 *
 * `useSyncExternalStore` 는 다르다. 하이드레이션 렌더는 서버와 맞추려고
 * `getServerRatio`(기본값)를 쓰지만, 커밋 직후 `getRatio`(저장된 값)와
 * 다르면 **페인트 전에** 동기적으로 다시 그린다. 그래서 저장된 값이 다르면
 * 화면에는 처음부터 그 값만 보인다.
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

/**
 * `useSyncExternalStore` 가 쓰는 진짜 저장소. 모듈 스코프에 값 하나를 둔다.
 *
 * 끌고 있는 값은 아직 `localStorage` 에 적지 않은 값이다(놓아야
 * `saveRatio` 로 적힌다) — 그래도 `getRatio` 는 이 값을 돌려줘야 손잡이가
 * 끄는 대로 따라온다. `localStorage` 를 매번 다시 읽으면 그 값을 잃어버리고,
 * `getSnapshot` 이 호출마다 다른 참조를 돌려주는 꼴이 되어
 * `useSyncExternalStore` 가 매 렌더 다시 구독하려 든다.
 */
let current: number | undefined;
const listeners = new Set<() => void>();

/** 서버에는 `localStorage` 가 없다. 하이드레이션 렌더도 이 값을 그대로 쓴다 */
export function getServerRatio(): number {
  return DEFAULT_RATIO;
}

/** 처음 한 번만 `localStorage` 를 읽는다. 그 뒤로는 `setRatio` 가 고친 값을 돌려준다 */
export function getRatio(): number {
  current ??= loadRatio();
  return current;
}

export function subscribeRatio(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/**
 * `clampRatio` 를 거쳐 값을 바꾸고 구독자에게 알린다. **저장하지 않는다** —
 * 끌고 있는 자리가 아직 문서가 아닌 것과 같은 이유로, 놓거나(`onPointerUp`)
 * 초점을 잃을 때(`onBlur`)만 `saveRatio` 가 실제로 적는다.
 */
export function setRatio(next: number): void {
  const clamped = clampRatio(next);
  if (clamped === current) return;
  current = clamped;
  for (const listener of listeners) listener();
}
