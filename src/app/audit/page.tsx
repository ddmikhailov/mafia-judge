import Link from "next/link";
import { requirePageUser } from "@/lib/auth/session";
import { getAuditPage } from "@/lib/audit-service";

export const dynamic = "force-dynamic";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requirePageUser(); const { page: value } = await searchParams; const page = Math.max(0, Number(value) || 0); const audit = await getAuditPage(user, page);
  return <main className="page"><p className="eyebrow">Контроль изменений</p><h1>Аудит</h1><section className="card"><h2>Игровые события</h2><ol className="audit-list">{audit.gameEvents.map((event) => <li key={event.id}><b>{event.type}</b><time>{event.createdAt.toLocaleString("ru-RU")}</time><span>{event.actor?.displayName ?? "Историческая запись"}</span><Link href={`/games/${event.gameId}`}>{event.game.round.tournament.name}, тур {event.game.round.number}</Link>{event.overrideReason ? <small>{event.overrideReason}</small> : null}<details><summary>Технические данные</summary><pre>{JSON.stringify(event.payload, null, 2)}</pre></details></li>)}</ol></section><section className="card"><h2>События турниров</h2><ol className="audit-list">{audit.tournamentEvents.map((event) => <li key={event.id}><b>{event.type}</b><time>{event.createdAt.toLocaleString("ru-RU")}</time><span>{event.actor?.displayName ?? "Историческая запись"}</span><Link href={`/tournaments/${event.tournamentId}`}>{event.tournament.name}</Link>{event.overrideReason ? <small>{event.overrideReason}</small> : null}<details><summary>Технические данные</summary><pre>{JSON.stringify(event.payload, null, 2)}</pre></details></li>)}</ol></section><div className="actions">{page > 0 ? <Link className="button secondary" href={`/audit?page=${page - 1}`}>Назад</Link> : <span />}{audit.hasNext ? <Link className="button" href={`/audit?page=${page + 1}`}>Далее</Link> : null}</div></main>;
}
