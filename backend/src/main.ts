import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  // 统一前缀 /api/v1
  app.setGlobalPrefix('api/v1');

  // CORS：允许前端（本地 dev / IGA Pages / nginx）跨域访问与 SSE
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // DTO 校验：自动剔除未声明字段
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`TripAgent backend ready at http://localhost:${port}/api/v1`, 'Bootstrap');
}

await bootstrap();
