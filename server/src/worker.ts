import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AcresConfigService } from './config/acres-config.service';
import { MetricsService } from './metrics/metrics.service';
import { WorkerModule } from './worker/worker.module';
import { UploadWorkerService } from './worker/upload-worker.service';
import { WorkerMetricsListener } from './worker/worker-metrics-listener';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });
  const worker = app.get(UploadWorkerService);
  const config = app.get(AcresConfigService);
  const listener = new WorkerMetricsListener(app.get(MetricsService));
  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    let failure: unknown;
    try {
      await listener.stop();
    } catch (error) {
      failure = error;
    }
    try {
      await worker.stop();
    } catch (error) {
      failure ??= error;
    }
    try {
      await app.close();
    } catch (error) {
      failure ??= error;
    }
    if (failure)
      throw failure instanceof Error
        ? failure
        : new Error('Worker shutdown failed');
  };

  try {
    await worker.start();
    await listener.start(config.workerMetricsHost, config.workerMetricsPort);
    process.once(
      'SIGTERM',
      () =>
        void shutdown().catch((error: unknown) => {
          console.error(error);
          process.exitCode = 1;
        }),
    );
    process.once(
      'SIGINT',
      () =>
        void shutdown().catch((error: unknown) => {
          console.error(error);
          process.exitCode = 1;
        }),
    );
  } catch (error) {
    await shutdown();
    throw error;
  }
}

void bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
