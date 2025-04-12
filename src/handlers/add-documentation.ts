import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { BaseHandler } from './base-handler.js';
import { DocumentChunk, McpToolResponse } from '../types.js';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

const COLLECTION_NAME = 'documentation';

export class AddDocumentationHandler extends BaseHandler {
  async handle(args: any): Promise<McpToolResponse> {
    if (!args.url || typeof args.url !== 'string') {
      throw new McpError(ErrorCode.InvalidParams, 'URL is required');
    }

    try {
      const chunks = await this.fetchAndProcessUrl(args.url);
      
      // Batch process chunks for better performance
      const batchSize = 100;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const points = await Promise.all(
          batch.map(async (chunk) => {
            const embedding = await this.apiClient.getEmbeddings(chunk.text);
            return {
              id: this.generatePointId(),
              vector: embedding,
              payload: {
                ...chunk,
                _type: 'DocumentChunk' as const,
              } as Record<string, unknown>,
            };
          })
        );

        try {
          await this.apiClient.qdrantClient.upsert(COLLECTION_NAME, {
            wait: true,
            points,
          });
        } catch (error) {
          if (error instanceof Error) {
            if (error.message.includes('unauthorized')) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                'Failed to authenticate with Qdrant cloud while adding documents'
              );
            } else if (error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT')) {
              throw new McpError(
                ErrorCode.InternalError,
                'Connection to Qdrant cloud failed while adding documents'
              );
            }
          }
          throw error;
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: `Successfully added documentation from ${args.url} (${chunks.length} chunks processed in ${Math.ceil(chunks.length / batchSize)} batches)`,
          },
        ],
      };
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      return {
        content: [
          {
            type: 'text',
            text: `Failed to add documentation: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async fetchAndProcessUrl(source: string): Promise<DocumentChunk[]> {
    let title = source;
    let mainContent = '';
    const isUrl = source.startsWith('http://') || source.startsWith('https://');

    try {

      if (isUrl) {
        // --- Handle URL ---
        console.error(`Processing source as URL: ${source}`);
        const urlObject = new URL(source); // Safe to call again now
        const isPlainText = urlObject.pathname.endsWith('.txt');

        if (isPlainText) {
          console.error(`Fetching plain text URL: ${source}`);
          const response = await fetch(source);
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          const disposition = response.headers.get('content-disposition');
          if (disposition && disposition.includes('filename=')) {
              const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
              if (filenameMatch && filenameMatch[1]) { title = filenameMatch[1]; }
          } else {
               title = urlObject.pathname.split('/').pop() || source;
          }
          mainContent = await response.text();
          console.error(`Successfully fetched plain text content (${mainContent.length} chars). Title: ${title}`);
        } else {
          console.error(`Fetching non-plain text URL with Playwright: ${source}`);
          await this.apiClient.initBrowser();
          const page = await this.apiClient.browser.newPage();
          try {
            await page.goto(source, { waitUntil: 'networkidle', timeout: 60000 });
            const content = await page.content();
            const $ = cheerio.load(content);
            $('script, style, noscript').remove();
            title = $('title').text() || source;
            mainContent = $('main, article, .content, .documentation, body').first().text();
            console.error(`Successfully fetched HTML content (${mainContent.length} chars). Title: ${title}`);
          } finally {
            await page.close();
          }
        }
      } else {
        // --- Handle Local File Path ---
        console.error(`Processing source as local file path: ${source}`);
        const resolvedPath = path.resolve(source); // Resolve relative to CWD
        console.error(`Resolved local file path to: ${resolvedPath}`);
    // Security check: Ensure the resolved path is within the workspace
    const workspaceRoot = path.resolve('.'); // Assuming server runs from project root
    const relativePath = path.relative(workspaceRoot, resolvedPath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        throw new McpError(ErrorCode.InvalidParams, `Access denied: Path is outside the allowed workspace directory.`);
    }
        try {
            await fs.access(resolvedPath, fs.constants.R_OK);
            mainContent = await fs.readFile(resolvedPath, 'utf-8');
            title = path.basename(resolvedPath);
            console.error(`Successfully read local file content (${mainContent.length} chars). Title: ${title}`);
        } catch (fileError: any) {
            if (fileError.code === 'ENOENT') { throw new McpError(ErrorCode.InvalidParams, `Local file not found: ${resolvedPath}`); }
            else if (fileError.code === 'EACCES') { throw new McpError(ErrorCode.InvalidParams, `Permission denied reading local file: ${resolvedPath}`); }
            else { throw new McpError(ErrorCode.InternalError, `Error reading local file ${resolvedPath}: ${fileError.message}`); }
        }
      }

      // --- Common Processing ---
      const chunks = this.chunkText(mainContent, 1000);
      console.error(`Split content into ${chunks.length} chunks.`);

      return chunks.map(chunk => ({
        text: chunk,
        url: source, // Use original source string
        title,
        timestamp: new Date().toISOString(),
      }));

    } catch (error) {
      // Catch specific McpErrors and rethrow, wrap others
      if (error instanceof McpError) {
          console.error(`MCP Error processing source ${source}:`, error.message);
          throw error;
      }
      console.error(`Generic error processing source ${source}:`, error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to fetch or process source ${source}: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  private chunkText(text: string, maxChunkSize: number): string[] {
    const words = text.split(/\s+/);
    const chunks: string[] = [];
    let currentChunk: string[] = [];
    
    for (const word of words) {
      currentChunk.push(word);
      const currentLength = currentChunk.join(' ').length;
      
      if (currentLength >= maxChunkSize) {
        chunks.push(currentChunk.join(' '));
        currentChunk = [];
      }
    }
    
    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join(' '));
    }
    
    return chunks;
  }

  private generatePointId(): string {
    return crypto.randomBytes(16).toString('hex');
  }
}