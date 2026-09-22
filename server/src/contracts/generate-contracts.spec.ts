import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { buildSchema } from 'graphql';
import * as genModule from './generate-contracts';
import {
  contractsMarkdown,
  ensureContractEnv,
  sortValue,
  stableStringify,
} from './generate-contracts';

describe('generate-contracts', () => {
  describe('sortValue', () => {
    it('returns primitive values as-is', () => {
      expect(sortValue('hello')).toBe('hello');
      expect(sortValue(42)).toBe(42);
      expect(sortValue(true)).toBe(true);
      expect(sortValue(null)).toBeNull();
    });

    it('maps arrays while preserving item ordering', () => {
      const input = [
        { b: 2, a: 1 },
        { d: 4, c: 3 },
      ];
      const sorted = sortValue(input) as Array<Record<string, unknown>>;
      expect(sorted).toHaveLength(2);
      expect(Object.keys(sorted[0])).toEqual(['a', 'b']);
      expect(Object.keys(sorted[1])).toEqual(['c', 'd']);
    });

    it('sorts object keys alphabetically and filters out undefined values', () => {
      const input = {
        z: 'last',
        a: 'first',
        m: undefined,
        nested: {
          y: 2,
          x: 1,
          ignored: undefined,
        },
      };
      const sorted = sortValue(input) as Record<string, unknown>;
      expect(Object.keys(sorted)).toEqual(['a', 'nested', 'z']);
      expect(sorted.m).toBeUndefined();
      expect('m' in sorted).toBe(false);

      const nested = sorted.nested as Record<string, unknown>;
      expect(Object.keys(nested)).toEqual(['x', 'y']);
      expect('ignored' in nested).toBe(false);
    });
  });

  describe('stableStringify', () => {
    it('produces formatted JSON with sorted keys and 2-space indentation', () => {
      const obj1 = { b: 2, a: 1 };
      const obj2 = { a: 1, b: 2 };
      expect(stableStringify(obj1)).toBe(stableStringify(obj2));
      expect(stableStringify(obj1)).toBe('{\n  "a": 1,\n  "b": 2\n}');
    });

    it('handles nested objects and arrays deterministically', () => {
      const obj = {
        meta: { beta: 'b', alpha: 'a' },
        items: [{ k2: 'v2', k1: 'v1' }],
      };
      const expected = JSON.stringify(
        {
          items: [{ k1: 'v1', k2: 'v2' }],
          meta: { alpha: 'a', beta: 'b' },
        },
        null,
        2,
      );
      expect(stableStringify(obj)).toBe(expected);
    });
  });

  describe('ensureContractEnv', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('populates required contract environment defaults when unset', () => {
      delete process.env.NODE_ENV;
      delete process.env.GRAPHQL_MAX_BYTES;
      delete process.env.PARSER_MAX_ROWS;

      ensureContractEnv();

      expect(process.env.NODE_ENV).toBe('test');
      expect(process.env.GRAPHQL_MAX_BYTES).toBe('12000');
      expect(process.env.PARSER_MAX_ROWS).toBe('10000');
    });

    it('preserves existing environment variables', () => {
      process.env.NODE_ENV = 'production';
      process.env.GRAPHQL_MAX_BYTES = '99999';

      ensureContractEnv();

      expect(process.env.NODE_ENV).toBe('production');
      expect(process.env.GRAPHQL_MAX_BYTES).toBe('99999');
    });
  });

  describe('contractsMarkdown', () => {
    it('returns contract documentation header and REST/GraphQL sections', () => {
      const markdown = contractsMarkdown();
      expect(markdown).toContain('# Acres API contracts');
      expect(markdown).toContain('## REST');
      expect(markdown).toContain('## GraphQL');
    });
  });

  describe('assertNoDrift', () => {
    it('resolves without error when temp directory files match CONTRACT_DIR', async () => {
      await expect(
        genModule.assertNoDrift(genModule.CONTRACT_DIR),
      ).resolves.toBeUndefined();
    });

    it('throws error when contract files differ or are missing', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'test-drift-'));
      try {
        await writeFile(
          join(tempDir, 'openapi.json'),
          '{"differs": true}',
          'utf8',
        );
        await writeFile(
          join(tempDir, 'schema.graphql'),
          'type Differs { id: ID }',
          'utf8',
        );
        await writeFile(join(tempDir, 'contracts.md'), '# Differs', 'utf8');

        await expect(genModule.assertNoDrift(tempDir)).rejects.toThrow(
          /Contract drift detected: openapi\.json, schema\.graphql, contracts\.md/,
        );
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });

    it('reports a missing generated file as contract drift', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'test-missing-contract-'));
      try {
        await writeFile(
          join(tempDir, 'openapi.json'),
          await readFile(join(genModule.CONTRACT_DIR, 'openapi.json'), 'utf8'),
        );
        await writeFile(
          join(tempDir, 'contracts.md'),
          await readFile(join(genModule.CONTRACT_DIR, 'contracts.md'), 'utf8'),
        );
        await expect(genModule.assertNoDrift(tempDir)).rejects.toThrow(
          'Contract drift detected: schema.graphql',
        );
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('writeContracts', () => {
    it('generates openapi, graphql schema, and contracts.md in target directory', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'test-write-contracts-'));
      const mockSchema = buildSchema('type Query { version: String! }');
      const mockApp = {
        init: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
        get: jest.fn().mockReturnValue({ schema: mockSchema }),
      };
      jest
        .spyOn(NestFactory, 'create')
        .mockResolvedValue(mockApp as unknown as INestApplication);
      const mockOpenApiDoc = {
        openapi: '3.0.0',
        info: { title: 'Acres API', version: '1.0.0' },
        paths: {},
        servers: [{ url: 'http://localhost' }],
      };
      jest
        .spyOn(SwaggerModule, 'createDocument')
        .mockReturnValue(mockOpenApiDoc);

      try {
        const configureApp = jest.fn();
        await genModule.writeContracts(tempDir, () =>
          Promise.resolve({
            AppModule: class DummyModule {},
            configureApp,
          }),
        );

        expect(configureApp).toHaveBeenCalledWith(mockApp);
        expect(mockApp.init).toHaveBeenCalled();
        expect(mockApp.close).toHaveBeenCalled();

        const [openapi, schema, contracts] = await Promise.all([
          readFile(join(tempDir, 'openapi.json'), 'utf8'),
          readFile(join(tempDir, 'schema.graphql'), 'utf8'),
          readFile(join(tempDir, 'contracts.md'), 'utf8'),
        ]);

        const parsedOpenApi = JSON.parse(openapi) as Record<string, unknown>;
        expect(parsedOpenApi).toHaveProperty('openapi', '3.0.0');
        expect(parsedOpenApi).not.toHaveProperty('servers');
        expect(schema).toContain('type Query');
        expect(contracts).toContain('# Acres API contracts');
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('runContractGeneration & main', () => {
    const originalArgv = [...process.argv];

    afterEach(() => {
      process.argv = [...originalArgv];
      jest.restoreAllMocks();
    });

    it('executes in --check mode with temporary directory creation and verification', async () => {
      let generatedDir = '';
      const writer = jest.fn(async (outDir: string) => {
        generatedDir = outDir;
        expect((await stat(outDir)).isDirectory()).toBe(true);
      });
      const asserter = jest.fn(async (outDir: string) => {
        expect(outDir).toBe(generatedDir);
        expect((await stat(outDir)).isDirectory()).toBe(true);
      });

      await genModule.runContractGeneration({
        check: true,
        writer,
        asserter,
      });

      expect(writer).toHaveBeenCalledWith(
        expect.stringContaining('acres-contracts-'),
      );
      expect(asserter).toHaveBeenCalled();
      await expect(stat(generatedDir)).rejects.toMatchObject({
        code: 'ENOENT',
      });
    });

    it('removes the temporary directory when drift verification fails', async () => {
      let generatedDir = '';
      const writer = jest.fn((outDir: string) => {
        generatedDir = outDir;
        return Promise.resolve();
      });
      const asserter = jest.fn(() => Promise.reject(new Error('drift')));

      await expect(
        genModule.runContractGeneration({ check: true, writer, asserter }),
      ).rejects.toThrow('drift');
      await expect(stat(generatedDir)).rejects.toMatchObject({
        code: 'ENOENT',
      });
    });

    it('executes standard generation writing directly to CONTRACT_DIR', async () => {
      const writer = jest.fn().mockResolvedValue(undefined);
      const asserter = jest.fn().mockResolvedValue(undefined);

      await genModule.runContractGeneration({
        check: false,
        writer,
        asserter,
      });

      expect(writer).toHaveBeenCalledWith(genModule.CONTRACT_DIR);
      expect(asserter).not.toHaveBeenCalled();
    });

    it('main delegates to runContractGeneration', async () => {
      process.argv = ['node', 'generate-contracts.js', '--check'];
      const spy = jest
        .spyOn(genModule.contractRunner, 'run')
        .mockResolvedValue(undefined);

      await expect(genModule.main()).resolves.toBeUndefined();
      expect(spy).toHaveBeenCalled();
    });
  });
});
