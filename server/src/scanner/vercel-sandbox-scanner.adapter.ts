import { Injectable, Logger, Optional } from '@nestjs/common';
import { AcresConfigService } from '../config/acres-config.service';
import { SCANNER_SANDBOX_MAX_BYTES } from '../config/env.validation';
import {
  SIGNATURE_CHECK,
  SIGNATURES_OK_MARKER,
} from './sandbox-signature-check';
import type { MalwareScannerPort, ScanResult } from './scanner.port';

const CREATE_TIMEOUT_MS = 60_000;
const SIGNATURE_CHECK_TIMEOUT_MS = 30_000;
const CLEANUP_TIMEOUT_MS = 30_000;
const SCAN_MARGIN_MS = 10_000;
const MAX_SIGNATURE_CHARS = 200;
// Fixed name: no user filename reaches the VM. Directly under /tmp, so the
// write does not depend on writeFiles creating parent directories.
const UPLOAD_PATH = '/tmp/acres-scan-upload';
const SCAN_ARGS = [
  '--no-summary',
  '--database=/var/lib/clamav',
  '--max-filesize=50M',
  '--max-scansize=50M',
  // Without it an over-limit object reads "OK"; ClamAV 1.5.4 then exits 2.
  '--alert-exceeds-max=yes',
  UPLOAD_PATH,
];

/** The parts of `@vercel/sandbox` 3.8.0 this adapter uses. */
export interface ScanSandbox {
  readonly name: string;
  readonly sourceSnapshotId: string | undefined;
  runCommand(params: {
    cmd: string;
    args: string[];
    timeoutMs: number;
  }): Promise<{ exitCode: number; stdout(): Promise<string> }>;
  writeFiles(files: { path: string; content: Buffer }[]): Promise<void>;
  stop(opts: { signal: AbortSignal }): Promise<unknown>;
  delete(opts: {
    deleteOrphanSnapshots: boolean;
    signal: AbortSignal;
  }): Promise<void>;
}

// A type alias, not an interface, so it satisfies the SDK's index signature.
export type ScanSandboxCreateParams = {
  source: { type: 'snapshot'; snapshotId: string };
  persistent: false;
  networkPolicy: 'deny-all';
  resources: { vcpus: 1 };
  timeout: number;
  signal: AbortSignal;
};

interface ScanSettings {
  snapshotId: string;
  mainSha256: string;
  dailySha256: string;
  maxAgeHours: number;
  timeoutMs: number;
}

export type CreateScanSandbox = (
  params: ScanSandboxCreateParams,
) => Promise<ScanSandbox>;

// Loaded on first scan only, so the clamd/BullMQ profile never imports the SDK.
// SDK 3.8.0 authenticates with OIDC only when no explicit credentials are
// passed: `VERCEL_OIDC_TOKEN` on Vercel, or one pulled with `vercel env pull`
// off Vercel (a local TTY run without it may prompt). It never reads
// VERCEL_TOKEN from the environment, and this adapter passes no credentials.
const createWithSdk: CreateScanSandbox = async (params) => {
  const { Sandbox } = await import('@vercel/sandbox');
  return Sandbox.create(params);
};

/**
 * ClamAV in a one-off Vercel Sandbox (managed profile only).
 *
 * Each scan boots a non-persistent, deny-all VM from the scanner snapshot,
 * verifies the baked signatures against pinned hashes and a maximum age, scans
 * the object, then stops and deletes the VM with its snapshots. Only positive
 * evidence is clean: exit 0 with the file's OK line. Anything uncertain fails
 * closed, and a clean result whose VM cannot be confirmed deleted is failed.
 * Never logs output, bytes, credentials or the snapshot id.
 */
@Injectable()
export class VercelSandboxScannerAdapter implements MalwareScannerPort {
  private readonly logger = new Logger(VercelSandboxScannerAdapter.name);

  constructor(
    private readonly config: AcresConfigService,
    // A test seam. @Optional keeps Nest from resolving the `Function` type if
    // the class is ever registered as a provider instead of built by the factory.
    @Optional()
    private readonly createSandbox: CreateScanSandbox = createWithSdk,
  ) {}

  async scanBuffer(buffer: Buffer): Promise<ScanResult> {
    const settings = this.settings();
    if (!settings || buffer.length > SCANNER_SANDBOX_MAX_BYTES) {
      return { status: 'failed', errorCode: 'scanner_error' };
    }
    const startedAt = Date.now();
    let sandbox: ScanSandbox;
    try {
      sandbox = await this.createSandbox({
        source: { type: 'snapshot', snapshotId: settings.snapshotId },
        persistent: false,
        networkPolicy: 'deny-all',
        resources: { vcpus: 1 },
        timeout: settings.timeoutMs,
        signal: AbortSignal.timeout(CREATE_TIMEOUT_MS),
      });
    } catch {
      this.logger.warn('Scanner sandbox could not be created.');
      return { status: 'failed', errorCode: 'scanner_unavailable' };
    }
    let result: ScanResult;
    try {
      result = await this.scanIn(sandbox, buffer, settings, startedAt);
    } catch {
      result = { status: 'failed', errorCode: 'scanner_error' };
    }
    const cleaned = await this.cleanup(sandbox);
    if (!cleaned && result.status === 'clean') {
      return { status: 'failed', errorCode: 'scanner_error' };
    }
    return result;
  }

