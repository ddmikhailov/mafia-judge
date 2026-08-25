"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { confirmSeating, createTournament, regenerateSeating } from "@/lib/tournament-service";
import { performGameAction, type GameCommand } from "@/lib/game-service";
import { ROLES } from "@/lib/game-rules";
import { closeGameScoring, finalizeTournament, overrideDrawCompensation, overrideGameScore, recordDrawLot, saveGameScoring } from "@/lib/scoring-service";
import { requireUser } from "@/lib/auth/session";
import { canApproveHeadJudge, requireGameAccess, requireRole, requireRoundAccess, requireTournamentAccess } from "@/lib/authorization";
import { publicError, DomainError } from "@/lib/errors";
import { boundedComment, boundedReason, parseFiniteDecimal } from "@/lib/input-limits";
import { validateOverride } from "@/lib/manual-override";
import { consumeRateLimit } from "@/lib/rate-limit";

export type CreateTournamentState = { error?: string };
const integer = z.coerce.number().int();
const uuid = z.string().uuid();

function redirectWithError(path: string, error: unknown, fallback: string): never {
  const safe = publicError(error, fallback);
  redirect(`${path}?error=${encodeURIComponent(safe.message)}`);
}

export async function createTournamentAction(_state: CreateTournamentState, formData: FormData): Promise<CreateTournamentState> {
  let tournamentId: string | null = null;
  try {
    const user = await requireUser();
    requireRole(user, "SUPER_ADMIN", "HEAD_JUDGE");
    consumeRateLimit(`create-tournament:${user.id}`, 5, 10 * 60 * 1000);
    tournamentId = (await createTournament({ name: String(formData.get("name") ?? ""), nicknames: Array.from({ length: 10 }, (_, index) => String(formData.get(`nickname-${index}`) ?? "")) }, { actorUserId: user.id })).id;
  } catch (error) {
    return { error: publicError(error, "Не удалось создать миникап.").message };
  }
  redirect(`/tournaments/${tournamentId}`);
}

export async function regenerateSeatingAction(formData: FormData) {
  const tournamentId = uuid.parse(formData.get("tournamentId"));
  try {
    const user = await requireUser();
    const roundId = uuid.parse(formData.get("roundId"));
    await requireRoundAccess(user, roundId, tournamentId, { mutation: true });
    await regenerateSeating(roundId, { actorUserId: user.id });
  } catch (error) { redirectWithError(`/tournaments/${tournamentId}`, error, "Не удалось обновить рассадку."); }
  revalidatePath(`/tournaments/${tournamentId}`);
}

export async function confirmSeatingAction(formData: FormData) {
  const tournamentId = uuid.parse(formData.get("tournamentId"));
  try {
    const user = await requireUser();
    const roundId = uuid.parse(formData.get("roundId"));
    await requireRoundAccess(user, roundId, tournamentId, { mutation: true });
    await confirmSeating(roundId, { actorUserId: user.id });
  } catch (error) { redirectWithError(`/tournaments/${tournamentId}`, error, "Не удалось подтвердить рассадку."); }
  revalidatePath(`/tournaments/${tournamentId}`);
}

export async function gameCommandAction(formData: FormData) {
  const gameId = uuid.parse(formData.get("gameId"));
  try {
    const user = await requireUser();
    const intent = z.string().min(1).parse(formData.get("intent"));
    const privileged = intent === "MANUAL_OVERRIDE" || intent === "CONTINUE_MANUALLY";
    await requireGameAccess(user, gameId, { mutation: true, privileged });
    let command: GameCommand;
    switch (intent) {
      case "ASSIGN_ROLE": command = { type: intent, seatNumber: integer.min(1).max(10).parse(formData.get("seatNumber")), role: z.enum(ROLES).parse(formData.get("role")) }; break;
      case "START_GAME": case "ADVANCE_FIRST_NIGHT": case "COMPLETE_SPEECH": case "UNDO_FOUL": case "UNDO_NOMINATION": case "UNDO_VOTE": case "COMPLETE_CRASH_SPEECH": case "SKIP_BLACK_TRIPLE": case "UNDO_NIGHT_ACTION": case "COMPLETE_FINAL_SPEECH": case "COMPLETE_PROTOCOL": case "CONTINUE_MANUALLY": case "UNDO_PENALTY": command = { type: intent }; break;
      case "ADD_FOUL": command = { type: intent, seatNumber: integer.min(1).max(10).parse(formData.get("seatNumber")) }; break;
      case "ADD_NOMINATION": command = { type: intent, nomineeSeat: integer.min(1).max(10).parse(formData.get("nomineeSeat")) }; break;
      case "RECORD_VOTE": command = { type: intent, votes: formData.getAll("votes").map((value) => String(value).trim() === "" ? null : integer.min(0).max(10).parse(value)) }; break;
      case "RECORD_GROUP_EXIT": command = { type: intent, votesFor: integer.min(0).max(10).parse(formData.get("votesFor")) }; break;
      case "NIGHT_SHOT": { const target = String(formData.get("targetSeat") ?? ""); command = { type: intent, targetSeat: target === "" ? null : integer.min(1).max(10).parse(target) }; break; }
      case "DON_CHECK": case "SHERIFF_CHECK": command = { type: intent, targetSeat: integer.min(1).max(10).parse(formData.get("targetSeat")) }; break;
      case "BLACK_TRIPLE": command = { type: intent, selectedSeats: formData.getAll("selectedSeats").map((value) => integer.min(1).max(10).parse(value)) }; break;
      case "CONFIRM_WINNER": {
        const value = String(formData.get("winner") ?? "");
        if (value) throw new DomainError("Произвольный результат задаётся через ручную корректировку с причиной", "WINNER_OVERRIDE_REQUIRED", 409);
        command = { type: intent };
        break;
      }
      case "ADD_PENALTY": command = { type: intent, seatNumber: integer.min(1).max(10).parse(formData.get("seatNumber")), value: z.coerce.number().finite().parse(formData.get("value")), comment: boundedComment.parse(String(formData.get("comment") ?? "")) || undefined }; break;
      case "MANUAL_OVERRIDE": command = { type: intent, ...validateOverride({ kind: String(formData.get("kind") ?? ""), reason: String(formData.get("reason") ?? ""), seatNumber: String(formData.get("seatNumber") ?? "") ? integer.parse(formData.get("seatNumber")) : undefined, value: String(formData.get("value") ?? "") || undefined, extra: String(formData.get("extra") ?? "") || undefined }) }; break;
      default: throw new DomainError("Неизвестное игровое действие", "UNKNOWN_COMMAND");
    }
    const actionToken = String(formData.get("actionToken") ?? "") || undefined;
    await performGameAction(gameId, command, { actorUserId: user.id, actionToken: actionToken ? uuid.parse(actionToken) : undefined });
  } catch (error) { redirectWithError(`/games/${gameId}`, error, "Не удалось сохранить действие."); }
  revalidatePath(`/games/${gameId}`);
}

