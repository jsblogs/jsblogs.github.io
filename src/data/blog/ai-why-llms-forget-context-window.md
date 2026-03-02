---
title: Why LLMs forget everything — and what you must do about it
description: Every LLM call is stateless. The model has no memory of previous turns unless you explicitly provide them. This post explains why, what the context window limit means for conversations, and the three strategies for managing memory in AI applications.
pubDatetime: "2026-03-03T13:20:00+05:30"
tags:
  - spring-ai
  - ai-concepts
  - java
---

A customer started a conversation with the TechGadgets support assistant. "I ordered some headphones last week." Then: "Are they covered by the warranty?" The assistant replied: "Could you clarify what you're asking about?"

It had forgotten the headphones. It had forgotten everything said before this message.

This is not a bug in Dev's implementation. It is the fundamental nature of LLMs.

## Table of contents

## LLMs are stateless by design

Every API call to an LLM is completely independent. The model processes the prompt you send, generates a response, and discards all state. The next call starts from zero.

This is intentional. Statelessness makes LLMs horizontally scalable — any request can go to any server, no session affinity required. It makes them safe to cache, retry, and rate-limit. The trade-off is that they have no built-in memory of previous interactions.

When a user says "are they covered by the warranty?", the LLM only sees that sentence — unless you include the prior conversation in the current request.

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> The LLM does not have a session. There is no server-side conversation state. The only "memory" an LLM has is what you put in the prompt. If you want the model to know what was said before, you must send it again — every single time.</p>
</blockquote>

## The context window is both the solution and the constraint

The solution to statelessness is simple: include all previous messages in every request. If the conversation has 5 turns, send all 5 turns in the 6th request. The model sees the full history and can reference any of it.

This works — until the context window fills up.

The **context window** is the maximum amount of text (measured in tokens) that a model can process in a single call. Every model has a hard limit:

| Model | Context window |
|---|---|
| GPT-4o-mini | 128,000 tokens (~96,000 words) |
| GPT-4o | 128,000 tokens |
| Claude Sonnet | 200,000 tokens |
| Llama 3.1 (8B) | 128,000 tokens |
| Gemini 1.5 Pro | 1,000,000 tokens |

A 128K token context window sounds enormous — and for short conversations, it is. But in a support chatbot used continuously, a conversation can accumulate thousands of tokens over dozens of turns. Add retrieved RAG context (which also consumes window space), and the context window fills faster than expected.

Two problems arise when the context window fills:

**The API returns an error.** You tried to send more tokens than the model accepts. The request fails hard.

**Costs spike silently.** Most models charge per token — both input and output. A conversation with 50K tokens of history sent on every turn costs 50K tokens of input per request, even if the new message is 20 words. Costs scale with history length, not just message length.

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> Naively appending all messages to every request is dangerous in long-running applications. A session that runs for an hour with one message per minute can easily exceed 50,000 tokens. Monitor token usage with <code>ChatResponse.getMetadata().getUsage()</code> and build a management strategy before hitting production.</p>
</blockquote>

## The three memory strategies

There is no universally correct memory strategy — each trades off between recall, cost, and complexity:

| Strategy | How it works | Best for | Drawback |
|---|---|---|---|
| **Full history** | Send all previous messages every turn | Short sessions, critical recall | Expensive and slow for long sessions |
| **Windowed memory** | Keep only the last N messages | Most chatbots | May lose early context |
| **Summarisation** | Summarise older history, keep recent turns in full | Long sessions | Extra LLM call to summarise |

Spring AI supports all three through its `ChatMemory` interface. The next posts show each in code.

## The anatomy of a conversation in LLM API terms

When you send a conversation to an LLM, you send a list of messages. Each message has a role:

- `SYSTEM` — the system prompt (instructions, persona, context). Sent once at the top.
- `USER` — what the human said
- `ASSISTANT` — what the model replied

A three-turn conversation looks like this when sent to the API:

```
[SYSTEM]    You are a support assistant for TechGadgets...
[USER]      I ordered some headphones last week.
[ASSISTANT] I'd be happy to help with your headphone order. Do you have the order number?
[USER]      Yes, it's TG-9821.
[ASSISTANT] I found order TG-9821. The ProX Wireless Headphones are estimated to arrive Friday.
[USER]      Are they covered by the warranty?
```

The model reads the full list, understands "they" refers to the ProX Wireless Headphones from order TG-9821, and answers accordingly.

Your application must build this list and send it with every new user message. That is what Spring AI's `MessageChatMemoryAdvisor` does.

## Why memory is separate from RAG

A common question: can't the vector store hold conversation history, and can't RAG retrieve it?

Memory and RAG serve different purposes:

| | Conversation memory | RAG |
|---|---|---|
| **Content** | What was said in this conversation | Your knowledge base documents |
| **Access pattern** | All recent turns, in order | Top-K semantically similar chunks |
| **Purpose** | Continuity across turns | Grounding in factual knowledge |
| **Storage** | Ordered list of messages | Unordered vector embeddings |

Conversation memory must preserve order — you cannot retrieve "the last 5 messages" from a vector store meaningfully, because similarity search returns by relevance, not by recency.

Use RAG to ground answers in your knowledge base. Use chat memory to maintain continuity within a conversation. In a fully-featured assistant, you use both.

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> When the context window is tight, prioritise recent messages over old ones. The last 2–3 turns usually contain the most relevant context for the current question. Earlier turns can be summarised or dropped entirely without losing much conversational coherence.</p>
</blockquote>

## What Spring AI provides

Spring AI models memory through two abstractions:

**`ChatMemory`** — stores and retrieves messages. Implementations include:
- `InMemoryChatMemory` — stores in a `ConcurrentHashMap`, lost on restart
- `CassandraChatMemory` — stores in Apache Cassandra
- `JdbcChatMemory` — stores in any JDBC database (PostgreSQL, MySQL, H2)
- `Neo4jChatMemory` — stores in Neo4j graph database

**`MessageChatMemoryAdvisor`** — an advisor that injects stored conversation history into every `ChatClient` call, and saves the new messages (user input + model response) back to `ChatMemory` after each turn.

The next post wires `InMemoryChatMemory` into the support assistant. The post after that replaces it with `JdbcChatMemory` for production persistence.

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> Memory in Spring AI is keyed by a **conversation ID**. Each user session gets a unique ID, and all messages in that session are stored and retrieved under that ID. This is how multiple concurrent users can have independent conversations through the same application instance.</p>
</blockquote>

## References

- <a href="https://docs.spring.io/spring-ai/reference/api/advisors.html#_chat_memory" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI Chat Memory reference</a>
- <a href="https://docs.spring.io/spring-ai/reference/api/chatclient.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI ChatClient reference</a>
