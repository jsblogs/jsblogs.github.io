---
title: Improving RAG quality — reranking and hybrid search
description: Vector search retrieves semantically similar chunks, but similarity alone doesn't guarantee relevance. Reranking scores retrieved candidates by true relevance. Hybrid search adds keyword matching to catch exact terms. Together they meaningfully improve RAG answer quality.
pubDatetime: "2026-03-03T13:00:00+05:30"
tags:
  - spring-ai
  - ai-concepts
  - java
---

Dev was mostly happy with the RAG pipeline. But some questions still returned mediocre answers. "What is the SKU for ProX headphones?" returned documents about ProX headphones in general — none of which contained the SKU. And "USB-C charging port warranty" occasionally retrieved shipping information instead of the warranty terms.

Two techniques fix different parts of this problem: **reranking** improves the ranking of retrieved results, **hybrid search** improves what gets retrieved in the first place.

## Table of contents

## Why vector search alone is sometimes not enough

Vector similarity measures how close two embeddings are in high-dimensional space. It is an excellent signal for semantic relevance — but it has two failure modes:

**Failure mode 1: semantic similarity without factual relevance.** A document about "ProX headphones general features" is semantically close to a query about "ProX headphones SKU". The embeddings are similar — both are about ProX headphones. But the retrieved document does not answer the question.

**Failure mode 2: exact term misses.** If a user queries "USB-C charging port warranty clause 4.2", the embedding may not precisely match a document that uses those exact terms — because embedding models tend to smooth over specific terminology. Keywords like "clause 4.2" or a product SKU are better found with keyword search.

Reranking addresses failure mode 1. Hybrid search addresses failure mode 2.

## Reranking — sort retrieved candidates by true relevance

The standard RAG pipeline is:
1. Retrieve top-K candidates by vector similarity
2. Send them to the LLM as context

Reranking inserts a step between 1 and 2:
1. Retrieve a larger candidate set (top-20 instead of top-5)
2. **Rerank the candidates by relevance to the query**
3. Send the top-5 reranked results to the LLM

A **reranker** (also called a cross-encoder) is a separate model that scores a (query, document) pair for relevance. Unlike the embedding model which encodes query and document independently, a reranker sees both together — it can assess how well the document actually answers the query.

```
Embedding retrieval (broad):  "ProX charging" → top-20 docs (fast, coarse)
Reranker scoring (precise):   Score each of 20 docs against query → top-5 (slow, accurate)
LLM generation:               Use top-5 as context (grounded, precise)
```

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> Reranking is more expensive than vector search — it scores each candidate against the query individually. Keep the retrieval set reasonably sized (15–30 candidates) before reranking. Reranking 100 candidates per request adds noticeable latency.</p>
</blockquote>

### Implementing reranking in Spring AI

Spring AI 1.0 introduced a `DocumentRanker` interface. Cohere's reranker model is the most widely used option:

**Add the dependency:**

```xml
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-cohere-spring-boot-starter</artifactId>
</dependency>
```

**Configure in application.yml:**

```yaml
spring:
  ai:
    cohere:
      api-key: ${COHERE_API_KEY}
```

**Wire it into a reranking service:**

```java
@Service
class RerankingSearchService {

    private final VectorStore vectorStore;
    private final CohereRerankModel reranker;

    RerankingSearchService(VectorStore vectorStore, CohereRerankModel reranker) {
        this.vectorStore = vectorStore;
        this.reranker = reranker;
    }

    List<Document> findRelevant(String query, int topK) {
        // Step 1: Retrieve 20 candidates by vector similarity
        List<Document> candidates = vectorStore.similaritySearch(
            SearchRequest.query(query)
                .withTopK(20)
                .withSimilarityThreshold(0.5)   // lower threshold for broader retrieval
        );

        if (candidates.isEmpty()) return List.of();

        // Step 2: Rerank by query-document relevance
        List<Document> reranked = reranker.rank(
            RerankRequest.builder()
                .query(query)
                .documents(candidates)
                .topN(topK)
                .build()
        );

        return reranked;
    }
}
```

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> You do not need Cohere specifically — any cross-encoder works. Cohere Rerank is available as a free tier API. For a fully local setup, the <code>ms-marco-MiniLM-L-6-v2</code> model runs with Spring AI's local Transformers support and requires no external API call.</p>
</blockquote>

