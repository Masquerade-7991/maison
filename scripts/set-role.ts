// Grants or removes admin: npm run auth:set-role -- <email> <customer|admin>
// The only way to create the first admin; afterwards admins can also change roles on /admin.
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { user } from "../src/db/schema";

const roles = ["customer", "admin"];
const [email, role] = process.argv.slice(2);

async function main() {
  if (!email || !roles.includes(role)) throw new Error("Usage: npm run auth:set-role -- <email> <customer|admin>");
  const updated = await db
    .update(user)
    .set({ role })
    .where(eq(user.email, email.toLowerCase()))
    .returning({ email: user.email, role: user.role });
  if (updated.length === 0) throw new Error(`No account with email ${email}.`);
  console.log(`${updated[0].email} is now ${updated[0].role}.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
