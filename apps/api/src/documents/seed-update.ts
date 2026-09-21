import * as Y from 'yjs';

/**
 * 씨앗을 Yjs 업데이트 하나로 만든다.
 *
 * `layout` 맵은 일부러 안 만든다. Yjs 의 루트 타입은 이름으로 짝지어지므로
 * 클라이언트가 `getMap('layout')` 을 부르는 순간 생기고, 서버가 미리 빈 것을
 * 만들어 둘 이유가 없다. 사람이 옮긴 노드가 없는 문서에 빈 맵을 넣는 것은
 * "아무도 안 옮겼다" 를 저장하는 일이다.
 *
 * origin 을 주지 않는다. origin 은 그 `Y.Doc` 안에서만 뜻이 있고 업데이트에
 * 실려 가지 않는다. 클라이언트 쪽에서 이 업데이트는 **제공자 origin** 으로
 * 도착하고, 그것이 `trackedOrigins` 에 없어서 되돌리기가 씨앗을 못 지운다.
 */
export function seedUpdate(seed: string): Uint8Array {
  const doc = new Y.Doc();
  doc.getText('source').insert(0, seed);
  const update = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return update;
}
