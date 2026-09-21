import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import type { Server } from 'node:http';
import { WebSocketServer } from 'ws';
import { docs, getYDoc, setPersistence, setupWSConnection } from '@y/websocket-server/utils';
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

  // `getYDoc` 은 문서마다 딱 한 번 `bindState` 를 부르고 그 결과를 기다리지
  // 않는다(내부에서 fire-and-forget). `bindState` 는 DB 를 두 번 오가는 비동기
  // 작업인데, 그 직후에 곧장 동기화 1단계를 내보내 버리면 씨앗이 실리기 전에
  // "다 됐다" 는 응답이 나간다 — y-websocket 클라이언트는 그 응답만 보고
  // synced 를 켜고, 뒤늦게 온 내용은 이미 검사를 끝낸 뒤에야 도착한다.
  // 여기서 그 약속을 직접 붙잡아 뒀다가, 소켓을 넘기기 전에 기다린다
  const bindings = new Map<string, Promise<void>>();

  // `setPersistence` 는 모듈 전역이다. 부트스트랩에서 한 번만 건다
  setPersistence({
    // 선언된 타입은 `void` 를 반환하라고 한다(내부에서 결과를 기다리지
    // 않는다는 뜻이다). 그래서 여기서 약속을 그대로 돌려주지 않는다 —
    // 돌려주면 "기다리는 척하다가 안 기다리는" 모양이 되어 실수로 읽힌다.
    // 대신 옆의 `bindings` 에 넣어 두고, 우리가 필요한 자리에서 직접 기다린다
    bindState: (documentId, doc) => {
      bindings.set(documentId, persistence.bindState(documentId, doc));
    },
    // `closeConn`(라이브러리 내부)은 이 약속을 `.then()` 으로만 받고
    // `.catch()` 가 없다. 마지막 연결이 떨어질 때 쓰기가 실패하면(예: 그
    // 사이 DB 연결이 끊김) 처리되지 않은 거부가 되어 프로세스를 흔든다.
    // 여기서 잡아 두는 게 우리가 가진 유일한 자리다
    writeState: (documentId, doc) =>
      persistence.writeState(documentId, doc).catch((error: unknown) => {
        log.error(`${documentId}: 마지막 연결이 떨어질 때 쓰기 실패`, error);
      }),
    // 타입 선언이 요구하지만(`getPersistence()` 로 내부에서 조회할 때 쓰라고
    // 있는 자리) 우리는 LevelDB 같은 provider 객체가 없다 — 실제 저장은
    // `PersistenceService` 가 한다. 그걸 그대로 가리켜 둔다
    provider: persistence,
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

      try {
        // 독을 미리 데운다: 문서가 아직 메모리에 없으면 이 호출이 만들고
        // `bindState` 를 건다(캐시돼 있으면 그냥 기존 것을 돌려준다). 어느
        // 쪽이든 위에서 붙잡아 둔 약속을 기다리면, 소켓을 넘길 때는 씨앗이
        // 이미 실려 있다
        getYDoc(documentId, true);
        await bindings.get(documentId);
      } catch (error) {
        // 복원이 실패해도 방금 만든 빈 문서는 라이브러리의 `docs` 캐시에
        // 그대로 남는다 — 연결을 하나도 안 붙였으니 나중에 다 끊겨서
        // 비워지는 자연스러운 청소(`closeConn`)도 안 일어난다. 지워 두지
        // 않으면 이 문서는 DB 가 되살아나도 영영 빈 채로 캐시에 박혀 있다
        docs.delete(documentId);
        log.error(`${documentId}: 초기 상태 복원 실패`, error);
        socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
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
