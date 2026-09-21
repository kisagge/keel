import { Module } from '@nestjs/common';
import { DocumentsModule } from './documents/documents.module.js';
import { PrismaService } from './prisma.service.js';

@Module({
  imports: [DocumentsModule],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule {}
