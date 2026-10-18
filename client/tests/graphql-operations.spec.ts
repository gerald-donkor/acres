import { expect, test } from "@playwright/test";

import {
  AUDIT_HISTORY_OPERATION,
  AUDIT_HISTORY_QUERY,
} from "@/lib/api/audit-history";
import {
  DASHBOARD_SUMMARY_OPERATION,
  DASHBOARD_SUMMARY_QUERY,
} from "@/lib/api/dashboard-summary";

// `graphql` is not a client dependency, so operation definitions are read
// with a pattern rather than the parser.
const OPERATION_DEFINITION =
  /^\s*(?:query|mutation|subscription)\s+([A-Za-z_][A-Za-z0-9_]*)/gm;

const DOCUMENTS = [
  ["dashboard summary", DASHBOARD_SUMMARY_QUERY, DASHBOARD_SUMMARY_OPERATION],
  ["audit history", AUDIT_HISTORY_QUERY, AUDIT_HISTORY_OPERATION],
] as const;

for (const [label, document, operationName] of DOCUMENTS) {
  test(`${label} declares one operation named ${operationName}`, () => {
    const names = [...document.matchAll(OPERATION_DEFINITION)].map(
      (match) => match[1],
    );

    expect(names).toEqual([operationName]);
  });
}
