import { Module } from '@nestjs/common';
import { DocumentsModule } from './documents/documents.module.js';
import { PrismaModule } from './prisma.module.js';

@Module({
  imports: [PrismaModule, DocumentsModule],
})
export class AppModule {}
