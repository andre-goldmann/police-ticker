import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientModule, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { PoliceFeed, RssFeedComponent } from './rss-feed.component';

interface FeedItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

const PRESET_FEEDS: PoliceFeed[] = [
  {
    name: 'Polizei Berlin',
    url: 'https://www.berlin.de/polizei/rss.xml',
    description: 'Berlin police feed',
  },
  {
    name: 'Polizei Hamburg',
    url: 'https://www.hamburg.de/polizei/rss.xml',
    description: 'Hamburg police feed',
  },
];

const CUSTOM_URL = 'https://example.com/feed.xml';
const CUSTOM_REQUEST = '/api/custom-rss?url=https%3A%2F%2Fexample.com%2Ffeed.xml';

function feedItems(count: number): FeedItem[] {
  return Array.from({ length: count }, (_, i) => ({
    title: `Item ${i + 1}`,
    link: `https://example.com/${i + 1}`,
    pubDate: 'Mon, 01 Jan 2026 00:00:00 GMT',
    description: `Description ${i + 1}`,
  }));
}

const TWO_ITEMS = feedItems(2);

describe('RssFeedComponent custom feeds', () => {
  let fixture: ComponentFixture<RssFeedComponent>;
  let component: RssFeedComponent;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RssFeedComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    })
      // The test provides its own HttpClient so requests are intercepted.
      .overrideComponent(RssFeedComponent, {
        remove: { imports: [HttpClientModule] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(RssFeedComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function flushPoliceFeeds() {
    http.expectOne('/api/german-police-feeds').flush(PRESET_FEEDS);
    fixture.detectChanges();
  }

  function setCustomUrl(value: string) {
    const input: HTMLInputElement = fixture.nativeElement.querySelector(
      'input[name="customFeedUrl"]',
    );
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function submit() {
    const form: HTMLFormElement = fixture.nativeElement.querySelector('form.input-row');
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  function errorText(): string {
    const element = fixture.nativeElement.querySelector('.error');
    return element ? element.textContent.trim() : '';
  }

  function flushCustomFeed(items: FeedItem[]) {
    http.expectOne(CUSTOM_REQUEST).flush(items);
    fixture.detectChanges();
  }

  describe('story 1: load a pasted feed URL', () => {
    it('sends exactly one GET to /api/custom-rss with the encoded custom URL', () => {
      flushPoliceFeeds();
      setCustomUrl(CUSTOM_URL);
      submit();

      const request = http.expectOne(CUSTOM_REQUEST);
      expect(request.request.method).toBe('GET');
      request.flush(TWO_ITEMS);
      fixture.detectChanges();
    });

    it('renders exactly the returned items in the feed items list', () => {
      flushPoliceFeeds();
      setCustomUrl(CUSTOM_URL);
      submit();
      flushCustomFeed(TWO_ITEMS);

      const rendered = fixture.nativeElement.querySelectorAll('ul.feed-items li');
      expect(rendered.length).toBe(TWO_ITEMS.length);
      expect(rendered[0].textContent).toMatch(/Item 1/);
      expect(rendered[1].textContent).toMatch(/Item 2/);
    });

    it('enables the submit button when no preset is selected but a custom URL is entered', () => {
      flushPoliceFeeds();
      component.selectedFeed = null;
      fixture.detectChanges();

      const button: HTMLButtonElement = fixture.nativeElement.querySelector('button[type="submit"]');
      expect(button.disabled).toBe(true);

      setCustomUrl(CUSTOM_URL);
      expect(button.disabled).toBe(false);
    });

    it('loads the custom feed without showing "Please select a feed first" when selectedFeed is null', () => {
      flushPoliceFeeds();
      component.selectedFeed = null;
      setCustomUrl(CUSTOM_URL);
      submit();

      http.expectOne(CUSTOM_REQUEST).flush(TWO_ITEMS);
      fixture.detectChanges();
      expect(errorText()).not.toMatch(/Please select a feed first/);
    });

    it('prefers the custom URL over a selected preset and sends no request for the preset URL', () => {
      flushPoliceFeeds();
      component.selectedFeed = PRESET_FEEDS[0];
      setCustomUrl(CUSTOM_URL);
      submit();

      http.expectOne(CUSTOM_REQUEST).flush(TWO_ITEMS);
      fixture.detectChanges();
      expect(component.selectedFeed.name).toBe('example.com');
      http.expectNone(`/api/custom-rss?url=${encodeURIComponent(PRESET_FEEDS[0].url)}`);
    });

    it('shows "Please select a feed first" and sends no request when the custom input is empty and no feed is selected', () => {
      flushPoliceFeeds();
      component.selectedFeed = null;
      setCustomUrl('   ');
      submit();

      expect(errorText()).toMatch(/Please select a feed first/);
      http.expectNone((request) => request.url.includes('/api/custom-rss'));
    });
  });

  describe('story 2: invalid input stays client-side', () => {
    it('shows "Enter a valid http(s) URL" and sends no request for values that do not parse as http(s) URLs', () => {
      flushPoliceFeeds();

      for (const value of ['example.com/feed', 'ftp://example.com/feed.xml']) {
        setCustomUrl(value);
        submit();
        expect(errorText()).toBe('Enter a valid http(s) URL');
        expect(component.loading).toBe(false);
      }

      http.expectNone((request) => request.url.includes('/api/custom-rss'));
    });
  });

  describe('story 3: custom feed identity', () => {
    it('synthesizes selectedFeed as the hostname, pasted URL, and "Custom feed"', () => {
      flushPoliceFeeds();
      setCustomUrl(CUSTOM_URL);
      submit();
      flushCustomFeed(TWO_ITEMS);

      expect(component.selectedFeed).toEqual({
        name: 'example.com',
        url: CUSTOM_URL,
        description: 'Custom feed',
      });
    });

    it('shows the pasted URL hostname as the feed-info title and "Custom feed" as its description', () => {
      flushPoliceFeeds();
      setCustomUrl('https://feeds.example.org/rss.xml');
      submit();
      http.expectOne('/api/custom-rss?url=https%3A%2F%2Ffeeds.example.org%2Frss.xml').flush(TWO_ITEMS);
      fixture.detectChanges();

      const feedInfo = fixture.nativeElement.querySelector('.feed-info');
      expect(feedInfo.querySelector('h3').textContent.trim()).toBe('feeds.example.org');
      expect(feedInfo.querySelector('p').textContent.trim()).toBe('Custom feed');
    });
  });

  describe('story 4: AI analysis runs for custom feeds', () => {
    beforeEach(() => {
      flushPoliceFeeds();
      setCustomUrl(CUSTOM_URL);
      submit();
      flushCustomFeed(TWO_ITEMS);
    });

    it('posts the item title and description to /api/openrouter-chat when an item is clicked', () => {
      fixture.nativeElement.querySelector('ul.feed-items a.feed-title').click();
      fixture.detectChanges();

      const request = http.expectOne({ method: 'POST', url: '/api/openrouter-chat' });
      const userMessage = request.request.body.messages.find(
        (message: { role: string }) => message.role === 'user',
      );
      expect(userMessage.content).toMatch(/Title: Item 1/);
      expect(userMessage.content).toMatch(/Content: Description 1/);
      request.flush({ choices: [{ message: { content: 'analysis' } }] });
      http
        .expectOne({ method: 'POST', url: '/api/analyze-rss-feed' })
        .flush({ choices: [{ message: { content: '{"summary":"ok"}' } }] });
    });

    it('posts the item title and description as feedDescription to /api/analyze-rss-feed', () => {
      fixture.nativeElement.querySelector('ul.feed-items a.feed-title').click();
      fixture.detectChanges();

      const request = http.expectOne({ method: 'POST', url: '/api/analyze-rss-feed' });
      expect(request.request.body.feedDescription).toBe('Item 1 - Description 1');
      request.flush({ choices: [{ message: { content: '{"summary":"ok"}' } }] });
      http
        .expectOne({ method: 'POST', url: '/api/openrouter-chat' })
        .flush({ choices: [{ message: { content: 'analysis' } }] });
    });
  });

  describe('story 5: rendered list cap', () => {
    it('renders exactly the first 100 items and shows "100 item(s)" when more are returned', () => {
      flushPoliceFeeds();
      setCustomUrl(CUSTOM_URL);
      submit();
      flushCustomFeed(feedItems(150));

      const rendered = fixture.nativeElement.querySelectorAll('ul.feed-items li');
      expect(rendered.length).toBe(100);
      expect(fixture.nativeElement.querySelector('.feed-meta').textContent).toMatch(/100 item\(s\)/);
    });

    it('renders all returned items when 100 or fewer come back', () => {
      flushPoliceFeeds();
      setCustomUrl(CUSTOM_URL);
      submit();
      flushCustomFeed(feedItems(7));

      const rendered = fixture.nativeElement.querySelectorAll('ul.feed-items li');
      expect(rendered.length).toBe(7);
      expect(fixture.nativeElement.querySelector('.feed-meta').textContent).toMatch(/7 item\(s\)/);
    });
  });

  describe('story 6: ephemeral custom feed', () => {
    it('keeps the dropdown options unchanged after a custom feed loads', () => {
      flushPoliceFeeds();
      setCustomUrl(CUSTOM_URL);
      submit();
      flushCustomFeed(TWO_ITEMS);

      const options = fixture.nativeElement.querySelectorAll(
        'select option',
      ) as NodeListOf<HTMLOptionElement>;
      const optionTexts = Array.from(options).map((option) => (option.textContent ?? '').trim());
      expect(optionTexts).toEqual([
        'Select a German police feed...',
        'Polizei Sachsen - Official police feed from Saxony',
        'Polizei Berlin - Berlin police feed',
        'Polizei Hamburg - Hamburg police feed',
      ]);
    });

    it('writes nothing to localStorage', () => {
      const setItem = spyOn(localStorage, 'setItem');

      flushPoliceFeeds();
      setCustomUrl(CUSTOM_URL);
      submit();
      flushCustomFeed(TWO_ITEMS);

      expect(setItem).not.toHaveBeenCalled();
    });
  });

  describe('story 9: preset flow frozen', () => {
    it('loads a selected preset through /api/custom-rss unchanged', () => {
      flushPoliceFeeds();
      component.selectedFeed = PRESET_FEEDS[0];
      fixture.detectChanges();
      setCustomUrl('');
      submit();

      const request = http.expectOne(
        `/api/custom-rss?url=${encodeURIComponent(PRESET_FEEDS[0].url)}`,
      );
      request.flush(TWO_ITEMS);
      fixture.detectChanges();

      expect(component.feedItems.length).toBe(TWO_ITEMS.length);
      expect(component.selectedFeed).toBe(PRESET_FEEDS[0]);
    });

    it('falls back to only the default feed when /api/german-police-feeds fails', () => {
      http
        .expectOne('/api/german-police-feeds')
        .flush('no feeds', { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      expect(component.policeFeeds.length).toBe(1);
      expect(component.policeFeeds[0].name).toBe('Polizei Sachsen');
      expect(component.selectedFeed).toBe(component.policeFeeds[0]);
    });

    it('surfaces server 400 error messages through the existing error banner', () => {
      flushPoliceFeeds();
      setCustomUrl(CUSTOM_URL);
      submit();

      http.expectOne(CUSTOM_REQUEST).flush(
        { error: 'Requests to private, loopback, or link-local addresses are not allowed' },
        { status: 400, statusText: 'Bad Request' },
      );
      fixture.detectChanges();

      expect(errorText()).toMatch(/Requests to private, loopback, or link-local addresses/);
    });

    it('keeps the existing empty state when no feed has been loaded', () => {
      http.expectOne('/api/german-police-feeds').flush(PRESET_FEEDS);
      fixture.detectChanges();

      const empty = fixture.nativeElement.querySelector('.empty');
      expect(empty.textContent).toMatch(/No feed items loaded/);
    });

    it('renders item descriptions as HTML via the existing innerHTML binding', () => {
      flushPoliceFeeds();
      setCustomUrl(CUSTOM_URL);
      submit();
      flushCustomFeed([
        {
          title: 'Item 1',
          link: 'https://example.com/1',
          pubDate: 'today',
          description: '<strong>Bold news</strong>',
        },
      ]);

      fixture.nativeElement.querySelector('ul.feed-items a.feed-title').click();
      fixture.detectChanges();
      http
        .expectOne({ method: 'POST', url: '/api/openrouter-chat' })
        .flush({ choices: [{ message: { content: 'analysis' } }] });
      http
        .expectOne({ method: 'POST', url: '/api/analyze-rss-feed' })
        .flush({ choices: [{ message: { content: '{"summary":"ok"}' } }] });
      fixture.detectChanges();

      const description = fixture.nativeElement.querySelector('.details .description');
      expect(description.querySelector('strong')).toBeTruthy();
      expect(description.textContent.trim()).toBe('Bold news');
    });
  });
});

describe('RssFeedComponent refresh button', () => {
  let fixture: ComponentFixture<RssFeedComponent>;
  let component: RssFeedComponent;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RssFeedComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    })
      // The test provides its own HttpClient so requests are intercepted.
      .overrideComponent(RssFeedComponent, {
        remove: { imports: [HttpClientModule] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(RssFeedComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function flushPoliceFeeds() {
    http.expectOne('/api/german-police-feeds').flush(PRESET_FEEDS);
    fixture.detectChanges();
  }

  function setCustomUrl(value: string) {
    const input: HTMLInputElement = fixture.nativeElement.querySelector(
      'input[name="customFeedUrl"]',
    );
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function submit() {
    const form: HTMLFormElement = fixture.nativeElement.querySelector('form.input-row');
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  function errorText(): string {
    const element = fixture.nativeElement.querySelector('.error');
    return element ? element.textContent.trim() : '';
  }

  function presetRequest(feed: PoliceFeed): string {
    return `/api/custom-rss?url=${encodeURIComponent(feed.url)}`;
  }

  function refreshButton(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button.refresh-feed');
  }

  function clickRefresh() {
    refreshButton().click();
    fixture.detectChanges();
  }

  function displayPresetFeed(feed: PoliceFeed) {
    flushPoliceFeeds();
    component.selectedFeed = feed;
    setCustomUrl('');
    submit();
    http.expectOne(presetRequest(feed)).flush(TWO_ITEMS);
    fixture.detectChanges();
  }

  function displayCustomFeed(items: FeedItem[] = TWO_ITEMS) {
    flushPoliceFeeds();
    setCustomUrl(CUSTOM_URL);
    submit();
    http.expectOne(CUSTOM_REQUEST).flush(items);
    fixture.detectChanges();
  }

  function openItemDetail() {
    fixture.nativeElement.querySelector('ul.feed-items a.feed-title').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.details')).toBeTruthy();
  }

  function flushDetailRequests() {
    http
      .expectOne({ method: 'POST', url: '/api/openrouter-chat' })
      .flush({ choices: [{ message: { content: 'analysis' } }] });
    http
      .expectOne({ method: 'POST', url: '/api/analyze-rss-feed' })
      .flush({ choices: [{ message: { content: '{"summary":"ok"}' } }] });
    fixture.detectChanges();
  }

  describe('US1: refresh reloads the displayed feed', () => {
    it('reloads the displayed preset feed via /api/custom-rss with that preset URL and renders the returned items', () => {
      displayPresetFeed(PRESET_FEEDS[0]);

      clickRefresh();

      const request = http.expectOne(presetRequest(PRESET_FEEDS[0]));
      expect(request.request.method).toBe('GET');
      expect(request.request.urlWithParams).toContain(encodeURIComponent(PRESET_FEEDS[0].url));
      request.flush(feedItems(3));
      fixture.detectChanges();

      const rendered = fixture.nativeElement.querySelectorAll('ul.feed-items li');
      expect(rendered.length).toBe(3);
      expect(rendered[2].textContent).toMatch(/Item 3/);
    });

    it('reloads the displayed custom feed with the pasted URL and keeps the 100-item cap', () => {
      displayCustomFeed(TWO_ITEMS);

      clickRefresh();

      const request = http.expectOne(CUSTOM_REQUEST);
      expect(request.request.urlWithParams).toContain(encodeURIComponent(CUSTOM_URL));
      request.flush(feedItems(150));
      fixture.detectChanges();

      const rendered = fixture.nativeElement.querySelectorAll('ul.feed-items li');
      expect(rendered.length).toBe(100);
    });
  });

  describe('US2: refresh button availability and placement', () => {
    it('renders a "Refresh" button inside the input row directly after the feed dropdown', () => {
      flushPoliceFeeds();

      const form = fixture.nativeElement.querySelector('form.input-row');
      const button = form.querySelector('button.refresh-feed');
      expect(button).toBeTruthy();
      expect(button.textContent.trim()).toBe('Refresh');
      expect(button.previousElementSibling).toBe(form.querySelector('.select-container'));
    });

    it('is visible and disabled when no feed has loaded', () => {
      flushPoliceFeeds();

      const button = refreshButton();
      expect(button).toBeTruthy();
      expect(button.disabled).toBe(true);
    });

    it('is enabled once a load succeeded', () => {
      displayCustomFeed(TWO_ITEMS);

      expect(refreshButton().disabled).toBe(false);
    });

    it('is disabled while a load is in flight and enabled again once it succeeds', () => {
      flushPoliceFeeds();
      setCustomUrl(CUSTOM_URL);
      submit();
      const request = http.expectOne(CUSTOM_REQUEST);

      expect(refreshButton().disabled).toBe(true);

      request.flush(TWO_ITEMS);
      fixture.detectChanges();
      expect(refreshButton().disabled).toBe(false);
    });
  });

  describe('US3: refresh ignores unsubmitted edits', () => {
    it('requests the tracked preset URL even after the dropdown selection changed without loading', () => {
      displayPresetFeed(PRESET_FEEDS[0]);

      component.selectedFeed = PRESET_FEEDS[1];
      fixture.detectChanges();
      expect(component.loadedFeed).toEqual({ url: PRESET_FEEDS[0].url, kind: 'preset' });

      clickRefresh();

      const request = http.expectOne(presetRequest(PRESET_FEEDS[0]));
      http.expectNone(presetRequest(PRESET_FEEDS[1]));
      request.flush(TWO_ITEMS);
      fixture.detectChanges();
      expect(component.feedItems.length).toBe(TWO_ITEMS.length);
    });

    it('requests the tracked custom URL even after typing a new URL without loading', () => {
      displayCustomFeed(TWO_ITEMS);

      setCustomUrl('https://other.example.net/rss.xml');
      expect(component.loadedFeed).toEqual({ url: CUSTOM_URL, kind: 'custom' });

      clickRefresh();

      const request = http.expectOne(CUSTOM_REQUEST);
      http.expectNone(
        '/api/custom-rss?url=' + encodeURIComponent('https://other.example.net/rss.xml'),
      );
      request.flush(TWO_ITEMS);
      fixture.detectChanges();
    });
  });

  describe('US4: refresh resets transient state', () => {
    it('collapses the open detail, clears items/error/analysis, and shows the spinner while refreshing', () => {
      displayCustomFeed(TWO_ITEMS);
      openItemDetail();
      flushDetailRequests();

      expect(component.selectedIndex).not.toBeNull();
      expect(component.openrouterResponse).not.toBeNull();
      expect(component.feedAnalysis).not.toBeNull();

      clickRefresh();

      expect(component.selectedIndex).toBeNull();
      expect(component.openrouterResponse).toBeNull();
      expect(component.feedItems).toEqual([]);
      expect(component.error).toBeNull();
      expect(component.feedAnalysis).toBeNull();
      expect(fixture.nativeElement.querySelector('.details')).toBeNull();

      const loading = fixture.nativeElement.querySelector('.loading');
      expect(loading).toBeTruthy();
      expect(loading.textContent).toMatch(/Loading feed items\.\.\./);
      expect(loading.querySelector('.spinner')).toBeTruthy();

      http.expectOne(CUSTOM_REQUEST).flush(TWO_ITEMS);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.loading')).toBeNull();
    });
  });

  describe('US5: failed refresh shows the error', () => {
    it('shows the server error message and an empty list when the refresh request fails', () => {
      displayCustomFeed(TWO_ITEMS);

      clickRefresh();
      http.expectOne(CUSTOM_REQUEST).flush(
        { error: 'Upstream feed is unavailable' },
        { status: 502, statusText: 'Bad Gateway' },
      );
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelectorAll('ul.feed-items li').length).toBe(0);
      expect(errorText()).toBe('Upstream feed is unavailable');
    });

    it('falls back to "Failed to load RSS feed." when the failure has no error message', () => {
      displayCustomFeed(TWO_ITEMS);

      clickRefresh();
      http.expectOne(CUSTOM_REQUEST).flush(null, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelectorAll('ul.feed-items li').length).toBe(0);
      expect(errorText()).toBe('Failed to load RSS feed.');
    });
  });

  describe('US6: shared load path collapses open detail', () => {
    it('collapses an open item detail when "Load Selected Feed" reloads the preset', () => {
      displayPresetFeed(PRESET_FEEDS[0]);
      openItemDetail();
      flushDetailRequests();

      submit();

      const request = http.expectOne(presetRequest(PRESET_FEEDS[0]));
      expect(component.selectedIndex).toBeNull();
      expect(component.openrouterResponse).toBeNull();
      expect(fixture.nativeElement.querySelector('.details')).toBeNull();

      request.flush(TWO_ITEMS);
      fixture.detectChanges();
    });
  });
});

describe('RssFeedComponent feed header names the loaded feed', () => {
  let fixture: ComponentFixture<RssFeedComponent>;
  let component: RssFeedComponent;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RssFeedComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    })
      // The test provides its own HttpClient so requests are intercepted.
      .overrideComponent(RssFeedComponent, {
        remove: { imports: [HttpClientModule] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(RssFeedComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function flushPoliceFeeds() {
    http.expectOne('/api/german-police-feeds').flush(PRESET_FEEDS);
    fixture.detectChanges();
  }

  function setCustomUrl(value: string) {
    const input: HTMLInputElement = fixture.nativeElement.querySelector(
      'input[name="customFeedUrl"]',
    );
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function submit() {
    const form: HTMLFormElement = fixture.nativeElement.querySelector('form.input-row');
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  function presetRequest(feed: PoliceFeed): string {
    return `/api/custom-rss?url=${encodeURIComponent(feed.url)}`;
  }

  function customRequest(url: string): string {
    return `/api/custom-rss?url=${encodeURIComponent(url)}`;
  }

  function displayPresetFeed(feed: PoliceFeed) {
    flushPoliceFeeds();
    component.selectedFeed = feed;
    setCustomUrl('');
    submit();
    http.expectOne(presetRequest(feed)).flush(TWO_ITEMS);
    fixture.detectChanges();
  }

  function displayCustomFeed() {
    flushPoliceFeeds();
    setCustomUrl(CUSTOM_URL);
    submit();
    http.expectOne(CUSTOM_REQUEST).flush(TWO_ITEMS);
    fixture.detectChanges();
  }

  function feedInfoHeader(): { name: string; description: string } | null {
    const info = fixture.nativeElement.querySelector('.feed-info');
    if (!info) {
      return null;
    }
    return {
      name: info.querySelector('h3').textContent.trim(),
      description: info.querySelector('p').textContent.trim(),
    };
  }

  it('keeps showing the loaded preset name and description after the dropdown changes without loading', () => {
    displayPresetFeed(PRESET_FEEDS[0]);
    expect(feedInfoHeader()).toEqual({ name: 'Polizei Berlin', description: 'Berlin police feed' });

    component.selectedFeed = PRESET_FEEDS[1];
    fixture.detectChanges();
    expect(feedInfoHeader()).toEqual({ name: 'Polizei Berlin', description: 'Berlin police feed' });

    submit();
    http.expectOne(presetRequest(PRESET_FEEDS[1])).flush(TWO_ITEMS);
    fixture.detectChanges();
    expect(feedInfoHeader()).toEqual({
      name: 'Polizei Hamburg',
      description: 'Hamburg police feed',
    });
  });

  it('shows the built-in "Polizei Sachsen" default entry when the default preset is loaded', () => {
    flushPoliceFeeds();
    expect(component.selectedFeed).toBe(component.policeFeeds[0]);
    submit();

    http.expectOne(presetRequest(component.policeFeeds[0])).flush(TWO_ITEMS);
    fixture.detectChanges();

    expect(feedInfoHeader()).toEqual({
      name: 'Polizei Sachsen',
      description: 'Official police feed from Saxony',
    });
  });

  it('keeps showing the loaded custom hostname and "Custom feed" after the dropdown or URL field change without loading', () => {
    displayCustomFeed();
    expect(feedInfoHeader()).toEqual({ name: 'example.com', description: 'Custom feed' });

    component.selectedFeed = PRESET_FEEDS[1];
    setCustomUrl('https://other.example.net/rss.xml');
    expect(feedInfoHeader()).toEqual({ name: 'example.com', description: 'Custom feed' });

    submit();
    http.expectOne(customRequest('https://other.example.net/rss.xml')).flush(TWO_ITEMS);
    fixture.detectChanges();
    expect(feedInfoHeader()).toEqual({ name: 'other.example.net', description: 'Custom feed' });
  });

  it('falls back to the hostname when the loaded preset URL matches no dropdown entry', () => {
    displayPresetFeed(PRESET_FEEDS[0]);
    expect(feedInfoHeader()).toEqual({ name: 'Polizei Berlin', description: 'Berlin police feed' });

    // The dropdown no longer knows the loaded preset URL.
    component.policeFeeds = [PRESET_FEEDS[1]];
    fixture.detectChanges();

    expect(feedInfoHeader()).toEqual({ name: 'www.berlin.de', description: 'Custom feed' });
  });

  it('is absent while no feed items are loaded', () => {
    flushPoliceFeeds();

    expect(fixture.nativeElement.querySelector('.feed-info')).toBeNull();
  });

  it('is absent while a load is in flight and returns once the items are displayed', () => {
    flushPoliceFeeds();
    setCustomUrl(CUSTOM_URL);
    submit();
    expect(fixture.nativeElement.querySelector('.feed-info')).toBeNull();

    http.expectOne(CUSTOM_REQUEST).flush(TWO_ITEMS);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.feed-info')).not.toBeNull();
  });

  it('is absent while a refresh is in flight and after a failed reload leaves no items', () => {
    displayCustomFeed();
    expect(fixture.nativeElement.querySelector('.feed-info')).not.toBeNull();

    fixture.nativeElement.querySelector('button.refresh-feed').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.feed-info')).toBeNull();

    http.expectOne(CUSTOM_REQUEST).flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.feed-info')).toBeNull();
  });
});