  readiness(): Promise<boolean> {
    // Never boots a VM: a health probe must not spend Sandbox CPU-hours.
    return Promise.resolve(this.settings() !== undefined);
  }

  private async scanIn(
    sandbox: ScanSandbox,
    buffer: Buffer,
    settings: ScanSettings,
    startedAt: number,
  ): Promise<ScanResult> {
    // A snapshot id is not a content hash; the CVD hash check below is the
    // content pin. This only proves the VM booted from the configured source.
    if (sandbox.sourceSnapshotId !== settings.snapshotId) {
      this.logger.warn(`Scanner sandbox ${sandbox.name} source mismatch.`);
      return { status: 'failed', errorCode: 'scanner_unavailable' };
    }
    let signaturesOk: boolean;
    try {
      const check = await sandbox.runCommand({
        cmd: 'node',
        args: [
          '-e',
          SIGNATURE_CHECK,
          settings.mainSha256,
          settings.dailySha256,
          String(settings.maxAgeHours),
        ],
        timeoutMs: SIGNATURE_CHECK_TIMEOUT_MS,
      });
      signaturesOk =
        check.exitCode === 0 &&
        (await check.stdout()).includes(SIGNATURES_OK_MARKER);
    } catch {
      signaturesOk = false;
    }
    if (!signaturesOk) {
      // Stale, missing or mismatched signatures: no trustworthy scanner.
      this.logger.warn(
        `Scanner sandbox ${sandbox.name} signature check failed.`,
      );
      return { status: 'failed', errorCode: 'scanner_unavailable' };
    }
    await sandbox.writeFiles([{ path: UPLOAD_PATH, content: buffer }]);
    const timeoutMs =
      settings.timeoutMs - (Date.now() - startedAt) - SCAN_MARGIN_MS;
    if (timeoutMs <= 0)
      return { status: 'failed', errorCode: 'scanner_timeout' };
    let exitCode: number;
    let stdout: string;
    try {
      const scan = await sandbox.runCommand({
        cmd: 'clamscan',
        args: SCAN_ARGS,
        timeoutMs,
      });
      exitCode = scan.exitCode;
      stdout = await scan.stdout();
    } catch {
      return { status: 'failed', errorCode: 'scanner_timeout' };
    }
    // The SDK reports a missing exit code as 0, so clean needs the OK line too.
    if (exitCode === 0 && stdout.includes(`${UPLOAD_PATH}: OK`)) {
      return { status: 'clean' };
    }
    if (exitCode === 1) {
      const found = /: (.+) FOUND$/m.exec(stdout)?.[1];
      return found && found.length <= MAX_SIGNATURE_CHARS
        ? { status: 'infected', signature: found }
        : { status: 'infected' };
    }
    return { status: 'failed', errorCode: 'scanner_error' };
  }

  private async cleanup(sandbox: ScanSandbox): Promise<boolean> {
    let ok = true;
    try {
      await sandbox.stop({ signal: AbortSignal.timeout(CLEANUP_TIMEOUT_MS) });
    } catch {
      ok = false;
    }
    try {
      // Sandboxes persist by default and snapshot on stop; deleting the
      // orphan snapshots keeps quarantined bytes from outliving the scan.
      await sandbox.delete({
        deleteOrphanSnapshots: true,
        signal: AbortSignal.timeout(CLEANUP_TIMEOUT_MS),
      });
    } catch {
      ok = false;
    }
    if (!ok) {
      this.logger.error(`Scanner sandbox ${sandbox.name} cleanup failed.`);
    }
    return ok;
  }

  private settings(): ScanSettings | undefined {
    const snapshotId = this.config.scannerSandboxSnapshotId;
    const mainSha256 = this.config.scannerMainSha256;
    const dailySha256 = this.config.scannerDailySha256;
    const maxAgeHours = this.config.scannerMaxSignatureAgeHours;
    const timeoutMs = this.config.scannerSandboxTimeoutMs;
    if (
      !snapshotId ||
      !mainSha256 ||
      !dailySha256 ||
      !maxAgeHours ||
      !timeoutMs
    ) {
      return undefined;
    }
    return { snapshotId, mainSha256, dailySha256, maxAgeHours, timeoutMs };
  }
}
