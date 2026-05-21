// Pure helpers for positioning program cells inside the guide grid. Kept in
// their own module so they can be unit-tested without pulling in JSX or the
// DOM. The grid is a horizontal strip per channel; each cell is positioned
// absolutely via { left, width } relative to the start of the visible time
// window.

// MIN_CELL_PX is the smallest visible cell width. Without it, sub-minute
// programs (often EPG artefacts) collapse to zero and become impossible to
// click. Eight pixels is a safe middle ground: still recognisable, still
// distinguishable from a 1px border.
export const MIN_CELL_PX = 8;

// cellLeft returns the pixel offset from the window start at which a
// program cell should begin. Programs that started before the window are
// clamped to 0 so they render butted up against the left edge.
export function cellLeft(programStartIso: string, windowStartIso: string, pxPerMin: number): number {
  const ds = (new Date(programStartIso).getTime() - new Date(windowStartIso).getTime()) / 60000;
  return Math.max(0, ds * pxPerMin);
}

// cellWidth returns the pixel width of a program cell. The width is derived
// from the program's own duration (stop - start), not from how much of it
// falls inside the visible window — that means a program that started
// before the window may render wider than the window itself. Callers that
// want to clamp can additionally constrain the cell with CSS overflow on
// the parent row.
export function cellWidth(startIso: string, stopIso: string, pxPerMin: number): number {
  const dur = (new Date(stopIso).getTime() - new Date(startIso).getTime()) / 60000;
  return Math.max(MIN_CELL_PX, dur * pxPerMin);
}

// windowWidth returns the total pixel width of a [start, end) time window
// at the given pxPerMin. Useful for sizing the inner scroll content and the
// time-row.
export function windowWidth(startIso: string, endIso: string, pxPerMin: number): number {
  const dur = (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000;
  return Math.max(0, dur * pxPerMin);
}

// nowOffset returns the pixel offset of `now` from the window start, or
// null when now is outside the [windowStart, windowEnd) range. The grid
// uses this to render a vertical "now" line.
export function nowOffset(
  nowIso: string,
  windowStartIso: string,
  windowEndIso: string,
  pxPerMin: number,
): number | null {
  const t = new Date(nowIso).getTime();
  const s = new Date(windowStartIso).getTime();
  const e = new Date(windowEndIso).getTime();
  if (t < s || t >= e) return null;
  return ((t - s) / 60000) * pxPerMin;
}

// formatHHMM is a tiny helper that the time-row uses to render ticks. It
// honours the user's locale but forces 24h to keep ticks compact.
export function formatHHMM(d: Date): string {
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

// generateTicks returns Date objects at every half-hour boundary inside
// [start, end]. The time-row labels every full hour; intermediate ticks
// just draw a separator.
export function generateTicks(start: Date, end: Date, stepMinutes: number = 30): Date[] {
  // Floor the start time to the previous tick boundary so the ticks line up
  // with clean half-hour marks instead of arbitrary "now" offsets.
  const ms = start.getTime();
  const stepMs = stepMinutes * 60_000;
  const floored = Math.floor(ms / stepMs) * stepMs;
  const ticks: Date[] = [];
  for (let t = floored; t <= end.getTime(); t += stepMs) {
    if (t < ms) continue; // keep only ticks at/after window start
    ticks.push(new Date(t));
  }
  return ticks;
}
