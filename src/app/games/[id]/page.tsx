import Link from "next/link";
import { notFound } from "next/navigation";
import { gameCommandAction } from "@/app/actions";
import { ConnectionStatus } from "@/components/connection-status";
import { GameTimer } from "@/components/game-timer";
import { getGameSnapshot } from "@/lib/game-service";
import { validateRoleComposition } from "@/lib/game-rules";

export const dynamic = "force-dynamic";

const roleLabels = { CIVILIAN: "Мирный", SHERIFF: "Шериф", MAFIA: "Мафия", DON: "Дон" } as const;
const winnerLabels = { RED: "красных", BLACK: "чёрных", DRAW: "ничью" } as const;
const phaseLabels: Record<string, string> = {
  ROLE_ASSIGNMENT: "Назначение ролей", NIGHT: "Ночь", DAY: "День", VOTING: "Голосование",
  CAR_CRASH: "Автокатастрофа", FINAL_SPEECH: "Заключительная речь", PROTOCOL: "Протокол",
  RESULT_CONFIRMATION: "Подтверждение результата", SCORING: "Выставление баллов",
};
const subphaseLabels: Record<string, string> = {
  AGREEMENT: "Договорка", FREE_SEATING: "Свободная посадка", SPEECH: "Речи", PRIMARY: "Основное голосование",
  CRASH_SPEECH: "Речи автокатастрофы", REVOTE: "Повторное голосование", GROUP_EXIT: "Подъём группы",
  SHOOTING: "Отстрел", DON_CHECK: "Проверка Дона", SHERIFF_CHECK: "Проверка Шерифа",
  BLACK_TRIPLE: "Тройка чёрных", FINAL_SPEECH: "Заключительная речь", PROTOCOL: "Протокол",
  RESULT_CONFIRMATION: "Результат", SCORING: "Scoring",
};

function CommandForm({ gameId, intent, children, className }: { gameId: string; intent: string; children: React.ReactNode; className?: string }) {
  return <form action={gameCommandAction} className={className}><input type="hidden" name="gameId" value={gameId} /><input type="hidden" name="intent" value={intent} />{children}</form>;
}

function TimerForGame({ game }: { game: NonNullable<Awaited<ReturnType<typeof getGameSnapshot>>> }) {
  let duration: number | null = null;
  if (["AGREEMENT", "FREE_SEATING", "SPEECH", "FINAL_SPEECH"].includes(game.subphase)) duration = 60;
  if (game.subphase === "CRASH_SPEECH") duration = 30;
  if (["DON_CHECK", "SHERIFF_CHECK"].includes(game.subphase)) duration = 15;
  if (game.subphase === "BLACK_TRIPLE") duration = 20;
  if (game.subphase === "PROTOCOL") duration = 20;
  if (game.subphase === "SPEECH" && game.currentSpeakerSeat !== null) {
    const speaker = game.seats.find((seat) => seat.seatNumber === game.currentSpeakerSeat);
    if (speaker?.speechRestrictionPending) duration = game.seats.filter((seat) => seat.status === "ACTIVE").length <= 4 ? 30 : 10;
  }
  if (!duration) return null;
  return <GameTimer duration={duration} timerKey={`${game.id}:${game.subphase}:${game.dayNumber}:${game.nightNumber}:${game.currentSpeakerSeat ?? 0}`} />;
}

