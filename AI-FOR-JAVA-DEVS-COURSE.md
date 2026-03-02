# AI Engineering for Java Developers — Complete Course Guide

**A story-driven, hands-on course for junior to mid-level Java developers**

---

## Course Identity

| | |
|---|---|
| **Title** | AI Engineering for Java Developers |
| **Subtitle** | Build intelligent applications with Spring AI, RAG, and agents |
| **Audience** | Junior to mid-level Java developers with Spring Boot experience |
| **Prerequisites** | Spring Boot basics, REST APIs, Maven/Gradle, basic SQL |
| **Primary Stack** | Java 21+, Spring Boot 3.x/4.x, Spring AI, OpenAI / Ollama |
| **Total Blog Posts** | ~40 posts across 8 modules |
| **Format per post** | Problem → Concept → Code → Key takeaway |

---

## The Story

> **Meet Dev.**
>
> Dev is a mid-level Java developer at a B2C e-commerce startup. The company sells tech gadgets online. Dev has been shipping solid Spring Boot APIs for three years — clean code, good tests, reliable CI/CD. Life is good.
>
> Then one Monday morning, the product manager walks over:
> *"Hey Dev, leadership wants us to add AI to the platform. Something like a smart support assistant that answers customer questions about products and orders. Can you figure it out?"*
>
> Dev nods. Smiles. Then quietly Googles: **"how to add AI to Java application"**.
>
> This course is that journey. Every module follows Dev through a real challenge, with real code, and a working result at the end.

**The running project:** An AI-powered customer support assistant for the e-commerce platform.
By the end of the course it can:
- Answer questions about products and policies using the company's data (RAG)
- Remember the conversation across turns (chat memory)
- Check order status by calling the company's APIs (tool/function calling)
- Run safely in production with cost control and observability

---

## Technology Stack

| Layer | Technology | Why |
|---|---|---|
| Language | Java 21+ | Virtual threads, records, pattern matching |
| Framework | Spring Boot 3.x / 4.x | Familiar to the audience |
| AI Framework | Spring AI | Native Spring integration, consistent abstractions |
| Secondary Framework | LangChain4j | Alternative covered in comparison posts |
| Primary LLM | OpenAI GPT-4o | Widely used, great for learning |
| Local LLM | Ollama + llama3 | Offline/private option |
| Vector Store | PostgreSQL + pgvector | Familiar to Java devs, low operational overhead |
| Alternative Vector Store | ChromaDB | Simple to run locally |
| Embedding Model | OpenAI text-embedding-3-small | Affordable, accurate |
| Build | Maven | Familiar to target audience |
| Observability | Spring Boot Actuator + Micrometer | Already in the stack |

---

## Course Structure at a Glance

```
Module 0 — The New World          (2 posts)  — What changed and what the plan is
Module 1 — AI Concepts            (5 posts)  — Mental models before any code
Module 2 — First Contact          (5 posts)  — Spring AI setup, first LLM calls
Module 3 — Data and Embeddings    (5 posts)  — Vectors, semantic search
Module 4 — RAG                    (5 posts)  — Teaching the AI your data
Module 5 — Memory                 (4 posts)  — Conversations that make sense
Module 6 — Agents and Tools       (5 posts)  — AI that takes action
Module 7 — Production             (6 posts)  — Ship it safely
Module 8 — Advanced Topics        (4 posts)  — Beyond the basics
```

---

## Module 0 — The New World

> *Dev just got the assignment. Before writing a single line of code, Dev needs to understand the landscape.*

**Goal:** Set expectations, establish vocabulary, and explain why AI engineering is a new discipline that Java developers can enter — not a research field reserved for data scientists.

**Posts:**

### M0-1: `ai-for-java-devs-why-now.md`
**Title:** Why Java developers should care about AI engineering in 2025
**Focus:**
- The difference between AI/ML research and AI engineering
- What changed: LLM APIs turned AI into a plumbing problem, not a math problem
- The emerging AI engineer role — what they do vs data scientists vs ML engineers
- Why Java/Spring devs are well-positioned (distributed systems, APIs, reliability)
- What this course will and will not cover (we build apps, we do not train models)

**Callout pattern:** What AI engineering looks like vs data science (comparison table)

---

### M0-2: `ai-for-java-devs-what-we-will-build.md`
**Title:** The project we will build throughout this course
**Focus:**
- Introduce the e-commerce support assistant project
- Walk through the final architecture diagram (LLM + RAG + memory + tool calling)
- Show the GitHub starter repo with pre-built product catalog data and order APIs
- Explain what each module adds to the project
- Clarify the tools needed: Java 21, an OpenAI API key or Ollama installed

**Callout pattern:** Map each module to a feature of the final application

---

## Module 1 — AI Concepts Every Java Developer Must Know

> *Dev is reading docs and keeps hitting terms like "token", "embedding", "RAG", "temperature". Time to build the mental model.*

**Goal:** Give developers a clear, code-adjacent mental model of how LLMs work. No math, no papers — just the concepts that affect the code you write.

**Posts:**

### M1-1: `ai-how-llms-work-for-developers.md`
**Title:** How LLMs work — a developer's mental model (no PhD required)
**Focus:**
- What an LLM actually is: a next-token prediction engine
- Training vs inference — the difference that matters for API costs
- Why LLMs do not "know" things the way a database does
- Why the same prompt can give different answers — and when that matters
- Analogy: LLM as a very smart autocomplete with a massive training context

