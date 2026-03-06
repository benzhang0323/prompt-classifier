# Prompt Classifier — LLM Prompt Security Classifier

Prompt Classifier is a Cloudflare Workers–based AI agent application that evaluates user prompts and determines whether they are safe to send to an LLM. It uses Workers AI (default model: Llama‑3.2‑3b‑instruct), heuristic threat detectors, and a lightweight chat‑style UI.

## Purpose

The project provides a security layer that analyzes text for:

* Prompt injection
* System prompt override attempts
* Malware or exploit code
* Cyber‑attack enablement
* Data exfiltration attempts
* Harmful or illegal requests

---

## System Flow Overview

The diagram below explains where the classifier sits in the lifecycle of a user prompt and how it protects the main LLM.

```
USER PROMPT
     ↓
PROMPT CLASSIFIER (Security Classification Layer)
     • LLM-based classification (Workers AI)
     • Heuristic threat detectors
     • Indicate result (allowed / blocked)
     ↓
IF BLOCKED → Warning returned to user (no downstream access)
IF ALLOWED → Prompt is forwarded to the protected model
     ↓
MAIN LLM (the actual model you want to protect)
     ↓
FINAL RESPONSE → Returned to the user

Prompt Classifier acts as a protective gatekeeper.
It evaluates every prompt before it reaches the main LLM, ensuring unsafe or malicious requests are intercepted early.
```

---

## Project Structure

```
prompt_classifier/
├── public/
│   ├── script.js
│   ├── style.css
│   └── ui.html
│
├── src/
│   ├── index.mjs
│   ├── helpers/
│   │   └── detectors.mjs
│   └── prompts/
│       └── instruction.mjs
│
├── PROMPTS.md
├── README.md
├── package.json
└── wrangler.toml
```

---

## How It Works

1. User enters a prompt in the UI.
2. Frontend sends the prompt to `/analyze`.
3. Worker calls Workers AI with a strict JSON schema.
4. Output is sanitized and validated.
5. If parsing fails, fallback heuristics classify the prompt.
6. The result is displayed in the UI.
7. The last 100 prompts are stored in ephemeral memory.

---

## Prerequisites

* Cloudflare account
* Wrangler CLI installed
* Workers AI enabled on Cloudflare

---

## Running Locally

Install dependencies:

```sh
npm install -g wrangler
```

### Logging In

Authenticate Wrangler with your Cloudflare account:

```sh
wrangler login
```

### Start Development Server

Workers AI models run only on Cloudflare's edge, so you must use `--remote`:

```sh
wrangler dev --remote
```

You can now open the app locally at:

```
http://localhost:8787
```

---

## Deploying to Cloudflare

Once everything works locally, deploy globally:

```sh
wrangler deploy
```

This publishes the Worker, static UI, and all logic to Cloudflare’s global network.

---

## Model Configuration

The Worker uses a Workers AI model ID such as:

```
MODEL_ID = "@cf/meta/llama-3.2-3b-instruct"
```

You may customize this in:

```
wrangler.toml
```

Supported models can be found in Cloudflare’s documentation.

---

## Cloudflare Account Configuration

Before using this project, replace any account‑specific values (such as `account_id`) in `wrangler.toml` with your own Cloudflare account details.

Example:

```
account_id = "<your-account-id>"
```

You can find this in the Cloudflare dashboard under:

Workers & Pages → Overview → Account ID.

---

## Security Classification Logic

Each user prompt is classified using three mechanisms.

### 1. LLM‑Based JSON Classification

Workers AI returns structured JSON:

```json
{
  "risk_level": "low",
  "categories": [],
  "allowed": true,
  "sanitized_prompt": "...",
  "reason": "...",
  "recommendations": []
}
```

If the model’s output is valid, it is used for classification.

---

### 2. Heuristic Detectors

Located in:

```
src/helpers/detectors.mjs
```

These detect patterns such as:

* Prompt injection
* Data exfiltration
* Malware code
* Credential harvesting
* Cyber‑attack enablement
* Hidden or encoded payloads
* System prompt extraction attempts

Heuristics override the model whenever the LLM fails to produce valid JSON, ensuring the classifier always returns a consistent result.

---

### 3. Fallback System

If the model returns invalid JSON (a common issue with LLMs), a fallback system activates:

* Parse error → heuristics automatically classify
* Always returns valid JSON to the UI
* Prevents UI crashes or misclassification

---

## Memory & State

The system stores the last 100 classifications in memory:

* Temporary storage only
* Reset when the worker restarts
* No long‑term prompt retention

---

## Lightweight Improvements

This project includes a few small reliability improvements that make the classifier behave more consistently in practice.

### Few‑Shot Prompting

The classifier’s system instructions and few‑shot examples are stored in:

```
src/prompts/instruction.mjs
```

This file includes:

* Clear classification rules
* JSON‑only output constraints
* Defined threat categories
* Safety guidelines
* Multiple few‑shot examples

These examples help the model:

* Follow the JSON schema
* Remain consistent across prompts
* Reduce formatting failures
* Distinguish harmless prompts from risky ones

---

### JSON Validation

A lightweight schema check ensures the model returns required structured fields such as `risk_level` and `allowed`.

If anything looks incorrect, the system falls back to heuristics.

---

### Heuristic Pattern Checks

Rule‑based checks detect obvious unsafe patterns such as:

* injection strings
* encoded payloads
* jailbreak attempts

These provide an additional safety layer when the model becomes uncertain.

---

### Fail‑Safe Fallback Logic

If the LLM output cannot be parsed at all:

* heuristics classify the prompt
* a clean JSON response is generated
* the UI remains stable

---

## PROMPTS.md

This file contains:

* All system prompts used
* All meta prompts used during development

---

## Limitations

* Workers AI requires remote execution (no local inference)
* Daily free usage quotas apply
* Classification quality depends on model reasoning and heuristic rules
* Not intended to replace production‑grade AI security infrastructure