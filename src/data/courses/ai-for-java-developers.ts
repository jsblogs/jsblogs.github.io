export type PostStatus = "published" | "coming-soon";
export type ModuleStatus = "available" | "in-progress" | "coming-soon";

export interface CoursePost {
  title: string;
  slug: string;
  status: PostStatus;
}

export interface CourseModule {
  id: number;
  title: string;
  desc: string;
  status: ModuleStatus;
  posts: CoursePost[];
}

export const COURSE_META = {
  title: "AI Engineering for Java Developers",
  description:
    "A hands-on course that takes you from zero AI knowledge to shipping production-ready AI features with Spring AI. 9 modules, 41 posts, one real project.",
  url: "/courses/ai-for-java-developers",
  startSlug: "ai-for-java-devs-why-now",
} as const;

export const COURSE_MODULES: CourseModule[] = [
  {
    id: 0,
    title: "The New World",
    desc: "Understand the AI engineering landscape, what changed, and what we build across the course.",
    status: "available",
    posts: [
      {
        title: "Why Java developers should care about AI engineering right now",
        slug: "ai-for-java-devs-why-now",
        status: "published",
      },
      {
        title: "The AI project we will build throughout this course",
        slug: "ai-for-java-devs-what-we-will-build",
        status: "published",
      },
    ],
  },
  {
    id: 1,
    title: "AI Concepts Every Java Developer Must Know",
    desc: "Build mental models for LLMs, tokens, context windows, and prompt engineering before writing any code.",
    status: "available",
    posts: [
      {
        title: "How LLMs work — a developer's mental model (no PhD required)",
        slug: "ai-how-llms-work-for-developers",
        status: "published",
      },
      {
        title: "Tokens and context windows — what every developer must understand",
        slug: "ai-tokens-and-context-windows-explained",
        status: "published",
      },
      {
        title: "Temperature, top-p, and model parameters — what to actually set",
        slug: "ai-model-parameters-temperature-explained",
        status: "published",
      },
      {
        title: "Choosing an AI model for your Java application — OpenAI, Anthropic, or local",
        slug: "ai-openai-vs-anthropic-vs-ollama-for-java-devs",
        status: "published",
      },
      {
        title: "Prompt engineering basics every developer needs before writing any code",
        slug: "ai-prompt-engineering-basics-for-developers",
        status: "published",
      },
    ],
  },
  {
    id: 2,
    title: "First Contact — Spring AI Setup and Your First LLM Calls",
    desc: "Get Spring AI running, make real LLM API calls, and build your first AI-powered endpoint.",
    status: "available",
    posts: [
      {
        title: "Setting up Spring AI in a Spring Boot project — step by step",
        slug: "spring-ai-getting-started-setup",
        status: "published",
      },
      {
        title: "Understanding Spring AI's ChatClient — the heart of every AI call",
        slug: "spring-ai-chat-client-deep-dive",
        status: "published",
      },
      {
        title: "Prompt templates in Spring AI — stop hardcoding your prompts",
        slug: "spring-ai-prompt-templates",
        status: "published",
      },
      {
        title: "Getting structured JSON responses from LLMs in Spring AI",
        slug: "spring-ai-structured-output",
        status: "published",
      },
      {
        title: "Streaming LLM responses in Spring AI for a better user experience",
        slug: "spring-ai-streaming-responses",
        status: "published",
      },
    ],
  },
  {
    id: 3,
    title: "Data and Embeddings — Teaching the AI to Understand Your Content",
    desc: "Understand embeddings, set up a vector database, and enable semantic search over your own data.",
    status: "available",
    posts: [
      {
        title: "What are embeddings? A practical explanation for Java developers",
        slug: "ai-embeddings-explained-for-java-devs",
        status: "published",
      },
      {
        title: "Vector databases explained — why regular databases are not enough for AI",
        slug: "ai-vector-databases-explained",
        status: "published",
      },
      {
        title: "Setting up pgvector with Spring AI — store and search embeddings in PostgreSQL",
        slug: "spring-ai-pgvector-setup",
        status: "published",
      },
      {
        title: "Embedding and storing documents with Spring AI — a step-by-step guide",
        slug: "spring-ai-embedding-documents",
        status: "published",
      },
      {
        title: "Semantic search in Spring AI — find by meaning, not by keyword",
        slug: "spring-ai-semantic-search",
        status: "published",
      },
    ],
  },
  {
    id: 4,
    title: "RAG — Teach the AI About Your Business",
    desc: "Build a complete RAG pipeline that grounds LLM answers in your company's real data.",
    status: "available",
    posts: [
      {
        title: "What is RAG and why your AI app almost certainly needs it",
        slug: "ai-rag-explained-for-java-devs",
        status: "published",
      },
      {
        title: "Building your first RAG pipeline with Spring AI",
        slug: "spring-ai-rag-pipeline-basics",
        status: "published",
      },
      {
        title: "Chunking strategy in RAG — the decision that silently kills answer quality",
        slug: "rag-chunking-strategy-matters",
        status: "published",
      },
      {
        title: "Building a document Q&A chatbot with Spring AI and RAG",
        slug: "spring-ai-rag-document-qa-chatbot",
        status: "published",
      },
      {
        title: "Improving RAG quality — reranking and hybrid search",
        slug: "rag-quality-reranking-hybrid-search",
        status: "published",
      },
    ],
  },
  {
    id: 5,
    title: "Memory — Conversations That Actually Make Sense",
    desc: "Add conversation memory so the AI assistant maintains context across multiple turns.",
    status: "available",
    posts: [
      {
        title: "Why LLMs forget everything — and what you must do about it",
        slug: "ai-why-llms-forget-context-window",
        status: "published",
      },
      {
        title: "Chat memory in Spring AI — building a chatbot that remembers",
        slug: "spring-ai-chat-memory-in-memory",
        status: "published",
      },
      {
        title: "Persistent chat memory in Spring AI — survive restarts and scale horizontally",
        slug: "spring-ai-persistent-chat-memory",
        status: "published",
      },
      {
        title: "Managing context window efficiently — windowed memory and summarization",
        slug: "ai-memory-window-and-summarization",
        status: "published",
      },
    ],
  },
  {
    id: 6,
    title: "Agents and Tools — AI That Takes Action",
    desc: "Build an AI agent that calls Java methods to fetch live data and reason over the results.",
    status: "available",
    posts: [
      {
        title: "What is an AI agent? Moving beyond single LLM calls",
        slug: "ai-agents-explained-for-developers",
        status: "published",
      },
      {
        title: "Function calling in Spring AI — let the LLM use your Java methods",
        slug: "spring-ai-function-calling-basics",
        status: "published",
      },
      {
        title: "Building an AI agent that checks order status — a step-by-step example",
        slug: "spring-ai-agent-order-status",
        status: "published",
      },
      {
        title: "Combining RAG and tool calling in one Spring AI agent",
        slug: "spring-ai-combining-rag-and-tools",
        status: "published",
      },
      {
        title: "AI agent patterns — when to use simple chains, RAG, or full agents",
        slug: "ai-agent-patterns-when-to-use-what",
        status: "published",
      },
    ],
  },
  {
    id: 7,
    title: "Production — Shipping AI Features Safely",
    desc: "Add observability, cost controls, tests, guardrails, and error handling to go live with confidence.",
    status: "available",
    posts: [
      {
        title: "Observability for AI applications — tracing and logging LLM calls in Spring Boot",
        slug: "ai-observability-tracing-llm-calls",
        status: "published",
      },
      {
        title: "Controlling AI costs in production — token budgets, caching, and model selection",
        slug: "ai-cost-management-token-budgets",
        status: "published",
      },
      {
        title: "Testing AI features — how do you test something non-deterministic?",
        slug: "ai-testing-strategies-non-deterministic",
        status: "published",
      },
      {
        title: "Safety and guardrails for AI apps — protecting users and your system",
        slug: "ai-safety-guardrails-input-output",
        status: "published",
      },
      {
        title: "Error handling for AI apps — rate limits, timeouts, and fallback strategies",
        slug: "ai-error-handling-rate-limits-fallbacks",
        status: "published",
      },
      {
        title: "Deployment and configuration best practices for AI-powered Spring Boot apps",
        slug: "ai-deployment-configuration-best-practices",
        status: "published",
      },
    ],
  },
  {
    id: 8,
    title: "Advanced Topics — Beyond the Basics",
    desc: "Local models with Ollama, multimodal AI, LangChain4j comparison, and your next learning steps.",
    status: "available",
    posts: [
      {
        title: "Running local AI models with Ollama and Spring AI — private, free, offline",
        slug: "spring-ai-local-models-ollama",
        status: "published",
      },
      {
        title: "Multimodal AI in Spring AI — adding image understanding to your Java app",
        slug: "spring-ai-multimodal-image-understanding",
        status: "published",
      },
      {
        title: "LangChain4j vs Spring AI — which Java AI framework should you use?",
        slug: "langchain4j-vs-spring-ai-comparison",
        status: "published",
      },
      {
        title: "What to learn next — your AI engineering learning path after this course",
        slug: "ai-whats-next-learning-path",
        status: "published",
      },
    ],
  },
];

/** Flat ordered list of all course posts with their module context.
 *  Used by PostDetails to find the next post in the course sequence. */
export interface CoursePostEntry {
  slug: string;
  title: string;
  moduleId: number;
  moduleTitle: string;
  status: PostStatus;
}

export const COURSE_POST_LIST: CoursePostEntry[] = COURSE_MODULES.flatMap(m =>
  m.posts.map(p => ({
    slug: p.slug,
    title: p.title,
    status: p.status,
    moduleId: m.id,
    moduleTitle: m.title,
  }))
);

/** All course definitions — add new courses here as the blog grows. */
export const ALL_COURSES = [
  { meta: COURSE_META, posts: COURSE_POST_LIST },
] as const;
