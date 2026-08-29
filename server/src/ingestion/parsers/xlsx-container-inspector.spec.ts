import { strToU8, zipSync } from 'fflate';
import {
  inspectXlsxContainer,
  isOleCompoundFile,
  normalizeZipEntryPath,
} from './xlsx-container-inspector';

describe('xlsx-container-inspector', () => {
  describe('normalizeZipEntryPath', () => {
    it('normalizes slashes, leading dots/slashes, and case', () => {
      expect(normalizeZipEntryPath('xl\\vbaProject.bin')).toBe(
        'xl/vbaproject.bin',
      );
      expect(normalizeZipEntryPath('/xl/vbaProject.bin')).toBe(
        'xl/vbaproject.bin',
      );
      expect(normalizeZipEntryPath('./xl//vbaProject.BIN')).toBe(
        'xl/vbaproject.bin',
      );
      expect(normalizeZipEntryPath('  ./xl/vbaProject.bin  ')).toBe(
        'xl/vbaproject.bin',
      );
      expect(normalizeZipEntryPath('  XL/VBAPROJECT.BIN  ')).toBe(
        'xl/vbaproject.bin',
      );
    });
  });

  describe('isOleCompoundFile', () => {
    it('detects CFBF magic bytes correctly', () => {
      expect(
        isOleCompoundFile(
          Buffer.from([
            0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x01, 0x02,
          ]),
        ),
      ).toBe(true);
      expect(
        isOleCompoundFile(
          Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0x00]),
        ),
      ).toBe(false);
      expect(isOleCompoundFile(Buffer.from([0xd0, 0xcf]))).toBe(false);
      expect(isOleCompoundFile(Buffer.alloc(0))).toBe(false);
    });
  });

  describe('inspectXlsxContainer', () => {
    it('accepts a valid OOXML archive structure', async () => {
      const zipBuffer = Buffer.from(
        zipSync({
          '[Content_Types].xml': strToU8('<Types/>'),
          'xl/workbook.xml': strToU8('<workbook/>'),
          'xl/worksheets/sheet1.xml': strToU8('<worksheet/>'),
        }),
      );
      const result = await inspectXlsxContainer(zipBuffer);
      expect(result).toEqual({ ok: true });
    });

    it('rejects OLE compound files with encrypted_workbook_unsupported', async () => {
      const oleBuffer = Buffer.from([
        0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00, 0x00, 0x00,
      ]);
      const result = await inspectXlsxContainer(oleBuffer);
      expect(result).toEqual({
        ok: false,
        issue: {
          severity: 'error',
          code: 'encrypted_workbook_unsupported',
          message:
            'Encrypted or password-protected workbooks are not supported.',
        },
      });
    });

    it('rejects macro-enabled archives with case-insensitive and slash-variant vbaProject paths', async () => {
      const variants = [
        'xl/vbaProject.bin',
        'xl/VBAPROJECT.BIN',
        'XL/vbaProject.bin',
        'xl\\vbaProject.bin',
        '/xl/vbaProject.bin',
      ];

      for (const variant of variants) {
        const zipBuffer = Buffer.from(
          zipSync({
            '[Content_Types].xml': strToU8('<Types/>'),
            [variant]: strToU8('binary_macro_data'),
          }),
        );
        const result = await inspectXlsxContainer(zipBuffer);
        expect(result).toEqual({
          ok: false,
          issue: {
            severity: 'error',
            code: 'macro_enabled_workbook_unsupported',
            message: 'Macro-enabled workbooks are not supported.',
          },
        });
      }
    });

    it('rejects archives exceeding the entry limit', async () => {
      const files: Record<string, Uint8Array> = {};
      for (let i = 0; i < 6; i++) {
        files[`file_${i}.txt`] = strToU8('content');
      }
      const zipBuffer = Buffer.from(zipSync(files));

      // With maxEntries = 5
      const result = await inspectXlsxContainer(zipBuffer, 5);
      expect(result).toEqual({
        ok: false,
        issue: {
          severity: 'error',
          code: 'xlsx_entry_limit_exceeded',
          message:
            'Workbook archive entry count exceeds the parser safety limit.',
        },
      });
    });

    it('rejects corrupted or truncated ZIP archives as invalid_xlsx_container', async () => {
      const result1 = await inspectXlsxContainer(Buffer.from('not a zip'));
      expect(result1).toEqual({
        ok: false,
        issue: {
          severity: 'error',
          code: 'invalid_xlsx_container',
          message: 'Workbook container is invalid or unreadable.',
        },
      });

      const truncatedZip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
      const result2 = await inspectXlsxContainer(truncatedZip);
      expect(result2).toEqual({
        ok: false,
        issue: {
          severity: 'error',
          code: 'invalid_xlsx_container',
          message: 'Workbook container is invalid or unreadable.',
        },
      });
    });
  });
});
