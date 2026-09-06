import type { OddsProvider, NormalizedEvent, NormalizedOutcome } from "./types";

// -----------------------------------------------------------------------
// Provider para https://odds-api.io
// Documentação: https://docs.odds-api.io/
//
// Por que este provider existe além do the-odds-api.ts: a Odds-API.io tem
// uma seção dedicada a operadores da América Latina/Brasil (~17 casas),
// o que dá bem mais chance de cobrir KTO, Betnacional, Novibet etc. do que
// a The Odds API (focada em EU/UK/US).
//
// TRADE-OFF IMPORTANTE: a Odds-API.io funciona em 2 chamadas por lote de
// eventos (1x /v3/events para listar, depois 1x /v3/odds POR EVENTO) —
// diferente da The Odds API, que devolve tudo de um esporte numa chamada
// só. Isso consome a cota do plano free (100 req/hora) bem mais rápido.
// Por isso, MAX_EVENTS_PER_FETCH limita quantos eventos são detalhados
// por chamada a fetchEvents — ajuste com cuidado.
//
// Formato de resposta de GET /v3/odds?eventId=...&bookmakers=...:
// {
//   id, home, away, date,
//   sport: { name, slug }, league: { name, slug },
//   bookmakers: {
//     "Bet365": [{ name: "Moneyline", odds: [{ home, draw, away }] }, ...],
//     "Novibet": [...]
//   }
// }
// -----------------------------------------------------------------------

const BASE_URL = "https://api.odds-api.io/v3";
const MAX_EVENTS_PER_FETCH = 8; // proteção contra estourar a cota do free tier

// Nomes exatamente como a Odds-API.io espera no parâmetro `bookmakers`.
// Ajuste se, ao testar, algum nome vier diferente na resposta.
const BR_BOOKMAKERS = ["Bet365", "Betano", "KTO", "Pinnacle", "Betfair", "Sportingbet", "Novibet", "Betnacional"];

interface RawMoneylineOdds { home: string; draw?: string; away: string; }
interface RawMarket { name: string; odds: RawMoneylineOdds[]; updatedAt?: string; }
interface RawEvent {
  id: number;
  home: string;
  away: string;
  date: string;
  sport: { name: string; slug: string };
  league: { name: string; slug: string };
  bookmakers?: Record<string, RawMarket[]>;
}

const SPORT_LABELS: Record<string, string> = {
  football: "Futebol",
  basketball: "Basquete",
  tennis: "Tênis",
  mma: "MMA",
  volleyball: "Vôlei",
};

function isMoneylineMarket(name: string): boolean {
  const n = name.toLowerCase();
  return n === "ml" || n.includes("moneyline") || n.includes("1x2") || n.includes("match winner");
}

function normalizeEvent(raw: RawEvent): NormalizedEvent | null {
  if (!raw.bookmakers) return null;

  const outcomeOdds: Record<string, Record<string, number>> = {
    [raw.home]: {},
  };
  const hasDraw = Object.values(raw.bookmakers).some((markets) =>
    markets.some((m) => isMoneylineMarket(m.name) && m.odds[0]?.draw !== undefined)
  );
  if (hasDraw) outcomeOdds["Empate"] = {};
  outcomeOdds[raw.away] = {};

  for (const [houseName, markets] of Object.entries(raw.bookmakers)) {
    const ml = markets.find((m) => isMoneylineMarket(m.name));
    if (!ml || !ml.odds[0]) continue;

    const { home, draw, away } = ml.odds[0];
    if (home) outcomeOdds[raw.home][houseName] = parseFloat(home);
    if (draw && outcomeOdds["Empate"]) outcomeOdds["Empate"][houseName] = parseFloat(draw);
    if (away) outcomeOdds[raw.away][houseName] = parseFloat(away);
  }

  const outcomes: NormalizedOutcome[] = Object.entries(outcomeOdds)
    .filter(([, odds]) => Object.keys(odds).length > 0)
    .map(([label, odds]) => ({ label, odds }));

  if (outcomes.length < 2) return null; // sem odds suficientes das casas permitidas

  return {
    id: String(raw.id),
    sport: SPORT_LABELS[raw.sport.slug] ?? raw.sport.name,
    league: raw.league.name,
    country: "—",
    home: raw.home,
    away: raw.away,
    market: "Resultado Final",
    updatedAt: Date.now(),
    outcomes,
  };
}

export class OddsApiIoProvider implements OddsProvider {
  name = "odds-api-io";
  private apiKey: string;

  constructor(opts: { apiKey: string }) {
    this.apiKey = opts.apiKey;
  }

  // sportKey aqui é o "slug" da Odds-API.io, ex.: "football", "basketball".
  // Para filtrar por liga, use fetchEventsForLeague abaixo em vez desta.
  async fetchEvents(sportKey: string): Promise<NormalizedEvent[]> {
    const eventsUrl = `${BASE_URL}/events?apiKey=${this.apiKey}&sport=${sportKey}`;
    const eventsRes = await fetch(eventsUrl, { next: { revalidate: 0 } });
    if (!eventsRes.ok) {
      throw new Error(`Odds-API.io /events respondeu ${eventsRes.status}: ${await eventsRes.text().catch(() => "")}`);
    }
    const events: Array<{ id: number }> = await eventsRes.json();
    const toFetch = events.slice(0, MAX_EVENTS_PER_FETCH);

    const bookmakersParam = BR_BOOKMAKERS.join(",");
    const results = await Promise.allSettled(
      toFetch.map((ev) =>
        fetch(`${BASE_URL}/odds?apiKey=${this.apiKey}&eventId=${ev.id}&bookmakers=${bookmakersParam}`, {
          next: { revalidate: 0 },
        }).then((r) => {
          if (!r.ok) throw new Error(`/odds (evento ${ev.id}) respondeu ${r.status}`);
          return r.json();
        })
      )
    );

    const rawEvents = results
      .filter((r): r is PromiseFulfilledResult<RawEvent> => r.status === "fulfilled")
      .map((r) => r.value);

    return rawEvents.map(normalizeEvent).filter((ev): ev is NormalizedEvent => ev !== null);
  }
}
