import Link from "next/link";
import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AuthFrameProps = {
  eyebrow: string;
  title: string;
  description: string;
  footer: {
    label: string;
    href: string;
    action: string;
  };
  children: ReactNode;
};

export function AuthFrame({
  eyebrow,
  title,
  description,
  footer,
  children,
}: AuthFrameProps) {
  return (
    <div className="mx-auto grid w-full max-w-page flex-1 px-4 py-8 md:min-h-svh md:grid-cols-[minmax(0,0.85fr)_minmax(24rem,1fr)] md:px-10 md:py-10">
      <section
        aria-labelledby="auth-context-title"
        className="hidden border-r border-rule pr-10 md:flex md:flex-col md:justify-between"
      >
        <div>
          <Link
            href="/"
            className="text-wordmark font-sans text-ink outline-none focus-visible:rounded-control focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            translate="no"
          >
            Acres
          </Link>
          <div className="mt-16 border-t border-rule pt-6">
            <p className="font-mono text-label uppercase text-brand lg:text-label-lg">
              Regional Workspace
            </p>
            <h2
              id="auth-context-title"
              className="mt-4 max-w-sm font-serif text-title text-ink"
            >
              Access the organization shell for Acres accounts.
            </h2>
          </div>
        </div>
      </section>
      <section
        aria-labelledby="auth-title"
        className="flex w-full items-center justify-center md:pl-10"
      >
        <div className="w-full max-w-md">
          <div className="mb-8">
            <Link
              href="/"
              className="mb-10 inline-block text-wordmark font-sans text-ink outline-none focus-visible:rounded-control focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring md:hidden"
              translate="no"
            >
              Acres
            </Link>
            <p className="font-mono text-label uppercase text-brand lg:text-label-lg">
              {eyebrow}
            </p>
            <h1
              id="auth-title"
              className="mt-3 font-serif text-title text-ink"
            >
              {title}
            </h1>
            <p className="mt-3 text-body text-ink-muted">{description}</p>
          </div>
          {children}
          <p className="mt-6 text-body text-ink-muted">
            {footer.label}{" "}
            <Link
              href={footer.href}
              className={cn(
                buttonVariants({ variant: "link" }),
                "h-auto px-0 text-body text-brand",
              )}
            >
              {footer.action}
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
