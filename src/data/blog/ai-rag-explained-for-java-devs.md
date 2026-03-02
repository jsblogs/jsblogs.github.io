---
title: What is RAG and why your AI app almost certainly needs it
description: LLMs know a lot, but they don't know about your business. RAG — Retrieval-Augmented Generation — fixes this by retrieving relevant documents at query time and injecting them into the prompt. Here is why it exists and when to use it.
pubDatetime: "2026-03-03T11:40:00+05:30"
tags:
  - spring-ai
  - ai-concepts
  - java
---

The support assistant was working. Customers could ask questions and get answers. Then a manager tested it.

"What is TechGadgets' return window for defective electronics?" The assistant said: "Typically, most retailers offer 30-day return windows for electronics." Accurate. Generic. Wrong — because TechGadgets actually offers 60 days for defective items specifically.

The LLM answered from its training data — a generalisation across thousands of retailers. It had no idea what TechGadgets' policy actually said.

This is the problem RAG solves.

## Table of contents

## Why LLMs answer from training data

An LLM is a frozen snapshot of knowledge. It was trained on text collected up to a specific date. After training, its weights do not change. It knows nothing about:

- Your company's policies, products, and pricing
- Documents created after its training cutoff
- Internal systems, databases, and private knowledge
- Events that happened after training ended

When you ask it a question, it synthesises an answer from patterns it learned during training. It confidently produces plausible-sounding text — whether or not that text reflects your reality.

You can partially solve this by stuffing information into the system prompt. But the context window is finite. You cannot paste your entire knowledge base into every request.

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> An LLM without access to your data will confidently fabricate answers that sound plausible but are wrong for your use case. For customer-facing applications, this is a serious reliability problem. RAG grounds the model's answers in documents you control.</p>
</blockquote>

## What RAG does

RAG stands for **Retrieval-Augmented Generation**. The name describes the technique exactly:

- **Retrieval** — find relevant documents from your knowledge base
- **Augmented** — inject those documents into the LLM prompt as context
- **Generation** — let the LLM generate an answer using that context

The LLM still generates the answer — but instead of relying on training data alone, it reads the injected documents and grounds its response in them. If the injected documents say "60 days for defective electronics", the LLM says "60 days for defective electronics".

## The RAG request flow

```
User question
      │
      ▼
[1] Embed the question
      │  (EmbeddingModel)
      ▼
[2] Search vector store for relevant chunks
      │  (VectorStore.similaritySearch)
      ▼
[3] Inject chunks into LLM prompt as context
      │  ("Answer using this context: [chunks]")
      ▼
[4] LLM generates answer grounded in the context
      │  (ChatClient)
      ▼
Answer to user
```

Steps 1–3 happen before the LLM sees anything. The LLM receives a prompt that already contains the relevant information. Its job is to read that information and formulate a coherent answer.

## Why not just put everything in the system prompt?

A common question: why not pre-load all 500 knowledge base articles into the system prompt at startup?

| Approach | Pros | Cons |
|---|---|---|
| Everything in system prompt | Simple, no retrieval step | Context window limits (~200K tokens max), costs scale with window size, slow, often dilutes focus |
| RAG | Only relevant content injected, no window limit, cost-efficient | Retrieval must work well, adds latency, retrieval quality determines answer quality |

A 500-article knowledge base might be 500,000 tokens. Even models with 200K context windows would send the entire knowledge base on every request — at significant cost and latency. RAG solves this by sending only the 3–5 most relevant chunks: typically 1,000–2,000 tokens of highly targeted context.

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> For small, stable knowledge bases (under ~50 short documents), loading everything into the context once is actually reasonable. RAG adds complexity — only add it when the knowledge base is too large, too dynamic, or too expensive to include in full on every request.</p>
</blockquote>

## What "grounding" means and why it matters

When you inject retrieved documents and instruct the LLM to "answer only using the provided context", the LLM's answer is **grounded** — it comes from your documents, not from training patterns.