function scoringInputs(formData: FormData) {
  const seatIds = formData.getAll("gameSeatId").map((value) => uuid.parse(value));
  const values = formData.getAll("judgeAdditionalPoints").map(String);
  if (seatIds.length !== values.length) throw new DomainError("Некорректная форма scoring", "INVALID_SCORING_FORM");
  return seatIds.map((gameSeatId, index) => ({ gameSeatId, judgeAdditionalPoints: parseFiniteDecimal(values[index], { maxAbs: 4 }) }));
}

export async function gameScoringAction(formData: FormData) {
  const gameId = uuid.parse(formData.get("gameId"));
  try {
    const user = await requireUser();
    await requireGameAccess(user, gameId, { mutation: true });
    const intent = z.enum(["SAVE", "CLOSE"]).parse(formData.get("intent"));
    const requestedApproval = formData.get("headJudgeApproved") === "on";
    if (requestedApproval && !canApproveHeadJudge(user)) throw new DomainError("Согласование может зафиксировать только Главный судья", "FORBIDDEN", 403);
    const inputs = scoringInputs(formData);
    const rawToken = String(formData.get("actionToken") ?? "");
    const context = { actorUserId: user.id, actionToken: rawToken ? uuid.parse(rawToken) : undefined };
    if (intent === "CLOSE") await closeGameScoring(gameId, inputs, requestedApproval, context);
    else await saveGameScoring(gameId, inputs, requestedApproval, context);
  } catch (error) { redirectWithError(`/games/${gameId}`, error, "Не удалось сохранить scoring."); }
  revalidatePath(`/games/${gameId}`);
}

export async function scoreOverrideAction(formData: FormData) {
  const gameId = uuid.parse(formData.get("gameId"));
  try {
    const user = await requireUser();
    await requireGameAccess(user, gameId, { mutation: true, privileged: true });
    await overrideGameScore({ gameId, gameSeatId: uuid.parse(formData.get("gameSeatId")), judgeAdditionalPoints: parseFiniteDecimal(String(formData.get("judgeAdditionalPoints") ?? ""), { maxAbs: 4 }), penaltyValue: String(formData.get("penaltyValue") ?? "").trim() || undefined, manualCompensationPoints: String(formData.get("manualCompensationPoints") ?? "").trim() || undefined, reason: boundedReason.parse(formData.get("reason")) }, { actorUserId: user.id, actionToken: uuid.parse(formData.get("actionToken")) });
  } catch (error) { redirectWithError(`/games/${gameId}`, error, "Не удалось изменить scoring."); }
  revalidatePath(`/games/${gameId}`);
}

export async function finalizeTournamentAction(formData: FormData) {
  const tournamentId = uuid.parse(formData.get("tournamentId"));
  try { const user = await requireUser(); await requireTournamentAccess(user, tournamentId, { mutation: true, privileged: true }); await finalizeTournament(tournamentId, { actorUserId: user.id, actionToken: uuid.parse(formData.get("actionToken")) }); }
  catch (error) { redirectWithError(`/tournaments/${tournamentId}`, error, "Не удалось рассчитать итог."); }
  revalidatePath(`/tournaments/${tournamentId}`);
}

export async function compensationOverrideAction(formData: FormData) {
  const tournamentId = uuid.parse(formData.get("tournamentId"));
  try { const user = await requireUser(); await requireTournamentAccess(user, tournamentId, { mutation: true, privileged: true }); await overrideDrawCompensation({ tournamentId, gameSeatId: uuid.parse(formData.get("gameSeatId")), value: parseFiniteDecimal(String(formData.get("value") ?? ""), { maxAbs: 10 }), reason: boundedReason.parse(formData.get("reason")) }, { actorUserId: user.id }); }
  catch (error) { redirectWithError(`/tournaments/${tournamentId}`, error, "Не удалось сохранить КБ."); }
  revalidatePath(`/tournaments/${tournamentId}`);
}

export async function drawLotAction(formData: FormData) {
  const tournamentId = uuid.parse(formData.get("tournamentId"));
  try { const user = await requireUser(); await requireTournamentAccess(user, tournamentId, { mutation: true, privileged: true }); await recordDrawLot({ tournamentId, orderedPlayerIds: formData.getAll("orderedPlayerIds").map((value) => uuid.parse(value)), reason: boundedReason.parse(formData.get("reason")) }, { actorUserId: user.id }); }
  catch (error) { redirectWithError(`/tournaments/${tournamentId}`, error, "Не удалось записать жребий."); }
  revalidatePath(`/tournaments/${tournamentId}`);
}
