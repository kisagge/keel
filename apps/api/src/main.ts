import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { attachRealtime } from './realtime/connection.js';

const PORT = Number(process.env['PORT'] ?? 4000);

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  // 화면은 다른 출처에서 뜬다(Next 는 3000, 여기는 4000).
  app.enableCors({ origin: true });
  // listen 보다 먼저 건다 — 그 사이 창에 들어온 upgrade 요청은 상태 없이
  // 버려진다
  attachRealtime(app.getHttpServer(), app);
  await app.listen(PORT);
}

await bootstrap();
