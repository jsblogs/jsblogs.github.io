---
title: "Error handling for AI apps — rate limits, timeouts, and fallback strategies"
description: LLM API calls fail in ways that normal service calls don't — rate limits, content policy rejections, context window overflows, and intermittent 503s. This post covers the error types, retry strategies, timeout configuration, and graceful fallbacks for production resilience.
pubDatetime: "2026-03-03T17:40:00+05:30"
tags:
  - spring-ai
  - springboot
  - java
---

The support assistant had been running smoothly for two weeks. Then traffic doubled on a Saturday sale. OpenAI started returning 429s. The application had no retry logic. Every request during the spike returned a stack trace to the user.

LLM APIs fail differently from databases and REST services. Understanding the failure modes and designing for them from the start is far cheaper than fixing it under production load.

## Table of contents

## The LLM API failure taxonomy

| Error | HTTP status | Cause | Retry? |
|---|---|---|---|
| Rate limit | 429 | Too many requests per minute/hour | Yes, with backoff |
| Overloaded | 503 | Provider capacity issue | Yes, with backoff |
| Timeout | — | Response took too long | Yes, with shorter timeout |
| Context length exceeded | 400 | Prompt too long | No — fix the prompt |
| Content policy violation | 400 | Input or output violated safety policy | No — handle the content |
| Invalid API key | 401 | Wrong or expired key | No — fix configuration |
| Model not found | 404 | Wrong model name or model deprecated | No — fix configuration |
| Insufficient quota | 429/402 | Monthly spend limit reached | No — billing issue |

