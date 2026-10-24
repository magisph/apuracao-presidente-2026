import "./style.css";
import { makeDemo } from "../core/demo.ts";
import type { Snapshot, Projection, Territory } from "../core/types.ts";
import { validateSnapshot } from "../core/validation.ts";
import { LoadGeneration } from "./state.ts";
import { project } from "../core/model.ts";
import { mathematicalDecision } from "../core/decision.ts";
import { gunzipText } from "../core/codec.ts";
import { loadHistory, readHistoryPage } from "./history.ts";
const app = document.querySelector<HTMLDivElement>("#app")!;
const api = (import.meta as any).env?.VITE_API_BASE ?? "";
const pct = (x: number | null | undefined, d = 2) =>
  x === null || x === undefined
    ? "—"
    : (100 * x).toLocaleString("pt-BR", {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      }) + "%";
const num = (x: number | null | undefined) =>
  x === null || x === undefined ? "—" : Math.round(x).toLocaleString("pt-BR");
const esc = (x: unknown) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
let mode =
    new URL(location.href).searchParams.get("mode") === "simulation"
      ? "simulation"
      : "live",
  history: Snapshot[] = [],
  index = -1,
  scope = "BR",
  tab = "overview",
  query = "",
  mapMode = "projection",
  zoom = 1,
  playing = false,
  error = "",
  geo: any = null;
const loads = new LoadGeneration();
const municipalLoads = new LoadGeneration();
let municipalUf: string | null = null,
  municipalGeo: any = null;
