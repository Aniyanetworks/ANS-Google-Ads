import { useMemo, useState, type MouseEvent } from "react";

type Point = { date: string; value: number };

const WIDTH = 480;
const HEIGHT = 160;
const PAD_LEFT = 44;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 24;

export default function TrendChart({
  title,
  data,
  color,
  format,
}: {
  title: string;
  data: Point[];
  color: string;
  format: (n: number) => string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const { points, maxValue, ticks } = useMemo(() => {
    const values = data.map((d) => d.value);
    const max = Math.max(1, ...values);
    const xStep = data.length > 1 ? plotWidth / (data.length - 1) : 0;

    const pts = data.map((d, i) => ({
      x: PAD_LEFT + (data.length > 1 ? i * xStep : plotWidth / 2),
      y: PAD_TOP + plotHeight - (d.value / max) * plotHeight,
      ...d,
    }));

    const tickCount = 3;
    const tickValues = Array.from({ length: tickCount }, (_, i) => (max / (tickCount - 1)) * i);

    return { points: pts, maxValue: max, ticks: tickValues };
  }, [data, plotWidth, plotHeight]);

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-medium uppercase text-slate-500">{title}</p>
        <p className="mt-4 text-sm text-slate-400">No data yet.</p>
      </div>
    );
  }

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x},${PAD_TOP + plotHeight} L${points[0].x},${PAD_TOP + plotHeight} Z`;
  const last = points[points.length - 1];
  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  function handleMouseMove(e: MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * WIDTH;
    let closest = 0;
    let closestDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - x);
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    });
    setHoverIndex(closest);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase text-slate-500">{title}</p>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="mt-2 w-full touch-none"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {ticks.map((t, i) => {
          const y = PAD_TOP + plotHeight - (t / maxValue) * plotHeight;
          return (
            <g key={i}>
              <line
                x1={PAD_LEFT}
                x2={WIDTH - PAD_RIGHT}
                y1={y}
                y2={y}
                stroke="#e2e8f0"
                strokeWidth={1}
              />
              <text x={0} y={y + 3} fontSize={9} fill="#94a3b8">
                {format(t)}
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill={color} opacity={0.1} stroke="none" />
        <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        <circle cx={last.x} cy={last.y} r={4} fill={color} stroke="white" strokeWidth={2} />

        {hovered && (
          <>
            <line
              x1={hovered.x}
              x2={hovered.x}
              y1={PAD_TOP}
              y2={PAD_TOP + plotHeight}
              stroke="#cbd5e1"
              strokeWidth={1}
            />
            <circle cx={hovered.x} cy={hovered.y} r={4} fill={color} stroke="white" strokeWidth={2} />
          </>
        )}
      </svg>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{formatDate(data[0].date)}</span>
        <span>{formatDate(data[data.length - 1].date)}</span>
      </div>

      {hovered && (
        <p className="mt-1 text-sm text-slate-700">
          <span className="font-semibold">{formatDate(hovered.date)}:</span> {format(hovered.value)}
        </p>
      )}
    </div>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
