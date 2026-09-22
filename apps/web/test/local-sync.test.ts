import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCAL_SYNC_TIMEOUT_MS, waitForLocal } from '../src/document/local-sync.js';

/**
 * `y-indexeddb` 가 **비동기로** 못 열리면 `whenSynced` 는 영영 안 풀린다 —
 * 라이브러리가 그 실패를 알릴 이벤트를 안 준다(`task-12-report.md` 참고).
 * 그러니 시간으로 가두는 것이 유일한 길이고, 이 검사가 그 가둠을 확인한다.
 */
describe('waitForLocal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('local 이 아예 없으면 곧바로 unavailable', async () => {
    const outcome = await waitForLocal(undefined);
    expect(outcome).toBe('unavailable');
  });

  it('whenSynced 가 시간 안에 풀리면 synced', async () => {
    const local = { whenSynced: Promise.resolve() };
    const promise = waitForLocal(local, 1000);
    await vi.advanceTimersByTimeAsync(0);
    expect(await promise).toBe('synced');
  });

  it('whenSynced 가 영영 안 풀리면(비동기 open 실패) 시간이 지나 unavailable', async () => {
    const local = { whenSynced: new Promise<void>(() => {}) };
    const promise = waitForLocal(local, 1000);

    await vi.advanceTimersByTimeAsync(999);
    // 아직 정해지지 않았다 — race 가 됐는지 미리 못 잡는다는 뜻만 확인한다
    let settled = false;
    void promise.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(await promise).toBe('unavailable');
  });

  it('기본 시간은 LOCAL_SYNC_TIMEOUT_MS 다', async () => {
    const local = { whenSynced: new Promise<void>(() => {}) };
    const promise = waitForLocal(local);

    await vi.advanceTimersByTimeAsync(LOCAL_SYNC_TIMEOUT_MS);
    expect(await promise).toBe('unavailable');
  });
});
