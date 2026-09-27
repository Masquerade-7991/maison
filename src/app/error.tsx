"use client";

import Link from "next/link";
import { useEffect } from "react";

// App-level boundary: a failed query (e.g. the database is unreachable) replaces the page body
// only, so the header, footer and root layout stay server-rendered.
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="container-page py-section text-center">
      <p className="label text-muted">Something went wrong</p>
      <h1 className="mt-4 text-display-sm">This page could not be loaded.</h1>
      <p className="mx-auto mt-4 max-w-md text-muted">
        Please try again in a moment. If it keeps happening, our client advisors can help.
      </p>
      <div className="mt-10 flex flex-col items-center justify-center gap-5 sm:flex-row">
        <button type="button" onClick={() => retry()} className="btn btn-primary">
          Try again
        </button>
        <Link href="/" className="label link">
          Back to home
        </Link>
      </div>
    </section>
  );
}
