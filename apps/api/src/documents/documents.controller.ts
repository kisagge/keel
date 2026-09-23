import { Controller, Delete, Get, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
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
   * 지우는 것은 오직 진짜 `404` 뿐이다. DB 가 안 보여서 못 세는 경우는 Prisma
   * 오류가 Nest 기본 필터를 그대로 타고 나가 `500` 이 나간다(엄밀히는 `503`
   * 이 더 맞는 이름이지만, 여기서 갈리는 것은 상태 코드의 숫자가 아니라 "이게
   * `404` 냐 아니냐" 하나뿐이라 굳이 잡아 바꾸지 않는다 — `api.test.ts` 가
   * "404 만 없는 것으로 친다" 를 못 박아 두었고, e2e 쪽도 이 500 에 기대어
   * 있다). 그 하나를 뭉개면 서버가 잠깐 아픈 사이에 사람의 오프라인 작업을
   * 우리가 없앤다.
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

  /**
   * 문서를 지운다. 업데이트와 스냅샷은 `onDelete: Cascade` 가 함께 지운다.
   *
   * 인증이 없는 판이라 **id 를 아는 사람이 지울 수 있다.** id 가 곧 권한인
   * 구조의 대가이고, 인증이 얹힐 때 여기에 소유자 검사가 붙는다.
   */
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.documents.remove(id);
  }
}
