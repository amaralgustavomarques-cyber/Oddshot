import type { OddsProvider, NormalizedEvent, NormalizedOutcome } from "./types";

// -----------------------------------------------------------------------
// Provider para https://oddspapi.io
//
// Fluxo (confirmado testando os endpoints reais):
// 1. GET /v4/fixtures?tournamentId=X       -> lista de jogos (só IDs de time)
// 2. GET /v4/participants?sportId=X        -> dicionário {id: "Nome do time"}
//    (devolve TODOS os participantes do esporte, não só os pedidos — por
//    isso buscamos uma vez só e reaproveitamos pra todos os jogos)
// 3. GET /v4/odds?fixtureId=Y              -> odds de TODAS as casas daquele jogo
//
// Formato de /v4/fixtures (um item):
// { fixtureId, participant1Id, participant2Id, sportId, tournamentId,
//   hasOdds, startTime, ... }
//
// Formato de /v4/participants: { "<id>": "<nome>", "<id>": "<nome>", ... }
//
// Formato de /v4/odds (confirmado na doc oficial):
// { fixtureId, ...,
//   bookmakerOdds: {
//     "pinnacle": { markets: { "101": { outcomes: {
//       "101": { players: { "0": { price: 5.01 } } },  // mandante
//       "102": { players: { "0": { price: 3.40 } } },  // empate (se houver)
//       "103": { players: { "0": { price: 1.90 } } }   // visitante
//     } } } },
//     "bet365": { ... }
//   }
// }
//
// LIMITAÇÃO CONHECIDA: não confirmei os nomes exatos das chaves de bookmaker
// para KTO/Betnacional/Novibet/Sportingbet (só vi "pinnacle" e "bet365" nos
// exemplos reais). O filtro abaixo usa correspondência por substring
// (case-insensitive) para tolerar pequenas variações de grafia.
// -----------------------------------------------------------------------

const BASE_URL = "https://api.oddspapi.io/v4";
const MAIN_MARKET_ID = "101"; // 1X2 / moneyline
const MAX_FIXTURES_PER_FETCH = 15; // proteção de cota — ajuste conforme seu plano

const ALLOWED_HOUSES = ["bet365", "betano", "kto", "pinnacle", "betfair", "sportingbet", "novibet", "betnacional"];

function isAllowedHouse(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return ALLOWED_HOUSES.some((allowed) => normalized.includes(allowed));
}

// Identifica a "marca base" a partir da chave da casa, ignorando sufixos
// regionais: "bet365.bet.br" -> "bet365", "betfair-ex" -> "betfair".
function baseBrand(key: string): string {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return ALLOWED_HOUSES.find((allowed) => normalized.includes(allowed)) ?? normalized;
}

function isBrazilianVariant(key: string): boolean {
  return key.toLowerCase().includes(".bet.br") || key.toLowerCase().endsWith(".br");
}

// Para cada marca (bet365, betano, kto...), se existir uma variante ".bet.br",
// mantém só ela. Se não existir nenhuma variante brasileira, mantém a odd
// mais alta entre as variantes disponíveis (fallback razoável).
function keepBrazilianVariant(odds: Record<string, number>): Record<string, number> {
  const byBrand = new Map<string, [string, number][]>();
  for (const [key, price] of Object.entries(odds)) {
    const brand = baseBrand(key);
    if (!byBrand.has(brand)) byBrand.set(brand, []);
    byBrand.get(brand)!.push([key, price]);
  }

  const result: Record<string, number> = {};
  for (const [, entries] of byBrand) {
    const brVariant = entries.find(([key]) => isBrazilianVariant(key));
    if (brVariant) {
      result[brVariant[0]] = brVariant[1];
    } else {
      const best = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
      result[best[0]] = best[1];
    }
  }
  return result;
}


interface RawFixture {
  fixtureId: string;
  participant1Id: number;
  participant2Id: number;
  sportId: number;
  tournamentId: number;
  hasOdds: boolean;
  startTime: string;
}

interface RawOutcomePlayer { price: number; }
interface RawOutcome { players: Record<string, RawOutcomePlayer> }
interface RawMarket { outcomes: Record<string, RawOutcome> }
interface RawBookmakerOdds { markets: Record<string, RawMarket> }
interface RawOddsResponse {
  fixtureId: string;
  bookmakerOdds: Record<string, RawBookmakerOdds>;
}

type ParticipantMap = Record<string, string>;

// id do resultado dentro do market 1X2 -> a quem se refere
const OUTCOME_ROLE: Record<string, "home" | "draw" | "away"> = {
  "101": "home",
  "102": "draw",
  "103": "away",
};

