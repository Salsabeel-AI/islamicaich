import type {ReactNode} from 'react';
export default function Anchor({href='',children}:{href?:string;children:ReactNode}){
  if (typeof href === 'string' && href.startsWith('#barq-root:')) {
    const root = decodeURIComponent(href.slice('#barq-root:'.length));
    return (
      <span
        role="button"
        tabIndex={0}
        data-root={root}
        title="اضغطْ لكشفِ المعنى والمشتقّات"
        className="barq-ref cursor-pointer select-none rounded-md border border-[var(--barq-gold-dim)] bg-surface-secondary px-1.5 py-0.5 text-[0.95em] font-semibold text-green-700 transition-colors hover:bg-surface-active-alt dark:text-green-400"
      >
        {children}
      </span>
    );
  }

  // ⭐ owner 2026-08-06 «برهنِ العدّ»: a clickable اشتقاق count — [قرآن ٢٧١](#barq-attest:quran:كتب) renders as a chip
  // that opens the شواهد popup (first 7 → التالي 7) via the global BarqShawahid delegate. Proves every count.
  /* ⭐ owner 2026-08-09 «fix the colors representation»: #barq-color:HEX → a real color SWATCH pill
     (the markdown pipeline has no rehype-raw, so inline style must come from a trusted renderer — hex validated). */
  if (typeof href === 'string' && href.startsWith('#barq-color:')) {
    const hex = href.slice('#barq-color:'.length).trim();
    if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
      return (
        <span
          title={`#${hex.toUpperCase()}`}
          className="mx-1 -mb-0.5 inline-block h-4 w-10 rounded-md border border-black/20 align-middle dark:border-white/30"
          style={{ backgroundColor: `#${hex}` }}
        />
      );
    }
  }
  if (typeof href === 'string' && href.startsWith('#barq-note:')) {
    // ⭐ owner 2026-08-10: inline scholarly note (⚠ خلاف الرسم) — reason encoded in the href because the
    // sanitizer strips link titles. Pure hover tooltip, cursor-help, NO navigation/new tab.
    let note = '';
    try {
      note = decodeURIComponent(href.slice('#barq-note:'.length));
    } catch {
      note = href.slice('#barq-note:'.length);
    }
    return (
      <span
        title={note}
        className="cursor-help select-none text-amber-600 underline decoration-dotted underline-offset-4 dark:text-amber-400"
        onClick={(e) => e.preventDefault()}
      >
        {children}
      </span>
    );
  }

  if (typeof href === 'string' && href.startsWith('#barq-attest:')) {
    const rest = href.slice('#barq-attest:'.length);
    const dec = (s: string) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    };
    // format: source : bareSurface : diacritizedForm [?root=canonicalRoot]
    // The optional root is part of the evidence contract: a count isolated to
    // one lexical family must open the very same isolated rows.
    const [payload, query = ''] = rest.split('?', 2);
    const parts = payload.split(':');
    const source = dec(parts[0] || '');
    const surface = dec(parts[1] || '');
    const diac = dec(parts.slice(2).join(':') || '');
    const root = dec(new URLSearchParams(query).get('root') || '');
    // ⭐ owner 2026-08-06: colour the count by AUTHORITY, not decoration. Quran+Hadith = green (references one can be
    // held to); Tafseer = a supporting green (emerald); Poetry = amber (our historical corpus — the NUMBER is usage
    // evidence, NOT a canonical count comparable to Quran/Hadith, so nobody is judged on it). Tooltip says so.
    const _s = source.toLowerCase();
    // ⭐ owner 2026-08-08: مُتجانِس chip = the report's .chip-mut style (filled purple #5a3d7a, white text) —
    // see /admin/reports/barq-homograph-final-design.html. Distinct from every authority tone.
    const isMutajanis = _s.includes('mutajanis') || source.includes('متجانس');
    const isPoetry =
      _s.includes('poet') || source.includes('شعر') || surface.includes('شعر') || surface.includes('منسوب');
    const isTafseer = _s.includes('tafs') || source.includes('تفسير');
    const tone = isMutajanis
      ? 'no-underline' /* fill+text come from the attribute-keyed style.css rule — the arbitrary !bg-[…] class was unreliable */
      : isPoetry
        ? 'text-amber-600 dark:text-amber-500 border-amber-400/50'
        : isTafseer
          ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/40'
          : 'text-green-700 dark:text-green-400 border-[var(--barq-gold-dim)]';
    const tip = isMutajanis
      ? 'مُتجانِس — استعمالُ هذه الصيغةِ المؤصَّلُ تحت جذرٍ آخر · اضغطْ للجذورِ المستعمَلةِ بعدِّها'
      : isPoetry
        ? 'من مدوّنتِنا الشعريّة — شاهدُ استعمالٍ لا عددٌ مرجعيّ · اضغطْ للمواضع'
        : isTafseer
          ? 'من كتبِ التفسير — شاهدٌ مُسانِد · اضغطْ للمواضع'
          : 'شاهدٌ مرجعيّ (قرآن/حديث) · اضغطْ لعرضِ المواضع';
    return (
      <span
        role="button"
        tabIndex={0}
        data-attest-source={source}
        data-attest-surface={surface}
        data-attest-diac={diac}
        data-attest-root={root}
        title={tip}
        className={`barq-attest cursor-pointer select-none whitespace-nowrap rounded-md border bg-surface-secondary px-1.5 py-0.5 text-[0.9em] font-semibold underline decoration-dotted underline-offset-2 transition-colors hover:bg-surface-active-alt ${tone}`}
      >
        {children}
      </span>
    );
  }


return <a href={href} target={href.startsWith('https:')?'_blank':undefined} rel="noopener noreferrer">{children}</a>;
}
