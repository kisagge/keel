/**
 * 도형 원시 연산.
 *
 * 이 파일에는 캔버스도, 그래프도, 테마도 들어오지 않는다. 숫자만 다룬다.
 * 렌더러에서 틀리면 가장 찾기 어려운 것이 여기라서 — 화면에 아무것도 안 나오거나
 * 클릭이 몇 px 어긋나는 식으로 나타난다 — 전부 닫힌 꼴로 적고 검사로 묶는다.
 *
 * 좌표는 **월드 단위**다. 화면 px 로 바꾸는 것은 `viewport.ts` 의 일이다.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** `x`·`y` 는 왼쪽 위 모서리. 노드의 자리(중심)와 헷갈리지 않도록 이름을 나눠 둔다 */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** 아무것도 없는 장면의 경계. 크기가 0 이라 그려도 아무 일이 없다 */
export const EMPTY_RECT: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const ORIGIN: Point = { x: 0, y: 0 };

// 사각형

/** 중심과 크기로 사각형을 만든다. 노드는 늘 이 길로 들어온다 */
export function rectOf(center: Point, size: Size): Rect {
  return {
    x: center.x - size.width / 2,
    y: center.y - size.height / 2,
    width: size.width,
    height: size.height,
  };
}

export function rectCenter(r: Rect): Point {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

export function rectRight(r: Rect): number {
  return r.x + r.width;
}

export function rectBottom(r: Rect): number {
  return r.y + r.height;
}

export function rectSize(r: Rect): Size {
  return { width: r.width, height: r.height };
}

/** 닫힌 구간이다 — 테두리 위의 점도 안에 있는 것으로 본다 */
export function rectContains(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= rectRight(r) && p.y >= r.y && p.y <= rectBottom(r);
}

export function rectContainsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    rectRight(inner) <= rectRight(outer) &&
    rectBottom(inner) <= rectBottom(outer)
  );
}

/** 테두리만 스쳐도 겹친 것으로 본다. 컬링이 이것을 쓰므로 후하게 잡는 쪽이 맞다 */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x <= rectRight(b) && rectRight(a) >= b.x && a.y <= rectBottom(b) && rectBottom(a) >= b.y
  );
}

export function rectUnion(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(rectRight(a), rectRight(b)) - x,
    height: Math.max(rectBottom(a), rectBottom(b)) - y,
  };
}

/**
 * 여럿을 한 상자로. **하나도 없으면 `undefined`** 다.
 *
 * "빈 것"을 크기 0 인 사각형으로 돌려주면 원점에 유령 상자가 생겨, 빈 그룹이
 * 원점으로 끌려가거나 내용 경계가 늘 (0,0) 을 품게 된다. 없는 것은 없는 값으로
 * 말하게 해서 부르는 쪽이 반드시 갈라 보게 한다.
 */
export function unionAll(rects: Iterable<Rect>): Rect | undefined {
  let out: Rect | undefined;
  for (const r of rects) out = out === undefined ? r : rectUnion(out, r);
  return out;
}

/** `by` 가 음수면 줄인다. 줄이다 뒤집히면 0 에서 멈춘다 — 음수 크기를 내보내지 않는다 */
export function inflateRect(r: Rect, by: number): Rect {
  const width = Math.max(0, r.width + by * 2);
  const height = Math.max(0, r.height + by * 2);
  return {
    x: r.x + (r.width - width) / 2,
    y: r.y + (r.height - height) / 2,
    width,
    height,
  };
}

export function boundsOfPoints(points: Iterable<Point>): Rect | undefined {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let seen = false;

  for (const p of points) {
    seen = true;
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  if (!seen) return undefined;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// 점과 선분

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;

  // 길이 0 인 선분은 점이다. 0 으로 나누지 않는다
  if (lengthSquared === 0) return distance(p, a);

  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** 점이 하나뿐이면 그 점까지의 거리. 비었으면 `Infinity` — 절대 안 맞는다는 뜻 */
export function distanceToPolyline(p: Point, path: readonly Point[]): number {
  const first = path[0];
  if (first === undefined) return Number.POSITIVE_INFINITY;
  if (path.length === 1) return distance(p, first);

  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1];
    const b = path[i];
    if (a === undefined || b === undefined) continue;
    const d = distanceToSegment(p, a, b);
    if (d < best) best = d;
  }
  return best;
}

export function pathLength(path: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1];
    const b = path[i];
    if (a === undefined || b === undefined) continue;
    total += distance(a, b);
  }
  return total;
}

/**
 * 폴리라인을 따라 `length` 만큼 간 자리. 범위를 벗어나면 양 끝으로 물린다.
 * 엣지 라벨을 선 한가운데에 놓는 데 쓴다.
 */
export function pointAtLength(path: readonly Point[], length: number): Point {
  const first = path[0];
  if (first === undefined) return ORIGIN;
  if (length <= 0) return first;

  let remaining = length;
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1];
    const b = path[i];
    if (a === undefined || b === undefined) continue;

    const segment = distance(a, b);
    if (segment === 0) continue;
    if (remaining <= segment) {
      const t = remaining / segment;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    remaining -= segment;
  }

  return path[path.length - 1] ?? first;
}

/** 단위 법선. 길이가 0 이면 위쪽을 준다 — 겹친 노드에서도 라벨이 한 자리에 선다 */
export function segmentNormal(a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return { x: 0, y: -1 };
  return { x: -dy / length, y: dx / length };
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function addPoints(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function scalePoint(p: Point, by: number): Point {
  return { x: p.x * by, y: p.y * by };
}

/**
 * 중심에서 `toward` 쪽으로 쏜 반직선이 테두리와 만나는 점.
 *
 * 되풀이해서 찾지 않는다 — 가로·세로 중 먼저 닿는 쪽을 골라 한 번에 셈한다.
 * 그래서 **결과는 언제나 테두리 위**이고, 그것이 이 함수에 걸린 불변식이다.
 *
 * 두 노드가 같은 자리에 고정되면 방향이 없다. 그때는 중심을 돌려준다 —
 * 선이 점으로 줄어들 뿐, `NaN` 이 장면으로 새지 않는다.
 */
export function rectBorderPoint(rect: Rect, toward: Point): Point {
  const center = rectCenter(rect);
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;

  if (dx === 0 && dy === 0) return center;

  const halfWidth = rect.width / 2;
  const halfHeight = rect.height / 2;

  const tx = dx === 0 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(dx);
  const ty = dy === 0 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(dy);
  const t = Math.min(tx, ty);

  return { x: center.x + dx * t, y: center.y + dy * t };
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
