/**
 * 우리가 실제로 부르는 만큼만 적은 2D 컨텍스트.
 *
 * **`lib: ["DOM"]` 을 켜지 않는다.** 이유가 셋 있고 순서대로다.
 *
 * 1. README 가 이미 적어 두었다 — "나중에 서버가 OG 썸네일을 그릴 때도 같은
 *    코드를 쓴다". 서버는 node-canvas 를 쓰는데 그 컨텍스트는
 *    `CanvasRenderingContext2D` 가 **아니다.** DOM 타입으로 못 박으면 서버 쪽
 *    호출마다 단언이 붙는다. 구조적으로 적으면 브라우저·워커·node-canvas
 *    셋 다 단언 없이 만족한다.
 * 2. **그리기까지 Node 에서 검사할 수 있다.** 호출을 기록하는 가짜 컨텍스트를
 *    넣으면 jsdom 없이 "무엇을 어떤 순서로 그렸나" 를 볼 수 있다.
 * 3. tsconfig 가 dsl·graph 와 똑같이 남는다.
 *
 * 대가는 이 목록을 손으로 드는 것이다. 그래서 작게 유지한다 — `roundRect` 를
 * 안 쓰고 `arcTo` 로 모서리를 만드는 것도 그 때문이다(node-canvas 에는
 * `roundRect` 가 없다). `apps/web` 이 생기면 경계에 한 줄
 * `const _ok: Ctx2D = canvas.getContext('2d')!;` 를 둬서, 브라우저 타입이
 * 어긋나면 **거기서** 컴파일이 깨지게 한다.
 */

export type TextAlign = 'left' | 'right' | 'center' | 'start' | 'end';
export type TextBaseline = 'top' | 'middle' | 'alphabetic' | 'bottom' | 'hanging' | 'ideographic';
export type LineCap = 'butt' | 'round' | 'square';
export type LineJoin = 'round' | 'bevel' | 'miter';

export interface TextMetricsLike {
  readonly width: number;
}

export interface Ctx2D {
  /**
   * 진짜 `fillStyle` 은 그라디언트와 패턴도 받는다. 우리는 문자열만 쓰지만
   * 타입을 `string` 으로 좁히면 속성이 공변으로 검사되어
   * `CanvasRenderingContext2D` 가 이 인터페이스에 **대입되지 않는다.**
   */
  fillStyle: string | object;
  strokeStyle: string | object;
  lineWidth: number;
  lineCap: LineCap;
  lineJoin: LineJoin;
  globalAlpha: number;
  font: string;
  textAlign: TextAlign;
  textBaseline: TextBaseline;

  save(): void;
  restore(): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;

  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean,
  ): void;

  fill(): void;
  stroke(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): TextMetricsLike;
  setLineDash(segments: readonly number[]): void;
}

/** 글자를 재는 데만 쓰는 조각. 캔버스 하나를 통째로 넘기지 않아도 된다 */
export interface MeasuringContext {
  font: string;
  measureText(text: string): TextMetricsLike;
}
