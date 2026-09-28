// Shown while the page asks Stripe for the session on the way back from payment. Same split as the page.
export default function Loading() {
  return (
    <section className="container-page py-6 md:py-10" aria-busy>
      <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-14">
        <div className="lg:col-span-7">
          <div className="scheme-invert flex flex-col px-6 py-10 sm:px-10 sm:py-14 lg:px-14 lg:py-16">
            <div className="flex items-center gap-4">
              <span aria-hidden className="size-5 animate-spin rounded-full border border-current border-t-transparent" />
              <p className="label text-muted">Order confirmation</p>
            </div>
            <h1 className="mt-10 text-display font-medium tracking-tight sm:mt-14">Retrieving your order</h1>
          </div>
        </div>
        <div aria-hidden className="lg:col-span-5 lg:pt-4">
          <div className="h-8 border-b border-line" />
          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10">
            {[0, 1].map((i) => <div key={i} className="media-product animate-pulse" />)}
          </div>
          <div className="mt-10 h-40 animate-pulse bg-surface" />
        </div>
      </div>
    </section>
  );
}
