import { notFound } from "next/navigation";
import Link from "next/link";
import { confirmSeatingAction, regenerateSeatingAction } from "@/app/actions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const roundStatusLabels = {
  PENDING: "Ожидает рассадки",
  SEATING_READY: "Рассадка готова",
  IN_PROGRESS: "Идёт игра",
  SCORING: "Выставление баллов",
  COMPLETED: "Завершён",
} as const;

export default async function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      players: { include: { player: true }, orderBy: { registrationOrder: "asc" } },
      rounds: {
        orderBy: { number: "asc" },
        include: { game: { include: { seats: { include: { player: true }, orderBy: { seatNumber: "asc" } } } } },
      },
    },
  });
  if (!tournament) notFound();

  const availableRound = tournament.rounds.find((round) => round.game?.seatingStatus !== "CONFIRMED");

  return (
    <main className="page">
      <p className="eyebrow">Миникап · 5 туров</p>
      <h1>{tournament.name}</h1>
      <p className="lead">Все данные сохраняются на сервере сразу после действия.</p>

      <section className="card">
        <h2>Игроки · {tournament.players.length}/10</h2>
        <ol className="player-list">
          {tournament.players.map(({ player }, index) => <li key={player.id}>{index + 1}. {player.nickname}</li>)}
        </ol>
      </section>

      <section className="card">
        <h2>Туры · {tournament.rounds.length}/5</h2>
        <ol className="round-list">
          {tournament.rounds.map((round) => {
            const game = round.game;
            const isAvailable = availableRound?.id === round.id;
            const confirmed = game?.seatingStatus === "CONFIRMED";
            const generated = game?.seatingStatus === "GENERATED";
            return (
              <li className="round-card" key={round.id}>
                <div className="round-head">
                  <strong>Тур {round.number}</strong>
                  <span className={`status ${confirmed ? "confirmed" : generated ? "ready" : ""}`}>
                    {confirmed ? "Рассадка подтверждена" : roundStatusLabels[round.status]}
                  </span>
                </div>

                {game && game.seats.length > 0 ? (
                  <ol className="seat-list">
                    {game.seats.map((seat) => (
                      <li key={seat.id}><span className="seat-number">{seat.seatNumber}</span><span>{seat.player.nickname}</span></li>
                    ))}
                  </ol>
                ) : isAvailable ? <p className="muted">Следующее действие: сгенерировать рассадку.</p> : null}

                {isAvailable && game ? (
                  <div className={generated ? "actions" : ""}>
                    <form action={regenerateSeatingAction}>
                      <input type="hidden" name="roundId" value={round.id} />
                      <input type="hidden" name="tournamentId" value={tournament.id} />
                      <button className={`button ${generated ? "secondary" : ""}`} type="submit">
                        {generated ? "Перерандомить" : "Сгенерировать рассадку"}
                      </button>
                    </form>
                    {generated ? (
                      <form action={confirmSeatingAction}>
                        <input type="hidden" name="roundId" value={round.id} />
                        <input type="hidden" name="tournamentId" value={tournament.id} />
                        <button className="button" type="submit">Подтвердить рассадку</button>
                      </form>
                    ) : null}
                  </div>
                ) : null}
                {confirmed && game ? <Link className="button" href={`/games/${game.id}`}>Открыть игру</Link> : null}
              </li>
            );
          })}
        </ol>
      </section>
    </main>
  );
}
