export const ROLES = ["CIVILIAN", "SHERIFF", "MAFIA", "DON"] as const;
export type Role = (typeof ROLES)[number];
export type Team = "RED" | "BLACK";
export type Winner = Team | "DRAW";

export type RuleSeat = {
  seatNumber: number;
  role: Role | null;
  status: "ACTIVE" | "ELIMINATED";
};

export function teamForRole(role: Role): Team {
  return role === "DON" || role === "MAFIA" ? "BLACK" : "RED";
}

export function validateRoleComposition(roles: readonly (Role | null)[]) {
  const counts = Object.fromEntries(ROLES.map((role) => [role, roles.filter((item) => item === role).length]));
  return counts.CIVILIAN === 6 && counts.SHERIFF === 1 && counts.MAFIA === 2 && counts.DON === 1;
}

export function determineWinner(seats: readonly RuleSeat[]): Winner | null {
  const alive = seats.filter((seat) => seat.status === "ACTIVE");
  const aliveBlack = alive.filter((seat) => seat.role === "DON" || seat.role === "MAFIA").length;
  const aliveRed = alive.filter((seat) => seat.role === "SHERIFF" || seat.role === "CIVILIAN").length;
  if (aliveBlack === 0) return "RED";
  if (aliveBlack >= aliveRed) return "BLACK";
  return null;
}

export function speechOrder(activeSeats: readonly number[], firstSpeaker: number) {
  const sorted = [...activeSeats].sort((a, b) => a - b);
  const start = sorted.findIndex((seat) => seat >= firstSpeaker);
  if (sorted.length === 0) return [];
  const index = start === -1 ? 0 : start;
  return [...sorted.slice(index), ...sorted.slice(0, index)];
}

export function nextDayFirstSpeaker(activeSeats: readonly number[], previousFirst: number) {
  const sorted = [...activeSeats].sort((a, b) => a - b);
  return sorted.find((seat) => seat > previousFirst) ?? sorted[0] ?? null;
}

export function foulOutcome(currentFouls: number, activePlayers: number) {
  const foulCount = currentFouls + 1;
  return {
    foulCount,
    eliminated: foulCount >= 4,
    speechRestrictionSeconds: foulCount === 3 ? (activePlayers <= 4 ? 30 : 10) : null,
  };
}

export type ActiveNomination = { nominatorSeat: number; nomineeSeat: number };

export function validateNomination(
  existing: readonly ActiveNomination[],
  nominatorSeat: number,
  nomineeSeat: number,
) {
  if (existing.some((item) => item.nominatorSeat === nominatorSeat)) {
    throw new Error("Говорящий уже выставлял кандидатуру сегодня");
  }
  if (existing.some((item) => item.nomineeSeat === nomineeSeat)) {
    throw new Error("Этот игрок уже выставлен");
  }
}

export type VoteOutcome =
  | { kind: "WINNER"; seatNumber: number; totals: Record<number, number> }
  | { kind: "TIE"; seats: number[]; totals: Record<number, number> };

export function calculateVoteOutcome(
  candidateSeats: readonly number[],
  enteredVotes: readonly (number | null)[],
  activePlayers: number,
): VoteOutcome {
  if (candidateSeats.length === 0 || candidateSeats.length !== enteredVotes.length) {
    throw new Error("Некорректный набор кандидатур");
  }
  const votes = enteredVotes.map((value) => value ?? 0);
  if (votes.some((value) => !Number.isInteger(value) || value < 0)) throw new Error("Голоса должны быть целыми");
  const lastIndex = votes.length - 1;
  if (enteredVotes[lastIndex] === null) {
    votes[lastIndex] = activePlayers - votes.slice(0, -1).reduce((sum, value) => sum + value, 0);
  }
  if (votes.some((value) => value < 0) || votes.reduce((sum, value) => sum + value, 0) > activePlayers) {
    throw new Error("Сумма голосов превышает число активных игроков");
  }
  const totals = Object.fromEntries(candidateSeats.map((seat, index) => [seat, votes[index]]));
  const maxVotes = Math.max(...votes);
  const leaders = candidateSeats.filter((_, index) => votes[index] === maxVotes);
  return leaders.length === 1
    ? { kind: "WINNER", seatNumber: leaders[0], totals }
    : { kind: "TIE", seats: leaders, totals };
}

export function repeatedTieTransition(
  previousTie: readonly number[],
  nextTie: readonly number[],
  activePlayers: number,
) {
  const same = previousTie.length === nextTie.length && previousTie.every((seat) => nextTie.includes(seat));
  if (!same) return "NEXT_CAR_CRASH" as const;
  if (activePlayers === 3) return "NIGHT" as const;
  return "GROUP_EXIT" as const;
}

export function groupExitAllowed(crashSize: number, activePlayers: number) {
  if (crashSize === activePlayers) return false;
  if (activePlayers === 10 && crashSize === 5) return false;
  if (activePlayers === 8 && crashSize === 4) return false;
  if (activePlayers === 6 && crashSize === 3) return false;
  return true;
}

export function groupExitPasses(votesFor: number, activePlayers: number) {
  if (!Number.isInteger(votesFor) || votesFor < 0 || votesFor > activePlayers) {
    throw new Error("Некорректное число голосов");
  }
  return votesFor > activePlayers / 2;
}

export function donCheck(targetRole: Role) {
  return targetRole === "SHERIFF" ? "IS_SHERIFF" : "NOT_SHERIFF";
}

export function sheriffCheck(targetRole: Role) {
  return teamForRole(targetRole);
}

export function blackTriplePoints(firstKilledRole: Role, correctBlackCount: number) {
  if (firstKilledRole === "CIVILIAN") {
    if (correctBlackCount === 3) return 0.8;
    if (correctBlackCount === 2) return 0.55;
  }
  if (firstKilledRole === "SHERIFF") {
    if (correctBlackCount === 3) return 0.7;
    if (correctBlackCount === 2) return 0.45;
  }
  return 0;
}

export function isCommonDraw(quietPhaseCount: number) {
  return quietPhaseCount >= 5;
}
