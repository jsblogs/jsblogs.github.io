---
title: What is an AI agent? Moving beyond single LLM calls
description: A single LLM call answers a question. An AI agent reasons, decides which tools to use, calls them, observes results, and loops until the task is complete. This post explains the concept clearly and when you actually need an agent vs a simpler approach.
pubDatetime: "2026-03-03T14:40:00+05:30"
tags:
  - spring-ai
  - ai-concepts
  - java
---

A customer messaged the TechGadgets support assistant: "My order TG-9821 was supposed to arrive yesterday. Is there a delay and can I get a refund?"

The assistant had RAG and memory. But the order data — the actual shipping status, the estimated delivery date, the refund eligibility — lived in the order management system. The assistant could not access it. It could only say "please contact support" for any question involving live data.

Agents fix this. An agent can call the order management system, check the status, determine refund eligibility, and report back — all within a single conversation turn.

## Table of contents

## What makes something an "agent"

The word "agent" is overloaded in AI conversations. For this course, a working definition:

**An AI agent is a system where an LLM controls a loop that calls tools (functions), observes the results, and decides what to do next — repeating until the task is complete.**

The key properties:

1. **Tool use** — the LLM can call external functions and receive results
2. **Reasoning** — the LLM decides *which* tool to call and *when*
3. **Looping** — the LLM may call multiple tools in sequence, using the result of one to inform the next
4. **Autonomy** — the LLM determines when the task is done

A single `ChatClient.prompt().call().content()` is not an agent — it is a one-shot LLM call. The difference is whether the LLM can take actions and observe their results.

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> Not every AI feature needs an agent. An agent adds complexity, latency (multiple LLM calls per request), and cost. Use the simplest approach that works. A single LLM call with good prompting handles most classification, extraction, and Q&A tasks. Agents are for tasks that require live data retrieval, multi-step reasoning, or taking real actions.</p>
</blockquote>

## The agent loop

```
User input
    │
    ▼
┌───────────────────────────────────┐
│ LLM: reason about user request    │
│ → decide to call tool X with args │
└──────────────┬────────────────────┘
               │ tool call
               ▼
┌───────────────────────────────────┐
│ Tool X executes (your Java code)  │
│ → returns result                  │
└──────────────┬────────────────────┘
               │ tool result
               ▼
┌───────────────────────────────────┐
│ LLM: read result, reason again    │
│ → call another tool OR            │
│ → generate final answer           │
└──────────────┬────────────────────┘
               │ (loop or finish)
               ▼
         Final answer to user
```

In Spring AI, this loop runs inside the `ChatClient`. You define tools as Java methods annotated with `@Tool`. The LLM decides when to call them. Spring AI executes the method and feeds the result back to the LLM.

The entire loop is transparent to the calling code — from the controller's perspective, it is still a single `chatClient.prompt().call().content()`.

## Tools are just Java methods

The "action" side of an agent is ordinary Java code. A tool that checks order status is a method that calls your order service:

```java
class OrderTools {

    private final OrderService orderService;

    OrderTools(OrderService orderService) {
        this.orderService = orderService;
    }

    @Tool(description = "Get the current status and estimated delivery date for an order. "
                       + "Use when the customer asks about their order status or delivery.")
    OrderStatus getOrderStatus(String orderId) {
        return orderService.getStatus(orderId);   // your existing service
    }

    @Tool(description = "Check if an order is eligible for a refund based on order status and date.")
    RefundEligibility checkRefundEligibility(String orderId) {
        return orderService.checkRefundEligibility(orderId);
    }
}
```

The LLM reads the `description` field and decides when to call the tool. Good descriptions are critical — they are the only signal the LLM uses to decide tool selection.

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> Write tool descriptions from the LLM's perspective: "Use when the customer asks about X." Be specific. Vague descriptions ("gets order info") lead to the LLM calling tools at the wrong time or not at all. Precise descriptions ("Get the current status and estimated delivery date for an order. Use when the customer asks about their order status or delivery.") dramatically improve tool selection accuracy.</p>
</blockquote>

## What the LLM actually does with tools

When the LLM receives a prompt that includes tool definitions, it can respond in two ways:

1. **Text response** — a normal answer when no tool is needed
2. **Tool call** — a structured request to invoke a specific tool with specific arguments

A tool call response looks like:
```json
{
  "tool": "getOrderStatus",
  "arguments": { "orderId": "TG-9821" }
}
```

Spring AI intercepts this, calls `orderTools.getOrderStatus("TG-9821")`, and sends the return value back to the LLM as a tool result. The LLM then continues — it might call another tool, or it might have enough information to generate the final answer.

This is function calling, and it is the core mechanism behind all LLM tool use. The next post covers the Spring AI API in detail.

## Single LLM call vs agent: the decision

Pick the right approach for the task:

| Task | Approach |
|---|---|
| Answer a question from a knowledge base | RAG (no agent needed) |
| Classify or extract from a given text | Single LLM call |
| Look up live data to answer a question | Agent with one tool |
| Multi-step workflow: look up → decide → act | Agent with multiple tools |
| Orchestrate other AI calls | Agent |
| Generate creative content | Single LLM call |

The pattern is: agents make sense when the correct answer depends on live data or requires multiple steps that cannot all be in one prompt.

## Reliability and the multi-step trap

Every tool call adds a step where things can go wrong. If each tool call has a 95% success rate, a three-tool chain has (0.95)³ = 86% overall success rate. Add error handling, retries, and fallbacks for each tool.

Agents are also harder to test. A single LLM call is easy to mock. An agent with four tools and a non-deterministic reasoning loop requires more careful test design.

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> Do not build agents that take irreversible real-world actions (send emails, process payments, delete data) without a human confirmation step. LLMs occasionally misunderstand intent. A tool that books a flight or processes a refund should confirm with the user before executing. Reserve fully autonomous action for low-stakes, reversible operations.</p>
</blockquote>

## What is built in Module 6

The next four posts build incrementally:

1. **Function calling basics** — annotate a Java method with `@Tool`, wire it to `ChatClient`, see the agent loop in action
2. **Order status agent** — a complete agent that checks live order status and refund eligibility for the support assistant
3. **RAG + tools combined** — use both knowledge base retrieval and live data tools in the same `ChatClient`
4. **Agent patterns** — when simple chains are enough, when full agents are needed, and how to design reliably

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> Spring AI's function calling API went through significant changes between 0.8 and 1.0. This course uses the stable 1.0 API with <code>@Tool</code> annotations and <code>ToolCallback</code>. If you see older examples using <code>FunctionCallback</code> or <code>@Description</code>, they are from pre-1.0 Spring AI.</p>
</blockquote>

## References

- <a href="https://docs.spring.io/spring-ai/reference/api/tools.html" target="_blank" rel="noopener" referrerpolicy="origin">Spring AI Tools reference</a>
- <a href="https://platform.openai.com/docs/guides/function-calling" target="_blank" rel="noopener" referrerpolicy="origin">OpenAI Function Calling guide</a>
