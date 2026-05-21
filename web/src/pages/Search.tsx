import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Search as SearchIcon } from 'lucide-react';
import { api, type Channel, type Program } from '@/api/client';
import { formatTimeRange, isAiringNow, cn } from '@/lib/utils';

// Search page debounces user input by 250ms before firing api.search.
// Results group by xmltv_channel_id; we join client-side against a wide
// channels query so each group can render the channel's display name and
// logo. If the channel can't be resolved (e.g. an EPG-only entry) we fall
// back to showing the raw xmltv id.
export function Search() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const [qInput, setQInput] = useState(q);

  // Mirror local input into the URL after 250ms of stillness — keeps the
  // address bar shareable while not spamming network on every keystroke.
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

  const searchQuery = useQuery({
    queryKey: ['programs/search', { q }],
    queryFn: () => api.search(q, undefined, undefined, 200),
    enabled: q.length >= 2,
  });

  // Lookup table for channel display name + logo, keyed by both internal
  // channel id and xmltv id. Results come back keyed by xmltv id; we still
  // index by internal id for the navigation handler.
  const channelsQuery = useQuery({
    queryKey: ['channels', { forSearch: true }],
    queryFn: () => api.channels({ limit: 500 }),
  });

  const channelLookup = useMemo(() => {
    const byXmltv = new Map<string, Channel>();
    const byId = new Map<string, Channel>();
    for (const c of channelsQuery.data?.data ?? []) {
      byId.set(c.id, c);
      // The channel DTO doesn't carry the xmltv id explicitly; we depend
      // on a now/next program's xmltv_channel_id when present. This is a
      // graceful-degradation lookup, not a perfect one — see comment below.
      const x = c.current_program ? (c as Channel & { current_program?: { id: string } }).current_program?.id : undefined;
      if (x) byXmltv.set(x, c);
    }
    return { byXmltv, byId };
  }, [channelsQuery.data]);

  // Group results by xmltv id (programs that share a channel cluster).
  const grouped = useMemo(() => {
    const programs = searchQuery.data?.data ?? [];
    const groups = new Map<string, Program[]>();
    for (const p of programs) {
      const key = p.xmltv_channel_id ?? '(unknown)';
      const list = groups.get(key) ?? [];
      list.push(p);
      groups.set(key, list);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [searchQuery.data]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Search the guide</h1>
        <p className="text-xs text-[color:var(--color-muted-foreground)]">
          Looks across program titles, sub-titles, and descriptions.
        </p>
      </div>

      <div className="relative">
        <SearchIcon
          size={16}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--color-muted-foreground)]"
        />
        <input
          type="search"
          placeholder="Search programs…"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          autoFocus
          className="w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] py-2 pr-3 pl-9 text-sm placeholder:text-[color:var(--color-muted-foreground)] focus:outline-none focus:ring-2 focus:ring-amber-500/40"
        />
      </div>

      {q.length < 2 ? (
        <div className="py-12 text-center text-sm text-[color:var(--color-muted-foreground)]">
          Type at least two characters to search.
        </div>
      ) : searchQuery.isPending ? (
        <div className="py-12 text-center text-sm text-[color:var(--color-muted-foreground)]">Searching…</div>
      ) : searchQuery.isError ? (
        <div className="rounded-md border border-red-900/40 bg-red-950/30 p-4 text-sm text-red-300">
          Search failed: {(searchQuery.error as Error).message}
        </div>
      ) : grouped.length === 0 ? (
        <div className="py-12 text-center text-sm text-[color:var(--color-muted-foreground)]">
          No programs matched.
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([xmltvId, programs]) => {
            // Try to resolve a friendly channel name. The lookup is
            // best-effort: see channelLookup comment above for the
            // graceful-degradation rationale.
            const channel = channelLookup.byXmltv.get(xmltvId);
            return (
              <section key={xmltvId} className="space-y-2">
                <h2 className="flex items-baseline gap-2 text-sm font-semibold text-[color:var(--color-muted-foreground)]">
                  {channel ? channel.display_name : xmltvId}
                  {channel?.channel_number ? (
                    <span className="rounded bg-black/40 px-1.5 py-0.5 text-[10px] font-mono tabular-nums">
                      {channel.channel_number}
                    </span>
                  ) : null}
                  <span className="ml-auto text-xs font-normal text-[color:var(--color-muted-foreground)]">
                    {programs.length} {programs.length === 1 ? 'result' : 'results'}
                  </span>
                </h2>
                <ul className="space-y-1">
                  {programs.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/programs/${encodeURIComponent(p.id)}`, {
                            state: { background: location },
                          })
                        }
                        className={cn(
                          'flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors',
                          isAiringNow(p.start, p.stop)
                            ? 'border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20'
                            : 'border-[color:var(--color-border)] bg-[color:var(--color-surface)] hover:bg-[color:var(--color-surface-hover)]',
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="truncate font-medium">{p.title}</div>
                          {p.sub_title ? (
                            <div className="truncate text-xs text-[color:var(--color-muted-foreground)]">
                              {p.sub_title}
                            </div>
                          ) : null}
                          <div className="mt-1 font-mono text-[11px] text-[color:var(--color-muted-foreground)]">
                            {new Date(p.start).toLocaleDateString()} · {formatTimeRange(p.start, p.stop)}
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