**Callout:** `> **Note:** LLMs are probabilistic, not deterministic. Design your apps accordingly.`

---

### M1-2: `ai-tokens-and-context-windows-explained.md`
**Title:** Tokens and context windows — what every developer must understand
**Focus:**
- What a token is (not a word, not a character — a chunk)
- How context window size limits what you can send and receive
- Token counting in Java: how to estimate before you send
- Why context window management is an engineering concern, not just a cost concern
- Common mistake: stuffing too much into the context and degrading quality

**Code sample:** Java snippet using `tiktoken` or Spring AI's token counting utilities
**Callout:** Cost table — approximate token costs for major models

---

### M1-3: `ai-model-parameters-temperature-explained.md`
**Title:** Temperature, top-p, and other model parameters — what to actually set
**Focus:**
- Temperature: what it controls, why 0 is not always right, why 1 is not always better
- Top-p (nucleus sampling): a brief explanation with practical guidance
- Max tokens: output length limits
- System prompt vs user prompt — the difference and when to use each
- What to set for different use cases: FAQ bot (low temp), creative writing (high temp)

**Comparison table:** Parameter × Use case × Recommended value range
**Callout:** `> **Tip:** Start with temperature=0.2 for factual Q&A. Raise it only if answers feel robotic.`

---

### M1-4: `ai-openai-vs-anthropic-vs-ollama-for-java-devs.md`
**Title:** Choosing an AI model for your Java application — OpenAI, Anthropic, or local
**Focus:**
- OpenAI (GPT-4o, GPT-4o-mini) — strengths, pricing, API style
- Anthropic Claude (claude-sonnet) — context window, safety focus
- Google Gemini — multimodal strengths
- Ollama + local models (llama3, mistral) — privacy, zero cost, offline
- Spring AI's model abstraction: how switching models is mostly a config change
- Decision guide: which model for which use case

**Comparison table:** Model × Context window × Strengths × Cost tier × Spring AI support
**Callout:** `> **Important:** Never hardcode model names. Externalize to application.properties so you can switch models without code changes.`

---

### M1-5: `ai-prompt-engineering-basics-for-developers.md`
**Title:** Prompt engineering basics every developer needs — before writing any code
**Focus:**
- Prompts are not magic spells — they are structured instructions
- The anatomy of a good prompt: role, context, task, output format, constraints
- Zero-shot vs few-shot prompting with examples
- Chain-of-thought prompting: asking the model to reason step by step
- What makes a prompt brittle — common mistakes
- Practical prompt templates with Java Strings and Spring AI `PromptTemplate`

**Code sample:** Bad prompt vs structured prompt, same Java code, different results
**Callout:** `> **Tip:** Always specify the output format explicitly ("respond only in JSON", "one sentence answer"). It reduces parsing surprises.`

---

## Module 2 — First Contact: Spring AI Setup and Your First LLM Calls

> *Dev has the mental model. Time to open the IDE and write code.*

**Goal:** Get a Spring AI project running, make real LLM API calls, and understand the core abstractions — `ChatClient`, `PromptTemplate`, structured output, and streaming.

**Posts:**

### M2-1: `spring-ai-getting-started-setup.md`
**Title:** Setting up Spring AI in a Spring Boot project — step by step
**Focus:**
- Adding the Spring AI BOM and the OpenAI starter dependency
- Configuring the API key via `application.properties` (and how to keep it out of code)
- The `ChatClient` bean — what it is and how to inject it
- Making the absolute simplest LLM call: a string in, a string out
- Running locally with Ollama as a free alternative during development

**Code sample:** Complete `pom.xml` snippet + `application.properties` + minimal `ChatController`
**Callout:** `> **Important:** Never commit API keys to source control. Use environment variables or Spring Cloud Config.`

---

### M2-2: `spring-ai-chat-client-deep-dive.md`
**Title:** Understanding Spring AI's ChatClient — the heart of every AI call
**Focus:**
- The `ChatClient` fluent builder API
- System prompts vs user messages — setting them separately
- Configuring default options: temperature, max tokens, model name
- The `call()` vs `stream()` choice (preview — full streaming in M2-5)
- How Spring AI's abstractions insulate you from provider-specific APIs

**Code sample:** ChatClient with system prompt + user message + response parsing
**Callout:** `> **Tip:** Set the system prompt once in the ChatClient bean configuration. It is the AI's "job description" and should not change per request.`

---

### M2-3: `spring-ai-prompt-templates.md`
**Title:** Prompt templates in Spring AI — stop hardcoding your prompts
**Focus:**
- Why string concatenation in prompts is a maintenance nightmare
- Spring AI's `PromptTemplate` and variable substitution
- Loading prompt templates from classpath files (not hardcoded in Java)
- Parameterized prompts: building a product description generator as an example
- Testing prompt templates in isolation

**Code sample:** Hardcoded prompt → `PromptTemplate` with externalized `.st` file
**Callout:** `> **Tip:** Store prompts in src/main/resources/prompts/. Treat them like SQL queries — not in Java strings, not in controllers.`

---

