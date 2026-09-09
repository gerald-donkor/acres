import type { ReportEvidence } from "@acres/shared";

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function getEvidenceDetails(item: ReportEvidence) {
  const snapshot =
    item.snapshot && typeof item.snapshot === "object" && !Array.isArray(item.snapshot)
      ? (item.snapshot as Record<string, unknown>)
      : {};
  const metric =
    snapshot.metric && typeof snapshot.metric === "object" && !Array.isArray(snapshot.metric)
      ? (snapshot.metric as Record<string, unknown>)
      : {};
  const label =
    (typeof metric.label === "string" && metric.label) ||
    (typeof metric.key === "string" && metric.key) ||
    (typeof snapshot.name === "string" && snapshot.name) ||
    item.aggregateId ||
    item.dashboardViewId ||
    "Evidence";
  const value =
    snapshot.value !== undefined && snapshot.value !== null
      ? String(snapshot.value)
      : null;
  const unit = typeof snapshot.unit === "string" ? snapshot.unit : "";
  const period =
    snapshot.periodStart && snapshot.periodEnd
      ? `${formatDate(String(snapshot.periodStart))} – ${formatDate(String(snapshot.periodEnd))}`
      : null;
  const region =
    typeof snapshot.regionId === "string" ? snapshot.regionId : null;
  const observationCount =
    snapshot.observationCount !== undefined && snapshot.observationCount !== null
      ? Number(snapshot.observationCount)
      : null;
  const datasetVersion =
    (typeof snapshot.datasetVersionId === "string" &&
      snapshot.datasetVersionId) ||
    item.datasetVersionId ||
    null;
  const presentation =
    snapshot.presentation &&
    typeof snapshot.presentation === "object" &&
    !Array.isArray(snapshot.presentation)
      ? (snapshot.presentation as Record<string, unknown>)
      : {};
  const chartType =
    typeof presentation.chart === "string" ? presentation.chart : null;

  return {
    label,
    value,
    unit,
    period,
    region,
    observationCount,
    datasetVersion,
    chartType,
  };
}
