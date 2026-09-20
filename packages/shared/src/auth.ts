/** Account recovery, password reset, and authentication requests. */

export const ACCOUNT_TOKEN_PURPOSES = [
  'password_recovery',
  'email_verification',
] as const;

export type AccountTokenPurpose = (typeof ACCOUNT_TOKEN_PURPOSES)[number];

export const CSRF_HEADER_NAME = 'x-csrf-token' as const;
export type CsrfHeaderName = typeof CSRF_HEADER_NAME;

export interface CsrfTokenReceipt {
  csrfToken: string;
  headerName: CsrfHeaderName;
}

export interface ForgotPasswordInput {
  email: string;
}

export interface ForgotPasswordResult {
  accepted: true;
}

export interface ResetPasswordInput {
  token: string;
  password: string;
}

export interface ResetPasswordResult {
  reset: true;
}
