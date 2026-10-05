import { memo, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeBarqRefs from './rehypeBarqRefs';

/**
 * BarqMore — ⭐ owner 2026-08-06. Renders a ```barq-more fence as an INLINE expandable passage:
 * a bold header (line 1, always visible) + a body that shows a preview and expands with «المزيد ▾».
 * Built for long hadith/tafsir (مجلس المفسّرين): the full نصّ is in the message (one round-trip, instant
 * expand), collapsed by default so the council stays compact. Ayah citations inside stay clickable
 * (rehypeBarqRefs → InlineAyahViewer). FORMAT: line 1 = header, the rest = the full body prose.
 */
const LIMIT = 300;

const BarqMore: React.ElementType = memo(function BarqMore({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const { header, body } = useMemo(() => {
    const raw = (content ?? '').replace(/\n+$/, '');
    const nl = raw.indexOf('\n');
    if (nl < 0) {
      return { header: '', body: raw.trim() };
    }
    return { header: raw.slice(0, nl).trim(), body: raw.slice(nl + 1).trim() };
  }, [content]);

  const long = body.length > LIMIT + 40;
  const shown = expanded || !long ? body : body.slice(0, LIMIT).trimEnd() + '…';

  return (
    <div
      dir="rtl"
      lang="ar"
      className="my-2 max-w-full overflow-hidden whitespace-normal break-words rounded-xl border border-border-light bg-surface-secondary px-4 py-3"
    >
      {header && (
        <div className="ms-auto max-w-[78ch] whitespace-normal break-words text-right text-sm font-bold leading-7 text-green-800 dark:text-green-300">
          {header}
        </div>
      )}
      <div
        dir="rtl"
        lang="ar"
        style={{ textAlign: 'right', wordSpacing: 0, letterSpacing: 'normal' }}
        className="barq-more-body ms-auto max-w-[78ch] whitespace-normal break-words text-right text-[15px] leading-[1.9] text-text-primary [&_*]:max-w-full [&_p]:my-0 [&_p]:whitespace-normal [&_p]:break-words [&_p]:text-right"
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeBarqRefs]}>
          {shown}
        </ReactMarkdown>
      </div>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 whitespace-nowrap text-xs font-semibold text-green-700 underline decoration-dotted underline-offset-2 hover:text-green-800 dark:text-green-400"
        >
          {expanded ? 'أقلّ ▲' : 'المزيد ▾'}
        </button>
      )}
    </div>
  );
});

BarqMore.displayName = 'BarqMore';

export default BarqMore;
