import { ORGANIZATION_HEADER_NAME } from "@acres/shared";

export type SseMessage<T> = {
  event?: string;
  id?: string;
  data: T;
};

export interface StreamSseOptions<T> {
  organizationId?: string;
  signal?: AbortSignal;
  onMessage: (data: T, message: SseMessage<T>) => void;
  onError?: (error: unknown) => void;
  fallbackPoll?: (signal: AbortSignal) => Promise<T>;
  /** Bounded polling after an expired/failed stream (defaults: 2s, 15 minutes). */
  pollIntervalMs?: number;
  pollMaxDurationMs?: number;
  isTerminal?: (data: T) => boolean;
}

export function parseSseLines<T>(
  rawText: string,
  onMessage: (data: T, message: SseMessage<T>) => void,
): { remaining: string } {
  // Event frames in W3C SSE are separated by double newlines (\n\n or \r\n\r\n)
  const parts = rawText.split(/\r?\n\r?\n/);
  // The last part is incomplete (not yet terminated by a double newline)
  const remaining = parts.pop() ?? "";

  for (const block of parts) {
    if (!block.trim()) {
      continue;
    }
    parseSingleBlock(block, onMessage);
  }

  return { remaining };
}

function parseSingleBlock<T>(
  block: string,
  onMessage: (data: T, message: SseMessage<T>) => void,
): void {
  const lines = block.split(/\r?\n/);
  let currentEvent: string | undefined;
  let currentId: string | undefined;
  const currentDataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith(":")) {
      // Comment / heartbeat line, skip
      continue;
    }

    const colonIndex = line.indexOf(":");
    let field = line;
    let value = "";
    if (colonIndex !== -1) {
      field = line.slice(0, colonIndex);
      value = line.slice(colonIndex + 1);
      if (value.startsWith(" ")) {
        value = value.slice(1);
      }
    }

    if (field === "event") {
      currentEvent = value;
    } else if (field === "id") {
      currentId = value;
    } else if (field === "data") {
      currentDataLines.push(value);
    }
  }

  if (currentDataLines.length > 0) {
    const joinedData = currentDataLines.join("\n");
    let parsed: unknown = joinedData;
    try {
      parsed = JSON.parse(joinedData);
    } catch {
      // Not valid JSON, keep as raw string
    }
    onMessage(parsed as T, {
      event: currentEvent,
      id: currentId,
      data: parsed as T,
    });
  }
}

export function streamSse<T>(
  path: string,
  options: StreamSseOptions<T>,
): () => void {
  const controller = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;

  let reachedTerminal = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const onAbort = () => {
    void reader?.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", onAbort, { once: true });

  const emit = (data: T, message: SseMessage<T>) => {
    if (signal.aborted || reachedTerminal) return;
    options.onMessage(data, message);
    if (options.isTerminal?.(data)) reachedTerminal = true;
  };

  const wait = (ms: number, waitSignal: AbortSignal) =>
    new Promise<void>((resolve) => {
      if (waitSignal.aborted) return resolve();
      const finish = () => {
        clearTimeout(timer);
        waitSignal.removeEventListener("abort", finish);
        resolve();
      };
      const timer = setTimeout(finish, ms);
      waitSignal.addEventListener("abort", finish, { once: true });
    });

  const poll = async () => {
    if (!options.fallbackPoll || reachedTerminal || signal.aborted) return;
    const interval = options.pollIntervalMs ?? 2000;
    const duration = options.pollMaxDurationMs ?? 15 * 60 * 1000;
    if (
      !Number.isFinite(interval) ||
      interval < 1 ||
      !Number.isFinite(duration) ||
      duration < 1
    ) {
      throw new Error("Progress polling requires positive finite limits.");
    }
    // Abort both the wait and an in-flight REST read when the budget expires.
    const pollController = new AbortController();
    const pollSignal = AbortSignal.any([signal, pollController.signal]);
    const timeout = setTimeout(() => pollController.abort(), duration);
    try {
      while (!signal.aborted && !reachedTerminal) {
        if (pollSignal.aborted)
          throw new Error(
            "Progress polling timed out. Refresh to check the job.",
          );
        const data = await options.fallbackPoll(pollSignal);
        if (pollSignal.aborted) {
          if (signal.aborted) return;
          throw new Error(
            "Progress polling timed out. Refresh to check the job.",
          );
        }
        emit(data, { data });
        // Preserve one-read behavior for callers without a terminal predicate.
        if (reachedTerminal || !options.isTerminal) return;
        await wait(Math.min(interval, duration), pollSignal);
      }
    } finally {
      clearTimeout(timeout);
    }
  };

  const readStream = async () => {
    try {
      if (signal.aborted) return;
      const headers = new Headers();
      headers.set("accept", "text/event-stream");
      if (options.organizationId !== undefined) {
        headers.set(ORGANIZATION_HEADER_NAME, options.organizationId);
      }

      const response = await fetch(`/api/v1${path}`, {
        method: "GET",
        headers,
        credentials: "include",
        cache: "no-store",
        signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`SSE stream failed with status ${response.status}`);
      }

      reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      try {
        while (true) {
          if (signal.aborted || reachedTerminal) {
            await reader.cancel();
            break;
          }

          const { value, done } = await reader.read();
          if (done) {
            if (buffer.length > 0) {
              parseSseLines<T>(buffer + "\n\n", emit);
            }
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const { remaining } = parseSseLines<T>(buffer, emit);
          buffer = remaining;

          if (reachedTerminal) {
            await reader.cancel();
            break;
          }
        }
      } catch (readError) {
        if (!signal.aborted) {
          throw readError;
        }
      }
    } finally {
      reader?.releaseLock();
      reader = undefined;
    }
  };

  const run = async () => {
    try {
      try {
        await readStream();
      } catch (error) {
        if (signal.aborted) return;
        if (!options.fallbackPoll) throw error;
      }
      // Normal EOF before a terminal event also needs continued progress reads.
      await poll();
    } catch (error) {
      if (!signal.aborted) options.onError?.(error);
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  };

  void run();
  return () => controller.abort();
}
