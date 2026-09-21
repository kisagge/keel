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