let lastCheckedAt: string | null = null;
let latestHealth: any = null;
const unavailable = project([], []);
const IBGE: Record<string, string> = {
  "11": "RO",
  "12": "AC",
  "13": "AM",
  "14": "RR",
  "15": "PA",
  "16": "AP",
  "17": "TO",
  "21": "MA",
  "22": "PI",
  "23": "CE",
  "24": "RN",
  "25": "PB",
  "26": "PE",
  "27": "AL",
  "28": "SE",
  "29": "BA",
  "31": "MG",
  "32": "ES",
  "33": "RJ",
  "35": "SP",
  "41": "PR",
  "42": "SC",
  "43": "RS",
  "50": "MS",
  "51": "MT",
  "52": "GO",
  "53": "DF",
};
app.innerHTML = `<header class="topbar"><div class="top-left"><div class="brand"><span class="logo" aria-hidden="true"><i></i><i></i><i></i></span>vértice<span style="color:#555;font-size:12px;margin-left:4px">/ 2026</span></div><div class="top-title">ELEIÇÕES GERAIS<b>Presidente da República · 2º turno</b></div></div><div class="top-right"><span class="top-date">DOMINGO, 25 OUTUBRO</span><span id="mode-badge" class="badge">OFICIAL</span><select id="mode" aria-label="Modo de dados"><option value="live">Dados oficiais</option><option value="simulation">Ensaio sintético</option></select></div></header>
<main id="dashboard"><div class="page-title"><div><div class="eyebrow">Painel de acompanhamento eleitoral</div><h1>O voto, em perspectiva.</h1></div><div class="tools"><button id="national" class="active">Brasil</button><button id="refresh" title="Atualizar os dados">↻ Atualizar</button></div></div><div id="notice" class="notice" role="status"></div><section class="scoreboard" aria-label="Placar presidencial" id="score"></section><nav class="section-nav" aria-label="Seções do painel"><div class="tabs"><button data-tab="overview" class="active">Visão geral</button><button data-tab="method">Método e cobertura</button><button data-tab="health">Diagnóstico da coleta</button></div><div id="coverage" class="coverage-line"></div></nav>
<div id="overview"><div class="dashboard"><section class="panel"><div class="panel-head"><h2>Evolução da apuração</h2><small id="graph-scope">Brasil</small></div><p class="panel-sub">Percentual de votos válidos por candidato</p><div class="legend"><span><i></i>Oficial</span><span><i class="projected"></i>Projeção</span><span>Faixa nominal 95%</span></div><div id="graph"></div><div id="chart-summary" class="chart-summary"></div><div class="chart-callout">O intervalo é nominal. O selo de vencedor permanece indisponível até validação independente.</div></section>
<section class="panel"><div class="panel-head"><h2>O Brasil, voto a voto</h2><div class="map-tools"><select id="map-mode" aria-label="Indicador no mapa"><option value="projection">Projeção por UF</option><option value="official">Apuração oficial por UF</option><option value="margin">Margem projetada</option></select></div></div><p class="panel-sub">Selecione um estado para explorar os resultados</p><div class="map-wrap"><span class="map-tag" id="map-tag">BRASIL / UNIDADES DA FEDERAÇÃO</span><svg class="map" id="map" viewBox="0 0 500 430" aria-label="Mapa do Brasil por estado" role="group"></svg><div class="map-controls"><button id="zoom-in" aria-label="Ampliar mapa">+</button><button id="zoom-out" aria-label="Reduzir mapa">−</button><button id="map-reset" aria-label="Restaurar mapa">↺</button></div></div><div class="map-foot"><span>Maioria A <i class="ramp"></i> Maioria B</span><span>Malha: IBGE · <span id="map-level">UF</span></span></div></section>
<section class="panel territories"><div class="panel-head"><h2>Territórios</h2><small>27 UFs + exterior</small></div><input id="search" class="territory-search" type="search" placeholder="Buscar estado ou região…" aria-label="Buscar território"><div id="territories" class="territory-list"></div></section></div>
<section class="panel replay" aria-label="Reprodução do histórico"><button id="play" aria-label="Reproduzir histórico">▶</button><div class="replay-title">Linha do tempo<small id="replay-label">Acompanhamento atual</small></div><input id="replay" type="range" min="0" max="0" value="0" aria-label="Instante do histórico"><span class="replay-time" id="replay-time">—</span><button id="return-live">Voltar ao vivo</button></section><div class="bottom-grid" id="metrics"></div></div><section id="details" class="panel details hidden"></section><footer class="footer"><span>VÉRTICE / ELEIÇÕES 2026 · Fonte oficial: Tribunal Superior Eleitoral · Horários de Brasília</span><span>Projeção experimental independente · Sem vínculo com o TSE</span></footer></main>`;
const $ = (id: string) => document.getElementById(id)!;
const municipalButton = document.createElement("button");
municipalButton.textContent = "Municípios";
municipalButton.className = "territory-clear";
municipalButton.title = "Explorar municípios da UF selecionada";
$("map-mode").parentElement!.append(municipalButton);
const historicalButton = document.createElement("button");
historicalButton.dataset.tab = "history";
historicalButton.textContent = "Comparação com 1º turno";
document.querySelector(".tabs")!.append(historicalButton);
($("mode") as HTMLSelectElement).value = mode;
const chosen = () => (index < 0 ? history.at(-1) : history[index]);
function scoped(s: Snapshot): { p: Projection; t: Territory | undefined } {
  const t = s.territories.find((t) => t.code === scope);
  return {
    p: t?.projection ?? (scope === "BR" ? s.projection : unavailable),
    t,
  };
}
function render() {
  const s = chosen();
  if (!s) {
    $("notice").textContent = error || "Conectando à fonte oficial…";
    return;
  }
  const { p, t } = scoped(s),
    official =
      t?.official ??
      (scope === "BR"
        ? index < 0 && s.mode === "live"
          ? (latestHealth?.official ?? s.official)
          : s.official
        : null),
    names = s.official?.candidates.map((c) => c.name) ?? [
      "Candidato A",
      "Candidato B",
    ];
  const missingSections = official
    ? Math.max(0, official.totalSections - p.modeledSections)
    : null;
  const stale =
    s.mode === "live" &&
    Date.now() -
      Date.parse(index < 0 ? (lastCheckedAt ?? s.createdAt) : s.createdAt) >
      120000;
  const collectionIssue =
    s.mode === "live" &&
    index < 0 &&
    ["stale", "error", "waiting"].includes(
      latestHealth?.collectionState ?? latestHealth?.state ?? s.health.state,
    );
  $("mode-badge").textContent =
    s.mode === "simulation"
      ? "ENSAIO SINTÉTICO"
      : index >= 0
        ? "REPLAY"
        : stale
          ? "DADOS ATRASADOS"
          : collectionIssue
            ? "COLETA PARCIAL"
            : "FONTE OFICIAL";
  $("mode-badge").className =
    `badge ${s.mode === "live" && !stale ? "live" : ""}`;
  $("notice").classList.toggle("error", !!error || stale || collectionIssue);
  $("notice").textContent =
    error ||
    (s.mode === "simulation"
      ? "ENSAIO · Todos os valores são fictícios. Este cenário serve para testar a interface e o motor."
      : stale
        ? "DADOS ATRASADOS · Exibindo a última versão íntegra recebida."
        : index < 0
          ? (latestHealth?.message ?? s.health.message)
          : s.health.message);
  if (official && s.mode === "live" && !error && !stale) {
    const decision = mathematicalDecision(
      official.a,
      official.b,
      official.remainingElectorate ?? null,
    );
    if (official.final && official.a !== official.b)
      $("notice").textContent =
        `TOTALIZAÇÃO OFICIAL ENCERRADA · ${names[official.a > official.b ? 0 : 1]} tem a maioria dos votos válidos.`;
    else if (decision)
      $("notice").textContent =
        `DEFINIÇÃO MATEMÁTICA · A vantagem de ${names[decision === "a" ? 0 : 1]} supera o eleitorado ainda não totalizado. Cálculo conservador sobre dados oficiais.`;
  }
  const card = (right: boolean) => {
    const share = right ? (p.share === null ? null : 1 - p.share) : p.share,
      lo = right ? (p.high === null ? null : 1 - p.high) : p.low,
      hi = right ? (p.low === null ? null : 1 - p.low) : p.high,
      ov = official ? (right ? official.b : official.a) : null;
    return `<div class="candidate ${right ? "right" : ""}"><div class="avatar">${right ? "B" : "A"}</div><div><div class="party">CANDIDATO ${right ? "B" : "A"} · ${s.identity.candidates[right ? 1 : 0]}</div><h2>${esc(names[right ? 1 : 0])}</h2><div class="projection-value">${pct(share).replace("%", "<span>%</span>")}</div><div class="interval">${p.available ? `${pct(lo)} — ${pct(hi)} · intervalo nominal` : "Projeção indisponível"}</div><div class="official-line">OFICIAL <b>${pct(official && official.valid ? ov! / official.valid : null)}</b> · ${num(ov)} votos</div></div></div>`;
  };
  $("score").innerHTML =
    card(false) +
    `<div class="score-center"><span class="progress-label">${scope === "BR" ? "Brasil" : esc(t?.name ?? scope)}</span><div class="progress-number">${pct(official?.progress ?? (s.mode === "simulation" ? p.progress : null), 1)}</div><span class="progress-label">${official ? "Seções totalizadas" : "Eleitorado observado"}</span><div class="progress-track"><i style="width:${100 * (official?.progress ?? p.progress)}%"></i></div><small>${s.mode === "simulation" ? "Dados fictícios" : "TSE · EA20"}</small></div>` +
    card(true) +
    `<div class="score-footer"><i style="width:${100 * (p.share ?? 0.5)}%"></i><i style="flex:1"></i></div>`;
  $("coverage").textContent =
    `Histórico: ${num(p.modeledSections)}${official ? " / " + num(official.totalSections) : ""} unidades · ${num(p.observedSections)} observadas`;
  $("graph-scope").textContent = t?.name ?? "Brasil";
  renderGraph(s);
  renderMap(s);
  renderTerritories(s);
  $("chart-summary").innerHTML =
    `<div><div class="stat-title">MARGEM PROJETADA</div><div class="stat-value">${p.share === null ? "—" : Math.abs(p.share * 200 - 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " pp"}</div><div class="stat-note">Entre os dois candidatos</div></div><div><div class="stat-title">OBSERVADO / UNIVERSO</div><div class="stat-value">${pct(p.progress, 1)}</div><div class="stat-note">Ponderado por eleitorado</div></div>`;
  const replay = $("replay") as HTMLInputElement;
  replay.max = String(Math.max(0, history.length - 1));
  replay.value = String(index < 0 ? history.length - 1 : index);
  $("replay-label").textContent =
    index < 0
      ? s.mode === "simulation"
        ? "Último instante do ensaio"
        : "Última versão recebida"
      : `Versão #${s.sequence} · reprodução`;
  $("replay-time").textContent = new Date(s.createdAt).toLocaleTimeString(
    "pt-BR",
    { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" },
  );
  $("return-live").textContent =
    s.mode === "simulation" ? "Ir ao fim do ensaio" : "Voltar ao vivo";
  $("metrics").innerHTML =
    `<article class="panel metric"><h3>Base histórica de referência</h3><div class="row"><span class="value">${num(p.modeledSections)} <small style="font-size:11px">unidades</small></span><span class="mini-label">${missingSections === null ? "Histórico correspondente" : `${num(missingSections)} sem histórico`}</span></div><p>Eleitorado de referência ${pct(p.coverage, 2)} (provisório). Unidades sem correspondência ficam fora do modelo.</p></article><article class="panel metric"><h3>Fonte oficial, coleta independente</h3><div class="row"><span class="value">${num(official?.countedSections)} <small style="font-size:12px">/ ${num(official?.totalSections)}</small></span><span class="mini-label">EA20</span></div><p>O total do TSE e os BUs coletados mantêm seus próprios relógios e denominadores.</p></article><article class="panel metric"><h3>Qualidade da projeção</h3><div class="row"><span class="value" style="font-size:18px;color:#e6bd78">Em validação</span><span class="mini-label">Método v2</span></div><p>Sem probabilidade de vitória. Selo de vencedor bloqueado até calibração e testes independentes.</p></article>`;
  renderDetails(
    index < 0 && latestHealth
      ? { ...s, health: { ...s.health, ...latestHealth } }
      : s,
  );
  $("overview").classList.toggle("hidden", tab !== "overview");
  $("details").classList.toggle("hidden", tab === "overview");
  document
    .querySelectorAll("[data-tab]")
    .forEach((b) =>
      b.classList.toggle("active", (b as HTMLElement).dataset.tab === tab),
    );
  $("national").classList.toggle("active", scope === "BR");
}
function renderGraph(s: Snapshot) {
  const series = history
    .filter((x) => x.sequence <= s.sequence)
    .map((x) => {
      const { p, t } = scoped(x);
      return {
        p,
        official: t?.official ?? (scope === "BR" ? x.official : null),
      };
    });
  if (!series.some((x) => x.p.available || x.official?.valid)) {
    $("graph").innerHTML =
      '<div class="chart-empty">Aguardando votos.<br>O gráfico aparecerá quando houver dados.</div>';
    return;
  }
  const width = 320,
    height = 250,
    left = 37,
    right = 303,
    top = 16,
    bottom = 214,
    ys = series
      .flatMap((x) => [
        x.p.low,
        x.p.high,
        x.official?.valid ? x.official.a / x.official.valid : null,
      ])
      .filter((x) => x !== null) as number[];
  const min = Math.max(0, Math.min(0.4, ...ys) - 0.02),
    max = Math.min(1, Math.max(0.6, ...ys) + 0.02),
    y = (q: number) => bottom - ((q - min) / (max - min)) * (bottom - top),
    x = (i: number) =>
      left + (i / Math.max(1, series.length - 1)) * (right - left);
  let svg = `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Histórico de votos oficiais e projeção com intervalo nominal"><defs><clipPath id="plot"><rect x="${left}" y="${top}" width="${right - left}" height="${bottom - top}"/></clipPath></defs>`;
  for (let i = 0; i < 5; i++) {
    const v = min + ((max - min) * i) / 4;
    svg += `<line x1="${left}" y1="${y(v)}" x2="${right}" y2="${y(v)}" stroke="#292929"/><text x="${left - 7}" y="${y(v) + 3}" text-anchor="end">${Math.round(v * 100)}%</text>`;
  }
  svg += `<g clip-path="url(#plot)"><line x1="${left}" y1="${y(0.5)}" x2="${right}" y2="${y(0.5)}" stroke="#777" stroke-dasharray="3 4"/>`;
  const available = series
    .map((v, i) => ({ ...v, i }))
    .filter((v) => v.p.available);
  if (available.length) {
    for (const invert of [false, true]) {
      const points = available
        .map((v) => `${x(v.i)},${y(invert ? 1 - v.p.high! : v.p.low!)}`)
        .concat(
          [...available]
            .reverse()
            .map((v) => `${x(v.i)},${y(invert ? 1 - v.p.low! : v.p.high!)}`),
        );
      svg += `<polygon points="${points.join(" ")}" fill="${invert ? "#f43f5e" : "#3b82f6"}" opacity=".12"/>`;
    }
  }
  for (const invert of [false, true]) {
    const color = invert ? "#fb7185" : "#60a5fa";
    const line = (projected: boolean) => {
      let d = "",
        prev = -2;
      for (let i = 0; i < series.length; i++) {
        const v = series[i],
          q = projected
            ? v.p.share
            : v.official?.valid
              ? v.official.a / v.official.valid
              : null;
        if (q === null) continue;
        d += `${i === prev + 1 ? "L" : "M"}${x(i)} ${y(invert ? 1 - q : q)} `;
        prev = i;
      }
      return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" ${projected ? 'stroke-dasharray="5 4"' : ""}/>`;
    };
    svg += line(false) + line(true);
  }
  svg += "</g>";
  for (const i of [0, Math.floor((series.length - 1) / 2), series.length - 1])
    svg += `<text x="${x(i)}" y="236" text-anchor="middle">${new Date(history[i].createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}</text>`;
  $("graph").innerHTML = svg + "</svg>";
}
function renderTerritories(s: Snapshot) {
  const rows = s.territories
    .filter((t) => (municipalUf ? t.parent === municipalUf : !t.parent))
    .filter((t) =>
      (t.name + " " + t.code + " " + t.region)
        .toLocaleLowerCase("pt-BR")
        .includes(query.toLocaleLowerCase("pt-BR")),
    );
  $("territories").innerHTML =
    rows
      .map((t) => {
        const p = t.projection,
          share =
            mapMode === "official"
              ? t.official?.valid
                ? t.official.a / t.official.valid
                : null
              : p.share,
          leading = share === null ? null : Math.max(share, 1 - share);
        return `<button class="territory-row ${scope === t.code ? "active" : ""}" data-scope="${esc(t.code)}" aria-label="Selecionar ${esc(t.name)}"><span class="uf-tag">${t.parent ?? t.code}</span><span class="territory-name">${esc(t.name)}<small>${pct(mapMode === "official" ? t.official?.progress : p.progress, 1)} ${mapMode === "official" ? "apurado" : "do eleitorado observado"}</small><span class="tiny-bar"><i style="width:${(share ?? 0.5) * 100}%"></i><i style="flex:1"></i></span></span><span class="territory-value ${share !== null && share < 0.5 ? "red" : ""}">${pct(leading, 1)}<small>${share === null ? "SEM DADOS" : share >= 0.5 ? "A LIDERA" : "B LIDERA"}</small></span></button>`;
      })
      .join("") || '<p class="no-results">Nenhum território encontrado.</p>';
  $("territories")
    .querySelectorAll<HTMLElement>("[data-scope]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          municipalLoads.begin();
          scope = b.dataset.scope!;
          render();
        }),
    );
}
function renderMap(s: Snapshot) {
  if (!geo) {
    $("map").innerHTML =
      '<text x="250" y="210" text-anchor="middle">Carregando malha do IBGE…</text>';
    return;
  }
  const activeGeo = municipalUf && municipalGeo ? municipalGeo : geo;
  const coords: number[][] = [];
  function vertices(v: any) {
    if (typeof v[0] === "number") coords.push(v);
    else for (const c of v) vertices(c);
  }
  for (const f of activeGeo.features) vertices(f.geometry.coordinates);
  const [minLon, maxLon, minLat, maxLat] = coords.reduce(
    (b, p) => [
      Math.min(b[0], p[0]),
      Math.max(b[1], p[0]),
      Math.min(b[2], p[1]),
      Math.max(b[3], p[1]),
    ],
    [Infinity, -Infinity, Infinity, -Infinity],
  );
  const scale = Math.min(440 / (maxLon - minLon), 380 / (maxLat - minLat));
  const pos = (p: number[]) => [
    (p[0] - (minLon + maxLon) / 2) * scale + 250,
    ((minLat + maxLat) / 2 - p[1]) * scale + 215,
  ];
  let content = "";
  for (const feature of activeGeo.features) {
    const t =
        municipalUf && municipalGeo
          ? s.territories.find(
              (t) =>
                t.parent === municipalUf &&
                t.ibge === String(feature.properties.codarea),
            )
          : s.territories.find(
              (t) => t.code === IBGE[feature.properties.codarea],
            ),
      code = t?.code;
    if (!t) continue;
    const q =
      mapMode === "official"
        ? t.official?.valid
          ? t.official.a / t.official.valid
          : null
        : t.projection.share;
    const color =
      q === null
        ? "#30343b"
        : q >= 0.5
          ? `hsl(215 70% ${Math.max(29, 48 - Math.abs(q - 0.5) * 35)}%)`
          : `hsl(347 72% ${Math.max(29, 48 - Math.abs(q - 0.5) * 35)}%)`;
    const polygons =
      feature.geometry.type === "MultiPolygon"
        ? feature.geometry.coordinates
        : [feature.geometry.coordinates];
    let path = "";
    let largest: number[][] = [];
    for (const polygon of polygons) {
      if (polygon[0].length > largest.length) largest = polygon[0];
      for (const ring of polygon)
        path +=
          ring
            .map(
              (p: number[], i: number) => `${i ? "L" : "M"}${pos(p).join(",")}`,
            )
            .join("") + "Z";
    }
    const centroid = largest.reduce(
        (a, p) => [a[0] + p[0] / largest.length, a[1] + p[1] / largest.length],
        [0, 0],
      ),
      [cx, cy] = pos(centroid);
    content += `<path data-uf="${code}" class="${scope === code ? "selected" : ""}" d="${path}" fill="${color}" fill-rule="evenodd" tabindex="0" role="button" aria-label="${esc(t.name)}: ${q === null ? "sem dados" : pct(q)} para A"><title>${esc(t.name)} · ${q === null ? "Sem dados" : pct(q) + " para A"}</title></path>${municipalUf ? "" : `<text x="${cx}" y="${cy}">${code}</text>`}`;
  }
  $("map").innerHTML =
    `<g transform="translate(${250 - 250 * zoom},${215 - 215 * zoom}) scale(${zoom})">${content}</g>`;
  $("map")
    .querySelectorAll<SVGElement>("[data-uf]")
    .forEach((p) => {
      const select = () => {
        municipalLoads.begin();
        scope = p.dataset.uf!;
        render();
      };
      p.onclick = select;
      p.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          select();
        }
      };
    });
  $("map-tag").textContent = municipalUf
    ? `${municipalUf} / MUNICÍPIOS`
    : scope === "BR"
      ? "BRASIL / UNIDADES DA FEDERAÇÃO"
      : `${s.territories.find((t) => t.code === scope)?.name ?? scope} / UF SELECIONADA`;
  $("map-level").textContent = municipalUf ? "Municípios" : "UF";
}
async function loadMunicipalities(uf: string) {
  const generation=municipalLoads.begin();
  const requestedScope=scope;
  const s = chosen();
  if (!s || s.mode === "simulation") {
    error =
      "Navegação municipal usa a base oficial importada. Selecione Dados oficiais.";
    render();
    return;
  }
  try {
    const r = await fetch(
      `${api}/api/municipalities?uf=${encodeURIComponent(uf)}&sequence=${s.sequence}&compressed=1`,
    );
    if (!r.ok)
      throw Error(
        "Dados municipais indisponíveis para esta versão. Execute a coleta com base importada.",
      );
    const payload = await r.json(),
      rows: Territory[] = Array.isArray(payload)
        ? payload
        : (
            await Promise.all(
              payload.pages.map(async (p: string) =>
                JSON.parse(await gunzipText(p)),
              ),
            )
          ).flat();
    for (const t of rows) {
      if (t.parent !== uf) throw Error("Contrato municipal inválido");
    }
    if (!municipalLoads.current(generation,requestedScope,scope) || chosen()?.id !== s.id) return;
    s.territories = [...s.territories.filter((t) => t.parent !== uf), ...rows];
    const entering = municipalUf !== uf;
    municipalUf = uf;
    if (!rows.some((t) => t.code === scope)) scope = uf;
    if (entering) {
      query = "";
      ($("search") as HTMLInputElement).value = "";
      municipalGeo = null;
      zoom = 1;
    }
    error = "";
    render();
    const code = Object.entries(IBGE).find(([, v]) => v === uf)?.[0];
    if (code && !municipalGeo) {
      const g = await fetch(
        `https://servicodados.ibge.gov.br/api/v3/malhas/estados/${code}?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=municipio`,
      ).then((r) => r.json());
      if (municipalLoads.current(generation) && municipalUf === uf) {
        municipalGeo = g;
        render();
      }
    }
  } catch (e) {
    if(!municipalLoads.current(generation)) return;
    error = String(e).replace(/^Error: /, "");
    render();
  }
}
municipalButton.onclick = () => {
  const uf = scope.split("/")[0];
  if (uf === "BR" || uf === "ZZ") {
    error =
      "Selecione uma UF no mapa ou na lista para explorar seus municípios.";
    render();
    return;
  }
  void loadMunicipalities(uf);
};
function renderDetails(s: Snapshot) {
  if (tab === "history") {
    $("details").innerHTML =
      `<h2>Comparação com o primeiro turno de 2026</h2><p>Mesmo conjunto de seções, reagrupadas pelas correspondências verificadas. Percentuais de 1º turno usam todos os votos válidos, incluindo outros candidatos. Projeção 2º turno usa apenas os dois finalistas.</p><div style="overflow:auto"><table style="width:100%;border-collapse:collapse;margin-top:18px"><thead><tr><th align="left">Território</th><th>A · 1º turno</th><th>B · 1º turno</th><th>Outros · 1º turno</th><th>A · projeção 2º turno</th></tr></thead><tbody>${s.territories
        .filter((t) => (municipalUf ? t.parent === municipalUf : !t.parent))
        .map((t) => {
          const h = t.historical;
          return `<tr><td style="padding:8px;border-bottom:1px solid #292929">${esc(t.name)}</td><td align="center">${pct(h?.valid ? h.a / h.valid : null)}</td><td align="center">${pct(h?.valid ? h.b / h.valid : null)}</td><td align="center">${pct(h?.valid ? h.other / h.valid : null)}</td><td align="center">${pct(t.projection.share)}</td></tr>`;
        })
        .join("")}</tbody></table></div>`;
    return;
  }
  $("details").innerHTML =
    tab === "method"
      ? `<h2>Método e cobertura</h2><p>Projeção = votos observados + estimativa dos votos restantes no mesmo universo. Transferência líquida por UF/capital/interior e swing logit hierárquico BR → região → UF → município. A mistura muda gradualmente entre 5% e 15% do eleitorado observado.</p><dl><dt>Universo modelado</dt><dd>${num(s.projection.modeledSections)} unidades · cobertura ${pct(s.projection.coverage)}</dd><dt>Intervalo</dt><dd>Bootstrap por municípios e componentes correlacionados nacional/UF. Faixa nominal de 95%, cobertura empírica ainda não validada.</dd><dt>Histórico ausente</dt><dd>Excluído do universo modelado e explicitado na cobertura. Sem expansão para representar o país.</dd><dt>Selo de vencedor</dt><dd>Bloqueado. Probabilidade de vitória não calculada.</dd><dt>Municípios e comparação histórica</dt><dd>Dependem de base e correspondências oficiais completas. A seleção de UF permite explorar seus municípios; a comparação usa o universo correspondente.</dd></dl><p>O dado oficial EA20 é independente da coleta de BUs. Correções substituem versões anteriores. Dados sintéticos servem apenas para ensaios.</p>`
      : `<h2>Diagnóstico da coleta</h2><dl><dt>Versão do painel</dt><dd>${esc(s.id)} · #${s.sequence}</dd><dt>Modo</dt><dd>${s.mode === "simulation" ? "Ensaio sintético" : "Oficial / coleta real"}</dd><dt>Fonte oficial gerada em</dt><dd>${esc(s.health.sourceTime ?? "Indisponível")}</dd><dt>Snapshot criado em</dt><dd>${esc(s.createdAt)}</dd><dt>Último BU coletado</dt><dd>${esc(s.health.collectedAt ?? "Nenhum")}</dd><dt>Hash da base</dt><dd>${esc(s.health.baseHash ?? "Base não importada")}</dd><dt>Modelo</dt><dd>${esc(s.health.modelVersion)} · calibração independente pendente</dd><dt>Estado reportado</dt><dd>${esc(s.health.state)} · ${esc(s.health.message)}</dd><dt>Continuidade da coleta</dt><dd>Acompanhe os horários e o estado dos grupos. Falhas ou ausência de confirmações recentes são sinalizadas no painel.</dd></dl>`;
  if (tab === "health") {
    const dl = $("details").querySelector("dl")!;
    for (const [label, value] of [
      [
        "Sem correspondência histórica",
        s.health.unmatchedSections ?? "Não aferido",
      ],
      [
        "Eleitorado individual desconhecido",
        s.health.unknownElectorateSections ?? "Não aferido",
      ],
      ["Fila de coleta", s.health.queue],
      ["Diferenças de eleitorado 1T/BU atual", s.health.electorateDifferences ?? 0],
      ["Hash do modelo", s.health.modelHash ?? "Não informado"],
      ["Hash da configuração", s.health.configHash ?? "Não informado"],
    ]) {
      const dt = document.createElement("dt"),
        dd = document.createElement("dd");
      dt.textContent = String(label);
      dd.textContent = String(value);
      dl.append(dt, dd);
    }
  }
}
async function load() {
  const generation = loads.begin();
  try {
    if (mode === "simulation") {
      history = makeDemo();
      index = -1;
      error = "";
      render();
      return;
    }
    const [latestResponse, historyResponse, healthResponse] = await Promise.all(
      [
        fetch(`${api}/api/latest`, { cache: "no-store" }),
        fetch(`${api}/api/history`, { cache: "no-store" }),
        fetch(`${api}/api/health`, { cache: "no-store" }),
      ],
    );
    if (!latestResponse.ok)
      throw Error(
        `Fonte indisponível (${latestResponse.status}). A última versão será preservada.`,
      );
    const latest = (await latestResponse.json()) as Snapshot,
      firstPage = await readHistoryPage<Snapshot>(historyResponse);
    if (!loads.current(generation)) return;
    const previous=await loadHistory(firstPage,async before=>{
      if(!loads.current(generation)) throw Error("History loading cancelled");
      const r=await fetch(`${api}/api/history?before=${before}`,{cache:"no-store"});
      return await readHistoryPage<Snapshot>(r);
    },history);
    if(!loads.current(generation)) return;
    latestHealth = healthResponse.ok ? await healthResponse.json() : null;
    lastCheckedAt = latestHealth?.checkedAt ?? null;
    if (!loads.current(generation)) return;
    validateSnapshot(latest);
    previous.forEach(validateSnapshot);
    if (latest.mode !== "live" || latest.schemaVersion !== 1)
      throw Error("Contrato de dados incompatível");
    const replaySnapshot = index >= 0 ? history[index] : null;
    history = [...previous.filter((x) => x.id !== latest.id), latest].sort(
      (a, b) => a.sequence - b.sequence,
    );
    if (replaySnapshot) {
      index = history.findIndex((x) => x.id === replaySnapshot.id);
      if (index < 0) {
        history.push(replaySnapshot);
        history.sort((a, b) => a.sequence - b.sequence);
        index = history.findIndex((x) => x.id === replaySnapshot.id);
      }
    }
    error = "";
    render();
    if (municipalUf) void loadMunicipalities(municipalUf);
  } catch (e) {
    if (!loads.current(generation)) return;
    error = String(e).replace(/^Error: /, "");
    render();
  }
}
$("mode").onchange = () => {
  municipalLoads.begin();
  latestHealth=null; lastCheckedAt=null;
  mode = ($("mode") as HTMLSelectElement).value;
  history = [];
  index = -1;
  scope = "BR";
  municipalUf = null;
  municipalGeo = null;
  playing = false;
  void load();
};
$("refresh").onclick = () => void load();
$("national").onclick = () => {
  municipalLoads.begin();
  scope = "BR";
  municipalUf = null;
  municipalGeo = null;
  render();
};
document.querySelectorAll<HTMLElement>("[data-tab]").forEach(
  (b) =>
    (b.onclick = () => {
      tab = b.dataset.tab!;
      render();
    }),
);
$("search").oninput = () => {
  query = ($("search") as HTMLInputElement).value;
  const s = chosen();
  if (s) renderTerritories(s);
};
$("map-mode").onchange = () => {
  mapMode = ($("map-mode") as HTMLSelectElement).value;
  render();
};
$("zoom-in").onclick = () => {
  zoom = Math.min(2.5, zoom + 0.25);
  render();
};
$("zoom-out").onclick = () => {
  zoom = Math.max(0.75, zoom - 0.25);
  render();
};
$("map-reset").onclick = () => {
  municipalLoads.begin();
  zoom = 1;
  scope = "BR";
  municipalUf=null; municipalGeo=null;
  render();
};
$("replay").oninput = () => {
  index = Number(($("replay") as HTMLInputElement).value);
  render();
  if (municipalUf) void loadMunicipalities(municipalUf);
};
$("return-live").onclick = () => {
  index = -1;
  playing = false;
  $("play").textContent = "▶";
  render();
  if (municipalUf) void loadMunicipalities(municipalUf);
};
$("play").onclick = () => {
  playing = !playing;
  $("play").textContent = playing ? "Ⅱ" : "▶";
  if (playing && index < 0) index = 0;
};
setInterval(() => {
  if (playing) {
    if (index >= history.length - 1) {
      playing = false;
      $("play").textContent = "▶";
    } else {
      index++;
      render();
      if (municipalUf) void loadMunicipalities(municipalUf);
    }
  }
}, 750);
setInterval(() => {
  if (mode === "live" && index < 0) void load();
}, 15000);
fetch("/br-uf.geojson")
  .then((r) => {
    if (!r.ok) throw Error("map unavailable");
    return r.json();
  })
  .then((g) => {
    geo = g;
    render();
  })
  .catch(() => {
    $("map").innerHTML =
      '<text x="250" y="210" text-anchor="middle">Malha indisponível. Use a lista de territórios.</text>';
  });
void load();
