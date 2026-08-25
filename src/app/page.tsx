import Link from "next/link";
import { requirePageUser } from "@/lib/auth/session";
import { getTournamentDashboard } from "@/lib/platform-service";
import { CreateTournamentForm } from "@/components/create-tournament-form";
import { archiveTournamentAction } from "./platform-actions";
import { PendingSubmit } from "@/components/pending-submit";

export const dynamic = "force-dynamic";

function nextAction(tournament: Awaited<ReturnType<typeof getTournamentDashboard>>[number]) {
  if (tournament.archivedAt) return "Открыть архив";
  if (tournament.status === "FINISHED") return "Посмотреть итог";
  const next = tournament.rounds.find((round) => round.status !== "COMPLETED");
  if (!next) return "Финализировать";
  return next.status === "PENDING" ? `Начать тур ${next.number}` : next.status === "SEATING_READY" ? "Подтвердить рассадку" : next.status === "SCORING" ? "Выставить баллы" : "Продолжить игру";
}

function Section({ title, tournaments, canArchive }: { title: string; tournaments: Awaited<ReturnType<typeof getTournamentDashboard>>; canArchive: boolean }) {
  if (!tournaments.length) return null;
  return <section className="dashboard-section"><h2>{title}</h2><div className="tournament-grid">{tournaments.map((tournament) => {
    const completed = tournament.rounds.filter((round) => round.status === "COMPLETED").length;
    return <article className="card tournament-card" key={tournament.id}><div><span className="status">{tournament.status}</span><h3>{tournament.name}</h3><p>{completed}/5 игр завершено</p><small>{tournament.createdAt.toLocaleDateString("ru-RU")} · {tournament.judges.length ? tournament.judges.map(({ user }) => user.displayName).join(", ") : "Судьи не назначены"}</small></div><Link className="button" href={`/tournaments/${tournament.id}`}>{nextAction(tournament)}</Link>{canArchive ? <form action={archiveTournamentAction} className="archive-form"><input type="hidden" name="tournamentId" value={tournament.id} /><input type="hidden" name="archived" value={tournament.archivedAt ? "false" : "true"} /><input name="reason" maxLength={500} placeholder="Причина" required /><PendingSubmit className="button secondary">{tournament.archivedAt ? "Вернуть из архива" : "В архив"}</PendingSubmit></form> : null}</article>;
  })}</div></section>;
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requirePageUser();
  const tournaments = await getTournamentDashboard(user);
  const { error } = await searchParams;
  const archived = tournaments.filter((item) => item.archivedAt);
  const visible = tournaments.filter((item) => !item.archivedAt);
  const canManage = user.role !== "JUDGE";
  return <main className="page dashboard-page"><p className="eyebrow">Организационная платформа</p><h1>Миникапы</h1>{error ? <p className="error card">{error}</p> : null}{canManage ? <details className="card new-tournament"><summary>Новый миникап</summary><CreateTournamentForm /></details> : null}{!tournaments.length ? <p className="card">Пока нет доступных турниров.</p> : null}<Section title="Активные" tournaments={visible.filter((item) => item.status === "ACTIVE")} canArchive={canManage} /><Section title="Черновики" tournaments={visible.filter((item) => item.status === "DRAFT")} canArchive={canManage} /><Section title="Завершённые" tournaments={visible.filter((item) => item.status === "FINISHED")} canArchive={canManage} /><Section title="Архив" tournaments={archived} canArchive={canManage} /></main>;
}
