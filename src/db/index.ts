import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env and add the pooled Neon connection string.");
}

// Stateless HTTP driver: no interactive transactions, use db.batch() for atomic multi-statement writes.
export const db = drizzle(neon(process.env.DATABASE_URL), { schema, casing: "snake_case" });
