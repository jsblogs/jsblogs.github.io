---
title: Choosing an AI model for your Java application — OpenAI, Anthropic, or local
description: With Spring AI abstracting the model layer, switching providers is mostly a config change. The harder question is which model to pick for your use case. This post gives you a practical comparison and a decision guide.
pubDatetime: "2026-03-02T20:00:00+05:30"
tags:
  - java
  - llm
  - spring-ai
  - ollama
---

Dev wrote the first Spring AI integration targeting GPT-4o. The tech lead asked: "What happens if OpenAI has an outage? And why are we paying GPT-4o prices for a simple FAQ bot?" A week later, a new requirement arrived: "Some of this data is sensitive — can we run a model locally without sending data to any external API?"

Three separate questions, three separate model choices. This post maps them out.

## Table of contents

## Spring AI's model abstraction — the key insight first

Before comparing models, understand what Spring AI does for you: it provides a **unified API** across different model providers. The same `ChatClient` code works with OpenAI, Anthropic, Google, and Ollama. Switching is mostly a dependency and configuration change, not a code rewrite.

```java
// This code is identical whether you use OpenAI, Anthropic, or Ollama
String answer = chatClient.prompt()
        .system("You are a helpful assistant.")
        .user("What is dependency injection?")
        .call()
        .content();
```

What changes between providers: the Maven dependency, two or three properties in `application.properties`, and occasionally a model-specific option class for advanced settings.

This matters because you should feel free to **start with what is easiest** and switch later as requirements evolve — without a major refactor.

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> Never hardcode the model name as a string literal in your Java code. Always externalize it to <code>application.properties</code> or environment variables. Model names change, new versions are released, and you will want to switch models in staging without touching code.</p>
</blockquote>

## OpenAI — the practical default

OpenAI's GPT models are the most widely documented, most widely used, and have the broadest community support. They are the natural starting point for most teams.

### GPT-4o — the workhorse

- **Strengths**: Excellent reasoning, strong instruction following, good at code and structured output
- **Context window**: 128,000 tokens
- **Best for**: Complex reasoning tasks, code generation, nuanced Q&A, production use cases where quality matters
- **Pricing**: ~$2.50 input / $10.00 output per 1M tokens

### GPT-4o-mini — the cost-efficient choice

- **Strengths**: Surprisingly capable at simpler tasks, very low cost
- **Context window**: 128,000 tokens
- **Best for**: FAQ bots, simple classification, summarization, high-volume low-complexity tasks
- **Pricing**: ~$0.15 input / $0.60 output per 1M tokens — roughly 15× cheaper than GPT-4o

**Recommendation**: Start with GPT-4o-mini for your support assistant. Upgrade to GPT-4o only for the specific tasks where quality is measurably insufficient.

Spring AI setup:
```xml
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-starter-model-openai</artifactId>
</dependency>
```

```properties
spring.ai.openai.api-key=${OPENAI_API_KEY}
spring.ai.openai.chat.options.model=gpt-4o-mini
spring.ai.openai.chat.options.temperature=0.2
```

## Anthropic Claude — excellent reasoning and long context

Claude models from Anthropic are strong alternatives, particularly for tasks that require careful reasoning, nuanced instruction following, or very long document processing.

### Claude claude-sonnet-4-5 — the balance model

- **Strengths**: Strong reasoning, excellent at following complex instructions, very large context window
- **Context window**: 200,000 tokens — the largest of any mainstream model
- **Best for**: Long document analysis, complex multi-step reasoning, tasks where instruction adherence is critical
- **Pricing**: ~$3.00 input / $15.00 output per 1M tokens

Claude tends to be more conservative — it will decline to guess when uncertain rather than hallucinate confidently. For a support bot, this is often a feature.

Spring AI setup:
```xml
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-starter-model-anthropic</artifactId>
</dependency>
```

```properties
spring.ai.anthropic.api-key=${ANTHROPIC_API_KEY}
spring.ai.anthropic.chat.options.model=claude-sonnet-4-5
spring.ai.anthropic.chat.options.temperature=0.2
```

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> If your RAG pipeline involves very long documents that you want to inject in full (policy documents, legal text, large manuals), Claude's 200K context window is a meaningful advantage. Most OpenAI calls will chunk the documents instead.</p>
</blockquote>

