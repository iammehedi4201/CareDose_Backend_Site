import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { validateJwtSecretStrength } from './auth/token.service';

export function resolveCorsConfig(): {
  origin: boolean | string[];
  credentials: boolean;
} {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (raw && raw.length > 0) {
    const allowlist = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return { origin: allowlist, credentials: false };
  }
  if (process.env.NODE_ENV === 'production') {
    return { origin: false, credentials: false };
  }
  return { origin: true, credentials: false };
}

async function bootstrap(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    validateJwtSecretStrength(process.env.JWT_SECRET, 'production');
  }

  const app = await NestFactory.create(AppModule);
  app.use(json({ limit: '2mb' }));
  app.use(urlencoded({ extended: true, limit: '2mb' }));
  app.setGlobalPrefix('api/v1');
  app.enableCors(resolveCorsConfig());
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`CareDose API listening on http://localhost:${port}/api/v1`, 'Bootstrap');
}

void bootstrap();