### Using a custom advisor with reranking

To keep the ChatClient fluent API, implement a custom advisor that uses the reranking service:

```java
class RerankedQuestionAnswerAdvisor implements RequestResponseAdvisor {

    private final RerankingSearchService searchService;
    private final int topK;
    private static final String CONTEXT_TEMPLATE = """
            Context information is below.
            ---------------------
            {context}
            ---------------------
            Given the context information and not prior knowledge, answer the query.
            """;

    RerankedQuestionAnswerAdvisor(RerankingSearchService searchService, int topK) {
        this.searchService = searchService;
        this.topK = topK;
    }

    @Override
    public AdvisedRequest adviseRequest(AdvisedRequest request, Map<String, Object> context) {
        String query = request.userText();
        List<Document> docs = searchService.findRelevant(query, topK);

        String contextText = docs.stream()
                .map(Document::getContent)
                .collect(Collectors.joining("\n\n"));

        String newSystemText = (request.systemText() != null ? request.systemText() + "\n" : "")
                + CONTEXT_TEMPLATE.replace("{context}", contextText);

        return AdvisedRequest.from(request).withSystemText(newSystemText).build();
    }

    @Override
    public ChatResponse adviseResponse(ChatResponse response, Map<String, Object> context) {
        return response;
    }
}
```

Register it in place of `QuestionAnswerAdvisor`:

```java
.defaultAdvisors(new RerankedQuestionAnswerAdvisor(searchService, 5))
```

## Hybrid search — combining vector and keyword search

Hybrid search runs two searches in parallel and merges the results:
- **Dense (vector) search** — finds semantically similar documents
- **Sparse (keyword) search** — finds documents containing the exact query terms

The results are combined using a scoring algorithm like **Reciprocal Rank Fusion (RRF)**, which fairly combines rankings from different sources.

Hybrid search significantly improves recall for:
- Product codes and SKUs ("PRX-2024")
- Technical terms ("USB-C", "Bluetooth 5.2")
- Proper nouns and brand names
- Specific clause references ("clause 4.2", "section 3b")

These are exact terms that embedding models smooth over — but keyword search finds them reliably.

### Implementing hybrid search with pgvector

pgvector's HNSW index handles the vector side. The keyword side uses PostgreSQL's built-text search (`tsvector`). Add a text search index to the `vector_store` table:

```sql
-- Run via Flyway or Liquibase migration
ALTER TABLE vector_store ADD COLUMN IF NOT EXISTS fts_content tsvector
    GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

CREATE INDEX IF NOT EXISTS idx_vector_store_fts
    ON vector_store USING GIN (fts_content);
```

Implement hybrid search with a custom JDBC query:

