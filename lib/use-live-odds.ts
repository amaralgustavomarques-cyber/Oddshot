"use client";

import { useEffect, useRef, useState } from "react";
import type { NormalizedEvent } from "./providers/types";

interface UseLiveOddsResult {
  events: NormalizedEvent[];
  loading: boolean;
  error: string | null;
  lastFetchedAt: number | null;
}

// Busca /api/odds a cada `intervalMs` (padrão 30s) e devolve os eventos mais
// recentes. Isso é o "polling" — troque por WebSocket no futuro sem mexer
// no resto do dashboard, já que ambos devolvem o mesmo NormalizedEvent[].
export function useLiveOdds(intervalMs = 30000): UseLiveOddsResult {
  const [events, setEvents] = useState<NormalizedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;

    async function load() {
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
        setError(null);
      } catch (err) {
        if (isMounted.current) setError(String(err));
      } finally {
        if (isMounted.current) setLoading(false);
      }
    }

    load();
    const id = setInterval(load, intervalMs);
    return () => {
      isMounted.current = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  return { events, loading, error, lastFetchedAt };
}