export default async function GamePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const game = await getGameSnapshot(id);
  if (!game) notFound();
  const active = game.seats.filter((seat) => seat.status === "ACTIVE");
  const current = game.seats.find((seat) => seat.seatNumber === game.currentSpeakerSeat);
  const openVote = game.voteSessions.find((session) => session.status === "OPEN");
  const activeNominations = game.nominations.filter((item) => item.dayNumber === game.dayNumber && item.status === "ACTIVE");
  const snapshot = JSON.stringify({ phase: game.phase, subphase: game.subphase, day: game.dayNumber, night: game.nightNumber, seats: game.seats.map((seat) => [seat.seatNumber, seat.status, seat.foulCount]) });

  if (game.phase === "ROLE_ASSIGNMENT") {
    const rolesValid = validateRoleComposition(game.seats.map((seat) => seat.role));
    return <main className="page game-page">
      <div className="game-topline"><Link href={`/tournaments/${game.round.tournamentId}`}>← Турнир</Link><ConnectionStatus gameId={game.id} snapshot={snapshot} /></div>
      <p className="eyebrow">Тур {game.round.number}</p><h1>Назначение ролей</h1>
      <p className="lead">Выберите Дона, двух Мафий и Шерифа. Остальные места остаются мирными.</p>
      {error ? <p className="error">{error}</p> : null}
      <div className="role-list">
        {game.seats.map((seat) => <CommandForm gameId={game.id} intent="ASSIGN_ROLE" className="role-row" key={seat.id}>
          <input type="hidden" name="seatNumber" value={seat.seatNumber} />
          <span><b>№{seat.seatNumber}</b> {seat.player.nickname}</span>
          <select name="role" defaultValue={seat.role ?? "CIVILIAN"}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <button type="submit">Сохранить</button>
        </CommandForm>)}
      </div>
      <CommandForm gameId={game.id} intent="START_GAME">
        <button className="button" type="submit" disabled={!rolesValid}>{rolesValid ? "Начать игру" : "Назначьте роли 6/1/2/1"}</button>
      </CommandForm>
    </main>;
  }

  return <main className="page game-page">
    <header className="game-header">
      <div className="game-topline"><Link href={`/tournaments/${game.round.tournamentId}`}>← Турнир</Link><ConnectionStatus gameId={game.id} snapshot={snapshot} /></div>
      <div className="game-context"><div><span>Тур {game.round.number}</span><strong>{game.phase === "DAY" ? `День ${game.dayNumber}` : game.phase === "NIGHT" ? `Ночь ${game.nightNumber}` : phaseLabels[game.phase]}</strong><small>{subphaseLabels[game.subphase] ?? game.subphase}</small></div>{current ? <div className="speaker"><span>Говорит</span><b>№{current.seatNumber}</b><small>{current.player.nickname}</small></div> : null}</div>
      <TimerForGame game={game} />
    </header>

    {error ? <p className="error card">{error}</p> : null}
    {game.pendingWinner && game.phase !== "SCORING" ? <section className="winner-banner"><b>Система определила {winnerLabels[game.pendingWinner]}</b><div className="actions"><CommandForm gameId={game.id} intent="CONFIRM_WINNER"><button className="button" type="submit">Подтвердить</button></CommandForm><CommandForm gameId={game.id} intent="CONTINUE_MANUALLY"><button className="button secondary" type="submit">Продолжить вручную</button></CommandForm></div></section> : null}

    {game.phase === "SCORING" ? <section className="card"><h2>Игра завершена</h2><p className="lead">Победа {game.winner ? winnerLabels[game.winner] : "—"}. Следующий этап — выставление баллов.</p></section> : <>
      <section className="judge-seats">
        {game.seats.map((seat) => <article className={`judge-seat ${seat.status === "ELIMINATED" ? "eliminated" : ""} ${seat.seatNumber === game.currentSpeakerSeat ? "current" : ""}`} key={seat.id}>
          <div className="seat-title"><b>№{seat.seatNumber}</b><span>{seat.player.nickname}</span><em>{seat.status === "ACTIVE" ? "В игре" : "Выбыл"}</em></div>
          <div className="seat-meta"><span>Фолы: <b>{seat.foulCount}</b></span><details><summary>Роль скрыта</summary><span>{seat.role ? roleLabels[seat.role] : "Не назначена"}</span></details></div>
          {seat.status === "ACTIVE" ? <CommandForm gameId={game.id} intent="ADD_FOUL"><input type="hidden" name="seatNumber" value={seat.seatNumber} /><button className="quick-button" type="submit">+ Фол</button></CommandForm> : null}
        </article>)}
      </section>
      {game.events.some((event) => event.type === "FOUL_ADDED") ? <CommandForm gameId={game.id} intent="UNDO_FOUL"><button className="undo-button" type="submit">Отменить последний фол</button></CommandForm> : null}

      <section className="card phase-card">
        <h2>{phaseLabels[game.phase] ?? game.phase}</h2>
        {game.subphase === "AGREEMENT" || game.subphase === "FREE_SEATING" ? <CommandForm gameId={game.id} intent="ADVANCE_FIRST_NIGHT"><button className="button" type="submit">{game.subphase === "AGREEMENT" ? "Перейти к свободной посадке" : "Начать первый день"}</button></CommandForm> : null}

        {game.phase === "DAY" && current ? <>
          <p>Текущий игрок: <b>№{current.seatNumber} {current.player.nickname}</b>{current.speechRestrictionPending ? " · ограниченная речь" : ""}</p>
          <CommandForm gameId={game.id} intent="ADD_NOMINATION" className="inline-form"><select name="nomineeSeat" aria-label="Кандидатура">{active.map((seat) => <option key={seat.id} value={seat.seatNumber}>№{seat.seatNumber} {seat.player.nickname}</option>)}</select><button type="submit">Выставить</button></CommandForm>
          {activeNominations.length ? <div className="nomination-list">Выставлены: {activeNominations.map((item) => `№${item.nomineeSeat}`).join(", ")}</div> : null}
          <div className="actions">{activeNominations.length ? <CommandForm gameId={game.id} intent="UNDO_NOMINATION"><button className="button secondary" type="submit">Undo выставления</button></CommandForm> : <span />}
          <CommandForm gameId={game.id} intent="COMPLETE_SPEECH"><button className="button" type="submit">Завершить речь</button></CommandForm></div>
        </> : null}

        {game.phase === "VOTING" && ["PRIMARY", "REVOTE"].includes(game.subphase) && openVote ? <CommandForm gameId={game.id} intent="RECORD_VOTE">
          <p className="muted">Последнее пустое поле получит остаток голосов.</p>
          <div className="vote-grid">{openVote.candidateSeats.map((seat, index) => <label key={seat}>№{seat}<input name="votes" inputMode="numeric" type="number" min="0" max={active.length} required={index < openVote.candidateSeats.length - 1} placeholder={index === openVote.candidateSeats.length - 1 ? "остаток" : "0"} /></label>)}</div>
          <button className="button" type="submit">Зафиксировать голосование</button>
        </CommandForm> : null}

        {game.phase === "CAR_CRASH" ? <><p>Речь участника автокатастрофы: <b>№{game.currentSpeakerSeat}</b></p><CommandForm gameId={game.id} intent="COMPLETE_CRASH_SPEECH"><button className="button" type="submit">Завершить речь</button></CommandForm></> : null}

        {game.subphase === "GROUP_EXIT" && openVote ? <CommandForm gameId={game.id} intent="RECORD_GROUP_EXIT"><p>Поднять игроков: {openVote.candidateSeats.map((seat) => `№${seat}`).join(", ")}</p><label className="field">Голосов за<input name="votesFor" type="number" inputMode="numeric" min="0" max={active.length} required /></label><button className="button" type="submit">Зафиксировать</button></CommandForm> : null}

        {game.subphase === "SHOOTING" ? <div className="actions"><CommandForm gameId={game.id} intent="NIGHT_SHOT" className="inline-form"><select name="targetSeat" aria-label="Цель отстрела">{game.seats.filter((seat) => seat.status === "ACTIVE" || seat.eliminationReason === "FOURTH_FOUL").map((seat) => <option key={seat.id} value={seat.seatNumber}>№{seat.seatNumber} {seat.player.nickname}{seat.status === "ELIMINATED" ? " · удалён" : ""}</option>)}</select><button type="submit">Убит</button></CommandForm><CommandForm gameId={game.id} intent="NIGHT_SHOT"><input type="hidden" name="targetSeat" value="" /><button className="button secondary" type="submit">Промах</button></CommandForm></div> : null}

        {game.subphase === "DON_CHECK" || game.subphase === "SHERIFF_CHECK" ? <><CommandForm gameId={game.id} intent={game.subphase} className="inline-form"><select name="targetSeat" aria-label="Цель проверки">{active.map((seat) => <option key={seat.id} value={seat.seatNumber}>№{seat.seatNumber} {seat.player.nickname}</option>)}</select><button type="submit">Проверить</button></CommandForm>{game.nightActions[0]?.type === game.subphase ? <details className="check-result"><summary>Показать результат</summary><strong>{game.nightActions[0].result}</strong></details> : null}</> : null}
        {game.nightActions.find((action) => !action.undoneAt && ["DON_CHECK", "SHERIFF_CHECK"].includes(action.type)) ? <details className="check-result"><summary>Последняя проверка · показать приватно</summary><strong>{game.nightActions.find((action) => !action.undoneAt && ["DON_CHECK", "SHERIFF_CHECK"].includes(action.type))?.result}</strong></details> : null}

        {game.subphase === "BLACK_TRIPLE" ? <><CommandForm gameId={game.id} intent="BLACK_TRIPLE"><div className="triple-grid">{[0, 1, 2].map((index) => <select name="selectedSeats" aria-label={`ТЧ место ${index + 1}`} key={index}>{game.seats.map((seat) => <option key={seat.id} value={seat.seatNumber}>№{seat.seatNumber}</option>)}</select>)}</div><button className="button" type="submit">Подтвердить ТЧ</button></CommandForm><CommandForm gameId={game.id} intent="SKIP_BLACK_TRIPLE"><button className="button secondary" type="submit">Без ТЧ</button></CommandForm></> : null}

        {game.phase === "FINAL_SPEECH" ? <CommandForm gameId={game.id} intent="COMPLETE_FINAL_SPEECH"><button className="button" type="submit">К протоколу</button></CommandForm> : null}
        {game.phase === "PROTOCOL" ? <CommandForm gameId={game.id} intent="COMPLETE_PROTOCOL"><button className="button" type="submit">Завершить протокол</button></CommandForm> : null}
        {game.phase === "RESULT_CONFIRMATION" && !game.pendingWinner ? <div className="actions">{(["RED", "BLACK", "DRAW"] as const).map((winner) => <CommandForm gameId={game.id} intent="CONFIRM_WINNER" key={winner}><input type="hidden" name="winner" value={winner} /><button className="button" type="submit">{winner}</button></CommandForm>)}</div> : null}
        {game.nightActions.some((action) => !action.undoneAt) && game.phase === "NIGHT" ? <CommandForm gameId={game.id} intent="UNDO_NIGHT_ACTION"><button className="undo-button" type="submit">Undo ночного действия</button></CommandForm> : null}
        {game.voteSessions.some((session) => session.status === "COMPLETED") && ["FINAL_SPEECH", "CAR_CRASH"].includes(game.phase) ? <CommandForm gameId={game.id} intent="UNDO_VOTE"><button className="undo-button" type="submit">Undo голосования</button></CommandForm> : null}
      </section>
    </>}

    <details className="card tools"><summary>⋯ Дополнительные действия</summary>
      <h3>Штраф</h3><CommandForm gameId={game.id} intent="ADD_PENALTY" className="stack-form"><select name="seatNumber">{game.seats.map((seat) => <option key={seat.id} value={seat.seatNumber}>№{seat.seatNumber} {seat.player.nickname}</option>)}</select><select name="value">{[-0.2, -0.4, -0.5, -0.7, -1.2, -1.6].map((value) => <option key={value} value={value}>{value}</option>)}</select><input name="comment" placeholder="Комментарий (необязательно)" /><button type="submit">Добавить штраф</button></CommandForm>
      {game.penalties.some((penalty) => !penalty.undoneAt) ? <CommandForm gameId={game.id} intent="UNDO_PENALTY"><button className="undo-button" type="submit">Undo штрафа</button></CommandForm> : null}
      <h3>Ручная корректировка</h3><CommandForm gameId={game.id} intent="MANUAL_OVERRIDE" className="stack-form"><select name="kind"><option value="FOUL">Число фолов</option><option value="ROLE">Роль</option><option value="STATUS">Выбыл / восстановить</option><option value="PHASE">Phase / subphase</option><option value="WINNER">Победитель / ничья</option><option value="CANCEL_VOTE">Отменить голосование</option><option value="PENALTY">Custom penalty</option></select><select name="seatNumber"><option value="">Без игрока</option>{game.seats.map((seat) => <option key={seat.id} value={seat.seatNumber}>№{seat.seatNumber} {seat.player.nickname}</option>)}</select><input name="value" placeholder="Новое значение" /><input name="extra" placeholder="Subphase / комментарий" /><input name="reason" placeholder="Причина (обязательно)" required /><button type="submit">Применить корректировку</button></CommandForm>
      <h3>Audit</h3><ol className="audit-list">{game.events.slice(0, 20).map((event) => <li key={event.id}><b>{event.type}</b><time>{event.createdAt.toLocaleTimeString("ru-RU")}</time>{event.overrideReason ? <small>{event.overrideReason}</small> : null}</li>)}</ol>
    </details>
  </main>;
}
