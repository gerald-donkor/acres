import Image from "next/image"
import Link from "next/link"

import { Button } from "@/components/acres/button"
import { Container } from "@/components/acres/container"
import { Eyebrow } from "@/components/acres/eyebrow"
import { Icon, type IconName } from "@/components/acres/icon"
import { Rule } from "@/components/acres/rule"
import { Section } from "@/components/acres/section"
import { cn } from "@/lib/utils"

const trustedMarks = [
  { src: "/assets/ui/landing/trusted-mark-01.png", width: 181, height: 44 },
  { src: "/assets/ui/landing/trusted-mark-02.png", width: 114, height: 22 },
  { src: "/assets/ui/landing/trusted-mark-03.png", width: 50, height: 44 },
  { src: "/assets/ui/landing/trusted-mark-04.png", width: 218, height: 24 },
  { src: "/assets/ui/landing/trusted-mark-05.png", width: 114, height: 20 },
  { src: "/assets/ui/landing/trusted-mark-06.png", width: 106, height: 38 },
] as const

const benefits: {
  title: string
  body: string
  icon: IconName
  iconClassName?: string
}[] = [
  {
    title: "Amplify Insights",
    body: "Unlock data-driven decisions with comprehensive analytics, revealing key opportunities for strategic regional growth.",
    icon: "cable",
    iconClassName: "-rotate-45 -scale-x-100",
  },
  {
    title: "Control Your Global Presence",
    body: "Manage and track satellite offices, ensuring consistent performance and streamlined operations everywhere.",
    icon: "public",
  },
  {
    title: "Remove Language Barriers",
    body: "Adapt to diverse markets with built-in localization for clear communication and enhanced user experience.",
    icon: "record_voice_over",
  },
  {
    title: "Visualise Growth",
    body: "Generate precise, visually compelling reports that illustrate your growth trajectories across all regions.",
    icon: "show_chart",
  },
]

const bigPictureRows = [
  {
    marker: "01",
    text: "Spot Trends in Seconds: No more digging through numbers.",
  },
  {
    marker: "02",
    text: "Get Everyone on the Same Page: Share easy-to-understand reports with your team.",
  },
  {
    marker: "03",
    text: "Make Presentations Pop: Interactive maps and dashboards keep your audience engaged.",
  },
  {
    marker: "04",
    text: "Your Global Snapshot: Get a quick, clear overview of your entire operation.",
  },
]

const comparisonRows = [
  ["Ultra-fast browsing", "Fast browsing", "Moderate speeds"],
  ["Advanced AI insights", "Basic AI recommendations", "No AI assistance"],
  ["Seamless integration", "Restricts customization", "Steep learning curve"],
  ["Advanced AI insights", "Basic AI insights", "No AI assistance"],
  ["Ultra-fast browsing", "Fast browsing", "Moderate speeds"],
  ["Full UTF-8 support", "Potential display errors", "Partial UTF-8 support"],
] as const

const comparisonStatus = [
  ["check", "check", "close"],
  ["check", "check", "close"],
  ["check", "check", "close"],
  ["check", "close", "close"],
  ["check", "check", "close"],
  ["check", "close", "close"],
] as const

const steps = [
  {
    marker: "01",
    title: "Get Started",
    body: "With our intuitive setup, you're up and running in minutes.",
  },
  {
    marker: "02",
    title: "Customize and Configure",
    body: "Adapt Acres to your specific requirements and business goals.",
  },
  {
    marker: "03",
    title: "Grow Your Business",
    body: "Make informed decisions to exceed your goals and expand confidently.",
  },
]

const focusClass =
  "outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded-sm"

