/* eslint-disable @typescript-eslint/no-base-to-string */
import { parse, planSetNodeLabel } from '@keel/dsl';
import type { TextEdit } from '@keel/dsl';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { applyTextEdits } from '../src/document/text-edits.js';

function textOf(source: string): Y.Text {
  const doc = new Y.Doc();
  const ytext = doc.getText('source');
  ytext.insert(0, source);
  return ytext;
}

describe('구간 수정 얹기', () => {
  it('한 군데만 고친다', () => {
    const ytext = textOf('service a "옛 이름"\nservice b');
    const edits = planSetNodeLabel(parse(ytext.toString()), 'a', '새 이름');

    applyTextEdits(ytext, edits);

    expect(ytext.toString()).toBe('service a "새 이름"\nservice b');
  });

  /** 이 저장소가 통째로 다시 쓰기를 피하는 이유 전부가 이 검사에 들어 있다 */
  it('주석과 줄 순서를 건드리지 않는다', () => {
    const source = [
      '# 주문이 들어와서 결제까지',
      '',
      'service web "스토어프론트"',
      'service api',
      '',
      'web -> api  # 여기 주석',
    ].join('\n');

    const ytext = textOf(source);
    applyTextEdits(ytext, planSetNodeLabel(parse(source), 'api', '주문 API'));

    const after = ytext.toString();
    expect(after).toContain('# 주문이 들어와서 결제까지');
    expect(after).toContain('web -> api  # 여기 주석');
    expect(after.split('\n')).toHaveLength(source.split('\n').length);
  });

  it('여러 군데를 한 번에 고쳐도 뒤쪽 자리가 안 밀린다', () => {
    const ytext = textOf('aaa bbb ccc');
    const edits: TextEdit[] = [
      { from: 0, to: 3, insert: 'XXXXX' },
      { from: 8, to: 11, insert: 'Z' },
    ];

    applyTextEdits(ytext, edits);

    expect(ytext.toString()).toBe('XXXXX bbb Z');
  });

  it('빈 배열이면 트랜잭션을 아예 안 연다', () => {
    const doc = new Y.Doc();
    const ytext = doc.getText('source');
    ytext.insert(0, 'service a');

    let updates = 0;
    doc.on('update', () => {
      updates += 1;
    });

    applyTextEdits(ytext, []);
    expect(updates).toBe(0);
  });

  /**
   * `delete`·`insert` 는 하나하나가 제 트랜잭션을 연다. 안 묶으면 수정 둘이
   * 갱신 **넷**으로 날아가고, 실시간 판에서 남의 화면이 반쯤 고쳐진 문서를
   * 실제로 본다.
   */
  it('수정이 여럿이어도 갱신은 한 번이다', () => {
    const doc = new Y.Doc();
    const ytext = doc.getText('source');
    ytext.insert(0, 'aaa bbb ccc');

    let updates = 0;
    doc.on('update', () => {
      updates += 1;
    });

    applyTextEdits(ytext, [
      { from: 0, to: 3, insert: 'XXXXX' },
      { from: 8, to: 11, insert: 'Z' },
    ]);

    expect(updates).toBe(1);
    expect(ytext.toString()).toBe('XXXXX bbb Z');
  });

  /** 부르는 쪽이 이미 트랜잭션 안이면 바깥 것에 합쳐지고 origin 도 지켜진다 */
  it('바깥 트랜잭션 안에서 불러도 그 origin 을 지킨다', () => {
    const doc = new Y.Doc();
    const ytext = doc.getText('source');
    ytext.insert(0, 'service a');

    const OUTER = Symbol('바깥');
    const origins: unknown[] = [];
    doc.on('afterTransaction', (transaction: Y.Transaction) => {
      origins.push(transaction.origin);
    });

    doc.transact(() => {
      applyTextEdits(ytext, [{ from: 8, to: 9, insert: 'b' }]);
    }, OUTER);

    expect(origins).toEqual([OUTER]);
    expect(ytext.toString()).toBe('service b');
  });

  /**
   * `dsl` 의 `applyEdits` 는 문자열 사본에 얹으므로 중간에 던져도 남는 것이 없다.
   * 여기는 **여럿이 함께 보는 문서**를 직접 고치므로, 반쯤 고치다 던지면 남의
   * 화면에 깨진 문서가 남는다. 그래서 먼저 전부 검사하고 그다음에 얹는다.
   */
  it('겹치는 수정은 던지고, 문서는 손도 안 댄 채로 남는다', () => {
    const ytext = textOf('aaaaaaaaaa');
    const edits: TextEdit[] = [
      { from: 0, to: 5, insert: 'X' },
      { from: 3, to: 8, insert: 'Y' },
    ];

    expect(() => applyTextEdits(ytext, edits)).toThrow(/겹치는 수정/);
    expect(ytext.toString()).toBe('aaaaaaaaaa');
  });
});
