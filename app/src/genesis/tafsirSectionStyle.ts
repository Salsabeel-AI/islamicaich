export type RichTafsirSection = {
  type: string;
  label: string;
  text: string;
  colorToken: string;
};

/** Shared semantic palette for every structured tafsir source. */
export const TAFSIR_SECTION_COLORS: Record<string, string> = {
  quran: 'border-green-500/40 bg-green-50 text-green-900 dark:bg-green-950/30 dark:text-green-200',
  hadith: 'border-amber-500/40 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
  asbab: 'border-sky-500/40 bg-sky-50 text-sky-900 dark:bg-sky-950/30 dark:text-sky-200',
  qiraat:
    'border-violet-500/40 bg-violet-50 text-violet-900 dark:bg-violet-950/30 dark:text-violet-200',
  fiqh: 'border-rose-500/40 bg-rose-50 text-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
  muted: 'border-border-medium bg-surface-secondary text-text-secondary',
  default: 'border-border-medium bg-surface-secondary text-text-primary',
};
