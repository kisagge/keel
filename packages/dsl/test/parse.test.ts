import { describe, expect, it } from 'vitest';
import { parse } from '../src/parser.js';
import type { DiagnosticCode } from '../src/types.js';

const codes = (src: string): DiagnosticCode[] => parse(src).diagnostics.map((d) => d.code);

describe('노드 선언', () => {
  it('종류와 이름과 라벨을 읽는다', () => {
    const doc = parse('service api "주문 API"');
    expect(doc.nodes).toHaveLength(1);
    expect(doc.nodes[0]).toMatchObject({
      kind: 'service',
      id: 'api',
      label: '주문 API',
      implicit: false,
      groupId: undefined,
    });
    expect(doc.diagnostics).toEqual([]);
  });

  it('라벨은 없어도 된다', () => {
    expect(parse('db orders').nodes[0]).toMatchObject({ id: 'orders', label: undefined });
  });

  it('라벨 안의 이스케이프를 푼다', () => {
    expect(parse('service a "큰 \\" 따옴표"').nodes[0]?.label).toBe('큰 " 따옴표');
    expect(parse('service a "역 \\\\ 슬래시"').nodes[0]?.label).toBe('역 \\ 슬래시');
  });

  it('원본에서의 자리를 들고 있다', () => {
    const src = 'service api "주문 API"';
    const node = parse(src).nodes[0]!;
    expect(src.slice(node.idSpan.start, node.idSpan.end)).toBe('api');
    expect(src.slice(node.labelSpan!.start, node.labelSpan!.end)).toBe('"주문 API"');
    expect(src.slice(node.kindSpan!.start, node.kindSpan!.end)).toBe('service');
  });

  it('같은 이름을 두 번 선언하면 알린다', () => {
    expect(codes('service a\nservice a')).toContain('duplicate-id');
  });
});

describe('엣지', () => {
  it('방향이 있는 것과 없는 것을 구분한다', () => {
    const doc = parse('a -> b\na -- b');
    expect(doc.edges.map((e) => e.style)).toEqual(['arrow', 'line']);
  });

  it('라벨을 읽는다', () => {
    expect(parse('a -> b "결제 요청"').edges[0]?.label).toBe('결제 요청');
  });

  it('라벨 안의 화살표는 글자로 읽는다', () => {
    const doc = parse('a -> b "a -> b 라고 적음"');
    expect(doc.edges).toHaveLength(1);
    expect(doc.edges[0]?.label).toBe('a -> b 라고 적음');
  });

  it('같은 두 노드를 여러 번 이어도 열쇠가 겹치지 않는다', () => {
    const keys = parse('a -> b\na -> b').edges.map((e) => e.key);
    expect(new Set(keys).size).toBe(2);
  });

  it('자기 자신을 가리키면 경고하되 버리지는 않는다', () => {
    const doc = parse('a -> a');
    expect(doc.edges).toHaveLength(1);
    expect(doc.diagnostics.map((d) => d.code)).toContain('self-edge');
  });

  it('종류 이름도 노드 이름으로 쓸 수 있다', () => {
    // `service` 는 뒤에 이름이 올 때만 종류다. 엣지 자리에서는 그냥 이름이다
    const doc = parse('service -> api');
    expect(doc.edges[0]).toMatchObject({ from: 'service', to: 'api' });
  });
});

describe('암시 노드', () => {
  it('선언 없이 엣지에만 나와도 노드가 된다', () => {
    const doc = parse('web -> api');
    expect(doc.nodes.map((n) => n.id).sort()).toEqual(['api', 'web']);
    expect(doc.nodes.every((n) => n.implicit)).toBe(true);
  });

  it('조용히 만들지 않고 반드시 알린다', () => {
    // 오타가 새 노드가 되는 것을 사람이 볼 수 있어야 한다
    expect(codes('service web\nweb -> api').filter((c) => c === 'implicit-node')).toHaveLength(1);
  });

  it('선언된 노드는 암시로 덮이지 않는다', () => {
    const doc = parse('service web "스토어"\nweb -> api');
    const web = doc.nodes.find((n) => n.id === 'web')!;
    expect(web.implicit).toBe(false);
    expect(web.label).toBe('스토어');
  });
});

describe('그룹', () => {
  it('안에 든 노드에 groupId 를 매긴다', () => {
    const doc = parse('group g "결제" {\n  service pay\n}');
    expect(doc.groups[0]).toMatchObject({ id: 'g', label: '결제', parentId: undefined });
    expect(doc.nodes[0]).toMatchObject({ id: 'pay', groupId: 'g' });
  });

  it('중첩된다', () => {
    const doc = parse('group outer {\n  group inner {\n    service x\n  }\n}');
    expect(doc.groups.find((g) => g.id === 'inner')?.parentId).toBe('outer');
    expect(doc.nodes[0]?.groupId).toBe('inner');
  });

  it('본문 구간이 중괄호 사이를 가리킨다', () => {
    const src = 'group g {\n  service pay\n}';
    const g = parse(src).groups[0]!;
    expect(src.slice(g.bodySpan.start, g.bodySpan.end).trim()).toBe('service pay');
  });

  it('닫히지 않으면 알린다', () => {
    expect(codes('group g {\n  service pay')).toContain('unclosed-group');
  });

  it('짝 없는 닫는 괄호를 알린다', () => {
    expect(codes('service a\n}')).toContain('unexpected-close');
  });
});

describe('회복', () => {
  it('깨진 줄 하나가 나머지를 죽이지 않는다', () => {
    const doc = parse('service a\n???\nservice b');
    expect(doc.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(doc.diagnostics.length).toBeGreaterThan(0);
  });

  it('치는 도중의 반쪽 줄에도 던지지 않는다', () => {
    // 한 글자씩 칠 때 지나가는 모든 상태를 그대로 넣어 본다
    const target = 'service api "주문"\napi -> db1\ngroup g {\n  db db1\n}';
    for (let i = 0; i <= target.length; i += 1) {
      expect(() => parse(target.slice(0, i))).not.toThrow();
    }
  });

  it('따옴표가 열린 채 줄이 끝나도 다음 줄을 읽는다', () => {
    const doc = parse('service a "안 닫힘\nservice b');
    expect(doc.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(doc.diagnostics.map((d) => d.code)).toContain('unterminated-string');
  });

  it('주석과 빈 줄은 아무것도 만들지 않는다', () => {
    const doc = parse('# 주석만\n\n   \n# 또 주석');
    expect(doc.nodes).toEqual([]);
    expect(doc.edges).toEqual([]);
    expect(doc.diagnostics).toEqual([]);
  });

  it('꼬리 주석은 문장을 방해하지 않는다', () => {
    const doc = parse('service api  # 여기는 주석\napi -> db1 # 이것도');
    expect(doc.nodes.find((n) => n.id === 'api')?.implicit).toBe(false);
    expect(doc.edges).toHaveLength(1);
    expect(doc.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });
});
