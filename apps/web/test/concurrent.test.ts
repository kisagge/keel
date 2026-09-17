import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { moveNode, removeNode, renameNode } from '../src/document/commands.js';
import { createKeelDocument } from '../src/document/keel-document.js';
import type { KeelDocument } from '../src/document/keel-document.js';

const SOURCE = ['service web "스토어프론트"', 'service api', 'db orders', 'web -> api'].join('\n');

/** 두 문서를 서로 끝까지 맞춘다. 서버가 하는 일을 손으로 한 것이다 */
function sync(a: KeelDocument, b: KeelDocument): void {
  Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc, Y.encodeStateVector(b.doc)));
  Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc, Y.encodeStateVector(a.doc)));
}

/** 같은 문서를 보는 두 사람을 만든다 */
function pair(source: string): [KeelDocument, KeelDocument] {
  const a = createKeelDocument(source);
  const b = createKeelDocument('');
  Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
  return [a, b];
}

describe('같은 문서를 둘이 고친다', () => {
  /**
   * 이 저장소의 핵심 주장이다. 캔버스가 문서를 통째로 다시 썼다면 — "전부
   * 지우고 전부 넣기" — 상대의 삽입이 지우기 구간 안에 있어 병합이 아니라
   * 소멸이 됐을 것이다. 구간 수정이라서 둘 다 산다.
   */
  it('서로 다른 노드의 이름을 동시에 고치면 둘 다 산다', () => {
    const [a, b] = pair(SOURCE);

    renameNode(a, 'api', '주문 API');
    renameNode(b, 'orders', '주문 DB');
    sync(a, b);

    for (const document of [a, b]) {
      expect(document.source.toString()).toContain('service api "주문 API"');
      expect(document.source.toString()).toContain('db orders "주문 DB"');
    }

    a.destroy();
    b.destroy();
  });

  it('한쪽이 캔버스에서 고치고 다른 쪽이 글자를 쳐도 둘 다 산다', () => {
    const [a, b] = pair(SOURCE);

    renameNode(a, 'api', '주문 API');
    // 다른 사람이 문서 끝에 새 줄을 친다
    b.doc.transact(() => b.source.insert(b.source.length, '\nqueue events'));
    sync(a, b);

    for (const document of [a, b]) {
      expect(document.source.toString()).toContain('service api "주문 API"');
      expect(document.source.toString()).toContain('queue events');
    }

    a.destroy();
    b.destroy();
  });

  it('둘이 같은 문서를 고쳐도 끝내 글자가 똑같다', () => {
    const [a, b] = pair(SOURCE);

    renameNode(a, 'api', '가');
    renameNode(b, 'orders', '나');
    moveNode(a, 'api', { x: 10, y: 10 });
    moveNode(b, 'orders', { x: 20, y: 20 });
    sync(a, b);

    expect(a.source.toString()).toBe(b.source.toString());
    expect([...a.layout.entries()].sort()).toEqual([...b.layout.entries()].sort());

    a.destroy();
    b.destroy();
  });

  it('둘이 같은 노드를 각자 옮기면 한쪽으로 정해지되 둘이 같아진다', () => {
    const [a, b] = pair(SOURCE);

    moveNode(a, 'api', { x: 1, y: 1 });
    moveNode(b, 'api', { x: 2, y: 2 });
    sync(a, b);

    expect(a.layout.get('api')).toEqual(b.layout.get('api'));

    a.destroy();
    b.destroy();
  });

  it('한쪽이 지운 노드를 다른 쪽이 옮기고 있어도 문서가 안 깨진다', () => {
    const [a, b] = pair(SOURCE);

    removeNode(a, 'api');
    moveNode(b, 'api', { x: 9, y: 9 });
    sync(a, b);

    expect(a.source.toString()).toBe(b.source.toString());
    expect(a.source.toString()).not.toContain('service api');

    a.destroy();
    b.destroy();
  });
});