### M2-4: `spring-ai-structured-output.md`
**Title:** Getting structured JSON responses from LLMs in Spring AI
**Focus:**
- Why unstructured text responses are painful to parse reliably
- Spring AI's `BeanOutputConverter` — map LLM response to a Java record automatically
- Designing clean response schemas (Java records work great here)
- Handling partial or malformed JSON gracefully
- Example: ask the LLM to extract product attributes from a free-text description

**Code sample:** Java record as output schema → `BeanOutputConverter` → typed response
**Callout:** `> **Important:** The model may still produce malformed JSON. Always validate the output — do not trust the response blindly in production.`

---

### M2-5: `spring-ai-streaming-responses.md`
**Title:** Streaming LLM responses in Spring AI for a better user experience
**Focus:**
- Why streaming matters: LLMs are slow to generate full responses
- Spring AI's `stream()` method and `Flux<String>` responses
- Wiring a streaming Spring AI call to an SSE (Server-Sent Events) REST endpoint
- Client-side handling with JavaScript `EventSource` (brief)
- When to stream and when not to (background jobs do not need it)

**Code sample:** `ChatClient.stream()` → `@GetMapping(produces = TEXT_EVENT_STREAM_VALUE)` endpoint
**Callout:** `> **Note:** Streaming is a UX concern. For internal batch jobs or API-to-API calls, non-streaming is simpler and easier to handle.`

---

## Module 3 — Data and Embeddings: Teaching the AI to Understand Your Content

> *Dev got the first chatbot working. But it only knows what OpenAI was trained on. It has no idea about the company's products. Time to fix that.*

**Goal:** Understand embeddings, vector databases, and semantic search — the foundation of every AI app that works with custom data.

**Posts:**

### M3-1: `ai-embeddings-explained-for-java-devs.md`
**Title:** What are embeddings? A practical explanation for Java developers
**Focus:**
- The limitation of keyword search: why "sofa" does not match "couch"
- Embeddings as numerical representations of meaning, not words
- Similarity = proximity in vector space (cosine similarity intuition)
- What an embedding model does vs what a chat model does
- Why you need a separate embedding model and a separate vector store

**Visual analogy:** Words as points in space — similar words cluster together
**Callout:** `> **Note:** Embedding models are cheap and fast. Use them aggressively. The expensive part is the chat model call, not the embedding.`

---

### M3-2: `ai-vector-databases-explained.md`
**Title:** Vector databases explained — why regular databases are not enough for AI
**Focus:**
- What a vector database stores (vectors + metadata + original text)
- The ANN (approximate nearest neighbor) search — what it is and why it is fast
- Comparing options: pgvector (PostgreSQL), ChromaDB, Pinecone, Weaviate
- Why pgvector is often the right choice for Java teams (already run Postgres)
- Spring AI's `VectorStore` abstraction — switching databases is a config change

**Comparison table:** pgvector × ChromaDB × Pinecone — local dev, self-hosted, managed
**Callout:** `> **Tip:** Start with pgvector if your team already runs PostgreSQL. You get vector search without adding a new infrastructure dependency.`

---

### M3-3: `spring-ai-pgvector-setup.md`
**Title:** Setting up pgvector with Spring AI — store and search embeddings in PostgreSQL
**Focus:**
- Adding the `spring-ai-pgvector-store` dependency
- Running PostgreSQL + pgvector extension with Docker Compose
- Spring AI auto-configuration: `VectorStore` bean setup
- Creating the vector table with the correct schema
- Verifying the setup: store one document, retrieve it

**Code sample:** Docker Compose → `application.properties` → `VectorStore` injection → test
**Callout:** `> **Important:** The vector dimension must match the embedding model. OpenAI text-embedding-3-small produces 1536-dimensional vectors. Set this in your table schema.`

---

### M3-4: `spring-ai-embedding-documents.md`
**Title:** Embedding and storing documents with Spring AI — a step-by-step guide
**Focus:**
- The `DocumentReader` → `DocumentTransformer` → `VectorStore` pipeline
- Reading documents: `TextReader`, `JsonReader`, `TikaDocumentReader` (PDFs, Word)
- The `TokenTextSplitter`: chunk size, overlap, and why chunking strategy matters
- Adding metadata to documents: source, category, date (for filtered search later)
- Bulk loading the product catalog into the vector store

**Code sample:** Full ingestion pipeline for a JSON product catalog file
**Callout:** `> **Tip:** Store source URL and document category as metadata. You will need it later to show users where answers came from.`

---

### M3-5: `spring-ai-semantic-search.md`
**Title:** Semantic search in Spring AI — find by meaning, not by keyword
**Focus:**
- Querying the vector store with `VectorStore.similaritySearch()`
- `SearchRequest`: query string, top-k results, similarity threshold, metadata filters
- Comparing semantic search vs full-text search (when each wins)
- Building a simple product search endpoint that finds semantically similar items
- Measuring search quality: are the top results actually relevant?

**Code sample:** `/api/products/search?q=waterproof+headphones` returning semantically matched products
**Callout:** `> **Note:** Semantic search is not always better than keyword search. For exact-match scenarios like order IDs or product codes, use your regular database.`

---

## Module 4 — RAG: Teach the AI About Your Business

> *Dev can search the product catalog semantically. Now it is time to combine that search with the LLM so the AI can answer questions using the actual product data.*

**Goal:** Build a complete RAG (Retrieval Augmented Generation) pipeline that grounds LLM answers in real company data.

