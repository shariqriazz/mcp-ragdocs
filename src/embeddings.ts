import ollama from 'ollama';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai'; // Added - Using named import as per docs
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

export interface EmbeddingProvider {
  generateEmbeddings(text: string): Promise<number[]>;
  getVectorSize(): number;
}

export class OllamaProvider implements EmbeddingProvider {
  // Removed client instance variable
  private model: string;

  // Removed baseURL parameter
  constructor(model: string = 'nomic-embed-text') {
    this.model = model;
  }

  async generateEmbeddings(text: string): Promise<number[]> {
    try {
      console.error(`Generating Ollama embeddings (${this.model}) for text:`, text.substring(0, 50) + '...');
      // Use the imported ollama object directly
      const response = await ollama.embeddings({
        model: this.model,
        prompt: text
      });
      console.error('Successfully generated Ollama embeddings with size:', response.embedding.length);
      return response.embedding;
    } catch (error) {
      console.error('Ollama embedding error:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to generate embeddings with Ollama: ${error}`
      );
    }
  }

  getVectorSize(): number {
    // Vector size depends on the model. Nomic-embed-text is 768.
    // Add logic here if supporting other Ollama models with different sizes.
    if (this.model.includes('nomic-embed-text')) {
        return 768;
    }
    // Default or throw error if size is unknown for the model
    console.warn(`Unknown vector size for Ollama model ${this.model}, defaulting to 768. Please verify.`);
    return 768;
  }
}

export class OpenAIProvider implements EmbeddingProvider {
  private client: OpenAI;
  private model: string;

  // Added optional baseURL
  constructor(apiKey: string, model: string = 'text-embedding-3-small', baseURL?: string) {
    this.client = new OpenAI({ apiKey, baseURL }); // Pass baseURL
    this.model = model;
  }

  async generateEmbeddings(text: string): Promise<number[]> {
    try {
      console.error(`Generating OpenAI embeddings (${this.model}) for text:`, text.substring(0, 50) + '...');
      const response = await this.client.embeddings.create({
        model: this.model,
        input: text,
      });
      const embedding = response.data[0].embedding;
      console.error('Successfully generated OpenAI embeddings with size:', embedding.length);
      return embedding;
    } catch (error) {
      console.error('OpenAI embedding error:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to generate embeddings with OpenAI: ${error}`
      );
    }
  }

  getVectorSize(): number {
    // Vector size depends on the model.
    // text-embedding-3-small: 1536
    // text-embedding-3-large: 3072
    // text-embedding-ada-002: 1536
    if (this.model.includes('text-embedding-3-small') || this.model.includes('ada-002')) {
        return 1536;
    }
    if (this.model.includes('text-embedding-3-large')) {
        return 3072;
    }
    // Default or throw error if size is unknown
    console.warn(`Unknown vector size for OpenAI model ${this.model}, defaulting to 1536. Please verify.`);
    return 1536;
  }
}

// Added GoogleGenAIProvider
export class GoogleGenAIProvider implements EmbeddingProvider {
  private client: GoogleGenAI; // Use named import for type
  private model: string;

  constructor(apiKey: string, model: string = 'embedding-001') { // Defaulting to stable embedding-001
    this.client = new GoogleGenAI({ apiKey }); // Pass apiKey in options object
    this.model = model;
  }

  async generateEmbeddings(text: string): Promise<number[]> {
    try {
      console.error(`Generating Google Gemini embeddings (${this.model}) for text:`, text.substring(0, 50) + '...');
      // Use models.embedContent as per documentation snippet
      const response = await this.client.models.embedContent({
        model: this.model,
        contents: text, // Correct parameter name is 'contents'
      });
      // Check if embeddings exist and get values from the first embedding
      if (!response.embeddings || response.embeddings.length === 0) {
        throw new Error('Google Gemini API did not return embeddings.');
      }
      const embedding = response.embeddings[0].values;
      if (!embedding) {
         throw new Error('Google Gemini embedding object did not contain values.');
      }
      console.error('Successfully generated Google Gemini embeddings with size:', embedding.length);
      return embedding;
    } catch (error) {
      console.error('Google Gemini embedding error:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to generate embeddings with Google Gemini: ${error}`
      );
    }
  }

  getVectorSize(): number {
    // embedding-001 produces 768-dimensional vectors
    // Check documentation for other models
    if (this.model.includes('embedding-001')) {
        return 768;
    }
    console.warn(`Unknown vector size for Google Gemini model ${this.model}, defaulting to 768. Please verify.`);
    return 768;
  }
}

export class EmbeddingService {
  private provider: EmbeddingProvider;

  constructor(provider: EmbeddingProvider) {
    this.provider = provider;
  }

  async generateEmbeddings(text: string): Promise<number[]> {
    return this.provider.generateEmbeddings(text);
  }

  getVectorSize(): number {
    return this.provider.getVectorSize();
  }

  // Updated factory method
  static createFromConfig(config: {
    provider: 'ollama' | 'openai' | 'google'; // Added 'google'
    // Removed ollamaBaseUrl as it's not used by the provider anymore
    openaiApiKey?: string; // Renamed for clarity
    openaiBaseUrl?: string; // Added
    geminiApiKey?: string; // Added
    model?: string;
  }): EmbeddingService {
    switch (config.provider) {
      case 'ollama':
        // Removed ollamaBaseUrl from constructor call
        return new EmbeddingService(new OllamaProvider(config.model));
      case 'openai':
        if (!config.openaiApiKey) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'OpenAI API key (OPENAI_API_KEY) is required for openai provider'
          );
        }
        // Pass optional openaiApiKey, model, openaiBaseUrl
        return new EmbeddingService(new OpenAIProvider(config.openaiApiKey, config.model, config.openaiBaseUrl));
      case 'google': // Added case for google
        if (!config.geminiApiKey) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Google Gemini API key (GEMINI_API_KEY) is required for google provider'
          );
        }
        return new EmbeddingService(new GoogleGenAIProvider(config.geminiApiKey, config.model));
      default:
        // Ensure exhaustive check with 'never'
        const exhaustiveCheck: never = config.provider;
        throw new McpError(
          ErrorCode.InvalidParams,
          `Unknown embedding provider specified: ${exhaustiveCheck}`
        );
    }
  }
}