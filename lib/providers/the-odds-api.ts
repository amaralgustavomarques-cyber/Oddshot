import type { OddsProvider, NormalizedEvent, NormalizedOutcome } from "./types";

// -----------------------------------------------------------------------
// Provider para https://the-odds-api.com (v4)
// Documentação: https://the-odds-api.com/liveapi/guides/v4/
//
// Formato bruto de resposta (resumido) de GET /v4/sports/{sport}/odds:
// [{
//   id, sport_key, sport_title, commence_time, home_team, away_team,
//   bookmakers: [{
//     key, title, last_update,
//     markets: [{ key: "h2h", outcomes: [{ name, price }] }]
//   }]
// }]
// -----------------------------------------------------------------------

// -----------------------------------------------------------------------
// Filtro de casas autorizadas no Brasil (SPA/MF — Lei 14.790/2023).
// Qualquer casa que NÃO esteja nesta lista é descartada antes mesmo de
// entrar no cálculo de arbitragem — assim nunca aparece uma odd de uma
// casa que você não pode de fato usar sendo brasileiro.
//
// Atualize esta lista se você conferir novas casas autorizadas em:
// https://www.gov.br/fazenda (Secretaria de Prêmios e Apostas)
//
// IMPORTANTE: a The Odds API cobre majoritariamente casas
// internacionais (regions=eu,uk,us). Ela pode não ter dados de casas
// 100% brasileiras (KTO, Betnacional, Novibet) — para essas, cadastre
// manualmente na aba "Gerenciar odds" do dashboard.
const ALLOWED_HOUSES = [
  "bet365",
  "betano",
  "kto",
  "pinnacle",
  "betfair",
  "sportingbet",
  "novibet",
  // Betnacional removida da busca automática: a fonte de dados estava
  // trazendo odds erradas/desatualizadas para essa casa. Cadastre-a
  // manualmente na aba "Gerenciar odds" quando quiser incluí-la.
];

// A Betfair Exchange (mercado de apostas mútuas entre usuários) é um
// produto diferente do Betfair de odds fixas — nem sempre bate com o que
// você realmente consegue no site/app brasileiro, então excluímos essa
// variante mesmo com "betfair" passando no filtro de casas permitidas.
const EXCLUDED_VARIANTS = ["betfairex", "exchange"];

function isAllowedHouse(title: string): boolean {
  const normalized = title.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (EXCLUDED_VARIANTS.some((ex) => normalized.includes(ex))) return false;
  return ALLOWED_HOUSES.some((allowed) => normalized.includes(allowed));
}

const BASE_URL = "https://api.the-odds-api.com/v4";

// Mapeia o prefixo do sport_key da API para um rótulo em pt-BR.
// Adicione novas linhas conforme for habilitando mais esportes.
const SPORT_LABELS: Record<string, string> = {
  soccer: "Futebol",
  basketball: "Basquete",
  tennis: "Tênis",
  mma: "MMA",
  volleyball: "Vôlei",
  americanfootball: "Futebol Americano",
  icehockey: "Hóquei no Gelo",
  baseball: "Beisebol",
};

function labelForSportKey(sportKey: string): string {
  const prefix = sportKey.split("_")[0];
  return SPORT_LABELS[prefix] ?? sportKey;
}

function labelForMarketKey(marketKey: string): string {
  const known: Record<string, string> = {
    h2h: "Resultado Final",
    spreads: "Handicap",
    totals: "Total de Pontos/Gols",
  };
  return known[marketKey] ?? marketKey;
}

interface RawOutcome { name: string; price: number; }
interface RawMarket { key: string; outcomes: RawOutcome[]; }
interface RawBookmaker { key: string; title: string; last_update: string; markets: RawMarket[]; }
interface RawEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: RawBookmaker[];
}

function normalizeEvent(raw: RawEvent, marketKey: string): NormalizedEvent | null {
  // Junta, para cada nome de resultado (ex.: nome do time), a odd de cada casa
  // que oferece o mercado pedido (ex.: "h2h").
  const outcomeMap = new Map<string, Record<string, number>>();
  let mostRecentUpdate = 0;

  for (const bookmaker of raw.bookmakers) {
    if (!isAllowedHouse(bookmaker.title)) continue; // ignora casa não autorizada pela SPA/MF

    const market = bookmaker.markets.find((m) => m.key === marketKey);
    if (!market) continue;

    const updatedAt = Date.parse(bookmaker.last_update);
    if (!Number.isNaN(updatedAt)) mostRecentUpdate = Math.max(mostRecentUpdate, updatedAt);

    for (const outcome of market.outcomes) {
      if (!outcomeMap.has(outcome.name)) outcomeMap.set(outcome.name, {});
      outcomeMap.get(outcome.name)![bookmaker.title] = outcome.price;
    }
  }

  if (outcomeMap.size === 0) return null; // nenhuma casa cobre esse mercado ainda

  const outcomes: NormalizedOutcome[] = Array.from(outcomeMap.entries()).map(([label, odds]) => ({ label, odds }));

  return {
    id: raw.id,
    sport: labelForSportKey(raw.sport_key),
    league: raw.sport_title,
    country: "—", // a API não devolve país diretamente; ajuste se mapear por liga
    home: raw.home_team,
    away: raw.away_team,
    market: labelForMarketKey(marketKey),
    updatedAt: mostRecentUpdate || Date.now(),
    outcomes,
  };
}

export class TheOddsApiProvider implements OddsProvider {
  name = "the-odds-api";
  private apiKey: string;
  private regions: string;
  private marketKey: string;

  constructor(opts: { apiKey: string; regions?: string; marketKey?: string }) {
    this.apiKey = opts.apiKey;
    this.regions = opts.regions ?? "eu,uk,us"; // regiões cobrem casas diferentes — ajuste ao seu caso
    this.marketKey = opts.marketKey ?? "h2h";
  }

  // sportKey no formato da própria API, ex.: "soccer_brazil_campeonato", "basketball_nba"
  // Lista completa: GET /v4/sports?apiKey=...
  async fetchEvents(sportKey: string): Promise<NormalizedEvent[]> {
    const url = `${BASE_URL}/sports/${sportKey}/odds?regions=${this.regions}&markets=${this.marketKey}&oddsFormat=decimal&apiKey=${this.apiKey}`;
    const res = await fetch(url, { next: { revalidate: 0 } });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`The Odds API respondeu ${res.status}: ${body}`);
    }

    const raw: RawEvent[] = await res.json();
    return raw
      .map((ev) => normalizeEvent(ev, this.marketKey))
      .filter((ev): ev is NormalizedEvent => ev !== null);
  }
}