**Posts:**

### M4-1: `ai-rag-explained-for-java-devs.md`
**Title:** What is RAG and why your AI app almost certainly needs it
**Focus:**
- The core LLM problem: training data has a cutoff and does not include your data
- RAG in plain terms: retrieve relevant context → inject into prompt → LLM answers from it
- The RAG pipeline: query → embed → search → augment prompt → generate
- When RAG is the right tool and when it is not (small fixed datasets, factual lookup)
- Why RAG beats fine-tuning for most business applications (cheaper, updatable, explainable)

**Diagram:** Simple RAG pipeline flow
**Callout:** `> **Important:** RAG quality depends entirely on retrieval quality. A great LLM with poor retrieval gives poor answers. Fix the retrieval first.`

---

### M4-2: `spring-ai-rag-pipeline-basics.md`
**Title:** Building your first RAG pipeline with Spring AI
**Focus:**
- The two phases: ingestion (offline) and retrieval + generation (online)
- `QuestionAnswerAdvisor` — Spring AI's built-in RAG advisor
- Wiring it into a `ChatClient` with one line
- The default prompt template that injects retrieved context
- Verifying it works: ask a question only answerable from the product catalog

**Code sample:** `ChatClient` + `QuestionAnswerAdvisor` + `VectorStore` = functional RAG in ~10 lines
**Callout:** `> **Tip:** Log the retrieved documents for every query during development. Seeing what the model gets to read explains why it answers the way it does.`

---

### M4-3: `rag-chunking-strategy-matters.md`
**Title:** Chunking strategy in RAG — the decision that silently kills answer quality
**Focus:**
- Why chunk size is one of the most impactful RAG tuning levers
- Too small: loses context. Too large: introduces irrelevant content.
- Fixed-size vs semantic chunking
- Overlap between chunks: why it helps at boundaries
- Testing chunking strategy: manual inspection of retrieved chunks for representative queries
- Recommended starting points for different document types (FAQs, manuals, policies)

**Comparison table:** Chunk size × Overlap × Use case
**Callout:** `> **Caution:** Do not just use the default chunk size. Run 10–20 test queries and inspect what the retriever returns. Tune from evidence, not intuition.`

---

### M4-4: `spring-ai-rag-document-qa-chatbot.md`
**Title:** Building a document Q&A chatbot with Spring AI and RAG
**Focus:**
- Building a `/api/chat` endpoint that answers questions about product catalog and store policies
- Ingesting multiple document types: product JSON, FAQ markdown, policy PDF
- Metadata filtering in retrieval: scope search to a category or document type
- Adding source attribution: tell the user which document the answer came from
- Graceful handling of out-of-scope questions (no hallucination fallback)

**Code sample:** Full chatbot endpoint with retrieval, source attribution, and scope guardrail
**Callout:** `> **Important:** Always tell the LLM what to do when it cannot find a relevant answer: "If the context does not contain the answer, say you do not know." Without this, LLMs will make things up.`

---

### M4-5: `rag-quality-reranking-hybrid-search.md`
**Title:** Improving RAG quality — reranking and hybrid search
**Focus:**
- Why top-k cosine similarity is not always the best ranking
- Reranking: using a cross-encoder to re-score retrieved chunks
- Hybrid search: combining vector similarity with BM25 keyword search
- Spring AI support for reranking (pluggable `DocumentPostProcessor`)
- Measuring improvement: before and after on a set of representative queries
- When to invest in RAG quality improvements vs moving on

**Callout:** `> **Note:** For most small teams, well-tuned chunking + good metadata filtering delivers 80% of the quality benefit. Only invest in reranking when you have measured the quality gap.`

---

## Module 5 — Memory: Conversations That Actually Make Sense

> *Dev's chatbot answers questions well — one at a time. But every new question arrives with no memory of what was said before. Users feel like they're talking to a goldfish.*

**Goal:** Add conversation memory so the AI assistant maintains context across multiple turns, without exploding the token budget.

**Posts:**

### M5-1: `ai-why-llms-forget-context-window.md`
**Title:** Why LLMs forget everything — and what you must do about it
**Focus:**
- LLMs are stateless: each API call is independent
- Conversation history must be sent with every request
- The naive fix: send the full chat history — and why it fails at scale (token explosion)
- The three strategies: full history, windowed history, summarized history
- Choosing the right memory strategy for your use case

**Diagram:** Token usage growth with full history vs windowed history vs summarization
**Callout:** `> **Important:** Statelessness is a feature, not a bug — it makes LLM APIs horizontally scalable. Your memory strategy is the app-layer concern.`

---

### M5-2: `spring-ai-chat-memory-in-memory.md`
**Title:** Chat memory in Spring AI — building a chatbot that remembers
**Focus:**
- Spring AI's `ChatMemory` abstraction and `InMemoryChatMemory`
- `MessageChatMemoryAdvisor` — injecting history into every request automatically
- Session-based conversations: tying memory to a user session or conversation ID
- The `conversationId` parameter: how to manage multiple concurrent users
- Testing a multi-turn conversation end to end

**Code sample:** ChatClient + `MessageChatMemoryAdvisor` + session ID from HTTP header
**Callout:** `> **Tip:** Use the HTTP session ID or a UUID from a cookie as the conversationId. Do not use user IDs — one user may have multiple conversations.`

