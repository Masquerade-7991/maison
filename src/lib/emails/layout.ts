// The one email frame every Maison email is built from, so they all share the site's design language:
// the tracked MAISON wordmark, small uppercase labels, a large light headline, grey body copy, square black
// buttons, hairline rules, white paper and black ink (the light tokens in src/app/globals.css). Mail apps
// can't load Geist or our stylesheet, so everything is inline styles on tables, in the site's fallback
// font stack. The plain-text part is written from the same blocks. Pure: no imports, so checks run it.

const C = { paper: "#ffffff", ink: "#000000", surface: "#f5f5f5", muted: "#6e6e6e", line: "#e3e3e3", danger: "#a4161a" };
// Single quotes: this goes inside style="…" attributes.
const FONT = `'Helvetica Neue', Helvetica, Arial, sans-serif`;
const LABEL = `font-size:11px;line-height:1.2;letter-spacing:0.1em;text-transform:uppercase;font-weight:500`;

export type EmailItem = { name: string; meta?: string; price?: string; image?: string | null; imageAlt?: string };

export type Block =
  | { t: "label"; text: string }
  | { t: "title"; text: string }
  | { t: "p"; text: string; muted?: boolean }
  | { t: "button"; text: string; href: string }
  | { t: "link"; text: string; href: string }
  | { t: "items"; items: EmailItem[] }
  | { t: "rows"; rows: [string, string][]; total?: [string, string] }
  | { t: "box"; heading: string; lines: string[] }
  | { t: "note"; text: string; tone?: "danger" }
  | { t: "rule" };

