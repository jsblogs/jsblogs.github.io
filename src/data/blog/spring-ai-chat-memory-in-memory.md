---
title: Chat memory in Spring AI — building a chatbot that remembers
description: Spring AI's MessageChatMemoryAdvisor automatically injects conversation history into every LLM call and saves each turn back to a ChatMemory store. This post wires InMemoryChatMemory into the support assistant with per-session isolation.
pubDatetime: "2026-03-03T13:40:00+05:30"
tags:
  - spring-ai
  - springboot
  - java
---

Dev added memory to the support assistant in one afternoon. No database changes. No session management code. Spring AI's advisor handled the full conversation history automatically — storing each turn, injecting the history into the next request, and keeping sessions isolated.

This post shows exactly how.

## Table of contents

## Adding the MessageChatMemoryAdvisor

`MessageChatMemoryAdvisor` is a Spring AI advisor that manages conversation history. Add it alongside `QuestionAnswerAdvisor` in the `ChatClient` configuration:

```java
@Configuration
class AiConfig {

    @Bean
    ChatMemory chatMemory() {
        return new InMemoryChatMemory();
    }

    @Bean
    ChatClient supportClient(
            ChatClient.Builder builder,
            VectorStore vectorStore,
            ChatMemory chatMemory
    ) {
        return builder
                .defaultSystem(new ClassPathResource("prompts/support-system.st"))
                .defaultAdvisors(
                    new QuestionAnswerAdvisor(
                        vectorStore,
                        SearchRequest.defaults().withTopK(5).withSimilarityThreshold(0.7)
                    ),
                    MessageChatMemoryAdvisor.builder(chatMemory).build()
                )
                .defaultOptions(OpenAiChatOptions.builder()
                        .model("gpt-4o-mini")
                        .temperature(0.2)
                        .maxTokens(500)
                        .build())
                .build();
    }
}
```

`InMemoryChatMemory` is a `ConcurrentHashMap`-backed store — no database needed. It is perfect for development and for applications where conversations do not need to survive restarts.

## The conversation ID — the key to session isolation

Every call through `MessageChatMemoryAdvisor` must carry a **conversation ID**. This is a string that uniquely identifies a user session. Messages are stored and retrieved under this ID. Different IDs = completely independent conversation histories.

Pass the conversation ID as an advisor parameter on each call:

```java
@RestController
@RequestMapping("/api/support")
class SupportController {

    private final ChatClient chatClient;

    SupportController(@Qualifier("supportClient") ChatClient chatClient) {
        this.chatClient = chatClient;
    }

    @PostMapping("/chat")
    SupportResponse chat(@RequestBody SupportRequest request) {
        String answer = chatClient.prompt()
                .user(request.question())
                .advisors(advisor -> advisor
                    .param(CONVERSATION_ID_KEY, request.conversationId())
                )
                .call()
                .content();
        return new SupportResponse(answer);
    }

    @GetMapping(value = "/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    Flux<String> chatStream(
            @RequestParam String question,
            @RequestParam String conversationId
    ) {
        return chatClient.prompt()
                .user(question)
                .advisors(advisor -> advisor
                    .param(CONVERSATION_ID_KEY, conversationId)
                )
                .stream()
                .content();
    }
}

record SupportRequest(String question, String conversationId) {}
record SupportResponse(String answer) {}
```

`CONVERSATION_ID_KEY` is `MessageChatMemoryAdvisor.CONVERSATION_ID_KEY` — a constant string `"chat_memory_conversation_id"`.

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> If you omit the conversation ID parameter, the advisor uses a default ID — meaning all users share the same conversation history. This is almost never what you want. Always pass a per-user or per-session conversation ID.</p>
</blockquote>

## Generating and managing conversation IDs

The conversation ID is typically generated on the client side when a new chat session starts, and sent with every subsequent message in that session.

A UUID is the simplest approach:

```javascript
// On the client — generate once per session
const conversationId = crypto.randomUUID();

// Send with every message
async function sendMessage(question) {
    const response = await fetch('/api/support/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, conversationId })
    });
    return response.json();
}
```

For authenticated users, derive the conversation ID from the user's ID and session:

```java
@PostMapping("/chat")
SupportResponse chat(@RequestBody SupportRequest request, Authentication auth) {
    // One active conversation per authenticated user
    String conversationId = "user-" + auth.getName();

    // Or: one conversation per session (allows multiple concurrent conversations)
    // String conversationId = request.conversationId();

    String answer = chatClient.prompt()
            .user(request.question())
            .advisors(advisor -> advisor
                .param(CONVERSATION_ID_KEY, conversationId)
            )
            .call()
            .content();

    return new SupportResponse(answer);
}
```

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> For a customer support use case, "one conversation per user" (using user ID as conversation ID) often makes sense — returning users continue the same thread. For a general-purpose assistant, let users start new conversations by generating a new conversation ID on the client side.</p>
</blockquote>

## What the advisor does on each call

When `MessageChatMemoryAdvisor` handles a request, it:

**Before the LLM call:**
1. Loads all stored messages for the conversation ID
2. Injects them into the prompt as prior `USER` and `ASSISTANT` messages
3. The prompt sent to the LLM now contains the full conversation history