---

### M5-3: `spring-ai-persistent-chat-memory.md`
**Title:** Persistent chat memory in Spring AI — survive restarts and scale horizontally
**Focus:**
- Why `InMemoryChatMemory` is not suitable for production (lost on restart, no multi-instance)
- Implementing `ChatMemory` with a database (JDBC-backed implementation)
- Storing messages in PostgreSQL with a simple schema
- Retrieving conversation history efficiently for the current window
- Cache considerations for high-traffic chatbots

**Code sample:** Custom `JdbcChatMemory` implementing `ChatMemory` interface
**Callout:** `> **Caution:** Chat history grows forever. Add a retention policy — keep the last N messages, or archive messages older than 30 days.`

---

### M5-4: `ai-memory-window-and-summarization.md`
**Title:** Managing context window efficiently — windowed memory and summarization
**Focus:**
- Windowed memory: keep only the last N turns
- Summarization memory: compress old history into a summary, keep recent turns full
- Spring AI's `SummarizingChatMemoryAdvisor`
- When summarization helps and when it loses critical context
- Hybrid approach: window for recent, summary for older history

**Comparison table:** Memory strategy × Token cost × Information retention × Complexity
**Callout:** `> **Note:** Most support chatbots work well with a 10-turn window. Only add summarization if users are having very long, complex conversations.`

---

## Module 6 — Agents and Tool Calling: AI That Takes Action

> *The support assistant now knows the product catalog and remembers the conversation. But customers ask things like "where is my order?" — and the AI has no way to check. Time to give it tools.*

**Goal:** Build an AI agent that can call Java methods (tools) to fetch live data, then reason over the results to generate grounded answers.

**Posts:**

### M6-1: `ai-agents-explained-for-developers.md`
**Title:** What is an AI agent? Moving beyond single LLM calls
**Focus:**
- The LLM call model vs the agent model: reasoning loop
- The three roles: LLM as brain, tools as hands, memory as short-term storage
- The ReAct pattern: reason → act → observe → reason (repeat)
- When to use an agent vs a simple RAG chain vs a single prompt
- What can go wrong with agents: infinite loops, wrong tool selection, hallucinated tool arguments

**Diagram:** Agent loop: LLM → choose tool → execute → observe → LLM again
**Callout:** `> **Important:** Agents are powerful but unpredictable. Never give an agent a tool with destructive side effects (like deleting records) unless you have human-in-the-loop confirmation.`

---

### M6-2: `spring-ai-function-calling-basics.md`
**Title:** Function calling in Spring AI — let the LLM use your Java methods
**Focus:**
- What function/tool calling is: LLM signals which function to call, you call it, you return the result
- Spring AI's `@Bean` + `Function<Input, Output>` pattern for tool definitions
- The `tools()` method on `ChatClient` to register tools per request
- A simple example: a tool that returns today's date, and the LLM uses it
- How tool definitions are sent to the model as JSON schema

**Code sample:** `Function<OrderLookupRequest, OrderResponse>` bean registered as a tool
**Callout:** `> **Tip:** Write your tool functions to be narrow and focused. One tool per action is easier for the model to select correctly.`

---

### M6-3: `spring-ai-agent-order-status.md`
**Title:** Building an AI agent that checks order status — a step-by-step example
**Focus:**
- Designing the tools: `getOrderStatus(orderId)`, `getOrderItems(orderId)`, `getShippingETA(orderId)`
- Writing the tool functions as Spring `@Component` beans
- Registering them with `ChatClient` + enabling tool choice
- Writing a system prompt that tells the LLM when and how to use the tools
- Tracing the agent loop: watch the LLM plan, call tools, and synthesize the answer
- Handling the case when the order ID is not found

**Code sample:** Three tool beans + ChatClient config + example multi-tool invocation
**Callout:** `> **Caution:** Tool arguments come from the LLM — always validate them before passing to your database or service layer. Treat them like user input.`

---

### M6-4: `spring-ai-combining-rag-and-tools.md`
**Title:** Combining RAG and tool calling in one Spring AI agent
**Focus:**
- The support assistant now needs both: policy questions (RAG) and order status (tools)
- Using `QuestionAnswerAdvisor` alongside function tools in the same `ChatClient`
- How the model decides: retrieve from docs vs call a function
- Writing a system prompt that guides the routing clearly
- The complete support assistant: greets user, answers product questions, checks orders

**Code sample:** Full `ChatClient` configuration with `QuestionAnswerAdvisor` + two tool beans
**Callout:** `> **Note:** When combining RAG and tools, be explicit in the system prompt about which type of question warrants retrieval and which warrants a function call. Ambiguity leads to wrong routing.`

---

### M6-5: `ai-agent-patterns-when-to-use-what.md`
**Title:** AI agent patterns — when to use simple chains, RAG, or full agents
**Focus:**
- Decision guide: simple prompt → RAG → agent → multi-agent
- When agents add complexity without adding value
- The cost of agentic loops: more LLM calls = higher latency + higher cost
- Parallelism in tool calls: Spring AI support for parallel tool execution
- Introduction to multi-agent patterns (brief — for future posts)
- Summary: the support assistant architecture and when each pattern was applied

**Decision table:** Problem type × Recommended pattern × Trade-off
**Callout:** `> **Tip:** Start with the simplest pattern that works. Add agentic complexity only when the simpler approach demonstrably fails for your use case.`

