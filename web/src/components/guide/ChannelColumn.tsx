import { Link } from 'react-router';
import type { Channel } from '@/api/client';

interface Props {
  channel: Channel;
  height: number;
}

// ChannelColumn renders a single sticky row in the left axis of the guide.
// Used both as the body of the channel-strip and as the link target that
// jumps to /watch/{id}. Logo + name + channel number stay compact so the
// programs strip gets the bulk of the horizontal real estate.
export function ChannelColumn({ channel, height }: Props) {
  return (
    <Link
      to={`/watch/${encodeURIComponent(channel.id)}`}
      className="flex shrink-0 items-center gap-2 border-b border-r border-[color:var(--color-border)] bg-[color:var(--color-background)] px-2 transition-colors hover:bg-[color:var(--color-surface)]"
      style={{ height }}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded bg-black/40">
        {channel.logo_url ? (
          <img
            src={channel.logo_url}
            alt=""
            loading="lazy"
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="text-[9px] text-[color:var(--color-muted-foreground)]">—</span>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          {channel.channel_number ? (
            <span className="rounded bg-black/40 px-1 text-[9px] font-mono tabular-nums text-[color:var(--color-muted-foreground)]">
              {channel.channel_number}
            </span>
          ) : null}
        </div>
        <div className="truncate text-xs font-medium">{channel.display_name}</div>
      </div>
    </Link>
  );
}
