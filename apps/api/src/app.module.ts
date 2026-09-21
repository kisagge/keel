import { Module } from '@nestjs/common';
import { DocumentsModule } from './documents/documents.module.js';
import { PrismaModule } from './prisma.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';

@Module({
  imports: [PrismaModule, DocumentsModule, RealtimeModule],
})
export class AppModule {}
