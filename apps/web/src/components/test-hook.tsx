'use client';

import { worldToScreen } from '@keel/renderer';
import type { Scene, Viewport } from '@keel/renderer';
import { useEffect } from 'react';
import type { RefObject } from 'react';

/**
 * 검사용 창구.
 *
 * 캔버스는 픽셀이라 바깥에서 못 읽는다. 픽셀을 견주는 검사는 글꼴 하나만 바뀌어도
 * 깨지고, 깨졌을 때 **무엇이 틀렸는지도 안 읽힌다.** 그래서 장면을 숫자로 내놓는다.
 *
 * 월드 좌표와 **화면 좌표를 둘 다** 내놓는다. e2e 는 화면 좌표를 눌러 노드를
 * 잡고, 월드 좌표로 "놓은 자리에 남았는가" 를 본다. 화면 좌표가 없으면 노드를
 * 정확히 잡을 방법이 없어 검사가 "아무 데나 끌어 봤다" 가 된다.
 *
 * 배포된 화면에는 안 붙는다.
 */
export interface SceneSummaryNode {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** 캔버스 안에서의 화면 좌표 */
  readonly screenX: number;
  readonly screenY: number;
}

export interface SceneSummary {
  readonly nodes: readonly SceneSummaryNode[];
  readonly edges: number;
  readonly groups: readonly string[];
}

/**
 * **전역 `Window` 를 넓히지 않는다.** `declare global` 로 적으면 `__keel` 이
 * `apps/web` 어디서나 보이는 값이 되어, 검사용 통로가 제품 코드에서도 쓸 수
 * 있는 것처럼 보인다. 여기서만 좁혀 쓴다. e2e 쪽은 제 파일에 따로 적는다.
 */
interface WindowWithKeel {
  __keel?: { sceneSummary: () => SceneSummary };
}

export function TestHook({
  sceneAt,
  viewportRef,
}: {
  readonly sceneAt: () => Scene;
  readonly viewportRef: RefObject<Viewport>;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;

    const target = window as unknown as WindowWithKeel;
    target.__keel = {
      sceneSummary: () => {
        const scene = sceneAt();
        return {
          nodes: scene.nodes.map((node) => {
            const screen = worldToScreen(viewportRef.current, node.center);
            return {
              id: node.id,
              x: Math.round(node.center.x),
              y: Math.round(node.center.y),
              screenX: Math.round(screen.x),
              screenY: Math.round(screen.y),
            };
          }),
          edges: scene.edges.length,
          groups: scene.groups.map((group) => group.id),
        };
      },
    };

    return () => {
      delete target.__keel;
    };
  }, [sceneAt, viewportRef]);

  return null;
}
