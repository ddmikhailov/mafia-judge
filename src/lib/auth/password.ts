import { compare, hash } from "bcryptjs";

const BCRYPT_COST = 12;

export function hashPassword(password: string) {
  if (password.length < 12 || password.length > 200) throw new Error("Пароль должен содержать от 12 до 200 символов");
  return hash(password, BCRYPT_COST);
}

export function verifyPassword(password: string, passwordHash: string) {
  return compare(password, passwordHash);
}
