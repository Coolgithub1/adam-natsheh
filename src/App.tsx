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
  UserRound,
  BookOpen,
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
type DirectFigure = {
  key: string;
  label: string;
  value: number;
  valueText: string;
  sourcePage: number;
  reportTitle: string;
  period: string;
};
type SitePage = "about" | "atlas" | "blog" | "methodology";
const METHODOLOGY_COMPARE = [
  { name: "CBRE", threshold: "10,000+ sf", timing: "Signed lease", signal: "Committed demand", vacancy: "Vacant within 30 days", revision: "Historical series may be revised", position: 24 },
  { name: "Colliers", threshold: "20,000+ sf", timing: "Not disclosed", signal: "Not disclosed", vacancy: "Not disclosed", revision: "Inventory/classification adjusted", position: 50 },
  { name: "Cushman & Wakefield", threshold: "Not disclosed", timing: "Physical move-in/out", signal: "Realized occupancy", vacancy: "Leased, unoccupied space excluded", revision: "Not disclosed", position: 76 },
  { name: "JLL", threshold: "Not disclosed", timing: "Not disclosed", signal: "Occupancy discussed", vacancy: "Reports vacancy and availability", revision: "Not disclosed", position: 50 },
];
const currentSitePage = (): SitePage => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const path = (new URLSearchParams(window.location.search).get("route") ?? window.location.pathname.replace(base, ""))
    .replace(/^\/+|\/+$/g, "");
  if (path === "atlas" || path === "blog" || path === "methodology") return path;
  return "about";
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
    [savedViewsLoaded, setSavedViewsLoaded] = useState(false),
    [methodologyFirm, setMethodologyFirm] = useState("CBRE"),
    [sitePanel, setSitePanel] = useState<SitePage>(currentSitePage);
  const selected = selection?.reports[selection.index] ?? null;
  const activeMethodology = METHODOLOGY_COMPARE.find((firm) => firm.name === methodologyFirm) ?? METHODOLOGY_COMPARE[0];
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/catalog.json`)
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
    fetch(`${import.meta.env.BASE_URL}data/observations.json`)
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
  const comparisonScope = useMemo(() => {
    if (!compareMarket || !catalog) return { name: "", reports: [] as Report[] };
    return {
      name: compareMarket,
      reports: catalog.reports.filter((report) => report.market === compareMarket),
    };
  }, [catalog, compareMarket]);
  const comparisonTrend = useMemo(
    () => quarters.map((quarter) => ({
      quarter,
      selected: selectedScope.reports.filter((report) => toQuarter(report.period) === quarter).length,
      compared: comparisonScope.reports.filter((report) => toQuarter(report.period) === quarter).length,
    })),
    [comparisonScope, quarters, selectedScope],
  );
  const compareSnapshot = useMemo(() => {
    if (!comparisonScope.reports.length) return null;
    const current = comparisonScope.reports.filter((report) => toQuarter(report.period) === period).length;
    const direct = comparisonScope.reports.filter((report) => extractedReportIds.has(report.id)).length;
    return {
      reports: comparisonScope.reports.length,
      current,
      direct,
      quarters: new Set(comparisonScope.reports.map((report) => toQuarter(report.period))).size,
      propertyTypes: new Set(comparisonScope.reports.flatMap((report) => report.propertyTypes)).size,
    };
  }, [comparisonScope, extractedReportIds, period]);
  const comparisonMix = useMemo(() => {
    if (!compareSnapshot) return [];
    const countTypes = (scope: Report[]) => scope.reduce<Record<string, number>>((counts, report) => {
      report.propertyTypes.forEach((type) => { counts[type] = (counts[type] ?? 0) + 1; });
      return counts;
    }, {});
    const selectedTypes = countTypes(selectedScope.reports);
    const comparedTypes = countTypes(comparisonScope.reports);
    return Array.from(new Set([...Object.keys(selectedTypes), ...Object.keys(comparedTypes)]))
      .map((type) => ({ type, selected: selectedTypes[type] ?? 0, compared: comparedTypes[type] ?? 0 }))
      .sort((a, b) => (b.selected + b.compared) - (a.selected + a.compared))
      .slice(0, 4);
  }, [compareSnapshot, comparisonScope, selectedScope]);
  const comparableFigures = useMemo(() => {
    if (!selected || !comparisonScope.reports.length) return { figures: [] as Array<{ label: string; selected: DirectFigure; compared: DirectFigure; change: number | null }>, selectedReport: null as Report | null, comparedReport: null as Report | null };
    const pickDirectReport = (scope: Report[], preferred?: Report) => {
      if (preferred && extractedReportIds.has(preferred.id)) return preferred;
      const direct = scope.filter((report) => extractedReportIds.has(report.id));
      return direct.find((report) => toQuarter(report.period) === period)
        ?? [...direct].sort((a, b) => b.period.localeCompare(a.period))[0]
        ?? null;
    };
    const selectedReport = pickDirectReport(selectedScope.reports, selected);
    const comparedReport = pickDirectReport(comparisonScope.reports);
    if (!selectedReport?.localPdf || !comparedReport?.localPdf) return { figures: [], selectedReport, comparedReport };
    const toFigureMap = (report: Report) => {
      const figures = observationsBySource.get(report.localPdf ?? "") ?? [];
      return figures.reduce<Map<string, DirectFigure>>((map, observation) => {
        const key = `${metricFamily(observation.metric)}|${observation.unit ?? ""}|${observation.currency ?? ""}`;
        if (!map.has(key)) map.set(key, {
          key,
          label: normalizedMetricLabel(observation),
          value: observation.value,
          valueText: observation.value_text || `${observation.value} ${observation.unit}`,
          sourcePage: observation.source_page,
          reportTitle: report.title,
          period: toQuarter(report.period),
        });
        return map;
      }, new Map<string, DirectFigure>());
    };
    const selectedFigures = toFigureMap(selectedReport);
    const comparedFigures = toFigureMap(comparedReport);
    const figures = Array.from(selectedFigures.entries())
      .filter(([key]) => comparedFigures.has(key))
      .slice(0, 4)
      .map(([, selectedFigure]) => {
        const comparedFigure = comparedFigures.get(selectedFigure.key)!;
        const change = selectedFigure.value === 0
          ? null
          : ((comparedFigure.value - selectedFigure.value) / Math.abs(selectedFigure.value)) * 100;
        return { label: selectedFigure.label, selected: selectedFigure, compared: comparedFigure, change };
      });
    return { figures, selectedReport, comparedReport };
  }, [comparisonScope, extractedReportIds, observationsBySource, period, selected, selectedScope]);
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
  useEffect(() => {
    const syncPage = () => setSitePanel(currentSitePage());
    window.addEventListener("popstate", syncPage);
    const page = currentSitePage();
    if (page && new URLSearchParams(window.location.search).has("route")) {
      window.history.replaceState({}, "", `${import.meta.env.BASE_URL}${page}`);
    }
    return () => window.removeEventListener("popstate", syncPage);
  }, []);
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
  const selectedCurrentReports = selectedTrend.find((item) => item.quarter === period)?.count ?? 0;
  const comparisonChartMax = Math.max(...comparisonTrend.flatMap((item) => [item.selected, item.compared]), 1);
  const comparisonMixMax = Math.max(...comparisonMix.flatMap((item) => [item.selected, item.compared]), 1);
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
  const navigateSitePage = (page: SitePage) => {
    const destination = `${import.meta.env.BASE_URL}${page === "about" ? "" : page}`;
    window.history.pushState({}, "", destination);
    setSitePanel(page);
    window.scrollTo({ top: 0 });
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
        <nav className="site-nav" aria-label="Site navigation">
          <a href={`${import.meta.env.BASE_URL}about`} className={sitePanel === "about" ? "active" : ""} aria-current={sitePanel === "about" ? "page" : undefined} onClick={(event) => { event.preventDefault(); navigateSitePage("about"); }}>
            <UserRound size={14} /> About me
          </a>
          <a href={`${import.meta.env.BASE_URL}atlas`} className={sitePanel === "atlas" ? "active" : ""} aria-current={sitePanel === "atlas" ? "page" : undefined} onClick={(event) => { event.preventDefault(); navigateSitePage("atlas"); }}>
            Market Atlas
          </a>
          <a href={`${import.meta.env.BASE_URL}blog`} className={sitePanel === "blog" ? "active" : ""} aria-current={sitePanel === "blog" ? "page" : undefined} onClick={(event) => { event.preventDefault(); navigateSitePage("blog"); }}>
            <BookOpen size={14} /> Blog
          </a>
          <a href={`${import.meta.env.BASE_URL}methodology`} className={sitePanel === "methodology" ? "active" : ""} aria-current={sitePanel === "methodology" ? "page" : undefined} onClick={(event) => { event.preventDefault(); navigateSitePage("methodology"); }}>
            Methodology
          </a>
        </nav>
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
                <p className="compare-kicker">COMPARE AGAINST A MARKET</p>
                <select value={compareMarket} onChange={(event) => setCompareMarket(event.target.value)} aria-label="Compare market">
                  <option value="">Select a market</option>
                  {marketOptions.filter((market) => market !== selected.market).map((market) => <option key={market}>{market}</option>)}
                </select>
                {compareSnapshot && (<>
                  <div className="compare-stats">
                    <b>{compareMarket}</b>
                    <span>{compareSnapshot.current} reports in {period}</span>
                    <span>{compareSnapshot.reports} indexed · {compareSnapshot.quarters} quarters</span>
                    <span>{compareSnapshot.direct} direct-figure reports</span>
                  </div>
                  <div className="compare-intro">
                    <b>{selectedScope.name} <span>vs</span> {compareMarket}</b>
                    <small>
                      {compareSnapshot.current === selectedCurrentReports
                        ? `Both markets have ${compareSnapshot.current} reports in ${period}.`
                        : `${compareMarket} has ${Math.abs(compareSnapshot.current - selectedCurrentReports)} report${Math.abs(compareSnapshot.current - selectedCurrentReports) === 1 ? "" : "s"} ${compareSnapshot.current > selectedCurrentReports ? "more" : "fewer"} than ${selectedScope.name} in ${period}.`}
                    </small>
                  </div>
                  <div className="compare-scorecards">
                    <div><span>ACTIVE PERIOD</span><b>{selectedCurrentReports} <i>vs</i> {compareSnapshot.current}</b><small>{period}</small></div>
                    <div><span>RESEARCH DEPTH</span><b>{selectedScope.reports.length} <i>vs</i> {compareSnapshot.reports}</b><small>indexed reports</small></div>
                    <div><span>DIRECT FIGURES</span><b>{selectedScope.reports.filter((report) => extractedReportIds.has(report.id)).length} <i>vs</i> {compareSnapshot.direct}</b><small>source-linked reports</small></div>
                  </div>
                  <section className="comparison-chart" aria-label="Report volume by quarter">
                    <div className="comparison-heading"><span>REPORT VOLUME BY QUARTER</span><small><i className="legend-primary" /> {selectedScope.name} <i className="legend-compare" /> {compareMarket}</small></div>
                    <div className="comparison-bars">
                      {comparisonTrend.map((item) => (
                        <div className={`comparison-column ${item.quarter === period ? "active" : ""}`} key={item.quarter} title={`${item.quarter}: ${selectedScope.name} ${item.selected} · ${compareMarket} ${item.compared}`}>
                          <span className="primary" style={{ "--comparison-height": `${Math.max(2, (item.selected / comparisonChartMax) * 38)}px` } as CSSProperties} />
                          <span className="compared" style={{ "--comparison-height": `${Math.max(2, (item.compared / comparisonChartMax) * 38)}px` } as CSSProperties} />
                        </div>
                      ))}
                    </div>
                    <div className="comparison-axis"><span>{comparisonTrend.at(0)?.quarter}</span><b>ACTIVE: {period}</b><span>{comparisonTrend.at(-1)?.quarter}</span></div>
                  </section>
                  <section className="comparison-mix" aria-label="Property type coverage">
                    <div className="comparison-heading"><span>PROPERTY TYPE COVERAGE</span><small>catalog reports</small></div>
                    {comparisonMix.map((item) => (
                      <div className="mix-row" key={item.type}>
                        <span>{item.type}</span>
                        <div><i className="primary" style={{ "--mix-width": `${(item.selected / comparisonMixMax) * 100}%` } as CSSProperties} /><i className="compared" style={{ "--mix-width": `${(item.compared / comparisonMixMax) * 100}%` } as CSSProperties} /></div>
                        <b>{item.selected} <small>vs</small> {item.compared}</b>
                      </div>
                    ))}
                  </section>
                  <section className="comparable-figures" aria-label="Comparable extracted figures">
                    <div className="comparison-heading"><span>LIKE-FOR-LIKE DIRECT FIGURES</span><small>same metric and unit only</small></div>
                    {comparableFigures.figures.length ? (
                      <div className="figure-compare-grid">
                        {comparableFigures.figures.map((figure) => (
                          <div key={figure.label}>
                            <span>{figure.label}</span>
                            <b>{figure.selected.valueText} <i>vs</i> {figure.compared.valueText}</b>
                            <small>{figure.selected.period} p.{figure.selected.sourcePage} <em>·</em> {figure.compared.period} p.{figure.compared.sourcePage}</small>
                            {figure.change !== null && <strong className={figure.change > 0 ? "up" : figure.change < 0 ? "down" : "flat"}>{figure.change > 0 ? "+" : ""}{figure.change.toFixed(1)}% in {compareMarket}</strong>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="comparison-empty">No comparable direct figures are available yet. Values only appear here when the two selected reports share the same metric family, unit, and currency.</p>
                    )}
                  </section>
                  <p className="comparison-provenance">Coverage is catalog-based. Direct figures are only shown when source-linked extracts are compatible.</p>
                </>)}
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
      <aside className="social-links" aria-label="Social profiles">
        <a href="https://www.linkedin.com/in/zompdesigns/" target="_blank" rel="noreferrer" aria-label="LinkedIn profile"><strong aria-hidden="true">in</strong><span>LinkedIn</span></a>
        <a href="https://x.com/zompdesigns" target="_blank" rel="noreferrer" aria-label="X profile"><strong aria-hidden="true">X</strong><span>X</span></a>
      </aside>
      {sitePanel !== "atlas" && (
        <section className="site-panel" aria-labelledby={`${sitePanel}-title`}>
          <div className="site-panel-bar">
            <span>{sitePanel === "blog" ? "MARKET ATLAS / FIELD NOTES" : sitePanel === "methodology" ? "MARKET ATLAS / TECHNICAL NOTE" : "MARKET ATLAS / ABOUT"}</span>
            <nav className="site-nav site-panel-nav" aria-label="Site navigation">
              <a href={`${import.meta.env.BASE_URL}`} className={sitePanel === "about" ? "active" : ""} aria-current={sitePanel === "about" ? "page" : undefined} onClick={(event) => { event.preventDefault(); navigateSitePage("about"); }}><UserRound size={14} /> About me</a>
              <a href={`${import.meta.env.BASE_URL}atlas`} onClick={(event) => { event.preventDefault(); navigateSitePage("atlas"); }}>Market Atlas</a>
              <a href={`${import.meta.env.BASE_URL}blog`} className={sitePanel === "blog" ? "active" : ""} aria-current={sitePanel === "blog" ? "page" : undefined} onClick={(event) => { event.preventDefault(); navigateSitePage("blog"); }}><BookOpen size={14} /> Blog</a>
              <a href={`${import.meta.env.BASE_URL}methodology`} className={sitePanel === "methodology" ? "active" : ""} aria-current={sitePanel === "methodology" ? "page" : undefined} onClick={(event) => { event.preventDefault(); navigateSitePage("methodology"); }}>Methodology</a>
            </nav>
          </div>
          {sitePanel === "about" ? (
            <article className="article about-copy">
              <div className="about-hero">
                <div>
                  <p className="article-eyebrow">ABOUT ME</p>
                  <h1 id="about-title">A global perspective on research, real estate, and hospitality.</h1>
                  <p className="article-lede">I am Adam Natsheh—a researcher and visual communicator with roots across Canada, the United States, Jordan, and Türkiye.</p>
                </div>
                <figure className="profile-photo"><img src={`${import.meta.env.BASE_URL}assets/adonis-profile.png`} alt="Adam Natsheh in Istanbul" /><figcaption>Istanbul, Türkiye</figcaption></figure>
              </div>
              <p>I was born in Québec City and Montreal, Canada, and raised in Lexington, South Carolina. Holding American, Jordanian, and Canadian passports has made international perspective a natural part of how I approach people, places, and opportunities.</p>
              <p>I speak English, Arabic, and Turkish fluently, with intermediate French. Learning languages is both a personal interest and a practical way of understanding markets and communities beyond their headlines.</p>
              <h2>Education and direction</h2>
              <p>I began my studies in economics at Concordia University before moving to Istanbul to support my family’s international work in hospitality and real estate. I later studied Visual Communication Design at Yeditepe University, combining analytical training with an eye for clear storytelling and design.</p>
              <p>That combination informs Market Atlas: a project built to turn dispersed real estate research into a more accessible, comparable, and decision-ready resource.</p>
              <div className="about-details" aria-label="Personal profile">
                <div><span>ROOTS</span><b>Canada · U.S. · Jordan · Türkiye</b></div>
                <div><span>LANGUAGES</span><b>English · Arabic · Turkish · French</b></div>
                <div><span>FOCUS</span><b>Hospitality · Real estate · Visual communication</b></div>
                <div><span>INTERESTS</span><b>Photography · Travel · New languages</b></div>
              </div>
              <h2>Beyond the work</h2>
              <p>Outside of research, I enjoy photography, travelling, and learning new languages. Each one sharpens the same habit that drives my professional work: paying attention to context, asking better questions, and finding a clearer way to share what matters.</p>
              <button className="article-back" onClick={() => navigateSitePage("atlas")}>Explore the atlas</button>
            </article>
          ) : sitePanel === "blog" ? (
            <article className="article">
              <p className="article-eyebrow">RESEARCH METHODS / CHARLESTON INDUSTRIAL / Q2 2026</p>
              <h1 id="blog-title">Four research firms, four ways of measuring one industrial market</h1>
              <p className="article-lede">CBRE, Colliers, Cushman &amp; Wakefield, and JLL all describe Charleston industrial. Their headline numbers differ because their methodologies do too.</p>
              <h2>The first lesson: the reports are not interchangeable</h2>
              <p>A vacancy rate is only as comparable as the buildings and timing rules behind it. In the Q2 2026 reports, the firms do not use the same inventory universe, definition of absorption, or disclosure level. The result is a range of vacancy rates that should not be treated as a precise market ranking.</p>
              <section className="methodology-explorer" aria-labelledby="methodology-explorer-title">
                <div className="explorer-heading"><div><p className="article-eyebrow">INTERACTIVE COMPARISON</p><h3 id="methodology-explorer-title">How each report turns market activity into a headline</h3></div><p>Choose a firm to inspect its published methodology.</p></div>
                <div className="firm-selector" role="group" aria-label="Select a research firm">
                  {METHODOLOGY_COMPARE.map((firm) => <button key={firm.name} type="button" aria-pressed={methodologyFirm === firm.name} onClick={() => setMethodologyFirm(firm.name)}>{firm.name}</button>)}
                </div>
                <div className="methodology-visual">
                  <div className="timing-scale" aria-label={`${activeMethodology.name} demand timing comparison`}>
                    <span>Lease signed</span><span>Build-out / delivery</span><span>Physical move-in</span>
                    <div className="timing-line" />
                    <div className="timing-marker" style={{ left: `${activeMethodology.position}%` }}><b>{activeMethodology.name}</b><i>{activeMethodology.timing}</i></div>
                  </div>
                  <div className="methodology-detail"><div><span>SURVEY FLOOR</span><b>{activeMethodology.threshold}</b></div><div><span>ABSORPTION SIGNAL</span><b>{activeMethodology.signal}</b></div><div><span>VACANCY TREATMENT</span><b>{activeMethodology.vacancy}</b></div><div><span>SERIES GOVERNANCE</span><b>{activeMethodology.revision}</b></div></div>
                </div>
              </section>
              <div className="method-grid" aria-label="Research methodology comparison">
                <section><h3>CBRE</h3><p><b>Coverage:</b> industrial properties over 10,000 square feet in seven named local submarkets.</p><p><b>Timing:</b> absorption is recorded when a lease is signed; a prelease is recorded at delivery.</p><p><b>Vacancy:</b> space occupiable within 30 days. Availability can include occupied or vacant space ready within six months.</p></section>
                <section><h3>Colliers</h3><p><b>Coverage:</b> industrial buildings of 20,000 square feet or more that can adapt to industrial use.</p><p><b>Classification:</b> warehouse/distribution, manufacturing, and flex/R&amp;D; flex requires at least 30% office area.</p><p><b>Continuity:</b> inventory and classifications are adjusted on an ongoing basis.</p></section>
                <section><h3>Cushman &amp; Wakefield</h3><p><b>Timing:</b> absorption follows physical move-ins and move-outs, not new leasing.</p><p><b>Vacancy:</b> its available measure excludes space that is leased but not yet occupied.</p><p><b>Usefulness:</b> the report separates realized occupancy change from YTD leasing activity.</p></section>
                <section><h3>JLL</h3><p><b>Disclosure:</b> the report provides headline vacancy, availability, absorption, and supply figures but does not state its size cutoff or formal calculation rules.</p><p><b>Read-through:</b> it is a helpful directional market summary, but it cannot be fully reconciled with the others from this report alone.</p></section>
              </div>
              <h2>Signed demand and occupied demand are different signals</h2>
              <p>The most consequential methodological split is CBRE versus Cushman &amp; Wakefield. CBRE records a signed lease before the tenant necessarily occupies the building. Cushman &amp; Wakefield records the event at physical occupancy. In a market with large preleases or long build-outs, CBRE can show demand improving earlier; C&amp;W shows when that demand has become occupied space. Neither is wrong. They answer different questions.</p>
              <h2>Why the vacancy figures spread</h2>
              <p>CBRE's 10,000-square-foot threshold captures a different universe from Colliers' 20,000-square-foot minimum. C&amp;W reports a larger inventory base, while JLL does not disclose its survey boundary in this edition. CBRE also distinguishes 30-day vacant space from six-month availability, and C&amp;W excludes leased-but-unoccupied space from its available measure. Those choices alone can move the reported rate materially.</p>
              <h2>What to use each report for</h2>
              <ul><li><b>CBRE:</b> an early read on signed demand and a clearly stated local survey framework.</li><li><b>Colliers:</b> product-type context, particularly warehouse, manufacturing, and flex segmentation.</li><li><b>Cushman &amp; Wakefield:</b> realized occupancy change and a useful separation of leasing from absorption.</li><li><b>JLL:</b> concise market narrative and directional outlook; use headline metrics with care until definitions are confirmed.</li></ul>
              <h2>The takeaway</h2>
              <p>The best practice is to compare each firm's trend with its own historical series, then reconcile definitions before comparing firms. A strong conclusion needs a like-for-like inventory universe, matching timing conventions, and clarity on whether the metric represents a signed commitment, available space, or occupied space.</p>
              <p className="article-source">Methodology notes are drawn from the firms' supplied Q2 2026 Charleston industrial reports. This article is an independent comparison, not a reproduction of their research.</p>
            </article>
          ) : (
            <article className="article methodology-page">
              <p className="article-eyebrow">TECHNICAL NOTE / MARKET ATLAS</p>
              <h1 id="methodology-title">How Market Atlas turns a catalog of reports into a research interface.</h1>
              <p className="article-lede">Market Atlas is designed to help people find, inspect, and compare commercial real estate research without implying that every report or metric is automatically comparable.</p>
              <h2>Design premise</h2>
              <p>Real estate research is often distributed across PDFs, markets, property types, and reporting periods. The core problem is not simply access. It is orientation: users need to see where coverage exists, narrow the universe quickly, and understand the source quality behind a figure before they use it.</p>
              <div className="methodology-flow" aria-label="Market Atlas research flow">
                <div><b>1</b><span>Catalog reports</span><small>Title, market, period, property type, geography</small></div>
                <div><b>2</b><span>Map coverage</span><small>One navigable view of the available research universe</small></div>
                <div><b>3</b><span>Inspect sources</span><small>Open the report and retain page-level figure provenance</small></div>
                <div><b>4</b><span>Compare carefully</span><small>Show only compatible figures as direct comparisons</small></div>
              </div>
              <h2>Data and research logic</h2>
              <p>The Atlas uses a versioned catalog to store report metadata such as title, date, period, market, country, coordinates, property type, and source link. This supports filtering and mapping without presenting derived market conclusions as if they were source data.</p>
              <p>When figures are extracted, the interface preserves the source file and page number. Reports without completed figure extraction display a clear pending state rather than filling the space with estimates. Like-for-like comparisons appear only where reports share the same metric family, unit, and currency.</p>
              <div className="methodology-principles">
                <section><h3>Traceability</h3><p>Every direct figure should lead back to its original report and source page.</p></section>
                <section><h3>Comparability</h3><p>Shared labels are not enough. Unit, currency, timing, and scope must also align.</p></section>
                <section><h3>Honest uncertainty</h3><p>Missing extraction or unclear methodology is surfaced as a limitation, not hidden.</p></section>
              </div>
              <h2>Why the interface looks this way</h2>
              <p>The globe is an orientation device, not a choropleth of market performance. It makes research coverage spatial: clusters show where reports exist, while filters reduce the cognitive load of a large catalog. The timeline provides a second organizing dimension—reporting period—so users can move through coverage without losing geographic context.</p>
              <p>The report dock intentionally keeps the original report link, source-linked figures, and context together. This follows a progressive-disclosure approach: the broad view supports discovery; the detail view supports verification; comparison is optional and constrained by data compatibility.</p>
              <h2>Limits and intended use</h2>
              <p>Market Atlas is a research-navigation and source-comparison tool. It does not replace independent due diligence, standardize inconsistent third-party methodologies, or make investment recommendations. The most reliable use is to locate the underlying evidence, check definitions, and compare trends within a consistent survey series.</p>
              <button className="article-back" onClick={() => navigateSitePage("atlas")}>Open Market Atlas</button>
            </article>
          )}
        </section>
      )}
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
