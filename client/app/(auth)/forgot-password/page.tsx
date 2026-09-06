import type { Metadata } from "next";

import { AuthFrame } from "@/components/acres/auth/auth-frame";
import { ForgotPasswordForm } from "@/components/acres/auth/forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot Password",
  robots: {
    index: false,
    follow: true,
  },
};

export default function ForgotPasswordPage() {
  return (
    <AuthFrame
      eyebrow="Account Recovery"
      title="Reset your password"
      description="Enter your account email to receive a secure recovery link."
      footer={{
        label: "Remember your password?",
        href: "/login",
        action: "Sign In",
      }}
    >
      <ForgotPasswordForm />
    </AuthFrame>
  );
}
