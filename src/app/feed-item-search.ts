/**
 * Client-side keyword matching for the feed search box: the items of the
 * currently loaded feed are filtered in the browser, without any server
 * round-trip. Input is the query plus a feed item (title and raw HTML
 * description); output is whether the item is displayed.
 */

/** Common HTML entities beyond the numeric escapes handled below. */
const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  auml: 'ä',
  ouml: 'ö',
  uuml: 'ü',
  szlig: 'ß',
  Auml: 'Ä',
  Ouml: 'Ö',
  Uuml: 'Ü',
  aacute: 'á',
  eacute: 'é',
  egrave: 'è',
  agrave: 'à',
  ccedil: 'ç',
  ntilde: 'ñ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  euro: '€',
  copy: '©',
  reg: '®',
  deg: '°',
};

const ENTITY_PATTERN = /&(?:#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g;

/**
 * Replaces tags in a raw HTML description with spaces, so tag names never
 * contribute characters to the searchable text.
 */
function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, ' ');
}

/**
 * Decodes named and numeric (&#228;, &#xE4;) HTML entities. Unknown entities
 * are left untouched. Tags are stripped before decoding so real markup cannot
 * match while escaped markup ("&lt;div&gt;") stays part of the visible text.
 */
function decodeHtmlEntities(text: string): string {
  if (!text.includes('&')) {
    return text;
  }
  return text.replace(ENTITY_PATTERN, (entity: string) => {
    const code = entity.slice(1, -1);
    if (code.startsWith('#')) {
      const isHex = code[1] === 'x' || code[1] === 'X';
      const digits = isHex ? code.slice(2) : code.slice(1);
      const value = Number.parseInt(digits, isHex ? 16 : 10);
      if (Number.isInteger(value) && value >= 0 && value <= 0x10ffff) {
        return String.fromCodePoint(value);
      }
      return entity;
    }
    return NAMED_HTML_ENTITIES[code] ?? NAMED_HTML_ENTITIES[code.toLowerCase()] ?? entity;
  });
}

/** The visible text of a raw HTML feed description. */
function visibleText(rawHtml: string): string {
  return decodeHtmlEntities(stripHtmlTags(rawHtml));
}

/**
 * Whether a feed item matches the search box: every whitespace-separated word
 * of the query must occur case-insensitively as a substring of the title or
 * the visible description text. Diacritics are not folded — the query must
 * contain the letters as written. An empty query matches every item, so the
 * full loaded list is displayed.
 */
export function feedItemMatchesQuery(
  query: string,
  item: { title?: string | null; description?: string | null },
): boolean {
  const words = query.toLowerCase().split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) {
    return true;
  }
  const haystack = `${item.title ?? ''}\n${visibleText(item.description ?? '')}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}
