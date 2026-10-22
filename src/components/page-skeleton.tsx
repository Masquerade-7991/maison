// Shown instantly on navigation while a server-rendered page loads, so a click never looks ignored.
// Only for routes that never call notFound(): once a loading screen streams, a 404 would answer 200.
export function PageSkeleton() {
  return (
    <section className="container-page pt-12 md:pt-20" aria-busy aria-label="Loading">
      <div aria-hidden>
        <div className="h-10 w-48 animate-pulse bg-surface md:h-14 md:w-72" />
        <div className="mt-4 h-4 w-64 max-w-full animate-pulse bg-surface" />
        <ul className="grid-products mt-12">
          {Array.from({ length: 8 }, (_, i) => (
            <li key={i}>
              <div className="media-product animate-pulse" />
              <div className="mt-4 h-4 w-2/3 animate-pulse bg-surface" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
