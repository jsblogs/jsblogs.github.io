---
title: Managing context window efficiently — windowed memory and summarization
description: Sending full conversation history on every request is expensive and eventually hits the context window limit. Windowed memory keeps only recent turns. Summarization condenses older history into a compact summary. This post shows both techniques and when to use each.
pubDatetime: "2026-03-03T14:20:00+05:30"
tags:
  - spring-ai
  - ai-concepts
  - java
---

The support assistant had been in production for two weeks. Most conversations ran 5–10 turns without issue. Then a power user engaged in a 47-turn troubleshooting session. By turn 35, the API returned a context window error. By turn 40, the earlier details about their specific order had dropped out of the window and the assistant started asking for the order number again.

The windowed approach was working, but it was not working well enough. The fix was summarisation.

## Table of contents

## Two problems with unlimited history

**Problem 1: context window overflow.** Every model has a hard token limit. A long conversation with RAG context injected on every turn fills the window faster than expected. When it overflows, the API returns an error.

**Problem 2: irrelevant early context.** Even within the window limit, earlier messages from a long conversation often add noise rather than signal. A question asked in turn 3 about shipping options is rarely relevant to what is being discussed in turn 40.

Windowed memory and summarisation are complementary solutions to these two problems.

## Windowed memory — keep the last N turns

The simplest approach: keep only the most recent N messages. The `MessageChatMemoryAdvisor` supports this natively:

```java
MessageChatMemoryAdvisor.builder(chatMemory)
    .conversationWindowSize(10)   // 10 messages = 5 user/assistant pairs
    .build()
```

This works well for most conversations. The trade-off: when a message ages out of the window, it is gone from the model's perspective — even if it contained critical information the user mentioned early in the conversation.

**When windowed memory breaks down:**

```
Turn 1:  User: "My order number is TG-9821."
Turn 2:  Assistant: "Got it. How can I help with TG-9821?"
...
Turn 12: User: "Has my order shipped yet?"
```

With a window of 10 messages, turn 1 and turn 2 have aged out. The assistant no longer knows the order number. It will ask the user to repeat information they already provided.

For short conversations (under ~15 turns), windowed memory is perfect. For longer sessions, you need a way to preserve important context from early turns.

## Summarisation — compress old history, keep recent turns

The idea: before old messages age out of the window, summarise them into a compact text block. The summary preserves the essential facts (order numbers, names, issues discussed) in far fewer tokens than the raw conversation.

The LLM that generates answers can also generate summaries — in a separate, short call triggered when the conversation reaches a certain length.

### Building a conversation summariser

```java
@Component
class ConversationSummarizer {

    private final ChatClient summarizerClient;

    ConversationSummarizer(ChatClient.Builder builder) {
        this.summarizerClient = builder
                .defaultSystem("""
                        You summarise customer support conversations.
                        Extract: customer's name (if mentioned), order numbers, products discussed,
                        issues raised, and any resolutions provided.
                        Be concise — aim for 3–5 sentences maximum.
                        Output only the summary, no preamble.
                        """)
                .defaultOptions(OpenAiChatOptions.builder()
                        .model("gpt-4o-mini")
                        .temperature(0.0)
                        .maxTokens(200)
                        .build())
                .build();
    }

    String summarise(List<Message> messages) {
        String conversationText = messages.stream()
                .filter(m -> m.getMessageType() == MessageType.USER
                          || m.getMessageType() == MessageType.ASSISTANT)
                .map(m -> m.getMessageType() + ": " + m.getText())
                .collect(Collectors.joining("\n"));

        return summarizerClient.prompt()
                .user("Summarise this customer support conversation:\n\n" + conversationText)
                .call()
                .content();
    }
}
```

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Use a cheap, fast model for summarisation — not your most capable model. GPT-4o-mini or Haiku 3.5 handle conversation summarisation well at a fraction of the cost. Summarisation happens in the background and the summary token count is tiny compared to the raw history it replaces.</p>
</blockquote>

### Integrating summarisation with MessageChatMemoryAdvisor

Spring AI does not have a built-in summarising memory implementation, but the `ChatMemory` interface is simple enough to wrap:

