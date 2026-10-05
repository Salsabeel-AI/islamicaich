/**
 * rehypeBarqRefs — inline citation linkifier.
 * Walks the rendered markdown tree and turns Quran ayah citations that appear IN THE ANSWER TEXT
 * (e.g. «[البقرة: ٤٥]», «(٢:٤٥)», «سورة البقرة آية ٤٥») into clickable links, right where they are
 * written. Precise (links the exact cited ayah, never a regex-guess from tool data), unbounded
 * (every citation becomes its own link), and cheap (one AST pass per message, memoised upstream).
 */

const SURAHS = ['الفاتحة','البقرة','آل عمران','النساء','المائدة','الأنعام','الأعراف','الأنفال','التوبة','يونس','هود','يوسف','الرعد','إبراهيم','الحجر','النحل','الإسراء','الكهف','مريم','طه','الأنبياء','الحج','المؤمنون','النور','الفرقان','الشعراء','النمل','القصص','العنكبوت','الروم','لقمان','السجدة','الأحزاب','سبأ','فاطر','يس','الصافات','ص','الزمر','غافر','فصلت','الشورى','الزخرف','الدخان','الجاثية','الأحقاف','محمد','الفتح','الحجرات','ق','الذاريات','الطور','النجم','القمر','الرحمن','الواقعة','الحديد','المجادلة','الحشر','الممتحنة','الصف','الجمعة','المنافقون','التغابن','الطلاق','التحريم','الملك','القلم','الحاقة','المعارج','نوح','الجن','المزمل','المدثر','القيامة','الإنسان','المرسلات','النبأ','النازعات','عبس','التكوير','الانفطار','المطففين','الانشقاق','البروج','الطارق','الأعلى','الغاشية','الفجر','البلد','الشمس','الليل','الضحى','الشرح','التين','العلق','القدر','البينة','الزلزلة','العاديات','القارعة','التكاثر','العصر','الهمزة','الفيل','قريش','الماعون','الكوثر','الكافرون','النصر','المسد','الإخلاص','الفلق','الناس'];
const SURAH_TO_NUM: Record<string, number> = {};
SURAHS.forEach((n, i) => (SURAH_TO_NUM[n] = i + 1));
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Stored historical shares may retain Uthmani marks in a surah name (e.g.
// «البَقَرَةِ»). Accept those safely while resolving the canonical plain name.
const stripSurahMarks = (s: string) => s.normalize('NFC').replace(/[ً-ْٰـۖ-ۭ]/g, '').replace(/ٱ/g, 'ا');
const SURAH_MARKS = '[\\u064B-\\u0652\\u0670\\u0640\\u06D6-\\u06ED]*';
const tolerantSurah = (s: string) => [...s]
  .map((ch) => (ch === ' ' ? '\\s+' : ch === 'آ' ? '(?:آ|ا\\u0653)' + SURAH_MARKS : ch === 'أ' ? '(?:أ|ا\\u0654)' + SURAH_MARKS : ch === 'إ' ? '(?:إ|ا\\u0655)' + SURAH_MARKS : ch === 'ا' ? '[اأإآٱ]' + SURAH_MARKS : esc(ch) + SURAH_MARKS))
  .join('');
// longest-first so «آل عمران» wins over «ال…», «المؤمنون» over «المؤمن…»
const SURAH_ALT = [...SURAHS].sort((a, b) => b.length - a.length).map(tolerantSurah).join('|');
const toNum = (s: string) => parseInt(s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))), 10);
// per-surah ayah counts (Hafs) — guards the BARE «surah:ayah» matcher so times/ratios (e.g. 12:30) that
// happen to fall in a valid range are still gated by Quran context; a wrong ayah number is rejected outright.
const AYAT = [7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6];
// bare «٢:٤٤» (NOT bracketed — those are RE_NUM). Zero-width guards avoid brackets/decimals/chained colons.
const RE_BARE = /(?<![[(٠-٩\d:.\-])([٠-٩\d]{1,3})\s*:\s*([٠-٩\d]{1,3})(?![٠-٩\d:.])/g;
// only linkify a bare pair when the text is clearly Quranic (a ≥2 run of pairs, or one of these keywords).
const QURAN_CTX = /القرآن|الآي|آية|آيات|مواضع|سورة/;

// «[سورة? البقرة (آية)? ٤٥]» / «(البقرة: ٤٥)» — bracketed, name + number
const RE_NAMED = new RegExp(
  '[\\[(]\\s*(?:سورة\\s+)?(' + SURAH_ALT + ')\\s*(?:[،:؛/]\\s*|\\s+)(?:الآيةَ?\\s+|آيةَ?\\s+|الآيات\\s+)?([٠-٩\\d]{1,3})\\s*[\\])]',
  'g',
);
// Compact editorial references used by Dr Ayman's footnotes: «مريم(93)» / «البقرة (٢٥٥)».
// Keeping this in the shared linkifier makes the notation clickable everywhere, using the
// same sovereign ayah popup rather than adding tafsir-specific click handling.
const RE_NAMED_COMPACT = new RegExp(
  '(' + SURAH_ALT + ')\\s*[（(]\\s*([٠-٩\\d]{1,3})\\s*[)）]',
  'g',
);
// «[٢:٤٥]» / «(2:45)» — bracketed, number:number
const RE_NUM = /[[(]\s*([٠-٩\d]{1,3})\s*:\s*([٠-٩\d]{1,3})\s*[\])]/g;
// whole-surah references: «سورة الإخلاص» / «(سورة ١١٢)» → link the whole surah (ayah = 0)
const RE_SURAH_NAME = new RegExp('سورةِ?\\s+(' + SURAH_ALT + ')', 'g');
const RE_SURAH_NUM = /سورةِ?\s+([٠-٩\d]{1,3})/g;

// Hadith collections → sunnah.com slug (the trusted hadith source; hadith-by-number isn't in our
// read oracle, so these link out to sunnah.com like an external courtesy).
const HADITH_COLL = {
  'صحيح البخاري': 'bukhari', البخاري: 'bukhari',
  'صحيح مسلم': 'muslim', مسلم: 'muslim',
  // Backward compatibility for already-saved legacy answers. New pipeline
  // output is Arabic, but an old English collection must still open safely.
  'Sahih al-Bukhari': 'bukhari', 'Sahih Muslim': 'muslim',
  'سنن الترمذي': 'tirmidhi', الترمذي: 'tirmidhi',
  'سنن أبي داود': 'abudawud', 'أبي داود': 'abudawud', 'أبو داود': 'abudawud',
  'سنن النسائي': 'nasai', النسائي: 'nasai',
  'سنن ابن ماجه': 'ibnmajah', 'ابن ماجه': 'ibnmajah', 'ابن ماجة': 'ibnmajah',
  'مسند أحمد': 'ahmad', أحمد: 'ahmad',
  'موطأ مالك': 'malik', الموطأ: 'malik',
  الدارمي: 'darimi',
};
const HADITH_ALT = Object.keys(HADITH_COLL).sort((a, b) => b.length - a.length).map(esc).join('|');
// «رواه البخاري ٥٢» / «[مسلم: ٢٣]» / «صحيح البخاري، حديث ٨» — collection + a nearby number
const RE_HADITH = new RegExp(
  '(' + HADITH_ALT + ')\\s*(?:(—\\s*سجل برق\\s+)|(برقم\\s+|رقم\\s+|[:،]\\s*|\\(\\s*))([٠-٩\\d]{1,5}[a-z]?)(?![٠-٩\\dA-Za-z]|\\s*[/.:–—-]\\s*[٠-٩\\d])',
  'g',
);
// ⭐ owner 2026-07-15: inline clickable ROOTS — detect a root BY CONTEXT (no fragile markdown link) and wrap just the
// root token in a .barq-ref span with data-root → the InlineAyahViewer popup shows its meaning+derivatives. Lookbehind
// keeps the match to the root only (the «(قوّة» / «جذر «» / «بـ«» context stays as text). General: every «قوّة» line.
const AR = 'ء-ي';
const RE_ROOT_QUWWA = new RegExp('(?<=[\\s،])([' + AR + '][' + AR + '\\u064B-\\u0652]{1,9})(?=\\s*\\(قوّة)', 'g'); // X (قوّة
const RE_ROOT_JATHR = new RegExp('(?<=جذر\\s*«)([' + AR + ']{2,7})(?=»)', 'g');                                    // جذر «X»
const RE_ROOT_BI = new RegExp('(?<=ب[ـ]?«)([' + AR + ']{2,7})(?=»)', 'g');                                         // تقترنُ بـ«X»
const RE_ROOT_GUILL = new RegExp('(?<=«)([' + AR + ']{2,7})(?=»\\s*[—-]\\s*قوّة)', 'g');                           // «X» — قوّة
const stripRoot = (s: string) => s.replace(/[ً-ْٰـ]/g, '').replace(/ٱ/g, 'ا').trim();

// ⭐ owner 2026-08-06: UNIVERSAL search highlight. The pipeline wraps the matched word(s) of ANY search list
// (ayat list, hadith list, …) in ⟦…⟧ (U+27E6/27E7 — never occur in Arabic text) → rendered as a yellow <mark>,
// same colour as the شواهد popup. One rule → every search result highlights consistently.
const RE_HL = /⟦([\s\S]{1,160}?)⟧/g;

type Ref = {
  start: number;
  end: number;
  text: string;
  surah?: number;
  ayah?: number;
  hadith?: { slug: string; number: string; scheme: string };
  root?: string;
  hl?: boolean;
  deepen?: boolean;
};

/** Exported so the evidence box can count the ayat the answer ACTUALLY cited (matches the inline links). */
export function findRefs(text: string): Ref[] {
  const out: Ref[] = [];
  let m: RegExpExecArray | null;
  RE_NAMED.lastIndex = 0;
  while ((m = RE_NAMED.exec(text)) !== null) {
    const surah = SURAH_TO_NUM[stripSurahMarks(m[1])];
    const ayah = toNum(m[2]);
    if (surah && ayah >= 1 && ayah <= 286) {
      out.push({ start: m.index, end: m.index + m[0].length, surah, ayah, text: m[0] });
    }
  }
  RE_NAMED_COMPACT.lastIndex = 0;
  while ((m = RE_NAMED_COMPACT.exec(text)) !== null) {
    const surah = SURAH_TO_NUM[stripSurahMarks(m[1])];
    const ayah = toNum(m[2]);
    if (surah && ayah >= 1 && ayah <= (AYAT[surah - 1] ?? 286)) {
      out.push({ start: m.index, end: m.index + m[0].length, surah, ayah, text: m[0] });
    }
  }
  RE_NUM.lastIndex = 0;
  while ((m = RE_NUM.exec(text)) !== null) {
    const surah = toNum(m[1]);
    const ayah = toNum(m[2]);
    if (surah >= 1 && surah <= 114 && ayah >= 1 && ayah <= 286) {
      out.push({ start: m.index, end: m.index + m[0].length, surah, ayah, text: m[0] });
    }
  }
  // bare «٢:٤٤» pairs (e.g. «مواضِعُها في القرآن: ٢:٩، ٢:٤٤، ٢:٤٨») — Quran-context gated + per-surah validated.
  const bareCtx = QURAN_CTX.test(text);
  const bares: Ref[] = [];
  RE_BARE.lastIndex = 0;
  while ((m = RE_BARE.exec(text)) !== null) {
    const surah = toNum(m[1]);
    const ayah = toNum(m[2]);
    if (surah >= 1 && surah <= 114 && ayah >= 1 && ayah <= (AYAT[surah - 1] ?? 286)) {
      bares.push({ start: m.index, end: m.index + m[0].length, surah, ayah, text: m[0] });
    }
  }
  if (bareCtx || bares.length >= 2) {
    for (const b of bares) out.push(b);
  }
  RE_SURAH_NAME.lastIndex = 0;
  while ((m = RE_SURAH_NAME.exec(text)) !== null) {
    const surah = SURAH_TO_NUM[stripSurahMarks(m[1])];
    if (surah) {
      out.push({ start: m.index, end: m.index + m[0].length, surah, ayah: 0, text: m[0] });
    }
  }
  RE_SURAH_NUM.lastIndex = 0;
  while ((m = RE_SURAH_NUM.exec(text)) !== null) {
    const surah = toNum(m[1]);
    if (surah >= 1 && surah <= 114) {
      out.push({ start: m.index, end: m.index + m[0].length, surah, ayah: 0, text: m[0] });
    }
  }
  RE_HADITH.lastIndex = 0;
  while ((m = RE_HADITH.exec(text)) !== null) {
    const preceding = text.slice(Math.max(0, m.index - 80), m.index).replace(/[ً-ْٰـ]/g, '');
    // A grading opinion or another author's name is not a collection locator.
    if (/(?:صححه|ضعفه|حسنه|قال|ذكر|علاء الدين|ابن)\s*$/.test(preceding)) continue;
    const slug = (HADITH_COLL as Record<string, string>)[m[1]];
    const number = m[4];
    const scheme = m[2] ? "local" : "published";
    if (slug && number) {
      out.push({
        start: m.index,
        end: m.index + m[0].length,
        text: m[0],
        hadith: { slug, number: number.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))), scheme },
      });
    }
  }
  for (const re of [RE_ROOT_QUWWA, RE_ROOT_JATHR, RE_ROOT_BI, RE_ROOT_GUILL]) {
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      const root = stripRoot(m[1]);
      if (root.length >= 2) {
        out.push({ start: m.index, end: m.index + m[1].length, text: m[1], root });
      }
    }
  }
  RE_HL.lastIndex = 0;
  while ((m = RE_HL.exec(text)) !== null) {
    if (m[1].startsWith('§')) {
      // ⭐ owner 2026-08-10 «رمز التعمق مِهنيّ»: ⟦§label|id⟧ is a machine deepen-token, NOT a highlight —
      // render it as a tiny muted 📖 reference chip (tooltip shows the source), never raw glyphs.
      const inner = m[1].slice(1);
      const bar = inner.indexOf('|');
      const dLabel = bar > 0 ? inner.slice(0, bar) : inner;
      out.push({ start: m.index, end: m.index + m[0].length, text: dLabel, deepen: true });
      continue;
    }
    out.push({ start: m.index, end: m.index + m[0].length, text: m[1], hl: true });
  }
  out.sort((a, b) => a.start - b.start);
  const res: Ref[] = [];
  let lastEnd = -1;
  for (const r of out) {
    if (r.start >= lastEnd) {
      res.push(r);
      lastEnd = r.end;
    }
  }
  return res;
}

