import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: process.env.ANALYTICS_CORS_ORIGIN?.split(',') ?? true });
  app.setGlobalPrefix('api');
  await app.listen(Number(process.env.PORT ?? 3001), process.env.HOST ?? '0.0.0.0');
}

void bootstrap();
