import Image from "next/image"
import Link from "next/link"

import { Button } from "@/components/acres/button"
import { Eyebrow } from "@/components/acres/eyebrow"
import { LandingMotion } from "@/components/acres/landing-motion"
import { Section } from "@/components/acres/section"
import { cn } from "@/lib/utils"

type ContentItem = { title: string; body: string }

const benefits: readonly ContentItem[] = [
  {
    title: "Bring your data together",
    body: "Import CSV, XLSX and GeoJSON files. Map your measures, time periods and regions into a consistent dataset.",
  },
  {
    title: "Compare regions",
    body: "Explore metrics across places and periods. Keep units, definitions and data quality in view as you compare.",
  },
  {
    title: "Keep the source in sight",
    body: "Follow a result back to its observations and dataset version. Understand the evidence behind the number.",
  },
  {
    title: "Share a clearer story",
    body: "Build reports around saved evidence. Publish a reviewed revision and export your findings as CSV or PDF.",
  },
]

const details: readonly ContentItem[] = [
  {
    title: "Start with a sound source",
    body: "Review validation issues and map your fields before publishing a dataset version for analysis.",
  },
  {
    title: "Compare with context",
    body: "Filter by region, metric and period. Save a dashboard view to return to the same selection with your team.",
  },
  {
    title: "Make the evidence last",
    body: "Published report revisions preserve their evidence, keeping the source behind your findings in reach.",
  },
]

const steps: readonly (ContentItem & { marker: string })[] = [
  {
    marker: "01",
    title: "Import your data",
    body: "Upload your source files, review validation results, and map the fields and regions that give your data meaning.",
  },
  {
    marker: "02",
    title: "Explore your regions",
    body: "Compare metrics across places and periods. Save the views that help your team understand what is changing.",
  },
  {
    marker: "03",
    title: "Publish your findings",
    body: "Turn evidence into a report, send it through review, and publish a revision your team can return to.",
  },
]

const photoRoot = "/assets/ui/landing/editorial"
const headingClass =
  "font-serif text-h2 text-ink text-balance md:text-h2-md lg:text-h2-lg"

export default function HomePage() {
  return (
    <LandingMotion>
      <Section
        align="center"
        aria-labelledby="hero-heading"
        className="pt-10 md:pt-15 lg:pt-16"
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
            Turn regional data into clear comparisons, traceable reports, and
            better-informed decisions.
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

        <div className="mt-10 grid gap-7 text-left md:mt-12 md:grid-cols-[2fr_1fr] md:gap-5 lg:mt-16">
          <figure className="min-w-0">
            <div data-motion-hero-media>
              <Photo
                name="melbourne-neighborhood.webp"
                alt="A grid of residential streets, rooftops and gardens seen from directly above."
                sizes="(max-width: 767px) calc((100vw - 32px) * 10 / 9), (max-width: 1023px) 640px, 787px"
                hero
                className="aspect-editorial md:aspect-auto md:h-landing-photo-md lg:h-landing-photo-lg"
              />
            </div>
          </figure>
          <figure className="min-w-0">
            <div data-motion-hero-media>
              <Photo
                name="ladenburg-fields.webp"
                alt="Cultivated fields divided by intersecting farm roads, with rows of crops and scattered hay bales."
                sizes="(max-width: 767px) calc(100vw - 32px), (max-width: 1023px) 531px, 648px"
                className="aspect-video md:aspect-auto md:h-landing-photo-md lg:h-landing-photo-lg"
              />
            </div>
          </figure>
        </div>

        <ul
          aria-label="Acres capabilities"
          className="mt-10 grid gap-5 border-y border-rule py-6 font-mono text-label text-brand md:grid-cols-3 md:gap-8 lg:text-label-lg"
        >
          <li>CSV, XLSX &amp; GeoJSON</li>
          <li>Regional comparisons</li>
          <li>Traceable reports</li>
        </ul>
      </Section>

      <Section
        id="benefits"
        aria-labelledby="benefits-heading"
        className="scroll-mt-section"
      >
        <div data-motion-group="benefits-heading" data-motion-pace="tight">
          <Eyebrow data-motion-item>From data to decisions</Eyebrow>
          <div className="mt-6 grid gap-7 lg:grid-cols-[2fr_1fr] lg:items-end lg:gap-16">
            <h2 id="benefits-heading" data-motion-item className={headingClass}>
              Know what matters. See where it happens.
            </h2>
            <p
              data-motion-item
              className="max-w-xl text-body text-ink-muted text-pretty"
            >
              Your organization’s data tells a story about the places you work.
              Bring it into focus with regional analysis your team can follow.
            </p>
          </div>
        </div>
        <div
          data-motion-group="benefits"
          className="mt-12 grid gap-x-5 gap-y-10 md:grid-cols-2 lg:mt-16 lg:grid-cols-4"
        >
          {benefits.map((benefit) => (
            <article
              key={benefit.title}
              data-motion-item
              className="border-t border-rule pt-6"
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
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <figure className="min-w-0">
            <div data-motion-media>
              <Photo
                name="espoo-road.webp"
                alt="A highway connects wooded shores across water, with settlements in the distance."
                sizes="(max-width: 767px) calc(100vw - 32px), (max-width: 1023px) calc(100vw - 80px), (max-width: 1279px) calc((100vw - 144px) / 2), 568px"
                className="aspect-editorial lg:aspect-editorial-portrait"
              />
            </div>
          </figure>
          <div>
            <div data-motion-group="detail-heading" data-motion-pace="tight">
              <Eyebrow data-motion-item>A clearer perspective</Eyebrow>
              <h2
                id="detail-heading"
                data-motion-item
                className={cn(headingClass, "mt-6")}
              >
                The detail behind every decision.
              </h2>
            </div>
            <div data-motion-group="details" className="mt-10">
              {details.map((detail) => (
                <div
                  key={detail.title}
                  data-motion-item
                  className="border-t border-rule py-6 last:pb-0"
                >
                  <h3 className="font-serif text-h3 text-ink">
                    {detail.title}
                  </h3>
                  <p className="mt-3 max-w-xl text-body text-ink-muted">
                    {detail.body}
                  </p>
                </div>
              ))}
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
            From your first dataset to your next decision.
          </h2>
        </div>
        <ol
          data-motion-group="steps"
          className="mt-12 grid gap-10 md:grid-cols-3 md:gap-5 lg:mt-16"
        >
          {steps.map((step) => (
            <li
              key={step.marker}
              data-motion-item
              className="border-t border-rule pt-8"
            >
              <span
                aria-hidden="true"
                className="text-stat text-ink-faint md:text-stat-md"
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
            <Eyebrow data-motion-item>See what’s possible</Eyebrow>
            <h2
              id="contact-heading"
              data-motion-item
              className={cn(headingClass, "mx-auto mt-6 max-w-2xl")}
            >
              Put your regions in perspective.
            </h2>
            <p
              data-motion-item
              className="mx-auto mt-7 max-w-xl text-body text-ink-muted text-pretty"
            >
              Give your team a shared place to turn regional data into findings
              they can use.
            </p>
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

function Photo({
  name,
  alt,
  sizes,
  className,
  hero = false,
}: {
  name: string
  alt: string
  sizes: string
  className: string
  hero?: boolean
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-media", className)}>
      {/* Hero sizes include the pixels needed to cover the tall cropped box. */}
      <Image
        src={`${photoRoot}/${name}`}
        alt={alt}
        fill
        quality={100}
        sizes={sizes}
        loading={hero ? "eager" : "lazy"}
        fetchPriority={hero ? "high" : undefined}
        className="object-cover object-center"
      />
    </div>
  )
}
