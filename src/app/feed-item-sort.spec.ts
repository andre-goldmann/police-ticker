import { FeedSortDirection, sortFeedIndices } from './feed-item-sort';

interface SortItem {
  title: string;
  pubDate?: string | null;
}

function item(title: string, pubDate?: string | null): SortItem {
  return { title, pubDate };
}

describe('sortFeedIndices', () => {
  const OUT_OF_ORDER_ITEMS = [
    item('Older report', 'Fri, 02 Jan 2026 08:00:00 GMT'),
    item('Newest report', 'Sat, 03 Jan 2026 08:00:00 GMT'),
    item('Oldest report', 'Thu, 01 Jan 2026 08:00:00 GMT'),
  ];
  const ALL_INDICES = [0, 1, 2];

  describe('US1: dated items order by publication date', () => {
    it('sorts newest first under "newest"', () => {
      expect(sortFeedIndices(ALL_INDICES, OUT_OF_ORDER_ITEMS, 'newest')).toEqual([1, 0, 2]);
    });

    it('sorts oldest first under "oldest"', () => {
      expect(sortFeedIndices(ALL_INDICES, OUT_OF_ORDER_ITEMS, 'oldest')).toEqual([2, 0, 1]);
    });

    it('keeps an already sorted list unchanged in both directions', () => {
      const sorted = [item('A', 'Sat, 03 Jan 2026 08:00:00 GMT'), item('B', 'Thu, 01 Jan 2026 08:00:00 GMT')];
      expect(sortFeedIndices([0, 1], sorted, 'newest')).toEqual([0, 1]);
      expect(sortFeedIndices([0, 1], sorted, 'oldest')).toEqual([1, 0]);
    });
  });

  describe('US2: items without a parseable date sort last in both directions', () => {
    const UNDATED_ITEMS = [
      item('Undated first', ''),
      item('Dated middle', 'Fri, 02 Jan 2026 08:00:00 GMT'),
      item('Undated last', 'not-a-date'),
      item('Undated missing'),
    ];

    it('places undated items after every dated item under "newest"', () => {
      expect(sortFeedIndices([0, 1, 2, 3], UNDATED_ITEMS, 'newest')).toEqual([1, 0, 2, 3]);
    });

    it('places undated items after every dated item under "oldest"', () => {
      expect(sortFeedIndices([0, 1, 2, 3], UNDATED_ITEMS, 'oldest')).toEqual([1, 0, 2, 3]);
    });

    it('keeps the relative feed order among undated items in both directions', () => {
      const indices = [3, 2, 0];
      const newestOrder = sortFeedIndices(indices, UNDATED_ITEMS, 'newest');
      const oldestOrder = sortFeedIndices(indices, UNDATED_ITEMS, 'oldest');
      expect(newestOrder).toEqual([0, 2, 3]);
      expect(oldestOrder).toEqual([0, 2, 3]);
    });

    it('sorts every item when none has a parseable date', () => {
      expect(sortFeedIndices([0, 1], [item('A', 'nope'), item('B')], 'newest')).toEqual([0, 1]);
    });
  });

  describe('US3: ties keep feed order in both directions', () => {
    const TIE_ITEMS = [
      item('Tie first', 'Fri, 02 Jan 2026 08:00:00 GMT'),
      item('Tie second', 'Fri, 02 Jan 2026 08:00:00 GMT'),
      item('Before tie', 'Thu, 01 Jan 2026 08:00:00 GMT'),
    ];

    it('keeps tied items in feed order under "newest"', () => {
      expect(sortFeedIndices(ALL_INDICES, TIE_ITEMS, 'newest')).toEqual([0, 1, 2]);
    });

    it('keeps tied items in feed order under "oldest"', () => {
      expect(sortFeedIndices([2, 1, 0], TIE_ITEMS, 'oldest')).toEqual([2, 0, 1]);
    });
  });

  describe('combined with a filtered index subset', () => {
    it('sorts only the given indices and never invents or drops one', () => {
      const subset = [2, 0];
      expect(sortFeedIndices(subset, OUT_OF_ORDER_ITEMS, 'newest')).toEqual([0, 2]);
      expect(sortFeedIndices(subset, OUT_OF_ORDER_ITEMS, 'oldest')).toEqual([2, 0]);
    });

    it('returns an empty order for an empty subset', () => {
      expect(sortFeedIndices([], OUT_OF_ORDER_ITEMS, 'newest')).toEqual([]);
    });

    it('does not mutate the given index list', () => {
      const subset = [2, 1, 0];
      sortFeedIndices(subset, OUT_OF_ORDER_ITEMS, 'oldest');
      expect(subset).toEqual([2, 1, 0]);
    });
  });

  describe('direction input', () => {
    it('rejects a direction that is neither newest nor oldest', () => {
      const bogus = 'ascending' as FeedSortDirection;
      expect(() => sortFeedIndices(ALL_INDICES, OUT_OF_ORDER_ITEMS, bogus)).toThrow();
    });
  });
});
