// Server-side session access. Call these in every protected page and Server Action, never only in a
// layout: layouts don't re-render on client navigation, so a check there doesn't guard the pages below it.
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";

// One lookup per request however many components ask. No cookie cache, so sign-out and role changes
// apply on the very next request.
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

// Only same-site paths: "/account" yes; "//evil.com", "/\evil.com" and "https://…" fall back.
export const safeNext = (next: unknown) =>
  typeof next === "string" && /^\/(?![/\\])/.test(next) ? next : "/account";

/** Pages: signed-out visitors go to sign-in and come back to `next` afterwards. */
export async function requireUser(next: string) {
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return session;
}

/** Admin pages: signed out → sign-in; signed in without the role → 404, so the route isn't advertised. */
export async function requireAdmin(next = "/admin") {
  const session = await requireUser(next);
  if (session.user.role !== "admin") notFound();
  return session;
}

/** Admin Server Actions and data functions: they can be called directly, so they throw instead of redirecting. */
export async function assertAdmin() {
  const session = await getSession();
  if (session?.user.role !== "admin") throw new Error("Not authorised.");
  return session;
}
