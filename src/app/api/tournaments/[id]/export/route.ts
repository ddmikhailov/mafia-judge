import { exportTournamentXlsx } from "@/lib/excel-export";
import { requireUser } from "@/lib/auth/session";
import { requireTournamentAccess } from "@/lib/authorization";
import { consumeRateLimit } from "@/lib/rate-limit";
import { publicError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const user = await requireUser();
    await requireTournamentAccess(user, id);
    consumeRateLimit(`excel:${user.id}`, 10, 10 * 60 * 1000);
    const buffer = await exportTournamentXlsx(id);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="minicup-${id}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const safe = publicError(error, "Не удалось создать Excel.");
    return Response.json({ error: safe.message }, { status: safe.status, headers: { "Cache-Control": "no-store" } });
  }
}
