---
title: Prompt engineering basics every developer needs before writing any code
description: A prompt is not just a question — it is an instruction set. This post covers the anatomy of effective prompts, zero-shot vs few-shot prompting, chain-of-thought reasoning, and the most common mistakes developers make when writing their first prompts.
pubDatetime: "2026-03-02T20:20:00+05:30"
tags:
  - java
  - llm
  - prompt-engineering
---

Dev got the Spring AI integration working and typed a test prompt: "Tell me about our products."

The model responded with a three-paragraph essay on the history of e-commerce and a generic description of how online stores work. Nothing about the actual products.

Dev stared at the screen. The model was clearly capable. The problem was the instruction. This is the prompt engineering problem: the model does exactly what you ask — and if you ask vaguely, you get vague results.

This post covers how to ask precisely.

## Table of contents

## Prompts are structured instructions, not search queries

The first mindset shift: a prompt is not a search query. You are not sending keywords to a database. You are writing instructions for an intelligent system that will interpret them literally, fill in gaps with assumptions, and execute them as best it can.

Vague instructions produce vague results. Precise instructions produce precise results.

Compare these two prompts for the same task:

**Vague:**
```
Tell me about our products.
```

**Precise:**
```
You are a customer support assistant for TechGadgets, an online electronics store.
A customer asked: "Tell me about your products."
Using only the product catalog provided below, list the top 3 most popular product categories
and give one example product from each. Format your response as a short bulleted list.
Each bullet should be one sentence.

Product catalog:
{catalog}
```

The second prompt tells the model: who it is, what the context is, what the task is, where to get information, how to format the output, and how long to be. That is the anatomy of a good prompt.

## The anatomy of a good prompt

Every effective prompt has some or all of these components:

### 1. Role
Tell the model who it is. This shapes its tone, vocabulary, and decision-making.
```
You are a senior Java developer reviewing a Spring Boot application for performance issues.
```

### 2. Context
Give the model the background information it needs. It only knows what you tell it in this call.
```
The application processes 10,000 orders per day. The team has been seeing high latency in the order submission endpoint.
```

### 3. Task
State exactly what you want the model to do. Use action verbs: "list", "summarize", "classify", "extract", "generate", "explain".
```
Identify the three most likely causes of high latency in the following code and explain each one in one sentence.
```

### 4. Output format
Specify exactly how you want the response structured. Without this, you get whatever format the model prefers.
```
Format your response as a numbered list. Do not include any introductory or closing sentences.
```

### 5. Constraints
Add guardrails. What should the model not do? What data should it only use?
```
Use only the information in the code snippet provided. Do not suggest architectural changes outside the scope of this method.
```

Here is the full example combined:

```
You are a senior Java developer reviewing a Spring Boot application.
The application processes 10,000 orders per day and has been seeing latency spikes in the order submission endpoint.

Review the following method and identify the three most likely causes of high latency.

Code:
{code}

Format your response as a numbered list with one sentence per item.
Do not include introductory or closing sentences.
Do not suggest changes outside the scope of this method.
```

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> After writing a new prompt, read it as if you are a very literal assistant with no prior knowledge of your system. Does it contain everything needed to complete the task? If you would ask a clarifying question, the model will make an assumption instead — and it may assume wrong.</p>
</blockquote>

## Zero-shot prompting — just ask

Zero-shot prompting means giving the model a task with no examples. This works well when the task is familiar to the model from its training.

```
Classify the following customer message as one of: COMPLAINT, QUESTION, COMPLIMENT, or OTHER.

Message: "My order arrived damaged and I want a refund immediately."

Classification:
```

Zero-shot is the simplest approach. Start here. Only move to few-shot if the results are inconsistent.

## Few-shot prompting — teach by example

Few-shot prompting gives the model examples of input → expected output before the actual task. This significantly improves consistency for tasks with specific output requirements that the model might not infer correctly on its own.

```
Classify each customer message into one of: COMPLAINT, QUESTION, COMPLIMENT, or OTHER.

Examples:
Message: "My order was supposed to arrive yesterday and it hasn't shown up."
Classification: COMPLAINT

Message: "Do you have the Model X headphones in black?"
Classification: QUESTION

Message: "The packaging was beautiful and everything arrived perfectly."
Classification: COMPLIMENT

Now classify:
Message: "I can't find the warranty information on your site."
Classification:
```

The examples act as a template. The model pattern-matches your task to the examples and produces output in the same format.

