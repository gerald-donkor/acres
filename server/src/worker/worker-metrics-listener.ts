import { createServer, type Server } from 'node:http';
import type { MetricsService } from '../metrics/metrics.service';

/** Private, process-local operational transport; it does not mount the Nest API. */
export class WorkerMetricsListener {
  private server?: Server;

  constructor(
    private readonly metrics: Pick<
      MetricsService,
      'getMetrics' | 'contentType'
    >,
  ) {}

  async start(host: string, port: number): Promise<void> {
    if (this.server) throw new Error('Worker metrics listener already started');
    const server = createServer((request, response) => {
      response.setHeader('Cache-Control', 'no-store');
      if (request.url !== '/metrics' && request.url !== '/health') {
        response.writeHead(404).end();
        return;
      }
      if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET');
        response.writeHead(405).end();
        return;
      }
      if (request.url === '/health') {
        response
          .writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
          .end('ok\n');
        return;
      }
      void this.metrics.getMetrics().then(
        (body) =>
          response
            .writeHead(200, { 'Content-Type': this.metrics.contentType })
            .end(body),
        () => response.writeHead(503).end(),
      );
    });
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          resolve();
        });
      });
      this.server = server;
    } catch (error) {
      server.close();
      throw error;
    }
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      // A stalled collector must not hold worker job drain until Compose kills it.
      server.closeAllConnections();
    });
  }
}
