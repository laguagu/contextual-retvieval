import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { createClient } from "@supabase/supabase-js";
import { Document } from "langchain/document";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

export async function processDocuments(rawDocs: string[]) {
  // Tekstin jako paloihin
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  const docs = await splitter.createDocuments(rawDocs);

  // Kontekstin lisääminen jokaiseen palaan
  const llm = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    temperature: 0,
  });

  const contextPrompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      "Anna lyhyt ja ytimekäs konteksti tälle tekstipätkälle parantaaksesi sen hakua:",
    ],
    ["human", "{chunk}"],
  ]);

  const chain = contextPrompt.pipe(llm).pipe(new StringOutputParser());

  const contextualDocs = await Promise.all(
    docs.map(async (doc) => {
      const context = await chain.invoke({
        chunk: doc.pageContent,
      });

      return new Document({
        pageContent: `${context}\n\n${doc.pageContent}`,
        metadata: doc.metadata,
      });
    }),
  );

  // Tallenna Supabaseen
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const embeddings = new OpenAIEmbeddings();

  await SupabaseVectorStore.fromDocuments(contextualDocs, embeddings, {
    client,
    tableName: "documents",
  });

  return contextualDocs;
}
