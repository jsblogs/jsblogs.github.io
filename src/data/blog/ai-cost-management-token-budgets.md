---
title: Controlling AI costs in production — token budgets, caching, and model selection
description: LLM API costs scale directly with token volume. A busy support assistant can easily spend hundreds of dollars per day if left unmanaged. This post covers the practical techniques that meaningfully reduce costs without sacrificing answer quality.
pubDatetime: "2026-03-03T16:40:00+05:30"
tags:
  - spring-ai
  - springboot
  - java
---

Dev's first month production bill arrived. The support assistant had handled 18,000 conversations. The OpenAI bill was $340. Not catastrophic — but growing linearly with usage, and the product roadmap called for 10x traffic growth next quarter.

The token usage breakdown: 62% was prompt tokens from conversation history, 21% was RAG context, 12% was system prompt, 5% was the actual user question. Three quarters of the cost was context overhead, not content.

## Table of contents

## Where tokens actually go

Before optimising, measure. The `AiAuditAdvisor` from the previous post captures token counts per request. Aggregate them by component to find the biggest spenders:

```
Typical request breakdown (tokens):
  System prompt:           ~150  tokens
  Conversation history:   ~2,000 tokens  ← biggest cost driver in long sessions
  RAG context (5 chunks): ~500  tokens
  Tool definitions:        ~300  tokens
  User question:           ~50   tokens
  ─────────────────────────────────────
  Total prompt:           ~3,000 tokens
  Completion:              ~200  tokens
  ─────────────────────────────────────
  Total:                  ~3,200 tokens
```

At $0.15/1M tokens (gpt-4o-mini), one request costs $0.00048. At 100 requests/minute, that is $69/day or $2,070/month. Reducing prompt tokens by 30% saves $621/month.

## Technique 1 — Right-size the model for each task

Not every task needs the most capable model. Use cheap, fast models where they are sufficient:

| Task | Model | Cost per 1M tokens |
|---|---|---|
| Classification (intent, sentiment) | `gpt-4o-mini` or Haiku | $0.15 input / $0.60 output |
| Summarisation | `gpt-4o-mini` | $0.15 / $0.60 |
| Main support responses | `gpt-4o-mini` | $0.15 / $0.60 |
| Complex reasoning, code | `gpt-4o` | $2.50 / $10.00 |
| Embeddings | `text-embedding-3-small` | $0.02 / N/A |

For the TechGadgets support assistant, `gpt-4o-mini` handles 95% of questions correctly. Reserve `gpt-4o` only for escalated complex cases.

```java
// Route simple Q&A to cheap model
ChatClient cheapClient = builder
        .defaultOptions(OpenAiChatOptions.builder().model("gpt-4o-mini").build())
        .build();

// Route complex cases (escalated, multi-step reasoning) to powerful model
ChatClient powerClient = builder
        .defaultOptions(OpenAiChatOptions.builder().model("gpt-4o").build())
        .build();

// Decision logic
ChatClient client = isComplexCase(question) ? powerClient : cheapClient;
```

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Classify query complexity with a cheap model first. "Is this a simple policy question or a complex case?" costs 50 tokens. Routing the complex 5% of queries to a premium model while keeping the other 95% on the cheap model saves significantly without degrading quality for the cases that matter most.</p>
</blockquote>

## Technique 2 — Control conversation history window aggressively

Conversation history is the largest variable cost in the support assistant. Each turn added to the window costs more on every subsequent turn.

The session length distribution matters. If 80% of conversations are under 5 turns, optimise for that:

```java
// Smaller window for most conversations
MessageChatMemoryAdvisor.builder(chatMemory)
    .conversationWindowSize(10)   // 5 turns — enough for most support conversations
    .build()
```

For the 20% that go longer, the summarisation technique from Module 5 keeps costs bounded:

```
Turn 1–10: ~1,000 tokens of history (full)
Turn 11–20: ~300 tokens (summary) + ~1,000 tokens (last 10)
Turn 21–30: ~300 tokens (summary) + ~1,000 tokens (last 10)
```

After summarisation kicks in, history cost is bounded regardless of session length.

## Technique 3 — Trim the RAG context

Retrieving 5 chunks at ~100 tokens each adds 500 tokens per request. Two levers:

**Reduce topK:** If your retrieval quality is good, 3 chunks may answer as well as 5. Test with your evaluation set:

```java
SearchRequest.defaults().withTopK(3)   // was 5 — test retrieval quality first
```

**Raise the similarity threshold:** Higher threshold = fewer chunks retrieved = lower cost. If you raise from 0.70 to 0.78, the average retrieved count may drop from 5 to 3.

**Truncate chunk text:** If chunks average 150 tokens but you only need the first 100, truncate:

