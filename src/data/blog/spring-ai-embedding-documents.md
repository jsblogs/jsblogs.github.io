---
title: Embedding and storing documents with Spring AI — a step-by-step guide
description: Before you can search your knowledge base semantically, you need to read documents, split them into chunks, generate embeddings, and store them in the vector database. Spring AI's ETL pipeline handles all of it.
pubDatetime: "2026-03-03T11:00:00+05:30"
tags:
  - spring-ai
  - springboot
  - java
---

Dev had the vector store running. Now came the next question: how do you get knowledge base articles into it?

The articles lived in a few places: some as PDF files in a shared folder, some as text files generated from a content management system, some as plain strings in a database. Each one needed to be read, split into manageable pieces, converted to embeddings, and stored in pgvector.

Spring AI calls this the **ETL pipeline** — Extract, Transform, Load. It ships ready-made components for each stage.

## Table of contents

## The three stages of document ingestion

```
┌─────────────────┐    ┌──────────────────────┐    ┌─────────────────────┐
│   DocumentReader │    │ TokenTextSplitter    │    │   VectorStore       │
│                 │    │                      │    │                     │
│  read()         │───▶│  apply()             │───▶│  add()              │
│  → List<Doc>    │    │  → List<Doc> (chunks)│    │  (embeds + stores)  │
└─────────────────┘    └──────────────────────┘    └─────────────────────┘
     EXTRACT                 TRANSFORM                    LOAD
```

1. **Extract** — read raw content from its source (PDF, text file, URL, plain string)
2. **Transform** — split the content into chunks that fit within the embedding model's token limit
3. **Load** — call `vectorStore.add(chunks)`, which embeds each chunk and stores it with its metadata

## Step 1 — Extract: reading documents

Spring AI ships several `DocumentReader` implementations. The common ones:

```java
// From a plain text file on the classpath
Resource resource = new ClassPathResource("knowledge-base/return-policy.txt");
TextReader textReader = new TextReader(resource);
List<Document> docs = textReader.get();

// From a PDF file
Resource pdfResource = new ClassPathResource("manuals/prox-headphones.pdf");
PagePdfDocumentReader pdfReader = new PagePdfDocumentReader(pdfResource);
List<Document> pdfDocs = pdfReader.get();

// From a string (useful when content comes from a database or API)
Document doc = new Document(
    "TechGadgets return policy: Items can be returned within 30 days of purchase...",
    Map.of("source", "return-policy", "version", "2024-01")
);
```

Each `DocumentReader` returns a `List<Document>`. A `Document` has:
- `content` — the text
- `metadata` — a `Map<String, Object>` you control

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Always populate metadata with at least a <code>source</code> field that identifies where the document came from. When the RAG pipeline later injects retrieved documents into a prompt, the source metadata lets you include citations — and lets you debug why a particular document was or was not retrieved.</p>
</blockquote>

## Step 2 — Transform: splitting into chunks

The embedding model has a token limit (8191 for `text-embedding-3-small`). More importantly, embedding a large document makes it an average of all its topics — reducing search precision. Smaller, focused chunks produce better search results.

`TokenTextSplitter` is Spring AI's built-in splitter. It splits documents into chunks of a target size with overlap between adjacent chunks:

```java
TokenTextSplitter splitter = new TokenTextSplitter(
    400,    // target chunk size in tokens
    100,    // minimum chunk size to keep
    5,      // number of sentences to merge
    10000,  // max chunk characters (safety limit)
    true    // keep separator
);

List<Document> chunks = splitter.apply(docs);
```

The simpler form uses defaults (400 tokens, 150 token overlap):

```java
TokenTextSplitter splitter = new TokenTextSplitter();
List<Document> chunks = splitter.apply(docs);
```

Each original document is split into multiple chunks. Each chunk inherits the metadata from its parent document, plus Spring AI adds a `doc_index` field indicating which chunk position it is.

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> Chunk size is a tuning parameter with real quality impact. Small chunks (100–200 tokens) are precise but may lack context. Large chunks (800–1000 tokens) retain context but reduce search precision because the embedding averages more topics. Start with 400 tokens and measure retrieval quality on real queries before tuning. This topic is covered in depth in the RAG module.</p>
</blockquote>

## Step 3 — Load: storing with embeddings

Once you have chunks, `vectorStore.add()` handles the rest:

```java
vectorStore.add(chunks);
```

Spring AI calls `embeddingModel.embed()` for each chunk's text, then stores the vector, content, and metadata in pgvector. One `add()` call per batch — do not call it in a loop per document.

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> <code>vectorStore.add()</code> calls the embedding API once per document in the list. Embedding 1000 documents makes 1000 API calls. Batch your ingestion and run it as a scheduled job or admin endpoint — not in the web request path. Each embedding call costs money and takes time. Process documents in batches of 50–100 to balance throughput and API rate limits.</p>
</blockquote>

## Putting it together: an ingestion service

Here is a complete ingestion service for the support assistant's knowledge base:

