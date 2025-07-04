# PDF Chatbot

A web application that allows users to upload PDF files and interact with their content via a chatbot. Built with Next.js for the frontend, Multer for file uploads, LangChain for PDF processing, Gemini API for conversational AI, BullMQ for queue management, Qdrant for vector storage, and Redis for caching.

## Features
- Upload PDF files and extract text for querying.
- Chat with PDF content using natural language via Gemini API.
- Asynchronous PDF processing with BullMQ.
- Semantic search powered by Qdrant vector database.
- Fast and scalable with Redis caching.

## Tech Stack
- **Frontend**: Next.js
- **Backend**: 
  - Multer (PDF uploads)
  - LangChain (PDF text extraction and embeddings)
  - Gemini API (conversational AI)
  - BullMQ (task queue)
  - Qdrant (vector database)
  - Redis (caching/queue management)

## Prerequisites
- Node.js (>= 18.x)
- Redis server
- Qdrant server
- Gemini API key
- (Optional) Docker for containerized setup

## Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/shivamxverma/DeepDoc.git
   cd DeepDoc
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   Create a `.env.local` file in the root directory and add the following:
   ```env
   GEMINI_API_KEY=your_gemini_api_key
   REDIS_URL=redis://localhost:6379
   QDRANT_URL=http://localhost:6333
   QDRANT_API_KEY=your_qdrant_api_key
   ```

4. **Run Redis and Qdrant**:
   - For Redis: `redis-server` (or use Docker: `docker run -d -p 6379:6379 redis`)
   - For Qdrant: Follow [Qdrant setup instructions](https://qdrant.tech/documentation/quick-start/) or use Docker:
     ```bash
     docker run -d -p 6333:6333 qdrant/qdrant
     ```

5. **Start the development server**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

## Usage
1. Navigate to the web interface.
2. Upload a PDF file via the upload form.
3. Wait for the PDF to be processed (progress feedback shown).
4. Start chatting with the PDF content using natural language queries.

## Configuration
- **Multer**: Configured to accept PDF files up to 10MB (adjust in `lib/multer.js`).
- **BullMQ**: Queues PDF processing tasks (see `lib/queue.js`).
- **Qdrant**: Stores text embeddings for semantic search (configure in `utils/qdrant.js`).
- **Redis**: Caches API responses and manages BullMQ queues (configure in `utils/redis.js`).
