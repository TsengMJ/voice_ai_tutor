export interface Segment {
  text: string;
  marked: boolean;
}

/** Splits `text` into plain and marked segments for every case-insensitive match of `phrases`. */
export function highlightSegments(text: string, phrases: string[]): Segment[] {
  const needles = phrases.map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (needles.length === 0 || !text) return text ? [{ text, marked: false }] : [];

  const haystack = text.toLowerCase();
  const marks = new Array<boolean>(text.length).fill(false);
  for (const needle of needles) {
    let from = haystack.indexOf(needle);
    while (from !== -1) {
      marks.fill(true, from, from + needle.length);
      from = haystack.indexOf(needle, from + needle.length);
    }
  }

  const segments: Segment[] = [];
  let start = 0;
  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || marks[i] !== marks[start]) {
      segments.push({ text: text.slice(start, i), marked: marks[start] ?? false });
      start = i;
    }
  }
  return segments;
}