export default function Home() {
  return (
    <>
      <section className="pt-16 md:pt-24 lg:pt-28">
        <Container className="text-center">
          <h1 className="font-serif text-hero text-ink text-balance md:text-hero-md lg:text-hero-lg">
            Browse everything.
          </h1>
          <div className="mt-10 rounded-media bg-sage px-4 pt-10 md:mt-12 md:px-14 md:pt-12 lg:mt-14 lg:px-24 lg:pt-14">
            <picture>
              <source
                media="(max-width: 767px)"
                srcSet="/assets/ui/landing/report-device-mobile.webp"
              />
              <Image
                src="/assets/ui/landing/report-device-desktop.webp"
                alt="Acres regional analytics report interface with an efficiency trend chart."
                width={1741}
                height={1216}
                priority
                sizes="(max-width: 767px) 78vw, min(92vw, 980px)"
                className="mx-auto h-auto w-full max-w-[61.25rem] md:max-w-[55rem]"
              />
            </picture>
          </div>
        </Container>
      </section>

      <section aria-labelledby="trusted-heading" className="pt-12 md:pt-14">
        <Container>
          <div className="flex flex-col gap-10 md:gap-12 lg:flex-row lg:items-center lg:gap-16">
            <h2
              id="trusted-heading"
              className="text-body text-ink-muted scroll-mt-section"
            >
              Trusted by:
            </h2>
            <ul className="grid flex-1 grid-cols-2 items-center gap-x-12 gap-y-10 md:grid-cols-3 lg:grid-cols-6 lg:gap-x-12">
              {trustedMarks.map((mark, index) => (
                <li key={mark.src} className="flex justify-center lg:justify-start">
                  <Image
                    src={mark.src}
                    alt=""
                    width={mark.width}
                    height={mark.height}
                    className="h-auto max-h-11 w-auto opacity-100"
                  />
                  <span className="sr-only">Trusted partner mark {index + 1}</span>
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </section>

      <Section id="benefits" aria-labelledby="benefits-heading">
        <div className="scroll-mt-section">
          <Eyebrow>Benefits</Eyebrow>
          <div className="mt-5 max-w-[42rem]">
            <h2
              id="benefits-heading"
              className="font-serif text-h2 text-ink text-balance md:text-h2-md lg:text-h2-lg"
            >
              We&apos;ve cracked the code.
            </h2>
            <p className="mt-6 max-w-[26rem] text-body text-ink-muted">
              <span translate="no">Acres</span> provides real insights, without
              the data overload.
            </p>
          </div>
        </div>

        <div className="mt-20 grid gap-x-5 gap-y-14 md:grid-cols-2 lg:grid-cols-4">
          {benefits.map((item) => (
            <article key={item.title} className="border-t border-rule pt-7">
              <Icon
                name={item.icon}
                className={cn("text-ink", item.iconClassName)}
              />
              <h3 className="mt-10 font-serif text-h3 text-ink">{item.title}</h3>
              <p className="mt-5 text-body text-ink-muted">{item.body}</p>
            </article>
          ))}
        </div>
      </Section>

      <MediaBand
        src="/assets/ui/landing/mountain.webp"
        width={4096}
        height={2304}
        alt="Layered mountain ridges in shifting green, blue, and rose light."
      />

      <Section aria-labelledby="big-picture-heading">
        <div className="grid gap-16 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
          <div>
            <h2
              id="big-picture-heading"
              className="font-serif text-h2 text-ink text-balance md:text-h2-md lg:text-h2-lg"
            >
              See the Big Picture
            </h2>
            <p className="mt-7 max-w-[32rem] text-body text-ink-muted">
              <span translate="no">Acres</span> turns your data into clear,
              vibrant visuals that show you exactly what&apos;s happening in each
              region.
            </p>
            <div className="mt-14 flex flex-col gap-6">
              {bigPictureRows.map((row) => (
                <div
                  key={row.marker}
                  className="grid grid-cols-[2.5rem_1fr] gap-5 border-t border-rule pt-5"
                >
                  <span className="font-mono text-label text-brand lg:text-label-lg">
                    {row.marker}
                  </span>
                  <p className="text-body text-ink">{row.text}</p>
                </div>
              ))}
            </div>
            <Button
              render={<Link href="#specifications" />}
              nativeButton={false}
              variant="secondary"
              className="mt-12"
            >
              Discover More
            </Button>
          </div>
          <Image
            src="/assets/ui/landing/cylinders.webp"
            alt="Neutral stone cylinders arranged as a quiet geometric landscape."
            width={3750}
            height={3000}
            sizes="(max-width: 1023px) 100vw, 48vw"
            className="aspect-[1.08/1] w-full rounded-media object-cover"
          />
        </div>
      </Section>

      <Section
        id="specifications"
        align="center"
        aria-labelledby="specs-heading"
      >
        <Rule weight="strong" className="mb-section scroll-mt-section" />
        <Eyebrow>Specs</Eyebrow>
        <h2
          id="specs-heading"
          className="mt-5 font-serif text-h2 text-ink text-balance md:text-h2-md lg:text-h2-lg"
        >
          Why Choose <span translate="no">Acres</span>?
        </h2>
        <p className="mx-auto mt-7 max-w-[46rem] text-body text-ink-muted">
          You need a solution that keeps up. That&apos;s why we developed{" "}
          <span translate="no">Acres</span>. A developer-friendly approach to
          streamline your business.
        </p>
        <Button
          render={<Link href="#contact" />}
          nativeButton={false}
          variant="secondary"
          className="mt-12"
        >
          Discover More
        </Button>
        <ComparisonTable />
      </Section>

      <Section aria-labelledby="testimonial-heading">
        <div className="grid gap-14 lg:grid-cols-[0.88fr_1.12fr] lg:items-center">
          <Image
            src="/assets/ui/landing/stones.webp"
            alt="Balancing stones beside water with a pale sky."
            width={4096}
            height={2048}
            sizes="(max-width: 1023px) 100vw, 44vw"
            className="aspect-[1.22/1] w-full rounded-media object-cover lg:aspect-[0.95/1]"
          />
          <figure>
            <h2 id="testimonial-heading" className="sr-only">
              Customer Testimonial
            </h2>
            <blockquote className="font-serif text-quote text-ink text-balance">
              “I was skeptical, but <span translate="no">Acres</span> has
              completely transformed the way I manage my business. The data
              visualizations are so clear and intuitive, and the platform is so
              easy to use. I can&apos;t imagine running my company without it.”
            </blockquote>
            <figcaption className="mt-10">
              <p className="text-ui text-ink">John Smith</p>
              <p className="mt-2 font-mono text-label text-brand lg:text-label-lg">
                Head of Data
              </p>
            </figcaption>
          </figure>
        </div>
      </Section>

      <Section id="how-to" aria-labelledby="how-to-heading">
        <div className="scroll-mt-section">
          <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
            <h2
              id="how-to-heading"
              className="font-serif text-h2 text-ink text-balance md:text-h2-md lg:text-h2-lg"
            >
              Map Your Success
            </h2>
            <Button
              render={<Link href="#contact" />}
              nativeButton={false}
              variant="secondary"
              className="w-fit"
            >
              Discover More
            </Button>
          </div>

          <div
            className={cn(
              "mt-16 overflow-x-auto overscroll-x-contain pb-4",
              focusClass
            )}
            tabIndex={0}
            aria-label="Three-step Acres setup sequence"
          >
            <ol className="grid min-w-[45rem] grid-cols-3 gap-5 md:min-w-0">
              {steps.map((step) => (
                <li key={step.marker} className="border-t border-rule pt-7">
                  <span className="font-serif text-stat text-ink-faint">
                    {step.marker}
                  </span>
                  <h3 className="mt-7 font-serif text-h3 text-ink">
                    {step.title}
                  </h3>
                  <p className="mt-5 max-w-[18rem] text-body text-ink-muted">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <Image
          src="/assets/ui/landing/aerial.webp"
          alt="Green aerial landscape with a pale path crossing open terrain."
          width={4096}
          height={2731}
          sizes="100vw"
          className="mt-16 aspect-[1.72/1] w-full rounded-media object-cover md:mt-20"
        />
      </Section>

      <Section id="contact" align="center" aria-labelledby="contact-heading">
        <div className="mx-auto max-w-[44rem] scroll-mt-section">
          <h2
            id="contact-heading"
            className="font-serif text-h2 text-ink text-balance md:text-h2-md lg:text-h2-lg"
          >
            Connect with us
          </h2>
          <p className="mx-auto mt-7 max-w-[34rem] text-body text-ink-muted">
            Schedule a quick call to learn how{" "}
            <span translate="no">Acres</span> can turn your regional data into a
            powerful advantage.
          </p>
          <Button
            render={<Link href="#how-to" />}
            nativeButton={false}
            variant="primary"
            className="mt-12"
          >
            Learn More
          </Button>
        </div>
      </Section>
    </>
  )
}

function MediaBand({
  src,
  alt,
  width,
  height,
}: {
  src: string
  alt: string
  width: number
  height: number
}) {
  return (
    <Section aria-label={alt}>
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes="100vw"
        className="aspect-[1.9/1] w-full rounded-media object-cover md:aspect-[2.22/1]"
      />
    </Section>
  )
}

function ComparisonTable() {
  return (
    <div
      className={cn(
        "mt-20 overflow-x-auto overscroll-x-contain pb-4 text-left",
        focusClass
      )}
      tabIndex={0}
      aria-label="Comparison of Acres, WebSurge, and HyperView"
    >
      <table className="w-full min-w-[45rem] border-separate border-spacing-0 font-mono text-label text-ink lg:text-label-lg">
        <caption className="sr-only">
          Product comparison across browsing, AI, integration, and UTF-8 support.
        </caption>
        <thead>
          <tr>
            {["Acres", "WebSurge", "HyperView"].map((column, index) => (
              <th
                key={column}
                scope="col"
                className={cn(
                  "border-y border-rule bg-canvas px-7 py-10 text-center font-sans text-title text-ink",
                  index === 0 && "rounded-t-card border-x shadow-card",
                  index > 0 && "border-r"
                )}
              >
                <span translate="no">{column}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {comparisonRows.map((row, rowIndex) => (
            <tr key={row.join("-")}>
              {row.map((cell, columnIndex) => {
                const status = comparisonStatus[rowIndex][columnIndex]
                return (
                  <td
                    key={`${cell}-${columnIndex}`}
                    className={cn(
                      "border-b border-rule bg-canvas px-7 py-8 align-middle",
                      columnIndex === 0 && "border-x shadow-card",
                      columnIndex > 0 && "border-r",
                      rowIndex === comparisonRows.length - 1 &&
                        columnIndex === 0 &&
                        "rounded-b-card"
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-4">
                      <Icon
                        name={status}
                        className={cn(
                          "size-4",
                          status === "check" ? "text-brand" : "text-ink-muted"
                        )}
                      />
                      <span className="min-w-0 text-pretty">{cell}</span>
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
