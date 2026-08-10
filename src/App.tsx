import { useEffect, useMemo, useState, type CSSProperties } from "react";
import MarketGlobe, { type MarketPoint } from "./MarketGlobe";
import {
  ChevronDown,
  FileText,
  Filter,
  MapPin,
  Pause,
  Play,
  Search,
  X,
} from "lucide-react";

type Report = {
  id: string;
  title: string;
  date: string;
  period: string;
  region: string;
  country: string;
  market: string;
  propertyTypes: string[];
  summary: string;
  detailUrl: string;
  pdfUrl: string;
  localPdf: string | null;
  lat: number;
  lng: number;
};
type Catalog = {
  reports: Report[];
  meta: {
    reportCount: number;
    markets: number;
    countries: number;
    periods: string[];
  };
};
type Observation = {
  metric: string;
  value: number;
  value_text: string;
  unit: string;
  currency: string | null;
  source_page: number;
  source_file: string;
  confidence: number;
};
type PreviewMetric = {
  label: string;
  value: string;
  detail: string;
  sourcePage?: number;
};
type ReportPreview = {
  mode: "source" | "pending";
  scope: string;
  metrics: PreviewMetric[];
};
type SavedView = {
  name: string;
  region: string;
  sector: string;
  month: string;
  query: string;
  period: string;
};
const toQuarter = (month: string) => {
  const quarterMatch = month.match(/^(\d{4})-Q([1-4])$/);
  if (quarterMatch) return `${quarterMatch[1]} Q${quarterMatch[2]}`;
  const match = month.match(/^(\d{4})\/(\d{2})$/);
  if (!match) return month;
  return `${match[1]} Q${Math.ceil(Number(match[2]) / 3)}`;
};
const hasLocation = (report: Report) =>
  Number.isFinite(report.lat) &&
  Number.isFinite(report.lng) &&
  report.lat !== 0 &&
  report.lng !== 0;
