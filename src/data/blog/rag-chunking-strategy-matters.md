---
title: Chunking strategy in RAG — the decision that silently kills answer quality
description: How you split documents before indexing determines whether your RAG pipeline retrieves useful context or useless fragments. Chunk too large and embeddings average out. Chunk too small and context is missing. This post covers the tradeoffs.
pubDatetime: "2026-03-03T12:20:00+05:30"
tags:
  - spring-ai
  - ai-concepts
  - java
---

Dev's RAG pipeline was running. Most answers were good. But some were not. The assistant said "TechGadgets offers a 30-day return window" when the actual policy said electronics have a 60-day window for defects. The right document was in the vector store. The right answer was in that document. But the retrieval was returning the wrong chunk.

The culprit was chunking.

## Table of contents

## Why chunking is a quality lever

An embedding is a single vector representing the meaning of a piece of text. The longer the text, the more topics it covers — and the more topics, the less precisely the vector represents any one of them.

Imagine embedding a 10-page product manual as a single chunk. The vector for that manual sits somewhere between "product specifications", "safety warnings", "warranty terms", "troubleshooting steps", and "packaging instructions". A query about warranty terms may or may not land near it — because the vector is an average of all those topics diluted together.

Split the manual into one chunk per section, and the warranty section's vector precisely represents warranty terms. Queries about warranty terms now reliably find it.

**Chunking is the most impactful RAG tuning lever that has nothing to do with the LLM.**

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> Poor chunking produces poor retrieval, which produces poor answers — regardless of which LLM you use. You can swap GPT-4o-mini for GPT-4o and see no improvement if the root cause is that the retrieved chunks are irrelevant. Always diagnose retrieval quality separately from generation quality.</p>
</blockquote>

## The fundamental tradeoff

```
Small chunks (50–150 tokens)          Large chunks (800–1200 tokens)
────────────────────────────          ──────────────────────────────
+ Precise embeddings                  + Rich context for the LLM
+ High retrieval relevance            + Fewer API calls to index
- May lack context for the LLM        - Diluted embeddings
- More API calls to embed             - Lower retrieval precision
- More chunks to manage               - Misses detail-level queries
```

The target is the middle: chunks large enough to contain a self-contained thought, small enough that the embedding is precise.

In practice: **300–600 tokens** works well for most prose content. Structured content (tables, code, JSON) needs different handling.

## Fixed-size chunking

`TokenTextSplitter` splits text into chunks of a fixed token count with optional overlap. It is the default in Spring AI and the right starting point for most use cases.

```java
// 400 tokens per chunk, default overlap
TokenTextSplitter splitter = new TokenTextSplitter();

// Custom: 300 tokens, 50-token minimum, 5 sentences per block
TokenTextSplitter splitter = new TokenTextSplitter(300, 50, 5, 10000, true);
```

**Overlap** means adjacent chunks share some text. If chunk 1 ends at token 400 and overlap is 50, chunk 2 starts at token 350. This prevents answers that span a chunk boundary from being missed entirely — the overlapping tokens appear in both chunks, increasing the chance one of them is retrieved.

```
Without overlap:    [Chunk 1: tokens 1–400] [Chunk 2: tokens 401–800]
With 50-token overlap: [Chunk 1: tokens 1–400] [Chunk 2: tokens 351–750]
```

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Start with an overlap of 10–15% of your chunk size. For 400-token chunks, 40–60 tokens of overlap is a reasonable starting point. More overlap improves boundary recall at the cost of more storage and slightly more redundancy in retrieved context.</p>
</blockquote>

## Semantic chunking — split on meaning, not token count

Fixed-size chunking ignores document structure. A 400-token chunk might end in the middle of a sentence, or split a table in half, or break a step-by-step list across two chunks.

**Semantic chunking** splits on natural boundaries: paragraphs, sections, list items. The result is chunks that contain complete thoughts.

Spring AI does not ship a semantic splitter out of the box, but you can implement one by splitting on natural boundaries before passing to `TokenTextSplitter`:

```java
class SemanticTextSplitter implements DocumentTransformer {

    private final TokenTextSplitter tokenSplitter;
    private static final int MAX_CHUNK_TOKENS = 500;

    SemanticTextSplitter() {
        this.tokenSplitter = new TokenTextSplitter(MAX_CHUNK_TOKENS, 100, 5, 10000, true);
    }

    @Override
    public List<Document> apply(List<Document> documents) {
        List<Document> paragraphDocs = documents.stream()
                .flatMap(doc -> splitIntoParagraphs(doc).stream())
                .toList();

        // Apply token splitter to any paragraph still over the limit
        return tokenSplitter.apply(paragraphDocs);
    }

    private List<Document> splitIntoParagraphs(Document doc) {
        String[] paragraphs = doc.getContent().split("\n\n+");
        return Arrays.stream(paragraphs)
                .filter(p -> !p.isBlank())
                .map(paragraph -> new Document(paragraph, new HashMap<>(doc.getMetadata())))
                .toList();
    }
}
```

Usage in the ingestion pipeline:

```java
List<Document> raw = new TextReader(resource).get();
List<Document> chunks = new SemanticTextSplitter().apply(raw);
vectorStore.add(chunks);
```

