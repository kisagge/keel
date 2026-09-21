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
