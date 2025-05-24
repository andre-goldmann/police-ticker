import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';

interface PoliceFeed {
  name: string;
  url: string;
  description: string;
}

@Component({
  selector: 'app-rss-feed',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './rss-feed.component.html',
  styleUrl: './rss-feed.component.scss',
})
export class RssFeedComponent implements OnInit {
  feedItems: any[] = [];
  loading = false;
  error: string | null = null;
  selectedIndex: number | null = null;
  openrouterResponse: any = null;

  policeFeeds: PoliceFeed[] = [];
  loadingFeeds = false;
  selectedFeed: PoliceFeed | null = null;
  feedAnalysis: any = null;
  loadingAnalysis = false;
  defaultFeed: PoliceFeed = {
    name: 'Polizei Sachsen',
    url: 'https://www.polizei.sachsen.de/de/presse_rss_pdl.xml',
    description: 'Official police feed from Saxony'  };

  constructor(private http: HttpClient) {}
    ngOnInit() {
    // Load the list of police feeds when component initializes
    this.loadPoliceFeeds();
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
  }  fetchFeed() {
    if (!this.selectedFeed) {
      this.error = 'Please select a feed first';
      return;
    }

    this.loading = true;
    this.error = null;
    this.feedItems = [];
    this.feedAnalysis = null; // Reset any previous feed analysis

    // All feeds are now treated as external URLs
    const endpoint = `/api/custom-rss?url=${encodeURIComponent(this.selectedFeed.url)}`;

    this.http.get<any[]>(endpoint).subscribe({
      next: (items) => {
        this.feedItems = items;
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.error?.error || 'Failed to load RSS feed.';
        this.loading = false;
      },
    });
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
  }  showDetails(index: number, event: Event) {
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
