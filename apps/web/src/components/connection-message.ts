/**
 * 연결 상태 문구 — 순수 함수로 내린다. 이유는 `split-ratio.ts` 위쪽 주석과
 * 같다: **검사할 값어치가 있는 것은 순수 모듈로 내린다.** 이 저장소의
 * vitest 는 jsdom 을 안 들이므로, 문구가 컴포넌트 안에 있으면 검사할 방법이
 * 없다.
 *
 * **이 두 "끊김" 문구는 서로 다른 말을 한다.** 로컬 저장이 있으면
 * (`hasLocal`) 지금 고치는 것은 안 잃는다 — 아직 남들에게 안 퍼졌을
 * 뿐이다. 로컬 저장이 없으면 정말로 잃는다. **완화한 문구를 심각한 쪽에
 * 쓰는 것이 피해야 할 실패다** — 이 모듈을 따로 뗀 이유가 그 실패를 검사
 * 하나로 잡기 위해서다. 한쪽 문구가 다른 쪽으로 새면(예: 두 갈래를
 * 맞바꾸면) `connection-message.test.ts` 가 잡는다.
 */

export type ConnectionState = 'connected' | 'disconnected';

export function connectionState(connected: boolean): ConnectionState {
  return connected ? 'connected' : 'disconnected';
}

export function connectionMessage(connected: boolean, hasLocal: boolean): string {
  if (connected) return '저장됨';
  return hasLocal
    ? '연결 끊김 — 지금 고치는 것은 이 브라우저에만 있다'
    : '연결 끊김 — 지금 고치는 것은 저장되지 않는다';
}
