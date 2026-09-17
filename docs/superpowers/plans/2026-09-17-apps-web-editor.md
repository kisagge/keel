# apps/web 에디터 화면 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@keel/dsl`·`@keel/graph`·`@keel/renderer` 를 처음으로 화면에 붙여, 텍스트와 캔버스가 서로를 고치는 에디터를 만든다.

**Architecture:** 텍스트가 문서다. `Y.Text('source')` 가 진실이고 캔버스 조작도 `plan*()` → `TextEdit[]` → `Y.Text` 를 거쳐 돌아온다. 좌표는 `Y.Map('layout')` 에 따로 있고 사람이 옮긴 노드만 들어간다. 상호작용 상태는 **빈도로 가른다** — 뷰포트·끌기·가리킨 것은 `useRef`+RAF(React 재조정 0회), 고른 것과 소스는 React state. `src/document/` 와 `src/interaction/` 에는 React 가 안 들어오므로 Node 에서 그대로 검사된다.

**Tech Stack:** Next 16.3.5 (App Router) · React 19.3.0 · yjs 13.6.32 · y-codemirror.next 0.3.6 · CodeMirror 6 (`@codemirror/state`·`view`·`lint`·`commands`) · Playwright · Vitest 4.1.11 · TypeScript 6.0.3 · pnpm 11.24.0 / Node 24

**Spec:** `docs/superpowers/specs/2026-09-17-apps-web-editor-design.md`

## Global Constraints

- **Node `>=24.0.0`, pnpm `11.24.0`.** 루트 `package.json` 의 `engines`·`packageManager` 에 고정돼 있다.
- **워크스페이스 의존성은 `workspace:*`.** 버전 숫자를 직접 적지 않는다.
- **공유 devDeps 버전은 기존 패키지와 똑같이 적는다:** `@types/node 24.9.2`, `eslint 10.9.1`, `typescript 6.0.3`, `vitest 4.1.11`.
- **`verbatimModuleSyntax: true`** — 타입은 반드시 `import type`.
- **`noUncheckedIndexedAccess`·`exactOptionalPropertyTypes` 켜져 있다** — 배열 인덱싱 결과는 `| undefined`, 선택 속성은 `?: T | undefined` 로 적는다.
- **상대 경로 import 는 `.js` 확장자로 끝난다** (ESM). 예: `./text-edits.js`.
- **`@keel/*` 패키지는 빌드 없이 생 `.ts` 를 내보내고, 상대 경로를 `./cull.js` 처럼 적는다.** Vitest 는 그대로 읽는다. Turbopack 은 `apps/web/tsconfig.json` 의 `moduleResolution: nodenext` 가 있어야 읽는다 — `transpilePackages` 로는 안 된다.
- **jsdom·happy-dom 을 저장소에 들이지 않는다.** React 컴포넌트 단위 검사는 하지 않고, 검사할 값어치가 있는 것은 전부 `src/document/`·`src/interaction/` 의 순수 모듈로 내린다.
- **주석과 검사 이름은 한국어로 쓴다.** 기존 패키지와 같은 어조 — 무엇을 하는지가 아니라 **왜 그렇게 했는지**를 적는다.
- **각 태스크를 커밋하기 전에 고친 것을 되돌려 검사가 실제로 지는지 확인한다.** 이것이 이 저장소의 방식이고, 앞선 판에서 아무것도 묶지 못하는 검사를 실제로 잡아냈다.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` 를 붙인다.

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `apps/web/package.json` · `next.config.ts` · `tsconfig.json` · `eslint.config.js` · `vitest.config.ts` | 앱 설정. Turbopack 이 `./x.js` 를 `x.ts` 로 찾게 하는 `moduleResolution: nodenext` 가 여기 있다 |
| `apps/web/app/layout.tsx` · `page.tsx` · `globals.css` | App Router 뼈대. `page.tsx` 가 `'use client'` 화면 |
| `apps/web/src/document/text-edits.ts` | `applyTextEdits` — 이 판의 핵심. Y.Text 에 구간 수정을 얹는다 |
| `apps/web/src/document/keel-document.ts` | `Y.Doc` 배선과 하나짜리 되돌리기 역사 |
| `apps/web/src/document/commands.ts` | 캔버스 조작 → `plan*()` → 한 트랜잭션 |
| `apps/web/src/document/layout-reader.ts` | `Y.Map` → `LayoutReader`, 끌기 덧씌우기 |
| `apps/web/src/document/derive.ts` | 소스 → `ParsedDocument`·`Graph`, 그래프+레이아웃 → `Scene` |
| `apps/web/src/interaction/gesture.ts` | 포인터 제스처 순수 상태 기계 |
| `apps/web/src/interaction/wheel.ts` | 휠·핀치 → 뷰포트 |
| `apps/web/src/hooks/*.ts` | 위 순수 모듈을 React 에 잇는 얇은 껍데기 |
| `apps/web/src/components/*.tsx` | 화면. 로직을 담지 않는다 |
| `e2e/` | Playwright 스모크. 새 워크스페이스 |

`src/document/` 와 `src/interaction/` 에는 React 가 들어오지 않는다. 훅과 컴포넌트는 얇게 유지해서, 검사할 값어치가 있는 것이 전부 순수 모듈에 있게 한다.

---

## Task 1: apps/web 뼈대 — 빈 화면이 서고 워크스페이스가 이어진다

**Files:**
- Create: `apps/web/package.json`, `apps/web/next.config.ts`, `apps/web/tsconfig.json`, `apps/web/eslint.config.js`, `apps/web/vitest.config.ts`, `apps/web/next-env.d.ts`
- Create: `apps/web/app/layout.tsx`, `apps/web/app/page.tsx`, `apps/web/app/globals.css`
- Create: `apps/web/test/wiring.test.ts`

**Interfaces:**
- Consumes: `@keel/renderer` 의 `DEFAULT_THEME`, `@keel/dsl` 의 `parse`
- Produces: `@keel/web` 워크스페이스. 이후 모든 태스크가 여기 안에서 돈다

- [ ] **Step 1: 워크스페이스 이어짐을 확인하는 실패하는 검사를 쓴다**

`apps/web/test/wiring.test.ts`:

```ts
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
```

- [ ] **Step 2: 검사를 돌려 지는 것을 본다**

Run: `cd apps/web && npx vitest run`
Expected: FAIL — `apps/web` 이 아직 워크스페이스가 아니라 `vitest` 도 `@keel/*` 도 없다

- [ ] **Step 3: 설정 파일 여섯 개를 쓴다**

`apps/web/package.json`:

```json
{
  "name": "@keel/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start --port 3000",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@keel/dsl": "workspace:*",
    "@keel/graph": "workspace:*",
    "@keel/renderer": "workspace:*",
    "@codemirror/commands": "6.11.1",
    "@codemirror/lint": "6.9.7",
    "@codemirror/state": "6.7.5",
    "@codemirror/view": "6.43.12",
    "next": "16.3.5",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "y-codemirror.next": "0.3.6",
    "yjs": "13.6.32"
  },
  "devDependencies": {
    "@keel/config": "workspace:*",
    "@types/node": "24.9.2",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "eslint": "10.9.1",
    "typescript": "6.0.3",
    "vitest": "4.1.11"
  }
}
```

`apps/web/next.config.ts`:

```ts
import type { NextConfig } from 'next';

/**
 * 비어 있다.
 *
 * `@keel/*` 는 빌드 없이 생 `.ts` 를 내보내는데(`exports` 가 `./src/index.ts` 를
 * 가리킨다), Next 16 의 Turbopack 은 워크스페이스 소스를 그대로 읽으므로
 * `transpilePackages` 가 필요 없다. 넣어도 결과가 같은 것을 확인했다.
 *
 * 대신 걸리는 것은 **`tsconfig.json` 의 `moduleResolution`** 이다. 이 저장소의
 * 패키지들은 상대 경로를 `./cull.js` 처럼 적는데(ESM 관례), Turbopack 이 그것을
 * `cull.ts` 로 바꿔 찾으려면 `nodenext` 여야 한다. 공유 프리셋은 `bundler` 라
 * `apps/web/tsconfig.json` 에서만 덮어쓴다 — 거기 그 이유를 적어 두었다.
 */
const config: NextConfig = {};

export default config;
```

`apps/web/tsconfig.json`:

```json
{
  "extends": "@keel/config/tsconfig/next.json",
  "compilerOptions": {
    "types": ["node"],

    /**
     * 공유 프리셋은 `bundler` 인데 여기서만 `nodenext` 로 덮어쓴다.
     *
     * 이 저장소의 패키지들은 상대 경로를 `./cull.js` 처럼 적는다(ESM 관례).
     * Turbopack 이 그것을 `cull.ts` 로 바꿔 찾아 주려면 `nodenext` 여야 한다 —
     * `bundler` 로 두면 `@keel/renderer` 의 재수출 전부가 "모듈을 못 찾는다" 로
     * 빌드를 깬다. `transpilePackages` 로는 안 고쳐진다(그쪽은 필요도 없다).
     */
    "module": "nodenext",
    "moduleResolution": "nodenext",

    "paths": { "@/*": ["./src/*"] }
  },

  /**
   * `*.ts` 를 넣지 않는다. 넣으면 `next.config.ts` 와 `vitest.config.ts` 가
   * 이 프로젝트에도 들고 공유 eslint 프리셋의 `allowDefaultProject` 에도 들어,
   * typescript-eslint 가 파싱을 거부한다. 다른 패키지들도 `src`·`test` 만 넣는다.
   */
  "include": ["next-env.d.ts", "app/**/*", "src/**/*", "test/**/*"],
  "exclude": ["node_modules", ".next"]
}
```

`apps/web/eslint.config.js`:

```js
import { reactConfig } from '@keel/config/eslint/react';
export default reactConfig;
```

`apps/web/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
```

`apps/web/next-env.d.ts` — 두 줄로 만들어 두되 **글자를 붙들지 않는다.**

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

이 파일은 **Next 가 관리한다.** `next build`/`next dev` 가 처음 돌 때 타입 있는
라우트를 가리키는 줄과 "편집하지 말라" 는 주석을 스스로 덧붙인다. 커밋에는
**빌드를 한 번 돌린 뒤의 내용**을 넣는다 — 두 줄짜리를 커밋하면 빌드를 돌릴
때마다 워킹 트리가 더러워진다.

덧붙는 줄이 `./.next/types/...` 를 가리키는데 `.next/` 는 무시되는 폴더라 새로
받은 저장소에는 그 파일이 없다. 그래도 `tsc` 는 안 깨진다 — 부수 효과만 있는
import 는 `noUncheckedSideEffectImports` 를 켜야 못 찾는 것을 문제 삼고, 이
저장소는 안 켜 두었다. `.next/` 를 지우고 `pnpm typecheck` 를 돌려 확인했다.

- [ ] **Step 4: 화면 뼈대 셋을 쓴다**

`apps/web/app/globals.css`:

```css
:root {
  --keel-bg: #fbfbfa;
  --keel-surface: #ffffff;
  --keel-border: #d6d3d1;
  --keel-text: #1c1917;
  --keel-muted: #78716c;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  height: 100%;
  background: var(--keel-bg);
  color: var(--keel-text);
  font-family: Inter, Pretendard, system-ui, sans-serif;
}

#__next, body > div { height: 100%; }
```

`apps/web/app/layout.tsx`:

```tsx
import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'KEEL',
  description: '텍스트로 관리하는 실시간 협업 다이어그램',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
```

`apps/web/app/page.tsx` (이 판에서는 자리표. Task 12 에서 진짜 화면이 된다):

```tsx
'use client';

import { DEFAULT_THEME } from '@keel/renderer';

export default function EditorPage() {
  return (
    <main style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
      <p style={{ color: DEFAULT_THEME.colors.mutedText }}>
        KEEL — 노드 높이 {DEFAULT_THEME.node.height}
      </p>
    </main>
  );
}
```

`DEFAULT_THEME` 을 화면에 쓰는 것은 일부러다. 이 값이 브라우저에 뜨면
Turbopack 이 워크스페이스 소스를 실제로 읽었다는 뜻이다.

- [ ] **Step 5: 설치하고 검사가 통과하는 것을 본다**

Run: `pnpm install && cd apps/web && npx vitest run`
Expected: PASS (1 test)

- [ ] **Step 6: 빌드와 타입·린트를 확인한다**

Run: `cd /Users/kisagge/my-projects/keel && pnpm typecheck && pnpm lint && pnpm --filter @keel/web build`
Expected: 셋 다 성공.

- [ ] **Step 7: 진짜 관문이 무엇인지 되돌려 확인한다**

`apps/web/tsconfig.json` 에서 `module`·`moduleResolution` 두 줄을 지우고
(공유 프리셋의 `bundler` 로 떨어뜨린 뒤) `pnpm --filter @keel/web build`.

Expected: FAIL — `@keel/renderer/src/index.ts` 의 상대 재수출마다
`Module not found: Can't resolve './cull.js'` 가 난다. 확인 후 되돌린다.

`transpilePackages` 는 **관문이 아니다.** Next 16 의 Turbopack 은 워크스페이스
소스를 그대로 읽는다 — 넣으나 빼나 결과가 같다.

- [ ] **Step 8: 커밋**

```bash
git add apps/web pnpm-lock.yaml
git commit -F - <<'EOF'
web: 앱 뼈대 — 세 패키지가 화면 쪽에서 이어진다

@keel/dsl·graph·renderer 는 빌드 없이 생 .ts 를 내보내고 상대 경로를 ./cull.js
처럼 적는다. Turbopack 이 그것을 cull.ts 로 바꿔 찾으려면 moduleResolution 이
nodenext 여야 한다 — 공유 프리셋의 bundler 로 두면 renderer 의 재수출 전부가
"모듈을 못 찾는다" 로 빌드를 깬다. 두 줄을 지워 지는 것을 확인했다.

transpilePackages 는 필요 없었다. 넣으나 빼나 빌드가 같으므로 next.config.ts 는
비워 두고 왜 비었는지를 거기 적었다. 안 쓰는 설정을 "이게 없으면 안 된다" 는
주석과 함께 두는 것이 더 나쁘다.

tsconfig 의 include 에 *.ts 를 넣지 않는다. 넣으면 next.config.ts 와
vitest.config.ts 가 이 프로젝트에도 들고 공유 eslint 프리셋의
allowDefaultProject 에도 들어, typescript-eslint 가 파싱을 거부한다.

첫 검사는 세 패키지를 그대로 불러 장면을 세우는 것 하나다. 이어지지 않으면
화면을 만들 것도 없으므로 가장 먼저 묶는다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 2: applyTextEdits — 구간 수정을 Y.Text 에 얹는다

**Files:**
- Create: `apps/web/src/document/text-edits.ts`
- Create: `apps/web/test/text-edits.test.ts`

**Interfaces:**
- Consumes: `@keel/dsl` 의 `TextEdit`(`{ from: number; to: number; insert: string }`), `parse`, `planSetNodeLabel`
- Produces: `applyTextEdits(ytext: Y.Text, edits: readonly TextEdit[]): void`

- [ ] **Step 1: 실패하는 검사를 쓴다**

`apps/web/test/text-edits.test.ts`:

```ts
import { parse, planSetNodeLabel } from '@keel/dsl';
import type { TextEdit } from '@keel/dsl';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { applyTextEdits } from '../src/document/text-edits.js';

function textOf(source: string): Y.Text {
  const doc = new Y.Doc();
  const ytext = doc.getText('source');
  ytext.insert(0, source);
  return ytext;
}

describe('구간 수정 얹기', () => {
  it('한 군데만 고친다', () => {
    const ytext = textOf('service a "옛 이름"\nservice b');
    const edits = planSetNodeLabel(parse(ytext.toString()), 'a', '새 이름');

    applyTextEdits(ytext, edits);

    expect(ytext.toString()).toBe('service a "새 이름"\nservice b');
  });

  /** 이 저장소가 통째로 다시 쓰기를 피하는 이유 전부가 이 검사에 들어 있다 */
  it('주석과 줄 순서를 건드리지 않는다', () => {
    const source = [
      '# 주문이 들어와서 결제까지',
      '',
      'service web "스토어프론트"',
      'service api',
      '',
      'web -> api  # 여기 주석',
    ].join('\n');

    const ytext = textOf(source);
    applyTextEdits(ytext, planSetNodeLabel(parse(source), 'api', '주문 API'));

    const after = ytext.toString();
    expect(after).toContain('# 주문이 들어와서 결제까지');
    expect(after).toContain('web -> api  # 여기 주석');
    expect(after.split('\n')).toHaveLength(source.split('\n').length);
  });

  it('여러 군데를 한 번에 고쳐도 뒤쪽 자리가 안 밀린다', () => {
    const ytext = textOf('aaa bbb ccc');
    const edits: TextEdit[] = [
      { from: 0, to: 3, insert: 'XXXXX' },
      { from: 8, to: 11, insert: 'Z' },
    ];

    applyTextEdits(ytext, edits);

    expect(ytext.toString()).toBe('XXXXX bbb Z');
  });

  it('빈 배열이면 트랜잭션을 아예 안 연다', () => {
    const doc = new Y.Doc();
    const ytext = doc.getText('source');
    ytext.insert(0, 'service a');

    let updates = 0;
    doc.on('update', () => {
      updates += 1;
    });

    applyTextEdits(ytext, []);
    expect(updates).toBe(0);
  });

  /**
   * `delete`·`insert` 는 하나하나가 제 트랜잭션을 연다. 안 묶으면 수정 둘이
   * 갱신 **넷**으로 날아가고, 실시간 판에서 남의 화면이 반쯤 고쳐진 문서를
   * 실제로 본다.
   */
  it('수정이 여럿이어도 갱신은 한 번이다', () => {
    const doc = new Y.Doc();
    const ytext = doc.getText('source');
    ytext.insert(0, 'aaa bbb ccc');

    let updates = 0;
    doc.on('update', () => {
      updates += 1;
    });

    applyTextEdits(ytext, [
      { from: 0, to: 3, insert: 'XXXXX' },
      { from: 8, to: 11, insert: 'Z' },
    ]);

    expect(updates).toBe(1);
    expect(ytext.toString()).toBe('XXXXX bbb Z');
  });

  /** 부르는 쪽이 이미 트랜잭션 안이면 바깥 것에 합쳐지고 origin 도 지켜진다 */
  it('바깥 트랜잭션 안에서 불러도 그 origin 을 지킨다', () => {
    const doc = new Y.Doc();
    const ytext = doc.getText('source');
    ytext.insert(0, 'service a');

    const OUTER = Symbol('바깥');
    const origins: unknown[] = [];
    doc.on('afterTransaction', (transaction: Y.Transaction) => {
      origins.push(transaction.origin);
    });

    doc.transact(() => {
      applyTextEdits(ytext, [{ from: 8, to: 9, insert: 'b' }]);
    }, OUTER);

    expect(origins).toEqual([OUTER]);
    expect(ytext.toString()).toBe('service b');
  });

  /**
   * `dsl` 의 `applyEdits` 는 문자열 사본에 얹으므로 중간에 던져도 남는 것이 없다.
   * 여기는 **여럿이 함께 보는 문서**를 직접 고치므로, 반쯤 고치다 던지면 남의
   * 화면에 깨진 문서가 남는다. 그래서 먼저 전부 검사하고 그다음에 얹는다.
   */
  it('겹치는 수정은 던지고, 문서는 손도 안 댄 채로 남는다', () => {
    const ytext = textOf('aaaaaaaaaa');
    const edits: TextEdit[] = [
      { from: 0, to: 5, insert: 'X' },
      { from: 3, to: 8, insert: 'Y' },
    ];

    expect(() => applyTextEdits(ytext, edits)).toThrow(/겹치는 수정/);
    expect(ytext.toString()).toBe('aaaaaaaaaa');
  });
});
```

- [ ] **Step 2: 검사를 돌려 지는 것을 본다**

Run: `cd apps/web && npx vitest run test/text-edits.test.ts`
Expected: FAIL — `../src/document/text-edits.js` 를 찾을 수 없다

- [ ] **Step 3: 구현을 쓴다**

`apps/web/src/document/text-edits.ts`:

```ts
import type { TextEdit } from '@keel/dsl';
import type * as Y from 'yjs';

