"use client";

import { useCallback, useRef, useState } from "react";
import type { NormalizedEvent } from "./providers/types";

interface UseLiveOddsResult {
  events: NormalizedEvent[];
  loading: boolean;
  error: string | null;
  lastFetchedAt: number | null;
  progress: string | null; // ex.: "Buscando 2 de 5..."
  search: () => void;
}

// Mesma lista de torneios configurada em app/api/odds/route.ts
// (ODDSPAPI_TOURNAMENTS) — mantenha as duas em sincronia se adicionar ou
// remover campeonatos.
const TOURNAMENTS: { id: string; label: string }[] = [
  { id: "325", label: "Brasileirão Série A" },
  { id: "390", label: "Brasileirão Série B" },
  { id: "17", label: "Premier League" },
  { id: "679", label: "UEFA Europa League" },
  { id: "384", label: "Copa Libertadores" },
];

const GAP_BETWEEN_CALLS_MS = 2500; // evita bater no rate limit da OddsPapi entre uma chamada e outra

// NÃO busca nada sozinho — nem ao carregar a página, nem em intervalo.
// Só busca quando você chama search() (ex.: um clique de botão). Busca
// campeonato por campeonato (uma chamada separada pra cada um), então cada
// chamada individual é rápida e cabe folgado no limite de execução da Vercel.
export function useLiveOdds(): UseLiveOddsResult {
  const [events, setEvents] = useState<NormalizedEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const isMounted = useRef(true);

  const search = useCallback(async () => {
    setLoading(true);
    setError(null);
    setEvents([]);
    const collected: NormalizedEvent[] = [];
    const failures: string[] = [];

    for (let i = 0; i < TOURNAMENTS.length; i++) {
      const tournament = TOURNAMENTS[i];
      if (!isMounted.current) return;
      setProgress(`Buscando ${tournament.label} (${i + 1} de ${TOURNAMENTS.length})...`);

      try {
        const res = await fetch(`/api/odds?provider=oddspapi&sport=${tournament.id}`);
        const data = await res.json();
        if (!isMounted.current) return;

        if (!res.ok) {
          failures.push(`${tournament.label}: ${data.error ?? "erro desconhecido"}`);
        } else {
          collected.push(...data.events);
          setEvents([...collected]); // mostra os resultados conforme vão chegando
        }
      } catch (err) {
        failures.push(`${tournament.label}: ${String(err)}`);
      }

      if (i < TOURNAMENTS.length - 1) await sleep(GAP_BETWEEN_CALLS_MS);
    }

    if (!isMounted.current) return;
    setProgress(null);
    setLastFetchedAt(Date.now());
    if (failures.length > 0 && collected.length === 0) {
      setError(failures.join(" | "));
    } else {
      setError(null);
    }
    setLoading(false);
  }, []);

  return { events, loading, error, lastFetchedAt, progress, search };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
