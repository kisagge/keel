import type { GraphEdge } from '@keel/graph';
import {
  EMPTY_RECT,
  boundsOfPoints,
  distance,
  inflateRect,
  midpoint,
  pathLength,
  pointAtLength,
  rectBorderPoint,
  rectCenter,
  rectRight,
  rectUnion,
  segmentNormal,
} from './geometry.js';
import type { Point, Rect } from './geometry.js';
import { truncateToWidth } from './measure.js';
import type { MeasureText, TextStyle } from './measure.js';
import type { Theme } from './theme.js';

/**
 * 선의 기하.
 *
 * ## 모든 선은 폴리라인이다
 *
 * 곧은 선 2점, 나란한 선 3점, 자기 고리 5점. 굳이 갈래를 나누지 않는 이유는
 * 앞날 때문이다 — ELK layered 는 꺾임점을 내놓는다. 폴리라인이면 그것이
 * **타입 변경 없이 그대로 들어온다.** 컬링도 히트테스트도 안 고쳐도 된다.
 *
 * ## 끝점은 노드 테두리에서 조금 떨어진다
 *
 * 선은 테두리에 닿기 `gap` 만큼 앞에서 멈춘다. 딱 붙으면 테두리 선과 엣지 선이
 * 겹쳐 두꺼워 보인다.
 *
 * 화살촉의 꼭짓점은 **폴리라인의 마지막 점 그대로**다. 선을 더 짧게 자르고
 * 화살촉을 따로 붙이지 않는다 — 채운 삼각형이 선 끝을 덮으므로 아래로 지나간
 * 획은 안 보이고, 자를 자리가 하나 줄면 짧은 선에서 뒤집히는 경우도 하나 준다.
 */

export interface ArrowHead {
  readonly tip: Point;
  readonly left: Point;
  readonly right: Point;
}

export interface PlacedEdge {
  readonly key: string;
  readonly edge: GraphEdge;
  readonly kind: 'straight' | 'self';
  /** 늘 폴리라인이다. 그리는 쪽은 이것만 잇는다 */
  readonly path: readonly Point[];
  /** `style === 'line'` 이면 없다 */
  readonly arrow: ArrowHead | undefined;
  readonly labelAnchor: Point | undefined;
  /** 라벨 폭에 맞춰 잘린 글자 */
  readonly labelText: string | undefined;
  /** 라벨이 실제로 차지하는 상자. 히트테스트가 라벨을 집을 때 본다 */
  readonly labelRect: Rect | undefined;
  /** 화살촉과 라벨까지 감싼 상자. 컬링과 격자 색인이 이것을 본다 */
  readonly bounds: Rect;
}

export function edgeTextStyle(theme: Theme): TextStyle {
  return {
    fontSize: theme.edge.labelFontSize,
    fontFamily: theme.node.fontFamily,
    fontWeight: 'normal',
  };
}

/**
 * 나란한 선을 묶는 열쇠는 **순서 없는 쌍**이다.
 *
 * `GraphEdge.key` 를 쪼개 쓰지 않는다 — 그 꼴은 `dsl` 의 사정이고, 무엇보다
 * 거기서는 `a -> b` 와 `b -> a` 가 다른 바구니라 둘이 겹친 채로 남는다.
 *
 * 사이에 빈칸을 두는 것으로 충분하다. id 에는 빈칸이 못 들어간다.
 */
function pairKey(from: string, to: string): string {
  return from <= to ? `${from} ${to}` : `${to} ${from}`;
}