/**
 * 구간 수정 목록을 `Y.Text` 에 얹는다.
 *
 * `packages/dsl` 의 설계 전부가 이 함수 하나를 위해 있었다. 캔버스가 문서를
 * 통째로 다시 쓰면 사람이 쓴 주석과 줄 순서가 사라지고, CRDT 에서는 같은 순간
 * 남이 친 글자가 **병합이 아니라 소멸**이 된다. 그래서 그 자리만 고친다.
 *
 * ## 먼저 전부 검사하고, 그다음에 얹는다
 *
 * `dsl` 의 `applyEdits` 는 문자열 사본에 얹으므로 중간에 던져도 남는 것이 없다.
 * 여기는 **여럿이 함께 보는 문서**를 직접 고친다. 반쯤 고치다 던지면 남의 화면에
 * 깨진 문서가 남고, 그것이 그대로 다른 사람에게 퍼진다.
 *
 * ## 뒤에서부터 얹는다
 *
 * 내림차순으로 가면 앞쪽 오프셋이 그대로 맞는다. 앞에서부터 가면 수정 하나마다
 * 뒤쪽 자리를 전부 다시 세어야 한다.
 *
 * ## 한 트랜잭션으로 묶는다
 *
 * `Y.Text` 의 `delete`·`insert` 는 하나하나가 제 트랜잭션을 연다. 안 묶으면
 * 수정 두 개가 갱신 **네 번**으로 날아가고(직접 재 봤다), 실시간 판에서 남의
 * 화면은 반쯤 고쳐진 문서를 실제로 본다 — 이 함수가 막겠다고 적어 둔 바로
 * 그것이 예외가 날 때만이 아니라 평소에도 새는 셈이다.
 *
 * 부르는 쪽이 이미 트랜잭션 안이면(`commands.ts` 가 그렇다) 중첩이 되는데,
 * Yjs 는 그것을 바깥 것에 합치고 **바깥 origin 을 지킨다.** 확인했다 —
 * 그래서 되돌리기가 보는 origin 이 안 바뀐다.
export function applyTextEdits(ytext: Y.Text, edits: readonly TextEdit[]): void {
  if (edits.length === 0) return;

  const sorted = [...edits].sort((a, b) => b.from - a.from || b.to - a.to);

  // 검사는 트랜잭션 **밖**에서 한다 — 던지면 트랜잭션을 아예 열지 않는다
  let previousFrom = Number.POSITIVE_INFINITY;
  for (const edit of sorted) {
    if (edit.to > previousFrom) {
      throw new Error(`겹치는 수정: [${edit.from}, ${edit.to}) 가 ${previousFrom} 뒤를 침범한다`);
    }
    previousFrom = edit.from;
  }

  const apply = (): void => {
    for (const edit of sorted) {
      if (edit.to > edit.from) ytext.delete(edit.from, edit.to - edit.from);
      if (edit.insert.length > 0) ytext.insert(edit.from, edit.insert);
    }
  };

  const doc = ytext.doc;
  if (doc === null) {
    // 문서에 안 붙은 Y.Text. 묶을 트랜잭션이 없으니 그냥 얹는다
    apply();
    return;
  }
  doc.transact(apply);
}
```

- [ ] **Step 4: 검사를 돌려 통과하는 것을 본다**

Run: `cd apps/web && npx vitest run test/text-edits.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 검사가 실제로 무는지 확인한다**

두 가지를 차례로 해 보고 각각 되돌린다.

1. 정렬을 오름차순(`a.from - b.from`)으로 바꾼다 → `여러 군데를 한 번에 고쳐도…` 가 져야 한다
2. 검사 고리를 지우고 얹기 고리 안에서 던지게 한다 → `겹치는 수정은 던지고, 문서는 손도 안 댄 채로…` 가 져야 한다
3. `doc.transact(apply)` 를 `apply()` 로 바꾼다 → `수정이 여럿이어도 갱신은 한 번이다` 가 져야 한다 (갱신이 4번 난다)

Expected: 둘 다 FAIL. 확인 후 되돌린다.

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/document/text-edits.ts apps/web/test/text-edits.test.ts
git commit -F - <<'EOF'
web: 구간 수정을 Y.Text 에 얹는다

packages/dsl 의 설계 전부가 이 함수 하나를 위해 있었다. 통째로 다시 쓰면
주석과 줄 순서가 사라지고, CRDT 에서는 같은 순간 남이 친 글자가 병합이 아니라
소멸이 된다.

먼저 전부 검사하고 그다음에 얹는다. dsl 의 applyEdits 는 문자열 사본에 얹으므로
중간에 던져도 남는 것이 없지만, 여기는 여럿이 함께 보는 문서를 직접 고친다 —
반쯤 고치다 던지면 남의 화면에 깨진 문서가 남고 그대로 퍼진다.

수정 여럿을 한 트랜잭션으로 묶는다. Y.Text 의 delete·insert 는 하나하나가 제
트랜잭션을 열어서, 안 묶으면 수정 두 개가 갱신 네 번으로 날아간다 — 실시간
판에서 남의 화면이 반쯤 고쳐진 문서를 실제로 본다. 부르는 쪽이 이미 트랜잭션
안이면 중첩이 바깥 것에 합쳐지고 바깥 origin 도 지켜지는 것을 검사로 묶었다.

정렬을 오름차순으로, 검사 고리를 얹기 고리 안으로, 트랜잭션 묶기를 빼는 것
셋으로 각각 검사가 지는 것을 확인했다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 3: keel-document — Y.Doc 배선과 하나짜리 되돌리기 역사

**Files:**
- Create: `apps/web/src/document/keel-document.ts`
- Create: `apps/web/test/keel-document.test.ts`

**Interfaces:**
- Consumes: `@keel/renderer` 의 `Point`
- Produces:
  - `KEEL_LOCAL: symbol` — 캔버스 명령의 트랜잭션 origin
  - `interface KeelDocument { doc: Y.Doc; source: Y.Text; layout: Y.Map<Point>; undoManager: Y.UndoManager; destroy(): void }`
  - `createKeelDocument(seed: string, extraTrackedOrigins?: readonly unknown[]): KeelDocument`

- [ ] **Step 1: 실패하는 검사를 쓴다**

`apps/web/test/keel-document.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { KEEL_LOCAL, KEEL_SEED, createKeelDocument } from '../src/document/keel-document.js';

describe('문서 배선', () => {
  it('씨앗을 소스에 넣고 시작한다', () => {
    const document = createKeelDocument('service a\nservice b');
    expect(document.source.toString()).toBe('service a\nservice b');
    document.destroy();
  });

  it('레이아웃은 비어 있다 — 사람이 옮긴 노드만 들어간다', () => {
    const document = createKeelDocument('service a');
    expect(document.layout.size).toBe(0);
    document.destroy();
  });

  /**
   * 씨앗을 되돌릴 수 있게 두면 화면을 열자마자 Cmd+Z 한 번에 문서가 통째로
   * 사라진다. 씨앗은 "사람이 한 일" 이 아니다.
   */
  it('씨앗은 되돌려지지 않는다', () => {
    const document = createKeelDocument('service a');
    document.undoManager.undo();
    expect(document.source.toString()).toBe('service a');
    document.destroy();
  });

  /**
   * 위 검사는 **순서**가 지켜 준다 — 씨앗이 `UndoManager` 보다 먼저 들어간다.
   * origin 을 따로 둔 값은 여기서 나온다: 이미 살아 있는 되돌리기 옆에 얹어도
   * 안 되돌아가야 한다. 서버에서 받은 문서를 얹을 때가 그 자리다.
   */
  it('되돌리기가 살아 있는 동안 넣은 것도 KEEL_SEED 면 안 되돌아간다', () => {
    const document = createKeelDocument('service a');

    document.doc.transact(() => document.source.insert(9, ' "나중"'), KEEL_SEED);
    document.undoManager.undo();

    expect(document.source.toString()).toBe('service a "나중"');
    document.destroy();
  });

  it('KEEL_LOCAL 로 한 텍스트 수정은 되돌려진다', () => {
    const document = createKeelDocument('service a');

    document.doc.transact(() => document.source.insert(9, ' "이름"'), KEEL_LOCAL);
    expect(document.source.toString()).toBe('service a "이름"');

    document.undoManager.undo();
    expect(document.source.toString()).toBe('service a');
    document.destroy();
  });

  it('KEEL_LOCAL 로 한 레이아웃 수정도 되돌려진다', () => {
    const document = createKeelDocument('service a');

    document.doc.transact(() => document.layout.set('a', { x: 10, y: 20 }), KEEL_LOCAL);
    expect(document.layout.get('a')).toEqual({ x: 10, y: 20 });

    document.undoManager.undo();
    expect(document.layout.get('a')).toBeUndefined();
    document.destroy();
  });

  /**
   * 역사가 둘로 나뉘면 사람이 "방금 뭘 되돌렸는지" 를 못 따라간다.
   * 친 글자와 끈 노드가 한 역사여야 한다.
   *
   * **`stopCapturing()` 이 걸음의 경계다.** Yjs 는 짧은 사이에 일어난 수정을
   * 한 걸음으로 묶는다(기본 500ms) — 글자를 칠 때는 그게 맞다. 대신 캔버스
   * 조작처럼 "한 번의 행동" 이 끝난 자리에서는 경계를 그어 준다.
   * `commands.ts` 가 명령마다 이것을 부른다.
   */
  it('텍스트와 레이아웃이 한 역사로 되돌아간다', () => {
    const document = createKeelDocument('service a');

    document.doc.transact(() => document.source.insert(9, ' "하나"'), KEEL_LOCAL);
    document.undoManager.stopCapturing();
    document.doc.transact(() => document.layout.set('a', { x: 1, y: 2 }), KEEL_LOCAL);

    document.undoManager.undo();
    expect(document.layout.get('a')).toBeUndefined();
    expect(document.source.toString()).toBe('service a "하나"');

    document.undoManager.undo();
    expect(document.source.toString()).toBe('service a');
    document.destroy();
  });

  /**
   * 반대쪽도 묶어 둔다 — **빠르게 친 글자는 한 걸음으로 합쳐져야 한다.**
   *
   * `captureTimeout: 0` 을 주면 이 검사가 진다. 그 값이면 `Cmd+Z` 가 글자를
   * 한 자씩 지워, 편집기로 쓸 수 없는 물건이 된다. 경계를 세우고 싶으면
   * 시간을 0 으로 만드는 게 아니라 `stopCapturing()` 을 부른다.
   */
  it('빠르게 친 글자는 한 걸음으로 묶인다', () => {
    const document = createKeelDocument('service a');

    for (const ch of ' "이름"') {
      document.doc.transact(() => document.source.insert(document.source.length, ch), KEEL_LOCAL);
    }
    expect(document.source.toString()).toBe('service a "이름"');

    document.undoManager.undo();
    expect(document.source.toString()).toBe('service a');
    document.destroy();
  });

  /**
   * y-codemirror.next 는 로컬 편집을 `YSyncConfig` 인스턴스를 origin 으로 삼아
   * 얹는다. Yjs 의 UndoManager 는 origin 을 **생성자로도** 견주므로
   * (UndoManager.js:216) 클래스를 넣어 두면 인스턴스를 손에 안 쥐어도 걸린다.
   */
  it('바깥에서 넘긴 origin 도 클래스로 추적한다', () => {
    class FakeSyncConfig {}
    const config = new FakeSyncConfig();

    const document = createKeelDocument('service a', [FakeSyncConfig]);
    document.doc.transact(() => document.source.insert(9, ' "밖"'), config);

    document.undoManager.undo();
    expect(document.source.toString()).toBe('service a');
    document.destroy();
  });

  it('추적하지 않는 origin 은 되돌려지지 않는다', () => {
    const document = createKeelDocument('service a');
    document.doc.transact(() => document.source.insert(9, ' "남"'), Symbol('원격'));

    document.undoManager.undo();
    expect(document.source.toString()).toBe('service a "남"');
    document.destroy();
  });
});
```

- [ ] **Step 2: 검사를 돌려 지는 것을 본다**

Run: `cd apps/web && npx vitest run test/keel-document.test.ts`
Expected: FAIL — 모듈을 찾을 수 없다

- [ ] **Step 3: 구현을 쓴다**

`apps/web/src/document/keel-document.ts`:

```ts
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
 * 씨앗처럼 **사람이 한 일이 아닌** 수정의 origin. 되돌리기가 추적하지 않는다.
 *
 * 지금 화면을 열자마자 `Cmd+Z` 로 문서가 사라지지 않는 것은 사실 **순서**가
 * 지켜 준다 — 씨앗이 `UndoManager` 보다 먼저 들어가서 되돌리기가 그 트랜잭션을
 * 아예 못 본다. 그러니 이 origin 은 지금 하는 일이 없다.
 *
 * 그래도 두는 이유는 곧 할 일이 생기기 때문이다. 서버가 붙으면 **이미 살아
 * 있는 되돌리기 옆에** 받아 온 문서를 얹게 되고, 그때는 origin 말고는 "이건
 * 사람이 한 게 아니다" 를 말할 방법이 없다. 그 자리를 검사로 미리 묶어 두었다.
 */
export const KEEL_SEED = Symbol('keel-seed');

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
```

- [ ] **Step 4: 검사를 돌려 통과하는 것을 본다**

Run: `cd apps/web && npx vitest run test/keel-document.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: 검사가 실제로 무는지 확인한다**

1. `trackedOrigins` 에 `KEEL_SEED` 를 더한다 → `되돌리기가 살아 있는 동안 넣은 것도 KEEL_SEED 면 안 되돌아간다` 가 져야 한다

   (씨앗의 origin 만 `KEEL_LOCAL` 로 바꾸는 것은 **안 문다** — 씨앗이 `UndoManager`
   보다 먼저 들어가 origin 과 무관하게 안 되돌아간다. 처음에 그렇게 적어 두었다가
   구현자가 안 문다고 알려 와서 고쳤다.)
2. `new Y.UndoManager([source, layout], …)` 를 `new Y.UndoManager(source, …)` 로 바꾼다 → 레이아웃 되돌리기 검사 둘이 져야 한다
3. `captureTimeout: 0` 을 넣어 본다 → `빠르게 친 글자는 한 걸음으로 묶인다` 가 져야 한다 (글자가 한 자씩 되돌아간다)

Expected: 각각 FAIL. 확인 후 되돌린다.

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/document/keel-document.ts apps/web/test/keel-document.test.ts
git commit -F - <<'EOF'
web: Y.Doc 배선과 하나짜리 되돌리기 역사

Y.Text('source') 가 문서이고 Y.Map('layout') 에는 사람이 옮긴 노드만 들어간다.

되돌리기는 둘을 함께 감싼다. 역사가 나뉘면 사람이 "방금 뭘 되돌렸는지" 를 못
따라간다. Yjs 의 UndoManager 가 origin 을 생성자로도 견주므로
(UndoManager.js:216) 화면 쪽이 YSyncConfig 클래스를 넘겨 주면 이 파일은
CodeMirror 을 몰라도 된다.

씨앗은 추적하지 않는 origin 으로 넣는다. 다만 지금 Cmd+Z 로 문서가 안 사라지는
것은 사실 순서가 지켜 준다 — 씨앗이 UndoManager 보다 먼저 들어가 되돌리기가 그
트랜잭션을 못 본다. origin 은 지금 하는 일이 없다.

그래도 두는 이유는 서버가 붙으면 이미 살아 있는 되돌리기 옆에 받아 온 문서를
얹게 되고, 그때는 origin 말고 "사람이 한 게 아니다" 를 말할 방법이 없기
때문이다. 그 자리를 검사로 미리 묶었다 — trackedOrigins 에 KEEL_SEED 를 더해
검사가 지는 것을 확인했다.

captureTimeout 은 건드리지 않는다. 기본값이 짧은 사이의 수정을 한 걸음으로
묶어 주는데 글자를 칠 때는 그게 맞다 — 0 으로 두면 Cmd+Z 가 한 자씩 지워
편집기로 쓸 수 없게 된다. 넣어 보고 검사가 지는 것을 확인했다. 걸음의 경계는
시간이 아니라 stopCapturing() 으로 긋는다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 4: commands — 캔버스 조작이 텍스트의 그 줄만 고친다

**Files:**
- Create: `apps/web/src/document/commands.ts`
- Create: `apps/web/test/commands.test.ts`

**Interfaces:**
- Consumes: Task 2 의 `applyTextEdits`, Task 3 의 `KEEL_LOCAL`·`KeelDocument`·`createKeelDocument`
- Produces:
  - `renameNode(document: KeelDocument, id: string, label: string | undefined): void`
  - `setNodeKind(document: KeelDocument, id: string, kind: NodeKind): void`
  - `removeNode(document: KeelDocument, id: string): void`
  - `moveNode(document: KeelDocument, id: string, at: Point): void`

- [ ] **Step 1: 실패하는 검사를 쓴다**

`apps/web/test/commands.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { moveNode, removeNode, renameNode, setNodeKind } from '../src/document/commands.js';
import { createKeelDocument } from '../src/document/keel-document.js';

const SOURCE = [
  '# 주문이 들어와서 결제까지',
  '',
  'service web "스토어프론트"',
  'service api',
  'db orders "주문 DB"',
  '',
  'web -> api  # 여기 주석',
  'api -> orders',
].join('\n');

describe('이름 고치기', () => {
  it('그 자리만 바꾼다', () => {
    const document = createKeelDocument(SOURCE);
    renameNode(document, 'api', '주문 API');

    expect(document.source.toString()).toContain('service api "주문 API"');
    document.destroy();
  });

  /** edits.ts 가 있는 이유 전부 */
  it('주석과 줄 순서가 그대로다', () => {
    const document = createKeelDocument(SOURCE);
    renameNode(document, 'api', '주문 API');

    const after = document.source.toString();
    expect(after).toContain('# 주문이 들어와서 결제까지');
    expect(after).toContain('web -> api  # 여기 주석');
    expect(after.split('\n')).toHaveLength(SOURCE.split('\n').length);
    document.destroy();
  });

  it('없는 노드는 아무 일도 안 한다', () => {
    const document = createKeelDocument(SOURCE);
    renameNode(document, '없는놈', '이름');
    expect(document.source.toString()).toBe(SOURCE);
    document.destroy();
  });

  /**
   * 빈 트랜잭션은 되돌리기 역사에 빈 칸을 남긴다.
   *
   * **같은 이름으로 고치는 경우가 핵심이다.** `planSetNodeLabel` 은 그때 빈
   * 배열이 아니라 같은 글자를 다시 쓰는 수정을 돌려주므로, 명령 쪽에서 걸러야 한다.
   */
  it('바뀔 것이 없으면 트랜잭션을 안 연다', () => {
    const document = createKeelDocument(SOURCE);

    let updates = 0;
    document.doc.on('update', () => {
      updates += 1;
    });

    renameNode(document, '없는놈', '이름');
    renameNode(document, 'orders', '주문 DB'); // 이미 같은 이름
    expect(updates).toBe(0);
    document.destroy();
  });
});

describe('종류 고치기', () => {
  it('종류 낱말만 바꾼다', () => {
    const document = createKeelDocument(SOURCE);
    setNodeKind(document, 'api', 'queue');

    expect(document.source.toString()).toContain('queue api');
    expect(document.source.toString()).toContain('service web "스토어프론트"');
    document.destroy();
  });

  it('같은 종류면 아무 일도 안 한다', () => {
    const document = createKeelDocument(SOURCE);
    setNodeKind(document, 'api', 'service');
    expect(document.source.toString()).toBe(SOURCE);
    document.destroy();
  });
});

describe('지우기', () => {
  it('노드 줄과 거기 걸린 엣지 줄을 함께 지운다', () => {
    const document = createKeelDocument(SOURCE);
    removeNode(document, 'api');

    const after = document.source.toString();
    expect(after).not.toContain('service api');
    expect(after).not.toContain('web -> api');
    expect(after).not.toContain('api -> orders');
    expect(after).toContain('service web "스토어프론트"');
    document.destroy();
  });

  /**
   * 레이아웃 자리를 안 지우면 유령 좌표가 남아, 같은 이름을 다시 만들었을 때
   * 옛 자리로 튄다.
   */
  it('레이아웃 자리도 같은 트랜잭션에서 사라진다', () => {
    const document = createKeelDocument(SOURCE);
    moveNode(document, 'api', { x: 100, y: 200 });
    expect(document.layout.get('api')).toEqual({ x: 100, y: 200 });

    removeNode(document, 'api');
    expect(document.layout.get('api')).toBeUndefined();
    document.destroy();
  });

  /**
   * **중간 단언이 이 검사의 전부다.**
   *
   * `moveNode` 와 `removeNode` 는 각각 제 걸음이라(`beginStep`), `undo()` 한 번은
   * `removeNode` 만 되돌린다. 그래서 "지운 뒤 자리가 없어졌다" 를 안 확인하면,
   * `layout.delete` 를 빼 버려도 이 검사가 **공허하게 통과한다** — 자리가
   * 되돌아온 게 아니라 애초에 건드려지지 않았을 뿐인데 같은 값이 나온다.
   */
  it('되돌리면 텍스트와 자리가 함께 돌아온다', () => {
    const document = createKeelDocument(SOURCE);
    moveNode(document, 'api', { x: 100, y: 200 });

    removeNode(document, 'api');
    expect(document.layout.get('api')).toBeUndefined();

    document.undoManager.undo();

    expect(document.source.toString()).toContain('service api');
    expect(document.layout.get('api')).toEqual({ x: 100, y: 200 });
    document.destroy();
  });
});

describe('되돌리기 걸음', () => {
  /**
   * 명령 하나가 한 걸음이어야 한다. 경계를 안 그으면 Yjs 가 짧은 사이의 수정을
   * 묶어, 이름을 고치고 곧바로 노드를 끌었을 때 Cmd+Z 한 번에 둘 다 되돌아간다.
   */
  it('잇달아 한 명령 둘이 따로 되돌아간다', () => {
    const document = createKeelDocument(SOURCE);

    renameNode(document, 'api', '주문 API');
    moveNode(document, 'api', { x: 10, y: 20 });

    document.undoManager.undo();
    expect(document.layout.get('api')).toBeUndefined();
    expect(document.source.toString()).toContain('service api "주문 API"');

    document.undoManager.undo();
    expect(document.source.toString()).toBe(SOURCE);
    document.destroy();
  });
});

describe('옮기기', () => {
  it('좌표만 쓰고 텍스트는 안 건드린다', () => {
    const document = createKeelDocument(SOURCE);
    moveNode(document, 'api', { x: 12.5, y: -30 });

    expect(document.layout.get('api')).toEqual({ x: 12.5, y: -30 });
    expect(document.source.toString()).toBe(SOURCE);
    document.destroy();
  });

  /** 반올림도 격자 맞춤도 여기서 하지 않는다 — 렌더러의 중심 좌표 계약 */
  it('받은 값을 그대로 적는다', () => {
    const document = createKeelDocument(SOURCE);
    moveNode(document, 'api', { x: 123.456, y: -78.9 });
    expect(document.layout.get('api')).toEqual({ x: 123.456, y: -78.9 });
    document.destroy();
  });
});
```

