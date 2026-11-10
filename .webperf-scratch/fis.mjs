const NAMED_HTML_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  auml: "\xE4",
  ouml: "\xF6",
  uuml: "\xFC",
  szlig: "\xDF",
  Auml: "\xC4",
  Ouml: "\xD6",
  Uuml: "\xDC",
  aacute: "\xE1",
  eacute: "\xE9",
  egrave: "\xE8",
  agrave: "\xE0",
  ccedil: "\xE7",
  ntilde: "\xF1",
  hellip: "\u2026",
  mdash: "\u2014",
  ndash: "\u2013",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201C",
  rdquo: "\u201D",
  laquo: "\xAB",
  raquo: "\xBB",
  euro: "\u20AC",
  copy: "\xA9",
  reg: "\xAE",
  deg: "\xB0"
};
const ENTITY_PATTERN = /&(?:#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g;
function stripHtmlTags(html) {
  return html.replace(/<[^>]*>/g, " ");
}
function decodeHtmlEntities(text) {
  if (!text.includes("&")) {
    return text;
  }
  return text.replace(ENTITY_PATTERN, (entity) => {
    const code = entity.slice(1, -1);
    if (code.startsWith("#")) {
      const isHex = code[1] === "x" || code[1] === "X";
      const digits = isHex ? code.slice(2) : code.slice(1);
      const value = Number.parseInt(digits, isHex ? 16 : 10);
      if (Number.isInteger(value) && value >= 0 && value <= 1114111) {
        return String.fromCodePoint(value);
      }
      return entity;
    }
    return NAMED_HTML_ENTITIES[code] ?? NAMED_HTML_ENTITIES[code.toLowerCase()] ?? entity;
  });
}
function visibleText(rawHtml) {
  return decodeHtmlEntities(stripHtmlTags(rawHtml));
}
function feedItemMatchesQuery(query, item) {
  const words = query.toLowerCase().split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) {
    return true;
  }
  const haystack = `${item.title ?? ""}
${visibleText(item.description ?? "")}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}
export {
  feedItemMatchesQuery
};
