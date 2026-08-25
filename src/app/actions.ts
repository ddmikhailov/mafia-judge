"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";
import {
  confirmSeating,
  createTournament,
  regenerateSeating,
} from "@/lib/tournament-service";
import { performGameAction, type GameCommand } from "@/lib/game-service";
import { ROLES } from "@/lib/game-rules";
import {
  closeGameScoring,
  finalizeTournament,
  overrideDrawCompensation,
  overrideGameScore,
  recordDrawLot,
  saveGameScoring,
} from "@/lib/scoring-service";

export type CreateTournamentState = { error?: string };

export async function createTournamentAction(
  _state: CreateTournamentState,
  formData: FormData,
): Promise<CreateTournamentState> {
  try {
    const tournament = await createTournament({
      name: String(formData.get("name") ?? ""),
      nicknames: Array.from({ length: 10 }, (_, index) =>
        String(formData.get(`nickname-${index}`) ?? ""),
      ),
    });
    redirect(`/tournaments/${tournament.id}`);
  } catch (error) {
    if (error instanceof ZodError) return { error: error.issues[0]?.message ?? "Проверьте данные" };
    throw error;
  }
}

export async function regenerateSeatingAction(formData: FormData) {
  const roundId = String(formData.get("roundId"));
  const tournamentId = String(formData.get("tournamentId"));
  await regenerateSeating(roundId);
  revalidatePath(`/tournaments/${tournamentId}`);
}

export async function confirmSeatingAction(formData: FormData) {
  const roundId = String(formData.get("roundId"));
  const tournamentId = String(formData.get("tournamentId"));
  await confirmSeating(roundId);
  revalidatePath(`/tournaments/${tournamentId}`);
}

const integer = z.coerce.number().int();

export async function gameCommandAction(formData: FormData) {
  const gameId = z.string().uuid().parse(formData.get("gameId"));
  const intent = z.string().min(1).parse(formData.get("intent"));
  let command: GameCommand;

  try {
    switch (intent) {
      case "ASSIGN_ROLE":
        command = { type: intent, seatNumber: integer.parse(formData.get("seatNumber")), role: z.enum(ROLES).parse(formData.get("role")) };
        break;
      case "START_GAME":
      case "ADVANCE_FIRST_NIGHT":
      case "COMPLETE_SPEECH":
      case "UNDO_FOUL":
      case "UNDO_NOMINATION":
      case "UNDO_VOTE":
      case "COMPLETE_CRASH_SPEECH":
      case "SKIP_BLACK_TRIPLE":
      case "UNDO_NIGHT_ACTION":
      case "COMPLETE_FINAL_SPEECH":
      case "COMPLETE_PROTOCOL":
      case "CONTINUE_MANUALLY":
      case "UNDO_PENALTY":
        command = { type: intent };
        break;
      case "ADD_FOUL":
        command = { type: intent, seatNumber: integer.parse(formData.get("seatNumber")) };
        break;
      case "ADD_NOMINATION":
        command = { type: intent, nomineeSeat: integer.parse(formData.get("nomineeSeat")) };
        break;
      case "RECORD_VOTE":
        command = {
          type: intent,
          votes: formData.getAll("votes").map((value) => String(value).trim() === "" ? null : integer.parse(value)),
        };
        break;
      case "RECORD_GROUP_EXIT":
        command = { type: intent, votesFor: integer.parse(formData.get("votesFor")) };
        break;
      case "NIGHT_SHOT": {
        const target = String(formData.get("targetSeat") ?? "");
        command = { type: intent, targetSeat: target === "" ? null : integer.parse(target) };
        break;
      }
      case "DON_CHECK":
      case "SHERIFF_CHECK":
        command = { type: intent, targetSeat: integer.parse(formData.get("targetSeat")) };
        break;
      case "BLACK_TRIPLE":
        command = { type: intent, selectedSeats: formData.getAll("selectedSeats").map((value) => integer.parse(value)) };
        break;
      case "CONFIRM_WINNER": {
        const value = String(formData.get("winner") ?? "");
        command = { type: intent, winner: value ? z.enum(["RED", "BLACK", "DRAW"]).parse(value) : undefined };
        break;
      }
      case "ADD_PENALTY":
        command = {
          type: intent,
          seatNumber: integer.parse(formData.get("seatNumber")),
          value: z.coerce.number().parse(formData.get("value")),
          comment: String(formData.get("comment") ?? "").trim() || undefined,
        };
        break;
      case "MANUAL_OVERRIDE":
        command = {
          type: intent,
          kind: z.enum(["FOUL", "ROLE", "STATUS", "PHASE", "WINNER", "CANCEL_VOTE", "PENALTY"]).parse(formData.get("kind")),
          reason: z.string().trim().min(1).parse(formData.get("reason")),
          seatNumber: String(formData.get("seatNumber") ?? "") ? integer.parse(formData.get("seatNumber")) : undefined,
          value: String(formData.get("value") ?? "") || undefined,
          extra: String(formData.get("extra") ?? "") || undefined,
        };
        break;
      default:
        throw new Error("Неизвестное игровое действие");
    }

    await performGameAction(gameId, command);
  } catch (error) {
    const message = error instanceof ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Не удалось сохранить действие";
    redirect(`/games/${gameId}?error=${encodeURIComponent(message ?? "Ошибка")}`);
  }

  revalidatePath(`/games/${gameId}`);
}

