// lib/models/index.ts
import { openai } from '@ai-sdk/openai'
import { experimental_wrapLanguageModel as wrapLanguageModel } from 'ai'
import { ragMiddleware } from './rag-middleware'

export const customModel = wrapLanguageModel({
  model: openai('gpt-4-turbo'),
  middleware: ragMiddleware
})