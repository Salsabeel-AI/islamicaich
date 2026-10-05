import { memo, useMemo } from 'react';



/**
 * BarqRoots — ⭐ owner 2026-07-14. Renders a `barq-roots` fence (JSON {roots:[{root}], hint?}) as a row of
 * CLICKABLE `.barq-ref` chips carrying `data-root`. The global InlineAyahViewer catches the click and opens the
 * in-app POPUP that lazily fetches the root's MEANING + DERIVATIVES (/api/barq/read/root) — no fake chat message.
 * Fixes the "misleading" resubmit chips: a cryptic neighbour root (لبب/سور…) becomes one click → its meaning.
 */
type TRoot = { root: string; gloss?: string };

const BarqRoots: React.ElementType = memo(function BarqRoots({ content }: { content: string }) {
  const isRTL = true;
  const data = useMemo<{ roots?: TRoot[]; hint?: string } | null>(() => {
    try {
      const d = JSON.parse((content ?? '').trim());
      return d && typeof d === 'object' ? d : null;
    } catch {
      return null;
    }
  }, [content]);

  const roots = Array.isArray(data?.roots) ? (data!.roots as TRoot[]) : [];
  if (!roots.length) {
    return null;
  }
  const hint = typeof data?.hint === 'string' && data!.hint ? data!.hint : '🌱 اضغطْ جذرًا لكشفِ معناه ومشتقاتِه:';

  return (
    <div
      dir={isRTL ? 'rtl' : 'ltr'}
      className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-light pt-2"
    >
      <span className="text-xs font-semibold text-text-secondary">{hint}</span>
      {roots.map((r, i) => {
        const root = (r?.root ?? '').trim();
        if (!root) {
          return null;
        }
        return (
          <span
            key={i}
            role="button"
            tabIndex={0}
            data-root={root}
            title="اضغطْ لكشفِ المعنى والمشتقّات"
            className="barq-ref cursor-pointer select-none rounded-full border border-[var(--barq-gold-dim)] bg-surface-secondary px-3 py-1 text-[13px] font-medium text-text-primary transition-colors hover:bg-surface-active-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--barq-gold)]"
          >
            🌱 {root}
            {r.gloss ? <span className="mr-1 text-text-secondary">— {r.gloss}</span> : null}
          </span>
        );
      })}
    </div>
  );
});

BarqRoots.displayName = 'BarqRoots';

export default BarqRoots;
