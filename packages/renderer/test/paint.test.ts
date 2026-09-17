import { describe, expect, it } from 'vitest';
import { cullScene } from '../src/cull.js';
import { distanceToPolyline, rectContains } from '../src/geometry.js';
import type { Point } from '../src/geometry.js';
import { HIT_ORDER, buildSpatialIndex, hitTest } from '../src/hit-test.js';
import type { Scene } from '../src/scene.js';
import { DEFAULT_THEME } from '../src/theme.js';
import { paintOrder, paintScene } from '../src/paint/scene.js';
import { canvasPixelSize, fitToContent, viewportMatrix, visibleWorldRect } from '../src/viewport.js';
import type { Viewport } from '../src/viewport.js';
import { RecordingContext } from './helpers/recording-context.js';
import { layoutOf, sceneOf } from './helpers/scene.js';

const theme = DEFAULT_THEME;
const screen = { width: 800, height: 600 };

const SOURCE = [
  'actor user "손님"',
  'service web "스토어프론트"',
  'service api "주문 API"',
  'db orders "주문 DB"',
  'queue events "이벤트 큐"',
  'group payment "결제" {',
  '  service pay "결제 서비스"',
  '  external toss "토스페이먼츠"',
  '}',
  'group empty "빈 묶음" {',
  '}',
  'user -> web "주문하기"',
  'web -> api',
  'api -> orders "주문 저장"',
  'api -> pay "결제 요청"',
  'pay -> toss',
  'api -> events "order.created"',
  'api -> api',
].join('\n');

function paintAll(scene: Scene, viewport?: Viewport, dpr = 1): RecordingContext {
  const ctx = new RecordingContext();
  const v = viewport ?? fitToContent(scene.contentBounds, screen);
  paintScene(ctx, scene, v, screen, { devicePixelRatio: dpr });
  return ctx;
}

describe('그리기 기본', () => {
  /** 숫자가 한 번 망가지면 화면 전체가 빈다. 한 줄로 그 부류를 통째로 잡는다 */
  it('캔버스에 NaN 이 한 번도 안 닿는다', () => {
    const ctx = paintAll(sceneOf(SOURCE));
    expect(ctx.badNumber()).toBeUndefined();
  });

  it('save 와 restore 의 짝이 맞는다', () => {
    const ctx = paintAll(sceneOf(SOURCE));
    expect(ctx.depthProblem()).toBeUndefined();
  });

  it('배경을 먼저 칠하고 변환을 건다', () => {
    const ctx = paintAll(sceneOf('service a'));
    const ops = ctx.ops();
    expect(ops.indexOf('fillRect')).toBeLessThan(ops.lastIndexOf('setTransform'));
  });

  it('배경 칠하기를 끌 수 있다', () => {
    const scene = sceneOf('service a');
    const ctx = new RecordingContext();
    paintScene(ctx, scene, { x: 0, y: 0, zoom: 1 }, screen, { clear: false });
    expect(ctx.of('clearRect')).toHaveLength(0);
  });

  it('빈 장면도 던지지 않는다', () => {
    const ctx = paintAll(sceneOf(''));
    expect(ctx.badNumber()).toBeUndefined();
    expect(ctx.depthProblem()).toBeUndefined();
  });

  it('노드 라벨을 다 쓴다', () => {
    const scene = sceneOf(SOURCE);
    const ctx = paintAll(scene);
    for (const node of scene.nodes) {
      expect(ctx.texts()).toContain(node.label);
    }
  });

  it('장면에 없는 글자는 안 쓴다', () => {
    const scene = sceneOf(SOURCE);
    const known = new Set<string>([
      ...scene.nodes.map((n) => n.label),
      ...scene.groups.map((g) => g.group.label),
      ...scene.edges.flatMap((e) => (e.labelText === undefined ? [] : [e.labelText])),
    ]);
    for (const text of paintAll(scene).texts()) {
      expect(known.has(text)).toBe(true);
    }
  });
});

describe('변환', () => {
  /**
   * 그리는 쪽이 쓰는 변환과 히트테스트가 뒤집는 변환이 같아야 한다. 갈라지면
   * 고해상도 화면에서 클릭이 몇 px 어긋난다.
   */
  it('setTransform 인자가 viewportMatrix 와 똑같다', () => {
    for (const dpr of [1, 2, 3]) {
      const scene = sceneOf('service a');
      const viewport: Viewport = { x: 12, y: -30, zoom: 1.7 };
      const ctx = paintAll(scene, viewport, dpr);

      const m = viewportMatrix(viewport, dpr);
      const last = ctx.of('setTransform').at(-1);
      expect(last?.args).toEqual([m.a, m.b, m.c, m.d, m.e, m.f]);
    }
  });

  it('배경은 캔버스 픽셀 크기만큼 칠한다', () => {
    const ctx = paintAll(sceneOf('service a'), { x: 0, y: 0, zoom: 1 }, 2);
    const pixels = canvasPixelSize(screen, 2);
    expect(ctx.of('fillRect')[0]?.args).toEqual([0, 0, pixels.width, pixels.height]);
  });

  it('화면 배율은 1과 3 사이로 물린다', () => {
    const ctx = paintAll(sceneOf('service a'), { x: 0, y: 0, zoom: 1 }, 99);
    const m = viewportMatrix({ x: 0, y: 0, zoom: 1 }, 3);
    expect(ctx.of('setTransform').at(-1)?.args).toEqual([m.a, m.b, m.c, m.d, m.e, m.f]);
  });
});

