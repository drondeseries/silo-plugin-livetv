import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { api } from '@/api/client';
import { Grid } from '@/components/guide/Grid';
import { cn } from '@/lib/utils';

// Guide page composes the time-scrub controls (group filter, day picker,
// jump buttons) with the Grid component. Window is anchored to a date the
// user picks and a fixed 4h length; we offer fast -/+ buttons to step
// through the day at a glance and a "Now" reset.
const HOURS_PER_WINDOW = 4;
const PX_PER_MIN = 4; // → 240px/hour → 960px per 4h window.

function floorToHalfHour(d: Date): Date {
  const out = new Date(d);
  out.setMinutes(out.getMinutes() < 30 ? 0 : 30, 0, 0);
  return out;
}

export function Guide() {
  const qc = useQueryClient();
  const [anchor, setAnchor] = useState<Date>(() => floorToHalfHour(new Date()));
  const [group, setGroup] = useState<string>('');

  // Snap to whole-minute boundaries so refetch invalidations don't drift.
  const windowStart = useMemo(() => anchor.toISOString(), [anchor]);
  const windowEnd = useMemo(
    () => new Date(anchor.getTime() + HOURS_PER_WINDOW * 3600_000).toISOString(),
    [anchor],
  );

  const groupsQuery = useQuery({
    queryKey: ['groups'],
    queryFn: () => api.groups(),
  });

  // We need the channel set up front so the grid can render the left axis
  // even before guide data arrives. Pulled with a 500-row cap which is
  // plenty for any single visible window — guides with thousands of
  // channels are still virtualised by react-virtual.
  const channelsQuery = useQuery({
    queryKey: ['channels', { group, q: '', forGuide: true }],
    queryFn: () => api.channels({ group: group || undefined, limit: 500 }),
  });

  const channelIds = useMemo(
    () => (channelsQuery.data?.data ?? []).map((c) => c.id),
    [channelsQuery.data],
  );

  const guideQuery = useQuery({
    queryKey: ['guide', { windowStart, windowEnd, group, channels: channelIds }],
    queryFn: () =>
      api.guide(windowStart, windowEnd, {
        group: group || undefined,
        channels: channelIds.length ? channelIds : undefined,
      }),
    enabled: channelIds.length > 0,
  });

  // Schedule a refetch at the next minute boundary so the "Now" line and
  // current-airing highlighting stay accurate without polling every second.
  useEffect(() => {
    const now = new Date();
    const ms = 60000 - (now.getTime() % 60000);
    const t = setTimeout(() => {
      qc.invalidateQueries({ queryKey: ['guide'] });
    }, ms);
    return () => clearTimeout(t);
  }, [guideQuery.data, qc]);

  const groups = groupsQuery.data?.data ?? [];
  const channels = channelsQuery.data?.data ?? [];
  const programs = guideQuery.data?.data ?? {};

  const shift = (hours: number) =>
    setAnchor((d) => new Date(d.getTime() + hours * 3600_000));

  const todayInput = useMemo(() => {
    // <input type="date"> expects YYYY-MM-DD in local time.
    const y = anchor.getFullYear();
    const m = String(anchor.getMonth() + 1).padStart(2, '0');
    const d = String(anchor.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [anchor]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-lg font-semibold tracking-tight">Guide</h1>
        <button
          type="button"
          onClick={() => shift(-HOURS_PER_WINDOW)}
          className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-1.5 hover:bg-[color:var(--color-surface-hover)]"
          aria-label="Earlier"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          onClick={() => setAnchor(floorToHalfHour(new Date()))}
          className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2.5 py-1 text-xs font-medium hover:bg-[color:var(--color-surface-hover)]"
        >
          <RotateCcw size={12} /> Now
        </button>
        <button
          type="button"
          onClick={() => shift(HOURS_PER_WINDOW)}
          className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-1.5 hover:bg-[color:var(--color-surface-hover)]"
          aria-label="Later"
        >
          <ChevronRight size={16} />
        </button>
        <input
          type="date"
          value={todayInput}
          onChange={(e) => {
            // Combine the picked date with the current time-of-day from
            // anchor so the scrub controls don't reset hours when the
            // operator just wants to jump to "tomorrow at this hour".
            const [y, m, d] = e.target.value.split('-').map(Number);
            if (!y || !m || !d) return;
            const next = new Date(anchor);
            next.setFullYear(y, m - 1, d);
            setAnchor(floorToHalfHour(next));
          }}
          className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1 text-xs"
        />
      </div>

      {groups.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <GroupChip active={!group} label="All" onClick={() => setGroup('')} />
          {groups.map((name) => (
            <GroupChip
              key={name}
              active={group === name}
              label={name}
              onClick={() => setGroup(name)}
            />
          ))}
        </div>
      ) : null}

      {channelsQuery.isPending || guideQuery.isPending ? (
        <div className="py-12 text-center text-sm text-[color:var(--color-muted-foreground)]">Loading guide…</div>
      ) : channelsQuery.isError ? (
        <div className="rounded-md border border-red-900/40 bg-red-950/30 p-4 text-sm text-red-300">
          Could not load channels: {(channelsQuery.error as Error).message}
        </div>
      ) : guideQuery.isError ? (
        <div className="rounded-md border border-red-900/40 bg-red-950/30 p-4 text-sm text-red-300">
          Could not load guide: {(guideQuery.error as Error).message}
        </div>
      ) : channels.length === 0 ? (
        <div className="py-12 text-center text-sm text-[color:var(--color-muted-foreground)]">No channels match this filter.</div>
      ) : (
        <Grid
          channels={channels}
          programs={programs}
          windowStart={windowStart}
          windowEnd={windowEnd}
          pxPerMin={PX_PER_MIN}
        />
      )}
    </div>
  );
}

function GroupChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-amber-400/60 bg-amber-400/15 text-amber-100'
          : 'border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[color:var(--color-muted-foreground)] hover:bg-[color:var(--color-surface-hover)]',
      )}
    >
      {label}
    </button>
  );
}
