import { defineConfig, devices } from '@playwright/test';

/**
 * 화면을 직접 띄워서 본다.
 *
 * React 컴포넌트에 단위 검사가 없으므로(jsdom 을 안 들인다) **고리가 실제로
 * 도는 것**만 묶는다. 더 넣으면 느려지고 잘 깨지기만 한다 — 검사할 값어치가
 * 있는 것은 이미 `src/document/` 와 `src/interaction/` 에 있다.
 */
export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3000' },
  webServer: [
    {
      // api 에는 `url` 대신 `port` 를 쓴다. `url` 은 2xx 응답을 기다리는데,
      // 이 서버의 모든 경로는 문서 id 를 요구해서 2xx 를 낼 고정 주소가 없다.
      // 건강 확인용 경로를 제품에 새로 뚫는 것보다 포트를 보는 쪽이 정직하다.
      command: 'pnpm --filter @keel/api exec prisma migrate deploy && pnpm --filter @keel/api dev',
      port: 4000,
      cwd: '..',
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @keel/web dev',
      url: 'http://localhost:3000',
      cwd: '..',
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
    },
  ],
});