## Google Gemini — multimodal and integrated

Google's Gemini models are strong, particularly for multimodal tasks (combining text and images).

### Gemini 2.0 Flash — fast and affordable

- **Strengths**: Fast inference, competitive pricing, strong multimodal support (images, audio, video), large context
- **Context window**: 1,000,000 tokens (1M — remarkably large)
- **Best for**: Applications that process images alongside text, Google Workspace integrations, extremely long context needs
- **Pricing**: Competitive — check current Google AI Studio pricing

Spring AI supports Gemini via the `spring-ai-starter-model-vertex-ai-gemini` or the Google AI Studio starter. The 1M context window is genuinely useful for cases where you want to avoid chunking entirely.

## Ollama — local, private, zero cost

Ollama lets you run open-source models (Llama 3.2, Mistral, Phi-4, Gemma, and many others) on your own machine or servers, with no data leaving your environment.

- **Strengths**: Complete data privacy, zero API cost, works offline, no rate limits
- **Weaknesses**: Lower quality than frontier models (GPT-4o, Claude Sonnet), requires hardware (RAM is the primary constraint), setup effort
- **Best for**: Development environments, internal tools, sensitive data processing, cost-zero experimentation

### Running Ollama locally

```bash
# Install and start Ollama (Mac/Linux)
brew install ollama
ollama serve

# Pull a model (3-4GB download)
ollama pull llama3.2
```

Spring AI setup:
```xml
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-starter-model-ollama</artifactId>
</dependency>
```

```properties
spring.ai.ollama.base-url=http://localhost:11434
spring.ai.ollama.chat.options.model=llama3.2
spring.ai.ollama.chat.options.temperature=0.2
```

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> Local models require significant RAM. Llama 3.2 (3B) needs ~4GB, Llama 3.1 (8B) needs ~8GB, and larger models go up from there. Running them on a laptop is fine for development. For production, you need servers with enough memory — which has a cost of its own.</p>
</blockquote>

## Comparison at a glance

| | GPT-4o-mini | GPT-4o | Claude Sonnet | Gemini Flash | Ollama (local) |
|---|---|---|---|---|---|
| **Quality** | Good | Excellent | Excellent | Very good | Moderate |
| **Context** | 128K | 128K | 200K | 1M | Varies |
| **Cost** | Very low | Moderate | Moderate-high | Low | Free |
| **Privacy** | Data to OpenAI | Data to OpenAI | Data to Anthropic | Data to Google | Fully private |
| **Best for** | Simple tasks, high volume | Complex reasoning | Long docs, reasoning | Multimodal, long context | Dev, sensitive data |
| **Spring AI support** | ✓ | ✓ | ✓ | ✓ | ✓ |

## Decision guide: which model for this course project?

For the support assistant we are building:

1. **Development environment** → Ollama + llama3.2. Free, offline, no API key needed. Accept lower quality during dev.
2. **Staging / CI tests** → GPT-4o-mini. Cheap enough for automated tests, real-world quality.
3. **Production** → GPT-4o-mini as default. Upgrade to GPT-4o only for specific features where quality gap is measured and justified.

Use Spring profiles to switch without touching code:

```properties
# application-dev.properties
spring.ai.ollama.base-url=http://localhost:11434
spring.ai.ollama.chat.options.model=llama3.2

# application-prod.properties
spring.ai.openai.api-key=${OPENAI_API_KEY}
spring.ai.openai.chat.options.model=gpt-4o-mini
```

This is a recurring theme in this course: make model selection a configuration concern, not a code concern. The ability to switch from a local model during development to a hosted model in production — without changing your `ChatClient` code — is one of the most valuable things Spring AI provides.

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> Do not over-optimize model selection upfront. Start with GPT-4o-mini and Ollama in dev. Once you have real usage data, you will have concrete evidence about where you need better quality. Premature model optimization is as wasteful as premature code optimization.</p>
</blockquote>

The next post covers prompt engineering — how to write prompts that get consistent, useful results, before you write a single line of Spring AI code.
