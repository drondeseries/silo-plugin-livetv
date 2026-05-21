import { describe, it, expect } from 'vitest';
import { cellLeft, cellWidth, nowOffset, windowWidth, generateTicks, MIN_CELL_PX } from './scroll';

const WINDOW_START = '2026-05-21T10:00:00Z';
const WINDOW_END = '2026-05-21T14:00:00Z';

describe('cellLeft', () => {
  it('returns 0 when the program starts exactly at the window start', () => {
    expect(cellLeft(WINDOW_START, WINDOW_START, 4)).toBe(0);
  });

  it('clamps to 0 when the program started before the window', () => {
    expect(cellLeft('2026-05-21T09:30:00Z', WINDOW_START, 4)).toBe(0);
  });

  it('returns the correct offset for a mid-window program', () => {
    // 45 minutes after window start at 4px/min == 180px.
    expect(cellLeft('2026-05-21T10:45:00Z', WINDOW_START, 4)).toBe(180);
  });
});

describe('cellWidth', () => {
  it('returns the duration in pixels for a normal-length program', () => {
    // 30 minutes at 4px/min == 120px.
    expect(cellWidth('2026-05-21T10:00:00Z', '2026-05-21T10:30:00Z', 4)).toBe(120);
  });

  it('returns the full duration for a program ending after the window end', () => {
    // The function intentionally does not clamp against windowEnd — that's
    // the row's overflow:hidden job. A 5h program at 4px/min is 1200px.
    expect(cellWidth('2026-05-21T13:00:00Z', '2026-05-21T18:00:00Z', 4)).toBe(1200);
  });

  it('enforces the minimum cell width for tiny programs', () => {
    // 30-second program at 4px/min would be 2px — clamped to MIN_CELL_PX.
    expect(cellWidth('2026-05-21T10:00:00Z', '2026-05-21T10:00:30Z', 4)).toBe(MIN_CELL_PX);
  });
});

describe('windowWidth', () => {
  it('returns the total span at the given pxPerMin', () => {
    // 4 hours * 60 minutes * 4px/min = 960px.
    expect(windowWidth(WINDOW_START, WINDOW_END, 4)).toBe(960);
  });
});

describe('nowOffset', () => {
  it('returns null when now is before the window', () => {
    expect(nowOffset('2026-05-21T09:00:00Z', WINDOW_START, WINDOW_END, 4)).toBeNull();
  });
  it('returns null when now is past the window end', () => {
    expect(nowOffset('2026-05-21T14:00:00Z', WINDOW_START, WINDOW_END, 4)).toBeNull();
  });
  it('returns the offset for an in-window now', () => {
    expect(nowOffset('2026-05-21T11:00:00Z', WINDOW_START, WINDOW_END, 4)).toBe(240);
  });
});

describe('generateTicks', () => {
  it('emits half-hour ticks inside the window', () => {
    const ticks = generateTicks(new Date(WINDOW_START), new Date(WINDOW_END), 30);
    // [10:00, 10:30, 11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00].
    expect(ticks).toHaveLength(9);
    expect(ticks[0].toISOString()).toBe('2026-05-21T10:00:00.000Z');
    expect(ticks[ticks.length - 1].toISOString()).toBe('2026-05-21T14:00:00.000Z');
  });
});
