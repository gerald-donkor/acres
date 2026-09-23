import { request } from 'node:http';
import { WorkerMetricsListener } from './worker-metrics-listener';
import { MetricsService } from '../metrics/metrics.service';
import type { PrismaService } from '../prisma/prisma.service';

async function get(port: number, path: string, method = 'GET') {
  return new Promise<{
    status: number;
    body: string;
    type: string | undefined;
  }>((resolve, reject) => {
    const req = request(
      { hostname: '127.0.0.1', port, path, method },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          body += chunk;
        });
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body,
            type: res.headers['content-type'],
          }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('WorkerMetricsListener', () => {
  let listener: WorkerMetricsListener;
  let port: number;

  afterEach(async () => {
    await listener?.stop();
  });

  it('serves only exact GET routes after startup and exposes worker pool and queue samples', async () => {
    const prisma = {
      getPoolSnapshot: () => ({ total: 2, idle: 1, waiting: 0, max: 10 }),
      outboxEvent: { count: () => Promise.resolve(3) },
    } as unknown as PrismaService;
    const metrics = new MetricsService(prisma);
    metrics.recordQueueJob('acres-ingestion', 'completed');
    listener = new WorkerMetricsListener(metrics);
    await listener.start('127.0.0.1', 0);
    port = listenerAddress(listener);
    expect((await get(port, '/health')).status).toBe(200);
    const scrape = await get(port, '/metrics');
    expect(scrape.status).toBe(200);
    expect(scrape.type).toBe(metrics.contentType);
    expect(scrape.body).toContain('acres_postgres_pool_connections_total 2');
    expect(scrape.body).toContain(
      'acres_queue_jobs_total{queue_name="acres-ingestion",status="completed"} 1',
    );
    expect((await get(port, '/metrics?x=1')).status).toBe(404);
    expect((await get(port, '/health/')).status).toBe(404);
    expect((await get(port, '/metrics', 'POST')).status).toBe(405);
    metrics.onModuleDestroy();
  });

  it('fails the scrape when the worker pool snapshot fails', async () => {
    const prisma = {
      getPoolSnapshot: () => {
        throw new Error('private database URL');
      },
      outboxEvent: { count: () => Promise.resolve(0) },
    } as unknown as PrismaService;
    const metrics = new MetricsService(prisma);
    listener = new WorkerMetricsListener(metrics);
    await listener.start('127.0.0.1', 0);
    const scrape = await get(listenerAddress(listener), '/metrics');
    expect(scrape.status).toBe(503);
    expect(scrape.body).not.toContain('private database URL');
    metrics.onModuleDestroy();
  });

  it('closes promptly while a scrape collector is stalled', async () => {
    let release!: (value: string) => void;
    const stalled = new Promise<string>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const collecting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    listener = new WorkerMetricsListener({
      contentType: 'text/plain',
      getMetrics: () => {
        entered();
        return stalled;
      },
    });
    await listener.start('127.0.0.1', 0);
    const pending = get(listenerAddress(listener), '/metrics').catch(
      () => undefined,
    );
    await collecting;
    await Promise.race([
      listener.stop(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('listener close stalled')), 1000),
      ),
    ]);
    release('late scrape');
    await pending;
  });

  it('redacts collector failure and can stop twice', async () => {
    listener = new WorkerMetricsListener({
      contentType: 'text/plain',
      getMetrics: () => Promise.reject(new Error('secret connection string')),
    });
    await listener.start('127.0.0.1', 0);
    port = listenerAddress(listener);
    const scrape = await get(port, '/metrics');
    expect(scrape.status).toBe(503);
    expect(scrape.body).not.toContain('secret');
    await listener.stop();
    await listener.stop();
  });
});

function listenerAddress(listener: WorkerMetricsListener): number {
  const server = (
    listener as unknown as { server: { address(): { port: number } } }
  ).server;
  return server.address().port;
}
