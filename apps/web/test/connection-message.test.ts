import { describe, expect, it } from 'vitest';
import { connectionMessage, connectionState } from '../src/components/connection-message.js';

/**
 * 이 문구가 검사의 전부다. e2e 는 `local === undefined` 쪽(사생활 보호
 * 창·할당량 초과)에 못 닿는다 — 헤드리스 Chromium 은 늘 IndexedDB 를 쓸 수
 * 있어서다. 세 상태를 여기서 문자 그대로 고정해 둔다.
 */
describe('연결 상태 문구', () => {
  it('붙어 있으면 저장됨이라고 한다 — 로컬 저장 여부와 무관하다', () => {
    expect(connectionState(true)).toBe('connected');
    expect(connectionMessage(true, true)).toBe('저장됨');
    expect(connectionMessage(true, false)).toBe('저장됨');
  });

  it('끊기고 로컬 저장이 있으면 "이 브라우저에만" 이라고 한다 — 안 잃는다', () => {
    expect(connectionState(false)).toBe('disconnected');
    expect(connectionMessage(false, true)).toBe(
      '연결 끊김 — 지금 고치는 것은 이 브라우저에만 있다',
    );
  });

  /**
   * **가장 중요한 경우.** 사생활 보호 창이나 할당량 초과로 로컬 저장을 못
   * 쓰면, 완화한 문구("이 브라우저에만")를 그대로 쓰는 것이 피해야 할
   * 실패다 — 탭을 닫으면 정말로 잃는데 안전하다고 말하는 꼴이 된다.
   */
  it('끊기고 로컬 저장도 없으면 저장되지 않는다고 — 더 강하게 — 말한다', () => {
    expect(connectionMessage(false, false)).toBe(
      '연결 끊김 — 지금 고치는 것은 저장되지 않는다',
    );
  });
});