```java
@Repository
class HybridSearchRepository {

    private final JdbcTemplate jdbc;
    private final EmbeddingModel embeddingModel;

    HybridSearchRepository(JdbcTemplate jdbc, EmbeddingModel embeddingModel) {
        this.jdbc = jdbc;
        this.embeddingModel = embeddingModel;
    }

    List<Document> hybridSearch(String query, int topK) {
        float[] queryVector = embeddingModel.embed(query);
        String vectorStr = Arrays.stream(ArrayUtils.toObject(queryVector))
                .map(Object::toString)
                .collect(Collectors.joining(",", "[", "]"));

        // Reciprocal Rank Fusion: combines rankings from vector and keyword search
        String sql = """
            WITH vector_results AS (
                SELECT id, content, metadata,
                       ROW_NUMBER() OVER (ORDER BY embedding <=> ?::vector) AS rank
                FROM vector_store
                ORDER BY embedding <=> ?::vector
                LIMIT ?
            ),
            keyword_results AS (
                SELECT id, content, metadata,
                       ROW_NUMBER() OVER (ORDER BY ts_rank(fts_content, query) DESC) AS rank
                FROM vector_store, plainto_tsquery('english', ?) query
                WHERE fts_content @@ query
                ORDER BY ts_rank(fts_content, query) DESC
                LIMIT ?
            ),
            combined AS (
                SELECT COALESCE(v.id, k.id) AS id,
                       COALESCE(v.content, k.content) AS content,
                       COALESCE(v.metadata, k.metadata) AS metadata,
                       (COALESCE(1.0 / (60 + v.rank), 0) + COALESCE(1.0 / (60 + k.rank), 0)) AS rrf_score
                FROM vector_results v
                FULL OUTER JOIN keyword_results k ON v.id = k.id
            )
            SELECT id, content, metadata
            FROM combined
            ORDER BY rrf_score DESC
            LIMIT ?
            """;

        return jdbc.query(sql,
            (rs, rowNum) -> new Document(
                rs.getString("id"),
                rs.getString("content"),
                parseMetadata(rs.getString("metadata"))
            ),
            vectorStr, vectorStr, topK * 4, // vector params
            query, topK * 4,                // keyword params
            topK                            // final limit
        );
    }
}
```

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> This SQL uses raw JDBC for flexibility, but it bypasses Spring AI's abstraction. Treat this as a performance optimisation for specific high-stakes queries, not as a replacement for the <code>VectorStore</code> API. Most production RAG systems start with pure vector search and add hybrid search only for the specific query types where it shows measurable improvement.</p>
</blockquote>

## Deciding when to apply each technique

| Technique | When to use | Cost |
|---|---|---|
| **Standard vector search** | Most cases, good semantic queries | Low |
| **Reranking** | Retrieval is broad but first results aren't always relevant | Medium (one extra API call per request) |
| **Hybrid search** | Queries contain exact terms (SKUs, codes, technical jargon) | Medium (extra DB query per request) |
| **Hybrid + reranking** | High-stakes Q&A where quality must be excellent | High |

Start with standard vector search. Add reranking if your evaluation set shows that the right document is being retrieved but not always in position 1–3. Add hybrid search if you see failures on exact-term queries.

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Measure before optimising. Build a 20-question eval set that covers your failure cases, then measure retrieval accuracy before and after adding reranking or hybrid search. A technique that adds latency and complexity should be justified by a measurable improvement in your eval set, not just intuition.</p>
</blockquote>

## A practical quality improvement checklist

When RAG answers are poor, work through this diagnosis in order:

1. **Check retrieval** — log retrieved documents. Is the right document in the retrieved set at all?
2. **Check chunking** — is the answer split across chunk boundaries? Try smaller chunks or overlap.
3. **Check threshold** — is the relevant document scoring below the threshold? Lower it.
4. **Check query coverage** — does your knowledge base actually contain the answer? If not, the problem is content, not retrieval.
5. **Add reranking** — if the right document is in top-20 but not top-5, reranking helps.
6. **Add hybrid search** — if the query contains exact terms and the right document isn't retrieved at all, try hybrid.
7. **Check the prompt** — if retrieval is correct but the answer is wrong, the problem may be the LLM prompt, not retrieval.

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> Module 4 is complete. The support assistant now retrieves relevant context, grounds every answer in indexed documents, and you have the tools to diagnose and improve retrieval quality. Module 5 adds the missing dimension: memory. Right now every conversation starts fresh — the assistant forgets everything as soon as the response is sent.</p>
</blockquote>

## References

- <a href="https://docs.cohere.com/docs/reranking" target="_blank" rel="noopener" referrerpolicy="origin">Cohere Rerank documentation</a>
- <a href="https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf" target="_blank" rel="noopener" referrerpolicy="origin">Reciprocal Rank Fusion paper (Cormack et al.)</a>
- <a href="https://docs.spring.io/spring-ai/reference/api/vectordbs/pgvector.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI pgvector reference</a>
