import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as Y from 'yjs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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

  it('fold 안에서 삭제가 죽어도 문서가 온전하다 — 순서가 뒤집혔으면 이 검사가 잡는다', async () => {
    // 호출 순서(스냅샷 커밋 → 삭제)를 지어낸 mock 호출 기록으로 확인하면,
    // 스냅샷 쓰기가 조용히 망가져도 통과해 버린다. 그래서 실제로 delete 를
    // 죽여서 fold 를 중간에 멈추고, 그 뒤 DB 에 실제로 남은 것만으로
    // 문서를 복원해 본다. 순서가 뒤집혀 삭제가 먼저라면 행이 사라진 채
    // 스냅샷도 없어 문서가 망가지므로 이 검사가 반드시 실패한다.
    const { id, doc, text } = await documentWith(205);

    const deleteSpy = vi
      .spyOn(prisma.docUpdate, 'deleteMany')
      .mockRejectedValueOnce(new Error('죽었다 — 삭제 직전에 멈춘 셈'));

    await expect(compaction.fold(id, doc)).rejects.toThrow('죽었다');
    deleteSpy.mockRestore();

    const snapshot = await prisma.snapshot.findUnique({ where: { documentId: id } });
    expect(snapshot).not.toBeNull();
    expect(await restored(id)).toBe(text);
    doc.destroy();
  });
});
