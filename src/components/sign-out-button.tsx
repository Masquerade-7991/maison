"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { logout, track } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import { announceBagChange } from "@/lib/cart-rules";

export function SignOutButton({ className = "btn btn-secondary" }: { className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      className={className}
      onClick={async () => {
        setPending(true);
        track("Signed Out", {});
        await logout(); // while the customer is still identified, so the event is theirs
        await authClient.signOut(); // deletes the session row and clears the cookie
        announceBagChange(); // the header's count goes back to plain "Bag"
        router.replace("/");
        router.refresh();
      }}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
