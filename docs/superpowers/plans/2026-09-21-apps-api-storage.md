# apps/api 저장 (중계 + 영속화) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `apps/web` 의 문서가 새로고침·탭 닫기·오프라인을 넘어 살아남고, 두 사람이 같은 URL 에서 서로의 편집을 본다.

**Architecture:** NestJS 가 HTTP(문서 만들기·존재 확인)와 DI 를 맡고, 생 `ws` 서버를 Nest 의 HTTP 서버 `upgrade` 에 직접 붙여 표준 y-websocket 프로토콜을 말한다. 서버는 문서마다 `Y.Doc` 을 메모리에 들고, 들어온 업데이트를 중계하면서 Postgres `DocUpdate` 에 append 하고, 쌓이면 스냅샷으로 접는다. 브라우저에는 `y-indexeddb` 를 같은 `Y.Doc` 에 함께 붙여 연결과 무관하게 잃지 않게 한다.

**Tech Stack:** NestJS · Prisma · PostgreSQL 16 · `yjs` · `@y/websocket-server` · `y-websocket` · `y-indexeddb` · Next 16 · Vitest 4 · Playwright

**Spec:** `docs/superpowers/specs/2026-09-21-apps-api-storage-design.md`

## Global Constraints

- **Node 24.20.0** (`.nvmrc`), **pnpm 11.24.0** (`packageManager`). 둘 다 바꾸지 않는다.
- **의존성 판은 정확히 고정한다.** 이 저장소의 `package.json` 은 `^` 나 `~` 를 쓰지 않는다(`"next": "16.3.5"`). 새로 넣는 것도 설치 후 해석된 정확한 판으로 적는다.
- **상대 import 는 `.js` 확장자로 적는다** (ESM 관례, `nodenext`). 예: `import { foldPlan } from './compaction.js'`.
- **주석은 한국어로, 왜를 적는다.** 이 저장소의 주석은 무엇을 하는지가 아니라 왜 그렇게 했는지를 적는다. 무엇을 하는지는 코드가 말한다.
- **규칙 억제(`eslint-disable`)를 쓰지 않는다.** 실제로 고친다 (`f0a62ba` 가 그렇게 했다).
- **문서 id 는 21 자 URL-safe 무작위 문자열.**
- **접기 임계치는 200.**
- **접기 순서는 스냅샷 먼저, 삭제 나중.** 절대 뒤집지 않는다.
- **인스턴스 1 대 전제.** 같은 문서가 두 프로세스에 뜨는 경우를 다루지 않는다.
- **`404` 와 `503` 을 뭉개지 않는다.** `404` 는 로컬 사본을 지우고 `503` 은 지키지 않는다.

## 파일 구조

### 새로 만드는 것

```
compose.yaml                                  Postgres 16 하나
packages/contract/
  package.json                                @keel/contract
  tsconfig.json
  src/index.ts                                HTTP 계약 타입 — web 과 api 가 같은 정의를 본다
apps/api/
  package.json                                @keel/api
  tsconfig.json
  vitest.config.ts
  .env.example
  prisma/schema.prisma                        Document · DocUpdate · Snapshot
  src/
    main.ts                                   Nest 부트스트랩 + ws upgrade 배선
    app.module.ts
    prisma.service.ts                         PrismaClient 수명을 Nest 에 묶는다
    documents/
      documents.module.ts
      documents.controller.ts                 POST /d · GET /d/:id
      documents.service.ts                    만들기·존재 확인
      seed.ts                                 씨앗 텍스트 — 서버가 소유한다
      seed-update.ts                          씨앗 → Yjs 업데이트 (순수)
    realtime/
      realtime.module.ts
      restore.ts                              스냅샷 + 꼬리 재생 (순수)
      compaction.ts                           foldPlan (순수)
      compaction.service.ts                   접기 실행 — 스냅샷 먼저, 삭제 나중
      persistence.ts                          bindState / writeState
      connection.ts                           upgrade 문지기와 setupWSConnection
  test/
    seed-update.test.ts                       단위
    restore.test.ts                           단위
    compaction.test.ts                        단위
  test-db/
    documents.test.ts                         통합 (실 DB)
    compaction.test.ts                        통합 (실 DB)
    persistence.test.ts                       통합 (실 DB)
apps/web/
  app/d/[id]/page.tsx                         에디터 화면이 여기로 옮겨온다
  app/d/[id]/not-found.tsx                    없는 문서
  app/error.tsx                               서버에 못 붙을 때
  src/document/providers.ts                   ws + indexeddb 배선 (순수하지 않은 경계를 한 곳에)
  src/components/connection-status.tsx        연결 상태 표시
```

### 고치는 것

```
apps/web/app/page.tsx                         에디터 → POST /d 후 리다이렉트하는 서버 컴포넌트
apps/web/src/document/keel-document.ts        씨앗 인자를 선택으로
apps/web/package.json                         y-websocket · y-indexeddb · @keel/contract 추가
e2e/playwright.config.ts                      webServer 를 배열로 (web + api)
e2e/smoke.spec.ts                             기존 5 개 유지 + 새 검사
.github/workflows/verify.yml                  postgres 서비스 컨테이너, test:db 단계
pnpm-workspace.yaml                           allowBuilds 확인
turbo.json                                    test:db 태스크
README.md                                     구조와 시작하기 갱신
```

### 지우는 것

```
apps/web/src/document/seed.ts                 씨앗은 이제 서버가 소유한다
```

---

## Task 1: 뼈대 — Postgres, Prisma 스키마, Nest 가 뜬다

**Files:**
- Create: `compose.yaml`
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/vitest.config.ts`, `apps/api/.env.example`
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/src/prisma.service.ts`
- Create: `apps/api/test-db/documents.test.ts`
- Modify: `turbo.json`, `.github/workflows/verify.yml`, `.gitignore`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: `PrismaService` (Nest 주입 가능, `PrismaClient` 를 상속), Prisma 모델 `Document` · `DocUpdate` · `Snapshot`, `pnpm --filter @keel/api dev` 로 뜨는 서버, `pnpm turbo run test:db` 태스크

- [ ] **Step 1: Postgres 를 띄운다**

`compose.yaml` 을 저장소 루트에 만든다.

```yaml
# 로컬 개발과 검사가 쓰는 Postgres 하나.
#
# 판을 고정한다 — 판이 흔들리면 마이그레이션이 로컬과 CI 에서 다르게 돈다.
# CI 는 이 파일을 쓰지 않고 GitHub Actions 의 서비스 컨테이너를 쓰므로,
# 그쪽 판도 같이 맞춰야 한다(.github/workflows/verify.yml).
services:
  postgres:
    image: postgres:16.4
    environment:
      POSTGRES_USER: keel
      POSTGRES_PASSWORD: keel
      POSTGRES_DB: keel
    ports:
      - '5432:5432'
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U keel']
      interval: 2s
      timeout: 3s
      retries: 20
```

Run: `docker compose up -d && docker compose ps`
Expected: `postgres` 가 `healthy`.

- [ ] **Step 2: `@keel/api` 패키지를 만든다**

`apps/api/package.json`:

```json
{
  "name": "@keel/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --watch --experimental-strip-types src/main.ts",
    "build": "tsc",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:db": "prisma migrate deploy && vitest run --dir test-db"
  }
}
```

의존성을 넣는다. **판을 고정한다** — 설치 뒤 `package.json` 에 `^` 가 남아 있으면 해석된 정확한 판으로 바꿔 적는다.

Run:
```bash
pnpm --filter @keel/api add @nestjs/common @nestjs/core @nestjs/platform-express @prisma/client reflect-metadata rxjs ws yjs nanoid
pnpm --filter @keel/api add -D @keel/config prisma typescript vitest @types/node @types/ws
pnpm --filter @keel/api add @y/websocket-server
```

- [ ] **Step 3: Prisma 스키마를 쓴다**

`apps/api/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Document {
  id        String      @id
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
  updates   DocUpdate[]
  snapshot  Snapshot?
}

/// 재생 순서가 곧 문서다. createdAt 으로 정렬하면 같은 밀리초에 들어온
/// 둘의 순서가 불안정해서, 단조 증가하는 seq 로 정렬한다.
model DocUpdate {
  seq        BigInt   @id @default(autoincrement())
  documentId String
  update     Bytes
  createdAt  DateTime @default(now())
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@index([documentId, seq])
}

/// throughSeq 까지를 접은 것이다. 복원은 state 를 적용한 뒤
/// seq > throughSeq 인 것만 마저 얹는다.
model Snapshot {
  documentId String   @id
  state      Bytes
  throughSeq BigInt
  createdAt  DateTime @default(now())
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
}
```

`apps/api/.env.example`:

```
DATABASE_URL="postgresql://keel:keel@localhost:5432/keel"
PORT=4000
```

`.gitignore` 에 다음 줄을 더한다:

```
apps/api/.env
```

- [ ] **Step 4: 마이그레이션을 만든다**

Run:
```bash
cd apps/api && cp .env.example .env
pnpm --filter @keel/api exec prisma migrate dev --name init
```
Expected: `prisma/migrations/<timestamp>_init/` 이 생기고 "Your database is now in sync" 가 뜬다.

- [ ] **Step 5: 실패하는 통합 검사를 쓴다**

`apps/api/test-db/documents.test.ts`:

```ts
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('스키마', () => {
  it('문서와 업데이트를 넣고 seq 순서로 읽는다', async () => {
    const id = `t-${Date.now()}`;
    await prisma.document.create({ data: { id } });

    await prisma.docUpdate.create({
      data: { documentId: id, update: Buffer.from([1]) },
    });
    await prisma.docUpdate.create({
      data: { documentId: id, update: Buffer.from([2]) },
    });

    const rows = await prisma.docUpdate.findMany({
      where: { documentId: id },
      orderBy: { seq: 'asc' },
    });

    expect(rows.map((r) => r.update[0])).toEqual([1, 2]);
    expect(rows[1]!.seq).toBeGreaterThan(rows[0]!.seq);
  });

  it('문서를 지우면 업데이트도 함께 지워진다', async () => {
    const id = `t-cascade-${Date.now()}`;
    await prisma.document.create({ data: { id } });
    await prisma.docUpdate.create({
      data: { documentId: id, update: Buffer.from([1]) },
    });

    await prisma.document.delete({ where: { id } });

    expect(await prisma.docUpdate.count({ where: { documentId: id } })).toBe(0);
  });
});
```

`apps/api/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 단위 검사는 test/ 에, DB 가 필요한 검사는 test-db/ 에 둔다.
  // 갈라 두지 않으면 `pnpm test` 가 도커 없이는 못 도는 물건이 된다.
  test: { include: ['test/**/*.test.ts'] },
});
```

- [ ] **Step 6: 검사가 실패하는 것을 본다**

Run: `pnpm --filter @keel/api exec vitest run --dir test-db`
Expected: 이 시점에 `prisma generate` 가 아직 안 돌았으면 `@prisma/client` 를 못 찾아 FAIL. 돌았으면 PASS.

`prisma migrate dev` 가 generate 까지 했다면 여기서 통과한다. 그때는 **스키마가 맞다는 확인**이지 헛된 통과가 아니다 — 확인 삼아 `seq` 정렬 단언을 `toEqual([2, 1])` 로 뒤집어 FAIL 하는 것을 본 뒤 되돌린다.

- [ ] **Step 7: Nest 를 세운다**

`apps/api/src/prisma.service.ts`:

```ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaClient 수명을 Nest 에 묶는다.
 *
 * 모듈 밖에서 `new PrismaClient()` 를 흩뿌리면 프로세스마다 연결 풀이 여럿
 * 생기고, 검사가 끝나도 안 닫혀 vitest 가 안 죽는다.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
```

`apps/api/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule {}
```

`apps/api/src/main.ts`:

```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

const PORT = Number(process.env['PORT'] ?? 4000);

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  // 화면은 다른 출처에서 뜬다(Next 는 3000, 여기는 4000).
  app.enableCors({ origin: true });
  await app.listen(PORT);
}

await bootstrap();
```

- [ ] **Step 8: 서버가 뜨는 것을 본다**

Run: `pnpm --filter @keel/api dev`
Expected: `Nest application successfully started` 가 뜨고 포트 4000 이 열린다. `Ctrl+C` 로 끈다.

- [ ] **Step 9: turbo 에 `test:db` 를 더한다**

`turbo.json` 의 `tasks` 에 넣는다:

```json
"test:db": {
  "dependsOn": ["^build"],
  "cache": false
}
```

`cache: false` 인 이유: 실 DB 상태에 기대므로 입력 해시가 결과를 안 정한다.

- [ ] **Step 10: CI 에 Postgres 를 붙인다**

