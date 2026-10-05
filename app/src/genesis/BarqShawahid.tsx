import { useEffect, useRef, useState } from 'react';

import { createPortal } from 'react-dom';

// Root citation only: preserve lookup keys and all quoted/source word spellings.
const citeRoot = (root: string) => root.replace(/ء/g, 'أ');


/**

 * BarqShawahid — ⭐ owner 2026-08-06 «برهنِ العدّ». A global click delegate + popup that PROVES an اشتقاق count:

 * clicking a `.barq-attest` chip (data-attest-source / -surface / -diac) opens a mobile-responsive modal listing the

 * REAL occurrences (نصّ + مرجع) of that surface in that source — first 7, then «التالي ٧» (which scrolls to the new

 * batch). Optional «بالتشكيل» toggle narrows to the EXACT vocalized form (distinguishes مُوَقِّع II from مُوْقِع IV);

 * default OFF = open/bare family search. Sovereign & 0-fab via /api/barq/read/attest.

 * Mounted once (in ChatView + ShareView) alongside InlineAyahViewer — one document listener, no per-message cost.

 */

type PoetEvidence = {
  className?: string;
  relationType?: string;
  text?: string;
  source?: string;
  confidence?: number;
};
type PoetProfile = {
  authorId: number;
  canonicalName: string;
  aliases?: string;
  birthYearH?: number | null;
  deathYearH?: number | null;
  era?: string;
  bornCity?: string;
  authoredCity?: string;
  madhhab?: string;
  bookCount?: number | null;
  confidence?: number | null;
  bio?: string;
  bioSource?: string;
  evidence?: PoetEvidence[];
};
type PoetryMeta = {
  id: number;
  poet?: string;
  era?: string;
  meter?: string;
  theme?: string;
  corpus?: 'poetry' | 'poetry_attr';
  attribution?: string;
  profileKey?: string;
};
type Row = { ref: string; text: string; hl?: string[]; poetry?: PoetryMeta };
type PoetryReaderRow = { parts: string[]; ids: number[]; matched?: boolean };
type PoetryReaderState = {
  source: 'poetry' | 'poetry_attr';
  id: number;
  meta?: PoetryMeta;
  rows: PoetryReaderRow[];
  start: number;
  hasMore: boolean;
  next: number;
  bounded: boolean;
  unitAr: string;
  loading: boolean;
  loadingMore: boolean;
  error?: boolean;
};
type State = {
  source: string;
  surface: string;
  diac: string;
  /** Display-only term retained by a contextual poetry anchor. */
  highlight?: string;
  sourceAr: string;

  rows: Row[];

  loading: boolean;

  loadingMore: boolean;

  error?: boolean;

  start: number;

  hasMore: boolean;

  tashkeel: boolean;

  /** ⭐ owner 2026-08-08: used roots of this surface (server `mutajanis` field) → the ⟐ isolation bar */

  mutajanis?: { root: string; total: number; gloss?: string }[];

  /** active root isolation filter (undefined = الكلّ) */
  rootFilter?: string;
  /** Deduplicated, exact-match biographies referenced by poetry rows. */
  poets: Record<string, PoetProfile>;
};

// Internal routing keys must never leak into the Arabic research UI, even
// while a request is loading or when it fails before returning sourceAr.
const sourceLabel = (source: string) => {
  if (source.includes('quran') || source.includes('قرآن')) {
    return 'القرآن';
  }
  const labels: Record<string, string> = {
    quran: 'القرآن',
    quran_form: 'القرآن',
    hadith: 'الحديث',
    tafseer: 'التفسير',
    poetry: 'الشعر',
    barq_poet: 'برق الشاعر',
  };
  return labels[source.toLowerCase()] || source;
};


const toAr = (n: number | string) => String(n).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);

const stripHarakat = (s: string) => (s || '').replace(/[ً-ْٰـ]/g, '');



// ── word highlight: match the searched surface inside a (diacritized) نصّ, prefix-tolerant ──

