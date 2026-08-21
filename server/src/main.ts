import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { AcresConfigService } from './config/acres-config.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const config = app.get(AcresConfigService);
  await app.listen(config.port);

  new Logger('Bootstrap').log(
    `Acres API listening on http://localhost:${config.port} (${config.nodeEnv})`,
  );
}

void bootstrap();
