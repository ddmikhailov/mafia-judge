import Link from "next/link";
import { notFound } from "next/navigation";
import { gameScoringAction, scoreOverrideAction } from "@/app/actions";
import { ConnectionStatus } from "@/components/connection-status";
import { GameTimer } from "@/components/game-timer";
import { CommandForm } from "@/components/command-form";
import { PendingSubmit } from "@/components/pending-submit";
import { BlackTriplePicker } from "@/components/black-triple-picker";
import { getGameSnapshot } from "@/lib/game-service";
import { validateRoleComposition } from "@/lib/game-rules";
import { allowedJudgeAdditional } from "@/lib/scoring-rules";
import { getGameScoringSnapshot } from "@/lib/scoring-service";
import { requirePageUser } from "@/lib/auth/session";
import { canApproveHeadJudge, canDangerousOverride, requireGameAccess } from "@/lib/authorization";

export const dynamic = "force-dynamic";

const roleLabels = { CIVILIAN: "Мирный", SHERIFF: "Шериф", MAFIA: "Мафия", DON: "Дон" } as const;
const protocolMarkOptions = [
  { value: "", label: "—", className: "none" },
  { value: "RED", label: "Красный", className: "red" },
  { value: "BLACK", label: "Чёрный", className: "black" },
  { value: "DON", label: "Дон", className: "don" },
  { value: "SHERIFF", label: "Шериф", className: "sheriff" },
] as const;
type ProtocolPayload = { speakerSeat?: number; marks?: Array<{ seatNumber: number; mark: string }>; note?: string | null };
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

function TimerForGame({ game }: { game: NonNullable<Awaited<ReturnType<typeof getGameSnapshot>>> }) {
  let duration: number | null = null;
  if (["AGREEMENT", "FREE_SEATING", "SPEECH", "FINAL_SPEECH"].includes(game.subphase)) duration = 60;
  if (game.subphase === "CRASH_SPEECH") duration = 30;
  if (["DON_CHECK", "SHERIFF_CHECK"].includes(game.subphase)) duration = 15;
  if (game.subphase === "BLACK_TRIPLE") duration = 20;
  if (game.subphase === "PROTOCOL") duration = 20;
  if (game.subphase === "SPEECH" && game.currentSpeakerSeat !== null) {
    const speaker = game.seats.find((seat) => seat.seatNumber === game.currentSpeakerSeat);
    if (speaker?.speechRestrictionPending) duration = null;
  }
  if (!duration) return null;
  const timerKey = `${game.id}:${game.subphase}:${game.dayNumber}:${game.nightNumber}:${game.currentSpeakerSeat ?? 0}`;
  return <GameTimer key={timerKey} duration={duration} timerKey={timerKey} />;
}

function formatScore(value: { toString(): string } | string | number) {
  return Number(value.toString()).toLocaleString("ru-RU", { maximumFractionDigits: 3 });
}

function formatSignedScore(value: { toString(): string } | string | number) {
  const numericValue = Number(value.toString());
  return `${numericValue > 0 ? "+" : ""}${formatScore(numericValue)}`;
}

function nightActionText(action: { type: string; targetSeat: number | null; result: string }) {
  if (action.type === "SHOT") return action.targetSeat === null ? "Отстрел — промах" : `Отстрел — место ${action.targetSeat}`;
  const type = action.type === "DON_CHECK" ? "Проверка Дона" : "Проверка Шерифа";
  const results: Record<string, string> = { IS_SHERIFF: "шериф", NOT_SHERIFF: "не шериф", RED: "красный", BLACK: "чёрный" };
  return `${type} — место ${action.targetSeat}: ${results[action.result] ?? action.result}`;
}

