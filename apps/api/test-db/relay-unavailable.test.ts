import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import WebSocket from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { DocumentsService } from '../src/documents/documents.service.js';
import { attachRealtime } from '../src/realtime/connection.js';

/**
 * `relay.test.ts` 와 따로 둔다 — 거기 있는 `beforeAll` 은 앱을 하나 띄워
 * 세 검사가 같이 쓴다. 여기서는 `DocumentsService.find` 를 이 검사만을 위해
 * 갈아 끼워야 하는데, 같은 앱을 공유하면 그 대체가 다른 검사로 샌다.
 * 그래서 이 파일은 제 앱, 제 포트, 제 생명주기를 따로 가진다.
 */
let app: INestApplication;
let url: string;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DocumentsService)
    .useValue({
      // 실제 DB 장애를 흉내 내는 대신, 존재 확인이 실패하는 경로 하나만
      // 갈아 끼운다 — 문지기가 그 실패를 보고 정말 503 을 내는지가 검사 대상이다
      find: () => Promise.reject(new Error('DB 에 못 닿는다')),
    })
    .compile();
  app = moduleRef.createNestApplication();
  await app.init();
  await app.listen(0);
  attachRealtime(app.getHttpServer(), app);
  const port = (app.getHttpServer().address() as { port: number }).port;
  url = `ws://127.0.0.1:${port}`;
});

afterAll(async () => {
  await app.close();
});

describe('중계 — 존재 확인이 실패할 때', () => {
  it('DB 를 못 보면 503 으로 끊는다(404 가 아니다)', async () => {
    // 상태 코드까지 확인한다 — "안 붙었다" 만 보면 이 가드가 404 로
    // 무너져도 검사가 못 잡는다. 404 는 나중에 클라이언트가 로컬 사본을
    // 지우는 신호라, 여기서 404 가 나오면 안 된다
    const status = await new Promise<number>((resolve, reject) => {
      const socket = new WebSocket(`${url}/any-document-id`);
      socket.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
      socket.on('open', () => reject(new Error('붙으면 안 된다')));
      socket.on('error', () => undefined);
    });

    expect(status).toBe(503);
  });
});
