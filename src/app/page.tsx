import Link from "next/link";
import { requirePageUser } from "@/lib/auth/session";
import { getTournamentDashboard } from "@/lib/platform-service";
import { CreateTournamentForm } from "@/components/create-tournament-form";
import { archiveTournamentAction } from "./platform-actions";
import { PendingSubmit } from "@/components/pending-submit";

export const dynamic = "force-dynamic";

const tournamentStatusLabels = { DRAFT: "Черновик", ACTIVE: "Активен", FINISHED: "Завершён" } as const;

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
    return <article className="card tournament-card" key={tournament.id}><div className="tournament-card-head"><span className={`status ${tournament.status.toLowerCase()}`}>{tournamentStatusLabels[tournament.status]}</span><span className="tournament-date">{tournament.createdAt.toLocaleDateString("ru-RU")}</span></div><div><h3>{tournament.name}</h3><p>{completed === 5 ? "Все игры завершены" : `Следующий этап: ${nextAction(tournament).toLowerCase()}`}</p><small>{tournament.judges.length ? `Судьи: ${tournament.judges.map(({ user }) => user.displayName).join(", ")}` : "Судьи ещё не назначены"}</small></div><div className="progress-block" aria-label={`${completed} из 5 игр завершено`}><div className="progress-label"><span>Прогресс миникапа</span><b>{completed}/5</b></div><div className="progress-track"><span style={{ width: `${completed * 20}%` }} /></div></div><Link className="button" href={`/tournaments/${tournament.id}`}>{nextAction(tournament)}</Link>{canArchive ? <details className="archive-tools"><summary>Управление турниром</summary><form action={archiveTournamentAction} className="archive-form"><input type="hidden" name="tournamentId" value={tournament.id} /><input type="hidden" name="archived" value={tournament.archivedAt ? "false" : "true"} /><input name="reason" maxLength={500} placeholder="Укажите причину" aria-label="Причина архивирования" required /><PendingSubmit className="button secondary">{tournament.archivedAt ? "Вернуть из архива" : "Переместить в архив"}</PendingSubmit></form></details> : null}</article>;
  })}</div></section>;
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requirePageUser();
  const tournaments = await getTournamentDashboard(user);
  const { error } = await searchParams;
  const archived = tournaments.filter((item) => item.archivedAt);
  const visible = tournaments.filter((item) => !item.archivedAt);
  const canManage = user.role !== "JUDGE";
  const activeCount = visible.filter((item) => item.status === "ACTIVE").length;
  const finishedCount = visible.filter((item) => item.status === "FINISHED").length;
  return <main className="page dashboard-page"><section className="page-hero"><div><p className="eyebrow">Судейская платформа РФМ</p><h1>Миникапы</h1><p className="lead">Все турниры и ближайшие действия судьи — на одном экране.</p></div><div className="dashboard-stats"><div><b>{activeCount}</b><span>активных</span></div><div><b>{finishedCount}</b><span>завершено</span></div></div></section>{error ? <p className="error card">{error}</p> : null}{canManage ? <details className="card new-tournament"><summary><span>Создать новый миникап</span><small>10 игроков · 5 туров</small></summary><CreateTournamentForm /></details> : null}{!tournaments.length ? <section className="card empty-state"><span aria-hidden="true">♠</span><h2>Турниров пока нет</h2><p>Создайте первый миникап и добавьте десять игроков.</p></section> : null}<Section title="Активные" tournaments={visible.filter((item) => item.status === "ACTIVE")} canArchive={canManage} /><Section title="Черновики" tournaments={visible.filter((item) => item.status === "DRAFT")} canArchive={canManage} /><Section title="Завершённые" tournaments={visible.filter((item) => item.status === "FINISHED")} canArchive={canManage} /><Section title="Архив" tournaments={archived} canArchive={canManage} /></main>;
}
