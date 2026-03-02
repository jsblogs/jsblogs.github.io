---
title: Vector databases explained — why regular databases are not enough for AI
description: Semantic search requires finding the nearest neighbours among millions of high-dimensional vectors. PostgreSQL with B-tree indexes was not built for this. Here is what vector databases do differently and which options work with Spring AI.
pubDatetime: "2026-03-03T10:20:00+05:30"
tags:
  - spring-ai
  - ai-concepts
  - java
---

Dev's first instinct was to store embeddings in the existing PostgreSQL database. After all, a vector is just an array of floats — PostgreSQL handles arrays fine.

The problem appeared at query time. Finding the 5 most similar vectors out of 50,000 required comparing the query vector against every stored vector. Full table scan. Every time. At 1536 dimensions per vector, that is 50,000 × 1536 float comparisons per query. The query took 4.2 seconds.

This is the problem vector databases solve.

## Table of contents

## Why regular databases are slow for vector search

A relational database with a B-tree index is optimised for equality and range queries: "find all rows where `price < 100`" or "find the row where `id = 42`". The index allows the database to jump directly to the relevant rows.

Vector similarity search is a different operation. The question is: "find the 5 rows whose `embedding` column is closest to this query vector, measured by cosine similarity". There is no ordering on the embedding column that a B-tree can exploit. The naive implementation compares against every row.

This is called an **exact nearest neighbour** search. It is correct but O(n) per query — unacceptably slow at scale.

Vector databases solve this with **approximate nearest neighbour (ANN)** algorithms. They build specialised index structures that trade a small amount of accuracy for dramatic speed improvements. A well-tuned ANN index can find the 5 nearest neighbours among 10 million vectors in under 50 milliseconds.

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> "Approximate" nearest neighbour means the results might not be the mathematically closest — but in practice, the quality is high enough for production search. Missing the absolute closest match in favour of the 2nd-closest is rarely meaningful to users. Speed matters more at scale.</p>
</blockquote>

## The HNSW algorithm — the standard for ANN indexing

Most production vector databases use **HNSW (Hierarchical Navigable Small World)** graphs under the hood. The idea:

1. Build a layered graph where each node (vector) connects to its nearest neighbours
2. Upper layers have fewer nodes and longer-range connections (the "highway")
3. Lower layers are denser with short-range connections
4. At query time, start at the top layer, greedily navigate toward the query vector, descend layers, and return the nearest neighbours from the bottom layer

The result is sub-linear query time: adding more documents does not proportionally slow down queries.

You do not need to understand HNSW internals to use it. But knowing it exists helps you understand why vector databases have tuning parameters like `ef_construction` (controls index build quality vs speed) and `m` (controls graph connectivity).

## Vector database options that work with Spring AI

Spring AI's `VectorStore` interface abstracts the storage layer. You can swap implementations by changing configuration. Here are the main options:

| Store | Type | Best for | Spring AI support |
|---|---|---|---|
| **pgvector** | PostgreSQL extension | Teams already on PostgreSQL | `spring-ai-pgvector-store` |
| **Chroma** | Standalone server | Local dev, Python ML teams | `spring-ai-chroma-store` |
| **Weaviate** | Standalone server | Multi-modal, hybrid search | `spring-ai-weaviate-store` |
| **Pinecone** | Managed cloud | Zero-ops production | `spring-ai-pinecone-store` |
| **Qdrant** | Standalone or cloud | High-performance, filtering | `spring-ai-qdrant-store` |
| **Redis** | In-memory + vector | Real-time, existing Redis infra | `spring-ai-redis-store` |
| **Milvus** | Standalone or cloud | Very large scale (billions) | `spring-ai-milvus-store` |
| **SimpleVector** | In-memory | Tests only | Built-in |

Spring AI ships a separate starter for each. The `VectorStore` API is identical — swap the dependency and configuration, not application code.

## Choosing a vector store

### pgvector — the pragmatic default

If your application already runs PostgreSQL, pgvector is the right starting point. It is a PostgreSQL extension that adds vector storage and HNSW/IVFFlat indexing directly to your existing database.

**Advantages:**
- One database to operate, back up, and monitor
- Full SQL: join vectors with relational data, filter by `user_id`, `product_category`, `created_at`
- Transactions across vector and relational data
- Spring AI auto-configures the schema on startup
- Free and open source

**Disadvantage:** At very large scale (tens of millions of vectors), a dedicated vector database will outperform it.

For the support assistant — and for most Java enterprise applications — pgvector handles millions of vectors comfortably. This course uses pgvector.

### Chroma — simplest local dev experience

