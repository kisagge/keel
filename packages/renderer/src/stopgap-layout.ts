import type { Point, Size } from './geometry.js';
import type { Theme } from './theme.js';
import { childGroupsOf, childNodesOf } from './tree.js';
import type { GroupTree } from './tree.js';

/**
 * ELK 가 들어오기 전까지만 쓰는 **임시** 배치.
 *
 * 자동 레이아웃이 아니다. 겹치지 않고 결정적이라는 것 말고는 아무것도 약속하지
 * 않는다 — 선이 어떻게 흐르는지, 층이 어떻게 갈리는지는 보지 않는다.
 * README 의 `아직 안 한 것 > 자동 레이아웃` 이 들어오면 **이 파일은 지운다.**
 *
 * 솔직한 한계를 적어 둔다: 여기서는 모든 노드에 자리를 주고, 사람이 옮긴 노드가
 * 그 위를 덮어쓴다. 그래서 **고정된 노드가 임시 배치된 노드 위에 앉을 수 있다.**
 * 그것이 ELK 항목의 "신규 노드만 배치" 가 풀 문제다. 여기서 반쯤 풀지 않는다.
 */

export interface StopgapResult {
  readonly centers: ReadonlyMap<string, Point>;
  /** 노드가 하나도 없는 그룹이 앉을 자리 (상자의 중심) */
  readonly emptyGroupSeeds: ReadonlyMap<string, Point>;
}

export function groupPadding(depth: number, theme: Theme): number {
  return Math.max(theme.group.minPadding, theme.group.padding - theme.group.paddingPerDepth * depth);
}

export function stopgapPlacement(
  tree: GroupTree,
  sizes: ReadonlyMap<string, Size>,
  theme: Theme,
): StopgapResult {
  const centers = new Map<string, Point>();
  const emptyGroupSeeds = new Map<string, Point>();
  const { gap, columns } = theme.stopgap;

  /**
   * 한 그릇을 채우고 **채운 넓이**를 돌려준다. 아무것도 안 놓았으면 `undefined` —
   * 빈 그룹을 크기 0 으로 돌려주면 부모가 그것을 진짜 내용으로 알고 겹쳐 쌓는다.
   */
  const place = (
    containerId: string | undefined,
    originX: number,
    originY: number,
  ): Size | undefined => {
    let y = originY;
    let widest = 0;
    let placed = false;

    const nodes = childNodesOf(tree, containerId);
    for (let start = 0; start < nodes.length; start += columns) {
      const row = nodes.slice(start, start + columns);

      let rowHeight = 0;
      for (const n of row) rowHeight = Math.max(rowHeight, sizes.get(n.id)?.height ?? 0);

      let x = originX;
      for (const n of row) {
        const size = sizes.get(n.id);
        if (size === undefined) continue;
        centers.set(n.id, { x: x + size.width / 2, y: y + rowHeight / 2 });
        x += size.width + gap;
      }

      widest = Math.max(widest, x - originX - gap);
      y += rowHeight + gap;
      placed = true;
    }

    for (const child of childGroupsOf(tree, containerId)) {
      const pad = groupPadding(child.depth, theme);
      const inner = place(child.id, originX + pad, y + pad + theme.group.labelHeight);

      let blockWidth: number;
      let blockHeight: number;

      if (inner === undefined) {
        // 빈 그룹. 자리만 잡아 두고 테두리는 `groups.ts` 가 여기에 앉힌다
        const { width, height } = theme.group.emptySize;
        emptyGroupSeeds.set(child.id, { x: originX + width / 2, y: y + height / 2 });
        blockWidth = width;
        blockHeight = height;
      } else {
        blockWidth = inner.width + pad * 2;
        blockHeight = inner.height + pad * 2 + theme.group.labelHeight;
      }

      widest = Math.max(widest, blockWidth);
      y += blockHeight + gap;
      placed = true;
    }

    if (!placed) return undefined;
    return { width: widest, height: y - originY - gap };
  };

  place(undefined, 0, 0);

  return { centers, emptyGroupSeeds };
}
