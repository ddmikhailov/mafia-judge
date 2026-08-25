"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { createJudgeUser, resetUserPassword, setTournamentArchived, setTournamentJudge, setUserActive } from "@/lib/platform-service";
import { publicError } from "@/lib/errors";
import { boundedReason } from "@/lib/input-limits";

const uuid = z.string().uuid();
function fail(path: string, error: unknown): never { redirect(`${path}?error=${encodeURIComponent(publicError(error).message)}`); }

export async function assignmentAction(formData: FormData) {
  const tournamentId = uuid.parse(formData.get("tournamentId"));
  try { await setTournamentJudge(await requireUser(), tournamentId, uuid.parse(formData.get("userId")), formData.get("assigned") === "true"); }
  catch (error) { fail(`/tournaments/${tournamentId}`, error); }
  revalidatePath(`/tournaments/${tournamentId}`); revalidatePath("/");
}

export async function archiveTournamentAction(formData: FormData) {
  const tournamentId = uuid.parse(formData.get("tournamentId"));
  try { await setTournamentArchived(await requireUser(), tournamentId, formData.get("archived") === "true", boundedReason.parse(formData.get("reason"))); }
  catch (error) { fail("/", error); }
  revalidatePath("/"); revalidatePath(`/tournaments/${tournamentId}`);
}

export async function createUserAction(formData: FormData) {
  try {
    await createJudgeUser(await requireUser(), {
      login: z.string().parse(formData.get("login")),
      displayName: z.string().parse(formData.get("displayName")),
      role: z.enum(["HEAD_JUDGE", "JUDGE"]).parse(formData.get("role")),
      password: z.string().parse(formData.get("password")),
    });
  }
  catch (error) { fail("/admin/users", error); }
  revalidatePath("/admin/users");
}

export async function setUserActiveAction(formData: FormData) {
  try { await setUserActive(await requireUser(), uuid.parse(formData.get("userId")), formData.get("isActive") === "true"); }
  catch (error) { fail("/admin/users", error); }
  revalidatePath("/admin/users");
}

export async function resetPasswordAction(formData: FormData) {
  try { await resetUserPassword(await requireUser(), uuid.parse(formData.get("userId")), z.string().min(12).max(200).parse(formData.get("password"))); }
  catch (error) { fail("/admin/users", error); }
  revalidatePath("/admin/users");
}
