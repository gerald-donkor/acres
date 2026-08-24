export interface PresignedPut {
  readonly url: string;
  readonly method: 'PUT';
  readonly headers: Record<string, string>;
  readonly expiresAt: Date;
}

export interface PresignedGet {
  readonly url: string;
  readonly method: 'GET';
  readonly headers: Record<string, string>;
  readonly expiresAt: Date;
}

export interface StoredObjectStat {
  readonly byteCount: bigint;
  readonly mediaType: string | null;
  readonly checksumHex: string | null;
}

export interface ObjectStoragePort {
  presignPut(input: {
    key: string;
    mediaType: string;
    checksumHex?: string;
  }): Promise<PresignedPut>;
  presignGet(input: {
    key: string;
    filename: string;
    mediaType: string;
  }): Promise<PresignedGet>;
  putBuffer(input: {
    key: string;
    body: Buffer;
    mediaType: string;
    checksumHex: string;
  }): Promise<void>;
  stat(key: string): Promise<StoredObjectStat | null>;
  getBuffer(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  readiness(): Promise<boolean>;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');
