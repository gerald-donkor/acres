import { Logger } from '@nestjs/common';
import type { AcresConfigService } from '../config/acres-config.service';
import { SIGNATURE_CHECK } from './sandbox-signature-check';
import {
  VercelSandboxScannerAdapter,
  type ScanSandbox,
  type ScanSandboxCreateParams,
} from './vercel-sandbox-scanner.adapter';

const DIGEST = `sha256:${'a'.repeat(64)}`;
const IMAGE = `vcr.vercel.com/team/acres/acres-scanner@${DIGEST}`;
const UPLOAD = '/tmp/acres-scan-upload';

const config = {
  scannerSandboxImage: IMAGE,
  scannerMainSha256: 'b'.repeat(64),
  scannerDailySha256: 'c'.repeat(64),
  scannerMaxSignatureAgeHours: 48,
  scannerSandboxTimeoutMs: 120000,
} as unknown as AcresConfigService;

type Answer = { exitCode: number; stdout: string } | Error;

function sandboxDouble(
  answers: { check?: Answer; scan?: Answer } = {},
  options: {
    image?: string | undefined;
    failWrite?: boolean;
    failStop?: boolean;
    failDelete?: boolean;
  } = {},
) {
  const events: string[] = [];
  const commands: { cmd: string; args: string[]; timeoutMs: number }[] = [];
  const written: { path: string; content: Buffer }[] = [];
  const answer = (a: Answer) => {
    if (a instanceof Error) throw a;
    return { exitCode: a.exitCode, stdout: () => Promise.resolve(a.stdout) };
  };
  const sandbox: ScanSandbox = {
    name: 'sbx-test',
    image: 'image' in options ? options.image : IMAGE,
    runCommand: (params) => {
      commands.push(params);
      events.push(`run:${params.cmd}`);
      return Promise.resolve().then(() =>
        params.cmd === 'node'
          ? answer(answers.check ?? { exitCode: 0, stdout: 'signatures-ok\n' })
          : answer(answers.scan ?? { exitCode: 0, stdout: `${UPLOAD}: OK\n` }),
      );
    },
    writeFiles: (files) => {
      events.push('write');
      written.push(...files);
      return options.failWrite
        ? Promise.reject(new Error('write failure'))
        : Promise.resolve();
    },
    stop: (opts) => {
      expect(opts.signal).toBeInstanceOf(AbortSignal);
      events.push('stop');
      return options.failStop
        ? Promise.reject(new Error('stop failure'))
        : Promise.resolve();
    },
    delete: (opts) => {
      expect(opts.deleteOrphanSnapshots).toBe(true);
      expect(opts.signal).toBeInstanceOf(AbortSignal);
      events.push('delete');
      return options.failDelete
        ? Promise.reject(new Error('delete failure'))
        : Promise.resolve();
    },
  };
  const creates: ScanSandboxCreateParams[] = [];
  const create = jest.fn((params: ScanSandboxCreateParams) => {
    creates.push(params);
    return Promise.resolve(sandbox);
  });
  return { create, creates, events, commands, written };
}

const scan = (double: ReturnType<typeof sandboxDouble>, bytes = 'a,b\n1,2\n') =>
  new VercelSandboxScannerAdapter(config, double.create).scanBuffer(
    Buffer.from(bytes),
  );

