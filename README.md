# 📄 DeepDoc - Intelligent PDF Chat & Semantic Analysis Platform

**DeepDoc** is a full-stack Retrieval-Augmented Generation (RAG) platform that enables users to upload PDF documents and engage in context-grounded, interactive Q&A sessions with AI. Built on **Next.js 15**, **Azure OpenAI**, **Pinecone Vector DB**, and **Drizzle ORM with Neon PostgreSQL**, DeepDoc extracts, semantically chunks, vectorizes, and analyzes complex PDF files with extreme accuracy.

---

## 🌟 Key Features

- 📑 **Smart PDF Upload & Storage**: Secure file upload with Vercel Blob storage, client-side validation (4MB size limits, PDF MIME check), and server-side text extraction.
- 🧠 **Dynamic Semantic Chunking**: Advanced NLP pipeline that splits documents by semantic sentence shifts using embedding distance quantiles rather than arbitrary character splits.
- ⚡ **Vector Search & Namespace Isolation**: Vector embeddings (`text-embedding-3-small`) stored in Pinecone vector indexes, isolated by unique per-document namespaces.
- 🛡️ **Grounded AI Answers**: Powered by Azure OpenAI (`gpt-4o-mini`) with strict anti-hallucination system prompting (answers strictly based on document context).
- 🔄 **Smart Deduplication & Token Packing**: Query context ranking with similarity score thresholds, substring deduplication, and token budget packing.
- 🖥️ **3-Pane Interactive Workspace**: 
  - **Left**: Sidebar with past PDF chats and quick navigation.
  - **Center**: Embedded live PDF viewer powered by Google Docs Viewer.
  - **Right**: Real-time chat interface with optimistic updates via TanStack Query.

---

## 🏗️ System Architecture

```mermaid
flowchart TD
    User([User]) -->|Upload PDF| UploadComp[PDFUpload Component]
    UploadComp -->|Server Action| PDFProc[lib/pdf-process.ts]
    
    subgraph Storage & Database
        PDFProc -->|Store PDF File| VercelBlob[(Vercel Blob Storage)]
        PDFProc -->|Save Chat Metadata| NeonDB[(Neon PostgreSQL via Drizzle)]
    end

    subgraph Semantic Chunking Pipeline
        PDFProc -->|Extract Text| PDFParse[pdf-parse]
        PDFParse -->|Split Sentences| NaturalNLP[natural SentenceTokenizer]
        NaturalNLP -->|Sliding Windows| EmbedGen[text-embedding-3-small]
        EmbedGen -->|Cosine Distance| ShiftDetect[Quantile Shift Detection]
        ShiftDetect -->|Merge Chunks| FinalChunks[Semantic Chunks]
    end

    FinalChunks -->|Upsert Vectors + Metadata| Pinecone[(Pinecone Vector DB)]

    subgraph Query & RAG Flow
        User -->|Ask Question| ChatRoute[app/api/chat/route.ts]
        ChatRoute -->|Embed Query| QueryEmbed[text-embedding-3-small]
        QueryEmbed -->|Similarity Query| Pinecone
        Pinecone -->|Top Matching Vectors| ContextRet[lib/context.ts]
        ContextRet -->|Dedupe & Budget Pack| GroundedContext[Context Block]
        GroundedContext -->|Prompt + Context| AzureModel[gpt-4o-mini]
        AzureModel -->|Grounded Response| User
        ChatRoute -->|Persist History| NeonDB
    end
```

---

## 🔬 In-Depth Implementation Details

### 1. Advanced Semantic Chunking (`lib/chunking.ts`)
Unlike naive chunkers that split text every $N$ characters or words (which often break sentences mid-thought), DeepDoc implements a **semantic distance-based chunking algorithm**:
1. **Sentence Tokenization**: Cleans whitespace and splits raw extracted text into sentences using `natural`'s `SentenceTokenizer`, preserving common English honorifics (`Mr.`, `Dr.`, `etc.`).
2. **Context Windowing**: Groups sentences with adjacent neighbors (default `bufferSize = 2`) to maintain context.
3. **Vector Distance Shift Detection**: Generates embeddings for each sentence buffer using Google's `text-embedding-004` and computes the cosine distance ($1 - \text{cosineSimilarity}$) between sequential sentence vectors using `mathjs`.
4. **Quantile Thresholding**: Identifies topic boundaries by calculating quantile cutoffs (e.g., 90th percentile distance threshold via `d3-array`).
5. **Group & Merge**: Groups sentences into chunks at boundary points and selectively merges smaller adjacent chunks if their combined length is under limits and semantic similarity is high ($> 0.9$).

