import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import WebSocket from 'ws';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { DocumentsService } from '../src/documents/documents.service.js';
import { PersistenceService } from '../src/realtime/persistence.js';
import { attachRealtime } from '../src/realtime/connection.js';

/**
 * `relay-unavailable.test.ts` 와 같은 이유로 제 앱·제 포트를 따로 가진다:
 * 여기서 `restoreInto` 를 갈아 끼우는데, 다른 검사 파일과 앱을 나눠 쓰면
 * 그 대체가 새어 나간다.
 *
 * `restoreInto` 는 `persistence.ts` 안의 평범한 이름 있는 import 다.
 * Yjs 가 진짜 깨진 바이트에 어떻게 반응하는지는 우리 관심사가 아니다 — 그
 * 경계 하나만 갈아 끼워 "복원이 던지면 무슨 일이 나는가" 만 검사한다.
 * `write-queue.test.ts` 가 DB 대신 손으로 통제한 콜백을 넣는 것과 같은
 * 요령이다. vitest 는 검사 파일마다 모듈 레지스트리를 따로 두므로, 이
 * `vi.mock` 은 이 파일 밖으로 새지 않는다.
 *
 * 첫 호출만 던지고 그다음은 진짜 구현으로 넘긴다 — 그래야 "poisoned() 가드를
 * 빼면 둘째 접속이 통과해 버린다" 를 검사가 실제로 구분해 낼 수 있다. 계속
 * 던지기만 하면 가드가 있든 없든 둘째 접속도 503 이 나와, 가드가 실제로
 * 걸리는지 못 본다.
 */
vi.mock('../src/realtime/restore.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/realtime/restore.js')>();
  let calls = 0;
  return {
    ...actual,
    restoreInto: (...args: Parameters<typeof actual.restoreInto>) => {
      calls += 1;
      if (calls === 1) throw new Error('복원이 깨졌다(검사용)');
      return actual.restoreInto(...args);
    },
  };
});

let app: INestApplication;
let documents: DocumentsService;
let persistence: PersistenceService;
let url: string;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
  await app.listen(0);
  attachRealtime(app.getHttpServer(), app);
  documents = app.get(DocumentsService);
  persistence = app.get(PersistenceService);
  const port = (app.getHttpServer().address() as { port: number }).port;
  url = `ws://127.0.0.1:${port}`;
});

afterAll(async () => {
  await app.close();
});

/** 붙으면 실패로 취급한다(이 파일의 모든 시도는 거절돼야 한다) */
function attempt(id: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const socket = new WebSocket(`${url}/${id}`);
    socket.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
    socket.on('open', () => reject(new Error('붙으면 안 된다')));
    socket.on('error', () => undefined);
  });
}

describe('복원 실패 — 문서를 오염 처리한다', () => {
  it('복원이 실패한 문서는 503 으로 끊기고, 재시도 없이 계속 503 이다', async () => {
    const { id } = await documents.create();

    const first = await attempt(id);
    expect(first).toBe(503);
    expect(persistence.poisoned(id)).toBe(true);

    // 여기가 핵심이다: restoreInto 는 이제 성공하도록 갈아 뒀다(두 번째
    // 호출부터). 그런데도 503 이 또 나온다면, 그건 복원을 다시 시도해서가
    // 아니라 poisoned() 가 접속 자체를 막았기 때문이다.
    const second = await attempt(id);
    expect(second).toBe(503);
  });
});