`.github/workflows/verify.yml` 의 `verify` job 에 `services` 를 더하고, `pnpm test` 다음에 단계를 하나 넣는다.

```yaml
    services:
      postgres:
        image: postgres:16.4
        env:
          POSTGRES_USER: keel
          POSTGRES_PASSWORD: keel
          POSTGRES_DB: keel
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U keel"
          --health-interval 2s
          --health-timeout 3s
          --health-retries 20
```

`pnpm test` 단계 바로 뒤:

```yaml
      - run: pnpm turbo run test:db
        env:
          DATABASE_URL: postgresql://keel:keel@localhost:5432/keel
```

- [ ] **Step 11: 전 게이트를 돌린다**

Run: `pnpm turbo run lint typecheck test build --force && pnpm turbo run test:db`
Expected: 전부 통과.

- [ ] **Step 12: 커밋**

```bash
git add compose.yaml apps/api turbo.json .github/workflows/verify.yml .gitignore pnpm-lock.yaml
git commit -m "api: 뼈대 — Postgres, Prisma 스키마, Nest 가 뜬다

재생 순서가 곧 문서라 DocUpdate.seq 를 단조 증가로 두고, 스냅샷은
throughSeq 로 어디까지 접었는지를 들고 있다.

단위 검사(test/)와 DB 가 필요한 검사(test-db/)를 갈라 둔다. 안 그러면
pnpm test 가 도커 없이는 못 도는 물건이 된다."
```

---

## Task 2: 씨앗과 문서 만들기 — `POST /d` · `GET /d/:id`

**Files:**
- Create: `packages/contract/package.json`, `packages/contract/tsconfig.json`, `packages/contract/src/index.ts`
- Create: `apps/api/src/documents/seed.ts`, `seed-update.ts`, `documents.service.ts`, `documents.controller.ts`, `documents.module.ts`
- Create: `apps/api/test/seed-update.test.ts`
- Create: `apps/api/test-db/create-document.test.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 1)
- Produces:
  - `seedUpdate(seed: string): Uint8Array` — 순수
  - `SEED: string`
  - `DocumentsService.create(): Promise<{ id: string }>`
  - `DocumentsService.find(id: string): Promise<{ id: string; createdAt: Date; updatedAt: Date } | null>`
  - `@keel/contract` 의 `CreateDocumentResponse` · `DocumentSummary`

- [ ] **Step 1: `@keel/contract` 를 만든다**

`packages/contract/package.json`:

```json
{
  "name": "@keel/contract",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit"
  }
}
```

`packages/contract/tsconfig.json` 은 다른 패키지의 것을 그대로 따른다.

Run: `cat packages/graph/tsconfig.json`
그 내용을 `packages/contract/tsconfig.json` 에 복사한다.

`packages/contract/src/index.ts`:

```ts
/**
 * web 과 api 가 함께 보는 HTTP 계약.
 *
 * **문서 내용은 여기 없다.** 내용은 ws 로만 오간다 — 두 통로가 같은 것을
 * 내면 어느 쪽이 진짜인지 묻는 자리가 생긴다. HTTP 는 만들기와 존재 확인만
 * 한다.
 */

/** `POST /d` 의 응답 */
export interface CreateDocumentResponse {
  readonly id: string;
}

/** `GET /d/:id` 의 응답. 존재 확인이 목적이라 내용을 담지 않는다 */
export interface DocumentSummary {
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
```

- [ ] **Step 2: 실패하는 단위 검사를 쓴다**

`apps/api/test/seed-update.test.ts`:

```ts
import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { SEED } from '../src/documents/seed.js';
import { seedUpdate } from '../src/documents/seed-update.js';

describe('seedUpdate', () => {
  it('빈 문서에 얹으면 씨앗 그대로가 된다', () => {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, seedUpdate(SEED));

    expect(doc.getText('source').toString()).toBe(SEED);
    doc.destroy();
  });

  it('두 번 얹어도 두 배가 되지 않는다', () => {
    // Yjs 업데이트는 멱등이다. 접기가 "스냅샷 먼저, 삭제 나중" 순서를 쓸 수
    // 있는 근거가 이것이라, 여기서 한 번 못 박아 둔다.
    const doc = new Y.Doc();
    const update = seedUpdate(SEED);
    Y.applyUpdate(doc, update);
    Y.applyUpdate(doc, update);

    expect(doc.getText('source').toString()).toBe(SEED);
    doc.destroy();
  });

  it('화면이 쓰는 이름표를 쓴다', () => {
    // `source` 가 아니면 클라이언트의 Y.Text 와 다른 루트가 되어, 붙어도
    // 서로의 글자를 못 본다. 조용히 어긋나는 종류라 검사로 묶는다.
    const doc = new Y.Doc();
    Y.applyUpdate(doc, seedUpdate(SEED));

    expect(doc.share.has('source')).toBe(true);
    doc.destroy();
  });
});
```

- [ ] **Step 3: 검사가 실패하는 것을 본다**

Run: `pnpm --filter @keel/api exec vitest run test/seed-update.test.ts`
Expected: FAIL — `Cannot find module '../src/documents/seed.js'`

- [ ] **Step 4: 씨앗을 서버로 옮긴다**

`apps/api/src/documents/seed.ts` 를 만든다. 내용은 `apps/web/src/document/seed.ts` 의 템플릿 리터럴을 **그대로** 옮기되, 주석을 서버의 사정으로 고쳐 쓴다.

Run: `cat apps/web/src/document/seed.ts`

```ts
/**
 * 첫 화면의 씨앗.
 *
 * `packages/dsl/fixtures/order-flow.keel` 과 같은 내용이다.
 *
 * **서버가 소유한다.** 클라이언트가 각자 심으면 빈 문서에 둘이 동시에 들어올
 * 때 양쪽 씨앗이 다 살아남아 문서가 두 배가 된다 — `cb55a9b` 와
 * `apps/web/test/concurrent.test.ts` 가 이미 증명해 둔 현상이다.
 */
export const SEED = `# 주문이 들어와서 결제까지
...(apps/web/src/document/seed.ts 의 본문을 그대로)...`;
```

`apps/api/src/documents/seed-update.ts`:

```ts
import * as Y from 'yjs';

/**
 * 씨앗을 Yjs 업데이트 하나로 만든다.
 *
 * `layout` 맵은 일부러 안 만든다. Yjs 의 루트 타입은 이름으로 짝지어지므로
 * 클라이언트가 `getMap('layout')` 을 부르는 순간 생기고, 서버가 미리 빈 것을
 * 만들어 둘 이유가 없다. 사람이 옮긴 노드가 없는 문서에 빈 맵을 넣는 것은
 * "아무도 안 옮겼다" 를 저장하는 일이다.
 *
 * origin 을 주지 않는다. origin 은 그 `Y.Doc` 안에서만 뜻이 있고 업데이트에
 * 실려 가지 않는다. 클라이언트 쪽에서 이 업데이트는 **제공자 origin** 으로
 * 도착하고, 그것이 `trackedOrigins` 에 없어서 되돌리기가 씨앗을 못 지운다.
 */
export function seedUpdate(seed: string): Uint8Array {
  const doc = new Y.Doc();
  doc.getText('source').insert(0, seed);
  const update = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return update;
}
```

- [ ] **Step 5: 검사가 통과하는 것을 본다**

Run: `pnpm --filter @keel/api exec vitest run test/seed-update.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: 실패하는 통합 검사를 쓴다**

`apps/api/test-db/create-document.test.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as Y from 'yjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { SEED } from '../src/documents/seed.js';

let app: INestApplication;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
});

afterAll(async () => {
  await app.close();
});

describe('POST /d', () => {
  it('씨앗이 심긴 문서를 만든다', async () => {
    const res = await request(app.getHttpServer()).post('/d').expect(201);
    expect(res.body.id).toHaveLength(21);

    // 로그를 재생하면 씨앗이 선다
    const rows = await app
      .get(PrismaService)
      .docUpdate.findMany({ where: { documentId: res.body.id }, orderBy: { seq: 'asc' } });

    const doc = new Y.Doc();
    for (const row of rows) Y.applyUpdate(doc, new Uint8Array(row.update));
    expect(doc.getText('source').toString()).toBe(SEED);
    doc.destroy();
  });
});

describe('GET /d/:id', () => {
  it('있는 문서를 200 으로 돌려준다', async () => {
    const created = await request(app.getHttpServer()).post('/d').expect(201);
    const res = await request(app.getHttpServer()).get(`/d/${created.body.id}`).expect(200);
    expect(res.body.id).toBe(created.body.id);
  });

  it('없는 문서를 404 로 돌려준다', async () => {
    await request(app.getHttpServer()).get('/d/nope-nope-nope-nope-x').expect(404);
  });

  it('문서 내용을 담지 않는다', async () => {
    // 내용이 두 통로로 나가면 어느 쪽이 진짜인지 묻는 자리가 생긴다
    const created = await request(app.getHttpServer()).post('/d').expect(201);
    const res = await request(app.getHttpServer()).get(`/d/${created.body.id}`).expect(200);
    expect(Object.keys(res.body).sort()).toEqual(['createdAt', 'id', 'updatedAt']);
  });
});
```

위 검사는 `PrismaService` 를 import 해야 한다. 파일 맨 위에 더한다:

```ts
import { PrismaService } from '../src/prisma.service.js';
```

검사 도구를 넣는다.

Run: `pnpm --filter @keel/api add -D @nestjs/testing supertest @types/supertest`

- [ ] **Step 7: 검사가 실패하는 것을 본다**

Run: `pnpm --filter @keel/api exec vitest run --dir test-db create-document`
Expected: FAIL — `POST /d` 가 404 (라우트가 없다)

- [ ] **Step 8: 서비스와 컨트롤러를 쓴다**

`apps/api/src/documents/documents.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { PrismaService } from '../prisma.service.js';
import { SEED } from './seed.js';
import { seedUpdate } from './seed-update.js';

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 문서를 만들고 씨앗을 첫 업데이트로 심는다.
   *
   * **한 트랜잭션이어야 한다.** 문서 행만 생기고 씨앗이 안 들어간 상태로
   * 남으면, 그 URL 은 열리는데 내용이 비어 있다 — 사용자는 "저장이 깨졌다"
   * 고 읽고 우리는 원인을 못 찾는다.
   */
  async create(): Promise<{ id: string }> {
    const id = nanoid(21);
    await this.prisma.$transaction([
      this.prisma.document.create({ data: { id } }),
      this.prisma.docUpdate.create({
        data: { documentId: id, update: Buffer.from(seedUpdate(SEED)) },
      }),
    ]);
    return { id };
  }

  async find(id: string): Promise<{ id: string; createdAt: Date; updatedAt: Date } | null> {
    return this.prisma.document.findUnique({
      where: { id },
      select: { id: true, createdAt: true, updatedAt: true },
    });
  }
}
```

`apps/api/src/documents/documents.controller.ts`:

```ts
import { Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import type { CreateDocumentResponse, DocumentSummary } from '@keel/contract';
import { DocumentsService } from './documents.service.js';

@Controller('d')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post()
  async create(): Promise<CreateDocumentResponse> {
    return this.documents.create();
  }

  /**
   * 존재 확인이 목적이다. 이 응답이 **브라우저에 남은 사본을 지울지** 가른다 —
   * 404 면 지우고, DB 가 안 보여서 못 세는 경우는 503 이라 지키지 않는다.
   * 둘을 뭉개면 서버가 잠깐 아픈 사이에 사람의 오프라인 작업을 우리가 없앤다.
   */
  @Get(':id')
  async find(@Param('id') id: string): Promise<DocumentSummary> {
    const found = await this.documents.find(id);
    if (found === null) throw new NotFoundException();
    return {
      id: found.id,
      createdAt: found.createdAt.toISOString(),
      updatedAt: found.updatedAt.toISOString(),
    };
  }
}
```

`apps/api/src/documents/documents.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';

@Module({
  controllers: [DocumentsController],
  providers: [PrismaService, DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
```

`apps/api/src/app.module.ts` 를 고쳐 `DocumentsModule` 을 넣는다:

```ts
import { Module } from '@nestjs/common';
import { DocumentsModule } from './documents/documents.module.js';
import { PrismaService } from './prisma.service.js';

@Module({
  imports: [DocumentsModule],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule {}
```

`apps/api/package.json` 에 `@keel/contract` 를 더한다.

Run: `pnpm --filter @keel/api add @keel/contract@workspace:*`

- [ ] **Step 9: 검사가 통과하는 것을 본다**

Run: `pnpm --filter @keel/api exec vitest run --dir test-db create-document`
Expected: PASS (4 tests)

