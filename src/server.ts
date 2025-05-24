import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Cerebras from '@cerebras/cerebras_cloud_sdk';
import { OpenRouterClient } from './openrouter-client';
require('dotenv').config();

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();


const cerebras = new Cerebras({
  apiKey:  process.env['CEREBRAS_API_KEY'], // This is the default and can be omitted
});

const openrouter = new OpenRouterClient();

/**
 * Example Express Rest API endpoints can be defined here.
 * Uncomment and define endpoints as necessary.
 *
 * Example:
 * ```ts
 * app.get('/api/**', (req, res) => {
 *   // Handle API request
 * });
 * ```
 */


/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use('/**', (req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Cerebral chat endpoint
 */
app.post('/api/cerebral-chat', express.json(), async (req, res) => {
  try {
    const { messages, model, ...options } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Missing or invalid messages array' });
    }
    // model is required by Cerebras API
    if (!model) {
      return res.status(400).json({ error: 'Missing model' });
    }
    console.log('Cerebral chat request:', {
      messages, // Array of message objects
      model, // Model name (e.g., 'llama3.1-8b')
      options, // Additional options for the chat completion
    });
    // Call Cerebras chat completions API
    const chatResponse = await cerebras.chat.completions.create({ messages, model, ...options });
    return res.json(chatResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cerebras chat error';
    return res.status(500).json({ error: message });
  }
});

/**
 * OpenRouter chat endpoint with structured output
 */
app.post('/api/openrouter-chat', express.json(), async (req, res) => {
  try {
    const { messages, model } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Missing or invalid messages array' });
    }
    if (!model) {
      return res.status(400).json({ error: 'Missing model' });
    }
    console.log('OpenRouter structured chat request:', { messages, model });

    // Use structured output instead of regular completion
    const structuredResponse = await openrouter.structuredOutput(messages, model);
    return res.json(structuredResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OpenRouter structured chat error';
    return res.status(500).json({ error: message });
  }
});


/**
 * Endpoint to get a list of German police RSS feeds
 */
app.get('/api/german-police-feeds', async (req, res) => {
  try {
    console.log('Requesting list of German police RSS feeds');
    const feeds = await openrouter.getGermanPoliceRssFeeds();
    console.log(`Found ${feeds.length} German police RSS feeds`);
    res.json(feeds);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get German police RSS feeds';
    console.error('Error in /api/german-police-feeds:', message);
    res.status(500).json({ error: message });
  }
});

/**
 * Endpoint for custom RSS feed URLs
 */
app.get('/api/custom-rss', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid URL parameter' });
    }

    console.log(`Fetching custom RSS feed: ${url}`);

    // Validate URL format
    try {
      new URL(url);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    // Read and parse the RSS feed
    const items = await openrouter.readRssFeed(url);
    return res.json(items);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Custom RSS feed error';
    return res.status(500).json({ error: message });
  }
});

/**
 * Endpoint to get additional information about an RSS feed using AI
 */
app.post('/api/analyze-rss-feed', express.json(), async (req, res) => {
  try {
    const { feedDescription } = req.body;
    
    if (!feedDescription || typeof feedDescription !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid feed description' });
    }

    console.log(`Analyzing RSS feed with description: "${feedDescription.substring(0, 50)}..."`);

    // Call the searchRssFeedsWithAI method
    const feedAnalysis = await openrouter.searchRssFeedsWithAI(feedDescription);
    return res.json(feedAnalysis);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'RSS feed analysis error';
    console.error('Error in /api/analyze-rss-feed:', message);
    return res.status(500).json({ error: message });
  }
});


/**
 * Start the server if this module is the main entry point.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url)) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