- [ ] **Step 2: 검사를 돌려 지는 것을 본다**

Run: `cd apps/web && npx vitest run test/commands.test.ts`
Expected: FAIL — 모듈을 찾을 수 없다

- [ ] **Step 3: 구현을 쓴다**

`apps/web/src/document/commands.ts`:

```ts
import { parse, planRemoveNode, planSetNodeKind, planSetNodeLabel } from '@keel/dsl';
import type { NodeKind, ParsedDocument, TextEdit } from '@keel/dsl';
import type { Point } from '@keel/renderer';
import { KEEL_LOCAL } from './keel-document.js';
import type { KeelDocument } from './keel-document.js';
import { applyTextEdits } from './text-edits.js';

/**
 * 캔버스에서 일어난 일을 문서에 얹는다.
 *
 * 모든 명령이 같은 꼴이다 — 지금 소스를 파싱하고, `plan*` 이 돌려준 구간 수정을
 * **한 트랜잭션**에 얹는다. 한 트랜잭션이어야 되돌리기가 그것을 한 걸음으로
 * 본다.
 *
 * 바뀔 것이 없으면 트랜잭션을 아예 안 연다. 빈 트랜잭션은 되돌리기 역사에 빈
 * 칸을 남겨, Cmd+Z 를 눌렀는데 아무 일도 안 일어나게 만든다.
 */

/**
 * 바뀌는 것이 없는 수정은 버린다.
 *
 * `planSetNodeLabel` 은 **같은 라벨로 고쳐도 빈 배열을 안 준다** — 같은 글자를
 * 다시 쓰는 수정을 준다(`planSetNodeKind` 는 `[]` 를 준다). 그대로 얹으면
 * 되돌리기 역사에 빈 칸이 생기고, 남의 화면에는 아무것도 안 바뀐 갱신이 날아간다.
 */
function meaningful(source: string, edits: readonly TextEdit[]): TextEdit[] {
  return edits.filter((edit) => source.slice(edit.from, edit.to) !== edit.insert);
}

/**
 * 명령 하나는 **되돌리기 한 걸음**이다.
 *
 * Yjs 는 짧은 사이에 일어난 수정을 한 걸음으로 묶는다(기본 500ms). 글자를 칠
 * 때는 그게 맞지만, 캔버스 조작은 한 번이 한 행동이다 — 이름을 고치고 곧바로
 * 노드를 끌면 `Cmd+Z` 한 번에 둘 다 되돌아가 버린다. 그래서 명령을 얹기 전에
 * 경계를 긋는다.
 */
function beginStep(document: KeelDocument): void {
  document.undoManager.stopCapturing();
}

function editText(document: KeelDocument, plan: (doc: ParsedDocument) => TextEdit[]): void {
  const source = document.source.toString();
  const edits = meaningful(source, plan(parse(source)));
  if (edits.length === 0) return;

  beginStep(document);
  document.doc.transact(() => applyTextEdits(document.source, edits), KEEL_LOCAL);
}

export function renameNode(
  document: KeelDocument,
  id: string,
  label: string | undefined,
): void {
  editText(document, (doc) => planSetNodeLabel(doc, id, label));
}

export function setNodeKind(document: KeelDocument, id: string, kind: NodeKind): void {
  editText(document, (doc) => planSetNodeKind(doc, id, kind));
}

/**
 * 노드를 지운다.
 *
 * `planRemoveNode` 가 노드 줄과 **거기 걸린 엣지 줄까지** 지운다. 엣지를
 * 남기면 파서가 그 이름을 암시 노드로 되살려, 지운 노드가 화면에 그대로 남는다.
 *
 * 레이아웃 자리도 **같은 트랜잭션에서** 지운다. 안 지우면 유령 좌표가 남아,
 * 같은 이름을 다시 만들었을 때 옛 자리로 튄다. 같은 트랜잭션이라야 되돌리기
 * 한 번에 글과 자리가 함께 돌아온다.
 */
export function removeNode(document: KeelDocument, id: string): void {
  const source = document.source.toString();
  const edits = meaningful(source, planRemoveNode(parse(source), id));
  const hadPlace = document.layout.has(id);
  if (edits.length === 0 && !hadPlace) return;

  beginStep(document);
  document.doc.transact(() => {
    applyTextEdits(document.source, edits);
    document.layout.delete(id);
  }, KEEL_LOCAL);
}

/**
 * 노드를 옮긴다. **텍스트는 안 건드린다** — 좌표는 문서가 아니다.
 *
 * 받은 값을 그대로 적는다. 반올림이나 격자 맞춤은 끄는 쪽의 일이고, 여기서
 * 손대면 렌더러의 "중심이 레이아웃에 적힌 값과 정확히 같다" 계약이 깨진다.
 */
export function moveNode(document: KeelDocument, id: string, at: Point): void {
  beginStep(document);
  document.doc.transact(() => document.layout.set(id, at), KEEL_LOCAL);
}
```

- [ ] **Step 4: 검사를 돌려 통과하는 것을 본다**

Run: `cd apps/web && npx vitest run test/commands.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 5: 검사가 실제로 무는지 확인한다**

1. `removeNode` 에서 `document.layout.delete(id)` 줄을 지운다 → 레이아웃 검사 **둘 다** 져야 한다

   둘 다 지는지 꼭 세어 본다. `되돌리면 텍스트와 자리가 함께 돌아온다` 는
   중간 단언이 없으면 그 변형에서도 공허하게 통과한다 — 검사가 하나뿐인 셈이 된다.
2. `editText` 의 `meaningful(...)` 을 걷어 내고 `plan(...)` 을 그대로 쓴다 → `바뀔 것이 없으면 트랜잭션을 안 연다` 가 져야 한다 (같은 이름으로 고치는 줄에서 진다)
3. `beginStep` 호출 셋을 지운다 → `잇달아 한 명령 둘이 따로 되돌아간다` 가 져야 한다

Expected: 각각 FAIL. 확인 후 되돌린다.

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/document/commands.ts apps/web/test/commands.test.ts
git commit -F - <<'EOF'
web: 캔버스 조작이 텍스트의 그 줄만 고친다

모든 명령이 같은 꼴이다 — 지금 소스를 파싱하고, plan* 이 돌려준 구간 수정을
한 트랜잭션에 얹는다. 한 트랜잭션이어야 되돌리기가 한 걸음으로 본다.

지울 때는 레이아웃 자리도 같은 트랜잭션에서 지운다. 안 지우면 유령 좌표가
남아 같은 이름을 다시 만들었을 때 옛 자리로 튄다. 그 줄을 지워 검사가 지는
것을 확인했다.

바뀔 것이 없으면 트랜잭션을 아예 안 연다. 빈 트랜잭션은 되돌리기 역사에 빈
칸을 남겨, Cmd+Z 를 눌렀는데 아무 일도 안 일어나게 만든다.

명령 하나는 되돌리기 한 걸음이다. Yjs 는 짧은 사이의 수정을 한 걸음으로
묶는데 글자를 칠 때는 그게 맞지만 캔버스 조작은 한 번이 한 행동이라, 얹기 전에
stopCapturing() 으로 경계를 긋는다. 안 그으면 이름을 고치고 곧바로 노드를 끌
때 Cmd+Z 한 번에 둘 다 되돌아간다. 호출을 지워 검사가 지는 것을 확인했다.

옮기기는 받은 값을 그대로 적는다. 반올림은 끄는 쪽의 일이고, 여기서 손대면
렌더러의 "중심이 레이아웃에 적힌 값과 정확히 같다" 계약이 깨진다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 5: layout-reader — Y.Map 을 복사 없이 읽고, 끌기를 덧씌운다

**Files:**
- Create: `apps/web/src/document/layout-reader.ts`
- Create: `apps/web/test/layout-reader.test.ts`

**Interfaces:**
- Consumes: `@keel/renderer` 의 `LayoutReader`·`Point`
- Produces:
  - `interface Drag { readonly id: string; readonly at: Point }`
  - `yMapReader(layout: Y.Map<Point>): LayoutReader`
  - `withDrag(reader: LayoutReader, drag: Drag | undefined): LayoutReader`

- [ ] **Step 1: 실패하는 검사를 쓴다**

`apps/web/test/layout-reader.test.ts`:

```ts
import { buildGraph } from '@keel/graph';
import { parse } from '@keel/dsl';
import { buildScene } from '@keel/renderer';
import type { Point } from '@keel/renderer';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { withDrag, yMapReader } from '../src/document/layout-reader.js';

function layoutOf(entries: Record<string, Point>): Y.Map<Point> {
  const doc = new Y.Doc();
  const map = doc.getMap<Point>('layout');
  for (const [id, at] of Object.entries(entries)) map.set(id, at);
  return map;
}

describe('Y.Map 읽기', () => {
  it('적힌 자리를 그대로 돌려준다', () => {
    const reader = yMapReader(layoutOf({ a: { x: 1, y: 2 } }));
    expect(reader.get('a')).toEqual({ x: 1, y: 2 });
  });

  it('없는 것은 undefined 다', () => {
    const reader = yMapReader(layoutOf({}));
    expect(reader.get('없는놈')).toBeUndefined();
  });

  /** 복사하지 않으므로 나중에 들어온 자리도 그대로 보인다 */
  it('나중에 들어온 자리도 보인다', () => {
    const map = layoutOf({});
    const reader = yMapReader(map);
    expect(reader.get('a')).toBeUndefined();

    map.set('a', { x: 5, y: 5 });
    expect(reader.get('a')).toEqual({ x: 5, y: 5 });
  });
});

describe('끌기 덧씌우기', () => {
  it('끌고 있는 노드만 다른 자리를 준다', () => {
    const base = yMapReader(layoutOf({ a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }));
    const reader = withDrag(base, { id: 'a', at: { x: 500, y: 500 } });

    expect(reader.get('a')).toEqual({ x: 500, y: 500 });
    expect(reader.get('b')).toEqual({ x: 100, y: 0 });
  });

  it('끌고 있지 않으면 원래 것을 그대로 돌려준다', () => {
    const base = yMapReader(layoutOf({ a: { x: 0, y: 0 } }));
    expect(withDrag(base, undefined)).toBe(base);
  });

  it('레이아웃에 없던 노드도 끌면 자리가 생긴다', () => {
    const base = yMapReader(layoutOf({}));
    const reader = withDrag(base, { id: 'a', at: { x: 7, y: 8 } });
    expect(reader.get('a')).toEqual({ x: 7, y: 8 });
  });

  /**
   * 덧씌우기로 끌기를 푸는 값이 여기서 나온다 — 그룹 테두리는 자손에서
   * 유도되므로, 노드를 그룹 밖으로 끌면 테두리가 **따라 줄어든다.**
   * 덧그리는 유령 없이 공짜로 얻는다.
   */
  it('노드를 그룹 밖으로 끌면 그룹 테두리가 따라 줄어든다', () => {
    const graph = buildGraph(parse('group g "묶음" {\n  service a\n  service b\n}'));
    const base = yMapReader(layoutOf({ a: { x: 0, y: 0 }, b: { x: 200, y: 0 } }));

    const before = buildScene(graph, base).groupById.get('g');
    const after = buildScene(graph, withDrag(base, { id: 'b', at: { x: 40, y: 0 } })).groupById.get('g');

    expect(before && after).toBeTruthy();
    if (!before || !after) return;
    expect(after.rect.width).toBeLessThan(before.rect.width);
  });
});
```

- [ ] **Step 2: 검사를 돌려 지는 것을 본다**

Run: `cd apps/web && npx vitest run test/layout-reader.test.ts`
Expected: FAIL — 모듈을 찾을 수 없다

- [ ] **Step 3: 구현을 쓴다**

`apps/web/src/document/layout-reader.ts`:

```ts
import type { LayoutReader, Point } from '@keel/renderer';
import type * as Y from 'yjs';

/**
 * 레이아웃을 렌더러에 넘기는 통로.
 *
 * `@keel/renderer` 가 레이아웃을 `Map` 이 아니라 **읽기 하나짜리 인터페이스**로
 * 받는 값이 여기서 나온다. 원격 갱신이 올 때마다 1,000개를 복사하지 않아도
 * 되고, 끌고 있는 노드 하나만 다른 자리를 돌려주면 장면이 통째로 맞아떨어진다.
 */

export interface Drag {
  readonly id: string;
  readonly at: Point;
}

/** `Y.Map` 을 그대로 들여다본다. 복사하지 않으므로 나중에 들어온 자리도 보인다 */
export function yMapReader(layout: Y.Map<Point>): LayoutReader {
  return { get: (id) => layout.get(id) };
}

/**
 * 끌고 있는 노드에만 다른 자리를 씌운다.
 *
 * 덧그리는 유령 없이 장면이 맞아떨어지고, 그룹 테두리가 자손에서 유도되므로
 * **노드를 그룹 밖으로 끌면 테두리가 실시간으로 따라 줄어든다.**
 *
 * 끌고 있지 않으면 받은 것을 그대로 돌려준다 — 껍데기를 하나 더 만들지 않는다.
 */
export function withDrag(reader: LayoutReader, drag: Drag | undefined): LayoutReader {
  if (drag === undefined) return reader;
  return { get: (id) => (id === drag.id ? drag.at : reader.get(id)) };
}
```

- [ ] **Step 4: 검사를 돌려 통과하는 것을 본다**

Run: `cd apps/web && npx vitest run test/layout-reader.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: 검사가 실제로 무는지 확인한다**

`withDrag` 의 `if (drag === undefined) return reader;` 를 지우고 늘 새 껍데기를 만들게 한다 → `끌고 있지 않으면 원래 것을 그대로 돌려준다` 가 져야 한다.

Expected: FAIL. 확인 후 되돌린다.

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/document/layout-reader.ts apps/web/test/layout-reader.test.ts
git commit -F - <<'EOF'
web: Y.Map 을 복사 없이 읽고 끌기를 덧씌운다

@keel/renderer 가 레이아웃을 Map 이 아니라 읽기 하나짜리 인터페이스로 받는
값이 여기서 나온다. 원격 갱신마다 1,000개를 복사하지 않아도 되고, 끌고 있는
노드 하나만 다른 자리를 돌려주면 장면이 통째로 맞아떨어진다.

덧그리는 유령이 없고, 그룹 테두리가 자손에서 유도되므로 노드를 그룹 밖으로
끌면 테두리가 실시간으로 따라 줄어든다. 그것을 검사로 묶었다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 6: 두 문서를 서로 붙여 본다 — README 의 핵심 주장

**Files:**
- Create: `apps/web/test/concurrent.test.ts`
- Modify: `apps/web/src/document/text-edits.ts` (머리 주석의 틀린 이유만)
- Modify: `packages/dsl/src/edits.ts` (머리 주석의 틀린 이유만)

**Interfaces:**
- Consumes: Task 3 의 `createKeelDocument`, Task 4 의 `renameNode`·`moveNode`·`removeNode`

이 태스크는 **검사만** 더한다. 새 코드는 없다. 서버가 없어도 `Y.Doc` 둘을 손으로
붙이면 서버가 하는 일이 그대로 재현되므로, 이 저장소가 구간 수정을 고집하는
이유를 지금 증명할 수 있다.

**다만 그 이유는 처음에 적어 둔 것과 다르다.** 재 보니 Yjs 에서 통째로 다시 써도
상대의 삽입이 *소멸하지는* 않는다 — Yjs 는 자리가 아니라 항목 단위로 지우므로,
내가 못 본 상대의 삽입은 내 지우기에 안 걸린다. 실제로 일어나는 일은 더 나쁘다:
**양쪽이 각자 쓴 전문이 나란히 살아남아 문서가 둘로 불어난다.** 이음매에서 줄이
뭉개지고(`web -> apiservice web "스토어프론트"`), 같은 이름의 노드가 두 벌씩
생기고, 파서가 진단을 쏟는다.

그래서 검사도 "글자가 남아 있나" 가 아니라 **"문서가 여전히 문서인가"** 를 본다 —
합쳐진 결과를 다시 파싱해 진단이 0 이고 노드 이름이 안 겹치는지 확인한다.
글자만 세면 통째로 쓰기에서도 통과해 버려서 아무것도 못 묶는다.

- [ ] **Step 1: 검사를 쓴다**

`apps/web/test/concurrent.test.ts`:

```ts
import { parse } from '@keel/dsl';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { moveNode, removeNode, renameNode } from '../src/document/commands.js';
import { createKeelDocument } from '../src/document/keel-document.js';
import type { KeelDocument } from '../src/document/keel-document.js';

const SOURCE = ['service web "스토어프론트"', 'service api', 'db orders', 'web -> api'].join('\n');

/** 두 문서를 서로 끝까지 맞춘다. 서버가 하는 일을 손으로 한 것이다 */
function sync(a: KeelDocument, b: KeelDocument): void {
  Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc, Y.encodeStateVector(b.doc)));
  Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc, Y.encodeStateVector(a.doc)));
}

/** 같은 문서를 보는 두 사람을 만든다 */
function pair(source: string): [KeelDocument, KeelDocument] {
  const a = createKeelDocument(source);
  const b = createKeelDocument('');
  Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
  return [a, b];
}

describe('같은 문서를 둘이 고친다', () => {
  /**
   * 이 저장소의 핵심 주장이다.
   *
   * **글자가 남아 있는지만 보면 안 된다.** 통째로 다시 써도 양쪽 글자는 남는다 —
   * 양쪽 전문이 나란히 살아남기 때문이다. 그래서 합쳐진 결과를 **다시 파싱해**
   * 문서가 여전히 문서인지 본다. 통째로 쓰면 이음매에서 줄이 뭉개지고 노드가
   * 두 벌씩 생겨 여기서 진단이 쏟아진다.
   */
  it('서로 다른 노드의 이름을 동시에 고치면 문서가 온전하다', () => {
    const [a, b] = pair(SOURCE);

    renameNode(a, 'api', '주문 API');
    renameNode(b, 'orders', '주문 DB');
    sync(a, b);

    for (const document of [a, b]) {
      const merged = document.source.toString();
      expect(merged).toContain('service api "주문 API"');
      expect(merged).toContain('db orders "주문 DB"');

      // 문서가 불어나지도, 뭉개지지도 않았다
      const parsed = parse(merged);
      expect(parsed.diagnostics).toHaveLength(0);
      expect(merged.split('\n')).toHaveLength(SOURCE.split('\n').length);

      const ids = parsed.nodes.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
    }

    a.destroy();
    b.destroy();
  });

  it('한쪽이 캔버스에서 고치고 다른 쪽이 글자를 쳐도 둘 다 산다', () => {
    const [a, b] = pair(SOURCE);

    renameNode(a, 'api', '주문 API');
    // 다른 사람이 문서 끝에 새 줄을 친다
    b.doc.transact(() => b.source.insert(b.source.length, '\nqueue events'));
    sync(a, b);

    for (const document of [a, b]) {
      const merged = document.source.toString();
      expect(merged).toContain('service api "주문 API"');
      expect(merged).toContain('queue events');
      expect(parse(merged).diagnostics).toHaveLength(0);
    }

    a.destroy();
    b.destroy();
  });

  it('둘이 같은 문서를 고쳐도 끝내 글자가 똑같다', () => {
    const [a, b] = pair(SOURCE);

    renameNode(a, 'api', '가');
    renameNode(b, 'orders', '나');
    moveNode(a, 'api', { x: 10, y: 10 });
    moveNode(b, 'orders', { x: 20, y: 20 });
    sync(a, b);

    expect(a.source.toString()).toBe(b.source.toString());
    expect([...a.layout.entries()].sort()).toEqual([...b.layout.entries()].sort());

    a.destroy();
    b.destroy();
  });

  it('둘이 같은 노드를 각자 옮기면 한쪽으로 정해지되 둘이 같아진다', () => {
    const [a, b] = pair(SOURCE);

    moveNode(a, 'api', { x: 1, y: 1 });
    moveNode(b, 'api', { x: 2, y: 2 });
    sync(a, b);

    expect(a.layout.get('api')).toEqual(b.layout.get('api'));

    a.destroy();
    b.destroy();
  });

  it('한쪽이 지운 노드를 다른 쪽이 옮기고 있어도 문서가 안 깨진다', () => {
    const [a, b] = pair(SOURCE);

    removeNode(a, 'api');
    moveNode(b, 'api', { x: 9, y: 9 });
    sync(a, b);

    expect(a.source.toString()).toBe(b.source.toString());
    expect(a.source.toString()).not.toContain('service api');

    a.destroy();
    b.destroy();
  });
});
```

