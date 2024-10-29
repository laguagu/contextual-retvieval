import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { OpenAIEmbeddings } from "@langchain/openai";
import { createClient } from "@supabase/supabase-js";
import { Document } from "langchain/document";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OpenAI } from "openai";

const openai = new OpenAI();

interface ProcessingOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

// Kontekstin lisääminen chunkkeihin
async function addContextToChunk(
  originalDocument: string,
  chunk: Document
): Promise<Document> {
  const contextPrompt = `
<document>
${originalDocument}
</document>
Here is the chunk we want to situate within the whole document
<chunk>
${chunk.pageContent}
</chunk>
Please give a short succinct context to situate this chunk within the overall document for the purposes of improving search retrieval of the chunk. Answer only with the succinct context and nothing else.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "Generate concise context for the chunk based on the document.",
        },
        {
          role: "user",
          content: contextPrompt,
        },
      ],
      temperature: 0,
      //   max_tokens: 150
    });

    const context = completion.choices[0].message.content;

    return new Document({
      pageContent: `${context}\n\n${chunk.pageContent}`,
      metadata: {
        ...chunk.metadata,
        context: context,
      },
    });
  } catch (error) {
    console.error("Error generating context:", error);
    return chunk;
  }
}

// Pääfunktio dokumenttien prosessointiin
export async function processDocumentsWithContext(
  documents: string[],
  options: ProcessingOptions = {}
) {
  const { chunkSize = 1000, chunkOverlap = 200 } = options;

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
  });

  const allContextualDocs: Document[] = [];

  for (const doc of documents) {
    // 1. Jaa dokumentti paloihin
    const chunks = await splitter.createDocuments([doc]);

    // 2. Lisää konteksti jokaiseen palaan
    const contextualChunks = await Promise.all(
      chunks.map((chunk) => addContextToChunk(doc, chunk))
    );

    allContextualDocs.push(...contextualChunks);
  }

  // 3. Tallenna Supabaseen
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const embeddings = new OpenAIEmbeddings();

  const vectorStore = await SupabaseVectorStore.fromDocuments(
    allContextualDocs,
    embeddings,
    {
      client,
      tableName: "documents",
    }
  );

  return { vectorStore, documents: allContextualDocs };
}
