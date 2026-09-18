# apps/web — 에디터 화면 설계

2026-09-17

## 왜 만드는가

`@keel/dsl` · `@keel/graph` · `@keel/renderer` 셋이 도는데 **화면이 없다.** 셋 다
I/O 가 없어 많이 검사됐지만, 지금까지 아무도 이 도구를 써 본 적이 없다.

이 판은 그 셋을 처음으로 사람 앞에 붙인다. README 의 `아직 안 한 것` 맨 위
항목이고, 끝나면 이 저장소의 주장 — "텍스트로 저장하고 캔버스에서 손으로
고친다" — 이 처음으로 눈에 보인다.

실시간 서버(`apps/api`)는 그다음 항목이다. 그래서 이 판은 **서버 없이** 돈다.

## 정해진 것

| | 고른 것 | 왜 |
|---|---|---|
| 상태 그릇 | **Yjs 를 지금부터**, 제공자 없이 | `edits.ts` 가 `TextEdit[]` 을 돌려주는 이유가 Y.Text 에 그대로 적용하라고였고, `LayoutReader` 도 Y.Map 을 염두에 둔 모양이다. 평범한 React 상태로 가면 양방향 경로를 두 번 만들게 된다 |
| 캔버스→텍스트 범위 | 끌기 · 고르기 · 이름·종류 고치기 · 지우기 | `edits.ts` 가 실제로 쓰이는 최소 집합. 선 잇기는 끌기 제스처가 두 뜻을 가지게 되어 뺀다 |
| 첫 화면 | `order-flow.keel` 을 씨앗으로, **저장 없음** | 저장은 `apps/api` 의 일이라는 것을 화면이 솔직하게 드러낸다 |
| 상호작용 상태 | **빈도로 가름** — 고빈도는 ref+RAF, 저빈도는 React state | 팬·줌·끌기가 프레임마다 React 재조정을 돌리면 README 의 1,000노드 목표와 부딪친다 |
| e2e | Playwright 스모크 하나 | React 컴포넌트에 검사가 없으므로 최소한 화면이 서고 고리가 도는 것은 묶는다 |

## 구조

```
apps/web/
  app/
    layout.tsx            뼈대
    page.tsx              에디터 화면 ('use client')
    globals.css
  src/
    document/             React 가 안 들어온다
      keel-document.ts    Y.Doc 배선 — Y.Text('source') + Y.Map('layout') + UndoManager
      text-edits.ts       applyTextEdits(ytext, edits) — 이 판의 핵심 함수
      commands.ts         조작 → plan*() → applyTextEdits, 한 트랜잭션
      layout-reader.ts    Y.Map → LayoutReader (복사 없이), 끌기 덧씌우기
    interaction/          React 가 안 들어온다
      gesture.ts          포인터 제스처 순수 상태 기계
    hooks/
      use-keel-document.ts  useSyncExternalStore 로 Y.Text 구독
      use-scene.ts          source + layout → ParsedDocument · Graph · Scene
      use-canvas.ts         엘리먼트 · RAF · 포인터 · 뷰포트 ref
    components/
      editor-pane.tsx     CodeMirror 6 + yCollab + lint
      canvas-pane.tsx     <canvas> + use-canvas
      inspector.tsx       고른 노드의 이름·종류·지우기
      diagnostics.tsx     진단 목록
      split.tsx           좌우 분할
  next.config.ts · tsconfig.json · eslint.config.js · vitest.config.ts · package.json

e2e/                      새 워크스페이스 (pnpm-workspace.yaml 에 추가)
  smoke.spec.ts · playwright.config.ts · package.json
```

`src/document/` 와 `src/interaction/` 에 React 를 들이지 않는 것은 앞선 세
패키지와 같은 이유다 — **I/O 가 없으면 빠르게, 많이 검사할 수 있다.** 제스처
문턱이나 수정 적용 순서처럼 정말 틀리기 쉬운 것이 컴포넌트 안에 있으면 못 묶는다.

## 데이터 흐름

진실은 한 방향으로만 흐른다. **텍스트가 문서이고, 캔버스에서 고친 것도 텍스트를
거쳐 돌아온다.**

