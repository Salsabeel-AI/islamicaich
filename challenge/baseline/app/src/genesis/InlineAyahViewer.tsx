import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Markdown from './Markdown';
import { barqReader, hadithScheme } from './barqReader';
import { TAFSIR_SECTION_COLORS as SECTION_COLORS } from './tafsirSectionStyle';
import type { RichTafsirSection } from './tafsirSectionStyle';

/**
 * Global inline-citation viewer. Delegates clicks on `.barq-ref` spans and opens an in-app popup:
 *   • data-surah/data-ayah → the verse fetched from OUR OWN database (/api/barq/read/ayah) — sovereign.
 *   • data-root (⭐ owner 2026-07-14) → the root's MEANING + DERIVATIVES (/api/barq/read/root), lazy on click,
 *     shown in the SAME popup — no fake chat message. Reuses the pipeline's own rendering (0-fab).
 * Mounted once (in ChatView) — one document listener, no per-message cost.
 */
const SURAHS = [
  'الفاتحة',
  'البقرة',
  'آل عمران',
  'النساء',
  'المائدة',
  'الأنعام',
  'الأعراف',
  'الأنفال',
  'التوبة',
  'يونس',
  'هود',
  'يوسف',
  'الرعد',
  'إبراهيم',
  'الحجر',
  'النحل',
  'الإسراء',
  'الكهف',
  'مريم',
  'طه',
  'الأنبياء',
  'الحج',
  'المؤمنون',
  'النور',
  'الفرقان',
  'الشعراء',
  'النمل',
  'القصص',
  'العنكبوت',
  'الروم',
  'لقمان',
  'السجدة',
  'الأحزاب',
  'سبأ',
  'فاطر',
  'يس',
  'الصافات',
  'ص',
  'الزمر',
  'غافر',
  'فصلت',
  'الشورى',
  'الزخرف',
  'الدخان',
  'الجاثية',
  'الأحقاف',
  'محمد',
  'الفتح',
  'الحجرات',
  'ق',
  'الذاريات',
  'الطور',
  'النجم',
  'القمر',
  'الرحمن',
  'الواقعة',
  'الحديد',
  'المجادلة',
  'الحشر',
  'الممتحنة',
  'الصف',
  'الجمعة',
  'المنافقون',
  'التغابن',
  'الطلاق',
  'التحريم',
  'الملك',
  'القلم',
  'الحاقة',
  'المعارج',
  'نوح',
  'الجن',
  'المزمل',
  'المدثر',
  'القيامة',
  'الإنسان',
  'المرسلات',
  'النبأ',
  'النازعات',
  'عبس',
  'التكوير',
  'الانفطار',
  'المطففين',
  'الانشقاق',
  'البروج',
  'الطارق',
  'الأعلى',
  'الغاشية',
  'الفجر',
  'البلد',
  'الشمس',
  'الليل',
  'الضحى',
  'الشرح',
  'التين',
  'العلق',
  'القدر',
  'البينة',
  'الزلزلة',
  'العاديات',
  'القارعة',
  'التكاثر',
  'العصر',
  'الهمزة',
  'الفيل',
  'قريش',
  'الماعون',
  'الكوثر',
  'الكافرون',
  'النصر',
  'المسد',
  'الإخلاص',
  'الفلق',
  'الناس',
];
const toAr = (n: number | string) => String(n).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);

type State = {
  kind: 'ayah' | 'root' | 'hadith' | 'body';
  label: string;
  loading: boolean;
  error?: boolean;
  // ayah
  surah?: number;
  ayah?: number;
  text?: string;
  tafsir?: RichTafsir;
  tafsirLoading?: boolean;
  tafsirError?: boolean;
  tafsirSection?: string;
  tafsirAction?: RichTafsirAction;
  tafsirActionLoading?: boolean;
  // root
  root?: string;
  html?: string;
  hasDerive?: boolean;
  deriveMd?: string;
  deriveLoading?: boolean;
  // ⭐ hadith (owner 2026-08-14 «سند/متن»): three views — المتن (default) · السند · الكامل
  hSlug?: string;
  hNum?: string;
  sourceUrl?: string;
  matn?: string;
  isnad?: string;
  full?: string;
  grade?: string;
  collAr?: string;
  hview?: 'matn' | 'isnad' | 'full';
};

