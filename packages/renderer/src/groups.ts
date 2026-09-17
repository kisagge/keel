import type { GraphGroup } from '@keel/graph';
import { ORIGIN, inflateRect, rectOf, unionAll } from './geometry.js';
import type { Point, Rect } from './geometry.js';
import { groupPadding } from './stopgap-layout.js';
import type { Theme } from './theme.js';
import { childGroupsOf, childNodesOf } from './tree.js';
import type { GroupTree } from './tree.js';

/**
 * 그룹 테두리를 **자손에서 유도한다.**
 *
 * 그룹에는 좌표가 없다. 있어서도 안 된다 — 그룹 자리를 따로 들면 노드를 하나
 * 옮길 때마다 테두리를 손으로 맞춰야 하고, 둘이 어긋난 순간 노드가 자기 그룹
 * 밖에 그려진다. 안에 있는 것들을 감싸면 어긋날 수가 없다.
 *
 * 깊은 것부터(post-order) 도는 이유는 하나다 — 부모가 감쌀 때 자식 테두리가
 * **이미 서 있어야** 한다. 얕은 것부터 돌면 자식 테두리를 두 번 세게 된다.
 *
 * 여백은 바깥으로 쌓인다. 세 겹 안에 있는 노드는 세 번의 테두리 안에 있으므로
 * 총 들여쓰기가 여백의 합이다. 그래서 깊어질수록 여백을 줄인다(24·18·12·…) —
 * 안 줄이면 깊은 중첩에서 테두리 사이가 허옇게 뜬다. 좁은 테두리가 "깊다" 로
 * 읽히는 것도 맞는 쪽이다.
 */

export interface PlacedGroup {
  readonly id: string;
  readonly group: GraphGroup;
  /** 테두리 바깥. 위쪽 라벨 띠를 포함한다 */
  readonly rect: Rect;
  /** 위쪽 라벨 띠. 히트테스트와 그리기가 이것을 본다 */
  readonly labelRect: Rect;
  /** 아래에 노드가 하나도 없다. 그릴 때 점선으로, 화면 쪽에서 안내에 쓴다 */
  readonly empty: boolean;
}

/**
 * **얕은 것부터** 돌려준다 — 그리는 순서다. 부모를 먼저 깔고 자식을 그 위에
 * 얹어야 중첩이 눈에 보인다.
 *
 * 전역 함수다. 자리를 못 찾는 그룹에도 유한한 상자를 준다 — `undefined` 나
 * `NaN` 을 돌려주면 렌더 루프가 없는 좌표를 찾는다.
 */
export function placeGroups(
  tree: GroupTree,
  nodeRectById: ReadonlyMap<string, Rect>,
  seeds: ReadonlyMap<string, Point>,
  theme: Theme,
): PlacedGroup[] {
  const placed = new Map<string, PlacedGroup>();

  for (const group of tree.postOrder) {
    const inner: Rect[] = [];

    for (const node of childNodesOf(tree, group.id)) {
      const rect = nodeRectById.get(node.id);
      if (rect !== undefined) inner.push(rect);
    }
    for (const child of childGroupsOf(tree, group.id)) {
      const childPlaced = placed.get(child.id);
      if (childPlaced !== undefined) inner.push(childPlaced.rect);
    }

    const bounds = unionAll(inner);
    const rect =
      bounds === undefined
        ? rectOf(seeds.get(group.id) ?? ORIGIN, theme.group.emptySize)
        : withLabelStrip(inflateRect(bounds, groupPadding(group.depth, theme)), theme);

    placed.set(group.id, {
      id: group.id,
      group,
      rect,
      labelRect: { x: rect.x, y: rect.y, width: rect.width, height: theme.group.labelHeight },
      empty: bounds === undefined,
    });
  }

  /**
   * post-order 를 뒤집으면 부모가 자식보다 앞선다 — 자손이 늘 먼저 오는 순서를
   * 뒤집었으니 그렇다. 따로 깊이로 정렬하지 않아도 그리는 순서가 나온다.
   */
  const out: PlacedGroup[] = [];
  for (let i = tree.postOrder.length - 1; i >= 0; i -= 1) {
    const group = tree.postOrder[i];
    if (group === undefined) continue;
    const it = placed.get(group.id);
    if (it !== undefined) out.push(it);
  }
  return out;
}

/** 라벨을 테두리 안쪽이 아니라 **위로 늘려서** 담는다. 안쪽에 두면 노드를 가린다 */
function withLabelStrip(rect: Rect, theme: Theme): Rect {
  return {
    x: rect.x,
    y: rect.y - theme.group.labelHeight,
    width: rect.width,
    height: rect.height + theme.group.labelHeight,
  };
}

/** 깊이에 따라 짙어지는 채움. 중첩을 따로 꾸미지 않고도 읽히게 한다 */
export function groupFillAlpha(depth: number, theme: Theme): number {
  return theme.group.fillAlpha + theme.group.fillAlphaPerDepth * depth;
}