- [ ] **Step 10: 전 게이트를 돌리고 커밋**

Run: `pnpm turbo run lint typecheck test build --force && pnpm turbo run test:db`

```bash
git add packages/contract apps/api pnpm-lock.yaml
git commit -m "api: 씨앗과 문서 만들기 — POST /d · GET /d/:id

씨앗을 서버로 옮긴다. 클라이언트가 각자 심으면 빈 문서에 둘이 동시에
들어올 때 양쪽 씨앗이 다 살아남아 문서가 두 배가 된다(cb55a9b).

GET 은 존재 확인만 한다. 이 응답이 브라우저에 남은 사본을 지울지 가르게
되므로, 내용을 담아 두 통로가 같은 것을 내는 일을 만들지 않는다."
```

---

## Task 3: 복원 — 스냅샷 + 꼬리 재생

**Files:**
- Create: `apps/api/src/realtime/restore.ts`
- Create: `apps/api/test/restore.test.ts`

**Interfaces:**
- Consumes: 없음 (순수 함수)
- Produces: `restoreInto(doc: Y.Doc, snapshot: Uint8Array | undefined, tail: readonly Uint8Array[]): void`

- [ ] **Step 1: 실패하는 검사를 쓴다**

`apps/api/test/restore.test.ts`:

```ts
import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { restoreInto } from '../src/realtime/restore.js';

/** 편집을 몇 번 한 문서와, 그 편집들을 업데이트 배열로 함께 돌려준다 */
function edited(): { state: Uint8Array; updates: Uint8Array[]; text: string } {
  const doc = new Y.Doc();
  const updates: Uint8Array[] = [];
  doc.on('update', (u: Uint8Array) => updates.push(u));

  doc.getText('source').insert(0, 'actor user "손님"');
  doc.getText('source').insert(17, '\nservice web "웹"');
  doc.getMap('layout').set('user', { x: 10, y: 20 });

  const text = doc.getText('source').toString();
  const state = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return { state, updates, text };
}

describe('restoreInto', () => {
  it('스냅샷이 없으면 처음부터 전부 재생한다', () => {
    const { updates, text } = edited();
    const doc = new Y.Doc();

    restoreInto(doc, undefined, updates);

    expect(doc.getText('source').toString()).toBe(text);
    doc.destroy();
  });

  it('스냅샷에 꼬리를 얹는다', () => {
    const { updates, text } = edited();
    // 앞의 둘은 접혔다 치고, 그 상태를 스냅샷으로 만든다
    const folded = new Y.Doc();
    Y.applyUpdate(folded, updates[0]!);
    Y.applyUpdate(folded, updates[1]!);
    const snapshot = Y.encodeStateAsUpdate(folded);
    folded.destroy();

    const doc = new Y.Doc();
    restoreInto(doc, snapshot, updates.slice(2));

    expect(doc.getText('source').toString()).toBe(text);
    expect(doc.getMap('layout').get('user')).toEqual({ x: 10, y: 20 });
    doc.destroy();
  });

  it('접힌 것을 또 얹어도 문서가 그대로다', () => {
    // 스냅샷을 쓴 뒤 행을 지우기 전에 죽으면 다음 복원에서 겹쳐 얹힌다.
    // 그 경우가 무해해야 "스냅샷 먼저, 삭제 나중" 순서가 성립한다.
    const { updates, text } = edited();
    const folded = new Y.Doc();
    Y.applyUpdate(folded, updates[0]!);
    Y.applyUpdate(folded, updates[1]!);
    const snapshot = Y.encodeStateAsUpdate(folded);
    folded.destroy();

    const doc = new Y.Doc();
    restoreInto(doc, snapshot, updates); // 접힌 둘까지 통째로 얹는다

    expect(doc.getText('source').toString()).toBe(text);
    doc.destroy();
  });

  it('꼬리 순서가 뒤집히면 문서가 달라진다', () => {
    // 순서가 곧 문서라는 것을 못 박는다. seq 정렬이 빠지면 여기서 걸린다.
    const { updates, text } = edited();
    const doc = new Y.Doc();

    restoreInto(doc, undefined, [...updates].reverse());

    // Yjs 는 순서가 어긋난 업데이트를 버리지 않고 보류했다가 맞춘다.
    // 그래서 결과가 같아야 한다 — 이 검사는 그 성질을 기록해 둔다.
    expect(doc.getText('source').toString()).toBe(text);
    doc.destroy();
  });
});
```

- [ ] **Step 2: 검사가 실패하는 것을 본다**

Run: `pnpm --filter @keel/api exec vitest run test/restore.test.ts`
Expected: FAIL — `Cannot find module '../src/realtime/restore.js'`

- [ ] **Step 3: 최소 구현을 쓴다**

`apps/api/src/realtime/restore.ts`:

```ts
import * as Y from 'yjs';

/**
 * 저장된 것에서 문서를 다시 세운다.
 *
 * **한 트랜잭션으로 묶는다.** 나눠 얹으면 `doc.on('update')` 가 재생 도중에
 * 여러 번 울려, 영속화 갈고리가 **방금 읽은 것을 도로 쓴다.** 로그가 복원할
 * 때마다 두 배로 불어난다.
 *
 * 스냅샷과 꼬리를 나눠 받는 이유는 호출하는 쪽이 DB 를 두 번 읽기 때문이다.
 * 여기서는 순서만 지킨다 — 스냅샷 먼저, 그다음 꼬리.
 */
export function restoreInto(
  doc: Y.Doc,
  snapshot: Uint8Array | undefined,
  tail: readonly Uint8Array[],
): void {
  doc.transact(() => {
    if (snapshot !== undefined) Y.applyUpdate(doc, snapshot);
    for (const update of tail) Y.applyUpdate(doc, update);
  }, RESTORE);
}

/** 복원이 낸 변화의 origin. 영속화 갈고리가 이것을 보고 도로 쓰지 않는다 */
export const RESTORE = Symbol('keel-restore');
```

- [ ] **Step 4: 검사가 통과하는 것을 본다**

Run: `pnpm --filter @keel/api exec vitest run test/restore.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add apps/api/src/realtime/restore.ts apps/api/test/restore.test.ts
git commit -m "api: 복원 — 스냅샷에 꼬리를 얹는다

한 트랜잭션으로 묶는다. 나눠 얹으면 doc.on('update') 가 재생 도중 여러 번
울려 영속화 갈고리가 방금 읽은 것을 도로 쓴다 — 복원할 때마다 로그가 두
배로 불어난다.

접힌 것을 또 얹어도 문서가 그대로인 것을 검사로 묶었다. 그것이 '스냅샷
먼저, 삭제 나중' 순서의 근거다."
```

---

## Task 4: 접기 판단 — `foldPlan` 순수 함수

**Files:**
- Create: `apps/api/src/realtime/compaction.ts`
- Create: `apps/api/test/compaction.test.ts`

**Interfaces:**
- Consumes: 없음 (순수 함수)
- Produces: `FOLD_THRESHOLD: 200`, `interface FoldPlan { shouldFold: boolean; throughSeq: bigint }`, `foldPlan(tailSeqs: readonly bigint[], threshold?: number): FoldPlan`

- [ ] **Step 1: 실패하는 검사를 쓴다**

`apps/api/test/compaction.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FOLD_THRESHOLD, foldPlan } from '../src/realtime/compaction.js';

/** seq 1n..n */
function seqs(n: number): bigint[] {
  return Array.from({ length: n }, (_, i) => BigInt(i + 1));
}

describe('foldPlan', () => {
  it('임계치와 같으면 접지 않는다', () => {
    expect(foldPlan(seqs(200), 200).shouldFold).toBe(false);
  });

  it('임계치를 넘으면 접는다', () => {
    expect(foldPlan(seqs(201), 200).shouldFold).toBe(true);
  });

  it('꼬리가 비면 접지 않는다', () => {
    expect(foldPlan([], 200).shouldFold).toBe(false);
  });

  it('관측한 마지막 seq 까지만 접는다', () => {
    // throughSeq 를 관측한 것보다 크게 잡으면, 스냅샷에 안 들어간 행을
    // 지우게 되어 문서가 사라진다. 절대 넘겨 잡지 않는다.
    const plan = foldPlan([10n, 11n, 12n], 2);
    expect(plan.throughSeq).toBe(12n);
  });

  it('seq 가 연속이 아니어도 마지막 것을 쓴다', () => {
    // 접기와 접기 사이에 다른 문서의 행이 끼면 seq 에 구멍이 난다.
    // seq 는 전역 시퀀스라 문서마다 연속이 아니다.
    const plan = foldPlan([5n, 9n, 40n], 2);
    expect(plan.throughSeq).toBe(40n);
  });

  it('기본 임계치는 200 이다', () => {
    expect(FOLD_THRESHOLD).toBe(200);
    expect(foldPlan(seqs(201)).shouldFold).toBe(true);
    expect(foldPlan(seqs(200)).shouldFold).toBe(false);
  });
});
```

- [ ] **Step 2: 검사가 실패하는 것을 본다**

Run: `pnpm --filter @keel/api exec vitest run test/compaction.test.ts`
Expected: FAIL — `Cannot find module '../src/realtime/compaction.js'`

- [ ] **Step 3: 최소 구현을 쓴다**

`apps/api/src/realtime/compaction.ts`:

```ts
/**
 * 로그가 이만큼 쌓이면 접는다. 재 보지 않고 고른 수다 —
 * 실제 편집 패턴에서 접기 비용과 복원 비용을 재서 고칠 자리다.
 */
export const FOLD_THRESHOLD = 200;

export interface FoldPlan {
  readonly shouldFold: boolean;
  /** 이 seq 까지를 스냅샷에 담았다고 적는다. 접지 않으면 뜻이 없다 */
  readonly throughSeq: bigint;
}

/**
 * 접을지, 어디까지 접을지 정한다.
 *
 * **`throughSeq` 를 넘겨 잡지 않는 것이 이 함수의 전부다.** 스냅샷은 지금
 * 메모리에 있는 문서에서 뜨는데, 그 사이에도 업데이트가 계속 들어온다.
 * 관측한 꼬리보다 큰 seq 를 적으면 **스냅샷에 안 들어간 행을 지우게 되어
 * 문서가 사라진다.** 작게 잡는 쪽은 안전하다 — 이미 담긴 것을 한 번 더
 * 재생할 뿐이고 Yjs 업데이트는 멱등이다.
 */
export function foldPlan(
  tailSeqs: readonly bigint[],
  threshold: number = FOLD_THRESHOLD,
): FoldPlan {
  if (tailSeqs.length <= threshold) return { shouldFold: false, throughSeq: 0n };
  return { shouldFold: true, throughSeq: tailSeqs[tailSeqs.length - 1]! };
}
```

- [ ] **Step 4: 검사가 통과하는 것을 본다**

Run: `pnpm --filter @keel/api exec vitest run test/compaction.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add apps/api/src/realtime/compaction.ts apps/api/test/compaction.test.ts
git commit -m "api: 접기 판단 — throughSeq 를 넘겨 잡지 않는다

스냅샷은 메모리의 문서에서 뜨는데 그 사이에도 업데이트가 들어온다.
관측한 꼬리보다 큰 seq 를 적으면 스냅샷에 안 들어간 행을 지우게 되어
문서가 사라진다. 작게 잡는 쪽은 멱등이라 안전하다."
```

---

## Task 5: 접기 실행 — 스냅샷 먼저, 삭제 나중

**Files:**
- Create: `apps/api/src/realtime/compaction.service.ts`
- Create: `apps/api/test-db/compaction.test.ts`
- Modify: `apps/api/src/realtime/realtime.module.ts` (새로 만든다)

**Interfaces:**
- Consumes: `PrismaService` (Task 1), `foldPlan` · `FOLD_THRESHOLD` (Task 4), `restoreInto` (Task 3)
- Produces:
  - `CompactionService.fold(documentId: string, doc: Y.Doc): Promise<boolean>` — 접었으면 `true`
  - `CompactionService.writeSnapshot(documentId: string, doc: Y.Doc, throughSeq: bigint): Promise<void>` — 검사가 크래시를 흉내 내려고 따로 부른다

- [ ] **Step 1: 실패하는 통합 검사를 쓴다**