- [ ] **Step 2: 검사를 돌려 통과하는 것을 본다**

Run: `cd apps/web && npx vitest run test/concurrent.test.ts`
Expected: PASS (5 tests)

이 검사는 이미 지나간 태스크들의 설계가 옳았음을 보이는 것이므로 처음부터
통과하는 것이 정상이다.

- [ ] **Step 3: 구간 수정이 실제로 값을 하는지 확인한다**

`src/document/commands.ts` 의 `editText` 를 **통째로 다시 쓰기**로 바꿔 본다:

```ts
function editText(document: KeelDocument, plan: (doc: ParsedDocument) => TextEdit[]): void {
  const before = document.source.toString();
  const edits = plan(parse(before));
  if (edits.length === 0) return;
  const after = applyEdits(before, edits); // @keel/dsl 에서 가져온다
  document.doc.transact(() => {
    document.source.delete(0, document.source.length);
    document.source.insert(0, after);
  }, KEEL_LOCAL);
}
```

Run: `cd apps/web && npx vitest run test/concurrent.test.ts`
Expected: FAIL — `서로 다른 노드의 이름을 동시에 고치면 문서가 온전하다` 가 진다.
합쳐진 문서가 **둘로 불어나** 진단이 쏟아지고, 줄 수가 늘고, 같은 이름의 노드가
두 벌 생긴다. 실제로 이런 모양이 된다:

```
service web "스토어프론트"
service api
db orders "주문 DB"
web -> apiservice web "스토어프론트"      <- 이음매에서 줄이 뭉개졌다
service api "주문 API"
db orders
web -> api
```

**확인 후 되돌린다.** `commands.ts` 가 손대기 전과 한 글자도 다르지 않은지
확인한다.

이것이 `edits.ts` 가 있는 이유를 눈으로 보는 자리다. 그리고 **글자만 세는 검사로는
이것을 못 잡는다** — 양쪽 글자가 다 남아 있기 때문이다. 다시 파싱해 보는 단언이
있어야 문서가 망가진 것이 드러난다.

- [ ] **Step 3.5: 같은 거짓 이유가 적힌 주석 둘을 고친다**

방금 잰 것이 두 파일의 머리 주석을 거짓으로 만든다. 이 저장소의 주석은 진짜
이유를 적으므로 함께 고친다. **글자만 고친다 - 코드는 건드리지 않는다.**

고칠 곳은 `apps/web/src/document/text-edits.ts` 와 `packages/dsl/src/edits.ts` 의
머리 주석에서 "같은 순간 다른 사람이 친 글자가 지워진다 / 병합이 아니라 소멸이
된다" 고 말하는 대목이다.

실제로 일어나는 일로 바꾼다 - 소멸이 아니라 **문서가 둘로 불어난다.** Yjs 는
자리가 아니라 항목 단위로 지우므로 내가 못 본 상대의 삽입은 내 지우기에 안
걸린다. 그래서 양쪽 전문이 나란히 남아 이음매에서 줄이 뭉개지고 같은 이름의
노드가 두 벌 생긴다. 잰 숫자(구간 수정 4줄·진단 0 / 통째로 쓰기 7줄·진단 4)를
근거로 적어 둔다.

`packages/dsl` 은 이 앱 밖이지만 주석 한 대목이라 같이 고치는 것이 맞다 -
틀린 설명을 남겨 두면 다음 사람이 그것을 믿는다.

- [ ] **Step 4: 커밋**

```bash
git add apps/web/test/concurrent.test.ts apps/web/src/document/text-edits.ts packages/dsl/src/edits.ts
git commit -F - <<'EOF'
web: 같은 문서를 둘이 고쳐도 문서가 온전한 것을 검사한다

서버가 없어도 Y.Doc 둘을 손으로 붙이면 서버가 하는 일이 그대로 재현된다.
이 저장소가 구간 수정을 고집하는 이유를 지금 증명한다.

다만 그 이유는 지금까지 적어 둔 것과 다르다. 재 보니 Yjs 에서는 통째로 다시
써도 상대의 삽입이 소멸하지 않는다 - Yjs 는 자리가 아니라 항목 단위로 지우므로
내가 못 본 상대의 삽입은 내 지우기에 안 걸린다.

실제로 일어나는 일은 더 나쁘다. 양쪽이 각자 쓴 전문이 나란히 살아남아 문서가
둘로 불어난다. 이음매에서 줄이 뭉개지고, 같은 이름의 노드가 두 벌씩 생기고,
파서가 진단을 쏟는다. 구간 수정일 때는 4줄 진단 0, 통째로 쓰기는 7줄 진단 4 였다.

그래서 검사가 글자를 세지 않고 합쳐진 문서를 다시 파싱한다. 글자만 세면 통째로
쓰기에서도 통과해 아무것도 못 묶는다 - 양쪽 글자가 다 남아 있기 때문이다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 7: derive — 소스에서 장면까지, 두 단으로 나눠서

**Files:**
- Create: `apps/web/src/document/derive.ts`
- Create: `apps/web/test/derive.test.ts`

**Interfaces:**
- Consumes: `@keel/dsl` 의 `parse`, `@keel/graph` 의 `buildGraph`, `@keel/renderer` 의 `buildScene`·`memoizeMeasure`·`approximateMeasureText`
- Produces:
  - `interface Parsed { readonly document: ParsedDocument; readonly graph: Graph }`
  - `parseSource(source: string): Parsed`
  - `sceneOf(graph: Graph, layout: LayoutReader, measure: MeasureText, theme?: Theme): Scene`
  - `createMeasure(ctx: MeasuringContext | undefined): MeasureText`

- [ ] **Step 1: 실패하는 검사를 쓴다**

`apps/web/test/derive.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createMeasure, parseSource, sceneOf } from '../src/document/derive.js';

