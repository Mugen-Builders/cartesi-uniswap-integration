import React from "react";
import type { PriceCurvePoint } from "../types/bonding";

const VIEW_WIDTH = 600;
const VIEW_HEIGHT = 280;

interface PriceChartProps {
  points: PriceCurvePoint[];
  height?: number;
  className?: string;
}

export const PriceChart: React.FC<PriceChartProps> = ({
  points,
  height = VIEW_HEIGHT,
  className = "",
}) => {
  if (points.length === 0) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg border border-border bg-muted/30 text-muted-foreground ${className}`}
        style={{ height }}
      >
        No data to display
      </div>
    );
  }

  const width = VIEW_WIDTH;
  const steps = points.map((p) => p.step);
  const prices = points.map((p) => p.price);
  const minStep = Math.min(...steps);
  const maxStep = Math.max(...steps);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const rangeStep = maxStep - minStep || 1;
  const rangePrice = maxPrice - minPrice || 1;
  const padding = { top: 16, right: 16, bottom: 24, left: 48 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const toX = (step: number) =>
    padding.left + ((step - minStep) / rangeStep) * chartWidth;
  const toY = (price: number) =>
    padding.top + chartHeight - ((price - minPrice) / rangePrice) * chartHeight;

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.step)} ${toY(p.price)}`)
    .join(" ");

  const gridLines = 5;
  const yTicks = Array.from({ length: gridLines + 1 }, (_, i) => {
    const v = minPrice + (rangePrice * i) / gridLines;
    return { value: v, y: toY(v) };
  });

  return (
    <svg
      width="100%"
      height={height}
      className={`block rounded-lg ${className}`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ maxWidth: "100%", minHeight: height }}
    >
      {/* Grid lines */}
      {yTicks.map((tick, i) => (
        <line
          key={i}
          x1={padding.left}
          y1={tick.y}
          x2={width - padding.right}
          y2={tick.y}
          stroke="currentColor"
          strokeOpacity={0.1}
          strokeDasharray="4 4"
        />
      ))}
      {/* Y-axis labels */}
      {yTicks.map((tick, i) => (
        <text
          key={i}
          x={padding.left - 8}
          y={tick.y}
          textAnchor="end"
          dominantBaseline="middle"
          className="fill-muted-foreground text-[10px]"
        >
          {tick.value.toFixed(2)}
        </text>
      ))}
      {/* Line */}
      <path
        d={pathD}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Points */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={toX(p.step)}
          cy={toY(p.price)}
          r={p.action === "initial" ? 4 : 3}
          fill={
            p.action === "buy"
              ? "hsl(var(--chart-2))"
              : p.action === "sell"
                ? "hsl(var(--chart-1))"
                : "hsl(var(--primary))"
          }
        />
      ))}
    </svg>
  );
};