const canonicalRegion = (value: string) => {
  const parts = value.split(";").map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1 && !parts.every((part) => part === "Europe" || part === "Nordics")) {
    return "Global / Multi-region";
  }
  if (parts.includes("Americas")) return "Americas";
  if (parts.includes("Europe") || parts.includes("Nordics")) return "Europe";
  if (parts.includes("APAC")) return "APAC";
  if (parts.includes("MENAT")) return "Middle East & Africa";
  if (parts.includes("Global")) return "Global / Multi-region";
  return "Other";
};
const REGION_ORDER = ["Americas", "Europe", "APAC", "Middle East & Africa", "Global / Multi-region", "Other"];
const metricFamily = (metric: string) => {
  const value = metric.toLowerCase();
  if (value.includes("rent")) return "Rent";
  if (value.includes("yield")) return "Yield";
  if (value.includes("vacancy")) return "Vacancy";
  if (value.includes("investment") || value.includes("transaction")) return "Investment volume";
  if (value.includes("leasing") || value.includes("take-up") || value.includes("take up")) return "Leasing activity";
  return metric;
};
const normalizedMetricLabel = (observation: Observation) => {
  const family = metricFamily(observation.metric);
  const unit = observation.unit?.trim();
  if (family === "Yield" || family === "Vacancy") return `${family} · %`;
  if (family === "Investment volume" && unit) return `${family} · ${unit}`;
  return family;
};
export default function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null),
    [observations, setObservations] = useState<Observation[]>([]),
    [region, setRegion] = useState("All"),
    [sector, setSector] = useState("All"),
    [month, setMonth] = useState("All"),
    [query, setQuery] = useState(""),
    [period, setPeriod] = useState(""),
    [selection, setSelection] = useState<{ reports: Report[]; index: number } | null>(null),
    [playing, setPlaying] = useState(false),
    [panel, setPanel] = useState(true),
    [compareMarket, setCompareMarket] = useState(""),
    [compareOpen, setCompareOpen] = useState(false),
    [savedViews, setSavedViews] = useState<SavedView[]>([]),
    [savedViewsLoaded, setSavedViewsLoaded] = useState(false);
  const selected = selection?.reports[selection.index] ?? null;
  useEffect(() => {
    fetch("/data/catalog.json")
      .then((r) => r.json())
      .then((d: Catalog) => {
        setCatalog(d);
        const quarters = Array.from(new Set(d.meta.periods.map(toQuarter))).sort();
        const latestSubstantial = [...quarters].reverse().find((quarter) =>
          d.reports.filter((report) => toQuarter(report.period) === quarter && hasLocation(report)).length >= 50,
        );
        setPeriod(latestSubstantial ?? quarters.at(-1) ?? "");
      });
  }, []);
  useEffect(() => {
    try {
      setSavedViews(JSON.parse(window.localStorage.getItem("cbre-atlas-saved-views") || "[]"));
    } catch {
      setSavedViews([]);
    }
    setSavedViewsLoaded(true);
  }, []);
  useEffect(() => {
    if (savedViewsLoaded) window.localStorage.setItem("cbre-atlas-saved-views", JSON.stringify(savedViews));
  }, [savedViews, savedViewsLoaded]);
  useEffect(() => {
    fetch("/data/observations.json")
      .then((r) => (r.ok ? r.json() : []))
      .then(setObservations)
      .catch(() => setObservations([]));
  }, []);
  const regions = useMemo(
    () => ["All", ...REGION_ORDER.filter((value) => catalog?.reports.some((report) => canonicalRegion(report.region) === value))],
    [catalog],
  );
  const sectors = useMemo(
    () => ["All", ...new Set(catalog?.reports.flatMap((r) => r.propertyTypes))],
    [catalog],
  );
  const months = useMemo(
    () => ["All", ...(catalog?.meta.periods.filter((value) => /^\d{4}\/\d{2}$/.test(value)) ?? [])],
    [catalog],
  );
  const quarters = useMemo(
    () => Array.from(new Set((catalog?.meta.periods ?? []).map(toQuarter))).sort(),
    [catalog],
  );
  const reports = useMemo(
    () =>
      catalog?.reports.filter(
        (r) =>
          (region === "All" || canonicalRegion(r.region) === region) &&
          (sector === "All" || r.propertyTypes.includes(sector)) &&
          (month === "All" || r.period === month) &&
          (!query ||
            `${r.title} ${r.market} ${r.country}`
              .toLowerCase()
              .includes(query.toLowerCase())),
      ) ?? [],
    [catalog, region, sector, month, query],
  );
  const quarterSignals = useMemo(() => {
    const counts = quarters.map((quarter) =>
      reports.filter((report) => toQuarter(report.period) === quarter).length,
    );
    const maxCount = Math.max(...counts, 1);
    return quarters.map((quarter, index) => ({
      quarter,
      count: counts[index],
      strength: Math.max(0.12, counts[index] / maxCount),
    }));
  }, [quarters, reports]);
  const periodReports = useMemo(
    () => reports.filter((r) => !period || toQuarter(r.period) === period),
    [reports, period],
  );
  const mappedPeriodReports = useMemo(
    () => periodReports.filter(hasLocation),
    [periodReports],
  );
  const points = useMemo(
    () =>
      Object.values(
        mappedPeriodReports.reduce<
          Record<
            string,
            {
              lat: number;
              lng: number;
              market: string;
              count: number;
              color: string;
              reports: Report[];
            }
          >
        >((a, r) => {
          // Identical coordinates are one physical signal. Some report records use
          // a shared national fallback coordinate; rendering each as a separate
          // point creates a stack of unreachable beacons.
          const k = `${r.lat.toFixed(5)}-${r.lng.toFixed(5)}`;
          a[k] ??= {
            lat: r.lat,
            lng: r.lng,
            market: r.market,
            count: 0,
            color: "#00a65a",
            reports: [],
          };
          a[k].count++;
          a[k].reports.push(r);
          return a;
        }, {}),
      ),
    [mappedPeriodReports],
  );
  const observationsBySource = useMemo(() => {
    const bySource = new Map<string, Observation[]>();
    observations.forEach((observation) => {
      const current = bySource.get(observation.source_file) ?? [];
      current.push(observation);
      bySource.set(observation.source_file, current);
    });
    return bySource;
  }, [observations]);
  const extractedReportIds = useMemo(
    () => new Set(
      (catalog?.reports ?? [])
        .filter((report) => Boolean(report.localPdf && observationsBySource.has(report.localPdf)))
        .map((report) => report.id),
    ),
    [catalog, observationsBySource],
  );
  const selectedScope = useMemo(() => {
    if (!selected || !catalog) return { name: "", reports: [] as Report[] };
    const marketReports = catalog.reports.filter(
      (report) => report.market === selected.market && report.country === selected.country,
    );
    if (marketReports.length >= 3) return { name: selected.market, reports: marketReports };
    return { name: selected.country, reports: catalog.reports.filter((report) => report.country === selected.country) };
  }, [catalog, selected]);
  const selectedTrend = useMemo(() => quarters.map((quarter) => ({
    quarter,
    count: selectedScope.reports.filter((report) => toQuarter(report.period) === quarter).length,
  })), [quarters, selectedScope]);
  const selectedPulse = useMemo(() => {
    if (!selectedScope.reports.length) return 0;
    const current = selectedTrend.find((item) => item.quarter === period)?.count ?? 0;
    const peak = Math.max(...selectedTrend.map((item) => item.count), 1);
    const extracted = selectedScope.reports.filter((report) => extractedReportIds.has(report.id)).length;
    const volume = Math.min(45, (current / peak) * 45);
    const depth = Math.min(35, (selectedScope.reports.length / 12) * 35);
    const coverage = (extracted / selectedScope.reports.length) * 20;
    return Math.round(volume + depth + coverage);
  }, [extractedReportIds, period, selectedScope, selectedTrend]);
  const marketOptions = useMemo(
    () => Array.from(new Set((catalog?.reports ?? []).map((report) => report.market))).sort(),
    [catalog],
  );
  const compareSnapshot = useMemo(() => {
    if (!compareMarket || !catalog) return null;
    const comparisonReports = catalog.reports.filter((report) => report.market === compareMarket);
    const current = comparisonReports.filter((report) => toQuarter(report.period) === period).length;
    const direct = comparisonReports.filter((report) => extractedReportIds.has(report.id)).length;
    return { reports: comparisonReports.length, current, direct, quarters: new Set(comparisonReports.map((report) => toQuarter(report.period))).size };
  }, [catalog, compareMarket, extractedReportIds, period]);
  const selectedPreview = useMemo<ReportPreview | null>(() => {
    if (!selected || !catalog) return null;

    const sourceMetrics = selected.localPdf
      ? observationsBySource.get(selected.localPdf)?.slice(0, 6) ?? []
      : [];
    if (sourceMetrics.length) {
      return {
        mode: "source",
        scope: "Extracted report figures",
        metrics: sourceMetrics.map((observation) => ({
          label: normalizedMetricLabel(observation),
          value: observation.value_text || `${observation.value} ${observation.unit}`,
          detail: `p. ${observation.source_page} · ${Math.round(observation.confidence * 100)}% confidence`,
          sourcePage: observation.source_page,
        })),
      };
    }

    const marketReports = catalog.reports.filter(
      (report) => report.market === selected.market && report.country === selected.country,
    );
    const scopeReports = marketReports.length >= 3
      ? marketReports
      : catalog.reports.filter((report) => report.country === selected.country);
    const scope = marketReports.length >= 3 ? selected.market : selected.country;
    const scopeQuarters = Array.from(new Set(scopeReports.map((report) => toQuarter(report.period))));
    const currentQuarterReports = scopeReports.filter(
      (report) => toQuarter(report.period) === period,
    );
    const propertyTypes = new Set(scopeReports.flatMap((report) => report.propertyTypes));
    const average = scopeQuarters.length ? scopeReports.length / scopeQuarters.length : 0;
    const earliest = [...scopeReports]
      .sort((a, b) => a.period.localeCompare(b.period))[0]?.period;

    return {
      mode: "pending",
      scope: `Extraction pending · ${scope} market benchmark`,
      metrics: [
        { label: "Reports this quarter", value: String(currentQuarterReports.length), detail: period || "active period" },
        { label: "Average report volume", value: average.toFixed(1), detail: "reports per quarter" },
        { label: "Indexed report series", value: String(scopeReports.length), detail: `${scopeQuarters.length} quarters covered` },
        { label: "Property coverage", value: String(propertyTypes.size), detail: "property types" },
        { label: "First report indexed", value: earliest ? toQuarter(earliest) : "—", detail: "catalog history" },
        { label: "Source report", value: selected.period || "—", detail: "selected CBRE report" },
      ],
    };
  }, [catalog, observationsBySource, period, selected]);
  useEffect(() => {
    if (!playing || !catalog) return;
    const timer = setInterval(
      () =>
        setPeriod((p) => {
          const i = quarters.indexOf(p);
          return quarters[(i + 1) % quarters.length];
        }),
      1200,
    );
    return () => clearInterval(timer);
  }, [playing, catalog, quarters]);
  if (!catalog)
    return (
      <main className="loading">
        Loading the CBRE market intelligence atlas…
      </main>
    );
  const selectPoint = (p: MarketPoint, reportIndex = 0) =>
    setSelection({ reports: p.reports, index: reportIndex });
  const applyView = (view: SavedView) => {
    setRegion(view.region);
    setSector(view.sector);
    setMonth(view.month);
    setQuery(view.query);
    setPeriod(view.period);
  };
  const peakQuarter = quarterSignals.reduce(
    (peak, signal) => signal.count > peak.count ? signal : peak,
    quarterSignals[0] ?? { quarter: period, count: 0, strength: 0 },
  ).quarter;
  const presetViews: SavedView[] = [
    { name: "US Office", region: "Americas", sector: "Office", month: "All", query: "", period },
    { name: "Europe Logistics", region: "Europe", sector: "Industrial and Logistics", month: "All", query: "", period },
    { name: "High activity", region: "All", sector: "All", month: "All", query: "", period: peakQuarter },
  ];
  const saveCurrentView = () => {
    const name = window.prompt("Name this saved view");
    if (!name?.trim()) return;
    setSavedViews((current) => [...current, { name: name.trim(), region, sector, month, query, period }]);
  };
  return (
    <main className={`atlas ${panel ? "filters-open" : ""}`}>
      <header>
        <div className="brand">
          <span className="brand-logo" aria-label="CBRE">CBRE</span>
          <span className="brand-rule" />
          <i>MARKET ATLAS</i>
        </div>
        <div className="header-meta">
          GLOBAL REAL ESTATE INTELLIGENCE <span>•</span>{" "}
          {catalog.meta.reportCount.toLocaleString()} REPORTS
        </div>
        <button
          className="icon-button"
          onClick={() => setPanel(!panel)}
          aria-label="Toggle filters"
        >
          <Filter size={15} />
          <span>{panel ? "HIDE FILTERS" : "FILTERS"}</span>
        </button>
      </header>
      <div className="globe-wrap">
        <MarketGlobe
          points={points}
          selectedReportId={selected?.id}
          extractedReportIds={extractedReportIds}
          onSelect={selectPoint}
        />
        <div className="hint">
          CLICK A BEACON <span>↗</span>
        </div>
      </div>
      {panel && (
        <aside className="filters">
          <div className="filter-title">
            Explore signals{" "}
            <button onClick={() => setPanel(false)}>
              <X size={16} />
            </button>
          </div>
          <label>
            <Search size={15} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search market or report"
            />
          </label>
          <div className="filter-selects">
            <Select
              label="Region"
              value={region}
              values={regions}
              set={setRegion}
            />
            <Select
              label="Property type"
              value={sector}
              values={sectors}
              set={setSector}
            />
            <Select
              label="Month"
              value={month}
              values={months}
              set={(value) => {
                setMonth(value);
                if (value !== "All") setPeriod(toQuarter(value));
              }}
            />
          </div>
          <div className="saved-views">
            <span>QUICK VIEWS</span>
            <div>
              {presetViews.map((view) => (
                <button key={view.name} onClick={() => applyView(view)}>{view.name}</button>
              ))}
            </div>
            <div className="saved-view-actions">
              <button onClick={saveCurrentView}>+ SAVE CURRENT VIEW</button>
              {savedViews.map((view, index) => (
                <button key={`${view.name}-${index}`} onClick={() => applyView(view)}>{view.name}</button>
              ))}
            </div>
          </div>
          <div className="filter-stats">
            <div className="filter-count">
              <b>{reports.length.toLocaleString()}</b> catalog reports
            </div>
            <div className="filter-count active-count">
              <b>{mappedPeriodReports.length.toLocaleString()}</b> mapped in {period}
              <br />
              <span>{points.length.toLocaleString()} visible markets</span>
            </div>
          </div>
        </aside>
      )}
      <aside className={`detail ${selected ? "has-selection" : ""}`}>
        {selected ? (<>
          <button className="close" onClick={() => setSelection(null)} aria-label="Clear selected report">
            <X size={18} />
          </button>
          <p className="scroll-cue" aria-hidden="true">SCROLL FOR MORE <span>↓</span></p>
          <p className="eyebrow">
            <MapPin size={13} />
            {selected.market.toUpperCase()}
          </p>
          {selection && selection.reports.length > 1 && (
            <div className="cluster-tabs">
              <div className="cluster-tabs-heading">
                <span>{selection.reports.length} REPORTS AT THIS SIGNAL</span>
                <b>{selection.index + 1} / {selection.reports.length}</b>
              </div>
              <div className="cluster-tabs-list" role="tablist" aria-label={`Reports at ${selected.market}`}>
                {selection.reports.map((report, index) => (
                  <button
                    key={report.id}
                    type="button"
                    role="tab"
                    aria-selected={selection.index === index}
                    aria-label={`Report ${index + 1}: ${report.title}`}
                    title={report.title}
                    className={selection.index === index ? "active" : ""}
                    onClick={() => setSelection((current) => current ? { ...current, index } : current)}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </button>
                ))}
              </div>
            </div>
          )}
          <h2>{selected.title}</h2>
          <p className="detail-summary">
            {selected.summary || "CBRE market research and figures."}
          </p>
          <section className="signal-summary" aria-label="Market signal summary">
            <div>
              <span>MARKET PULSE</span>
              <b>{selectedPulse}</b>
              <small>{selectedPulse >= 70 ? "high momentum" : selectedPulse >= 40 ? "active signal" : "emerging signal"}</small>
            </div>
            <div>
              <span>REPORT QUALITY</span>
              <b className={extractedReportIds.has(selected.id) ? "quality-direct" : "quality-pending"}>
                {extractedReportIds.has(selected.id) ? "DIRECT" : "PENDING"}
              </b>
              <small>{extractedReportIds.has(selected.id) ? "source figures linked" : "benchmark in use"}</small>
            </div>
          </section>
          <section className="market-trend" aria-label={`${selectedScope.name} report volume trend`}>
            <div className="section-heading">
              <span>{selectedScope.name.toUpperCase()} TREND</span>
              <div className="trend-context">
                <small>reports / quarter</small>
                <b>MAP VIEW: {period}</b>
              </div>
            </div>
            <div className="trend-bars">
              {selectedTrend.map((item) => (
                <button
                  key={item.quarter}
                  title={`${item.quarter}: ${item.count} reports`}
                  aria-label={`${item.quarter}: ${item.count} reports`}
                  className={item.quarter === period ? "active" : ""}
                  onClick={() => setPeriod(item.quarter)}
                  style={{ "--bar-height": `${Math.max(8, (item.count / Math.max(...selectedTrend.map((trend) => trend.count), 1)) * 42)}px` } as CSSProperties}
                />
              ))}
            </div>
          </section>
          <div className="tags">
            <span>{selected.period || selected.date.slice(0, 10)}</span>
            {selected.propertyTypes.map((x) => (
              <span key={x}>{x}</span>
            ))}
          </div>
          <a
            className="report-link"
            href={selected.detailUrl || selected.pdfUrl}
            target="_blank"
            rel="noreferrer"
          >
            <FileText size={15} /> View original CBRE report
          </a>
          {selectedPreview && (
            <p className={`preview-label ${selectedPreview.mode}`}>
              {selectedPreview.scope}
            </p>
          )}
          {selectedPreview && (
            <div className="metrics">
              {selectedPreview.metrics.map((metric) => (
                <div key={`${metric.label}-${metric.detail}`}>
                  <span>{metric.label}</span>
                  <b>{metric.value}</b>
                  <small>
                    {metric.detail}
                  </small>
                  {metric.sourcePage && (selected.pdfUrl || selected.detailUrl) && (
                    <a href={`${selected.pdfUrl || selected.detailUrl}#page=${metric.sourcePage}`} target="_blank" rel="noreferrer">
                      SOURCE PAGE
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
          {selectedPreview?.mode === "pending" && (
            <p className="benchmark-note">
              Figure extraction is pending for this PDF. The market benchmark below is derived from related CBRE report activity and is not a substitute for source figures.
            </p>
          )}
          <section className="compare-panel">
            <button className="compare-toggle" onClick={() => setCompareOpen((open) => !open)}>
              {compareOpen ? "HIDE COMPARISON" : "COMPARE MARKET"}
            </button>
            {compareOpen && (
              <div className="compare-content">
                <select value={compareMarket} onChange={(event) => setCompareMarket(event.target.value)} aria-label="Compare market">
                  <option value="">Select a market</option>
                  {marketOptions.filter((market) => market !== selected.market).map((market) => <option key={market}>{market}</option>)}
                </select>
                {compareSnapshot && (
                  <div className="compare-stats">
                    <b>{compareMarket}</b>
                    <span>{compareSnapshot.current} reports in {period}</span>
                    <span>{compareSnapshot.reports} indexed · {compareSnapshot.quarters} quarters</span>
                    <span>{compareSnapshot.direct} direct-figure reports</span>
                  </div>
                )}
              </div>
            )}
          </section>
        </>
        ) : (
          <div className="detail-empty">
            <p className="eyebrow"><MapPin size={13} /> REPORT PREVIEW</p>
            <h2>Select a market signal</h2>
            <p>
              Click a beacon to open the CBRE report, extracted figures, and market-average context here.
            </p>
            <div className="empty-stat">
              <b>{mappedPeriodReports.length.toLocaleString()}</b>
              <span>mapped reports in {period || "the active period"}</span>
            </div>
          </div>
        )}
      </aside>
      <footer>
        <div className="timeline-label">TIME</div>
        <button className="play" onClick={() => setPlaying(!playing)}>
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <div className="timeline">
          <input
            aria-label="Timeline"
            type="range"
            min="0"
            max={Math.max(0, quarters.length - 1)}
            value={Math.max(0, quarters.indexOf(period))}
            onChange={(e) => setPeriod(quarters[Number(e.target.value)])}
          />
          <div className="timeline-markers" aria-label="Quarter report volume">
            {quarterSignals.map((signal, index) => (
              <button
                key={signal.quarter}
                type="button"
                className={`timeline-marker ${period === signal.quarter ? "active" : ""}`}
                aria-label={`${signal.quarter}: ${signal.count} reports`}
                aria-pressed={period === signal.quarter}
                data-period={signal.quarter}
                data-count={`${signal.count} reports`}
                onClick={() => setPeriod(signal.quarter)}
                style={{
                  left: `${quarters.length > 1 ? (index / (quarters.length - 1)) * 100 : 50}%`,
                  "--marker-size": `${6 + Math.round(signal.strength * 10)}px`,
                  "--marker-halo": `${5 + Math.round(signal.strength * 20)}px`,
                  "--marker-alpha": `${0.18 + signal.strength * 0.7}`,
                } as CSSProperties}
              />
            ))}
          </div>
        </div>
        <div className="period-readout">{period}</div>
      </footer>
    </main>
  );
}
function Select({
  label,
  value,
  values,
  set,
}: {
  label: string;
  value: string;
  values: string[];
  set: (v: string) => void;
}) {
  return (
    <div className="select">
      <span>{label}</span>
      <div>
        <select value={value} onChange={(e) => set(e.target.value)}>
          {values.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <ChevronDown size={15} />
      </div>
    </div>
  );
}
