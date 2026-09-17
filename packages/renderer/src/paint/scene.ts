import { cullScene } from '../cull.js';
import type { VisibleScene } from '../cull.js';
import type { Size } from '../geometry.js';
import type { Scene } from '../scene.js';
import type { Theme } from '../theme.js';
import {
  canvasPixelSize,
  clampDevicePixelRatio,
  viewportMatrix,
  visibleWorldRect,
} from '../viewport.js';
import type { Viewport } from '../viewport.js';
import type { Ctx2D } from './context.js';
import { paintEdge } from './edge.js';
import { paintGroup } from './group.js';
import { paintNode } from './node.js';

/**
 * 장면을 캔버스에 그린다.
 *
 * ## 캔버스 엘리먼트를 만지지 않는다
 *
 * 여기는 컨텍스트와 숫자만 받는다. 엘리먼트를 만들고 `width`/`height` 를 정하고
 * RAF 루프를 도는 것은 `apps/web` 의 일이다. 그래야 이 패키지가 브라우저와
 * 워커와 서버에서 같은 코드로 돈다.
 *
 * ## 변환을 건 다음은 전부 월드 좌표다
 *
 * 글자 크기도 월드 단위라 줌을 따라 커진다. 선명함은 `dpr` 을 변환에 접어
 * 넣는 것으로 공짜로 얻는다.
 *
 * 다만 **그림이 아니라 조작을 위한 표시**(고른 테두리, 가리킨 테두리)는 줌으로
 * 나눠 화면에서 두께가 일정하게 한다. 안 나누면 축소했을 때 실처럼 얇아진다.
 *
 * ## 그리는 순서는 그룹(얕은→깊은) → 엣지 → 노드
 *
 * 히트테스트는 이 순서를 뒤집어 훑는다. 둘이 갈라지면 "보이는 것과 다른 것이
 * 잡히는" 상태가 되므로, 무엇을 어떤 차례로 그리는지를 `paintOrder` 로 내놓아
 * 검사가 두 쪽을 맞대어 볼 수 있게 했다.
 */

export interface PaintOptions {
  readonly theme?: Theme | undefined;
  /**
   * 고른 것들의 id. 노드·그룹 id 와 엣지 key 를 한 자루에 담아도 안전하다 —
   * 파서가 `duplicate-id` 를 잡아 노드와 그룹 id 가 겹치지 않고, 엣지 key 에는
   * 빈칸이 들어 있어 id 와 절대 같아지지 않는다.
   *
   * 나중에 여러 명이 함께 볼 때는 `ReadonlyMap<string, string>`(id → 사람 색)이
   * 필요해진다. 지금 넓히지 않는 이유는 소비자가 `apps/web` 하나뿐이라 그때
   * 바꾸는 값이 싸기 때문이다.
   */
  readonly selection?: ReadonlySet<string> | undefined;
  readonly hovered?: string | undefined;
  readonly devicePixelRatio?: number | undefined;
  /** `false` 면 배경을 안 지운다. 기본 `true` */
  readonly clear?: boolean | undefined;
}

export type PaintKind = 'group' | 'edge' | 'node';

export interface PaintItem {
  readonly kind: PaintKind;
  readonly id: string;
}

/**
 * 그릴 것들을 그리는 차례대로.
 *
 * `paintScene` 이 실제로 이 순서로 돈다. 검사는 이것과 `hitTest` 를 맞대어
 * "어떤 점 위에 마지막으로 그려진 것" 과 "그 점에서 잡히는 것" 이 같은지 본다.
 */
export function paintOrder(visible: VisibleScene): PaintItem[] {
  return [
    ...visible.groups.map((g): PaintItem => ({ kind: 'group', id: g.id })),
    ...visible.edges.map((e): PaintItem => ({ kind: 'edge', id: e.key })),
    ...visible.nodes.map((n): PaintItem => ({ kind: 'node', id: n.id })),
  ];
}

export function paintScene(
  ctx: Ctx2D,
  scene: Scene,
  viewport: Viewport,
  screen: Size,
  options: PaintOptions = {},
): void {
  const theme = options.theme ?? scene.theme;
  const selection = options.selection ?? EMPTY_SELECTION;
  const dpr = clampDevicePixelRatio(options.devicePixelRatio ?? 1);

  ctx.save();

  // 배경은 변환을 걸기 전에, 캔버스 픽셀 좌표로 칠한다
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (options.clear ?? true) {
    const pixels = canvasPixelSize(screen, dpr);
    ctx.clearRect(0, 0, pixels.width, pixels.height);
    ctx.fillStyle = theme.colors.background;
    ctx.fillRect(0, 0, pixels.width, pixels.height);
  }

  const m = viewportMatrix(viewport, dpr);
  ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);

  const visible = cullScene(scene, visibleWorldRect(viewport, screen));
  const state = { zoom: viewport.zoom };

  for (const group of visible.groups) {
    paintGroup(ctx, group, theme, {
      ...state,
      selected: selection.has(group.id),
      hovered: options.hovered === group.id,
    });
  }

  for (const edge of visible.edges) {
    paintEdge(ctx, edge, theme, {
      ...state,
      selected: selection.has(edge.key),
      hovered: options.hovered === edge.key,
    });
  }

  for (const node of visible.nodes) {
    paintNode(ctx, node, theme, {
      ...state,
      selected: selection.has(node.id),
      hovered: options.hovered === node.id,
    });
  }

  ctx.restore();
}

const EMPTY_SELECTION: ReadonlySet<string> = new Set<string>();
