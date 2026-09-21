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
