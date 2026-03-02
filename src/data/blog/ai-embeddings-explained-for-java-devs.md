---
title: What are embeddings? A practical explanation for Java developers
description: Embeddings are the foundation of semantic search, RAG, and most production AI features. This post explains what they are, what they look like, and why they matter — without the maths.
pubDatetime: "2026-03-03T10:00:00+05:30"
tags:
  - spring-ai
  - ai-concepts
  - java
---

Dev was staring at a problem. The support assistant answered general questions well. But when a customer asked "my headphones keep dropping connection", the assistant had no idea that the answer lived in a knowledge base article titled "Bluetooth pairing troubleshooting for ProX series". The words did not match. The meaning did, but the words did not.

That is the problem embeddings solve.

## Table of contents

## The limits of keyword search

Traditional search works by matching words. A query for "connection dropping" finds documents that contain "connection" and "dropping". It misses documents that use "Bluetooth disconnecting" or "pairing issues" — even though those documents answer the same question.

This is a fundamental limitation. Keywords represent syntax. What users actually want is meaning.

Semantic search works differently: convert text into numbers that capture meaning, then find numbers that are close to each other. Documents with similar meaning end up near each other in number-space, even if they share no words.

Those numbers are embeddings.

## What an embedding actually is

An embedding is a fixed-length array of floating-point numbers — a vector — that represents the semantic meaning of a piece of text.

