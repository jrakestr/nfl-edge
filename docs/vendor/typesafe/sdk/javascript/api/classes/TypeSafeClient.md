<!-- Source: https://docs.typesafe.ai/sdk/javascript/api/classes/TypeSafeClient | Fetched: 2026-10-19 via Firecrawl (llms-full.txt) -->

# Class: TypeSafeClient

Client for the TypeSafe AI API.

## Constructors

### Constructor

```ts theme={null}
new TypeSafeClient(config?): TypeSafeClient;
```

Create a client for the TypeSafe AI API.

Explicit options take precedence over environment variables, then SDK defaults.
Empty or whitespace-only environment values are ignored.

#### Parameters

##### config?

[`TypeSafeClientConfig`](/sdk/javascript/api/interfaces/TypeSafeClientConfig) = `{}`

#### Returns

`TypeSafeClient`

#### Throws

The API key is missing, configuration is invalid, the runtime is
unsupported, or the runtime lacks the requested compression.

## Properties

### baseURL

```ts theme={null}
readonly baseURL: string;
```

API root with trailing slashes removed.

***

### compression

```ts theme={null}
readonly compression: Compression;
```

Request body compression, or `false` when bodies are sent uncompressed.

***

### defaultHeaders

```ts theme={null}
readonly defaultHeaders: Readonly<Record<string, string>>;
```

Additional headers sent with each request.

***

### defaultModel

```ts theme={null}
readonly defaultModel: string;
```

Model used when a request omits `model`.

***

### fetch

```ts theme={null}
readonly fetch: Fetch;
```

HTTP fetch implementation.

***

### logger

```ts theme={null}
readonly logger: Logger;
```

The configured logger, filtered to `logLevel`.

***

### logLevel

```ts theme={null}
readonly logLevel: LogLevel;
```

Configured log verbosity.

***

### models

```ts theme={null}
readonly models: Models;
```

The models available to the account.

***

### retry

```ts theme={null}
readonly retry: RetryPolicy;
```

Retry settings with constructor overrides applied.

***

### timeout

```ts theme={null}
readonly timeout: number;
```

Timeout per attempt in milliseconds.

## Methods

### systemOne()

```ts theme={null}
systemOne<Q>(request, options?): APIPromise<SystemOneResult<Q>>;
```

Answer named questions about text, structured state, or assets.

#### Type Parameters

##### Q

`Q` *extends* [`Questions`](/sdk/javascript/api/interfaces/Questions)

#### Parameters

##### request

[`SystemOneRequest`](/sdk/javascript/api/interfaces/SystemOneRequest)\<`Q`>

State, questions, an optional model override, and optional assets.
Assets in `state`, question content, or `withAssets` text are sent under their references.

##### options?

[`RequestOptions`](/sdk/javascript/api/interfaces/RequestOptions) = `{}`

Per-call timeout, retry, headers, and cancellation settings.

#### Returns

[`APIPromise`](/sdk/javascript/api/classes/APIPromise)\<[`SystemOneResult`](/sdk/javascript/api/interfaces/SystemOneResult)\<`Q`>>

Answers typed by question name and criteria, with model and token usage. Every
failure below rejects the returned promise; the call itself doesn't throw.

#### Throws

State is `null` or omitted, questions are empty, score criteria are not
a list of at least two entries, choice criteria are not a nonempty map, a noul question has
neither instructions nor a described outcome, a string holds the reference of an asset not
attached to the request, a name in `assets` doesn't appear in the request, or a `Blob`
asset can't be read.

#### Throws

The server returns a non-2xx response after retries.

#### Throws

The request cannot connect or times out after retries.

#### Throws

The caller aborts the request.

#### Example

```ts theme={null}
const { answers } = await client.systemOne({
  state: "I was charged twice. Please help.",
  questions: { billing: noul("Is this about billing?") },
});
console.log(answers.billing.noul);
```
