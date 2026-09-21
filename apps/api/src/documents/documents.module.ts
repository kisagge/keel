import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';

@Module({
  controllers: [DocumentsController],
  providers: [PrismaService, DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
