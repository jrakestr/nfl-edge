<!-- Source: https://docs.typesafe.ai/sdk/javascript/api/classes/APIUserAbortError | Fetched: 2026-10-19 via Firecrawl (llms-full.txt) -->

# Class: APIUserAbortError

The caller cancelled the request through an `AbortSignal`.

## Extends

* [`TypeSafeError`](/sdk/javascript/api/classes/TypeSafeError)

## Constructors

### Constructor

```ts theme={null}
new APIUserAbortError(message?, options?): APIUserAbortError;
```

#### Parameters

##### message?

`string` = `"Request was aborted."`

##### options?

`ErrorOptions`

#### Returns

`APIUserAbortError`

#### Overrides

[`TypeSafeError`](/sdk/javascript/api/classes/TypeSafeError).[`constructor`](/sdk/javascript/api/classes/TypeSafeError#sdk-constructor)
