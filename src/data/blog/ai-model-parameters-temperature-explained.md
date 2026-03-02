---
title: Temperature, top-p, and model parameters — what to actually set
description: Temperature is not magic. It is a dial that controls randomness. This post explains temperature, top-p, max tokens, and system vs user prompts in plain terms — with concrete recommendations for different use cases.
pubDatetime: "2026-03-02T19:40:00+05:30"
tags:
  - java
  - llm
---

Dev's first chatbot was giving repetitive, robotic answers. Someone suggested "try increasing the temperature." Dev changed it from 0 to 1.8 and the chatbot started hallucinating product details and writing poetry about database schemas.

There is a middle ground, and it is not hard to find once you understand what temperature actually does.

This post covers the model parameters you will configure in Spring AI — what each one controls, what the sensible defaults are, and how to choose the right values for different use cases.

## Table of contents

## Temperature — controlling randomness

When an LLM predicts the next token, it produces a probability distribution over all possible tokens. Temperature modifies that distribution before the final selection.

- **Temperature = 0**: Always pick the highest-probability token. Fully deterministic, consistent across runs, sometimes repetitive.
- **Temperature = 1**: Use the raw probability distribution. Balanced between creativity and coherence.
- **Temperature > 1**: Flatten the distribution — lower-probability tokens get more chances. Output becomes more varied, surprising, and potentially incoherent.

Think of it like a thermostat for creativity. Low temperature = focused and safe. High temperature = exploratory and unpredictable.

### Practical temperature settings by use case

| Use case | Recommended temperature | Why |
|---|---|---|
| Factual Q&A, support bot | 0.0 – 0.2 | Consistent, grounded answers. Reduces hallucination. |
| Code generation | 0.0 – 0.3 | Code needs to be syntactically correct and predictable. |
| Data extraction / classification | 0.0 | Deterministic output for structured tasks. |
| Conversational assistant | 0.5 – 0.7 | Natural, varied responses without going off the rails. |
| Creative writing, brainstorming | 0.8 – 1.2 | Needs variety and surprise. |

**Start low and raise it** if answers feel too rigid. Do not start at 1.0 and lower it — you will spend more time debugging hallucinations than tuning tone.

In Spring AI:

```java
ChatOptions options = OpenAiChatOptions.builder()
        .model("gpt-4o")
        .temperature(0.2)
        .build();

ChatResponse response = chatClient.prompt()
        .options(options)
        .user("What is our return policy?")
        .call()
        .chatResponse();
```

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> For a support chatbot answering questions about your product catalog and policies, start at temperature 0.2. It will give consistent, accurate answers. Raise it only if users complain the responses feel robotic.</p>
</blockquote>

## Top-p (nucleus sampling) — usually leave this alone

Top-p is an alternative (or complementary) way to control randomness. Instead of modifying the full distribution, it restricts selection to the smallest set of tokens whose cumulative probability meets the threshold.

At `top-p = 0.9`, the model only considers tokens that collectively account for 90% of the probability mass — ignoring the long tail of unlikely tokens.

**The practical guidance: set temperature or top-p, not both at the same time.** Most teams pick temperature and leave top-p at its default (usually 0.95 or 1.0). The OpenAI documentation says the same. Adjusting both simultaneously makes behavior harder to reason about.

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> Top-p is more useful when you need the model to stay coherent but you are willing to use a wide vocabulary. Temperature is the more intuitive and widely-used lever for most use cases. Default top-p and tune temperature.</p>
</blockquote>

## Max tokens — always set this

Max tokens (sometimes `max_completion_tokens`) limits how long the model's response can be. The model will stop generating once it hits this limit, even mid-sentence.

**Always set this explicitly.** If you leave it unset, the model can generate up to the full context window size in output. For a support bot that should answer in two sentences, there is no reason to allow a 5,000-word response — which would also cost significantly more.

