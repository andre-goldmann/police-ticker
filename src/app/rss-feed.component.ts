import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Subscription } from 'rxjs';

import { feedItemMatchesQuery } from './feed-item-search';
import { FeedSortDirection, sortFeedIndices } from './feed-item-sort';

export interface PoliceFeed {
  name: string;
  url: string;
  description: string;
}

/** Maximum number of items rendered from a pasted custom feed. */
const MAX_CUSTOM_FEED_ITEMS = 100;

/** Interval in milliseconds between automatic re-fetches of the loaded feed. */
const AUTO_REFRESH_INTERVAL_MS = 60_000;

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Stable identity of a feed item across fetches: its link, else its title. */
function feedItemKey(item: any): string {
  return item?.link || item?.title || '';
}

@Component({
  selector: 'app-rss-feed',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './rss-feed.component.html',
  styleUrl: './rss-feed.component.scss',
})
export class RssFeedComponent implements OnInit, OnDestroy {
  feedItems: any[] = [];
  loading = false;
  error: string | null = null;
  selectedIndex: number | null = null;
  openrouterResponse: any = null;
  /** Current text of the feed search box; filters the loaded items client-side. */
  searchQuery = '';
  /** Direction of the publication-date sort over the displayed items. */
  sortDirection: FeedSortDirection = 'newest';

  policeFeeds: PoliceFeed[] = [];
  loadingFeeds = false;
  selectedFeed: PoliceFeed | null = null;
  feedAnalysis: any = null;
  loadingAnalysis = false;
  customFeedUrl = '';
  /**
   * The currently loaded feed — the one whose items are actually displayed.
   * Tracked separately from the inputs because `selectedFeed` is overwritten
   * by both the dropdown and successful custom loads; it only changes when a
   * load succeeds, never through unsubmitted input edits.
   */
  loadedFeed: { url: string; kind: 'preset' | 'custom' } | null = null;
  /** Pending automatic re-fetch timer, if one is scheduled. */
  private autoRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  /** Automatic re-fetch currently in flight, if any. */
  private autoRefreshSubscription: Subscription | null = null;
  /**
   * Set when a failed automatic re-fetch stops the cadence; cleared by the
   * next manual load or refresh, which restarts the interval.
   */
  private autoRefreshStopped = false;
  defaultFeed: PoliceFeed = {
    name: 'Polizei Sachsen',
    url: 'https://www.polizei.sachsen.de/de/presse_rss_pdl.xml',
    description: 'Official police feed from Saxony',
  };

  constructor(private http: HttpClient, @Inject(DOCUMENT) private document: Document) {}

  /**
   * Submit is possible while a preset is selected (as before) or while a
   * custom feed URL has been pasted in.
   */
  get canSubmitFeed(): boolean {
    return !this.loading && (this.selectedFeed !== null || this.customFeedUrl.trim() !== '');
  }

  /**
   * Refresh is possible only while a feed is actually displayed and no load
   * is in flight.
   */
  get canRefreshFeed(): boolean {
    return this.loadedFeed !== null && !this.loading;
  }

  /**
   * Header info for the currently loaded feed, derived only from `loadedFeed`
   * so unsubmitted edits to the dropdown or the custom URL field cannot change
   * it: presets are looked up by URL in `policeFeeds` (the built-in default
   * included), while unknown preset URLs and custom feeds fall back to the
   * URL's hostname with the generic "Custom feed" description.
   */
  get loadedFeedInfo(): { name: string; description: string } {
    const loaded = this.loadedFeed;
    if (!loaded) {
      return { name: '', description: '' };
    }
    const preset =
      loaded.kind === 'preset'
        ? this.policeFeeds.find((feed) => feed.url === loaded.url)
        : undefined;
    if (preset) {
      return { name: preset.name, description: preset.description };
    }
    return { name: new URL(loaded.url).hostname, description: 'Custom feed' };
  }

  /**
   * True while the search box holds a non-whitespace query, i.e. the item list
   * and the item count reflect the filtered subset.
   */
  get hasActiveSearch(): boolean {
    return this.searchQuery.trim() !== '';
  }

