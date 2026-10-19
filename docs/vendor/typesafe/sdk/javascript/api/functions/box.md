<!-- Source: https://docs.typesafe.ai/sdk/javascript/api/functions/box | Fetched: 2026-10-19 via Firecrawl (llms-full.txt) -->

# Function: box()

```ts theme={null}
function box(instructions?): BoxQuestion;
```

Create a question that locates what its instructions describe in the request's image.
Use the `jev-preview` model for `box` questions.

## Parameters

### instructions?

[`EntryType`](/sdk/javascript/api/type-aliases/EntryType) = `null`

What to locate, as text, an asset, a JSON object or array; defaults to `null`.

## Returns

[`BoxQuestion`](/sdk/javascript/api/interfaces/BoxQuestion)

## Example

```ts theme={null}
const { answers } = await client.systemOne({
  state: image(await openAsBlob("photo.jpg")),
  questions: { dog: box("The dog") },
  model: "jev-preview",
});
const { top, bottom, left, right } = answers.dog.box;
```