const AR_ONLY = /[^ء-ي]/g;

// ⭐ owner 2026-08-10 «فَٱنْهَارَ لم تُظلَّل»: the Uthmani wasla ٱ (U+0671) sits OUTSIDE ء-ي so AR_ONLY used to

// DELETE it (فٱنهار→فنهار) and no key could ever match — fold it to ا first (server folds identically).

const bareWord = (w: string) =>

  (w || '')

    .replace(/ٱ/g, 'ا')

    .replace(/[ً-ْٰـ]/g, '')

    .replace(AR_ONLY, '');

const PROC = /^(?:وال|فال|بال|كال|لل|ال|و|ف|ب|ك|ل)/;

// ⭐ owner 2026-08-06: highlight against ONE OR MORE keys. Quran rows carry `hl` = the rasm-bare Uthmani form(s)

// (موقع) — because the ayah text is Uthmani (بِمَوَٰقِعِ) while the search surface is imlā'ī (مواقع), so matching the

// imlā'ī key would miss. Other sources fall back to the single bare surface.

function matchesAny(word: string, keys: string[]): boolean {

  const wb = bareWord(word);

  if (!wb) {

    return false;

  }

  return keys.some((k) => {

    const kb = bareWord(k); // keys from older answers may still carry the wasla — bare both sides

    return !!kb && (wb === kb || wb.replace(PROC, '') === kb || (kb.length >= 3 && wb.includes(kb)));

  });

}

function renderHighlighted(text: string, keys: string[]) {

  return text.split(/(\s+)/).map((tok, i) =>

    /^\s+$/.test(tok) || !matchesAny(tok, keys) ? (

      <span key={i}>{tok}</span>

    ) : (

      <mark key={i} className="rounded bg-yellow-200 px-0.5 text-inherit dark:bg-yellow-500/40">

        {tok}

      </mark>

    ),

  );

}

function firstMatchIndex(text: string, keys: string[]): number {

  const re = /\S+/g;

  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {

    if (matchesAny(m[0], keys)) {

      return m.index;

    }

  }

  return -1;

}