describe('그리는 순서', () => {
  it('그룹 → 엣지 → 노드 차례다', () => {
    const scene = sceneOf(SOURCE);
    const order = paintOrder(cullScene(scene, scene.contentBounds)).map((i) => i.kind);

    const firstEdge = order.indexOf('edge');
    const firstNode = order.indexOf('node');
    expect(order.lastIndexOf('group')).toBeLessThan(firstEdge);
    expect(order.lastIndexOf('edge')).toBeLessThan(firstNode);
  });

  it('그룹은 얕은 것부터다', () => {
    const scene = sceneOf('group a {\n  group b {\n    service x\n  }\n}');
    const groups = paintOrder(cullScene(scene, scene.contentBounds))
      .filter((i) => i.kind === 'group')
      .map((i) => i.id);
    expect(groups).toEqual(['a', 'b']);
  });

  /**
   * 이 검사가 그리는 순서와 집는 순서를 붙들어 맨다. 둘이 갈라지면 "보이는 것과
   * 다른 것이 잡히는" 상태가 되고, 그것은 화면만 봐서는 못 찾는다.
   */
  it('어떤 점 위에 마지막으로 그려진 것이 그 점에서 잡히는 것과 같다', () => {
    const scene = sceneOf(SOURCE);
    const index = buildSpatialIndex(scene);
    const visible = cullScene(scene, scene.contentBounds);
    const order = paintOrder(visible);

    const covers = (id: string, kind: string, world: Point): boolean => {
      if (kind === 'node') {
        const node = scene.nodeById.get(id);
        return node !== undefined && rectContains(node.rect, world);
      }
      if (kind === 'edge') {
        const edge = scene.edgeByKey.get(id);
        if (edge === undefined) return false;
        return (
          distanceToPolyline(world, edge.path) <= theme.edge.hitTolerance ||
          (edge.labelRect !== undefined && rectContains(edge.labelRect, world))
        );
      }
      const group = scene.groupById.get(id);
      if (group === undefined) return false;
      // 히트테스트와 같은 기준 — 테두리 띠와 라벨 줄만
      return (
        rectContains(group.labelRect, world) ||
        (rectContains(group.rect, world) &&
          !rectContains(
            {
              x: group.rect.x + theme.group.hitBand,
              y: group.rect.y + theme.group.hitBand,
              width: group.rect.width - theme.group.hitBand * 2,
              height: group.rect.height - theme.group.hitBand * 2,
            },
            world,
          ))
      );
    };

    const bounds = scene.contentBounds;
    const steps = 40;
    for (let ix = 0; ix <= steps; ix += 1) {
      for (let iy = 0; iy <= steps; iy += 1) {
        const world = {
          x: bounds.x + (bounds.width * ix) / steps,
          y: bounds.y + (bounds.height * iy) / steps,
        };

        let lastPainted: { kind: string; id: string } | undefined;
        for (const item of order) {
          if (covers(item.id, item.kind, world)) lastPainted = item;
        }

        const hit = hitTest(index, scene, world);
        if (hit === undefined) {
          expect(lastPainted).toBeUndefined();
          continue;
        }

        const hitId =
          hit.kind === 'node' ? hit.node.id : hit.kind === 'edge' ? hit.edge.key : hit.group.id;
        expect({ kind: lastPainted?.kind, id: lastPainted?.id }).toEqual({
          kind: hit.kind,
          id: hitId,
        });
      }
    }
  });

  it('집는 차례와 그리는 차례가 서로 뒤집힌 것이다', () => {
    const scene = sceneOf(SOURCE);
    const painted = paintOrder(cullScene(scene, scene.contentBounds)).map((i) => i.kind);
    const paintKinds = [...new Set(painted)];
    expect([...paintKinds].reverse()).toEqual(HIT_ORDER.filter((k) => paintKinds.includes(k)));
  });

  it('컬링한 것만 그린다', () => {
    const scene = sceneOf(SOURCE);
    const ctx = new RecordingContext();
    // 내용에서 멀리 떨어진 뷰포트
    paintScene(ctx, scene, { x: 100000, y: 100000, zoom: 1 }, screen);
    expect(ctx.texts()).toHaveLength(0);
  });
});

