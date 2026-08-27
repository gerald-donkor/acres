"use client";

import { useEffect, useState } from "react";
import type { ExportRequest } from "@acres/shared";

import { ExportDownloadButton } from "@/components/acres/app/report-actions";
import { Badge } from "@/components/ui/badge";
import { streamExportProgress } from "@/lib/api/browser";

export function ExportStatus({
  organizationId,
  exports,
}: {
  organizationId: string;
  exports: ExportRequest[];
}) {
  const [updates, setUpdates] = useState<Record<string, ExportRequest>>({});
  const [announcement, setAnnouncement] = useState<string>("");

  const items = exports.map((item) => updates[item.id] ?? item);

  useEffect(() => {
    const controllers = new Map<string, AbortController>();

    for (const item of exports) {
      if (
        item.status === "succeeded" ||
        item.status === "failed" ||
        item.status === "cancelled"
      ) {
        continue;
      }

      const controller = new AbortController();
      controllers.set(item.id, controller);

      streamExportProgress(organizationId, item.id, {
        signal: controller.signal,
        onUpdate: (updated) => {
          setUpdates((current) => ({
            ...current,
            [updated.id]: updated,
          }));
          if (
            updated.status === "succeeded" ||
            updated.status === "failed" ||
            updated.status === "cancelled"
          ) {
            setAnnouncement(
              `Export ${updated.format.toUpperCase()} ${updated.status}.`,
            );
          }
        },
      });
    }

    return () => {
      for (const controller of controllers.values()) {
        controller.abort();
      }
    };
  }, [exports, organizationId]);

  return (
    <aside className="grid content-start gap-3 border border-rule p-4">
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <h2 className="text-ui text-ink">Exports</h2>
      {items.length === 0 ? (
        <p className="text-body text-ink-muted">No exports requested yet.</p>
      ) : (
        items.map((item) => (
          <div key={item.id} className="border-b border-rule pb-3 last:border-0">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-label uppercase text-ink-muted lg:text-label-lg">
                {item.format}
              </span>
              <Badge variant={item.status === "succeeded" ? "secondary" : "outline"}>
                {item.status}
              </Badge>
            </div>
            <p className="mt-2 text-body text-ink-muted">
              {item.failure?.message ?? formatDate(item.createdAt)}
            </p>
            {item.status === "succeeded" ? (
              <ExportDownloadButton
                organizationId={organizationId}
                exportId={item.id}
              />
            ) : null}
          </div>
        ))
      )}
    </aside>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
