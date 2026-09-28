"use server";

// Server Actions are public endpoints: the role is checked first, then every field is validated here.
import { revalidatePath } from "next/cache";
import { updateFulfilment } from "@/lib/admin-orders";
import { isUuid } from "@/lib/admin-rules";
import { fulfilmentStatusCopy, orderStatusCopy, type FulfilmentAction } from "@/lib/order-rules";
import { assertAdmin } from "@/lib/session";

export type FulfilmentFormState = {
  error?: string;
  errors?: { carrier?: string; trackingNumber?: string };
  saved?: boolean;
} | null;

const ACTIONS: readonly FulfilmentAction[] = ["ship", "deliver", "cancel"];

export async function fulfilmentAction(_prev: FulfilmentFormState, fd: FormData): Promise<FulfilmentFormState> {
  await assertAdmin();
  const text = (k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string).trim() : "");
  const id = text("id");
  const action = text("action") as FulfilmentAction;
  if (!isUuid(id) || !ACTIONS.includes(action)) return { error: "This form is out of date. Reload the page and try again." };

  let tracking;
  if (action === "ship") {
    const carrier = text("carrier");
    const trackingNumber = text("trackingNumber");
    const errors: NonNullable<FulfilmentFormState>["errors"] = {};
    if (!carrier) errors.carrier = "Enter the carrier.";
    else if (carrier.length > 60) errors.carrier = "Use 60 characters or fewer.";
    if (!trackingNumber) errors.trackingNumber = "Enter the tracking number.";
    else if (trackingNumber.length > 100) errors.trackingNumber = "Use 100 characters or fewer.";
    if (errors.carrier || errors.trackingNumber) return { errors };
    tracking = { carrier, trackingNumber };
  }

  const result = await updateFulfilment(id, action, tracking);
  revalidatePath("/admin/orders", "layout");
  if (!result.ok) {
    const c = result.current;
    return {
      error: !c
        ? "This order no longer exists."
        : c.status !== "paid"
          ? `Nothing changed: the payment is "${orderStatusCopy[c.status]}", and only paid orders can be fulfilled.`
          : `Nothing changed: this order is already "${fulfilmentStatusCopy[c.fulfilmentStatus]}".`,
    };
  }
  return { saved: true };
}
