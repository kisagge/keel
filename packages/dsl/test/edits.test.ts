import { describe, expect, it } from 'vitest';
import {
  applyEdits,
  canUseId,
  planAddEdge,
  planAddNode,
  planRemoveEdge,
  planRemoveNode,
  planRenameNodeId,
  planSetEdgeLabel,
  planSetNodeKind,
  planSetNodeLabel,
} from '../src/edits.js';
import { parse } from '../src/parser.js';

/** 한 번 고치고 결과 문자열을 돌려준다 */
const edit = (src: string, plan: (doc: ReturnType<typeof parse>) => ReturnType<typeof planAddNode>) =>
  applyEdits(src, plan(parse(src)));

describe('applyEdits', () => {
  it('뒤에서부터 적용해 앞의 오프셋이 밀리지 않는다', () => {
    const out = applyEdits('abcdef', [
      { from: 1, to: 2, insert: 'XX' },
      { from: 4, to: 5, insert: 'YY' },
    ]);
    expect(out).toBe('aXXcdYYf');
  });

  it('겹치는 수정은 조용히 삼키지 않고 던진다', () => {
    expect(() =>
      applyEdits('abcdef', [
        { from: 1, to: 4, insert: 'X' },
        { from: 2, to: 5, insert: 'Y' },
      ]),
    ).toThrow(/겹치는/);
  });
});

describe('라벨 고치기', () => {
  it('라벨이 있으면 그 자리만 바꾼다', () => {
    const src = '# 주석은 남는다\nservice api "옛 이름"\napi -> db1';
    expect(edit(src, (d) => planSetNodeLabel(d, 'api', '새 이름'))).toBe(
      '# 주석은 남는다\nservice api "새 이름"\napi -> db1',
    );
  });

  it('라벨이 없으면 이름 뒤에 붙인다', () => {
    expect(edit('service api', (d) => planSetNodeLabel(d, 'api', '주문'))).toBe(
      'service api "주문"',
    );
  });

  it('라벨을 지우면 앞 공백도 함께 간다', () => {
    expect(edit('service api "주문"', (d) => planSetNodeLabel(d, 'api', undefined))).toBe(
      'service api',
    );
  });

  it('따옴표가 든 라벨을 다시 읽을 수 있게 넣는다', () => {
    const out = edit('service a', (d) => planSetNodeLabel(d, 'a', '큰 " 따옴표'));
    expect(parse(out).nodes[0]?.label).toBe('큰 " 따옴표');
  });

  it('선언이 없던 노드는 선언을 만들어 붙인다', () => {
    const out = edit('web -> api', (d) => planSetNodeLabel(d, 'api', '주문 API'));
    const doc = parse(out);
    expect(doc.nodes.find((n) => n.id === 'api')).toMatchObject({
      label: '주문 API',
      implicit: false,
    });
    expect(doc.edges).toHaveLength(1);
  });

  it('엣지 라벨도 같은 방식으로 다룬다', () => {
    const src = 'a -> b "옛것"';
    const key = parse(src).edges[0]!.key;
    expect(applyEdits(src, planSetEdgeLabel(parse(src), key, '새것'))).toBe('a -> b "새것"');
    expect(applyEdits(src, planSetEdgeLabel(parse(src), key, undefined))).toBe('a -> b');
  });
});

describe('이름 바꾸기', () => {
  it('선언과 엣지의 모든 자리를 함께 고친다', () => {
    const src = 'service api "주문"\nweb -> api\napi -> db1\napi -- cache';
    const out = edit(src, (d) => planRenameNodeId(d, 'api', 'orders'));
    expect(out).toBe('service orders "주문"\nweb -> orders\norders -> db1\norders -- cache');
    expect(parse(out).nodes.some((n) => n.id === 'api')).toBe(false);
  });

  it('엣지를 놓치지 않는지 — 하나라도 남으면 옛 노드가 되살아난다', () => {
    const out = edit('service api\napi -> db1', (d) => planRenameNodeId(d, 'api', 'orders'));
    expect(parse(out).nodes.map((n) => n.id).sort()).toEqual(['db1', 'orders']);
  });

  it('이미 쓰는 이름으로는 바꾸지 않는다', () => {
    const doc = parse('service a\nservice b');
    expect(planRenameNodeId(doc, 'a', 'b')).toEqual([]);
    expect(canUseId(doc, 'b')).toBe(false);
  });

  it('예약어와 잘못된 글자는 이름이 될 수 없다', () => {
    const doc = parse('service a');
    expect(canUseId(doc, 'service')).toBe(false);
    expect(canUseId(doc, '1abc')).toBe(false);
    expect(canUseId(doc, 'ok-name_2')).toBe(true);
  });
});

