import { notFound } from "next/navigation";
import Link from "next/link";
import {
  compensationOverrideAction,
  confirmSeatingAction,
  drawLotAction,
  finalizeTournamentAction,
  regenerateSeatingAction,
} from "@/app/actions";
import { getTournamentResults } from "@/lib/scoring-service";
import { rankTournament } from "@/lib/tournament-ranking";

export const dynamic = "force-dynamic";

const roundStatusLabels = { PENDING: "Ожидает", SEATING_READY: "Рассадка готова", IN_PROGRESS: "Идёт игра", SCORING: "Выставление баллов", COMPLETED: "Завершён" } as const;
const formatScore = (value: { toString(): string } | string | number) => Number(value.toString()).toLocaleString("ru-RU", { maximumFractionDigits: 3 });

export default async function TournamentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const tournament = await getTournamentResults(id);
  if (!tournament) notFound();

  const completedRounds = tournament.rounds.filter((round) => round.status === "COMPLETED").length;
  const availableRound = tournament.rounds.find((round) => round.status !== "COMPLETED" && (round.number === 1 || tournament.rounds[round.number - 2]?.status === "COMPLETED"));
  const final = tournament.scoringStatus === "FINALIZED";
  const gameScoresByPlayer = new Map(tournament.players.map(({ playerId }) => [playerId, tournament.rounds.map((round) => round.game?.scores.find((score) => score.playerId === playerId) ?? null)]));
  const playerName = new Map(tournament.players.map((entry) => [entry.playerId, entry.player.nickname]));
  const unresolvedCompensation = tournament.rounds.flatMap((round) => {
    const game = round.game;
    if (!game || game.winner !== "DRAW") return [];
    const shot = game.nightActions.find((action) => action.type === "SHOT" && action.nightNumber === 2 && action.result === "KILL" && !action.undoneAt);
    const seat = game.seats.find((item) => item.seatNumber === shot?.targetSeat && (item.role === "CIVILIAN" || item.role === "SHERIFF"));
    return seat?.score && seat.score.manualCompensationPoints == null ? [{ roundNumber: round.number, gameSeatId: seat.id, nickname: seat.player.nickname }] : [];
  });
  const lotGroups = tournament.scoringStatus === "REQUIRES_DRAW_LOT" ? rankTournament(tournament.scores).unresolvedGroups : [];

  const preliminary = tournament.players.map((entry) => {
    const scores = gameScoresByPlayer.get(entry.playerId)!.filter((score) => score !== null);
    return {
      playerId: entry.playerId,
      finalRank: null as number | null,
      wins: tournament.rounds.filter((round) => { const game = round.game; const seat = game?.seats.find((item) => item.playerId === entry.playerId); return game?.winner !== "DRAW" && game?.winner === seat?.team; }).length,
      judgeAdditionalTotal: scores.reduce((sum, score) => sum + Number(score.judgeAdditionalPoints), 0),
      blackTripleTotal: scores.reduce((sum, score) => sum + Number(score.blackTriplePoints), 0),
      penaltyTotal: scores.reduce((sum, score) => sum + Number(score.penaltyPoints), 0),
      compensationTotal: 0,
      total: scores.reduce((sum, score) => sum + Number(score.totalWithoutCompensation), 0),
    };
  }).sort((a, b) => Number(b.total) - Number(a.total));
  const tableScores = final ? [...tournament.scores].sort((a, b) => (a.finalRank ?? 99) - (b.finalRank ?? 99)) : preliminary;

  return <main className="page tournament-page">
    <p className="eyebrow">Миникап · 5 туров</p><h1>{tournament.name}</h1><p className="lead">{final ? "Миникап завершён" : `${completedRounds}/5 игр завершено`}</p>
    {error ? <p className="error card">{error}</p> : null}
    <section className="card"><h2>Игроки · {tournament.players.length}/10</h2><ol className="player-list">{tournament.players.map(({ player }, index) => <li key={player.id}>{index + 1}. {player.nickname}</li>)}</ol></section>
    <section className="card"><h2>Туры · {tournament.rounds.length}/5</h2><ol className="round-list">{tournament.rounds.map((round) => {
      const game = round.game;
      const isAvailable = availableRound?.id === round.id;
      const generated = game?.seatingStatus === "GENERATED";
      const confirmed = game?.seatingStatus === "CONFIRMED";
      return <li className="round-card" key={round.id}><div className="round-head"><strong>Тур {round.number}</strong><span className={`status ${round.status === "COMPLETED" ? "confirmed" : generated ? "ready" : ""}`}>{roundStatusLabels[round.status]}</span></div>
        {game && game.seats.length > 0 && round.status !== "COMPLETED" ? <ol className="seat-list">{game.seats.map((seat) => <li key={seat.id}><span className="seat-number">{seat.seatNumber}</span><span>{seat.player.nickname}</span></li>)}</ol> : null}
        {isAvailable && game && !confirmed ? <div className={generated ? "actions" : ""}><form action={regenerateSeatingAction}><input type="hidden" name="roundId" value={round.id} /><input type="hidden" name="tournamentId" value={tournament.id} /><button className={`button ${generated ? "secondary" : ""}`} type="submit">{generated ? "Перерандомить" : `Начать тур ${round.number}`}</button></form>{generated ? <form action={confirmSeatingAction}><input type="hidden" name="roundId" value={round.id} /><input type="hidden" name="tournamentId" value={tournament.id} /><button className="button" type="submit">Подтвердить рассадку</button></form> : null}</div> : null}
        {confirmed && game ? <Link className="button" href={`/games/${game.id}`}>{round.status === "COMPLETED" ? "Посмотреть баллы" : round.status === "SCORING" ? "Выставить баллы" : "Открыть игру"}</Link> : null}
      </li>;
    })}</ol></section>

    {completedRounds > 0 ? <section className="card standings-card"><h2>{final ? "Итоговый рейтинг" : "Предварительные результаты"}</h2>{!final ? <p className="muted">КБ ещё не рассчитаны.</p> : null}<div className="standings-scroll"><table><thead><tr><th>Место</th><th>Игрок</th>{[1, 2, 3, 4, 5].map((number) => <th key={number}>Игра {number}</th>)}<th>Победы</th><th>ДБ</th><th>ТЧ</th><th>Штрафы</th><th>КБ</th><th>Итого</th></tr></thead><tbody>{tableScores.map((score, index) => <tr key={score.playerId}><td>{final ? score.finalRank : index + 1}</td><td>{playerName.get(score.playerId)}</td>{gameScoresByPlayer.get(score.playerId)!.map((gameScore, gameIndex) => <td key={gameIndex}>{gameScore ? formatScore(final ? gameScore.finalTotal : gameScore.totalWithoutCompensation) : "—"}</td>)}<td>{score.wins}</td><td>{formatScore(score.judgeAdditionalTotal)}</td><td>{formatScore(score.blackTripleTotal)}</td><td>{formatScore(score.penaltyTotal)}</td><td className="compensation-cell">{formatScore(score.compensationTotal)}</td><td><b>{formatScore(score.total)}</b></td></tr>)}</tbody></table></div></section> : null}

    {completedRounds === 5 && !final ? <section className="card finalize-card"><h2>Итог миникапа</h2>
      {tournament.scoringStatus === "REQUIRES_MANUAL_DECISION" ? <><p className="error">Требуется решение судьи по компенсационному баллу.</p>{unresolvedCompensation.map((item) => <form action={compensationOverrideAction} className="stack-form" key={item.gameSeatId}><input type="hidden" name="tournamentId" value={tournament.id} /><input type="hidden" name="gameSeatId" value={item.gameSeatId} /><b>{item.nickname}, Тур {item.roundNumber} завершён ничьёй</b><input name="value" inputMode="decimal" placeholder="КБ по решению Главного судьи" required /><input name="reason" placeholder="Причина решения" required /><button type="submit">Сохранить решение</button></form>)}</> : null}
      {tournament.scoringStatus === "REQUIRES_DRAW_LOT" ? <><p className="error">Игроки полностью равны по критериям Регламента. Проведите реальный жребий.</p>{lotGroups.map((group, groupIndex) => <form action={drawLotAction} className="stack-form" key={groupIndex}><input type="hidden" name="tournamentId" value={tournament.id} />{group.map((_, index) => <label key={index}>Место {index + 1}<select name="orderedPlayerIds" defaultValue={group[index]}>{group.map((playerId) => <option value={playerId} key={playerId}>{playerName.get(playerId)}</option>)}</select></label>)}<input name="reason" placeholder="Подтверждение жребия" required /><button type="submit">Зафиксировать порядок</button></form>)}</> : null}
      <form action={finalizeTournamentAction}><input type="hidden" name="tournamentId" value={tournament.id} /><button className="button" type="submit">{["REQUIRES_MANUAL_DECISION", "REQUIRES_DRAW_LOT"].includes(tournament.scoringStatus) ? "Повторить расчёт" : "Рассчитать итог миникапа"}</button></form>
    </section> : null}
    {final ? <section className="card"><h2>Миникап завершён</h2><a className="button" href={`/api/tournaments/${tournament.id}/export`}>Экспорт Excel</a></section> : null}
  </main>;
}
