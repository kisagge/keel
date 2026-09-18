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
  /** `WheelEvent.deltaMode` — 0 픽셀, 1 줄, 2 쪽 */
  readonly deltaMode: number;
  readonly ctrlKey: boolean;
}

/** 휠 한 칸이 줌을 얼마나 바꾸는가. 지수로 걸어 어느 배율에서도 느낌이 같다 */
const ZOOM_PER_PIXEL = 1 / 250;

/**
 * **델타의 단위가 브라우저마다 다르다.**
 *
 * Chrome·Safari 는 픽셀로 보내지만 Firefox 는 마우스 휠을 **줄 단위**로 보낸다
 * (`deltaMode: 1`, 한 칸에 `deltaY ≈ 3`). 그것을 픽셀로 읽으면 한 칸에 3px 가
 * 밀려, Firefox 에서는 화면이 아예 안 움직이는 것처럼 보인다.
 *
 * 줄 높이와 쪽 높이는 브라우저가 안 알려 주므로 어림값을 쓴다. 정확할 필요가
 * 없다 — 사람이 "한 칸에 이만큼" 을 느끼기만 하면 된다.
 */
const PIXELS_PER_LINE = 16;
const PIXELS_PER_PAGE = 400;

function toPixels(delta: number, deltaMode: number): number {
  if (deltaMode === 1) return delta * PIXELS_PER_LINE;
  if (deltaMode === 2) return delta * PIXELS_PER_PAGE;
  return delta;
}

export function wheelToViewport(viewport: Viewport, e: WheelLike, cursor: Point): Viewport {
  const deltaY = toPixels(e.deltaY, e.deltaMode);
  if (e.ctrlKey) {
    return zoomAt(viewport, cursor, Math.exp(-deltaY * ZOOM_PER_PIXEL));
  }
  return panBy(viewport, -toPixels(e.deltaX, e.deltaMode), -deltaY);
}
