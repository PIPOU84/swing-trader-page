"use strict";

const $ = (sel, el = document) => el.querySelector(sel);
const view = $("#view");
const LABELS = { tendance: "Tendance", setup: "Setup", rr: "R:R", macro: "Macro", momentum: "Momentum" };
const MAX = { tendance: 30, setup: 30, rr: 15, macro: 15, momentum: 10 };
const WATCH_KINDS = { pullback: "Repli vers un niveau", breakout: "Test de niveau", oversold: "Excès" };

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v, max = 5) => v == null ? "–" : Number(v).toLocaleString("fr-FR", { maximumFractionDigits: max });
const pct = v => v == null ? `<span class="muted">–</span>`
  : `<span class="${v > 0 ? "up" : v < 0 ? "down" : ""}">${v > 0 ? "+" : ""}${num(v, 1)} %</span>`;
const dirBadge = d => `<span class="badge ${d}">${d === "long" ? "Achat" : "Vente"}</span>`;
const fmtDate = iso => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

// ------------------------------------------------------------------ graphiques (créés à l'ouverture d'une fiche)
function drawChart(box, chart, lines) {
  if (!window.LightweightCharts || !chart?.candles?.length) {
    box.innerHTML = `<div class="empty">Graphique indisponible.</div>`;
    return;
  }
  const css = getComputedStyle(document.documentElement);
  const c = v => css.getPropertyValue(v).trim();
  const ch = LightweightCharts.createChart(box, {
    autoSize: true,
    layout: { background: { color: c("--surface") }, textColor: c("--muted") },
    grid: { vertLines: { color: c("--border") }, horzLines: { color: c("--border") } },
    rightPriceScale: { borderColor: c("--border") },
    timeScale: { borderColor: c("--border") },
    handleScroll: { mouseWheel: false, vertTouchDrag: false },
    handleScale: { mouseWheel: false },
  });
  const p = chart.precision;
  const candles = ch.addCandlestickSeries({
    upColor: c("--up"), downColor: c("--down"), wickUpColor: c("--up"), wickDownColor: c("--down"), borderVisible: false,
    priceFormat: { type: "price", precision: p, minMove: 1 / 10 ** p },
  });
  candles.setData(chart.candles.map(([time, open, high, low, close]) => ({ time, open, high, low, close })));
  for (const [key, color] of [["sma20", "#f0b429"], ["sma50", "#4c9aff"]]) {
    const s = ch.addLineSeries({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    s.setData(chart[key].map(([time, value]) => ({ time, value })));
  }
  chart.zones.forEach(z => candles.createPriceLine({
    price: z.price, lineWidth: 1, axisLabelVisible: false, lineStyle: LightweightCharts.LineStyle.Dotted,
    color: z.kind === "support" ? "rgba(38,166,154,.5)" : z.kind === "resistance" ? "rgba(239,83,80,.5)" : "rgba(139,152,165,.5)",
  }));
  lines.forEach(([price, color, title]) => candles.createPriceLine({
    price, color: c(color), title, lineWidth: 2, lineStyle: LightweightCharts.LineStyle.Dashed,
  }));
  ch.timeScale().fitContent();
}

function lazyCharts(root, items, linesOf) {
  root.querySelectorAll("details[data-i]").forEach(d => d.addEventListener("toggle", () => {
    const box = d.querySelector(".chart");
    if (d.open && box && !box.dataset.done) {
      box.dataset.done = "1";
      const it = items[Number(d.dataset.i)];
      drawChart(box, it.chart, linesOf(it));
    }
  }));
}

// ------------------------------------------------------------------ blocs
function tradeCard(s, i) {
  return `
  <details class="card trade" data-i="${i}">
    <summary>
      <div class="row spread">
        <div class="row"><strong>${esc(s.name)}</strong><span class="muted">${esc(s.symbol)}</span></div>
        <div class="row">${dirBadge(s.direction)}<span class="chev">›</span></div>
      </div>
      <div class="muted">${esc(s.setup)} · confiance ${esc(s.confidence.toLowerCase())}</div>
      <div class="row spread" style="margin-top:.4rem"><span>Score</span><strong>${s.score}/100</strong></div>
      <div class="score"><i style="width:${s.score}%"></i></div>
      <dl class="kv">
        <dt>Zone d'entrée</dt><dd>${num(s.entry_low)} – ${num(s.entry_high)}</dd>
        <dt>Stop</dt><dd class="down">${num(s.stop)}</dd>
        <dt>Objectifs</dt><dd class="up">${num(s.tp1)} · ${num(s.tp2)}</dd>
      </dl>
      ${s.warnings.length ? `<div style="margin-top:.5rem"><span class="badge warn">⚠ ${s.warnings.length} alerte(s)</span></div>` : ""}
      <div class="hint" style="margin-top:.4rem">Touche pour voir le graphique et le plan complet</div>
    </summary>
    <div class="body">
      <div class="chart"></div>
      <div class="breakdown">${Object.keys(LABELS).map(k => `<div><div class="muted">${LABELS[k]}</div>${s.breakdown[k]}/${MAX[k]}</div>`).join("")}</div>
      <h3 style="margin-top:.8rem">Plan de trade</h3>
      <dl class="kv">
        <dt>Type d'ordre</dt><dd>${esc(s.order_type)}</dd>
        <dt>Entrée de référence</dt><dd>${num(s.entry_ref)}</dd>
        <dt>Stop</dt><dd class="down">${num(s.stop)}</dd>
        <dt>TP1 (1/3)</dt><dd class="up">${num(s.tp1)} · R:R ${num(s.rr_tp1, 1)}</dd>
        <dt>TP2 (1/3)</dt><dd class="up">${num(s.tp2)} · R:R ${num(s.rr_tp2, 1)}</dd>
        <dt>TP3</dt><dd class="up">${num(s.tp3)}</dd>
        <dt>Horizon</dt><dd>${esc(s.horizon)}</dd>
        <dt>Confirmation H4</dt><dd>${s.h4 ? "Oui" : "Pas encore"}</dd>
      </dl>
      <div class="rationale">${esc(s.rationale)}</div>
      <h3 style="margin-top:.8rem">Le scénario est invalidé si…</h3>
      <ul class="plain">${s.invalidation.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
      ${s.warnings.length ? `<h3 style="margin-top:.8rem">Alertes</h3><ul class="plain warn-list">${s.warnings.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      <p class="hint">Taille de position : calcule-la dans l'app sur ton PC (non publiée ici).</p>
    </div>
  </details>`;
}

function watchCard(w, i) {
  return `
  <details class="card trade" data-i="${i}">
    <summary>
      <div class="row spread">
        <div class="row"><strong>${esc(w.name)}</strong><span class="muted">${esc(WATCH_KINDS[w.kind])}</span></div>
        <div class="row">${dirBadge(w.direction)}<span class="chev">›</span></div>
      </div>
      <div class="muted">${esc(w.message)}</div>
    </summary>
    <div class="body"><div class="chart"></div></div>
  </details>`;
}

function momentumTable(list, title) {
  return `<div><h3>${title}</h3>${list.length ? `<table><thead><tr><th>Produit</th><th class="num">3 mois</th><th class="num">6 mois</th></tr></thead>
    <tbody>${list.map(x => `<tr><td>${esc(x.name)}</td><td class="num">${pct(x.perf.m3)}</td><td class="num">${pct(x.perf.m6)}</td></tr>`).join("")}</tbody></table>`
    : `<p class="muted">Aucun produit.</p>`}</div>`;
}

// ------------------------------------------------------------------ page
async function main() {
  let data;
  try {
    data = await fetch(`data.json?t=${Date.now()}`).then(r => r.json());
  } catch {
    view.innerHTML = `<div class="card empty">Données indisponibles. Réessaie dans quelques minutes.</div>`;
    return;
  }
  const gen = new Date(data.generated_at);
  $("#title").textContent = `Rapport du ${gen.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}`;
  const rg = $("#regime");
  rg.textContent = `Marché ${data.regime.label}`;
  rg.className = "badge " + (data.regime.label === "risk-on" ? "on" : data.regime.label === "risk-off" ? "off" : "");

  const strong = data.signals.filter(s => s.score >= 60);
  const weak = data.signals.filter(s => s.score < 60);
  const ageDays = (Date.now() - gen.getTime()) / 86400000;
  const groups = data.momentum;
  let tab = Object.keys(groups)[0];

  view.innerHTML = `
    <section class="stack">
      ${ageDays > 4 ? `<div class="stale">Ces données datent du ${gen.toLocaleDateString("fr-FR")} : le rapport automatique ne s'est pas exécuté depuis.</div>` : ""}
      <div class="card">
        <h2>Contexte de marché</h2>
        <ul class="plain">${data.regime.notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul>
      </div>

      <h2 class="section-title">Trades à considérer <span class="muted">(${strong.length} sur ${data.scanned} produits)</span></h2>
      <div class="grid" id="trades">${strong.length ? strong.map((s, i) => tradeCard(s, i)).join("")
        : `<div class="card empty">Aucun setup avec un score ≥ 60 ce soir. Pas de trade, c'est aussi une décision.</div>`}</div>

      ${weak.length ? `<details class="card" id="weakBox"><summary><strong>Setups plus fragiles</strong> <span class="muted">(${weak.length}, score &lt; 60)</span></summary>
        <div class="grid" id="weak" style="margin-top:12px">${weak.map((s, i) => tradeCard(s, i)).join("")}</div></details>` : ""}

      <h2 class="section-title">À surveiller <span class="muted">(place une alerte)</span></h2>
      <div class="stack" id="watch">${data.watch.length ? data.watch.map(watchCard).join("") : `<div class="card empty">Rien de proche d'un niveau clé.</div>`}</div>

      <div class="card">
        <h2>Leaders et retardataires</h2>
        <div class="chips" id="momTabs">${Object.entries(groups).map(([k, g]) =>
          `<button type="button" data-k="${k}" class="${k === tab ? "active" : ""}">${esc(g.label)}</button>`).join("")}</div>
        <div class="grid" id="momBody" style="margin-top:12px"></div>
      </div>

      ${data.events.length ? `<div class="card"><h2>Résultats à venir</h2><ul class="plain">${data.events.map(e =>
        `<li><strong>${fmtDate(e.date)}</strong> · ${esc(e.title)}</li>`).join("")}</ul></div>` : ""}

      <p class="hint">Mis à jour le ${gen.toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short" })}.</p>
    </section>`;

  const sigLines = s => [[s.entry_ref, "--accent", "Entrée"], [s.stop, "--down", "Stop"], [s.tp1, "--up", "TP1"], [s.tp2, "--up", "TP2"]];
  lazyCharts($("#trades"), strong, sigLines);
  if (weak.length) lazyCharts($("#weak"), weak, sigLines);
  lazyCharts($("#watch"), data.watch, w => [[w.level, "--accent", "Niveau"]]);

  const fill = () => {
    $("#momBody").innerHTML = momentumTable(groups[tab].leaders, "Leaders (hausse)") + momentumTable(groups[tab].laggards, "Retardataires (baisse)");
  };
  fill();
  $("#momTabs").addEventListener("click", e => {
    const b = e.target.closest("button[data-k]");
    if (!b) return;
    tab = b.dataset.k;
    $("#momTabs").querySelectorAll("button").forEach(x => x.classList.toggle("active", x === b));
    fill();
  });
}
main();
