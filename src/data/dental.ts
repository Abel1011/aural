/* ISO 3950 FDI tooth numbering + surface codes */

export type Surface = "O" | "M" | "D" | "V" | "L";

export type Condition =
  | "healthy"
  | "caries"
  | "composite"
  | "amalgam"
  | "inlay"
  | "onlay"
  | "crown"
  | "bridge"
  | "prosthesis"
  | "implant"
  | "rct"
  | "missing";

export type SurfaceCondition =
  | "caries"
  | "composite"
  | "amalgam"
  | "inlay"
  | "onlay";

export type ToothLabel =
  | "crown"
  | "bridge"
  | "prosthesis"
  | "implant"
  | "rct"
  | "missing";

export const conditionColors: Record<Condition, string> = {
  healthy:    "#B8C0CE", // stone-300 (neutral)
  caries:     "#D4503A", // tomato red
  composite:  "#5A96C8", // sky blue
  amalgam:    "#7A7A7A", // neutral gray
  inlay:      "#88B4D0", // light steel blue
  onlay:      "#6694B8", // medium steel blue
  crown:      "#E49545", // ember-400
  bridge:     "#C77B30", // ember-500
  prosthesis: "#B37886", // berry-400
  implant:    "#4A86C2", // deep sky blue
  rct:        "#D4503A", // same as caries, distinct via pattern
  missing:    "#D8DDE5", // stone-200
};

export const conditionLabels: Record<Condition, string> = {
  healthy:    "Healthy",
  caries:     "Caries",
  composite:  "Composite",
  amalgam:    "Amalgam",
  inlay:      "Inlay",
  onlay:      "Onlay",
  crown:      "Crown",
  bridge:     "Bridge",
  prosthesis: "Prosthesis",
  implant:    "Implant",
  rct:        "RCT",
  missing:    "Missing",
};

/* Visual markers for legend — some conditions use special SVG overlays */
export const conditionMarkers: Partial<Record<Condition, "cross" | "lines" | "circle" | "screw">> = {
  caries:  "cross",
  rct:     "lines",
  crown:   "circle",
  implant: "screw",
  missing: "cross",
};

export type Mobility = "none" | "M1" | "M2" | "M3";

/* Conditions that apply to the whole tooth (labels) vs. per-surface */
export const labelConditions: ToothLabel[] = ["crown", "bridge", "prosthesis", "implant", "rct", "missing"];
export const surfaceConditions: SurfaceCondition[] = ["caries", "composite", "amalgam", "inlay", "onlay"];

export interface ToothState {
  number: number;
  labels: ToothLabel[];
  surfaces: Partial<Record<Surface, SurfaceCondition>>;
  mobility: Mobility;
  note?: string;
}

export function getPrimarySurfaceCondition(tooth: ToothState): SurfaceCondition | null {
  const values = Object.values(tooth.surfaces) as SurfaceCondition[];
  if (values.length === 0) return null;

  const frequencies = new Map<SurfaceCondition, number>();
  for (const value of values) {
    frequencies.set(value, (frequencies.get(value) ?? 0) + 1);
  }

  return values.reduce((best, current) => {
    if (!best) return current;
    return (frequencies.get(current) ?? 0) > (frequencies.get(best) ?? 0)
      ? current
      : best;
  }, values[0]);
}

export function hasToothFinding(tooth: ToothState): boolean {
  return (
    tooth.labels.length > 0 ||
    Object.keys(tooth.surfaces).length > 0 ||
    tooth.mobility !== "none"
  );
}

export interface VoiceLogEntry {
  id: string;
  timestamp: string;
  transcript: string;
  parsed: string;
  type: "command" | "correction" | "confirmation";
}

/* FDI quadrant layout */
export const upperRight = [18, 17, 16, 15, 14, 13, 12, 11];
export const upperLeft = [21, 22, 23, 24, 25, 26, 27, 28];
export const lowerLeft = [31, 32, 33, 34, 35, 36, 37, 38];
export const lowerRight = [48, 47, 46, 45, 44, 43, 42, 41];

const allTeeth = [...upperRight, ...upperLeft, ...lowerLeft, ...lowerRight];

export function createInitialTeeth(): ToothState[] {
  return allTeeth.map((n) => ({
    number: n,
    labels: [],
    surfaces: {},
    mobility: "none" as Mobility,
  }));
}
