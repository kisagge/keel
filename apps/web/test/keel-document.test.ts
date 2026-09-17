/* eslint-disable @typescript-eslint/no-base-to-string */
import { describe, expect, it } from 'vitest';
import { KEEL_LOCAL, createKeelDocument } from '../src/document/keel-document.js';

describe('문서 배선', () => {
  it('씨앗을 소스에 넣고 시작한다', () => {
    const document = createKeelDocument('service a\nservice b');
    expect(document.source.toString()).toBe('service a\nservice b');
    document.destroy();
  });

  it('레이아웃은 비어 있다 — 사람이 옮긴 노드만 들어간다', () => {
    const document = createKeelDocument('service a');
    expect(document.layout.size).toBe(0);
    document.destroy();
  });

  /**
   * 씨앗을 되돌릴 수 있게 두면 화면을 열자마자 Cmd+Z 한 번에 문서가 통째로
   * 사라진다. 씨앗은 "사람이 한 일" 이 아니다.
   */
  it('씨앗은 되돌려지지 않는다', () => {
    const document = createKeelDocument('service a');
    document.undoManager.undo();
    expect(document.source.toString()).toBe('service a');
    document.destroy();
  });

  it('KEEL_LOCAL 로 한 텍스트 수정은 되돌려진다', () => {
    const document = createKeelDocument('service a');

    document.doc.transact(() => document.source.insert(9, ' "이름"'), KEEL_LOCAL);
    expect(document.source.toString()).toBe('service a "이름"');

    document.undoManager.undo();
    expect(document.source.toString()).toBe('service a');
    document.destroy();
  });

  it('KEEL_LOCAL 로 한 레이아웃 수정도 되돌려진다', () => {
    const document = createKeelDocument('service a');

    document.doc.transact(() => document.layout.set('a', { x: 10, y: 20 }), KEEL_LOCAL);
    expect(document.layout.get('a')).toEqual({ x: 10, y: 20 });

    document.undoManager.undo();
    expect(document.layout.get('a')).toBeUndefined();
    document.destroy();
  });

  /**
   * 역사가 둘로 나뉘면 사람이 "방금 뭘 되돌렸는지" 를 못 따라간다.
   * 친 글자와 끈 노드가 한 역사여야 한다.
   */
  it('텍스트와 레이아웃이 한 역사로 되돌아간다', () => {
    const document = createKeelDocument('service a');

    document.doc.transact(() => document.source.insert(9, ' "하나"'), KEEL_LOCAL);
    document.doc.transact(() => document.layout.set('a', { x: 1, y: 2 }), KEEL_LOCAL);

    document.undoManager.undo();
    expect(document.layout.get('a')).toBeUndefined();
    expect(document.source.toString()).toBe('service a "하나"');

    document.undoManager.undo();
    expect(document.source.toString()).toBe('service a');
    document.destroy();
  });

  /**
   * y-codemirror.next 는 로컬 편집을 `YSyncConfig` 인스턴스를 origin 으로 삼아
   * 얹는다. Yjs 의 UndoManager 는 origin 을 **생성자로도** 견주므로
   * (UndoManager.js:216) 클래스를 넣어 두면 인스턴스를 손에 안 쥐어도 걸린다.
   */
  it('바깥에서 넘긴 origin 도 클래스로 추적한다', () => {
    class FakeSyncConfig {}
    const config = new FakeSyncConfig();

    const document = createKeelDocument('service a', [FakeSyncConfig]);
    document.doc.transact(() => document.source.insert(9, ' "밖"'), config);

    document.undoManager.undo();
    expect(document.source.toString()).toBe('service a');
    document.destroy();
  });

  it('추적하지 않는 origin 은 되돌려지지 않는다', () => {
    const document = createKeelDocument('service a');
    document.doc.transact(() => document.source.insert(9, ' "남"'), Symbol('원격'));

    document.undoManager.undo();
    expect(document.source.toString()).toBe('service a "남"');
    document.destroy();
  });
});
