import { describe, expect, it } from 'vitest';
import {
  approximateMeasureText,
  fontString,
  memoizeMeasure,
  truncateToWidth,
} from '../src/measure.js';
import type { TextStyle } from '../src/measure.js';
import { DEFAULT_THEME } from '../src/theme.js';

const style: TextStyle = {
  fontSize: 14,
  fontFamily: DEFAULT_THEME.node.fontFamily,
  fontWeight: 'normal',
};

describe('어림 재기', () => {
  it('같은 것을 넣으면 늘 같은 값이 나온다', () => {
    const once = approximateMeasureText('주문 API', style);
    for (let i = 0; i < 10; i += 1) {
      expect(approximateMeasureText('주문 API', style)).toBe(once);
    }
  });

  it('글자가 길어지면 넓어진다', () => {
    let previous = 0;
    for (const text of ['a', 'ab', 'abc', 'abcd', 'abcde']) {
      const width = approximateMeasureText(text, style);
      expect(width).toBeGreaterThan(previous);
      previous = width;
    }
  });

  it('빈 글자는 0 이고 아닌 것은 0 보다 크다', () => {
    expect(approximateMeasureText('', style)).toBe(0);
    expect(approximateMeasureText('a', style)).toBeGreaterThan(0);
    expect(approximateMeasureText(' ', style)).toBeGreaterThan(0);
  });

  /** 모아쓰기는 라틴 소문자보다 눈에 띄게 넓다. 같게 보면 한글 라벨이 삐져나온다 */
  it('한글이 같은 수의 라틴 소문자보다 넓다', () => {
    expect(approximateMeasureText('가나다라', style)).toBeGreaterThan(
      approximateMeasureText('abcd', style),
    );
  });

  it('글자 묶음마다 폭이 다르다', () => {
    expect(approximateMeasureText('MMMM', style)).toBeGreaterThan(
      approximateMeasureText('llll', style),
    );
  });

  /** text.length 로 돌면 이모지 한 글자가 두 칸으로 세어져 상자가 부푼다 */
  it('이모지는 UTF-16 두 칸이어도 한 글자로 센다', () => {
    expect(approximateMeasureText('🚀', style)).toBe(approximateMeasureText('가', style));
  });

  it('굵은 글씨가 더 넓다', () => {
    expect(approximateMeasureText('abcdef', { ...style, fontWeight: 'bold' })).toBeGreaterThan(
      approximateMeasureText('abcdef', style),
    );
  });

  it('글자 크기에 비례한다', () => {
    const small = approximateMeasureText('hello', { ...style, fontSize: 10 });
    const big = approximateMeasureText('hello', { ...style, fontSize: 20 });
    expect(big).toBeCloseTo(small * 2);
  });
});

describe('기억해 두기', () => {
  it('감싸도 값이 같다', () => {
    const memoized = memoizeMeasure(approximateMeasureText);
    for (const text of ['', 'a', '주문 API', '🚀 배포']) {
      expect(memoized(text, style)).toBe(approximateMeasureText(text, style));
    }
  });

  it('두 번째부터는 안 재고 꺼내 쓴다', () => {
    let calls = 0;
    const memoized = memoizeMeasure((text, s) => {
      calls += 1;
      return approximateMeasureText(text, s);
    });

    memoized('api', style);
    memoized('api', style);
    memoized('api', style);
    expect(calls).toBe(1);
  });

  it('글꼴이 다르면 따로 센다', () => {
    let calls = 0;
    const memoized = memoizeMeasure((text, s) => {
      calls += 1;
      return approximateMeasureText(text, s);
    });

    memoized('api', style);
    memoized('api', { ...style, fontWeight: 'bold' });
    memoized('api', { ...style, fontSize: 20 });
    expect(calls).toBe(3);
  });

  it('한도를 넘으면 버리고 다시 채운다 — 값은 그대로다', () => {
    const memoized = memoizeMeasure(approximateMeasureText, 4);
    for (let i = 0; i < 40; i += 1) memoized(`n${i}`, style);
    expect(memoized('n3', style)).toBe(approximateMeasureText('n3', style));
  });
});

describe('줄임표로 자르기', () => {
  it('들어가면 그대로 둔다', () => {
    expect(truncateToWidth('api', 1000, style, approximateMeasureText)).toBe('api');
  });

  it('자른 결과가 상자를 넘지 않는다', () => {
    for (const maxWidth of [20, 40, 80, 160]) {
      const out = truncateToWidth(
        '아주 긴 서비스 이름을 가진 노드입니다',
        maxWidth,
        style,
        approximateMeasureText,
      );
      expect(approximateMeasureText(out, style)).toBeLessThanOrEqual(maxWidth);
    }
  });

  it('자른 것은 앞부분 + 줄임표다', () => {
    const source = 'abcdefghijklmnop';
    const out = truncateToWidth(source, 40, style, approximateMeasureText);
    expect(out.endsWith('…')).toBe(true);
    expect(source.startsWith(out.slice(0, -1))).toBe(true);
  });

  /** 빈 글자를 돌려주면 노드가 화면에서 이름을 잃는다 */
  it('줄임표조차 안 들어가도 빈 글자를 내놓지 않는다', () => {
    expect(truncateToWidth('가나다라', 1, style, approximateMeasureText)).toBe('가');
  });

  it('코드 포인트 가운데를 자르지 않는다', () => {
    const out = truncateToWidth('🚀🚀🚀🚀🚀🚀', 30, style, approximateMeasureText);
    expect([...out].every((ch) => ch === '🚀' || ch === '…')).toBe(true);
  });
});

describe('글꼴 문자열', () => {
  it('재는 쪽과 그리는 쪽이 같은 것을 쓰도록 한 곳에서 만든다', () => {
    expect(fontString({ fontSize: 14, fontFamily: 'Inter, sans-serif', fontWeight: 'bold' })).toBe(
      'bold 14px Inter, sans-serif',
    );
  });
});

describe('기본 테마', () => {
  /** DSL 에 종류가 늘면 여기서 컴파일이 깨지는 것이 핵심이다. 값도 비어 있지 않아야 한다 */
  it('노드 종류마다 색이 있다', () => {
    for (const color of Object.values(DEFAULT_THEME.colors.kind)) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('그룹 여백은 깊어져도 최솟값 아래로 안 내려간다', () => {
    const { padding, paddingPerDepth, minPadding } = DEFAULT_THEME.group;
    for (let depth = 0; depth < 20; depth += 1) {
      expect(Math.max(minPadding, padding - paddingPerDepth * depth)).toBeGreaterThanOrEqual(
        minPadding,
      );
    }
  });
});
