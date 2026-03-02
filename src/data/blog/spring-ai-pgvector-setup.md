---
title: Setting up pgvector with Spring AI — store and search embeddings in PostgreSQL
description: pgvector adds native vector search to PostgreSQL. Spring AI auto-configures the schema and wires an EmbeddingModel to it automatically. This post sets up the complete stack with Docker Compose and verifies it works.
pubDatetime: "2026-03-03T10:40:00+05:30"
tags:
  - spring-ai
  - springboot
  - java
---

Dev chose pgvector. The team already operated PostgreSQL, knew how to back it up, and had Flyway migrations in place. Adding a PostgreSQL extension felt far simpler than running a separate vector database service.

Twenty minutes later, the vector store was running. Here is how.

## Table of contents

## What you need

- Docker (for local dev)
- Spring Boot project from Module 2
- OpenAI API key (or Ollama running locally for embeddings)

## Step 1 — Run pgvector with Docker Compose

The official `pgvector/pgvector` Docker image bundles PostgreSQL with the pgvector extension pre-installed. Add it to your `docker-compose.yml`:

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: supportapp
      POSTGRES_USER: supportuser
      POSTGRES_PASSWORD: supportpass
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

Start it:

```bash
docker compose up -d
```

The image includes the `vector` extension but does not enable it by default. Spring AI's auto-configuration runs `CREATE EXTENSION IF NOT EXISTS vector` on startup, so you do not need to do this manually.

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Use <code>pg16</code> (or <code>pg17</code>) — pgvector 0.7+ requires PostgreSQL 13+, and newer versions include HNSW index support. Check the <a href="https://github.com/pgvector/pgvector" target="_blank" rel="noopener">pgvector releases</a> page for which PostgreSQL versions are supported.</p>
</blockquote>

## Step 2 — Add dependencies

You need the pgvector store starter, the JDBC driver, and an embedding model starter. Add to `pom.xml`:

```xml
<!-- pgvector store -->
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-pgvector-store-spring-boot-starter</artifactId>
</dependency>

<!-- PostgreSQL JDBC driver -->
<dependency>
    <groupId>org.postgresql</groupId>
    <artifactId>postgresql</artifactId>
    <scope>runtime</scope>
</dependency>

<!-- Embedding model — OpenAI -->
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-openai-spring-boot-starter</artifactId>
</dependency>
```

The Spring AI BOM (added in Module 2) manages all versions.

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> The pgvector store starter auto-configures a <code>VectorStore</code> bean, but it needs both a JDBC <code>DataSource</code> and an <code>EmbeddingModel</code> bean in the context. If either is missing, startup fails. The OpenAI starter provides the <code>EmbeddingModel</code> automatically when the API key is set.</p>
</blockquote>

## Step 3 — Configure application properties

```yaml
# application.yml

spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/supportapp
    username: supportuser
    password: supportpass

  ai:
    openai:
      api-key: ${OPENAI_API_KEY}
      embedding:
        options:
          model: text-embedding-3-small   # 1536 dimensions, cost-efficient

    vectorstore:
      pgvector:
        initialize-schema: true   # creates the table and HNSW index on startup
        index-type: HNSW          # approximate nearest neighbour (fast queries)
        distance-type: COSINE_DISTANCE
        dimensions: 1536          # must match the embedding model's output dimension
```

The `initialize-schema: true` setting tells Spring AI to run the DDL automatically. On first startup it creates:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS vector_store (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content     TEXT,
    metadata    JSON,
    embedding   vector(1536)
);
CREATE INDEX IF NOT EXISTS spring_ai_vector_store_index
    ON vector_store USING HNSW (embedding vector_cosine_ops);
```

You do not write this SQL yourself — Spring AI generates it based on your configuration.

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> Set <code>initialize-schema: false</code> in production and manage the schema through your Flyway or Liquibase migrations. The <code>true</code> setting is convenient for development but bypasses your migration toolchain and can cause issues in CI/CD pipelines where the schema already exists.</p>
</blockquote>

## Step 4 — Verify the auto-configured beans

Spring AI auto-configures two beans for you:

1. `EmbeddingModel` — an `OpenAiEmbeddingModel` instance wired to your API key
2. `VectorStore` — a `PgVectorStore` wired to your `DataSource` and `EmbeddingModel`

Inject them to verify they load:

```java
@SpringBootApplication
public class SupportApp {

    public static void main(String[] args) {
        SpringApplication.run(SupportApp.class, args);
    }

