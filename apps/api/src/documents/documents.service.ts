import { Injectable } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { PrismaService } from '../prisma.service.js';
import { SEED } from './seed.js';
import { seedUpdate } from './seed-update.js';

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 문서를 만들고 씨앗을 첫 업데이트로 심는다.
   *
   * **한 트랜잭션이어야 한다.** 문서 행만 생기고 씨앗이 안 들어간 상태로
   * 남으면, 그 URL 은 열리는데 내용이 비어 있다 — 사용자는 "저장이 깨졌다"
   * 고 읽고 우리는 원인을 못 찾는다.
   */
  async create(): Promise<{ id: string }> {
    const id = nanoid(21);
    await this.prisma.$transaction([
      this.prisma.document.create({ data: { id } }),
      this.prisma.docUpdate.create({
        data: { documentId: id, update: Buffer.from(seedUpdate(SEED)) },
      }),
    ]);
    return { id };
  }

  async find(id: string): Promise<{ id: string; createdAt: Date; updatedAt: Date } | null> {
    return this.prisma.document.findUnique({
      where: { id },
      select: { id: true, createdAt: true, updatedAt: true },
    });
  }
}
