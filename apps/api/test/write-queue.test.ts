import { describe, expect, it } from 'vitest';
import { WriteQueue } from '../src/realtime/write-queue.js';

/** 밖에서 손으로 resolve 할 수 있는 프라미스. 작업이 언제 진짜로 진행되는지 눈으로 통제한다 */
function deferred<T = void>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('WriteQueue', () => {
  it('같은 키는 앞 작업이 끝나야 다음이 시작한다', async () => {
    const queue = new WriteQueue(() => {});
    const order: string[] = [];
    const first = deferred();

    queue.enqueue('doc-1', async () => {
      order.push('first-start');
      await first.promise;
      order.push('first-end');
    });
    queue.enqueue('doc-1', async () => {
      order.push('second-start');
    });

    // 마이크로태스크가 두어 바퀴 돌 시간을 준다. 첫 작업은 이미 시작했지만
    // first.promise 에 걸려 아직 안 끝났으니, 둘째는 아직 시작하면 안 된다
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(['first-start']);

    first.resolve();
    await queue.settled('doc-1');

    // 들어온 순서 그대로 끝난다 — 이게 이 클래스가 있는 이유다
    expect(order).toEqual(['first-start', 'first-end', 'second-start']);
  });

  it('다른 키는 서로 기다리지 않는다', async () => {
    const queue = new WriteQueue(() => {});
    const order: string[] = [];
    const blocked = deferred();

    queue.enqueue('doc-1', async () => {
      order.push('doc-1-start');
      await blocked.promise;
      order.push('doc-1-end');
    });
    queue.enqueue('doc-2', async () => {
      order.push('doc-2');
    });

    // doc-1 은 아직 안 풀렸다. 전역으로 한 줄이었다면 doc-2 도 doc-1 뒤에서
    // 막혀 settled 가 영영 안 끝났을 것이다 — 그러면 이 검사가 타임아웃으로
    // 실패한다.
    await queue.settled('doc-2');
    expect(order).toEqual(['doc-1-start', 'doc-2']);

    blocked.resolve();
    await queue.settled('doc-1');
    expect(order).toEqual(['doc-1-start', 'doc-2', 'doc-1-end']);
  });

  it('실패한 작업은 onError 로 가고, 같은 키의 다음 작업은 그대로 이어진다', async () => {
    const errors: Array<{ key: string; error: unknown }> = [];
    const queue = new WriteQueue((key, error) => errors.push({ key, error }));
    const order: string[] = [];

    queue.enqueue('doc-1', async () => {
      throw new Error('boom');
    });
    queue.enqueue('doc-1', async () => {
      order.push('after-failure');
    });

    await queue.settled('doc-1');

    expect(errors).toEqual([{ key: 'doc-1', error: expect.any(Error) }]);
    expect(order).toEqual(['after-failure']);
  });
});
