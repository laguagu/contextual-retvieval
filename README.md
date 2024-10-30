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
- **UI Components**: Shadcn
- **Key Libraries**:
  - LangChain
  - Vercel AI SDK

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

4. Set up Supabase database:

   Execute the following SQL commands in your Supabase SQL editor to create the necessary table and functions:

   ```sql
   -- Enable the pgvector extension
   create extension if not exists vector;

   -- Create the main table for storing documents and embeddings
   create table contextual_rag (
     id bigserial primary key,
     content text,
     metadata jsonb,
     embedding vector(1536)
   );

   -- An index is not necessary if you don't have much data; it can actually slow down your query time.
   create index on contextual_rag using ivfflat (embedding vector_cosine_ops)
   with (lists = 100);

   -- Create the matching function for document retrieval
   CREATE OR REPLACE FUNCTION match_contextual_documents(
    query_embedding vector(1536),
    match_count int,
    filter jsonb DEFAULT '{}'
   )
   RETURNS TABLE (
    id bigint,
    content text,
    metadata jsonb,
    embedding vector(1536),
    similarity float
   )
   LANGUAGE plpgsql
   AS $$
   BEGIN
    RETURN QUERY
    SELECT DISTINCT ON (contextual_rag.content)
      contextual_rag.id,
      contextual_rag.content,
      contextual_rag.metadata,
      contextual_rag.embedding,
      1 - (contextual_rag.embedding <=> query_embedding) as similarity
    FROM contextual_rag
    WHERE contextual_rag.embedding IS NOT NULL
      AND CASE
        WHEN filter::text != '{}' THEN
          contextual_rag.metadata @> filter
        ELSE
          TRUE
      END
    ORDER BY
      contextual_rag.content,
      (1 - (contextual_rag.embedding <=> query_embedding)) DESC
    LIMIT match_count;
   END;
   $$;
   ```

5. Run development server:

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
   - [Read more about prompt caching](https://www.anthropic.com/news/contextual-retrieval#using-prompt-caching)

For detailed information about reranking implementation, refer to the [original article](https://www.anthropic.com/news/contextual-retrieval#further-boosting-performance-with-reranking).

## References

This implementation is based on the research and methodology presented in [Anthropic's Contextual Retrieval article](https://www.anthropic.com/news/contextual-retrieval). For a detailed understanding of the underlying concepts and methodology, please refer to the original article.
