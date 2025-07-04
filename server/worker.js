import { Worker } from 'bullmq';
import { QdrantVectorStore } from '@langchain/qdrant';
import { Document } from '@langchain/core/documents';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { CharacterTextSplitter } from '@langchain/textsplitters';
import { GoogleGenerativeAIEmbeddings } from '@langchain/community/embeddings/googlegenerativeai';

const worker = new Worker(
  'file-upload-queue',
  async (job) => {
    console.log(`Job:`, job.data);
    const data = JSON.parse(job.data);

    const loader = new PDFLoader(data.path);
    const rawDocs = await loader.load();

    const splitter = new CharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const docs = await splitter.splitDocuments(rawDocs);

    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GOOGLE_API_KEY || '',
      model: 'models/embedding-001', 
    });

    const vectorStore = await QdrantVectorStore.fromExistingCollection(
      embeddings,
      {
        url: 'http://localhost:6333',
        collectionName: 'langchainjs-testing',
      }
    );

    await vectorStore.addDocuments(docs);
    console.log(`All docs are added to vector store`);
  },
  {
    concurrency: 100,
    connection: {
      host: 'localhost',
      port: '6379',
    },
  }
);
