# Contextual Retrieval Implementation

A Next.js implementation of the [Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval) approach introduced by Anthropic. This implementation enhances document retrieval by adding AI-generated context to each document chunk before embedding, following Anthropic's research on improving RAG (Retrieval-Augmented Generation) systems.

## About Contextual Retrieval

Based on [Anthropic's Contextual Retrieval research](https://www.anthropic.com/news/contextual-retrieval), this implementation addresses a key limitation in traditional RAG systems where context is lost during document chunking. As described in their article, Contextual Retrieval solves this by "prepending chunk-specific explanatory context to each chunk before embedding." The approach:

- Preprocesses document chunks by adding specific contextual information
- Prepends AI-generated contextual information to each chunk before embedding
- Enhances chunks with additional context for better retrieval, as demonstrated in their example:

  ```
  Original chunk: "The company's revenue grew by 3% over the previous quarter."
  Contextualized chunk: "This chunk is from an SEC filing on ACME corp's performance in Q2 2023; the previous quarter's revenue was $314 million. The company's revenue grew by 3% over the previous quarter."
  ```

According to Anthropic's findings, this method can:

- Significantly improve retrieval accuracy
- Better maintain document context
- Reduce the number of failed retrievals in RAG systems

## Implementation Overview

This project implements the core concepts from Anthropic's Contextual Retrieval paper with:

1. Document chunking with context preservation
2. AI-generated context using GPT-4o
3. Semantic search combined with BM25 for improved retrieval
4. Interactive chat interface for document querying

## Key Features

- **Contextual Processing**: Uses GPT-4o to generate context-aware descriptions for each document chunk
- **Hybrid Search**: Combines embedding-based semantic search with BM25 lexical search
- **PDF Processing**: Built-in PDF document processing capabilities
- **Supabase Integration**: Stores embeddings and documents in Supabase's vector database
- **Real-time Chat Interface**: Interactive chat interface using AI SDK's useChat hook

## Core Components

### Contextual RAG Process (`lib/ai/contextual-retrieval.ts`)

- Splits documents into chunks using RecursiveCharacterTextSplitter
- Generates context for each chunk using GPT-4o
- Combines context with original content
- Creates and stores embeddings in Supabase

### RAG Middleware (`lib/ai/rag-middleware.ts`)

- Intercepts queries and enhances them with relevant context
- Implements hybrid search (semantic + BM25)
- Handles message classification and response generation

### Chat Interface (`app/chat.tsx`)

- Real-time chat functionality using useChat hook
- PDF file upload and processing
- Responsive message display with scroll functionality
- Loading states and error handling

## Technical Stack

- **Framework**: Next.js 15
- **AI Models**:
  - GPT-4o for context generation
  - OpenAI Embeddings (text-embedding-3-small, dimensions: 1536)
- **Vector Database**: Supabase
- **UI Components**: Custom components built with Radix UI
- **Key Libraries**:
  - LangChain
  - AI SDK
  - Supabase Client
  - pdf-parse for PDF processing

## Setup

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Configure environment variables:

```env
OPENAI_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

4. Run development server:

```bash
npm run dev
```

## Usage

The system can be used through the chat interface that supports both text queries and PDF document uploads:

1. **Upload Documents**:

   - Use the file input to upload PDF documents
   - Documents are automatically processed and stored in the vector database

2. **Chat Interface**:
   - Ask questions about the uploaded documents
   - Receive AI-enhanced responses using the contextual retrieval system

## TODO: Future Improvements

Based on Anthropic's research findings, implementing reranking could further enhance retrieval accuracy:

1. **Add Reranking Step**

   - According to the article, combining Contextual Retrieval with reranking reduced the retrieval failure rate by 67% (compared to 49% without reranking)
   - Implementation steps:

     ```typescript
     // 1. Perform initial retrieval to get top-N chunks (e.g., top 150)
     // 2. Pass chunks and query through a reranking model
     // 3. Score and select top-K chunks (e.g., top 20)
     // 4. Use these chunks for the final response generation
     ```

   - Consider using Cohere's reranker or similar solutions
   - Balance between reranking more chunks for better accuracy vs. fewer chunks for lower latency

2. **Performance Metrics**

   - Implement evaluation system to measure improvement from reranking
   - Track and compare retrieval failure rates
   - Monitor latency impact

3. **Add Caching for Document Processing**
   - Implement caching strategy for document processing and embeddings.
   - Each chunk doesn't need separate document context for processing
   - Caching the main document once reduces API costs significantly
   - (https://www.anthropic.com/news/contextual-retrieval#:~:text=Using%20Prompt%20Caching%20to%20reduce%20the%20costs%20of%20Contextual%20Retrieval)

For detailed information about reranking implementation, refer to the [original article](https://www.anthropic.com/news/contextual-retrieval#further-boosting-performance-with-reranking).

## References

This implementation is based on the research and methodology presented in [Anthropic's Contextual Retrieval article](https://www.anthropic.com/news/contextual-retrieval). For a detailed understanding of the underlying concepts and methodology, please refer to the original article.
