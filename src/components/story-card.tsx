import Image from "next/image";
import Link from "next/link";
import { serif } from "@/lib/serif";
import { readingMinutes, type Story } from "@/lib/stories";

// One story in the journal grid: photo, topic and reading time, serif headline, standfirst.
export function StoryCard({ story: s, sizes }: { story: Story; sizes: string }) {
  return (
    <Link href={`/stories/${s.slug}`} className="group block">
      <div className="media-product">
        <Image src={s.image.src} alt={s.image.alt} fill sizes={sizes} className="transition-transform duration-700 group-hover:scale-[1.02]" />
      </div>
      <p className="label mt-5 text-muted">
        {s.topic} <span aria-hidden>·</span> {readingMinutes(s)} min read
      </p>
      <h3 className={`${serif.className} mt-3 text-display-sm font-light decoration-1 underline-offset-4 group-hover:underline`}>{s.title}</h3>
      <p className="mt-3 max-w-md text-muted">{s.dek}</p>
    </Link>
  );
}
