import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * `PrismaService` 를 딱 한 번만 선언해 두는 자리.
 *
 * Nest 는 모듈마다 `providers` 에 같은 클래스를 적으면 모듈마다 **따로**
 * 인스턴스를 만든다 — import 로 엮이지 않은 두 모듈이 각자
 * `providers: [PrismaService]` 를 적으면 `onModuleInit`(`$connect()`) 도 두
 * 번 돌고, 연결 풀도 두 개가 뜬다. `prisma.service.ts` 의 주석이 막으려던
 * 바로 그 일이 모듈 경계에서 다시 일어나는 것이다. 여기서 한 번만 선언하고
 * `@Global()` 로 모든 모듈에 내보내, 문서를 다루는 모듈이 늘어나도
 * (task 5·7·8·12) 각자 `providers` 에 다시 적을 필요가 없게 한다.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