export function placeEdges(
  edges: readonly GraphEdge[],
  nodeRectById: ReadonlyMap<string, Rect>,
  theme: Theme,
  measure: MeasureText,
): PlacedEdge[] {
  // 같은 두 노드를 잇는 선들을 모아 몇 번째인지 센다
  const buckets = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    const key = pairKey(edge.from, edge.to);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(edge);
    else buckets.set(key, [edge]);
  }

  const out: PlacedEdge[] = [];

  for (const edge of edges) {
    const fromRect = nodeRectById.get(edge.from);
    const toRect = nodeRectById.get(edge.to);
    // 자리 없는 노드에 걸린 선은 그리지 않는다. buildGraph 가 끝점은 이미 걸렀다
    if (fromRect === undefined || toRect === undefined) continue;

    const bucket = buckets.get(pairKey(edge.from, edge.to)) ?? [];
    const index = bucket.indexOf(edge);
    const offset = (index - (bucket.length - 1) / 2) * theme.edge.parallelOffset;

    if (edge.from === edge.to) {
      out.push(placeSelfEdge(edge, fromRect, theme, measure));
      continue;
    }

    /**
     * 법선은 **쌍의 정해진 방향**에서 뽑는다. 선이 제 방향에서 뽑으면
     * `a -> b` 와 `b -> a` 의 법선이 서로 뒤집혀 벌린 것이 그대로 상쇄된다 —
     * 둘이 같은 자리에 겹쳐 그려지고, 한 줄을 지워도 화면이 그대로다.
     */
    const lowRect = edge.from <= edge.to ? fromRect : toRect;
    const highRect = edge.from <= edge.to ? toRect : fromRect;
    const normal = segmentNormal(rectCenter(lowRect), rectCenter(highRect));

    out.push(placeStraightEdge(edge, fromRect, toRect, normal, offset, theme, measure));
  }

  return out;
}

function placeStraightEdge(
  edge: GraphEdge,
  fromRect: Rect,
  toRect: Rect,
  normal: Point,
  offset: number,
  theme: Theme,
  measure: MeasureText,
): PlacedEdge {
  const fromCenter = rectCenter(fromRect);
  const toCenter = rectCenter(toRect);

  /**
   * 벌리는 방법: 가운데 점을 법선 쪽으로 밀고 **양쪽 접점이 그 점을 겨누게** 한다.
   * 접점을 직접 밀면 테두리에서 벗어나므로, 겨누는 쪽만 옮긴다.
   */
  const mid = {
    x: (fromCenter.x + toCenter.x) / 2 + normal.x * offset,
    y: (fromCenter.y + toCenter.y) / 2 + normal.y * offset,
  };

  const start = rectBorderPoint(fromRect, mid);
  const end = rectBorderPoint(toRect, mid);
  const raw = offset === 0 ? [start, end] : [start, mid, end];
  const path = trimPath(raw, theme.edge.gap, theme.edge.gap, midpoint(fromCenter, toCenter));

  return finish(edge, 'straight', path, fromCenter, toCenter, theme, measure);
}

/**
 * 자기 자신을 가리키는 선.
 *
 * 파서는 `self-edge` 를 **경고로만** 남기고 엣지를 그대로 넣는다. 그러니
 * 렌더러가 안 그리면 사람이 친 줄이 화면에서 통째로 사라진다 — 잘못을 알리는
 * 방법으로 지우기를 고르면 안 된다.
 *
 * 위로 나가 오른쪽으로 들어오는 고리다. 자리를 고정해 두면 같은 노드에 걸린
 * 고리가 늘 같은 자리에 선다.
 */
export function selfLoopPath(rect: Rect, theme: Theme): Point[] {
  const center = rectCenter(rect);
  const exitX = center.x + rect.width / 4;
  const topY = rect.y - theme.edge.selfLoopHeight;
  const sideX = rectRight(rect) + theme.edge.selfLoopWidth;
  const enterY = center.y - rect.height / 4;

  return [
    { x: exitX, y: rect.y },
    { x: exitX, y: topY },
    { x: sideX, y: topY },
    { x: sideX, y: enterY },
    { x: rectRight(rect), y: enterY },
  ];
}

function placeSelfEdge(edge: GraphEdge, rect: Rect, theme: Theme, measure: MeasureText): PlacedEdge {
  const raw = selfLoopPath(rect, theme);
  const center = rectCenter(rect);
  const path = trimPath(raw, theme.edge.gap, theme.edge.gap, center);
  return finish(edge, 'self', path, center, center, theme, measure);
}

function finish(
  edge: GraphEdge,
  kind: 'straight' | 'self',
  path: readonly Point[],
  fromCenter: Point,
  toCenter: Point,
  theme: Theme,
  measure: MeasureText,
): PlacedEdge {
  const arrow =
    edge.style === 'arrow'
      ? arrowHeadOf(path, fallbackDirection(fromCenter, toCenter), theme)
      : undefined;

  const labelText =
    edge.label === undefined
      ? undefined
      : truncateToWidth(edge.label, theme.edge.labelMaxWidth, edgeTextStyle(theme), measure);

  const labelAnchor = labelText === undefined ? undefined : labelAnchorOf(path, theme);

  const labelRect =
    labelAnchor === undefined || labelText === undefined
      ? undefined
      : labelBounds(labelAnchor, labelText, theme, measure);

  const points = [...path];
  if (arrow) points.push(arrow.tip, arrow.left, arrow.right);

  let bounds = boundsOfPoints(points) ?? EMPTY_RECT;
  if (labelRect !== undefined) bounds = rectUnion(bounds, labelRect);

  return {
    key: edge.key,
    edge,
    kind,
    path,
    arrow,
    labelAnchor,
    labelText,
    labelRect,
    bounds: inflateRect(bounds, theme.edge.width),
  };
}

