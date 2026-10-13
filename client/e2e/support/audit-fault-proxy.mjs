// Test process only: never imported by application code or started by app scripts.
import { createServer, request } from "node:http";

const upstream = new URL(process.env.PLAYWRIGHT_API_URL);
const port = Number(process.env.PLAYWRIGHT_AUDIT_PROXY_PORT);
const token = process.env.PLAYWRIGHT_AUDIT_CONTROL_TOKEN;
if (
  upstream.protocol !== "http:" ||
  upstream.hostname !== "127.0.0.1" ||
  !port ||
  !token
) {
  throw new Error(
    "Audit fault proxy requires explicit local test configuration",
  );
}
const states = new Map();
const server = createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    if (req.url === "/__audit_control") {
      if (req.headers.authorization !== `Bearer ${token}`) {
        res.writeHead(403).end();
        return;
      }
      const { id, fault } = JSON.parse(body.toString());
      if (req.method === "PUT") {
        states.set(id, { fault, session: 0, organizations: 0, hits: 0 });
      }
      const state = states.get(id);
      if (req.method === "DELETE") states.delete(id);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(state ?? null));
      return;
    }
    if (req.url === "/__audit_ready") {
      res.end("ready");
      return;
    }
    const id = /(?:^|;\s*)acres_audit_fault=([^;]+)/.exec(
      req.headers.cookie ?? "",
    )?.[1];
    const state = states.get(id);
    const isSession = req.url === "/api/v1/auth/session";
    const isOrganizations = req.url === "/api/v1/organizations";
    const isAudit =
      req.url === "/graphql" &&
      JSON.parse(body.toString()).operationName === "OrganizationAuditHistory";
    const fault = state?.fault;
    const shouldFail =
      fault &&
      ((fault.target === "audit" && isAudit) ||
        (fault.target === "session" && isSession) ||
        (fault.target === "organizations" && isOrganizations));
    if (shouldFail) {
      state.contextAtHit ??= {
        session: state.session,
        organizations: state.organizations,
      };
      state.hits++;
      if (fault.kind === "disconnect") {
        req.socket.destroy();
        return;
      }
      res.writeHead(fault.kind === "503" ? 503 : 200, {
        "content-type": "application/json",
      });
      res.end(
        fault.kind === "malformed"
          ? fault.sentinel
          : JSON.stringify({
              data: {
                organizationAuditEvents: {
                  edges: [{ node: { id: fault.sentinel } }],
                },
              },
              errors: [
                { message: fault.sentinel, extensions: { code: fault.kind } },
              ],
            }),
      );
      return;
    }
    const forwarded = request(
      new URL(req.url, upstream),
      {
        method: req.method,
        headers: { ...req.headers, host: upstream.host },
      },
      (response) => {
        if (state && response.statusCode >= 200 && response.statusCode < 300) {
          if (isSession) state.session++;
          if (isOrganizations) state.organizations++;
        }
        res.writeHead(response.statusCode, response.headers);
        response.pipe(res);
      },
    );
    forwarded.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    res.on("close", () => forwarded.destroy());
    forwarded.end(body);
  } catch {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});
server.listen(port, "127.0.0.1");
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    states.clear();
    server.close();
    server.closeAllConnections();
  });
}
