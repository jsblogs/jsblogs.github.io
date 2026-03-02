---
title: Building your first RAG pipeline with Spring AI
description: Spring AI's QuestionAnswerAdvisor wires retrieval directly into ChatClient. Attach it to your VectorStore and every call automatically retrieves relevant context before the LLM sees the question. This post builds the complete pipeline.
pubDatetime: "2026-03-03T12:00:00+05:30"
tags:
  - spring-ai
  - springboot
  - java
---

Dev had the pieces. pgvector was running. Knowledge base articles were indexed. `similaritySearch()` was returning the right chunks. Now the final step: connect the search to the LLM so retrieved context automatically flows into every answer.

Spring AI's `QuestionAnswerAdvisor` does this in three lines of configuration.

## Table of contents

## The QuestionAnswerAdvisor

`QuestionAnswerAdvisor` is a Spring AI advisor — a component that wraps every `ChatClient` call with pre-processing and post-processing logic. It implements RAG automatically:

1. **Before the LLM call:** takes the user's question, searches the vector store, retrieves the top-K matching documents, and injects them into the prompt as context
2. **The LLM call:** the model receives a prompt that includes both the question and the retrieved context
3. **After the LLM call:** the response is returned normally

You attach it to the `ChatClient` builder. Every call through that client automatically uses RAG — no per-request code needed.

## Wiring the advisor

```java
@Configuration
class AiConfig {

    @Bean
    ChatClient supportClient(
            ChatClient.Builder builder,
            VectorStore vectorStore
    ) {
        return builder
                .defaultSystem("""
                        You are a customer support assistant for TechGadgets.
                        Answer questions about products, orders, and store policies.
                        Use only the information provided in the context below.
                        If the answer is not in the context, say: "I don't have that information. Please contact support@techgadgets.com."
                        Keep answers concise — 2 to 4 sentences.
                        """)
                .defaultAdvisors(
                    new QuestionAnswerAdvisor(vectorStore)
                )
                .defaultOptions(OpenAiChatOptions.builder()
                        .model("gpt-4o-mini")
                        .temperature(0.2)
                        .build())
                .build();
    }
}
```

That is it. The controller stays the same as before:

```java
@RestController
@RequestMapping("/api/support")
class SupportController {

    private final ChatClient chatClient;

    SupportController(@Qualifier("support") ChatClient chatClient) {
        this.chatClient = chatClient;
    }

    @PostMapping("/chat")
    SupportResponse chat(@RequestBody SupportRequest request) {
        String answer = chatClient.prompt()
                .user(request.question())
                .call()
                .content();
        return new SupportResponse(answer);
    }
}

record SupportRequest(String question) {}
record SupportResponse(String answer) {}
```

The controller has not changed at all. The RAG behaviour is entirely in the advisor.

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> The <code>QuestionAnswerAdvisor</code> automatically adds a <code>RETRIEVED_DOCUMENTS</code> key to the advisor context. You can access the retrieved documents via <code>advisorContext.get(QuestionAnswerAdvisor.RETRIEVED_DOCUMENTS)</code> if you need to show citations or log which documents were used.</p>
</blockquote>

## What the advisor actually sends to the LLM

When a user asks "What is your return policy?", the `QuestionAnswerAdvisor`:

1. Embeds "What is your return policy?" using `EmbeddingModel`
2. Calls `vectorStore.similaritySearch()` for top-4 matching documents
3. Formats retrieved chunks into a context block
4. Builds the prompt that the LLM actually receives:

```
[System prompt]
You are a customer support assistant for TechGadgets...

[Retrieved context injected by QuestionAnswerAdvisor]
Context information is below.
---------------------
Items purchased from TechGadgets can be returned within 30 days of delivery.
Items must be in original condition with all accessories and packaging.
Electronics that have been activated may only be returned if defective.
[... more retrieved chunks ...]
---------------------
Given the context information and not prior knowledge, answer the query.

[User question]
What is your return policy?
```

The LLM reads the context block and answers from it. The generic "most retailers offer 30 days" answer is replaced with TechGadgets' actual 30-day policy — or 60 days if that is what the knowledge base says.

## Tuning the advisor

`QuestionAnswerAdvisor` accepts a `SearchRequest` to control retrieval behaviour:

```java
new QuestionAnswerAdvisor(
    vectorStore,
    SearchRequest.defaults()
        .withTopK(5)                        // retrieve 5 chunks (default: 4)
        .withSimilarityThreshold(0.75)      // minimum score threshold
)
```

You can also override the prompt template used to inject context. The default template instructs the LLM to answer from context only. If you need a different instruction — for example, to allow fallback to training data for general questions — you can customise the template:

```java
String customTemplate = """
        Use the following context to answer the question.
        If the context is insufficient, use your general knowledge but say so.

        Context:
        {question_answer_context}

        Question: {input}
        """;

new QuestionAnswerAdvisor(vectorStore, SearchRequest.defaults(), customTemplate)
```

