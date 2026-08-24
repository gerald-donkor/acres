export interface ScanResult {
  readonly status: 'clean' | 'infected' | 'failed';
  readonly signature?: string;
  readonly errorCode?: string;
}

export interface MalwareScannerPort {
  scanBuffer(buffer: Buffer): Promise<ScanResult>;
  readiness(): Promise<boolean>;
}

export const MALWARE_SCANNER = Symbol('MALWARE_SCANNER');
