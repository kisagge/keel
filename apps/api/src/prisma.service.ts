import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaClient 수명을 Nest 에 묶는다.
 *
 * 모듈 밖에서 `new PrismaClient()` 를 흩뿌리면 프로세스마다 연결 풀이 여럿
 * 생기고, 검사가 끝나도 안 닫혀 vitest 가 안 죽는다.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
