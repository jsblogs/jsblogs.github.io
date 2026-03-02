---
title: "AI agent patterns — when to use simple chains, RAG, or full agents"
description: "Not every AI feature needs an agent. This post maps the decision: when a single LLM call is enough, when a prompt chain is better, when RAG solves it, and when you actually need a multi-step agent. Includes reliability considerations and a decision framework."
pubDatetime: "2026-03-03T16:00:00+05:30"
tags:
  - spring-ai
  - ai-concepts
  - java
---

Module 6 covered tools and agents in depth. Before closing, it is worth stepping back and asking the question that should come first: do you even need an agent?

The answer is often no. Most AI features are simpler than they look. Reaching for an agent when a single LLM call would do adds latency, cost, and failure modes without meaningful benefit.

This post is a decision guide.

## Table of contents

## The complexity spectrum

AI application patterns exist on a spectrum from simple to complex:

```
Single call → Prompt chain → RAG → RAG + Tools → Full agent
  (cheapest,                                      (most flexible,
   fastest)                                        most complex)
```

Move right only when the feature genuinely requires it. Each step adds:
- Additional LLM calls (cost and latency)
- More moving parts (failure modes)
- More non-determinism (harder to test)

## Pattern 1 — Single LLM call

**Use when:** The question can be answered from training data or from text you provide directly in the prompt.

```java
String answer = chatClient.prompt()
    .user("Classify this review as POSITIVE, NEGATIVE, or NEUTRAL: " + reviewText)
    .call()
    .content();
```

This handles:
- Classification (sentiment, intent, category)
- Extraction (pull fields from a text, parse a document)
- Transformation (translate, reformat, summarise provided text)
- Generation (write a product description given a spec sheet)

A single call is deterministic in structure (though not in content), cheap, fast, and easy to test. Use it whenever possible.

## Pattern 2 — Prompt chain

**Use when:** The output of one LLM call should be the input to another — where each step has a clear transformation.

```java
// Step 1: classify the customer message
String category = chatClient.prompt()
    .user("Classify as: ORDER_STATUS | RETURN | PRODUCT_QUESTION | COMPLAINT | OTHER\n\n" + message)
    .call().content().strip();

// Step 2: route to category-specific handler
String response = switch (category) {
    case "ORDER_STATUS" -> orderStatusPrompt(message);
    case "RETURN"       -> returnPolicyPrompt(message);
    default             -> generalSupportPrompt(message);
};
```

Chains give you explicit control at each step. Each step is independently testable. The flow is deterministic — the same input to step 1 always routes to the same step 2.

**When chains beat agents:** If you know exactly which steps are needed based on input, a chain is more reliable than an agent. The agent might take a different path each time. The chain is always the same path.

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Prefer chains over agents for classification-and-route patterns. "Classify the intent, then call the right handler" is far more reliable than "let the LLM figure out what to do next." Predictability is a feature.</p>
</blockquote>

## Pattern 3 — RAG

**Use when:** The question requires knowledge from documents you control, and that knowledge fits in the context window.

```java
// QuestionAnswerAdvisor handles retrieval + injection automatically
String answer = chatClient.prompt()
    .user(question)
    .call()
    .content();
```

RAG is the right pattern for:
- Q&A over a knowledge base (policies, documentation, FAQs)
- Grounding LLM answers in specific documents
- Questions where you need to cite sources
- Any case where "training data" answers would be wrong

RAG does not need agents. The retrieval is deterministic (same query → same results, roughly). There is no reasoning loop. It is fast and predictable.

## Pattern 4 — RAG + single tool

**Use when:** The question requires both knowledge base content AND one piece of live data.

```java
// RAG provides context; one tool call provides live data
String answer = chatClient.prompt()
    .user("What is the warranty on order TG-9821?")
    .tools(orderTools)    // one tool: getOrderStatus
    .call()
    .content();
```

This is still relatively predictable. The LLM makes at most one tool call, uses its result alongside the RAG context, and generates an answer. The agent loop is short: at most two LLM calls (one to decide to call the tool, one to generate the final answer).

## Pattern 5 — Full agent (multi-tool, multi-step)

**Use when:** The correct answer requires multiple tool calls in sequence, where the result of one determines whether and how to call the next.

```java
// Agent decides: check order → check refund eligibility → check product warranty
// Each step depends on the result of the previous
String answer = chatClient.prompt()
    .user("My headphones stopped working. What are my options?")
    .tools(orderTools, productTools)
    .call()
    .content();
```

Full agents are appropriate for:
- Multi-step data gathering (order + product + policy)
- Conditional tool use (if status is X, check Y)
- Tasks where the required steps depend on the data retrieved

