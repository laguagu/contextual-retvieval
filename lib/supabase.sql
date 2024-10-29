create extension if not exists vector;

create table documents (
  id bigserial primary key,
  content text,
  metadata jsonb,
  embedding vector(1536)
);

create index on documents using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);