**When to use few-shot:**
- When the output format is non-standard
- When the task involves subtle distinctions the model gets wrong in zero-shot
- When you need consistent structure that zero-shot does not reliably produce

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> Few-shot examples consume tokens — potentially a lot of them if examples are long. Balance the improvement in quality against the increase in cost. Usually 2–4 examples is the sweet spot.</p>
</blockquote>

## Chain-of-thought — ask the model to reason step by step

For complex reasoning tasks, simply asking the model to "think step by step" before answering significantly improves accuracy. This is called chain-of-thought prompting.

Without chain-of-thought:
```
A customer bought a product for $89.99 with 15% off and paid with a gift card that had $50 credit.
How much did they charge to their credit card?
```

With chain-of-thought:
```
A customer bought a product for $89.99 with 15% off and paid with a gift card that had $50 credit.
How much did they charge to their credit card?

Think through this step by step before giving the final answer.
```

The second prompt will reliably give the right answer because the model works through the arithmetic explicitly before stating the result. Without it, the model may jump to a confident but wrong answer.

**When to use chain-of-thought:**
- Multi-step arithmetic or logic
- Decisions that depend on combining multiple facts
- Debugging or root-cause analysis tasks

The downside: chain-of-thought produces more tokens (the reasoning steps), which means higher cost and latency. Use it only when the task complexity warrants it.

## The most common prompt engineering mistakes

### Asking two questions at once
```
Summarize this article and also tell me what questions a customer might ask about it.
```
This produces two things merged into one response that is often hard to parse. One task per prompt — or explicitly ask for structured output with labeled sections.

### Not specifying output format
```
List the key features of this product.
```
The model will choose its own format — sometimes a numbered list, sometimes prose, sometimes JSON. If your code parses the output, format ambiguity causes runtime errors. Always specify: "Respond in a JSON array with the schema `{feature: string, description: string}`".

### Giving the model an out when it should commit
```
Classify this as positive or negative if you can.
```
"If you can" gives the model permission to say "I'm not sure." For classification tasks, tell it to always commit: "Classify as POSITIVE or NEGATIVE. If genuinely ambiguous, choose the more likely option."

### Writing the system prompt as prose, not instructions
```
You are a helpful assistant who knows about our products and is friendly and professional and should always try to help customers.
```
This reads well but is hard to follow reliably. Use clear, imperative statements:
```
You are a customer support assistant for TechGadgets.
Always answer from the provided product catalog context.
If you cannot find an answer in the context, say: "I don't have that information."
Keep responses to 3 sentences or fewer unless detail is explicitly requested.
```

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> Prompt engineering is empirical, not theoretical. Write the prompt, test it with 10–20 representative inputs, look at where it fails, and iterate. A prompt that sounds good but has not been tested is not ready for production.</p>
</blockquote>

## Prompts in Spring AI — PromptTemplate

In Spring AI, use `PromptTemplate` to separate prompt structure from variable content. This keeps prompts in resource files, not Java strings, and makes them easy to review and update.

```java
// src/main/resources/prompts/classify-message.st
// {message} is the variable placeholder
```

```
Classify the following customer message as: COMPLAINT, QUESTION, COMPLIMENT, or OTHER.
Respond with only the classification label — nothing else.

Message: {message}
```

```java
@Service
class ClassificationService {

    private final ChatClient chatClient;
    private final PromptTemplate template;

    ClassificationService(ChatClient chatClient) {
        this.chatClient = chatClient;
        this.template = new PromptTemplate(
            new ClassPathResource("prompts/classify-message.st")
        );
    }

    String classify(String customerMessage) {
        Prompt prompt = template.create(Map.of("message", customerMessage));
        return chatClient.prompt(prompt).call().content().strip();
    }
}
```

The prompt lives in a file. Changing the prompt does not require touching Java code. The variable substitution is explicit and type-safe. This is the pattern you will use throughout the rest of this course.

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> Prompt engineering is a skill that compounds with practice. The patterns in this post — role, context, task, format, constraints — apply from the simplest classification task to the most complex agent system prompt. Return to this post whenever a prompt is behaving unexpectedly.</p>
</blockquote>

## Summary

- **Role + context + task + format + constraints** — the five components of a complete prompt
- **Zero-shot first** — only add examples if the output is inconsistent
- **Few-shot** — 2–4 examples usually sufficient; more examples = more tokens
- **Chain-of-thought** — add "think step by step" for complex reasoning tasks
- **PromptTemplate** — keep prompts in `.st` files, not Java strings

You now have the conceptual foundation. The next module puts it all into code — setting up Spring AI, making your first real API call, and building the chat endpoint that the support assistant will use.