describe('소스 읽기', () => {
  it('문서와 그래프를 함께 돌려준다', () => {
    const { document, graph } = parseSource('service a\nservice b\na -> b');
    expect(document.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
  });

  it('깨진 줄은 진단으로 남고 파서는 던지지 않는다', () => {
    const { document } = parseSource('service\n-> ->\nservice a');
    expect(document.diagnostics.length).toBeGreaterThan(0);
    expect(document.nodes.some((n) => n.id === 'a')).toBe(true);
  });
});

describe('장면 세우기', () => {
  it('그래프와 레이아웃으로 장면을 만든다', () => {
    const { graph } = parseSource('service a\nservice b');
    const scene = sceneOf(graph, new Map([['a', { x: 10, y: 20 }]]), createMeasure(undefined));

    expect(scene.nodes).toHaveLength(2);
    expect(scene.nodeById.get('a')?.center).toEqual({ x: 10, y: 20 });
    expect(scene.nodeById.get('a')?.pinned).toBe(true);
    expect(scene.nodeById.get('b')?.pinned).toBe(false);
  });

  /**
   * 끌기 중에는 그래프가 안 바뀌고 자리만 바뀐다. 두 단으로 나눠 두면
   * 프레임마다 파싱을 다시 하지 않는다.
   */
  it('자리만 바뀔 때 다시 파싱하지 않는다', () => {
    const { graph } = parseSource('service a');
    const measure = createMeasure(undefined);

    const first = sceneOf(graph, new Map([['a', { x: 0, y: 0 }]]), measure);
    const second = sceneOf(graph, new Map([['a', { x: 50, y: 0 }]]), measure);

    expect(first.nodeById.get('a')?.center).toEqual({ x: 0, y: 0 });
    expect(second.nodeById.get('a')?.center).toEqual({ x: 50, y: 0 });
  });
});

describe('글자 재기', () => {
  it('캔버스가 없으면 어림으로 잰다', () => {
    const measure = createMeasure(undefined);
    expect(measure('가나다', { fontSize: 14, fontFamily: 'x', fontWeight: 'normal' })).toBeGreaterThan(0);
  });

  /** 프레임마다 measureText 를 다시 부르는 것이 캔버스에서 가장 흔한 느려짐이다 */
  it('캔버스가 있으면 재되 같은 글자를 두 번 재지 않는다', () => {
    const measureText = vi.fn((text: string) => ({ width: text.length * 7 }));
    const ctx = { font: '', measureText };

    const measure = createMeasure(ctx);
    const style = { fontSize: 14, fontFamily: 'x', fontWeight: 'normal' as const };

    expect(measure('abc', style)).toBe(21);
    measure('abc', style);
    measure('abc', style);

    expect(measureText).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 검사를 돌려 지는 것을 본다**

Run: `cd apps/web && npx vitest run test/derive.test.ts`
Expected: FAIL — 모듈을 찾을 수 없다

- [ ] **Step 3: 구현을 쓴다**

`apps/web/src/document/derive.ts`:

```ts
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
```

- [ ] **Step 4: 검사를 돌려 통과하는 것을 본다**

Run: `cd apps/web && npx vitest run test/derive.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: 검사가 실제로 무는지 확인한다**

`createMeasure` 에서 `memoizeMeasure(...)` 감싸기를 뺀다 → `같은 글자를 두 번 재지 않는다` 가 져야 한다.

Expected: FAIL. 확인 후 되돌린다.

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/document/derive.ts apps/web/test/derive.test.ts
git commit -F - <<'EOF'
web: 소스에서 장면까지를 두 단으로 나눈다

끌기 중에는 그래프가 안 바뀌고 자리만 바뀐다. 한 단으로 묶으면 프레임마다
파싱과 그래프 세우기를 다시 하게 되므로, parseSource 와 sceneOf 로 나눈다.

글자 재기는 반드시 기억해 두고 쓴다 — 프레임마다 measureText 를 다시 부르는
것이 캔버스에서 가장 흔한 느려짐이다. memoize 를 빼고 검사가 지는 것을
확인했다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 8: gesture — 포인터 제스처 순수 상태 기계

**Files:**
- Create: `apps/web/src/interaction/gesture.ts`
- Create: `apps/web/test/gesture.test.ts`

**Interfaces:**
- Consumes: `@keel/renderer` 의 `Hit`·`Point`·`Viewport`·`panBy`
- Produces:
  - `DRAG_THRESHOLD: 4`
  - `interface PointerLike { readonly screen: Point; readonly world: Point }`
  - `type Gesture` — `idle` · `pressed` · `dragging` · `panning`
  - `type Intent` — `none` · `select` · `drag-move` · `pan` · `commit-drag`
  - `IDLE: Gesture`
  - `onPointerDown(gesture: Gesture, e: PointerLike, hit: Hit | undefined, viewport: Viewport): Gesture`
  - `onPointerMove(gesture: Gesture, e: PointerLike): { gesture: Gesture; intent: Intent }`
  - `onPointerUp(gesture: Gesture, e: PointerLike): { gesture: Gesture; intent: Intent }`

- [ ] **Step 1: 실패하는 검사를 쓴다**

`apps/web/test/gesture.test.ts`:

```ts
import { DEFAULT_VIEWPORT, buildScene } from '@keel/renderer';
import type { Hit, PlacedNode } from '@keel/renderer';
import { buildGraph } from '@keel/graph';
import { parse } from '@keel/dsl';
import { describe, expect, it } from 'vitest';
import {
  DRAG_THRESHOLD,
  IDLE,
  onPointerDown,
  onPointerMove,
  onPointerUp,
} from '../src/interaction/gesture.js';
import type { Gesture } from '../src/interaction/gesture.js';

function nodeHit(): { hit: Hit; node: PlacedNode } {
  const graph = buildGraph(parse('service a'));
  const scene = buildScene(graph, new Map([['a', { x: 0, y: 0 }]]));
  const node = scene.nodes[0];
  if (node === undefined) throw new Error('노드가 없다');
  return { hit: { kind: 'node', node }, node };
}

const at = (x: number, y: number) => ({ screen: { x, y }, world: { x, y } });

describe('누르기', () => {
  it('누르면 아직 아무 뜻도 아니다', () => {
    const g = onPointerDown(IDLE, at(0, 0), undefined, DEFAULT_VIEWPORT);
    expect(g.kind).toBe('pressed');
  });
});

describe('문턱', () => {
  /**
   * 문턱이 없으면 "고르려고 눌렀는데 1px 밀려서 노드가 움직이는" 일이 난다.
   * 손이 떨리는 사람에게는 노드를 고를 방법이 아예 없어진다.
   */
  it('문턱을 안 넘고 떼면 끌기가 아니라 고르기다', () => {
    const { hit, node } = nodeHit();

    let g: Gesture = onPointerDown(IDLE, at(0, 0), hit, DEFAULT_VIEWPORT);
    const moved = onPointerMove(g, at(DRAG_THRESHOLD - 1, 0));
    expect(moved.intent.kind).toBe('none');
    expect(moved.gesture.kind).toBe('pressed');

    const up = onPointerUp(moved.gesture, at(DRAG_THRESHOLD - 1, 0));
    expect(up.intent).toEqual({ kind: 'select', hit: { kind: 'node', node } });
    expect(up.gesture).toEqual(IDLE);
  });

  it('문턱을 넘으면 끌기로 바뀐다', () => {
    const { hit } = nodeHit();

    const g = onPointerDown(IDLE, at(0, 0), hit, DEFAULT_VIEWPORT);
    const moved = onPointerMove(g, at(DRAG_THRESHOLD + 1, 0));

    expect(moved.gesture.kind).toBe('dragging');
    expect(moved.intent.kind).toBe('drag-move');
  });
});

describe('끌기', () => {
  /** 잡은 자리를 기억해야 노드가 커서 밑으로 튀지 않는다 */
  it('잡은 자리를 지킨다 — 노드가 커서로 튀지 않는다', () => {
    const { hit, node } = nodeHit();

    // 노드 중심에서 오른쪽으로 20 떨어진 곳을 잡는다
    const grabAt = { x: node.center.x + 20, y: node.center.y };
    const g = onPointerDown(IDLE, { screen: grabAt, world: grabAt }, hit, DEFAULT_VIEWPORT);

    const to = { x: grabAt.x + 100, y: grabAt.y + 50 };
    const moved = onPointerMove(g, { screen: to, world: to });

    expect(moved.intent).toEqual({
      kind: 'drag-move',
      nodeId: 'a',
      at: { x: node.center.x + 100, y: node.center.y + 50 },
    });
  });

  it('떼면 그 자리를 문서에 적으라고 한다', () => {
    const { hit, node } = nodeHit();

    const g = onPointerDown(IDLE, at(node.center.x, node.center.y), hit, DEFAULT_VIEWPORT);
    const moved = onPointerMove(g, at(node.center.x + 100, node.center.y));
    const up = onPointerUp(moved.gesture, at(node.center.x + 100, node.center.y));

    expect(up.intent).toEqual({
      kind: 'commit-drag',
      nodeId: 'a',
      at: { x: node.center.x + 100, y: node.center.y },
    });
    expect(up.gesture).toEqual(IDLE);
  });
});

describe('팬', () => {
  it('배경을 끌면 화면이 따라온다', () => {
    const g = onPointerDown(IDLE, at(0, 0), undefined, DEFAULT_VIEWPORT);
    const moved = onPointerMove(g, at(50, 30));

    expect(moved.gesture.kind).toBe('panning');
    expect(moved.intent.kind).toBe('pan');
    if (moved.intent.kind !== 'pan') return;
    expect(moved.intent.viewport.x).toBe(-50);
    expect(moved.intent.viewport.y).toBe(-30);
  });

  /**
   * 팬은 누른 자리에서 재야 한다. 직전 자리에서 재면 반올림 오차가 쌓인다.
   *
   * **세 번 움직이는 것이 중요하다.** 첫 번째 움직임은 아직 `pressed` 라
   * 문턱을 넘는 전환 그 자체이고, `panning` 갈래는 두 번째부터 돈다. 두 번만
   * 움직이면 그 갈래를 딱 한 번 지나므로 "자리를 갱신하며 쌓이는" 버그가
   * 드러날 자리가 없다 — 세 번째에서야 어긋난다.
   */
  it('팬은 여러 번 움직여도 누른 자리에서 잰다', () => {
    const g = onPointerDown(IDLE, at(0, 0), undefined, DEFAULT_VIEWPORT);

    const first = onPointerMove(g, at(10, 0));
    if (first.intent.kind !== 'pan') throw new Error('팬이 아니다');
    expect(first.intent.viewport.x).toBe(-10);

    const second = onPointerMove(first.gesture, at(30, 0));
    if (second.intent.kind !== 'pan') throw new Error('팬이 아니다');
    expect(second.intent.viewport.x).toBe(-30);

    const third = onPointerMove(second.gesture, at(45, 0));
    if (third.intent.kind !== 'pan') throw new Error('팬이 아니다');
    expect(third.intent.viewport.x).toBe(-45);
  });

  /**
   * **팬을 하다 손을 떼는 것은 흔한 조작인데 뜻이 없다.** 화면을 밀어 놓은
   * 것으로 끝이고, 고르지도 문서를 고치지도 않는다. 여기서 엉뚱한 뜻이 새면
   * 배경을 밀었을 뿐인데 선택이 풀리거나 무언가가 문서에 적힌다.
   */
  it('팬 하다 손을 떼면 아무 뜻도 안 남는다', () => {
    const down = onPointerDown(IDLE, at(0, 0), undefined, DEFAULT_VIEWPORT);
    const moved = onPointerMove(down, at(50, 30));
    expect(moved.gesture.kind).toBe('panning');

    const up = onPointerUp(moved.gesture, at(50, 30));
    expect(up.gesture).toEqual(IDLE);
    expect(up.intent).toEqual({ kind: 'none' });
  });
});

describe('누르고 그냥 떼기', () => {
  /**
   * 이 검사는 `panning` 이 아니라 `pressed` 를 지난다 — 움직인 적이 없기
   * 때문이다. "팬" 묶음에 두었더니 팬 쪽이 다 덮인 것처럼 보여, 정작 팬을
   * 하다 떼는 경우가 빠진 것을 오래 못 봤다. 그래서 따로 묶는다.
   */
  it('배경을 눌렀다 그냥 떼면 선택을 푼다', () => {
    const g = onPointerDown(IDLE, at(0, 0), undefined, DEFAULT_VIEWPORT);
    const up = onPointerUp(g, at(0, 0));
    expect(up.intent).toEqual({ kind: 'select', hit: undefined });
  });
});

describe('노드가 아닌 것', () => {
  it('선을 눌렀다 끌면 노드 끌기가 아니라 팬이다', () => {
    const graph = buildGraph(parse('service a\nservice b\na -> b'));
    const scene = buildScene(graph, new Map());
    const edge = scene.edges[0];
    if (edge === undefined) throw new Error('선이 없다');

    const g = onPointerDown(IDLE, at(0, 0), { kind: 'edge', edge }, DEFAULT_VIEWPORT);
    const moved = onPointerMove(g, at(50, 0));

    expect(moved.gesture.kind).toBe('panning');
  });
});

describe('빈 상태', () => {
  it('누르지 않은 채 움직이거나 떼도 아무 일이 없다', () => {
    expect(onPointerMove(IDLE, at(10, 10))).toEqual({ gesture: IDLE, intent: { kind: 'none' } });
    expect(onPointerUp(IDLE, at(10, 10))).toEqual({ gesture: IDLE, intent: { kind: 'none' } });
  });
});
```

- [ ] **Step 2: 검사를 돌려 지는 것을 본다**

Run: `cd apps/web && npx vitest run test/gesture.test.ts`
Expected: FAIL — 모듈을 찾을 수 없다

- [ ] **Step 3: 구현을 쓴다**

`apps/web/src/interaction/gesture.ts`:

```ts
import { distance, panBy } from '@keel/renderer';
import type { Hit, Point, Viewport } from '@keel/renderer';

/**
 * 포인터 제스처 상태 기계.
 *
 * DOM 이벤트도 React 도 안 받는다 — `{ screen, world }` 두 점만 받는 우리
 * 타입이다. 그래서 Node 에서 그대로 검사되고, 화면 쪽은 이벤트를 이 모양으로
 * 옮겨 담기만 한다.
 *
 * 문턱이 이 파일의 존재 이유다. 누르자마자 끌기로 치면 "고르려고 눌렀는데 1px
 * 밀려서 노드가 움직이는" 일이 나고, 손이 떨리는 사람에게는 노드를 고를 방법이
 * 아예 없어진다.
 */

/** 이만큼 화면에서 움직이기 전까지는 끌기가 아니다 */
export const DRAG_THRESHOLD = 4;

export interface PointerLike {
  readonly screen: Point;
  readonly world: Point;
}

export type Gesture =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'pressed';
      readonly screen: Point;
      readonly world: Point;
      readonly hit: Hit | undefined;
      readonly viewport: Viewport;
    }
  | { readonly kind: 'dragging'; readonly nodeId: string; readonly grabOffset: Point }
  | { readonly kind: 'panning'; readonly from: Point; readonly viewport: Viewport };

export type Intent =
  | { readonly kind: 'none' }
  | { readonly kind: 'select'; readonly hit: Hit | undefined }
  | { readonly kind: 'drag-move'; readonly nodeId: string; readonly at: Point }
  | { readonly kind: 'pan'; readonly viewport: Viewport }
  | { readonly kind: 'commit-drag'; readonly nodeId: string; readonly at: Point };

export const IDLE: Gesture = { kind: 'idle' };

const NOTHING: Intent = { kind: 'none' };

export function onPointerDown(
  _gesture: Gesture,
  e: PointerLike,
  hit: Hit | undefined,
  viewport: Viewport,
): Gesture {
  return { kind: 'pressed', screen: e.screen, world: e.world, hit, viewport };
}

export function onPointerMove(
  gesture: Gesture,
  e: PointerLike,
): { gesture: Gesture; intent: Intent } {
  switch (gesture.kind) {
    case 'idle':
      return { gesture, intent: NOTHING };

    case 'pressed': {
      if (distance(gesture.screen, e.screen) <= DRAG_THRESHOLD) {
        return { gesture, intent: NOTHING };
      }

      // 노드를 잡았을 때만 끌기다. 선·그룹·배경을 잡았으면 화면을 미는 것이다
      if (gesture.hit?.kind === 'node') {
        const { node } = gesture.hit;
        const grabOffset = {
          x: node.center.x - gesture.world.x,
          y: node.center.y - gesture.world.y,
        };
        const next: Gesture = { kind: 'dragging', nodeId: node.id, grabOffset };
        return { gesture: next, intent: dragMove(next, e) };
      }

      const next: Gesture = { kind: 'panning', from: gesture.screen, viewport: gesture.viewport };
      return { gesture: next, intent: pan(next, e) };
    }

    case 'dragging':
      return { gesture, intent: dragMove(gesture, e) };

    case 'panning':
      return { gesture, intent: pan(gesture, e) };
  }
}

export function onPointerUp(
  gesture: Gesture,
  e: PointerLike,
): { gesture: Gesture; intent: Intent } {
  switch (gesture.kind) {
    case 'idle':
      return { gesture: IDLE, intent: NOTHING };

    // 문턱을 안 넘고 뗐다 = 끌기가 아니라 고르기
    case 'pressed':
      return { gesture: IDLE, intent: { kind: 'select', hit: gesture.hit } };

    case 'dragging': {
      const moved = dragMove(gesture, e);
      return {
        gesture: IDLE,
        intent:
          moved.kind === 'drag-move'
            ? { kind: 'commit-drag', nodeId: moved.nodeId, at: moved.at }
            : NOTHING,
      };
    }

    case 'panning':
      return { gesture: IDLE, intent: NOTHING };
  }
}

/** 잡은 자리를 지킨다. 안 지키면 노드가 커서 밑으로 튄다 */
function dragMove(gesture: Extract<Gesture, { kind: 'dragging' }>, e: PointerLike): Intent {
  return {
    kind: 'drag-move',
    nodeId: gesture.nodeId,
    at: { x: e.world.x + gesture.grabOffset.x, y: e.world.y + gesture.grabOffset.y },
  };
}

/**
 * 팬은 **누른 자리에서** 잰다. 직전 자리에서 재면 프레임마다 반올림 오차가
 * 쌓여 화면이 조금씩 흘러간다.
 */
function pan(gesture: Extract<Gesture, { kind: 'panning' }>, e: PointerLike): Intent {
  return {
    kind: 'pan',
    viewport: panBy(
      gesture.viewport,
      e.screen.x - gesture.from.x,
      e.screen.y - gesture.from.y,
    ),
  };
}
```

- [ ] **Step 4: 검사를 돌려 통과하는 것을 본다**

Run: `cd apps/web && npx vitest run test/gesture.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: 검사가 실제로 무는지 확인한다**

1. 문턱 견주기를 `distance(...) < 0` 으로 바꿔 늘 끌기가 되게 한다 → `문턱을 안 넘고 떼면…` 이 져야 한다
2. `dragMove` 에서 `grabOffset` 더하기를 빼고 `e.world` 를 그대로 쓴다 → `잡은 자리를 지킨다` 가 져야 한다
3. `onPointerUp` 의 `panning` 갈래가 `NOTHING` 대신 `{ kind: 'select', hit: undefined }` 를 돌려주게 한다 → `팬 하다 손을 떼면 아무 뜻도 안 남는다` 가 져야 한다

4. `pan` 의 기준을 매번 갱신되는 값으로 바꾼다 → `팬은 여러 번 움직여도 누른 자리에서 잰다` 가 져야 한다

   **두 자리를 따로 해 본다.** (a) `pressed → panning` 전환에서 `from: gesture.screen`
   을 `from: e.screen` 으로 바꾸기 (b) `panning` 갈래가 매 움직임마다 새 `from` 을
   담은 상태를 돌려주게 하기. 둘 다 져야 한다 — (b)는 세 번째 움직임에서 어긋난다.

Expected: 각각 FAIL. 확인 후 되돌린다.

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/interaction/gesture.ts apps/web/test/gesture.test.ts
git commit -F - <<'EOF'
web: 포인터 제스처 순수 상태 기계

DOM 이벤트도 React 도 안 받고 { screen, world } 두 점만 받는다. 그래서 Node
에서 그대로 검사되고, 화면 쪽은 이벤트를 이 모양으로 옮겨 담기만 한다.

문턱(4px)이 이 파일의 존재 이유다. 누르자마자 끌기로 치면 "고르려고 눌렀는데
1px 밀려서 노드가 움직이는" 일이 나고, 손이 떨리는 사람에게는 노드를 고를
방법이 아예 없어진다.

잡은 자리를 기억해야 노드가 커서 밑으로 안 튄다. 팬은 직전 자리가 아니라 누른
자리에서 잰다 — 직전 자리에서 재면 프레임마다 반올림 오차가 쌓여 화면이
조금씩 흘러간다. 셋 다 되돌려 검사가 지는 것을 확인했다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 9: wheel — 휠과 트랙패드 핀치를 뷰포트로

**Files:**
- Create: `apps/web/src/interaction/wheel.ts`
- Create: `apps/web/test/wheel.test.ts`

**Interfaces:**
- Consumes: `@keel/renderer` 의 `Viewport`·`Point`·`panBy`·`zoomAt`
- Produces:
  - `interface WheelLike { readonly deltaX: number; readonly deltaY: number; readonly ctrlKey: boolean }`
  - `wheelToViewport(viewport: Viewport, e: WheelLike, cursor: Point): Viewport`

- [ ] **Step 1: 실패하는 검사를 쓴다**

`apps/web/test/wheel.test.ts`:

```ts
import { DEFAULT_VIEWPORT, ZOOM_LIMITS, screenToWorld } from '@keel/renderer';
import { describe, expect, it } from 'vitest';
import { wheelToViewport } from '../src/interaction/wheel.js';

const cursor = { x: 400, y: 300 };

describe('그냥 휠', () => {
  it('화면을 민다 — 줌은 그대로다', () => {
    const next = wheelToViewport(DEFAULT_VIEWPORT, { deltaX: 0, deltaY: 100, ctrlKey: false }, cursor);
    expect(next.zoom).toBe(DEFAULT_VIEWPORT.zoom);
    expect(next.y).toBe(100);
  });

  it('가로 휠도 받는다', () => {
    const next = wheelToViewport(DEFAULT_VIEWPORT, { deltaX: 40, deltaY: 0, ctrlKey: false }, cursor);
    expect(next.x).toBe(40);
  });
});

describe('핀치(ctrl+휠)', () => {
  it('확대·축소한다', () => {
    const inward = wheelToViewport(DEFAULT_VIEWPORT, { deltaX: 0, deltaY: -100, ctrlKey: true }, cursor);
    const outward = wheelToViewport(DEFAULT_VIEWPORT, { deltaX: 0, deltaY: 100, ctrlKey: true }, cursor);

    expect(inward.zoom).toBeGreaterThan(DEFAULT_VIEWPORT.zoom);
    expect(outward.zoom).toBeLessThan(DEFAULT_VIEWPORT.zoom);
  });

  /** 확대할 때마다 보던 곳이 화면 밖으로 밀려나면 못 쓴다 */
  it('커서 밑의 월드 점이 제자리에 남는다', () => {
    const viewport = { x: 30, y: -10, zoom: 1.4 };
    const before = screenToWorld(viewport, cursor);

    const next = wheelToViewport(viewport, { deltaX: 0, deltaY: -120, ctrlKey: true }, cursor);
    const after = screenToWorld(next, cursor);

    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('줌 한계에서 멈춘다', () => {
    let viewport = DEFAULT_VIEWPORT;
    for (let i = 0; i < 200; i += 1) {
      viewport = wheelToViewport(viewport, { deltaX: 0, deltaY: -100, ctrlKey: true }, cursor);
    }
    expect(viewport.zoom).toBe(ZOOM_LIMITS.max);
  });

  it('어떤 값을 넣어도 유한하다', () => {
    for (const deltaY of [0, -1, 1, -10000, 10000]) {
      const next = wheelToViewport(DEFAULT_VIEWPORT, { deltaX: 0, deltaY, ctrlKey: true }, cursor);
      expect(Number.isFinite(next.x)).toBe(true);
      expect(Number.isFinite(next.y)).toBe(true);
      expect(Number.isFinite(next.zoom)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: 검사를 돌려 지는 것을 본다**

Run: `cd apps/web && npx vitest run test/wheel.test.ts`
Expected: FAIL — 모듈을 찾을 수 없다

- [ ] **Step 3: 구현을 쓴다**

`apps/web/src/interaction/wheel.ts`:

```ts
import { panBy, zoomAt } from '@keel/renderer';
import type { Point, Viewport } from '@keel/renderer';

/**
 * 휠과 트랙패드 핀치를 뷰포트로 옮긴다.
 *
 * 브라우저는 트랙패드 핀치를 **`ctrlKey` 가 켜진 휠 이벤트**로 보낸다. 실제로
 * Ctrl 을 누른 것과 구분할 방법이 없고, 구분할 필요도 없다 — 둘 다 "확대" 라는
 * 같은 뜻이다.
 *
 * DOM 이벤트가 아니라 세 숫자만 받으므로 Node 에서 그대로 검사된다.
 */

export interface WheelLike {
  readonly deltaX: number;
  readonly deltaY: number;
  readonly ctrlKey: boolean;
}

/** 휠 한 칸이 줌을 얼마나 바꾸는가. 지수로 걸어 어느 배율에서도 느낌이 같다 */
const ZOOM_PER_PIXEL = 1 / 250;

export function wheelToViewport(viewport: Viewport, e: WheelLike, cursor: Point): Viewport {
  if (e.ctrlKey) {
    return zoomAt(viewport, cursor, Math.exp(-e.deltaY * ZOOM_PER_PIXEL));
  }
  return panBy(viewport, -e.deltaX, -e.deltaY);
}
```

- [ ] **Step 4: 검사를 돌려 통과하는 것을 본다**

Run: `cd apps/web && npx vitest run test/wheel.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: 검사가 실제로 무는지 확인한다**

`zoomAt(viewport, cursor, …)` 의 `cursor` 를 `{ x: 0, y: 0 }` 으로 바꾼다 → `커서 밑의 월드 점이 제자리에 남는다` 가 져야 한다.

Expected: FAIL. 확인 후 되돌린다.

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/interaction/wheel.ts apps/web/test/wheel.test.ts
git commit -F - <<'EOF'
web: 휠과 트랙패드 핀치를 뷰포트로

브라우저는 트랙패드 핀치를 ctrlKey 가 켜진 휠 이벤트로 보낸다. 실제 Ctrl 과
구분할 방법도 없고 필요도 없다 — 둘 다 "확대" 라는 같은 뜻이다.

줌은 지수로 걸어 어느 배율에서도 느낌이 같게 한다. 커서를 원점으로 바꿔
"커서 밑의 월드 점이 제자리에 남는다" 검사가 지는 것을 확인했다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 10: 캔버스가 그려지고 팬·줌이 된다

**Files:**
- Create: `apps/web/src/hooks/use-keel-document.ts`, `apps/web/src/hooks/use-canvas.ts`
- Create: `apps/web/src/components/canvas-pane.tsx`
- Create: `apps/web/src/document/seed.ts`
- Modify: `apps/web/app/page.tsx` (전체 교체)

**Interfaces:**
- Consumes: Task 3 `createKeelDocument`, Task 5 `yMapReader`·`withDrag`·`Drag`, Task 7 `parseSource`·`sceneOf`·`createMeasure`, Task 9 `wheelToViewport`
- Produces:
  - `useKeelDocument(document: KeelDocument): string` — 소스를 구독해 돌려준다
  - `useCanvas(options: UseCanvasOptions): UseCanvas` — 캔버스 ref·다시 그리기·히트테스트
  - `<CanvasPane document={…} />`

여기부터는 React 가 들어오므로 단위 검사가 없다(**jsdom 을 안 들인다**). 검사할
값어치가 있는 것은 이미 Task 2–9 의 순수 모듈에 있고, 이 층은 **눈으로** 확인한
뒤 Task 14 의 e2e 로 묶는다.

- [ ] **Step 1: 소스 구독 훅을 쓴다**

`apps/web/src/hooks/use-keel-document.ts`:

```ts
'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { KeelDocument } from '../document/keel-document.js';

/**
 * `Y.Text` 를 React 에 잇는다.
 *
 * Yjs 는 React 밖의 저장소이므로 `useSyncExternalStore` 가 정식 통로다.
 * `useEffect` + `useState` 로 흉내 내면 첫 그리기와 구독 사이에 틈이 생겨,
 * 그 사이에 들어온 갱신을 놓친다.
 *
 * **문서가 바뀔 때만** 다시 그린다 — 마우스를 움직이는 것과는 무관하다.
 */
export function useKeelDocument(document: KeelDocument): string {
  const subscribe = useCallback(
    (onChange: () => void) => {
      document.source.observe(onChange);
      return () => document.source.unobserve(onChange);
    },
    [document],
  );

  const getSnapshot = useCallback(() => document.source.toString(), [document]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
```

- [ ] **Step 2: 캔버스 훅을 쓴다**

`apps/web/src/hooks/use-canvas.ts`:

```ts
'use client';

import {
  DEFAULT_THEME,
  DEFAULT_VIEWPORT,
  buildSpatialIndex,
  canvasPixelSize,
  fitToContent,
  hitTest,
  paintScene,
  screenToWorld,
} from '@keel/renderer';
import type { Ctx2D, Hit, Point, Scene, SpatialIndex, Viewport } from '@keel/renderer';
import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/**
 * 캔버스를 쥔다 — 엘리먼트, 크기, RAF 루프, 뷰포트.
 *
 * **뷰포트는 React state 가 아니라 ref 다.** 팬·줌은 `pointermove` 마다 바뀌고,
 * state 로 두면 프레임마다 React 재조정이 돈다. 그리기는 ref 만 읽으므로
 * 포인터를 아무리 흔들어도 재조정은 0회다.
 *
 * 장면도 ref 로 들고 있는다. 장면은 문서에서 나오지만 **그리는 쪽은 언제나 가장
 * 최근 것**을 봐야 하고, 그것을 state 로 두면 끌기 프레임마다 재조정이 된다.
 */

export interface UseCanvasOptions {
  /** 그릴 때마다 불린다. 끌기 중이면 끌고 있는 자리가 반영된 장면을 돌려준다 */
  readonly sceneAt: () => Scene;
  readonly selection: ReadonlySet<string>;
}

export interface UseCanvas {
  readonly canvasRef: (element: HTMLCanvasElement | null) => void;
  /** 다음 프레임에 한 번만 다시 그린다 */
  readonly invalidate: () => void;
  readonly viewportRef: RefObject<Viewport>;
  /** 화면 좌표를 월드 좌표로 */
  readonly toWorld: (screen: Point) => Point;
  /** 캔버스 안에서의 화면 좌표 */
  readonly toScreen: (clientX: number, clientY: number) => Point;
  readonly hitAt: (world: Point) => Hit | undefined;
  readonly fit: () => void;
  readonly setCursor: (cursor: string) => void;
}

export function useCanvas(options: UseCanvasOptions): UseCanvas {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const ctx = useRef<Ctx2D | null>(null);
  const viewportRef = useRef<Viewport>(DEFAULT_VIEWPORT);
  const sceneRef = useRef<Scene | null>(null);
  const indexRef = useRef<SpatialIndex | null>(null);
  const frame = useRef<number | null>(null);
  const cssSize = useRef({ width: 0, height: 0 });

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const draw = useCallback(() => {
    frame.current = null;
    const context = ctx.current;
    if (context === null) return;

    const scene = optionsRef.current.sceneAt();
    sceneRef.current = scene;
    // 색인은 집을 때만 쓰므로 여기서 버리고 필요할 때 다시 세운다
    indexRef.current = null;

    paintScene(context, scene, viewportRef.current, cssSize.current, {
      selection: optionsRef.current.selection,
      devicePixelRatio: window.devicePixelRatio,
    });
  }, []);

  const invalidate = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = window.requestAnimationFrame(draw);
  }, [draw]);

  const resize = useCallback(() => {
    const element = canvas.current;
    if (element === null) return;

    const rect = element.getBoundingClientRect();
    cssSize.current = { width: rect.width, height: rect.height };

    const pixels = canvasPixelSize(cssSize.current, window.devicePixelRatio);
    element.width = pixels.width;
    element.height = pixels.height;
    invalidate();
  }, [invalidate]);

  const canvasRef = useCallback(
    (element: HTMLCanvasElement | null) => {
      canvas.current = element;
      if (element === null) {
        ctx.current = null;
        return;
      }
      // 어긋나면 여기서 컴파일이 깨진다 — 구조적 Ctx2D 가 실제 타입과 맞는지
      ctx.current = element.getContext('2d');
      resize();
    },
    [resize],
  );

  useEffect(() => {
    const element = canvas.current;
    if (element === null) return;

    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [resize]);

  /**
   * 취소한 뒤 **반드시 `null` 로 되돌린다.**
   *
   * 안 되돌리면 `frame.current` 가 이미 취소된 id 를 계속 들고 있고,
   * `invalidate()` 의 문지기가 그것을 "이미 예약됨" 으로 읽어 다시 그리기를
   * 영원히 막는다. React 의 Strict Mode 는 개발 중에 마운트→정리→재마운트를
   * 한 번 흉내 내므로, **첫 그리기 뒤 캔버스가 그대로 얼어붙는다.**
   * 띄워 보기 전에는 안 보이는 부류다 — 타입도 린트도 검사도 다 통과한다.
   */
  useEffect(
    () => () => {
      if (frame.current !== null) {
        window.cancelAnimationFrame(frame.current);
        frame.current = null;
      }
    },
    [],
  );

  const toScreen = useCallback((clientX: number, clientY: number): Point => {
    const rect = canvas.current?.getBoundingClientRect();
    if (rect === undefined) return { x: clientX, y: clientY };
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const toWorld = useCallback((screen: Point) => screenToWorld(viewportRef.current, screen), []);

  const hitAt = useCallback((world: Point): Hit | undefined => {
    const scene = sceneRef.current;
    if (scene === null) return undefined;

    indexRef.current ??= buildSpatialIndex(scene);
    return hitTest(indexRef.current, scene, world, {
      // 렌더러가 월드 단위라고 적어 둔 자리. 나눠야 화면에서 굵기가 일정하다
      edgeTolerance: DEFAULT_THEME.edge.hitTolerance / viewportRef.current.zoom,
    });
  }, []);

  const fit = useCallback(() => {
    const scene = sceneRef.current;
    if (scene === null) return;
    viewportRef.current = fitToContent(scene.contentBounds, cssSize.current);
    invalidate();
  }, [invalidate]);

  const setCursor = useCallback((cursor: string) => {
    if (canvas.current !== null) canvas.current.style.cursor = cursor;
  }, []);

  return { canvasRef, invalidate, viewportRef, toWorld, toScreen, hitAt, fit, setCursor };
}
```

- [ ] **Step 3: 캔버스 컴포넌트를 쓴다 (팬·줌까지)**

`apps/web/src/components/canvas-pane.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { createMeasure, parseSource, sceneOf } from '../document/derive.js';
import type { KeelDocument } from '../document/keel-document.js';
import { withDrag, yMapReader } from '../document/layout-reader.js';
import type { Drag } from '../document/layout-reader.js';
import { useCanvas } from '../hooks/use-canvas.js';
import { useKeelDocument } from '../hooks/use-keel-document.js';
import { wheelToViewport } from '../interaction/wheel.js';

export function CanvasPane({ document }: { document: KeelDocument }) {
  const source = useKeelDocument(document);
  const [selection] = useState<ReadonlySet<string>>(() => new Set());

  const dragRef = useRef<Drag | undefined>(undefined);

  /**
   * 글자는 **진짜 캔버스로** 잰다. 어림 측정기와 실측이 어긋나면 상자 너비가
   * 화면에서만 달라져, 손으로 맞춘 자리가 미묘하게 밀린 것처럼 보인다.
   *
   * 그리는 캔버스가 아니라 따로 만든 것을 쓴다 — 마운트를 기다리지 않아도 되고,
   * 재는 일이 그리는 상태(`font` 속성)를 건드리지 않는다. 서버에서는 캔버스가
   * 없으므로 어림으로 떨어진다(그쪽은 어차피 안 그린다).
   */
  const measure = useMemo(() => {
    if (typeof window === 'undefined') return createMeasure(undefined);
    return createMeasure(window.document.createElement('canvas').getContext('2d') ?? undefined);
  }, []);

  const { graph } = useMemo(() => parseSource(source), [source]);
  const graphRef = useRef(graph);
  graphRef.current = graph;

  const sceneAt = useCallback(
    () =>
      sceneOf(
        graphRef.current,
        withDrag(yMapReader(document.layout), dragRef.current),
        measure,
      ),
    [document, measure],
  );

  const canvas = useCanvas({ sceneAt, selection });
  const { invalidate, viewportRef, toScreen, fit } = canvas;

  // 문서가 바뀌면 다시 그린다
  useEffect(() => {
    invalidate();
  }, [source, invalidate]);

  // 레이아웃이 바뀌어도 다시 그린다 (남이 옮겼거나 되돌렸을 때)
  useEffect(() => {
    const onChange = () => invalidate();
    document.layout.observe(onChange);
    return () => document.layout.unobserve(onChange);
  }, [document, invalidate]);

  // 첫 장면은 내용에 맞춰 둔다
  useEffect(() => {
    const id = window.requestAnimationFrame(fit);
    return () => window.cancelAnimationFrame(id);
  }, [fit]);

  const onWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      viewportRef.current = wheelToViewport(
        viewportRef.current,
        { deltaX: e.deltaX, deltaY: e.deltaY, ctrlKey: e.ctrlKey },
        toScreen(e.clientX, e.clientY),
      );
      invalidate();
    },
    [invalidate, toScreen, viewportRef],
  );

  /**
   * React 의 `onWheel` 은 수동 리스너라 `preventDefault` 가 안 먹는다.
   * 브라우저가 페이지를 확대해 버리므로 직접 붙인다.
   */
  const wheelTarget = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const element = wheelTarget.current;
    if (element === null) return;
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  return (
    <div ref={wheelTarget} style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      <canvas ref={canvas.canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}
```

- [ ] **Step 4: 화면을 붙인다**

`apps/web/app/page.tsx` (전체 교체):

```tsx
'use client';

import { useEffect, useMemo } from 'react';
import { CanvasPane } from '../src/components/canvas-pane.js';
import { createKeelDocument } from '../src/document/keel-document.js';
import { SEED } from '../src/document/seed.js';

export default function EditorPage() {
  const document = useMemo(() => createKeelDocument(SEED), []);
  useEffect(() => () => document.destroy(), [document]);

  return (
    <main style={{ height: '100%' }}>
      <CanvasPane document={document} />
    </main>
  );
}
```

`apps/web/src/document/seed.ts`:

```ts
/**
 * 첫 화면의 씨앗.
 *
 * `packages/dsl/fixtures/order-flow.keel` 과 같은 내용이다. 저장이 없는 판이라
 * 새로고침하면 이리로 돌아온다 — 저장은 `apps/api` 의 일이라는 것을 화면이
 * 솔직하게 드러낸다.
 */
export const SEED = `# 주문이 들어와서 결제까지

actor user "손님"
service web "스토어프론트"
service api "주문 API"
db orders "주문 DB"
queue events "이벤트 큐"

group payment "결제" {
  service pay "결제 서비스"
  external toss "토스페이먼츠"
}

user -> web "주문하기"
web -> api
api -> orders "주문 저장"
api -> pay "결제 요청"
pay -> toss
api -> events "order.created"
`;
```

- [ ] **Step 5: 타입·린트를 확인한다**

Run: `cd /Users/kisagge/my-projects/keel && pnpm typecheck && pnpm lint && pnpm test`
Expected: 전부 통과

- [ ] **Step 6: 눈으로 확인한다**

Run: `pnpm --filter @keel/web dev` 를 띄우고 `http://localhost:3000` 을 연다

**`build` 가 아니라 `dev` 로 봐야 한다.** React 의 Strict Mode 는 개발 중에만
마운트→정리→재마운트를 흉내 내는데, 정리에서 남긴 찌꺼기로 화면이 얼어붙는
부류의 버그는 그때만 드러난다. 타입·린트·검사·빌드를 전부 통과하고도 화면이
안 움직일 수 있다.

Expected:
- 씨앗 문서의 노드 일곱 개와 `결제` 그룹 테두리가 보인다
- 종류마다 생김새가 다르다 (`external toss` 는 점선, `db orders` 는 원통)
- 휠로 화면이 밀리고 `Ctrl`+휠(또는 트랙패드 핀치)로 커서 자리를 붙든 채 확대된다
- 창 크기를 바꿔도 흐려지지 않는다

- [ ] **Step 7: 커밋**

```bash
git add apps/web
git commit -F - <<'EOF'
web: 캔버스가 그려지고 팬·줌이 된다

뷰포트를 React state 가 아니라 ref 로 둔다. 팬·줌은 pointermove 마다 바뀌고
state 로 두면 프레임마다 재조정이 돈다. 그리기는 ref 만 읽으므로 포인터를
아무리 흔들어도 재조정은 0회다.

장면도 ref 다. 그리는 쪽은 언제나 가장 최근 것을 봐야 하고, state 로 두면
끌기 프레임마다 재조정이 된다.

Y.Text 구독은 useSyncExternalStore 로 한다. useEffect + useState 로 흉내 내면
첫 그리기와 구독 사이에 틈이 생겨 그 사이 갱신을 놓친다.

React 의 onWheel 은 수동 리스너라 preventDefault 가 안 먹어 브라우저가 페이지를
확대해 버린다. 직접 붙인다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 11: 고르기와 끌기 — 캔버스가 문서를 고친다

**Files:**
- Modify: `apps/web/src/components/canvas-pane.tsx` (포인터 처리를 더한다)

**Interfaces:**
- Consumes: Task 8 `IDLE`·`onPointerDown`·`onPointerMove`·`onPointerUp`·`Gesture`, Task 4 `moveNode`
- Produces: `CanvasPane` 이 `selection` 과 `onSelect` 를 받는다 — Task 13 의 인스펙터가 쓴다

- [ ] **Step 1: `CanvasPane` 의 속성을 넓힌다**

`apps/web/src/components/canvas-pane.tsx` 의 컴포넌트 선언과 `selection` 상태를
바꾼다. 아래가 바뀐 부분 전체다:

```tsx
export interface CanvasPaneProps {
  readonly document: KeelDocument;
  readonly selection: ReadonlySet<string>;
  readonly onSelect: (hit: Hit | undefined) => void;
}

export function CanvasPane({ document, selection, onSelect }: CanvasPaneProps) {
  const source = useKeelDocument(document);
  // …(나머지는 그대로)
}
```

`useState` 로 만들던 `selection` 은 지우고, `import type { Hit } from '@keel/renderer';`
를 더한다.

- [ ] **Step 2: 포인터 처리를 더한다**

`canvas-pane.tsx` 의 `onWheel` 아래에 넣는다:

```tsx
  const gestureRef = useRef<Gesture>(IDLE);

  const pointerAt = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      const screen = toScreen(e.clientX, e.clientY);
      return { screen, world: canvas.toWorld(screen) };
    },
    [canvas, toScreen],
  );

  const handleIntent = useCallback(
    (intent: Intent) => {
      switch (intent.kind) {
        case 'none':
          return;

        case 'select':
          onSelect(intent.hit);
          return;

        case 'pan':
          viewportRef.current = intent.viewport;
          invalidate();
          return;

        // 끌고 있는 자리는 **아직 문서가 아니다.** ref 에만 두고 그리기만 한다
        case 'drag-move':
          dragRef.current = { id: intent.nodeId, at: intent.at };
          invalidate();
          return;

        /**
         * 놓는 순간 문서가 된다. 중간 좌표까지 CRDT 에 넣으면 실시간 판에서
         * 업데이트 로그가 포인터무브 수만큼 불어난다.
         */
        case 'commit-drag':
          dragRef.current = undefined;
          moveNode(document, intent.nodeId, intent.at);
          invalidate();
          return;
      }
    },
    [document, invalidate, onSelect, viewportRef],
  );

  const onPointerDownHandler = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      const at = pointerAt(e);
      gestureRef.current = onPointerDown(
        gestureRef.current,
        at,
        canvas.hitAt(at.world),
        viewportRef.current,
      );
    },
    [canvas, pointerAt, viewportRef],
  );

  const onPointerMoveHandler = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      const at = pointerAt(e);

      // 가리킨 것은 ref 도 state 도 아니고 커서 모양으로만 나타난다
      if (gestureRef.current.kind === 'idle') {
        canvas.setCursor(canvas.hitAt(at.world)?.kind === 'node' ? 'grab' : 'default');
        return;
      }

      const { gesture, intent } = onPointerMove(gestureRef.current, at);
      gestureRef.current = gesture;
      if (gesture.kind === 'dragging') canvas.setCursor('grabbing');
      handleIntent(intent);
    },
    [canvas, handleIntent, pointerAt],
  );

  const onPointerUpHandler = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.releasePointerCapture(e.pointerId);
      const { gesture, intent } = onPointerUp(gestureRef.current, pointerAt(e));
      gestureRef.current = gesture;
      canvas.setCursor('default');
      handleIntent(intent);
    },
    [canvas, handleIntent, pointerAt],
  );
