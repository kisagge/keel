import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_RATIO,
  MIN_RATIO,
  clampRatio,
  loadRatio,
  saveRatio,
} from '../src/components/split-ratio.js';

/** localStorage 가 없는 곳(서버·사생활 보호 창)에서도 돌아야 한다 */
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  };
}

describe('비율 물리기', () => {
  it('너무 좁거나 넓으면 물린다', () => {
    expect(clampRatio(0.01)).toBe(MIN_RATIO);
    expect(clampRatio(0.99)).toBe(MAX_RATIO);
    expect(clampRatio(0.5)).toBe(0.5);
  });

  /** 한쪽이 0 이 되면 되돌릴 손잡이가 화면에서 사라진다 */
  it('말이 안 되는 값은 기본값으로 떨어진다', () => {
    expect(clampRatio(Number.NaN)).toBe(MIN_RATIO);
    expect(clampRatio(Number.POSITIVE_INFINITY)).toBe(MAX_RATIO);
  });
});

describe('비율 저장', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage());
  });

  it('적은 것을 다시 읽는다', () => {
    saveRatio(0.6);
    expect(loadRatio()).toBeCloseTo(0.6);
  });

  it('적은 적이 없으면 기본값이다', () => {
    expect(loadRatio()).toBe(0.4);
  });

  it('망가진 값이 들어 있어도 던지지 않는다', () => {
    localStorage.setItem('keel:split', '{{{');
    expect(loadRatio()).toBe(0.4);
  });

  /**
   * 사생활 보호 창에서는 `localStorage` 를 읽는 것만으로 던진다. 문서가 아니라
   * 보는 사람의 편의이므로, 못 쓰면 조용히 기본값으로 간다.
   */
  it('localStorage 가 던져도 화면이 안 죽는다', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('막혔다');
      },
      setItem: () => {
        throw new Error('막혔다');
      },
    });

    expect(loadRatio()).toBe(0.4);
    expect(() => saveRatio(0.7)).not.toThrow();
  });
});

/**
 * `getRatio`/`setRatio`/`subscribeRatio` 는 모듈 스코프에 값을 하나 두고
 * 산다 — 마운트를 오가도 값이 죽지 않아야 하는 저장소라서 그렇다. 검사끼리
 * 서로 새지 않게 하려고 테스트 전용 되돌리기 함수를 만드는 대신, 검사마다
 * `vi.resetModules()` 로 모듈째 다시 불러온다. 맨 위의 정적 import(`clampRatio`
 * 등)는 이 재불러오기와 무관하다 — 이미 실행된 인스턴스를 그대로 쓴다.
 */
describe('비율 저장소(store)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', fakeStorage());
  });

  it('getServerRatio 는 저장된 값이 있어도 늘 기본값이다', async () => {
    localStorage.setItem('keel:split', '0.7');
    const { DEFAULT_RATIO, getServerRatio } = await import('../src/components/split-ratio.js');
    expect(getServerRatio()).toBe(DEFAULT_RATIO);
  });

  it('getRatio 는 처음 한 번만 localStorage 를 읽는다', async () => {
    localStorage.setItem('keel:split', '0.6');
    const { getRatio } = await import('../src/components/split-ratio.js');
    expect(getRatio()).toBeCloseTo(0.6);

    // 저장된 값이 바뀌어도 이미 읽은 getRatio 는 다시 안 읽는다
    localStorage.setItem('keel:split', '0.2');
    expect(getRatio()).toBeCloseTo(0.6);
  });

  it('setRatio 는 물리고 구독자에게 알린다', async () => {
    const { MAX_RATIO: max, getRatio, setRatio, subscribeRatio } = await import(
      '../src/components/split-ratio.js'
    );
    const onChange = vi.fn();
    subscribeRatio(onChange);

    setRatio(0.9);

    expect(getRatio()).toBe(max);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('같은 값으로 다시 불러도 구독자를 다시 안 부른다', async () => {
    const { getRatio, setRatio, subscribeRatio } = await import(
      '../src/components/split-ratio.js'
    );
    setRatio(0.5);
    const onChange = vi.fn();
    subscribeRatio(onChange);

    setRatio(0.5);

    expect(onChange).not.toHaveBeenCalled();
    expect(getRatio()).toBe(0.5);
  });

  /** 끌고 있는 자리가 아직 문서가 아닌 것과 같다 — 놓아야(`saveRatio`) 적힌다 */
  it('setRatio 는 적지 않는다', async () => {
    const { setRatio } = await import('../src/components/split-ratio.js');
    setRatio(0.6);
    expect(localStorage.getItem('keel:split')).toBeNull();
  });

  it('구독을 끊으면 더는 안 불린다', async () => {
    const { setRatio, subscribeRatio } = await import('../src/components/split-ratio.js');
    const onChange = vi.fn();
    const unsubscribe = subscribeRatio(onChange);
    unsubscribe();

    setRatio(0.6);

    expect(onChange).not.toHaveBeenCalled();
  });
});
