import { NextRequest, NextResponse } from "next/server";
import { TheOddsApiProvider } from "@/lib/providers/the-odds-api";
import { OddsApiIoProvider } from "@/lib/providers/odds-api-io";
import { OddsPapiProvider } from "@/lib/providers/oddspapi";

// 60s é o máximo permitido no plano gratuito (Hobby) da Vercel — buscar
// vários campeonatos com pausas entre chamadas pode chegar perto disso.
export const maxDuration = 60;

// Esportes/torneios por provider — cada um usa o formato de chave da própria API.
const THE_ODDS_API_SPORTS = ["soccer_brazil_campeonato", "soccer_epl", "basketball_nba"];
const ODDS_API_IO_SPORTS = ["football", "basketball"];
const ODDSPAPI_TOURNAMENTS = [
  "325", // Brasileirão Série A
  "390", // Brasileirão Série B
  "17",  // Premier League (Inglaterra)
  "679", // UEFA Europa League
  "384", // Copa Libertadores
];

// GET /api/odds                          -> usa o provider padrão (oddspapi, já confirmado trazendo o Brasileirão de verdade)
// GET /api/odds?provider=the-odds-api    -> alterna pra The Odds API (precisa de ODDS_API_KEY)
// GET /api/odds?provider=odds-api-io     -> alterna pra Odds-API.io
// GET /api/odds?sport=X                  -> busca só um esporte/torneio específico
export async function GET(req: NextRequest) {
  const providerName = req.nextUrl.searchParams.get("provider") ?? "oddspapi";
  const sportParam = req.nextUrl.searchParams.get("sport");

  try {
    if (providerName === "odds-api-io") {
      const apiKey = process.env.ODDS_API_IO_KEY;
      if (!apiKey) return missingKeyError("ODDS_API_IO_KEY");
      const provider = new OddsApiIoProvider({ apiKey });
      const sportKeys = sportParam ? [sportParam] : ODDS_API_IO_SPORTS;
      return await runProvider(provider, sportKeys);
    }

    if (providerName === "the-odds-api") {
      const apiKey = process.env.ODDS_API_KEY;
      if (!apiKey) return missingKeyError("ODDS_API_KEY");
      const provider = new TheOddsApiProvider({ apiKey });
      const sportKeys = sportParam ? [sportParam] : THE_ODDS_API_SPORTS;
      return await runProvider(provider, sportKeys);
    }

    // padrão: oddspapi (confirmado funcionando com o Brasileirão de verdade)
    const apiKey = process.env.ODDS_PAPI_KEY;
    if (!apiKey) return missingKeyError("ODDS_PAPI_KEY");
    const provider = new OddsPapiProvider({ apiKey });
    const sportKeys = sportParam ? [sportParam] : ODDSPAPI_TOURNAMENTS;
    return await runProvider(provider, sportKeys);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}

function missingKeyError(varName: string) {
  return NextResponse.json(
    { error: `${varName} não configurada. Adicione essa variável de ambiente (no .env.local ou nas Environment Variables da Vercel).` },
    { status: 500 }
  );
}

async function runProvider(provider: { fetchEvents(key: string): Promise<any[]> }, sportKeys: string[]) {
  // Faz UMA chamada por vez, com pausa entre elas — a OddsPapi bloqueia
  // (429 RATE_LIMITED) quando várias chamadas chegam juntas no mesmo endpoint.
  const events: any[] = [];
  const errors: { sport: string; error: string }[] = [];

  for (let i = 0; i < sportKeys.length; i++) {
    try {
      const result = await provider.fetchEvents(sportKeys[i]);
      events.push(...result);
    } catch (err) {
      errors.push({ sport: sportKeys[i], error: String(err) });
    }
    if (i < sportKeys.length - 1) await sleep(2500);
  }

  return NextResponse.json({ events, errors, fetchedAt: Date.now() });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