```

`<canvas>` 에 셋을 붙인다:

```tsx
      <canvas
        ref={canvas.canvasRef}
        onPointerDown={onPointerDownHandler}
        onPointerMove={onPointerMoveHandler}
        onPointerUp={onPointerUpHandler}
        onPointerCancel={onPointerUpHandler}
        style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
      />
```

import 를 더한다:

```tsx
import { moveNode } from '../document/commands.js';
import {
  IDLE,
  onPointerDown,
  onPointerMove,
  onPointerUp,
} from '../interaction/gesture.js';
import type { Gesture, Intent } from '../interaction/gesture.js';
```

- [ ] **Step 3: `page.tsx` 가 선택을 들게 한다**

`apps/web/app/page.tsx`:

```tsx
'use client';

import type { Hit } from '@keel/renderer';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CanvasPane } from '../src/components/canvas-pane.js';
import { createKeelDocument } from '../src/document/keel-document.js';
import { SEED } from '../src/document/seed.js';

/** 고른 것의 id. 노드·그룹 id 와 엣지 key 를 한 자루에 담아도 안전하다 —
 *  파서가 duplicate-id 를 잡아 둘이 안 겹치고, 엣지 key 에는 빈칸이 들어 있다 */
function idOf(hit: Hit | undefined): string | undefined {
  if (hit === undefined) return undefined;
  if (hit.kind === 'node') return hit.node.id;
  if (hit.kind === 'edge') return hit.edge.key;
  return hit.group.id;
}

export default function EditorPage() {
  const document = useMemo(() => createKeelDocument(SEED), []);
  useEffect(() => () => document.destroy(), [document]);

  const [selectedHit, setSelectedHit] = useState<Hit | undefined>(undefined);
  const selection = useMemo(() => {
    const id = idOf(selectedHit);
    return new Set<string>(id === undefined ? [] : [id]);
  }, [selectedHit]);

  const onSelect = useCallback((hit: Hit | undefined) => setSelectedHit(hit), []);

  return (
    <main style={{ height: '100%' }}>
      <CanvasPane document={document} selection={selection} onSelect={onSelect} />
    </main>
  );
}
```

- [ ] **Step 4: 타입·린트·검사를 확인한다**

Run: `cd /Users/kisagge/my-projects/keel && pnpm typecheck && pnpm lint && pnpm test`
Expected: 전부 통과

- [ ] **Step 5: 눈으로 확인한다**

Run: `pnpm --filter @keel/web dev`
Expected:
- 노드 위에서 커서가 `grab` 이 되고, 노드를 누르면 파란 테두리가 생긴다
- 노드를 끌면 따라오고, **`결제` 그룹의 노드를 밖으로 끌면 그룹 테두리가 따라 줄어든다**
- 배경을 끌면 화면이 밀린다 (노드가 안 움직인다)
- 노드를 살짝 눌렀다 떼면 움직이지 않고 고르기만 된다
- 배경을 눌렀다 떼면 선택이 풀린다

- [ ] **Step 6: 커밋**

```bash
git add apps/web
git commit -F - <<'EOF'
web: 고르기와 끌기 — 캔버스가 문서를 고친다

끌고 있는 자리는 아직 문서가 아니다. ref 에만 두고 그리기만 하다가, 놓는 순간
Y.Map 에 쓴다. 중간 좌표까지 CRDT 에 넣으면 실시간 판에서 업데이트 로그가
포인터무브 수만큼 불어난다. 나중에 프레즌스가 오면 이 선이 그대로 "끄는 중은
awareness, 놓은 것은 Y.Map" 이 된다.

끌기는 LayoutReader 덧씌우기로 푼다. 덧그리는 유령이 없고, 그룹 테두리가
자손에서 유도되므로 노드를 그룹 밖으로 끌면 테두리가 실시간으로 따라 줄어든다.

가리킨 것은 ref 도 state 도 아니고 커서 모양으로만 나타난다. state 로 두면
마우스를 움직이는 내내 재조정이 돈다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 12: 에디터 창 — CodeMirror 과 진단

**Files:**
- Create: `apps/web/src/components/editor-pane.tsx`, `apps/web/src/components/diagnostics.tsx`
- Modify: `apps/web/src/document/keel-document.ts` (없음 — `extraTrackedOrigins` 를 쓰기만 한다)
- Modify: `apps/web/app/page.tsx`

**Interfaces:**
- Consumes: Task 3 `createKeelDocument`(두 번째 인자), Task 7 `parseSource`
- Produces: `<EditorPane document={…} viewRef={…} />`, `<DiagnosticsList diagnostics={…} onGoTo={…} />`

- [ ] **Step 1: 에디터 창을 쓴다**

`apps/web/src/components/editor-pane.tsx`:

```tsx
'use client';

import { defaultKeymap } from '@codemirror/commands';
import { linter, lintGutter } from '@codemirror/lint';
import type { Diagnostic as CmDiagnostic } from '@codemirror/lint';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
import { parseSource } from '../document/derive.js';
import type { KeelDocument } from '../document/keel-document.js';

/**
 * 텍스트 쪽.
 *
 * `y-codemirror.next` 가 `Y.Text` 와 편집기를 잇는다. awareness 는 아직 없으므로
 * `null` 을 넘긴다 — 그 인자는 `if (awareness)` 로 감싸여 있어 원격 커서
 * 플러그인만 빠진다. 프레즌스가 올 때 채운다.
 *
 * 되돌리기는 문서가 들고 있는 하나를 그대로 쓴다. CodeMirror 의 자체 history 를
 * 쓰면 친 글자와 끈 노드가 다른 역사로 갈려, 사람이 "방금 뭘 되돌렸는지" 를
 * 못 따라간다.
 */
export function EditorPane({
  document: keelDocument,
  viewRef,
}: {
  readonly document: KeelDocument;
  readonly viewRef: RefObject<EditorView | null>;
}) {
  const host = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const parent = host.current;
    if (parent === null) return;

    /**
     * 진단은 **이미 파싱한 것을 그대로 넘긴다.** 린터 안에서 다시 파싱하면
     * 글자를 칠 때마다 같은 일을 두 번 한다.
     */
    const keelLinter = linter((view): CmDiagnostic[] => {
      const { document: parsed } = parseSource(view.state.doc.toString());
      return parsed.diagnostics.map((d) => ({
        from: d.span.start,
        to: Math.max(d.span.start + 1, d.span.end),
        severity: d.severity,
        message: d.message,
        source: d.code,
      }));
    });

    const view = new EditorView({
      parent,
      state: EditorState.create({
        extensions: [
          lineNumbers(),
          lintGutter(),
          keelLinter,
          /**
           * CodeMirror 의 `history()` 는 **일부러 안 넣는다.** 넣으면 친 글자와
           * 끈 노드가 다른 역사로 갈려, 사람이 "방금 뭘 되돌렸는지" 를 못
           * 따라간다. `yUndoManagerKeymap` 이 문서의 역사 하나를 쓴다.
           */
          keymap.of([...yUndoManagerKeymap, ...defaultKeymap]),
          yCollab(keelDocument.source, null, { undoManager: keelDocument.undoManager }),
          EditorView.theme({
            '&': { height: '100%', fontSize: '13px' },
            '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
          }),
        ],
      }),
    });

    viewRef.current = view;
    return () => {
      viewRef.current = null;
      view.destroy();
    };
  }, [keelDocument, viewRef]);

  return <div ref={host} style={{ height: '100%', overflow: 'hidden' }} />;
}
```

- [ ] **Step 2: 진단 목록을 쓴다**

`apps/web/src/components/diagnostics.tsx`:

```tsx
'use client';

import type { Diagnostic } from '@keel/dsl';

/**
 * 진단 목록.
 *
 * 밑줄만으로는 화면 밖의 잘못을 못 본다. 목록이 있으면 "선언 없이 만들어진
 * 노드" 같은 조용한 경고도 눈에 들어온다 — 오타가 새 노드가 되는 대가를
 * 여기서 갚는다.
 */
export function DiagnosticsList({
  diagnostics,
  onGoTo,
}: {
  readonly diagnostics: readonly Diagnostic[];
  readonly onGoTo: (position: number) => void;
}) {
  if (diagnostics.length === 0) {
    return (
      <p style={{ margin: 0, padding: '8px 12px', color: 'var(--keel-muted)', fontSize: 12 }}>
        문제 없음
      </p>
    );
  }

  return (
    <ul style={{ margin: 0, padding: '4px 0', listStyle: 'none', overflowY: 'auto', fontSize: 12 }}>
      {diagnostics.map((d) => (
        <li key={`${d.code}:${d.span.start}:${d.span.end}`}>
          <button
            type="button"
            onClick={() => onGoTo(d.span.start)}
            style={{
              display: 'block',
              width: '100%',
              padding: '4px 12px',
              border: 0,
              background: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              color: d.severity === 'error' ? '#b91c1c' : 'var(--keel-muted)',
            }}
          >
            {d.line + 1}행 · {d.message}
          </button>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: 화면에 두 창을 붙인다**

`apps/web/app/page.tsx` 를 고친다. `YSyncConfig` 를 되돌리기 origin 으로 넘기는
것이 핵심이다:

```tsx
'use client';