```
Y.Text('source') ──observe──▶ source (문서가 바뀔 때만 바뀌는 React 값)
                                  │ parse()          → diagnostics
                                  │ buildGraph()     → Graph
                                  │ buildScene(graph, layoutReader)  ← Y.Map('layout')
                                  ▼
                                Scene ──▶ paintScene(ctx, scene, viewportRef.current, …)
                                  └────▶ buildSpatialIndex ──▶ hitTest(포인터 자리)

캔버스에서 고치기 → commands → plan*() → TextEdit[] → applyTextEdits → Y.Text → 위로
노드를 놓았을 때  → Y.Map.set(id, {x,y})                              (텍스트는 그대로)
```

Yjs 는 React 밖의 저장소이므로 구독은 `useSyncExternalStore` 로 한다.

## 문서 배선

### keel-document.ts

```ts
export const KEEL_LOCAL = Symbol('keel-local');

export interface KeelDocument {
  readonly doc: Y.Doc;
  readonly source: Y.Text;          // 문서
  readonly layout: Y.Map<Point>;    // 사람이 옮긴 노드만
  readonly undoManager: Y.UndoManager;
}

export function createKeelDocument(seed: string): KeelDocument;
```

되돌리기는 **하나의 역사**다.

```ts
new Y.UndoManager([source, layout], {
  trackedOrigins: new Set([YSyncConfig, KEEL_LOCAL]),
})
```

`y-codemirror.next` 의 로컬 편집은 `YSyncConfig` 인스턴스를 origin 으로 쓰고
(`src/y-sync.js` 의 `ytext.doc.transact(…, this.conf)`), 캔버스 명령은
`KEEL_LOCAL` 을 쓴다. Yjs 의 `UndoManager` 는 origin 을 **생성자로도** 견주므로
(`UndoManager.js:216`) 클래스를 넣어 두면 인스턴스를 손에 안 쥐어도 걸린다.

두 종류를 함께 감싸므로 `Cmd+Z` 가 친 글자와 끈 노드를 같은 역사로 되돌린다.
역사가 둘로 나뉘면 사람이 "방금 뭘 되돌렸는지" 를 못 따라간다.

### text-edits.ts — 이 판의 핵심

```ts
export function applyTextEdits(ytext: Y.Text, edits: readonly TextEdit[]): void;
```

내림차순으로 정렬해 지우고-넣는다. 뒤에서부터 해야 앞쪽 오프셋이 그대로 맞는다.
겹치는 수정은 `applyEdits` 와 같이 **던진다** — 사람 입력이 아니라 부르는 쪽의
버그이므로 조용히 넘기면 안 된다. 빈 배열이면 트랜잭션을 아예 안 연다.

`packages/dsl` 의 구간 수정 설계 전부가 이 함수 하나를 위해 있었다. 검사도 여기
가장 두껍게 붙는다.

### commands.ts

```ts
export function renameNode(doc: KeelDocument, id: string, label: string | undefined): void;
export function setNodeKind(doc: KeelDocument, id: string, kind: NodeKind): void;
export function removeNode(doc: KeelDocument, id: string): void;
export function moveNode(doc: KeelDocument, id: string, at: Point): void;
```

앞의 셋은 같은 꼴이다 — 지금 소스를 `parse` 하고, 해당 `plan*` 을 부르고, 빈
배열이면 아무것도 안 하고, 아니면 `doc.transact(() => applyTextEdits(…), KEEL_LOCAL)`.

`removeNode` 는 **같은 트랜잭션에서 레이아웃 자리도 지운다.** 안 지우면 유령
좌표가 남아, 같은 이름을 다시 만들었을 때 옛 자리로 튄다.

`moveNode` 는 텍스트를 안 건드린다. 좌표는 문서가 아니다.

### layout-reader.ts

```ts
export function yMapReader(layout: Y.Map<Point>): LayoutReader;
export function withDrag(reader: LayoutReader, drag: { id: string; at: Point } | undefined): LayoutReader;
```

`LayoutReader` 를 `Map` 이 아니라 읽기 하나짜리 인터페이스로 둔 값이 여기서
나온다. 원격 갱신마다 1,000개를 복사하지 않고, 끌기 중인 노드만 다른 자리를
돌려주면 끝난다.

## 캔버스 상호작용

### 빈도로 가른다

| | 어디에 | 왜 |
|---|---|---|
| 뷰포트 `{x,y,zoom}` | `useRef` | 팬·줌 중 프레임마다 바뀐다 |
| 끌고 있는 노드와 좌표 | `useRef` | `pointermove` 마다 바뀐다 |
| 가리킨 것 | `useRef` | 마우스를 움직이는 내내 바뀐다. 커서는 `canvas.style.cursor` 로 직접 바꾼다 |
| **고른 것** | React state | 클릭 한 번에 한 번. 인스펙터가 읽는다 |
| **소스 텍스트** | React state | 문서가 바뀔 때만 |