```java
@Component
class SummarizingChatMemory implements ChatMemory {

    private static final int SUMMARY_TRIGGER_THRESHOLD = 20;  // summarise after 20 messages
    private static final int MESSAGES_TO_KEEP_RAW = 10;       // keep last 10 in full

    private final JdbcChatMemory delegate;
    private final ConversationSummarizer summarizer;
    private final Map<String, String> summaryCache = new ConcurrentHashMap<>();

    SummarizingChatMemory(JdbcChatMemory delegate, ConversationSummarizer summarizer) {
        this.delegate = delegate;
        this.summarizer = summarizer;
    }

    @Override
    public void add(String conversationId, List<Message> messages) {
        delegate.add(conversationId, messages);

        List<Message> all = delegate.get(conversationId, Integer.MAX_VALUE);
        if (all.size() >= SUMMARY_TRIGGER_THRESHOLD) {
            triggerSummarization(conversationId, all);
        }
    }

    @Override
    public List<Message> get(String conversationId, int lastN) {
        List<Message> recent = delegate.get(conversationId, MESSAGES_TO_KEEP_RAW);

        String summary = summaryCache.get(conversationId);
        if (summary != null) {
            // Prepend the summary as a system message
            List<Message> withSummary = new ArrayList<>();
            withSummary.add(new SystemMessage(
                "[Conversation summary]: " + summary
            ));
            withSummary.addAll(recent);
            return withSummary;
        }

        return recent;
    }

    @Override
    public void clear(String conversationId) {
        delegate.clear(conversationId);
        summaryCache.remove(conversationId);
    }

    private void triggerSummarization(String conversationId, List<Message> all) {
        // Summarise everything except the last MESSAGES_TO_KEEP_RAW messages
        int oldCount = all.size() - MESSAGES_TO_KEEP_RAW;
        if (oldCount <= 0) return;

        List<Message> toSummarize = all.subList(0, oldCount);
        String newSummary = summarizer.summarise(toSummarize);
        summaryCache.put(conversationId, newSummary);
    }
}
```

Register it as the `ChatMemory` bean:

```java
@Bean
ChatMemory chatMemory(JdbcChatMemory jdbcMemory, ConversationSummarizer summarizer) {
    return new SummarizingChatMemory(jdbcMemory, summarizer);
}
```

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> The summarisation call in the code above blocks the <code>add()</code> path. In production, run summarisation asynchronously so it does not add latency to the user-facing request. Use <code>@Async</code> or a background thread to generate the summary after the response is already sent to the user.</p>
</blockquote>

### What the model receives after summarisation kicks in

Before summarisation (full 20-message window):
```
[SYSTEM]  You are a support assistant...
[USER]    My order number is TG-9821.
[ASSISTANT] Got it...
[USER]    I ordered ProX headphones.
... (17 more messages) ...
[USER]    Has it shipped?
```

After summarisation (summary + last 10):
```
[SYSTEM]  You are a support assistant...
[SYSTEM]  [Conversation summary]: Customer placed order TG-9821 for ProX Wireless Headphones.
          They reported the shipping confirmation email was not received.
          Assistant confirmed the order is processing and provided the tracking number TRK-44821.
[USER]    I placed that order 5 days ago.      ← turn 11
[ASSISTANT] Let me check the current status...  ← turn 12
... (turns 13–20) ...
[USER]    Has it shipped?                       ← current message
```

The model has full context: the summary covers the early turns, and the last 10 messages provide detailed recent context. Total tokens sent: far less than the full 20-turn history.

## Choosing the right strategy

Match the strategy to your use case:

| Conversation type | Recommended strategy |
|---|---|
| Customer service (5–15 turns typical) | Windowed memory, `windowSize(20)` |
| Long troubleshooting sessions (15–50 turns) | Windowed + summarisation |
| Technical support requiring exact details | Summarisation + entity extraction (store order numbers separately) |
| Short Q&A, one-shot questions | No memory needed (`windowSize(1)` or none) |
| Internal knowledge worker assistant | Full history with a large-context model |

## Extracting key entities from the conversation

For support use cases, the most important information is usually structured: order numbers, product names, account IDs. Instead of relying on the summary to always mention these, extract them explicitly and store them in a structured field:

```java
record ConversationContext(
    String conversationId,
    String orderNumber,
    String productName,
    String customerName,
    String summary
) {}

@Component
class EntityExtractor {

    private final ChatClient extractorClient;

    EntityExtractor(ChatClient.Builder builder) {
        this.extractorClient = builder
                .defaultSystem("You extract key entities from customer support conversations.")
                .build();
    }

    ConversationEntities extract(String conversationText) {
        return extractorClient.prompt()
                .user("""
                      Extract from this support conversation:
                      - orderNumber (format: TG-XXXX or null if not mentioned)
                      - productName (or null)
                      - customerName (or null)

                      Conversation:
                      """ + conversationText)
                .call()
                .entity(ConversationEntities.class);
    }

    record ConversationEntities(String orderNumber, String productName, String customerName) {}
}
```

Store extracted entities separately and always inject them into the system prompt, regardless of the conversation window:

```java
String systemPrompt = baseSystemPrompt + "\n\n"
    + "Known customer context: "
    + "Order: " + entities.orderNumber() + ", "
    + "Product: " + entities.productName();
```

This guarantees the LLM always has critical structured facts, even if the raw messages have aged out of the window.

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> Module 5 is complete. The support assistant now remembers conversations across turns, survives restarts, works correctly under load balancing, and manages long sessions through summarisation. Module 6 moves from reactive to proactive AI: tools and agents that call your Java methods to take actions, not just answer questions.</p>
</blockquote>

## References

- <a href="https://docs.spring.io/spring-ai/reference/api/advisors.html#_message_chat_memory_advisor" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI MessageChatMemoryAdvisor reference</a>
- <a href="https://docs.spring.io/spring-ai/reference/api/advisors.html#_chat_memory" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI ChatMemory reference</a>