Typical values:
- Short factual answers: 150–300 tokens
- Conversational responses: 300–600 tokens
- Document summaries: 600–1,500 tokens
- Code generation: 1,000–4,000 tokens (code can be long)

In Spring AI:

```java
ChatOptions options = OpenAiChatOptions.builder()
        .model("gpt-4o-mini")
        .temperature(0.2)
        .maxTokens(400)
        .build();
```

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> A truncated response at the max token limit does not throw an error — the model just stops mid-sentence. If you receive a suspiciously short response, check the <code>finishReason</code> in the response metadata. A value of <code>length</code> means it was cut off.</p>
</blockquote>

## System prompt vs user prompt — the two roles

Every LLM call in a chat model consists of messages in two primary roles: **system** and **user** (there is also `assistant` for prior model responses in conversation history).

### System prompt — the model's job description

The system prompt sets the model's persona, constraints, and context for the entire conversation. It is the first thing in the context window and the most influential — the model weights it heavily when generating responses.

Good system prompts answer: Who are you? What is your job? What must you always do? What must you never do?

```java
String systemPrompt = """
        You are a helpful customer support assistant for TechGadgets, an online electronics store.
        Answer questions about products, shipping, and returns using only the provided context.
        If you do not know the answer, say so clearly. Do not make up product specifications.
        Keep responses concise — 2 to 4 sentences unless the question requires more detail.
        """;

ChatResponse response = chatClient.prompt()
        .system(systemPrompt)
        .user("Do you have waterproof Bluetooth headphones?")
        .call()
        .chatResponse();
```

### User prompt — the actual request

The user prompt is the specific question or instruction for this call. It changes per request, while the system prompt stays constant.

In Spring AI's `ChatClient`, you set the system prompt once at the bean configuration level and the user prompt per request:

```java
@Bean
ChatClient chatClient(ChatClient.Builder builder) {
    return builder
            .defaultSystem("""
                    You are a helpful support assistant for TechGadgets.
                    Answer only questions about products and orders.
                    """)
            .build();
}

// Per request:
String answer = chatClient.prompt()
        .user("What is your return window?")
        .call()
        .content();
```

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Treat the system prompt like a configuration file, not like code. It should live in <code>src/main/resources/prompts/</code>, not hardcoded in a Java string. This makes it easy to update without a code deploy and easy to review in pull requests.</p>
</blockquote>

## Quick configuration reference

Here is a practical starter configuration for a support chatbot in Spring AI:

```java
@Bean
ChatClient supportChatClient(ChatClient.Builder builder) {
    return builder
            .defaultSystem("""
                    You are a helpful support assistant for TechGadgets.
                    Answer only questions about products, policies, and orders.
                    If you cannot answer from the provided context, say: "I don't have that information right now."
                    Keep answers concise and factual.
                    """)
            .defaultOptions(OpenAiChatOptions.builder()
                    .model("gpt-4o-mini")
                    .temperature(0.2)
                    .maxTokens(400)
                    .build())
            .build();
}
```

| Parameter | Value | Reasoning |
|---|---|---|
| Model | `gpt-4o-mini` | Good quality, low cost for support Q&A |
| Temperature | `0.2` | Consistent, grounded factual answers |
| Max tokens | `400` | Support answers should be concise |
| System prompt | Externalized | Reviewable, changeable without redeploy |

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> These are starting values, not final values. After going live, look at real conversations and adjust. The right temperature for your use case is the one that produces answers your users actually like.</p>
</blockquote>

## Summary

- **Temperature**: Start at 0.2 for factual tasks, 0.7 for conversational, 1.0+ only for creative.
- **Top-p**: Leave at default. Tune temperature instead.
- **Max tokens**: Always set explicitly. Match it to the expected response length for your use case.
- **System prompt**: Sets the AI's role and constraints. Keep it in a resource file, not a Java string.
- **User prompt**: The per-request question or instruction.

The next post covers how to choose between available AI models — OpenAI, Anthropic, and local Ollama — and how Spring AI makes switching between them a configuration change.
