"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  RefreshCw, Settings, Moon, Sun, Wifi, ChevronDown, ChevronUp,
  TrendingUp, Clock, Building2, Target, Layers,
  CheckCircle2, XCircle, AlertTriangle, SlidersHorizontal, Calculator,
  LayoutDashboard, Plus, Minus, Trophy, ClipboardEdit, Trash2, Pencil, Save, X
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useLiveOdds } from "@/lib/use-live-odds";

// ---------------------------------------------------------------------------
// Casas de apostas monitoradas (fixas — mas fácil de trocar por uma lista
// dinâmica no futuro, se você conectar uma fonte automática).
// ---------------------------------------------------------------------------

const HOUSES = ["Bet365", "Betano", "KTO", "Pinnacle", "Betfair", "Sportingbet", "Novibet", "Betnacional"];

const now = Date.now();
const minsAgo = (m) => now - m * 60 * 1000;

const SEED_EVENTS = [
  {
    id: "ev1", sport: "Futebol", league: "Brasileirão Série A", country: "Brasil",
    home: "Grêmio", away: "Internacional", market: "Resultado Final", updatedAt: minsAgo(2),
    outcomes: [
      { label: "Grêmio", odds: { "Bet365": 2.10, "Betano": 2.18, "KTO": 2.20, "Pinnacle": 2.15 } },
      { label: "Empate", odds: { "Bet365": 3.20, "Betano": 3.30, "KTO": 3.10, "Pinnacle": 3.25 } },
      { label: "Internacional", odds: { "Bet365": 1.95, "Betano": 2.00, "KTO": 1.90, "Betfair": 2.05 } },
    ],
  },
  {
    id: "ev2", sport: "Futebol", league: "Premier League", country: "Inglaterra", updatedAt: minsAgo(1),
    home: "Arsenal", away: "Chelsea", market: "Resultado Final",
    outcomes: [
      { label: "Arsenal", odds: { "Bet365": 2.20, "Betano": 2.05, "Betfair": 2.15 } },
      { label: "Empate", odds: { "Bet365": 3.60, "Betano": 3.50, "Pinnacle": 3.55 } },
      { label: "Chelsea", odds: { "Bet365": 3.10, "Betano": 3.30, "KTO": 3.40, "Betfair": 3.45 } },
    ],
  },
  {
    id: "ev3", sport: "Tênis", league: "ATP Masters 1000", country: "EUA", updatedAt: minsAgo(4),
    home: "C. Alcaraz", away: "J. Sinner", market: "Vencedor da Partida",
    outcomes: [
      { label: "C. Alcaraz", odds: { "Bet365": 1.80, "Pinnacle": 1.78, "Betano": 1.82 } },
      { label: "J. Sinner", odds: { "Bet365": 2.05, "Betfair": 2.10, "KTO": 1.98, "Pinnacle": 2.02 } },
    ],
  },
  {
    id: "ev4", sport: "Basquete", league: "NBA", country: "EUA", updatedAt: minsAgo(18),
    home: "Boston Celtics", away: "LA Lakers", market: "Vencedor (com prorrogação)",
    outcomes: [
      { label: "Boston Celtics", odds: { "Bet365": 1.65, "Betano": 1.62, "Novibet": 1.60 } },
      { label: "LA Lakers", odds: { "Bet365": 2.30, "Betano": 2.35, "Novibet": 2.40, "KTO": 2.25 } },
    ],
  },
  {
    id: "ev5", sport: "MMA", league: "UFC 310", country: "EUA", updatedAt: minsAgo(6),
    home: "A. Pereira", away: "J. Ankalaev", market: "Vencedor da Luta",
    outcomes: [
      { label: "A. Pereira", odds: { "Bet365": 1.90, "Betano": 1.95, "Sportingbet": 2.05 } },
      { label: "J. Ankalaev", odds: { "Bet365": 2.00, "Betfair": 2.10, "KTO": 1.95, "Pinnacle": 1.98 } },
    ],
  },
  {
    id: "ev6", sport: "Vôlei", league: "Superliga Masculina", country: "Brasil", updatedAt: minsAgo(27),
    home: "Sesi-SP", away: "Sada Cruzeiro", market: "Vencedor da Partida",
    outcomes: [
      { label: "Sesi-SP", odds: { "Betnacional": 2.05, "KTO": 1.98, "Betano": 2.00 } },
      { label: "Sada Cruzeiro", odds: { "Betnacional": 1.80, "KTO": 1.85, "Betano": 1.82 } },
    ],
  },
];

// ---------------------------------------------------------------------------
// Núcleo matemático — detecção e cálculo de arbitragem
// Para N resultados: soma(1/odd_i) < 1  =>  existe arbitragem
// ---------------------------------------------------------------------------

