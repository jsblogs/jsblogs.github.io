---
title: Tokens and context windows — what every developer must understand
description: Tokens and context windows are not just billing details. They are hard engineering constraints that shape how you design prompts, manage conversation history, and build RAG pipelines. Here is everything you need to know.
pubDatetime: "2026-03-02T19:20:00+05:30"
tags:
  - java
  - llm
  - spring-ai
---

Dev submitted the first test prompt to the OpenAI API and got a response back. Then came the question from the tech lead: "How much is this going to cost at scale, and what happens when the conversation gets long?"

Dev opened the OpenAI pricing page, saw "per 1M tokens," and thought: what exactly is a token?

Two minutes later, Dev also discovered the phrase "context window limit" and realized this was not just a billing question — it was a design constraint that affected the entire architecture.

This post answers both questions.

## Table of contents

## What is a token?

A token is not a word. It is not a character. It is a **subword unit** — a chunk of text that sits somewhere between a character and a full word, determined by a statistical encoding algorithm trained on the model's training corpus.

Some rough intuitions for English text:

- Common short words are usually one token: `the`, `and`, `is`
- Longer or less common words are often split: `tokenization` → `token` + `ization`
- Numbers and punctuation each tend to be one token
- A rough rule of thumb: **1 token ≈ 4 characters**, or **~75 words ≈ 100 tokens**

Here are some concrete examples:

| Text | Approximate token count |
|---|---|
| `Hello, world!` | 4 |
| `Spring Boot application` | 4 |
| `@SpringBootApplication` | 5 |
| A typical blog paragraph (150 words) | ~200 tokens |
| A 10-page PDF (5,000 words) | ~6,700 tokens |

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Use OpenAI's <a href="https://platform.openai.com/tokenizer" target="_blank" rel="noopener">tokenizer tool</a> to see exactly how your prompts are tokenized. Paste a few of your system prompts in there — the actual count often surprises developers.</p>
</blockquote>

## What is a context window?

The context window is the total number of tokens the model can process in a single call — both input and output combined.

Think of it as the model's working memory for that call. Everything you send (system prompt + conversation history + your question + retrieved documents) plus everything it generates (the response) must fit within this window.

| Model | Context window |
|---|---|
| GPT-4o | 128,000 tokens |
| GPT-4o-mini | 128,000 tokens |
| Claude claude-sonnet-4-5 | 200,000 tokens |
| Llama 3.2 (via Ollama) | 128,000 tokens |
| Mistral 7B (via Ollama) | 32,000 tokens |

128,000 tokens sounds like a lot — it is roughly 100,000 words, or a 300-page book. But in practice, it fills up faster than you expect when you are doing RAG (injecting retrieved documents) and maintaining conversation history.

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> The context window limit is not just a soft guideline. Exceeding it throws an error. Your application must handle context management proactively — not reactively when it breaks in production.</p>
</blockquote>

## How tokens translate to cost

LLM APIs charge per token — separately for input (prompt) and output (completion), because generating tokens is more expensive than processing them.

Approximate rates as of early 2026 (check current pricing before budgeting):

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|---|---|---|
| GPT-4o | $2.50 | $10.00 |
| GPT-4o-mini | $0.15 | $0.60 |
| Claude claude-sonnet-4-5 | $3.00 | $15.00 |
| Ollama (local) | $0 | $0 |

A practical example: a support chatbot that processes 1,000 requests per day, each with 500 tokens in and 200 tokens out, would use 700,000 tokens per day. At GPT-4o pricing:

- Input: 500,000 tokens × $2.50/1M = **$1.25/day**
- Output: 200,000 tokens × $10.00/1M = **$2.00/day**
- Total: **~$3.25/day** or roughly **$100/month**

At GPT-4o-mini, the same load costs roughly **$0.20/day** or **$6/month**.

Model selection is one of the most powerful cost levers available to you. Module 7 covers this in depth.

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> Agentic flows (Module 6) multiply token usage significantly. A single user request that triggers three tool calls may cost 5–10× a simple chat response. Budget for this explicitly — do not discover it after launch.</p>
</blockquote>

## The engineering implications of context windows

### Your system prompt uses tokens too

Every call sends the system prompt. If your system prompt is 500 tokens and you make 10,000 calls per day, that is 5 million tokens of input per day — just for the system prompt. Keep system prompts focused and avoid padding them with redundant instructions.

### Conversation history grows call by call

In a chat interface, you must resend the entire conversation history with every new message (because the model is stateless). In a 10-turn conversation with 200 tokens per turn, you start spending 2,000 tokens per call just on history by the end.

For long conversations, this grows linearly until you hit the context window limit. This is why windowed memory and summarization (Module 5) are engineering necessities, not optional features.

### RAG documents add significant token load

When you inject retrieved documents for RAG (Module 4), each retrieved chunk adds to the input tokens. If you retrieve 5 chunks of 500 tokens each, that's 2,500 additional input tokens per call. With a large knowledge base and aggressive retrieval, this can dominate your token budget.

## How to count tokens in your Java code

Spring AI exposes token usage in the response metadata for every call:

```java
ChatResponse response = chatClient.prompt()
        .user("What is Spring Boot?")
        .call()
        .chatResponse();

Usage usage = response.getMetadata().getUsage();
System.out.println("Input tokens:  " + usage.getPromptTokens());
System.out.println("Output tokens: " + usage.getGenerationTokens());
System.out.println("Total tokens:  " + usage.getTotalTokens());
```

Log this data from day one. Understanding your real-world token usage is essential for cost optimization and context window management.

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> Token counting is not just a cost concern — it is a correctness concern. When the context window fills up, the model does not get an error and quietly degrade. It throws an exception. Proactive token budget management is production hygiene, not an optimization.</p>
</blockquote>

## Key takeaways

1. A token is approximately 4 characters. Internalize this for quick mental math.
2. Context window = input tokens + output tokens. Both count against the limit.
3. Log token usage from the first call — you will need this data later.
4. System prompt tokens multiply across every API call — keep them lean.
5. Conversation history grows per turn — plan for windowed or summarized memory from the start.
6. Model selection is the biggest single cost lever available to you.

The next post covers the parameters that shape what the model generates within that context window — temperature, top-p, max tokens, and when to use each.
