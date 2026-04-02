import {
  type ToothState,
  type Surface,
  type ToothLabel,
  conditionColors,
} from "../data/dental";

/*
  Circular Odontogram — matches professional dental charting software.

  Each tooth is a circle with:
  - Inner circle = Occlusal (O)
  - 4 outer quadrants = Vestibular (V, top for upper / bottom for lower),
    Lingual (L, opposite), Mesial (M), Distal (D)

  Layout:
  - Upper arch: teeth 18-11 | 21-28 (numbers below)
  - Lower arch: teeth 48-41 | 31-38 (numbers above)
  - "Patient's Right" / "Patient's Left" labels
  - Dashed midline between quadrants
*/

const R_OUTER = 20; // outer circle radius
const R_INNER = 9;  // inner circle (occlusal) radius
const CELL_W = 54;  // horizontal spacing per tooth
const STROKE = "#8D97AA"; // stone-400
const STROKE_W = 1;
const SELECTED_FILL = "#FEF7F0";
const SELECTED_CARD_W = 48;
const SELECTED_CARD_RX = 12;
const TOOTH_TO_NUMBER_GAP = 24;
const SEPARATOR_TO_NUMBER_GAP = 22;
const EMPTY_FILL = "#ECEFF3"; // stone-100
const MISSING_STROKE = "rgba(141, 151, 170, 0.2)";
const MOBILITY_STROKE = "#D4503A";

interface OdontogramProps {
  teeth: ToothState[];
  selectedTooth: number | null;
  onSelectTooth: (tooth: number) => void;
}

/* Get the fill color for a given surface of a tooth */
function getSurfaceFill(tooth: ToothState, surface: Surface): string {
  const sc = tooth.surfaces[surface];
  if (sc) return conditionColors[sc];
  return EMPTY_FILL;
}

function hasLabel(tooth: ToothState, label: ToothLabel): boolean {
  return tooth.labels.includes(label);
}

/*
  SVG path for an outer quadrant (annular sector).
  Quadrant index: 0=top(V for upper), 1=right(D), 2=bottom(L for upper), 3=left(M)
  For lower teeth, V and L swap but we handle that at the data level.
*/
function quadrantPath(cx: number, cy: number, qi: number): string {
  const ro = R_OUTER;
  const ri = R_INNER;
  const angles = [
    [-45, 45],    // top
    [45, 135],    // right
    [135, 225],   // bottom
    [225, 315],   // left
  ];
  const [a1, a2] = angles[qi];
  const toRad = (d: number) => (d * Math.PI) / 180;

  const ox1 = cx + ro * Math.sin(toRad(a1));
  const oy1 = cy - ro * Math.cos(toRad(a1));
  const ox2 = cx + ro * Math.sin(toRad(a2));
  const oy2 = cy - ro * Math.cos(toRad(a2));
  const ix1 = cx + ri * Math.sin(toRad(a1));
  const iy1 = cy - ri * Math.cos(toRad(a1));
  const ix2 = cx + ri * Math.sin(toRad(a2));
  const iy2 = cy - ri * Math.cos(toRad(a2));

  return [
    `M ${ix1} ${iy1}`,
    `L ${ox1} ${oy1}`,
    `A ${ro} ${ro} 0 0 1 ${ox2} ${oy2}`,
    `L ${ix2} ${iy2}`,
    `A ${ri} ${ri} 0 0 0 ${ix1} ${iy1}`,
    `Z`,
  ].join(" ");
}

function subToothArcPath(
  cx: number,
  cy: number,
  width: number,
  depth: number,
  placeBelow: boolean,
): string {
  const startX = cx - width;
  const endX = cx + width;
  const controlY = placeBelow ? cy + depth : cy - depth;

  return `M ${startX} ${cy} Q ${cx} ${controlY} ${endX} ${cy}`;
}

function mobilityLineCount(mobility: ToothState["mobility"]): number {
  if (mobility === "none") return 0;
  return Number.parseInt(mobility.slice(1), 10);
}

function SelectionCard({
  x,
  y,
  height,
}: {
  x: number;
  y: number;
  height: number;
}) {
  return (
    <g>
      <rect
        x={x - SELECTED_CARD_W / 2}
        y={y}
        width={SELECTED_CARD_W}
        height={height}
        rx={SELECTED_CARD_RX}
        fill={SELECTED_FILL}
        stroke="#C4CAD6"
        strokeWidth={1}
      />
      <rect
        x={x - SELECTED_CARD_W / 2 + 4}
        y={y + 4}
        width={SELECTED_CARD_W - 8}
        height={height - 8}
        rx={SELECTED_CARD_RX - 4}
        fill="none"
        stroke="rgba(255, 255, 255, 0.7)"
        strokeWidth={0.8}
      />
    </g>
  );
}

