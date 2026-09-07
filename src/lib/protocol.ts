import { z } from "zod";
import { DomainError } from "./errors";
import { boundedComment } from "./input-limits";

export const PROTOCOL_MARKS = ["RED", "BLACK", "DON", "SHERIFF"] as const;
export type ProtocolMark = (typeof PROTOCOL_MARKS)[number];

const protocolRecordSchema = z.object({
  marks: z.array(z.object({
    seatNumber: z.number().int().min(1).max(10),
    mark: z.enum(PROTOCOL_MARKS),
  })).max(10),
  note: boundedComment.optional().default(""),
});

export function validateProtocolRecord(
  input: { marks: Array<{ seatNumber: number; mark: ProtocolMark }>; note?: string },
  validSeatNumbers: readonly number[],
) {
  const parsed = protocolRecordSchema.parse(input);
  const markedSeats = new Set(parsed.marks.map(({ seatNumber }) => seatNumber));
  const validSeats = new Set(validSeatNumbers);
  if (markedSeats.size !== parsed.marks.length || parsed.marks.some(({ seatNumber }) => !validSeats.has(seatNumber))) {
    throw new DomainError("В протоколе указано неизвестное или повторяющееся место", "INVALID_PROTOCOL");
  }
  return { marks: parsed.marks, note: parsed.note || undefined };
}
