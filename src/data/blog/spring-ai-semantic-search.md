---
title: Semantic search in Spring AI — find by meaning, not by keyword
description: With documents indexed in pgvector, VectorStore.similaritySearch() finds the most relevant chunks for any query. This post covers SearchRequest, similarity thresholds, metadata filters, and how to expose semantic search as an API endpoint.
pubDatetime: "2026-03-03T11:20:00+05:30"
tags:
  - spring-ai
  - springboot
  - java
---

Dev had 47 chunks in pgvector — product manuals, return policies, shipping information, warranty terms. The question was: given a customer's message, how do you find the most relevant chunks to help answer it?

The answer is `VectorStore.similaritySearch()`. One method call. Spring AI embeds the query, searches the HNSW index, and returns ranked results.

## Table of contents

## The basic search call

```java
List<Document> results = vectorStore.similaritySearch(
    SearchRequest.query("Can I return my headphones?")
        .withTopK(5)
);
```

What happens under the hood:
1. Spring AI calls `embeddingModel.embed("Can I return my headphones?")` to get a query vector
2. It queries pgvector's HNSW index for the 5 most similar vectors
3. It returns the matching `Document` objects with their content and metadata

The result is a list of documents ranked by similarity — the most relevant chunk first.

```java
results.forEach(doc -> {
    System.out.println("Score: " + doc.getScore());   // 0.0 to 1.0, higher = more similar
    System.out.println("Source: " + doc.getMetadata().get("source"));
    System.out.println("Content: " + doc.getContent());
    System.out.println("---");
});
```

For the query "Can I return my headphones?", the top result should be chunks from `return-policy.txt` — even though that file never uses the word "headphones".

## SearchRequest — controlling the search

`SearchRequest` is the query object. It supports several parameters:

```java
List<Document> results = vectorStore.similaritySearch(
    SearchRequest.query("bluetooth connection issues")
        .withTopK(5)                            // return at most 5 results
        .withSimilarityThreshold(0.75)          // minimum similarity score (0.0–1.0)
        .withFilterExpression("source == 'prox-manual.txt'")  // metadata filter
);
```

### withTopK — how many results to return

`topK` is the maximum number of results. Setting it to 5 does not mean you always get 5 — if fewer documents pass the similarity threshold, you get fewer.

For RAG (injecting context into an LLM prompt), 3–5 chunks is usually the right balance. Too few and you miss relevant information. Too many and the prompt grows large, increasing cost and potentially diluting the most relevant content.

### withSimilarityThreshold — quality floor

Cosine similarity scores range from 0.0 (completely unrelated) to 1.0 (identical). A threshold of 0.75 means "only return documents that are at least 75% similar to the query".

Without a threshold, `topK` always returns up to K results, even if none of them are meaningfully related to the query. The threshold prevents low-quality matches from being returned.

Tuning guidance:
- 0.7–0.8 is a reasonable starting range
- Too high (>0.9): few results, misses relevant but not-exact matches
- Too low (<0.5): returns irrelevant content that happens to share some words

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Log similarity scores during development. Print the score for every result returned by your queries against real data. This gives you an intuition for what "good enough" looks like for your specific domain and embedding model. Thresholds are not universal — they depend on your content and your users' query patterns.</p>
</blockquote>

### withFilterExpression — metadata pre-filtering

The filter expression narrows the search to documents matching a metadata condition before vector comparison. This is critical for multi-tenant applications or domain-specific search.

Spring AI's portable filter language supports:
```
// Equality
"source == 'return-policy.txt'"

// Inequality
"productCategory != 'accessories'"

// AND
"productCategory == 'headphones' && language == 'en'"

// OR
"department == 'support' || department == 'sales'"

// IN
"status in ['published', 'active']"

// Comparison operators
"priority >= 3"
```

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> Metadata filter values in the expression string are inserted directly. If filter values come from user input, build the <code>FilterExpressionBuilder</code> programmatically instead of string concatenation to avoid injection. Spring AI provides a type-safe builder for exactly this purpose.</p>
</blockquote>

Using the filter builder:

```java
import org.springframework.ai.vectorstore.filter.FilterExpressionBuilder;

FilterExpressionBuilder b = new FilterExpressionBuilder();
String category = request.getProductCategory();  // from user input

List<Document> results = vectorStore.similaritySearch(
    SearchRequest.query(userQuery)
        .withTopK(5)
        .withSimilarityThreshold(0.75)
        .withFilterExpression(
            b.eq("productCategory", category).build()
        )
);
```

## A semantic search service

Encapsulate the search logic in a service:

