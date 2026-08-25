import { nextDayFirstSpeaker, speechOrder } from "./game-rules";

export type GamePhase =
  | "SETUP"
  | "ROLE_ASSIGNMENT"
  | "NIGHT"
  | "DAY"
  | "VOTING"
  | "CAR_CRASH"
  | "FINAL_SPEECH"
  | "PROTOCOL"
  | "RESULT_CONFIRMATION"
  | "SCORING";

export type GameSubphase =
  | "SETUP"
  | "ROLE_ASSIGNMENT"
  | "AGREEMENT"
  | "FREE_SEATING"
  | "SPEECH"
  | "PRIMARY"
  | "CRASH_SPEECH"
  | "REVOTE"
  | "GROUP_EXIT"
  | "SHOOTING"
  | "DON_CHECK"
  | "SHERIFF_CHECK"
  | "BLACK_TRIPLE"
  | "FINAL_SPEECH"
  | "PROTOCOL"
  | "RESULT_CONFIRMATION"
  | "SCORING";

export function firstNightTransition(subphase: GameSubphase) {
  if (subphase === "AGREEMENT") return { phase: "NIGHT" as const, subphase: "FREE_SEATING" as const };
  if (subphase === "FREE_SEATING") {
    return {
      phase: "DAY" as const,
      subphase: "SPEECH" as const,
      dayNumber: 1,
      firstSpeakerSeat: 1,
      currentSpeakerSeat: 1,
    };
  }
  throw new Error("Недопустимый переход первой ночи");
}

export function nextSpeechSeat(activeSeats: readonly number[], firstSpeaker: number, currentSpeaker: number) {
  const order = speechOrder(activeSeats, firstSpeaker);
  const currentIndex = order.indexOf(currentSpeaker);
  if (currentIndex === -1) throw new Error("Текущий говорящий не активен");
  return order[currentIndex + 1] ?? null;
}

export function endDayTransition(dayNumber: number, nominationsCount: number) {
  if (nominationsCount === 0 || (dayNumber === 1 && nominationsCount === 1)) {
    return { phase: "NIGHT" as const, subphase: "SHOOTING" as const };
  }
  return { phase: "VOTING" as const, subphase: "PRIMARY" as const };
}

export function startNextDay(activeSeats: readonly number[], previousFirstSpeaker: number, dayNumber: number) {
  const firstSpeakerSeat = nextDayFirstSpeaker(activeSeats, previousFirstSpeaker);
  if (firstSpeakerSeat === null) throw new Error("Нет активных игроков");
  return {
    phase: "DAY" as const,
    subphase: "SPEECH" as const,
    dayNumber: dayNumber + 1,
    firstSpeakerSeat,
    currentSpeakerSeat: firstSpeakerSeat,
  };
}

export function confirmResultTransition(winner: "RED" | "BLACK" | "DRAW") {
  return {
    winner,
    pendingWinner: null,
    status: "SCORING" as const,
    phase: "SCORING" as const,
    subphase: "SCORING" as const,
    currentSpeakerSeat: null,
    pendingExitSeats: [],
  };
}
