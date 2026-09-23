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
    // bindState 는 리스너를 먼저 걸고 나서 restoreInto 를 부른다 — 복원이
    // 내는 update 가 반드시 이 리스너를 거치게 하기 위해서다. 그 update 를
    // 실제로 걸러내는 것은 RESTORE origin 가드다(persistence.ts). 이게
    // 새면 문서를 열 때마다 로그가 두 배로 불어난다.
    const { id } = await documents.create();
    const before = await prisma.docUpdate.count({ where: { documentId: id } });

    const doc = new Y.Doc();
    await persistence.bindState(id, doc);
    await persistence.settled(id);

    expect(await prisma.docUpdate.count({ where: { documentId: id } })).toBe(before);
    doc.destroy();
  });

  it('업데이트를 들어온 순서대로 쌓는다', async () => {
    // 이 검사는 실제 DB 경로가 끝까지 도는 것을 보여 준다 — 순서를 지키는
    // 결정적인 증거는 아니다(로컬 DB 가 빨라 줄을 안 세워도 어쩌다 순서가
    // 맞을 수 있다). 그 증거는 test/write-queue.test.ts 에 있다 — 손으로
    // 통제한 프라미스로 "앞 것이 안 끝나면 뒤 것이 못 시작한다" 를 못 박는다.
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
