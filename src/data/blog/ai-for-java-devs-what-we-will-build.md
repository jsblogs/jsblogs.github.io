---
title: The AI project we will build throughout this course
description: Before diving into code, meet Dev — a Java developer who just got assigned an AI task — and see the complete architecture of what we build across all 8 modules of this course.
pubDatetime: "2026-03-02T18:50:00+05:30"
tags:
  - java
  - spring-ai
---

Every good course has a project. Not a collection of disconnected examples, but one real thing that grows module by module until it is something you would actually be proud to ship.

This post introduces that project — what it does, how it is built, and what you will know how to do by the time it is done. If you have not read the [previous post](/blog/ai-for-java-devs-why-now) about why Java developers should care about AI engineering right now, start there first.

## Table of contents

## Meet Dev

Dev is a mid-level Java developer at a B2C e-commerce startup that sells tech gadgets online. Dev has three years of Spring Boot experience, ships clean APIs, writes decent tests, and knows the production systems well.

One Monday morning, the product manager walks over.

*"Hey Dev, leadership wants us to add AI to the platform. Something like a smart support assistant — customers ask questions about products, policies, returns, and their orders. Can you build it?"*

Dev nods. Smiles. Opens a new browser tab. Types: **"how to add AI to Java application".**

That is where this course begins. By the end, Dev — and you — will have built a real AI-powered support assistant and will know how every part of it works.

## What we are building

The project is an **AI-powered customer support assistant** for the e-commerce platform. Customers interact with it through a chat interface.

Here is what it can do by the end of Module 7:

1. **Answer product questions from real data** — not hallucinated answers. The assistant reads from the company's actual product catalog, FAQ documents, and policy pages.
2. **Remember the conversation** — when a customer says "tell me more about the second option you mentioned," the assistant knows what was said two turns ago.
3. **Check order status in real time** — by calling the platform's own order API as a tool.
4. **Handle out-of-scope questions gracefully** — it stays on topic and tells the user when it cannot help, rather than making things up.
5. **Run safely in production** — with observability, cost limits, error handling, and input/output guardrails.

<blockquote class="callout callout-important">
  <p><strong>Important:</strong> This is a real engineering challenge, not a demo. Each module introduces a concept by applying it to this project. By the time you finish, you have seen every piece work together, not just in isolation.</p>
</blockquote>

## The final architecture

At the end of Module 7, the assistant has this structure:

```
Customer Request
       │
       ▼
┌─────────────────────────────────┐
│  Spring Boot REST API (Chat)    │
│  POST /api/support/chat         │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│  ChatClient (Spring AI)         │
│  • System prompt                │
│  • Chat memory (last 10 turns)  │
│  • RAG advisor                  │
│  • Tool bindings                │
└────┬─────────────┬──────────────┘
     │             │
     ▼             ▼
┌─────────┐  ┌────────────────────┐
│  LLM    │  │  VectorStore       │
│  (GPT   │  │  (PostgreSQL +     │
│  -4o)   │  │   pgvector)        │
└─────────┘  │  Product catalog   │
             │  FAQ documents     │
             │  Store policies    │
             └────────────────────┘
                 │
                 ▼ (when order status needed)
        ┌────────────────────┐
        │  Order Status Tool │
        │  (calls internal   │
        │   order API)       │
        └────────────────────┘
```

Each box is introduced in a module. None of it requires understanding ML internals — only Spring, HTTP, and SQL, which you already know.

## What each module builds

### Module 0 — The New World *(you are here)*
Set expectations and vocabulary. Understand the AI engineering landscape and what role Java developers play. This post.

### Module 1 — Concepts
Build the mental models: how LLMs work, what tokens and context windows mean for your code, what parameters like temperature actually do, and how to write effective prompts. No code yet — these concepts directly affect every architectural decision that follows.

### Module 2 — First Contact
The first code. Add Spring AI to the Spring Boot project, wire up a `ChatClient`, make the first real OpenAI API call, and build a simple `/api/support/chat` endpoint. By the end Dev has a working (but very dumb) chatbot.

### Module 3 — Data and Embeddings
The chatbot answers questions from its training data — it knows nothing about this company's products. This module introduces embeddings and vector databases. We embed the product catalog and FAQ documents into PostgreSQL + pgvector so the assistant can actually search company data.

### Module 4 — RAG
With the vector store ready, we connect it to the LLM using RAG. Now when a customer asks "do you have waterproof Bluetooth speakers under $100?", the assistant retrieves relevant products from the catalog and uses them to generate a grounded, accurate answer.

### Module 5 — Memory
A customer says "tell me more about the second one." The current assistant has no memory of what "the second one" was. This module adds conversation memory — the last N turns are sent with every request so the conversation feels natural.

### Module 6 — Agents and Tools
A customer asks "where is my order #12345?" The RAG pipeline cannot answer that — it's live data. This module introduces tool/function calling. The LLM can now trigger a Java method that calls the order API and returns real-time status.

### Module 7 — Production
The assistant works. Now make it production-ready: add Micrometer tracing for every LLM call, set token budgets, write tests for AI behavior, add guardrails to keep the assistant on topic, and handle rate limit errors gracefully.

### Module 8 — Advanced Topics
Local models with Ollama, multimodal inputs (image uploads), comparing Spring AI vs LangChain4j, and where to go next.

<blockquote class="callout callout-tip">
  <p><strong>Tip:</strong> You do not need to follow the modules in strict order after Module 1. If RAG is what your team needs right now, jump to Module 3 after finishing the concepts. The modules are self-contained enough to read independently once you have the foundations.</p>
</blockquote>

## The starter project

Each module's code builds on the previous one. The starter repository contains:

- A pre-built Spring Boot 3.x project with the product catalog data (JSON), FAQ markdown files, and policy PDFs already in `src/main/resources/data/`
- A simple order status REST API (stubbed, returns realistic fake data)
- Docker Compose for PostgreSQL + pgvector
- Empty `ChatService.java` where each module's implementation goes

Every module post shows you exactly which files change and what the new code looks like. You can follow along step by step or read ahead to understand the full picture first.

## What you need to set up

Before Module 2's code starts, make sure you have:

- Java 21+ installed (`java --version`)
- Maven 3.9+ (`mvn --version`)
- Docker Desktop (for PostgreSQL + pgvector in later modules)
- One of the following:
  - An OpenAI API key — create one at [platform.openai.com](https://platform.openai.com) (costs a few cents for the whole course)
  - Ollama installed locally — free and private, instructions in Module 2

<blockquote class="callout callout-caution">
  <p><strong>Caution:</strong> OpenAI API usage costs money, but the cost for following this course is very small — typically under $2 total. If you prefer zero cost and full privacy, use Ollama. Module 2 covers both setups side by side.</p>
</blockquote>

## Ready to start

The next stop is Module 1 — concepts. It might be tempting to skip straight to code, but spending 20 minutes on tokens, context windows, and temperature will save you hours of debugging later. The concepts are short and practical.

Start with: [How LLMs work — a developer's mental model (no PhD required)](/blog/ai-how-llms-work-for-developers)

Or explore the full course outline on the [AI Engineering for Java Developers course page](/courses/ai-for-java-developers).

<blockquote class="callout callout-note">
  <p><strong>Note:</strong> The project in this course is intentionally simple — one domain, one user type, one AI assistant. That simplicity is a feature. Real complexity comes from product decisions, not from AI architecture. Learn the patterns on a small project; apply them to a complex one at work.</p>
</blockquote>
