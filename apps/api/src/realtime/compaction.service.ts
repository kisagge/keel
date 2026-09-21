import { Injectable, Logger } from '@nestjs/common';
import * as Y from 'yjs';
import { PrismaService } from '../prisma.service.js';
import { foldPlan } from './compaction.js';

@Injectable()
export class CompactionService {
  private readonly log = new Logger(CompactionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 쌓인 로그를 스냅샷 하나로 접는다.
   *
   * **순서를 뒤집지 마라 — 스냅샷을 먼저 쓰고, 그 다음 접힌 행을 지운다.**
   * 반대로 하면 그 사이에 죽었을 때 문서가 사라진다. 이 순서라면 최악이
   * 중복 적용이고, Yjs 업데이트는 멱등이라 손해가 없다.
   */
  async fold(documentId: string, doc: Y.Doc): Promise<boolean> {
    const snapshot = await this.prisma.snapshot.findUnique({ where: { documentId } });
    const tail = await this.prisma.docUpdate.findMany({
      where: { documentId, seq: { gt: snapshot?.throughSeq ?? 0n } },
      orderBy: { seq: 'asc' },
      select: { seq: true },
    });

    const plan = foldPlan(tail.map((r) => r.seq));
    if (!plan.shouldFold) return false;

    await this.writeSnapshot(documentId, doc, plan.throughSeq);
    const { count } = await this.prisma.docUpdate.deleteMany({
      where: { documentId, seq: { lte: plan.throughSeq } },
    });
    this.log.log(`${documentId}: ${count} 행을 ${plan.throughSeq} 까지 접었다`);
    return true;
  }

  /**
   * 스냅샷만 쓴다. 삭제는 부르는 쪽이 이어서 한다.
   *
   * 따로 떼어 둔 이유는 검사가 **스냅샷을 쓴 직후 죽은 상황**을 흉내 낼 수
   * 있어야 하기 때문이다. 그 경우가 무해해야 이 순서가 성립한다.
   */
  async writeSnapshot(documentId: string, doc: Y.Doc, throughSeq: bigint): Promise<void> {
    const state = Buffer.from(Y.encodeStateAsUpdate(doc));
    await this.prisma.snapshot.upsert({
      where: { documentId },
      create: { documentId, state, throughSeq },
      update: { state, throughSeq },
    });
  }
}
