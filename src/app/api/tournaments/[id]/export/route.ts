import { exportTournamentXlsx } from "@/lib/excel-export";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const buffer = await exportTournamentXlsx(id);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="minicup-${id}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось создать Excel" }, { status: 409 });
  }
}
