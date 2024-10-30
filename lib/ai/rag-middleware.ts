import { openai } from "@ai-sdk/openai";
import {
  LanguageModelV1TextPart,
  LanguageModelV1Message as ProviderLanguageModelV1Message,
} from "@ai-sdk/provider";
import { BM25Retriever } from "@langchain/community/retrievers/bm25";
import { createClient } from "@supabase/supabase-js";
import {
  cosineSimilarity,
  generateText,
  type Experimental_LanguageModelV1Middleware,
  type LanguageModelV1CallOptions,
} from "ai";
import { embeddings } from "./index";

type LanguageModelV1Message = ProviderLanguageModelV1Message;

async function getSimilarDocuments(queryText: string, limit: number = 30) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Check database status
  const { count } = await supabase
    .from("contextual_rag")
    .select("*", { count: "exact", head: true });

  console.log("Database status:", {
    hasRecords: count && count > 0,
    totalRecords: count,
  });

  if (!count || count === 0) {
    throw new Error("Database is empty");
  }

  // Generate query embedding
  const queryEmbedding = await embeddings.embedQuery(queryText);
  console.log("Embedding status:", {
    length: queryEmbedding.length,
    hasValues: queryEmbedding.some((v) => v !== 0),
    firstFew: queryEmbedding.slice(0, 5),
  });

  // Fetch all documents with their embeddings
  const { data: documents, error } = await supabase
    .from("contextual_rag")
    .select("id, content, metadata, embedding")
    .not("embedding", "is", null);

  if (error) {
    console.error("Database query error:", error);
    throw error;
  }

  if (!documents || documents.length === 0) {
    return [];
  }

  // Helper function to parse pgvector to number array
  const parseEmbedding = (embedding: unknown): number[] => {
    if (Array.isArray(embedding)) {
      return embedding.map(Number);
    }
    if (typeof embedding === "string") {
      // Handle string format like "{0.1,0.2,0.3}"
      return embedding.replace(/[{}]/g, "").split(",").map(Number);
    }
    console.error("Invalid embedding format:", embedding);
    throw new Error("Invalid embedding format");
  };

  // Calculate similarities using cosineSimilarity
  const documentsWithSimilarity = documents
    .map((doc) => {
      try {
        const parsedEmbedding = parseEmbedding(doc.embedding);
        if (parsedEmbedding.length !== queryEmbedding.length) {
          console.error(
            `Embedding length mismatch: ${parsedEmbedding.length} vs ${queryEmbedding.length}`,
            {
              docId: doc.id,
              originalEmbedding: doc.embedding,
            },
          );
          return null;
        }

        return {
          id: doc.id,
          content: doc.content,
          metadata: doc.metadata,
          similarity: cosineSimilarity(queryEmbedding, parsedEmbedding),
          debug_info: {
            total_rows: documents.length,
            embedding_null: false,
            embedding_dimension: parsedEmbedding.length,
            execution_time_ms: 0,
          },
        };
      } catch (err) {
        console.error("Error processing document:", {
          docId: doc.id,
          error: err,
        });
        return null;
      }
    })
    .filter((doc): doc is NonNullable<typeof doc> => doc !== null);

  // Sort by similarity and take top results
  const results = documentsWithSimilarity
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  console.log("Query results:", {
    success: true,
    documentsFound: results.length,
    error: null,
    firstDocumentSimilarity: results[0]?.similarity,
    debugInfo: results[0]?.debug_info,
  });

  return results;
}

export const ragMiddleware: Experimental_LanguageModelV1Middleware = {
  transformParams: async ({ params }) => {
    console.log("Called ragMiddleware");

    try {
      const messages = params.prompt;
      console.log("Messages:", JSON.stringify(messages, null, 2));

      if (
        !Array.isArray(messages) ||
        messages.length === 0 ||
        messages[messages.length - 1].role !== "user"
      ) {
        return params;
      }

      const lastMessage = messages[messages.length - 1];
      const userMessage = Array.isArray(lastMessage.content)
        ? lastMessage.content
            .filter(
              (content): content is LanguageModelV1TextPart =>
                content.type === "text",
            )
            .map((content) => content.text)
            .join("\n")
        : "";

      const { text: classification } = await generateText({
        model: openai("gpt-4o-mini"),
        system:
          "Classify the message as exactly one of: question, statement, or other. Reply with just the classification word.",
        prompt: userMessage,
      });

      if (classification.toLowerCase().trim() !== "question") {
        console.log("Not a question, skipping RAG middleware");
        return params;
      }
      console.log("Is a question, continuing with RAG middleware");

      const { text: hypotheticalAnswer } = await generateText({
        model: openai("gpt-4o"),
        system: "Answer the user's question:",
        prompt: userMessage,
      });
      console.log("Hypothetical answer:", hypotheticalAnswer);

      const results = await getSimilarDocuments(userMessage);
      console.log("Similar documents:", results);

      if (!results || results.length === 0) {
        console.log("No similar documents found");
        return params;
      }

      const bm25Retriever = new BM25Retriever({
        docs: results.map((doc) => ({
          pageContent: doc.content,
          metadata: doc.metadata || {},
        })),
        k: Math.min(10, results.length),
      });

      const rerankedResults = await bm25Retriever.invoke(userMessage);
      console.log("Reranked results:", rerankedResults);

      const updatedMessage: LanguageModelV1Message = {
        role: "user",
        content: [
          { type: "text", text: userMessage },
          {
            type: "text",
            text: "\n\nRelevant information related to your question:\n\n",
          },
          ...rerankedResults.map((result) => ({
            type: "text" as const,
            text: result.pageContent,
          })),
        ],
      };

      messages[messages.length - 1] = updatedMessage;

      return {
        ...params,
        prompt: messages,
      } as LanguageModelV1CallOptions;
    } catch (error) {
      console.error("Error in RAG middleware:", error);
      return params;
    }
  },
};
