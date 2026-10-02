import dotenv from 'dotenv';

dotenv.config();

export const config = {
  AZURE_OPENAI_API_KEY: process.env.AZURE_OPENAI_API_KEY!,
  AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT!,
  AZURE_OPENAI_API_VERSION: process.env.AZURE_OPENAI_API_VERSION || '2024-06-01',
  AZURE_OPENAI_CHAT_DEPLOYMENT_NAME: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT_NAME || 'gpt-4o-mini',
  AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME || 'text-embedding-3-small',
  PINECONE_API_KEY: process.env.PINECONE_API_KEY!,
  PINECONE_INDEX: process.env.PINECONE_INDEX || "chatpdf", 
};

if (!config.AZURE_OPENAI_API_KEY || !config.AZURE_OPENAI_ENDPOINT || !config.PINECONE_API_KEY) {
  throw new Error("Missing required environment variables: AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, or PINECONE_API_KEY");
}