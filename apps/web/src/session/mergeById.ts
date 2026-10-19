/** Adds items from `incoming` whose id is not in `current`, keeping the result ordered by `ts`. */
export function mergeById<T extends { id: string; ts: number }>(
  current: T[],
  incoming: readonly T[],
): T[] {
  const known = new Set(current.map((item) => item.id));
  const added = incoming.filter((item) => !known.has(item.id));
  if (added.length === 0) return current;
  return [...current, ...added].sort((a, b) => a.ts - b.ts);
}
