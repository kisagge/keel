import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as Y from 'yjs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { DocumentsService } from '../src/documents/documents.service.js';
import { PrismaService } from '../src/prisma.service.js';
import { CompactionService } from '../src/realtime/compaction.service.js';
import { FOLD_THRESHOLD } from '../src/realtime/compaction.js';
import { PersistenceService } from '../src/realtime/persistence.js';
import { restoreInto } from '../src/realtime/restore.js';

let app: INestApplication;
let prisma: PrismaService;
let documents: DocumentsService;
let persistence: PersistenceService;
let compaction: CompactionService;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
  prisma = app.get(PrismaService);
  documents = app.get(DocumentsService);
  persistence = app.get(PersistenceService);
  compaction = app.get(CompactionService);
});

afterAll(async () => {
  await app.close();
});

describe('bindState 의 두 읽기와 접기의 경합', () => {
  /**
   * 실제 레이스 창은 같은 트랜잭션 안 두 SELECT 사이, 로컬 Postgres 에서
   * 1ms 도 안 된다. `bindState` 자체를 불러 타이밍만으로 그 순간에 접기를
   * 끼워 넣는 것은 시도해 봤지만 안 됐다 — Prisma 의 인터랙티브 트랜잭션이
   * 콜백에 주는 `tx` 는 베이스 인스턴스(`prisma.snapshot.findUnique` 등)를
   * 몽키패치해도 그걸 거치지 않는 별도 객체였다(직접 확인:
   * `tx.snapshot.findUnique !== prisma.snapshot.findUnique`, 패치한 쪽이
   * 안 불림). 프로덕션 코드에 검사 전용 훅을 심지 않고는 그 좁은 창을
   * 못 벌린다.
   *
   * 그래서 두 자리로 나눠 확인한다.
   *
   * 1. 아래 첫 검사 — `bindState` 가 **실제로** 두 읽기를 RepeatableRead
   *    트랜잭션 하나에 묶어 부르는지를 스파이로 못 박는다. 누군가 "그냥
   *    select 두 개인데" 하고 걷어내면 여기서 진다.
   * 2. 그 아래 검사 — persistence.ts 의 트랜잭션과 **같은 모양**을 이
   *    검사 안에 그대로 재현하고, 그 두 읽기 사이에 진짜
   *    `CompactionService.fold`(프로덕션 코드, 수정 없음)를 끼워 넣어 —
   *    RepeatableRead 격리가 실제로 그 접기를 가려서 복원이 온전한지를
   *    확인한다. 이쪽은 타이밍이 아니라 `await` 로 순서를 직접 고정하므로
   *    결정적이다.
   */
  it('bindState 는 두 읽기를 RepeatableRead 트랜잭션 하나로 묶어 부른다', async () => {
    const txSpy = vi.spyOn(prisma, '$transaction');
    const { id } = await documents.create();
    const doc = new Y.Doc();

    await persistence.bindState(id, doc);
    doc.destroy();

    expect(txSpy).toHaveBeenCalled();
    const lastCall = txSpy.mock.calls[txSpy.mock.calls.length - 1]!;
    const options = lastCall[1] as { isolationLevel?: string } | undefined;
    expect(options?.isolationLevel).toBe('RepeatableRead');
    txSpy.mockRestore();
  });

  it(
    '스냅샷 읽기와 꼬리 읽기 사이에 접기가 끼어들어도 RepeatableRead 트랜잭션이면 복원이 온전하다',
    async () => {
      const id = `race-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await prisma.document.create({ data: { id } });

      // FOLD_THRESHOLD 를 넘겨 접기가 실제로 일어나게 한다
      const doc = new Y.Doc();
      const pending: Uint8Array[] = [];
      doc.on('update', (u: Uint8Array) => pending.push(u));
      for (let i = 0; i < FOLD_THRESHOLD + 5; i++) doc.getText('source').insert(0, `${i}\n`);
      for (const update of pending) {
        await prisma.docUpdate.create({ data: { documentId: id, update: Buffer.from(update) } });
      }
      const expectedText = doc.getText('source').toString();

      let releaseGate: () => void;
      const gate = new Promise<void>((resolve) => {
        releaseGate = resolve;
      });

      // persistence.ts 의 bindState 트랜잭션과 정확히 같은 모양. 검사에서만
      // 두 읽기 사이에 `gate` 를 끼워 접기가 들어올 자리를 만든다 — 이 대기가
      // 프로덕션 코드에는 없다.
      const readBoth = prisma.$transaction(
        async (tx) => {
          const s = await tx.snapshot.findUnique({ where: { documentId: id } });
          await gate;
          const t = await tx.docUpdate.findMany({
            where: { documentId: id, seq: { gt: s?.throughSeq ?? 0n } },
            orderBy: { seq: 'asc' },
          });
          return [s, t] as const;
        },
        { isolationLevel: 'RepeatableRead' },
      );

      // 트랜잭션이 첫 읽기를 마치고 `gate` 에서 멈춰 있는 동안, 진짜 접기를
      // 돌린다 — CompactionService.fold, 수정 없이 그대로. 스냅샷을 쓰고
      // 꼬리 행을 지운다(본문에 묘사된 바로 그 상황).
      const foldDoc = new Y.Doc();
      Y.applyUpdate(foldDoc, Y.encodeStateAsUpdate(doc));
      const folded = await compaction.fold(id, foldDoc);
      foldDoc.destroy();
      expect(folded).toBe(true); // 접기가 실제로 일어났는지 — 안 일어났으면 이 검사가 무의미하다
      expect(await prisma.docUpdate.count({ where: { documentId: id } })).toBe(0); // 전부 접혀 삭제됐다

      releaseGate!();
      const [snapshot, tail] = await readBoth;

      // 고쳐지지 않은 버전이라면 여기서 snapshot === null, tail.length === 0
      // 이었을 것이다 — 접기가 스냅샷을 쓰고 꼬리를 지운 뒤였는데, 트랜잭션
      // 밖에서 따로 읽었다면 그 결과를 그대로 봤을 것이기 때문이다.
      const restored = new Y.Doc();
      restoreInto(
        restored,
        snapshot === null ? undefined : new Uint8Array((snapshot as { state: Uint8Array }).state),
        tail.map((row) => new Uint8Array((row as { update: Uint8Array }).update)),
      );
      expect(restored.getText('source').toString()).toBe(expectedText);
      restored.destroy();

      doc.destroy();
    },
  );
});