`invalidate()` 가 `requestAnimationFrame` 하나를 예약하고 그리기는 ref 만 읽는다.
포인터를 아무리 흔들어도 React 재조정은 0회다.

### 끌기는 `LayoutReader` 덧씌우기로 푼다

```ts
const reader = withDrag(yMapReader(layout), dragRef.current);
const scene = buildScene(graph, reader, { measure });   // 끌기 중에는 프레임마다
```

덧그리는 유령 없이 장면이 통째로 맞아떨어지고, 그룹 테두리가 자손에서
유도되므로 **노드를 그룹 밖으로 끌면 테두리가 실시간으로 따라 줄어든다.**

대가는 끌기 중 프레임마다 `buildScene` 이 도는 것이다. 측정기를
`memoizeMeasure` 로 감싸면 남는 일은 O(노드 수) 산술이다. 실제 숫자는 README 의
성능 항목에서 잰다. 격자 색인은 끌기 중에 안 쓰므로 끝날 때만 다시 세운다.

**Y.Map 에는 놓을 때만 쓴다.** 중간 좌표까지 CRDT 에 넣으면 실시간 판에서
업데이트 로그가 포인터무브 수만큼 불어난다. 나중에 프레즌스가 오면 이 선이
그대로 "끄는 중은 awareness, 놓은 것은 Y.Map" 이 된다.

### gesture.ts — 순수 상태 기계

```ts
export type Gesture =
  | { kind: 'idle' }
  | { kind: 'pressed'; at: Point; hit: Hit | undefined }      // 문턱 전
  | { kind: 'dragging'; nodeId: string; grabOffset: Point }
  | { kind: 'panning'; from: Point; viewport: Viewport };

export type Intent =
  | { kind: 'select'; hit: Hit | undefined }
  | { kind: 'commit-drag'; nodeId: string; at: Point }
  | { kind: 'none' };

export function onPointerDown(g: Gesture, e: PointerLike, hit: Hit | undefined): Gesture;
export function onPointerMove(g: Gesture, e: PointerLike): { gesture: Gesture; intent: Intent };
export function onPointerUp(g: Gesture, e: PointerLike): { gesture: Gesture; intent: Intent };
```

문턱은 **4px**. 넘기 전에 손을 떼면 끌기가 아니라 고르기다. 문턱이 없으면
"고르려고 눌렀는데 1px 밀려서 노드가 움직이는" 일이 난다. 순수 함수라 그 문턱을
검사로 묶는다. `PointerLike` 는 `{ x, y, button, shiftKey }` 만 받는 우리 타입이라
DOM 이벤트가 필요 없다.

줌은 휠, 트랙패드 핀치는 `ctrlKey + wheel`. 둘 다 `zoomAt(viewport, 커서, 배수)`.
팬은 배경을 끌거나 가운데 단추.

선을 집을 때는 `edgeTolerance: theme.edge.hitTolerance / zoom` 을 넘긴다 —
렌더러가 월드 단위라고 타입에 적어 둔 그 자리다.

### 캔버스 크기

`ResizeObserver` 로 컨테이너를 보고, `canvasPixelSize(cssSize, devicePixelRatio)`
로 `canvas.width`/`height` 를 정한다. 렌더러는 엘리먼트를 안 만지므로 이 일은
전부 여기 있다.

## 텍스트 쪽

`yCollab(source, null, { undoManager })`. awareness 는 `if (awareness)` 로 감싸여
있어 `null` 이면 원격 커서 플러그인만 빠진다 — 프레즌스가 올 때 채운다.

키맵은 `yUndoManagerKeymap` 을 쓴다.

### 진단

`Diagnostic { severity, code, message, line, span }` 이 `@codemirror/lint` 의
`{ from, to, severity, message }` 와 거의 1:1 이다. **이미 파싱한 결과를 그대로
넘긴다 — 린터 안에서 다시 파싱하지 않는다.**

에디터에 밑줄, 왼쪽 아래에 목록. 목록의 줄을 누르면 그 자리로 간다.

## 인스펙터

고른 것이 있을 때만 캔버스 오른쪽 위에 뜬다.

