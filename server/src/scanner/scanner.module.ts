import { Module } from '@nestjs/common';
import { AcresConfigService } from '../config/acres-config.service';
import { ClamavScannerAdapter } from './clamav-scanner.adapter';
import { MALWARE_SCANNER, type MalwareScannerPort } from './scanner.port';
import { VercelSandboxScannerAdapter } from './vercel-sandbox-scanner.adapter';

@Module({
  providers: [
    {
      provide: MALWARE_SCANNER,
      inject: [AcresConfigService],
      // Only the selected adapter is constructed: the Sandbox profile never
      // opens a clamd socket, and the clamd profile never loads the Sandbox SDK.
      useFactory: (config: AcresConfigService): MalwareScannerPort =>
        config.scannerProvider === 'vercel-sandbox'
          ? new VercelSandboxScannerAdapter(config)
          : new ClamavScannerAdapter(config),
    },
  ],
  exports: [MALWARE_SCANNER],
})
export class ScannerModule {}
