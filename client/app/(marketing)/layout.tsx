import { SiteFooter } from "@/components/acres/site-footer";
import { SiteHeader } from "@/components/acres/site-header";

export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteHeader />
      {/*
        `tabIndex={-1}` is what makes the skip link's target focusable; without
        it focus stays on <body> and the next Tab returns to the top of the page.
        The `outline-none` is paired with a focus-visible replacement.
      */}
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 flex flex-col outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