---

## Module 7 — Production: Shipping AI Features Safely

> *Dev has a working AI assistant. Now the engineering lead says: "Before we go live, I need to know this is observable, tested, and won't bankrupt us."*

**Goal:** Operationalize AI features — observability, cost control, testing strategies, safety guardrails, and error handling.

**Posts:**

### M7-1: `ai-observability-tracing-llm-calls.md`
**Title:** Observability for AI applications — tracing and logging LLM calls in Spring Boot
**Focus:**
- What to observe in AI apps: latency, token usage, model version, prompt/response (careful about PII)
- Spring AI's Micrometer integration: auto-instrumented spans for every LLM call
- Adding custom metrics: tokens per request, retrieval hit rate, tool call count
- Logging prompts and responses safely (truncation, PII scrubbing)
- Connecting traces to distributed tracing (Zipkin/Grafana Tempo)

**Code sample:** Micrometer metrics in `application.properties` + custom `ObservationHandler` for token logging
**Callout:** `> **Important:** Do not log full prompts in production by default — they may contain user PII. Log only what you need, and redact what you must.`

---

### M7-2: `ai-cost-management-token-budgets.md`
**Title:** Controlling AI costs in production — token budgets, caching, and model selection
**Focus:**
- Understanding where costs come from: input tokens, output tokens, embedding calls
- Estimating monthly cost from QPS and average token usage
- Smart model selection: use GPT-4o-mini for simple queries, GPT-4o only when needed
- Prompt caching: OpenAI prefix caching, how to structure prompts to benefit from it
- Response caching for frequent identical queries (semantic caching with the vector store)
- Setting hard limits per user or per session

**Cost table:** Model × Input cost × Output cost × When to use
**Callout:** `> **Caution:** Agentic loops multiply API calls. A 3-tool agent call may cost 5× a single call. Budget for it explicitly.`

---

### M7-3: `ai-testing-strategies-non-deterministic.md`
**Title:** Testing AI features — how do you test something non-deterministic?
**Focus:**
- Why unit tests alone are not enough for AI features
- Testing the plumbing (prompt construction, retrieval, tool execution) vs testing the LLM
- Mocking LLM calls with Spring AI test utilities — `MockChatClient`
- Evaluating AI output quality: `LLM as judge` pattern
- Snapshot testing for RAG: fixed corpus + fixed queries + expected retrieved docs
- Regression test set: a curated list of representative queries and expected behavior

**Code sample:** Spring AI test mock + LLM-as-judge evaluation function
**Callout:** `> **Note:** You cannot write assertions like `assertEquals("Paris", answer)` for most AI outputs. Write assertions about structure, tone, presence of key facts, and absence of hallucinations.`

---

### M7-4: `ai-safety-guardrails-input-output.md`
**Title:** Safety and guardrails for AI apps — protecting users and your system
**Focus:**
- Input guardrails: detecting prompt injection attempts, topic restriction, PII detection
- Output guardrails: checking for harmful content, hallucinated facts, off-topic responses
- Spring AI's `SafeGuardAdvisor` and content filtering hooks
- Implementing a topic restriction guardrail: "only answer questions about products and orders"
- Handling jailbreak attempts gracefully without exposing error details

**Code sample:** Custom `RequestResponseAdvisor` that rejects off-topic queries
**Callout:** `> **Important:** Prompt injection is a real threat. Users can try to override the system prompt. Validate that the LLM's response is within the expected scope before returning it.`

---

### M7-5: `ai-error-handling-rate-limits-fallbacks.md`
**Title:** Error handling for AI apps — rate limits, timeouts, and fallback strategies
**Focus:**
- LLM API errors that you will encounter: rate limits (429), timeouts, model overload (503)
- Retry with exponential backoff for transient errors
- Fallback strategies: queue the request, degrade gracefully, switch to a cheaper model
- Circuit breaker pattern for LLM calls (Resilience4j integration)
- User-facing error messages that do not expose internals

**Code sample:** Resilience4j `@CircuitBreaker` on the AI service + fallback method
**Callout:** `> **Tip:** Always set a response timeout on LLM calls. Without it, a slow model response can hang your request thread (or goroutine) indefinitely.`

---

### M7-6: `ai-deployment-configuration-best-practices.md`
**Title:** Deployment and configuration best practices for AI-powered Spring Boot apps
**Focus:**
- Externalize all AI config: model name, temperature, max tokens, API keys
- Spring profiles for AI: `dev` uses Ollama, `prod` uses OpenAI
- Separating the ingestion job (offline) from the chat API (online)
- Health checks for LLM connectivity (Spring Boot Actuator health indicator)
- Graceful shutdown: draining in-flight AI requests before stopping the pod
- Environment checklist before go-live

**Code sample:** `application-dev.yaml` vs `application-prod.yaml` with different AI config
**Callout:** `> **Important:** The ingestion pipeline and the chat API are different workloads with different scaling needs. Consider running them as separate services or separate pods.`

---

## Module 8 — Advanced Topics: Beyond the Basics

> *The support assistant is in production. Dev is curious: what else is possible?*

**Goal:** Introduce advanced topics that open doors for further learning — without trying to cover them exhaustively.

**Posts:**

