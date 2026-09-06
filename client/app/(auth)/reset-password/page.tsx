import type { Metadata } from "next";

import { AuthFrame } from "@/components/acres/auth/auth-frame";
import { ResetPasswordForm } from "@/components/acres/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Set New Password",
  robots: {
    index: false,
    follow: true,
  },
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawToken = Array.isArray(params.token) ? params.token[0] : params.token;
  const token = typeof rawToken === "string" ? rawToken : undefined;

  return (
    <AuthFrame
      eyebrow="Account Security"
      title="Set a new password"
      description="Choose a secure password with at least 12 characters."
      footer={{
        label: "Remember your password?",
        href: "/login",
        action: "Sign In",
      }}
    >
      <ResetPasswordForm initialToken={token} />
    </AuthFrame>
  );
}