Full agents are inappropriate for:
- Anything with a fixed, known sequence of steps (use a chain)
- Irreversible actions without human confirmation (delete, send, purchase)
- High-throughput, latency-sensitive paths
- Anything you can test exhaustively (agents are hard to test completely)

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> Agents can loop. If the LLM decides a tool call didn't provide enough information and calls another tool, and that also seems insufficient, it may keep calling tools. Limit the maximum number of agent turns to prevent runaway loops. Spring AI's <code>ChatClient</code> has a configurable <code>maxRounds</code> option for the agent loop.</p>
</blockquote>

## Reliability degrades with each step

Each LLM call in a chain or agent loop introduces variability. The LLM might:
- Choose a different tool than expected
- Interpret a tool result differently than intended
- Generate a slightly different plan for the same input

In a single-call scenario, the output is variable but the structure is fixed. In a 5-step agent, variability compounds across steps.

Estimate reliability:
```
Single LLM call with good prompt:  ~95% correct on clear inputs
2-step chain:                       ~90% (0.95 × 0.95)
3-step agent:                       ~86% (0.95³)
5-step agent:                       ~77% (0.95⁵)
```

These are rough estimates, not guarantees. The point: design agents to minimise the number of steps, not maximise flexibility.

## The decision framework

```
Is the answer in training data or provided text?
  Yes → Single LLM call

Is the answer in your knowledge base documents?
  Yes → RAG

Does the answer require one piece of live data?
  Yes → RAG + single tool

Is there a fixed sequence of steps where each is deterministic?
  Yes → Prompt chain

Does the task require multiple tools where the path depends on results?
  Yes → Full agent

Are actions irreversible (send email, process payment, delete data)?
  Yes → Add a human confirmation step before acting
```

## Designing agents that fail gracefully

When you do build agents, plan for failure at every step:

**Tool timeouts:** Set timeouts on every tool method. If the order service doesn't respond in 2 seconds, return an error string — don't leave the LLM waiting indefinitely.

```java
@Tool(description = "Get order status.")
OrderStatus getOrderStatus(String orderId) {
    try {
        return orderService.getStatusWithTimeout(orderId, Duration.ofSeconds(2));
    } catch (TimeoutException e) {
        return new OrderStatus(orderId, "TIMEOUT", "Order system is temporarily unavailable");
    }
}
```

**Max tool calls:** Prevent infinite loops by limiting how many tool calls can happen per request. In Spring AI, this is handled by the model's max rounds configuration or by tracking call counts in the tool class.

**Fallback response:** If the agent cannot complete a task (all tools failed, too many retries), return a helpful fallback rather than an exception:

```java
try {
    return chatClient.prompt().user(question).tools(tools).call().content();
} catch (Exception e) {
    log.error("Agent failed for question: {}", question, e);
    return "I'm having trouble accessing live information right now. " +
           "Please contact support@techgadgets.com for immediate assistance.";
}
```

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> Always have a fallback path for agent failures. Users should never see a raw exception or an empty response. A graceful "I'm having trouble right now, please contact support" is always better than a 500 error.</p>
</blockquote>

## What to monitor in production agents

| Metric | Why it matters | Alert when |
|---|---|---|
| Tool call count per request | Detects runaway loops | > 5 calls/request |
| Agent response latency | Each tool call adds ~500ms+ | P95 > 5 seconds |
| Tool error rate | Detects failing integrations | > 5% errors |
| Fallback response rate | Proxy for agent failure rate | > 2% of requests |
| Token usage per request | Cost indicator | > 5000 tokens/request |

## Summary: the right tool for the job

| Pattern | Code | Best for |
|---|---|---|
| Single call | `chatClient.prompt().user(...).call()` | Classification, extraction, generation |
| Prompt chain | Multiple sequential calls | Fixed multi-step workflows |
| RAG | `QuestionAnswerAdvisor` | Knowledge base Q&A |
| RAG + one tool | Advisor + `.tools(x)` | Live data + policy questions |
| Full agent | `.tools(x, y, z)` multi-call | Multi-step data gathering |

Start at the top. Move down only when you have a clear reason.

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> Module 6 is complete. The support assistant is now a full agent: it retrieves knowledge from documents, calls live services, maintains multi-turn memory, streams responses to the browser, and gracefully declines what it cannot answer. Module 7 covers what it takes to ship this to production: observability, cost controls, testing strategies, and safety guardrails.</p>
</blockquote>

## References

- <a href="https://docs.spring.io/spring-ai/reference/api/tools.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI Tools reference</a>
- <a href="https://www.anthropic.com/research/building-effective-agents" target="_blank" rel="noopener" referrerpolicy="origin">Anthropic: Building effective agents</a>