type RichTafsir = {
  bookName: string;
  author: string;
  text: string;
  sections: RichTafsirSection[];
  availableActions: string[];
  actionLabels?: Record<string, string>;
  navigation?: {
    previous?: { surah: number; ayah: number } | null;
    next?: { surah: number; ayah: number } | null;
  };
};

type RichTafsirAction = {
  action: string;
  label: string;
  sections: RichTafsirSection[];
  qiraat?: { text: string; riwayat: string[] }[];
  surahMetadata?: {
    name: string;
    englishName: string;
    revelationType: string;
    ayahCount: number;
  };
};

export default function InlineAyahViewer() {
  const [st, setSt] = useState<State | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement)?.closest?.('.barq-ref, a[href]') as HTMLElement | null;
      if (!el) {
        return;
      }
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const route = el.matches('a[href]')
        ? barqReader(el.getAttribute('href') ?? '', window.location.origin)
        : null;
      if (!route && !el.matches('.barq-ref')) return;
      const attr = (name: string) => route?.[name] ?? el.getAttribute(name);
      if (el.hasAttribute('data-body') && !route) {
        e.preventDefault();
        setSt({
          kind: 'body',
          label: attr('data-label') ?? '',
          text: attr('data-body') ?? '',
          loading: false,
        });
        return;
      }

      // ⭐ HADITH reference (owner 2026-08-14) → sovereign سند/متن popup from OUR Salsabeel_Hadith split
      const hSlug = (attr('data-hadith-slug') ?? '').trim();
      const hNum = (attr('data-hadith-num') ?? '').trim();
      const scheme = hadithScheme(attr('data-hadith-scheme'), el.textContent ?? '');
      if (hSlug && /^[a-z]{3,12}$/.test(hSlug) && /^[1-9]\d{0,4}[a-z]?$/.test(hNum)) {
        e.preventDefault();
        setSt({ kind: 'hadith', hSlug, hNum, label: 'الحديث', loading: true, hview: 'matn', sourceUrl: scheme === "published" ? `https://sunnah.com/${hSlug}:${hNum}` : undefined });
        fetch(`/api/barq/read/${scheme === "published" ? "hadith-reference" : "hadith"}/${hSlug}/${hNum}`)
          .then((r) => r.json())
          .then((j) =>
            setSt((cur) =>
              cur && cur.kind === 'hadith' && cur.hSlug === hSlug && cur.hNum === hNum
                ? j?.ok
                  ? {
                      ...cur,
                      loading: false,
                      matn: j.matn,
                      isnad: j.isnad,
                      full: j.full,
                      grade: j.grade,
                      collAr: j.coll_ar,
                      label: j.reference_label || `${j.coll_ar} — سجل برق ${j.number}`,
                    }
                  : { ...cur, loading: false, error: true }
                : cur,
            ),
          )
          .catch(() => setSt((cur) => (cur ? { ...cur, loading: false, error: true } : cur)));
        return;
      }

      // ⭐ ROOT chip → lazy meaning + derivatives popup (no fake message)
      const root = (el.getAttribute('data-root') ?? '').trim();
      if (root && /^[ء-ي]{2,15}$/.test(root)) {
        e.preventDefault();
        setSt({ kind: 'root', root, label: `جذر «${root}»`, loading: true });
        fetch(`/api/barq/read/root/${encodeURIComponent(root)}`)
          .then((r) => r.json())
          .then((j) =>
            setSt((cur) =>
              cur && cur.kind === 'root' && cur.root === root
                ? j?.ok
                  ? { ...cur, loading: false, html: j.html, hasDerive: !!j.hasDerive }
                  : { ...cur, loading: false, error: true }
                : cur,
            ),
          )
          .catch(() => setSt((cur) => (cur ? { ...cur, loading: false, error: true } : cur)));
        return;
      }

      const s = parseInt(attr('data-surah') ?? '', 10);
      const a = parseInt(attr('data-ayah') ?? '', 10);
      if (!(s >= 1 && s <= 114 && a >= 0)) {
        return;
      }
      e.preventDefault();
      if (a === 0) {
        setSt({ kind: 'ayah', surah: s, ayah: 0, label: `سورة ${SURAHS[s - 1]}`, loading: false });
        return;
      }
      const label = `${SURAHS[s - 1]} ${toAr(a)}`;
      setSt({ kind: 'ayah', surah: s, ayah: a, label, loading: true });
      if (attr('data-tafsir') === 'true') {
        setSt((cur) => (cur ? { ...cur, tafsirLoading: true } : cur));
        fetch(`/api/barq/read/tafsir/ayman/${s}/${a}`)
          .then((r) => r.json())
          .then((j) =>
            setSt((cur) =>
              cur?.kind === 'ayah' && cur.surah === s && cur.ayah === a
                ? {
                    ...cur,
                    tafsirLoading: false,
                    tafsir: j?.ok ? j : undefined,
                    tafsirError: !j?.ok,
                  }
                : cur,
            ),
          )
          .catch(() =>
            setSt((cur) =>
              cur?.kind === 'ayah' && cur.surah === s && cur.ayah === a
                ? { ...cur, tafsirLoading: false, tafsirError: true }
                : cur,
            ),
          );
      }
      fetch(`/api/barq/read/ayah/${s}/${a}`)
        .then((r) => r.json())
        .then((j) =>
          setSt((cur) =>
            cur && cur.kind === 'ayah' && cur.surah === s && cur.ayah === a
              ? j?.ok
                ? { ...cur, loading: false, text: j.text }
                : { ...cur, loading: false, error: true }
              : cur,
          ),
        )
        .catch(() => setSt((cur) => (cur ? { ...cur, loading: false, error: true } : cur)));
    };
    const onKey = (e: KeyboardEvent) => {
      const target = (e.target as HTMLElement)?.closest?.('.barq-ref') as HTMLElement | null;
      if ((e.key === 'Enter' || e.key === ' ') && target && !target.matches('a, button')) {
        e.preventDefault();
        target.click();
      }
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

  if (!st) {
    return null;
  }

  const isRoot = st.kind === 'root';
  const isHadith = st.kind === 'hadith';

  // ⭐ owner 2026-08-06: المشتقاتُ عند الطلب — the heavy اشتقاق family loads only when the button is pressed.
  const loadDerive = () => {
    const root = st.root;
    if (!root) {
      return;
    }
    setSt((cur) => (cur ? { ...cur, deriveLoading: true } : cur));
    fetch(`/api/barq/read/root/${encodeURIComponent(root)}?derive=1`)
      .then((r) => r.json())
      .then((j) =>
        setSt((cur) =>
          cur && cur.kind === 'root' && cur.root === root
            ? { ...cur, deriveLoading: false, deriveMd: j?.ok ? j.md : 'تعذّرَ جلبُ المشتقّات.' }
            : cur,
        ),
      )
      .catch(() =>
        setSt((cur) => (cur && cur.root === root ? { ...cur, deriveLoading: false } : cur)),
      );
  };

  const loadStructuredTafsir = () => {
    if (st.kind !== 'ayah' || !st.surah || !st.ayah) {
      return;
    }
    const { surah, ayah } = st;
    setSt((cur) => (cur ? { ...cur, tafsirLoading: true, tafsirError: false } : cur));
    fetch(`/api/barq/read/tafsir/ayman/${surah}/${ayah}`)
      .then((r) => r.json())
      .then((j) =>
        setSt((cur) =>
          cur && cur.kind === 'ayah' && cur.surah === surah && cur.ayah === ayah
            ? j?.ok
              ? { ...cur, tafsirLoading: false, tafsir: j as RichTafsir }
              : { ...cur, tafsirLoading: false, tafsirError: true }
            : cur,
        ),
      )
      .catch(() =>
        setSt((cur) => (cur ? { ...cur, tafsirLoading: false, tafsirError: true } : cur)),
      );
  };

  const selectTafsirAction = (sectionType?: string) => {
    if (!sectionType) {
      setSt((cur) => (cur ? { ...cur, tafsirSection: undefined, tafsirAction: undefined } : cur));
      return;
    }
    if (sectionType !== 'qiraat' && sectionType !== 'surah_metadata') {
      setSt((cur) => (cur ? { ...cur, tafsirSection: sectionType, tafsirAction: undefined } : cur));
      return;
    }
    if (st.kind !== 'ayah' || !st.surah || !st.ayah) {
      return;
    }
    const { surah, ayah } = st;
    setSt((cur) =>
      cur
        ? { ...cur, tafsirSection: sectionType, tafsirAction: undefined, tafsirActionLoading: true }
        : cur,
    );
    fetch(`/api/barq/read/tafsir/ayman/${surah}/${ayah}/action/${sectionType}`)
      .then((r) => r.json())
      .then((j) =>
        setSt((cur) =>
          cur && cur.kind === 'ayah' && cur.surah === surah && cur.ayah === ayah
            ? { ...cur, tafsirActionLoading: false, tafsirAction: j?.ok ? j : undefined }
            : cur,
        ),
      )
      .catch(() => setSt((cur) => (cur ? { ...cur, tafsirActionLoading: false } : cur)));
  };

  const navigateTafsir = (target?: { surah: number; ayah: number } | null) => {
    if (!target) {
      return;
    }
    const { surah, ayah } = target;
    setSt({
      kind: 'ayah',
      surah,
      ayah,
      label: `${SURAHS[surah - 1]} ${toAr(ayah)}`,
      loading: true,
      tafsirLoading: true,
    });
    Promise.all([
      fetch(`/api/barq/read/ayah/${surah}/${ayah}`).then((r) => r.json()),
      fetch(`/api/barq/read/tafsir/ayman/${surah}/${ayah}`).then((r) => r.json()),
    ])
      .then(([verse, tafsir]) =>
        setSt((cur) =>
          cur && cur.kind === 'ayah' && cur.surah === surah && cur.ayah === ayah
            ? {
                ...cur,
                loading: false,
                tafsirLoading: false,
                text: verse?.ok ? verse.text : undefined,
                error: !verse?.ok,
                tafsir: tafsir?.ok ? tafsir : undefined,
                tafsirError: !tafsir?.ok,
              }
            : cur,
        ),
      )
      .catch(() =>
        setSt((cur) => (cur ? { ...cur, loading: false, tafsirLoading: false, error: true } : cur)),
      );
  };

  const rootPopupCls =
    'barq-root-popup text-[15px] leading-loose text-text-primary [&_b]:text-green-700 dark:[&_b]:text-green-400 [&_h4]:mb-1 [&_h4]:mt-3 [&_h4]:font-bold [&_h4]:text-green-800 dark:[&_h4]:text-green-300 [&_li]:mr-4 [&_li]:list-disc [&_blockquote]:border-r-2 [&_blockquote]:border-[var(--barq-gold-dim)] [&_blockquote]:pr-3 [&_blockquote]:text-text-secondary';

  return createPortal(
    <div
      dir="rtl"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={() => setSt(null)}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border-medium bg-surface-primary shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border-light px-5 py-3">
          <div className="flex items-center gap-2 font-semibold text-green-700 dark:text-green-500">
            <span aria-hidden="true">{isRoot ? '🌱' : isHadith ? '📜' : '📖'}</span>
            <span>{st.label}</span>
          </div>
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
        <div
          className={`overflow-y-auto px-6 py-6 ${isRoot || isHadith ? 'text-right' : 'text-center'}`}
        >
          {st.loading ? (
            <div className="py-6 text-center text-text-secondary">…جارٍ الجلبُ من أدواتِ «برق»</div>
          ) : st.kind === 'body' ? (
            <Markdown content={st.text ?? ''} />
          ) : isHadith ? (
            st.error ? (
              <div className="py-4 text-center text-text-secondary">
                تعذّرَ توثيقُ الربطِ المحلي لهذا المرجع.
                {st.sourceUrl && <a className="block underline" href={st.sourceUrl} target="_blank" rel="noopener noreferrer">قراءة المرجع في المصدر الأصلي</a>}
              </div>
            ) : (
              <>
                {/* ⭐ owner 2026-08-14: three views — المتن (default; what 90% want) · السند · الكامل */}
                <div className="mb-4 flex justify-center gap-2">
                  {(['matn', 'isnad', 'full'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setSt((cur) => (cur ? { ...cur, hview: v } : cur))}
                      disabled={v === 'isnad' && !st.isnad}
                      className={`rounded-lg border px-4 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        (st.hview ?? 'matn') === v
                          ? 'border-[var(--barq-gold-dim)] bg-surface-active-alt text-green-700 dark:text-green-400'
                          : 'border-border-medium bg-surface-secondary text-text-secondary hover:bg-surface-active-alt'
                      }`}
                    >
                      {v === 'matn' ? 'المتن' : v === 'isnad' ? 'السند' : 'الكامل'}
                    </button>
                  ))}
                </div>
                <p className="whitespace-pre-wrap text-lg font-medium leading-loose text-green-800 dark:text-green-300">
                  {(st.hview ?? 'matn') === 'matn'
                    ? st.matn
                    : st.hview === 'isnad'
                      ? st.isnad || '—'
                      : st.full}
                </p>
                {st.grade ? (
                  <div className="mt-3 border-t border-border-light pt-2 text-sm text-text-secondary">
                    الدرجة: {st.grade}
                  </div>
                ) : null}
              </>
            )
          ) : isRoot ? (
            st.error ? (
              <div className="py-4 text-center text-text-secondary">تعذّرَ جلبُ معنى الجذر.</div>
            ) : (
              <>
                <div className={rootPopupCls} dangerouslySetInnerHTML={{ __html: st.html ?? '' }} />
                {st.deriveMd ? (
                  /* ⭐ owner 2026-08-09 «black-on-black بعد زرّ الاشتقاقات»: the derive Markdown MUST live inside the
                     same `markdown prose dark:prose-invert` wrapper the chat uses — without it none of the theme's
                     .markdown/prose color rules apply and the table renders unreadable in dark mode. */
                  <div className="markdown prose dark:prose-invert light mt-4 w-full break-words border-t border-border-light pt-4 text-right text-text-primary">
                    <Markdown content={st.deriveMd} isLatestMessage={false} />
                  </div>
                ) : st.hasDerive ? (
                  <button
                    type="button"
                    onClick={loadDerive}
                    disabled={st.deriveLoading}
                    className="mt-4 w-full rounded-lg border border-[var(--barq-gold-dim)] bg-surface-secondary px-4 py-2.5 text-sm font-semibold text-green-700 transition-colors hover:bg-surface-active-alt disabled:opacity-60 dark:text-green-400"
                  >
                    {st.deriveLoading
                      ? '…جارٍ جلبُ المشتقّاتِ والأوزان'
                      : '🌿 اعرِضِ المشتقّاتِ والأوزان'}
                  </button>
                ) : null}
              </>
            )
          ) : st.ayah === 0 ? (
            <div className="py-4 text-text-secondary">
              مرجعٌ إلى سورةٍ كاملة.
              <div className="mt-3">
                <a
                  href={`https://quran.com/${st.surah}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-700 underline dark:text-green-400"
                >
                  اقرأْ سورةَ {SURAHS[(st.surah ?? 1) - 1]} كاملةً ↗
                </a>
              </div>
            </div>
          ) : st.error ? (
            <div className="py-4 text-text-secondary">
              تعذّرَ جلبُ الآية من المدوّنة.
              <div className="mt-3">
                <a
                  href={`https://quran.com/${st.surah}/${st.ayah}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-700 underline dark:text-green-400"
                >
                  افتحْها في المصحف ↗
                </a>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-xl font-medium leading-loose text-green-800 dark:text-green-300">
                ﴿ {st.text} ﴾
              </p>
              {st.tafsir ? (
                <div className="mt-5 border-t border-border-light pt-4 text-right">
                  <div className="mb-3 text-sm font-semibold text-text-primary">
                    {st.tafsir.bookName} — {st.tafsir.author}
                  </div>
                  {st.tafsir.availableActions.length > 0 ? (
                    <div className="mb-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => selectTafsirAction()}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${!st.tafsirSection ? 'border-[var(--barq-gold-dim)] bg-surface-active-alt text-green-700 dark:text-green-400' : 'border-border-medium bg-surface-secondary text-text-primary'}`}
                      >
                        الكل
                      </button>
                      {st.tafsir.availableActions.map((sectionType) => {
                        const section = st.tafsir?.sections.find(
                          (item) => item.type === sectionType,
                        );
                        return (
                          <button
                            key={sectionType}
                            type="button"
                            onClick={() => selectTafsirAction(sectionType)}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-surface-active-alt ${st.tafsirSection === sectionType ? 'border-[var(--barq-gold-dim)] bg-surface-active-alt text-green-700 dark:text-green-400' : 'border-border-medium bg-surface-secondary text-text-primary'}`}
                          >
                            {st.tafsir?.actionLabels?.[sectionType] ??
                              section?.label ??
                              sectionType}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  {st.tafsir.sections.length > 0 ? (
                    <div className="space-y-2">
                      {st.tafsir.sections
                        .filter((section) => !st.tafsirSection || section.type === st.tafsirSection)
                        .map((section, index) => (
                          <section
                            key={`${section.type}-${index}`}
                            dir="rtl"
                            style={{
                              textAlign: 'right',
                              wordSpacing: 'normal',
                              letterSpacing: 'normal',
                            }}
                            className={`rounded-lg border-r-4 p-3 ${SECTION_COLORS[section.colorToken] ?? SECTION_COLORS.default}`}
                          >
                            <div className="mb-1 text-xs font-bold opacity-75">{section.label}</div>
                            {/* Reuse the chat's established Markdown → rehypeBarqRefs path so Quran
                                citations inside tafsir sections/footnotes open the same sovereign
                                InlineAyahViewer popup used everywhere else in Barq. */}
                            <div className="markdown prose dark:prose-invert light w-full max-w-none break-words text-right leading-loose text-inherit [&_p]:my-0 [&_p]:text-inherit">
                              <Markdown content={section.text} isLatestMessage={false} />
                            </div>
                          </section>
                        ))}
                      {st.tafsirActionLoading ? (
                        <div className="py-4 text-center text-sm text-text-secondary">
                          …جارٍ جلبُ التفاصيل
                        </div>
                      ) : null}
                      {st.tafsirAction?.qiraat?.map((reading, index) => (
                        <section
                          key={`qiraat-${index}`}
                          dir="rtl"
                          className={`rounded-lg border-r-4 p-3 ${SECTION_COLORS.qiraat}`}
                        >
                          <div className="mb-1 text-xs font-bold opacity-75">
                            {reading.riwayat.join('، ')}
                          </div>
                          <p className="whitespace-pre-wrap text-right leading-loose">
                            ﴿ {reading.text} ﴾
                          </p>
                        </section>
                      ))}
                      {st.tafsirAction?.surahMetadata ? (
                        <section
                          dir="rtl"
                          className={`rounded-lg border-r-4 p-3 text-right ${SECTION_COLORS.quran}`}
                        >
                          <div className="font-bold">{st.tafsirAction.surahMetadata.name}</div>
                          <div className="mt-1 text-sm">
                            {st.tafsirAction.surahMetadata.revelationType === 'Meccan'
                              ? 'مكية'
                              : 'مدنية'}{' '}
                            · {toAr(st.tafsirAction.surahMetadata.ayahCount)} آية
                          </div>
                        </section>
                      ) : null}
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap leading-loose text-text-primary">
                      {st.tafsir.text}
                    </p>
                  )}
                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-border-light pt-3">
                    <button
                      type="button"
                      disabled={!st.tafsir.navigation?.previous}
                      onClick={() => navigateTafsir(st.tafsir?.navigation?.previous)}
                      className="rounded-lg border border-border-medium bg-surface-secondary px-3 py-1.5 text-xs font-semibold disabled:opacity-35"
                    >
                      ← الآية السابقة
                    </button>
                    <button
                      type="button"
                      disabled={!st.tafsir.navigation?.next}
                      onClick={() => navigateTafsir(st.tafsir?.navigation?.next)}
                      className="rounded-lg border border-border-medium bg-surface-secondary px-3 py-1.5 text-xs font-semibold disabled:opacity-35"
                    >
                      الآية التالية →
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={loadStructuredTafsir}
                  disabled={st.tafsirLoading}
                  className="mt-5 w-full rounded-lg border border-[var(--barq-gold-dim)] bg-surface-secondary px-4 py-2.5 text-sm font-semibold text-green-700 transition-colors hover:bg-surface-active-alt disabled:opacity-60 dark:text-green-400"
                >
                  {st.tafsirLoading
                    ? '…جارٍ جلبُ التفسير'
                    : st.tafsirError
                      ? 'تعذّر الجلب — حاول مرة أخرى'
                      : '📗 الجامع الوجيز في تفسير آي الكتاب العزيز'}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-border-light px-5 py-2 text-xs text-text-secondary">
          <span>
            {isRoot
              ? 'المصدر: أدواتُ «برق» — المعنى والمشتقّات (0 تلفيق)'
              : isHadith
                ? 'المصدر: مدوّنةُ «برق» للحديث — نصٌّ حرفيٌّ، فصلُ السندِ والمتن'
                : 'المصدر: مدوّنةُ «برق» — نصٌّ حرفيّ'}
          </span>
          {st.kind === 'ayah' && !st.loading && (
            <a
              href={`https://quran.com/${st.surah}${(st.ayah ?? 0) > 0 ? `/${st.ayah}` : ''}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline opacity-70 hover:text-text-primary"
            >
              quran.com ↗
            </a>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