```java
@Service
class KnowledgeBaseIngestionService {

    private final VectorStore vectorStore;
    private final TokenTextSplitter splitter;

    KnowledgeBaseIngestionService(VectorStore vectorStore) {
        this.vectorStore = vectorStore;
        this.splitter = new TokenTextSplitter();
    }

    void ingestTextFile(Resource resource, String source) {
        List<Document> raw = new TextReader(resource).get();

        // Tag each document with the source before splitting
        raw.forEach(doc -> doc.getMetadata().put("source", source));

        List<Document> chunks = splitter.apply(raw);
        vectorStore.add(chunks);

        log.info("Ingested {} chunks from {}", chunks.size(), source);
    }

    void ingestPdf(Resource pdfResource, String source) {
        PagePdfDocumentReader reader = new PagePdfDocumentReader(
            pdfResource,
            PdfDocumentReaderConfig.builder()
                .withPageExtractedTextFormatter(
                    ExtractedTextFormatter.defaults()
                )
                .withPagesPerDocument(1)   // one Document per PDF page
                .build()
        );

        List<Document> pages = reader.get();
        pages.forEach(doc -> doc.getMetadata().put("source", source));

        List<Document> chunks = splitter.apply(pages);
        vectorStore.add(chunks);

        log.info("Ingested {} chunks from PDF {}", chunks.size(), source);
    }

    void ingestString(String content, Map<String, Object> metadata) {
        Document doc = new Document(content, metadata);
        List<Document> chunks = splitter.apply(List.of(doc));
        vectorStore.add(chunks);
    }
}
```

## An ingestion endpoint for manual runs

For the support assistant, knowledge base articles change infrequently. An admin endpoint to trigger ingestion on demand is more practical than scheduling:

```java
@RestController
@RequestMapping("/admin/knowledge-base")
class IngestionController {

    private final KnowledgeBaseIngestionService ingestionService;
    private final ResourceLoader resourceLoader;

    IngestionController(
            KnowledgeBaseIngestionService ingestionService,
            ResourceLoader resourceLoader
    ) {
        this.ingestionService = ingestionService;
        this.resourceLoader = resourceLoader;
    }

    @PostMapping("/ingest")
    ResponseEntity<String> ingest() {
        Resource[] resources = new PathMatchingResourcePatternResolver()
                .getResources("classpath:knowledge-base/*.txt");

        for (Resource resource : resources) {
            String source = resource.getFilename();
            ingestionService.ingestTextFile(resource, source);
        }

        return ResponseEntity.ok("Ingested " + resources.length + " files");
    }
}
```

Store knowledge base files in `src/main/resources/knowledge-base/`. Call the endpoint when content changes.

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Secure ingestion endpoints behind an admin role. In production, this endpoint makes external API calls and writes to the database — you do not want it callable by unauthenticated users. A simple <code>@PreAuthorize("hasRole('ADMIN')")</code> is enough for most cases.</p>
</blockquote>

## Avoiding duplicate documents

If you run ingestion multiple times, you will accumulate duplicate chunks in pgvector. Spring AI does not deduplicate automatically.

The simplest approach: delete documents by source before re-ingesting:

```java
void reingestTextFile(Resource resource, String source) {
    // Delete all existing chunks for this source
    vectorStore.delete(
        // Get IDs of all documents with this source metadata
        vectorStore.similaritySearch(
            SearchRequest.query("")
                .withTopK(10000)
                .withFilterExpression("source == '" + source + "'")
        ).stream().map(Document::getId).toList()
    );

    // Re-ingest fresh content
    ingestTextFile(resource, source);
}
```

A cleaner approach in production: use a custom metadata field like `contentHash` and skip documents whose hash has not changed.

## Populating the knowledge base for the support assistant

Create a few test documents in `src/main/resources/knowledge-base/`:

**`return-policy.txt`:**
```
TechGadgets Return Policy

Items purchased from TechGadgets can be returned within 30 days of delivery.
Items must be in original condition with all accessories and packaging.
Electronics that have been activated may only be returned if defective.
To initiate a return, visit support.techgadgets.com or call 1-800-TECH-HELP.
Refunds are processed within 5-7 business days to the original payment method.
```

**`shipping-info.txt`:**
```
TechGadgets Shipping Information

Standard shipping takes 5-7 business days and is free on orders over $50.
Express shipping (2-3 business days) costs $12.99.
Next-day delivery is available in select ZIP codes for $24.99.
Orders placed before 2 PM EST ship same day.
International shipping is available to 45 countries.
```

Run the ingestion endpoint once, and the vector store is populated with 4–6 chunks from these two files, ready for semantic search.

## The full picture

After ingestion, pgvector contains:

| id | content (excerpt) | metadata |
|---|---|---|
| uuid-1 | "Items purchased from TechGadgets can be returned..." | `{source: "return-policy.txt", doc_index: 0}` |
| uuid-2 | "Electronics that have been activated may only..." | `{source: "return-policy.txt", doc_index: 1}` |
| uuid-3 | "Standard shipping takes 5-7 business days..." | `{source: "shipping-info.txt", doc_index: 0}` |
| ... | ... | ... |

Each row has an associated `embedding` vector column (1536 floats) that the HNSW index can search efficiently.

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> The next post builds semantic search on top of this data — querying pgvector with a user's question and retrieving the most relevant chunks. That is the last piece before Module 4 connects everything into a RAG pipeline where those retrieved chunks are injected into the LLM prompt.</p>
</blockquote>

## References

- <a href="https://docs.spring.io/spring-ai/reference/api/etl-pipeline.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI ETL Pipeline reference</a>
- <a href="https://docs.spring.io/spring-ai/reference/api/etl-pipeline.html#_document_readers" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI Document Readers</a>
- <a href="https://docs.spring.io/spring-ai/reference/api/etl-pipeline.html#_text_splitters" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI Text Splitters</a>
