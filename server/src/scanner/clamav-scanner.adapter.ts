import { Injectable } from '@nestjs/common';
import { Socket } from 'node:net';
import { AcresConfigService } from '../config/acres-config.service';
import type { MalwareScannerPort, ScanResult } from './scanner.port';

@Injectable()
export class ClamavScannerAdapter implements MalwareScannerPort {
  constructor(private readonly config: AcresConfigService) {}

  scanBuffer(buffer: Buffer): Promise<ScanResult> {
    return new Promise((resolve) => {
      const socket = this.connect(() => {
        const size = Buffer.alloc(4);
        size.writeUInt32BE(buffer.length, 0);
        socket.write('zINSTREAM\0');
        socket.write(size);
        socket.write(buffer);
        socket.write(Buffer.alloc(4));
      });
      let response = '';
      socket.on('data', (chunk) => {
        response += chunk.toString('utf8');
      });
      socket.on('end', () => resolve(parseScanResponse(response)));
      socket.on('error', () =>
        resolve({ status: 'failed', errorCode: 'scanner_unavailable' }),
      );
      socket.setTimeout(this.config.clamavScanTimeoutMs, () => {
        socket.destroy();
        resolve({ status: 'failed', errorCode: 'scanner_timeout' });
      });
    });
  }

  readiness(): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = this.connect(() => socket.write('zPING\0'));
      let response = '';
      socket.on('data', (chunk) => {
        response += chunk.toString('utf8');
      });
      socket.on('end', () => resolve(response.includes('PONG')));
      socket.on('error', () => resolve(false));
      socket.setTimeout(this.config.clamavScanTimeoutMs, () => {
        socket.destroy();
        resolve(false);
      });
    });
  }

  private connect(onConnect: () => void): Socket {
    const socket = new Socket();
    socket.connect(this.config.clamavPort, this.config.clamavHost, onConnect);
    return socket;
  }
}

function parseScanResponse(response: string): ScanResult {
  if (response.includes('OK')) return { status: 'clean' };
  const infected = /: (.+) FOUND/.exec(response);
  if (infected) return { status: 'infected', signature: infected[1] };
  return { status: 'failed', errorCode: 'scanner_error' };
}
