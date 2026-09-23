import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as Y from 'yjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { SEED } from '../src/documents/seed.js';
import { PrismaService } from '../src/prisma.service.js';

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