  /**
   * Indices into `feedItems` of the items matching the search box, in original
   * order — every index while the query is empty. Indices rather than filtered
   * items so open-detail state (`selectedIndex`) keeps pointing into the full
   * `feedItems` array while the list is filtered.
   */
  get matchingFeedIndices(): number[] {
    const query = this.searchQuery;
    const indices: number[] = [];
    this.feedItems.forEach((item, index) => {
      if (feedItemMatchesQuery(query, item)) {
        indices.push(index);
      }
    });
    return indices;
  }

  /**
   * Sets the publication-date sort direction; the list reorders client-side
   * without any network request.
   */
  setSortDirection(direction: FeedSortDirection) {
    this.sortDirection = direction;
  }

  /**
   * Indices into `feedItems` of the displayed items — the search matches in
   * original order, reordered by publication date under the active sort
   * direction, so `selectedIndex` keeps pointing into the full `feedItems`
   * array and an open detail follows its item when the direction flips.
   */
  get displayedFeedIndices(): number[] {
    return sortFeedIndices(this.matchingFeedIndices, this.feedItems, this.sortDirection);
  }

  /**
   * "X of Y item(s)" while a search is active, otherwise the plain item count.
   */
  get itemCountLabel(): string {
    return this.hasActiveSearch
      ? `${this.matchingFeedIndices.length} of ${this.feedItems.length} item(s)`
      : `${this.feedItems.length} item(s)`;
  }

