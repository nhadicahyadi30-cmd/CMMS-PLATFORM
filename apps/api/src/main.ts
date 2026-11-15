import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json, raw } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // rawBody dibutuhkan untuk verifikasi tanda tangan webhook WhatsApp
  app.use(json({ limit: '2mb', verify: (req: any, _res, buf) => { req.rawBody = buf; } }));
  // unggah lampiran: badan mentah, hanya untuk tipe berkas yang didukung
  app.use(raw({ type: ['image/*', 'application/pdf'], limit: '11mb' }));
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3001), '0.0.0.0');
}
bootstrap();
