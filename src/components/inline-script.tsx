"use client";

// Next's "Preventing flash before hydration" helper: the script runs from the server HTML while the page is
// parsed, and React's own render of it (on the client, e.g. after router.refresh) is inert text/plain, so
// React doesn't warn "Encountered a script tag". suppressHydrationWarning covers the type difference.
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
