import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { Queue } from 'bullmq';
import { QdrantVectorStore } from '@langchain/qdrant';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { GoogleGenerativeAI } from '@google/generative-ai'; 
import dotenv from 'dotenv';

dotenv.config(); 

const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const queue = new Queue('file-upload-queue', {
  connection: {
    host: 'localhost',
    port: 6379,
  },
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

const upload = multer({ storage });

const app = express();
app.use(cors());

app.get('/', (req, res) => {
  return res.json({ status: 'All Good!' });
});

app.post('/upload/pdf', upload.single('pdf'), async (req, res) => {
  await queue.add(
    'file-ready',
    JSON.stringify({
      filename: req.file.originalname,
      destination: req.file.destination,
      path: req.file.path,
    })
  );
  return res.json({ message: 'uploaded' });
});

app.get('/chat', async (req, res) => {
  const userQuery = req.query.message;

  const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GEMINI_API_KEY || '',
    model: 'models/embedding-001',
  });

  const vectorStore = await QdrantVectorStore.fromExistingCollection(
    embeddings,
    {
      url: 'http://localhost:6333',
      collectionName: 'langchainjs-testing',
    }
  );

  const ret = vectorStore.asRetriever({ k: 2 });
  const result = await ret.invoke(userQuery);

  const SYSTEM_PROMPT = `
  You are a helpful AI Assistant. Answer the user's question based ONLY on the following context from a PDF file.

  Context:
  ${JSON.stringify(result)}
  `;

  const model = client.getGenerativeModel({ model: 'gemini-1.5-pro' });
  const chat = model.startChat({
    history: [],
    generationConfig: {
      temperature: 0.5,
      topK: 1,
      topP: 1,
      maxOutputTokens: 1000,
    },
  });

  const chatResult = await chat.sendMessage(`${SYSTEM_PROMPT}\n\nUser: ${userQuery}`);
  const response = await chatResult.response;
  const text = response.text();

  return res.json({
    message: text,
    docs: result,
  });
});

app.listen(8000, () => console.log(`Server started on PORT:8000`));
