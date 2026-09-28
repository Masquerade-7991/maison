import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";

// Role check before the redirect, so a customer gets a 404 here rather than learning where admin lives.
export default async function AdminIndex() {
  await requireAdmin("/admin");
  redirect("/admin/products");
}
