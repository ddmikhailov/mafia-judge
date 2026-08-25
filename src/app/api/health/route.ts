import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json(
      { status: "ok", database: "ok" },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    console.error(`[${new Date().toISOString()}] health check: database unavailable`);
    return Response.json(
      { status: "error", database: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
