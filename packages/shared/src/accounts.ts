/** Accounts, credentials and sessions. */

export interface RegisterAccountInput {
  email: string;
  password: string;
  displayName?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AccountProfile {
  id: string;
  email: string;
  displayName: string | null;
  /** ISO 8601. */
  createdAt: string;
}

export interface SessionProfile {
  authenticated: boolean;
  account: AccountProfile | null;
  /** ISO 8601 expiry of the current session, or `null` when unauthenticated. */
  expiresAt: string | null;
}

/** The unauthenticated shape `GET /auth/session` returns. */
export const ANONYMOUS_SESSION: SessionProfile = {
  authenticated: false,
  account: null,
  expiresAt: null,
};
