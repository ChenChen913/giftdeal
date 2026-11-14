import { prisma } from "@/server/db";
import { handle } from "@/server/http/route";

export async function GET(req: Request) {
  return handle(req, async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok", db: "up", time: new Date().toISOString() };
  });
}
