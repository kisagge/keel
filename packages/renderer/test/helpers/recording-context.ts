import type { Ctx2D, LineCap, LineJoin, TextAlign, TextBaseline } from '../../src/paint/context.js';

/**
 * 호출을 받아 적는 가짜 컨텍스트.
 *
 * jsdom 도 브라우저도 없이 "무엇을 어떤 순서로 그렸나" 를 보게 해 준다. 이것이
 * `Ctx2D` 를 구조적으로 적어 둔 값어치다 — 그리기까지 Node 에서 검사된다.
 */

export interface Call {
  readonly op: string;
  readonly args: readonly unknown[];
  /** 그 호출 시점의 속성들. 색과 굵기를 뒤늦게 확인할 수 있다 */
  readonly style: Readonly<Record<string, unknown>>;
}

export class RecordingContext implements Ctx2D {
  readonly calls: Call[] = [];

  fillStyle: string | object = '#000';
  strokeStyle: string | object = '#000';
  lineWidth = 1;
  lineCap: LineCap = 'butt';
  lineJoin: LineJoin = 'miter';
  globalAlpha = 1;
  font = '';
  textAlign: TextAlign = 'start';
  textBaseline: TextBaseline = 'alphabetic';

  private record(op: string, ...args: unknown[]): void {
    this.calls.push({
      op,
      args,
      style: {
        fillStyle: this.fillStyle,
        strokeStyle: this.strokeStyle,
        lineWidth: this.lineWidth,
        globalAlpha: this.globalAlpha,
        font: this.font,
        lineCap: this.lineCap,
      },
    });
  }

  save(): void {
    this.record('save');
  }
  restore(): void {
    this.record('restore');
  }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.record('setTransform', a, b, c, d, e, f);
  }
  clearRect(x: number, y: number, w: number, h: number): void {
    this.record('clearRect', x, y, w, h);
  }
  beginPath(): void {
    this.record('beginPath');
  }
  closePath(): void {
    this.record('closePath');
  }
  moveTo(x: number, y: number): void {
    this.record('moveTo', x, y);
  }
  lineTo(x: number, y: number): void {
    this.record('lineTo', x, y);
  }
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void {
    this.record('quadraticCurveTo', cpx, cpy, x, y);
  }
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void {
    this.record('arcTo', x1, y1, x2, y2, radius);
  }
  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean,
  ): void {
    this.record('ellipse', x, y, radiusX, radiusY, rotation, startAngle, endAngle, counterclockwise);
  }
  fill(): void {
    this.record('fill');
  }
  stroke(): void {
    this.record('stroke');
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    this.record('fillRect', x, y, w, h);
  }
  fillText(text: string, x: number, y: number): void {
    this.record('fillText', text, x, y);
  }
  measureText(text: string): { readonly width: number } {
    this.record('measureText', text);
    return { width: text.length * 7 };
  }
  setLineDash(segments: readonly number[]): void {
    this.record('setLineDash', [...segments]);
  }

  ops(): string[] {
    return this.calls.map((c) => c.op);
  }

  of(op: string): Call[] {
    return this.calls.filter((c) => c.op === op);
  }

  texts(): string[] {
    return this.of('fillText').map((c) => String(c.args[0]));
  }

  /** save 와 restore 의 짝이 맞는지, 도중에 음수로 내려가지 않는지 */
  depthProblem(): string | undefined {
    let depth = 0;
    for (const call of this.calls) {
      if (call.op === 'save') depth += 1;
      if (call.op === 'restore') {
        depth -= 1;
        if (depth < 0) return 'restore 가 save 보다 많다';
      }
    }
    return depth === 0 ? undefined : `save 가 ${depth} 개 남았다`;
  }

  /** 기록된 어떤 인자도 NaN·Infinity 가 아니어야 한다 */
  badNumber(): { op: string; value: number } | undefined {
    for (const call of this.calls) {
      for (const arg of call.args) {
        if (typeof arg === 'number' && !Number.isFinite(arg)) {
          return { op: call.op, value: arg };
        }
      }
    }
    return undefined;
  }
}
