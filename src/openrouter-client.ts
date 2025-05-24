import { parseStringPromise } from 'xml2js';
import * as FlexSearch from 'flexsearch';

export interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export class OpenRouterClient {
  private apiKey: string;
  private baseUrl = "https://openrouter.ai/api/v1";

  constructor() {
    this.apiKey = process.env['OPENROUTER_API_KEY'] || "";

    if (!this.apiKey) {
      console.warn("OpenRouter API key not found. Set OPENROUTER_API_KEY environment variable.");
    }
  }

  async generateCompletion(
    messages: Array<{ role: string; content: string }>,
    model = "qwen/qwen-2.5-72b-instruct"
  ): Promise<OpenRouterResponse> {
    if (!this.apiKey) {
      throw new Error("OpenRouter API key not configured. Please set your API key in the settings panel.");
    }

    try {
      console.log(`Making request to OpenRouter with model: ${model}`);

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          //"HTTP-Referer": process.env.YOUR_SITE_URL || "http://localhost:4200",
          "HTTP-Referer": "http://localhost:4200",
          "X-Title": "PolicyAI Corporate Advisor",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.3,
          max_tokens: 1000,
          top_p: 0.9,
        }),
      });

      console.log(`OpenRouter response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`OpenRouter API error response: ${errorText}`);

        if (response.status === 401) {
          throw new Error("Invalid API key. Please check your OpenRouter API key and try again.");
        } else if (response.status === 402) {
          throw new Error("Insufficient credits in your OpenRouter account. Please add credits and try again.");
        } else if (response.status === 429) {
          throw new Error("Rate limit exceeded. Please wait a moment and try again.");
        } else {
          throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
        }
      }

      const jsonResponse = await response.json();
      console.log("OpenRouter response received successfully");
      return jsonResponse;
    } catch (error) {
      console.error("OpenRouter API error:", error);

      if (error instanceof Error && error.message.includes("Unexpected token")) {
        throw new Error("Received invalid response from OpenRouter API. This usually indicates an authentication issue. Please verify your API key.");
      }

      throw new Error(`Failed to generate completion: ${error instanceof Error ? error.message : String(error)}`);
    }
  }


  async structuredOutput(
    messages: Array<{ role: string; content: string }>,
    model = "meta-llama/llama-3.3-70b-instruct"
  ) {
    if (!this.apiKey) {
      throw new Error("OpenRouter API key not configured. Please set your API key in the settings panel.");
    }

    // Define the JSON schema for the expected output
    const newsAnalysisSchema = {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "A concise summary of the news article"
        },        location: {
          type: "object",
          properties: {
            town: {
              type: "string",
              description: "The town/city where the incident occurred"
            },
            street: {
              type: "string",
              description: "The street name where the incident occurred, if mentioned"
            },
            zipCode: {
              type: "string",
              description: "The postal/zip code of the location, if mentioned"
            },
            coordinates: {
              type: "object",
              properties: {
                latitude: {
                  type: "number",
                  description: "The latitude coordinate of the incident location"
                },
                longitude: {
                  type: "number",
                  description: "The longitude coordinate of the incident location"
                }
              },
              description: "Geographic coordinates of the incident location if it can be determined"
            }
          },
          required: ["town"],
        },
        incident: {
          type: "string",
          description: "Description of what happened"
        },
        date: {
          type: "string",
          description: "When the incident occurred (date and time if available)"
        },
        key_persons: {
          type: "array",
          items: {
            type: "string",
            description: "Names or descriptions of key people involved (e.g., 'male suspect aged 25')"
          },
        }
      },
      required: ["summary", "location", "incident"],
    };

    try {
      //console.info(messages);
      console.log(`Making structured request to OpenRouter with model: ${model}`);

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:4200",
          "X-Title": "Police Ticker App",
        },
        body: JSON.stringify({
          model,
          provider: {
            "only": ["Cerebras"]
          },
          messages: [
            ...messages,            {
              role: "system",
              content: "Extract key information from the news article, especially location details including geographic coordinates (latitude and longitude) when possible. For German locations, try to determine the coordinates based on the mentioned town, street, and other location details. If any information is not available, use null for that field."
            }
          ],
          temperature: 0.2,
          max_tokens: 1000,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "newsAnalysisSchema",
              strict: true,
              schema: newsAnalysisSchema
            }
          }
        }),
      });

      console.log(`OpenRouter structured response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`OpenRouter API error response: ${errorText}`);

        if (response.status === 401) {
          throw new Error("Invalid API key. Please check your OpenRouter API key and try again.");
        } else if (response.status === 402) {
          throw new Error("Insufficient credits in your OpenRouter account. Please add credits and try again.");
        } else if (response.status === 429) {
          throw new Error("Rate limit exceeded. Please wait a moment and try again.");
        } else {
          throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
        }
      }

      const result = await response.json();
      console.log("OpenRouter structured response received successfully");

      // Parse the JSON content from the response if needed
      let structuredData;
      try {
        // Some models return parsed JSON already
        if (typeof result.choices[0].message.content === 'object') {
          structuredData = result.choices[0].message.content;
        } else {
          // Others return it as a string that needs parsing
          structuredData = JSON.parse(result.choices[0].message.content);
        }
      } catch (parseError) {
        console.error("Error parsing structured output:", parseError);
        throw new Error("Failed to parse structured output from OpenRouter");
      }

      return {
        ...result,
        structuredData
      };
    } catch (error) {
      console.error("OpenRouter structured output error:", error);
      throw new Error(`Failed to generate structured output: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Sends a chat completion request with tools support to OpenRouter API
   * @param messages Array of message objects
   * @param tools Array of tool definitions
   * @param model The model to use for the request
   * @param parallelToolCalls Whether to allow parallel tool calls
   * @returns The API response with tool calls if applicable
   */
  async generateCompletionWithTools(
    messages: Array<{ role: string; content: string }>,
    tools: Array<any>,
    model = "meta-llama/llama-4-scout-17b-16e-instruct",
    parallelToolCalls = false
  ): Promise<any> {
    if (!this.apiKey) {
      throw new Error("OpenRouter API key not configured. Please set your API key in the settings panel.");
    }

    try {
      console.log(`Making tools request to OpenRouter with model: ${model}`);
      console.log(`Tools provided: ${tools.length}, Parallel tool calls: ${parallelToolCalls}`);

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:4200",
          "X-Title": "Police Ticker App",
        },
        body: JSON.stringify({
          model,
          messages,
          tools,
          parallel_tool_calls: parallelToolCalls,
          temperature: 0.2,
          max_tokens: 1000,
        }),
      });

      console.log(`OpenRouter tools response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`OpenRouter API error response: ${errorText}`);

        if (response.status === 401) {
          throw new Error("Invalid API key. Please check your OpenRouter API key and try again.");
        } else if (response.status === 402) {
          throw new Error("Insufficient credits in your OpenRouter account. Please add credits and try again.");
        } else if (response.status === 429) {
          throw new Error("Rate limit exceeded. Please wait a moment and try again.");
        } else {
          throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
        }
      }

      const result = await response.json();
      console.log("OpenRouter tools response received successfully");

      // Check for tool calls in the response
      const responseMessage = result.choices[0]?.message;
      if (responseMessage?.tool_calls && responseMessage.tool_calls.length > 0) {
        console.log(`Received ${responseMessage.tool_calls.length} tool calls in response`);

        // You can process tool calls here if needed
        // For example, execute the tool function based on the name and arguments
      }

      return result;
    } catch (error) {
      console.error("OpenRouter tools error:", error);
      throw new Error(`Failed to generate completion with tools: ${error instanceof Error ? error.message : String(error)}`);
    }
  }  // Define a function to search for information about a specific RSS feed using FlexSearch

  async searchRssFeedInfo(feedDescription: string): Promise<string> {
    try {
      console.log(`Analyzing feed description with FlexSearch: ${feedDescription}`);

      // Initialize FlexSearch index
      const index = new FlexSearch.Document({
        document: {
          id: "id",
          index: ["title", "description", "content"]
        },
        tokenize: "forward",
        context: {
          resolution: 9,
          depth: 2,
          bidirectional: true
        },
        cache: true
      });

      // Add the feed description to the index for analysis
      index.add({
        id: "feed-description",
        title: "Feed Description",
        description: feedDescription,
        content: feedDescription
      });

      // Extract information directly from the description using FlexSearch

      // Step 1: Analyze the text for relevant information

      // Use RegExp to try to extract a URL if present in the description
      const urlMatch = feedDescription.match(/https?:\/\/[^\s]+/i);
      const possibleUrl = urlMatch ? urlMatch[0] : null;

      // Extract potential domain information
      let domain = "unknown";
      if (possibleUrl) {
        const domainMatch = possibleUrl.match(/https?:\/\/([^\/]+)/i);
        domain = domainMatch ? domainMatch[1] : "unknown-domain";
      } else {
        // Try to extract domain-like information from the description
        const domainWords = ['polizei', 'police', 'news', 'department', 'government', 'official'];
        for (const word of domainWords) {
          if (feedDescription.toLowerCase().includes(word)) {
            domain = word;
            break;
          }
        }
      }

      // Search for location information
      const locationSearchResults = index.search("police department region state city");
      const locationMatches = [];

      if (locationSearchResults.length > 0) {
        const result = locationSearchResults[0].result;
        for (const matchId of result) {
          const match = index.get(matchId);
          if (match && match['content']) {
      // Try to extract location information using simple patterns
            const locationPattern = /(?:in|of|from|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g;
            let locationMatch;
            const content = typeof match['content'] === 'string' ? match['content'] : '';
            while ((locationMatch = locationPattern.exec(content)) !== null) {
              locationMatches.push(locationMatch[1]);
            }
          }
        }
      }

      // Step 2: Analyze content type using FlexSearch
      // Search for common keywords to determine content type
      const policeTerms = ['polizei', 'police', 'emergency', 'crime', 'incident', 'arrest', 'law', 'enforcement'];
      const newsTerms = ['news', 'update', 'report', 'latest', 'breaking', 'nachrichten'];
      const governmentTerms = ['government', 'official', 'authority', 'ministry', 'regierung', 'behörde'];

      let policeScore = 0;
      let newsScore = 0;
      let governmentScore = 0;

      // Use FlexSearch to search for these terms and score them
      for (const term of policeTerms) {
        const results = index.search(term);
        policeScore += results.reduce((sum, resultSet) => sum + resultSet.result.length, 0);
      }

      for (const term of newsTerms) {
        const results = index.search(term);
        newsScore += results.reduce((sum, resultSet) => sum + resultSet.result.length, 0);
      }

      for (const term of governmentTerms) {
        const results = index.search(term);
        governmentScore += results.reduce((sum, resultSet) => sum + resultSet.result.length, 0);
      }

      // Determine content type based on highest score
      const maxScore = Math.max(policeScore, newsScore, governmentScore);
      let contentType = "General news and updates";

      if (maxScore > 0) {
        if (policeScore === maxScore) {
          contentType = "Police reports and safety information";
        } else if (governmentScore === maxScore) {
          contentType = "Government announcements and reports";
        } else if (newsScore === maxScore) {
          contentType = "News and media updates";
        }
      }

      // Determine language (very basic approach)
      let languageDetected = "Unknown";

      // Check for German-specific words in the description
      const germanWords = ['und', 'der', 'die', 'das', 'polizei', 'nach', 'wurde', 'uhr'];
      const englishWords = ['the', 'and', 'police', 'was', 'were', 'after', 'reported'];

      let germanCount = 0;
      let englishCount = 0;

      germanWords.forEach(word => {
        if (new RegExp(`\\b${word}\\b`).test(feedDescription.toLowerCase())) germanCount++;
      });

      englishWords.forEach(word => {
        if (new RegExp(`\\b${word}\\b`).test(feedDescription.toLowerCase())) englishCount++;
      });

      if (germanCount > englishCount) {
        languageDetected = "German";
      } else if (englishCount > germanCount) {
        languageDetected = "English";
      } else if (feedDescription.includes('.de') || domain.includes('.de')) {
        languageDetected = "German";
      } else {
        languageDetected = "Unknown (possibly English)";
      }
        // Extract possible topics using word frequency
      const commonWords = ['and', 'the', 'or', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from', 'a', 'an', 'official', 'feed', 'rss'];
      const wordFreq: Record<string, number> = {};
      const words = feedDescription.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 3 && !commonWords.includes(word));

      words.forEach(word => {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      });

      // Get top topics
      const topics = Object.entries(wordFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(entry => entry[0]);

      // Combine the information into a detailed summary
      const feedInfo = {
        description: feedDescription,
        possibleUrl: possibleUrl,
        domain: domain,
        contentType: contentType,
        languageDetected: languageDetected,
        potentialLocations: locationMatches.length > 0 ? [...new Set(locationMatches)] : ["Unknown"],
        topKeywords: topics,
        analysisMethod: "Description-based analysis using FlexSearch"
      };

      const combinedInfo = {
        feedAnalysis: feedInfo,
        summary: `This RSS feed appears to contain ${feedInfo.contentType} content in ${feedInfo.languageDetected}.` +
          ` It likely originates from ${feedInfo.domain}.` +
          (feedInfo.potentialLocations && feedInfo.potentialLocations[0] !== "Unknown" ?
              ` The feed may be related to the following locations: ${feedInfo.potentialLocations.join(', ')}.` : '') +
          (feedInfo.topKeywords && feedInfo.topKeywords.length > 0 ?
              ` Key topics include: ${feedInfo.topKeywords.join(', ')}.` : '')
      };

      // Format the results as a JSON string
      return JSON.stringify(combinedInfo, null, 2);
    } catch (error) {
      console.error("RSS feed description analysis error with FlexSearch:", error);
      return "Error: Failed to analyze the feed description using FlexSearch.";
    }
  }/**
   * Creates a tool that uses FlexSearch to index and analyze RSS feed content
   * @returns A tool definition for analyzing RSS feeds with FlexSearch
   */    getRssFeedSearchTool(): any {
    return {
      type: "function",
      function: {
        name: "search_rss_feed_info",
        description: "A tool that uses FlexSearch to analyze the content of an RSS feed description, extracting topics, determining language, and providing detailed insights about the feed's content.",
        parameters: {
          type: "object",
          properties: {
            description: {
              type: "string",
              description: "The description text of the RSS feed to analyze using FlexSearch"
            }
          },
          required: ["description"]
        }
      }
    };
  }

  /**
   * Reads and parses an RSS feed from the given URL and returns an array of items.
   * @param url The RSS feed URL.
   * @returns An array of RSS feed items (title, link, pubDate, description, etc).
   */
  async readRssFeed(url: string): Promise<Array<{ title: string; link: string; pubDate: string; description: string }>> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to fetch RSS feed (${response.status}): ${await response.text()}`);
      }

      const xml = await response.text();

      // Check if the response looks like XML
      if (!xml.trim().startsWith('<')) {
        throw new Error('Response is not in XML format');
      }

      const parsed = await parseStringPromise(xml, {
        explicitArray: false,
        trim: true,
        normalizeTags: true,
        normalize: true
      });

      // Handle different RSS formats
      let items;
      if (parsed.rss && parsed.rss.channel) {
        // Standard RSS
        items = parsed.rss.channel.item || [];
      } else if (parsed.feed && parsed.feed.entry) {
        // Atom format
        items = parsed.feed.entry || [];
      } else if (parsed.rdf && parsed.rdf.item) {
        // RDF format
        items = parsed.rdf.item || [];
      } else {
        console.error('Unrecognized feed format:', Object.keys(parsed));
        throw new Error('Unrecognized feed format');
      }

      // Ensure items is always an array
      const itemArray = Array.isArray(items) ? items : [items];

      // Map different formats to our consistent structure
      return itemArray.map(item => {
        // Handle Atom format differently
        if (parsed.feed && parsed.feed.entry) {
          return {
            title: item.title?._?.trim() || item.title || '',
            link: item.link?.href || item.link || '',
            pubDate: item.published || item.updated || '',
            description: item.summary || item.content || ''
          };
        }

        return {
          title: item.title || '',
          link: item.link || '',
          pubDate: item.pubdate || item.pubDate || item.date || '',
          description: item.description || item.summary || item.content || '',
        };
      });
    } catch (error) {
      console.error(`Error fetching/parsing RSS feed from ${url}:`, error);
      throw error;
    }
  }


  async getGermanPoliceRssFeeds(): Promise<Array<{ name: string; url: string; description: string }>> {
    //try {
      console.log('Requesting German police RSS feeds from OpenRouter');

      // Add backup feeds in case AI doesn't provide valid feeds
      const backupFeeds = [
        {
          name: "Polizei Brandenburg",
          url: "https://polizei.brandenburg.de/pressemeldungen/rss/region/57581",
          description: "Police department of Brandenburg state"
        },
        {
          name: "Polizei Berlin",
          url: "https://www.berlin.de/polizei/polizeimeldungen/index.php/rss",
          description: "Police department of Berlin"
        },
        {
          name: "Polizei Schleswig-Holstein",
          url:"https://www.schleswig-holstein.de/DE/landesregierung/ministerien-behoerden/POLIZEI/RSS_Funktionalitaet/RSS_Taeterfahndung/RSSNewsfeed_Taeterfahndung.xml?nn=7b019c0c-7697-4f3f-a7d2-751e887914f6",
          "description": "RSS feed for wanted persons from the Schleswig-Holstein police"

        }
      ];

      return backupFeeds;
  }  /**
   * A demo method that shows how to use the RSS feed information tool with OpenRouter
   * @param feedDescription The description of the RSS feed to analyze
   * @returns The AI response with the research results and summary
   */
  async searchRssFeedsWithAI(feedDescription: string): Promise<any> {
    // Define the RSS feed info tool for analysis
    const feedAnalysisTool = {
      type: "function",
      function: {
        name: "analyze_feed_description",
        description: "A tool that analyzes and provides insights about an RSS feed based on its description",
        parameters: {
          type: "object",
          properties: {
            description: {
              type: "string",
              description: "The description text of the RSS feed to analyze"
            }
          },
          required: ["description"]
        }
      }
    };

    // Set up the conversation with the description instead of URL
    const messages = [
      {
        role: "system",
        content: "You are a helpful assistant with access to a tool that can analyze RSS feed descriptions and provide insights. Use the analyze_feed_description tool to research and provide details about RSS feeds that users are interested in."
      },
      {
        role: "user",
        content: `I'd like to learn more about this RSS feed with the following description: "${feedDescription}"`
      }
    ];

    // Make the API request with the custom tool
    const response = await this.generateCompletionWithTools(
      messages,
      [feedAnalysisTool],
      "meta-llama/llama-4-scout-17b-16e-instruct",
      false // No parallel tool calls
    );

    // Process the response
    const responseMessage = response.choices[0]?.message;

    // If there are tool calls in the response, we need to execute them and send a follow-up request
    if (responseMessage?.tool_calls && responseMessage.tool_calls.length > 0) {
      console.log("Tool calls detected, processing...");

      // Create an array to store tool call results
      const toolCallResults = [];

      // Process each tool call
      for (const toolCall of responseMessage.tool_calls) {
        const { name, arguments: args } = toolCall.function;

        if (name === "analyze_feed_description") {
          try {
            // Parse the arguments JSON
            const parsedArgs = JSON.parse(args);
            const description = parsedArgs.description;

            // Call our feed description search function directly
            const result = await this.searchRssFeedInfo(description);

            // Store the result
            toolCallResults.push({
              tool_call_id: toolCall.id,
              role: "tool",
              name: "analyze_feed_description",
              content: result
            });

            console.log(`Analyzed RSS feed description successfully`);
          } catch (error) {
            console.error("Error processing feed description analysis:", error);
            toolCallResults.push({
              tool_call_id: toolCall.id,
              role: "tool",
              name: "analyze_feed_description",
              content: "Error: Failed to analyze the feed description"
            });
          }
        }
      }

      // If we have tool call results, send a follow-up request with the results
      if (toolCallResults.length > 0) {
        // Create a new messages array with the original messages and the tool call results
        const followUpMessages = [
          ...messages,
          responseMessage,
          ...toolCallResults
        ];

        // Send the follow-up request without tools (we've already executed them)
        return await this.generateCompletion(followUpMessages, "meta-llama/llama-4-scout-17b-16e-instruct");
      }
    }

    // If there are no tool calls, just return the response
    return response;
  }
}
