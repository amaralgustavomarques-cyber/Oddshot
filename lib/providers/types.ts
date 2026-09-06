// Formato interno único que TODO provider precisa devolver.
// O resto do app (cálculo de arbitragem, dashboard, tabela) só conhece este
// formato — trocar de fonte de odds nunca exige mexer em mais nada.

export interface NormalizedOutcome {
  label: string;
  odds: Record<string, number>; // { "Bet365": 2.10, "Betano": 2.18, ... }
}

export interface NormalizedEvent {
  id: string;
  sport: string;
  league: string;
  country: string;
  home: string;
  away: string;
  market: string;
  updatedAt: number; // Date.now() no momento em que os dados chegaram
  outcomes: NormalizedOutcome[];
}

export interface OddsProvider {
  name: string;
  // sportKey: chave do esporte no formato do provider (ex.: "soccer_brazil_campeonato")
  fetchEvents(sportKey: string): Promise<NormalizedEvent[]>;
}