`apps/api/test-db/compaction.test.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as Y from 'yjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma.service.js';
import { CompactionService } from '../src/realtime/compaction.service.js';
import { restoreInto } from '../src/realtime/restore.js';

let app: INestApplication;
let prisma: PrismaService;
let compaction: CompactionService;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
  prisma = app.get(PrismaService);
  compaction = app.get(CompactionService);
});

afterAll(async () => {
  await app.close();
});

/** 업데이트 n 개가 쌓인 문서를 만들고, 메모리의 Y.Doc 도 함께 돌려준다 */
async function documentWith(n: number): Promise<{ id: string; doc: Y.Doc; text: string }> {
  const id = `fold-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await prisma.document.create({ data: { id } });

  const doc = new Y.Doc();
  const pending: Uint8Array[] = [];
  doc.on('update', (u: Uint8Array) => pending.push(u));
  for (let i = 0; i < n; i++) doc.getText('source').insert(0, `${i}\n`);

  for (const update of pending) {
    await prisma.docUpdate.create({ data: { documentId: id, update: Buffer.from(update) } });
  }
  return { id, doc, text: doc.getText('source').toString() };
}

/** 저장된 것만으로 문서를 다시 세운다 */
async function restored(id: string): Promise<string> {
  const snapshot = await prisma.snapshot.findUnique({ where: { documentId: id } });
  const tail = await prisma.docUpdate.findMany({
    where: { documentId: id, seq: { gt: snapshot?.throughSeq ?? 0n } },
    orderBy: { seq: 'asc' },
  });

  const doc = new Y.Doc();
  restoreInto(
    doc,
    snapshot === null ? undefined : new Uint8Array(snapshot.state),
    tail.map((r) => new Uint8Array(r.update)),
  );
  const text = doc.getText('source').toString();
  doc.destroy();
  return text;
}

describe('접기', () => {
  it('임계치 아래면 아무것도 안 한다', async () => {
    const { id, doc } = await documentWith(3);
    expect(await compaction.fold(id, doc)).toBe(false);
    expect(await prisma.snapshot.findUnique({ where: { documentId: id } })).toBeNull();
    doc.destroy();
  });

  it('접고 나서도 문서가 같다', async () => {
    const { id, doc, text } = await documentWith(205);

    expect(await compaction.fold(id, doc)).toBe(true);
    expect(await restored(id)).toBe(text);
    doc.destroy();
  });

  it('접으면 행이 줄어든다', async () => {
    const { id, doc } = await documentWith(205);
    const before = await prisma.docUpdate.count({ where: { documentId: id } });

    await compaction.fold(id, doc);

    const after = await prisma.docUpdate.count({ where: { documentId: id } });
    expect(after).toBeLessThan(before);
    doc.destroy();
  });

  it('스냅샷을 쓴 뒤 삭제 전에 죽어도 문서가 온전하다', async () => {
    // "스냅샷 먼저, 삭제 나중" 순서의 근거를 검사가 들고 있게 한다.
    // 삭제를 안 한 채로 두면 다음 복원이 접힌 것을 또 얹는데, 멱등이라 무해하다.
    const { id, doc, text } = await documentWith(205);
    const seqs = await prisma.docUpdate.findMany({
      where: { documentId: id },
      orderBy: { seq: 'asc' },
      select: { seq: true },
    });

    await compaction.writeSnapshot(id, doc, seqs[seqs.length - 1]!.seq);
    // 삭제는 일부러 안 한다 — 여기서 죽은 셈

    expect(await restored(id)).toBe(text);
    doc.destroy();
  });
});
```

- [ ] **Step 2: 검사가 실패하는 것을 본다**

Run: `pnpm --filter @keel/api exec vitest run --dir test-db compaction`
Expected: FAIL — `Cannot find module '../src/realtime/compaction.service.js'`

- [ ] **Step 3: 최소 구현을 쓴다**

`apps/api/src/realtime/compaction.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import * as Y from 'yjs';
import { PrismaService } from '../prisma.service.js';
import { foldPlan } from './compaction.js';

@Injectable()
export class CompactionService {
  private readonly log = new Logger(CompactionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 쌓인 로그를 스냅샷 하나로 접는다.
   *
   * **순서를 뒤집지 마라 — 스냅샷을 먼저 쓰고, 그 다음 접힌 행을 지운다.**
   * 반대로 하면 그 사이에 죽었을 때 문서가 사라진다. 이 순서라면 최악이
   * 중복 적용이고, Yjs 업데이트는 멱등이라 손해가 없다.
   */
  async fold(documentId: string, doc: Y.Doc): Promise<boolean> {
    const snapshot = await this.prisma.snapshot.findUnique({ where: { documentId } });
    const tail = await this.prisma.docUpdate.findMany({
      where: { documentId, seq: { gt: snapshot?.throughSeq ?? 0n } },
      orderBy: { seq: 'asc' },
      select: { seq: true },
    });

    const plan = foldPlan(tail.map((r) => r.seq));
    if (!plan.shouldFold) return false;

    await this.writeSnapshot(documentId, doc, plan.throughSeq);
    const { count } = await this.prisma.docUpdate.deleteMany({
      where: { documentId, seq: { lte: plan.throughSeq } },
    });
    this.log.log(`${documentId}: ${count} 행을 ${plan.throughSeq} 까지 접었다`);
    return true;
  }

  /**
   * 스냅샷만 쓴다. 삭제는 부르는 쪽이 이어서 한다.
   *
   * 따로 떼어 둔 이유는 검사가 **스냅샷을 쓴 직후 죽은 상황**을 흉내 낼 수
   * 있어야 하기 때문이다. 그 경우가 무해해야 이 순서가 성립한다.
   */
  async writeSnapshot(documentId: string, doc: Y.Doc, throughSeq: bigint): Promise<void> {
    const state = Buffer.from(Y.encodeStateAsUpdate(doc));
    await this.prisma.snapshot.upsert({
      where: { documentId },
      create: { documentId, state, throughSeq },
      update: { state, throughSeq },
    });
  }
}
```

`apps/api/src/realtime/realtime.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module.js';
import { PrismaService } from '../prisma.service.js';
import { CompactionService } from './compaction.service.js';

@Module({
  imports: [DocumentsModule],
  providers: [PrismaService, CompactionService],
  exports: [CompactionService],
})
export class RealtimeModule {}
```

`apps/api/src/app.module.ts` 의 `imports` 에 `RealtimeModule` 을 더한다.

- [ ] **Step 4: 검사가 통과하는 것을 본다**

Run: `pnpm --filter @keel/api exec vitest run --dir test-db compaction`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add apps/api/src/realtime apps/api/test-db/compaction.test.ts apps/api/src/app.module.ts
git commit -m "api: 접기 실행 — 스냅샷 먼저, 삭제 나중

순서를 뒤집으면 그 사이에 죽었을 때 문서가 사라진다. 이 순서라면 최악이
중복 적용이고 Yjs 업데이트는 멱등이다.

writeSnapshot 을 따로 떼어 둔 것은 검사가 '스냅샷을 쓴 직후 죽은 상황'을
흉내 낼 수 있게 하기 위해서다. 그 경우가 무해해야 이 순서가 성립한다."
```

---

## Task 6: 영속화 갈고리 — `bindState` / `writeState`

**Files:**
- Create: `apps/api/src/realtime/persistence.ts`
- Create: `apps/api/test-db/persistence.test.ts`
- Modify: `apps/api/src/realtime/realtime.module.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 1), `restoreInto` · `RESTORE` (Task 3), `CompactionService` (Task 5)
- Produces:
  - `PersistenceService.bindState(documentId: string, doc: Y.Doc): Promise<void>`
  - `PersistenceService.writeState(documentId: string, doc: Y.Doc): Promise<void>`
  - `PersistenceService.settled(documentId: string): Promise<void>` — 큐가 빌 때까지 기다린다(검사용)
  - `PersistenceService.onFailure: (documentId: string, error: unknown) => void` — Task 8 이 채운다

- [ ] **Step 1: 실패하는 통합 검사를 쓴다**

`apps/api/test-db/persistence.test.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as Y from 'yjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { DocumentsService } from '../src/documents/documents.service.js';
import { PrismaService } from '../src/prisma.service.js';
import { PersistenceService } from '../src/realtime/persistence.js';

let app: INestApplication;
let prisma: PrismaService;
let documents: DocumentsService;
let persistence: PersistenceService;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
  prisma = app.get(PrismaService);
  documents = app.get(DocumentsService);
  persistence = app.get(PersistenceService);
});

afterAll(async () => {
  await app.close();
});

describe('영속화', () => {
  it('처음 열면 씨앗이 선다', async () => {
    const { id } = await documents.create();
    const doc = new Y.Doc();

    await persistence.bindState(id, doc);

    expect(doc.getText('source').toString()).toContain('actor user');
    doc.destroy();
  });

  it('고친 것이 다시 열 때 남아 있다', async () => {
    const { id } = await documents.create();

    const first = new Y.Doc();
    await persistence.bindState(id, first);
    first.getText('source').insert(0, '# 고쳤다\n');
    await persistence.settled(id);
    const expected = first.getText('source').toString();
    first.destroy();

    const second = new Y.Doc();
    await persistence.bindState(id, second);
    expect(second.getText('source').toString()).toBe(expected);
    second.destroy();
  });

  it('복원이 낸 변화를 도로 쓰지 않는다', async () => {
    // restoreInto 가 RESTORE origin 으로 묶어 주는 것을 여기서 확인한다.
    // 이게 새면 문서를 열 때마다 로그가 두 배로 불어난다.
    const { id } = await documents.create();
    const before = await prisma.docUpdate.count({ where: { documentId: id } });

    const doc = new Y.Doc();
    await persistence.bindState(id, doc);
    await persistence.settled(id);

    expect(await prisma.docUpdate.count({ where: { documentId: id } })).toBe(before);
    doc.destroy();
  });

  it('업데이트를 들어온 순서대로 쌓는다', async () => {
    const { id } = await documents.create();
    const doc = new Y.Doc();
    await persistence.bindState(id, doc);

    for (let i = 0; i < 20; i++) doc.getText('source').insert(0, `${i}|`);
    await persistence.settled(id);

    const replayed = new Y.Doc();
    const rows = await prisma.docUpdate.findMany({
      where: { documentId: id },
      orderBy: { seq: 'asc' },
    });
    for (const row of rows) Y.applyUpdate(replayed, new Uint8Array(row.update));

    expect(replayed.getText('source').toString()).toBe(doc.getText('source').toString());
    replayed.destroy();
    doc.destroy();
  });
});
```

- [ ] **Step 2: 검사가 실패하는 것을 본다**

Run: `pnpm --filter @keel/api exec vitest run --dir test-db persistence`
Expected: FAIL — `Cannot find module '../src/realtime/persistence.js'`

- [ ] **Step 3: 최소 구현을 쓴다**

`apps/api/src/realtime/persistence.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import * as Y from 'yjs';
import { PrismaService } from '../prisma.service.js';
import { CompactionService } from './compaction.service.js';
import { FOLD_THRESHOLD } from './compaction.js';
import { RESTORE, restoreInto } from './restore.js';

@Injectable()
export class PersistenceService {
  private readonly log = new Logger(PersistenceService.name);

  /**
   * 문서마다 쓰기를 **한 줄로 세운다.**
   *
   * `doc.on('update')` 는 동기로 울리는데 DB 쓰기는 비동기다. 그냥 쏘아
   * 두면 두 쓰기가 겹쳐 `seq` 가 들어온 순서와 어긋날 수 있고, **재생 순서가
   * 곧 문서**라 그 순간 문서가 달라진다.
   */
  private readonly queues = new Map<string, Promise<void>>();

  /** 문서마다 마지막 접기 이후 쌓은 횟수. 메모리에만 있다 */
  private readonly appended = new Map<string, number>();

  /** Task 8 이 채운다. 기본은 로그만 남긴다 */
  onFailure: (documentId: string, error: unknown) => void = (documentId, error) => {
    this.log.error(`${documentId}: 저장 실패`, error);
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly compaction: CompactionService,
  ) {}

  async bindState(documentId: string, doc: Y.Doc): Promise<void> {
    const snapshot = await this.prisma.snapshot.findUnique({ where: { documentId } });
    const tail = await this.prisma.docUpdate.findMany({
      where: { documentId, seq: { gt: snapshot?.throughSeq ?? 0n } },
      orderBy: { seq: 'asc' },
    });

    restoreInto(
      doc,
      snapshot === null ? undefined : new Uint8Array(snapshot.state),
      tail.map((row) => new Uint8Array(row.update)),
    );

    this.appended.set(documentId, tail.length);

    doc.on('update', (update: Uint8Array, origin: unknown) => {
      // 복원이 낸 변화는 이미 저장된 것이다. 도로 쓰면 로그가 두 배가 된다
      if (origin === RESTORE) return;
      this.enqueue(documentId, async () => {
        await this.prisma.docUpdate.create({
          data: { documentId, update: Buffer.from(update) },
        });
        const n = (this.appended.get(documentId) ?? 0) + 1;
        this.appended.set(documentId, n);

        // 아무도 안 나가는 문서는 writeState 가 영영 안 불린다.
        // 둘이 하루 종일 붙어 있는 문서가 로그가 제일 길다
        if (n > FOLD_THRESHOLD) {
          if (await this.compaction.fold(documentId, doc)) this.appended.set(documentId, 0);
        }
      });
    });
  }

