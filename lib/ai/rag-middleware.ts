// lib/middleware/rag-middleware.ts
import { openai } from '@ai-sdk/openai'
import { BM25Retriever } from '@langchain/community/retrievers/bm25'
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase'
import { OpenAIEmbeddings } from '@langchain/openai'
import { createClient } from '@supabase/supabase-js'
import {
  cosineSimilarity,
  embed,
  generateObject,
  generateText,
  type Experimental_LanguageModelV1Middleware,
  type LanguageModelV1CallOptions
} from 'ai'
import { z } from 'zod'

// Schema validointiin
const selectionSchema = z.object({
  files: z.object({
    selection: z.array(z.string()),
  }),
})

// RAG Middleware
export const ragMiddleware: Experimental_LanguageModelV1Middleware = {
  transformParams: async ({ params }) => {
    try {
      const { prompt, providerMetadata } = params
      
      // Jos ei ole message-muotoinen prompt, palauta sellaisenaan
      if (params.inputFormat !== 'messages') {
        return params
      }

      // Validoi metadata
      const { success } = selectionSchema.safeParse(providerMetadata)
      if (!success) {
        return params
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messages = prompt as any[]
      if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
        return params
      }

      const lastMessage = messages[messages.length - 1]
      const lastMessageContent = Array.isArray(lastMessage.content)
        ? lastMessage.content
            .filter((c: { type: string }) => c.type === 'text')
            .map((c: { text: unknown }) => c.text)
            .join('\n')
        : lastMessage.content

      // Luokittele viesti
      const { object: classification } = await generateObject({
        model: openai('gpt-4-turbo', { structuredOutputs: true }),
        output: 'enum',
        enum: ['question', 'statement', 'other'],
        system: 'Classify the user message as a question, statement, or other',
        prompt: lastMessageContent
      })

      if (classification !== 'question') {
        return params
      }

      // Generoi hypoteettinen vastaus
      const { text: hypotheticalAnswer } = await generateText({
        model: openai('gpt-4-turbo'),
        system: 'Answer the user\'s question concisely:',
        prompt: lastMessageContent
      })

      // Luo embedding vastaukselle
      const { embedding: hypotheticalAnswerEmbedding } = await embed({
        model: openai.embedding('text-embedding-3-small'),
        value: hypotheticalAnswer
      })

      // Hae relevantit chunkit
      const embeddings = new OpenAIEmbeddings()
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      const vectorStore = new SupabaseVectorStore(embeddings, {
        client: supabase,
        tableName: 'documents'
      })

      const vectorResults = await vectorStore.similaritySearch(lastMessageContent, 30)
      
      const bm25Retriever = new BM25Retriever({ 
        docs: vectorResults,
        k: 10
      })
      const bm25Results = await bm25Retriever.invoke(lastMessageContent)

      // Yhdistä ja järjestä tulokset
      const allResults = [...vectorResults, ...bm25Results]
      const uniqueResults = Array.from(
        new Set(allResults.map(doc => doc.pageContent))
      ).map(content => {
        const doc = allResults.find(d => d.pageContent === content)!
        return {
          content: doc.pageContent,
          metadata: doc.metadata,
          similarity: doc.metadata.embedding ? 
            cosineSimilarity(hypotheticalAnswerEmbedding, doc.metadata.embedding) : 
            0
        }
      })

      uniqueResults.sort((a, b) => b.similarity - a.similarity)
      const topResults = uniqueResults.slice(0, 20)

      // Muodosta uusi prompt
      const contextMessage = {
        role: 'system',
        content: `Käytä seuraavaa kontekstia vastataksesi kysymykseen. Vastaa suomeksi ja perustuen vain annettuun kontekstiin:

${topResults.map(ctx => ctx.content).join('\n\n')}`,
        providerMetadata
      }

      // Palauta päivitetyt parametrit
      return {
        ...params,
        inputFormat: 'messages',
        mode: { type: 'regular' },
        prompt: [contextMessage, ...messages]
      } as LanguageModelV1CallOptions

    } catch (error) {
      console.error('Error in RAG middleware:', error)
      return params
    }
  }
}