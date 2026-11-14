import { sql } from "drizzle-orm";

import { db } from "@/server/db-drizzle";
import { handle } from "@/server/http/route";

export async function GET(req: Request) {
  return handle(req, async () => {
    await db.execute(sql`SELECT 1`);
    return { status: "ok", db: "up", time: new Date().toISOString() };
  });
}