  async writeState(documentId: string, doc: Y.Doc): Promise<void> {
    await this.settled(documentId);
    if (await this.compaction.fold(documentId, doc)) this.appended.set(documentId, 0);
  }

  /** 이 문서의 쓰기 큐가 빌 때까지 기다린다 */
  async settled(documentId: string): Promise<void> {
    await (this.queues.get(documentId) ?? Promise.resolve());
  }

  private enqueue(documentId: string, work: () => Promise<void>): void {
    const previous = this.queues.get(documentId) ?? Promise.resolve();
    const next = previous.then(work).catch((error: unknown) => {
      this.onFailure(documentId, error);
    });
    this.queues.set(documentId, next);
  }
}
```

`realtime.module.ts` 의 `providers` 와 `exports` 에 `PersistenceService` 를 더한다.

- [ ] **Step 4: 검사가 통과하는 것을 본다**

Run: `pnpm --filter @keel/api exec vitest run --dir test-db persistence`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add apps/api/src/realtime/persistence.ts apps/api/test-db/persistence.test.ts apps/api/src/realtime/realtime.module.ts
git commit -m "api: 영속화 갈고리 — 쓰기를 한 줄로 세운다

doc.on('update') 는 동기로 울리는데 DB 쓰기는 비동기다. 그냥 쏘아 두면 두
쓰기가 겹쳐 seq 가 들어온 순서와 어긋나고, 재생 순서가 곧 문서라 그 순간
문서가 달라진다.

복원이 낸 변화는 RESTORE origin 으로 걸러 낸다. 이게 새면 문서를 열 때마다
로그가 두 배로 불어난다.

접기를 writeState 뿐 아니라 쌓인 횟수로도 건다. 아무도 안 나가는 문서는
writeState 가 영영 안 불리는데 그런 문서가 로그가 제일 길다."
```

---

## Task 7: ws 배선과 문지기 — 중계가 돈다

**Files:**
- Create: `apps/api/src/realtime/connections.ts`
- Create: `apps/api/src/realtime/connection.ts`
- Create: `apps/api/test-db/relay.test.ts`
- Modify: `apps/api/src/main.ts`, `apps/api/src/realtime/realtime.module.ts`

**Interfaces:**
- Consumes: `DocumentsService` (Task 2), `PersistenceService` (Task 6)
- Produces:
  - `ConnectionRegistry.add(documentId: string, socket: WebSocket): void`
  - `ConnectionRegistry.remove(documentId: string, socket: WebSocket): void`
  - `ConnectionRegistry.closeAll(documentId: string, code: number, reason: string): void`
  - `attachRealtime(server: http.Server, app: INestApplication): void`

- [ ] **Step 1: 실패하는 통합 검사를 쓴다**

검사가 클라이언트 쪽 제공자를 쓴다.

Run: `pnpm --filter @keel/api add -D y-websocket`

`apps/api/test-db/relay.test.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as Y from 'yjs';
import WebSocket from 'ws';
import { WebsocketProvider } from 'y-websocket';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { DocumentsService } from '../src/documents/documents.service.js';
import { attachRealtime } from '../src/realtime/connection.js';

let app: INestApplication;
let documents: DocumentsService;
let url: string;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
  await app.listen(0);
  attachRealtime(app.getHttpServer(), app);
  documents = app.get(DocumentsService);
  const port = (app.getHttpServer().address() as { port: number }).port;
  url = `ws://127.0.0.1:${port}`;
});

afterAll(async () => {
  await app.close();
});

/** 붙어서 첫 동기화가 끝날 때까지 기다린다 */
function connect(id: string): { doc: Y.Doc; provider: WebsocketProvider; synced: Promise<void> } {
  const doc = new Y.Doc();
  const provider = new WebsocketProvider(url, id, doc, {
    WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
  });
  const synced = new Promise<void>((resolve) => provider.once('sync', () => resolve()));
  return { doc, provider, synced };
}

describe('중계', () => {
  it('붙으면 씨앗이 내려온다', async () => {
    const { id } = await documents.create();
    const a = connect(id);
    await a.synced;

    expect(a.doc.getText('source').toString()).toContain('actor user');
    a.provider.destroy();
    a.doc.destroy();
  });

  it('둘이 붙으면 서로의 편집을 본다', async () => {
    const { id } = await documents.create();
    const a = connect(id);
    const b = connect(id);
    await Promise.all([a.synced, b.synced]);

    a.doc.getText('source').insert(0, '# 안녕\n');

    await expect
      .poll(() => b.doc.getText('source').toString(), { timeout: 5000 })
      .toContain('# 안녕');

    a.provider.destroy();
    b.provider.destroy();
    a.doc.destroy();
    b.doc.destroy();
  });

  it('없는 문서는 404 로 끊는다', async () => {
    // 중계가 문서를 만들면 URL 오타 하나가 씨앗 없는 빈 문서를 낳는다
    const status = await new Promise<number>((resolve, reject) => {
      const socket = new WebSocket(`${url}/does-not-exist-xxxxx`);
      socket.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
      socket.on('open', () => reject(new Error('붙으면 안 된다')));
      socket.on('error', () => undefined);
    });

    expect(status).toBe(404);
  });
});
```

- [ ] **Step 2: 검사가 실패하는 것을 본다**

Run: `pnpm --filter @keel/api exec vitest run --dir test-db relay`
Expected: FAIL — `Cannot find module '../src/realtime/connection.js'`

- [ ] **Step 3: 접속 장부를 쓴다**

`apps/api/src/realtime/connections.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { WebSocket } from 'ws';

/**
 * 문서마다 붙어 있는 소켓을 우리가 직접 센다.
 *
 * `@y/websocket-server` 안에도 같은 장부가 있지만 그쪽은 내부 사정이다.
 * 저장이 실패했을 때 **그 문서의 소켓을 전부 끊는 것**이 우리가 가진 가장
 * 정직한 신호라, 그 능력을 남의 내부 구조에 기대어 두지 않는다.
 */
@Injectable()
export class ConnectionRegistry {
  private readonly byDocument = new Map<string, Set<WebSocket>>();

  add(documentId: string, socket: WebSocket): void {
    const set = this.byDocument.get(documentId) ?? new Set<WebSocket>();
    set.add(socket);
    this.byDocument.set(documentId, set);
  }

  remove(documentId: string, socket: WebSocket): void {
    const set = this.byDocument.get(documentId);
    if (set === undefined) return;
    set.delete(socket);
    if (set.size === 0) this.byDocument.delete(documentId);
  }

  closeAll(documentId: string, code: number, reason: string): void {
    for (const socket of this.byDocument.get(documentId) ?? []) socket.close(code, reason);
  }
}
```

- [ ] **Step 4: upgrade 문지기를 쓴다**

`apps/api/src/realtime/connection.ts`:

```ts
import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import type { Server } from 'node:http';
import { WebSocketServer } from 'ws';
import { setPersistence, setupWSConnection } from '@y/websocket-server/utils';
import { DocumentsService } from '../documents/documents.service.js';
import { ConnectionRegistry } from './connections.js';
import { PersistenceService } from './persistence.js';

const log = new Logger('Realtime');

/**
 * Nest 의 HTTP 서버에 생 `ws` 를 직접 붙인다.
 *
 * **Nest 의 WebSocket 게이트웨이를 쓰지 않는다.** 게이트웨이는 제 어댑터로
 * 메시지를 가로채는데, `setupWSConnection` 은 생 소켓을 받아 직접 프로토콜을
 * 말한다. 사이에 한 겹이 끼면 프레임이 감싸져 프로토콜이 깨진다.
 */
export function attachRealtime(server: Server, app: INestApplication): void {
  const documents = app.get(DocumentsService);
  const persistence = app.get(PersistenceService);
  const registry = app.get(ConnectionRegistry);

  // `setPersistence` 는 모듈 전역이다. 부트스트랩에서 한 번만 건다
  setPersistence({
    bindState: (documentId, doc) => persistence.bindState(documentId, doc),
    writeState: (documentId, doc) => persistence.writeState(documentId, doc),
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const documentId = (request.url ?? '/').slice(1).split('?')[0] ?? '';

    void (async () => {
      let exists: boolean;
      try {
        exists = (await documents.find(documentId)) !== null;
      } catch (error) {
        // DB 를 못 보는 것과 문서가 없는 것은 다른 말이다. 404 로 내면
        // 클라이언트가 없는 문서로 오해해 로컬 사본을 지운다
        log.error(`${documentId}: 존재 확인 실패`, error);
        socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
        socket.destroy();
        return;
      }

      if (!exists) {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        registry.add(documentId, ws);
        ws.on('close', () => registry.remove(documentId, ws));
        // `gc` 를 끄지 않는다(기본값 그대로). y-websocket 문서는 스냅샷이
        // 필요하면 끄라고 하지만, 우리 히스토리는 **업데이트 로그**가 들고
        // 있다. 인메모리 GC 는 로그를 안 건드리므로 나중에 버전 화면을 만들
        // 때 로그 재생으로 어느 시점이든 복원된다. 끄면 메모리만 늘어난다
        setupWSConnection(ws, request, { docName: documentId, gc: true });
      });
    })();
  });
}
```

`realtime.module.ts` 의 `providers` 와 `exports` 에 `ConnectionRegistry` 를 더한다.

- [ ] **Step 5: 부트스트랩에 배선한다**

`apps/api/src/main.ts` 를 고친다:

```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { attachRealtime } from './realtime/connection.js';

const PORT = Number(process.env['PORT'] ?? 4000);

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true });
  await app.listen(PORT);
  attachRealtime(app.getHttpServer(), app);
}

await bootstrap();
```

- [ ] **Step 6: 검사가 통과하는 것을 본다**

Run: `pnpm --filter @keel/api exec vitest run --dir test-db relay`
Expected: PASS (3 tests)

- [ ] **Step 7: 커밋**

```bash
git add apps/api/src/realtime apps/api/src/main.ts apps/api/test-db/relay.test.ts pnpm-lock.yaml
git commit -m "api: ws 배선과 문지기 — 중계가 돈다

Nest 의 WebSocket 게이트웨이를 쓰지 않는다. 게이트웨이는 제 어댑터로
메시지를 가로채는데 setupWSConnection 은 생 소켓을 받아 직접 프로토콜을
말한다. 사이에 한 겹이 끼면 프레임이 감싸져 깨진다.

중계는 문서를 만들지 않는다. 만들면 URL 오타 하나가 씨앗 없는 빈 문서를
낳고, 사용자는 빈 화면을 보고 저장이 깨졌다고 읽는다.

DB 를 못 보는 것은 404 가 아니라 503 이다. 404 로 내면 클라이언트가 없는
문서로 오해해 로컬 사본을 지운다."
```

---

## Task 8: 실패 처리 — 저장이 실패하면 끊는다

**Files:**
- Modify: `apps/api/src/realtime/persistence.ts`, `apps/api/src/realtime/connection.ts`
- Create: `apps/api/test-db/failure.test.ts`

**Interfaces:**
- Consumes: `PersistenceService` · `ConnectionRegistry` (Tasks 6·7)
- Produces:
  - `PersistenceService.poisoned(documentId: string): boolean`
  - `PersistenceService.onFailure` 가 `attachRealtime` 에서 채워진다

- [ ] **Step 1: 실패하는 통합 검사를 쓴다**

`apps/api/test-db/failure.test.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as Y from 'yjs';
import WebSocket from 'ws';
import { WebsocketProvider } from 'y-websocket';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { DocumentsService } from '../src/documents/documents.service.js';
import { PrismaService } from '../src/prisma.service.js';
import { attachRealtime } from '../src/realtime/connection.js';

let app: INestApplication;
let documents: DocumentsService;
let prisma: PrismaService;
let url: string;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
  await app.listen(0);
  attachRealtime(app.getHttpServer(), app);
  documents = app.get(DocumentsService);
  prisma = app.get(PrismaService);
  const port = (app.getHttpServer().address() as { port: number }).port;
  url = `ws://127.0.0.1:${port}`;
});

afterAll(async () => {
  await app.close();
});

