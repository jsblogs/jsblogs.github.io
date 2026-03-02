---
title: Understanding Spring AI's ChatClient — the heart of every AI call
description: ChatClient is the central abstraction in Spring AI. This post covers the builder API, default system prompts, per-call options, advisors, and the difference between call() and stream() — everything you need to use it effectively.
pubDatetime: "2026-03-02T21:00:00+05:30"
tags:
  - springboot
  - spring-ai
  - java
---

Dev's first `ChatClient` call worked. Now came the real questions: how do you set a persistent system prompt? How do you override the temperature for one specific call? What is an advisor? What does `call()` return compared to `stream()`?

`ChatClient` looks simple on the surface — and the basic usage is simple. But it has a well-designed depth that makes it useful for production systems. This post maps all of it.

## Table of contents

## The ChatClient.Builder — where configuration lives

`ChatClient.Builder` is auto-configured by Spring AI. You inject it and call `.build()` to produce a `ChatClient`. The builder is where you set defaults that apply to every call made through that client instance.

```java
@Bean
ChatClient chatClient(ChatClient.Builder builder) {
    return builder
            .defaultSystem("You are a helpful assistant.")
            .defaultOptions(OpenAiChatOptions.builder()
                    .model("gpt-4o-mini")
                    .temperature(0.2)
                    .maxTokens(500)
                    .build())
            .build();
}
```

You can create multiple `ChatClient` beans — one per use case — each with different system prompts and options. A support bot and a code-review bot can share the same underlying `ChatClient.Builder` but produce clients with entirely different personalities.

```java
@Configuration
class AiConfig {

    @Bean
    @Qualifier("support")
    ChatClient supportClient(ChatClient.Builder builder) {
        return builder
                .defaultSystem("""
                        You are a support assistant for TechGadgets.
                        Answer only product and order questions.
                        """)
                .defaultOptions(OpenAiChatOptions.builder()
                        .model("gpt-4o-mini")
                        .temperature(0.2)
                        .maxTokens(400)
                        .build())
                .build();
    }

    @Bean
    @Qualifier("summarizer")
    ChatClient summarizerClient(ChatClient.Builder builder) {
        return builder
                .defaultSystem("You summarize customer feedback into one sentence.")
                .defaultOptions(OpenAiChatOptions.builder()
                        .model("gpt-4o-mini")
                        .temperature(0.0)
                        .maxTokens(100)
                        .build())
                .build();
    }
}
```

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Create one <code>ChatClient</code> bean per distinct role in your application — support, summarizer, classifier, code reviewer. Each gets its own system prompt and sensible defaults. This is cleaner than passing a different system prompt on every call.</p>
</blockquote>

## The call chain — building a request

Every interaction with `ChatClient` starts with `.prompt()` and ends with `.call()` or `.stream()`. Everything in between shapes the request:

```java
String response = chatClient
        .prompt()                                    // start building a request
        .system("Override the default system prompt for this call only")
        .user("What is the return policy for electronics?")
        .call()                                      // send the request
        .content();                                  // extract the response text
```

### .system() — override the default for one call

If you set a default system prompt in the builder but need a different one for a specific call, `.system()` on the prompt overrides it:

```java
// Uses the bean's default system prompt
String normalAnswer = chatClient.prompt()
        .user("What is your return policy?")
        .call()
        .content();

// Uses a different system prompt for this call only
String technicalAnswer = chatClient.prompt()
        .system("You are a technical support specialist. Use precise technical language.")
        .user("How does the noise cancellation work on the ProX headphones?")
        .call()
        .content();
```

### .options() — override model options per call

You can override temperature, model, or max tokens for a single call without changing the bean configuration:

```java
String creativeAnswer = chatClient.prompt()
        .user("Write three creative subject lines for our sale email.")
        .options(OpenAiChatOptions.builder()
                .temperature(0.9)
                .maxTokens(200)
                .build())
        .call()
        .content();
```

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> Per-call options merge with — and override — the builder defaults. The model name from the builder is preserved unless you explicitly override it in the per-call options.</p>
</blockquote>

## What .call() returns

`.call()` returns a `CallResponseSpec` with several extraction methods depending on what you need:

```java
// Just the text content — most common
String text = chatClient.prompt()
        .user("What is Java?")
        .call()
        .content();

// The full ChatResponse — includes metadata, finish reason, token usage
ChatResponse response = chatClient.prompt()
        .user("What is Java?")
        .call()
        .chatResponse();

// Token usage from the full response
Usage usage = response.getMetadata().getUsage();
long inputTokens = usage.getPromptTokens();
long outputTokens = usage.getGenerationTokens();

// Strongly typed entity (next post covers this in detail)
record Answer(String summary, List<String> keyPoints) {}
Answer structured = chatClient.prompt()
        .user("Explain Java records. Respond in JSON matching this schema: {summary: string, keyPoints: string[]}")
        .call()
        .entity(Answer.class);
```

