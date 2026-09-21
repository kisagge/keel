import { Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import type { CreateDocumentResponse, DocumentSummary } from '@keel/contract';
import { DocumentsService } from './documents.service.js';

@Controller('d')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post()
  async create(): Promise<CreateDocumentResponse> {
    return this.documents.create();
  }

  /**
   * 존재 확인이 목적이다. 이 응답이 **브라우저에 남은 사본을 지울지** 가른다 —
   * 404 면 지우고, DB 가 안 보여서 못 세는 경우는 503 이라 지키지 않는다.
   * 둘을 뭉개면 서버가 잠깐 아픈 사이에 사람의 오프라인 작업을 우리가 없앤다.
   */
  @Get(':id')
  async find(@Param('id') id: string): Promise<DocumentSummary> {
    const found = await this.documents.find(id);
    if (found === null) throw new NotFoundException();
    return {
      id: found.id,
      createdAt: found.createdAt.toISOString(),
      updatedAt: found.updatedAt.toISOString(),
    };
  }
}
