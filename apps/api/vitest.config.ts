import { config as loadEnv } from 'dotenv';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// vitest 는 .env 를 알아서 읽지 않는다 — CLI 로 바로 돌리면(`vitest run --dir
// test-db`) DATABASE_URL 이 없어 PrismaClient 가 연결에서 죽는다. 여기서 직접
// 읽어 둔다. 설정 파일이 워커를 띄우기 전에 한 번 평가되므로, 여기서 채운
// process.env 는 워커에도 그대로 상속된다. CI 는 .env 파일이 없고 워크플로가
// DATABASE_URL 을 이미 process.env 에 넣어 두므로, 여기서는 덮어쓰지 않는다
// (dotenv 기본값 — 이미 있는 값은 안 건드린다).
loadEnv();

export default defineConfig({
  // 단위 검사는 test/ 에, DB 가 필요한 검사는 test-db/ 에 둔다.
  // 갈라 두지 않으면 `pnpm test` 가 도커 없이는 못 도는 물건이 된다.
  //
  // `--dir` 이 주어지면 vitest 는 include 패턴을 root 가 아니라 **그 dir 기준**
  // 으로 다시 앵커링한다. `test/**` 처럼 디렉터리 이름을 박아 두면 `--dir
  // test-db` 로 돌 때는 `test-db/test/**` 를 찾게 되어 아무것도 못 찾는다.
  // 그래서 include 는 디렉터리 이름 없이 두고, `test`·`test:db` 스크립트가
  // 각자 `--dir` 로 범위를 가른다(package.json 참고). 아직 test/ 에는 파일이
  // 없으므로 passWithNoTests 없이는 `pnpm test` 가 검사 없이도 실패한다.
  test: { include: ['**/*.test.ts'], passWithNoTests: true },

  // vitest 는 esbuild 로 트랜스파일하는데, esbuild 는 데코레이터 메타데이터
  // (design:paramtypes) 를 안 찍는다. Nest 의 생성자 주입이 그 메타데이터로
  // 도는데, 이게 빠지면 애플리케이션을 부트스트랩하는 검사(test-db/ 를 포함해
  // `--dir` 로 어디를 겨냥해도)가 전부 DI 오류로 죽는다. tsconfig 의
  // experimentalDecorators·emitDecoratorMetadata 를 읽어 SWC 로 대신 찍는다.
  plugins: [swc.vite()],
});