## Chunking structured content

**Markdown / HTML documents** — split on headings (`## Section`). Each heading + its content becomes one chunk. The heading text gives the embedding strong semantic signal about the chunk's topic.

```java
class MarkdownSectionSplitter implements DocumentTransformer {

    @Override
    public List<Document> apply(List<Document> documents) {
        return documents.stream()
                .flatMap(doc -> splitByHeadings(doc).stream())
                .toList();
    }

    private List<Document> splitByHeadings(Document doc) {
        String[] sections = doc.getContent().split("(?m)^#{1,3} ");
        return Arrays.stream(sections)
                .filter(s -> !s.isBlank())
                .map(section -> {
                    String heading = section.split("\n")[0].trim();
                    Map<String, Object> meta = new HashMap<>(doc.getMetadata());
                    meta.put("section", heading);
                    return new Document("## " + section, meta);
                })
                .toList();
    }
}
```

**Tables** — do not split tables across chunks. A row without its header row is meaningless. Include the header row in every chunk that contains table data, or convert tables to prose before chunking.

**Code samples** — keep code blocks intact. A code snippet split in the middle is not retrievable as anything useful. Set a high `maxChunkSize` to prevent token splitter from cutting through code.

**PDFs** — `PagePdfDocumentReader` with `withPagesPerDocument(1)` creates one chunk per page, which is often a natural semantic boundary for structured documents.

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> Every document type in your knowledge base may need a different chunking strategy. A returns policy in plain text and a product data sheet in PDF have different natural structures. Auditing a sample of your chunks from each document type is the fastest way to spot problems before they affect production answer quality.</p>
</blockquote>

## Adding section context to chunks

A common retrieval problem: a chunk retrieved correctly but lacks context. "Defective items qualify for 60-day returns" is useful. But which product? Which condition applies?

The fix is to prepend section context to each chunk before embedding. Many teams prepend the document title and section heading:

```java
private List<Document> enrichWithContext(List<Document> chunks, String docTitle) {
    return chunks.stream()
            .map(chunk -> {
                String section = (String) chunk.getMetadata().getOrDefault("section", "");
                String enrichedContent = docTitle + (section.isBlank() ? "" : " > " + section)
                        + "\n\n" + chunk.getContent();
                return new Document(enrichedContent, chunk.getMetadata());
            })
            .toList();
}
```

Now the embedding for "Defective items qualify for 60-day returns" captures "TechGadgets Return Policy > Electronics Returns > Defective items qualify for 60-day returns" — the context is part of the embedding signal.

This technique is sometimes called **contextual chunking** and consistently improves retrieval precision in production systems.

## How to measure chunking quality

Intuition only goes so far. Build a small evaluation set and measure:

```java
record EvalCase(String question, String expectedContent) {}

List<EvalCase> evalSet = List.of(
    new EvalCase("What is the return window for defective electronics?", "60-day"),
    new EvalCase("How long does standard shipping take?", "5-7 business days"),
    new EvalCase("Is express shipping available?", "2-3 business days")
);

long correct = evalSet.stream()
        .filter(evalCase -> {
            List<Document> results = vectorStore.similaritySearch(
                SearchRequest.query(evalCase.question()).withTopK(3)
            );
            return results.stream()
                    .anyMatch(doc -> doc.getContent().contains(evalCase.expectedContent()));
        })
        .count();

System.out.printf("Retrieval accuracy: %d/%d (%.0f%%)%n",
    correct, evalSet.size(), 100.0 * correct / evalSet.size());
```

Run this evaluation after changing chunk size, overlap, or splitting strategy. A retrieval accuracy below 80% on your eval set is a strong signal to revisit the chunking approach.

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Build your eval set from real user queries. Collect the first 20–30 questions that users actually ask, identify what the expected answer should be, and use those as your benchmark. Synthetic questions that you write yourself tend to match your chunking strategy too well and underestimate real-world retrieval failures.</p>
</blockquote>

## Chunking strategy summary

| Content type | Recommended strategy | Chunk size |
|---|---|---|
| Prose documents | TokenTextSplitter with overlap | 300–500 tokens |
| Policy / FAQ documents | Paragraph-based splitting | One Q&A pair per chunk |
| Markdown documentation | Section-based (split on `##`) | One section per chunk |
| Product manuals | Page-based (PDF page = chunk) | One page per chunk |
| Code documentation | Keep code blocks intact | Function/method level |
| Tables | Include header row in every chunk | One table = one chunk |

There is no universal right answer. Profile your content, measure retrieval quality, and tune iteratively.

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> The next post builds the complete document Q&A chatbot — bringing together the ingestion pipeline, the RAG advisor, chunking, and streaming into one application you can run and test end-to-end. After that, Module 4 closes with advanced retrieval quality techniques: reranking and hybrid search.</p>
</blockquote>

## References

- <a href="https://docs.spring.io/spring-ai/reference/api/etl-pipeline.html#_text_splitters" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI Text Splitters reference</a>
- <a href="https://www.anthropic.com/research/contextual-retrieval" target="_blank" rel="noopener" referrerpolicy="origin">Anthropic: Contextual Retrieval</a>