function getSelectionCardMetrics(
  toothCy: number,
  numberY: number,
  numberPosition: "above" | "below",
) {
  const toothTop = toothCy - R_OUTER - 8;
  const toothBottom = toothCy + R_OUTER + 8;
  const numberTop = numberY - 13;
  const numberBottom = numberY + 5;

  const top = numberPosition === "above" ? numberTop - 4 : toothTop;
  const bottom = numberPosition === "above" ? toothBottom : numberBottom + 4;

  return {
    y: top,
    height: bottom - top,
  };
}

/* Circular tooth diagram */
function ToothCircle({
  tooth,
  cx,
  cy,
  isUpper,
  onSelect,
}: {
  tooth: ToothState;
  cx: number;
  cy: number;
  isUpper: boolean;
  onSelect: () => void;
}) {
  const isMissing = hasLabel(tooth, "missing");
  const stroke = isMissing ? MISSING_STROKE : STROKE;
  const fillOpacity = isMissing ? 0.08 : 1;
  const placeBelow = isUpper;
  const mobilityLines = mobilityLineCount(tooth.mobility);
  const bridgeY = cy + R_OUTER + 5;

  // Surface order for quadrants: [top, right, bottom, left]
  // Upper: V=top, D=right, L=bottom, M=left
  // Lower: L=top, D=right, V=bottom, M=left
  const surfaceOrder: Surface[] = isUpper
    ? ["V", "D", "L", "M"]
    : ["L", "D", "V", "M"];

  return (
    <g
      onClick={onSelect}
      style={{ cursor: "pointer" }}
      role="button"
      aria-label={`Tooth ${tooth.number}`}
    >
      {/* Outer quadrants */}
      {surfaceOrder.map((s, qi) => {
        return (
          <path
            key={s}
            d={quadrantPath(cx, cy, qi)}
            fill={getSurfaceFill(tooth, s)}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeWidth={STROKE_W}
          />
        );
      })}

      {/* Inner circle (occlusal) */}
      <circle
        cx={cx}
        cy={cy}
        r={R_INNER}
        fill={getSurfaceFill(tooth, "O")}
        fillOpacity={fillOpacity}
        stroke={stroke}
        strokeWidth={STROKE_W}
      />

      {/* Missing tooth = very low opacity + dashed perimeter */}
      {isMissing && (
        <circle
          cx={cx}
          cy={cy}
          r={R_OUTER + 2}
          fill="none"
          stroke={MISSING_STROKE}
          strokeWidth={1}
          strokeDasharray="2.5 3"
        />
      )}

      {/* RCT lines overlay (two vertical red lines) */}
      {hasLabel(tooth, "rct") && (
        <>
          <line
            x1={cx - 3}
            y1={cy - R_OUTER + 3}
            x2={cx - 3}
            y2={cy + R_OUTER - 3}
            stroke="#D4503A"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          <line
            x1={cx + 3}
            y1={cy - R_OUTER + 3}
            x2={cx + 3}
            y2={cy + R_OUTER - 3}
            stroke="#D4503A"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          <line
            x1={cx}
            y1={cy - R_OUTER + 6}
            x2={cx}
            y2={cy + R_OUTER - 6}
            stroke="#E08A7A"
            strokeWidth={1}
            strokeLinecap="round"
          />
        </>
      )}

      {/* Crown circle overlay */}
      {hasLabel(tooth, "crown") && (
        <circle
          cx={cx}
          cy={cy}
          r={R_OUTER + 1.5}
          fill="none"
          stroke={conditionColors.crown}
          strokeWidth={1.5}
        />
      )}

      {/* Prosthesis = dashed external ring */}
      {hasLabel(tooth, "prosthesis") && (
        <circle
          cx={cx}
          cy={cy}
          r={R_OUTER + 4}
          fill="none"
          stroke={conditionColors.prosthesis}
          strokeWidth={1.4}
          strokeDasharray="3 2"
        />
      )}

      {/* Bridge = arc below tooth */}
      {hasLabel(tooth, "bridge") && (
        <path
          d={subToothArcPath(
            cx,
            bridgeY,
            11,
            2.8,
            true,
          )}
          fill="none"
          stroke={conditionColors.bridge}
          strokeWidth={1.8}
          strokeLinecap="round"
        />
      )}

      {/* Implant screw icon */}
      {hasLabel(tooth, "implant") && (
        <g
          fill="none"
          stroke="#3A6FA0"
          strokeWidth={1.25}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={`M ${cx} ${cy - 8} V ${cy + 5}`} />
          <path d={`M ${cx - 4.5} ${cy - 6.5} H ${cx + 4.5}`} />
          <path d={`M ${cx - 4} ${cy - 3.5} H ${cx + 4}`} />
          <path d={`M ${cx - 3.5} ${cy - 0.5} H ${cx + 3.5}`} />
          <path d={`M ${cx - 3} ${cy + 2.5} H ${cx + 3}`} />
          <path d={`M ${cx - 2} ${cy + 5} L ${cx} ${cy + 8} L ${cx + 2} ${cy + 5}`} />
          <path d={`M ${cx - 2.5} ${cy - 8} H ${cx + 2.5}`} />
        </g>
      )}

      {/* Mobility = 1-3 arcs above/below depending on arch */}
      {mobilityLines > 0 && (
        <g>
          {Array.from({ length: mobilityLines }, (_, index) => {
            const y = placeBelow
              ? cy + R_OUTER + 8 + index * 3.3
              : cy - R_OUTER - 8 - index * 3.3;
            const width = 8.5 + index * 2;

            return (
              <path
                key={index}
                d={subToothArcPath(cx, y, width, 2.6, placeBelow)}
                fill="none"
                stroke={MOBILITY_STROKE}
                strokeWidth={1.6}
                strokeLinecap="round"
              />
            );
          })}
        </g>
      )}
    </g>
  );
}

