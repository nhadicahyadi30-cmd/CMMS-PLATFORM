import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // rawBody dibutuhkan untuk verifikasi tanda tangan webhook WhatsApp
  app.use(json({ limit: '2mb', verify: (req: any, _res, buf) => { req.rawBody = buf; } }));
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3001), '0.0.0.0');
}
bootstrap();
