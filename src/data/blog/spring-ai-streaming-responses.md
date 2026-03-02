---
title: Streaming LLM responses in Spring AI for a better user experience
description: LLMs generate text token by token. Streaming lets your users see that text as it arrives instead of staring at a loading spinner. This post shows how to wire Spring AI's stream() to a Server-Sent Events endpoint.
pubDatetime: "2026-03-02T22:00:00+05:30"
tags:
  - spring-ai
  - springboot
  - java
---

Dev showed the support assistant to the product manager. It worked well, but there was a pause — sometimes two to three seconds — before the answer appeared. "It feels slow," said the PM. "Can you make it show the response as it types, like ChatGPT?"

The latency was not slow. The model was generating the full response at normal speed. The problem was that Dev's endpoint waited for the complete response before sending anything. Streaming fixes that.

## Table of contents

## Why streaming matters

An LLM generates text one token at a time. With a non-streaming call, your server waits until the last token is generated, assembles the full text, and sends it in one response. The user waits with nothing to look at.

With streaming, each token (or small batch of tokens) is sent to the client as soon as it is generated. The response appears to "type itself" in real time. For a 300-word response that takes 3 seconds to generate, streaming makes the experience feel instant because the first word appears within milliseconds.

The total generation time is identical. The perceived latency is dramatically lower.

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> Streaming is a UX concern, not a performance optimization. The model generates at the same speed either way. The difference is when the client first sees output — immediately with streaming vs after the full response without it.</p>
</blockquote>

## .stream() in Spring AI

`ChatClient` has a `.stream()` alternative to `.call()`. It returns a `StreamResponseSpec` rather than a `CallResponseSpec`.

```java
// Non-streaming — blocks until complete
String complete = chatClient.prompt()
        .user("Explain dependency injection in Java.")
        .call()
        .content();

// Streaming — returns a Flux that emits tokens as they arrive
Flux<String> tokens = chatClient.prompt()
        .user("Explain dependency injection in Java.")
        .stream()
        .content();
```

`stream().content()` returns a `Flux<String>` where each element is a partial token or small chunk of text. You subscribe to it to consume the tokens.

## Wiring streaming to a Server-Sent Events endpoint

Server-Sent Events (SSE) is the standard browser protocol for server-to-client streaming over HTTP. Spring WebFlux and Spring MVC both support SSE endpoints. Spring AI's `Flux<String>` maps directly to SSE.

```java
@RestController
@RequestMapping("/api/support")
class SupportStreamController {

    private final ChatClient chatClient;

    SupportStreamController(ChatClient chatClient) {
        this.chatClient = chatClient;
    }

    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    Flux<String> stream(@RequestParam String question) {
        return chatClient.prompt()
                .user(question)
                .stream()
                .content();
    }
}
```

Three things to notice:
1. The return type is `Flux<String>` — Spring automatically serializes each emitted string as an SSE event.
2. `produces = MediaType.TEXT_EVENT_STREAM_VALUE` tells the client to expect SSE.
3. The endpoint uses `@GetMapping` because browsers open SSE connections via GET.

Test it from the terminal:

```bash
curl -N "http://localhost:8080/api/support/stream?question=What+is+your+return+policy"
```

You will see tokens arrive one by one in the terminal output.

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Use <code>@GetMapping</code> with a <code>@RequestParam</code> for simple streaming endpoints. If you need to send a complex request body (conversation history, session ID, etc.), use <code>@PostMapping</code> and add <code>produces = TEXT_EVENT_STREAM_VALUE</code> — the SSE protocol works over POST too, though some clients do not support it natively.</p>
</blockquote>

## Consuming the stream in JavaScript

On the client side, the browser's built-in `EventSource` API connects to SSE endpoints:

```javascript
const source = new EventSource(
  `/api/support/stream?question=${encodeURIComponent(userQuestion)}`
);

let responseText = '';

source.onmessage = (event) => {
  responseText += event.data;
  displayElement.textContent = responseText;
};

source.onerror = () => {
  source.close();
};
```

Each `event.data` value is one chunk from the `Flux<String>`. Appending chunks as they arrive produces the "typing" effect.

For POST-based streaming (when you need to send a request body), use the `fetch` API with streaming body reads instead:

```javascript
const response = await fetch('/api/support/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ question: userQuestion, sessionId: sessionId })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  displayElement.textContent += decoder.decode(value);
}
```

## Streaming with the full ChatResponse

If you need metadata from a streaming response — token counts, finish reason — use `stream().chatResponse()` instead of `stream().content()`:

```java
Flux<ChatResponse> responses = chatClient.prompt()
        .user("Summarize this product review: " + reviewText)
        .stream()
        .chatResponse();

// Process each chunk, log the last one for token counts
responses.subscribe(chunk -> {
    String text = chunk.getResult().getOutput().getText();
    if (text != null) {
        process(text);
    }
    // The last chunk contains usage metadata
    if (chunk.getMetadata().getUsage() != null) {
        log.info("Total tokens: {}", chunk.getMetadata().getUsage().getTotalTokens());
    }
});
```

In practice, token counts are only available on the final chunk. If you only need the text, stick with `stream().content()`.

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> <code>Flux</code> is cold — nothing happens until someone subscribes. Returning a <code>Flux</code> from a Spring WebFlux controller automatically subscribes when the HTTP response is opened. But if you call <code>.stream()</code> inside a non-reactive method and do not subscribe, the LLM call never fires. Always verify your stream is actually consumed.</p>
</blockquote>

## When not to stream

Streaming improves perceived latency in interactive interfaces. It adds complexity without benefit in other contexts:

| Context | Stream? | Reason |
|---|---|---|
| Chat UI / assistant interface | Yes | Users see immediate response |
| Document generation shown to user | Yes | Long responses benefit most |
| Background processing jobs | No | No user waiting; completion matters, not first-token speed |
| API-to-API calls | No | Caller wants the complete response |
| Structured output (`.entity()`) | No | Parsing requires the complete JSON |
| Classification tasks | No | Short responses; streaming adds no perceived benefit |
| Unit tests | No | Complicates assertions; use `.call()` in tests |

## The complete streaming support endpoint

Combining the setup from the previous posts with streaming:

```java
@RestController
@RequestMapping("/api/support")
class SupportController {

    private final ChatClient chatClient;

    SupportController(ChatClient chatClient) {
        this.chatClient = chatClient;
    }

    // Non-streaming for API consumers
    @PostMapping("/chat")
    SupportResponse chat(@RequestBody SupportRequest request) {
        String answer = chatClient.prompt()
                .user(request.question())
                .call()
                .content();
        return new SupportResponse(answer);
    }

    // Streaming for browser chat interfaces
    @GetMapping(value = "/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    Flux<String> chatStream(@RequestParam String question) {
        return chatClient.prompt()
                .user(question)
                .stream()
                .content();
    }
}

record SupportRequest(String question) {}
record SupportResponse(String answer) {}
```

Expose both. API consumers use the POST endpoint for a clean JSON response. Browser clients use the GET stream endpoint for the "typing" experience.

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> With Module 2 complete, you have a working AI-powered chat endpoint with externalized prompts, structured output capability, and streaming support. The assistant answers questions, but only from its training data — it knows nothing about your actual products. That changes in Module 3 with embeddings and semantic search.</p>
</blockquote>

## References

- <a href="https://docs.spring.io/spring-ai/reference/api/chatclient.html#_streaming_responses" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI streaming responses reference</a>
- <a href="https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events" target="_blank" rel="noopener" referrerpolicy="origin">MDN: Using server-sent events</a>