Chroma is a standalone vector database server that stores data locally. It is popular in Python ML workflows. Spring AI supports it, but pgvector is simpler for Java teams because it integrates with the existing Spring Data / Flyway toolchain.

Use Chroma if you are working with a team that already runs it, or for quick local experiments without PostgreSQL.

### Pinecone — managed, zero-ops production

Pinecone is a fully managed cloud vector database. No servers to run, auto-scaling, and consistent performance. The trade-off: it is paid, and your data lives in a third-party service.

Use Pinecone if you need to ship fast and do not want to operate infrastructure. It is the right choice for teams without existing PostgreSQL infrastructure or dedicated database operations.

### Qdrant — when filtering performance matters

Qdrant has strong support for payload filtering — filtering by metadata fields before or during the vector search. If your search requires filtering on many attributes (department, language, date range, access tier), Qdrant handles this more efficiently than pgvector at scale.

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Start with pgvector unless you have a specific reason not to. It works well for most production workloads, requires no additional infrastructure, and you can migrate to a dedicated vector database later if you outgrow it. Premature infrastructure optimisation costs more than a future migration.</p>
</blockquote>

## What metadata filtering is and why it matters

Semantic similarity finds documents with related meaning. But in real applications, you often need to narrow the search first:

- "Find documents similar to this query **where `tenantId = 'acme-corp'`**"
- "Find documents similar to this query **where `productCategory = 'headphones'`**"
- "Find documents similar to this query **where `language = 'en'`**"

Without metadata filtering, semantic search returns the globally closest vectors — which might belong to a different tenant or a different product line.

Vector stores support metadata fields stored alongside each vector. Spring AI's `SearchRequest` supports metadata filters that are evaluated before or during the ANN search, so you only search within the relevant subset.

```java
// Only search within the 'headphones' product category
List<Document> results = vectorStore.similaritySearch(
    SearchRequest.query("bluetooth connection issues")
        .withTopK(5)
        .withFilterExpression("productCategory == 'headphones'")
);
```

The filter expression syntax is Spring AI's portable filter language — it compiles to the appropriate query syntax for each store (SQL `WHERE` for pgvector, filter objects for Pinecone, etc.).

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> Filtering on high-cardinality fields (like a unique document ID) before vector search defeats the purpose of ANN indexing. Metadata filters work best on low-cardinality categorical fields: category, language, status, department. For high-cardinality filtering, consider pre-partitioning your data into separate collections.</p>
</blockquote>

## The Spring AI VectorStore interface

All vector store implementations in Spring AI implement the same interface:

```java
public interface VectorStore {
    // Store documents (embeds them automatically)
    void add(List<Document> documents);

    // Delete documents by ID
    Optional<Boolean> delete(List<String> idList);

    // Search for similar documents
    List<Document> similaritySearch(SearchRequest request);
}
```

`Document` is Spring AI's content container — it holds the text, an ID, and a metadata map:

```java
Document doc = new Document(
    "ProX headphones support Bluetooth 5.2 and have a range of 30 meters.",
    Map.of(
        "productId", "PRX-2024",
        "productCategory", "headphones",
        "source", "product-manual"
    )
);
```

When you call `vectorStore.add(List.of(doc))`, Spring AI automatically:
1. Calls `EmbeddingModel.embed(doc.getContent())` to generate the vector
2. Stores the vector, text, and metadata in the database

You do not manage vectors directly. The `VectorStore` abstraction handles it.

## The SimpleVectorStore for tests

Spring AI includes an in-memory `SimpleVectorStore` that is useful for unit tests. It does exact nearest-neighbour search (no ANN index) and stores everything in memory. It is not suitable for production, but it eliminates the need for a running database in tests:

```java
// In test configuration
@Bean
VectorStore vectorStore(EmbeddingModel embeddingModel) {
    return SimpleVectorStore.builder(embeddingModel).build();
}
```

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> The next post sets up pgvector with Docker Compose and wires it to Spring AI. By the end of that post, you will have a running vector store that Dev's support assistant can index knowledge base articles into. The post after that builds the full ingestion pipeline — reading documents, splitting them, and storing them in pgvector.</p>
</blockquote>

## References

- <a href="https://docs.spring.io/spring-ai/reference/api/vectordbs.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI Vector Databases reference</a>
- <a href="https://github.com/pgvector/pgvector" target="_blank" rel="noopener" referrerpolicy="origin">pgvector GitHub repository</a>
- <a href="https://docs.spring.io/spring-ai/reference/api/vectordbs/pgvector.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI pgvector store reference</a>