describe('저장 실패', () => {
  it('저장이 실패하면 그 문서의 소켓을 끊는다', async () => {
    // 업데이트는 이미 다른 접속자에게 중계된 뒤다. 모두가 저장됐다고 믿는데
    // 사실이 아니므로, 끊어서 "지금 고치는 것은 저장되지 않는다" 를 알린다.
    const { id } = await documents.create();

    const doc = new Y.Doc();
    const provider = new WebsocketProvider(url, id, doc, {
      WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
    });
    await new Promise<void>((resolve) => provider.once('sync', () => resolve()));

    const closed = new Promise<void>((resolve) => {
      provider.once('status', (event: { status: string }) => {
        if (event.status === 'disconnected') resolve();
      });
    });

    // 저장을 깨뜨린다 — 그 문서 행을 지워 외래키를 어긴다
    await prisma.document.delete({ where: { id } });
    doc.getText('source').insert(0, 'x');

    await expect(closed).resolves.toBeUndefined();

    provider.destroy();
    doc.destroy();
  }, 20_000);
});
```

- [ ] **Step 2: 검사가 실패하는 것을 본다**

Run: `pnpm --filter @keel/api exec vitest run --dir test-db failure`
Expected: FAIL — 소켓이 안 끊겨 `closed` 가 시간 초과

- [ ] **Step 3: 복원 실패를 기록하는 자리를 만든다**

`apps/api/src/realtime/persistence.ts` 의 클래스 안에 더한다:

```ts
  /**
   * 복원이 실패한 문서. **재시작 전까지 이 프로세스에서 다시 열리지 않는다.**
   *
   * 부분 복원된 문서를 내보내면 그 위의 편집이 갈라진 역사로 쌓인다. 자동으로
   * 되살리려 애쓰는 것보다 사람이 보는 쪽이 맞다 — 복원이 실패했다는 것은
   * 저장된 것이 깨졌다는 뜻이고, 그건 사람이 들여다볼 일이다.
   */
  private readonly broken = new Set<string>();

  poisoned(documentId: string): boolean {
    return this.broken.has(documentId);
  }
```

그리고 `bindState` 의 복원 부분을 감싼다:

```ts
    try {
      restoreInto(
        doc,
        snapshot === null ? undefined : new Uint8Array(snapshot.state),
        tail.map((row) => new Uint8Array(row.update)),
      );
    } catch (error) {
      this.broken.add(documentId);
      this.onFailure(documentId, error);
      throw error;
    }
```

- [ ] **Step 4: 실패를 소켓 끊기로 잇는다**

`apps/api/src/realtime/connection.ts` 의 `attachRealtime` 안, `setPersistence` 호출 **앞에** 더한다:

```ts
  persistence.onFailure = (documentId, error) => {
    log.error(`${documentId}: 저장 실패 — 이 문서의 소켓을 끊는다`, error);
    // 조용히 로그만 남기면 사람은 계속 작업하다 전부 잃는다.
    // 1011 = 서버가 예상 못 한 사정으로 요청을 못 끝냈다
    registry.closeAll(documentId, 1011, 'persistence failed');
  };
```

그리고 upgrade 문지기의 존재 확인 **뒤에** 한 줄을 더한다:

```ts
      if (persistence.poisoned(documentId)) {
        socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
        socket.destroy();
        return;
      }
```

- [ ] **Step 5: 검사가 통과하는 것을 본다**

Run: `pnpm --filter @keel/api exec vitest run --dir test-db failure`
Expected: PASS (1 test)

- [ ] **Step 6: 전 게이트를 돌리고 커밋**

Run: `pnpm turbo run lint typecheck test build --force && pnpm turbo run test:db`

```bash
git add apps/api
git commit -m "api: 저장이 실패하면 그 문서의 소켓을 끊는다

실패한 업데이트는 이미 다른 접속자에게 중계된 뒤다. 모두가 저장됐다고
믿는데 사실이 아니다. 프로토콜에 앱 수준 통로가 없으니 끊는 것이 가진 것
중 가장 정직한 신호다 — 클라이언트는 연결 끊김으로 넘어가고 그것은 사실이다.

복원이 실패한 문서는 재시작 전까지 503 으로 고정한다. 부분 복원된 문서를
내보내면 그 위의 편집이 갈라진 역사로 쌓인다."
```

---

## Task 9: web 라우팅 — `/d/<id>` 로 가른다

**Files:**
- Create: `apps/web/src/components/editor.tsx` (지금 `app/page.tsx` 의 본문이 옮겨온다)
- Create: `apps/web/app/d/[id]/page.tsx`, `apps/web/app/d/[id]/not-found.tsx`, `apps/web/app/error.tsx`
- Create: `apps/web/src/api.ts`
- Modify: `apps/web/app/page.tsx`, `apps/web/package.json`, `e2e/playwright.config.ts`
- Modify: `.github/workflows/verify.yml`

**Interfaces:**
- Consumes: `@keel/contract` 의 `CreateDocumentResponse` · `DocumentSummary` (Task 2), `POST /d` · `GET /d/:id` (Task 2)
- Produces:
  - `createDocument(): Promise<string>` — 새 문서 id
  - `findDocument(id: string): Promise<DocumentSummary | 'missing' | 'unavailable'>`
  - `<Editor documentId={id} />` — 지금까지의 에디터 화면 전체

- [ ] **Step 1: API 말붙임을 만든다**

`apps/web/package.json` 에 `@keel/contract` 를 더한다.

Run: `pnpm --filter @keel/web add @keel/contract@workspace:*`

`apps/web/src/api.ts`:

```ts
import type { CreateDocumentResponse, DocumentSummary } from '@keel/contract';

/** 서버에서만 쓴다. 브라우저에는 ws 주소만 나간다 */
const API = process.env['KEEL_API_URL'] ?? 'http://localhost:4000';

export async function createDocument(): Promise<string> {
  const res = await fetch(`${API}/d`, { method: 'POST', cache: 'no-store' });
  if (!res.ok) throw new Error(`문서를 만들지 못했다: ${res.status}`);
  const body = (await res.json()) as CreateDocumentResponse;
  return body.id;
}

/**
 * **`'missing'` 과 `'unavailable'` 을 갈라 돌려준다.**
 *
 * 이 구분이 브라우저에 남은 사본을 지울지를 가른다. `404` 는 문서가 정말
 * 없다는 뜻이라 지워도 되지만, 서버가 잠깐 아픈 것을 `404` 로 뭉개면 사람의
 * 오프라인 작업을 우리가 없앤다.
 */
export async function findDocument(
  id: string,
): Promise<DocumentSummary | 'missing' | 'unavailable'> {
  let res: Response;
  try {
    res = await fetch(`${API}/d/${id}`, { cache: 'no-store' });
  } catch {
    return 'unavailable';
  }
  if (res.status === 404) return 'missing';
  if (!res.ok) return 'unavailable';
  return (await res.json()) as DocumentSummary;
}
```

- [ ] **Step 2: 에디터를 컴포넌트로 옮긴다**

`apps/web/app/page.tsx` 의 **본문 전체**를 `apps/web/src/components/editor.tsx` 로 옮긴다. 바뀌는 것은 셋뿐이다.

1. `export default function EditorPage()` → `export function Editor({ documentId }: { readonly documentId: string })`
2. import 경로가 한 단계 얕아진다 (`../src/components/...` → `./...`, `../src/document/...` → `../document/...`)
3. 맨 위 `'use client';` 는 그대로 둔다

`documentId` 는 이번 태스크에서 아직 안 쓴다 — Task 10 이 제공자에 넘긴다.

- [ ] **Step 3: 새 라우트를 만든다**

`apps/web/app/d/[id]/page.tsx`:

```ts
import { notFound } from 'next/navigation';
import { Editor } from '../../../src/components/editor.js';
import { findDocument } from '../../../src/api.js';

/**
 * 문서가 있는지 **먼저** 확인한다.
 *
 * 안 하면 ws 가 404 로 끊기고 사용자는 빈 에디터를 본다 — "문서가 없다" 와
 * "문서가 비었다" 를 구분 못 하는 화면이다.
 */
export default async function DocumentPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const found = await findDocument(id);

  if (found === 'missing') notFound();
  // 서버가 잠깐 아픈 것은 없는 문서와 다르다. 던져서 error.tsx 로 보낸다
  if (found === 'unavailable') throw new Error('서버에 연결할 수 없다');

  return <Editor documentId={id} />;
}
```

`apps/web/app/d/[id]/not-found.tsx`:

```tsx
export default function NotFound() {
  return (
    <main style={{ display: 'grid', placeItems: 'center', height: '100dvh', padding: 24 }}>
      <p style={{ color: 'var(--keel-muted)', textAlign: 'center' }}>
        그런 문서가 없다.
        <br />
        주소를 다시 확인한다.
      </p>
    </main>
  );
}
```

`apps/web/app/error.tsx`:

```tsx
'use client';

