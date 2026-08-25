import { redirect } from "next/navigation";
import { CreateTournamentForm } from "@/components/create-tournament-form";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const tournament = await prisma.tournament.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (tournament) redirect(`/tournaments/${tournament.id}`);

  return (
    <main className="page">
      <p className="eyebrow">РФМ · миникап</p>
      <h1>Новый турнир</h1>
      <p className="lead">Введите название и ровно 10 уникальных ников. Будут созданы 5 туров.</p>
      <CreateTournamentForm />
    </main>
  );
}
