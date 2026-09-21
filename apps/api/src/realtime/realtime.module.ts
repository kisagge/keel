import { Module } from '@nestjs/common';
import { CompactionService } from './compaction.service.js';
import { ConnectionRegistry } from './connections.js';
import { PersistenceService } from './persistence.js';

/**
 * `PrismaService` 를 여기 다시 적지 않는다 — 이 모듈은 그것을 주입받아 쓸 뿐,
 * 소유하지 않는다. 소유는 `PrismaModule` 하나뿐이다(`@Global()`).
 *
 * `DocumentsModule` 도 import 하지 않는다 — `CompactionService` 는
 * `PrismaService` 만 주입받고 `DocumentsService` 를 쓰지 않는다. 나중에
 * `DocumentsService` 가 필요한 태스크는 애플리케이션에서 직접 resolve 하지,
 * 이 모듈을 거치지 않는다.
 */
@Module({
  providers: [CompactionService, PersistenceService, ConnectionRegistry],
  exports: [CompactionService, PersistenceService, ConnectionRegistry],
})
export class RealtimeModule {}
