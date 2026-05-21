import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { ChannelCard } from '@/components/ChannelCard';
import { cn } from '@/lib/utils';

// Channels page — flat grid of every visible channel for the user. Group
// chips along the top filter via `?group=`; the search input drives `?q=`.
// Both stay in the URL so a back/forward navigation restores the view.
//
// We deliberately don't virtualize: even pathological channel counts in the
// thousands render fine at this card size, and the simpler DOM keeps the
// favorite-star hover affordance working naturally.
export function Channels() {
  const [searchParams, setSearchParams] = useSearchParams();
  const group = searchParams.get('group') ?? '';
  const q = searchParams.get('q') ?? '';

  // Local input state debounces into ?q= so the URL doesn't churn on every
  // keystroke. Initial value seeds from the URL so a deep link populates.
  const [qInput, setQInput] = useState(q);
  useEffect(() => {
    if (qInput === q) return;
    const t = setTimeout(() => {
      setSearchParams(
        (sp) => {
          const next = new URLSearchParams(sp);
          if (qInput) next.set('q', qInput);
          else next.delete('q');
          return next;
        },
        { replace: true },
      );
    }, 250);
    return () => clearTimeout(t);
  }, [qInput, q, setSearchParams]);

  const groupsQuery = useQuery({
    queryKey: ['groups'],
    queryFn: () => api.groups(),
  });

  const channelsQuery = useQuery({
    queryKey: ['channels', { group, q }],
    queryFn: () => api.channels({ group: group || undefined, q: q || undefined, limit: 200 }),
  });

  const groups = useMemo(() => groupsQuery.data?.data ?? [], [groupsQuery.data]);
  const channels = channelsQuery.data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Channels</h1>
        <input
          type="search"
          placeholder="Search channels…"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          className="w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-1.5 text-sm placeholder:text-[color:var(--color-muted-foreground)] focus:outline-none focus:ring-2 focus:ring-amber-500/40 sm:w-72"
        />
      </div>

      {groups.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <GroupChip
            active={!group}
            label="All"
            onClick={() =>
              setSearchParams(
                (sp) => {
                  const next = new URLSearchParams(sp);
                  next.delete('group');
                  return next;
                },
                { replace: true },
              )
            }
          />
          {groups.map((name) => (
            <GroupChip
              key={name}
              active={group === name}
              label={name}
              onClick={() =>
                setSearchParams(
                  (sp) => {
                    const next = new URLSearchParams(sp);
                    next.set('group', name);
                    return next;
                  },
                  { replace: true },
                )
              }
            />
          ))}
        </div>
      ) : null}

      {channelsQuery.isPending ? (
        <div className="py-12 text-center text-sm text-[color:var(--color-muted-foreground)]">Loading channels…</div>
      ) : channelsQuery.isError ? (
        <div className="rounded-md border border-red-900/40 bg-red-950/30 p-4 text-sm text-red-300">
          Could not load channels: {(channelsQuery.error as Error).message}
        </div>
      ) : channels.length === 0 ? (
        <div className="py-12 text-center text-sm text-[color:var(--color-muted-foreground)]">No channels match these filters.</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {channels.map((c) => (
            <ChannelCard key={c.id} channel={c} />
          ))}
        </div>
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