```java
@Service
class KnowledgeBaseSearchService {

    private final VectorStore vectorStore;

    KnowledgeBaseSearchService(VectorStore vectorStore) {
        this.vectorStore = vectorStore;
    }

    List<Document> findRelevantDocuments(String query) {
        return vectorStore.similaritySearch(
            SearchRequest.query(query)
                .withTopK(5)
                .withSimilarityThreshold(0.75)
        );
    }

    List<Document> findRelevantDocuments(String query, String source) {
        FilterExpressionBuilder b = new FilterExpressionBuilder();
        return vectorStore.similaritySearch(
            SearchRequest.query(query)
                .withTopK(5)
                .withSimilarityThreshold(0.75)
                .withFilterExpression(b.eq("source", source).build())
        );
    }
}
```

## Exposing semantic search as an API endpoint

For debugging and direct search use cases:

```java
@RestController
@RequestMapping("/api/search")
class SearchController {

    private final KnowledgeBaseSearchService searchService;

    SearchController(KnowledgeBaseSearchService searchService) {
        this.searchService = searchService;
    }

    @GetMapping
    List<SearchResult> search(@RequestParam String query) {
        List<Document> docs = searchService.findRelevantDocuments(query);

        return docs.stream()
                .map(doc -> new SearchResult(
                        doc.getContent(),
                        doc.getScore(),
                        (String) doc.getMetadata().get("source")
                ))
                .toList();
    }
}

record SearchResult(String content, Double score, String source) {}
```

Test it:

```bash
curl "http://localhost:8080/api/search?query=What+is+the+return+window"
```

The response should include chunks from the return policy document with scores around 0.80–0.95.

## What the search results look like

For the query "What is the return window", a well-functioning search returns:

```json
[
  {
    "content": "Items purchased from TechGadgets can be returned within 30 days of delivery...",
    "score": 0.912,
    "source": "return-policy.txt"
  },
  {
    "content": "Refunds are processed within 5-7 business days to the original payment method.",
    "score": 0.831,
    "source": "return-policy.txt"
  },
  {
    "content": "Electronics that have been activated may only be returned if defective.",
    "score": 0.788,
    "source": "return-policy.txt"
  }
]
```

Notice: the query used "window" (a time period), but the documents use "days" and "within". Semantic search connected those concepts. Keyword search would have missed them.

## Diagnosing poor search results

If search results are not relevant, check these in order:

| Symptom | Likely cause | Fix |
|---|---|---|
| Results are completely wrong | Embedding model mismatch between indexing and querying | Ensure same model in both phases |
| Results are irrelevant but not random | Chunks too large (embedding averages too many topics) | Reduce chunk size to 200–400 tokens |
| Expected document not returned | Threshold too high | Lower threshold; check actual scores with logging |
| Right topic but wrong content | Not enough chunks returned | Increase `topK` |
| Returns documents from wrong domain | Missing metadata filter | Add a filter to scope by category/source |
| Scores plateau around 0.6–0.7 | Query style different from document style | Use a query rewriter or HyDE (hypothetical document embedding) — covered in Module 4 |

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Build a small evaluation set of 10–20 representative queries with expected results. Run them against your search service after any significant change to chunk size, threshold, or embedding model. This prevents silent quality regressions when tuning one parameter that accidentally breaks another.</p>
</blockquote>

## Integrating search into the support assistant

You now have all the pieces of Module 3:

1. **pgvector running** — vector store and HNSW index in place
2. **Documents ingested** — knowledge base articles split, embedded, and stored
3. **Semantic search working** — `similaritySearch()` returns relevant chunks for any query

The next module — RAG — connects this search capability to the LLM. Instead of the assistant answering from training data alone, it will first retrieve relevant chunks from pgvector and inject them into the prompt as context. The LLM's answer is then grounded in your actual knowledge base.

```java
// This is what RAG looks like — preview of Module 4
String question = "What is the return policy for electronics?";

// 1. Find relevant chunks (Module 3 — this post)
List<Document> relevantDocs = searchService.findRelevantDocuments(question);

// 2. Format them as context
String context = relevantDocs.stream()
    .map(Document::getContent)
    .collect(Collectors.joining("\n\n"));

// 3. Ask the LLM with context injected (Module 4 — QuestionAnswerAdvisor does this automatically)
String answer = chatClient.prompt()
    .system("Answer using only the provided context. Context:\n" + context)
    .user(question)
    .call()
    .content();
```

Spring AI's `QuestionAnswerAdvisor` does steps 1–3 automatically. Module 4 shows you how to wire it.

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> Module 3 is complete. Dev can now embed any text content, store it in pgvector, and retrieve semantically relevant chunks for any user query. The support assistant still answers from its training data — that changes in Module 4 when RAG grounds every answer in the actual TechGadgets knowledge base.</p>
</blockquote>

## References

- <a href="https://docs.spring.io/spring-ai/reference/api/vectordbs.html#_search_options" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI VectorStore search options</a>
- <a href="https://docs.spring.io/spring-ai/reference/api/vectordbs/filter-metadata.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI metadata filter expressions</a>
