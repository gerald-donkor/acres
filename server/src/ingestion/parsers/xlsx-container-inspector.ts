import { unzip } from 'fflate';
import type { ParserIssue } from './parser.types';

/**
 * Magic header signature for Microsoft OLE Compound File Binary Format (CFBF).
 * Password-protected/encrypted Office packages wrap the OOXML payload inside an OLE container.
 */
const OLE_COMPOUND_HEADER = Buffer.from([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
]);

/**
 * Maximum number of ZIP archive entries inspected for XLSX validation.
 *
 * This is an internal parser abuse guard (preventing high-entry zip-bomb expansion
 * or directory-traversal iteration overhead within the 25 MiB upload ceiling)
 * rather than a customer product limit. Standard multi-sheet workbooks with styles,
 * themes, drawings, and shared strings typically contain 10-50 entries.
 */
export const MAX_XLSX_ENTRIES = 1000;

export interface XlsxContainerInspectionSuccess {
  readonly ok: true;
}

export interface XlsxContainerInspectionFailure {
  readonly ok: false;
  readonly issue: ParserIssue;
}

export type XlsxContainerInspectionResult =
  XlsxContainerInspectionSuccess | XlsxContainerInspectionFailure;

/**
 * Normalizes a ZIP entry path for case-insensitive inspection and prefix trimming.
 */
export function normalizeZipEntryPath(path: string): string {
  return path
    .trim()
    .replace(/\\/g, '/')
    .replace(/^(\.\/|\/)+/, '')
    .replace(/\/+/g, '/')
    .toLowerCase();
}

/**
 * Detects whether the buffer starts with the OLE Compound File signature
 * (used by encrypted Office documents and legacy OLE containers).
 */
export function isOleCompoundFile(buffer: Buffer): boolean {
  if (buffer.length < 8) return false;
  return buffer.subarray(0, 8).equals(OLE_COMPOUND_HEADER);
}

/**
 * Classifies an XLSX buffer before spreadsheet parsing.
 *
 * Inspects archive metadata without decompressing or materializing entry payloads:
 * - Rejects OLE compound-file / password-encrypted Office containers before reading.
 * - Rejects macro-enabled workbooks containing VBA project payloads (xl/vbaProject.bin).
 * - Enforces a strict archive entry count cap to prevent zip-bomb / traversal abuse.
 * - Fails closed with safe, bounded issue codes on corrupt or unreadable containers.
 */
export async function inspectXlsxContainer(
  buffer: Buffer,
  maxEntries = MAX_XLSX_ENTRIES,
): Promise<XlsxContainerInspectionResult> {
  if (isOleCompoundFile(buffer)) {
    return {
      ok: false,
      issue: {
        severity: 'error',
        code: 'encrypted_workbook_unsupported',
        message: 'Encrypted or password-protected workbooks are not supported.',
      },
    };
  }

  return new Promise<XlsxContainerInspectionResult>((resolve) => {
    let entryCount = 0;
    let limitExceeded = false;
    let foundMacro = false;

    try {
      unzip(
        new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
        {
          filter(file) {
            entryCount += 1;
            if (entryCount > maxEntries) {
              limitExceeded = true;
              return false;
            }
            const normalized = normalizeZipEntryPath(file.name);
            if (
              normalized === 'xl/vbaproject.bin' ||
              normalized.startsWith('xl/vbaproject.bin/')
            ) {
              foundMacro = true;
            }
            // Return false to prevent decompressing entry payload into memory
            return false;
          },
        },
        (err) => {
          if (limitExceeded) {
            return resolve({
              ok: false,
              issue: {
                severity: 'error',
                code: 'xlsx_entry_limit_exceeded',
                message:
                  'Workbook archive entry count exceeds the parser safety limit.',
              },
            });
          }

          if (foundMacro) {
            return resolve({
              ok: false,
              issue: {
                severity: 'error',
                code: 'macro_enabled_workbook_unsupported',
                message: 'Macro-enabled workbooks are not supported.',
              },
            });
          }

          if (err) {
            return resolve({
              ok: false,
              issue: {
                severity: 'error',
                code: 'invalid_xlsx_container',
                message: 'Workbook container is invalid or unreadable.',
              },
            });
          }

          resolve({ ok: true });
        },
      );
    } catch {
      resolve({
        ok: false,
        issue: {
          severity: 'error',
          code: 'invalid_xlsx_container',
          message: 'Workbook container is invalid or unreadable.',
        },
      });
    }
  });
}
