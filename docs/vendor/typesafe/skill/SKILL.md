---
name: TypeSafe
description: Use TypeSafe when building AI-powered software that needs
  structured decisions over unstructured data. Reach for this skill when you
  need to classify content, score inputs on a rubric, answer yes/no questions,
  route requests, or compose multiple AI judgments into a workflow. TypeSafe is
  for embedding AI primitives into code-controlled systems, not for building
  agents.
metadata:
  mintlify-proj: typesafe
  version: "1.0"
---

# TypeSafe Skill

## Product summary

TypeSafe is a System One model API that makes fast, structured decisions your code can use directly. The flagship model is Jev, accessed via `POST https://api.typesafe.ai/v1/systemone`. You send a `state` (text, JSON object, or array) and typed `questions` (Choice, Score, or Noul primitives), and get back constrained answers with probabilities and confidence. Use the Python SDK (`typesafe-sdk`), JavaScript SDK (`@typesafe-ai/sdk`), or HTTP API directly. Set `TYPESAFE_API_KEY` in your environment. Jev costs $0.042 per million input tokens; output tokens are free. See [https://docs.typesafe.ai](https://docs.typesafe.ai) for full documentation.

## When to use

Use TypeSafe when:
- You need to classify or route content (which team handles this ticket, what category is this product)
- You need to score something on a spectrum (customer frustration, bug severity, skill level)
- You need a yes/no judgment with probability (does this contain PII, is this urgent, does this request a refund)
- You're building AI-powered software where code owns the workflow and AI handles narrow, structured decisions
- You need to ask many independent questions about the same input in parallel
- You need calibrated probabilities and confidence to decide when to act, escalate, or ask for review
- You want to avoid parsing generated text and work with typed, constrained outputs instead

Do not use TypeSafe for: generating text, writing code, reasoning through multi-step problems, or building agents that choose their own next action.

## Quick reference

### Question types

| Type | Use for | Returns |
|------|---------|---------|
| **Choice** | Pick one option from a fixed list | `choice`, `probabilities`, `confidence` |
| **Score** | Rate on an ordered spectrum (0–10 levels) | `score`, `legend`, `probabilities`, `confidence` |
| **Noul** | Yes/no question (probability) | `noul` (0–1, no separate confidence) |

### SDK initialization

**Python:**
```python
from typesafe_sdk import TypeSafeClient, Choice, Score, Noul

client = TypeSafeClient(model="jev-latest")  # Reads TYPESAFE_API_KEY
response = client.system_one(state="...", questions={...})
```

**JavaScript:**
```javascript
import { TypeSafeClient, choice, score, noul } from "@typesafe-ai/sdk";

const client = new TypeSafeClient({ defaultModel: "jev-latest" });
const response = await client.systemOne({ state: "...", questions: {...} });
```

### Environment variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `TYPESAFE_API_KEY` | API key (required) | — |
| `TYPESAFE_DEFAULT_MODEL` | Default model | `jev-latest` |
| `TYPESAFE_BASE_URL` | API endpoint | `https://api.typesafe.ai` |
| `TYPESAFE_LOG_LEVEL` | SDK logging level | unset |

### State formats

```python
# Simple string
state = "My card was charged twice."

# Structured object (preferred)
state = {
    "ticket": {"message": "...", "sender": "..."},
    "order": {"id": "A-104", "charges": [...]},
    "policy": "Duplicate charges are eligible for refund."
}

# Array of messages
state = ["Hi", "My card was charged twice.", "Please help ASAP."]
```

### Model aliases

| Alias | Points to | Use |
|-------|-----------|-----|
| `jev-latest` | `jev-1.13.0` | Stable, recommended default |
| `jev-preview` | `jev-1.14.0` | Latest release (may be unstable) |

## Decision guidance

### When to use Choice vs Score vs Noul

| Scenario | Type | Why |
|----------|------|-----|
| "Which team handles this?" (billing, technical, sales) | Choice | Fixed set of options, no order |
| "How frustrated is the customer?" (calm, frustrated, angry) | Score | Ordered spectrum with levels |
| "Does this request a refund?" | Noul | Binary judgment, probability is the answer |
| "Is this candidate strong in Python?" | Score | Needs clear definition of "strong" (levels) |
| "Does the resume mention Python?" | Noul | Clear yes/no condition |

### When to ask one request vs multiple requests

| Scenario | Approach | Why |
|----------|----------|-----|
| Questions about the same state, no dependencies | One request, many questions | Parallel evaluation, cheaper, faster |
| Second question depends on first answer | Two requests | Need first answer to fetch data or pick options |
| Speculative questions (some may not be needed) | One request, ask all | Cheap to ask; let code ignore unused answers |

### When to use confidence thresholds

| Confidence range | Action |
|------------------|--------|
| < 0.5 | Route to human; model is genuinely uncertain |
| 0.5–0.8 | Proceed with caution; ask user to confirm or flag for review |
| > 0.8 | Act automatically; model has clear read |

Adjust thresholds per action based on risk. High-stakes actions (approve transfer) need higher confidence than low-stakes ones (show balance).

## Workflow

### Typical task: classify and route a support ticket

1. **Prepare the state.** Gather only the context needed: the ticket message, relevant customer data, and policies. Use a structured object with named fields.

2. **Define atomic questions.** Break the decision into narrow, independent questions. Instead of "should we approve this refund?", ask: "Does the customer request a refund?", "Does the policy support it?", "Is the customer verified?"

3. **Build the questions map.** Use Choice for routing (which team), Score for severity/frustration, Noul for yes/no checks. Include speculative questions your code might not need.

4. **Call system_one.** Send state and questions together. All questions run in parallel against the same state.

5. **Inspect answers and confidence.** Check each answer's `choice`, `score`, or `noul` value. For Choice and Score, check `confidence` to decide whether to act or escalate.

6. **Compose in code.** Combine answers with deterministic logic. Route based on the primary answer and confidence. Use probabilities as features if training a downstream model.

7. **Escalate on low confidence.** If confidence is below your threshold, route to a human or a more expensive reasoning model instead of acting.

### Example: ticket triage

```python
from typesafe_sdk import Choice, Noul, Score, TypeSafeClient

state = {
    "message": "Our API is down. We can't process orders.",
    "customer_plan": "enterprise",
    "open_orders": 5,
}

questions = {
    "department": Choice(
        instructions="Which team should handle this?",
        criteria={
            "billing": "Charges, refunds, subscriptions",
            "technical": "Bugs, outages, integrations",
            "sales": "Pricing, upgrades, accounts",
        },
    ),
    "urgency": Score(
        instructions="How urgent is this?",
        criteria=["Low", "Medium", "High"],
    ),
    "is_outage": Noul(
        instructions="Does the message indicate a service outage?",
    ),
}

with TypeSafeClient() as client:
    response = client.system_one(state=state, questions=questions)

# Inspect answers
dept = response.answers["department"]
urgency = response.answers["urgency"]
is_outage = response.answers["is_outage"]

# Route with confidence gates
if dept.confidence < 0.7:
    route_to_human(state)
elif dept.choice == "technical" and urgency.score > 1.5:
    escalate_to_oncall(state)
else:
    route_to_queue(dept.choice, state)
```

## Common gotchas

- **Asking one broad question instead of decomposing.** "Rate this startup pitch" hides market size, feasibility, and differentiation. Ask three separate Score questions and weight them in code. Decomposition exposes each judgment so you can inspect and tune it.

- **Sending irrelevant context.** Include only the data needed for the current questions. Extra context creates noise and can distract the model. Filter before sending.

- **Ignoring confidence.** Confidence tells you when the model is uncertain. Always check it before acting on high-stakes decisions. Set thresholds per action based on risk.

- **Asking dependent questions in one request.** If the second question depends on the first answer, make two requests. Questions in one request are independent; one answer doesn't become context for another.

- **Using Noul for spectrum questions.** "Is this candidate strong in Python?" needs a Score with defined levels (no experience, some familiarity, daily use, deep expertise). A Noul value of 0.5 means the model is unsure, not that the candidate has medium skill.

- **Forgetting to set TYPESAFE_API_KEY.** The SDK reads it from the environment. If it's missing, you'll get an error during client creation, not during the first request.

- **Exceeding context limits.** Jev has a 64k per-request context and 32k per-question context. If your state + questions exceed these, either split into multiple requests or enable long context with the `TypeSafe-Danger-Zone-Long-Context: true` header (slower, less accurate).

- **Sending non-English text.** English is the primary training language. Other languages are accepted but have lower accuracy. Test on your own content before relying on non-English workloads.

- **Treating probabilities as confidence.** For Choice and Score, `confidence` is a derived statistic from the probability distribution. For Noul, the probability itself is the answer; there's no separate confidence. Use `confidence` to threshold; use `probabilities` to inspect the full distribution.

- **Not using structured state.** A plain string works for simple cases, but structured JSON objects with named fields make it clear which parts of the state inform each question. Use backticked paths in instructions to point at nested values.

## Verification checklist

Before submitting work with TypeSafe:

- [ ] State is structured (object or array) with named fields, not a single long string
- [ ] Questions are atomic and narrow (one judgment per question, not broad reasoning)
- [ ] Instructions are explicit and unambiguous; criteria are complete and contrastive
- [ ] All questions about the same state are in one request (unless there's a real dependency)
- [ ] Confidence is checked before acting on high-stakes decisions
- [ ] Low-confidence answers are routed to human review or escalation
- [ ] Probabilities are inspected when needed (e.g., for composite scoring)
- [ ] State size is under context limits (64k per-request, 32k per-question)
- [ ] API key is set in environment or passed explicitly
- [ ] Error handling catches `TypeSafeAPIError` and retries on 429/529
- [ ] Answers are composed in code, not passed directly to users

## Resources

- **Full documentation:** [https://docs.typesafe.ai/llms.txt](https://docs.typesafe.ai/llms.txt) — comprehensive page-by-page navigation for agents
- **Quick start:** [https://docs.typesafe.ai/introduction/quickstart](https://docs.typesafe.ai/introduction/quickstart) — 5-minute walkthrough with code examples
- **How to build with TypeSafe:** [https://docs.typesafe.ai/concepts/how-to-build-with-system-one](https://docs.typesafe.ai/concepts/how-to-build-with-system-one) — design patterns for AI-powered software
- **Primitives reference:** [https://docs.typesafe.ai/primitives](https://docs.typesafe.ai/primitives) — detailed guide to Choice, Score, and Noul
- **Confidence guide:** [https://docs.typesafe.ai/confidence](https://docs.typesafe.ai/confidence) — how to use confidence for routing and escalation
- **Patterns:** [https://docs.typesafe.ai/patterns](https://docs.typesafe.ai/patterns) — Speculative Fan-Out, Confidence-Gated Routing, Composite Scoring, Intent Routing

---

> For additional documentation and navigation, see: https://docs.typesafe.ai/llms.txt