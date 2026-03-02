---
title: How LLMs work — a developer's mental model (no PhD required)
description: Before writing a single line of Spring AI code, you need to understand what an LLM actually is and how it behaves. This post builds the mental model that will inform every architectural decision you make.
pubDatetime: "2026-03-02T19:00:00+05:30"
tags:
  - java
  - llm
  - spring-ai
---

Dev started reading the OpenAI documentation. Five minutes in, there were mentions of transformers, attention mechanisms, and embedding spaces. Dev closed the tab.

Here is the thing: you do not need to understand how a transformer works to build production AI features. Surgeons do not need to understand semiconductor physics to use diagnostic software. But you do need a working mental model — one accurate enough to make good architectural decisions and debug surprising behavior.

This post gives you that model.

## Table of contents

## What an LLM actually is

Forget "artificial intelligence" as a concept for a moment. Think of an LLM as a very sophisticated function:

```
f(sequence of tokens) → probability distribution over the next token
```

That's it. An LLM takes a sequence of text (broken into chunks called tokens) and predicts what token is most likely to come next. It does this one token at a time, appending each prediction to the sequence and running again, until it decides to stop.

This process is called **autoregressive generation**. The model generates text left to right, each step building on everything before it.

### Why this matters for your code

Because the model is predicting the next token — not retrieving a stored answer — **the same prompt can produce different outputs on different calls**. This is not a bug. It's the fundamental nature of probabilistic generation. Your application architecture needs to account for it.

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> LLMs do not look up answers from a database. They generate text that is statistically likely to follow your prompt. This is why they can be wrong — and why they can be right in ways no rule-based system ever could be.</p>
</blockquote>

## Training vs inference — the distinction that matters

An LLM's lifecycle has two completely separate phases.

### Training (happened once, somewhere else)

Training is the process of adjusting billions of numerical parameters by feeding the model massive amounts of text and nudging it toward better next-token predictions. GPT-4o was trained on roughly a trillion tokens. This took thousands of GPUs running for months and cost tens of millions of dollars.

**You are not involved in this.** When you call the OpenAI API, you are not triggering training. Training is done, frozen, and shipped.

### Inference (happens every API call)

Inference is the model using its frozen parameters to generate text given your input. It runs on OpenAI's servers, takes milliseconds to seconds, and costs fractions of a cent per call.

**This is the only part you interact with.** When you call `chatClient.call("What is Spring Boot?")`, you are running inference.

| | Training | Inference |
|---|---|---|
| When | Once, before you use the model | Every API call |
| Who does it | The model provider (OpenAI, Anthropic) | You, via API |
| Cost | Millions of dollars | Fractions of a cent |
| Changes the model? | Yes | No |
| Your concern | None | Everything |

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> When someone says "the model doesn't know about X", they mean X was not in the training data. You cannot teach it by telling it once in a prompt — you can only give it context for that specific call. This is why RAG (Module 4) exists.</p>
</blockquote>

## The model has no memory between calls

Every API call starts completely fresh. The model has no awareness of previous conversations, previous API calls, or anything outside the current input.

This surprises many developers. If you call the API twice:

**Call 1:** "My name is Dev."
**Call 2:** "What is my name?"

The answer to call 2 will be something like "I don't know your name." The model received no information about it.

The only memory the model has is what you include in the current call's input. This is why conversation history must be sent with every request — and why managing that history is an engineering responsibility, not the model's. (Module 5 covers chat memory in detail.)

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> Never design a feature that relies on the model "remembering" something from a previous API call. It will not. Every call is stateless. Persistence is your application's job.</p>
</blockquote>

## The model does not "know" things the way a database does

A database stores facts as structured data. You query it, it returns exactly what was stored. No surprises.

An LLM was trained on patterns in text. It learned statistical associations between words, concepts, and ideas across a massive corpus. When it "answers" a factual question, it generates text that statistically resembles correct answers for that type of question — based on what it saw during training.

This has important implications:

- **It can be confidently wrong.** The model generates plausible text, not verified facts.
- **It can be outdated.** Training data has a cutoff. The model does not know about events after that date.
- **It cannot verify its own answers.** It has no access to ground truth to check against.

This is why you need RAG for facts about your business domain. The model cannot know what it was never trained on — and even for things it was trained on, verification is your responsibility.

## Why does it sometimes give different answers to the same question?

The **temperature** parameter controls how much randomness is injected into the token selection process. At temperature 0, the model always picks the highest-probability next token — deterministic, consistent, sometimes repetitive. At higher temperatures, lower-probability tokens get a chance, producing more varied and creative output.

Most production use cases want temperature between 0 and 0.5. We cover this in detail in the next post on model parameters.

## What this means for your Spring AI code

These properties of LLMs translate directly into engineering decisions:

| LLM property | Engineering implication |
|---|---|
| Stateless inference | You must manage conversation history explicitly |
| Probabilistic output | Design for variability; do not assert on exact output in tests |
| No verified facts | Use RAG for domain-specific factual accuracy |
| Training data cutoff | Do not rely on model knowledge for recent events |
| Context-only memory | What you send in the prompt is the model's entire world |

Understanding these properties is not academic. Every module in this course builds directly on them. RAG exists because the model does not know your data. Chat memory exists because the model is stateless. Structured output exists because probabilistic generation needs to be constrained into usable shapes.

The next post goes deeper on tokens and context windows — the second concept that directly shapes your code.

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> The more accurate your mental model of how the LLM works, the fewer surprises you will hit in production. Spend time here before moving to code — it pays dividends in every module that follows.</p>
</blockquote>
