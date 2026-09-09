import { NextResponse } from "next/server";
import {
  clearSessionMocks,
  isTestHarnessActive,
  setSessionMocks,
  type TestHarnessMocks,
} from "@/lib/api/test-harness-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isTestHarnessActive()) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const body = (await request.json()) as {
      sessionId?: string;
      mocks?: Partial<TestHarnessMocks>;
    };

    if (!body.sessionId || !body.mocks) {
      return NextResponse.json(
        { ok: false, error: "sessionId and mocks are required" },
        { status: 400 },
      );
    }

    setSessionMocks(body.sessionId, body.mocks);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  if (!isTestHarnessActive()) {
    return new NextResponse(null, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId") ?? undefined;
  clearSessionMocks(sessionId);
  return NextResponse.json({ ok: true });
}
