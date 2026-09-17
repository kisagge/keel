import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/**
 * 공용 ESLint 설정.
 *
 * **TypeScript 가 이미 잡는 것은 다시 잡지 않는다.** 이 저장소는 strict 에
 * noUncheckedIndexedAccess·exactOptionalPropertyTypes 까지 켜 두었으므로
 * 타입으로 걸리는 규칙을 린터에 또 넣으면 같은 오류를 두 번 보게 될 뿐이다.
 *
 * 여기 남긴 것은 tsc 가 못 보는 것들이다 — 처리하지 않은 Promise,
 * 조건문에 들어간 Promise, 쓰지 않는 변수.
 */
export const baseConfig = tseslint.config(
  {
    ignores: ['**/dist/**', '**/.next/**', '**/generated/**', '**/node_modules/**', '**/*.mjs'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.js', 'vitest.config.ts', 'next.config.ts'],
        },
        tsconfigRootDir: process.cwd(),
      },
      globals: { ...globals.node },
    },
    rules: {
      /** 밑줄로 시작하는 인자는 "일부러 안 쓴다" 는 표시다 */
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],

      '@typescript-eslint/no-explicit-any': 'warn',

      /** 타입 단언은 필요한 자리마다 주석이 붙는다. 규칙보다 리뷰에서 볼 일이다 */
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',

      /**
       * JSX 속성에 async 함수를 바로 넘기는 것은 허용한다 — React 는 핸들러의
       * 반환값을 기다리지 않으므로 `() => void f()` 로 감싸도 처리되는 것이 없다.
       * **문장 자리의 no-floating-promises 는 그대로 둔다.**
       */
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],

      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true, allowNullish: true },
      ],
    },
  },

  {
    files: ['**/test/**/*.{ts,tsx}', '**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
);