**Use `.content()` for most cases.** Use `.chatResponse()` when you need token usage, finish reason, or model metadata — such as for logging or cost tracking.

## Advisors — cross-cutting concerns for AI calls

Advisors are Spring AI's equivalent of Spring MVC interceptors — they wrap every call with pre- and post-processing logic. Spring AI ships with several built-in advisors and you can write custom ones.

You register advisors on the builder (applies to all calls) or per call:

```java
// On the builder — applies to every call through this client
@Bean
ChatClient chatClient(ChatClient.Builder builder, VectorStore vectorStore) {
    return builder
            .defaultSystem("You are a support assistant.")
            .defaultAdvisors(
                new QuestionAnswerAdvisor(vectorStore)   // RAG — covered in Module 4
            )
            .build();
}

// Per call — applies to this call only
String answer = chatClient.prompt()
        .user(question)
        .advisors(new SimpleLoggerAdvisor())
        .call()
        .content();
```

The most important built-in advisors:

| Advisor | What it does | Module |
|---|---|---|
| `QuestionAnswerAdvisor` | Retrieves relevant documents from a vector store and injects them into the prompt (RAG) | 4 |
| `MessageChatMemoryAdvisor` | Injects conversation history into every call for multi-turn conversations | 5 |
| `SimpleLoggerAdvisor` | Logs the request and response for debugging | Available now |

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Add <code>SimpleLoggerAdvisor</code> in your dev profile during early development. It logs the full prompt and response so you can see exactly what the model receives and returns — invaluable for debugging prompt issues.</p>
</blockquote>

## .call() vs .stream() — when to use each

`.call()` waits for the complete response before returning. `.stream()` returns a `Flux<String>` that emits tokens as they are generated.

```java
// Blocking — waits for complete response
String complete = chatClient.prompt()
        .user("Explain microservices.")
        .call()
        .content();

// Streaming — returns tokens as they arrive
Flux<String> streamed = chatClient.prompt()
        .user("Explain microservices.")
        .stream()
        .content();
```

**Use `.call()` for:**
- Background processing jobs
- API-to-API calls where the consumer does not need partial results
- Short responses (under ~1 second) where streaming adds no perceived benefit
- Structured output parsing (easier with a complete response)

**Use `.stream()` for:**
- Chat interfaces where users see the response being typed out
- Long responses where showing partial results reduces perceived latency
- SSE (Server-Sent Events) endpoints

The next post covers streaming in depth with a working SSE endpoint. This post covers the complete `call()` path. Get comfortable with `call()` first — you will use it far more often.

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> <code>stream()</code> returns a cold <code>Flux</code> — nothing happens until you subscribe. If you return the <code>Flux</code> from a Spring MVC endpoint with the correct <code>produces</code> media type, the framework subscribes. If you call <code>.stream()</code> in a method that discards the result, the LLM call never fires.</p>
</blockquote>

## A complete example: the support endpoint

Here is the support assistant endpoint that combines everything in this post:

```java
@Configuration
class AiConfig {

    @Bean
    ChatClient supportClient(ChatClient.Builder builder) {
        return builder
                .defaultSystem("""
                        You are a customer support assistant for TechGadgets, an online electronics store.
                        Answer only questions about products, orders, and store policies.
                        If you cannot help, say: "I don't have that information right now."
                        Keep responses to 2–4 sentences.
                        """)
                .defaultOptions(OpenAiChatOptions.builder()
                        .model("gpt-4o-mini")
                        .temperature(0.2)
                        .maxTokens(400)
                        .build())
                .defaultAdvisors(new SimpleLoggerAdvisor())
                .build();
    }
}

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

This is the foundation the support assistant is built on. Every module adds a layer: RAG (Module 4) to ground answers in real data, memory (Module 5) to make conversations stateful, tools (Module 6) to check live order status.

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> The <code>ChatClient</code> API is deliberately fluent and shallow — you can build a working endpoint in 10 lines. The depth is in advisors, structured output, and streaming, which the next three posts cover one at a time.</p>
</blockquote>

## References

- <a href="https://docs.spring.io/spring-ai/reference/api/chatclient.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI ChatClient reference</a>
- <a href="https://docs.spring.io/spring-ai/reference/api/advisors.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI Advisors reference</a>