function scoringInputs(formData: FormData) {
  const seatIds = formData.getAll("gameSeatId").map(String);
  const values = formData.getAll("judgeAdditionalPoints").map(String);
  if (seatIds.length !== values.length) throw new Error("Некорректная форма scoring");
  return seatIds.map((gameSeatId, index) => ({ gameSeatId, judgeAdditionalPoints: values[index] }));
}

export async function gameScoringAction(formData: FormData) {
  const gameId = z.string().uuid().parse(formData.get("gameId"));
  const intent = z.enum(["SAVE", "CLOSE"]).parse(formData.get("intent"));
  try {
    const inputs = scoringInputs(formData);
    const approved = formData.get("headJudgeApproved") === "on";
    if (intent === "CLOSE") await closeGameScoring(gameId, inputs, approved);
    else await saveGameScoring(gameId, inputs, approved);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось сохранить scoring";
    redirect(`/games/${gameId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/games/${gameId}`);
}

export async function scoreOverrideAction(formData: FormData) {
  const gameId = z.string().uuid().parse(formData.get("gameId"));
  try {
    await overrideGameScore({
      gameId,
      gameSeatId: z.string().uuid().parse(formData.get("gameSeatId")),
      judgeAdditionalPoints: z.string().trim().min(1).parse(formData.get("judgeAdditionalPoints")),
      penaltyValue: String(formData.get("penaltyValue") ?? "").trim() || undefined,
      manualCompensationPoints: String(formData.get("manualCompensationPoints") ?? "").trim() || undefined,
      reason: z.string().trim().min(1).parse(formData.get("reason")),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось изменить scoring";
    redirect(`/games/${gameId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/games/${gameId}`);
}

export async function finalizeTournamentAction(formData: FormData) {
  const tournamentId = z.string().uuid().parse(formData.get("tournamentId"));
  try {
    await finalizeTournament(tournamentId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось рассчитать итог";
    redirect(`/tournaments/${tournamentId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/tournaments/${tournamentId}`);
}

export async function compensationOverrideAction(formData: FormData) {
  const tournamentId = z.string().uuid().parse(formData.get("tournamentId"));
  try {
    await overrideDrawCompensation({
      tournamentId,
      gameSeatId: z.string().uuid().parse(formData.get("gameSeatId")),
      value: z.string().trim().min(1).parse(formData.get("value")),
      reason: z.string().trim().min(1).parse(formData.get("reason")),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось сохранить КБ";
    redirect(`/tournaments/${tournamentId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/tournaments/${tournamentId}`);
}

export async function drawLotAction(formData: FormData) {
  const tournamentId = z.string().uuid().parse(formData.get("tournamentId"));
  try {
    await recordDrawLot({
      tournamentId,
      orderedPlayerIds: formData.getAll("orderedPlayerIds").map(String),
      reason: z.string().trim().min(1).parse(formData.get("reason")),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось записать жребий";
    redirect(`/tournaments/${tournamentId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/tournaments/${tournamentId}`);
}
