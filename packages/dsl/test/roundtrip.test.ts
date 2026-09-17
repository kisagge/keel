import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from '../src/parser.js';
import { print } from '../src/printer.js';
import type { ParsedDocument } from '../src/types.js';

/**
 * `dsl-roundtrip` — 손으로 고른 목록이 아니라 `fixtures/` 를 **전수**로 돈다.
 *
 * 목록을 손으로 들고 있으면 반드시 샌다. 새 픽스처를 넣는 것만으로 검사에
 * 들어오게 해 두면 빠뜨릴 수가 없다.
 *
 * 지키는 불변식은 **글자가 같은 것이 아니라 구조가 같은 것**이다 —
 * 사람이 쓴 문서의 주석·줄 순서·들여쓰기는 정규형과 다를 수 있다.
 */

const FIXTURES = fileURLToPath(new URL('../fixtures', import.meta.url));
const files = readdirSync(FIXTURES).filter((f) => f.endsWith('.keel'));

/** 위치(Span)를 뺀 알맹이. 정규형으로 다시 쓰면 위치는 당연히 달라진다 */
function shape(doc: ParsedDocument) {
  return {
    nodes: doc.nodes
      .filter((n) => !n.implicit)
      .map((n) => ({ kind: n.kind, id: n.id, label: n.label, groupId: n.groupId }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    edges: doc.edges.map((e) => ({ from: e.from, to: e.to, style: e.style, label: e.label })),
    groups: doc.groups
      .map((g) => ({ id: g.id, label: g.label, parentId: g.parentId }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

describe('fixtures 전수 왕복', () => {
  it('픽스처가 하나라도 있어야 한다', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const source = readFileSync(join(FIXTURES, file), 'utf8');

    describe(file, () => {
      it('오류 없이 읽힌다', () => {
        const errors = parse(source).diagnostics.filter((d) => d.severity === 'error');
        expect(errors).toEqual([]);
      });

      it('다시 써도 구조가 같다', () => {
        const once = parse(source);
        const twice = parse(print(once));
        expect(shape(twice)).toEqual(shape(once));
      });

      it('두 번 써도 글자가 같다 (멱등)', () => {
        const first = print(parse(source));
        const second = print(parse(first));
        expect(second).toBe(first);
      });

      it('모든 구간이 원본 안을 가리킨다', () => {
        const doc = parse(source);
        for (const n of doc.nodes) {
          expect(source.slice(n.idSpan.start, n.idSpan.end)).toBe(n.id);
        }
        for (const e of doc.edges) {
          expect(source.slice(e.fromSpan.start, e.fromSpan.end)).toBe(e.from);
          expect(source.slice(e.toSpan.start, e.toSpan.end)).toBe(e.to);
        }
        for (const g of doc.groups) {
          expect(source.slice(g.idSpan.start, g.idSpan.end)).toBe(g.id);
        }
      });
    });
  }
});

describe('정규형', () => {
  it('빈 문서는 빈 문자열', () => {
    expect(print(parse(''))).toBe('');
  });

  it('선언 없이 만들어진 노드에 선언을 지어내지 않는다', () => {
    // 지어내면 사람이 쓴 문서가 매번 부풀어 오른다
    expect(print(parse('a -> b'))).toBe('a -> b\n');
  });

  it('그룹 안의 노드를 그룹 안에 다시 쓴다', () => {
    const out = print(parse('group g {\nservice pay\n}\ngateway -> pay'));
    expect(out).toBe('group g {\n  service pay\n}\n\ngateway -> pay\n');
  });
});
