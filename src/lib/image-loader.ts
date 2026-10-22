// next/image loader: Unsplash (imgix) resizes and converts on its own CDN, so images skip Vercel's
// optimizer. next.config.ts allows only images.unsplash.com; anything else is returned unchanged.
export default function unsplashLoader({ src, width, quality }: { src: string; width: number; quality?: number }) {
  if (!src.startsWith("https://images.unsplash.com/")) return src;
  const url = new URL(src);
  url.searchParams.set("w", String(width)); // keeps ar/fit crop params from the stored URL
  url.searchParams.set("q", String(quality ?? 75));
  url.searchParams.set("auto", "format"); // AVIF/WebP where the browser accepts it
  return url.toString();
}
