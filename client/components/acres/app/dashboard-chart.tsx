"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { DashboardAggregate } from "@acres/shared";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const chartConfig = {
  value: {
    label: "Value",
    color: "var(--color-brand)",
  },
} satisfies ChartConfig;

export function DashboardChart({
  aggregates,
}: {
  aggregates: DashboardAggregate[];
}) {
  const data = aggregates
    .filter((aggregate) => aggregate.value.type === "numeric")
    .slice(0, 12)
    .map((aggregate) => ({
      label: aggregate.periodStart.slice(0, 10),
      value: Number(aggregate.value.value),
    }))
    .filter((point) => Number.isFinite(point.value));

  if (data.length === 0) {
    return (
      <p className="border border-rule p-4 text-body text-ink-muted">
        The current result set has no numeric values to chart.
      </p>
    );
  }

  return (
    <ChartContainer
      config={chartConfig}
      className="min-h-64 w-full border border-rule p-3"
    >
      <BarChart accessibilityLayer data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} width={48} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="value" fill="var(--color-value)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
