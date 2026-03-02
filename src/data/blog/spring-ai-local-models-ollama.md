---
title: Running local AI models with Ollama and Spring AI — private, free, offline
description: Ollama runs open-weight LLMs and embedding models on your own machine. No API key, no data leaving your network, no per-token cost. This post shows how to swap Spring AI from OpenAI to Ollama with a profile switch — and where local models fall short.
pubDatetime: "2026-03-03T18:20:00+05:30"
tags:
  - spring-ai
  - springboot
  - java
---

Dev's team had a new requirement: a customer wanted their support assistant deployed on-premise. No data was allowed to leave their network. OpenAI was out. So was every cloud provider.

The answer was Ollama.

## Table of contents

## What Ollama is

Ollama is an open-source tool that runs large language models locally. It manages model downloads, GPU/CPU inference, and exposes an OpenAI-compatible HTTP API on `localhost:11434`.

From Spring AI's perspective, Ollama looks almost identical to OpenAI. The same `ChatClient` API works unchanged — only the underlying model and base URL differ. Switch the profile, switch the provider.

## Installing Ollama

```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.com/install.sh | sh

# Start the server
ollama serve
```

Pull the models you need:

```bash
# Chat models
ollama pull llama3.2:3b        # fast, good for dev
ollama pull llama3.1:8b        # better quality, needs ~8GB RAM
ollama pull qwen2.5:7b         # strong reasoning
ollama pull mistral:7b         # solid general-purpose

# Embedding models
ollama pull nomic-embed-text   # 768 dimensions, fast
ollama pull mxbai-embed-large  # 1024 dimensions, higher quality
```

Check what's running:
```bash
ollama list      # show downloaded models
ollama ps        # show models currently loaded in memory
```

## Adding the Spring AI Ollama starter

```xml
<!-- Add alongside (or instead of) the OpenAI starter -->
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-ollama-spring-boot-starter</artifactId>
</dependency>
```

## Profile-based model switching

The cleanest approach: keep OpenAI as the default and override with Ollama in the dev profile. Application code never changes — only the Spring profile changes.

**`application.yml` (base — OpenAI):**
```yaml
spring:
  ai:
    openai:
      api-key: ${OPENAI_API_KEY}
      chat:
        options:
          model: gpt-4o-mini
      embedding:
        options:
          model: text-embedding-3-small

    vectorstore:
      pgvector:
        dimensions: 1536
        initialize-schema: true
        index-type: HNSW
        distance-type: COSINE_DISTANCE
```

**`application-local.yml` (local dev — Ollama, no API key needed):**
```yaml
spring:
  ai:
    openai:
      api-key: "not-used"   # disable OpenAI auto-configuration
    ollama:
      base-url: http://localhost:11434
      chat:
        options:
          model: llama3.2:3b
          temperature: 0.2
          num-ctx: 8192       # context window size
      embedding:
        options:
          model: nomic-embed-text

    vectorstore:
      pgvector:
        dimensions: 768   # nomic-embed-text produces 768-dimensional vectors
```

Activate it:
```bash
export SPRING_PROFILES_ACTIVE=local
./mvnw spring-boot:run
```

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> The embedding dimensions <strong>must match</strong> what the embedding model produces, and must be consistent between indexing and querying. <code>text-embedding-3-small</code> produces 1536 dimensions; <code>nomic-embed-text</code> produces 768. If you switch embedding models, you must delete and re-create the vector store table — the old embeddings are incompatible.</p>
</blockquote>

## Using a dedicated Ollama ChatClient bean

If both OpenAI and Ollama need to be active simultaneously (e.g., Ollama for cheap classification, OpenAI for complex reasoning), wire separate beans:

```java
@Configuration
class AiConfig {

    // OpenAI client — for complex reasoning tasks
    @Bean
    @Qualifier("openai")
    ChatClient openAiClient(ChatClient.Builder builder) {
        return builder
                .defaultOptions(OpenAiChatOptions.builder()
                        .model("gpt-4o-mini")
                        .build())
                .build();
    }

    // Ollama client — for cheap local tasks (classification, summarization)
    @Bean
    @Qualifier("local")
    ChatClient ollamaClient(OllamaChatModel ollamaChatModel) {
        return ChatClient.builder(ollamaChatModel)
                .defaultOptions(OllamaOptions.builder()
                        .model("llama3.2:3b")
                        .temperature(0.0)
                        .build())
                .build();
    }
}
```

