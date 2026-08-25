"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import {
  confirmSeating,
  createTournament,
  regenerateSeating,
} from "@/lib/tournament-service";

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