### M8-1: `spring-ai-local-models-ollama.md`
**Title:** Running local AI models with Ollama and Spring AI — private, free, offline
**Focus:**
- Why local models matter: data privacy, cost, offline capability
- Setting up Ollama and pulling a model (llama3.2, mistral, nomic-embed-text)
- Switching Spring AI from OpenAI to Ollama with only a config change
- Performance expectations: local vs hosted models (quality, latency trade-offs)
- Use cases best suited for local models: internal tools, dev environments, privacy-sensitive data

**Code sample:** `application-local.yaml` pointing to Ollama + Docker Compose for team dev setup
**Callout:** `> **Tip:** Use Ollama in your local dev profile and CI. It removes the need for an API key during tests and keeps costs zero during development.`

---

### M8-2: `spring-ai-multimodal-image-understanding.md`
**Title:** Multimodal AI in Spring AI — adding image understanding to your Java app
**Focus:**
- What multimodal means: input is not just text (images, audio, documents)
- GPT-4o and Claude's vision capabilities
- Spring AI's `UserMessage` with `Media` content type for image input
- Use case: analyze a product image and generate a description
- Use case: extract text from a receipt or invoice image (document OCR via LLM)
- Token cost implications of image inputs

**Code sample:** `ChatClient` sending a `MultipartFile` image + extracting structured data from it
**Callout:** `> **Note:** Image inputs are significantly more expensive in tokens than text. Resize images to the minimum resolution needed before sending to the model.`

---

### M8-3: `langchain4j-vs-spring-ai-comparison.md`
**Title:** LangChain4j vs Spring AI — which Java AI framework should you use?
**Focus:**
- What LangChain4j offers: rich agent tooling, wide model support, lower-level control
- What Spring AI offers: native Spring integration, simpler setup, opinionated defaults
- Feature comparison: RAG, memory, tool calling, streaming, model support
- Integration compatibility: both work with Spring Boot
- Team and project factors that drive the choice
- Can you use both? (briefly — for specific capabilities)

**Comparison table:** Feature × Spring AI × LangChain4j
**Callout:** `> **Note:** If your team is already comfortable with Spring's programming model, start with Spring AI. If you need agent capabilities beyond what Spring AI provides today, evaluate LangChain4j.`

---

### M8-4: `ai-whats-next-learning-path.md`
**Title:** What to learn next — your AI engineering learning path after this course
**Focus:**
- Recap: what the course covered and the support assistant that Dev shipped
- What was intentionally left out and where to go for it
  - Model fine-tuning: Hugging Face, OpenAI fine-tuning API
  - Model evaluation at scale: RAGAS framework
  - Advanced agent frameworks: LangGraph4j, multi-agent systems
  - Deploying vector stores at scale: managed Pinecone, Weaviate Cloud
  - AI gateway patterns: rate limiting, cost allocation, model routing
- Recommended reading, communities, and tools
- How the AI engineering field is evolving: what junior devs should watch

**Callout:** `> **Tip:** The fundamentals you learned — prompt design, RAG architecture, context management, cost control — apply regardless of which model or framework is current. Invest in understanding patterns, not just APIs.`

---

## Blog Post Format Reference

Every post in this course follows the same structure (inherited from WRITING_GUIDE.md with AI-specific additions):

```markdown
---
title: [Descriptive title]
description: [1-2 sentences for SEO — state the problem and the outcome]
pubDatetime: "YYYY-MM-DDTHH:MM:SS+05:30"
tags:
  - springboot
  - spring-ai
  - java
  - [topic-specific tag]
---

[Opening: 2-3 sentences. State the real problem Dev faces. Make it feel familiar.]

## Table of contents

## The problem [in older approach / without this tool]
[2-3 subsections. Concrete pain points. Code showing the painful way.]

> callout-important: Why this matters in production

## What [technology/approach] changes
[The new way. Code-first. Minimal boilerplate.]

> callout-tip: Most actionable advice from this section

## Old way vs new way
[Quick comparison table]

## Practical tips
[3-5 numbered tips, concrete and opinionated]

> callout-caution: What to watch out for

## [Step-by-step / Migration checklist]
[Numbered checklist. Actionable. Can be used as a PR checklist.]

> callout-note: Closing principle

## References
[Links to Spring AI docs, Spring Boot docs, relevant specs — always target="_blank"]
```

**Tags to establish for this course:**
- `spring-ai` — Spring AI framework
- `llm` — Large language models in general
- `rag` — Retrieval Augmented Generation
- `embeddings` — Embedding models and vector search
- `ai-agents` — Agent patterns and tool calling
- `ollama` — Local model runtime
- `vector-db` — Vector database topics
- `prompt-engineering` — Prompting techniques

---

## Module and Post Summary

