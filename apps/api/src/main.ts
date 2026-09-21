import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

const PORT = Number(process.env['PORT'] ?? 4000);

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  // 화면은 다른 출처에서 뜬다(Next 는 3000, 여기는 4000).
  app.enableCors({ origin: true });
  await app.listen(PORT);
}

await bootstrap();
