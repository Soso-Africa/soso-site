export function formatDelta(delta: number | null) {
  if (delta === null) return "No prior data";
  const percentage = Math.round(delta * 1000) / 10;
  return `${percentage >= 0 ? "+" : ""}${percentage}%`;
}

export function formatTrend(delta: number | null): "up" | "down" | "neutral" {
  if (delta === null || delta === 0) return "neutral";
  return delta > 0 ? "up" : "down";
}

export function formatDuration(seconds: number | null) {
  if (seconds === null) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

export function formatPercent(ratio: number | null) {
  if (ratio === null) return "—";
  return `${Math.round(ratio * 1000) / 10}%`;
}

export function formatCsvCell(value: unknown) {
  const text = value !== null && typeof value === "object"
    ? JSON.stringify(value)
    : String(value ?? "");
  return `"${text.replaceAll("\"", "\"\"")}"`;
}