function analyzeEvent(ev, banca) {
  const outcomes = ev.outcomes.map((o) => {
    const entries = Object.entries(o.odds).filter(([, v]) => v > 0);
    if (entries.length === 0) return { label: o.label, bestOdd: 0, bestHouse: "—", allOdds: [] };
    let bestHouse = entries[0][0], bestOdd = entries[0][1];
    for (const [house, odd] of entries) {
      if (odd > bestOdd) { bestOdd = odd; bestHouse = house; }
    }
    return { label: o.label, bestOdd, bestHouse, allOdds: entries.map(([house, odd]) => ({ house, odd })) };
  });

  const impliedSum = outcomes.reduce((sum, o) => sum + (o.bestOdd > 0 ? 1 / o.bestOdd : 0), 0);
  const arbPercent = (1 - impliedSum) * 100;
  const hasArbitrage = arbPercent > 0;

  // banca aqui é o retorno garantido desejado: stake_i = banca / odd_i
  const stakes = outcomes.map((o) => (o.bestOdd > 0 ? banca / o.bestOdd : 0));
  const totalInvestido = stakes.reduce((a, b) => a + b, 0);
  const retornoGarantido = banca;
  const lucro = retornoGarantido - totalInvestido;
  const roi = totalInvestido > 0 ? (lucro / totalInvestido) * 100 : 0;

  const minutesAgo = Math.max(0, Math.floor((Date.now() - ev.updatedAt) / 60000));
  const isStale = minutesAgo > 15;

  return { outcomes, impliedSum, arbPercent, hasArbitrage, stakes, totalInvestido, retornoGarantido, lucro, roi, isStale, minutesAgo };
}

