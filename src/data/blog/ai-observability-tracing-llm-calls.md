---
title: Observability for AI applications — tracing and logging LLM calls in Spring Boot
description: "An LLM call is a black box by default: you send text, you get text back. Without observability you cannot diagnose latency, debug wrong answers, or track costs. This post wires Spring AI's Micrometer integration, distributed tracing, and structured logging into the support assistant."
pubDatetime: "2026-03-03T16:20:00+05:30"
tags:
  - spring-ai
  - springboot
  - java
---

The support assistant went to production on a Friday. On Monday morning, the team found three problems: some responses were taking 8 seconds, a handful of users were getting wrong answers, and nobody knew what the LLM was actually sending and receiving. There were no logs for any of it.

Observability for AI applications is not optional. It is harder to build than standard REST API observability — because the inputs and outputs are large, unstructured, and the model's internal reasoning is invisible. But the fundamentals are the same: metrics, traces, logs.

## Table of contents

## What you need to observe in an AI application

A standard REST endpoint exposes: latency, error rate, request count. An AI endpoint needs those plus:

| Signal | Why it matters |
|---|---|
| **Token usage per request** | Primary cost driver |
| **Model latency** | LLM calls are slow (1–10+ seconds) — separate from app latency |
| **First-token latency** | For streaming endpoints — how fast does the UI show something |
| **Retrieved document quality** | Did RAG retrieve useful context? |
| **Tool call count and latency** | Which tools are slow, which fail |
| **Prompt content** | Debug wrong answers by seeing exactly what the model received |
| **Response content** | Detect hallucinations, policy violations, unexpected formats |
| **Finish reason** | `STOP` is normal; `LENGTH` means the response was truncated |

## Spring AI's built-in Micrometer integration

Spring AI automatically creates Micrometer metrics for every `ChatClient` call when Micrometer is on the classpath. Add the Actuator and Prometheus starters:

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-registry-prometheus</artifactId>
    <scope>runtime</scope>
</dependency>
```

Spring AI registers these metrics automatically:

| Metric | Type | Description |
|---|---|---|
| `spring.ai.chat.client.operation.seconds` | Timer | End-to-end ChatClient call duration |
| `spring.ai.chat.model.operation.seconds` | Timer | Raw model API call duration |
| `spring.ai.chat.model.prompt.tokens` | Counter | Input tokens consumed |
| `spring.ai.chat.model.completion.tokens` | Counter | Output tokens generated |
| `spring.ai.chat.model.total.tokens` | Counter | Total tokens (prompt + completion) |
| `spring.ai.vectorstore.operation.seconds` | Timer | Vector store query duration |
| `spring.ai.embedding.model.operation.seconds` | Timer | Embedding model call duration |

Expose them via Prometheus endpoint:

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health, info, metrics, prometheus
  metrics:
    tags:
      application: techgadgets-support   # adds app tag to all metrics
```

Scrape `http://localhost:8080/actuator/prometheus` to see all Spring AI metrics.

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Set up a Grafana dashboard with panels for token usage (cost), model latency (performance), and error rate (reliability) from day one. These three panels answer 90% of production questions about your AI feature.</p>
</blockquote>

## Distributed tracing with Spring AI

Spring AI integrates with Micrometer Tracing (which supports both Zipkin/Brave and OpenTelemetry) to create spans for every LLM call. Add the tracing dependency:

```xml
<!-- OpenTelemetry tracing -->
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-tracing-bridge-otel</artifactId>
</dependency>
<dependency>
    <groupId>io.opentelemetry</groupId>
    <artifactId>opentelemetry-exporter-otlp</artifactId>
</dependency>
```

```yaml
management:
  tracing:
    sampling:
      probability: 1.0   # trace 100% in dev; use 0.1 in production

spring:
  application:
    name: techgadgets-support

  # OTLP exporter (Jaeger, Tempo, etc.)
  otlp:
    tracing:
      endpoint: http://localhost:4318/v1/traces
```

With tracing enabled, a single user request that triggers RAG + two tool calls + one LLM generation produces a trace like:

```
HTTP POST /api/support/chat                          [1.8s]
  └── ChatClient.call                                [1.7s]
        ├── QuestionAnswerAdvisor                    [120ms]
        │     └── VectorStore.similaritySearch       [85ms]
        ├── OpenAI chat API call                     [1.1s]
        │     ├── Tool: getOrderStatus               [210ms]
        │     └── Tool: checkRefundEligibility       [180ms]
        └── OpenAI chat API call (final)             [380ms]
```

This trace immediately shows: the vector store search took 85ms, the first LLM call took 1.1s (which included two tool calls), and the final generation took 380ms.

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> LLM API calls are external network calls to OpenAI or Anthropic. They are the dominant latency source in most AI applications — 500ms to 5+ seconds. Tracing separates this from application latency (which is typically < 50ms) so you know whether a slow response is your code or the LLM provider.</p>
</blockquote>