- **노드** — 이름(입력), 종류(다섯 중 하나), 지우기
- **선 · 그룹** — 읽기 전용. 끝점·라벨을 보여 주고 **"텍스트에서 이 줄로 가기"**
  단추가 CodeMirror 을 `decl.line` 으로 보낸다

선과 그룹을 막다른 골목으로 두지 않으면서 이번 범위를 넘지 않는 쪽이고,
"텍스트가 문서다" 를 화면이 한 번 더 말하게 된다.

## 화면 구성

좌우 분할. 왼쪽은 CodeMirror 위·진단 목록 아래, 오른쪽은 캔버스 전체에
인스펙터 카드와 맞춤/줌 단추가 떠 있다. 기본 비율 40:60, 끌어서 조절하고 그
비율만 `localStorage` 에 둔다 — 문서가 아니라 보는 사람의 편의다.

키보드: `Cmd+Z`/`Cmd+Shift+Z` 되돌리기, `Delete` 고른 노드 지우기, `Esc` 선택
풀기, 맞춤 단추. 커맨드 팔레트와 키보드 전용 조작은 README 의 별도 항목이라
여기서 하지 않는다.

## 의존성과 설정

`next 16.3.5` · `react 19.3.0` · `react-dom` · `yjs 13.6.32` ·
`y-codemirror.next 0.3.6` · `codemirror 6` (`@codemirror/state` · `view` · `lint` ·
`commands`) · `@keel/dsl` · `@keel/graph` · `@keel/renderer` (`workspace:*`).

- `tsconfig.json` 은 `@keel/config/tsconfig/next.json` 을 잇되 **`module`·
  `moduleResolution` 을 `nodenext` 로 덮어쓴다.** 세 패키지가 상대 경로를
  `./cull.js` 처럼 적는데, Turbopack 이 그것을 `cull.ts` 로 바꿔 찾으려면
  `nodenext` 여야 한다 — 공유 프리셋의 `bundler` 로 두면 `@keel/renderer` 의
  재수출 전부가 "모듈을 못 찾는다" 로 빌드를 깬다. (구현하며 확인한 것이다.
  처음에는 `transpilePackages` 가 관문일 것으로 적어 두었으나 아니었다 —
  Next 16 의 Turbopack 은 워크스페이스 소스를 그대로 읽으므로 그 설정은
  넣으나 빼나 결과가 같고, `next.config.ts` 는 비워 둔다.)
- `tsconfig.json` 의 `include` 에 `*.ts` 를 넣지 않는다. 넣으면
  `next.config.ts` 와 `vitest.config.ts` 가 이 프로젝트에도 들고 공유 eslint
  프리셋의 `allowDefaultProject` 에도 들어 typescript-eslint 가 파싱을 거부한다.
- `eslint.config.js` 는 `@keel/config/eslint/react` 의 `reactConfig`.
- `pnpm-workspace.yaml` 의 globs 에 **`e2e` 를 더한다.** 지금 `apps/*` 와
  `packages/*` 뿐이라 turbo 의 `e2e` 태스크가 돌 곳이 없다.
- 화면은 `'use client'` 다. CodeMirror 과 캔버스 컨텍스트는 전부 `useEffect`
  안에서 만들므로 렌더 시점에 DOM 을 건드리지 않고, 따라서 `dynamic(ssr:false)`
  가 필요 없다.

`@keel/renderer` 의 `Ctx2D` 가 실제 브라우저 타입과 맞는지는 경계에서 한 줄로
잡는다. 어긋나면 **거기서** 컴파일이 깨진다.

```ts
const ctx: Ctx2D = canvas.getContext('2d')!;
```

## 오류 처리

- 파서는 던지지 않는다(이미 보장). 글자를 치는 도중의 문서는 늘 문법에 어긋나
  있고, 화면은 그 상태로도 계속 그린다.
- `applyTextEdits` 의 겹침은 던진다. 버그이므로 시끄러워야 한다.
- `plan*` 이 빈 배열이면 명령은 아무 일도 안 한다 — 빈 트랜잭션을 만들지 않는다.
  빈 트랜잭션은 되돌리기 역사에 빈 칸을 남긴다.
- 캔버스 컨텍스트를 못 얻으면(아주 오래된 브라우저) 캔버스 자리에 한 줄 안내를
  두고 에디터는 그대로 쓴다.

## 검사

`src/document/` 와 `src/interaction/` 은 React 가 없어 Node 에서 그대로 돈다.
**jsdom 은 들이지 않는다** — 지금까지의 방식을 그대로 지킨다.