function formatBRL(v) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatPct(v) {
  return `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}
function formatAgo(min) {
  if (min < 1) return "agora mesmo";
  if (min === 1) return "há 1 min";
  if (min < 60) return `há ${min} min`;
  return `há ${Math.floor(min / 60)}h ${min % 60}min`;
}

// ---------------------------------------------------------------------------
// UI — tokens de tema
// ---------------------------------------------------------------------------

const useTheme = (dark) => ({
  bg: dark ? "#0A0E17" : "#F3F4F7",
  panel: dark ? "#10151F" : "#FFFFFF",
  panelAlt: dark ? "#161C29" : "#F8F9FB",
  border: dark ? "#232A38" : "#E2E5EB",
  text: dark ? "#E8ECF4" : "#161B26",
  textMuted: dark ? "#8993A6" : "#6B7280",
});

const GREEN = "#16C787";
const RED = "#F0546B";
const AMBER = "#F5A623";
const INDIGO = "#6C7CF0";

const mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" };

// ---------------------------------------------------------------------------
// Componentes de exibição
// ---------------------------------------------------------------------------

function StatCard({ icon: Icon, label, value, sub, accent, T }) {
  return (
    <div style={{ background: T.panel, border: `1px solid ${T.border}` }} className="rounded-xl p-4 flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between">
        <span style={{ color: T.textMuted }} className="text-xs font-medium">{label}</span>
        <div style={{ background: `${accent}1A`, color: accent }} className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0">
          <Icon size={15} />
        </div>
      </div>
      <div style={{ ...mono, color: T.text }} className="text-2xl font-semibold tracking-tight truncate">{value}</div>
      {sub && <span style={{ color: T.textMuted }} className="text-xs">{sub}</span>}
    </div>
  );
}

function ArbBadge({ arbPercent, isStale }) {
  if (isStale) {
    return (
      <span style={{ background: `${AMBER}1F`, color: AMBER, border: `1px solid ${AMBER}40` }} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold">
        <AlertTriangle size={12} /> desatualizada
      </span>
    );
  }
  if (arbPercent > 0) {
    return (
      <span style={{ background: `${GREEN}1F`, color: GREEN, border: `1px solid ${GREEN}40` }} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold">
        <CheckCircle2 size={12} /> +{formatPct(arbPercent)}
      </span>
    );
  }
  return (
    <span style={{ background: `${RED}1F`, color: RED, border: `1px solid ${RED}40` }} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold">
      <XCircle size={12} /> {formatPct(arbPercent)}
    </span>
  );
}

function ExpandedDetail({ ev, analysis, T }) {
  return (
    <div style={{ background: T.panelAlt, borderTop: `1px solid ${T.border}` }} className="p-4 md:p-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <div style={{ color: T.textMuted }} className="text-xs font-medium mb-1">Evento</div>
          <div style={{ color: T.text }} className="text-sm font-semibold mb-3">{ev.home} vs {ev.away}</div>
          <div style={{ color: T.textMuted }} className="text-xs font-medium mb-1">Mercado</div>
          <div style={{ color: T.text }} className="text-sm mb-4">{ev.market}</div>

          <div className="flex flex-col gap-2">
            {analysis.outcomes.map((o, i) => (
              <div key={o.label} style={{ border: `1px solid ${T.border}`, background: T.panel }} className="rounded-lg p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div style={{ color: T.text }} className="text-sm font-medium truncate">{o.label}</div>
                  <div style={{ color: T.textMuted }} className="text-xs mt-0.5">Casa: <span style={{ color: INDIGO }}>{o.bestHouse}</span></div>
                </div>
                <div className="text-right shrink-0">
                  <div style={{ ...mono, color: T.text }} className="text-sm">odd {o.bestOdd.toFixed(2)}</div>
                  <div style={{ ...mono, color: GREEN }} className="text-xs font-semibold">{formatBRL(analysis.stakes[i])}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div style={{ border: `1px solid ${T.border}`, background: T.panel }} className="rounded-lg p-4 flex flex-col gap-3">
            <Row label="Investimento total" value={formatBRL(analysis.totalInvestido)} T={T} />
            <Row label="Retorno garantido" value={formatBRL(analysis.retornoGarantido)} T={T} />
            <Row label="Lucro" value={formatBRL(analysis.lucro)} valueColor={analysis.lucro >= 0 ? GREEN : RED} T={T} bold />
            <Row label="ROI" value={formatPct(analysis.roi)} valueColor={analysis.lucro >= 0 ? GREEN : RED} T={T} bold />
            <Row label="Margem de arbitragem" value={formatPct(analysis.arbPercent)} valueColor={analysis.arbPercent > 0 ? GREEN : RED} T={T} />
          </div>
          <div style={{ color: T.textMuted }} className="text-xs px-1">
            Cálculo: cada aposta é dimensionada para pagar o mesmo retorno independente do resultado (stake = retorno ÷ odd). Atualizado {formatAgo(analysis.minutesAgo)}.
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, valueColor, T, bold }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: T.textMuted }} className="text-xs">{label}</span>
      <span style={{ ...mono, color: valueColor || T.text }} className={`text-sm ${bold ? "font-bold" : "font-medium"}`}>{value}</span>
    </div>
  );
}

function OpportunityRow({ ev, analysis, T, expanded, onToggle }) {
  const bestOutcome = analysis.outcomes.reduce((a, b) => (1 / (a.bestOdd || Infinity) < 1 / (b.bestOdd || Infinity) ? a : b));
  return (
    <>
      <tr onClick={onToggle} style={{ borderBottom: `1px solid ${T.border}`, cursor: "pointer" }} className="hover:brightness-110 transition-[filter]">
        <td className="py-3 px-3 text-xs" style={{ color: T.textMuted }}>{ev.sport}</td>
        <td className="py-3 px-3">
          <div style={{ color: T.text }} className="text-sm font-medium">{ev.home} <span style={{ color: T.textMuted }}>vs</span> {ev.away}</div>
          <div style={{ color: T.textMuted }} className="text-xs">{ev.league} · {ev.country}</div>
        </td>
        <td className="py-3 px-3 text-xs" style={{ color: T.textMuted, ...mono }}>{formatAgo(analysis.minutesAgo)}</td>
        <td className="py-3 px-3 text-xs" style={{ color: T.text }}>{ev.market}</td>
        <td className="py-3 px-3 text-xs" style={{ color: T.text }}>{bestOutcome.label}</td>
        <td className="py-3 px-3 text-sm font-semibold" style={{ ...mono, color: T.text }}>{bestOutcome.bestOdd.toFixed(2)}</td>
        <td className="py-3 px-3 text-xs" style={{ color: INDIGO }}>{bestOutcome.bestHouse}</td>
        <td className="py-3 px-3"><ArbBadge arbPercent={analysis.arbPercent} isStale={analysis.isStale} /></td>
        <td className="py-3 px-3 text-sm" style={{ ...mono, color: T.text }}>{formatBRL(analysis.totalInvestido)}</td>
        <td className="py-3 px-3 text-sm" style={{ ...mono, color: T.text }}>{formatBRL(analysis.retornoGarantido)}</td>
        <td className="py-3 px-3 text-sm font-semibold" style={{ ...mono, color: analysis.lucro >= 0 ? GREEN : RED }}>{formatBRL(analysis.lucro)}</td>
        <td className="py-3 px-3">
          {analysis.isStale ? (
            <span style={{ color: AMBER }} className="text-xs font-medium">Desatualizada</span>
          ) : analysis.hasArbitrage ? (
            <span style={{ color: GREEN }} className="text-xs font-medium">Ativa</span>
          ) : (
            <span style={{ color: RED }} className="text-xs font-medium">Inexistente</span>
          )}
        </td>
        <td className="py-3 px-3">
          <div style={{ color: T.textMuted }} className="flex items-center gap-1 text-xs">
            {formatAgo(analysis.minutesAgo)} {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={12} className="p-0"><ExpandedDetail ev={ev} analysis={analysis} T={T} /></td>
        </tr>
      )}
    </>
  );
}

function FilterSelect({ label, value, onChange, options, T }) {
  return (
    <label className="flex flex-col gap-1 min-w-[140px]">
      <span style={{ color: T.textMuted }} className="text-[11px] font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ background: T.panelAlt, color: T.text, border: `1px solid ${T.border}` }}
        className="rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Calculadora avulsa
// ---------------------------------------------------------------------------

function ArbCalculator({ T }) {
  const [banca, setBanca] = useState(1000);
  const [numResults, setNumResults] = useState(2);
  const [odds, setOdds] = useState([2.20, 2.10, 3.00, 4.00]);

  const activeOdds = odds.slice(0, numResults);
  const impliedSum = activeOdds.reduce((s, o) => s + (o > 0 ? 1 / o : 0), 0);
  const arbPercent = (1 - impliedSum) * 100;
  const hasArb = arbPercent > 0 && activeOdds.every((o) => o > 1);
  const stakes = activeOdds.map((o) => (o > 0 ? banca / o : 0));
  const totalInvestido = stakes.reduce((a, b) => a + b, 0);
  const lucro = banca - totalInvestido;
  const roi = totalInvestido > 0 ? (lucro / totalInvestido) * 100 : 0;

  const chartData = activeOdds.map((o, i) => ({ name: `R${i + 1}`, aposta: Number(stakes[i].toFixed(2)) }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      <div style={{ background: T.panel, border: `1px solid ${T.border}` }} className="rounded-xl p-5 lg:col-span-2 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Calculator size={16} style={{ color: INDIGO }} />
          <h3 style={{ color: T.text }} className="text-sm font-semibold">Calculadora de arbitragem</h3>
        </div>

        <label className="flex flex-col gap-1">
          <span style={{ color: T.textMuted }} className="text-xs">Banca (retorno garantido desejado)</span>
          <div style={{ background: T.panelAlt, border: `1px solid ${T.border}` }} className="flex items-center rounded-lg px-3">
            <span style={{ color: T.textMuted }} className="text-sm mr-1">R$</span>
            <input
              type="number" min={0} value={banca}
              onChange={(e) => setBanca(Math.max(0, Number(e.target.value)))}
              style={{ ...mono, color: T.text, background: "transparent" }}
              className="flex-1 py-2 text-sm outline-none"
            />
          </div>
        </label>

        <label className="flex flex-col gap-1">
          <span style={{ color: T.textMuted }} className="text-xs">Número de resultados possíveis</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setNumResults((n) => Math.max(2, n - 1))} style={{ background: T.panelAlt, border: `1px solid ${T.border}`, color: T.text }} className="w-8 h-8 rounded-lg flex items-center justify-center"><Minus size={14} /></button>
            <span style={{ ...mono, color: T.text }} className="w-6 text-center text-sm">{numResults}</span>
            <button onClick={() => setNumResults((n) => Math.min(odds.length, n + 1))} style={{ background: T.panelAlt, border: `1px solid ${T.border}`, color: T.text }} className="w-8 h-8 rounded-lg flex items-center justify-center"><Plus size={14} /></button>
          </div>
        </label>

        <div className="flex flex-col gap-2">
          {activeOdds.map((o, i) => (
            <label key={i} className="flex flex-col gap-1">
              <span style={{ color: T.textMuted }} className="text-xs">Resultado {i + 1} — Odd</span>
              <input
                type="number" step="0.01" min={1} value={o}
                onChange={(e) => {
                  const next = [...odds];
                  next[i] = Number(e.target.value);
                  setOdds(next);
                }}
                style={{ ...mono, background: T.panelAlt, color: T.text, border: `1px solid ${T.border}` }}
                className="rounded-lg px-3 py-2 text-sm outline-none"
              />
            </label>
          ))}
        </div>
      </div>

      <div className="lg:col-span-3 flex flex-col gap-5">
        <div style={{ background: T.panel, border: `1px solid ${hasArb ? GREEN : T.border}` }} className="rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <span style={{ color: T.textMuted }} className="text-xs font-medium">Resultado</span>
            <ArbBadge arbPercent={arbPercent} isStale={false} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MiniStat label="Investimento total" value={formatBRL(totalInvestido)} T={T} />
            <MiniStat label="Retorno garantido" value={formatBRL(banca)} T={T} />
            <MiniStat label="Lucro" value={formatBRL(lucro)} color={lucro >= 0 ? GREEN : RED} T={T} />
            <MiniStat label="ROI" value={formatPct(roi)} color={lucro >= 0 ? GREEN : RED} T={T} />
          </div>

          <div className="mt-5 flex flex-col gap-2">
            {activeOdds.map((o, i) => (
              <div key={i} style={{ border: `1px solid ${T.border}`, background: T.panelAlt }} className="rounded-lg px-3 py-2 flex items-center justify-between">
                <span style={{ color: T.text }} className="text-sm">Resultado {i + 1} <span style={{ color: T.textMuted, ...mono }}>(odd {o.toFixed(2)})</span></span>
                <span style={{ ...mono, color: GREEN }} className="text-sm font-semibold">{formatBRL(stakes[i])}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: T.panel, border: `1px solid ${T.border}` }} className="rounded-xl p-5">
          <span style={{ color: T.textMuted }} className="text-xs font-medium">Distribuição das apostas</span>
          <div className="h-48 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                <XAxis dataKey="name" tick={{ fill: T.textMuted, fontSize: 11 }} axisLine={{ stroke: T.border }} tickLine={false} />
                <YAxis tick={{ fill: T.textMuted, fontSize: 11 }} axisLine={{ stroke: T.border }} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: T.panelAlt, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12, color: T.text }}
                  formatter={(v) => formatBRL(v)}
                  labelStyle={{ color: T.textMuted }}
                />
                <Bar dataKey="aposta" radius={[6, 6, 0, 0]}>
                  {chartData.map((_, i) => <Cell key={i} fill={hasArb ? GREEN : INDIGO} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, color, T }) {
  return (
    <div>
      <div style={{ color: T.textMuted }} className="text-[11px] mb-1">{label}</div>
      <div style={{ ...mono, color: color || T.text }} className="text-base font-semibold truncate">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gerenciar Odds — entrada manual, direto no site, sem planilha
// ---------------------------------------------------------------------------

const emptyOutcome = () => ({ label: "", odds: Object.fromEntries(HOUSES.map((h) => [h, ""])) });
const emptyForm = () => ({
  sport: "Futebol", league: "", country: "", home: "", away: "", market: "Resultado Final",
  outcomes: [emptyOutcome(), emptyOutcome()],
});

function OddsManager({ events, setEvents, T }) {
  const [editingId, setEditingId] = useState(null); // null = fechado, "new" = novo, ou id existente
  const [form, setForm] = useState(emptyForm());

  const startNew = () => { setForm(emptyForm()); setEditingId("new"); };
  const startEdit = (ev) => {
    setForm({
      sport: ev.sport, league: ev.league, country: ev.country, home: ev.home, away: ev.away, market: ev.market,
      outcomes: ev.outcomes.map((o) => ({ label: o.label, odds: Object.fromEntries(HOUSES.map((h) => [h, o.odds[h] ?? ""])) })),
    });
    setEditingId(ev.id);
  };
  const cancel = () => { setEditingId(null); setForm(emptyForm()); };

  const addOutcome = () => setForm((f) => ({ ...f, outcomes: [...f.outcomes, emptyOutcome()] }));
  const removeOutcome = (i) => setForm((f) => ({ ...f, outcomes: f.outcomes.filter((_, idx) => idx !== i) }));
  const updateOutcomeLabel = (i, val) => setForm((f) => ({ ...f, outcomes: f.outcomes.map((o, idx) => (idx === i ? { ...o, label: val } : o)) }));
  const updateOdd = (i, house, val) => setForm((f) => ({ ...f, outcomes: f.outcomes.map((o, idx) => (idx === i ? { ...o, odds: { ...o.odds, [house]: val } } : o)) }));

  const removeEvent = (id) => setEvents((evs) => evs.filter((e) => e.id !== id));

  // Liga/campeonato e nome de cada resultado agora são opcionais (ganham um valor
  // padrão ao salvar) — só time A, time B e pelo menos 2 resultados são obrigatórios.
  const missing = [];
  if (!form.home.trim()) missing.push("Time / jogador A");
  if (!form.away.trim()) missing.push("Time / jogador B");
  if (form.outcomes.length < 2) missing.push("pelo menos 2 resultados");
  const canSave = missing.length === 0;

  const save = () => {
    const cleanOutcomes = form.outcomes.map((o, i) => ({
      label: o.label.trim() || `Resultado ${i + 1}`,
      odds: Object.fromEntries(Object.entries(o.odds).filter(([, v]) => v !== "" && Number(v) > 0).map(([h, v]) => [h, Number(v)])),
    }));
    const payload = {
      sport: form.sport, league: form.league.trim(), country: form.country.trim() || "—",
      home: form.home.trim(), away: form.away.trim(), market: form.market.trim() || "Resultado Final",
      outcomes: cleanOutcomes, updatedAt: Date.now(),
    };
    if (editingId === "new") {
      setEvents((evs) => [...evs, { id: `custom-${Date.now()}`, ...payload }]);
    } else {
      setEvents((evs) => evs.map((e) => (e.id === editingId ? { ...e, ...payload } : e)));
    }
    cancel();
  };

  const inputStyle = { background: T.panelAlt, border: `1px solid ${T.border}`, color: T.text };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 style={{ color: T.text }} className="text-sm font-semibold">Gerenciar odds</h2>
          <p style={{ color: T.textMuted }} className="text-xs mt-0.5">Cadastre um evento e digite a odd que cada casa está oferecendo. O cálculo de arbitragem atualiza na hora.</p>
        </div>
        {editingId === null && (
          <button onClick={startNew} style={{ background: `${GREEN}1F`, color: GREEN, border: `1px solid ${GREEN}40` }} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold hover:brightness-110 shrink-0">
            <Plus size={14} /> Novo evento
          </button>
        )}
      </div>

      {editingId !== null && (
        <div style={{ background: T.panel, border: `1px solid ${INDIGO}40` }} className="rounded-xl p-5 flex flex-col gap-4">
          {!canSave && (
            <div style={{ background: `${AMBER}1A`, border: `1px solid ${AMBER}50`, color: AMBER }} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold">
              <AlertTriangle size={14} className="shrink-0" /> Falta preencher: {missing.join(", ")}
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <label className="flex flex-col gap-1">
              <span style={{ color: T.textMuted }} className="text-xs">Esporte</span>
              <select value={form.sport} onChange={(e) => setForm((f) => ({ ...f, sport: e.target.value }))} style={inputStyle} className="rounded-lg px-2.5 py-2 text-sm outline-none">
                {["Futebol", "Basquete", "Tênis", "MMA", "Vôlei", "Esports", "Outro"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span style={{ color: T.textMuted }} className="text-xs">Liga / campeonato (opcional)</span>
              <input value={form.league} onChange={(e) => setForm((f) => ({ ...f, league: e.target.value }))} style={inputStyle} className="rounded-lg px-2.5 py-2 text-sm outline-none" placeholder="ex.: Brasileirão Série A" />
            </label>
            <label className="flex flex-col gap-1">
              <span style={{ color: T.textMuted }} className="text-xs">País</span>
              <input value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} style={inputStyle} className="rounded-lg px-2.5 py-2 text-sm outline-none" placeholder="ex.: Brasil" />
            </label>
            <label className="flex flex-col gap-1">
              <span style={{ color: T.textMuted }} className="text-xs">Time / jogador A</span>
              <input value={form.home} onChange={(e) => setForm((f) => ({ ...f, home: e.target.value }))} style={inputStyle} className="rounded-lg px-2.5 py-2 text-sm outline-none" />
            </label>
            <label className="flex flex-col gap-1">
              <span style={{ color: T.textMuted }} className="text-xs">Time / jogador B</span>
              <input value={form.away} onChange={(e) => setForm((f) => ({ ...f, away: e.target.value }))} style={inputStyle} className="rounded-lg px-2.5 py-2 text-sm outline-none" />
            </label>
            <label className="flex flex-col gap-1">
              <span style={{ color: T.textMuted }} className="text-xs">Mercado</span>
              <input value={form.market} onChange={(e) => setForm((f) => ({ ...f, market: e.target.value }))} style={inputStyle} className="rounded-lg px-2.5 py-2 text-sm outline-none" placeholder="ex.: Resultado Final" />
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span style={{ color: T.textMuted }} className="text-xs font-medium">Resultados possíveis e odds por casa</span>
              <button onClick={addOutcome} style={{ color: INDIGO }} className="flex items-center gap-1 text-xs font-medium hover:underline">
                <Plus size={12} /> Adicionar resultado
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                    <th style={{ color: T.textMuted }} className="text-left text-[11px] font-semibold py-2 pr-2 min-w-[140px]">Resultado</th>
                    {HOUSES.map((h) => (
                      <th key={h} style={{ color: T.textMuted }} className="text-left text-[11px] font-semibold py-2 px-1.5 min-w-[84px]">{h}</th>
                    ))}
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {form.outcomes.map((o, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${T.border}` }}>
                      <td className="py-1.5 pr-2">
                        <input value={o.label} onChange={(e) => updateOutcomeLabel(i, e.target.value)} style={inputStyle} className="w-full rounded-lg px-2 py-1.5 text-xs outline-none" placeholder={`Resultado ${i + 1}`} />
                      </td>
                      {HOUSES.map((h) => (
                        <td key={h} className="py-1.5 px-1.5">
                          <input
                            type="number" step="0.01" min="1" value={o.odds[h]}
                            onChange={(e) => updateOdd(i, h, e.target.value)}
                            style={{ ...inputStyle, ...mono }}
                            className="w-full rounded-lg px-2 py-1.5 text-xs outline-none"
                            placeholder="—"
                          />
                        </td>
                      ))}
                      <td className="py-1.5 text-center">
                        {form.outcomes.length > 2 && (
                          <button onClick={() => removeOutcome(i)} style={{ color: RED }} className="hover:brightness-110"><Trash2 size={14} /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ color: T.textMuted }} className="text-[11px] mt-2">Deixe em branco a casa que não tem esse mercado — só a melhor odd de cada resultado entra no cálculo.</p>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button onClick={cancel} style={{ background: T.panelAlt, border: `1px solid ${T.border}`, color: T.text }} className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold hover:brightness-110">
              <X size={14} /> Cancelar
            </button>
            <button onClick={save} disabled={!canSave} style={{ background: canSave ? `${GREEN}1F` : T.panelAlt, color: canSave ? GREEN : T.textMuted, border: `1px solid ${canSave ? GREEN + "40" : T.border}`, cursor: canSave ? "pointer" : "not-allowed" }} className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold hover:brightness-110">
              <Save size={14} /> Salvar evento
            </button>
          </div>
        </div>
      )}

      <div style={{ background: T.panel, border: `1px solid ${T.border}` }} className="rounded-xl overflow-hidden">
        <div style={{ borderBottom: `1px solid ${T.border}` }} className="px-4 py-3">
          <span style={{ color: T.text }} className="text-sm font-semibold">Eventos cadastrados ({events.length})</span>
        </div>
        <div className="divide-y" style={{ borderColor: T.border }}>
          {events.map((ev) => {
            const analysis = analyzeEvent(ev, 1000);
            return (
              <div key={ev.id} style={{ borderBottom: `1px solid ${T.border}` }} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div style={{ color: T.text }} className="text-sm font-medium">{ev.home} <span style={{ color: T.textMuted }}>vs</span> {ev.away}</div>
                  <div style={{ color: T.textMuted }} className="text-xs">{ev.sport} · {ev.league} · {ev.market} · atualizado {formatAgo(analysis.minutesAgo)}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <ArbBadge arbPercent={analysis.arbPercent} isStale={analysis.isStale} />
                  <button onClick={() => startEdit(ev)} style={{ background: T.panelAlt, border: `1px solid ${T.border}`, color: T.text }} className="w-8 h-8 rounded-lg flex items-center justify-center hover:brightness-110">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => removeEvent(ev.id)} style={{ background: T.panelAlt, border: `1px solid ${T.border}`, color: RED }} className="w-8 h-8 rounded-lg flex items-center justify-center hover:brightness-110">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
          {events.length === 0 && (
            <div style={{ color: T.textMuted }} className="text-center py-10 text-sm">Nenhum evento cadastrado ainda. Clique em "Novo evento" para começar.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const [dark, setDark] = useState(true);
  const T = useTheme(dark);
  const [tab, setTab] = useState("dashboard");
  const [expandedId, setExpandedId] = useState(null);
  const [tick, setTick] = useState(0);
  const [showFilters, setShowFilters] = useState(true);
  const [manualEvents, setManualEvents] = useState([]);
  const { events: liveEvents, loading: liveLoading, error: liveError, lastFetchedAt } = useLiveOdds(3600000); // 1h — orçamento calculado para ~46 chamadas/hora
  const events = [...liveEvents, ...manualEvents];
  const setEvents = setManualEvents; // "Gerenciar odds" segue editando só os manuais
  const defaultBanca = 1000;

  // mantém "atualizado há X min" vivo sem precisar de fonte externa
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const [filters, setFilters] = useState({
    sport: "Todos", league: "Todas", country: "Todos", house: "Todas",
    market: "Todos", minArb: "-100", onlyActive: false, freshness: "Todos",
  });

  const analyzed = useMemo(() => events.map((ev) => ({ ev, analysis: analyzeEvent(ev, defaultBanca) })), [events, tick]);

  const sports = ["Todos", ...new Set(events.map((e) => e.sport))];
  const leagues = ["Todas", ...new Set(events.map((e) => e.league))];
  const countries = ["Todos", ...new Set(events.map((e) => e.country))];
  const markets = ["Todos", ...new Set(events.map((e) => e.market))];
  const houses = ["Todas", ...HOUSES];

  const filtered = analyzed.filter(({ ev, analysis }) => {
    if (filters.sport !== "Todos" && ev.sport !== filters.sport) return false;
    if (filters.league !== "Todas" && ev.league !== filters.league) return false;
    if (filters.country !== "Todos" && ev.country !== filters.country) return false;
    if (filters.market !== "Todos" && ev.market !== filters.market) return false;
    if (filters.house !== "Todas" && !analysis.outcomes.some((o) => o.bestHouse === filters.house)) return false;
    if (analysis.arbPercent < Number(filters.minArb)) return false;
    if (filters.onlyActive && !(analysis.hasArbitrage && !analysis.isStale)) return false;
    if (filters.freshness === "5min" && analysis.minutesAgo > 5) return false;
    if (filters.freshness === "15min" && analysis.minutesAgo > 15) return false;
    if (filters.freshness === "1h" && analysis.minutesAgo > 60) return false;
    return true;
  }).sort((a, b) => b.analysis.arbPercent - a.analysis.arbPercent);

  const opportunities = analyzed.filter((a) => a.analysis.hasArbitrage && !a.analysis.isStale);
  const bestArb = analyzed.reduce((best, a) => (a.analysis.arbPercent > (best?.analysis.arbPercent ?? -Infinity) ? a : best), null);
  const bestProfit = analyzed.reduce((best, a) => (a.analysis.lucro > (best?.analysis.lucro ?? -Infinity) ? a : best), null);
  const lastUpdateMin = analyzed.length ? Math.min(...analyzed.map((a) => a.analysis.minutesAgo)) : 0;

  const chartTop = [...analyzed].sort((a, b) => b.analysis.arbPercent - a.analysis.arbPercent).slice(0, 6)
    .map(({ ev, analysis }) => ({ name: `${ev.home.split(" ")[0]}×${ev.away.split(" ")[0]}`, arb: Number(analysis.arbPercent.toFixed(2)) }));

  return (
    <div style={{ background: T.bg, minHeight: "100%", fontFamily: "Inter, system-ui, -apple-system, sans-serif" }} className="w-full">
      {/* Header */}
      <header style={{ background: T.panel, borderBottom: `1px solid ${T.border}` }} className="sticky top-0 z-20 px-4 md:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div style={{ background: `linear-gradient(135deg, ${GREEN}, ${INDIGO})` }} className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
            <Trophy size={16} color="#0A0E17" />
          </div>
          <div>
            <div style={{ color: T.text }} className="text-sm font-bold leading-none">SureLine</div>
            <div style={{ color: T.textMuted }} className="text-[10px] mt-0.5">odds & arbitragem</div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div style={{ background: T.panelAlt, border: `1px solid ${T.border}` }} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg">
            <Wifi size={13} color={liveError ? RED : liveEvents.length > 0 ? GREEN : AMBER} />
            <span style={{ color: T.text }} className="text-xs font-medium">
              {liveError ? "Erro na API" : liveLoading ? "Conectando…" : liveEvents.length > 0 ? "Conectado" : "Sem dados da API"}
            </span>
          </div>
          <div style={{ background: T.panelAlt, border: `1px solid ${T.border}` }} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg">
            <Clock size={13} style={{ color: T.textMuted }} />
            <span style={{ color: T.textMuted }} className="text-xs">{formatAgo(lastUpdateMin)}</span>
          </div>
          <button onClick={() => setTick((n) => n + 1)} style={{ background: `${INDIGO}1F`, color: INDIGO, border: `1px solid ${INDIGO}40` }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold hover:brightness-110">
            <RefreshCw size={13} /> Atualizar
          </button>
          <button style={{ background: T.panelAlt, border: `1px solid ${T.border}`, color: T.text }} className="w-8 h-8 rounded-lg flex items-center justify-center hover:brightness-110">
            <Settings size={14} />
          </button>
          <button onClick={() => setDark((d) => !d)} style={{ background: T.panelAlt, border: `1px solid ${T.border}`, color: T.text }} className="w-8 h-8 rounded-lg flex items-center justify-center hover:brightness-110">
            {dark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </header>

      <div className="px-4 md:px-6 py-5 flex flex-col gap-5">
        {/* Tabs */}
        <div className="flex items-center gap-2 flex-wrap">
          <TabButton active={tab === "dashboard"} onClick={() => setTab("dashboard")} icon={LayoutDashboard} label="Dashboard" T={T} />
          <TabButton active={tab === "manage"} onClick={() => setTab("manage")} icon={ClipboardEdit} label="Gerenciar odds" T={T} />
          <TabButton active={tab === "calc"} onClick={() => setTab("calc")} icon={Calculator} label="Calculadora" T={T} />
        </div>

        {/* As três abas ficam sempre montadas (display:none quando inativas) para
            NUNCA perder o que você está digitando ao trocar de aba. */}
        <div style={{ display: tab === "dashboard" ? "flex" : "none" }} className="flex-col gap-5">
            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <StatCard T={T} icon={Layers} label="Eventos monitorados" value={events.length} accent={INDIGO} />
              <StatCard T={T} icon={TrendingUp} label="Oportunidades" value={opportunities.length} accent={GREEN} sub={`de ${events.length} eventos`} />
              <StatCard T={T} icon={Target} label="Melhor arbitragem" value={bestArb ? formatPct(bestArb.analysis.arbPercent) : "—"} accent={bestArb?.analysis.arbPercent > 0 ? GREEN : RED} sub={bestArb ? `${bestArb.ev.home} × ${bestArb.ev.away}` : ""} />
              <StatCard T={T} icon={TrendingUp} label="Maior lucro potencial" value={bestProfit ? formatBRL(bestProfit.analysis.lucro) : "—"} accent={GREEN} sub="banca base R$ 1.000" />
              <StatCard T={T} icon={Building2} label="Casas monitoradas" value={HOUSES.length} accent={INDIGO} />
              <StatCard T={T} icon={Clock} label="Última atualização" value={formatAgo(lastUpdateMin)} accent={AMBER} />
            </div>

            {/* Chart */}
            <div style={{ background: T.panel, border: `1px solid ${T.border}` }} className="rounded-xl p-5">
              <span style={{ color: T.text }} className="text-sm font-semibold">Margem de arbitragem por evento</span>
              <div className="h-52 mt-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartTop} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: T.textMuted, fontSize: 11 }} axisLine={{ stroke: T.border }} tickLine={false} />
                    <YAxis tick={{ fill: T.textMuted, fontSize: 11 }} axisLine={{ stroke: T.border }} tickLine={false} unit="%" />
                    <Tooltip contentStyle={{ background: T.panelAlt, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12, color: T.text }} formatter={(v) => `${v}%`} labelStyle={{ color: T.textMuted }} />
                    <Bar dataKey="arb" radius={[6, 6, 0, 0]}>
                      {chartTop.map((d, i) => <Cell key={i} fill={d.arb > 0 ? GREEN : RED} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Filters */}
            <div style={{ background: T.panel, border: `1px solid ${T.border}` }} className="rounded-xl p-4">
              <button onClick={() => setShowFilters((s) => !s)} className="flex items-center gap-2 mb-1">
                <SlidersHorizontal size={14} style={{ color: T.text }} />
                <span style={{ color: T.text }} className="text-sm font-semibold">Filtros</span>
                {showFilters ? <ChevronUp size={14} style={{ color: T.textMuted }} /> : <ChevronDown size={14} style={{ color: T.textMuted }} />}
              </button>
              {showFilters && (
                <div className="flex flex-wrap gap-3 mt-3">
                  <FilterSelect T={T} label="Esporte" value={filters.sport} onChange={(v) => setFilters((f) => ({ ...f, sport: v }))} options={sports.map((s) => ({ value: s, label: s }))} />
                  <FilterSelect T={T} label="Liga / Campeonato" value={filters.league} onChange={(v) => setFilters((f) => ({ ...f, league: v }))} options={leagues.map((s) => ({ value: s, label: s }))} />
                  <FilterSelect T={T} label="País" value={filters.country} onChange={(v) => setFilters((f) => ({ ...f, country: v }))} options={countries.map((s) => ({ value: s, label: s }))} />
                  <FilterSelect T={T} label="Casa de apostas" value={filters.house} onChange={(v) => setFilters((f) => ({ ...f, house: v }))} options={houses.map((s) => ({ value: s, label: s }))} />
                  <FilterSelect T={T} label="Mercado" value={filters.market} onChange={(v) => setFilters((f) => ({ ...f, market: v }))} options={markets.map((s) => ({ value: s, label: s }))} />
                  <FilterSelect T={T} label="Arbitragem mín." value={filters.minArb} onChange={(v) => setFilters((f) => ({ ...f, minArb: v }))} options={[{ value: "-100", label: "Qualquer" }, { value: "0", label: "≥ 0%" }, { value: "1", label: "≥ 1%" }, { value: "3", label: "≥ 3%" }, { value: "5", label: "≥ 5%" }]} />
                  <FilterSelect T={T} label="Atualizado em até" value={filters.freshness} onChange={(v) => setFilters((f) => ({ ...f, freshness: v }))} options={[{ value: "Todos", label: "Qualquer" }, { value: "5min", label: "5 min" }, { value: "15min", label: "15 min" }, { value: "1h", label: "1 hora" }]} />
                  <label className="flex flex-col gap-1 justify-end">
                    <span style={{ color: T.textMuted }} className="text-[11px] font-medium">&nbsp;</span>
                    <div onClick={() => setFilters((f) => ({ ...f, onlyActive: !f.onlyActive }))} style={{ background: filters.onlyActive ? `${GREEN}1F` : T.panelAlt, border: `1px solid ${filters.onlyActive ? GREEN : T.border}`, color: filters.onlyActive ? GREEN : T.text }} className="rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer select-none">
                      {filters.onlyActive ? "✓ " : ""}Apenas oportunidades ativas
                    </div>
                  </label>
                </div>
              )}
            </div>

            {/* Table */}
            <div style={{ background: T.panel, border: `1px solid ${T.border}` }} className="rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] border-collapse">
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                      {["Esporte", "Evento", "Data/hora", "Mercado", "Resultado", "Melhor odd", "Casa", "Arbitragem %", "Investimento", "Retorno", "Lucro", "Status", "Atualização"].map((h) => (
                        <th key={h} style={{ color: T.textMuted }} className="text-left text-[11px] font-semibold uppercase tracking-wide py-3 px-3 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(({ ev, analysis }) => (
                      <OpportunityRow key={ev.id} ev={ev} analysis={analysis} T={T} expanded={expandedId === ev.id} onToggle={() => setExpandedId((id) => (id === ev.id ? null : ev.id))} />
                    ))}
                    {filtered.length === 0 && (
                      <tr><td colSpan={13} style={{ color: T.textMuted }} className="text-center py-10 text-sm">Nenhum evento corresponde aos filtros selecionados.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        <div style={{ display: tab === "manage" ? "block" : "none" }}>
          <OddsManager events={events} setEvents={setEvents} T={T} />
        </div>

        <div style={{ display: tab === "calc" ? "block" : "none" }}>
          <ArbCalculator T={T} />
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label, T }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? `${INDIGO}1F` : "transparent",
        color: active ? INDIGO : T.textMuted,
        border: `1px solid ${active ? INDIGO + "40" : T.border}`,
      }}
      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium hover:brightness-110"
    >
      <Icon size={14} /> {label}
    </button>
  );
}