import type { EditorView } from '@codemirror/view';
import type { Hit } from '@keel/renderer';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { YSyncConfig } from 'y-codemirror.next';
import { CanvasPane } from '../src/components/canvas-pane.js';
import { DiagnosticsList } from '../src/components/diagnostics.js';
import { EditorPane } from '../src/components/editor-pane.js';
import { parseSource } from '../src/document/derive.js';
import { createKeelDocument } from '../src/document/keel-document.js';
import { useKeelDocument } from '../src/hooks/use-keel-document.js';
import { SEED } from '../src/document/seed.js';

function idOf(hit: Hit | undefined): string | undefined {
  if (hit === undefined) return undefined;
  if (hit.kind === 'node') return hit.node.id;
  if (hit.kind === 'edge') return hit.edge.key;
  return hit.group.id;
}

export default function EditorPage() {
  /**
   * `YSyncConfig` 를 넘기는 것이 핵심이다. CodeMirror 의 로컬 편집은 그 클래스의
   * 인스턴스를 origin 으로 쓰고, Yjs 는 origin 을 생성자로도 견주므로 클래스만
   * 넣어 두면 인스턴스를 손에 안 쥐어도 되돌리기에 걸린다.
   */
  const document = useMemo(() => createKeelDocument(SEED, [YSyncConfig]), []);
  useEffect(() => () => document.destroy(), [document]);

  const source = useKeelDocument(document);
  const { document: parsed } = useMemo(() => parseSource(source), [source]);

  const viewRef = useRef<EditorView | null>(null);
  const goTo = useCallback((position: number) => {
    const view = viewRef.current;
    if (view === null) return;
    view.dispatch({ selection: { anchor: position }, scrollIntoView: true });
    view.focus();
  }, []);

  const [selectedHit, setSelectedHit] = useState<Hit | undefined>(undefined);
  const selection = useMemo(() => {
    const id = idOf(selectedHit);
    return new Set<string>(id === undefined ? [] : [id]);
  }, [selectedHit]);

  return (
    <main style={{ height: '100%', display: 'grid', gridTemplateColumns: '40% 1fr' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateRows: '1fr auto',
          borderRight: '1px solid var(--keel-border)',
          minHeight: 0,
        }}
      >
        <EditorPane document={document} viewRef={viewRef} />
        <div style={{ borderTop: '1px solid var(--keel-border)', maxHeight: 160, minHeight: 0 }}>
          <DiagnosticsList diagnostics={parsed.diagnostics} onGoTo={goTo} />
        </div>
      </div>

      <CanvasPane document={document} selection={selection} onSelect={setSelectedHit} />
    </main>
  );
}
```

- [ ] **Step 4: 타입·린트·검사를 확인한다**

Run: `cd /Users/kisagge/my-projects/keel && pnpm typecheck && pnpm lint && pnpm test`
Expected: 전부 통과

- [ ] **Step 5: 눈으로 확인한다**

Run: `pnpm --filter @keel/web dev`
Expected:
- 왼쪽에 씨앗 문서가 보이고, 글자를 치면 **오른쪽 캔버스가 따라 바뀐다**
- `service` 만 치다 말면 밑줄이 생기고 아래 목록에 뜬다. 목록을 누르면 그 줄로 간다
- 치는 도중 화면이 비지 않는다 (파서가 회복한다)
- **캔버스에서 노드를 끌고 `Cmd+Z` 를 누르면 자리가 돌아오고, 글자를 치고 `Cmd+Z` 를 누르면 글자가 돌아온다** — 한 역사다

- [ ] **Step 6: 되돌리기 배선이 실제로 도는지 확인한다**

`page.tsx` 의 `createKeelDocument(SEED, [YSyncConfig])` 에서 `[YSyncConfig]` 를 빼고
화면에서 글자를 친 뒤 `Cmd+Z` 를 눌러 본다.

Expected: 글자가 안 돌아온다(끌기만 돌아온다). 확인 후 되돌린다.

- [ ] **Step 7: 커밋**

```bash
git add apps/web
git commit -F - <<'EOF'
web: 에디터 창과 진단 — 텍스트와 캔버스가 이어진다

y-codemirror.next 가 Y.Text 와 편집기를 잇는다. awareness 는 아직 없으므로
null 을 넘긴다 — 그 인자는 if (awareness) 로 감싸여 있어 원격 커서 플러그인만
빠진다.

되돌리기는 문서가 들고 있는 하나를 그대로 쓰고, page 가 YSyncConfig 클래스를
origin 으로 넘긴다. Yjs 가 origin 을 생성자로도 견주므로 인스턴스를 손에 안
쥐어도 걸린다. 그 인자를 빼고 Cmd+Z 가 글자를 못 되돌리는 것을 확인했다.

진단은 이미 파싱한 것을 그대로 넘긴다. 린터 안에서 다시 파싱하면 글자를 칠
때마다 같은 일을 두 번 한다.

목록을 따로 둔 것은 밑줄만으로는 화면 밖의 잘못을 못 보기 때문이다. "선언 없이
만들어진 노드" 같은 조용한 경고가 여기서 눈에 들어온다 — 오타가 새 노드가 되는
대가를 여기서 갚는다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 13: 인스펙터 — 캔버스에서 이름과 종류를 고치고 지운다

**Files:**
- Create: `apps/web/src/components/inspector.tsx`
- Modify: `apps/web/app/page.tsx`

**Interfaces:**
- Consumes: Task 4 `renameNode`·`setNodeKind`·`removeNode`
- Produces:
  - `interface InspectorTarget { readonly kind: 'node' | 'edge' | 'group'; readonly id: string; readonly nodeKind: NodeKind | undefined; readonly rawLabel: string | undefined; readonly caption: string | undefined; readonly position: number }`
  - `<Inspector target={…} document={…} onGoTo={…} onCleared={…} />`

**고른 것은 id 로만 들고 있는다.** `PlacedNode` 를 들고 있으면 이름을 고치는
순간 문서가 바뀌고 장면이 다시 서면서 그것이 낡은 값이 된다. 매번 최신 문서에서
다시 찾는 쪽이 옳다 — 그래서 인스펙터는 `Hit` 이 아니라 문서에서 뽑은
`InspectorTarget` 을 받는다.

- [ ] **Step 1: 인스펙터를 쓴다**

`apps/web/src/components/inspector.tsx`:

```tsx
'use client';

import { NODE_KINDS } from '@keel/dsl';
import type { NodeKind } from '@keel/dsl';
import type { CSSProperties, ReactNode } from 'react';
import { removeNode, renameNode, setNodeKind } from '../document/commands.js';
import type { KeelDocument } from '../document/keel-document.js';

/**
 * 고른 것을 고치는 자리.
 *
 * **노드만 고친다.** 선과 그룹은 고를 수는 있되 읽기 전용이고, 대신 그 줄로
 * 데려다준다. 막다른 골목을 만들지 않으면서 이번 판의 범위를 안 넘는 쪽이고,
 * "텍스트가 문서다" 를 화면이 한 번 더 말하게 된다.
 *
 * 고른 것을 장면에서 들고 오지 않고 **문서에서 뽑아 온 값**을 받는다. 장면의
 * `PlacedNode` 는 이름을 고치는 순간 낡은 값이 된다.
 */
export interface InspectorTarget {
  readonly kind: 'node' | 'edge' | 'group';
  readonly id: string;
  /** 노드일 때만 */
  readonly nodeKind: NodeKind | undefined;
  /** 사람이 적은 이름. 없으면 undefined — 입력칸이 비고 id 가 흐리게 뜬다 */
  readonly rawLabel: string | undefined;
  /** 선·그룹일 때 보여 줄 한 줄 */
  readonly caption: string | undefined;
  /** 텍스트에서 이 선언이 시작하는 자리 */
  readonly position: number;
}

export function Inspector({
  target,
  document,
  onGoTo,
  onCleared,
}: {
  readonly target: InspectorTarget | undefined;
  readonly document: KeelDocument;
  readonly onGoTo: (position: number) => void;
  readonly onCleared: () => void;
}) {
  if (target === undefined) return null;

  if (target.kind !== 'node') {
    return (
      <aside style={card}>
        <p style={caption}>
          {target.caption}
          <br />
          여기서는 못 고친다. 텍스트에서 고친다.
        </p>
        <button type="button" onClick={() => onGoTo(target.position)} style={field}>
          텍스트에서 이 줄로 가기
        </button>
      </aside>
    );
  }

  return (
    <aside style={card}>
      <Row label="이름">
        <input
          value={target.rawLabel ?? ''}
          placeholder={target.id}
          onChange={(e) =>
            renameNode(
              document,
              target.id,
              e.target.value.length === 0 ? undefined : e.target.value,
            )
          }
          style={field}
        />
      </Row>

      <Row label="종류">
        <select
          value={target.nodeKind ?? 'service'}
          onChange={(e) => setNodeKind(document, target.id, e.target.value as NodeKind)}
          style={field}
        >
          {NODE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
      </Row>

      <button
        type="button"
        onClick={() => {
          removeNode(document, target.id);
          onCleared();
        }}
        style={danger}
      >
        지우기
      </button>
    </aside>
  );
}

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
      <span style={{ display: 'block', marginBottom: 4, color: 'var(--keel-muted)' }}>{label}</span>
      {children}
    </label>
  );
}

const card: CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  width: 220,
  padding: 12,
  background: 'var(--keel-surface)',
  border: '1px solid var(--keel-border)',
  borderRadius: 8,
  boxShadow: '0 4px 16px rgb(0 0 0 / 8%)',
};

const field: CSSProperties = {
  width: '100%',
  padding: '4px 6px',
  border: '1px solid var(--keel-border)',
  borderRadius: 4,
  font: 'inherit',
  background: 'var(--keel-surface)',
};

const danger: CSSProperties = { ...field, color: '#b91c1c', cursor: 'pointer' };

const caption: CSSProperties = { margin: '0 0 8px', fontSize: 12, color: 'var(--keel-muted)' };
```

- [ ] **Step 2: `page.tsx` 가 id 만 들고 문서에서 다시 찾게 한다**

`apps/web/app/page.tsx` (전체 교체):

```tsx
'use client';

import type { EditorView } from '@codemirror/view';
import type { Hit } from '@keel/renderer';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { YSyncConfig } from 'y-codemirror.next';
import { CanvasPane } from '../src/components/canvas-pane.js';
import { DiagnosticsList } from '../src/components/diagnostics.js';
import { EditorPane } from '../src/components/editor-pane.js';
import { Inspector } from '../src/components/inspector.js';
import type { InspectorTarget } from '../src/components/inspector.js';
import { parseSource } from '../src/document/derive.js';
import { createKeelDocument } from '../src/document/keel-document.js';
import { SEED } from '../src/document/seed.js';
import { useKeelDocument } from '../src/hooks/use-keel-document.js';

/**
 * 고른 것의 id.
 *
 * 노드·그룹 id 와 엣지 key 를 한 자루에 담아도 안전하다 — 파서가
 * `duplicate-id` 를 잡아 노드와 그룹 id 가 안 겹치고, 엣지 key 에는 빈칸이
 * 들어 있어(`"a b 0"`) id 와 절대 같아지지 않는다.
 */
function idOf(hit: Hit | undefined): string | undefined {
  if (hit === undefined) return undefined;
  if (hit.kind === 'node') return hit.node.id;
  if (hit.kind === 'edge') return hit.edge.key;
  return hit.group.id;
}

export default function EditorPage() {
  /**
   * `YSyncConfig` 를 넘기는 것이 핵심이다. CodeMirror 의 로컬 편집은 그 클래스의
   * 인스턴스를 origin 으로 쓰고, Yjs 는 origin 을 생성자로도 견주므로 클래스만
   * 넣어 두면 인스턴스를 손에 안 쥐어도 되돌리기에 걸린다.
   */
  const keelDocument = useMemo(() => createKeelDocument(SEED, [YSyncConfig]), []);
  useEffect(() => () => keelDocument.destroy(), [keelDocument]);

  const source = useKeelDocument(keelDocument);
  const { document: parsed } = useMemo(() => parseSource(source), [source]);

  const viewRef = useRef<EditorView | null>(null);
  const goTo = useCallback((position: number) => {
    const view = viewRef.current;
    if (view === null) return;
    view.dispatch({ selection: { anchor: position }, scrollIntoView: true });
    view.focus();
  }, []);

  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const onSelect = useCallback((hit: Hit | undefined) => setSelectedId(idOf(hit)), []);
  const clearSelection = useCallback(() => setSelectedId(undefined), []);

  const selection = useMemo(
    () => new Set<string>(selectedId === undefined ? [] : [selectedId]),
    [selectedId],
  );

  // 고른 것을 **매번 최신 문서에서 다시 찾는다.** 들고 있으면 곧 낡은 값이 된다
  const target = useMemo((): InspectorTarget | undefined => {
    if (selectedId === undefined) return undefined;

    const node = parsed.nodes.find((n) => n.id === selectedId);
    if (node !== undefined) {
      return {
        kind: 'node',
        id: node.id,
        nodeKind: node.kind,
        rawLabel: node.label,
        caption: undefined,
        position: node.span.start,
      };
    }

    const edge = parsed.edges.find((e) => e.key === selectedId);
    if (edge !== undefined) {
      return {
        kind: 'edge',
        id: edge.key,
        nodeKind: undefined,
        rawLabel: undefined,
        caption: `${edge.from} → ${edge.to}`,
        position: edge.span.start,
      };
    }

    const group = parsed.groups.find((g) => g.id === selectedId);
    if (group !== undefined) {
      return {
        kind: 'group',
        id: group.id,
        nodeKind: undefined,
        rawLabel: undefined,
        caption: `그룹 ${group.label ?? group.id}`,
        position: group.headerSpan.start,
      };
    }

    return undefined;
  }, [parsed, selectedId]);

  return (
    <main style={{ height: '100%', display: 'grid', gridTemplateColumns: '40% 1fr' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateRows: '1fr auto',
          borderRight: '1px solid var(--keel-border)',
          minHeight: 0,
        }}
      >
        <EditorPane document={keelDocument} viewRef={viewRef} />
        <div style={{ borderTop: '1px solid var(--keel-border)', maxHeight: 160, minHeight: 0 }}>
          <DiagnosticsList diagnostics={parsed.diagnostics} onGoTo={goTo} />
        </div>
      </div>

      <div style={{ position: 'relative', minWidth: 0 }}>
        <CanvasPane document={keelDocument} selection={selection} onSelect={onSelect} />
        <Inspector
          target={target}
          document={keelDocument}
          onGoTo={goTo}
          onCleared={clearSelection}
        />
      </div>
    </main>
  );
}
```

`NodeDecl.span`·`EdgeDecl.span`·`GroupDecl.headerSpan` 은 `@keel/dsl` 이 이미
내놓는 값이다 — 위치를 보존한 CST 를 둔 값이 여기서 나온다.

- [ ] **Step 3: 타입·린트·검사를 확인한다**

Run: `cd /Users/kisagge/my-projects/keel && pnpm typecheck && pnpm lint && pnpm test`
Expected: 전부 통과

- [ ] **Step 4: 눈으로 확인한다**

Run: `pnpm --filter @keel/web dev`
Expected:
- 노드를 누르면 오른쪽 위에 카드가 뜬다
- 이름을 고치면 **왼쪽 텍스트의 그 줄만** 바뀌고 주석과 줄 순서는 그대로다
- 이름을 지우면 텍스트에서 라벨이 빠지고 입력칸에 id 가 흐리게 뜬다
- 종류를 바꾸면 캔버스의 생김새가 바뀐다 (`db` 로 바꾸면 원통이 된다)
- 지우면 그 노드와 거기 걸린 선이 텍스트에서 사라지고 카드가 닫힌다
- 선을 누르면 "텍스트에서 이 줄로 가기" 가 뜨고, 누르면 왼쪽이 그 줄로 간다

- [ ] **Step 5: 커밋**

```bash
git add apps/web
git commit -F - <<'EOF'
web: 인스펙터 — 캔버스에서 이름과 종류를 고치고 지운다

노드만 고친다. 선과 그룹은 고를 수는 있되 읽기 전용이고 대신 그 줄로
데려다준다. 막다른 골목을 만들지 않으면서 이번 판의 범위를 안 넘는 쪽이고,
"텍스트가 문서다" 를 화면이 한 번 더 말하게 된다.

고른 것을 장면의 PlacedNode 로 들고 있지 않고 id 만 들고 매번 최신 문서에서
다시 찾는다. 이름을 고치면 문서가 바뀌고 장면이 다시 서므로, 들고 있던 것은
그 순간 낡은 값이 된다.

"이 줄로 가기" 가 되는 것은 dsl 이 위치를 보존한 CST 를 내놓기 때문이다.
NodeDecl.span·EdgeDecl.span·GroupDecl.headerSpan 을 그대로 쓴다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 14: Playwright 스모크 — 고리가 실제로 돈다

**Files:**
- Create: `e2e/package.json`, `e2e/playwright.config.ts`, `e2e/smoke.spec.ts`
- Create: `apps/web/src/components/test-hook.tsx`
- Modify: `pnpm-workspace.yaml`, `apps/web/src/components/canvas-pane.tsx`

**Interfaces:**
- Produces: `window.__keel.sceneSummary(): SceneSummary` — 개발/검사 빌드에서만

- [ ] **Step 1: 워크스페이스에 `e2e` 를 더한다**

`pnpm-workspace.yaml` 의 `packages:` 에 한 줄 더한다:

```yaml
packages:
  - apps/*
  - packages/*
  - e2e
```

turbo 에 `e2e` 태스크는 처음부터 있었지만 globs 가 `apps/*` 와 `packages/*` 뿐이라
돌 곳이 없었다.

- [ ] **Step 2: 검사용 창구를 만든다**

`apps/web/src/components/test-hook.tsx`:

```tsx
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

declare global {
  interface Window {
    __keel?: { sceneSummary: () => SceneSummary };
  }
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

    window.__keel = {
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
      delete window.__keel;
    };
  }, [sceneAt, viewportRef]);

  return null;
}
```

- [ ] **Step 3: 캔버스 창에 창구를 붙인다**

`apps/web/src/components/canvas-pane.tsx` 에 import 를 더한다:

```tsx
import { TestHook } from './test-hook.js';
```

그리고 `<canvas …/>` 바로 아래에 넣는다:

```tsx
      <TestHook sceneAt={sceneAt} viewportRef={viewportRef} />
```

- [ ] **Step 4: Playwright 워크스페이스를 만든다**

`e2e/package.json`:

```json
{
  "name": "@keel/e2e",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "e2e": "playwright test",
    "e2e:install": "playwright install chromium"
  },
  "devDependencies": {
    "@playwright/test": "1.63.0",
    "@types/node": "24.9.2",
    "typescript": "6.0.3"
  }
}
```

`e2e/playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

/**
 * 화면을 직접 띄워서 본다.
 *
 * React 컴포넌트에 단위 검사가 없으므로(jsdom 을 안 들인다) **고리가 실제로
 * 도는 것**만 묶는다. 더 넣으면 느려지고 잘 깨지기만 한다 — 검사할 값어치가
 * 있는 것은 이미 `src/document/` 와 `src/interaction/` 에 있다.
 */
export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'pnpm --filter @keel/web dev',
    url: 'http://localhost:3000',
    cwd: '..',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
```

- [ ] **Step 5: 스모크 셋을 쓴다**

`e2e/smoke.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

interface SceneSummaryNode {
  id: string;
  x: number;
  y: number;
  screenX: number;
  screenY: number;
}

interface SceneSummary {
  nodes: SceneSummaryNode[];
  edges: number;
  groups: string[];
}

declare global {
  interface Window {
    __keel?: { sceneSummary: () => SceneSummary };
  }
}

async function sceneSummary(page: Page): Promise<SceneSummary> {
  return page.evaluate(() => {
    const keel = window.__keel;
    if (keel === undefined) throw new Error('검사용 창구가 없다');
    return keel.sceneSummary();
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__keel !== undefined);
});

test('씨앗 문서가 캔버스에 선다', async ({ page }) => {
  const scene = await sceneSummary(page);

  expect(scene.nodes.map((n) => n.id).sort()).toEqual(
    ['api', 'events', 'orders', 'pay', 'toss', 'user', 'web'].sort(),
  );
  expect(scene.groups).toContain('payment');
  expect(scene.edges).toBe(6);
});

