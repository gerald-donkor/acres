export type UploadState =
  | 'pending_upload'
  | 'completed'
  | 'scanning'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'expired';

export interface UploadStatus {
  readonly id: string;
  readonly state: UploadState;
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
    checksumAlgorithm: 'sha256';
  };
  upload: {
    url: string;
    method: 'PUT';
    headers: Record<string, string>;
    expiresAt: string;
  };
  complete: {
    method: 'POST';
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
  method: 'GET';
  headers: Record<string, string>;
  expiresAt: string;
};
