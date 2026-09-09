"use client";

import { useCallback, useRef, useState } from "react";
import type { NormalizedEvent } from "./providers/types";

interface UseLiveOddsResult {
  events: NormalizedEvent[];
  loading: boolean;
  error: string | null;
  lastFetchedAt: number | null;
  search: () => void;
}

// NÃO busca nada sozinho — nem ao carregar a página, nem em intervalo.
// Só busca quando você chama search() (ex.: um clique de botão). Chamar de
// novo refaz a busca do zero. Isso te dá controle total de quando gastar
// a cota da API.
export function useLiveOdds(): UseLiveOddsResult {
  const [events, setEvents] = useState<NormalizedEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  const isMounted = useRef(true);

  const search = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/odds");
      const data = await res.json();
      if (!isMounted.current) return;

      if (!res.ok) {
        setError(data.error ?? "Falha ao buscar odds");
        return;
      }
      setEvents(data.events);
      setLastFetchedAt(data.fetchedAt);
    } catch (err) {
      if (isMounted.current) setError(String(err));
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, []);

  return { events, loading, error, lastFetchedAt, search };
}
