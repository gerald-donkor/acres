/** Invented marketing figures; never imported by the authenticated app or API. */
export const landingExample = {
  metric: "Canopy cover",
  unit: "%",
  periods: [2024, 2025],
  source: "regional-canopy-example.csv",
  version: "v1",
  report: "Regional canopy comparison",
  revision: 1,
  fields: [
    { column: "region", role: "Region" },
    { column: "year", role: "Period" },
    { column: "canopy_pct", role: "Metric" },
  ],
  observations: [
    { region: "Greater Accra", year: 2024, value: 18 },
    { region: "Greater Accra", year: 2025, value: 24 },
    { region: "Ashanti", year: 2024, value: 35 },
    { region: "Ashanti", year: 2025, value: 41 },
    { region: "Northern", year: 2024, value: 54 },
    { region: "Northern", year: 2025, value: 58 },
  ],
} as const

export const regionalComparisons: readonly {
  readonly region: string
  readonly baseline: number
  readonly current: number
  readonly change: number
}[] = landingExample.observations
  .filter((row) => row.year === landingExample.periods[0])
  .map((baseline) => {
    const current = landingExample.observations.find(
      (row) =>
        row.region === baseline.region &&
        row.year === landingExample.periods[1],
    )!
    return {
      region: baseline.region,
      baseline: baseline.value,
      current: current.value,
      change: current.value - baseline.value,
    } as const
  })