export type Email = { subject: string; html: string; text: string };

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** An Unsplash photo sized for email: a plain JPEG (mail apps and their proxies don't all take WebP/AVIF). */
export function emailImage(url: string | null | undefined, width: number) {
  if (!url?.startsWith("https://images.unsplash.com/")) return url ?? null;
  const u = new URL(url);
  u.searchParams.set("w", String(width * 2)); // sharp on high-density screens
  u.searchParams.set("q", "75");
  u.searchParams.set("fm", "jpg");
  u.searchParams.delete("auto");
  return u.toString();
}

const td = (style: string, inner: string) => `<td style="${style}">${inner}</td>`;
const row = (inner: string, pad = "0") => `<tr>${td(`padding:${pad}`, inner)}</tr>`;

function blockHtml(b: Block): string {
  switch (b.t) {
    case "label":
      return row(`<p style="margin:0;${LABEL};color:${C.muted}">${esc(b.text)}</p>`, "0 0 14px");
    case "title":
      return row(`<h1 style="margin:0;font-size:30px;line-height:1.1;letter-spacing:-0.02em;font-weight:400;color:${C.ink}">${esc(b.text)}</h1>`, "0 0 20px");
    case "p":
      return row(`<p style="margin:0;font-size:14px;line-height:1.6;color:${b.muted ? C.muted : C.ink}">${esc(b.text)}</p>`, "0 0 16px");
    case "button":
      return row(
        `<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="background:${C.ink}">` +
          `<a href="${esc(b.href)}" style="display:inline-block;padding:16px 32px;${LABEL};color:${C.paper};text-decoration:none">${esc(b.text)}</a>` +
          `</td></tr></table>`,
        "12px 0 24px",
      );
    case "link":
      return row(`<a href="${esc(b.href)}" style="${LABEL};color:${C.ink};text-decoration:underline;text-underline-offset:4px">${esc(b.text)}</a>`, "0 0 20px");
    case "items":
      return row(
        `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid ${C.line}">` +
          b.items
            .map(
              (i) =>
                `<tr>` +
                td(
                  `width:72px;padding:16px 16px 16px 0;border-bottom:1px solid ${C.line};vertical-align:top`,
                  i.image
                    ? `<img src="${esc(i.image)}" alt="${esc(i.imageAlt ?? i.name)}" width="72" height="90" style="display:block;width:72px;height:90px;object-fit:cover;background:${C.surface};border:0">`
                    : `<div style="width:72px;height:90px;background:${C.surface}"></div>`,
                ) +
                td(
                  `padding:16px 0;border-bottom:1px solid ${C.line};vertical-align:top;font-size:14px;line-height:1.5;color:${C.ink}`,
                  `${esc(i.name)}${i.meta ? `<br><span style="color:${C.muted}">${esc(i.meta)}</span>` : ""}`,
                ) +
                td(`padding:16px 0 16px 16px;border-bottom:1px solid ${C.line};vertical-align:top;text-align:right;white-space:nowrap;font-size:14px;color:${C.ink}`, esc(i.price ?? "")) +
                `</tr>`,
            )
            .join("") +
          `</table>`,
        "0 0 8px",
      );
    case "rows":
      return row(
        `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">` +
          b.rows.map(([k, v]) => `<tr>${td(`padding:6px 0;font-size:14px;color:${C.ink}`, esc(k))}${td(`padding:6px 0;font-size:14px;text-align:right;color:${C.muted}`, esc(v))}</tr>`).join("") +
          (b.total
            ? `<tr>${td(`padding:14px 0 0;border-top:1px solid ${C.line};${LABEL};color:${C.ink}`, esc(b.total[0]))}${td(`padding:14px 0 0;border-top:1px solid ${C.line};font-size:22px;text-align:right;color:${C.ink}`, esc(b.total[1]))}</tr>`
            : "") +
          `</table>`,
        "8px 0 24px",
      );
    case "box":
      return row(
        `<div style="background:${C.surface};padding:20px 24px"><p style="margin:0 0 8px;${LABEL};color:${C.muted}">${esc(b.heading)}</p>` +
          b.lines.map((l) => `<p style="margin:0;font-size:14px;line-height:1.6;color:${C.ink}">${esc(l)}</p>`).join("") +
          `</div>`,
        "0 0 24px",
      );
    case "note":
      return row(
        `<p style="margin:0;padding-left:16px;border-left:2px solid ${b.tone === "danger" ? C.danger : C.line};font-size:14px;line-height:1.6;color:${b.tone === "danger" ? C.danger : C.muted}">${esc(b.text)}</p>`,
        "4px 0 20px",
      );
    case "rule":
      return row(`<div style="border-top:1px solid ${C.line};font-size:0;line-height:0">&nbsp;</div>`, "8px 0 24px");
  }
}

function blockText(b: Block): string {
  switch (b.t) {
    case "label":
      return b.text.toUpperCase();
    case "title":
      return b.text;
    case "p":
    case "note":
      return b.text;
    case "button":
    case "link":
      return `${b.text}: ${b.href}`;
    case "items":
      return b.items.map((i) => `- ${i.name}${i.meta ? ` (${i.meta})` : ""}${i.price ? `  ${i.price}` : ""}`).join("\n");
    case "rows":
      return [...b.rows, ...(b.total ? [b.total] : [])].map(([k, v]) => `${k}: ${v}`).join("\n");
    case "box":
      return [b.heading.toUpperCase(), ...b.lines].join("\n");
    case "rule":
      return "—";
  }
}

export type Frame = {
  subject: string;
  /** The grey preview line inbox lists show after the subject. */
  preheader: string;
  blocks: Block[];
  /** Absolute site origin, for the wordmark and footer links. */
  site: string;
  /** Why they got it, under the footer links ("You asked to hear when…"). */
  reason?: string;
};

/** Renders a frame to an email: the HTML part and the plain-text part. */
export function renderEmail({ subject, preheader, blocks, site, reason }: Frame): Email {
  const links: [string, string][] = [
    ["Women", "/women"],
    ["Men", "/men"],
    ["Stories", "/stories"],
    ["Contact us", "/contact"],
  ];
  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${esc(subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:${C.paper};color:${C.ink};font-family:${FONT};-webkit-font-smoothing:antialiased">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.paper}">${esc(preheader)}${"&#8199;&#847;".repeat(40)}</div>` +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${C.paper}"><tr><td align="center" style="padding:0 16px">` +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;font-family:${FONT}">` +
    `<tr><td align="center" style="padding:36px 0 28px;border-bottom:1px solid ${C.line}">` +
    `<a href="${esc(site)}" style="font-size:20px;letter-spacing:0.35em;text-transform:uppercase;color:${C.ink};text-decoration:none">Maison</a></td></tr>` +
    `<tr><td style="padding:40px 0 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${blocks.map(blockHtml).join("")}</table></td></tr>` +
    `<tr><td style="padding:28px 0 40px;border-top:1px solid ${C.line}">` +
    `<p style="margin:0 0 16px;${LABEL}">${links.map(([l, h]) => `<a href="${esc(site + h)}" style="color:${C.ink};text-decoration:none">${l}</a>`).join(`<span style="color:${C.line}">&nbsp;&nbsp;·&nbsp;&nbsp;</span>`)}</p>` +
    `<p style="margin:0;font-size:12px;line-height:1.6;color:${C.muted}">Considered design, made to last. Complimentary shipping and returns on every order.${reason ? `<br>${esc(reason)}` : ""}</p>` +
    `</td></tr></table></td></tr></table></body></html>`;

  const text = [
    "MAISON",
    "",
    blocks.map(blockText).join("\n\n"),
    "",
    "—",
    `Maison · ${site}`,
    ...(reason ? [reason] : []),
  ].join("\n");
  return { subject, html, text };
}
