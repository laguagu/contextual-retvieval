import { openai } from "@ai-sdk/openai";
import {
  LanguageModelV1TextPart,
  LanguageModelV1Message as ProviderLanguageModelV1Message,
} from "@ai-sdk/provider";
import { BM25Retriever } from "@langchain/community/retrievers/bm25";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { OpenAIEmbeddings } from "@langchain/openai";
import { createClient } from "@supabase/supabase-js";
import {
  generateObject,
  generateText,
  type Experimental_LanguageModelV1Middleware,
  type LanguageModelV1CallOptions,
} from "ai";

type LanguageModelV1Message = ProviderLanguageModelV1Message;

async function getSimilarDocuments(queryText: string, limit: number = 30) {
  try {
    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: "text-embedding-3-small",
    });

    const supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const vectorStore = new SupabaseVectorStore(embeddings, {
      client: supabaseClient,
      tableName: "contextual_rag",
      queryName: "match_contextual_documents",
    });

    console.log("Query text:", queryText);
    const queryEmbedding = await embeddings.embedQuery(queryText);
    console.log("Query embedding:", queryEmbedding);

    const results = await vectorStore.similaritySearchWithScore(
      queryText,
      limit,
    );

    // Tulostus sisältää nyt [document, score] parit
    console.log(
      "Search results with scores:",
      results.map(([doc, score]) => ({
        content: doc.pageContent,
        similarity: score,
        metadata: doc.metadata,
      })),
    );

    return results;
  } catch (error) {
    console.error("Error in getSimilarDocuments:", error);
    throw error;
  }
}

export const ragMiddleware: Experimental_LanguageModelV1Middleware = {
  transformParams: async ({ params }) => {
    console.log("Called ragMiddleware");

    try {
      const messages = params.prompt;

      if (
        !Array.isArray(messages) ||
        messages.length === 0 ||
        messages[messages.length - 1].role !== "user"
      ) {
        return params;
      }

      const lastMessage = messages[messages.length - 1];
      console.log("Last message:", lastMessage);

      const userMessage = Array.isArray(lastMessage.content)
        ? lastMessage.content
            .filter(
              (content): content is LanguageModelV1TextPart =>
                content.type === "text",
            )
            .map((content) => content.text)
            .join("\n")
        : "";

      // Luokitellaan käyttäjän viesti kysymykseksi, väitteeksi tai muuksi
      const { object: classification } = await generateObject({
        model: openai("gpt-4o-mini", { structuredOutputs: true }),
        output: "enum",
        enum: ["question", "statement", "other"],
        system: "classify the user message as a question, statement, or other",
        prompt: userMessage,
      });
      console.log("Classification:", classification);

      if (classification !== "question") {
        console.log("Not a question, returning original params", params);
        // messages.push(userMessage); // Todo: Add a message to the user that the question was not understood
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

      if (!results || results.length === 0) {
        console.log("No similar documents found");
        return params;
      }

      const bm25Retriever = new BM25Retriever({
        docs: results.map(([doc]) => ({
          pageContent: doc.pageContent,
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
