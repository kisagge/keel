import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';

/**
 * `PrismaService` 를 여기 다시 적지 않는다 — 이 모듈은 그것을 주입받아 쓸 뿐,
 * 소유하지 않는다. 소유는 `PrismaModule` 하나뿐이다(`@Global()`).
 */
@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
