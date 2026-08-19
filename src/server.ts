import { AngularAppEngine, createRequestHandler } from '@angular/ssr'
import { getContext } from '@netlify/angular-runtime/app-engine.js'
import { OpenRouterClient } from './openrouter-client';
require('dotenv').config();

const angularAppEngine = new AngularAppEngine();

const openrouter = new OpenRouterClient();

export async function netlifyAppEngineHandler(request: Request): Promise<Response> {
  const context = getContext();
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Chat endpoint (formerly Cerebral chat, now using OpenRouter)
  if (pathname === '/api/cerebral-chat' && request.method === 'POST') {
    try {
      const body = await request.json();
      const { messages, model, ...options } = body;
      
      if (!messages || !Array.isArray(messages)) {
        return Response.json({ error: 'Missing or invalid messages array' }, { status: 400 });
      }
      if (!model) {
        return Response.json({ error: 'Missing model' }, { status: 400 });
      }
      
      console.log('Chat request:', { messages, model, options });
      
      // Use OpenRouter instead of Cerebras
      const chatResponse = await openrouter.generateCompletion(messages, model);
      return Response.json(chatResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Chat error';
      return Response.json({ error: message }, { status: 500 });
    }
  }

  // OpenRouter chat endpoint with structured output
  if (pathname === '/api/openrouter-chat' && request.method === 'POST') {
    try {
      const body = await request.json();
      const { messages, model } = body;
      
      if (!messages || !Array.isArray(messages)) {
        return Response.json({ error: 'Missing or invalid messages array' }, { status: 400 });
      }
      if (!model) {
        return Response.json({ error: 'Missing model' }, { status: 400 });
      }
      
      console.log('OpenRouter structured chat request:', { messages, model });
      
      const structuredResponse = await openrouter.structuredOutput(messages, model);
      return Response.json(structuredResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'OpenRouter structured chat error';
      return Response.json({ error: message }, { status: 500 });
    }
  }

  // Endpoint to get a list of German police RSS feeds
  if (pathname === '/api/german-police-feeds' && request.method === 'GET') {
    try {
      console.log('Requesting list of German police RSS feeds');
      const feeds = await openrouter.getGermanPoliceRssFeeds();
      console.log(`Found ${feeds.length} German police RSS feeds`);
      return Response.json(feeds);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get German police RSS feeds';
      console.error('Error in /api/german-police-feeds:', message);
      return Response.json({ error: message }, { status: 500 });
    }
  }

  // Endpoint for custom RSS feed URLs
  if (pathname === '/api/custom-rss' && request.method === 'GET') {
    try {
      const urlParam = url.searchParams.get('url');

      if (!urlParam || typeof urlParam !== 'string') {
        return Response.json({ error: 'Missing or invalid URL parameter' }, { status: 400 });
      }

      console.log(`Fetching custom RSS feed: ${urlParam}`);

      // Validate URL format
      try {
        new URL(urlParam);
      } catch (e) {
        return Response.json({ error: 'Invalid URL format' }, { status: 400 });
      }

      // Read and parse the RSS feed
      const items = await openrouter.readRssFeed(urlParam);
      return Response.json(items);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Custom RSS feed error';
      return Response.json({ error: message }, { status: 500 });
    }
  }

  // Endpoint to get additional information about an RSS feed using AI
  if (pathname === '/api/analyze-rss-feed' && request.method === 'POST') {
    try {
      const body = await request.json();
      const { feedDescription } = body;
      
      if (!feedDescription || typeof feedDescription !== 'string') {
        return Response.json({ error: 'Missing or invalid feed description' }, { status: 400 });
      }

      console.log(`Analyzing RSS feed with description: "${feedDescription.substring(0, 50)}..."`);

      // Call the searchRssFeedsWithAI method
      const feedAnalysis = await openrouter.searchRssFeedsWithAI(feedDescription);
      return Response.json(feedAnalysis);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'RSS feed analysis error';
      console.error('Error in /api/analyze-rss-feed:', message);
      return Response.json({ error: message }, { status: 500 });
    }
  }

  // Handle all other requests by rendering the Angular application
  const result = await angularAppEngine.handle(request, context);
  return result || new Response('Not found', { status: 404 });
}

/**
 * The request handler used by the Angular CLI (dev-server and during build).
 */
export const reqHandler = createRequestHandler(netlifyAppEngineHandler);
