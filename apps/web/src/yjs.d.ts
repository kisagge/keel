/**
 * `Y.Text` 는 런타임에 `toString()` 을 오버라이드하지만, yjs 가 배포하는
 * `.d.ts` 는 그 오버라이드를 선언하지 않는다 — 타입만 보면 `Object.prototype.toString`
 * 그대로다. 그래서 `ytext.toString()` 을 쓰는 자리마다 `no-base-to-string` 이
 * 울리고, 파일마다 그 규칙을 꺼서 막던 것이 문서를 건드리는 곳마다 번지고 있었다.
 * 규칙을 죽이는 대신 빠진 선언을 여기 한 번 채워 넣는다.
 */

/**
 * 아래 `import type {}` 는 지워도 되는 죽은 줄처럼 보이지만 지우면 안 된다 —
 * 이 파일을 모듈로 만드는 것이 그 줄이다. 파일에 최상위 `import`/`export` 가
 * 하나도 없으면 `declare module 'yjs'` 는 병합이 아니라 앰비언트 모듈 선언이
 * 되어 yjs 의 타입을 **통째로 교체**한다 — `Doc`·`Map`·`UndoManager`,
 * `Text.insert`·`delete`·`doc` 까지 전부 "없다" 는 오류로 사라진다(직접 겪었다).
 */
import type {} from 'yjs';

declare module 'yjs' {
  interface Text {
    toString(): string;
  }
}
