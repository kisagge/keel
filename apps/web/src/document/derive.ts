import { parse } from '@keel/dsl';
import type { ParsedDocument } from '@keel/dsl';
import { buildGraph } from '@keel/graph';
import type { Graph } from '@keel/graph';
import {
  DEFAULT_THEME,
  approximateMeasureText,
  buildScene,
  contextMeasureText,
  memoizeMeasure,
} from '@keel/renderer';
import type { LayoutReader, MeasureText, MeasuringContext, Scene, Theme } from '@keel/renderer';

/**
 * 소스에서 장면까지. **두 단으로 나눈다.**
 *
 * 끌기 중에는 그래프가 안 바뀌고 자리만 바뀐다. 한 단으로 묶어 두면 프레임마다
 * 파싱과 그래프 세우기를 다시 하게 된다. 나눠 두면 끌기 프레임은 `sceneOf` 만
 * 부른다.
 */

export interface Parsed {
  readonly document: ParsedDocument;
  readonly graph: Graph;
}

export function parseSource(source: string): Parsed {
  const document = parse(source);
  return { document, graph: buildGraph(document) };
}

export function sceneOf(
  graph: Graph,
  layout: LayoutReader,
  measure: MeasureText,
  theme: Theme = DEFAULT_THEME,
): Scene {
  return buildScene(graph, layout, { measure, theme });
}

/**
 * 글자 재는 함수를 만든다.
 *
 * 캔버스가 있으면 진짜로 재고 없으면 어림으로 잰다(서버 렌더와 검사가 그쪽).
 * **반드시 기억해 두고 쓴다** — 프레임마다 `measureText` 를 다시 부르는 것이
 * 캔버스에서 가장 흔한 느려짐이다.
 */
export function createMeasure(ctx: MeasuringContext | undefined): MeasureText {
  return memoizeMeasure(ctx === undefined ? approximateMeasureText : contextMeasureText(ctx));
}
