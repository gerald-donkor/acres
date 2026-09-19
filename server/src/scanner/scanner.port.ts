export const SCAN_STATUSES = ['clean', 'infected', 'failed'] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];

export const SCAN_ERROR_CODES = [
  'object_missing',
  'scanner_unavailable',
  'scanner_timeout',
  'scanner_error',
] as const;
export type ScanErrorCode = (typeof SCAN_ERROR_CODES)[number];

export type ScanFailureStatus = Exclude<ScanStatus, 'clean'>;

export interface ScanResult {
  readonly status: ScanStatus;
  readonly signature?: string;
  readonly errorCode?: ScanErrorCode;
}

export interface MalwareScannerPort {
  scanBuffer(buffer: Buffer): Promise<ScanResult>;
  readiness(): Promise<boolean>;
}

export const MALWARE_SCANNER = Symbol('MALWARE_SCANNER');