Use the local model for tasks where quality is sufficient and cost matters, and the cloud model for the final answer generation:

```java
// Classify intent locally (cheap)
String intent = ollamaClient.prompt()
        .user("Classify as ORDER_STATUS | RETURN | PRODUCT_QUESTION | OTHER: " + message)
        .call().content().strip();

// Generate answer with cloud model if it's a complex case
if ("PRODUCT_QUESTION".equals(intent)) {
    return openAiClient.prompt().user(message).call().content();
}
```

## Model recommendations for production use cases

| Use case | Model | RAM | Quality |
|---|---|---|---|
| Classification, extraction | `llama3.2:3b` | 4 GB | Good |
| RAG Q&A assistant | `llama3.1:8b` | 8 GB | Good |
| Complex reasoning | `qwen2.5:14b` | 16 GB | Very good |
| Coding assistant | `codellama:13b` | 16 GB | Very good |
| Embeddings (fast) | `nomic-embed-text` | < 1 GB | Good |
| Embeddings (quality) | `mxbai-embed-large` | 2 GB | Better |

GPU acceleration is strongly recommended for chat models. On an Apple M-series Mac, Metal acceleration is automatic. On Linux, CUDA support is available for NVIDIA GPUs.

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> For local development, <code>llama3.2:3b</code> generates fast enough that the dev loop feels responsive. For staging and CI tests that use a local model, <code>llama3.1:8b</code> produces results much closer to production quality. Use the 3B for speed in local dev and the 8B for CI eval tests.</p>
</blockquote>

## Configuring Ollama for production on-premise deployments

When deploying Ollama on-premise (not just local dev), run it as a service and point Spring AI at the remote host:

```yaml
spring:
  ai:
    ollama:
      base-url: http://ollama-server.internal:11434
      chat:
        options:
          model: llama3.1:8b
```

Ollama does not have authentication by default. In production, place it behind a reverse proxy (nginx, Caddy) that enforces API key authentication or mTLS, and restrict network access to the application servers only.

## Where local models fall short

Be honest about limitations before committing to local models:

| Capability | OpenAI GPT-4o-mini | Ollama llama3.1:8b |
|---|---|---|
| Instruction following | Excellent | Good |
| Structured JSON output | Very reliable | Sometimes unreliable |
| Tool selection accuracy | Very reliable | Inconsistent |
| Long context (>8K tokens) | Good | Degrades |
| Non-English languages | Excellent | Model-dependent |
| Latency (8B on CPU) | ~1-3s | ~10-30s |
| Latency (8B on GPU) | ~1-3s | ~1-4s |

For the TechGadgets support assistant:
- **Classification and extraction:** local models work well
- **RAG Q&A with short context:** local models work acceptably
- **Tool calling with complex reasoning:** local models are noticeably less reliable
- **Structured output (`.entity()`):** test carefully — smaller models produce malformed JSON more often

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> Run your evaluation suite (from Module 7) against Ollama before committing to a local model in production. The eval pass rate tells you whether answer quality is acceptable. Expect a 10–20% drop in pass rate from frontier models to 7B local models — decide whether that tradeoff is acceptable for your use case.</p>
</blockquote>

## The Spring AI abstraction pays off here

Because Spring AI abstracts the model behind `ChatModel` and `EmbeddingModel` interfaces, switching from OpenAI to Ollama is genuinely just a configuration change — no application code changes required. This is one of the clearest demonstrations of why the abstraction layer matters.

```java
// This code works identically regardless of whether the underlying model
// is OpenAI, Anthropic, Ollama, or any other supported provider
String answer = chatClient.prompt()
        .user(question)
        .call()
        .content();
```

The controller, service layer, advisors, and tools are all provider-agnostic.

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> The next post covers multimodal AI — adding image understanding to the support assistant. A customer attaches a photo of a damaged product and asks "is this covered under warranty?" The LLM reads both the image and the question and answers accordingly.</p>
</blockquote>

## References

- <a href="https://ollama.com/library" target="_blank" rel="noopener" referrerpolicy="origin">Ollama model library</a>
- <a href="https://docs.spring.io/spring-ai/reference/api/chat/ollama-chat.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI Ollama chat reference</a>
- <a href="https://docs.spring.io/spring-ai/reference/api/embeddings/ollama-embeddings.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI Ollama embeddings reference</a>
