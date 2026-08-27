import { expect, test } from "@playwright/test";

import { parseSseLines, streamSse, type SseMessage } from "@/lib/api/sse";

test("parseSseLines parses single data frames with JSON payloads", () => {
  const messages: Array<{ data: unknown; msg: SseMessage<unknown> }> = [];
  const raw = 'event: export.progress\nid: exp-1\ndata: {"status":"running","progress":50}\n\n';

  const { remaining } = parseSseLines(raw, (data, msg) => {
    messages.push({ data, msg });
  });

  expect(remaining).toBe("");
  expect(messages).toHaveLength(1);
  expect(messages[0].msg).toEqual({
    event: "export.progress",
    id: "exp-1",
    data: { status: "running", progress: 50 },
  });
  expect(messages[0].data).toEqual({ status: "running", progress: 50 });
});

test("parseSseLines parses multiline data frames", () => {
  const messages: Array<unknown> = [];
  const raw = 'data: line 1\ndata: line 2\n\n';

  const { remaining } = parseSseLines<string>(raw, (data) => {
    messages.push(data);
  });

  expect(remaining).toBe("");
  expect(messages).toEqual(["line 1\nline 2"]);
});

test("parseSseLines ignores comment and heartbeat frames", () => {
  const messages: Array<unknown> = [];
  const raw = ': heartbeat\n: ping\n\nevent: custom\ndata: {"ok":true}\n\n';

  const { remaining } = parseSseLines(raw, (data) => {
    messages.push(data);
  });

  expect(remaining).toBe("");
  expect(messages).toEqual([{ ok: true }]);
});

test("parseSseLines returns incomplete trailing lines in remaining buffer", () => {
  const messages: Array<unknown> = [];
  const raw = 'event: ready\ndata: {"count":1}\n\nevent: partial\ndata: {"cou';

  const { remaining } = parseSseLines(raw, (data) => {
    messages.push(data);
  });

  expect(remaining).toBe('event: partial\ndata: {"cou');
  expect(messages).toEqual([{ count: 1 }]);
});

test("streamSse seamlessly handles messages split across packet chunks", async () => {
  const originalFetch = globalThis.fetch;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      // Chunk 1 ends in the middle of a data line without double newline
      controller.enqueue(
        encoder.encode('event: export.progress\ndata: {"status":"run'),
      );
      // Chunk 2 completes the JSON payload and line, ending with single newline
      controller.enqueue(encoder.encode('ning","progress":50}\n'));
      // Chunk 3 provides the closing double newline
      controller.enqueue(encoder.encode('\n'));
      // Chunk 4 provides the terminal event
      controller.enqueue(
        encoder.encode('event: export.progress\ndata: {"status":"succeeded"}\n\n'),
      );
      controller.close();
    },
  });

  globalThis.fetch = (async () => {
    return new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  }) as typeof fetch;

  try {
    const received: Array<{ status: string; progress?: number }> = [];
    const unsubscribe = streamSse<{ status: string; progress?: number }>(
      "/exports/exp-chunked/events",
      {
        organizationId: "org-test-1",
        onMessage: (data) => {
          received.push(data);
        },
        isTerminal: (data) => data.status === "succeeded",
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(received).toEqual([
      { status: "running", progress: 50 },
      { status: "succeeded" },
    ]);
    unsubscribe();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("streamSse requests with active organization header and parses stream chunks", async () => {
  const originalFetch = globalThis.fetch;
  const receivedHeaders: Record<string, string> = {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode('event: export.progress\ndata: {"status":"queued"}\n\n'),
      );
      controller.enqueue(
        encoder.encode('event: export.progress\ndata: {"status":"succeeded"}\n\n'),
      );
      controller.close();
    },
  });

  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    if (init?.headers) {
      const h = new Headers(init.headers);
      h.forEach((value, key) => {
        receivedHeaders[key] = value;
      });
    }
    return new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  }) as typeof fetch;

  try {
    const received: Array<{ status: string }> = [];
    const unsubscribe = streamSse<{ status: string }>("/exports/exp-1/events", {
      organizationId: "org-test-1",
      onMessage: (data) => {
        received.push(data);
      },
      isTerminal: (data) => data.status === "succeeded",
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(receivedHeaders["accept"]).toBe("text/event-stream");
    expect(receivedHeaders["x-acres-organization-id"]).toBe("org-test-1");
    expect(received).toEqual([{ status: "queued" }, { status: "succeeded" }]);
    unsubscribe();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("streamSse falls back to polling when stream setup fails", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    return new Response("Not Found", { status: 404 });
  }) as typeof fetch;

  try {
    const received: Array<{ status: string }> = [];
    let polled = false;

    const unsubscribe = streamSse<{ status: string }>("/exports/exp-fail/events", {
      organizationId: "org-test-1",
      onMessage: (data) => {
        received.push(data);
      },
      fallbackPoll: async () => {
        polled = true;
        return { status: "succeeded" };
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(polled).toBe(true);
    expect(received).toEqual([{ status: "succeeded" }]);
    unsubscribe();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("streamSse aborts cleanly when aborted by controller", async () => {
  const originalFetch = globalThis.fetch;
  const abortController = new AbortController();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode('event: export.progress\ndata: {"status":"queued"}\n\n'),
      );
    },
  });

  globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    init?.signal?.addEventListener("abort", () => {
      // Abort observed
    });
    return new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  }) as typeof fetch;

  try {
    const received: Array<{ status: string }> = [];
    const unsubscribe = streamSse<{ status: string }>("/exports/exp-abort/events", {
      signal: abortController.signal,
      onMessage: (data) => {
        received.push(data);
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(received).toEqual([{ status: "queued" }]);

    abortController.abort();
    unsubscribe();
  } finally {
    globalThis.fetch = originalFetch;
  }
});
