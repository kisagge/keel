import { baseConfig } from './eslint/base.js';

/**
 * 이 패키지는 다른 패키지에 규칙을 나눠 주는 곳이다. 자기 자신을 검사할 때는
 * 프리셋 파일들이 어느 tsconfig 의 include 에도 없어 파싱에서 막힌다.
 * 그래서 여기서만 기본 프로젝트로 허용한다.
 */
export default [
  ...baseConfig,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.js', 'eslint/base.js', 'eslint/react.js'],
        },
      },
    },
  },
];
