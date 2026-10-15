import { Test } from '@nestjs/testing';
import { AcresConfigService } from '../config/acres-config.service';
import { ClamavScannerAdapter } from './clamav-scanner.adapter';
import { ScannerModule } from './scanner.module';
import { MALWARE_SCANNER } from './scanner.port';
import { VercelSandboxScannerAdapter } from './vercel-sandbox-scanner.adapter';

async function resolveScanner(scannerProvider: 'clamav' | 'vercel-sandbox') {
  const moduleRef = await Test.createTestingModule({
    imports: [
      {
        module: class ConfigStubModule {},
        global: true,
        providers: [
          { provide: AcresConfigService, useValue: { scannerProvider } },
        ],
        exports: [AcresConfigService],
      },
      ScannerModule,
    ],
  }).compile();
  const scanner = moduleRef.get<unknown>(MALWARE_SCANNER);
  await moduleRef.close();
  return scanner;
}

describe('ScannerModule provider selection', () => {
  it('keeps the clamd adapter by default', async () => {
    await expect(resolveScanner('clamav')).resolves.toBeInstanceOf(
      ClamavScannerAdapter,
    );
  });

  it('selects the Sandbox adapter without constructing the clamd one', async () => {
    await expect(resolveScanner('vercel-sandbox')).resolves.toBeInstanceOf(
      VercelSandboxScannerAdapter,
    );
  });
});
