// Layout pieces shared by the admin forms. No hooks here: client forms import them as-is.

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="label border-b border-line pb-3">{title}</h2>
      <div className="mt-6 grid gap-x-8 gap-y-7 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function Field({ label, name, error, hint, wide, children }: { label: string; name: string; error?: string; hint?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <label htmlFor={name} className="label text-muted">{label}</label>
      <div className="mt-1">{children}</div>
      {error ? (
        <p id={`${name}-error`} className="mt-2 text-danger">{error}</p>
      ) : (
        hint && <p className="mt-2 text-muted">{hint}</p>
      )}
    </div>
  );
}

export function Check({ name, label, defaultChecked, onChange }: { name: string; label: string; defaultChecked: boolean; onChange?: (on: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 self-center sm:col-span-2">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} onChange={(e) => onChange?.(e.currentTarget.checked)} className="mt-1 size-4 accent-current" />
      <span>{label}</span>
    </label>
  );
}

/** The pending spinner inside a submit button. */
export const Spinner = () => <span aria-hidden className="size-3.5 animate-spin rounded-full border border-current border-t-transparent" />;