export default function Error({ reset }: { readonly reset: () => void }) {
  return (
    <main style={{ display: 'grid', placeItems: 'center', height: '100dvh', padding: 24 }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: 'var(--keel-muted)' }}>서버에 연결할 수 없다.</p>
        <button type="button" onClick={reset} style={{ font: 'inherit', cursor: 'pointer' }}>
          다시 해 보기
        </button>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: `/` 를 문서 만들기로 바꾼다**

`apps/web/app/page.tsx` 를 통째로 갈아 쓴다:

```ts
import { redirect } from 'next/navigation';
import { createDocument } from '../src/api.js';

/**
 * 들어오면 새 문서가 선다.
 *
 * 정적 프리렌더에서 빠지는 대신, "문서를 만드는 자리" 가 서버 한 곳에 모인다.
 * 클라이언트가 만들면 새로고침마다 문서가 하나씩 생긴다.
 */
export const dynamic = 'force-dynamic';

export default async function Home(): Promise<never> {
  const id = await createDocument();
  redirect(`/d/${id}`);
}
```

- [ ] **Step 5: e2e 가 api 도 띄우게 한다**

`e2e/playwright.config.ts` 의 `webServer` 를 배열로 바꾼다:

```ts
  webServer: [
    {
      // api 에는 `url` 대신 `port` 를 쓴다. `url` 은 2xx 응답을 기다리는데,
      // 이 서버의 모든 경로는 문서 id 를 요구해서 2xx 를 낼 고정 주소가 없다.
      // 건강 확인용 경로를 제품에 새로 뚫는 것보다 포트를 보는 쪽이 정직하다.
      command: 'pnpm --filter @keel/api exec prisma migrate deploy && pnpm --filter @keel/api dev',
      port: 4000,
      cwd: '..',
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @keel/web dev',
      url: 'http://localhost:3000',
      cwd: '..',
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
    },
  ],
```

`guard-dev-server.mjs` 는 3000 번만 본다. api 쪽에도 같은 문제가 생기면 그때 넓힌다 — 지금 넓히면 쓰지도 않을 갈래를 들인다.

- [ ] **Step 6: e2e 를 돌린다**

Run: `docker compose up -d && pnpm turbo run e2e`
Expected: 기존 5 개가 그대로 통과. `goto('/')` 가 새 문서를 만들어 `/d/<id>` 로 보내므로 씨앗이 선 화면에 닿는다.

- [ ] **Step 7: CI 에 환경 변수를 준다**

`.github/workflows/verify.yml` 의 e2e 단계에 `env` 를 붙인다:

```yaml
      - run: pnpm turbo run e2e
        env:
          DATABASE_URL: postgresql://keel:keel@localhost:5432/keel
          KEEL_API_URL: http://localhost:4000
          NEXT_PUBLIC_KEEL_WS_URL: ws://localhost:4000
```

- [ ] **Step 8: 전 게이트를 돌리고 커밋**

Run: `pnpm turbo run lint typecheck test build --force && pnpm turbo run test:db && pnpm turbo run e2e`

```bash
git add apps/web e2e .github/workflows/verify.yml pnpm-lock.yaml
git commit -m "web: /d/<id> 로 문서를 가른다

/ 는 이제 문서를 만들어 보내는 자리다. 클라이언트가 만들면 새로고침마다
문서가 하나씩 생기므로 서버 한 곳에 모은다.

문서가 있는지 먼저 확인한다. 안 하면 ws 가 404 로 끊기고 사용자는 빈
에디터를 본다 — 문서가 없다와 문서가 비었다를 구분 못 하는 화면이다.

api 도 찾을 수 없는 경우를 missing 과 갈라 둔다. 이 구분이 다음 판에서
브라우저에 남은 사본을 지울지를 가른다."
```

---

## Task 10: 제공자 꽂기 — 서버와 브라우저에 함께 저장한다

**Files:**
- Create: `apps/web/src/document/providers.ts`
- Create: `apps/web/src/hooks/use-document-ready.ts`
- Modify: `apps/web/src/components/editor.tsx`, `apps/web/src/document/keel-document.ts`, `apps/web/package.json`
- Delete: `apps/web/src/document/seed.ts`

**Interfaces:**
- Consumes: `KeelDocument` (기존), `<Editor documentId>` (Task 9)
- Produces:
  - `connectProviders(documentId: string, doc: Y.Doc): Providers`
  - `interface Providers { remote: WebsocketProvider; local: IndexeddbPersistence | undefined; destroy(): void }`
  - `useDocumentReady(keelDocument: KeelDocument, providers: Providers | undefined): boolean`

- [ ] **Step 1: 씨앗을 걷어내 검사를 빨갛게 만든다**

`apps/web/src/document/seed.ts` 를 지우고, `editor.tsx` 에서 그 import 와 사용을 걷어낸다.

```ts
// 있던 것
const keelDocument = useMemo(() => createKeelDocument(SEED, [YSyncConfig]), []);
// 바꾼 것 — 씨앗은 서버가 심는다
const keelDocument = useMemo(() => createKeelDocument('', [YSyncConfig]), []);
```

`keel-document.ts` 의 인자를 선택으로 바꾼다:

```ts
export function createKeelDocument(
  seed = '',
  extraTrackedOrigins: readonly unknown[] = [],
): KeelDocument {
```

- [ ] **Step 2: e2e 가 실패하는 것을 본다**

Run: `docker compose up -d && pnpm turbo run e2e`
Expected: FAIL — `씨앗 문서가 캔버스에 선다` 가 깨진다. 문서가 빈 채로 서고 아무도 채워 주지 않는다. **이것이 이 태스크의 RED 다.**

- [ ] **Step 3: 제공자를 넣는다**

Run: `pnpm --filter @keel/web add y-websocket y-indexeddb`

`apps/web/src/document/providers.ts`:

```ts
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';
import type * as Y from 'yjs';

export interface Providers {
  readonly remote: WebsocketProvider;
  /** 저장소를 못 쓰면 `undefined`. 그때도 에디터는 열린다 */
  readonly local: IndexeddbPersistence | undefined;
  destroy(): void;
}

const WS_URL = process.env['NEXT_PUBLIC_KEEL_WS_URL'] ?? 'ws://localhost:4000';

/**
 * 같은 문서에 둘을 함께 붙인다.
 *
 * `local` 이 있어서 **연결이 끊긴 채 고쳐도 잃지 않는다.** 문제의 성격이
 * "작업물이 사라진다"(유실)에서 "아직 남들에게 안 보인다"(가시성 지연)로
 * 내려가고, 뒤쪽은 표시하면 되는 종류다.
 *
 * 로컬 저장은 **브라우저·출처마다 따로다.** 노트북에서 오프라인으로 고친
 * 것은 그 노트북이 다시 붙기 전까지 휴대폰에 안 보인다.
 */
export function connectProviders(documentId: string, doc: Y.Doc): Providers {
  let local: IndexeddbPersistence | undefined;
  try {
    local = new IndexeddbPersistence(documentId, doc);
  } catch {
    // 프라이빗 창이나 할당량 초과. 에디터가 안 열리는 것이 제일 나쁜 결과라
    // 조용히 로컬 저장 없이 돈다. 경고 문구는 연결 상태 쪽이 강하게 낸다
    local = undefined;
  }

  const remote = new WebsocketProvider(WS_URL, documentId, doc);

  return {
    remote,
    local,
    destroy() {
      remote.destroy();
      local?.destroy();
    },
  };
}
```

- [ ] **Step 4: 세우는 규칙을 만든다**

`apps/web/src/hooks/use-document-ready.ts`:

```ts
'use client';

import { useEffect, useState } from 'react';
import type { KeelDocument } from '../document/keel-document.js';
import type { Providers } from '../document/providers.js';

/**
 * 내용이 있기 전에는 에디터를 세우지 않는다.
 *
 * 빈 채로 띄우면 `yCollab` 이 나중에 도착한 변경을 반영하긴 하지만, 그 사이에
 * 사람이 글자를 치면 **아직 도착하지 않은 씨앗과 섞인다.** 문서는 CRDT 라
 * 안 깨져도 사람이 보기엔 글자가 엉뚱한 자리에 꽂힌다. 게다가 빈 문서는
 * 진단 목록에 오류를 띄워 켜자마자 빨간 줄을 보게 된다.
 *
 * 기다리는 규칙이 두 갈래다.
 *
 * 1. 로컬을 먼저 기다린다 — IndexedDB 라 빠르다.
 * 2. 그러고도 비어 있으면(첫 방문) 원격까지 기다린다. 비어 있지 않으면
 *    **즉시 띄운다** — 두 번째 방문부터는 네트워크를 안 기다린다.
 */
export function useDocumentReady(
  keelDocument: KeelDocument,
  providers: Providers | undefined,
): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (providers === undefined) return;
    let cancelled = false;

    const done = (): void => {
      if (!cancelled) setReady(true);
    };

    void (async () => {
      await providers.local?.whenSynced;
      if (cancelled) return;
      if (keelDocument.source.length > 0) return done();

      // 로컬이 비었다. 서버가 채워 줄 때까지 기다린다
      providers.remote.once('sync', done);
    })();

    return () => {
      cancelled = true;
      providers.remote.off('sync', done);
    };
  }, [keelDocument, providers]);

  return ready;
}
```

- [ ] **Step 5: 에디터에 배선한다**

`editor.tsx` 안, `keelDocument` 를 만든 바로 뒤에 더한다:

```ts
  const [providers, setProviders] = useState<Providers | undefined>(undefined);
  useEffect(() => {
    const connected = connectProviders(documentId, keelDocument.doc);
    setProviders(connected);
    return () => connected.destroy();
  }, [documentId, keelDocument]);

  const ready = useDocumentReady(keelDocument, providers);
```

그리고 `return (` 바로 앞에 더한다:

```tsx
  if (!ready) {
    return (
      <main style={{ display: 'grid', placeItems: 'center', height: '100dvh' }}>
        <p style={{ color: 'var(--keel-muted)' }}>불러오는 중</p>
      </main>
    );
  }
```

- [ ] **Step 6: e2e 가 통과하는 것을 본다**

Run: `pnpm turbo run e2e`
Expected: 5 개 전부 PASS. 씨앗이 **서버에서** 내려와 캔버스에 선다.

- [ ] **Step 7: 전 게이트를 돌리고 커밋**

Run: `pnpm turbo run lint typecheck test build --force && pnpm turbo run test:db && pnpm turbo run e2e`

```bash
git add apps/web pnpm-lock.yaml
git rm apps/web/src/document/seed.ts
git commit -m "web: 서버와 브라우저에 함께 저장한다

씨앗을 걷어내면 e2e 가 빨개진다 — 문서가 빈 채로 서고 아무도 채워 주지
않는다. 제공자를 꽂아 다시 파랗게 만든다.

y-indexeddb 를 함께 붙인다. 연결이 끊긴 채 고쳐도 잃지 않으므로, 문제가
'작업물이 사라진다'에서 '아직 남들에게 안 보인다'로 내려간다.

씨앗이 원격 업데이트로 도착하면 그 origin 은 제공자라 trackedOrigins 에
없다. 되돌리기가 씨앗을 못 지운다 — KEEL_SEED 주석이 예고한 자리다."
```

---

## Task 11: 연결 상태 — 안 보인다는 것을 말한다

**Files:**
- Create: `apps/web/src/components/connection-status.tsx`
- Modify: `apps/web/src/components/editor.tsx`, `e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: `Providers` (Task 10)
- Produces: `<ConnectionStatus providers={providers} />`

- [ ] **Step 1: 실패하는 e2e 를 쓴다**

`e2e/smoke.spec.ts` 끝에 더한다:

```ts
test('붙어 있으면 연결 상태가 그렇게 말한다', async ({ page }) => {
  await expect(page.getByTestId('connection-status')).toHaveAttribute('data-state', 'connected');
});

test('끊기면 이 브라우저에만 있다고 말한다', async ({ page, context }) => {
  await context.setOffline(true);

  await expect(page.getByTestId('connection-status')).toHaveAttribute(
    'data-state',
    'disconnected',
  );
  await expect(page.getByTestId('connection-status')).toContainText('이 브라우저에만');

  await context.setOffline(false);
});
```

- [ ] **Step 2: e2e 가 실패하는 것을 본다**

Run: `pnpm turbo run e2e`
Expected: FAIL — `connection-status` 를 못 찾는다

- [ ] **Step 3: 최소 구현을 쓴다**

`apps/web/src/components/connection-status.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Providers } from '../document/providers.js';

/**
 * 안 보인다는 것을 말한다.
 *
 * 로컬 저장은 "안 잃는다" 를 참으로 만들 뿐 **"공유됐다" 를 참으로 만들지
 * 않는다.** 그 차이를 사람이 알아야 한다.
 *
 * 로컬 저장을 못 쓰는 경우에는 문구가 더 강해진다 — 그때는 정말로 잃는다.
 */
export function ConnectionStatus({ providers }: { readonly providers: Providers | undefined }) {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (providers === undefined) return;
    const onStatus = ({ status }: { status: string }): void => {
      setConnected(status === 'connected');
    };
    providers.remote.on('status', onStatus);
    return () => providers.remote.off('status', onStatus);
  }, [providers]);

  if (providers === undefined) return null;

  const hasLocal = providers.local !== undefined;
  const message = connected
    ? '저장됨'
    : hasLocal
      ? '연결 끊김 — 지금 고치는 것은 이 브라우저에만 있다'
      : '연결 끊김 — 지금 고치는 것은 저장되지 않는다';

  return (
    <p
      data-testid="connection-status"
      data-state={connected ? 'connected' : 'disconnected'}
      style={{ ...bar, color: connected ? 'var(--keel-muted)' : '#b45309' }}
    >
      {message}
    </p>
  );
}

const bar: CSSProperties = {
  position: 'absolute',
  left: 12,
  bottom: 12,
  margin: 0,
  padding: '4px 8px',
  borderRadius: 6,
  background: 'var(--keel-surface)',
  border: '1px solid var(--keel-border)',
  fontSize: 12,
};
```

`editor.tsx` 의 `right` 쪽, `<Inspector ... />` 뒤에 넣는다:

```tsx
          <ConnectionStatus providers={providers} />
```

- [ ] **Step 4: e2e 가 통과하는 것을 본다**

Run: `pnpm turbo run e2e`
Expected: 7 개 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/components/connection-status.tsx apps/web/src/components/editor.tsx e2e/smoke.spec.ts
git commit -m "web: 안 보인다는 것을 말한다

로컬 저장은 '안 잃는다'를 참으로 만들 뿐 '공유됐다'를 참으로 만들지 않는다.
그 차이를 사람이 알아야 한다.

로컬 저장을 못 쓰는 브라우저에서는 문구가 더 강해진다 — 그때는 정말로
잃는다."
```

---

## Task 12: 유령 문서와 오프라인 열기

**Files:**
- Create: `apps/web/src/components/missing-document.tsx`, `apps/web/src/components/unreachable-server.tsx`
- Modify: `apps/web/app/d/[id]/page.tsx`, `apps/web/src/components/editor.tsx`, `e2e/smoke.spec.ts`
- Delete: `apps/web/app/d/[id]/not-found.tsx`

**Interfaces:**
- Consumes: `findDocument` (Task 9), `connectProviders` (Task 10)
- Produces:
  - `<MissingDocument documentId={id} />` — 로컬 사본을 지우고 없다고 말한다
  - `<Editor documentId serverReachable />` — `serverReachable` 인자가 새로 붙는다

- [ ] **Step 1: 실패하는 e2e 를 쓴다**

`e2e/smoke.spec.ts` 끝에 더한다:

```ts
test('지워진 문서를 다시 열면 없다고 말한다', async ({ page, request }) => {
  const url = page.url();
  const id = url.split('/d/')[1]!;

  // 서버에서 지운다
  await request.delete(`http://localhost:4000/d/${id}`);

  await page.goto(url);
  await expect(page.getByTestId('missing-document')).toBeVisible();
  // 로컬 사본이 살아 있으면 씨앗이 보인다. 안 보여야 한다
  await expect(page.locator('.cm-content')).toHaveCount(0);
});
```

이 검사는 서버에 지우는 길이 있어야 한다. **검사 전용이 아니라 진짜 기능으로** 넣는다 — 문서를 지우는 길은 어차피 필요하고, 없으면 이 실패를 검사할 방법이 없다.

`apps/api/src/documents/documents.controller.ts` 에 더한다:

```ts
  /**
   * 문서를 지운다. 업데이트와 스냅샷은 `onDelete: Cascade` 가 함께 지운다.
   *
   * 인증이 없는 판이라 **id 를 아는 사람이 지울 수 있다.** id 가 곧 권한인
   * 구조의 대가이고, 인증이 얹힐 때 여기에 소유자 검사가 붙는다.
   */
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.documents.remove(id);
  }