test('글자를 치면 캔버스가 따라 바뀐다', async ({ page }) => {
  const before = await sceneSummary(page);

  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('\nqueue newq "새 큐"');

  await expect
    .poll(async () => (await sceneSummary(page)).nodes.map((n) => n.id))
    .toContain('newq');

  expect((await sceneSummary(page)).nodes).toHaveLength(before.nodes.length + 1);
});

test('노드를 끌면 놓은 자리에 남는다', async ({ page }) => {
  const before = await sceneSummary(page);
  const node = before.nodes[0];
  if (node === undefined) throw new Error('노드가 없다');

  const box = await page.locator('canvas').boundingBox();
  if (box === null) throw new Error('캔버스가 없다');

  // 창구가 화면 좌표를 주므로 노드 한가운데를 정확히 잡을 수 있다
  const from = { x: box.x + node.screenX, y: box.y + node.screenY };

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 120, from.y + 80, { steps: 12 });
  await page.mouse.up();

  const after = await sceneSummary(page);
  const moved = after.nodes.find((n) => n.id === node.id);
  if (moved === undefined) throw new Error('노드가 사라졌다');

  // 끈 쪽으로 옮겨졌다
  expect(moved.x).toBeGreaterThan(node.x);
  expect(moved.y).toBeGreaterThan(node.y);

  // 다른 노드는 그대로다 — 끌기가 잡은 것 하나만 건드린다
  const others = after.nodes.filter((n) => n.id !== node.id);
  for (const other of others) {
    const same = before.nodes.find((n) => n.id === other.id);
    expect({ x: other.x, y: other.y }).toEqual({ x: same?.x, y: same?.y });
  }
});
```

- [ ] **Step 6: 설치하고 돌린다**

Run:
```bash
cd /Users/kisagge/my-projects/keel
pnpm install
pnpm --filter @keel/e2e e2e:install
pnpm --filter @keel/e2e e2e
```
Expected: 3 passed

- [ ] **Step 7: 검사가 실제로 무는지 확인한다**

`canvas-pane.tsx` 의 `commit-drag` 갈래에서 `moveNode(...)` 줄을 지운다 —
끌어 놓아도 문서에 안 적히게 된다.

Run: `pnpm --filter @keel/e2e e2e`
Expected: `노드를 끌면 놓은 자리에 남는다` 가 진다. 확인 후 되돌린다.

- [ ] **Step 8: 창구가 프로덕션에 안 붙는지 확인한다**

Run:
```bash
pnpm --filter @keel/web build && pnpm --filter @keel/web start
```
브라우저에서 `http://localhost:3000` 을 열고 콘솔에 `window.__keel` 을 친다.
Expected: `undefined`. 확인 후 서버를 끈다.

- [ ] **Step 9: 커밋**

```bash
git add e2e apps/web pnpm-workspace.yaml pnpm-lock.yaml
git commit -F - <<'EOF'
e2e: Playwright 스모크 — 고리가 실제로 돈다

React 컴포넌트에 단위 검사가 없다(jsdom 을 안 들인다). 검사할 값어치가 있는
것은 전부 src/document 와 src/interaction 의 순수 모듈에 있고, 남은 것은 배선이
실제로 이어졌는가뿐이다. 그래서 셋만 묶는다 — 씨앗이 선다, 글자를 치면 캔버스가
따라 바뀐다, 노드를 끌면 놓은 자리에 남는다.

캔버스는 픽셀이라 바깥에서 못 읽는다. 픽셀을 견주는 검사는 글꼴 하나만 바뀌어도
깨지고 깨졌을 때 무엇이 틀렸는지도 안 읽힌다. 그래서 화면이 장면을 숫자로
내놓는 창구를 하나 둔다 — 월드 좌표와 화면 좌표를 둘 다 준다. 화면 좌표가
없으면 노드를 정확히 잡을 방법이 없어 검사가 "아무 데나 끌어 봤다" 가 된다.

moveNode 를 빼고 끌기 검사가 지는 것을 확인했다. 창구가 프로덕션 빌드에 안
붙는 것도 확인했다.

turbo 에 e2e 태스크는 처음부터 있었지만 pnpm-workspace 의 globs 가 apps/* 와
packages/* 뿐이라 돌 곳이 없었다. e2e 를 더했다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 15: 분할 조절 · 키보드 · 맞춤 단추 · 캔버스가 없을 때

**Files:**
- Create: `apps/web/src/components/split-ratio.ts`, `apps/web/src/components/split.tsx`
- Modify: `apps/web/src/components/canvas-pane.tsx`, `apps/web/app/page.tsx`
- Create: `apps/web/test/split-ratio.test.ts`

**Interfaces:**
- Consumes: Task 4 `removeNode`, Task 10 `useCanvas` 의 `fit`
- Produces:
  - `clampRatio(value: number): number` · `loadRatio(): number` · `saveRatio(ratio: number): void`
  - `<Split left={…} right={…} />`

스펙에 적었는데 아직 없는 것들이다. 분할 비율만 순수 함수로 뽑아 검사하고,
나머지는 눈으로 확인한다.

- [ ] **Step 1: 비율 다루기의 실패하는 검사를 쓴다**

`apps/web/test/split-ratio.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_RATIO,
  MIN_RATIO,
  clampRatio,
  loadRatio,
  saveRatio,
} from '../src/components/split-ratio.js';

/** localStorage 가 없는 곳(서버·사생활 보호 창)에서도 돌아야 한다 */
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  };
}

describe('비율 물리기', () => {
  it('너무 좁거나 넓으면 물린다', () => {
    expect(clampRatio(0.01)).toBe(MIN_RATIO);
    expect(clampRatio(0.99)).toBe(MAX_RATIO);
    expect(clampRatio(0.5)).toBe(0.5);
  });

  /** 한쪽이 0 이 되면 되돌릴 손잡이가 화면에서 사라진다 */
  it('말이 안 되는 값은 기본값으로 떨어진다', () => {
    expect(clampRatio(Number.NaN)).toBe(MIN_RATIO);
    expect(clampRatio(Number.POSITIVE_INFINITY)).toBe(MAX_RATIO);
  });
});

describe('비율 저장', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage());
  });

  it('적은 것을 다시 읽는다', () => {
    saveRatio(0.6);
    expect(loadRatio()).toBeCloseTo(0.6);
  });

  it('적은 적이 없으면 기본값이다', () => {
    expect(loadRatio()).toBe(0.4);
  });

  it('망가진 값이 들어 있어도 던지지 않는다', () => {
    localStorage.setItem('keel:split', '{{{');
    expect(loadRatio()).toBe(0.4);
  });

  /**
   * 사생활 보호 창에서는 `localStorage` 를 읽는 것만으로 던진다. 문서가 아니라
   * 보는 사람의 편의이므로, 못 쓰면 조용히 기본값으로 간다.
   */
  it('localStorage 가 던져도 화면이 안 죽는다', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('막혔다');
      },
      setItem: () => {
        throw new Error('막혔다');
      },
    });

    expect(loadRatio()).toBe(0.4);
    expect(() => saveRatio(0.7)).not.toThrow();
  });
});
```

- [ ] **Step 2: 검사를 돌려 지는 것을 본다**

Run: `cd apps/web && npx vitest run test/split-ratio.test.ts`
Expected: FAIL — 모듈을 찾을 수 없다

- [ ] **Step 3: 비율 다루기를 순수 모듈로 쓴다**

`apps/web/src/components/split-ratio.ts`:

```ts
/**
 * 분할 비율을 다루는 순수한 부분.
 *
 * 컴포넌트에서 떼어 둔 이유는 이 저장소의 방식 그대로다 — **검사할 값어치가
 * 있는 것은 순수 모듈로 내린다.** 물리기와 저장은 틀리기 쉬운데(사생활 보호
 * 창에서는 `localStorage` 를 읽는 것만으로 던진다) 컴포넌트 안에 있으면
 * jsdom 없이 검사할 방법이 없다.
 *
 * 비율은 `localStorage` 에 둔다. **문서가 아니라 보는 사람의 편의**이므로
 * `Y.Doc` 에 넣지 않는다 — 넣으면 내가 창을 넓힌 것이 남의 화면을 밀어 버린다.
 */

const KEY = 'keel:split';

export const MIN_RATIO = 0.2;
export const MAX_RATIO = 0.8;
export const DEFAULT_RATIO = 0.4;

/** 한쪽이 0 이 되면 되돌릴 손잡이가 화면에서 사라진다. 그래서 양쪽을 물린다 */
export function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return value > 0 ? MAX_RATIO : MIN_RATIO;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, value));
}

/** 못 읽으면 조용히 기본값으로 간다. 문서가 아니라 편의를 위한 값이다 */
export function loadRatio(): number {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return DEFAULT_RATIO;
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? clampRatio(value) : DEFAULT_RATIO;
  } catch {
    return DEFAULT_RATIO;
  }
}

export function saveRatio(ratio: number): void {
  try {
    localStorage.setItem(KEY, String(clampRatio(ratio)));
  } catch {
    // 못 적으면 그만이다
  }
}
```

- [ ] **Step 4: 분할 컴포넌트를 쓴다**

`apps/web/src/components/split.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { DEFAULT_RATIO, clampRatio, loadRatio, saveRatio } from './split-ratio.js';

/**
 * 좌우 분할. 비율을 다루는 부분은 `split-ratio.ts` 에 있다.
 */
export function Split({ left, right }: { readonly left: ReactNode; readonly right: ReactNode }) {
  // 서버에서는 localStorage 가 없다. 첫 그리기는 기본값으로 하고 뒤에 맞춘다
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  useEffect(() => setRatio(loadRatio()), []);

  const host = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const rect = host.current?.getBoundingClientRect();
    if (rect === undefined || rect.width === 0) return;
    setRatio(clampRatio((e.clientX - rect.left) / rect.width));
  }, []);

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.currentTarget.releasePointerCapture(e.pointerId);
      dragging.current = false;
      saveRatio(ratio);
    },
    [ratio],
  );

  return (
    <div
      ref={host}
      style={{
        height: '100%',
        display: 'grid',
        gridTemplateColumns: `${ratio * 100}% 6px 1fr`,
      }}
    >
      <div style={{ minWidth: 0, minHeight: 0 }}>{left}</div>

      {/* 손잡이. 키보드로도 옮길 수 있어야 하므로 진짜 분리자로 알린다 */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={Math.round(ratio * 100)}
        aria-label="편집기와 캔버스의 너비"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setRatio((r) => clampRatio(r - 0.02));
          if (e.key === 'ArrowRight') setRatio((r) => clampRatio(r + 0.02));
        }}
        onBlur={() => saveRatio(ratio)}
        style={{
          cursor: 'col-resize',
          background: 'var(--keel-border)',
          touchAction: 'none',
        }}
      />

      <div style={{ position: 'relative', minWidth: 0, minHeight: 0 }}>{right}</div>
    </div>
  );
}
```

- [ ] **Step 5: 검사를 돌려 통과하는 것을 본다**

Run: `cd apps/web && npx vitest run test/split-ratio.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: 검사가 실제로 무는지 확인한다**

`split-ratio.ts` 의 `loadRatio` 에서 `try`/`catch` 를 걷어 낸다 → `localStorage 가 던져도 화면이 안 죽는다` 가 져야 한다.

Expected: FAIL. 확인 후 되돌린다.

- [ ] **Step 7: 맞춤 단추와 캔버스가 없을 때의 안내를 더한다**

`canvas-pane.tsx` 의 `return` 을 바꾼다:

```tsx
  const [canDraw, setCanDraw] = useState(true);

  // ...(useCanvas 아래에 둔다)
  const attach = useCallback(
    (element: HTMLCanvasElement | null) => {
      canvas.canvasRef(element);
      if (element !== null) setCanDraw(element.getContext('2d') !== null);
    },
    [canvas],
  );

  return (
    <div ref={wheelTarget} style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      <canvas
        ref={attach}
        onPointerDown={onPointerDownHandler}
        onPointerMove={onPointerMoveHandler}
        onPointerUp={onPointerUpHandler}
        onPointerCancel={onPointerUpHandler}
        style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
      />

      {/* 캔버스를 못 쓰는 브라우저. 에디터는 그대로 쓸 수 있다 */}
      {!canDraw && (
        <p
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            margin: 0,
            padding: 24,
            textAlign: 'center',
            color: 'var(--keel-muted)',
          }}
        >
          이 브라우저에서는 캔버스를 그릴 수 없다. 왼쪽 텍스트는 그대로 고칠 수 있다.
        </p>
      )}

      <button type="button" onClick={fit} style={fitButton}>
        맞춤
      </button>

      <TestHook sceneAt={sceneAt} viewportRef={viewportRef} />
    </div>
  );
}

const fitButton: CSSProperties = {
  position: 'absolute',
  right: 12,
  bottom: 12,
  padding: '6px 12px',
  border: '1px solid var(--keel-border)',
  borderRadius: 6,
  background: 'var(--keel-surface)',
  font: 'inherit',
  fontSize: 12,
  cursor: 'pointer',
};
```

`useState` 를 import 에 더한다.

- [ ] **Step 8: 키보드를 붙인다**

`page.tsx` 에 더한다:

```tsx
  /**
   * `Delete` 로 고른 노드를 지우고 `Esc` 로 선택을 푼다.
   *
   * **편집기 안에서 친 것은 건드리지 않는다.** 글자를 지우려고 누른 Delete 가
   * 노드를 지워 버리면 되돌릴 수 있어도 무섭다.
   */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const inEditor = e.target instanceof HTMLElement && e.target.closest('.cm-editor') !== null;
      const inField =
        e.target instanceof HTMLElement &&
        ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName);
      if (inEditor || inField) return;

      if (e.key === 'Escape') {
        clearSelection();
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && target?.kind === 'node') {
        e.preventDefault();
        removeNode(keelDocument, target.id);
        clearSelection();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [clearSelection, keelDocument, target]);
```

import 를 더한다: `import { removeNode } from '../src/document/commands.js';`

그리고 `<main>` 을 `<Split>` 으로 바꾼다:

```tsx
  return (
    <Split
      left={
        <div
          style={{
            height: '100%',
            display: 'grid',
            gridTemplateRows: '1fr auto',
            minHeight: 0,
          }}
        >
          <EditorPane document={keelDocument} viewRef={viewRef} />
          <div style={{ borderTop: '1px solid var(--keel-border)', maxHeight: 160, minHeight: 0 }}>
            <DiagnosticsList diagnostics={parsed.diagnostics} onGoTo={goTo} />
          </div>
        </div>
      }
      right={
        <>
          <CanvasPane document={keelDocument} selection={selection} onSelect={onSelect} />
          <Inspector
            target={target}
            document={keelDocument}
            onGoTo={goTo}
            onCleared={clearSelection}
          />
        </>
      }
    />
  );
```

`Split` 의 오른쪽 칸이 이미 `position: relative` 이므로 인스펙터가 거기 얹힌다.

- [ ] **Step 9: 타입·린트·검사를 확인한다**

Run: `cd /Users/kisagge/my-projects/keel && pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @keel/e2e e2e`
Expected: 전부 통과

- [ ] **Step 10: 눈으로 확인한다**

Run: `pnpm --filter @keel/web dev`
Expected:
- 가운데 손잡이를 끌면 좌우 너비가 바뀌고, 새로고침해도 그 너비가 남는다
- 손잡이에 탭으로 갈 수 있고 좌우 화살표로도 옮겨진다
- 노드를 고르고 `Delete` 를 누르면 지워지고, `Esc` 로 선택이 풀린다
- **편집기 안에서 `Delete` 를 눌러도 노드가 안 지워진다** (글자만 지워진다)
- 오른쪽 아래 `맞춤` 을 누르면 내용이 화면에 맞는다

- [ ] **Step 11: 커밋**

```bash
git add apps/web
git commit -F - <<'EOF'
web: 분할 조절·키보드·맞춤 단추

분할 비율은 localStorage 에 둔다. 문서가 아니라 보는 사람의 편의이므로 Y.Doc 에
넣지 않는다 — 넣으면 내가 창을 넓힌 것이 남의 화면을 밀어 버린다.

읽기도 쓰기도 던질 수 있다. 사생활 보호 창에서는 접근만으로 던지므로, 못 쓰면
조용히 기본값으로 간다. try/catch 를 걷어 검사가 지는 것을 확인했다.

양쪽 너비를 0.2~0.8 로 물린다. 한쪽이 0 이 되면 되돌릴 손잡이가 화면에서
사라진다. 손잡이는 role="separator" 에 탭으로 갈 수 있고 화살표로도 옮겨진다 —
끌기로만 되면 마우스를 못 쓰는 사람은 한쪽을 영영 못 본다.

Delete 와 Esc 는 편집기와 입력칸 안에서는 안 먹는다. 글자를 지우려고 누른
Delete 가 노드를 지워 버리면 되돌릴 수 있어도 무섭다.

캔버스를 못 얻는 브라우저에서는 그 자리에 한 줄을 띄우고 에디터는 그대로 쓴다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 16: README 갱신과 첫 문단 고치기

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 첫 문단의 어긋남을 고친다**

README 4행:

```
텍스트라 PR 에서 줄 단위로 리뷰되고, 캔버스에서 노드를 끌면 그 텍스트가 바뀌고,
```

→

```
텍스트라 PR 에서 줄 단위로 리뷰되고, 캔버스에서 고치면 그 텍스트가 바뀌고,
```

끌기는 레이아웃만 바꾼다. `위치는 텍스트에 쓰지 않는다` 와 어긋나 있었고, 화면이
생겨 실제로 끌어 보면 그 어긋남이 눈에 보인다.

- [ ] **Step 2: `지금까지 된 것` 에 앱을 더한다**

```markdown
- `@keel/web` — 좌우 분할 에디터. 텍스트↔캔버스 양방향, 팬·줌, 진단, 인스펙터,
  하나짜리 되돌리기 역사 (검사 <숫자>, e2e 3)
```

그리고 아래 한 줄 요약을 실제 숫자로 갱신한다:

```
dsl 71 · graph 16 · renderer 381 · web <숫자>
```

`<숫자>` 는 `pnpm test` 의 `@keel/web` 결과를 그대로 적는다.

- [ ] **Step 3: `아직 안 한 것` 에서 에디터 화면을 뺀다**

`- **에디터 화면** (apps/web, Next.js) …` 줄을 지운다.

`실시간` 항목에 한 줄을 더한다:

```markdown
  화면은 이미 Yjs 로 돌고 있다 — 제공자만 꽂으면 된다. 다만
  `PaintOptions.selection` 이 `Set<string>` 이라 사람별 색을 못 담으므로
  `Map<string, string>` 으로 넓히는 것이 첫 일감이다
```

- [ ] **Step 4: 검사 표에 줄을 더한다**

```markdown
| `같은 문서를 둘이 고친다` | `Y.Doc` 둘을 손으로 붙여, 통째로 다시 쓰기로 바꾸면 한쪽의 고침이 상대의 지우기 구간에 먹혀 사라지는 것을 눈으로 봤다. `edits.ts` 가 있는 이유를 서버 없이 증명한다 |
| `제스처 > 문턱` | 문턱이 없으면 고르려고 눌렀는데 1px 밀려서 노드가 움직인다. 손이 떨리는 사람에게는 노드를 고를 방법이 아예 없어진다 |
```

- [ ] **Step 5: 전체 검증**

Run:
```bash
cd /Users/kisagge/my-projects/keel
pnpm test && pnpm typecheck && pnpm lint && pnpm --filter @keel/e2e e2e
```
Expected: 전부 통과. README 에 적은 숫자가 실제 결과와 같은지 눈으로 견준다.

- [ ] **Step 6: 커밋**

```bash
git add README.md
git commit -F - <<'EOF'
README: 에디터 화면을 지금까지 된 것으로 옮긴다

첫 문단의 "캔버스에서 노드를 끌면 그 텍스트가 바뀌고" 를 고쳤다. 끌기는
레이아웃만 바꾼다 — "위치는 텍스트에 쓰지 않는다" 와 어긋나 있었고, 화면이
생겨 실제로 끌어 보면 그 어긋남이 눈에 보인다.

실시간 항목에 첫 일감을 적었다. 화면은 이미 Yjs 로 도므로 제공자만 꽂으면
되지만, PaintOptions.selection 이 Set<string> 이라 사람별 색을 못 담는다.

검사 표에 두 줄을 더했다. 특히 두 Y.Doc 을 붙여 본 검사는 통째로 다시 쓰기로
바꾸면 한쪽의 고침이 상대의 지우기 구간에 먹혀 사라지는 것을 눈으로 보여 준다 —
packages/dsl 의 구간 수정 설계가 왜 있는지를 서버 없이 증명한다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```
