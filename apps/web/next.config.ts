import type { NextConfig } from 'next';

/**
 * 비어 있다.
 *
 * `@keel/*` 는 빌드 없이 생 `.ts` 를 내보내는데(`exports` 가 `./src/index.ts` 를
 * 가리킨다), Next 16 의 Turbopack 은 워크스페이스 소스를 그대로 읽으므로
 * `transpilePackages` 가 필요 없다. 넣어도 결과가 같은 것을 확인했다.
 *
 * 대신 걸리는 것은 **`tsconfig.json` 의 `moduleResolution`** 이다. 이 저장소의
 * 패키지들은 상대 경로를 `./cull.js` 처럼 적는데(ESM 관례), Turbopack 이 그것을
 * `cull.ts` 로 바꿔 찾으려면 `nodenext` 여야 한다. 공유 프리셋은 `bundler` 라
 * `apps/web/tsconfig.json` 에서만 덮어쓴다 — 거기 그 이유를 적어 두었다.
 */
const config: NextConfig = {};

export default config;