| # | Slug | Title | Tags |
|---|---|---|---|
| M0-1 | `ai-for-java-devs-why-now` | Why Java developers should care about AI engineering in 2025 | `java`, `spring-ai`, `llm` |
| M0-2 | `ai-for-java-devs-what-we-will-build` | The project we will build throughout this course | `java`, `spring-ai` |
| M1-1 | `ai-how-llms-work-for-developers` | How LLMs work — a developer's mental model | `llm`, `java` |
| M1-2 | `ai-tokens-and-context-windows-explained` | Tokens and context windows explained | `llm`, `java` |
| M1-3 | `ai-model-parameters-temperature-explained` | Temperature, top-p, and other model parameters | `llm`, `java` |
| M1-4 | `ai-openai-vs-anthropic-vs-ollama-for-java-devs` | Choosing an AI model for your Java application | `llm`, `java`, `ollama` |
| M1-5 | `ai-prompt-engineering-basics-for-developers` | Prompt engineering basics every developer needs | `prompt-engineering`, `java` |
| M2-1 | `spring-ai-getting-started-setup` | Setting up Spring AI in a Spring Boot project | `spring-ai`, `springboot`, `java` |
| M2-2 | `spring-ai-chat-client-deep-dive` | Understanding Spring AI's ChatClient | `spring-ai`, `springboot`, `java` |
| M2-3 | `spring-ai-prompt-templates` | Prompt templates in Spring AI | `spring-ai`, `prompt-engineering`, `java` |
| M2-4 | `spring-ai-structured-output` | Getting structured JSON responses from LLMs | `spring-ai`, `java`, `json` |
| M2-5 | `spring-ai-streaming-responses` | Streaming LLM responses in Spring AI | `spring-ai`, `springboot`, `java` |
| M3-1 | `ai-embeddings-explained-for-java-devs` | What are embeddings? A practical explanation | `embeddings`, `llm`, `java` |
| M3-2 | `ai-vector-databases-explained` | Vector databases explained | `vector-db`, `embeddings`, `java` |
| M3-3 | `spring-ai-pgvector-setup` | Setting up pgvector with Spring AI | `spring-ai`, `vector-db`, `springboot` |
| M3-4 | `spring-ai-embedding-documents` | Embedding and storing documents with Spring AI | `spring-ai`, `embeddings`, `rag` |
| M3-5 | `spring-ai-semantic-search` | Semantic search in Spring AI | `spring-ai`, `vector-db`, `embeddings` |
| M4-1 | `ai-rag-explained-for-java-devs` | What is RAG and why your AI app needs it | `rag`, `llm`, `java` |
| M4-2 | `spring-ai-rag-pipeline-basics` | Building your first RAG pipeline with Spring AI | `spring-ai`, `rag`, `springboot` |
| M4-3 | `rag-chunking-strategy-matters` | Chunking strategy in RAG | `rag`, `embeddings`, `spring-ai` |
| M4-4 | `spring-ai-rag-document-qa-chatbot` | Building a document Q&A chatbot with Spring AI | `spring-ai`, `rag`, `springboot` |
| M4-5 | `rag-quality-reranking-hybrid-search` | Improving RAG quality — reranking and hybrid search | `rag`, `spring-ai`, `vector-db` |
| M5-1 | `ai-why-llms-forget-context-window` | Why LLMs forget everything | `llm`, `spring-ai` |
| M5-2 | `spring-ai-chat-memory-in-memory` | Chat memory in Spring AI | `spring-ai`, `springboot`, `java` |
| M5-3 | `spring-ai-persistent-chat-memory` | Persistent chat memory in Spring AI | `spring-ai`, `springboot`, `java` |
| M5-4 | `ai-memory-window-and-summarization` | Managing context window efficiently | `spring-ai`, `llm`, `rag` |
| M6-1 | `ai-agents-explained-for-developers` | What is an AI agent? | `ai-agents`, `llm`, `java` |
| M6-2 | `spring-ai-function-calling-basics` | Function calling in Spring AI | `spring-ai`, `ai-agents`, `java` |
| M6-3 | `spring-ai-agent-order-status` | Building an AI agent that checks order status | `spring-ai`, `ai-agents`, `springboot` |
| M6-4 | `spring-ai-combining-rag-and-tools` | Combining RAG and tool calling in one agent | `spring-ai`, `rag`, `ai-agents` |
| M6-5 | `ai-agent-patterns-when-to-use-what` | AI agent patterns — when to use what | `ai-agents`, `rag`, `spring-ai` |
| M7-1 | `ai-observability-tracing-llm-calls` | Observability for AI applications | `spring-ai`, `springboot`, `java` |
| M7-2 | `ai-cost-management-token-budgets` | Controlling AI costs in production | `spring-ai`, `llm`, `springboot` |
| M7-3 | `ai-testing-strategies-non-deterministic` | Testing AI features | `spring-ai`, `springboot`, `java` |
| M7-4 | `ai-safety-guardrails-input-output` | Safety and guardrails for AI apps | `spring-ai`, `springboot`, `java` |
| M7-5 | `ai-error-handling-rate-limits-fallbacks` | Error handling for AI apps | `spring-ai`, `springboot`, `java` |
| M7-6 | `ai-deployment-configuration-best-practices` | Deployment best practices for AI Spring Boot apps | `spring-ai`, `springboot`, `java` |
| M8-1 | `spring-ai-local-models-ollama` | Running local AI models with Ollama | `spring-ai`, `ollama`, `java` |
| M8-2 | `spring-ai-multimodal-image-understanding` | Multimodal AI in Spring AI | `spring-ai`, `llm`, `java` |
| M8-3 | `langchain4j-vs-spring-ai-comparison` | LangChain4j vs Spring AI | `spring-ai`, `java`, `llm` |
| M8-4 | `ai-whats-next-learning-path` | What to learn next — your AI engineering path | `java`, `spring-ai`, `llm` |
