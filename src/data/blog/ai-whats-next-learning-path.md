---
title: What to learn next — your AI engineering learning path after this course
description: You have built a production-ready AI application from scratch. You understand embeddings, RAG, agents, memory, and how to ship safely. This post maps where to go from here — deeper specialisations, adjacent skills, and the emerging areas worth watching.
pubDatetime: "2026-03-03T19:20:00+05:30"
tags:
  - spring-ai
  - ai-concepts
  - java
---

Dev shipped the support assistant to production. It is answering customer questions from actual policy documents, checking live order status, maintaining conversation context, streaming responses to the browser, and declining off-topic questions gracefully. The team is impressed.

But the AI landscape moves quickly. New models appear every few months. New techniques emerge regularly. The question is: where do you go from here?

## Table of contents

## What you know now

Before mapping what's next, let's acknowledge what this course built:

| Skill | Where it was covered |
|---|---|
| LLM mental model (tokens, context, temperature) | Module 1 |
| Spring AI setup, ChatClient, structured output, streaming | Module 2 |
| Embeddings, vector databases, semantic search | Module 3 |
| RAG pipelines, chunking, retrieval quality | Module 4 |
| Conversation memory, windowed + persistent + summarisation | Module 5 |
| Agents, tool calling, combining RAG + tools | Module 6 |
| Observability, cost management, testing, safety, error handling | Module 7 |
| Local models (Ollama), multimodal, framework comparison | Module 8 |

This is a complete foundation. Most production AI features at mid-sized companies are built from exactly these building blocks.

## Where to go deeper

### 1. Advanced RAG techniques

The RAG module covered the essentials — retrieval, chunking, reranking, hybrid search. Production RAG systems go further:

**HyDE (Hypothetical Document Embeddings):** Generate a hypothetical answer to the query, embed it, and search with that embedding instead of the raw query. Works better when query and document phrasing are very different.

**Multi-query retrieval:** Generate multiple rephrasings of the user's question and search with all of them, then deduplicate the results. Improves recall significantly.

**RAPTOR (Recursive Abstractive Processing for Tree-Organized Retrieval):** Cluster documents, summarise clusters, and create a tree of summaries. Enables retrieval at multiple granularities.

**GraphRAG:** Represent knowledge as a graph rather than flat chunks. Better for questions that require connecting multiple entities (e.g., "which customers ordered the same product as the user who complained about Bluetooth?").

These are active research areas with production implementations appearing in 2025–2026.

### 2. Evaluation and evals engineering

Module 7 introduced a basic evaluation harness. Production AI teams invest heavily in evaluation:

**LLM-as-judge:** Use a capable model to score your other model's outputs for factual accuracy, relevance, and helpfulness. More scalable than human labelling.

**Ragas framework:** An open-source evaluation framework specifically for RAG systems. Measures faithfulness (does the answer match the context?), answer relevance, and context relevance.

**A/B testing AI features:** Running controlled experiments on prompt changes, model upgrades, or RAG configuration changes — measuring quality metrics, not just traditional A/B metrics.

Evaluation engineering is a growing specialisation. Teams that build robust evals ship changes faster and with less risk.

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> The single highest-value investment after shipping your first AI feature is building a comprehensive evaluation suite. It is the only way to confidently change prompts, upgrade models, or restructure RAG without fearing regressions.</p>
</blockquote>

### 3. Fine-tuning

This course covered RAG for knowledge injection. Fine-tuning is for teaching the model *how to behave* — style, tone, domain vocabulary, output format consistency.

Fine-tuning is appropriate when:
- You need the model to reliably produce a very specific output format
- You have a large volume of examples demonstrating the correct behavior
- Standard prompting cannot achieve consistent enough results

Fine-tuning providers: OpenAI, Anthropic, Google, and AWS Bedrock all provide fine-tuning APIs. For local models, tools like Axolotl and Unsloth run fine-tuning on consumer hardware.

### 4. MCP — the Model Context Protocol

The Model Context Protocol (MCP) is an emerging standard (driven by Anthropic, adopted across the industry) for connecting AI models to tools and data sources in a standardised, composable way.

Rather than building custom `@Tool` implementations for every data source, MCP-compatible tools can be shared, reused, and composed across different AI applications and models.

Spring AI added MCP support in 2025. If you are building internal tooling or infrastructure AI, understanding MCP positions you well for the direction the industry is heading.

### 5. Multi-agent systems

Single agents handle one task at a time. Multi-agent systems decompose complex tasks across specialised agents:

