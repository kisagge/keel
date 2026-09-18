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
  webServer: {
    command: 'pnpm --filter @keel/web dev',
    url: 'http://localhost:3000',
    cwd: '..',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
