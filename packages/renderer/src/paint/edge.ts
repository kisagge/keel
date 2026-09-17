import type { PlacedEdge } from '../edges.js';
import { edgeTextStyle } from '../edges.js';
import { fontString } from '../measure.js';
import type { Theme } from '../theme.js';
import type { Ctx2D } from './context.js';
import { polylinePath, trianglePath } from './shapes.js';

/**
 * 선과 화살촉과 라벨.
 *
 * 획을 화살촉 앞에서 자르지 않는다 — 채운 삼각형이 선 끝을 덮으므로 아래로
 * 지나간 획은 안 보인다. 다만 끝 마개는 `butt` 여야 한다. `round` 면 반원이
 * 꼭짓점 밖으로 삐져나온다.
 *
 * 라벨 뒤에는 배경색을 깔아 선 위에 글자가 겹쳐 읽히는 것을 막는다.
 */

export interface EdgePaintState {
  readonly selected: boolean;
  readonly hovered: boolean;
  readonly zoom: number;
}

export function paintEdge(
  ctx: Ctx2D,
  placed: PlacedEdge,
  theme: Theme,
  state: EdgePaintState,
): void {
  const color = state.selected
    ? theme.colors.selection
    : state.hovered
      ? theme.colors.hover
      : theme.colors.edge;

  ctx.save();
  ctx.setLineDash([]);
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.lineWidth = state.selected || state.hovered ? theme.selectionWidth / state.zoom : theme.edge.width;

  polylinePath(ctx, placed.path);
  ctx.stroke();

  if (placed.arrow) {
    trianglePath(ctx, placed.arrow.tip, placed.arrow.left, placed.arrow.right);
    ctx.fillStyle = color;
    ctx.fill();
  }

  if (placed.labelText !== undefined && placed.labelRect !== undefined) {
    const { labelRect } = placed;

    ctx.fillStyle = theme.colors.edgeLabelBackground;
    ctx.fillRect(labelRect.x - 2, labelRect.y, labelRect.width + 4, labelRect.height);

    ctx.fillStyle = theme.colors.edgeLabel;
    ctx.font = fontString(edgeTextStyle(theme));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      placed.labelText,
      labelRect.x + labelRect.width / 2,
      labelRect.y + labelRect.height / 2,
    );
  }

  ctx.restore();
}