describe('노드 종류마다 다른 자취', () => {
  const opsFor = (source: string): string[] => paintAll(sceneOf(source)).ops();

  it('external 은 점선을 쓴다', () => {
    const ctx = paintAll(sceneOf('external toss'));
    const dashes = ctx.of('setLineDash').map((c) => c.args[0]);
    expect(dashes.some((d) => Array.isArray(d) && d.length > 0)).toBe(true);
  });

  it('db 는 타원 뚜껑을 그린다', () => {
    expect(opsFor('db orders')).toContain('ellipse');
    expect(opsFor('service api')).not.toContain('ellipse');
  });

  it('actor 도 머리 원을 그린다', () => {
    expect(opsFor('actor user')).toContain('ellipse');
  });

  it('queue 는 칸막이 줄을 긋는다', () => {
    const ctx = paintAll(sceneOf('queue events'));
    // 라벨 말고 직선을 두 번 긋는다
    expect(ctx.of('moveTo').length).toBeGreaterThan(1);
  });

  it('service 는 왼쪽 띠를 칠한다', () => {
    const ctx = paintAll(sceneOf('service api'), { x: 0, y: 0, zoom: 1 });
    // 배경 하나 + 종류 색 띠 하나
    expect(ctx.of('fillRect').length).toBeGreaterThanOrEqual(2);
  });

  it('선언 없이 생긴 노드는 옅게 그린다', () => {
    const ctx = paintAll(sceneOf('web -> api'));
    const alphas = ctx.calls.map((c) => c.style['globalAlpha']);
    expect(alphas).toContain(theme.node.implicitAlpha);
  });
});

describe('고른 것과 가리킨 것', () => {
  it('고른 노드에 표시를 더 그린다', () => {
    const scene = sceneOf('service a');
    const plain = new RecordingContext();
    const picked = new RecordingContext();

    paintScene(plain, scene, { x: 0, y: 0, zoom: 1 }, screen);
    paintScene(picked, scene, { x: 0, y: 0, zoom: 1 }, screen, { selection: new Set(['a']) });

    expect(picked.of('stroke').length).toBeGreaterThan(plain.of('stroke').length);
  });

  /** 안 나누면 축소했을 때 표시가 실처럼 얇아져 안 보인다 */
  it('표시 굵기는 줌으로 나눈다 — 화면에서 일정하다', () => {
    const scene = sceneOf('service a');

    const widthsAt = (zoom: number): number[] => {
      const ctx = new RecordingContext();
      paintScene(ctx, scene, { x: 0, y: 0, zoom }, screen, { selection: new Set(['a']) });
      return ctx.of('stroke').map((c) => Number(c.style['lineWidth']));
    };

    expect(widthsAt(1)).toContain(theme.selectionWidth);
    expect(widthsAt(4)).toContain(theme.selectionWidth / 4);
  });

  it('가리킨 엣지도 표시된다', () => {
    const scene = sceneOf('service a\nservice b\na -> b');
    const key = scene.edges[0]?.key ?? '';

    const ctx = new RecordingContext();
    paintScene(ctx, scene, { x: 0, y: 0, zoom: 1 }, screen, { hovered: key });
    const widths = ctx.of('stroke').map((c) => Number(c.style['lineWidth']));
    expect(widths).toContain(theme.selectionWidth);
  });

  it('빈 그룹은 점선 테두리다', () => {
    const ctx = paintAll(sceneOf('group empty {\n}'));
    const dashes = ctx.of('setLineDash').map((c) => c.args[0]);
    expect(dashes.some((d) => Array.isArray(d) && d.length > 0)).toBe(true);
  });
});

describe('여러 자리에서', () => {
  it('줌과 화면 배율을 바꿔 가며 그려도 NaN 이 없다', () => {
    const scene = sceneOf(SOURCE);

    for (const zoom of [0.1, 0.5, 1, 2, 4]) {
      for (const dpr of [1, 2, 3]) {
        const ctx = paintAll(scene, { x: -100, y: -100, zoom }, dpr);
        expect(ctx.badNumber()).toBeUndefined();
        expect(ctx.depthProblem()).toBeUndefined();
      }
    }
  });

  it('같은 자리에 고정된 노드들도 그려진다', () => {
    const layout = layoutOf({ a: { x: 10, y: 10 }, b: { x: 10, y: 10 } });
    const ctx = paintAll(sceneOf('service a\nservice b\na -> b\nb -> a', layout));
    expect(ctx.badNumber()).toBeUndefined();
  });

  it('맞춘 뷰포트로 그리면 내용이 다 보인다', () => {
    const scene = sceneOf(SOURCE);
    const viewport = fitToContent(scene.contentBounds, screen);
    const visible = cullScene(scene, visibleWorldRect(viewport, screen));
    expect(visible.nodes).toHaveLength(scene.nodes.length);
  });
});