export class OddsPapiProvider implements OddsProvider {
  name = "oddspapi";
  private apiKey: string;
  private participantsCache = new Map<number, ParticipantMap>();

  constructor(opts: { apiKey: string }) {
    this.apiKey = opts.apiKey;
  }

  private async getParticipants(sportId: number): Promise<ParticipantMap> {
    if (this.participantsCache.has(sportId)) return this.participantsCache.get(sportId)!;
    const res = await fetch(`${BASE_URL}/participants?apiKey=${this.apiKey}&sportId=${sportId}`, {
      next: { revalidate: 0 },
    });
    if (!res.ok) throw new Error(`/participants respondeu ${res.status}`);
    const map: ParticipantMap = await res.json();
    this.participantsCache.set(sportId, map);
    return map;
  }

  private async getOddsForFixture(fixtureId: string): Promise<RawOddsResponse | null> {
    const res = await fetch(`${BASE_URL}/odds?apiKey=${this.apiKey}&fixtureId=${fixtureId}`, {
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    return res.json();
  }

  // tournamentKey é o tournamentId da OddsPapi, como string, ex.: "325" (Brasileirão Série A)
  async fetchEvents(tournamentKey: string): Promise<NormalizedEvent[]> {
    const fixturesRes = await fetch(`${BASE_URL}/fixtures?apiKey=${this.apiKey}&tournamentId=${tournamentKey}`, {
      next: { revalidate: 0 },
    });
    if (!fixturesRes.ok) {
      throw new Error(`/fixtures respondeu ${fixturesRes.status}: ${await fixturesRes.text().catch(() => "")}`);
    }
    const fixtures: RawFixture[] = await fixturesRes.json();

    const now = Date.now();
    const upcoming = fixtures
      .filter((f) => f.hasOdds && new Date(f.startTime).getTime() > now)
      .slice(0, MAX_FIXTURES_PER_FETCH);

    if (upcoming.length === 0) return [];

    const participants = await this.getParticipants(upcoming[0].sportId);

    const oddsResults = await Promise.allSettled(upcoming.map((f) => this.getOddsForFixture(f.fixtureId)));

    const events: NormalizedEvent[] = [];
    upcoming.forEach((fixture, i) => {
      const result = oddsResults[i];
      if (result.status !== "fulfilled" || !result.value) return;
      const odds = result.value;

      const homeLabel = participants[String(fixture.participant1Id)] ?? `Time ${fixture.participant1Id}`;
      const awayLabel = participants[String(fixture.participant2Id)] ?? `Time ${fixture.participant2Id}`;
      const labelFor = { home: homeLabel, draw: "Empate", away: awayLabel };

      const outcomeOdds: Record<string, Record<string, number>> = {};

      for (const [houseKey, bookmaker] of Object.entries(odds.bookmakerOdds ?? {})) {
        if (!isAllowedHouse(houseKey)) continue;
        const market = bookmaker.markets?.[MAIN_MARKET_ID];
        if (!market) continue;

        for (const [outcomeId, outcome] of Object.entries(market.outcomes)) {
          const role = OUTCOME_ROLE[outcomeId];
          if (!role) continue;
          const price = outcome.players?.["0"]?.price;
          if (!price) continue;

          const label = labelFor[role];
          if (!outcomeOdds[label]) outcomeOdds[label] = {};
          outcomeOdds[label][houseKey] = price;
        }
      }

      // Várias marcas vêm duplicadas por região (ex.: "bet365", "bet365.de",
      // "bet365.bet.br"). Só a variante ".bet.br" é a que um apostador
      // brasileiro realmente consegue acessar — então, quando ela existe,
      // descartamos as outras variantes da mesma marca pra não recomendar
      // uma odd de uma casa que você não pode usar.
      for (const label of Object.keys(outcomeOdds)) {
        outcomeOdds[label] = keepBrazilianVariant(outcomeOdds[label]);
      }

      const outcomes: NormalizedOutcome[] = Object.entries(outcomeOdds)
        .filter(([, o]) => Object.keys(o).length > 0)
        .map(([label, o]) => ({ label, odds: o }));

      if (outcomes.length < 2) return; // nenhuma casa permitida cobre esse jogo ainda

      events.push({
        id: fixture.fixtureId,
        sport: "Futebol",
        league: `Torneio ${fixture.tournamentId}`,
        country: "—",
        home: homeLabel,
        away: awayLabel,
        market: "Resultado Final",
        updatedAt: Date.now(),
        outcomes,
      });
    });

    return events;
  }
}
