import Link from "next/link"

import { Button } from "@/components/acres/button"
import { Eyebrow } from "@/components/acres/eyebrow"
import { LandingMotion } from "@/components/acres/landing-motion"
import {
  GeographicContextPhoto,
  RegionalComparisonPlate,
  ReportEvidencePlate,
} from "@/components/acres/landing-product-visuals"
import { Section } from "@/components/acres/section"
import { cn } from "@/lib/utils"

type ContentItem = { title: string; body: string }
const benefits: readonly ContentItem[] = [
  {
    title: "Bring your data together",
    body: "Import CSV, XLSX and GeoJSON into a consistent dataset.",
  },
  {
    title: "Compare regions",
    body: "See how places and periods compare, with units in view.",
  },
  {
    title: "Keep the source in sight",
    body: "Trace a finding to its observations and dataset version.",
  },
  {
    title: "Share a clearer story",
    body: "Publish reviewed reports and export findings as CSV or PDF.",
  },
]

const steps: readonly (ContentItem & { marker: string })[] = [
  {
    marker: "01",
    title: "Import your data",
    body: "Upload a file and map its fields and regions.",
  },
  {
    marker: "02",
    title: "Explore your regions",
    body: "Compare metrics and save a view for your team.",
  },
  {
    marker: "03",
    title: "Publish your findings",
    body: "Review the evidence and publish a report revision.",
  },
]

const headingClass =
  "font-serif text-h2 text-ink text-balance md:text-h2-md lg:text-h2-lg"

export default function HomePage() {
  return (
    <LandingMotion>
      <Section
        align="center"
        aria-labelledby="hero-heading"
        className="pt-16 md:pt-20 lg:pt-24"
      >
        <div data-motion-hero-heading>
          <Eyebrow>Regional intelligence</Eyebrow>
          <h1
            id="hero-heading"
            className="mx-auto mt-6 max-w-5xl font-serif text-landing-hero text-ink text-balance md:text-landing-hero-md lg:text-landing-hero-lg"
          >
            See the bigger picture.
          </h1>
          <p className="mx-auto mt-7 max-w-xl text-body text-ink-muted text-pretty">
            Compare regional data. Share findings you can trace.
          </p>
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <CreateAccount />
          <Button
            render={<Link href="#how-to" />}
            nativeButton={false}
            variant="secondary"
          >
            See how it works
          </Button>
        </div>

        <div className="mt-16 grid items-center gap-12 text-left md:mt-20 md:grid-cols-[2fr_1fr] lg:mt-24 lg:gap-16">
          <div data-motion-hero-media className="min-w-0">
            <RegionalComparisonPlate />
          </div>
          <div data-motion-hero-media className="min-w-0">
            <GeographicContextPhoto />
          </div>
        </div>
      </Section>

      <Section
        id="benefits"
        aria-labelledby="benefits-heading"
        className="scroll-mt-section"
      >
        <div data-motion-group="benefits-heading" data-motion-pace="tight">
          <Eyebrow data-motion-item>Benefits</Eyebrow>
          <h2
            id="benefits-heading"
            data-motion-item
            className={cn(headingClass, "mt-6")}
          >
            Regional data, made clear.
          </h2>
        </div>
        <div
          data-motion-group="benefits"
          className="mt-16 grid gap-x-5 gap-y-12 md:mt-20 md:grid-cols-2 lg:grid-cols-4"
        >
          {benefits.map((benefit) => (
            <article
              key={benefit.title}
              data-motion-item
              className="border-t border-rule pt-8"
            >
              <h3 className="font-serif text-h3 text-ink">{benefit.title}</h3>
              <p className="mt-4 text-body text-ink-muted">{benefit.body}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section
        id="specifications"
        aria-labelledby="detail-heading"
        className="scroll-mt-section"
      >
        <div className="grid items-center gap-12 md:gap-16 lg:grid-cols-2 lg:gap-20">
          <div data-motion-media className="min-w-0">
            <ReportEvidencePlate />
          </div>
          <div>
            <div data-motion-group="detail-heading" data-motion-pace="tight">
              <Eyebrow data-motion-item>Reports</Eyebrow>
              <h2
                id="detail-heading"
                data-motion-item
                className={cn(headingClass, "mt-6")}
              >
                Evidence you can return to.
              </h2>
              <p
                data-motion-item
                className="mt-7 max-w-xl text-body text-ink-muted text-pretty"
              >
                Published revisions preserve the evidence behind your findings.
              </p>
            </div>
          </div>
        </div>
      </Section>

      <Section
        id="how-to"
        aria-labelledby="how-to-heading"
        className="scroll-mt-section"
      >
        <div data-motion-group="workflow-heading" data-motion-pace="tight">
          <Eyebrow data-motion-item>How it works</Eyebrow>
          <h2
            id="how-to-heading"
            data-motion-item
            className={cn(headingClass, "mt-6 max-w-3xl")}
          >
            From file to finding.
          </h2>
        </div>
        <ol
          data-motion-group="steps"
          className="mt-16 grid gap-16 md:mt-20 md:grid-cols-3 md:gap-5"
        >
          {steps.map((step) => (
            <li
              key={step.marker}
              data-motion-item
              className="border-t border-rule pt-8"
            >
              <span
                aria-hidden="true"
                className="block text-stat text-ink-faint md:text-stat-md"
              >
                {step.marker}
              </span>
              <h3 className="mt-8 font-serif text-h3 text-ink">{step.title}</h3>
              <p className="mt-4 max-w-sm text-body text-ink-muted lg:pr-10">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        id="contact"
        align="center"
        aria-labelledby="contact-heading"
        className="scroll-mt-section"
      >
        <div className="border-t border-rule pt-section">
          <div data-motion-group="contact" data-motion-pace="tight">
            <h2
              id="contact-heading"
              data-motion-item
              className={cn(headingClass, "mx-auto max-w-2xl")}
            >
              Put your regions in perspective.
            </h2>
          </div>
          <div className="mt-10">
            <CreateAccount />
          </div>
        </div>
      </Section>
    </LandingMotion>
  )
}

function CreateAccount() {
  return (
    <Button render={<Link href="/register" />} nativeButton={false}>
      Create Account
    </Button>
  )
}