// tags whose text is not prose (don't linkify inside them)
const SKIP = new Set(['a', 'code', 'pre', 'script', 'style']);

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

function walk(node: HastNode): void {
  if (!node.children || !Array.isArray(node.children)) {
    return;
  }
  const next: HastNode[] = [];
  for (const child of node.children) {
    if (child.type === 'text' && typeof child.value === 'string' && /[[(٠-٩\d«⟦]/.test(child.value)) {
      const refs = findRefs(child.value);
      if (refs.length === 0) {
        next.push(child);
        continue;
      }
      let last = 0;
      const text = child.value;
      for (const r of refs) {
        if (r.start > last) {
          next.push({ type: 'text', value: text.slice(last, r.start) });
        }
        // FALLBACK (sovereign-first): highlight the citation but DO NOT hyperlink out. A future
        // read-endpoint will make this open an in-app popup showing the verse from OUR database.
        if (r.hadith) {
          // ⭐ owner 2026-08-14 «سند/متن»: SOVEREIGN in-app popup (متن default · السند · الكامل) from OUR
          // Salsabeel_Hadith split — the promised read-endpoint replaced the old sunnah.com external link.
          next.push({
            type: 'element',
            tagName: 'span',
            properties: {
              className: ['barq-ref', 'barq-ref-hadith'],
              role: 'button',
              tabIndex: 0,
              'data-hadith-slug': r.hadith.slug,
              'data-hadith-num': r.hadith.number,
              'data-hadith-scheme': r.hadith.scheme,
              title: 'اضغطْ لعرضِ الحديثِ والسند',
            },
            children: [{ type: 'text', value: r.text }],
          });
        } else if (r.deepen) {
          // ⭐ deepen-token chip: tiny muted 📖 with the Arabic source label in the tooltip — professional,
          // no machine glyphs in the bubble.
          next.push({
            type: 'element',
            tagName: 'span',
            properties: {
              className: ['barq-deepen-token', 'select-none', 'text-xs', 'opacity-60'],
              title: `مرجعُ التعمّق: ${r.text}`,
            },
            children: [{ type: 'text', value: ' 📖' }],
          });
        } else if (r.hl) {
          // ⭐ universal search highlight → yellow <mark> (same colour as the شواهد popup)
          next.push({
            type: 'element',
            tagName: 'mark',
            properties: { className: ['barq-hl', 'rounded', 'bg-yellow-200', 'px-0.5', 'text-inherit', 'dark:bg-yellow-500/40'] },
            children: [{ type: 'text', value: r.text }],
          });
        } else if (r.root) {
          // ⭐ inline clickable ROOT → InlineAyahViewer opens the meaning+derivatives popup (data-root)
          next.push({
            type: 'element',
            tagName: 'span',
            properties: {
              className: ['barq-ref'],
              role: 'button',
              tabIndex: 0,
              'data-root': r.root,
              title: 'اضغطْ لكشفِ المعنى والمشتقّات',
            },
            children: [{ type: 'text', value: r.text }],
          });
        } else {
          const s = r.surah ?? 1;
          const a = r.ayah ?? 0;
          next.push({
            type: 'element',
            tagName: 'span',
            properties: {
              className: ['barq-ref'],
              role: 'button',
              tabIndex: 0,
              'data-surah': String(s),
              'data-ayah': String(a),
              title: a > 0 ? `${SURAHS[s - 1]} ${a}` : `سورة ${SURAHS[s - 1]}`,
            },
            children: [{ type: 'text', value: r.text }],
          });
        }
        last = r.end;
      }
      if (last < text.length) {
        next.push({ type: 'text', value: text.slice(last) });
      }
    } else {
      if (!(child.tagName && SKIP.has(child.tagName))) {
        walk(child);
      }
      next.push(child);
    }
  }
  node.children = next;
}

export default function rehypeBarqRefs() {
  return (tree: HastNode) => {
    walk(tree);
  };
}
