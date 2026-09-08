"use client";

import { useState } from "react";

export function BlackTriplePicker({ seatNumbers }: { seatNumbers: number[] }) {
  const [selected, setSelected] = useState<number[]>([]);

  const toggleSeat = (seatNumber: number) => {
    setSelected((current) => {
      if (current.includes(seatNumber)) return current.filter((seat) => seat !== seatNumber);
      if (current.length === 3) return current;
      return [...current, seatNumber];
    });
  };

  return <>
    <p className="muted">Выберите три места в названном порядке.</p>
    <div className="triple-grid" role="group" aria-label="Тройка чёрных">
      {seatNumbers.map((seatNumber) => {
        const order = selected.indexOf(seatNumber);
        return <button
          className="triple-seat"
          type="button"
          aria-pressed={order !== -1}
          disabled={selected.length === 3 && order === -1}
          onClick={() => toggleSeat(seatNumber)}
          key={seatNumber}
        >
          <span>{seatNumber}</span>
          {order !== -1 ? <small>{order + 1}</small> : null}
        </button>;
      })}
    </div>
    {selected.map((seatNumber) => <input type="hidden" name="selectedSeats" value={seatNumber} key={seatNumber} />)}
    <button className="button" type="submit" disabled={selected.length !== 3}>Подтвердить ТЧ</button>
  </>;
}
