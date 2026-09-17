import { rectBottom } from '../geometry.js';
import { groupFillAlpha } from '../groups.js';
import type { PlacedGroup } from '../groups.js';
import { fontString } from '../measure.js';
import type { Theme } from '../theme.js';
import type { Ctx2D } from './context.js';
import { roundRectPath } from './shapes.js';

/**
 * 그룹 테두리와 라벨.
 *
 * 채움의 짙기가 깊이를 따라간다 — 중첩을 따로 꾸미지 않고도 몇 겹인지 읽힌다.
 *
 * **여기서 글자를 지어내지 않는다.** 빈 그룹에 "(비어 있음)" 같은 안내를 붙이는
 * 것은 화면의 일이고, 그것은 말이 붙는 순간 번역거리가 된다. 렌더러는
 * `PlacedGroup.empty` 를 내놓고 무엇을 쓸지는 `apps/web` 이 정한다.
 */

export interface GroupPaintState {
  readonly selected: boolean;
  readonly hovered: boolean;
  readonly zoom: number;
}

export function paintGroup(
  ctx: Ctx2D,
  placed: PlacedGroup,
  theme: Theme,
  state: GroupPaintState,
): void {
  ctx.save();

  roundRectPath(ctx, placed.rect, theme.group.radius);
  ctx.globalAlpha = groupFillAlpha(placed.group.depth, theme);
  ctx.fillStyle = theme.colors.groupFill;
  ctx.fill();
  ctx.globalAlpha = 1;

  // 빈 그룹은 점선으로 — 아직 아무것도 안 들었다는 표시
  ctx.setLineDash(placed.empty ? [5, 4] : []);
  ctx.strokeStyle = state.selected
    ? theme.colors.selection
    : state.hovered
      ? theme.colors.hover
      : theme.colors.groupBorder;
  ctx.lineWidth = state.selected || state.hovered
    ? theme.selectionWidth / state.zoom
    : theme.group.borderWidth;
  ctx.stroke();
  ctx.setLineDash([]);

  paintLabel(ctx, placed, theme);

  ctx.restore();
}

function paintLabel(ctx: Ctx2D, placed: PlacedGroup, theme: Theme): void {
  ctx.fillStyle = theme.colors.groupLabel;
  ctx.font = fontString({
    fontSize: theme.group.fontSize,
    fontFamily: theme.node.fontFamily,
    fontWeight: 'bold',
  });
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    placed.group.label,
    placed.labelRect.x + theme.group.radius,
    placed.labelRect.y + placed.labelRect.height / 2,
  );
}

/** 라벨 띠의 아래끝 — 검사에서 쓴다 */
export function groupLabelBottom(placed: PlacedGroup): number {
  return rectBottom(placed.labelRect);
}
