export type UploadState =
  | 'pending'
  | 'scanning'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'expired';

export interface UploadStatus {
  readonly id: string;
  readonly state: string;
  readonly filename: string;
  readonly mediaType: string;
  readonly byteCount: number;
  readonly checksumHex: string | null;
  readonly progress: { stage: string; percent: number };
  readonly failure: { code: string; message: string | null } | null;
  readonly acceptedAt: string | null;
}

export type InitiateUploadInput = {
  filename: string;
  mediaType: string;
  byteCount: number;
  checksumHex?: string;
};

export type InitiateUploadResult = {
  uploadId: string;
  object: {
    key: string;
    bucket: string;
    checksumAlgorithm: string;
  };
  upload: {
    url: string;
    method: string;
    headers: Record<string, string>;
    expiresAt: string;
  };
  complete: {
    method: string;
    url: string;
    requiredHeaders: string[];
  };
};

export type CompleteUploadInput = {
  byteCount: number;
  checksumHex: string;
};

export type UploadDownload = {
  url: string;
  method: string;
  headers: Record<string, string>;
  expiresAt: string;
};
