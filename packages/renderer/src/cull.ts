import type { PlacedEdge } from './edges.js';
import { inflateRect, rectsIntersect } from './geometry.js';
import type { Rect } from './geometry.js';
import type { PlacedGroup } from './groups.js';
import type { PlacedNode, Scene } from './scene.js';

/**
 * 뷰포트 밖의 것을 버린다.
 *
 * ## 공간 색인을 쓰지 않는다
 *
 * 격자 색인은 히트테스트용으로 따로 세우지만 컬링은 **그냥 전부 훑는다.**
 * 노드 1,000개면 프레임마다 사각형 겹침 검사 1,000번인데, 그 뒤에 이어질
 * 그리기 호출에 비하면 아무것도 아니다. 그리고 선형으로 훑으면 "무식하게 다
 * 훑은 것과 결과가 정확히 같다" 를 검사로 증명할 수 있다 — 컬링이 조용히
 * 뭔가를 빠뜨리는 것은 눈으로는 못 찾는 부류의 버그다.
 *
 * ## 여백을 두고 버린다
 *
 * 획은 경로 **위에 가운데로** 그려지므로, 상자가 화면 밖 1px 에 있어도 획의
 * 절반이 안으로 넘어온다. 그래서 뷰포트를 조금 부풀려서 견준다.
 *
 * ## 순서를 지킨다
 *
 * 그룹은 얕은 것부터 들어온 순서 그대로 나간다. 걸러 내면서 순서가 흐트러지면
 * 부모가 자식 위에 덮여 중첩이 뒤집힌다.
 */

export interface VisibleScene {
  readonly nodes: readonly PlacedNode[];
  readonly edges: readonly PlacedEdge[];
  readonly groups: readonly PlacedGroup[];
}

export function cullScene(scene: Scene, world: Rect, margin?: number): VisibleScene {
  const window = inflateRect(world, margin ?? scene.theme.cullMargin);

  return {
    nodes: scene.nodes.filter((n) => rectsIntersect(n.rect, window)),
    edges: scene.edges.filter((e) => rectsIntersect(e.bounds, window)),
    groups: scene.groups.filter((g) => rectsIntersect(g.rect, window)),
  };
}

export function countVisible(visible: VisibleScene): number {
  return visible.nodes.length + visible.edges.length + visible.groups.length;
}
