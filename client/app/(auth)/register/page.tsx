import type { Metadata } from "next";

import { AuthFrame } from "@/components/acres/auth/auth-frame";
import { RegisterForm } from "@/components/acres/auth/register-form";
import { sanitizeReturnTo } from "@/lib/auth/return-to";

export const metadata: Metadata = {
  title: "Create Account",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const params = await searchParams;
  const returnTo = sanitizeReturnTo(params.returnTo);

  return (
    <AuthFrame
      eyebrow="Account Setup"
      title="Create an Acres account"
      description="Start with an account, then create or select an organization."
      footer={{
        label: "Already have an account?",
        href: `/login?returnTo=${encodeURIComponent(returnTo)}`,
        action: "Sign In",
      }}
    >
      <RegisterForm returnTo={returnTo} />
    </AuthFrame>
  );
}
