import { fontString } from '../measure.js';
import type { MeasureText } from '../measure.js';
import type { MeasuringContext } from './context.js';

/**
 * 진짜 캔버스로 재기.
 *
 * **반드시 `memoizeMeasure` 로 감싸서 쓴다.** 프레임마다 `measureText` 를 다시
 * 부르는 것은 캔버스에서 가장 흔한 느려짐이다.
 *
 * 그리고 **ELK 워커 안에서는 이것을 쓸 수 없다** — 워커에는 캔버스가 없다.
 * 어림 측정기로 대신하면 본체와 어긋나 레이아웃이 돌아올 때마다 기하가 밀린다.
 * 본체가 여기서 재서 크기를 워커에 **넣어 주는** 쪽이 맞다.
 */
export function contextMeasureText(ctx: MeasuringContext): MeasureText {
  return (text, style) => {
    ctx.font = fontString(style);
    return ctx.measureText(text).width;
  };
}
