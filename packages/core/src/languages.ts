export interface Language {
  code: string;
  label: string;
  nativeLabel: string;
  bcp47: string;
}

export const LANGUAGES: readonly Language[] = [
  { code: 'en', label: 'English', nativeLabel: 'English', bcp47: 'en-US' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español', bcp47: 'es-ES' },
  { code: 'ja', label: 'Japanese', nativeLabel: '日本語', bcp47: 'ja-JP' },
];

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code) as [string, ...string[]];

export function getLanguage(code: string): Language {
  const language = LANGUAGES.find((l) => l.code === code);
  if (!language) throw new Error(`Unknown language code: ${code}`);
  return language;
}
