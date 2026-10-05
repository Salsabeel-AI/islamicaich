import { memo, useMemo } from 'react';



/**
 * BarqRefs — ⭐ Fata Sovereign Reference Cards. Renders a `barq-refs` fence (JSON {refs:[…]}) as a row of
 * CLICKABLE source chips below a grounded answer. Every chip is a `.barq-ref` span, so the global
 * InlineAyahViewer (mounted in ChatView) handles the click:
 *   • Quran chip → data-surah/data-ayah → popup fetches OUR verse (/api/barq/read/ayah) — sovereign.
 *   • Tafsir/Hadith/KB/معجم chip → data-body → popup shows the retrieved passage VERBATIM (no external link).
 * Beats قبس: sovereign, structured, exact provenance, one click to the PRIMARY text. 0-fab (real sources).
 */
type TRef = {
  kind?: string;
  icon?: string;
  type?: string;
  name?: string;
  surah?: number;
  ayah?: number;
  body?: string;
  url?: string;
};

const BarqRefs: React.ElementType = memo(function BarqRefs({ content }: { content: string }) {
  const isRTL = true;
  const refs = useMemo<TRef[]>(() => {
    try {
      const d = JSON.parse((content ?? '').trim());
      return Array.isArray(d?.refs) ? d.refs : [];
    } catch {
      return [];
    }
  }, [content]);

  if (!refs.length) {
    return null;
  }

  const consultationOnly = refs.every(r => r.kind === "qabas-consultation" || r.name === "استشرت جدي قبس" || r.kind === "barq-voice");
  return (
    <div
      dir={isRTL ? 'rtl' : 'ltr'}
      className="clear-both mb-1 mt-2 rounded-xl border border-border-light bg-surface-secondary px-3.5 py-2.5 text-sm"
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-2 font-semibold text-green-700 dark:text-green-500">
        <span>{consultationOnly ? "🧭 مراجعة الجواب" : "✔ إجابةٌ مؤصَّلة — الدليل"}</span>
        <span className="text-xs font-normal text-text-secondary">— اضغطِ المصدرَ للقراءة</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
      {refs.map((r, i) => {
        const chipClass='rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs text-green-700 dark:text-green-400 cursor-pointer underline decoration-green-700/40 underline-offset-2 transition-colors hover:bg-green-500/20';
        let href:string|undefined;
        try {const url=new URL(r.url||'');if(url.protocol==='https:'&&!url.username&&!url.password)href=url.href;}catch{}
        if(href)return <a key={i} href={href} target="_blank" rel="noopener noreferrer" className={chipClass} title={href}>{r.icon ? `${r.icon} ` : ''}{r.name}</a>;
        const isQ =
          (r.type === 'quran' || r.type === 'quran_prose') &&
          typeof r.surah === 'number' &&
          (r.surah as number) >= 1;
        const attrs: Record<string, string | number> = isQ
          ? { 'data-surah': r.surah as number, 'data-ayah': r.ayah ?? 0 }
          : { 'data-label': r.name ?? 'المصدر', 'data-body': r.body ?? '' };
        return (
          <span
            key={i}
            role="button"
            tabIndex={0}
            title="اضغطْ لعرضِ المصدرِ المؤصَّل"
            className={'barq-ref '+chipClass}
            {...attrs}
          >
            {r.icon ? `${r.icon} ` : ''}
            {r.name}
          </span>
        );
      })}
      </div>
    </div>
  );
});

BarqRefs.displayName = 'BarqRefs';

export default BarqRefs;
