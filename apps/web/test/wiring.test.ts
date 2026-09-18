import { parse } from '@keel/dsl';
import { buildGraph } from '@keel/graph';
import { DEFAULT_THEME, buildScene } from '@keel/renderer';
import { describe, expect, it } from 'vitest';

/**
 * 세 패키지가 빌드 없이 생 `.ts` 로 이어지는지 확인한다.
 * 이어지지 않으면 화면을 만들 것도 없으므로 가장 먼저 묶는다.
 */
describe('워크스페이스 이어짐', () => {
  it('세 패키지를 그대로 불러 쓴다', () => {
    const graph = buildGraph(parse('service a\nservice b\na -> b'));
    const scene = buildScene(graph, new Map());

    expect(scene.nodes).toHaveLength(2);
    expect(scene.edges).toHaveLength(1);
    expect(DEFAULT_THEME.node.height).toBeGreaterThan(0);
  });
});
