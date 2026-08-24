import { Module } from '@nestjs/common';
import { ClamavScannerAdapter } from './clamav-scanner.adapter';
import { MALWARE_SCANNER } from './scanner.port';

@Module({
  providers: [
    ClamavScannerAdapter,
    { provide: MALWARE_SCANNER, useExisting: ClamavScannerAdapter },
  ],
  exports: [MALWARE_SCANNER],
})
export class ScannerModule {}