This produces several improvements:

**Accuracy** — the answer reflects your actual policies and data, not statistical averages from the internet.

**Citability** — because you know which documents were retrieved, you can show users the source. "Based on our return policy (source: return-policy.txt)..." is more trustworthy than an unsourced answer.

**Updatability** — when policies change, you update the document and re-index it. No retraining required. The LLM's weights never need to change.

**Auditability** — if an answer is wrong, you can trace it back to the retrieved document. Debugging a wrong answer is "the retrieved document was wrong" rather than "the model hallucinated somehow".

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> Grounding reduces hallucination but does not eliminate it. If the retrieved documents do not contain the answer to the question, the LLM may still fill in the gap with plausible-sounding text. Always include an instruction like "If the answer is not in the provided context, say you don't know" and test what the model does when context is insufficient.</p>
</blockquote>

## RAG vs fine-tuning — a common confusion

When developers first learn that LLMs don't know about their business, fine-tuning seems like the natural solution: train the model on your data.

RAG is almost always the better choice for knowledge-base and Q&A use cases:

| | RAG | Fine-tuning |
|---|---|---|
| **Knowledge updates** | Update a document and re-index | Full training run |
| **Cost** | API calls for retrieval + generation | Expensive GPU training |
| **Time to update** | Minutes (re-index changed docs) | Hours to days |
| **Interpretability** | You can see which docs were used | Opaque |
| **Knowledge scope** | Unlimited (any size knowledge base) | Limited by training set size |
| **Best for** | Dynamic knowledge, Q&A, documents | Tone/style, specialised tasks, domain jargon |

Fine-tuning teaches the model *how* to behave — style, tone, output format, domain vocabulary. RAG teaches the model *what* to say — current facts about your specific domain.

Most production AI applications use both: fine-tuning for behaviour and RAG for knowledge.

## When RAG is the right tool

RAG fits these use cases well:

| Use case | Why RAG fits |
|---|---|
| Customer support assistant | Must answer from actual policies, not averages |
| Internal knowledge base Q&A | Employee questions answered from company docs |
| Product documentation assistant | Answers must reflect the actual product |
| Legal/compliance Q&A | Answers must cite specific clauses |
| Code assistant with your own libraries | Must understand your APIs, not just public ones |
| Medical information assistant | Must cite specific clinical guidelines |

RAG is less appropriate for:

| Use case | Why RAG is wrong |
|---|---|
| Creative writing | No factual grounding needed |
| General coding help | LLM training data is sufficient |
| Classification or extraction | Doesn't need external knowledge |
| Summarisation (of the provided text) | Context is already in the prompt |

## What RAG requires from your system

To implement RAG, you need:

1. **A knowledge base** — documents that answer the questions your users will ask
2. **An ingestion pipeline** — reads documents, splits into chunks, embeds, stores in vector store (Module 3)
3. **A retrieval mechanism** — semantic search that finds relevant chunks at query time (Module 3)
4. **A prompt that injects the retrieved context** — instructs the LLM to use the provided documents
5. **A quality evaluation loop** — checks that the retrieved chunks are actually relevant and the answers are accurate

You have components 1–3 from Module 3. The next post wires them together.

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> Spring AI's <code>QuestionAnswerAdvisor</code> implements steps 3–4 in a single advisor that you attach to a <code>ChatClient</code>. The next post shows how: attach the advisor, point it at your <code>VectorStore</code>, and every call through that client automatically retrieves relevant context and injects it before the LLM sees the question.</p>
</blockquote>

## References

- <a href="https://docs.spring.io/spring-ai/reference/concepts.html#concept-rag" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI RAG concepts</a>
- <a href="https://arxiv.org/abs/2005.11401" target="_blank" rel="noopener" referrerpolicy="origin">Original RAG paper — Lewis et al. (2020)</a>