async function ScoringScreen({ gameId, error, saved, user }: { gameId: string; error?: string; saved?: boolean; user: Awaited<ReturnType<typeof requirePageUser>> }) {
  const game = await getGameScoringSnapshot(gameId);
  if (!game?.winner) notFound();
  const locked = game.status === "COMPLETED";
  const approved = game.scores.some((score) => score.headJudgeApproved);
  const scoreBySeat = new Map(game.scores.map((score) => [score.gameSeatId, score]));
  return <main className="page game-page">
    <div className="game-topline"><Link href={`/tournaments/${game.round.tournamentId}`}>← Турнир</Link><ConnectionStatus gameId={game.id} snapshot={JSON.stringify({ phase: game.phase, status: game.status, scores: game.scores.map((score) => [score.gameSeatId, score.judgeAdditionalPoints.toString()]) })} /></div>
    <p className="eyebrow">Тур {game.round.number} · {locked ? "игра закрыта" : "подсчёт баллов"}</p>
    <p className="assigned-judges">Судьи: {game.round.tournament.judges.map(({ user: judge }) => judge.displayName).join(", ") || "не назначены"}</p>
    <h1>{locked ? "Баллы игры" : "Выставление баллов"}</h1>
    <p className="lead">Основной балл, ТЧ и штрафы рассчитаны автоматически. ДБ можно выставить со знаком плюс или минус.</p>
    {error ? <p className="error card">{error}</p> : null}
    {saved && !locked ? <p className="success card" role="status">Баллы сохранены</p> : null}
    {!locked ? <form action={gameScoringAction}>
      <input type="hidden" name="gameId" value={game.id} />
      <input type="hidden" name="actionToken" value={crypto.randomUUID()} />
      <div className="score-list">
        {game.seats.map((seat) => {
          const score = scoreBySeat.get(seat.id)!;
          const values = allowedJudgeAdditional(game.winner!, seat.team!);
          return <article className="score-card" key={`${seat.id}:${score.judgeAdditionalPoints.toString()}`}>
            <input type="hidden" name="gameSeatId" value={seat.id} />
            <div className="score-player"><b>№{seat.seatNumber} {seat.player.nickname}</b><span>{roleLabels[seat.role!]} · {seat.team}</span></div>
            <dl><div><dt>Основной</dt><dd>{formatScore(score.basePoints)}</dd></div><div><dt>ТЧ</dt><dd>{formatScore(score.blackTriplePoints)}</dd></div><div><dt>Штраф</dt><dd>{formatScore(score.penaltyPoints)}</dd></div><div className="score-total"><dt>Итого</dt><dd>{formatScore(score.totalWithoutCompensation)}</dd></div></dl>
            <label className="score-db">ДБ<select name="judgeAdditionalPoints" defaultValue={score.judgeAdditionalPoints.toString()}>{values.map((value) => <option value={value} key={value}>{formatSignedScore(value)}</option>)}</select></label>
          </article>;
        })}
      </div>
      {canApproveHeadJudge(user) ? <label className="approval"><input type="checkbox" name="headJudgeApproved" defaultChecked={approved} /> Согласовано с Главным судьёй</label> : null}
      <div className="actions"><PendingSubmit className="button secondary" name="intent" value="SAVE">Сохранить</PendingSubmit><PendingSubmit name="intent" value="CLOSE">Закрыть игру</PendingSubmit></div>
    </form> : <section className="card round-summary"><h2>Итоги тура</h2><div className="round-summary-scroll"><table><thead><tr><th>Место</th><th>Игрок</th><th>Роль</th><th>Баллы</th></tr></thead><tbody>{game.seats.map((seat) => { const score = scoreBySeat.get(seat.id)!; return <tr key={seat.id}><td>{seat.seatNumber}</td><td>{seat.player.nickname}</td><td>{roleLabels[seat.role!]}</td><td><b>{formatSignedScore(score.totalWithoutCompensation)}</b></td></tr>; })}</tbody></table></div></section>}
    {locked ? <>
      <section className="card"><p className="muted">Игра закрыта, результаты сохранены. Следующий тур доступен на странице миникапа.</p><Link className="button" href={`/tournaments/${game.round.tournamentId}`}>К турам</Link></section>
      {canDangerousOverride(user) ? <details className="card tools"><summary>⋯ Ручная корректировка баллов</summary><form action={scoreOverrideAction} className="stack-form">
        <input type="hidden" name="gameId" value={game.id} />
        <input type="hidden" name="actionToken" value={crypto.randomUUID()} />
        <select name="gameSeatId">{game.seats.map((seat) => <option value={seat.id} key={seat.id}>№{seat.seatNumber} {seat.player.nickname}</option>)}</select>
        <input name="judgeAdditionalPoints" inputMode="decimal" placeholder="Новое ДБ" required />
        <input name="penaltyValue" inputMode="decimal" placeholder="Доп. штраф, например -0.2 (необязательно)" />
        <input name="manualCompensationPoints" inputMode="decimal" placeholder="Ручной КБ (необязательно)" />
        <input name="reason" maxLength={500} placeholder="Причина (обязательно)" required />
        <PendingSubmit>Применить и потребовать пересчёт</PendingSubmit>
      </form></details> : null}
    </> : null}
  </main>;
}

