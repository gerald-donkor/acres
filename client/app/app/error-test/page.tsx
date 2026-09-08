import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/api/server";
import { ErrorTrigger } from "./error-trigger";

export const dynamic = "force-dynamic";

export default async function ErrorTestPage() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_TEST_HARNESS !== "true") {
    notFound();
  }

  const session = await getSession();
  if (!session.authenticated || session.account === null) {
    redirect("/login?returnTo=/app/error-test");
  }

  return <ErrorTrigger />;
}