/**
 * 양 끝을 안쪽으로 당긴다.
 *
 * 당길 길이가 선보다 길면 한 점으로 오므린다. 두 노드를 같은 자리에 고정하면
 * 실제로 일어난다.
 *
 * 이 첫 줄은 **보험이다.** 빼도 `pointAtLength` 가 범위를 양 끝으로 물려 주므로
 * 지금은 결과가 같다(검사로 확인했다). 그래도 두는 이유는 뜻이 다르기 때문이다 —
 * 오므린다는 결정을 여기서 눈에 보이게 적어 두면, 나중에 `pointAtLength` 가
 * 물리기를 그만두거나 꺾임점이 늘어나도 이 자리가 조용히 뒤집히지 않는다.
 */
function trimPath(
  path: readonly Point[],
  startBy: number,
  endBy: number,
  collapseTo: Point,
): Point[] {
  const total = pathLength(path);
  if (path.length < 2 || total <= startBy + endBy) return [collapseTo, collapseTo];

  const from = startBy;
  const to = total - endBy;

  const out: Point[] = [pointAtLength(path, from)];

  let travelled = 0;
  for (let i = 1; i < path.length - 1; i += 1) {
    const previous = path[i - 1];
    const point = path[i];
    if (previous === undefined || point === undefined) continue;
    travelled += distance(previous, point);
    if (travelled > from && travelled < to) out.push(point);
  }

  out.push(pointAtLength(path, to));
  return out;
}

/** 길이가 0 인 선에서도 화살촉이 설 방향. 끝내 못 정하면 오른쪽을 본다 */
function fallbackDirection(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return { x: 1, y: 0 };
  return { x: dx / length, y: dy / length };
}

function arrowHeadOf(path: readonly Point[], fallback: Point, theme: Theme): ArrowHead {
  const tip = path[path.length - 1] ?? { x: 0, y: 0 };
  const previous = path[path.length - 2] ?? tip;

  const dx = tip.x - previous.x;
  const dy = tip.y - previous.y;
  const length = Math.hypot(dx, dy);
  const dir = length === 0 ? fallback : { x: dx / length, y: dy / length };

  const base = {
    x: tip.x - dir.x * theme.edge.arrowLength,
    y: tip.y - dir.y * theme.edge.arrowLength,
  };
  const half = theme.edge.arrowLength * Math.tan(theme.edge.arrowHalfAngle);

  return {
    tip,
    left: { x: base.x - dir.y * half, y: base.y + dir.x * half },
    right: { x: base.x + dir.y * half, y: base.y - dir.x * half },
  };
}

/** 선 한가운데에서 법선 쪽으로 비켜 둔다. 획 위에 글자가 앉으면 둘 다 안 읽힌다 */
function labelAnchorOf(path: readonly Point[], theme: Theme): Point {
  const total = pathLength(path);
  const middle = pointAtLength(path, total / 2);

  const before = pointAtLength(path, Math.max(0, total / 2 - 0.5));
  const after = pointAtLength(path, Math.min(total, total / 2 + 0.5));

  const normal = segmentNormal(before, after);
  // 늘 같은 쪽(위)으로 밀어 둔다. 선마다 위아래가 갈리면 눈이 따라가기 어렵다
  const up = normal.y > 0 ? { x: -normal.x, y: -normal.y } : normal;

  return {
    x: middle.x + up.x * theme.edge.labelOffset,
    y: middle.y + up.y * theme.edge.labelOffset,
  };
}

function labelBounds(anchor: Point, text: string, theme: Theme, measure: MeasureText): Rect {
  const width = measure(text, edgeTextStyle(theme));
  const height = theme.edge.labelFontSize * 1.4;
  return { x: anchor.x - width / 2, y: anchor.y - height / 2, width, height };
}
