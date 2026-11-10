/**
 * Client-side publication-date ordering for the feed item list: the items of
 * the currently loaded feed are reordered in the browser, without any server
 * round-trip. Input is a sort direction plus feed items; output is the
 * display order as indices into the item array, so open-detail state
 * (`selectedIndex`) keeps pointing into the full item array while the list
 * is reordered.
 */

export type FeedSortDirection = 'newest' | 'oldest';

const SORT_DIRECTIONS: FeedSortDirection[] = ['newest', 'oldest'];

/**
 * Parses a feed item's pubDate into a millisecond timestamp, or null when the
 * item has no publication date or one that cannot be parsed as a date.
 */
function parsePubDate(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

/**
 * Display order of `indices` (positions into `items`) under `direction`:
 * dated items by publication date — newest or oldest first — and items with
 * no parseable date always after every dated item, in both directions.
 * The sort is stable: items with equal timestamps keep their original feed
 * order under both directions, and undated items keep their relative feed
 * order among themselves.
 */
export function sortFeedIndices<T>(
  indices: number[],
  items: T[],
  direction: FeedSortDirection,
): number[] {
  if (!SORT_DIRECTIONS.includes(direction)) {
    throw new Error(`Unknown sort direction: ${String(direction)}`);
  }
  const times = new Map<number, number | null>();
  for (const index of indices) {
    const item = items[index] as { pubDate?: string | null } | undefined;
    times.set(index, parsePubDate(item?.pubDate));
  }
  const dated = indices.filter((index) => times.get(index) !== null);
  const undated = indices
    .filter((index) => times.get(index) === null)
    .sort((a, b) => a - b);
  dated.sort((a, b) => {
    const diff = (times.get(a) as number) - (times.get(b) as number);
    if (diff !== 0) {
      return direction === 'newest' ? -diff : diff;
    }
    return a - b;
  });
  return [...dated, ...undated];
}
