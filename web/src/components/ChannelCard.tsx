import { Link } from 'react-router';
import { Star } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, type Channel, type ListEnvelope } from '@/api/client';
import { cn } from '@/lib/utils';

interface Props {
  channel: Channel;
  // When set, clicking the card body navigates to that path instead of /watch.
  // The favorite star always toggles the favorite state regardless.
  href?: string;
}

// ChannelCard renders one channel in the Channels grid or a horizontal Home
// rail. It encapsulates the favorite-toggle mutation so callers don't have
// to repeat optimistic-update boilerplate, and the whole card is a Link to
// /watch/{id} so a single tap starts playback on touch devices.
export function ChannelCard({ channel, href }: Props) {
  const qc = useQueryClient();

  const favMutation = useMutation({
    mutationFn: async (next: boolean) => {
      if (next) await api.addFav(channel.id);
      else await api.delFav(channel.id);
    },
    onMutate: async (next) => {
      // Optimistically flip `is_favorite` on every cached channels list (the
      // page may have multiple, e.g. group-filtered + search). We don't try
      // to update the favorites list cache here — the user lands on that
      // page through a separate query that will refetch on focus or reorder.
      await qc.cancelQueries({ queryKey: ['channels'] });
      const snapshots: Array<[unknown, ListEnvelope<Channel> | undefined]> = [];
      qc.getQueriesData<ListEnvelope<Channel>>({ queryKey: ['channels'] }).forEach(([key, data]) => {
        snapshots.push([key, data]);
        if (!data) return;
        qc.setQueryData<ListEnvelope<Channel>>(key as readonly unknown[], {
          ...data,
          data: data.data.map((c) =>
            c.id === channel.id ? { ...c, is_favorite: next } : c,
          ),
        });
      });
      // Also patch the single-channel cache used by the player page.
      const single = qc.getQueryData<Channel>(['channel', channel.id]);
      if (single) qc.setQueryData(['channel', channel.id], { ...single, is_favorite: next });
      return { snapshots, single };
    },
    onError: (err, _next, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key as readonly unknown[], data));
      if (ctx?.single) qc.setQueryData(['channel', channel.id], ctx.single);
      toast.error(`Couldn't update favorite: ${(err as Error).message}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['favorites'] });
    },
  });

  const linkTo = href ?? `/watch/${encodeURIComponent(channel.id)}`;

  return (
    <div className="group relative flex flex-col gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3 transition-colors hover:bg-[color:var(--color-surface-hover)]">
      <Link to={linkTo} className="flex items-start gap-3">
        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-black/40">
          {channel.logo_url ? (
            <img
              src={channel.logo_url}
              alt=""
              loading="lazy"
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="text-xs text-[color:var(--color-muted-foreground)]">No logo</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {channel.channel_number ? (
              <span className="rounded bg-black/40 px-1.5 py-0.5 text-[10px] font-mono tabular-nums text-[color:var(--color-muted-foreground)]">
                {channel.channel_number}
              </span>
            ) : null}
            <span className="truncate text-sm font-medium">{channel.display_name}</span>
          </div>
          {channel.current_program ? (
            <div className="mt-1 truncate text-xs text-[color:var(--color-muted-foreground)]">
              Now: {channel.current_program.title}
            </div>
          ) : null}
          {channel.next_program ? (
            <div className="truncate text-[11px] text-[color:var(--color-muted-foreground)]/80">
              Next: {channel.next_program.title}
            </div>
          ) : null}
        </div>
      </Link>

      <button
        type="button"
        aria-label={channel.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
        aria-pressed={channel.is_favorite}
        disabled={favMutation.isPending}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          favMutation.mutate(!channel.is_favorite);
        }}
        className={cn(
          'absolute top-2 right-2 rounded-md p-1.5 transition-colors',
          'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
          channel.is_favorite && 'opacity-100',
          'hover:bg-black/40',
        )}
      >
        <Star
          size={16}
          className={cn(
            channel.is_favorite ? 'fill-amber-400 text-amber-400' : 'text-[color:var(--color-muted-foreground)]',
          )}
        />
      </button>
    </div>
  );
}
