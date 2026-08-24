import type { Metadata } from "next";

import { AuthFrame } from "@/components/acres/auth/auth-frame";
import { LoginForm } from "@/components/acres/auth/login-form";
import { sanitizeReturnTo } from "@/lib/auth/return-to";

export const metadata: Metadata = {
  title: "Sign In",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const params = await searchParams;
  const returnTo = sanitizeReturnTo(params.returnTo);

  return (
    <AuthFrame
      eyebrow="Account Access"
      title="Sign in to Acres"
      description="Use your account to enter the authenticated organization workspace."
      footer={{
        label: "Need an account?",
        href: `/register?returnTo=${encodeURIComponent(returnTo)}`,
        action: "Create Account",
      }}
    >
      <LoginForm returnTo={returnTo} />
    </AuthFrame>
  );
}
