import { distance, panBy } from '@keel/renderer';
import type { Hit, Point, Viewport } from '@keel/renderer';

/**
 * 포인터 제스처 상태 기계.
 *
 * DOM 이벤트도 React 도 안 받는다 — `{ screen, world }` 두 점만 받는 우리
 * 타입이다. 그래서 Node 에서 그대로 검사되고, 화면 쪽은 이벤트를 이 모양으로
 * 옮겨 담기만 한다.
 *
 * 문턱이 이 파일의 존재 이유다. 누르자마자 끌기로 치면 "고르려고 눌렀는데 1px
 * 밀려서 노드가 움직이는" 일이 나고, 손이 떨리는 사람에게는 노드를 고를 방법이
 * 아예 없어진다.
 */

/** 이만큼 화면에서 움직이기 전까지는 끌기가 아니다 */
export const DRAG_THRESHOLD = 4;

export interface PointerLike {
  readonly screen: Point;
  readonly world: Point;
}

export type Gesture =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'pressed';
      readonly screen: Point;
      readonly world: Point;
      readonly hit: Hit | undefined;
      readonly viewport: Viewport;
    }
  | { readonly kind: 'dragging'; readonly nodeId: string; readonly grabOffset: Point }
  | { readonly kind: 'panning'; readonly from: Point; readonly viewport: Viewport };

export type Intent =
  | { readonly kind: 'none' }
  | { readonly kind: 'select'; readonly hit: Hit | undefined }
  | { readonly kind: 'drag-move'; readonly nodeId: string; readonly at: Point }
  | { readonly kind: 'pan'; readonly viewport: Viewport }
  | { readonly kind: 'commit-drag'; readonly nodeId: string; readonly at: Point };

export const IDLE: Gesture = { kind: 'idle' };

const NOTHING: Intent = { kind: 'none' };

export function onPointerDown(
  _gesture: Gesture,
  e: PointerLike,
  hit: Hit | undefined,
  viewport: Viewport,
): Gesture {
  return { kind: 'pressed', screen: e.screen, world: e.world, hit, viewport };
}

export function onPointerMove(
  gesture: Gesture,
  e: PointerLike,
): { gesture: Gesture; intent: Intent } {
  switch (gesture.kind) {
    case 'idle':
      return { gesture, intent: NOTHING };

    case 'pressed': {
      if (distance(gesture.screen, e.screen) <= DRAG_THRESHOLD) {
        return { gesture, intent: NOTHING };
      }

      // 노드를 잡았을 때만 끌기다. 선·그룹·배경을 잡았으면 화면을 미는 것이다
      if (gesture.hit?.kind === 'node') {
        const { node } = gesture.hit;
        const grabOffset = {
          x: node.center.x - gesture.world.x,
          y: node.center.y - gesture.world.y,
        };
        const next: Gesture = { kind: 'dragging', nodeId: node.id, grabOffset };
        return { gesture: next, intent: dragMove(next, e) };
      }

      const next: Gesture = { kind: 'panning', from: gesture.screen, viewport: gesture.viewport };
      return { gesture: next, intent: pan(next, e) };
    }

    case 'dragging':
      return { gesture, intent: dragMove(gesture, e) };

    case 'panning':
      return { gesture, intent: pan(gesture, e) };
  }
}

export function onPointerUp(
  gesture: Gesture,
  e: PointerLike,
): { gesture: Gesture; intent: Intent } {
  switch (gesture.kind) {
    case 'idle':
      return { gesture: IDLE, intent: NOTHING };

    // 문턱을 안 넘고 뗐다 = 끌기가 아니라 고르기
    case 'pressed':
      return { gesture: IDLE, intent: { kind: 'select', hit: gesture.hit } };

    case 'dragging': {
      const moved = dragMove(gesture, e);
      return {
        gesture: IDLE,
        intent:
          moved.kind === 'drag-move'
            ? { kind: 'commit-drag', nodeId: moved.nodeId, at: moved.at }
            : NOTHING,
      };
    }

    case 'panning':
      return { gesture: IDLE, intent: NOTHING };
  }
}

/** 잡은 자리를 지킨다. 안 지키면 노드가 커서 밑으로 튄다 */
function dragMove(gesture: Extract<Gesture, { kind: 'dragging' }>, e: PointerLike): Intent {
  return {
    kind: 'drag-move',
    nodeId: gesture.nodeId,
    at: { x: e.world.x + gesture.grabOffset.x, y: e.world.y + gesture.grabOffset.y },
  };
}

/**
 * 팬은 **누른 자리에서** 잰다. 직전 자리에서 재면 프레임마다 반올림 오차가
 * 쌓여 화면이 조금씩 흘러간다.
 */
function pan(gesture: Extract<Gesture, { kind: 'panning' }>, e: PointerLike): Intent {
  return {
    kind: 'pan',
    viewport: panBy(
      gesture.viewport,
      e.screen.x - gesture.from.x,
      e.screen.y - gesture.from.y,
    ),
  };
}
