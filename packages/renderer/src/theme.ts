import type { NodeKind } from '@keel/dsl';
import type { Size } from './geometry.js';

/**
 * 치수와 색. **전부 월드 단위**다 — 화면 px 이 아니다.
 *
 * 그리기는 뷰포트 변환을 건 뒤에 하므로 여기 적힌 14 는 "줌 1 일 때 14px" 이고
 * 줌을 키우면 같이 커진다. 화면에서 두께가 일정해야 하는 것(고른 표시, 가리킨
 * 표시)만 그리는 쪽에서 `zoom` 으로 나눈다.
 *
 * `colors.kind` 를 `Record<NodeKind, string>` 으로 둔 것은 일부러다. DSL 에
 * 종류가 늘면 **여기서 컴파일이 깨진다** — 규칙을 기억이 아니라 타입으로 지킨다.
 */

export interface NodeTheme {
  readonly minWidth: number;
  readonly maxWidth: number;
  readonly height: number;
  readonly paddingX: number;
  readonly radius: number;
  readonly borderWidth: number;
  readonly fontSize: number;
  readonly fontFamily: string;
  /** 왼쪽 종류 색 띠의 너비 */
  readonly accentWidth: number;
  /** 선언 없이 생긴 노드를 옅게 그리는 정도 */
  readonly implicitAlpha: number;
}

export interface GroupTheme {
  readonly padding: number;
  readonly paddingPerDepth: number;
  readonly minPadding: number;
  /** 위쪽 라벨 띠의 높이. 테두리 안쪽이 아니라 테두리를 위로 늘려서 만든다 */
  readonly labelHeight: number;
  readonly radius: number;
  readonly borderWidth: number;
  readonly fontSize: number;
  /** 테두리에서 이만큼 안쪽까지가 "테두리를 눌렀다" 로 친다 */
  readonly hitBand: number;
  /** 노드가 하나도 없는 그룹의 크기 */
  readonly emptySize: Size;
  /** 깊어질수록 짙어지는 채움. 0단계의 알파 */
  readonly fillAlpha: number;
  readonly fillAlphaPerDepth: number;
}

export interface EdgeTheme {
  readonly width: number;
  /** 노드 테두리와 선 끝 사이의 틈 */
  readonly gap: number;
  readonly arrowLength: number;
  /** 화살촉이 벌어진 각의 반. 라디안 */
  readonly arrowHalfAngle: number;
  /** 같은 두 노드를 잇는 선들을 벌리는 간격 */
  readonly parallelOffset: number;
  readonly labelFontSize: number;
  readonly labelOffset: number;
  readonly labelMaxWidth: number;
  readonly selfLoopWidth: number;
  readonly selfLoopHeight: number;
  /** 선을 집을 때 봐주는 거리. 월드 단위다 */
  readonly hitTolerance: number;
}

export interface StopgapTheme {
  readonly columns: number;
  readonly gap: number;
}

export interface ColorTheme {
  readonly background: string;
  readonly surface: string;
  readonly border: string;
  readonly text: string;
  readonly mutedText: string;
  readonly edge: string;
  readonly edgeLabel: string;
  readonly edgeLabelBackground: string;
  readonly groupBorder: string;
  readonly groupFill: string;
  readonly groupLabel: string;
  readonly selection: string;
  readonly hover: string;
  readonly kind: Readonly<Record<NodeKind, string>>;
}

export interface Theme {
  readonly node: NodeTheme;
  readonly group: GroupTheme;
  readonly edge: EdgeTheme;
  readonly stopgap: StopgapTheme;
  readonly colors: ColorTheme;
  /** 컬링할 때 뷰포트를 이만큼 부풀린다. 선은 경로 위에 가운데로 그려지므로 */
  readonly cullMargin: number;
  /** 히트테스트 격자 한 칸의 크기 */
  readonly gridCell: number;
  /** 화면에서 두께가 일정해야 하는 표시의 굵기 */
  readonly selectionWidth: number;
}

export const DEFAULT_THEME: Theme = {
  node: {
    minWidth: 96,
    maxWidth: 280,
    height: 44,
    paddingX: 16,
    radius: 8,
    borderWidth: 1.5,
    fontSize: 14,
    fontFamily: 'Inter, Pretendard, system-ui, sans-serif',
    accentWidth: 3,
    implicitAlpha: 0.5,
  },
  group: {
    padding: 24,
    paddingPerDepth: 6,
    minPadding: 10,
    labelHeight: 22,
    radius: 12,
    borderWidth: 1,
    fontSize: 12,
    hitBand: 8,
    emptySize: { width: 160, height: 80 },
    fillAlpha: 0.03,
    fillAlphaPerDepth: 0.025,
  },
  edge: {
    width: 1.5,
    gap: 4,
    arrowLength: 10,
    arrowHalfAngle: 0.35,
    parallelOffset: 18,
    labelFontSize: 12,
    labelOffset: 10,
    labelMaxWidth: 160,
    selfLoopWidth: 28,
    selfLoopHeight: 30,
    hitTolerance: 6,
  },
  stopgap: {
    columns: 4,
    gap: 40,
  },
  colors: {
    background: '#fbfbfa',
    surface: '#ffffff',
    border: '#d6d3d1',
    text: '#1c1917',
    mutedText: '#78716c',
    edge: '#78716c',
    edgeLabel: '#57534e',
    edgeLabelBackground: '#fbfbfa',
    groupBorder: '#a8a29e',
    groupFill: '#1c1917',
    groupLabel: '#57534e',
    selection: '#2563eb',
    hover: '#93c5fd',
    kind: {
      service: '#2563eb',
      db: '#7c3aed',
      queue: '#d97706',
      external: '#78716c',
      actor: '#059669',
    },
  },
  cullMargin: 8,
  gridCell: 192,
  selectionWidth: 2,
};
