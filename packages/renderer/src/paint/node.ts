import type { NodeKind } from '@keel/dsl';
import { rectBottom, rectCenter, rectRight } from '../geometry.js';
import type { Rect } from '../geometry.js';
import { fontString } from '../measure.js';
import { nodeTextStyle } from '../node-box.js';
import type { PlacedNode } from '../scene.js';
import type { Theme } from '../theme.js';
import type { Ctx2D } from './context.js';
import { ellipsePath, roundRectPath } from './shapes.js';

/**
 * 노드를 그린다.
 *
 * 종류별 갈래에 **`default` 를 두지 않고** `assertNever` 로 끝낸다. DSL 에
 * 종류가 늘면 여기서 컴파일이 깨진다 — 새 종류가 조용히 맨 상자로 그려지는
 * 대신, 고쳐야 할 자리가 빌드에서 튀어나온다.
 *
 * 높이는 모든 종류가 같다. `db` 의 원통 뚜껑도 상자를 키우지 않고 **안쪽에**
 * 그린다 — 종류마다 높이가 다르면 접점·그룹 경계·히트테스트가 전부 종류를
 * 따져야 한다.
 */

export interface NodePaintState {
  readonly selected: boolean;
  readonly hovered: boolean;
  /** 화면에서 두께가 일정해야 하는 표시를 위해. 월드 굵기를 이것으로 나눈다 */
  readonly zoom: number;
}

function assertNever(value: never): never {
  throw new Error(`빠뜨린 노드 종류: ${String(value)}`);
}

export function paintNode(
  ctx: Ctx2D,
  placed: PlacedNode,
  theme: Theme,
  state: NodePaintState,
): void {
  const { rect } = placed;
  const accent = theme.colors.kind[placed.node.kind];

  ctx.save();

  // 선언 없이 생긴 노드는 옅게. 진단 목록과 화면이 같은 말을 하게 한다
  if (placed.node.implicit) ctx.globalAlpha = theme.node.implicitAlpha;

  paintShape(ctx, placed.node.kind, rect, theme, accent);
  paintLabel(ctx, placed, theme);

  ctx.restore();

  if (state.selected || state.hovered) {
    paintRing(ctx, rect, theme, state);
  }
}

function paintShape(
  ctx: Ctx2D,
  kind: NodeKind,
  rect: Rect,
  theme: Theme,
  accent: string,
): void {
  ctx.lineWidth = theme.node.borderWidth;
  ctx.setLineDash([]);

  switch (kind) {
    case 'service': {
      fillAndStroke(ctx, rect, theme.node.radius, theme.colors.surface, theme.colors.border, theme);
      paintAccentBar(ctx, rect, theme, accent);
      return;
    }

    case 'db': {
      fillAndStroke(ctx, rect, theme.node.radius, theme.colors.surface, theme.colors.border, theme);
      paintCylinderCaps(ctx, rect, theme, accent);
      return;
    }

    case 'queue': {
      fillAndStroke(ctx, rect, 2, theme.colors.surface, theme.colors.border, theme);
      paintQueueSlots(ctx, rect, theme, accent);
      return;
    }

    case 'external': {
      // 밖의 것은 점선으로. 우리가 못 고치는 것이라는 표시다
      ctx.setLineDash([6, 4]);
      fillAndStroke(ctx, rect, theme.node.radius, theme.colors.background, accent, theme);
      ctx.setLineDash([]);
      return;
    }

    case 'actor': {
      fillAndStroke(ctx, rect, rect.height / 2, theme.colors.surface, theme.colors.border, theme);
      paintActorHead(ctx, rect, theme, accent);
      return;
    }

    default:
      return assertNever(kind);
  }
}

function fillAndStroke(
  ctx: Ctx2D,
  rect: Rect,
  radius: number,
  fill: string,
  stroke: string,
  theme: Theme,
): void {
  roundRectPath(ctx, rect, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = theme.node.borderWidth;
  ctx.stroke();
}

/** 왼쪽 종류 색 띠 */
function paintAccentBar(ctx: Ctx2D, rect: Rect, theme: Theme, accent: string): void {
  ctx.fillStyle = accent;
  ctx.fillRect(rect.x, rect.y + theme.node.radius, theme.node.accentWidth, rect.height - theme.node.radius * 2);
}

/** 상자 **안쪽**에 뚜껑을 그려 원통으로 보이게 한다 */
function paintCylinderCaps(ctx: Ctx2D, rect: Rect, theme: Theme, accent: string): void {
  const radiusX = rect.width / 2 - theme.node.borderWidth;
  const radiusY = 5;

  ctx.strokeStyle = accent;
  ctx.lineWidth = theme.node.borderWidth;

  ellipsePath(ctx, { x: rect.x + rect.width / 2, y: rect.y + radiusY + 2 }, radiusX, radiusY);
  ctx.stroke();

  ellipsePath(ctx, { x: rect.x + rect.width / 2, y: rectBottom(rect) - radiusY - 2 }, radiusX, radiusY);
  ctx.stroke();
}

/** 왼쪽에 칸막이 두 줄 */
function paintQueueSlots(ctx: Ctx2D, rect: Rect, theme: Theme, accent: string): void {
  ctx.strokeStyle = accent;
  ctx.lineWidth = theme.node.borderWidth;

  for (const offset of [8, 14]) {
    ctx.beginPath();
    ctx.moveTo(rect.x + offset, rect.y + 4);
    ctx.lineTo(rect.x + offset, rectBottom(rect) - 4);
    ctx.stroke();
  }
}

/** 왼쪽에 작은 머리 원 — 사람이라는 표시 */
function paintActorHead(ctx: Ctx2D, rect: Rect, theme: Theme, accent: string): void {
  ctx.strokeStyle = accent;
  ctx.lineWidth = theme.node.borderWidth;
  ellipsePath(ctx, { x: rect.x + 14, y: rect.y + rect.height / 2 }, 5, 5);
  ctx.stroke();
}

function paintLabel(ctx: Ctx2D, placed: PlacedNode, theme: Theme): void {
  const center = rectCenter(placed.rect);

  ctx.fillStyle = placed.node.implicit ? theme.colors.mutedText : theme.colors.text;
  ctx.font = fontString(nodeTextStyle(theme));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // 잘린 글자는 크기를 정할 때 이미 나왔다. 여기서 다시 재지 않는다
  ctx.fillText(placed.label, center.x, center.y);
}

/**
 * 고른 표시와 가리킨 표시.
 *
 * 그림의 일부가 아니라 조작을 위한 것이므로 **줌으로 나눠** 화면에서 두께가
 * 일정하게 한다. 안 나누면 축소했을 때 표시가 실처럼 얇아져 안 보인다.
 */
function paintRing(ctx: Ctx2D, rect: Rect, theme: Theme, state: NodePaintState): void {
  ctx.save();
  ctx.setLineDash([]);
  ctx.strokeStyle = state.selected ? theme.colors.selection : theme.colors.hover;
  ctx.lineWidth = theme.selectionWidth / state.zoom;

  const inset = -ctx.lineWidth;
  roundRectPath(
    ctx,
    {
      x: rect.x + inset,
      y: rect.y + inset,
      width: rect.width - inset * 2,
      height: rect.height - inset * 2,
    },
    theme.node.radius,
  );
  ctx.stroke();
  ctx.restore();
}

/** 오른쪽 끝 — 검사에서 상자 범위를 볼 때 쓴다 */
export function nodeRight(placed: PlacedNode): number {
  return rectRight(placed.rect);
}
