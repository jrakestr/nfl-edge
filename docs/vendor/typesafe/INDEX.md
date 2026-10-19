# TypeSafe (Jev) docs — local mirror

Documentation only. No Jev code or API calls exist in this repo from these files.

- Source: https://docs.typesafe.ai (Mintlify). Page list: https://docs.typesafe.ai/llms.txt (128 pages).
- Fetched: 2026-10-19 via Firecrawl (`firecrawl_scrape` of `llms-full.txt`, split per page; `llms.txt` and `firecrawl_map` cross-checked, no page missing).
- Each page is saved at the URL path (`/primitives/score` -> `primitives/score.md`). Content is vendor Mintlify markdown/MDX, verbatim apart from a source comment header.
- Not mirrored: `https://daggerverse.docs.typesafe.ai/*` (unrelated uv Dagger module docs), `sitemap.xml`, `robots.txt`, `/legal` bodies beyond the stub in `legal.md`.
- `sdk/python/usage` redirects to `sdk/python/usage/basic` (saved as `sdk/python/usage/basic.md`).

## Extras (not in llms.txt)

| File | URL | What |
|---|---|---|
| `skill/SKILL.md` | https://docs.typesafe.ai/.well-known/agent-skills/type-safe/skill.md | Vendor agent skill, verbatim (sha256 `305be7ad...708d61` matches the published digest) |
| `skill/github-typesafe-ai-SKILL.md` | https://raw.githubusercontent.com/typesafe-ai/skills/main/skills/typesafe-ai/SKILL.md | Canonical skill installed by the commands below (GitHub `typesafe-ai/skills`, MIT), verbatim |
| `skill/github-README.md` | https://raw.githubusercontent.com/typesafe-ai/skills/main/README.md | Skills repo README, verbatim |
| `skill/index.json` | https://docs.typesafe.ai/.well-known/agent-skills/index.json | Agent-skills discovery index |
| `mcp-server-card.json` | https://docs.typesafe.ai/mcp | Docs-site MCP server card (search + read-only docs tools; not the Jev API) |

## Agent skill install (not run; modifies global dirs, ask-first)

Per `agent-skill.md`. Claude Code: `claude plugin marketplace add typesafe-ai/skills` then `claude plugin install typesafe@typesafe-ai`. Other agents: `npx skills add typesafe-ai/skills --skill typesafe-ai` (project-local by default; `-g` = global). Skill contents are saved under `skill/`; install not run.

## Pages (128)

