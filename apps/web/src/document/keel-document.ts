import type { Point } from '@keel/renderer';
import * as Y from 'yjs';

/**
 * 문서 하나의 배선.
 *
 * `Y.Text('source')` 가 **문서**다. 내보내고, PR 에 붙이고, diff 로 읽는 것이
 * 이것이다. `Y.Map('layout')` 에는 **사람이 옮긴 노드만** 들어간다 — 좌표를
 * 텍스트에 적으면 PR diff 가 좌표 변경으로 뒤덮여, 텍스트로 관리하는 이유가
 * 사라진다.
 *
 * 이 파일에는 React 도 CodeMirror 도 들어오지 않는다. 그래서 Node 에서 그대로
 * 검사된다.
 */

/** 캔버스에서 비롯된 수정의 origin. 되돌리기가 이것을 추적한다 */
export const KEEL_LOCAL = Symbol('keel-local');

/**
 * 씨앗을 넣을 때 쓰는 origin. **일부러 추적하지 않는다** —
 * 되돌릴 수 있게 두면 화면을 열자마자 Cmd+Z 한 번에 문서가 통째로 사라진다.
 */
const KEEL_SEED = Symbol('keel-seed');

export interface KeelDocument {
  readonly doc: Y.Doc;
  readonly source: Y.Text;
  readonly layout: Y.Map<Point>;
  readonly undoManager: Y.UndoManager;
  destroy(): void;
}

/**
 * @param extraTrackedOrigins 되돌리기가 함께 추적할 origin. 클래스를 넣으면
 *   그 클래스의 인스턴스가 전부 걸린다(Yjs 가 생성자로도 견준다). 화면 쪽에서
 *   `y-codemirror.next` 의 `YSyncConfig` 를 이리로 넘긴다 — 그래야 이 파일이
 *   CodeMirror 을 몰라도 된다.
 */
export function createKeelDocument(
  seed: string,
  extraTrackedOrigins: readonly unknown[] = [],
): KeelDocument {
  const doc = new Y.Doc();
  const source = doc.getText('source');
  const layout = doc.getMap<Point>('layout');

  if (seed.length > 0) {
    doc.transact(() => source.insert(0, seed), KEEL_SEED);
  }

  /**
   * 둘을 **함께** 감싼다. 친 글자와 끈 노드가 한 역사여야 사람이 "방금 뭘
   * 되돌렸는지" 를 따라갈 수 있다.
   *
   * `captureTimeout` 은 **건드리지 않는다.** 기본값(500ms)이 짧은 사이의
   * 수정을 한 걸음으로 묶어 주는데, 글자를 칠 때는 그게 맞다 — 0 으로 두면
   * `Cmd+Z` 가 한 자씩 지워 편집기로 쓸 수 없게 된다. 걸음의 경계가 필요한
   * 자리(캔버스 조작 하나가 끝나는 곳)에서는 시간을 줄이는 대신
   * `undoManager.stopCapturing()` 을 부른다. `commands.ts` 가 그렇게 한다.
   */
  const undoManager = new Y.UndoManager([source, layout], {
    trackedOrigins: new Set<unknown>([KEEL_LOCAL, ...extraTrackedOrigins]),
  });

  return {
    doc,
    source,
    layout,
    undoManager,
    destroy() {
      undoManager.destroy();
      doc.destroy();
    },
  };
}