## Structured logging with SimpleLoggerAdvisor

Spring AI's `SimpleLoggerAdvisor` logs the full request and response at DEBUG level. Enable it selectively:

```java
// In development — log everything
.defaultAdvisors(
    new QuestionAnswerAdvisor(vectorStore),
    MessageChatMemoryAdvisor.builder(chatMemory).build(),
    new SimpleLoggerAdvisor()   // full prompt + response logging
)
```

```yaml
logging:
  level:
    org.springframework.ai.chat.client.advisor.SimpleLoggerAdvisor: DEBUG
```

The log output includes:
```
request: ChatClientRequest{messages=[SystemMessage{...}, UserMessage{text='Where is my order?'}], advisors=[...]}
response: ChatClientResponse{result=AssistantMessage{text='Your order TG-9821 is currently...'}}
```

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> <code>SimpleLoggerAdvisor</code> logs the full prompt including all RAG context (potentially hundreds of lines) and the complete model response. In production, this generates enormous log volume. Use it only in development or with a sampling rate. In production, log only what you need: token count, finish reason, conversation ID — not the full content.</p>
</blockquote>

## Custom structured logging for production

Build a custom advisor that logs the structured fields you actually need:

```java
@Component
class AiAuditAdvisor implements RequestResponseAdvisor {

    private static final Logger log = LoggerFactory.getLogger(AiAuditAdvisor.class);

    @Override
    public AdvisedRequest adviseRequest(AdvisedRequest request, Map<String, Object> context) {
        context.put("requestStartTime", System.currentTimeMillis());
        context.put("conversationId", request.advisorParams()
                .getOrDefault(CONVERSATION_ID_KEY, "unknown"));
        return request;
    }

    @Override
    public ChatResponse adviseResponse(ChatResponse response, Map<String, Object> context) {
        long durationMs = System.currentTimeMillis() - (long) context.get("requestStartTime");
        Usage usage = response.getMetadata().getUsage();

        log.info("ai_call conversationId={} durationMs={} promptTokens={} completionTokens={} finishReason={}",
            context.get("conversationId"),
            durationMs,
            usage != null ? usage.getPromptTokens() : -1,
            usage != null ? usage.getGenerationTokens() : -1,
            response.getResult().getMetadata().getFinishReason()
        );

        return response;
    }
}
```

Register it in the `ChatClient` builder:

```java
.defaultAdvisors(
    new QuestionAnswerAdvisor(vectorStore),
    MessageChatMemoryAdvisor.builder(chatMemory).build(),
    aiAuditAdvisor   // structured logging, not full content
)
```

Now every LLM call produces a single structured log line with the fields needed for monitoring, without logging the full prompt content.

## Tracking token usage over time

Register a Micrometer counter in the audit advisor to track cumulative token usage:

```java
@Component
class AiAuditAdvisor implements RequestResponseAdvisor {

    private final Counter promptTokenCounter;
    private final Counter completionTokenCounter;

    AiAuditAdvisor(MeterRegistry registry) {
        this.promptTokenCounter = Counter.builder("ai.tokens.prompt")
                .description("Total prompt tokens consumed")
                .register(registry);
        this.completionTokenCounter = Counter.builder("ai.tokens.completion")
                .description("Total completion tokens generated")
                .register(registry);
    }

    @Override
    public ChatResponse adviseResponse(ChatResponse response, Map<String, Object> context) {
        Usage usage = response.getMetadata().getUsage();
        if (usage != null) {
            promptTokenCounter.increment(usage.getPromptTokens());
            completionTokenCounter.increment(usage.getGenerationTokens());
        }
        return response;
    }
}
```

Add a Grafana alert when daily token spend exceeds a threshold — before the bill arrives.

## What to alert on

| Alert | Threshold | What it indicates |
|---|---|---|
| Model p95 latency | > 5 seconds | LLM provider slowdown or prompt too long |
| Error rate | > 2% | Rate limits, API key issues, or prompt errors |
| Daily token spend | > budget × 0.8 | Approaching budget limit |
| `FINISH_REASON = LENGTH` rate | > 5% | `maxTokens` too low, responses being truncated |
| Vector store query time | > 500ms | pgvector index needs tuning |
| Tool call error rate | > 5% | Downstream service issues |

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> The next post covers cost management in detail — token budgets, prompt caching, and model selection strategies. With the metrics from this post in place, you have the data needed to identify where costs are coming from and which optimisations will have the most impact.</p>
</blockquote>

## References

- <a href="https://docs.spring.io/spring-ai/reference/observabilty/index.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI Observability reference</a>
- <a href="https://docs.spring.io/spring-ai/reference/api/advisors.html#_simple_logger_advisor" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI SimpleLoggerAdvisor reference</a>
- <a href="https://micrometer.io/docs/tracing" target="_blank" rel="noopener" referrerpolicy="origin">Micrometer Tracing documentation</a>
