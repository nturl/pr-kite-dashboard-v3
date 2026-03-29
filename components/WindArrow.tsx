"use client";

interface Props {
  direction:     number | null;
  directionText: string | null;
  size?:         number;
}

export default function WindArrow({ direction, directionText, size = 60 }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const r  = size * 0.36;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background circle */}
        <circle cx={cx} cy={cy} r={r + 2} fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
        {direction != null ? (
          <g transform={`rotate(${direction}, ${cx}, ${cy})`}>
            {/* Arrow shaft */}
            <line x1={cx} y1={cy + r * 0.7} x2={cx} y2={cy - r * 0.75}
              stroke="#00e5ff" strokeWidth={2} strokeLinecap="round" />
            {/* Arrowhead */}
            <polygon
              points={`${cx},${cy - r * 0.9} ${cx - r * 0.22},${cy - r * 0.45} ${cx + r * 0.22},${cy - r * 0.45}`}
              fill="#00e5ff"
            />
            {/* Tail */}
            <line x1={cx - r * 0.18} y1={cy + r * 0.7} x2={cx + r * 0.18} y2={cy + r * 0.7}
              stroke="#00e5ff" strokeWidth={2} strokeLinecap="round" opacity={0.6} />
          </g>
        ) : (
          <text x={cx} y={cy + 4} textAnchor="middle" fill="rgba(255,255,255,0.2)"
            fontSize={size * 0.22} fontFamily="sans-serif">?</text>
        )}
      </svg>
      {directionText && (
        <span style={{ fontSize: size * 0.2, color: "rgba(255,255,255,0.5)", fontWeight: 600, letterSpacing: "0.06em" }}>
          {directionText}
        </span>
      )}
    </div>
  );
}