/** One شاهد row. Poetry has a source-native layout: verse first, then poet and verified metadata. */
function Shahid({
  i,
  n,
  row,
  keys,
  poets,
  onOpenPoetry,
}: {
  i: number;
  n: number;
  row: Row;
  keys: string[];
  poets: Record<string, PoetProfile>;
  onOpenPoetry: (source: 'poetry' | 'poetry_attr', id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { text, ref: refText, poetry } = row;
  const profile = poetry?.profileKey ? poets[poetry.profileKey] : undefined;
  const WINDOW = 220;

  const long = text.length > WINDOW + 40;

  let shown = text;

  let pre = false;

  let suf = false;

  if (long && !expanded) {

    const idx = firstMatchIndex(text, keys);

    if (idx < 0) {

      shown = text.slice(0, WINDOW);

      suf = true;

    } else {

      const start = Math.max(0, idx - Math.floor(WINDOW / 2));

      const end = Math.min(text.length, idx + Math.ceil(WINDOW / 2));

      shown = text.slice(start, end);

      pre = start > 0;

      suf = end < text.length;

    }

  }

  const moreButton = long ? (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      className="mr-1 whitespace-nowrap text-xs font-semibold text-green-700 underline decoration-dotted underline-offset-2 hover:text-green-800 dark:text-green-400"
    >
      {expanded ? 'أقلّ ▲' : 'المزيد ▾'}
    </button>
  ) : null;

  if (poetry) {
    const yearH = (value?: number | null) => {
      if (!value) {
        return '';
      }
      return value < 0 ? `${toAr(Math.abs(value))} ق.هـ` : `${toAr(value)}هـ`;
    };
    const years =
      profile?.birthYearH || profile?.deathYearH
        ? `${profile.birthYearH ? `وُلد ${yearH(profile.birthYearH)}` : ''}${
            profile.birthYearH && profile.deathYearH ? ' — ' : ''
          }${profile.deathYearH ? `توفي ${yearH(profile.deathYearH)}` : ''}`
        : '';
    return (
      <li
        data-i={i}
        className="scroll-mt-2 rounded-xl border border-amber-400/30 bg-surface-secondary px-3.5 py-3 leading-loose"
      >
        {/* Owner contract: the poetry itself always leads. */}
        <div className="whitespace-pre-line border-r-2 border-amber-500/50 pr-3 text-[16px] font-medium text-text-primary">
          {pre && '… '}
          {renderHighlighted(shown, keys)}
          {suf && ' …'}
          {moreButton}
        </div>

        <div className="mt-2.5 border-t border-border-light pt-2 text-sm">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-amber-800 dark:text-amber-400">
            <span className="tabular-nums opacity-70">{toAr(n)}.</span>
            <span>🪶 الشاعر: {poetry.poet || refText || 'غير محدَّد في السجل'}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-text-secondary">
            {poetry.meter && <span className="rounded-full bg-amber-500/10 px-2 py-0.5">البحر: {poetry.meter}</span>}
            {poetry.theme && <span className="rounded-full bg-amber-500/10 px-2 py-0.5">الغرض: {poetry.theme}</span>}
            {poetry.era && <span className="rounded-full bg-amber-500/10 px-2 py-0.5">العصر: {poetry.era}</span>}
            {poetry.attribution && (
              <span className="rounded-full bg-surface-tertiary px-2 py-0.5">السجل: {poetry.attribution}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => onOpenPoetry(poetry.corpus || 'poetry', poetry.id)}
            className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-500/20 dark:text-amber-300"
          >
            📜 عرض بقية النص — ٧×٧
          </button>
        </div>

        {profile && (
          <details className="mt-2 rounded-lg border border-border-light bg-surface-primary px-3 py-2">
            <summary className="cursor-pointer select-none text-sm font-semibold text-green-700 dark:text-green-400">
              معلوماتُ الشاعر المؤصَّلة — {profile.canonicalName}
            </summary>
            <div className="mt-2 space-y-1.5 text-sm text-text-secondary">
              {profile.aliases && <p><b className="text-text-primary">الأسماء والكنى:</b> {profile.aliases}</p>}
              {years && <p><b className="text-text-primary">الميلاد والوفاة:</b> {years}</p>}
              {profile.era && <p><b className="text-text-primary">العصر:</b> {profile.era}</p>}
              {profile.bornCity && <p><b className="text-text-primary">بلد الميلاد:</b> {profile.bornCity}</p>}
              {profile.authoredCity && <p><b className="text-text-primary">بلد التأليف:</b> {profile.authoredCity}</p>}
              {profile.madhhab && <p><b className="text-text-primary">المذهب:</b> {profile.madhhab}</p>}
              {profile.bookCount != null && (
                <p><b className="text-text-primary">المؤلفات المفهرسة:</b> {toAr(profile.bookCount)}</p>
              )}
              {profile.bio && <p><b className="text-text-primary">الترجمة:</b> {profile.bio}</p>}
              {profile.bioSource && <p><b className="text-text-primary">مصدر الترجمة:</b> {profile.bioSource}</p>}
              {(profile.evidence?.length ?? 0) > 0 && (
                <div>
                  <b className="text-text-primary">الأدلة التاريخية الموثقة:</b>
                  <ul className="mt-1 list-disc space-y-1 pr-5">
                    {profile.evidence!.map((e, j) => (
                      <li key={`${e.className || ''}-${j}`}>
                        {[e.className, e.relationType].filter(Boolean).join(' — ')}
                        {e.text ? `: ${e.text}` : ''}
                        {e.source ? ` (${e.source})` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </details>
        )}
      </li>
    );
  }

  return (
    <li

      data-i={i}

      className="scroll-mt-2 rounded-xl border border-border-light bg-surface-secondary px-3.5 py-2.5 leading-loose"

    >

      <div className="mb-0.5 flex items-center gap-2 text-xs font-semibold text-green-700 dark:text-green-500">

        <span className="tabular-nums opacity-70">{toAr(n)}.</span>

        <span className="truncate">{refText || '—'}</span>

      </div>

      <div className="text-[15px] text-text-primary">

        {pre && '… '}

        {renderHighlighted(shown, keys)}

        {suf && ' …'}

        {moreButton}
      </div>

    </li>

  );

}



export default function BarqShawahid() {
  const [st, setSt] = useState<State | null>(null);
  const [poem, setPoem] = useState<PoetryReaderState | null>(null);
  const reqId = useRef(0);
  const poemReqId = useRef(0);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const scrollTo = useRef<number>(-1);



  const fetchPage = (
    source: string,

    surface: string,

    diac: string,

    tashkeel: boolean,

    start: number,

    append: boolean,

    rootFilter?: string,

  ) => {

    const id = ++reqId.current;

    const tkParam = tashkeel && diac ? `&tk=${encodeURIComponent(diac)}` : '';

    const rootParam = rootFilter ? `&root=${encodeURIComponent(rootFilter)}` : '';

    /* ⭐ owner 2026-08-08-e: ALWAYS send the written form — its hamza seat is phonemic (أنهار/نهر ≠ انهار/هور);

       the server keys the متجانس bar + candidates on it, so readings never mix through the أ→ا fold. */

    const diacParam = diac ? `&diac=${encodeURIComponent(diac)}` : '';

    fetch(

      `/api/barq/read/attest/${encodeURIComponent(source)}/${encodeURIComponent(surface)}?start=${start}${tkParam}${rootParam}${diacParam}`,

    )

      .then((r) => r.json())

      .then((j) => {

        if (id !== reqId.current) {

          return;

        }

        setSt((cur) => {

          if (!cur || cur.source !== source || cur.surface !== surface || cur.tashkeel !== tashkeel) {

            return cur;

          }

          if (!j?.ok) {

            return { ...cur, loading: false, loadingMore: false, error: !append };

          }

          const incoming: Row[] = Array.isArray(j.rows) ? j.rows : [];
          const incomingPoets: Record<string, PoetProfile> =
            j.poets && typeof j.poets === 'object' && !Array.isArray(j.poets) ? j.poets : {};
          if (append) {

            scrollTo.current = cur.rows.length; // first index of the new batch → scroll it to top

          }

          return {

            ...cur,

            sourceAr: j.sourceAr || cur.sourceAr,

            rows: append ? [...cur.rows, ...incoming] : incoming,

            loading: false,

            loadingMore: false,

            error: false,

            start: j.next ?? start + incoming.length,

            hasMore: !!j.hasMore,
            mutajanis: Array.isArray(j.mutajanis) ? j.mutajanis : cur.mutajanis,
            poets: append ? { ...cur.poets, ...incomingPoets } : incomingPoets,
          };

        });

      })

      .catch(() => {

        if (id !== reqId.current) {

          return;

        }

        setSt((cur) => (cur ? { ...cur, loading: false, loadingMore: false, error: !append } : cur));

      });
  };

  const fetchPoem = (source: 'poetry' | 'poetry_attr', id: number, start = 0, append = false) => {
    const request = ++poemReqId.current;
    fetch(`/api/barq/read/poetry/${encodeURIComponent(source)}/${id}?start=${start}`)
      .then((r) => r.json())
      .then((j) => {
        if (request !== poemReqId.current) return;
        setPoem((cur) => {
          if (!cur || cur.source !== source || cur.id !== id || !j?.ok) {
            return cur ? { ...cur, loading: false, loadingMore: false, error: true } : cur;
          }
          const incoming: PoetryReaderRow[] = Array.isArray(j.rows) ? j.rows : [];
          return {
            ...cur,
            meta: j.meta || cur.meta,
            rows: append ? [...cur.rows, ...incoming] : incoming,
            start: j.next ?? start + incoming.length,
            hasMore: !!j.hasMore,
            next: j.next ?? start + incoming.length,
            bounded: !!j.bounded,
            unitAr: j.unitAr || cur.unitAr,
            loading: false,
            loadingMore: false,
            error: false,
          };
        });
      })
      .catch(() => {
        if (request === poemReqId.current) {
          setPoem((cur) => (cur ? { ...cur, loading: false, loadingMore: false, error: true } : cur));
        }
      });
  };

  const openPoetry = (source: 'poetry' | 'poetry_attr', id: number) => {
    setPoem({ source, id, rows: [], start: 0, next: 0, hasMore: false, bounded: false,
      unitAr: 'بيت', loading: true, loadingMore: false });
    fetchPoem(source, id);
  };


  useEffect(() => {

    const dec = (s: string) => {

      try {

        return decodeURIComponent(s);

      } catch {

        return s;

      }

    };

    const onClick = (e: MouseEvent) => {

      const t = e.target as HTMLElement;

      let source = '';

      let surface = '';
      let diac = '';
      let rootFilter = '';
      let highlight = '';
      const chip = t?.closest?.('.barq-attest') as HTMLElement | null;

      if (chip) {

        source = (chip.getAttribute('data-attest-source') ?? '').trim();

        surface = (chip.getAttribute('data-attest-surface') ?? '').trim();

        diac = (chip.getAttribute('data-attest-diac') ?? '').trim();
        rootFilter = (chip.getAttribute('data-attest-root') ?? '').trim();
        highlight = (chip.getAttribute('data-attest-highlight') ?? '').trim();
      } else {

        // raw server-rendered link (e.g. inside the root-popup derive HTML): <a href="#barq-attest:src:bare:diac">

        const a = t?.closest?.('a[href^="#barq-attest:"]') as HTMLAnchorElement | null;

        if (!a) {

          return;

        }

        const rest = (a.getAttribute('href') || '').slice('#barq-attest:'.length);
        const [payload, query = ''] = rest.split('?', 2);
        const parts = payload.split(':');
        source = dec(parts[0] || '').trim();
        surface = dec(parts[1] || '').trim();
        diac = dec(parts.slice(2).join(':') || '').trim();
        rootFilter = dec(new URLSearchParams(query).get('root') || '').trim();
        highlight = dec(new URLSearchParams(query).get('hl') || '').trim();
      }

      if (!source || !surface) {

        return;

      }

      e.preventDefault();

      scrollTo.current = -1;

      setSt({

        source,

        surface,

        diac,
        highlight: highlight || undefined,
        sourceAr: sourceLabel(source),
        rows: [],

        loading: true,

        loadingMore: false,

        start: 0,

        hasMore: false,

        tashkeel: false,
        rootFilter: rootFilter || undefined,
        poets: {},
      });
      fetchPage(source, surface, diac, false, 0, false, rootFilter || undefined);
    };

    const onKey = (e: KeyboardEvent) => {

      if (e.key === 'Escape') {

        setSt(null);

      }

    };

    document.addEventListener('click', onClick, true);

    document.addEventListener('keydown', onKey);

    return () => {

      document.removeEventListener('click', onClick, true);

      document.removeEventListener('keydown', onKey);

    };

  }, []);



  // after «التالي» appends a batch, scroll its first row to the top of the list

  useEffect(() => {

    if (scrollTo.current >= 0 && bodyRef.current) {

      const target = bodyRef.current.querySelector<HTMLElement>(`[data-i="${scrollTo.current}"]`);

      if (target) {

        target.scrollIntoView({ block: 'start', behavior: 'smooth' });

      }

      scrollTo.current = -1;

    }

  }, [st?.rows]);



  if (!st) {

    return null;

  }



  const more = () => {

    setSt((cur) => (cur ? { ...cur, loadingMore: true } : cur));

    fetchPage(st.source, st.surface, st.diac, st.tashkeel, st.start, true, st.rootFilter);

  };



  /* ⭐ owner 2026-08-08 «اعزِلِ المتجانس»: pick a root chip → re-fetch this source's شواهد ISOLATED to that root —

     the proof that every occurrence is attributed to its reading (فَٱنْهَارَ appears under هور only, never نهر). */

  const setRootFilter = (r?: string) => {

    scrollTo.current = -1;

    setSt((cur) =>

      cur ? { ...cur, rootFilter: r, rows: [], loading: true, error: false, start: 0, hasMore: false } : cur,

    );

    fetchPage(st.source, st.surface, st.diac, st.tashkeel, 0, false, r);

  };



  // the toggle only matters when the diacritized form carries harakat beyond the bare surface.
  // ⭐ owner 2026-08-08: HIDDEN for القرآن — the Quran view matches by LEMMA (مُوَقِّع/مُوْقِع are already separate

  // lemmas), so the toggle was a visible no-op there.

  const canTashkeel =
    !!st.diac && stripHarakat(st.diac) !== st.diac && st.sourceAr !== 'القرآن' && st.source !== 'quran';
  const isPoetryView =
    st.source === 'poetry' || st.source === 'barq_poet' || st.source === 'الشعر' ||
    st.surface === 'الشعر' || st.surface === 'المنسوب' ||
    st.rows.some((r) => !!r.poetry);
  const toggleTashkeel = () => {

    const next = !st.tashkeel;

    scrollTo.current = -1;

    setSt((cur) => (cur ? { ...cur, tashkeel: next, rows: [], loading: true, error: false, start: 0, hasMore: false } : cur));

    fetchPage(st.source, st.surface, st.diac, next, 0, false, st.rootFilter);

  };



  return (
    <>
    {createPortal(
    <div

      dir="rtl"

      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"

      onClick={() => setSt(null)}

      role="dialog"

      aria-modal="true"

    >

      <div

        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border-medium bg-surface-primary shadow-2xl sm:max-h-[80vh] sm:rounded-2xl"

        onClick={(e) => e.stopPropagation()}

      >

        {/* header */}

        <div className="flex items-center justify-between gap-2 border-b border-border-light px-4 py-3 sm:px-5">

          <div className={`flex min-w-0 items-center gap-2 font-semibold ${
            isPoetryView ? 'text-amber-800 dark:text-amber-400' : 'text-green-700 dark:text-green-500'
          }`}>
            <span aria-hidden="true">{isPoetryView ? '🪶' : '📜'}</span>
            <span className="truncate">
              {st.source === 'barq_poet'
                ? 'برق الشاعر — القدرات والنسخة التجريبية'
                : isPoetryView && st.source === 'نصكامل'
                  ? 'البيتُ والشاعرُ — من ديوانِ برق'
                  : `شواهدُ «${st.tashkeel && st.diac ? st.diac : st.surface}» — ${st.sourceAr}`}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">

            {canTashkeel && st.source !== 'متجانس' && (

              <button

                type="button"

                onClick={toggleTashkeel}

                title="حصرُ النتائجِ على هذه الصيغةِ بالضبط (بالتشكيل)"

                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${

                  st.tashkeel

                    ? 'border-green-600 bg-green-600/15 text-green-700 dark:text-green-400'

                    : 'border-border-medium text-text-secondary hover:bg-surface-tertiary'

                }`}

              >

                {st.tashkeel ? '✓ بالتشكيل' : 'بالتشكيل'}

              </button>

            )}

            <button

              type="button"

              onClick={() => setSt(null)}

              aria-label="إغلاق"

              title="إغلاق (Esc)"

              className="rounded-lg px-2.5 py-1 text-lg font-bold text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary"

            >

              ✕

            </button>

          </div>

        </div>



        {/* ⭐ مُتجانِس ISOLATION BAR (owner 2026-08-08 «اعزِلِ المتجانس»): root chips + «الكلّ»; picking a root

            re-queries the SAME source isolated to that reading. Shown ONLY for a TRUE homograph (≥2 used roots) —

            with a single root «الكلّ» and the root show identical rows, so the bar would be meaningless noise

            (owner: «شواهد نهار في القرآن — ما معنى الكلّ مقابل جذر نهر؟»). */}

        {st.source !== 'متجانس' && (st.mutajanis?.length ?? 0) >= 2 && (

          <div className="flex flex-wrap items-center gap-1.5 border-b border-border-light px-4 py-2 sm:px-5">

            <span

              className="text-xs font-bold text-[#5a3d7a] dark:text-[#c9b3e8]"

              title="العددُ بجوارِ كلِّ جذرٍ = عدُّ مواضعِ هذه الصيغةِ المؤصَّلةُ تحتَه عبرَ المصادرِ كلِّها"

            >

              ⟐ اعزِلْ بالجذر (العدُّ الكلّيّ):

            </span>

            <button

              type="button"

              onClick={() => setRootFilter(undefined)}

              className={`rounded-lg border px-2.5 py-0.5 text-xs font-semibold transition-colors ${

                !st.rootFilter

                  ? 'border-[#5a3d7a] bg-[#5a3d7a] text-white'

                  : 'border-border-medium text-text-secondary hover:bg-surface-tertiary'

              }`}

            >

              الكلّ

            </button>

            {(st.mutajanis ?? []).map((m) => (
              <button

                key={m.root}

                type="button"

                onClick={() => setRootFilter(m.root)}

                title={`${m.gloss ? `${m.gloss} — ` : ''}عدُّها الكلّيُّ تحتَ «${citeRoot(m.root)}» عبرَ المصادر: ${toAr(m.total)}`}
                className={`rounded-lg border px-2.5 py-0.5 text-xs font-semibold transition-colors ${

                  st.rootFilter === m.root

                    ? 'border-[#5a3d7a] bg-[#5a3d7a] text-white'

                    : 'border-[#5a3d7a]/50 text-[#5a3d7a] hover:bg-[#5a3d7a]/10 dark:text-[#c9b3e8]'

                }`}

              >

                {/* parentheses, NOT «·» — the interpunct reads like the digit ٠ next to Arabic numerals (owner) */}

                جذر «{citeRoot(m.root)}» ({toAr(m.total)})
              </button>

            ))}

          </div>

        )}



        {/* body */}

        <div ref={bodyRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">

          {st.loading ? (

            <div className="py-8 text-center text-text-secondary">…جارٍ جلبُ الشواهدِ من مدوّنةِ «برق»</div>

          ) : st.error ? (

            <div className="py-6 text-center text-text-secondary">تعذّرَ جلبُ الشواهدِ الآن.</div>

          ) : st.rows.length === 0 ? (

            <div className="py-6 text-center text-text-secondary">

              {st.rootFilter

                ? `لا شواهدَ لهذه الصيغةِ تحتَ جذرِ «${citeRoot(st.rootFilter)}» في هذا المصدر — وهذا هو العزلُ الصادق: العدُّ لغيرِه.`
                : st.tashkeel

                  ? 'لا شواهدَ بهذه الصيغةِ بالضبط في هذا المصدر — جرّبْ إلغاءَ «بالتشكيل».'

                  : 'لا شواهدَ مباشرةً لهذه الصيغةِ في هذا المصدر.'}

            </div>

          ) : (

            <ol className="flex flex-col gap-3">

              {st.rows.map((r, i) => (
                <Shahid
                  key={i}
                  i={i}
                  n={i + 1}
                  row={r}
                  keys={r.hl && r.hl.length
                    ? r.hl
                    : (st.highlight || st.surface).split(/\s+/).map(bareWord).filter(Boolean)}
                  poets={st.poets}
                  onOpenPoetry={openPoetry}
                />
              ))}
            </ol>

          )}

        </div>



        {/* footer: التالي + provenance */}

        <div className="flex items-center justify-between gap-3 border-t border-border-light px-4 py-2.5 sm:px-5">

          <span className="text-xs text-text-secondary">المصدر: مدوّنةُ «برق» — نصٌّ حرفيّ (صفرُ تلفيق)</span>

          {!st.loading && !st.error && st.hasMore && (

            <button

              type="button"

              onClick={more}

              disabled={st.loadingMore}

              className="shrink-0 rounded-lg border border-[var(--barq-gold-dim)] bg-surface-secondary px-3.5 py-1.5 text-sm font-semibold text-green-700 transition-colors hover:bg-surface-active-alt disabled:opacity-60 dark:text-green-400"

            >

              {st.loadingMore ? '…' : 'التالي ٧ ↓'}

            </button>

          )}

        </div>

      </div>

    </div>,

    document.body,
    )}
    {poem && createPortal(
      <div
        dir="rtl"
        className="fixed inset-0 z-[110] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
        onClick={() => setPoem(null)}
        role="dialog"
        aria-modal="true"
        aria-label="قارئ النص الشعري المتصل"
      >
        <div
          className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-amber-500/35 bg-surface-primary shadow-2xl sm:max-h-[80vh] sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border-light px-4 py-3 sm:px-5">
            <div className="min-w-0 text-amber-800 dark:text-amber-300">
              <div className="font-semibold">🪶 النص المتصل من ديوان برق</div>
              {poem.meta?.poet && <div className="mt-0.5 truncate text-xs text-text-secondary">الشاعر: {poem.meta.poet}</div>}
            </div>
            <button
              type="button"
              onClick={() => setPoem(null)}
              aria-label="العودة إلى الشواهد"
              title="العودة إلى الشواهد"
              className="rounded-lg px-2.5 py-1 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary"
            >
              ← عودة
            </button>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
            {poem.loading ? (
              <div className="py-8 text-center text-text-secondary">…جارٍ جلب النص المتصل</div>
            ) : poem.error ? (
              <div className="py-6 text-center text-text-secondary">تعذّر جلب النص المتصل الآن.</div>
            ) : (
              <>
                <p className="mb-3 text-xs leading-6 text-text-secondary">
                  يعرض هذا القارئ السياق المتصل حول الشاهد. لا يخزّن المصدر القديم معرّف القصيدة أو عنوانها، لذلك لا يدّعي هذا العرض نهاية قصيدةٍ أو عنوانًا غير موثّق.
                </p>
                <ol start={poem.start + 1} className="flex flex-col gap-3">
                  {poem.rows.map((row, i) => (
                    <li
                      key={row.ids.join('-')}
                      className={`rounded-xl border px-3.5 py-3 leading-loose ${row.matched ? 'border-amber-500/60 bg-amber-500/10' : 'border-amber-400/25 bg-surface-secondary'}`}
                    >
                      <div className="mb-1 text-xs font-semibold text-amber-800/80 dark:text-amber-300/80">{toAr(poem.start + i + 1)}.</div>
                      {row.parts.map((part, j) => (
                        <div key={row.ids[j]} className="border-r-2 border-amber-500/45 pr-3 text-[16px] font-medium text-text-primary">
                          {part}
                        </div>
                      ))}
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border-light px-4 py-2.5 sm:px-5">
            <span className="text-xs text-text-secondary">المصدر: ديوان برق — نص حرفي</span>
            {!poem.loading && !poem.error && poem.hasMore && (
              <button
                type="button"
                onClick={() => {
                  setPoem((cur) => (cur ? { ...cur, loadingMore: true } : cur));
                  fetchPoem(poem.source, poem.id, poem.next, true);
                }}
                disabled={poem.loadingMore}
                className="shrink-0 rounded-lg border border-amber-500/45 bg-amber-500/10 px-3.5 py-1.5 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-500/20 disabled:opacity-60 dark:text-amber-300"
              >
                {poem.loadingMore ? '…' : 'التالي ٧ ↓'}
              </button>
            )}
          </div>
        </div>
      </div>,
      document.body,
    )}
    </>
  );
}