```java
List<Document> results = vectorStore.similaritySearch(request);
List<Document> trimmed = results.stream()
        .map(doc -> {
            String content = doc.getContent();
            // Simple truncation — in production, truncate at sentence boundary
            if (content.length() > 600) content = content.substring(0, 600) + "...";
            return new Document(content, doc.getMetadata());
        })
        .toList();
```

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> Always measure retrieval quality before and after reducing context. Cutting RAG context to save tokens can reduce answer accuracy. Run your evaluation set after each change to verify accuracy has not dropped. Cost and quality are a tradeoff — measure both.</p>
</blockquote>

## Technique 4 — Use maxTokens to cap response length

The completion (`maxTokens`) is a hard cap on output tokens. Set it appropriate to your use case:

```java
OpenAiChatOptions.builder()
    .model("gpt-4o-mini")
    .maxTokens(300)    // 300 tokens ≈ 200-250 words — enough for most support answers
    .build()
```

If users regularly need longer answers (detailed troubleshooting), set a higher limit — but monitor `FINISH_REASON = LENGTH` in your metrics. If it exceeds 5%, responses are being cut off and `maxTokens` is too low for those queries.

## Technique 5 — Prompt caching

OpenAI, Anthropic, and Google all offer **prompt caching** — when the same prefix appears in repeated requests, the provider caches the computed KV state and charges reduced rates for the cached portion (typically 50–90% discount).

For the support assistant, the system prompt (150 tokens) and common RAG context for the same document (500 tokens) are good candidates for caching.

OpenAI prompt caching is automatic for prompts over 1,024 tokens. Anthropic requires the `cache_control` parameter:

```java
// Spring AI handles cache_control via options for Anthropic
ChatOptions options = AnthropicChatOptions.builder()
        .model("claude-haiku-20240307")
        .build();
```

The system prompt is automatically eligible for caching when using Claude. For the support assistant where the system prompt is identical on every request, caching saves the system prompt tokens on every request after the first.

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> To maximise cache hit rate, put stable content (system prompt, static RAG context) at the beginning of your prompt and variable content (user message, conversation history) at the end. Caching works on the prefix — the longer the stable prefix, the higher the hit rate.</p>
</blockquote>

## Technique 6 — Deduplicate embedding calls

Every `vectorStore.add()` call sends text to the embedding API. If you re-ingest the same document repeatedly (e.g., every deployment), you pay for redundant embeddings.

Add a content hash to skip unchanged documents:

```java
void ingestIfChanged(Resource resource, String source) {
    String contentHash = computeHash(resource);

    // Check if this source + hash already exists in metadata
    List<Document> existing = vectorStore.similaritySearch(
        SearchRequest.query("hash check")
            .withTopK(1)
            .withFilterExpression("source == '" + source + "' && contentHash == '" + contentHash + "'")
    );

    if (!existing.isEmpty()) {
        log.debug("Skipping unchanged document: {}", source);
        return;
    }

    // Delete old version, ingest new
    deleteBySource(source);
    ingestFile(resource, source, contentHash);
}

private String computeHash(Resource resource) {
    try (InputStream is = resource.getInputStream()) {
        return DigestUtils.md5DigestAsHex(is);
    } catch (IOException e) {
        throw new RuntimeException(e);
    }
}
```

For a knowledge base of 100 documents that rarely changes, this eliminates 99% of embedding costs after the initial ingestion.

## Cost monitoring dashboard

Track these four numbers weekly:

```java
// Weekly cost estimation (log to Slack/PagerDuty)
@Scheduled(cron = "0 0 9 * * MON")
void weeklyTokenReport() {
    long promptTokens = meterRegistry.counter("ai.tokens.prompt").count();
    long completionTokens = meterRegistry.counter("ai.tokens.completion").count();

    // gpt-4o-mini pricing
    double inputCost  = (promptTokens     / 1_000_000.0) * 0.15;
    double outputCost = (completionTokens / 1_000_000.0) * 0.60;
    double totalCost  = inputCost + outputCost;

    log.info("Weekly AI cost report: promptTokens={} completionTokens={} estimatedCost=${:.2f}",
        promptTokens, completionTokens, totalCost);
}
```

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> Token costs decrease over time as models improve and competition increases. The techniques here are about managing costs at current prices — but the architectural discipline (right-sizing models, bounding context, measuring everything) is valuable regardless of the absolute price per token.</p>
</blockquote>

## References

- <a href="https://openai.com/api/pricing" target="_blank" rel="noopener" referrerpolicy="origin">OpenAI API pricing</a>
- <a href="https://platform.openai.com/docs/guides/prompt-caching" target="_blank" rel="noopener" referrerpolicy="origin">OpenAI prompt caching guide</a>
- <a href="https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching" target="_blank" rel="noopener" referrerpolicy="origin">Anthropic prompt caching</a>
