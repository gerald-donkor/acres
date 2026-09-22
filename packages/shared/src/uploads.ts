export const STORED_OBJECT_STATES = [
  'pending_upload',
  'quarantined',
  'accepted',
  'rejected',
  'deleted',
] as const;

export type StoredObjectState = (typeof STORED_OBJECT_STATES)[number];

export function isStoredObjectState(
  state: string,
): state is StoredObjectState {
  return (STORED_OBJECT_STATES as readonly string[]).includes(state);
}

export const UPLOAD_STATES = [
  'pending_upload',
  'completed',
  'scanning',
  'accepted',
  'rejected',
  'cancelled',
  'expired',
] as const;

export type UploadState = (typeof UPLOAD_STATES)[number];

export function isUploadState(state: string): state is UploadState {
  return (UPLOAD_STATES as readonly string[]).includes(state);
}

export const TERMINAL_UPLOAD_STATES = [
  'accepted',
  'rejected',
  'cancelled',
  'expired',
] as const;

export type TerminalUploadState = (typeof TERMINAL_UPLOAD_STATES)[number];

export function isTerminalUploadState(
  state: string,
): state is TerminalUploadState {
  return (TERMINAL_UPLOAD_STATES as readonly string[]).includes(state);
}

export const UPLOAD_MEDIA_TYPES = [
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/geo+json',
  'application/json',
] as const;

export type UploadMediaType = (typeof UPLOAD_MEDIA_TYPES)[number];

export function isUploadMediaType(type: unknown): type is UploadMediaType {
  return typeof type === 'string' && (UPLOAD_MEDIA_TYPES as readonly string[]).includes(type);
}

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