| File | URL | Summary |
|---|---|---|
| `agent-skill.md` | https://docs.typesafe.ai/agent-skill | Drop-in skill for Claude Code, Codex, and other agent environments. |
| `api.md` | https://docs.typesafe.ai/api | Full HTTP API reference for the TypeSafe evaluation endpoint. |
| `concepts/how-to-build-with-system-one.md` | https://docs.typesafe.ai/concepts/how-to-build-with-system-one | Design AI-powered software by keeping code in control and giving System One narrow, structured decisions. |
| `concepts/state.md` | https://docs.typesafe.ai/concepts/state | What state is, how to structure it, and how to give a System One model the context it needs. |
| `concepts/system-one.md` | https://docs.typesafe.ai/concepts/system-one | System One models make fast, structured decisions for software. Jev is TypeSafe's flagship model and the first System One model. |
| `concepts/use-case-map.md` | https://docs.typesafe.ai/concepts/use-case-map | Explore TypeSafe use cases by industry and turn promising ideas into software workflows. |
| `confidence.md` | https://docs.typesafe.ai/confidence | How TypeSafe reports certainty, how it differs from probability, and how to use it to control system behavior. |
| `cookbooks.md` | https://docs.typesafe.ai/cookbooks | End-to-end recipes that show TypeSafe in real problems, from a few questions to full pipelines. |
| `cookbooks/autoformat.md` | https://docs.typesafe.ai/cookbooks/autoformat | Reconstructs Markdown from plain text that lost its formatting in two requests: one stitches hard-wrapped lines back together, one classifies every block (heading, list, code, callout). |
| `cookbooks/autoresearch_feature_discovery.md` | https://docs.typesafe.ai/cookbooks/autoresearch_feature_discovery | Runs an autoresearch loop that proposes TypeSafe questions, converts free text into numeric features, and uses model errors to improve a supervised CatBoost regressor. |
| `cookbooks/basic_memory.md` | https://docs.typesafe.ai/cookbooks/basic_memory | Let Jev decide which requests and answers are worth remembering, then wrap the Jev call in a small function that adds memories to later calls. |
| `cookbooks/citation_check.md` | https://docs.typesafe.ai/cookbooks/citation_check | Catch wrong or hallucinated citations by checking against the source document. One Choice question decides whether the quote's context supports the claim. |
| `cookbooks/classification_using_confidence.md` | https://docs.typesafe.ai/cookbooks/classification_using_confidence | Classify SEC annual reports into 75 industry groups with one Choice each, then read the answer's own confidence to decide whether to report that group or the broader division above it. |
| `cookbooks/classifying_rag_passages.md` | https://docs.typesafe.ai/cookbooks/classifying_rag_passages | Score each retrieved passage with one TypeSafe request, then decide in code which ones reach the answering model. |
| `cookbooks/consistency_choice_cookbook.md` | https://docs.typesafe.ai/cookbooks/consistency_choice_cookbook | Add an uncertain outcome to moderation decisions and compare label agreement with the share of automatic actions. |
| `cookbooks/consistency_noul_cookbook.md` | https://docs.typesafe.ai/cookbooks/consistency_noul_cookbook | Route uncertain probabilities to human review while keeping the underlying noul values visible. |
| `cookbooks/date_extraction_cookbook.md` | https://docs.typesafe.ai/cookbooks/date_extraction_cookbook | Extracts absolute and relative dates by asking TypeSafe for the parts named in a document, then resolving and validating them in code with confidence-based review. |
| `cookbooks/entity_alignment.md` | https://docs.typesafe.ai/cookbooks/entity_alignment | Decides which of 450 candidate pairs from two beer catalogues describe the same product using one Score question plus three companion Nouls that surface which fields disagree. |
| `cookbooks/function_calling.md` | https://docs.typesafe.ai/cookbooks/function_calling | Turns natural-language trading requests into calls to ordinary typed functions by mapping function names and closed-set arguments to confidence-aware TypeSafe questions. |
| `cookbooks/hierarchical_classification.md` | https://docs.typesafe.ai/cookbooks/hierarchical_classification | Classifies documents through deep patent, retail product, biomedical, and source-code hierarchies using parallel beam search over TypeSafe Choice probabilities. |
| `cookbooks/llm_guardrails.md` | https://docs.typesafe.ai/cookbooks/llm_guardrails | Screen every message going into and out of an LLM app with one TypeSafe request, thresholding hazard probabilities and severity to pass, review, block, or route. |
| `cookbooks/parallel_questions.md` | https://docs.typesafe.ai/cookbooks/parallel_questions | Runs a 13-question regulatory briefing over the GDPR Wikipedia article, showing that batching every question into one TypeSafe call is 12.2x cheaper and 10.0x faster with no change in answers. |
| `cookbooks/pre_parsed_value_extraction_cookbook.md` | https://docs.typesafe.ai/cookbooks/pre_parsed_value_extraction_cookbook | Uses regexes to find candidate emails, phone numbers, and amounts, then has TypeSafe select the requested span so code can normalize a verbatim value. |
| `cookbooks/rerank_typesafe.md` | https://docs.typesafe.ai/cookbooks/rerank_typesafe | Builds 30-passage BM25 shortlists for 40 CLERC legal queries, then uses one TypeSafe question per query-candidate pair to raise top-1 accuracy from 5% to 18% and top-10 accuracy from 38% to 62%. |
| `cookbooks/sde_cascade.md` | https://docs.typesafe.ai/cookbooks/sde_cascade | Uses a 2-stage structured-data-extraction cascade (mini → verify → reasoning) to get most of the quality of a big reasoning model at a fraction of the cost. |
| `cookbooks/semantic_find.md` | https://docs.typesafe.ai/cookbooks/semantic_find | Build semantic search for GitHub's Terms of Service. In one request, score 218 line ids against a plain-language query with a Choice question, and use a Noul question to check whether the document con |
| `cookbooks/skill_suggestion.md` | https://docs.typesafe.ai/cookbooks/skill_suggestion | Picks at most one skill for an agent turn out of the 182 in Nous Research's Hermes catalog, using two TypeSafe requests to rank and re-check the top candidates. |
| `cookbooks/twitch_chat_filter.md` | https://docs.typesafe.ai/cookbooks/twitch_chat_filter | Hide insults, spam, and unasked-for gameplay tips in Twitch chat, blur spoilers, and highlight questions. Each message gets one TypeSafe request containing multiple questions. Up to eight messages are |
| `demos.md` | https://docs.typesafe.ai/demos | Interactive examples showing what's possible with TypeSafe. |
| `demos/smart-home.md` | https://docs.typesafe.ai/demos/smart-home | Demo code: a smart home assistant that uses TypeSafe to evaluate user requests. |
| `images.md` | https://docs.typesafe.ai/images | Send images in a System One request: in the state, inside a question's instructions, and as the criteria a question is judged against. |
| `introduction.md` | https://docs.typesafe.ai/introduction | Jev is TypeSafe's flagship model and the first System One model. Send state and typed questions; get structured answers your code can use directly. |
| `introduction/coding-agents.md` | https://docs.typesafe.ai/introduction/coding-agents | What Jev is (and isn't) when you're using a coding agent. |
| `introduction/machine-learning-primer.md` | https://docs.typesafe.ai/introduction/machine-learning-primer | Why TypeSafe trains decision models with calibrated probabilities instead of optimizing for generated text. |
| `introduction/quickstart.md` | https://docs.typesafe.ai/introduction/quickstart | Get up and running with Jev in 5 minutes. |
| `legal.md` | https://docs.typesafe.ai/legal | Legal documents and policies for TypeSafe. |
| `model-jaggedness/jev-1.13.md` | https://docs.typesafe.ai/model-jaggedness/jev-1.13 | Jev isn't perfect. Here are some jagged edges we are aware of with jev-1.13. Many of these will be fixed in later versions. |
| `models.md` | https://docs.typesafe.ai/models | Jev is TypeSafe's flagship model and the first [System One model](/concepts/system-one). Every model on this page is served by the same endpoint, `POST /v1/systemone`. The request's `model` field sele |
| `patterns.md` | https://docs.typesafe.ai/patterns | Architectural patterns for building systems with TypeSafe. |
| `patterns/composite-scoring.md` | https://docs.typesafe.ai/patterns/composite-scoring | Break a complex judgment into atomic scores, combine with weights you control in code. |
| `patterns/confidence-routing.md` | https://docs.typesafe.ai/patterns/confidence-routing | Use confidence as a second axis. The answer tells you what; confidence tells you whether to act. |
| `patterns/fan-out.md` | https://docs.typesafe.ai/patterns/fan-out | Send many questions in a single call, including speculative ones, and let your code decide what's relevant. |
| `patterns/intent-routing.md` | https://docs.typesafe.ai/patterns/intent-routing | Classify incoming requests and route each to the optimal handler: deterministic logic, a specialist LLM, or a human. |
| `primitives.md` | https://docs.typesafe.ai/primitives | The TypeSafe question types, the typed answers they return, how to choose between them, and how to ask several at once. |
| `primitives/advanced.md` | https://docs.typesafe.ai/primitives/advanced | Instructions, Choice options, Score levels, and Noul criteria all accept JSON structure. |
| `primitives/box.md` | https://docs.typesafe.ai/primitives/box | A Box is a System One question type for finding where something is in an image. The answer is the four edges of a box around it, as fractions of the image's width and height. |
| `primitives/choice.md` | https://docs.typesafe.ai/primitives/choice | A Choice is a System One question type for selecting one option from a defined set. The answer includes the selected option, a probability for each option, and confidence. |
| `primitives/noul.md` | https://docs.typesafe.ai/primitives/noul | A Noul question asks the TypeSafe model to evaluate a yes/no question and return the probability that the answer is yes. |
| `primitives/score.md` | https://docs.typesafe.ai/primitives/score | A Score is a System One question type for rating content against ordered, descriptive levels. The answer includes a score, a probability for each level, and confidence. |
| `sdk.md` | https://docs.typesafe.ai/sdk | Install a TypeSafe client SDK and use typed questions and answers in your application. |
| `sdk/javascript.md` | https://docs.typesafe.ai/sdk/javascript | JavaScript and TypeScript SDK for [TypeSafe AI](https://typesafe.ai). |
| `sdk/javascript/api.md` | https://docs.typesafe.ai/sdk/javascript/api | * [APIConnectionError](/sdk/javascript/api/classes/APIConnectionError) |
| `sdk/javascript/api/classes/APIConnectionError.md` | https://docs.typesafe.ai/sdk/javascript/api/classes/APIConnectionError | The request or response-body delivery failed (DNS, TLS, connection closed, etc.). |
| `sdk/javascript/api/classes/APIError.md` | https://docs.typesafe.ai/sdk/javascript/api/classes/APIError | An unsuccessful HTTP response from the API. |
| `sdk/javascript/api/classes/APIPromise.md` | https://docs.typesafe.ai/sdk/javascript/api/classes/APIPromise | A promise for the parsed result with access to the HTTP response. |
| `sdk/javascript/api/classes/APITimeoutError.md` | https://docs.typesafe.ai/sdk/javascript/api/classes/APITimeoutError | The full response did not arrive within the timeout. A kind of `APIConnectionError`. |
| `sdk/javascript/api/classes/APIUserAbortError.md` | https://docs.typesafe.ai/sdk/javascript/api/classes/APIUserAbortError | The caller cancelled the request through an `AbortSignal`. |
| `sdk/javascript/api/classes/AuthenticationError.md` | https://docs.typesafe.ai/sdk/javascript/api/classes/AuthenticationError | HTTP 401: authentication failed. |
| `sdk/javascript/api/classes/BadRequestError.md` | https://docs.typesafe.ai/sdk/javascript/api/classes/BadRequestError | HTTP 400: the request is invalid. |
| `sdk/javascript/api/classes/Image.md` | https://docs.typesafe.ai/sdk/javascript/api/classes/Image | A PNG or JPEG image asset, created by `image` or `Image.fromBase64`. |
| `sdk/javascript/api/classes/InternalServerError.md` | https://docs.typesafe.ai/sdk/javascript/api/classes/InternalServerError | HTTP 5xx: the server failed to handle the request. |
| `sdk/javascript/api/classes/NotFoundError.md` | https://docs.typesafe.ai/sdk/javascript/api/classes/NotFoundError | HTTP 404: the resource was not found. |
| `sdk/javascript/api/classes/PermissionDeniedError.md` | https://docs.typesafe.ai/sdk/javascript/api/classes/PermissionDeniedError | HTTP 403: access is denied. |
| `sdk/javascript/api/classes/RateLimitError.md` | https://docs.typesafe.ai/sdk/javascript/api/classes/RateLimitError | HTTP 429: the rate limit was exceeded. |
| `sdk/javascript/api/classes/TypeSafeClient.md` | https://docs.typesafe.ai/sdk/javascript/api/classes/TypeSafeClient | Client for the TypeSafe AI API. |
| `sdk/javascript/api/classes/TypeSafeError.md` | https://docs.typesafe.ai/sdk/javascript/api/classes/TypeSafeError | Base class for SDK errors. |
| `sdk/javascript/api/classes/UnprocessableEntityError.md` | https://docs.typesafe.ai/sdk/javascript/api/classes/UnprocessableEntityError | HTTP 422: request validation failed. |
| `sdk/javascript/api/functions/box.md` | https://docs.typesafe.ai/sdk/javascript/api/functions/box | function box(instructions?): BoxQuestion; |
| `sdk/javascript/api/functions/choice.md` | https://docs.typesafe.ai/sdk/javascript/api/functions/choice | function choice<T>(instructions, criteria): ChoiceQuestion<T>; |
| `sdk/javascript/api/functions/image.md` | https://docs.typesafe.ai/sdk/javascript/api/functions/image | function image(data): Image; |
| `sdk/javascript/api/interfaces/BoxCoordinates.md` | https://docs.typesafe.ai/sdk/javascript/api/interfaces/BoxCoordinates | A box's edges as fractions of the image's height (`top`, `bottom`) and width (`left`, `right`). |
| `sdk/javascript/api/interfaces/BoxQuestion.md` | https://docs.typesafe.ai/sdk/javascript/api/interfaces/BoxQuestion | A question that locates what its instructions describe in the request's image. |
| `sdk/javascript/api/interfaces/BoxResponse.md` | https://docs.typesafe.ai/sdk/javascript/api/interfaces/BoxResponse | The answer to a `box` question. |
| `sdk/javascript/api/interfaces/ChoiceQuestion.md` | https://docs.typesafe.ai/sdk/javascript/api/interfaces/ChoiceQuestion | A question that selects between named alternatives. |
| `sdk/javascript/api/interfaces/ChoiceResponse.md` | https://docs.typesafe.ai/sdk/javascript/api/interfaces/ChoiceResponse | A selected label and its probabilities. |
| `sdk/javascript/api/interfaces/Logger.md` | https://docs.typesafe.ai/sdk/javascript/api/interfaces/Logger | Log methods accepting a message and structured values; compatible with `console`. |
| `sdk/javascript/api/interfaces/ModelCard.md` | https://docs.typesafe.ai/sdk/javascript/api/interfaces/ModelCard | Metadata for an available model. |
| `sdk/javascript/api/interfaces/Models.md` | https://docs.typesafe.ai/sdk/javascript/api/interfaces/Models | Access to the Models API resource. |
| `sdk/javascript/api/interfaces/NoulQuestion.md` | https://docs.typesafe.ai/sdk/javascript/api/interfaces/NoulQuestion | A yes/no question with optional descriptions for either outcome. |
| `sdk/javascript/api/interfaces/NoulResponse.md` | https://docs.typesafe.ai/sdk/javascript/api/interfaces/NoulResponse | A yes/no answer. |
| `sdk/javascript/api/interfaces/Questions.md` | https://docs.typesafe.ai/sdk/javascript/api/interfaces/Questions | Questions keyed by the names used to identify their answers. |
| `sdk/javascript/api/interfaces/RequestOptions.md` | https://docs.typesafe.ai/sdk/javascript/api/interfaces/RequestOptions | Per-call options that override client settings. |
| `sdk/javascript/api/interfaces/RetryPolicy.md` | https://docs.typesafe.ai/sdk/javascript/api/interfaces/RetryPolicy | Retry configuration. Partial overrides inherit unset fields from the client or SDK defaults. |
| `sdk/javascript/api/interfaces/ScoreQuestion.md` | https://docs.typesafe.ai/sdk/javascript/api/interfaces/ScoreQuestion | A question that assigns a score using an ordered rubric. |
| `sdk/javascript/api/interfaces/ScoreResponse.md` | https://docs.typesafe.ai/sdk/javascript/api/interfaces/ScoreResponse | An expected score with its rubric and probabilities. |
| `sdk/javascript/api/interfaces/SystemOneRequest.md` | https://docs.typesafe.ai/sdk/javascript/api/interfaces/SystemOneRequest | State and named questions for `systemOne`. |
| `sdk/javascript/api/interfaces/SystemOneResult.md` | https://docs.typesafe.ai/sdk/javascript/api/interfaces/SystemOneResult | Answers keyed by question name, with model and usage metadata. |
| `sdk/javascript/api/interfaces/TextWithAssets.md` | https://docs.typesafe.ai/sdk/javascript/api/interfaces/TextWithAssets | Text from a `withAssets` tagged template, with the assets interpolated into it. |
| `sdk/javascript/api/interfaces/TypeSafeClientConfig.md` | https://docs.typesafe.ai/sdk/javascript/api/interfaces/TypeSafeClientConfig | Client options. Explicit values take precedence over environment variables, then SDK defaults. |
| `sdk/javascript/api/interfaces/Usage.md` | https://docs.typesafe.ai/sdk/javascript/api/interfaces/Usage | Token usage for a request. |
| `sdk/javascript/api/interfaces/WithResponse.md` | https://docs.typesafe.ai/sdk/javascript/api/interfaces/WithResponse | Parsed data with its HTTP response and request ID. |
| `sdk/javascript/api/type-aliases/Asset.md` | https://docs.typesafe.ai/sdk/javascript/api/type-aliases/Asset | type Asset = Image; |
| `sdk/javascript/api/type-aliases/ChoiceCriteria.md` | https://docs.typesafe.ai/sdk/javascript/api/type-aliases/ChoiceCriteria | type ChoiceCriteria = object; |
| `sdk/javascript/api/type-aliases/Compression.md` | https://docs.typesafe.ai/sdk/javascript/api/type-aliases/Compression | type Compression = "zstd" \| false; |
| `sdk/javascript/api/type-aliases/ContentValue.md` | https://docs.typesafe.ai/sdk/javascript/api/type-aliases/ContentValue | type ContentValue = |
| `sdk/javascript/api/type-aliases/Description.md` | https://docs.typesafe.ai/sdk/javascript/api/type-aliases/Description | type Description = EntryType; |
| `sdk/javascript/api/type-aliases/EntryType.md` | https://docs.typesafe.ai/sdk/javascript/api/type-aliases/EntryType | type EntryType = |
| `sdk/javascript/api/type-aliases/EnvVar.md` | https://docs.typesafe.ai/sdk/javascript/api/type-aliases/EnvVar | type EnvVar = typeof ENV[keyof typeof ENV]; |
| `sdk/javascript/api/type-aliases/Fetch.md` | https://docs.typesafe.ai/sdk/javascript/api/type-aliases/Fetch | type Fetch = (input, init?) => Promise<Response>; |
| `sdk/javascript/api/type-aliases/JsonValue.md` | https://docs.typesafe.ai/sdk/javascript/api/type-aliases/JsonValue | type JsonValue = |
| `sdk/javascript/api/type-aliases/LogLevel.md` | https://docs.typesafe.ai/sdk/javascript/api/type-aliases/LogLevel | type LogLevel = "debug" \| "info" \| "warn" \| "error" \| "off"; |
| `sdk/javascript/api/type-aliases/Question.md` | https://docs.typesafe.ai/sdk/javascript/api/type-aliases/Question | type Question = |
| `sdk/javascript/api/type-aliases/ResultFor.md` | https://docs.typesafe.ai/sdk/javascript/api/type-aliases/ResultFor | type ResultFor<T> = T extends NoulQuestion ? NoulResponse : T extends ScoreQuestion<infer S> ? ScoreResponse<S> : T extends ChoiceQuestion<infer E> ? ChoiceResponse<E> : T extends BoxQuestion ? BoxRes |
| `sdk/javascript/api/type-aliases/ScoreCriteria.md` | https://docs.typesafe.ai/sdk/javascript/api/type-aliases/ScoreCriteria | type ScoreCriteria = readonly [EntryType, EntryType, ...EntryType[]]; |
| `sdk/javascript/api/type-aliases/ScoreLegend.md` | https://docs.typesafe.ai/sdk/javascript/api/type-aliases/ScoreLegend | type ScoreLegend<T> = { readonly [score in ScoreOf<T>]: SentContent<T[score]> }; |
| `sdk/javascript/api/type-aliases/ScoreOf.md` | https://docs.typesafe.ai/sdk/javascript/api/type-aliases/ScoreOf | type ScoreOf<T> = number extends T["length"] ? number : Extract<keyof T, `${number}`>; |
| `sdk/javascript/api/type-aliases/SentContent.md` | https://docs.typesafe.ai/sdk/javascript/api/type-aliases/SentContent | type SentContent<T> = T extends Asset \| TextWithAssets ? string : T extends object ? { readonly [key in keyof T]: SentContent<T[key]> } : T; |
| `sdk/javascript/api/variables/ENV.md` | https://docs.typesafe.ai/sdk/javascript/api/variables/ENV | const ENV: object; |
| `sdk/javascript/api/variables/LOG_LEVELS.md` | https://docs.typesafe.ai/sdk/javascript/api/variables/LOG_LEVELS | const LOG_LEVELS: readonly LogLevel[]; |
| `sdk/javascript/api/variables/VERSION.md` | https://docs.typesafe.ai/sdk/javascript/api/variables/VERSION | const VERSION: "0.7.0" = "0.7.0"; |
| `sdk/javascript/api/variables/noul.md` | https://docs.typesafe.ai/sdk/javascript/api/variables/noul | const noul: { |
| `sdk/javascript/api/variables/score.md` | https://docs.typesafe.ai/sdk/javascript/api/variables/score | const score: { |
| `sdk/javascript/api/variables/withAssets.md` | https://docs.typesafe.ai/sdk/javascript/api/variables/withAssets | const withAssets: { |
| `sdk/javascript/changelog.md` | https://docs.typesafe.ai/sdk/javascript/changelog | * require Node.js 22 or newer |
| `sdk/python.md` | https://docs.typesafe.ai/sdk/python | Install the TypeSafe Python SDK and get started with asynchronous or synchronous API calls. |
| `sdk/python/api.md` | https://docs.typesafe.ai/sdk/python/api | Python clients for the TypeSafe AI API |
| `sdk/python/api/clients/async.md` | https://docs.typesafe.ai/sdk/python/api/clients/async | Use AsyncTypeSafeClient to ask questions, list models, and configure asynchronous TypeSafe API requests. |
| `sdk/python/api/clients/sync.md` | https://docs.typesafe.ai/sdk/python/api/clients/sync | Use TypeSafeClient to ask questions, list models, and configure synchronous TypeSafe API requests. |
| `sdk/python/api/constants.md` | https://docs.typesafe.ai/sdk/python/api/constants | Default settings and environment variable names for the TypeSafe Python SDK. |
| `sdk/python/api/exceptions.md` | https://docs.typesafe.ai/sdk/python/api/exceptions | Handle TypeSafe API errors, rate limits, connection failures, and timeouts. |
| `sdk/python/api/retries.md` | https://docs.typesafe.ai/sdk/python/api/retries | Configure retries with RetryPolicy — attempt count, retryable statuses, backoff, and retry headers handling. |
| `sdk/python/api/types/assets.md` | https://docs.typesafe.ai/sdk/python/api/types/assets | Attach assets to System One requests and reference them from request content. |
| `sdk/python/api/types/common.md` | https://docs.typesafe.ai/sdk/python/api/types/common | Common types for TypeSafe API SDK. |
| `sdk/python/api/types/questions.md` | https://docs.typesafe.ai/sdk/python/api/types/questions | Provide state and ask yes/no, choice, and score questions using objects or dictionaries. |
| `sdk/python/api/types/responses.md` | https://docs.typesafe.ai/sdk/python/api/types/responses | Read answers, confidence scores, token usage, and available models returned by the TypeSafe API. |
| `sdk/python/changelog.md` | https://docs.typesafe.ai/sdk/python/changelog | Python clients for the TypeSafe AI API |
| `sdk/python/usage/advanced.md` | https://docs.typesafe.ai/sdk/python/usage/advanced | Performance tuning, logging, and forward compatibility for the TypeSafe Python SDK. |
| `sdk/python/usage/basic.md` | https://docs.typesafe.ai/sdk/python/usage/basic | Guides and patterns for working with the TypeSafe Python SDK. |
