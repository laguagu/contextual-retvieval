create extension if not exists vector;

create table
  contextual_rag (
    id bigserial primary key,
    content text,
    metadata jsonb,
    embedding vector (1536)
  );

create index on contextual_rag using ivfflat (embedding vector_cosine_ops)
with
  (lists = 100);

-- Enable the pgvector extension
create extension if not exists vector;

-- Drop the existing function
DROP FUNCTION IF EXISTS match_contextual_documents;

CREATE
OR REPLACE FUNCTION match_contextual_documents (
  query_embedding vector (1536),
  match_count int,
  filter jsonb DEFAULT '{}'
) RETURNS TABLE (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT 
    contextual_rag.id,
    contextual_rag.content,
    contextual_rag.metadata,
    1 - (contextual_rag.embedding <=> query_embedding) as similarity
  FROM contextual_rag
  WHERE contextual_rag.embedding IS NOT NULL
    AND CASE 
      WHEN filter::text != '{}' THEN
        contextual_rag.metadata @> filter
      ELSE 
        TRUE
    END
  ORDER BY contextual_rag.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;