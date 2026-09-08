import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/api/server";
import MembersLoading from "../members/loading";

export const dynamic = "force-dynamic";

export default async function LoadingTestPage() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_TEST_HARNESS !== "true") {
    notFound();
  }

  const session = await getSession();
  if (!session.authenticated || session.account === null) {
    redirect("/login?returnTo=/app/loading-test");
  }

  return <MembersLoading />;
}
