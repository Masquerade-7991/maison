// Shown while the page asks Stripe for the session on the way back from payment.
export default function Loading() {
  return (
    <section className="container-page py-12 md:py-20" aria-busy>
      <div className="mx-auto max-w-2xl text-center">
        <p className="label text-muted">Order confirmation</p>
        <h1 className="mt-4 text-display-sm">Retrieving your order</h1>
        <span aria-hidden className="mx-auto mt-6 block size-4 animate-spin rounded-full border border-current border-t-transparent" />
      </div>
      <div aria-hidden className="mx-auto mt-12 grid max-w-4xl gap-10 md:mt-16 md:grid-cols-12">
        <div className="space-y-4 md:col-span-7">
          {[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse bg-surface" />)}
        </div>
        <div className="h-48 animate-pulse bg-surface md:col-span-5" />
      </div>
    </section>
  );
}