export default function Odontogram({
  teeth,
  selectedTooth,
  onSelectTooth,
}: OdontogramProps) {
  const find = (n: number) =>
    teeth.find((t) => t.number === n) ?? {
      number: n,
      labels: [],
      surfaces: {},
      mobility: "none" as const,
    };

  const upperTeeth = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
  const lowerTeeth = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

  const teethPerArch = 16;
  const midlineIdx = 8; // gap between teeth 11-21 and 41-31
  const midlineGap = 16;

  const totalW = teethPerArch * CELL_W + midlineGap;
  const archGap = 64; // gap between upper and lower arches

  // Upper arch: tooth circles then numbers below
  // Lower arch: numbers above then tooth circles
  const upperCy = R_OUTER + 4;
  const upperNumY = upperCy + R_OUTER + TOOTH_TO_NUMBER_GAP;
  const lowerNumY = upperNumY + archGap;
  const lowerCy = lowerNumY + TOOTH_TO_NUMBER_GAP + R_OUTER;
  const upperSeparatorY = upperNumY + SEPARATOR_TO_NUMBER_GAP;
  const lowerSeparatorY = lowerNumY - SEPARATOR_TO_NUMBER_GAP;

  const totalH = lowerCy + R_OUTER + 10;
  const padX = 60;
  const padY = 30;
  const upperToothCy = padY + upperCy;
  const lowerToothCy = padY + lowerCy;
  const upperNumberY = padY + upperNumY;
  const lowerNumberY = padY + lowerNumY;
  const upperCard = getSelectionCardMetrics(upperToothCy, upperNumberY, "below");
  const lowerCard = getSelectionCardMetrics(lowerToothCy, lowerNumberY, "above");

  function toothX(idx: number): number {
    const gap = idx >= midlineIdx ? midlineGap : 0;
    return padX + idx * CELL_W + CELL_W / 2 + gap;
  }

  return (
    <svg
      viewBox={`0 0 ${totalW + padX * 2} ${totalH + padY * 2}`}
      className="w-full"
      aria-label="Odontogram"
    >
      {/* Labels */}
      <text
        x={padX - 6}
        y={padY + upperCy + 3}
        textAnchor="end"
        fontSize={9}
        fill="#6B7588"
        fontFamily="'Space Grotesk', sans-serif"
        fontWeight={500}
      >
        BUCCAL
      </text>
      <text
        x={padX - 6}
        y={padY + (upperNumY + lowerNumY) / 2 + 3}
        textAnchor="end"
        fontSize={9}
        fill="#6B7588"
        fontFamily="'Space Grotesk', sans-serif"
        fontWeight={500}
      >
        LINGUAL
      </text>
      <text
        x={padX - 6}
        y={padY + lowerCy + 3}
        textAnchor="end"
        fontSize={9}
        fill="#6B7588"
        fontFamily="'Space Grotesk', sans-serif"
        fontWeight={500}
      >
        BUCCAL
      </text>

      {/* Patient orientation labels */}
      <g transform={`translate(${padX + 4}, ${padY + upperCy - R_OUTER - 20})`}>
        <line x1="0" y1="0" x2="8" y2="0" stroke="#8D97AA" strokeWidth="1" strokeLinecap="round" />
        <line x1="0" y1="0" x2="3" y2="-2.5" stroke="#8D97AA" strokeWidth="1" strokeLinecap="round" />
        <line x1="0" y1="0" x2="3" y2="2.5" stroke="#8D97AA" strokeWidth="1" strokeLinecap="round" />
        <text
          x="12"
          y="3.5"
          fontSize={8}
          fill="#6B7588"
          fontFamily="'Space Grotesk', sans-serif"
          fontWeight={600}
          letterSpacing={1.2}
        >
          PATIENT'S RIGHT
        </text>
      </g>
      <g transform={`translate(${totalW + padX - 4}, ${padY + upperCy - R_OUTER - 20})`}>
        <line x1="0" y1="0" x2="-8" y2="0" stroke="#8D97AA" strokeWidth="1" strokeLinecap="round" />
        <line x1="0" y1="0" x2="-3" y2="-2.5" stroke="#8D97AA" strokeWidth="1" strokeLinecap="round" />
        <line x1="0" y1="0" x2="-3" y2="2.5" stroke="#8D97AA" strokeWidth="1" strokeLinecap="round" />
        <text
          x="-12"
          y="3.5"
          textAnchor="end"
          fontSize={8}
          fill="#6B7588"
          fontFamily="'Space Grotesk', sans-serif"
          fontWeight={600}
          letterSpacing={1.2}
        >
          PATIENT'S LEFT
        </text>
      </g>

      {/* Midline */}
      <line
        x1={padX + midlineIdx * CELL_W + midlineGap / 2}
        y1={padY}
        x2={padX + midlineIdx * CELL_W + midlineGap / 2}
        y2={padY + totalH}
        stroke="#D8DDE5"
        strokeWidth={1}
        strokeDasharray="4 3"
      />

      {/* Upper arch separator */}
      <line
        x1={padX}
        y1={padY + upperSeparatorY}
        x2={totalW + padX}
        y2={padY + upperSeparatorY}
        stroke="#D8DDE5"
        strokeWidth={0.5}
      />

      {/* Lower arch separator */}
      <line
        x1={padX}
        y1={padY + lowerSeparatorY}
        x2={totalW + padX}
        y2={padY + lowerSeparatorY}
        stroke="#D8DDE5"
        strokeWidth={0.5}
      />

      {/* Upper teeth */}
      {upperTeeth.map((n, i) => {
        const x = toothX(i);
        const tooth = find(n);
        return (
          <g key={n}>
            {selectedTooth === n && (
              <SelectionCard x={x} y={upperCard.y} height={upperCard.height} />
            )}
            <ToothCircle
              tooth={tooth}
              cx={x}
              cy={upperToothCy}
              isUpper={true}
              onSelect={() => onSelectTooth(n)}
            />
            {/* Tooth number below */}
            <text
              x={x}
              y={upperNumberY}
              textAnchor="middle"
              fontSize={10}
              fontWeight={selectedTooth === n ? 700 : 500}
              fill={selectedTooth === n ? "#161A22" : "#545D6E"}
              fontFamily="'Space Grotesk', sans-serif"
            >
              {n}
            </text>
          </g>
        );
      })}

      {/* Lower teeth */}
      {lowerTeeth.map((n, i) => {
        const x = toothX(i);
        const tooth = find(n);
        return (
          <g key={n}>
            {selectedTooth === n && (
              <SelectionCard x={x} y={lowerCard.y} height={lowerCard.height} />
            )}
            {/* Tooth number above */}
            <text
              x={x}
              y={lowerNumberY}
              textAnchor="middle"
              fontSize={10}
              fontWeight={selectedTooth === n ? 700 : 500}
              fill={selectedTooth === n ? "#161A22" : "#545D6E"}
              fontFamily="'Space Grotesk', sans-serif"
            >
              {n}
            </text>
            <ToothCircle
              tooth={tooth}
              cx={x}
              cy={lowerToothCy}
              isUpper={false}
              onSelect={() => onSelectTooth(n)}
            />
          </g>
        );
      })}
    </svg>
  );
}
