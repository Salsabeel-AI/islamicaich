/** Only same-origin, known reader routes may open the sovereign popup. */
export function barqReader(href: string, origin: string): Record<string, string> | null {
  try {
    const url = new URL(href, origin);
    if (url.origin !== origin || url.username || url.password) return null;
    const hadith = url.pathname.match(
      /^\/api\/barq\/read\/hadith\/([a-z]{3,12})\/([1-9]\d{0,4})\/?$/,
    );
    if (hadith) return { 'data-hadith-slug': hadith[1], 'data-hadith-num': hadith[2], 'data-hadith-scheme': 'local' };
    const verse = url.pathname.match(
      /^\/api\/barq\/read\/(ayah|tafsir\/ayman)\/([1-9]\d{0,2})\/([1-9]\d{0,2})\/?$/,
    );
    if (verse && +verse[2] <= 114 && +verse[3] <= 286) {
      return {
        'data-surah': verse[2],
        'data-ayah': verse[3],
        'data-tafsir': String(verse[1] !== 'ayah'),
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function hadithScheme(explicit: string | null | undefined, label: string): string {
  if (explicit === 'local' || explicit === 'published') return explicit;
  return /سجل\s+برق/.test(label) ? 'local' : 'published';
}
