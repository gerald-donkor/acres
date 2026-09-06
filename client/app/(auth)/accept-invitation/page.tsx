import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AcceptInvitationForm } from "@/components/acres/auth/accept-invitation-form";
import { AuthFrame } from "@/components/acres/auth/auth-frame";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { ApiClientError } from "@/lib/api/envelope";
import { getSession } from "@/lib/api/server";
import { cn } from "@/lib/utils";

const RETURN_TO = "/accept-invitation";
const SIGN_IN_PATH = "/login?returnTo=%2Faccept-invitation";

export const metadata: Metadata = {
  title: "Accept Invitation",
  robots: {
    index: false,
    follow: true,
  },
};

function SessionError({ error }: { error: unknown }) {
  const requestId = error instanceof ApiClientError ? error.requestId : null;

  return (
    <AuthFrame
      eyebrow="Organization Access"
      title="Account check unavailable"
      description="Acres could not confirm the signed-in account."
      footer={{
        label: "Ready to try again?",
        href: SIGN_IN_PATH,
        action: "Sign In",
      }}
    >
      <Alert variant="destructive">
        <AlertTitle>Account Check Failed</AlertTitle>
        <AlertDescription>
          <p>Acres could not confirm the current session.</p>
          <p>Try the account check again, or sign in to continue.</p>
          {requestId ? (
            <p className="font-mono text-label text-ink-muted lg:text-label-lg">
              Request ID: {requestId}
            </p>
          ) : null}
          <Link
            href={RETURN_TO}
            className={cn(buttonVariants({ variant: "outline" }), "mt-4")}
          >
            Try Again
          </Link>
        </AlertDescription>
      </Alert>
    </AuthFrame>
  );
}

export default async function AcceptInvitationPage() {
  let session;
  try {
    session = await getSession();
  } catch (error) {
    return <SessionError error={error} />;
  }

  if (!session.authenticated || session.account === null) {
    redirect(SIGN_IN_PATH);
  }

  return (
    <AuthFrame
      eyebrow="Organization Access"
      title="Accept an invitation"
      description="Paste an invitation issued to this signed-in account to join its organization."
      footer={{
        label: "Want to return without accepting?",
        href: "/app",
        action: "Open Workspace",
      }}
    >
      <AcceptInvitationForm email={session.account.email} />
    </AuthFrame>
  );
}