**After the LLM call:**
1. Saves the new user message to `ChatMemory`
2. Saves the assistant's response to `ChatMemory`
3. Returns the response normally

The conversation history grows with each turn, automatically.

## Limiting how much history is sent

Sending unlimited history fills the context window in long sessions. `MessageChatMemoryAdvisor` has a built-in window limit:

```java
MessageChatMemoryAdvisor.builder(chatMemory)
    .conversationWindowSize(10)   // keep only the last 10 messages (5 turns)
    .build()
```

With `conversationWindowSize(10)`, the advisor sends at most the last 10 messages. Older messages remain stored in `ChatMemory` but are not sent to the model.

A "message" here counts each individual message — a user message and an assistant reply together count as 2. So `windowSize(10)` = last 5 user-assistant pairs.

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> The windowed advisor drops older messages silently. If a user said "my order number is TG-9821" in turn 1 but that message ages out of the window by turn 15, the assistant will not know the order number anymore. For critical context (names, order numbers, account details), consider extracting key facts and re-injecting them via the system prompt rather than relying on the rolling window.</p>
</blockquote>

## Testing multi-turn conversation behaviour

Write a test that verifies the assistant maintains context across turns:

```java
@SpringBootTest
class ChatMemoryTest {

    @Autowired
    ChatClient chatClient;

    @Test
    void maintainsContextAcrossMultipleTurns() {
        String conversationId = UUID.randomUUID().toString();

        // Turn 1: introduce a fact
        String response1 = chatClient.prompt()
                .user("My order number is TG-9821 and I ordered ProX headphones.")
                .advisors(a -> a.param(CONVERSATION_ID_KEY, conversationId))
                .call()
                .content();

        // Turn 2: reference the fact without repeating it
        String response2 = chatClient.prompt()
                .user("When will they arrive?")
                .advisors(a -> a.param(CONVERSATION_ID_KEY, conversationId))
                .call()
                .content();

        // The model should understand "they" refers to the ProX headphones
        assertThat(response2.toLowerCase()).contains("prox");
    }

    @Test
    void keepsDifferentSessionsIsolated() {
        String session1 = UUID.randomUUID().toString();
        String session2 = UUID.randomUUID().toString();

        chatClient.prompt()
                .user("My order number is TG-9821.")
                .advisors(a -> a.param(CONVERSATION_ID_KEY, session1))
                .call().content();

        // Session 2 should have no knowledge of session 1's order number
        String response = chatClient.prompt()
                .user("What is my order number?")
                .advisors(a -> a.param(CONVERSATION_ID_KEY, session2))
                .call().content();

        assertThat(response).doesNotContain("TG-9821");
    }
}
```

## Clearing conversation history

When a user explicitly starts a new conversation, or when a session ends, clear the stored history:

```java
@DeleteMapping("/chat/{conversationId}")
ResponseEntity<Void> clearConversation(@PathVariable String conversationId) {
    chatMemory.clear(conversationId);
    return ResponseEntity.noContent().build();
}
```

Also clear on timeout: inject a scheduled job that calls `chatMemory.clear()` for conversations idle for more than N minutes. With `InMemoryChatMemory`, this prevents unbounded memory growth from long-lived application instances accumulating many sessions.

```java
@Scheduled(fixedDelay = 60_000)  // every minute
void clearStaleSessions() {
    // InMemoryChatMemory doesn't have built-in TTL — track last-access yourself
    // or switch to JdbcChatMemory with a database TTL column
}
```

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> For development, <code>InMemoryChatMemory</code> is ideal — no infrastructure, instant feedback. For production, replace it with <code>JdbcChatMemory</code> (next post) so conversations survive application restarts and work correctly across multiple instances.</p>
</blockquote>

## The advisor order with both memory and RAG

When using both `QuestionAnswerAdvisor` (RAG) and `MessageChatMemoryAdvisor` (memory), order matters:

```java
.defaultAdvisors(
    new QuestionAnswerAdvisor(vectorStore, SearchRequest.defaults()),  // runs first
    MessageChatMemoryAdvisor.builder(chatMemory).build()               // runs second
)
```

With this order:
1. Memory advisor injects conversation history
2. RAG advisor runs semantic search using the current user message
3. LLM receives: system prompt + conversation history + retrieved context + current message

The RAG advisor intentionally searches using the current message only — not the full history. This keeps the search precise. If you want RAG to search using context from the conversation (e.g., the user said "ProX headphones" three turns ago and now asks "do they have noise cancellation?"), you need to implement a **query rewriter** that rephrases the current question using conversation context before running the search.

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> The support assistant now maintains conversation context across turns. A user who says "my order TG-9821 arrived damaged" and then asks "what are my options?" gets an answer that references the damaged order — not a generic response. The next post makes this memory persistent so it survives application restarts and works across a load-balanced fleet.</p>
</blockquote>

## References

- <a href="https://docs.spring.io/spring-ai/reference/api/advisors.html#_message_chat_memory_advisor" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI MessageChatMemoryAdvisor reference</a>
- <a href="https://docs.spring.io/spring-ai/reference/api/advisors.html#_chat_memory" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI ChatMemory reference</a>
