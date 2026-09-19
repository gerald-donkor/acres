import { EventEmitter } from 'node:events';
import { Socket } from 'node:net';
import type { AcresConfigService } from '../config/acres-config.service';
import { ClamavScannerAdapter } from './clamav-scanner.adapter';

jest.mock('node:net');

class MockSocket extends EventEmitter {
  connect = jest.fn((...args: unknown[]): this => {
    const onConnect = args[2];
    if (typeof onConnect === 'function') {
      process.nextTick(onConnect);
    }
    return this;
  });
  write = jest.fn();
  destroy = jest.fn();
  setTimeout = jest.fn();
}

describe('ClamavScannerAdapter', () => {
  let adapter: ClamavScannerAdapter;
  let mockSocket: MockSocket;
  const mockConfig = {
    clamavPort: 3310,
    clamavHost: 'localhost',
    clamavScanTimeoutMs: 5000,
  } as AcresConfigService;

  beforeEach(() => {
    mockSocket = new MockSocket();
    (Socket as unknown as jest.Mock).mockImplementation(() => mockSocket);
    adapter = new ClamavScannerAdapter(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('scanBuffer', () => {
    it('resolves clean scan result when clamav returns OK and sends correct stream framing', async () => {
      const payload = Buffer.from('test clean payload data');
      const scanPromise = adapter.scanBuffer(payload);

      await new Promise((resolve) => process.nextTick(resolve));

      expect(mockSocket.connect).toHaveBeenCalledWith(
        3310,
        'localhost',
        expect.any(Function),
      );

      expect(mockSocket.write).toHaveBeenNthCalledWith(1, 'zINSTREAM\0');
      const calls = mockSocket.write.mock.calls as unknown[][];
      const firstArg = calls[1]?.[0];
      expect(Buffer.isBuffer(firstArg)).toBe(true);
      const sizeBuf = firstArg as Buffer;
      expect(sizeBuf.readUInt32BE(0)).toBe(payload.length);
      expect(mockSocket.write).toHaveBeenNthCalledWith(2, sizeBuf);
      expect(mockSocket.write).toHaveBeenNthCalledWith(3, payload);
      const endArg = calls[3]?.[0];
      expect(Buffer.isBuffer(endArg)).toBe(true);
      const endBuf = endArg as Buffer;
      expect(endBuf.equals(Buffer.alloc(4))).toBe(true);

      mockSocket.emit('data', Buffer.from('stream: OK\0'));
      mockSocket.emit('end');

      const result = await scanPromise;
      expect(result).toEqual({ status: 'clean' });
    });

    it('resolves infected scan result with signature when virus is found', async () => {
      const payload = Buffer.from(
        'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
      );
      const scanPromise = adapter.scanBuffer(payload);

      await new Promise((resolve) => process.nextTick(resolve));

      mockSocket.emit(
        'data',
        Buffer.from('stream: Win.Test.EICAR_HDB-1 FOUND\0'),
      );
      mockSocket.emit('end');

      const result = await scanPromise;
      expect(result).toEqual({
        status: 'infected',
        signature: 'Win.Test.EICAR_HDB-1',
      });
    });

    it('resolves scanner_error when response does not contain OK or FOUND', async () => {
      const payload = Buffer.from('arbitrary data');
      const scanPromise = adapter.scanBuffer(payload);

      await new Promise((resolve) => process.nextTick(resolve));

      mockSocket.emit('data', Buffer.from('UNKNOWN_UNEXPECTED_RESPONSE'));
      mockSocket.emit('end');

      const result = await scanPromise;
      expect(result).toEqual({
        status: 'failed',
        errorCode: 'scanner_error',
      });
    });

    it('resolves scanner_unavailable when socket emits error event', async () => {
      const payload = Buffer.from('data');
      const scanPromise = adapter.scanBuffer(payload);

      await new Promise((resolve) => process.nextTick(resolve));

      mockSocket.emit('error', new Error('ECONNREFUSED'));

      const result = await scanPromise;
      expect(result).toEqual({
        status: 'failed',
        errorCode: 'scanner_unavailable',
      });
    });

    it('resolves scanner_timeout and destroys socket on timeout', async () => {
      let timeoutCb: (() => void) | undefined;
      mockSocket.setTimeout.mockImplementation((...args: unknown[]) => {
        timeoutCb = args[1] as (() => void) | undefined;
        return mockSocket;
      });

      const payload = Buffer.from('data');
      const scanPromise = adapter.scanBuffer(payload);

      await new Promise((resolve) => process.nextTick(resolve));

      expect(mockSocket.setTimeout).toHaveBeenCalledWith(
        5000,
        expect.any(Function),
      );
      expect(timeoutCb).toBeDefined();
      timeoutCb?.();

      expect(mockSocket.destroy).toHaveBeenCalled();
      const result = await scanPromise;
      expect(result).toEqual({
        status: 'failed',
        errorCode: 'scanner_timeout',
      });
    });
  });

  describe('readiness', () => {
    it('resolves true when clamav responds with PONG', async () => {
      const readinessPromise = adapter.readiness();

      await new Promise((resolve) => process.nextTick(resolve));

      expect(mockSocket.write).toHaveBeenCalledWith('zPING\0');
      mockSocket.emit('data', Buffer.from('PONG\0'));
      mockSocket.emit('end');

      const isReady = await readinessPromise;
      expect(isReady).toBe(true);
    });

    it('resolves false when clamav response does not include PONG', async () => {
      const readinessPromise = adapter.readiness();

      await new Promise((resolve) => process.nextTick(resolve));

      mockSocket.emit('data', Buffer.from('UNEXPECTED'));
      mockSocket.emit('end');

      const isReady = await readinessPromise;
      expect(isReady).toBe(false);
    });

    it('resolves false on socket error', async () => {
      const readinessPromise = adapter.readiness();

      await new Promise((resolve) => process.nextTick(resolve));

      mockSocket.emit('error', new Error('ECONNRESET'));

      const isReady = await readinessPromise;
      expect(isReady).toBe(false);
    });

    it('resolves false on socket timeout and destroys socket', async () => {
      let timeoutCb: (() => void) | undefined;
      mockSocket.setTimeout.mockImplementation((...args: unknown[]) => {
        timeoutCb = args[1] as (() => void) | undefined;
        return mockSocket;
      });

      const readinessPromise = adapter.readiness();

      await new Promise((resolve) => process.nextTick(resolve));

      expect(mockSocket.setTimeout).toHaveBeenCalledWith(
        5000,
        expect.any(Function),
      );
      expect(timeoutCb).toBeDefined();
      timeoutCb?.();

      expect(mockSocket.destroy).toHaveBeenCalled();
      const isReady = await readinessPromise;
      expect(isReady).toBe(false);
    });
  });
});