describe('VercelSandboxScannerAdapter', () => {
  let logs: string[];

  beforeEach(() => {
    logs = [];
    for (const level of ['log', 'warn', 'error'] as const) {
      jest
        .spyOn(Logger.prototype, level)
        .mockImplementation((...args: unknown[]) => {
          logs.push(String(args[0]));
        });
    }
  });

  afterEach(() => jest.restoreAllMocks());

  it('boots a non-persistent deny-all one-vCPU VM with no env, then scans clean', async () => {
    const double = sandboxDouble();
    await expect(scan(double)).resolves.toEqual({ status: 'clean' });
    expect(double.creates).toHaveLength(1);
    const [params] = double.creates;
    expect(params).toMatchObject({
      image: IMAGE,
      persistent: false,
      networkPolicy: 'deny-all',
      resources: { vcpus: 1 },
      timeout: 120000,
    });
    expect(params.signal).toBeInstanceOf(AbortSignal);
    expect(Object.keys(params).sort()).toEqual(
      [
        'image',
        'networkPolicy',
        'persistent',
        'resources',
        'signal',
        'timeout',
      ].sort(),
    );
    expect(double.events).toEqual([
      'run:node',
      'write',
      'run:clamscan',
      'stop',
      'delete',
    ]);
  });

  it('runs the shared signature check with the pinned hashes and age', async () => {
    const double = sandboxDouble();
    await scan(double);
    expect(double.commands[0]).toEqual({
      cmd: 'node',
      args: ['-e', SIGNATURE_CHECK, 'b'.repeat(64), 'c'.repeat(64), '48'],
      timeoutMs: 30000,
    });
  });

  it('writes the bytes to a fixed path and scans with the limit alert', async () => {
    const double = sandboxDouble();
    await scan(double, 'region,value\n');
    expect(double.written).toEqual([
      { path: UPLOAD, content: Buffer.from('region,value\n') },
    ]);
    const clamscan = double.commands[1];
    expect(clamscan.cmd).toBe('clamscan');
    expect(clamscan.args).toEqual([
      '--no-summary',
      '--database=/var/lib/clamav',
      '--max-filesize=50M',
      '--max-scansize=50M',
      '--alert-exceeds-max=yes',
      UPLOAD,
    ]);
    expect(clamscan.timeoutMs).toBeGreaterThan(100000);
    expect(clamscan.timeoutMs).toBeLessThanOrEqual(110000);
  });

  it('reports infected with the signature name', async () => {
    const double = sandboxDouble({
      scan: { exitCode: 1, stdout: `${UPLOAD}: Eicar-Test-Signature FOUND\n` },
    });
    await expect(scan(double)).resolves.toEqual({
      status: 'infected',
      signature: 'Eicar-Test-Signature',
    });
    expect(double.events.slice(-2)).toEqual(['stop', 'delete']);
  });

  it.each([
    ['absent', ''],
    ['too long', `${UPLOAD}: ${'x'.repeat(201)} FOUND\n`],
  ])('omits a signature that is %s', async (_label, stdout) => {
    const double = sandboxDouble({ scan: { exitCode: 1, stdout } });
    await expect(scan(double)).resolves.toEqual({ status: 'infected' });
  });

  it.each([
    [
      'exit 2 with a limit alert',
      2,
      `${UPLOAD}: Heuristics.Limits.Exceeded.MaxFileSize FOUND\n`,
    ],
    ['exit 0 without the OK line', 0, ''],
    ['exit 137', 137, ''],
  ])('fails closed on %s', async (_label, exitCode, stdout) => {
    const double = sandboxDouble({ scan: { exitCode, stdout } });
    await expect(scan(double)).resolves.toEqual({
      status: 'failed',
      errorCode: 'scanner_error',
    });
    expect(double.events.slice(-2)).toEqual(['stop', 'delete']);
  });

  it('maps a rejected scan command to scanner_timeout', async () => {
    const double = sandboxDouble({ scan: new Error('session ended') });
    await expect(scan(double)).resolves.toEqual({
      status: 'failed',
      errorCode: 'scanner_timeout',
    });
    expect(double.events.slice(-2)).toEqual(['stop', 'delete']);
  });

  it('maps a create failure to scanner_unavailable with nothing to clean', async () => {
    const double = sandboxDouble();
    double.create.mockRejectedValueOnce(new Error('token=secret'));
    await expect(scan(double)).resolves.toEqual({
      status: 'failed',
      errorCode: 'scanner_unavailable',
    });
    expect(double.events).toEqual([]);
    expect(logs.join('\n')).not.toContain('secret');
  });

  it.each([
    ['a non-zero exit', { exitCode: 3, stdout: '' }],
    ['exit 0 without the marker', { exitCode: 0, stdout: '' }],
    ['a rejected command', new Error('timeout')],
  ] as [string, Answer][])(
    'maps a signature check with %s to scanner_unavailable',
    async (_label, check) => {
      const double = sandboxDouble({ check });
      await expect(scan(double)).resolves.toEqual({
        status: 'failed',
        errorCode: 'scanner_unavailable',
      });
      expect(double.events).not.toContain('write');
      expect(double.events.slice(-2)).toEqual(['stop', 'delete']);
    },
  );

  it.each([
    [
      'another digest',
      `vcr.vercel.com/team/acres/acres-scanner@sha256:${'f'.repeat(64)}`,
    ],
    ['no image', undefined],
  ])('refuses a VM booted from %s', async (_label, image) => {
    const double = sandboxDouble({}, { image });
    await expect(scan(double)).resolves.toEqual({
      status: 'failed',
      errorCode: 'scanner_unavailable',
    });
    expect(double.commands).toEqual([]);
    expect(double.events).toEqual(['stop', 'delete']);
  });

  it('refuses an oversize buffer without creating a VM', async () => {
    const double = sandboxDouble();
    const adapter = new VercelSandboxScannerAdapter(config, double.create);
    await expect(
      adapter.scanBuffer(Buffer.alloc(50 * 1024 * 1024 + 1)),
    ).resolves.toEqual({ status: 'failed', errorCode: 'scanner_error' });
    expect(double.create).not.toHaveBeenCalled();
  });

  it('maps a write failure to scanner_error and still cleans up', async () => {
    const double = sandboxDouble({}, { failWrite: true });
    await expect(scan(double)).resolves.toEqual({
      status: 'failed',
      errorCode: 'scanner_error',
    });
    expect(double.events.slice(-2)).toEqual(['stop', 'delete']);
  });

  it.each([
    ['stop', { failStop: true }],
    ['delete', { failDelete: true }],
  ])('turns clean into failed when %s fails', async (_label, options) => {
    const double = sandboxDouble({}, options);
    await expect(scan(double)).resolves.toEqual({
      status: 'failed',
      errorCode: 'scanner_error',
    });
    expect(double.events.slice(-2)).toEqual(['stop', 'delete']);
    expect(logs).toContain('Scanner sandbox sbx-test cleanup failed.');
  });

  it('keeps infected when cleanup fails', async () => {
    const double = sandboxDouble(
      {
        scan: {
          exitCode: 1,
          stdout: `${UPLOAD}: Eicar-Test-Signature FOUND\n`,
        },
      },
      { failDelete: true },
    );
    await expect(scan(double)).resolves.toEqual({
      status: 'infected',
      signature: 'Eicar-Test-Signature',
    });
  });

  it('never logs output, bytes or the image reference', async () => {
    const double = sandboxDouble(
      { check: { exitCode: 2, stdout: 'leaked-output' } },
      { failDelete: true },
    );
    await scan(double, 'secret-bytes');
    const text = logs.join('\n');
    expect(text).not.toContain('leaked-output');
    expect(text).not.toContain('secret-bytes');
    expect(text).not.toContain('vcr.vercel.com');
    expect(text).not.toContain('a'.repeat(64));
  });

  it('reports readiness from configuration without booting a VM', async () => {
    const double = sandboxDouble();
    await expect(
      new VercelSandboxScannerAdapter(config, double.create).readiness(),
    ).resolves.toBe(true);
    await expect(
      new VercelSandboxScannerAdapter(
        {
          ...config,
          scannerSandboxImage: undefined,
        } as unknown as AcresConfigService,
        double.create,
      ).readiness(),
    ).resolves.toBe(false);
    expect(double.create).not.toHaveBeenCalled();
  });

  it('fails closed without creating a VM when configuration is incomplete', async () => {
    const double = sandboxDouble();
    const adapter = new VercelSandboxScannerAdapter(
      {
        ...config,
        scannerMainSha256: undefined,
      } as unknown as AcresConfigService,
      double.create,
    );
    await expect(adapter.scanBuffer(Buffer.from('x'))).resolves.toEqual({
      status: 'failed',
      errorCode: 'scanner_error',
    });
    expect(double.create).not.toHaveBeenCalled();
  });
});
