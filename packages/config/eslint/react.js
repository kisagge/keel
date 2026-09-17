import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';
import { baseConfig } from './base.js';

/**
 * 화면이 있는 패키지용.
 *
 * 두 묶음이 핵심이고 둘 다 **타입으로는 절대 못 잡는 것**이다.
 * react-hooks 는 의존성 배열 누락과 조건부 훅 호출을, jsx-a11y 는 라벨 없는
 * 입력이나 대체 텍스트 없는 이미지를 잡는다.
 *
 * 다만 이 프로젝트의 본체는 `<canvas>` 라 **jsx-a11y 가 볼 수 있는 것이 거의
 * 없다.** 캔버스 접근성은 린터가 아니라 `a11y` E2E 와 대체 표현 테스트가
 * 지킨다. 린터를 통과했다고 접근성이 지켜진 것이 아니라는 뜻이다.
 */
export const reactConfig = [
  ...baseConfig,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,

      /** 자동 포커스는 화면을 읽고 있던 사람의 위치를 빼앗는다 */
      'jsx-a11y/no-autofocus': 'error',

      /**
       * 보이는 라벨과 접근 이름이 어긋나면, 음성으로 조작하는 사람이
       * "보이는 대로" 말했을 때 그 버튼이 눌리지 않는다.
       */
      'jsx-a11y/label-has-associated-control': ['error', { assert: 'either' }],
    },
  },
];
