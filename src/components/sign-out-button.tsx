"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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
