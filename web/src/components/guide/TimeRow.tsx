import { useMemo } from 'react';
import { cellLeft, formatHHMM, generateTicks } from './scroll';

interface Props {
  windowStart: string;
  windowEnd: string;
  pxPerMin: number;
  width: number;
}

// TimeRow renders the horizontal time axis at the top of the guide grid.
// Ticks repeat every 30 minutes; only the half-hour marks at minute===0
// get a visible label, the rest are bare separators. The component is
// positioned absolutely by the parent grid so the row's scrollLeft can be
// driven by the channel-data scroll container.
export function TimeRow({ windowStart, windowEnd, pxPerMin, width }: Props) {
  const ticks = useMemo(
    () => generateTicks(new Date(windowStart), new Date(windowEnd), 30),
    [windowStart, windowEnd],
  );

  return (
    <div
      className="relative h-9 border-b border-[color:var(--color-border)] bg-[color:var(--color-background)]"
      style={{ width }}
    >
      {ticks.map((t) => {
        const left = cellLeft(t.toISOString(), windowStart, pxPerMin);
        const isHour = t.getMinutes() === 0;
        return (
          <div
            key={t.toISOString()}
            className="absolute top-0 flex h-full select-none flex-col items-start"
            style={{ left }}
          >
            <div
              className={isHour ? 'h-3 w-px bg-[color:var(--color-muted-foreground)]/60' : 'h-2 w-px bg-[color:var(--color-border)]'}
            />
            {isHour ? (
              <span className="pl-1 text-[11px] font-mono tabular-nums text-[color:var(--color-muted-foreground)]">
                {formatHHMM(t)}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
