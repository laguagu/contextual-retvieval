import { createClient } from "@supabase/supabase-js";
import { Document } from "langchain/document";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OpenAI } from "openai";
import { embeddings } from "./index";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface ProcessingOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  metadata?: Record<string, string | number>;
}

async function addContextToChunk(
  originalDocument: string,
  chunk: Document,
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
            "Generate concise context for the chunk based on the document. Respond in Finnish.",
        },
        {
          role: "user",
          content: contextPrompt,
        },
      ],
      temperature: 0,
    });

    const context = completion.choices[0].message.content;
    console.log("Generated context:", context);

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
export async function processDocumentsWithContext(
  documents: string[],
  options: ProcessingOptions = {},
) {
  try {
    console.log("Processing documents with context:", documents);
    console.log("Options:", options);

    const { chunkSize = 1000, chunkOverlap = 200, metadata = {} } = options;

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
    });

    const allContextualDocs: Document[] = [];

    for (const doc of documents) {
      const chunks = await splitter.createDocuments([doc], [metadata]);
      const contextualChunks = await Promise.all(
        chunks.map((chunk) => addContextToChunk(doc, chunk)),
      );
      allContextualDocs.push(...contextualChunks);
    }

    console.log("Created contextual chunks. Processing embeddings...");

    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Tallenna dokumentit ja embeddings suoraan tietokantaan
    for (const doc of allContextualDocs) {
      try {
        // Luo embedding dokumentille
        const docEmbedding = await embeddings.embedQuery(doc.pageContent);

        // Tarkista embedding
        console.log("Generated embedding length:", docEmbedding.length);

        // Tallenna dokumentti ja embedding
        const { error } = await client.from("contextual_rag").insert({
          content: doc.pageContent,
          metadata: doc.metadata,
          embedding: docEmbedding,
        });

        if (error) {
          console.error("Error inserting document:", error);
          throw error;
        }
      } catch (error) {
        console.error("Error processing document:", error);
        throw error;
      }
    }

    // Varmista että data on tallennettu oikein
    const { data: sampleData, error: sampleError } = await client
      .from("contextual_rag")
      .select("id, content, embedding")
      .limit(1);

    if (sampleError) {
      console.error("Error fetching sample data:", sampleError);
    } else {
      console.log(
        "Sample data after insert:",
        sampleData?.[0]?.id,
        sampleData?.[0]?.content?.substring(0, 100),
        "Embedding exists:",
        !!sampleData?.[0]?.embedding,
      );
    }

    return { documents: allContextualDocs };
  } catch (error) {
    console.error("Error in processDocumentsWithContext:", error);
    throw error;
  }
}
