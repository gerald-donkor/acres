import Image from "next/image"
import type { ReactNode } from "react"

import {
  landingExample as example,
  regionalComparisons,
} from "./landing-example"

const labelClass = "font-mono text-label text-brand lg:text-label-lg"
const dataClass = "font-mono text-label-lg tabular-nums"

function ExampleLabel() {
  return (
    <div className={labelClass}>
      <p>Illustrative data</p>
      <p className="mt-1 text-ink">Invented figures for this example.</p>
    </div>
  )
}

function SourceReference() {
  return (
    <p className={`${dataClass} wrap-anywhere text-ink`} translate="no">
      {example.source} · {example.version} · {example.observations.length} rows
    </p>
  )
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
      className="flex h-full min-w-0 flex-col rounded-media bg-brand-soft p-6 md:p-8 lg:min-h-landing-photo-lg lg:p-10"
    >
      <figcaption>
        <ExampleLabel />
        <p className="mt-6 font-serif text-quote text-ink">
          Every region, in perspective.
        </p>
        <p className="mt-3 text-body text-ink">
          {example.metric} ({example.unit}) · {example.periods.join("–")}
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
      <ul className="my-6 space-y-6">
        {regionalComparisons.map((row) => (
          <li key={row.region}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-body text-ink">
              <span>{row.region}</span>
              <span className={dataClass}>
                {example.periods[0]}: {row.baseline}% · {example.periods[1]}:{" "}
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
        <span>50%</span>
        <span>100%</span>
      </div>
      <div className="mt-auto pt-6">
        <SourceReference />
      </div>
    </figure>
  )
}

function FieldMapping() {
  return (
    <dl className={`${dataClass} space-y-3 text-ink`}>
      {example.fields.map((field) => (
        <div
          key={field.column}
          className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule pb-3"
        >
          <dt translate="no">{field.column}</dt>
          <dd>
            <span aria-hidden="true" className="mr-2 text-brand">
              →
            </span>
            {field.role}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function SourceContextPlate() {
  return (
    <figure
      data-landing-plate="source"
      className="grid h-full min-w-0 content-start gap-5 md:grid-cols-2 lg:grid-cols-1"
    >
      <div className="relative aspect-video overflow-hidden rounded-media">
        <Image
          src="/assets/ui/landing/editorial/prampram-context.webp"
          alt="Homes, roads and green land in Prampram, Ghana, seen from above."
          fill
          quality={100}
          sizes="(max-width: 767px) calc(100vw - 32px), (max-width: 1023px) calc((100vw - 100px) / 2), (max-width: 1279px) calc((100vw - 100px) / 3), 393px"
          className="object-cover object-center"
        />
      </div>
      <figcaption className="min-w-0 rounded-card border border-rule p-5">
        <ExampleLabel />
        <p className="mt-4 text-body text-ink">
          From source fields to a shared meaning.
        </p>
        <div className="mt-5">
          <FieldMapping />
        </div>
        <p className={`${dataClass} mt-4 text-ink`}>
          Preview: 1 of {example.observations.length} source rows
        </p>
        <p className={`${dataClass} mt-2 text-ink-muted`}>
          {example.observations[0].region} · {example.observations[0].year} ·{" "}
          {example.observations[0].value}%
        </p>
        <div className="mt-4">
          <SourceReference />
        </div>
        <p className="mt-3 text-label-lg text-ink-muted">
          Photo provides geographic context; it is not the source of these
          figures.
        </p>
      </figcaption>
    </figure>
  )
}

export function ReportEvidencePlate() {
  return (
    <div
      data-landing-plate="evidence"
      className="min-w-0 rounded-media bg-sage p-5 md:p-8"
    >
      <figure className="rounded-card bg-canvas p-5 md:p-7">
        <figcaption>
          <ExampleLabel />
          <p className="mt-6 font-serif text-quote text-ink">
            {example.report}
          </p>
          <p className={`${labelClass} mt-4`}>
            Published example · revision {example.revision}
          </p>
        </figcaption>
        <p className="mt-7 border-t border-rule pt-6 text-body text-ink">
          The example shows higher canopy cover in {example.periods[1]} across
          all three regions.
        </p>
        <p className={`${labelClass} mt-7`}>
          Supporting evidence · {example.metric} (%)
        </p>
        <dl className="mt-4 space-y-5">
          {regionalComparisons.map((row) => (
            <div key={row.region} className="border-b border-rule pb-4">
              <dt className="text-body text-ink">{row.region}</dt>
              <dd
                className={`${dataClass} mt-2 flex flex-wrap justify-between gap-2 text-ink`}
              >
                <span>
                  {example.periods[0]}: {row.baseline}% → {example.periods[1]}:{" "}
                  {row.current}%
                </span>
                <span className="text-brand">
                  +{row.change} percentage points
                </span>
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-6">
          <SourceReference />
        </div>
        <p className="mt-3 text-label-lg text-ink-muted">
          Source → comparison → published revision
        </p>
      </figure>
    </div>
  )
}

function Preview({ name, children }: { name: string; children: ReactNode }) {
  return (
    <figure
      data-landing-preview={name}
      className="mb-6 min-h-64 min-w-0 rounded-card border border-rule p-4"
    >
      <figcaption>
        <ExampleLabel />
      </figcaption>
      <div className="mt-5">{children}</div>
    </figure>
  )
}

export function MappingPreview() {
  return (
    <Preview name="mapping">
      <FieldMapping />
    </Preview>
  )
}

export function ComparisonPreview() {
  return (
    <Preview name="comparison">
      <p className={`${dataClass} mb-4 text-ink`}>{example.metric} (%)</p>
      <p className="text-body text-ink">{regionalComparisons[0].region}</p>
      <p className={`${dataClass} mt-2 text-ink-muted`}>
        {example.periods[0]}: {regionalComparisons[0].baseline}% →{" "}
        {example.periods[1]}: {regionalComparisons[0].current}%
      </p>
      <ComparisonBars
        baseline={regionalComparisons[0].baseline}
        current={regionalComparisons[0].current}
      />
      <p className={`${dataClass} mt-3 text-ink-muted`}>
        0–100% scale · outlined → filled
      </p>
    </Preview>
  )
}

export function LineagePreview() {
  const row = regionalComparisons[0]
  return (
    <Preview name="lineage">
      <ol className={`${dataClass} space-y-3 text-ink`}>
        <li className="wrap-anywhere" translate="no">
          {example.source}
        </li>
        <li className="border-t border-rule pt-3">
          Version {example.version} · {example.observations.length} observations
        </li>
        <li className="border-t border-rule pt-3">
          {row.region} · {example.periods[1]}
          <br />
          {example.metric}: {row.current}%
        </li>
      </ol>
    </Preview>
  )
}

export function PublicationPreview() {
  return (
    <Preview name="publication">
      <div className="border-l-2 border-brand pl-4">
        <p className="font-serif text-h3 text-ink">{example.report}</p>
        <p className={`${dataClass} mt-3 text-brand`}>
          Published example
          <br />
          Revision {example.revision}
        </p>
        <p className={`${dataClass} mt-4 text-ink-muted`}>
          {regionalComparisons[0].region} · {example.periods[1]}
          <br />
          {example.metric}: {regionalComparisons[0].current}%<br />
          Source {example.version} · CSV / PDF export
        </p>
      </div>
    </Preview>
  )
}

export function ImportPreview() {
  const row = example.observations[0]
  return (
    <Preview name="import">
      <p className={`${dataClass} wrap-anywhere text-ink`} translate="no">
        {example.source}
      </p>
      <p className={`${dataClass} mt-2 text-ink-muted`}>
        1 of {example.observations.length} source rows
      </p>
      <dl className={`${dataClass} mt-4 space-y-3 text-ink`}>
        {example.fields.map((field, index) => (
          <div key={field.column} className="border-t border-rule pt-3">
            <dt translate="no">
              {field.column} → {field.role}
            </dt>
            <dd className="mt-1 text-brand">
              {[row.region, row.year, `${row.value}%`][index]}
            </dd>
          </div>
        ))}
      </dl>
    </Preview>
  )
}

export function ExplorePreview() {
  const row = regionalComparisons[0]
  return (
    <Preview name="explore">
      <p className="text-body text-ink">{row.region}</p>
      <p className={`${dataClass} mt-2 text-ink-muted`}>{example.metric} (%)</p>
      <dl className={`${dataClass} mt-4 space-y-3 text-ink`}>
        <div className="flex justify-between border-t border-rule pt-3">
          <dt>{example.periods[0]}</dt>
          <dd>{row.baseline}%</dd>
        </div>
        <div className="flex justify-between border-t border-rule pt-3">
          <dt>{example.periods[1]}</dt>
          <dd>{row.current}%</dd>
        </div>
      </dl>
      <p className={`${dataClass} mt-4 text-brand`}>
        +{row.change} percentage points
      </p>
    </Preview>
  )
}
