<!-- Source: https://docs.typesafe.ai/sdk/javascript/api/interfaces/NoulQuestion | Fetched: 2026-10-19 via Firecrawl (llms-full.txt) -->

# Interface: NoulQuestion

A yes/no question with optional descriptions for either outcome.

## Properties

### criteria?

```ts theme={null}
optional criteria?: 
  | {
  false?: EntryType;
  true?: EntryType;
}
  | null;
```

Descriptions of the yes and no outcomes; at least one is required when `instructions` is omitted or `null`.

#### Union Members

##### Type Literal

```ts theme={null}
{
  false?: EntryType;
  true?: EntryType;
}
```

##### false?

```ts theme={null}
optional false?: EntryType;
```

Description of the no outcome.

##### true?

```ts theme={null}
optional true?: EntryType;
```

Description of the yes outcome.

***

`null`

***

### instructions?

```ts theme={null}
optional instructions?: EntryType;
```

The question as text, a JSON object, or an array; optional when `criteria` describes an outcome.

***

### type

```ts theme={null}
type: "noul";
```
