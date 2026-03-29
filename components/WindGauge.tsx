"use client";

interface Props {
  avg:  number | null;
  gust: number | null;
  size?: number;
}

export function getWindColor(kts: number | null): string {
  if (kts == null) return "#4a5568";
  if (kts < 8)   return "#4a5568";
  if (kts < 12)  return "#63b3ed";
  if (kts < 16)  return "#b6ff4a";
  if (kts < 20)  return "#00e5ff";
  if (kts < 25)  return "#ff8c42";
  if (kts < 30)  return "#fc8181";
  return "#ff4757";
}

export function getWindLabel(kts: number | null): { text: string; emoji: string } {
  if (kts == null) return { text: "No Data",     emoji: "—"  };
  if (kts < 8)    return { text: "Too Light",    emoji: "💤" };
  if (kts < 12)   return { text: "Light",        emoji: "🌬️" };
  if (kts < 16)   return { text: "Moderate",     emoji: "🪁" };
  if (kts < 20)   return { text: "Good",         emoji: "🔥" };
  if (kts < 25)   return { text: "Strong",       emoji: "⚡" };
  if (kts < 30)   return { text: "Very Strong",  emoji: "🌪️" };
  return              { text: "Extreme",      emoji: "🚨" };
}

export default function WindGauge({ avg, gust, size = 120 }: Props) {
  const color   = getWindColor(avg);
  const max     = 35;
  const cx      = size / 2;
  const cy      = size / 2;
  const r       = size * 0.38;
  const stroke  = size * 0.065;
  const circumference = Math.PI * r; // half circle

  const pct      = avg != null ? Math.min(avg / max, 1) : 0;
  const gustPct  = gust != null ? Math.min(gust / max, 1) : 0;

  // Arc from 180° to 0° (left to right, bottom half excluded)
  const arcOffset = circumference * (1 - pct);
  const gustOffset = circumference * (1 - gustPct);

  return (
    <svg width={size} height={size * 0.6} viewBox={`0 0 ${size} ${size * 0.6}`}>
      {/* Track */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke}
        strokeLinecap="round"
      />
      {/* Gust arc (dimmer) */}
      {gust != null && (
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" opacity={0.25}
          strokeDasharray={circumference}
          strokeDashoffset={gustOffset}
        />
      )}
      {/* Avg arc */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke={color} strokeWidth={stroke}
        strokeLinecap="round" opacity={0.9}
        strokeDasharray={circumference}
        strokeDashoffset={arcOffset}
      />
      {/* Avg label */}
      <text x={cx} y={cy - size * 0.04} textAnchor="middle" fill={color}
        fontSize={size * 0.26} fontWeight="800" fontFamily="'JetBrains Mono', monospace">
        {avg != null ? Math.round(avg) : "—"}
      </text>
      <text x={cx} y={cy + size * 0.1} textAnchor="middle" fill="rgba(255,255,255,0.35)"
        fontSize={size * 0.1} fontFamily="'JetBrains Mono', monospace">
        {avg != null ? "kts" : ""}
      </text>
      {/* Gust label */}
      {gust != null && (
        <text x={cx} y={cy + size * 0.22} textAnchor="middle" fill="rgba(255,255,255,0.4)"
          fontSize={size * 0.09} fontFamily="sans-serif">
          G {Math.round(gust)}
        </text>
      )}
    </svg>
  );
}
