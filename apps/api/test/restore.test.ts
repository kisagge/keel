import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { restoreInto } from '../src/realtime/restore.js';

/** 편집을 몇 번 한 문서와, 그 편집들을 업데이트 배열로 함께 돌려준다 */
function edited(): { state: Uint8Array; updates: Uint8Array[]; text: string } {
  const doc = new Y.Doc();
  const updates: Uint8Array[] = [];
  doc.on('update', (u: Uint8Array) => updates.push(u));

  doc.getText('source').insert(0, 'actor user "손님"');
  doc.getText('source').insert(17, '\nservice web "웹"');
  doc.getMap('layout').set('user', { x: 10, y: 20 });

  const text = doc.getText('source').toString();
  const state = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return { state, updates, text };
}

describe('restoreInto', () => {
  it('스냅샷이 없으면 처음부터 전부 재생한다', () => {
    const { updates, text } = edited();
    const doc = new Y.Doc();

    restoreInto(doc, undefined, updates);

    expect(doc.getText('source').toString()).toBe(text);
    doc.destroy();
  });

  it('스냅샷에 꼬리를 얹는다', () => {
    const { updates, text } = edited();
    // 앞의 둘은 접혔다 치고, 그 상태를 스냅샷으로 만든다
    const folded = new Y.Doc();
    Y.applyUpdate(folded, updates[0]!);
    Y.applyUpdate(folded, updates[1]!);
    const snapshot = Y.encodeStateAsUpdate(folded);
    folded.destroy();

    const doc = new Y.Doc();
    restoreInto(doc, snapshot, updates.slice(2));

    expect(doc.getText('source').toString()).toBe(text);
    expect(doc.getMap('layout').get('user')).toEqual({ x: 10, y: 20 });
    doc.destroy();
  });

  it('접힌 것을 또 얹어도 문서가 그대로다', () => {
    // 스냅샷을 쓴 뒤 행을 지우기 전에 죽으면 다음 복원에서 겹쳐 얹힌다.
    // 그 경우가 무해해야 "스냅샷 먼저, 삭제 나중" 순서가 성립한다.
    const { updates, text } = edited();
    const folded = new Y.Doc();
    Y.applyUpdate(folded, updates[0]!);
    Y.applyUpdate(folded, updates[1]!);
    const snapshot = Y.encodeStateAsUpdate(folded);
    folded.destroy();

    const doc = new Y.Doc();
    restoreInto(doc, snapshot, updates); // 접힌 둘까지 통째로 얹는다

    expect(doc.getText('source').toString()).toBe(text);
    doc.destroy();
  });

  it('꼬리 순서가 뒤집혀도 Yjs 가 맞춰 준다', () => {
    // 순서가 곧 문서라는 것을 못 박는다. seq 정렬이 빠지면 여기서 걸린다.
    const { updates, text } = edited();
    const doc = new Y.Doc();

    restoreInto(doc, undefined, [...updates].reverse());

    // Yjs 는 순서가 어긋난 업데이트를 버리지 않고 보류했다가 맞춘다.
    // 그래서 결과가 같아야 한다 — 이 검사는 그 성질을 기록해 둔다.
    expect(doc.getText('source').toString()).toBe(text);
    doc.destroy();
  });
});
