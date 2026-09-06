import { NextRequest, NextResponse } from "next/server";
import { TheOddsApiProvider } from "@/lib/providers/the-odds-api";
import { OddsApiIoProvider } from "@/lib/providers/odds-api-io";
import { OddsPapiProvider } from "@/lib/providers/oddspapi";

// Esportes/torneios por provider — cada um usa o formato de chave da própria API.
const THE_ODDS_API_SPORTS = ["soccer_brazil_campeonato", "soccer_epl", "basketball_nba"];
const ODDS_API_IO_SPORTS = ["football", "basketball"];
const ODDSPAPI_TOURNAMENTS = ["325"]; // 325 = Brasileirão Série A (confirmado via teste real)

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
  const results = await Promise.allSettled(sportKeys.map((key) => provider.fetchEvents(key)));
  const events = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const errors = results
    .map((r, i) => (r.status === "rejected" ? { sport: sportKeys[i], error: String(r.reason) } : null))
    .filter(Boolean);

  return NextResponse.json({ events, errors, fetchedAt: Date.now() });
}
