import { panBy, zoomAt } from '@keel/renderer';
import type { Point, Viewport } from '@keel/renderer';

/**
 * 휠과 트랙패드 핀치를 뷰포트로 옮긴다.
 *
 * 브라우저는 트랙패드 핀치를 **`ctrlKey` 가 켜진 휠 이벤트**로 보낸다. 실제로
 * Ctrl 을 누른 것과 구분할 방법이 없고, 구분할 필요도 없다 — 둘 다 "확대" 라는
 * 같은 뜻이다.
 *
 * DOM 이벤트가 아니라 세 숫자만 받으므로 Node 에서 그대로 검사된다.
 */

export interface WheelLike {
  readonly deltaX: number;
  readonly deltaY: number;
  readonly ctrlKey: boolean;
}

/** 휠 한 칸이 줌을 얼마나 바꾸는가. 지수로 걸어 어느 배율에서도 느낌이 같다 */
const ZOOM_PER_PIXEL = 1 / 250;

export function wheelToViewport(viewport: Viewport, e: WheelLike, cursor: Point): Viewport {
  if (e.ctrlKey) {
    return zoomAt(viewport, cursor, Math.exp(-e.deltaY * ZOOM_PER_PIXEL));
  }
  return panBy(viewport, -e.deltaX, -e.deltaY);
}
