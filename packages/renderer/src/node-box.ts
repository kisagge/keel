import type { GraphNode } from '@keel/graph';
import { clamp } from './geometry.js';
import type { Size } from './geometry.js';
import { truncateToWidth } from './measure.js';
import type { MeasureText, TextStyle } from './measure.js';
import type { Theme } from './theme.js';

/**
 * 라벨에서 노드 상자 크기를 낸다.
 *
 * **높이는 모든 종류가 같다.** DSL 이 노드 종류를 다섯으로 묶어 둔 것과 같은
 * 이유다 — 높이가 제각각이면 접점·그룹 경계·히트테스트가 전부 종류를 따져야
 * 한다. `db` 의 원통 뚜껑은 상자를 키우는 대신 **상자 안쪽에** 그린다.
 *
 * 너비만 라벨을 따라가되 최소·최대로 물린다. 그래서 어림 재기가 실측과
 * 조금 어긋나도 배치가 안 깨지고, 아주 긴 이름이 화면을 가로지르지 않는다.
 */

export function nodeTextStyle(theme: Theme): TextStyle {
  return {
    fontSize: theme.node.fontSize,
    fontFamily: theme.node.fontFamily,
    fontWeight: 'normal',
  };
}

export function measureNodeBox(node: GraphNode, measure: MeasureText, theme: Theme): Size {
  const natural = measure(node.label, nodeTextStyle(theme)) + theme.node.paddingX * 2;
  return {
    width: clamp(natural, theme.node.minWidth, theme.node.maxWidth),
    height: theme.node.height,
  };
}

/** 상자에 실제로 들어가는 글자. 크기를 정할 때와 그릴 때가 이것 하나를 본다 */
export function fitNodeLabel(
  node: GraphNode,
  size: Size,
  measure: MeasureText,
  theme: Theme,
): string {
  return truncateToWidth(
    node.label,
    size.width - theme.node.paddingX * 2,
    nodeTextStyle(theme),
    measure,
  );
}