    @Bean
    ApplicationRunner verifyVectorStore(VectorStore vectorStore, EmbeddingModel embeddingModel) {
        return args -> {
            System.out.println("EmbeddingModel: " + embeddingModel.getClass().getSimpleName());
            System.out.println("VectorStore: " + vectorStore.getClass().getSimpleName());

            // Quick smoke test: embed a string and verify the vector length
            float[] vector = embeddingModel.embed("test");
            System.out.println("Embedding dimensions: " + vector.length); // 1536
        };
    }
}
```

Run the application and look for the output. If you see `Embedding dimensions: 1536`, the stack is correctly wired.

Remove this `ApplicationRunner` bean once you have verified the setup.

## Step 5 — Test with a real document round-trip

Before building the full ingestion pipeline, verify that the vector store accepts documents and returns them on search:

```java
@SpringBootTest
class VectorStoreIntegrationTest {

    @Autowired
    VectorStore vectorStore;

    @Test
    void storesAndRetrievesDocumentBySemanticSimilarity() {
        // Store a document
        var doc = new Document(
            "ProX headphones support Bluetooth 5.2 with 30-meter range.",
            Map.of("productId", "PRX-2024", "source", "manual")
        );
        vectorStore.add(List.of(doc));

        // Search for it with a semantically similar query
        List<Document> results = vectorStore.similaritySearch(
            SearchRequest.query("wireless headphones bluetooth distance")
                .withTopK(1)
        );

        assertThat(results).hasSize(1);
        assertThat(results.get(0).getContent()).contains("ProX headphones");
    }
}
```

This test makes a real call to the OpenAI embedding API and writes to your local PostgreSQL. Run it once to confirm the full round-trip works, then annotate it with `@Disabled` or exclude it from the standard test suite to avoid API charges on every build.

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> For unit tests that don't need a real vector store, use <code>SimpleVectorStore</code> with a mocked or local <code>EmbeddingModel</code>. Spring AI's <code>TransformersEmbeddingModel</code> runs locally with a small ONNX model — no API key, no cost, suitable for unit tests in CI/CD.</p>
</blockquote>

## Using Ollama for embeddings (no API key)

If you want to develop without an OpenAI key, Ollama supports embedding models:

```yaml
# application-dev.yml (local development profile)
spring:
  ai:
    ollama:
      base-url: http://localhost:11434
      embedding:
        options:
          model: nomic-embed-text   # pull with: ollama pull nomic-embed-text

    vectorstore:
      pgvector:
        dimensions: 768   # nomic-embed-text produces 768-dimension vectors
```

```xml
<!-- Replace openai starter with ollama starter in dev profile -->
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-ollama-spring-boot-starter</artifactId>
</dependency>
```

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> The <code>dimensions</code> setting must match the embedding model's actual output. <code>text-embedding-3-small</code> produces 1536 dimensions. <code>nomic-embed-text</code> produces 768 dimensions. Mixing models or setting the wrong dimension count causes the HNSW index creation to fail or produces silently wrong search results. Always verify the dimension count from the model's documentation.</p>
</blockquote>

## Full configuration reference

```yaml
spring:
  ai:
    vectorstore:
      pgvector:
        initialize-schema: true          # auto-create table + index
        schema-name: public              # PostgreSQL schema
        table-name: vector_store         # table name
        index-type: HNSW                 # HNSW (fast) or IVFFLAT (less RAM)
        distance-type: COSINE_DISTANCE   # COSINE_DISTANCE | EUCLIDEAN_DISTANCE | NEGATIVE_INNER_PRODUCT
        dimensions: 1536                 # match your embedding model
        remove-existing-vector-store-table: false  # NEVER true in prod
        # HNSW tuning (advanced)
        hnsw-m: 16                       # number of connections per layer
        hnsw-ef-construction: 64         # index build quality (higher = better + slower)
        hnsw-ef-search: 40              # query quality (higher = better + slower)
```

The defaults work well for most use cases. You only tune `hnsw-m` and `hnsw-ef-construction` if you are optimising for recall vs. throughput at scale.

## What is set up now

After this post, Dev has:

- pgvector running in Docker
- Spring AI's `VectorStore` bean auto-configured and connected
- An `EmbeddingModel` ready to convert text to vectors
- The `vector_store` table and HNSW index created on startup
- A verified round-trip: document in, similar-query search returns it

The next post builds on this foundation to create the full ingestion pipeline: reading knowledge base documents, splitting them into chunks, and loading them into pgvector so the support assistant has something to search.

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> The schema Spring AI creates is a sensible starting point. In production, you will likely want to add metadata indexes (e.g., a B-tree index on <code>(metadata->>'tenantId')</code>) to speed up filtered searches. These are standard PostgreSQL indexes that complement the HNSW vector index.</p>
</blockquote>

## References

- <a href="https://docs.spring.io/spring-ai/reference/api/vectordbs/pgvector.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI pgvector store reference</a>
- <a href="https://github.com/pgvector/pgvector" target="_blank" rel="noopener" referrerpolicy="origin">pgvector GitHub — HNSW index documentation</a>
