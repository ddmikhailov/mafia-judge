import { DomainError } from "./errors";

export type CommandState = { status: string; phase: string; subphase: string; pendingWinner?: string | null };

type Policy = { statuses: string[]; phases?: string[]; subphases?: string[] };

const LIVE_PHASES = ["NIGHT", "DAY", "VOTING", "CAR_CRASH", "FINAL_SPEECH", "PROTOCOL"];

export const GAME_COMMAND_POLICY: Record<string, Policy> = {
  ASSIGN_ROLE: { statuses: ["PENDING"], phases: ["ROLE_ASSIGNMENT"], subphases: ["ROLE_ASSIGNMENT"] },
  START_GAME: { statuses: ["PENDING"], phases: ["ROLE_ASSIGNMENT"] },
  ADVANCE_FIRST_NIGHT: { statuses: ["IN_PROGRESS"], phases: ["NIGHT"], subphases: ["AGREEMENT", "FREE_SEATING"] },
  COMPLETE_SPEECH: { statuses: ["IN_PROGRESS"], phases: ["DAY"], subphases: ["SPEECH"] },
  ADD_FOUL: { statuses: ["IN_PROGRESS"], phases: LIVE_PHASES },
  UNDO_FOUL: { statuses: ["IN_PROGRESS"], phases: LIVE_PHASES },
  ADD_NOMINATION: { statuses: ["IN_PROGRESS"], phases: ["DAY"], subphases: ["SPEECH"] },
  UNDO_NOMINATION: { statuses: ["IN_PROGRESS"], phases: ["DAY"], subphases: ["SPEECH"] },
  RECORD_VOTE: { statuses: ["IN_PROGRESS"], phases: ["VOTING"], subphases: ["PRIMARY", "REVOTE"] },
  UNDO_VOTE: { statuses: ["IN_PROGRESS"], phases: ["CAR_CRASH", "FINAL_SPEECH"] },
  COMPLETE_CRASH_SPEECH: { statuses: ["IN_PROGRESS"], phases: ["CAR_CRASH"], subphases: ["CRASH_SPEECH"] },
  RECORD_GROUP_EXIT: { statuses: ["IN_PROGRESS"], phases: ["VOTING"], subphases: ["GROUP_EXIT"] },
  NIGHT_SHOT: { statuses: ["IN_PROGRESS"], phases: ["NIGHT"], subphases: ["SHOOTING"] },
  DON_CHECK: { statuses: ["IN_PROGRESS"], phases: ["NIGHT"], subphases: ["DON_CHECK"] },
  SHERIFF_CHECK: { statuses: ["IN_PROGRESS"], phases: ["NIGHT"], subphases: ["SHERIFF_CHECK"] },
  BLACK_TRIPLE: { statuses: ["IN_PROGRESS"], phases: ["NIGHT"], subphases: ["BLACK_TRIPLE"] },
  SKIP_BLACK_TRIPLE: { statuses: ["IN_PROGRESS"], phases: ["NIGHT"], subphases: ["BLACK_TRIPLE"] },
  UNDO_NIGHT_ACTION: { statuses: ["IN_PROGRESS"], phases: ["NIGHT"] },
  COMPLETE_FINAL_SPEECH: { statuses: ["IN_PROGRESS"], phases: ["FINAL_SPEECH"] },
  COMPLETE_PROTOCOL: { statuses: ["IN_PROGRESS"], phases: ["PROTOCOL"] },
  CONFIRM_WINNER: { statuses: ["IN_PROGRESS"], phases: ["RESULT_CONFIRMATION"], subphases: ["RESULT_CONFIRMATION"] },
  CONTINUE_MANUALLY: { statuses: ["IN_PROGRESS"], phases: ["RESULT_CONFIRMATION"], subphases: ["RESULT_CONFIRMATION"] },
  ADD_PENALTY: { statuses: ["IN_PROGRESS", "SCORING"], phases: [...LIVE_PHASES, "RESULT_CONFIRMATION", "SCORING"] },
  UNDO_PENALTY: { statuses: ["IN_PROGRESS", "SCORING"], phases: [...LIVE_PHASES, "RESULT_CONFIRMATION", "SCORING"] },
  MANUAL_OVERRIDE: { statuses: ["PENDING", "IN_PROGRESS", "SCORING", "COMPLETED"] },
};

export function assertCommandAllowed(state: CommandState, commandType: string) {
  const policy = GAME_COMMAND_POLICY[commandType];
  if (!policy || !policy.statuses.includes(state.status) || (policy.phases && !policy.phases.includes(state.phase)) || (policy.subphases && !policy.subphases.includes(state.subphase))) {
    throw new DomainError("Действие недоступно в текущем состоянии игры", "COMMAND_NOT_ALLOWED", 409);
  }
  if (commandType === "CONTINUE_MANUALLY" && !state.pendingWinner) throw new DomainError("Нет предложенного результата для продолжения", "COMMAND_NOT_ALLOWED", 409);
}

export const HIGH_RISK_IDEMPOTENT_COMMANDS = new Set(["ADD_FOUL", "ADD_PENALTY", "MANUAL_OVERRIDE"]);

export function assertPendingWinnerConfirmation(state: CommandState, winner?: string) {
  if (state.pendingWinner && winner && winner !== state.pendingWinner) {
    throw new DomainError("Обычное подтверждение должно совпадать с предложенным результатом", "WINNER_MISMATCH", 409);
  }
}
