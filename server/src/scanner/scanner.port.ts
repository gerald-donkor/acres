export type ScanErrorCode =
  | 'object_missing'
  | 'scanner_unavailable'
  | 'scanner_timeout'
  | 'scanner_error';

export interface ScanResult {
  readonly status: 'clean' | 'infected' | 'failed';
  readonly signature?: string;
  readonly errorCode?: ScanErrorCode;
}

export interface MalwareScannerPort {
  scanBuffer(buffer: Buffer): Promise<ScanResult>;
  readiness(): Promise<boolean>;
}

export const MALWARE_SCANNER = Symbol('MALWARE_SCANNER');