Spring AI throws typed exceptions for most of these. The root types are `NonTransientAiException` (don't retry) and `TransientAiException` (safe to retry).

## Configuring timeouts

LLM calls are slow. Set explicit timeouts so slow calls don't hold threads indefinitely:

```java
@Bean
RestClient restClient() {
    // Configure the HTTP client with timeouts
    return RestClient.builder()
            .requestFactory(new HttpComponentsClientHttpRequestFactory(
                HttpClients.custom()
                    .setConnectionRequestTimeout(Duration.ofSeconds(5))  // get connection from pool
                    .build()
            ))
            .build();
}
```

For Spring AI's OpenAI client specifically, configure via the auto-configured `RestClient` builder:

```yaml
spring:
  ai:
    openai:
      api-key: ${OPENAI_API_KEY}
      # HTTP client timeouts (via Spring Boot's rest client properties)

# Or set JVM-level socket timeout
# spring.ai.openai.base-url: https://api.openai.com
```

For more control, use a custom `OpenAiApi` bean:

```java
@Bean
OpenAiApi openAiApi(
        @Value("${spring.ai.openai.api-key}") String apiKey
) {
    return OpenAiApi.builder()
            .apiKey(apiKey)
            .restClient(RestClient.builder()
                .requestInterceptor((request, body, execution) -> {
                    // Add custom timeout header or handle at HTTP level
                    return execution.execute(request, body);
                })
                .build())
            .build();
}
```

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> Set a hard timeout for every LLM call. Without one, a slow provider response holds a thread (and potentially a database connection) for the duration of the call. In a high-concurrency application, a few slow calls can exhaust the thread pool. 30 seconds is a reasonable hard ceiling for non-streaming calls.</p>
</blockquote>

## Retry with exponential backoff for transient errors

Rate limit (429) and overloaded (503) errors are transient — retrying after a delay usually succeeds. Resilience4j integrates cleanly with Spring Boot:

```xml
<dependency>
    <groupId>io.github.resilience4j</groupId>
    <artifactId>resilience4j-spring-boot3</artifactId>
</dependency>
```

```yaml
resilience4j:
  retry:
    instances:
      ai-client:
        max-attempts: 3
        wait-duration: 1s
        exponential-backoff-multiplier: 2      # 1s → 2s → 4s
        retry-exceptions:
          - org.springframework.ai.retry.TransientAiException
        ignore-exceptions:
          - org.springframework.ai.retry.NonTransientAiException
```

```java
@Service
class SupportChatService {

    private final ChatClient chatClient;

    SupportChatService(ChatClient chatClient) {
        this.chatClient = chatClient;
    }

    @Retry(name = "ai-client", fallbackMethod = "fallbackResponse")
    public String chat(String question, String conversationId) {
        return chatClient.prompt()
                .user(question)
                .advisors(a -> a.param(CONVERSATION_ID_KEY, conversationId))
                .call()
                .content();
    }

    public String fallbackResponse(String question, String conversationId, Exception e) {
        log.error("AI call failed after retries for conversationId={}", conversationId, e);
        return "I'm temporarily unable to process your request. Please try again in a moment, "
             + "or contact support@techgadgets.com if the issue persists.";
    }
}
```

The fallback method signature must match the original plus a `Throwable` parameter. Resilience4j calls it when all retries are exhausted.

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Spring AI has its own retry mechanism built in — configure it via <code>spring.ai.retry.*</code> properties. It handles basic exponential backoff for transient errors automatically. Use Resilience4j when you need custom fallback logic, circuit breakers, or bulkheads beyond what Spring AI's built-in retry provides.</p>
</blockquote>

## Spring AI's built-in retry configuration

Before reaching for Resilience4j, check if the built-in retry is sufficient:

```yaml
spring:
  ai:
    retry:
      max-attempts: 3          # default: 3
      backoff:
        initial-interval: 2s   # default: 2s
        multiplier: 5          # default: 5
        max-interval: 3m       # default: 3 minutes
      on-http-codes-default: true   # retry on 429, 503, etc.
```

The built-in retry handles most transient cases. Add Resilience4j for circuit breaking and custom fallback logic.

## Circuit breaker — stop hammering a failing provider

When the LLM provider is down for more than a few seconds, retrying every request wastes resources and worsens the problem. A circuit breaker detects repeated failures and opens the circuit — failing fast until the provider recovers:

```yaml
resilience4j:
  circuitbreaker:
    instances:
      ai-client:
        failure-rate-threshold: 50          # open circuit at 50% failure rate
        slow-call-rate-threshold: 80        # also open if 80% of calls are slow
        slow-call-duration-threshold: 10s   # "slow" = > 10 seconds
        wait-duration-in-open-state: 30s    # wait 30s before trying again
        sliding-window-size: 10             # evaluate over last 10 calls
```

```java
@CircuitBreaker(name = "ai-client", fallbackMethod = "fallbackResponse")
@Retry(name = "ai-client", fallbackMethod = "fallbackResponse")
public String chat(String question, String conversationId) {
    // ...
}
```

When the circuit is open, the fallback fires immediately without making an API call — protecting the provider from additional load and giving your application a fast failure path.

## Handling context length exceeded errors

Context too long (HTTP 400, error code `context_length_exceeded`) is a non-transient error — retrying the same prompt won't help. You need to reduce the prompt:

```java
public String chat(String question, String conversationId) {
    try {
        return chatClient.prompt()
                .user(question)
                .advisors(a -> a.param(CONVERSATION_ID_KEY, conversationId))
                .call()
                .content();
    } catch (NonTransientAiException e) {
        if (e.getMessage() != null && e.getMessage().contains("context_length_exceeded")) {
            // Trim the conversation history and retry with a shorter window
            chatMemory.clear(conversationId);
            log.warn("Context length exceeded for conversationId={} — cleared history and retrying",
                     conversationId);

            return chatClient.prompt()
                    .user(question)
                    .advisors(a -> a.param(CONVERSATION_ID_KEY, conversationId)
                                   .param(CHAT_MEMORY_WINDOW_SIZE, 5))   // reduced window
                    .call()
                    .content();
        }
        throw e;
    }
}
```

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> Clearing conversation history is a disruptive recovery action — the user loses context. Before clearing, try reducing the window size. If you have summarisation in place, trigger summarisation of the oldest messages. Only clear as a last resort.</p>
</blockquote>

## Handling content policy violations

When a request violates content policy (HTTP 400 with a content policy error code), the message is the problem:

```java
try {
    return callWithRetry(question, conversationId);
} catch (NonTransientAiException e) {
    if (isContentPolicyViolation(e)) {
        log.warn("Content policy violation for conversationId={}", conversationId);
        return "I'm not able to process that request. "
             + "If you have a genuine support question, please rephrase it.";
    }
    throw e;
}

private boolean isContentPolicyViolation(NonTransientAiException e) {
    String msg = e.getMessage();
    return msg != null && (msg.contains("content_policy") || msg.contains("content_filter"));
}
```

Do not log the user's message that triggered the violation to standard application logs — it may itself contain offensive content that should not be in log files. Log only the event (violation occurred for session X) and store the message separately in a moderation log if needed.

## Streaming error handling

Errors in streaming endpoints (`Flux<String>`) need special handling because the error occurs mid-stream:

```java
@GetMapping(value = "/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
Flux<String> chatStream(@RequestParam String question, @RequestParam String conversationId) {
    return chatClient.prompt()
            .user(question)
            .advisors(a -> a.param(CONVERSATION_ID_KEY, conversationId))
            .stream()
            .content()
            .onErrorResume(TransientAiException.class, e -> {
                // Transient: send an error event and suggest retry
                log.warn("Transient AI error during stream", e);
                return Flux.just("[ERROR: Temporary issue. Please try again.]");
            })
            .onErrorResume(Exception.class, e -> {
                log.error("Unexpected stream error", e);
                return Flux.just("[ERROR: Something went wrong. Contact support@techgadgets.com]");
            });
}
```

On the JavaScript side, close the `EventSource` on error and optionally show a retry button:

```javascript
source.onerror = () => {
    source.close();
    if (responseText.startsWith("[ERROR:")) {
        displayElement.textContent = responseText;  // show error message
    } else if (!responseText) {
        displayElement.textContent = "Connection lost. Please try again.";
    }
    // Show retry button
    document.getElementById('retryBtn').style.display = 'block';
};
```

## Alerting on error patterns

Register an error counter in the audit advisor and alert when it spikes:

```java
@Override
public ChatResponse adviseResponse(ChatResponse response, Map<String, Object> context) {
    String finishReason = response.getResult().getMetadata().getFinishReason();

    if ("content_filter".equals(finishReason)) {
        contentFilterCounter.increment();
    }

    return response;
}

// Alert: if content filter rate > 5%, something unusual is happening
```

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> The next post is the final production post — deployment and configuration best practices. It covers environment-specific model routing, API key management, feature flags for AI features, and the checklist for safely shipping an AI-powered application to production.</p>
</blockquote>

## References

- <a href="https://docs.spring.io/spring-ai/reference/api/chatclient.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI ChatClient reference</a>
- <a href="https://resilience4j.readme.io/docs/getting-started" target="_blank" rel="noopener" referrerpolicy="origin">Resilience4j Getting Started</a>
- <a href="https://docs.spring.io/spring-ai/reference/api/retry.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI Retry reference</a>
