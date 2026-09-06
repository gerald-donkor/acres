/** Account recovery, password reset, and authentication requests. */

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