- An **orchestrator agent** receives the task and breaks it into subtasks
- **Specialist agents** handle specific domains (order lookup, product knowledge, escalation)
- Agents can call each other, pass results, and collaborate

Spring AI's agentic framework (introduced in 1.0) provides primitives for building these systems. The patterns are still evolving — the Anthropic research blog on "Building Effective Agents" (linked in the references) is the best current guide.

## Adjacent skills worth developing

### Prompt engineering depth

Module 1 covered the basics. Going deeper:

- **Chain-of-thought prompting:** Guide the model to reason step-by-step before answering. Dramatically improves accuracy on multi-step reasoning tasks.
- **Few-shot examples in production:** When to include examples in prompts and when they hurt more than they help.
- **Constitutional AI and self-critique:** Having the model critique its own output before finalising it.

The Anthropic prompt engineering guide and the OpenAI cookbook are the best practical resources.

### Data engineering for AI

AI applications are data-intensive in ways that traditional apps are not:
- Document ingestion pipelines at scale
- Embedding pipeline orchestration (Apache Airflow, Prefect)
- Vector store partitioning and sharding for large corpora
- Incremental re-indexing when documents change

If you are working at a company with large knowledge bases (legal, medical, financial), data engineering for AI is a high-value specialisation.

### AI infrastructure

- Running Ollama or vLLM at scale (batching, GPU management)
- Kubernetes operators for LLM serving
- Cost allocation and chargeback for AI API usage
- Model observability platforms (LangSmith, Helicone, Arize)

## The models landscape — what to watch

Models improve rapidly. The patterns from this course apply to any model. What changes:
- Context window sizes continue to grow (1M+ tokens increasingly common)
- Reasoning models (o3, DeepSeek R1) handle multi-step logic better than standard chat models
- Multimodal models add audio and video alongside images
- Small models (1–4B parameters) become competitive with 2023-era large models on narrow tasks

Stay current by following the model releases from OpenAI, Anthropic, Google, Meta, and Mistral. When a new model releases, run your evaluation suite against it — if quality improves at the same cost, upgrade.

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> Do not chase every new model or technique. The fundamentals from this course — embeddings, RAG, agents, evaluation — are stable. New techniques build on them. Invest in understanding foundations deeply before specialising in advanced techniques.</p>
</blockquote>

## What to build next

The best way to continue learning is to build. Some projects that apply and extend what you know:

**Extend the TechGadgets assistant:**
- Add a product catalogue search agent using a structured database tool
- Build a proactive escalation system that detects frustrated users and routes them to humans
- Add voice input using OpenAI's Whisper for speech-to-text before the support assistant
- Build a dashboard showing conversation analytics (common questions, fallback rate, satisfaction)

**Start a new project:**
- **Internal documentation assistant** for your company's Confluence or Notion — RAG over private docs, Slack integration for access
- **Code review assistant** — RAG over your codebase + coding standards, integrated into the PR review process
- **Meeting summary agent** — transcription → extraction → action items → calendar events

**Contribute to open source:**
- Spring AI is actively developed — the GitHub issues list has good first issues
- The Ollama model library welcomes contributions (model files, documentation)

## The learning community

- **Spring AI discussions:** GitHub Discussions on the Spring AI repository
- **AI Engineering Discord:** Active community for practitioners building production AI
- **Papers:** Papers With Code for tracking research → implementation cycles
- **Anthropic research blog:** Practical guidance from the team that built Claude

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> This is the final post of the course. You started with Dev — a mid-level Java developer who didn't know what an embedding was. You end with Dev shipping a production AI application with RAG, agents, memory, streaming, observability, cost controls, safety guardrails, and a clear path for what to build next. The technology will keep evolving. The engineering discipline — measure, test, iterate, understand before optimising — stays the same.</p>
</blockquote>

## References

- <a href="https://www.anthropic.com/research/building-effective-agents" target="_blank" rel="noopener" referrerpolicy="origin">Anthropic: Building Effective Agents</a>
- <a href="https://docs.ragas.io/" target="_blank" rel="noopener" referrerpolicy="origin">Ragas — RAG evaluation framework</a>
- <a href="https://modelcontextprotocol.io/" target="_blank" rel="noopener" referrerpolicy="origin">Model Context Protocol (MCP)</a>
- <a href="https://docs.spring.io/spring-ai/reference/" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI reference documentation</a>
- <a href="https://github.com/spring-projects/spring-ai" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI on GitHub</a>
