# RAG Documentation MCP Server (@shariqriazz/mcp-ragdocs)

An MCP server implementation that provides tools for retrieving and processing documentation through vector search, enabling AI assistants to augment their responses with relevant documentation context. This server supports multiple embedding providers (Ollama, OpenAI, Google Gemini) and uses Qdrant as the vector database.

## Quick Install Guide

1. Install the package globally:
   ```bash
   npm install -g @shariqriazz/mcp-ragdocs
   ```

2. Start Qdrant (using Docker):
   ```bash
   docker run -p 6333:6333 -p 6334:6334 qdrant/qdrant
   ```

3. Ensure Ollama is running with the default embedding model:
   ```bash
   ollama pull nomic-embed-text
   ```

4. Add to your configuration file:
   - For Cline: `%AppData%\Roaming\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`
   - For Roo-Code: `%AppData%\Roaming\Code\User\globalStorage\rooveterinaryinc.roo-cline\settings\cline_mcp_settings.json`
   - For Claude Desktop: `%AppData%\Claude\claude_desktop_config.json`

   ```json
   {
     "mcpServers": {
       "ragdocs": {
         "command": "node",
         "args": ["C:/Users/YOUR_USERNAME/AppData/Roaming/npm/node_modules/@shariqriazz/mcp-ragdocs/build/index.js"],
         "env": {
           "QDRANT_URL": "http://127.0.0.1:6333",
           "EMBEDDING_PROVIDER": "ollama",
           "OLLAMA_URL": "http://localhost:11434"
         }
       }
     }
   }
   ```

5. Verify installation:
   ```bash
   # Check Qdrant is running
   curl http://localhost:6333/collections
   
   # Check Ollama has the model
   ollama list | grep nomic-embed-text
   ```

## Features

- Vector-based documentation search and retrieval using Qdrant
- Support for multiple embedding providers:
    - Ollama (e.g., `nomic-embed-text`)
    - OpenAI (e.g., `text-embedding-3-small`, `text-embedding-ada-002`)
    - Google Gemini (e.g., `gemini-embedding-exp-03-07`)
- Configurable embedding models and vector sizes
- Semantic search capabilities
- Automated documentation processing via URL fetching (Playwright/Cheerio)
- Document processing queue management
- Real-time context augmentation for LLMs

## Tools

### add_documentation
Fetch, process, and index documentation from a given URL. The content is chunked, embedded using the configured provider, and stored in the vector database. Use this to add new documentation sources to the system.

