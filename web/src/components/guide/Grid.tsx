import { useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { TimeRow } from './TimeRow';
import { ChannelColumn } from './ChannelColumn';
import { ProgramCell } from './ProgramCell';
import { nowOffset, windowWidth } from './scroll';
import type { Channel, Program } from '@/api/client';

interface Props {
  channels: Channel[];
  programs: Record<string, Program[]>;
  windowStart: string;
  windowEnd: string;
  pxPerMin: number;
}

const ROW_HEIGHT = 60;
const CHANNEL_COL_WIDTH = 180;
const HEADER_HEIGHT = 36; // matches TimeRow's h-9.

// Grid composes the four panes of the guide:
//   ┌────────┬────────────────────────────────┐
//   │ corner │ time row (sticky top)          │
//   ├────────┼────────────────────────────────┤
//   │ chans  │ programs strip (virtualised)   │
//   │ (left  │                                │
//   │ stuck) │                                │
//   └────────┴────────────────────────────────┘
//
// The single outer container handles BOTH axes' scrolling. We mirror its
// scrollLeft to the time-row container and its scrollTop to the channel
// column via a rAF-coalesced effect — explicit absolute positioning is
// more reliable than CSS sticky once @tanstack/react-virtual is also
// translating the content vertically.
export function Grid({ channels, programs, windowStart, windowEnd, pxPerMin }: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const timeRowRef = useRef<HTMLDivElement | null>(null);
  const channelColRef = useRef<HTMLDivElement | null>(null);

  const totalWidth = useMemo(
    () => windowWidth(windowStart, windowEnd, pxPerMin),
    [windowStart, windowEnd, pxPerMin],
  );

  const rowVirtualizer = useVirtualizer({
    count: channels.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  });

  // Mirror scrollLeft → time row and scrollTop → channel column. We coalesce
  // with rAF so a fast trackpad gesture doesn't fire layout thrash.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    let pending = false;
    const onScroll = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        if (timeRowRef.current) {
          timeRowRef.current.style.transform = `translateX(${-scroller.scrollLeft}px)`;
        }
        if (channelColRef.current) {
          channelColRef.current.style.transform = `translateY(${-scroller.scrollTop}px)`;
        }
      });
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, []);

  // Now-line: vertical amber tick that snaps to the current time, hidden
  // when "now" is outside the visible window.
  const nowLine = useMemo(() => {
    return nowOffset(new Date().toISOString(), windowStart, windowEnd, pxPerMin);
    // We deliberately don't depend on a `now` state — the parent re-mounts
    // by query key when the window changes, and the next-minute refetch in
    // Guide.tsx invalidates the grid so a fresh nowLine is computed.
  }, [windowStart, windowEnd, pxPerMin]);

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalHeight = rowVirtualizer.getTotalSize();

  return (
    <div className="overflow-hidden rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-background)]">
      {/* Top axis: corner box + time row. The corner stays fixed; the
          time row is translated via the scroller's onScroll above. */}
      <div className="flex">
        <div
          className="flex shrink-0 items-center justify-center border-b border-r border-[color:var(--color-border)] bg-[color:var(--color-background)] text-[10px] uppercase tracking-wider text-[color:var(--color-muted-foreground)]"
          style={{ width: CHANNEL_COL_WIDTH, height: HEADER_HEIGHT }}
        >
          Channels
        </div>
        <div className="relative flex-1 overflow-hidden" style={{ height: HEADER_HEIGHT }}>
          <div ref={timeRowRef} className="will-change-transform">
            <TimeRow
              windowStart={windowStart}
              windowEnd={windowEnd}
              pxPerMin={pxPerMin}
              width={totalWidth}
            />
          </div>
        </div>
      </div>

      {/* Body: sticky channel column on the left, virtualised program rows
          on the right (both inside a single horizontal+vertical scroller). */}
      <div className="flex" style={{ height: Math.min(640, channels.length * ROW_HEIGHT) }}>
        <div className="relative shrink-0 overflow-hidden" style={{ width: CHANNEL_COL_WIDTH }}>
          <div ref={channelColRef} className="will-change-transform" style={{ height: totalHeight, position: 'relative' }}>
            {virtualItems.map((vi) => {
              const channel = channels[vi.index];
              if (!channel) return null;
              return (
                <div
                  key={vi.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: ROW_HEIGHT,
                    transform: `translateY(${vi.start}px)`,
                  }}
                >
                  <ChannelColumn channel={channel} height={ROW_HEIGHT} />
                </div>
              );
            })}
          </div>
        </div>

        <div ref={scrollRef} className="guide-scroll relative flex-1 overflow-auto">
          {/* Inner sized to total width × total height — this is what
              produces the scrollbars on both axes. */}
          <div style={{ width: totalWidth, height: totalHeight, position: 'relative' }}>
            {virtualItems.map((vi) => {
              const channel = channels[vi.index];
              if (!channel) return null;
              const rowPrograms = programs[channel.id] ?? [];
              return (
                <div
                  key={vi.key}
                  className="border-b border-[color:var(--color-border)]"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    height: ROW_HEIGHT,
                    width: totalWidth,
                    transform: `translateY(${vi.start}px)`,
                  }}
                >
                  {rowPrograms.map((p) => (
                    <ProgramCell
                      key={p.id}
                      program={p}
                      windowStart={windowStart}
                      pxPerMin={pxPerMin}
                      rowHeight={ROW_HEIGHT}
                    />
                  ))}
                </div>
              );
            })}

            {nowLine != null ? (
              <div
                aria-hidden
                className="pointer-events-none absolute top-0 z-10 w-px bg-amber-400"
                style={{ left: nowLine, height: totalHeight }}
              >
                <div className="absolute -top-1 -left-1 h-2 w-2 rounded-full bg-amber-400" />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