The `{question_answer_context}` and `{input}` placeholders are filled by the advisor at runtime.

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> If you allow the LLM to fall back to training data (no strict "only use context" instruction), you lose the grounding guarantee. The model may blend retrieved facts with training patterns, producing answers that are partially right but not traceable. Start with strict grounding and only relax it if you have a specific tested reason to do so.</p>
</blockquote>

## Verifying RAG is working

The simplest way to verify RAG is active: ask a question the LLM cannot answer from training data — something specific to your knowledge base. If the answer reflects your indexed content, RAG is working.

A more thorough approach: enable `SimpleLoggerAdvisor` alongside `QuestionAnswerAdvisor` and check the logged prompt. You should see the retrieved context block in the full prompt:

```java
.defaultAdvisors(
    new QuestionAnswerAdvisor(vectorStore),
    new SimpleLoggerAdvisor()              // logs full prompt to DEBUG
)
```

Set logging level to DEBUG for `org.springframework.ai` in `application.yml`:

```yaml
logging:
  level:
    org.springframework.ai: DEBUG
```

The log will show the exact prompt the model receives — including the injected context blocks. This is the fastest way to confirm retrieval is working and to debug cases where the wrong documents are being retrieved.

## Handling the case where no context is found

When the user asks a question unrelated to your knowledge base — "What is the capital of France?" — the vector search returns no results above the similarity threshold. The advisor injects an empty context block.

With the default prompt template, the LLM sees "Context information is below. [empty]" and should reply that it does not have that information.

Test this explicitly:

```java
@Test
void returnsFallbackWhenNoContextFound() {
    String answer = chatClient.prompt()
            .user("What is the capital of France?")
            .call()
            .content();

    // Should NOT answer "Paris" — should say it doesn't have the information
    assertThat(answer.toLowerCase()).contains("don't have");
}
```

If the model still answers "Paris", your system prompt grounding instruction needs strengthening: "Answer ONLY from the context below. Do not use prior knowledge."

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> Test your fallback behaviour before going to production. An assistant that answers out-of-scope questions with confident training-data answers can give users wrong information or create liability issues. The system prompt instruction to limit answers to context is a guardrail — verify it holds under realistic off-topic queries.</p>
</blockquote>

## Dynamic metadata filtering per request

For multi-tenant applications, you often need to filter the search to the current user's data. Pass filter expressions at call time using advisor context:

```java
@PostMapping("/chat")
SupportResponse chat(@RequestBody SupportRequest request, Authentication auth) {
    String tenantId = getTenantId(auth);

    String answer = chatClient.prompt()
            .user(request.question())
            .advisors(advisor -> advisor
                .param(QuestionAnswerAdvisor.FILTER_EXPRESSION,
                       "tenantId == '" + tenantId + "'")
            )
            .call()
            .content();

    return new SupportResponse(answer);
}
```

The `FILTER_EXPRESSION` parameter is applied to the vector store search for this call only. Other calls through the same `ChatClient` are not affected.

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Use the <code>FilterExpressionBuilder</code> to build filter expressions from user-supplied values rather than string concatenation. It prevents metadata injection and makes the code clearer:</p>
  <pre><code>FilterExpressionBuilder b = new FilterExpressionBuilder();
String expr = b.eq("tenantId", tenantId).build().toString();</code></pre>
</blockquote>

## The complete RAG-enabled support endpoint

Combining everything from Module 3 and this post:

```java
@Configuration
class AiConfig {

    @Bean
    ChatClient supportClient(
            ChatClient.Builder builder,
            VectorStore vectorStore
    ) {
        return builder
                .defaultSystem(new ClassPathResource("prompts/support-system.st"))
                .defaultAdvisors(
                    new QuestionAnswerAdvisor(
                        vectorStore,
                        SearchRequest.defaults()
                            .withTopK(5)
                            .withSimilarityThreshold(0.7)
                    ),
                    new SimpleLoggerAdvisor()
                )
                .defaultOptions(OpenAiChatOptions.builder()
                        .model("gpt-4o-mini")
                        .temperature(0.2)
                        .maxTokens(400)
                        .build())
                .build();
    }
}
```

**`src/main/resources/prompts/support-system.st`:**
```
You are a customer support assistant for TechGadgets, an online electronics store.

Answer questions about products, orders, shipping, and store policies.
Use only the information provided in the context below — do not use prior knowledge.
If the answer is not in the context, say exactly:
"I don't have that information right now. Please contact support@techgadgets.com."

Keep responses concise — 2 to 4 sentences unless more detail is explicitly requested.
```

This is now a grounded support assistant. It answers from TechGadgets' actual knowledge base. It declines questions it cannot answer from that knowledge base. Every answer is traceable to a specific indexed document.

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> The advisor chain order matters. Spring AI applies advisors in registration order before the LLM call and in reverse order after. Put <code>QuestionAnswerAdvisor</code> before <code>SimpleLoggerAdvisor</code> so the logger captures the full prompt including the injected context.</p>
</blockquote>

## References

- <a href="https://docs.spring.io/spring-ai/reference/api/advisors.html#_question_answer_advisor" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI QuestionAnswerAdvisor reference</a>
- <a href="https://docs.spring.io/spring-ai/reference/api/advisors.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI Advisors overview</a>
