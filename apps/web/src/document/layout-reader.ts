import type { LayoutReader, Point } from '@keel/renderer';
import type * as Y from 'yjs';

/**
 * 레이아웃을 렌더러에 넘기는 통로.
 *
 * `@keel/renderer` 가 레이아웃을 `Map` 이 아니라 **읽기 하나짜리 인터페이스**로
 * 받는 값이 여기서 나온다. 원격 갱신이 올 때마다 1,000개를 복사하지 않아도
 * 되고, 끌고 있는 노드 하나만 다른 자리를 돌려주면 장면이 통째로 맞아떨어진다.
 */

export interface Drag {
  readonly id: string;
  readonly at: Point;
}

/** `Y.Map` 을 그대로 들여다본다. 복사하지 않으므로 나중에 들어온 자리도 보인다 */
export function yMapReader(layout: Y.Map<Point>): LayoutReader {
  return { get: (id) => layout.get(id) };
}

/**
 * 끌고 있는 노드에만 다른 자리를 씌운다.
 *
 * 덧그리는 유령 없이 장면이 맞아떨어지고, 그룹 테두리는 자손들의 직사각형
 * 합집합이므로 **끌리는 노드를 따라 움직인다** — 형제들에서 멀어지면 커지고,
 * 가까워지면 줄어든다.
 *
 * 끌고 있지 않으면 받은 것을 그대로 돌려준다 — 껍데기를 하나 더 만들지 않는다.
 */
export function withDrag(reader: LayoutReader, drag: Drag | undefined): LayoutReader {
  if (drag === undefined) return reader;
  return { get: (id) => (id === drag.id ? drag.at : reader.get(id)) };
}
