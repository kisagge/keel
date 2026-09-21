import { Injectable } from '@nestjs/common';
import type { WebSocket } from 'ws';

/**
 * 문서마다 붙어 있는 소켓을 우리가 직접 센다.
 *
 * `@y/websocket-server` 안에도 같은 장부가 있지만 그쪽은 내부 사정이다.
 * 저장이 실패했을 때 **그 문서의 소켓을 전부 끊는 것**이 우리가 가진 가장
 * 정직한 신호라, 그 능력을 남의 내부 구조에 기대어 두지 않는다.
 */
@Injectable()
export class ConnectionRegistry {
  private readonly byDocument = new Map<string, Set<WebSocket>>();

  add(documentId: string, socket: WebSocket): void {
    const set = this.byDocument.get(documentId) ?? new Set<WebSocket>();
    set.add(socket);
    this.byDocument.set(documentId, set);
  }

  remove(documentId: string, socket: WebSocket): void {
    const set = this.byDocument.get(documentId);
    if (set === undefined) return;
    set.delete(socket);
    if (set.size === 0) this.byDocument.delete(documentId);
  }

  closeAll(documentId: string, code: number, reason: string): void {
    for (const socket of this.byDocument.get(documentId) ?? []) socket.close(code, reason);
  }
}
