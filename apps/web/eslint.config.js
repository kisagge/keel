import { reactConfig } from '@keel/config/eslint/react';

export default [
  ...reactConfig,

  /**
   * `split.tsx` 의 손잡이는 WAI-ARIA APG 의 "창 분할선(Window Splitter)"
   * 패턴 그대로다 — role="separator" 에 tabIndex 와 화살표 키를 주는 것이
   * 표준이지 예외가 아니다. https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/
   *
   * jsx-a11y 는 `separator` 를 구조 역할로만 알아, 포커스 가능하고 조작되는
   * 쪽은 놓친다. 그래서 이 한 파일에서만 두 규칙에 그 사실을 알려 준다 — 끄는
   * 것이 아니라 이 손잡이 하나가 규칙이 못 보는 예외라고 적는 것이다.
   */
  {
    files: ['src/components/split.tsx'],
    rules: {
      'jsx-a11y/no-noninteractive-tabindex': ['error', { roles: ['separator'] }],
      'jsx-a11y/no-noninteractive-element-interactions': [
        'error',
        { div: ['onPointerDown', 'onPointerMove', 'onPointerUp', 'onKeyDown', 'onBlur'] },
      ],
    },
  },
];
