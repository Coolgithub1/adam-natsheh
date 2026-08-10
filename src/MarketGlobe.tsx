import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { geoEqualEarth, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import countriesTopology from "world-atlas/countries-110m.json";

export type MarketPoint = {
  lat: number;
  lng: number;
  market: string;
  count: number;
  color: string;
  reports: any[];
};
type Props = {
  points: MarketPoint[];
  selectedReportId?: string;
  extractedReportIds?: Set<string>;
  onSelect: (point: MarketPoint, reportIndex?: number) => void;
};

const countries = feature(
  countriesTopology as any,
  (countriesTopology as any).objects.countries,
) as unknown as GeoJSON.FeatureCollection;
export default function MarketGlobe({ points, selectedReportId, extractedReportIds, onSelect }: Props) {
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [dragging, setDragging] = useState(false);
  const [hoveredDot, setHoveredDot] = useState<string | null>(null);
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const didDragRef = useRef(false);
  const pressedReportRef = useRef<{ point: MarketPoint; reportIndex: number } | null>(null);
  const projection = useMemo(
    () => geoEqualEarth().translate([475, 270]).scale(165),
    [],
  );
  const path = useMemo(() => geoPath(projection), [projection]);
  const landDotSpacing = Math.max(3.4, 6 / Math.sqrt(camera.zoom));
  const landDotRadius = Math.min(1.72, 1.12 + Math.log2(camera.zoom) * 0.16);
  const signalScale = 1 / Math.pow(camera.zoom, 0.8);
  const zoomAt = (amount: number, x = 475, y = 270) => setCamera((view) => {
    const zoom = Math.max(0.8, Math.min(14, amount));
    const ratio = zoom / view.zoom;
    return { zoom, x: x - (x - view.x) * ratio, y: y - (y - view.y) * ratio };
  });
  const showStates = false;
  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    didDragRef.current = false;
    dragRef.current = { x: event.clientX, y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const pan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = (event.clientX - drag.x) * (950 / rect.width);
    const dy = (event.clientY - drag.y) * (540 / rect.height);
    if (Math.abs(dx) + Math.abs(dy) > 8) drag.moved = true;
    drag.x = event.clientX;
    drag.y = event.clientY;
    setCamera((view) => ({ ...view, x: view.x + dx, y: view.y + dy }));
  };
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    didDragRef.current = Boolean(dragRef.current?.moved);
    if (didDragRef.current) event.preventDefault();
    if (!didDragRef.current) {
      const pressedReport = pressedReportRef.current;
      if (pressedReport) {
        onSelect(pressedReport.point, pressedReport.reportIndex);
      } else {
        selectNearestSignal(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
      }
    }
    dragRef.current = null;
    pressedReportRef.current = null;
    setDragging(false);
  };
  const selectNearestSignal = (clientX: number, clientY: number, rect: DOMRect) => {
    const x = (clientX - rect.left) * (950 / rect.width);
    const y = (clientY - rect.top) * (540 / rect.height);
    let nearest: { point: MarketPoint; distance: number } | null = null;
    for (const point of points) {
      const projected = projection([point.lng, point.lat]);
      if (!projected) continue;
      const dx = projected[0] * camera.zoom + camera.x - x;
      const dy = projected[1] * camera.zoom + camera.y - y;
      const distance = Math.hypot(dx, dy);
      if (!nearest || distance < nearest.distance) nearest = { point, distance };
    }
    if (nearest && nearest.distance <= 56) onSelect(nearest.point);
  };

  return (
    <div
      className={`market-globe${dragging ? " is-dragging" : ""}`}
      onWheel={(event) => {
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - rect.left) * (950 / rect.width);
        const y = (event.clientY - rect.top) * (540 / rect.height);
        zoomAt(camera.zoom * (event.deltaY < 0 ? 1.22 : 0.82), x, y);
      }}
      onPointerDown={startDrag}
      onPointerMove={pan}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClickCapture={(event) => {
        if (didDragRef.current) {
          didDragRef.current = false;
          event.stopPropagation();
        }
      }}
    >
      <svg viewBox="0 0 950 540" preserveAspectRatio="none" role="img" aria-label="Interactive global market map">
        <defs>
          <radialGradient id="mapGlow" cx="50%" cy="48%" r="68%">
            <stop offset="0%" stopColor="#0d1d29" stopOpacity="0.9" />
            <stop offset="76%" stopColor="#050b10" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#02060a" stopOpacity="1" />
          </radialGradient>
          <filter id="beaconGlow" x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#617782" strokeOpacity="0.12" strokeWidth="0.7" />
          </pattern>
          <pattern
            id="landDots"
            width={landDotSpacing}
            height={landDotSpacing}
            patternUnits="userSpaceOnUse"
            patternTransform={`scale(${1 / camera.zoom})`}
          >
            <circle cx={landDotSpacing / 2} cy={landDotSpacing / 2} r={landDotRadius} fill="#f3f6f4" />
          </pattern>
        </defs>
        <rect width="950" height="540" fill="url(#mapGlow)" />
        <rect width="950" height="540" fill="url(#grid)" opacity="0.42" />
        <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}>
          <g className="world-dot-field">
            {countries.features.map((shape, index) => <path key={index} d={path(shape) ?? undefined} />)}
          </g>
          <g className="market-signals">
          {points.map((point) => {
            const position = projection([point.lng, point.lat]);
            if (!position) return null;
            const [x, y] = position;
            const signalDots = Math.min(point.count, 10);
            const pointKey = `${point.market}-${point.lat}-${point.lng}`;
            const latest = [...point.reports].sort((a, b) => String(b.period).localeCompare(String(a.period)))[0];
            const primaryType = point.reports.flatMap((report) => report.propertyTypes || [])[0] || "Mixed property";
            return <g
              key={pointKey}
              className="market-signal"
              transform={`translate(${x}, ${y}) scale(${signalScale})`}
            >
              <circle className="signal-hitbox" r={10 + signalDots}>
                <title>{`${point.market} · ${point.count} reports · ${latest?.period || "period unavailable"} · ${primaryType}`}</title>
              </circle>
              {Array.from({ length: signalDots }, (_, index) => {
                const angle = (Math.PI * 2 * index) / signalDots - Math.PI / 2;
                const radius = signalDots === 1 ? 0 : 6 + Math.min(signalDots, 6) * 0.7;
                const dotKey = `${pointKey}-${index}`;
                const isHovered = hoveredDot === dotKey;
                const report = point.reports[index % point.reports.length];
                const isSelected = report?.id === selectedReportId;
                return <circle
                  key={index}
                  className={`signal-dot${isHovered ? " is-hovered" : ""}${isSelected ? " is-selected" : ""}`}
                  cx={Math.cos(angle) * radius}
                  cy={Math.sin(angle) * radius}
                  r={isHovered ? 5.2 : 3.2}
                  filter="url(#beaconGlow)"
                  onPointerEnter={() => setHoveredDot(dotKey)}
                  onPointerLeave={() => setHoveredDot((current) => current === dotKey ? null : current)}
                  onPointerDown={() => { pressedReportRef.current = { point, reportIndex: index % point.reports.length }; }}
                >
                  <title>{`${report?.title || `${point.market} report ${index + 1}`} · ${report?.period || "period unavailable"} · ${report?.propertyTypes?.[0] || "Mixed property"} · ${extractedReportIds?.has(report?.id) ? "Direct figures" : "Extraction pending"}`}</title>
                </circle>;
              })}
              <circle className="beacon-core" r="2.2" />
            </g>;
          })}
          </g>
        </g>
        <text className="map-status" x="24" y="36">VECTOR MARKET NETWORK</text>
        <text className="map-status" x="24" y="52">CLICK A SIGNAL TO OPEN REPORTS</text>
        <text className="map-status" x="24" y="515">{showStates ? "STATE BOUNDARIES ACTIVE" : "DOT CLUSTERS = REPORT VOLUME · SCROLL TO ZOOM"}</text>
      </svg>
    </div>
  );
}