### 2. Vector Indexing & Namespace Partitioning (`lib/pinecone.ts` / `lib/pineconedb.ts`)
- Extracted chunks are converted into 768-dimensional embeddings.
- Vector IDs are generated deterministically using MD5 hashes (`md5(chunk.text)`).
- Vectors and metadata (`text`, `startIndex`, `endIndex`, `chatId`, `fileKey`) are upserted into **Pinecone** in batches under a dedicated **namespace** (`fileKey`) for strict document isolation.

### 3. Context Retrieval & Deduplication (`lib/context.ts`)
When a question is submitted:
1. **Embedding**: The query is converted into a vector using `text-embedding-004`.
2. **Top-K Vector Query**: Pinecone queries the document namespace for top matching vectors (default `topK = 20`).
3. **Score Filtering & Deduplication**: Matches with similarity scores below the threshold (default `0.7`) are discarded. `dedupeRankedMatches` removes redundant chunks whose normalized text is a substring of a higher-ranked match.
4. **Token Budget Packing**: `packIntoTokenBudget` concatenates the most relevant unique chunks until reaching a strict token budget (default `750 tokens` / `~3000 chars`), truncating gracefully if needed.

### 4. Grounded AI Generation (`app/api/chat/route.ts`)
- The retrieved context block is wrapped into a strict system prompt for `gemini-2.5-flash`.
- **Anti-Hallucination Constraints**: The model is instructed to answer strictly using the provided context block. If the context is insufficient or off-topic, it is constrained to respond with a standardized message.
- **Resiliency**: `callGeminiWithRetry()` features exponential backoff retry logic and a 20-second timeout handling transient upstream API issues ($503, 500, 429, 408$).
- **History Persistence**: Both user questions and AI system responses are persisted to PostgreSQL `messages` table via Drizzle ORM.

---

## 🗄️ Database Schema (`lib/db/schema.ts`)

PostgreSQL database schema managed via **Drizzle ORM**:

### `chats` Table
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `serial` (PK) | Unique auto-incrementing chat session ID |
| `pdfName` | `text` | Original filename of the uploaded PDF |
| `pdfUrl` | `text` | Public URL of the stored PDF on Vercel Blob |
| `fileKey` | `text` | Unique storage key / Pinecone namespace |
| `createdAt` | `timestamp` | Timestamp when the chat was created |

### `messages` Table
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `serial` (PK) | Unique message ID |
| `chatId` | `integer` (FK) | Reference to `chats.id` |
| `content` | `text` | Content of the message |
| `role` | `pgEnum('system', 'user')` | Role of the message sender |
| `createdAt` | `timestamp` | Timestamp when message was created |

---

## 🛠️ Tech Stack & Key Libraries

- **Framework**: Next.js 15 (App Router), React 19, TypeScript
- **Database & ORM**: Neon Serverless PostgreSQL (`@neondatabase/serverless`), Drizzle ORM (`drizzle-orm`, `drizzle-kit`)
- **Vector Database**: Pinecone (`@pinecone-database/pinecone`)
- **AI Models & Embeddings**: Azure OpenAI (`openai`)
  - LLM: `gpt-4o-mini`
  - Embeddings: `text-embedding-3-small`
- **File Storage**: Vercel Blob (`@vercel/blob`)
- **NLP & Mathematics**: `pdf-parse`, `natural` (SentenceTokenizer), `d3-array` (quantiles), `mathjs` (vector operations), `md5`
- **Client State & Data Fetching**: TanStack React Query (`@tanstack/react-query`), Axios
- **Styling & UI**: Tailwind CSS, Lucide React, Radix UI Primitives, `react-hot-toast`

---

## ⚙️ Environment Variables

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL="postgresql://user:password@neon-db-host/dbname?sslmode=require"

# Azure OpenAI Configuration
AZURE_OPENAI_API_KEY="your_azure_openai_api_key"
AZURE_OPENAI_ENDPOINT="https://your-resource-name.openai.azure.com/"
AZURE_OPENAI_API_VERSION="2024-06-01"
AZURE_OPENAI_CHAT_DEPLOYMENT_NAME="gpt-4o-mini"
AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME="text-embedding-3-small"

# Pinecone Vector DB
PINECONE_API_KEY="your_pinecone_api_key"
PINECONE_INDEX="chatpdf"

# Vercel Blob Storage Token
BLOB_READ_WRITE_TOKEN="your_vercel_blob_token"

# Optional RAG Tuning
CONTEXT_TOP_K=20
CONTEXT_SCORE_THRESHOLD=0.7
CONTEXT_MAX_TOKENS=750
```

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
# or
pnpm install
```

### 2. Push Database Schema
```bash
npx drizzle-kit push
```

### 3. Run Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📜 Project Scripts

- `npm run dev`: Starts the Next.js development server.
- `npm run build`: Builds the production bundle.
- `npm run start`: Runs the built production server.
- `npm run lint`: Runs Next.js ESLint checks.