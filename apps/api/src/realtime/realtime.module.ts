import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module.js';
import { CompactionService } from './compaction.service.js';

/**
 * `PrismaService` 를 여기 다시 적지 않는다 — 이 모듈은 그것을 주입받아 쓸 뿐,
 * 소유하지 않는다. 소유는 `PrismaModule` 하나뿐이다(`@Global()`).
 */
@Module({
  imports: [DocumentsModule],
  providers: [CompactionService],
  exports: [CompactionService],
})
export class RealtimeModule {}