export default async function GamePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { id } = await params;
  const { error, saved } = await searchParams;
  const user = await requirePageUser();
  await requireGameAccess(user, id);
  const game = await getGameSnapshot(id);
  if (!game) notFound();
  if (game.phase === "SCORING" || game.status === "COMPLETED") return <ScoringScreen gameId={game.id} error={error} saved={saved === "1"} user={user} />;
  const active = game.seats.filter((seat) => seat.status === "ACTIVE");
  const current = game.seats.find((seat) => seat.seatNumber === game.currentSpeakerSeat);
  const protocolSpeaker = current ?? game.seats.find((seat) => game.pendingExitSeats.includes(seat.seatNumber)) ?? game.seats.find((seat) => seat.status === "ELIMINATED") ?? game.seats[0];
  const openVote = game.voteSessions.find((session) => session.status === "OPEN");
  const activeNominations = game.nominations.filter((item) => item.dayNumber === game.dayNumber && item.status === "ACTIVE");
  const nightHistory = game.nightActions.filter((action) => !action.undoneAt).toReversed();
  const crashSeats = game.phase === "CAR_CRASH" ? game.voteSessions.find((session) => session.status === "COMPLETED" && session.tieSeats.length > 0)?.tieSeats ?? [] : [];
  const protocolEvent = protocolSpeaker ? game.events.find((event) => event.type === "PROTOCOL_SAVED" && (event.payload as ProtocolPayload).speakerSeat === protocolSpeaker.seatNumber) : undefined;
  const protocolRecord = protocolEvent?.payload as ProtocolPayload | undefined;
  const protocolMarks = new Map((protocolRecord?.marks ?? []).map(({ seatNumber, mark }) => [seatNumber, mark]));
  const snapshot = JSON.stringify({ phase: game.phase, subphase: game.subphase, day: game.dayNumber, night: game.nightNumber, seats: game.seats.map((seat) => [seat.seatNumber, seat.status, seat.foulCount]) });

  if (game.phase === "ROLE_ASSIGNMENT") {
    const rolesValid = validateRoleComposition(game.seats.map((seat) => seat.role));
    return <main className="page game-page">
      <div className="game-topline"><Link href={`/tournaments/${game.round.tournamentId}`}>← Турнир</Link><ConnectionStatus gameId={game.id} snapshot={snapshot} /></div>
      <p className="eyebrow">Тур {game.round.number}</p><h1>Назначение ролей</h1>
      <p className="assigned-judges">Судьи: {game.round.tournament.judges.map(({ user: judge }) => judge.displayName).join(", ") || "не назначены"}</p>
      <p className="lead">Выберите Дона, двух Мафий и Шерифа. Остальные места остаются мирными.</p>
      {error ? <p className="error">{error}</p> : null}
      <div className="role-list">
        {game.seats.map((seat) => <CommandForm gameId={game.id} intent="ASSIGN_ROLE" className="role-row" key={`${seat.id}:${seat.role ?? "CIVILIAN"}`}>
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
      <div className="game-context"><div><span>Тур {game.round.number}</span><strong className={game.phase === "FINAL_SPEECH" ? "final-speech-title" : undefined}>{game.phase === "DAY" ? `День ${game.dayNumber}` : game.phase === "NIGHT" ? `Ночь ${game.nightNumber}` : phaseLabels[game.phase]}</strong><small>{subphaseLabels[game.subphase] ?? game.subphase}</small></div>{current ? <div className="speaker"><span>Говорит</span><b>№{current.seatNumber}</b><small>{current.player.nickname}</small></div> : null}</div>
      <TimerForGame game={game} />
    </header>

    {error ? <p className="error card">{error}</p> : null}
    {nightHistory.length ? <details className="card night-history"><summary>Ночные действия · показать приватно</summary><ol>{nightHistory.map((action) => <li key={action.id}><span>Ночь {action.nightNumber}</span><b>{nightActionText(action)}</b></li>)}</ol></details> : null}
    {game.pendingWinner && game.phase === "RESULT_CONFIRMATION" ? <section className="winner-banner"><b>Система определила {winnerLabels[game.pendingWinner]}</b><div className="actions"><CommandForm gameId={game.id} intent="CONFIRM_WINNER"><button className="button" type="submit">Подтвердить</button></CommandForm>{canDangerousOverride(user) ? <CommandForm gameId={game.id} intent="CONTINUE_MANUALLY"><button className="button secondary" type="submit">Продолжить вручную</button></CommandForm> : null}</div></section> : null}

    {game.phase === "PROTOCOL" && protocolSpeaker ? <section className="card protocol-card"><h2>Протокол игрока №{protocolSpeaker.seatNumber}</h2><p className="muted">{protocolSpeaker.player.nickname}: отметьте озвученные роли и цвета.</p><CommandForm gameId={game.id} intent="SAVE_PROTOCOL" className="protocol-form" key={`${protocolSpeaker.id}:${protocolEvent?.id ?? "new"}`}>
      <input type="hidden" name="speakerSeat" value={protocolSpeaker.seatNumber} />
      <div className="protocol-list">{game.seats.map((seat) => <div className="protocol-player" key={seat.id}><b>№{seat.seatNumber} <span>{seat.player.nickname}</span></b><div className="protocol-options">{protocolMarkOptions.map((option) => <label className={`protocol-option ${option.className}`} key={option.value || "none"}><input type="radio" name={`mark-${seat.seatNumber}`} value={option.value} defaultChecked={(protocolMarks.get(seat.seatNumber) ?? "") === option.value} /><span>{option.label}</span></label>)}</div></div>)}</div>
      <label className="protocol-note">Дополнительная информация<textarea name="note" maxLength={500} rows={3} defaultValue={protocolRecord?.note ?? ""} placeholder="Например: версия игры или важное замечание" /></label>
      {protocolEvent ? <p className="protocol-saved">Отметки сохранены</p> : null}
      <div className="actions"><button className="button secondary" type="submit">Сохранить</button><button className="button" type="submit" name="complete" value="true">Сохранить и завершить</button></div>
    </CommandForm></section> : null}

    <>
      <section className="judge-seats">
        {game.seats.map((seat) => <article className={`judge-seat fouls-${Math.min(seat.foulCount, 4)} ${seat.status === "ELIMINATED" ? "eliminated" : ""} ${seat.seatNumber === game.currentSpeakerSeat ? "current" : ""}`} key={seat.id}>
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
          <p>Текущий игрок: <b>№{current.seatNumber} {current.player.nickname}</b></p>
          {current.speechRestrictionPending ? <div className="speech-restriction" role="status"><b>Игрок пропускает речь из-за трёх фолов</b><p>Таймер не выдаётся, но кандидатуру выставить можно.</p></div> : null}
          <CommandForm gameId={game.id} intent="ADD_NOMINATION" className="inline-form"><select name="nomineeSeat" aria-label="Место кандидата">{active.map((seat) => <option key={seat.id} value={seat.seatNumber}>{seat.seatNumber}</option>)}</select><button type="submit">Выставить</button></CommandForm>
          {activeNominations.length ? <div className="nomination-list">Выставлены: {activeNominations.map((item) => item.nomineeSeat).join(", ")}</div> : null}
          <div className="actions">{activeNominations.length ? <CommandForm gameId={game.id} intent="UNDO_NOMINATION"><button className="button secondary" type="submit">Отменить выставление</button></CommandForm> : <span />}
          <CommandForm gameId={game.id} intent="COMPLETE_SPEECH"><button className="button" type="submit">{current.speechRestrictionPending ? "Речь пропущена" : "Завершить речь"}</button></CommandForm></div>
        </> : null}

        {game.phase === "VOTING" && ["PRIMARY", "REVOTE"].includes(game.subphase) && openVote ? <CommandForm gameId={game.id} intent="RECORD_VOTE">
          <p className="muted">Сумма голосов должна быть равна числу живых игроков: {active.length}.</p>
          <div className="vote-grid">{openVote.candidateSeats.map((seat) => <label key={seat}>№{seat}<input name="votes" inputMode="numeric" type="number" min="0" max={active.length} required defaultValue={0} /></label>)}</div>
          <button className="button" type="submit">Зафиксировать голосование</button>
        </CommandForm> : null}

        {game.phase === "CAR_CRASH" ? <><div className="crash-participants"><span>Участники автокатастрофы</span><b>{crashSeats.map((seat) => `№${seat}`).join(", ")}</b></div><p>Сейчас говорит: <b>№{game.currentSpeakerSeat}</b></p><CommandForm gameId={game.id} intent="COMPLETE_CRASH_SPEECH"><button className="button" type="submit">Завершить речь</button></CommandForm></> : null}

        {game.subphase === "GROUP_EXIT" && openVote ? <CommandForm gameId={game.id} intent="RECORD_GROUP_EXIT"><p>Поднять игроков: {openVote.candidateSeats.map((seat) => `№${seat}`).join(", ")}</p><label className="field">Голосов за<input name="votesFor" type="number" inputMode="numeric" min="0" max={active.length} required /></label><button className="button" type="submit">Зафиксировать</button></CommandForm> : null}

        {game.subphase === "SHOOTING" ? <div className="actions"><CommandForm gameId={game.id} intent="NIGHT_SHOT" className="inline-form"><select name="targetSeat" aria-label="Цель отстрела">{game.seats.filter((seat) => seat.status === "ACTIVE" || seat.eliminationReason === "FOURTH_FOUL").map((seat) => <option key={seat.id} value={seat.seatNumber}>№{seat.seatNumber} {seat.player.nickname}{seat.status === "ELIMINATED" ? " · удалён" : ""}</option>)}</select><button type="submit">Убит</button></CommandForm><CommandForm gameId={game.id} intent="NIGHT_SHOT"><input type="hidden" name="targetSeat" value="" /><button className="button secondary" type="submit">Промах</button></CommandForm></div> : null}

        {game.subphase === "DON_CHECK" || game.subphase === "SHERIFF_CHECK" ? <CommandForm gameId={game.id} intent={game.subphase} className="inline-form"><select name="targetSeat" aria-label="Цель проверки">{game.seats.map((seat) => <option key={seat.id} value={seat.seatNumber}>№{seat.seatNumber} {seat.player.nickname}{seat.status === "ELIMINATED" ? " · выбыл" : ""}</option>)}</select><button type="submit">Проверить</button></CommandForm> : null}

        {game.subphase === "BLACK_TRIPLE" ? <><CommandForm gameId={game.id} intent="BLACK_TRIPLE"><BlackTriplePicker seatNumbers={game.seats.map((seat) => seat.seatNumber)} /></CommandForm><CommandForm gameId={game.id} intent="SKIP_BLACK_TRIPLE"><button className="button secondary" type="submit">Без ТЧ</button></CommandForm></> : null}

        {game.phase === "FINAL_SPEECH" ? <CommandForm gameId={game.id} intent="COMPLETE_FINAL_SPEECH"><button className="button" type="submit">К протоколу</button></CommandForm> : null}
        {game.phase === "RESULT_CONFIRMATION" && !game.pendingWinner && canDangerousOverride(user) ? <p className="muted">Установите результат через ручную корректировку с обязательной причиной.</p> : null}
        {game.nightActions.some((action) => !action.undoneAt) && game.phase === "NIGHT" ? <CommandForm gameId={game.id} intent="UNDO_NIGHT_ACTION"><button className="undo-button" type="submit">Отменить ночное действие</button></CommandForm> : null}
        {game.voteSessions.some((session) => session.status === "COMPLETED") && ["FINAL_SPEECH", "CAR_CRASH"].includes(game.phase) ? <CommandForm gameId={game.id} intent="UNDO_VOTE"><button className="undo-button" type="submit">Отменить голосование</button></CommandForm> : null}
      </section>
    </>

    <details className="card manual-winner">
      <summary>Завершить игру вручную</summary>
      <p className="muted">Используйте, если результат нужно зафиксировать до автоматического определения победителя.</p>
      <div className="actions">
        <CommandForm gameId={game.id} intent="DECLARE_WINNER" confirmMessage="Объявить победу красных и перейти к выставлению баллов? Текущая игровая фаза будет завершена, а действие сохранится в истории.">
          <input type="hidden" name="winner" value="RED" />
          <button className="button danger" type="submit">Победа красных</button>
        </CommandForm>
        <CommandForm gameId={game.id} intent="DECLARE_WINNER" confirmMessage="Объявить победу чёрных и перейти к выставлению баллов? Текущая игровая фаза будет завершена, а действие сохранится в истории.">
          <input type="hidden" name="winner" value="BLACK" />
          <button className="button danger" type="submit">Победа чёрных</button>
        </CommandForm>
      </div>
    </details>

    <details className="card tools"><summary>⋯ Дополнительные действия</summary>
      <h3>Штраф</h3><CommandForm gameId={game.id} intent="ADD_PENALTY" className="stack-form"><select name="seatNumber">{game.seats.map((seat) => <option key={seat.id} value={seat.seatNumber}>№{seat.seatNumber} {seat.player.nickname}</option>)}</select><select name="value">{[-0.2, -0.4, -0.5, -0.7, -1.2, -1.6].map((value) => <option key={value} value={value}>{value}</option>)}</select><input name="comment" placeholder="Комментарий (необязательно)" /><button type="submit">Добавить штраф</button></CommandForm>
      {game.penalties.some((penalty) => !penalty.undoneAt) ? <CommandForm gameId={game.id} intent="UNDO_PENALTY"><button className="undo-button" type="submit">Отменить штраф</button></CommandForm> : null}
      {canDangerousOverride(user) ? <><h3>Ручная корректировка</h3><CommandForm gameId={game.id} intent="MANUAL_OVERRIDE" className="stack-form"><select name="kind" aria-label="Тип корректировки"><option value="FOUL">Число фолов</option><option value="ROLE">Роль</option><option value="STATUS">Выбыл / восстановить</option><option value="PHASE">Этап и подэтап игры</option><option value="WINNER">Победитель / ничья</option><option value="CANCEL_VOTE">Отменить голосование</option><option value="PENALTY">Произвольный штраф</option></select><select name="seatNumber" aria-label="Игрок"><option value="">Без игрока</option>{game.seats.map((seat) => <option key={seat.id} value={seat.seatNumber}>№{seat.seatNumber} {seat.player.nickname}</option>)}</select><input name="value" placeholder="Новое значение" /><input name="extra" maxLength={500} placeholder="Подэтап или комментарий" /><input name="reason" maxLength={500} placeholder="Причина (обязательно)" required /><button type="submit">Применить корректировку</button></CommandForm></> : null}
    </details>
  </main>;
}