  ngOnInit() {
    // Load the list of police feeds when component initializes
    this.loadPoliceFeeds();
    // Pause the automatic re-fetch while the tab is hidden and catch up when
    // it becomes visible again.
    this.document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  ngOnDestroy() {
    this.document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.stopAutoRefresh();
  }

  loadPoliceFeeds() {
    this.loadingFeeds = true;
    this.http.get<PoliceFeed[]>('/api/german-police-feeds').subscribe({
      next: (feeds) => {
        console.log(`Loaded ${feeds.length} police feeds`);

        // Create a new array with default feed as first entry, followed by the other feeds
        const updatedFeeds = [this.defaultFeed, ...feeds];
        this.policeFeeds = updatedFeeds;
        this.selectedFeed = updatedFeeds[0]; // Default feed is now always first
        this.loadingFeeds = false;
      },
      error: (err) => {
        console.error('Failed to load police feeds:', err);
        // If we can't load feeds, just use the default feed
        this.policeFeeds = [this.defaultFeed];
        this.selectedFeed = this.defaultFeed;
        this.loadingFeeds = false;
      }
    });
  }

  fetchFeed() {
    const customUrl = this.customFeedUrl.trim();
    if (customUrl) {
      if (!isValidHttpUrl(customUrl)) {
        this.error = 'Enter a valid http(s) URL';
        return;
      }
      this.loadFeed(customUrl, customUrl);
      return;
    }

    if (!this.selectedFeed) {
      this.error = 'Please select a feed first';
      return;
    }

    this.loadFeed(this.selectedFeed.url);
  }

  /**
   * Reload the currently loaded feed — preset or custom — ignoring any
   * unsubmitted edits to the dropdown or the custom URL field.
   */
  refreshFeed() {
    if (!this.loadedFeed || this.loading) {
      return;
    }
    this.loadFeed(this.loadedFeed.url, this.loadedFeed.kind === 'custom' ? this.loadedFeed.url : undefined);
  }

  /**
   * While the tab is hidden the pending re-fetch tick is dropped; when the tab
   * becomes visible again the currently loaded feed is re-fetched immediately
   * and the cadence continues from that catch-up. A cadence stopped by a
   * failed automatic re-fetch stays stopped — only a manual load or refresh
   * restarts it.
   */
  private readonly onVisibilityChange = () => {
    if (this.document.visibilityState === 'hidden') {
      this.clearAutoRefreshTimer();
      return;
    }
    if (this.autoRefreshStopped) {
      return;
    }
    this.onAutoRefreshTick();
  };

  /**
   * Fires when the automatic re-fetch interval elapses: re-fetches the
   * currently loaded feed only — never the dropdown selection or the custom
   * URL field text — and skips the tick while nothing is loaded, the tab is
   * hidden, a re-fetch is still in flight, or the cadence has stopped after a
   * failed automatic re-fetch.
   */
  private onAutoRefreshTick() {
    this.autoRefreshTimer = null;
    if (this.autoRefreshStopped) {
      return;
    }
    if (this.document.visibilityState === 'hidden') {
      return;
    }
    const loaded = this.loadedFeed;
    if (!loaded || this.autoRefreshSubscription !== null) {
      return;
    }
    // Schedule the next tick now: if this re-fetch is still in flight when it
    // fires, the tick is skipped and this re-fetch schedules the next attempt
    // 60 seconds after it finishes.
    this.scheduleAutoRefreshTimer();
    this.loadFeed(loaded.url, loaded.kind === 'custom' ? loaded.url : undefined, {
      silent: true,
    });
  }

  private scheduleAutoRefreshTimer() {
    this.clearAutoRefreshTimer();
    this.autoRefreshTimer = setTimeout(() => this.onAutoRefreshTick(), AUTO_REFRESH_INTERVAL_MS);
  }

  private clearAutoRefreshTimer() {
    if (this.autoRefreshTimer !== null) {
      clearTimeout(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
  }

  /**
   * Stop the automatic re-fetch: drop the pending tick and cancel a re-fetch
   * that is still in flight so its response cannot arrive out of order.
   */
  private stopAutoRefresh() {
    this.clearAutoRefreshTimer();
    if (this.autoRefreshSubscription !== null) {
      this.autoRefreshSubscription.unsubscribe();
      this.autoRefreshSubscription = null;
    }
  }

  /**
   * Keep an open detail on its item across a silent swap: the fetched list
   * holds fresh objects, so the selection is relocated to the matching item
   * and closes when that item is gone from the feed.
   */
  private relocateSelectedIndex(selected: any) {
    if (!selected) {
      return;
    }
    const key = feedItemKey(selected);
    const relocated = this.feedItems.findIndex((item) => feedItemKey(item) === key);
    this.selectedIndex = relocated === -1 ? null : relocated;
  }

  private loadFeed(feedUrl: string, customUrl?: string, options?: { silent?: boolean }) {
    const silent = options?.silent === true;
    const kind: 'preset' | 'custom' = customUrl ? 'custom' : 'preset';
    if (!silent) {
      // A manual load or refresh cancels the scheduled automatic re-fetch and
      // any re-fetch still in flight; its own success restarts the interval.
      this.stopAutoRefresh();
      this.autoRefreshStopped = false;
      this.loading = true;
      this.error = null;
      this.feedItems = [];
      this.feedAnalysis = null; // Reset any previous feed analysis
      this.selectedIndex = null; // Collapse any open item detail
      this.openrouterResponse = null;
      this.loadingAnalysis = false;
    }

    // All feeds are now treated as external URLs
    const endpoint = `/api/custom-rss?url=${encodeURIComponent(feedUrl)}`;

    const subscription = this.http.get<any[]>(endpoint).subscribe({
      next: (items) => {
        // A silent swap relocates the open detail to its item in the new
        // list, so capture the selected item before `feedItems` is replaced.
        const selected =
          silent && this.selectedIndex !== null ? this.feedItems[this.selectedIndex] : null;
        if (customUrl) {
          this.feedItems = items.slice(0, MAX_CUSTOM_FEED_ITEMS);
          this.selectedFeed = {
            name: new URL(customUrl).hostname,
            url: customUrl,
            description: 'Custom feed',
          };
        } else {
          this.feedItems = items;
        }
        if (silent) {
          // An automatic re-fetch swaps the items in place; the manual loading
          // state, the search query, the sort direction, and any open detail
          // stay as they are — the detail follows its item and closes when the
          // item is gone from the feed. A stale failure banner is cleared.
          this.error = null;
          this.relocateSelectedIndex(selected);
          this.autoRefreshSubscription = null;
        } else {
          this.loadedFeed = { url: feedUrl, kind };
          // A fresh feed load always shows its full list — reset the search box
          // and the sort direction to their defaults.
          this.searchQuery = '';
          this.sortDirection = 'newest';
          this.loading = false;
        }
        // Any completed load — manual or automatic — restarts the interval.
        this.scheduleAutoRefreshTimer();
      },
      error: (err) => {
        this.error = err?.error?.error || 'Failed to load RSS feed.';
        if (silent) {
          // A failed automatic re-fetch shows the banner once and stops the
          // timer — including the visibility catch-up; only a manual refresh
          // or a new load restarts it.
          this.autoRefreshStopped = true;
          this.autoRefreshSubscription = null;
          this.clearAutoRefreshTimer();
          return;
        }
        this.loading = false;
      },
    });
    if (silent) {
      this.autoRefreshSubscription = subscription;
    }
  }
  /**
   * Gets feed analysis for the currently selected feed
   */
  getFeedAnalysis() {
    if (!this.selectedFeed) {
      return;
    }
    
    this.loadingAnalysis = true;
    this.feedAnalysis = null;
    
    // Use the feed description for analysis
    const feedDescription = this.selectedFeed.description || 
                           `${this.selectedFeed.name} RSS Feed from ${this.selectedFeed.url}`;
    
    this.http.post<any>('/api/analyze-rss-feed', { feedDescription }).subscribe({
      next: (response) => {
        // Extract the analysis information from the response
        try {
          if (response?.choices && response.choices[0]?.message?.content) {
            let content = response.choices[0].message.content;
            
            // Check if the content is a JSON string and try to format it
            try {
              // If content is JSON, parse and format it
              const jsonData = JSON.parse(content);
              
              // Format the feed analysis info into HTML
              let formattedContent = '<div class="feed-analysis-content">';
              
              // Add summary if available
              if (jsonData.summary) {
                formattedContent += `<div class="analysis-summary">${jsonData.summary}</div>`;
              } else if (jsonData.feedAnalysis?.summary) {
                formattedContent += `<div class="analysis-summary">${jsonData.feedAnalysis.summary}</div>`;
              }
              
              // Add feed details
              if (jsonData.feedAnalysis) {
                const feedInfo = jsonData.feedAnalysis;
                
                formattedContent += '<div class="analysis-details">';
                formattedContent += '<h5>Feed Details:</h5>';
                formattedContent += '<ul>';
                
                if (feedInfo.contentType) {
                  formattedContent += `<li><strong>Content Type:</strong> ${feedInfo.contentType}</li>`;
                }
                
                if (feedInfo.languageDetected) {
                  formattedContent += `<li><strong>Language:</strong> ${feedInfo.languageDetected}</li>`;
                }
                
                if (feedInfo.domain && feedInfo.domain !== "unknown") {
                  formattedContent += `<li><strong>Domain:</strong> ${feedInfo.domain}</li>`;
                }
                
                if (feedInfo.potentialLocations && feedInfo.potentialLocations.length > 0 && 
                    feedInfo.potentialLocations[0] !== "Unknown") {
                  formattedContent += `<li><strong>Locations:</strong> ${feedInfo.potentialLocations.join(', ')}</li>`;
                }
                
                if (feedInfo.topKeywords && feedInfo.topKeywords.length > 0) {
                  formattedContent += `<li><strong>Key Topics:</strong> ${feedInfo.topKeywords.join(', ')}</li>`;
                }
                
                formattedContent += '</ul>';
                formattedContent += '</div>';
              }
              
              formattedContent += '</div>';
              this.feedAnalysis = formattedContent;
            } catch (jsonError) {
              // Not JSON or invalid JSON, just use the raw content
              this.feedAnalysis = content;
            }
          } else {
            this.feedAnalysis = 'No detailed analysis available for this feed.';
          }
        } catch (error) {
          console.error('Error processing feed analysis response:', error);
          this.feedAnalysis = 'Error processing feed analysis data.';
        }
        this.loadingAnalysis = false;
      },
      error: (err) => {
        console.error('Error getting feed analysis:', err);
        this.feedAnalysis = err?.error?.error || 'Failed to get feed analysis. Please try again later.';
        this.loadingAnalysis = false;
      }
    });
  }

  showDetails(index: number, event: Event) {
    event.preventDefault();

    // If clicking on the currently selected item, toggle it off
    if (this.selectedIndex === index) {
      this.selectedIndex = null;
      this.openrouterResponse = null;
      this.feedAnalysis = null;
      this.loadingAnalysis = false;
      return;
    }

    // Select the new item
    this.selectedIndex = index;
    this.openrouterResponse = null;
    this.feedAnalysis = null;

    // Get the selected item
    const item = this.feedItems[this.selectedIndex];

    // Prepare to show loading status for this specific item
    this.openrouterResponse = "Loading AI analysis...";
    
    // Also get additional feed analysis for this specific item
    this.getFeedAnalysisForItem(item);

    // Call openrouter-chat endpoint with the feed item content
    this.http
      .post<any>('/api/openrouter-chat', {
        messages: [
          {
            role: 'system',
            content:
              'You are a helpful assistant that summarizes and analyzes police news articles. ' +
              'Your task is to analyze the content and extract structured information including: ' +
              '1. A concise summary of what happened ' +
              '2. The exact location details (town, street, zip code if available) ' +
              '3. When the incident occurred ' +
              '4. Key people involved ' +
              'If any information is not available in the text, use null for that field.',
          },
          {
            role: 'user',
            content: `Please analyze this police report and extract structured data:\nTitle: ${item.title}\n\nContent: ${item.description}`
          },
        ],
        provider: {
          "only": ["Cerebras"]
        },
        model: 'meta-llama/llama-3.3-70b-instruct',
      })
      .subscribe({
        next: (res) => {
          try {
            if (res.structuredData) {
              // We have structured data with location
              const data = res.structuredData;

              // Format the response nicely
              let formattedResponse = `<h4>${data.summary || 'No summary available'}</h4>`;

              // Add location information if available
              if (data.location && typeof data.location === 'object') {
                formattedResponse += '<div class="location-info">';
                formattedResponse += '<h5>📍 Location:</h5>';
                if (data.location.town) {
                  formattedResponse += `<p>Town/City: <strong>${data.location.town}</strong></p>`;
                }
                if (data.location.street) {
                  formattedResponse += `<p>Street: <strong>${data.location.street}</strong></p>`;
                }
                if (data.location.zipCode) {
                  formattedResponse += `<p>Zip Code: <strong>${data.location.zipCode}</strong></p>`;
                }
                
                // Show coordinates if available
                if (data.location.coordinates && 
                    typeof data.location.coordinates === 'object' &&
                    data.location.coordinates.latitude != null && 
                    data.location.coordinates.longitude != null) {
                  formattedResponse += `<p>Coordinates: <strong>${data.location.coordinates.latitude}, ${data.location.coordinates.longitude}</strong></p>`;
                  
                  // Add a link to open the location in Google Maps
                  const mapUrl = `https://www.google.com/maps?q=${data.location.coordinates.latitude},${data.location.coordinates.longitude}`;
                  formattedResponse += `<p><a href="${mapUrl}" target="_blank" class="map-link">Open in Maps</a></p>`;
                }
                
                formattedResponse += '</div>';
              }

              // Add incident details
              if (data.incident) {
                formattedResponse += `<h5>Incident:</h5><p>${data.incident}</p>`;
              }

              // Add date information
              if (data.date) {
                formattedResponse += `<h5>📅 Date/Time:</h5><p>${data.date}</p>`;
              }

              // Add key persons if available
              if (data.key_persons && Array.isArray(data.key_persons) && data.key_persons.length > 0) {
                formattedResponse += '<h5>👤 People Involved:</h5><ul>';
                data.key_persons.forEach((person: string) => {
                  formattedResponse += `<li>${person}</li>`;
                });
                formattedResponse += '</ul>';
              }

              this.openrouterResponse = formattedResponse;
            } else {
              // Fallback to traditional format
              this.openrouterResponse = res.choices?.[0]?.message?.content || 'No analysis available.';
            }
          } catch (error) {
            console.error('Error formatting AI response:', error);
            this.openrouterResponse = 'Error formatting AI analysis. Raw data may not match expected format.';
          }
        },
        error: (err) => {
          console.error('Error getting AI analysis:', err);
          this.openrouterResponse =
            err?.error?.error || 'Failed to get AI analysis. Please try again later.';
        }
      });
  }
  /**
   * Gets feed analysis for a specific feed item
   * @param item The feed item to analyze
   */
  getFeedAnalysisForItem(item: any) {
    this.loadingAnalysis = true;
    this.feedAnalysis = null;
    
    // Use the item title and description for analysis
    const feedDescription = `${item.title} - ${item.description}`;
    
    this.http.post<any>('/api/analyze-rss-feed', { feedDescription }).subscribe({
      next: (response) => {
        // Extract the analysis information from the response
        try {
          if (response?.choices && response.choices[0]?.message?.content) {
            let content = response.choices[0].message.content;
            
            // Check if the content is a JSON string and try to format it
            try {
              // If content is JSON, parse and format it
              const jsonData = JSON.parse(content);
              
              // Format the feed analysis info into HTML
              let formattedContent = '<div class="feed-analysis-content">';
              
              // Add summary if available
              if (jsonData.summary) {
                formattedContent += `<div class="analysis-summary">${jsonData.summary}</div>`;
              } else if (jsonData.feedAnalysis?.summary) {
                formattedContent += `<div class="analysis-summary">${jsonData.feedAnalysis.summary}</div>`;
              }
              
              // Add feed details
              if (jsonData.feedAnalysis) {
                const feedInfo = jsonData.feedAnalysis;
                
                formattedContent += '<div class="analysis-details">';
                formattedContent += '<h5>Content Analysis:</h5>';
                formattedContent += '<ul>';
                
                if (feedInfo.contentType) {
                  formattedContent += `<li><strong>Content Type:</strong> ${feedInfo.contentType}</li>`;
                }
                
                if (feedInfo.languageDetected) {
                  formattedContent += `<li><strong>Language:</strong> ${feedInfo.languageDetected}</li>`;
                }
                
                if (feedInfo.domain && feedInfo.domain !== "unknown") {
                  formattedContent += `<li><strong>Source:</strong> ${feedInfo.domain}</li>`;
                }
                
                if (feedInfo.potentialLocations && feedInfo.potentialLocations.length > 0 && 
                    feedInfo.potentialLocations[0] !== "Unknown") {
                  formattedContent += `<li><strong>Mentioned Locations:</strong> ${feedInfo.potentialLocations.join(', ')}</li>`;
                }
                
                if (feedInfo.topKeywords && feedInfo.topKeywords.length > 0) {
                  formattedContent += `<li><strong>Key Topics:</strong> ${feedInfo.topKeywords.join(', ')}</li>`;
                }
                
                formattedContent += '</ul>';
                formattedContent += '</div>';
              }
              
              formattedContent += '</div>';
              this.feedAnalysis = formattedContent;
            } catch (jsonError) {
              // Not JSON or invalid JSON, just use the raw content
              this.feedAnalysis = content;
            }
          } else {
            this.feedAnalysis = 'No detailed analysis available for this item.';
          }
        } catch (error) {
          console.error('Error processing feed analysis response:', error);
          this.feedAnalysis = 'Error processing feed analysis data.';
        }
        this.loadingAnalysis = false;
      },
      error: (err) => {
        console.error('Error getting feed analysis:', err);
        this.feedAnalysis = err?.error?.error || 'Failed to get feed analysis. Please try again later.';
        this.loadingAnalysis = false;
      }
    });
  }
}
