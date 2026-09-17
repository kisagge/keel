/* eslint-disable @typescript-eslint/no-base-to-string */
import { describe, expect, it } from 'vitest';
import { moveNode, removeNode, renameNode, setNodeKind } from '../src/document/commands.js';
import { createKeelDocument } from '../src/document/keel-document.js';

const SOURCE = [
  '# 주문이 들어와서 결제까지',
  '',
  'service web "스토어프론트"',
  'service api',
  'db orders "주문 DB"',
  '',
  'web -> api  # 여기 주석',
  'api -> orders',
].join('\n');

describe('이름 고치기', () => {
  it('그 자리만 바꾼다', () => {
    const document = createKeelDocument(SOURCE);
    renameNode(document, 'api', '주문 API');

    expect(document.source.toString()).toContain('service api "주문 API"');
    document.destroy();
  });

  /** edits.ts 가 있는 이유 전부 */
  it('주석과 줄 순서가 그대로다', () => {
    const document = createKeelDocument(SOURCE);
    renameNode(document, 'api', '주문 API');

    const after = document.source.toString();
    expect(after).toContain('# 주문이 들어와서 결제까지');
    expect(after).toContain('web -> api  # 여기 주석');
    expect(after.split('\n')).toHaveLength(SOURCE.split('\n').length);
    document.destroy();
  });

  it('없는 노드는 아무 일도 안 한다', () => {
    const document = createKeelDocument(SOURCE);
    renameNode(document, '없는놈', '이름');
    expect(document.source.toString()).toBe(SOURCE);
    document.destroy();
  });

  /**
   * 빈 트랜잭션은 되돌리기 역사에 빈 칸을 남긴다.
   *
   * **같은 이름으로 고치는 경우가 핵심이다.** `planSetNodeLabel` 은 그때 빈
   * 배열이 아니라 같은 글자를 다시 쓰는 수정을 돌려주므로, 명령 쪽에서 걸러야 한다.
   */
  it('바뀔 것이 없으면 트랜잭션을 안 연다', () => {
    const document = createKeelDocument(SOURCE);

    let updates = 0;
    document.doc.on('update', () => {
      updates += 1;
    });

    renameNode(document, '없는놈', '이름');
    renameNode(document, 'orders', '주문 DB'); // 이미 같은 이름
    expect(updates).toBe(0);
    document.destroy();
  });
});

describe('종류 고치기', () => {
  it('종류 낱말만 바꾼다', () => {
    const document = createKeelDocument(SOURCE);
    setNodeKind(document, 'api', 'queue');

    expect(document.source.toString()).toContain('queue api');
    expect(document.source.toString()).toContain('service web "스토어프론트"');
    document.destroy();
  });

  it('같은 종류면 아무 일도 안 한다', () => {
    const document = createKeelDocument(SOURCE);
    setNodeKind(document, 'api', 'service');
    expect(document.source.toString()).toBe(SOURCE);
    document.destroy();
  });
});

describe('지우기', () => {
  it('노드 줄과 거기 걸린 엣지 줄을 함께 지운다', () => {
    const document = createKeelDocument(SOURCE);
    removeNode(document, 'api');

    const after = document.source.toString();
    expect(after).not.toContain('service api');
    expect(after).not.toContain('web -> api');
    expect(after).not.toContain('api -> orders');
    expect(after).toContain('service web "스토어프론트"');
    document.destroy();
  });

  /**
   * 레이아웃 자리를 안 지우면 유령 좌표가 남아, 같은 이름을 다시 만들었을 때
   * 옛 자리로 튄다.
   */
  it('레이아웃 자리도 같은 트랜잭션에서 사라진다', () => {
    const document = createKeelDocument(SOURCE);
    moveNode(document, 'api', { x: 100, y: 200 });
    expect(document.layout.get('api')).toEqual({ x: 100, y: 200 });

    removeNode(document, 'api');
    expect(document.layout.get('api')).toBeUndefined();
    document.destroy();
  });

  /**
   * **중간 단언이 이 검사의 전부다.**
   *
   * `moveNode` 와 `removeNode` 는 각각 제 걸음이라(`beginStep`), `undo()` 한 번은
   * `removeNode` 만 되돌린다. 그래서 "지운 뒤 자리가 없어졌다" 를 안 확인하면,
   * `layout.delete` 를 빼 버려도 이 검사가 **공허하게 통과한다** — 자리가
   * 되돌아온 게 아니라 애초에 건드려지지 않았을 뿐인데 같은 값이 나온다.
   */
  it('되돌리면 텍스트와 자리가 함께 돌아온다', () => {
    const document = createKeelDocument(SOURCE);
    moveNode(document, 'api', { x: 100, y: 200 });

    removeNode(document, 'api');
    expect(document.layout.get('api')).toBeUndefined();

    document.undoManager.undo();

    expect(document.source.toString()).toContain('service api');
    expect(document.layout.get('api')).toEqual({ x: 100, y: 200 });
    document.destroy();
  });
});

describe('되돌리기 걸음', () => {
  /**
   * 명령 하나가 한 걸음이어야 한다. 경계를 안 그으면 Yjs 가 짧은 사이의 수정을
   * 묶어, 이름을 고치고 곧바로 노드를 끌었을 때 Cmd+Z 한 번에 둘 다 되돌아간다.
   */
  it('잇달아 한 명령 둘이 따로 되돌아간다', () => {
    const document = createKeelDocument(SOURCE);

    renameNode(document, 'api', '주문 API');
    moveNode(document, 'api', { x: 10, y: 20 });

    document.undoManager.undo();
    expect(document.layout.get('api')).toBeUndefined();
    expect(document.source.toString()).toContain('service api "주문 API"');

    document.undoManager.undo();
    expect(document.source.toString()).toBe(SOURCE);
    document.destroy();
  });
});

describe('옮기기', () => {
  it('좌표만 쓰고 텍스트는 안 건드린다', () => {
    const document = createKeelDocument(SOURCE);
    moveNode(document, 'api', { x: 12.5, y: -30 });

    expect(document.layout.get('api')).toEqual({ x: 12.5, y: -30 });
    expect(document.source.toString()).toBe(SOURCE);
    document.destroy();
  });

  /** 반올림도 격자 맞춤도 여기서 하지 않는다 — 렌더러의 중심 좌표 계약 */
  it('받은 값을 그대로 적는다', () => {
    const document = createKeelDocument(SOURCE);
    moveNode(document, 'api', { x: 123.456, y: -78.9 });
    expect(document.layout.get('api')).toEqual({ x: 123.456, y: -78.9 });
    document.destroy();
  });
});
