import 'dotenv/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { apiReference } from '@scalar/nestjs-api-reference';
import type { NextFunction, Request, Response } from 'express';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.use(cookieParser());
  const allowedOrigins = (process.env.WEB_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim());
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('AI-LED Backend API')
    .setDescription('REST API untuk platform penyusunan dokumen LED LAM-Teknik')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  // ponytail: CSP direlaksasi khusus di /reference (halaman dokumentasi statis,
  // bukan permukaan input data) karena Scalar butuh script CDN + inline script
  // bootstrap; upgrade ke CSP nonce-based kalau butuh lebih ketat. Helmet's
  // `contentSecurityPolicy: false` tidak cukup di sini -- itu cuma skip
  // pemasangan header, sedangkan header CSP ketat dari helmet() global di atas
  // sudah lebih dulu terpasang dan perlu di-override, bukan sekadar tidak diisi.
  app.use('/reference', (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self'",
    );
    next();
  });
  app.use(
    '/reference',
    apiReference({ content: document, pageTitle: 'AI-LED Backend API' }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