**Inputs:**
- `url` (string): The complete URL of the documentation page to add (must include protocol, e.g., https://). The page must be publicly accessible.

### search_documentation
Search through stored documentation using natural language queries. Returns matching excerpts with context, ranked by relevance.

**Inputs:**
- `query` (string): The text to search for in the documentation. Can be a natural language query, specific terms, or code snippets.
- `limit` (number, optional): Maximum number of results to return (1-20, default: 5). Higher limits provide more comprehensive results but may take longer to process.

### list_sources
List all documentation sources currently stored in the system. Returns a comprehensive list of all indexed documentation including source URLs, titles, and last update times. Use this to understand what documentation is available for searching or to verify if specific sources have been indexed.

### extract_urls
Extract and analyze all URLs from a given web page. This tool crawls the specified webpage, identifies all hyperlinks, and optionally adds them to the processing queue.

**Inputs:**
- `url` (string): The complete URL of the webpage to analyze (must include protocol, e.g., https://). The page must be publicly accessible.
- `add_to_queue` (boolean, optional): If true, automatically add extracted URLs to the processing queue for later indexing. Use with caution on large sites to avoid excessive queuing.

### remove_documentation
Remove specific documentation sources from the system by their URLs. The removal is permanent and will affect future search results.

**Inputs:**
- `urls` (string[]): Array of URLs to remove from the database. Each URL must exactly match the URL used when the documentation was added.

### list_queue
List all URLs currently waiting in the documentation processing queue. Shows pending documentation sources that will be processed when run_queue is called. Use this to monitor queue status, verify URLs were added correctly, or check processing backlog.

### run_queue
Process and index all URLs currently in the documentation queue. Each URL is processed sequentially, with proper error handling and retry logic. Progress updates are provided as processing occurs. Long-running operations will process until the queue is empty or an unrecoverable error occurs.

### clear_queue
Remove all pending URLs from the documentation processing queue. Use this to reset the queue when you want to start fresh, remove unwanted URLs, or cancel pending processing. This operation is immediate and permanent - URLs will need to be re-added if you want to process them later.

## Usage

The RAG Documentation tool is designed for:

- Enhancing AI responses with relevant documentation
- Building documentation-aware AI assistants
- Creating context-aware tooling for developers
- Implementing semantic documentation search
- Augmenting existing knowledge bases

## Configuration

### Environment Variables

The server is configured using the following environment variables:

**Embedding Provider Configuration:**

- `EMBEDDING_PROVIDER`: (Required) Specifies the embedding provider to use.
    - `"ollama"` (Default)
    - `"openai"`
    - `"google"`
- `EMBEDDING_MODEL`: (Optional) Specifies the model name for the chosen provider. Defaults are handled by the provider (e.g., `nomic-embed-text` for Ollama, `text-embedding-3-small` for OpenAI, `embedding-001` for Google). Ensure the chosen model is compatible with the provider.
- `OLLAMA_URL`: (Optional) Base URL for the Ollama API (e.g., `http://localhost:11434`). Required if `EMBEDDING_PROVIDER="ollama"` and the server is not running on the default localhost address.
- `OPENAI_API_KEY`: (Optional) Your OpenAI API key. Required if `EMBEDDING_PROVIDER="openai"`.
- `OPENAI_BASE_URL`: (Optional) Custom base URL for OpenAI-compatible APIs. If set, overrides the default OpenAI API endpoint.
- `GEMINI_API_KEY`: (Optional) Your Google AI Studio (Gemini) API key. Required if `EMBEDDING_PROVIDER="google"`.

**Qdrant Configuration:**

- `QDRANT_URL`: (Optional) URL of your Qdrant vector database instance (e.g., `http://localhost:6333` or a cloud URL). Defaults to `http://127.0.0.1:6333`.
- `QDRANT_API_KEY`: (Optional) API key for authenticating with Qdrant Cloud. Not needed for local instances without authentication.

**Note:** The Qdrant collection `documentation` will be automatically created or validated on startup. If the vector size required by the chosen embedding model mismatches the existing collection, the server will attempt to delete and recreate the collection. **This will result in data loss for the existing collection.**

### Example Usage with Claude Desktop

Add this to your `claude_desktop_config.json` (adjust environment variables as needed):

```json
{
  "mcpServers": {
    "mcp-ragdocs": {
      "command": "npx",
      "args": [
        "-y",
        "@shariqriazz/mcp-ragdocs" // Updated package name
      ],
      "env": {
        "EMBEDDING_PROVIDER": "ollama", // Or "openai", "google"
        "EMBEDDING_MODEL": "nomic-embed-text", // Optional, adjust based on provider
        "OLLAMA_URL": "http://localhost:11434", // Optional, if not default
        "OPENAI_API_KEY": "YOUR_OPENAI_KEY", // Required if provider is openai
        "GEMINI_API_KEY": "YOUR_GEMINI_KEY", // Required if provider is google
        "QDRANT_URL": "http://localhost:6333" // Or your Qdrant instance URL
        // "QDRANT_API_KEY": "YOUR_QDRANT_CLOUD_KEY" // Optional, for Qdrant Cloud
      }
    }
  }
}
```
```json
{
  "mcpServers": {
    "mcp-ragdocs": {
      "command": "/Users/shariqriaz/.nvm/versions/node/v22.14.0/bin/node",
      "args": [
        "/Users/shariqriaz/projects/ragdocs/mcp-ragdocs/build/index.js"
      ],
      "env": {
        "EMBEDDING_PROVIDER": "ollama",
        "QDRANT_URL": "http://127.0.0.1:6333"
      },
      "alwaysAllow": [
        "add_documentation",
        "search_documentation",
        "list_sources",
        "extract_urls",
        "remove_documentation",
        "list_queue",
        "run_queue",
        "clear_queue"
      ]
    }
  }
}
```

## License

This MCP server is licensed under the MIT License. See the LICENSE file for details.

## Acknowledgments

This project merges features and ideas from forks of [qpd-v/mcp-ragdocs](https://github.com/qpd-v/mcp-ragdocs), including contributions and structures found in repositories by [hannesrudolph](https://github.com/hannesrudolph/mcp-ragdocs) and [abutbul](https://github.com/abutbul/mcp-ragdocs).