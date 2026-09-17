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
