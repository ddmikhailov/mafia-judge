"use client";

import { useActionState } from "react";
import { createTournamentAction, type CreateTournamentState } from "@/app/actions";

const initialState: CreateTournamentState = {};

export function CreateTournamentForm() {
  const [state, action, pending] = useActionState(createTournamentAction, initialState);

  return (
    <form action={action} className="card">
      <div className="field">
        <label htmlFor="name">Название миникапа</label>
        <input id="name" name="name" placeholder="Например, Кубок клуба" required />
      </div>
      <div className="players-grid">
        {Array.from({ length: 10 }, (_, index) => (
          <div className="field" key={index}>
            <label htmlFor={`nickname-${index}`}>Игрок {index + 1}</label>
            <input
              id={`nickname-${index}`}
              name={`nickname-${index}`}
              placeholder="Ник"
              required
              autoComplete="off"
            />
          </div>
        ))}
      </div>
      {state.error ? <p className="error" role="alert">{state.error}</p> : null}
      <button className="button" disabled={pending} type="submit">
        {pending ? "Создаём…" : "Создать миникап"}
      </button>
    </form>
  );
}
