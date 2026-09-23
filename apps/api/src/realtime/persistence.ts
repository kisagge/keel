import { Injectable, Logger } from '@nestjs/common';
import * as Y from 'yjs';
import { PrismaService } from '../prisma.service.js';
import { CompactionService } from './compaction.service.js';
import { FOLD_THRESHOLD } from './compaction.js';
import { RESTORE, restoreInto } from './restore.js';
import { WriteQueue } from './write-queue.js';

@Injectable()
export class PersistenceService {
  private readonly log = new Logger(PersistenceService.name);

  /**
   * 문서마다 쓰기를 **한 줄로 세운다.**
   *
   * `doc.on('update')` 는 동기로 울리는데 DB 쓰기는 비동기다. 그냥 쏘아
   * 두면 두 쓰기가 겹쳐 `seq` 가 들어온 순서와 어긋날 수 있고, **재생 순서가
   * 곧 문서**라 그 순간 문서가 달라진다. 줄 세우는 로직 자체는
   * `write-queue.ts` 에 떼어 뒀다 — DB 없이 순서만 검사할 수 있어야 해서다.
   */
  private readonly writes = new WriteQueue((documentId, error) => this.onFailure(documentId, error));

  /** 문서마다 마지막 접기 이후 쌓은 횟수. 메모리에만 있다 */
  private readonly appended = new Map<string, number>();

  /** Task 8 이 채운다. 기본은 로그만 남긴다 */
  onFailure: (documentId: string, error: unknown) => void = (documentId, error) => {
    this.log.error(`${documentId}: 저장 실패`, error);
  };

  /**
   * 복원이 실패한 문서. **재시작 전까지 이 프로세스에서 다시 열리지 않는다.**
   *
   * 부분 복원된 문서를 내보내면 그 위의 편집이 갈라진 역사로 쌓인다. 자동으로
   * 되살리려 애쓰는 것보다 사람이 보는 쪽이 맞다 — 복원이 실패했다는 것은
   * 저장된 것이 깨졌다는 뜻이고, 그건 사람이 들여다볼 일이다.
   */
  private readonly broken = new Set<string>();

  poisoned(documentId: string): boolean {
    return this.broken.has(documentId);
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly compaction: CompactionService,
  ) {}

  async bindState(documentId: string, doc: Y.Doc): Promise<void> {
    // 두 읽기를 한 트랜잭션으로 묶는다 — 그냥 따로 읽는 두 개의 무해한 select
    // 처럼 보여도 지우면 안 된다. 스냅샷을 읽은 뒤 접기가 그 사이에 끼어들면
    // (스냅샷을 쓰고 접힌 행을 지우는 것이 바로 이 자리다), throughSeq 아래를
    // 덮는 스냅샷은 못 보고 꼬리는 이미 줄어든 뒤를 읽어 그 구간이 통째로
    // 빈다. 접속을 여는 매 순간이 이 경합의 창이라 사람이 새로고침만 해도
    // 닿는다 — 부분 복원을 조용히 내보내느니 읽기를 한 스냅샷에 묶어 막는다.
    const [snapshot, tail] = await this.prisma.$transaction(
      async (tx) => {
        const s = await tx.snapshot.findUnique({ where: { documentId } });
        const t = await tx.docUpdate.findMany({
          where: { documentId, seq: { gt: s?.throughSeq ?? 0n } },
          orderBy: { seq: 'asc' },
        });
        return [s, t] as const;
      },
      { isolationLevel: 'RepeatableRead' },
    );

    this.appended.set(documentId, tail.length);

    // 리스너를 복원보다 먼저 건다. 지금은 restoreInto 가 동기라 어느 순서든
    // 결과가 같아 보이지만, 그건 우연이다 — 나중에 복원이 행을 스트리밍하거나
    // 중간에 await 를 타면 update 이벤트가 리스너 등록 뒤에 도착하게 된다.
    // 그때 리스너가 없으면 그냥 새는 게 아니라, 있어도 RESTORE 가드가 없으면
    // 복원이 낸 변화를 그대로 도로 쓴다. 그래서 가드가 실제로 걸러내도록
    // 리스너를 먼저 걸고, 가드(다음 줄들)가 복원이 내는 update 를 잡아 낸다.
    doc.on('update', (update: Uint8Array, origin: unknown) => {
      // 복원이 낸 변화는 이미 저장된 것이다. 도로 쓰면 로그가 두 배가 된다
      if (origin === RESTORE) return;
      this.writes.enqueue(documentId, async () => {
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

    try {
      restoreInto(
        doc,
        snapshot === null ? undefined : new Uint8Array(snapshot.state),
        tail.map((row) => new Uint8Array(row.update)),
      );
    } catch (error) {
      this.broken.add(documentId);
      this.onFailure(documentId, error);
      throw error;
    }
  }

  async writeState(documentId: string, doc: Y.Doc): Promise<void> {
    await this.settled(documentId);
    if (await this.compaction.fold(documentId, doc)) this.appended.set(documentId, 0);
  }

  /** 이 문서의 쓰기 줄이 빌 때까지 기다린다 */
  async settled(documentId: string): Promise<void> {
    await this.writes.settled(documentId);
  }
}
