import { feedItemMatchesQuery } from './feed-item-search';

function item(title: string, description: string) {
  return { title, description };
}

describe('feedItemMatchesQuery', () => {
  describe('US2: case-insensitive, whitespace-split multi-word AND substring matching', () => {
    const brand = item('Brand in Leipzig', 'Großeinsatz der Feuerwehr in der Innenstadt');

    it('matches a single query word against the title or the raw description', () => {
      expect(feedItemMatchesQuery('leipzig', brand)).toBeTrue();
      expect(feedItemMatchesQuery('feuerwehr', brand)).toBeTrue();
      expect(feedItemMatchesQuery('autobahn', brand)).toBeFalse();
    });

    it('matches every word of the query (AND), ignoring word order', () => {
      expect(feedItemMatchesQuery('leipzig feuerwehr', brand)).toBeTrue();
      expect(feedItemMatchesQuery('feuerwehr leipzig', brand)).toBeTrue();
      expect(feedItemMatchesQuery('leipzig unfall', brand)).toBeFalse();
    });

    it('matches case-insensitively in both directions', () => {
      expect(feedItemMatchesQuery('LEIPZIG', brand)).toBeTrue();
      expect(feedItemMatchesQuery('Brand', brand)).toBeTrue();
    });

    it('matches words as substrings of the visible text', () => {
      expect(feedItemMatchesQuery('eipzig', brand)).toBeTrue();
      expect(feedItemMatchesQuery('wehr', brand)).toBeTrue();
    });

    it('splits the query on arbitrary whitespace', () => {
      expect(feedItemMatchesQuery('  leipzig \t feuerwehr  ', brand)).toBeTrue();
    });

    it('matches every item when the query is empty or whitespace only', () => {
      expect(feedItemMatchesQuery('', brand)).toBeTrue();
      expect(feedItemMatchesQuery('   ', brand)).toBeTrue();
    });

    it('tolerates missing title or description fields', () => {
      expect(feedItemMatchesQuery('leipzig', { title: 'Brand in Leipzig' })).toBeTrue();
      expect(feedItemMatchesQuery('leipzig', { description: 'Aus Leipzig gemeldet' })).toBeTrue();
      expect(feedItemMatchesQuery('leipzig', {})).toBeFalse();
    });
  });

  describe('US3: matching runs over visible text, not markup', () => {
    it('never matches tag names that occur only in the description markup', () => {
      const withMarkup = item('Bericht', '<div>Bericht über den Einsatz</div>');
      const plain = item('Bericht', 'Bericht über den Einsatz');
      expect(feedItemMatchesQuery('div', withMarkup)).toBeFalse();
      expect(feedItemMatchesQuery('div', plain)).toBeFalse();
    });

    it('still matches the visible text of a markup description', () => {
      const withMarkup = item('Bericht', '<div>Bericht über den Einsatz</div>');
      expect(feedItemMatchesQuery('bericht', withMarkup)).toBeTrue();
      expect(feedItemMatchesQuery('einsatz', withMarkup)).toBeTrue();
    });

    it('matches entity-encoded text under its decoded form', () => {
      const entity = item('Schadenmeldung', 'Sch&auml;den an der Schule');
      expect(feedItemMatchesQuery('Schäden', entity)).toBeTrue();
      expect(feedItemMatchesQuery('schäden', entity)).toBeTrue();
      expect(feedItemMatchesQuery('Sch&auml;den', entity)).toBeFalse();
    });

    it('decodes decimal and hexadecimal numeric entities', () => {
      const decimal = item('Schadenmeldung', 'Sch&#228;den an der Schule');
      const hexadecimal = item('Schadenmeldung', 'Sch&#xE4;den an der Schule');
      expect(feedItemMatchesQuery('Schäden', decimal)).toBeTrue();
      expect(feedItemMatchesQuery('Schäden', hexadecimal)).toBeTrue();
    });

    it('does not decode entities when matching the other item of the pair', () => {
      expect(feedItemMatchesQuery('Schäden', item('Vorfall', 'Kein Schaden'))).toBeFalse();
    });

    it('treats the title as a plain string without markup handling', () => {
      expect(feedItemMatchesQuery('brand', item('Brand in Leipzig', ''))).toBeTrue();
    });
  });

  describe('US4: no diacritic folding', () => {
    const fassade = item('Schäden an der Fassade', '');

    it('requires the query to contain the letters as written', () => {
      expect(feedItemMatchesQuery('schaden', fassade)).toBeFalse();
      expect(feedItemMatchesQuery('Schäden', fassade)).toBeTrue();
      expect(feedItemMatchesQuery('schäden', fassade)).toBeTrue();
    });

    it('does not fold across words either', () => {
      expect(feedItemMatchesQuery('schaden fassade', fassade)).toBeFalse();
      expect(feedItemMatchesQuery('schäden fassade', fassade)).toBeTrue();
    });
  });
});