describe('노드 넣기', () => {
  it('마지막 선언 뒤에 넣는다 — 엣지 사이로 끼어들지 않는다', () => {
    const src = 'service a\nservice b\n\na -> b';
    const out = edit(src, (d) => planAddNode(d, { kind: 'db', id: 'main', label: '주 DB' }));
    expect(out).toBe('service a\nservice b\ndb main "주 DB"\n\na -> b');
  });

  it('선언이 하나도 없으면 문서 맨 앞에 넣는다', () => {
    expect(edit('a -> b', (d) => planAddNode(d, { kind: 'db', id: 'main' }))).toBe(
      'db main\na -> b',
    );
  });

  it('빈 문서에도 넣는다', () => {
    expect(edit('', (d) => planAddNode(d, { kind: 'service', id: 'a' }))).toBe('service a\n');
  });

  it('그룹을 지정하면 그 안에, 들여쓰기를 맞춰 넣는다', () => {
    const src = 'group g "결제" {\n  service pay\n}';
    const out = edit(src, (d) =>
      planAddNode(d, { kind: 'external', id: 'toss', label: '토스', groupId: 'g' }),
    );
    expect(out).toBe('group g "결제" {\n  service pay\n  external toss "토스"\n}');
    expect(parse(out).nodes.find((n) => n.id === 'toss')?.groupId).toBe('g');
  });

  it('빈 그룹에도 그룹 안으로 들어간다', () => {
    const out = edit('group g {\n}', (d) =>
      planAddNode(d, { kind: 'service', id: 'pay', groupId: 'g' }),
    );
    expect(parse(out).nodes[0]?.groupId).toBe('g');
  });

  it('한 줄로 쓴 빈 그룹에서도 그룹 밖으로 떨어지지 않는다', () => {
    const out = edit('group g { }', (d) =>
      planAddNode(d, { kind: 'service', id: 'pay', groupId: 'g' }),
    );
    expect(parse(out).nodes[0]?.groupId).toBe('g');
  });
});

describe('지우기', () => {
  it('노드를 지우면 그 노드가 걸린 엣지도 함께 간다', () => {
    const src = 'service a\nservice b\nservice c\na -> b\nb -> c';
    expect(edit(src, (d) => planRemoveNode(d, 'b'))).toBe('service a\nservice c');
  });

  it('지운 노드가 암시 노드로 되살아나지 않는다', () => {
    const src = 'service a\nservice b\na -> b';
    const out = edit(src, (d) => planRemoveNode(d, 'b'));
    expect(parse(out).nodes.map((n) => n.id)).toEqual(['a']);
  });

  it('문서의 마지막 줄과 그 앞줄을 함께 지워도 구간이 겹치지 않는다', () => {
    // 줄바꿈이 없는 마지막 줄은 앞의 줄바꿈을 먹어야 해서, 합치지 않으면 겹친다
    const src = 'service a\nservice b\na -> b';
    expect(() => edit(src, (d) => planRemoveNode(d, 'b'))).not.toThrow();
    expect(edit(src, (d) => planRemoveNode(d, 'b'))).toBe('service a');
  });

  it('마지막 줄을 지운 자리에 빈 줄을 남기지 않는다', () => {
    expect(edit('service a\nservice b', (d) => planRemoveNode(d, 'b'))).toBe('service a');
  });

  it('엣지 하나만 지운다', () => {
    const src = 'a -> b\nb -> c';
    const key = parse(src).edges[0]!.key;
    expect(applyEdits(src, planRemoveEdge(parse(src), key))).toBe('b -> c');
  });
});

describe('엣지 넣기', () => {
  it('마지막 엣지 뒤에 붙인다', () => {
    expect(edit('a -> b', (d) => planAddEdge(d, { from: 'b', to: 'c', style: 'arrow' }))).toBe(
      'a -> b\nb -> c',
    );
  });

  it('엣지가 없으면 문서 끝에 붙인다', () => {
    expect(
      edit('service a\nservice b', (d) =>
        planAddEdge(d, { from: 'a', to: 'b', style: 'line', label: '같이' }),
      ),
    ).toBe('service a\nservice b\na -- b "같이"');
  });
});

describe('종류 바꾸기', () => {
  it('종류 글자만 바꾼다', () => {
    expect(edit('service main "주 DB"', (d) => planSetNodeKind(d, 'main', 'db'))).toBe(
      'db main "주 DB"',
    );
  });

  it('선언이 없던 노드는 선언을 만든다', () => {
    const out = edit('a -> main', (d) => planSetNodeKind(d, 'main', 'db'));
    expect(parse(out).nodes.find((n) => n.id === 'main')).toMatchObject({
      kind: 'db',
      implicit: false,
    });
  });
});
