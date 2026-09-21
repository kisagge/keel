import { Injectable, Logger } from '@nestjs/common';
import * as Y from 'yjs';
import { PrismaService } from '../prisma.service.js';
import { CompactionService } from './compaction.service.js';
import { FOLD_THRESHOLD } from './compaction.js';
import { RESTORE, restoreInto } from './restore.js';

@Injectable()
export class PersistenceService {
  private readonly log = new Logger(PersistenceService.name);

  /**
   * 문서마다 쓰기를 **한 줄로 세운다.**
   *
   * `doc.on('update')` 는 동기로 울리는데 DB 쓰기는 비동기다. 그냥 쏘아
   * 두면 두 쓰기가 겹쳐 `seq` 가 들어온 순서와 어긋날 수 있고, **재생 순서가
   * 곧 문서**라 그 순간 문서가 달라진다.
   */
  private readonly queues = new Map<string, Promise<void>>();

  /** 문서마다 마지막 접기 이후 쌓은 횟수. 메모리에만 있다 */
  private readonly appended = new Map<string, number>();

  /** Task 8 이 채운다. 기본은 로그만 남긴다 */
  onFailure: (documentId: string, error: unknown) => void = (documentId, error) => {
    this.log.error(`${documentId}: 저장 실패`, error);
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly compaction: CompactionService,
  ) {}

  async bindState(documentId: string, doc: Y.Doc): Promise<void> {
    const snapshot = await this.prisma.snapshot.findUnique({ where: { documentId } });
    const tail = await this.prisma.docUpdate.findMany({
      where: { documentId, seq: { gt: snapshot?.throughSeq ?? 0n } },
      orderBy: { seq: 'asc' },
    });

    restoreInto(
      doc,
      snapshot === null ? undefined : new Uint8Array(snapshot.state),
      tail.map((row) => new Uint8Array(row.update)),
    );

    this.appended.set(documentId, tail.length);

    doc.on('update', (update: Uint8Array, origin: unknown) => {
      // 복원이 낸 변화는 이미 저장된 것이다. 도로 쓰면 로그가 두 배가 된다
      if (origin === RESTORE) return;
      this.enqueue(documentId, async () => {
        await this.prisma.docUpdate.create({
          data: { documentId, update: Buffer.from(update) },
        });
        const n = (this.appended.get(documentId) ?? 0) + 1;
        this.appended.set(documentId, n);

        // 아무도 안 나가는 문서는 writeState 가 영영 안 불린다.
        // 둘이 하루 종일 붙어 있는 문서가 로그가 제일 길다
        if (n > FOLD_THRESHOLD) {
          if (await this.compaction.fold(documentId, doc)) this.appended.set(documentId, 0);
        }
      });
    });
  }

  async writeState(documentId: string, doc: Y.Doc): Promise<void> {
    await this.settled(documentId);
    if (await this.compaction.fold(documentId, doc)) this.appended.set(documentId, 0);
  }

  /** 이 문서의 쓰기 큐가 빌 때까지 기다린다 */
  async settled(documentId: string): Promise<void> {
    await (this.queues.get(documentId) ?? Promise.resolve());
  }

  private enqueue(documentId: string, work: () => Promise<void>): void {
    const previous = this.queues.get(documentId) ?? Promise.resolve();
    const next = previous.then(work).catch((error: unknown) => {
      this.onFailure(documentId, error);
    });
    this.queues.set(documentId, next);
  }
}