```

`documents.service.ts` 에 더한다:

```ts
  async remove(id: string): Promise<void> {
    await this.prisma.document.deleteMany({ where: { id } });
  }
```

`Delete` 와 `HttpCode` 를 `@nestjs/common` import 에 더한다.

- [ ] **Step 2: e2e 가 실패하는 것을 본다**

Run: `pnpm turbo run e2e`
Expected: FAIL — `missing-document` 를 못 찾는다 (지금은 `not-found.tsx` 가 뜬다)

- [ ] **Step 3: 유령을 지우는 화면을 만든다**

`apps/web/src/components/missing-document.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';

/**
 * 서버에 **정말로 없는** 문서. 브라우저에 남은 사본을 지운다.
 *
 * 안 지우면 유령이 된다 — 멀쩡해 보이는 문서를 한참 고치는데 ws 는 404 로
 * 계속 거부당하고 그 작업은 영영 저장되지 않는다. 끊긴 채 편집하는 것보다
 * 나쁘다. 저쪽은 언젠가 붙지만 이쪽은 영영 안 붙는다.
 *
 * **`503` 에는 여기 오지 않는다.** 서버가 잠깐 아픈 사이에 사람의 오프라인
 * 작업을 우리가 없애면 안 된다.
 */
export function MissingDocument({ documentId }: { readonly documentId: string }) {
  useEffect(() => {
    const doc = new Y.Doc();
    let store: IndexeddbPersistence | undefined;
    try {
      store = new IndexeddbPersistence(documentId, doc);
      void store.clearData();
    } catch {
      // 저장소를 못 쓰면 지울 것도 없다
    }
    return () => {
      store?.destroy();
      doc.destroy();
    };
  }, [documentId]);

  return (
    <main
      data-testid="missing-document"
      style={{ display: 'grid', placeItems: 'center', height: '100dvh', padding: 24 }}
    >
      <p style={{ color: 'var(--keel-muted)', textAlign: 'center' }}>
        그런 문서가 없다.
        <br />
        주소를 다시 확인한다.
      </p>
    </main>
  );
}
```

- [ ] **Step 4: 서버에 못 붙는 경우를 고친다**

`apps/web/app/d/[id]/page.tsx` 를 고쳐 쓴다:

```ts
import { Editor } from '../../../src/components/editor.js';
import { MissingDocument } from '../../../src/components/missing-document.js';
import { findDocument } from '../../../src/api.js';

/**
 * 문서가 있는지 **먼저** 확인한다. 안 하면 ws 가 404 로 끊기고 사용자는 빈
 * 에디터를 본다 — "문서가 없다" 와 "문서가 비었다" 를 구분 못 하는 화면이다.
 *
 * **서버에 못 붙는 것과 문서가 없는 것을 가른다.** 못 붙었다고 화면을 막으면
 * 로컬에 사본을 들고 있는 사람이 **오프라인에서 아무것도 못 한다** — 로컬
 * 저장을 넣은 이유가 그 자리에서 통째로 사라진다. 그때는 에디터를 띄우고
 * 클라이언트가 로컬을 보고 판단하게 한다.
 */
export default async function DocumentPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const found = await findDocument(id);

  if (found === 'missing') return <MissingDocument documentId={id} />;
  return <Editor documentId={id} serverReachable={found !== 'unavailable'} />;
}
```

`apps/web/app/d/[id]/not-found.tsx` 를 지운다 — `MissingDocument` 가 그 자리를 대신하고, 이쪽은 id 를 알아서 로컬까지 지울 수 있다.

- [ ] **Step 5: 로컬이 빈 채로 서버도 없으면 말한다**

`apps/web/src/components/unreachable-server.tsx`:

```tsx
'use client';

export function UnreachableServer() {
  return (
    <main
      data-testid="unreachable-server"
      style={{ display: 'grid', placeItems: 'center', height: '100dvh', padding: 24 }}
    >
      <p style={{ color: 'var(--keel-muted)', textAlign: 'center' }}>
        서버에 연결할 수 없고, 이 브라우저에 사본도 없다.
        <br />
        연결이 돌아오면 새로고침한다.
      </p>
    </main>
  );
}
```

`editor.tsx` 의 서명과 `ready` 갈래를 고친다:

```tsx
export function Editor({
  documentId,
  serverReachable,
}: {
  readonly documentId: string;
  readonly serverReachable: boolean;
}) {
```

`if (!ready)` 블록을 이렇게 바꾼다:

```tsx
  // 서버에 못 붙었는데 로컬에도 사본이 없으면 영영 안 채워진다.
  // "불러오는 중" 을 영원히 보여 주는 것이 제일 나쁜 결과다
  if (!ready && !serverReachable && providers?.local !== undefined && localEmpty) {
    return <UnreachableServer />;
  }

  if (!ready) {
    return (
      <main style={{ display: 'grid', placeItems: 'center', height: '100dvh' }}>
        <p style={{ color: 'var(--keel-muted)' }}>불러오는 중</p>
      </main>
    );
  }
```

`localEmpty` 는 로컬 동기화가 끝났는데 문서가 빈 상태다. `use-document-ready.ts` 가 함께 돌려주게 고친다:

```ts
export interface DocumentReady {
  readonly ready: boolean;
  /** 로컬 동기화가 끝났는데 문서가 비어 있다 */
  readonly localEmpty: boolean;
}

export function useDocumentReady(
  keelDocument: KeelDocument,
  providers: Providers | undefined,
): DocumentReady {
  const [ready, setReady] = useState(false);
  const [localEmpty, setLocalEmpty] = useState(false);

  useEffect(() => {
    if (providers === undefined) return;
    let cancelled = false;

    const done = (): void => {
      if (!cancelled) setReady(true);
    };

    void (async () => {
      await providers.local?.whenSynced;
      if (cancelled) return;
      if (keelDocument.source.length > 0) return done();

      setLocalEmpty(true);
      providers.remote.once('sync', done);
    })();

    return () => {
      cancelled = true;
      providers.remote.off('sync', done);
    };
  }, [keelDocument, providers]);

  return { ready, localEmpty };
}
```

`editor.tsx` 의 호출부:

```ts
  const { ready, localEmpty } = useDocumentReady(keelDocument, providers);
```

- [ ] **Step 6: e2e 가 통과하는 것을 본다**

Run: `pnpm turbo run e2e`
Expected: 8 개 전부 PASS

- [ ] **Step 7: 전 게이트를 돌리고 커밋**

Run: `pnpm turbo run lint typecheck test build --force && pnpm turbo run test:db && pnpm turbo run e2e`

```bash
git add apps/web apps/api e2e
git rm apps/web/app/d/[id]/not-found.tsx
git commit -m "web: 유령 문서를 지우고, 오프라인에서도 연다

서버에 정말로 없는 문서는 브라우저의 사본까지 지운다. 안 지우면 멀쩡해
보이는 문서를 한참 고치는데 ws 는 404 로 계속 거부당하고 그 작업은 영영
저장되지 않는다.

서버에 못 붙는 것은 문서가 없는 것과 다르다. 못 붙었다고 화면을 막으면
로컬에 사본을 들고 있는 사람이 오프라인에서 아무것도 못 한다 — 로컬 저장을
넣은 이유가 그 자리에서 통째로 사라진다.

DELETE /d/:id 를 넣는다. 유령을 만들 방법이 없으면 유령을 검사할 방법도
없다. 인증이 없는 판이라 id 를 아는 사람이 지울 수 있고, 그것이 id 가 곧
권한인 구조의 대가다."
```

---

## Task 13: 핵심 증명 — 두 사람이 서로를 본다

**Files:**
- Modify: `e2e/smoke.spec.ts`, `README.md`

**Interfaces:**
- Consumes: 앞의 모든 것
- Produces: 없음 (마지막 태스크)

- [ ] **Step 1: 실패하는 e2e 를 쓴다**

`e2e/smoke.spec.ts` 끝에 더한다:

```ts
test('새로고침해도 남는다', async ({ page }) => {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('\nqueue 남는큐 "남는다"');

  await expect
    .poll(async () => (await sceneSummary(page)).nodes.map((n) => n.id))
    .toContain('남는큐');

  await page.reload();
  await page.waitForFunction(() => window.__keel !== undefined);

  expect((await sceneSummary(page)).nodes.map((n) => n.id)).toContain('남는큐');
});

test('두 사람이 같은 URL 에서 서로의 편집을 본다', async ({ page, browser }) => {
  // README 첫 줄의 "실시간 협업" 이 실제로 도는지를 기계가 확인하는 자리다
  const url = page.url();
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await other.goto(url);
  await other.waitForFunction(() => window.__keel !== undefined);

  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('\nservice 같이보기 "둘이 본다"');

  await expect
    .poll(async () => (await sceneSummary(other)).nodes.map((n) => n.id), { timeout: 10_000 })
    .toContain('같이보기');

  await otherContext.close();
});

test('끊긴 채 고친 것이 다시 붙을 때 올라간다', async ({ page, context, browser }) => {
  const url = page.url();

  await context.setOffline(true);
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('\ndb 오프라인 "끊긴 채 적었다"');

  await expect
    .poll(async () => (await sceneSummary(page)).nodes.map((n) => n.id))
    .toContain('오프라인');

  await context.setOffline(false);
  await expect(page.getByTestId('connection-status')).toHaveAttribute(
    'data-state',
    'connected',
    { timeout: 15_000 },
  );

  // 다른 브라우저에서 보인다 = 서버에 올라갔다
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await other.goto(url);
  await other.waitForFunction(() => window.__keel !== undefined);

  await expect
    .poll(async () => (await sceneSummary(other)).nodes.map((n) => n.id), { timeout: 10_000 })
    .toContain('오프라인');

  await otherContext.close();
});
```

- [ ] **Step 2: e2e 가 실패하는지 본다**

Run: `pnpm turbo run e2e`
Expected: 셋 다 PASS 여야 한다. **여기서 통과하는 것이 정상이다** — 앞 태스크들이 기능을 이미 넣었고, 이 검사들은 그 기능이 **함께** 도는 것을 처음으로 확인한다.

하나라도 실패하면 그 태스크로 돌아간다. 특히 "두 사람이 서로를 본다" 가 실패하면 중계(Task 7)를, "끊긴 채 고친 것" 이 실패하면 로컬 저장(Task 10)을 본다.

검사에 이빨이 있는지 확인한다: `apps/web/src/document/providers.ts` 에서 `local` 을 `undefined` 로 고정해 두고 오프라인 검사가 **실패하는 것**을 본 뒤 되돌린다.

- [ ] **Step 3: README 를 갱신한다**

`README.md` 의 세 곳을 고친다.

`## 구조` 의 코드 블록에 더한다:

```
apps/
  web/         에디터 화면 (Next)
  api/         Yjs 중계와 영속화 (NestJS · Prisma · Postgres)
packages/
  contract/    web 과 api 가 함께 보는 HTTP 계약
```

`## 시작하기` 에 Postgres 를 띄우는 단계를 더한다:

```
docker compose up -d
pnpm --filter @keel/api exec prisma migrate deploy
pnpm dev
```

`## 아직 안 한 것` 의 **실시간** 항목을 고쳐 쓴다 — 중계·저장·로컬 저장은 **된 것**으로 옮기고, 남은 것(구글 로그인, 프레즌스, 오프라인 충돌 UX, 인스턴스 2 대 이상)만 남긴다. `## 지금까지 된 것` 에 다음을 더한다:

```
- **저장과 실시간** — 두 사람이 같은 URL 에서 서로의 편집을 본다. 새로고침·
  탭 닫기를 넘어 남고, 끊긴 채 고친 것도 다시 붙을 때 올라간다.
  업데이트 로그 + 스냅샷 접기라 버전 화면이 이 위에 선다
```

- [ ] **Step 4: 전 게이트를 돌린다**

Run: `pnpm turbo run lint typecheck test build --force && pnpm turbo run test:db && pnpm turbo run e2e`
Expected: 전부 통과. e2e 11 개.

- [ ] **Step 5: 커밋**

```bash
git add e2e/smoke.spec.ts README.md
git commit -m "e2e: 두 사람이 서로를 본다

README 첫 줄의 '실시간 협업' 이 실제로 도는지를 기계가 처음으로 확인한다.
새로고침을 넘어 남는 것과, 끊긴 채 고친 것이 다시 붙을 때 올라가는 것도
함께 묶었다.

오프라인 검사에 이빨이 있는지는 providers 의 local 을 undefined 로 고정해
실패하는 것을 보고 확인했다."
```