| 검사 | 묶는 것 |
|---|---|
| 캔버스에서 이름을 고쳐도 **주석과 줄 순서가 그대로다** | `edits.ts` 가 있는 이유 전부 |
| **두 `Y.Doc` 을 서로 붙여 같은 순간 양쪽에서 고쳐도 둘 다 산다** | README 의 핵심 주장. 서버 없이 지금 검사된다 |
| 되돌리기가 타이핑과 끌기를 **한 역사**로 되돌린다 | origin 배선이 실제로 도는지 |
| 겹치는 수정은 던진다 | 조용한 실패 막기 |
| `plan*` 이 비면 빈 트랜잭션을 안 만든다 | 되돌리기 역사의 빈 칸 |
| 노드를 지우면 레이아웃 자리도 같이 사라진다 | 유령 좌표 |
| 제스처: 4px 문턱을 안 넘으면 끌기가 아니라 고르기다 | 고르려다 노드가 밀리는 일 |
| `withDrag` 는 끌고 있는 노드만 다른 자리를 준다 | 덧씌우기가 나머지를 안 건드리는지 |

**고친 것을 되돌려 검사가 실제로 지는지 확인한 뒤에** 커밋한다. 앞선 판에서
이 확인이 값을 했다 — 얕은 그룹으로 쓴 라벨 띠 검사는 아무것도 묶지 못했다.

### e2e — 스모크 하나

`e2e/smoke.spec.ts`, Playwright. 컴포넌트에 단위 검사가 없으므로 고리가 실제로
도는 것만 묶는다.

1. 화면이 서고 씨앗 문서의 노드가 캔버스에 그려진다
2. 에디터에 `service 새노드` 를 치면 캔버스에 노드가 하나 는다
3. 노드를 끌어 놓으면 놓은 자리에 남는다 (다시 그려도 제자리)

캔버스는 픽셀이라 직접 못 읽는다. 그래서 화면이 **검사용 창구**를 하나 내놓는다 —
`window.__keel = { sceneSummary() }` 가 노드 수·id·반올림한 좌표만 돌려준다.
픽셀을 견주는 것보다 잘 깨지지 않고, 무엇이 틀렸는지도 읽힌다.

`process.env.NODE_ENV === 'production'` 이면 붙이지 않는다. Playwright 는 `pnpm dev`
로 띄운 화면을 보므로 창구가 살아 있고, 배포된 화면에는 없다.

## 이 판에서 같이 고칠 것

README 첫 문단의 "캔버스에서 노드를 끌면 그 텍스트가 바뀌고" 는
`위치는 텍스트에 쓰지 않는다` 와 어긋난다. 끌기는 레이아웃만 바꾼다. 화면이
생기면 이 어긋남이 눈에 보이므로 같이 고친다 — "캔버스에서 고치면 그 텍스트가
바뀌고" 쪽이 맞다.

## 범위 밖

선 잇기·지우기, 커맨드 팔레트, 키보드 전용 조작, 캔버스 대체 표현(낭독기),
태블릿 제스처, 저장·로그인·실시간, ELK 자동 레이아웃, 내보내기, 버전 스냅샷
화면, PWA. 전부 README 에 따로 적힌 항목이다.

## 앞날에 걸릴 것

- **`selection` 이 `Set<string>` 인 채로는 프레즌스를 못 버틴다.** 여러 명이면
  id → 사람 색이 필요하다. 소비자가 여기 하나뿐일 때 넓히는 값이 싸므로 지금은
  두되, 실시간 판의 첫 일감으로 적어 둔다.
- **이름 바꾸기는 아직 없다.** `planRenameNodeId` 를 붙일 때는 레이아웃 `Y.Map`
  의 자리도 **같은 트랜잭션에서** 옮겨야 한다. 안 그러면 노드가 손으로 맞춘
  자리를 잃는다.
- **ELK 가 오면 `withDrag` 위에 한 겹이 더 붙는다.** 그때도 글자는 워커에서
  재지 않는다 — 워커의 어림값과 본체의 실측이 어긋나면 레이아웃이 돌아올 때마다
  기하가 밀린다.
- 끌기 중 프레임마다 `buildScene` 을 도는 것이 1,000노드에서 버티는지는 **재고
  나서 숫자로 적는다.** 안 버티면 `diffGraphs` 가 이미 있으니 증분 경로를 밖에서
  감싼다 — `buildScene` 이 캐시를 안 들고 있는 것이 그래서다.
