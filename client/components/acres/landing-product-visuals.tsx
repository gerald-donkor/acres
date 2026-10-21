import Image from "next/image"

import {
  landingExample as example,
  regionalComparisons,
} from "./landing-example"

const labelClass = "font-mono text-label text-brand lg:text-label-lg"
const dataClass = "font-mono text-label-lg tabular-nums"

function ExampleLabel() {
  return <p className={labelClass}>Illustrative data · invented values</p>
}

/** All lengths are quantitative percentages on a common zero-based scale. */
function ComparisonBars({
  baseline,
  current,
}: {
  baseline: number
  current: number
}) {
  return (
    <div aria-hidden="true" className="mt-3 space-y-2">
      <div
        className="h-3 rounded-full border border-brand bg-canvas"
        style={{ width: `${baseline}%` }}
      />
      <div
        className="h-3 rounded-full bg-brand"
        style={{ width: `${current}%` }}
      />
    </div>
  )
}

export function RegionalComparisonPlate() {
  return (
    <figure
      data-landing-plate="comparison"
      aria-describedby="comparison-source"
      className="min-w-0 rounded-media bg-brand-soft p-8 md:p-10 lg:p-14"
    >
      <figcaption>
        <ExampleLabel />
        <p className="mt-6 font-serif text-quote text-ink">
          {example.metric} ({example.unit})
        </p>
      </figcaption>
      <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 font-mono text-label-lg text-ink">
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-3 w-6 rounded-full border border-brand bg-canvas"
          />
          {example.periods[0]}
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="h-3 w-6 rounded-full bg-brand" />
          {example.periods[1]}
        </span>
      </div>
      <ul className="my-8 space-y-10 lg:space-y-12">
        {regionalComparisons.map((row) => (
          <li key={row.region}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-body text-ink">
              <span>{row.region}</span>
              <span className={dataClass}>
                <span className="sr-only">{example.periods[0]}: </span>
                {row.baseline}% →{" "}
                <span className="sr-only">{example.periods[1]}: </span>
                {row.current}%
              </span>
            </div>
            <ComparisonBars baseline={row.baseline} current={row.current} />
          </li>
        ))}
      </ul>
      <div
        aria-label="Chart scale: 0 to 100 percent"
        className={`${dataClass} flex justify-between border-t border-brand pt-2 text-brand`}
      >
        <span>0%</span>
        <span>100%</span>
      </div>
      <p className={`${dataClass} mt-6 text-ink`}>
        Example dataset · {example.version}
      </p>
      <p id="comparison-source" className="sr-only" translate="no">
        Source: {example.source} · {example.version}
      </p>
    </figure>
  )
}

export function GeographicContextPhoto() {
  return (
    <div
      data-landing-plate="source"
      className="relative aspect-video min-w-0 overflow-hidden rounded-media md:aspect-21/9"
    >
      <Image
        src="/assets/ui/landing/editorial/prampram-context.webp"
        alt="Homes, roads and green land in Prampram, Ghana, seen from above."
        fill
        quality={100}
        sizes="(max-width: 767px) calc(100vw - 32px), (max-width: 1279px) calc(100vw - 80px), 1200px"
        className="object-cover object-center"
      />
    </div>
  )
}

export function ReportEvidencePlate() {
  const row = regionalComparisons[0]
  return (
    <div
      data-landing-plate="evidence"
      className="min-w-0 rounded-media bg-sage p-6 md:p-8"
    >
      <figure className="rounded-card bg-canvas p-8 md:p-10">
        <figcaption>
          <ExampleLabel />
          <p className="mt-6 font-serif text-quote text-ink">
            {example.report}
          </p>
          <p className={`${labelClass} mt-4`}>
            Published example · revision {example.revision}
          </p>
        </figcaption>
        <dl className="mt-8 border-t border-rule pt-8">
          <dt className="text-body text-ink">
            {row.region} · {example.metric} ({example.unit})
          </dt>
          <dd className={`${dataClass} mt-4 text-ink`}>
            {example.periods[0]}: {row.baseline}% → {example.periods[1]}:{" "}
            {row.current}%
          </dd>
          <dd className={`${dataClass} mt-4 text-brand`}>
            +{row.change} percentage points
          </dd>
          <dd
            className={`${dataClass} mt-8 wrap-anywhere text-ink`}
            translate="no"
          >
            {example.source} · {example.version}
          </dd>
        </dl>
      </figure>
    </div>
  )
}
