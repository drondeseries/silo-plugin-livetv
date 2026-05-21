import { useNavigate, useLocation } from 'react-router';
import { cellLeft, cellWidth } from './scroll';
import type { Program } from '@/api/client';
import { cn, formatTimeRange, isAiringNow } from '@/lib/utils';

interface Props {
  program: Program;
  windowStart: string;
  pxPerMin: number;
  rowHeight: number;
}

// ProgramCell renders a single absolutely-positioned cell on a channel
// strip. Clicking opens the ProgramDetail modal route via react-router's
// background-location pattern so the guide stays visible underneath the
// dialog.
export function ProgramCell({ program, windowStart, pxPerMin, rowHeight }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const left = cellLeft(program.start, windowStart, pxPerMin);
  const width = cellWidth(program.start, program.stop, pxPerMin);
  const airing = isAiringNow(program.start, program.stop);

  return (
    <button
      type="button"
      onClick={() =>
        navigate(`/programs/${encodeURIComponent(program.id)}`, { state: { background: location } })
      }
      className={cn(
        'absolute top-0 flex h-full flex-col items-start gap-0.5 overflow-hidden rounded-sm px-2 py-1 text-left text-xs transition-colors',
        airing
          ? 'bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40'
          : 'bg-[color:var(--color-surface)] hover:bg-[color:var(--color-surface-hover)] border border-[color:var(--color-border)]',
      )}
      style={{
        left,
        width,
        height: rowHeight - 4,
        marginTop: 2,
      }}
      title={`${program.title} — ${formatTimeRange(program.start, program.stop)}`}
    >
      <span className="w-full truncate font-medium">{program.title}</span>
      {width > 90 ? (
        <span className="w-full truncate text-[10px] text-[color:var(--color-muted-foreground)]">
          {formatTimeRange(program.start, program.stop)}
        </span>
      ) : null}
    </button>
  );
}