For example, `text-embedding-3-small` (OpenAI's embedding model) produces vectors of 1536 numbers. Every piece of text — a word, a sentence, a paragraph, a document — maps to exactly 1536 numbers.

```
"Bluetooth pairing issues"    → [0.021, -0.143, 0.872, 0.054, ..., -0.302]  // 1536 numbers
"my headphones keep dropping" → [0.019, -0.138, 0.861, 0.048, ..., -0.289]  // 1536 numbers
"chocolate chip cookie recipe" → [-0.412, 0.891, -0.203, 0.637, ..., 0.114] // 1536 numbers
```

The first two sentences are about the same topic. Their vectors are close together — the numbers are similar. The cookie recipe is completely unrelated — its vector is far away.

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> You never need to inspect or understand the individual numbers in an embedding. What matters is the <em>distance</em> between vectors. Close vectors mean similar meaning. That distance is what the vector database computes at query time.</p>
</blockquote>

## How similarity is measured

The standard metric for comparing embeddings is **cosine similarity** — the angle between two vectors. A cosine similarity of 1.0 means identical direction (same meaning). A cosine similarity near 0 means unrelated.

You do not need to implement this. The vector database does it. You ask "find me the 5 most similar embeddings to this query embedding", and the database returns them ranked by similarity score.

## The two-phase workflow

Working with embeddings always involves two distinct phases:

**Phase 1 — Indexing (one-time or batch)**

For each document in your knowledge base:
1. Send the document text to an embedding model
2. Receive back a vector (array of floats)
3. Store both the vector and the original text in a vector database

**Phase 2 — Query time (per user request)**

For each user query:
1. Send the query text to the same embedding model
2. Receive back a vector
3. Search the vector database for the closest stored vectors
4. Return the matching documents

The embedding model must be the same in both phases. You cannot index with `text-embedding-3-small` and query with a different model — the vector spaces would be incompatible.

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> Indexing happens once (or in batch when documents change). Querying happens on every user request. Design your system so indexing is a separate, schedulable job — not something that runs on startup every time.</p>
</blockquote>

## What the embedding model actually does

The embedding model is a neural network — typically a transformer — that was trained on massive amounts of text. During training it learned to represent semantic relationships as geometric relationships in vector space.

After training, it can convert any text into a point in a high-dimensional space such that:

- Synonyms land near each other ("fast" ≈ "quick" ≈ "rapid")
- Conceptually related topics cluster together ("Bluetooth" near "wireless", "pairing", "connection")
- Unrelated concepts are far apart ("Bluetooth" far from "invoice", "warranty", "recipe")

The training is done. You use the model as a black box: text in, vector out.

## Embeddings vs the LLM that answers questions

Your application will use two different models:

| Model type | Purpose | API call |
|---|---|---|
| **Embedding model** | Converts text to vectors | `EmbeddingModel.embed(text)` |
| **Chat model** | Generates answers | `ChatClient.prompt(...).call()` |

The embedding model does not generate text. It does not answer questions. It only converts text into vectors. The chat model is what generates the final answer — but in a RAG setup, it needs relevant documents first, which the embedding model and vector database provide.

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> In Spring AI, the <code>EmbeddingModel</code> interface abstracts the embedding model the same way <code>ChatModel</code> abstracts the chat model. Swap OpenAI embeddings for Ollama embeddings by changing configuration, not code.</p>
</blockquote>

## What embeddings are good for

Embeddings power a range of features beyond just search:

| Feature | How embeddings help |
|---|---|
| **Semantic search** | Find documents by meaning, not keywords |
| **RAG** | Retrieve relevant context to ground LLM answers |
| **Recommendation** | "More like this" — find items similar to what a user viewed |
| **Clustering** | Group support tickets by topic automatically |
| **Anomaly detection** | Flag text that is semantically far from expected inputs |
| **Deduplication** | Detect near-duplicate documents regardless of wording |

All of these reduce to the same operation: compute embeddings, then find nearest neighbours.

## What the model's context window has to do with it

Embedding models have their own input limits — separate from the chat model's context window.

`text-embedding-3-small` supports up to 8191 tokens per input. If your document is longer than that, you need to split it before embedding. A 50-page PDF cannot be embedded as one chunk — it must be split into paragraphs or sections first.

This splitting is called **chunking**, and it is a critical design decision covered in the RAG module (Module 4). For now: know that documents must fit within the embedding model's token limit, and most production systems split long documents into overlapping chunks of 200–500 tokens.

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> A common mistake is embedding the entire document as one unit. If the document is long, the embedding will be an average of all its topics — none of them represented well. Chunk first, then embed each chunk. The chunk size is a tuning parameter that affects retrieval quality significantly.</p>
</blockquote>

## A preview of the Spring AI embedding API

Spring AI wraps the embedding API behind `EmbeddingModel`. You do not call it directly in most production code — the `VectorStore` abstraction calls it internally during ingestion and query. But it is useful to know what is happening underneath:

```java
@Autowired
EmbeddingModel embeddingModel;

// Embed a single string
float[] vector = embeddingModel.embed("Bluetooth pairing issues");
// vector.length == 1536 for text-embedding-3-small

// Embed a batch (more efficient than one-at-a-time)
List<float[]> vectors = embeddingModel.embed(
    List.of("Bluetooth pairing issues", "my headphones keep dropping")
);
```

In practice, when you call `vectorStore.add(documents)` in the next posts, Spring AI calls `embeddingModel.embed()` internally for each document. You rarely call `EmbeddingModel` directly in application code.

## The mental model to keep

Think of embedding as a translation layer between human language and a coordinate system that computers can search efficiently.

- Documents are translated once (indexing)
- Queries are translated per request (querying)
- The vector database finds nearby points in the coordinate system

The result: a user asking "why won't my headphones connect?" retrieves an article titled "Bluetooth pairing troubleshooting" — even though those phrases share no words.

That is the entire point.

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> The next post covers vector databases — what they are, how they differ from PostgreSQL, and which options work well with Spring AI. Once you understand the data store, the following posts will set up pgvector locally and build the full indexing pipeline.</p>
</blockquote>

## References

- <a href="https://docs.spring.io/spring-ai/reference/api/embeddings.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI Embedding Models reference</a>
- <a href="https://platform.openai.com/docs/guides/embeddings" target="_blank" rel="noopener" referrerpolicy="origin">OpenAI Embeddings guide</a>
