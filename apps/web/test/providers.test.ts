import { describe, expect, it, vi } from 'vitest';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import { connectProviders } from '../src/document/providers.js';

/**
 * `y-indexeddb` 의 생성자를 갈아 끼워 "프라이빗 창·할당량 초과" 를 흉내 낸다.
 *
 * 진짜 브라우저 없이는 `IndexeddbPersistence` 가 던지는 상황을 만들 수
 * 없다 — Node 에는 `indexedDB` 전역이 없어서 라이브러리 안쪽이 이미 다르게
 * 실패한다. `poisoned.test.ts` 가 `restoreInto` 하나만 갈아 끼우듯, 여기서도
 * 제어하기 어려운 그 경계 하나만 대체하고 나머지(`y-websocket`)는 그대로
 * 둔다.
 */
vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: vi.fn(function IndexeddbPersistence() {
    throw new Error('IndexedDB 를 못 연다(검사용)');
  }),
}));

describe('connectProviders — 로컬 저장을 못 쓸 때', () => {
  it('local 은 undefined 로 내려오고, remote 는 그대로 산다', () => {
    const doc = new Y.Doc();
    const providers = connectProviders('doc-for-test', doc);

    try {
      expect(providers.local).toBeUndefined();
      expect(providers.remote).toBeInstanceOf(WebsocketProvider);
    } finally {
      providers.destroy();
      doc.destroy();
    }
  });
});
