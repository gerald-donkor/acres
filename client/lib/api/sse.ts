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
  fallbackPoll?: () => Promise<T>;
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

  const run = async () => {
    try {
      const headers = new Headers();
      headers.set("accept", "text/event-stream");
      if (options.organizationId !== undefined) {
        headers.set("x-acres-organization-id", options.organizationId);
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

      const reader = response.body.getReader();
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
              parseSseLines<T>(buffer + "\n\n", (data, msg) => {
                options.onMessage(data, msg);
                if (options.isTerminal?.(data)) {
                  reachedTerminal = true;
                }
              });
            }
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const { remaining } = parseSseLines<T>(buffer, (data, msg) => {
            options.onMessage(data, msg);
            if (options.isTerminal?.(data)) {
              reachedTerminal = true;
            }
          });
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
    } catch (error) {
      if (signal.aborted) {
        return;
      }
      if (options.fallbackPoll && !reachedTerminal) {
        try {
          const polled = await options.fallbackPoll();
          options.onMessage(polled, { data: polled });
          return;
        } catch (pollError) {
          options.onError?.(pollError);
          return;
        }
      }
      options.onError?.(error);
    }
  };

  void run();

  return () => {
    controller.abort();
  };
}
