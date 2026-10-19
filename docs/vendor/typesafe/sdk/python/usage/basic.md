<!-- Source: https://docs.typesafe.ai/sdk/python/usage/basic | Fetched: 2026-10-19 via Firecrawl (llms-full.txt) -->

# Basic usage

Guides and patterns for working with the TypeSafe Python SDK.

## Calling the System One API

<Tabs>
  <Tab title="Async">
    ```python theme={null}
    import asyncio

    from typesafe_sdk import AsyncTypeSafeClient, Choice, Noul, Score


    async def main() -> None:
        async with AsyncTypeSafeClient() as client:
            result = await client.system_one(
                "I was charged twice. Please help ASAP.",
                {
                    "billing": Noul(instructions="Is this about billing?"),
                    "tone": Choice(
                        instructions="What is the tone?",
                        criteria={"calm": None, "angry": None},
                    ),
                    "urgency": Score(
                        instructions="How urgent is this?",
                        criteria=["low", "medium", "high"],
                    ),
                },
            )
            print(
                result.nouls["billing"].noul,
                result.choices["tone"].choice,
                result.scores["urgency"].score,
            )


    asyncio.run(main())
    ```
  </Tab>

  <Tab title="Sync">
    ```python theme={null}
    from typesafe_sdk import Choice, Noul, Score, TypeSafeClient

    client = TypeSafeClient()
    state = "I was charged twice. Please help ASAP."
    questions = {
        "billing": Noul(instructions="Is this about billing?"),
        "tone": Choice(
            instructions="What is the tone?", criteria={"calm": None, "angry": None}
        ),
        "urgency": Score(
            instructions="How urgent is this?", criteria=["low", "medium", "high"]
        ),
    }
    result = client.system_one(state, questions)
    print(
        result.nouls["billing"].noul,
        result.choices["tone"].choice,
        result.scores["urgency"].score,
    )
    ```
  </Tab>
</Tabs>

## Choosing a model

Inspect the available models:

<Tabs>
  <Tab title="Async">
    ```python theme={null}
    import asyncio

    from typesafe_sdk import AsyncTypeSafeClient


    async def main() -> None:
        async with AsyncTypeSafeClient() as client:
            print(await client.models.list())


    asyncio.run(main())
    ```
  </Tab>

  <Tab title="Sync">
    ```python theme={null}
    from typesafe_sdk import TypeSafeClient

    print(TypeSafeClient().models.list())
    ```
  </Tab>
</Tabs>

Select the model when constructing a client:

<Tabs>
  <Tab title="Async">
    ```python theme={null}
    client = AsyncTypeSafeClient(model="jev")
    ```
  </Tab>

  <Tab title="Sync">
    ```python theme={null}
    client = TypeSafeClient(model="jev")
    ```
  </Tab>
</Tabs>

See the [Models resource reference](https://docs.typesafe.ai/go/models) for more information on available models, their capabilities, pricing details, and model aliases.

## Attaching Media Assets

System One requests can include media assets.

<Info>
  **Supported asset types**

  Only images are supported at the moment, with more modalities coming in the future.

  <Warning>
    **Images are only dreamer-ready**

    As of November 14, 2026, image support is only dreamer-ready. The brave may opt-in to this feature via HTTP headers:

    ```python theme={null}
    client = TypeSafeClient(headers={"TypeSafe-Danger-Zone-Images": "true"})
    ```
  </Warning>

  Learn about support for images:

  * [**API docs**](https://docs.typesafe.ai/go/images): how to enable and use images with TypeSafe's System One API
  * [**SDK docs**](/sdk/python/api/types/assets#typesafe_sdk.Image): documentation and code examples for using images with `typesafe-sdk`
</Info>

<Note>
  **Upload format**

  Requests with assets are sent as `multipart/form-data`, with each asset's raw bytes in its own part.
</Note>

***

An **asset reference** inside the content of `state` or `questions` will be replaced with the actual asset data, provided to the client separately.

There are two ways to create **asset references**:

1. [Automatic references](/sdk/python/usage/basic#automatic-references): place assets directly in the content, or format them into strings. The SDK then auto-generates a unique reference for each asset.
2. [Named references](/sdk/python/usage/basic#named-references): choose your own references for assets, passed through the `assets` argument to `system_one`.

Both types of asset references may be used together in the same request.

### Automatic references

#### Assets in structured objects

Place assets directly in `state` or in question instructions and criteria:

<Tabs>
  <Tab title="Async">
    ```python theme={null}
    from pathlib import Path

    from typesafe_sdk import AsyncTypeSafeClient, Image, Noul, SystemOneResponse


    async def compare_return(
        client: AsyncTypeSafeClient, returned: Path, listing: Path, *, model: str
    ) -> SystemOneResponse:
        return await client.system_one(
            state=["The customer returned this item:", Image(returned)],
            questions={
                "same_item": Noul(
                    instructions=["Is it the item in this listing photo?", Image(listing)]
                )
            },
            model=model,
        )
    ```
  </Tab>

  <Tab title="Sync">
    ```python theme={null}
    from pathlib import Path

    from typesafe_sdk import Image, Noul, SystemOneResponse, TypeSafeClient


    def compare_return(
        client: TypeSafeClient, returned: Path, listing: Path, *, model: str
    ) -> SystemOneResponse:
        return client.system_one(
            state=["The customer returned this item:", Image(returned)],
            questions={
                "same_item": Noul(
                    instructions=["Is it the item in this listing photo?", Image(listing)]
                )
            },
            model=model,
        )
    ```
  </Tab>
</Tabs>

<Note>
  **Note**

  Under the hood, each asset is automatically assigned a unique uuid-like reference.
</Note>

#### Assets in text

Use `client.attach_assets` to attach assets to the client, and `str(asset)` to reference them in text:

<Tabs>
  <Tab title="Async">
    ```python theme={null}
    from pathlib import Path

    from typesafe_sdk import AsyncTypeSafeClient, Image, Noul, SystemOneResponse


    async def check_damage(
        client: AsyncTypeSafeClient, returned: Path, *, model: str
    ) -> SystemOneResponse:
        photo = Image(returned)
        with client.attach_assets(photo):
            return await client.system_one(
                state=f"The customer says {photo} arrived scratched.",
                questions={"damaged": Noul(instructions="Is the item damaged?")},
                model=model,
            )
    ```
  </Tab>

  <Tab title="Sync">
    ```python theme={null}
    from pathlib import Path

    from typesafe_sdk import Image, Noul, SystemOneResponse, TypeSafeClient


    def check_damage(
        client: TypeSafeClient, returned: Path, *, model: str
    ) -> SystemOneResponse:
        photo = Image(returned)
        with client.attach_assets(photo):
            return client.system_one(
                state=f"The customer says {photo} arrived scratched.",
                questions={"damaged": Noul(instructions="Is the item damaged?")},
                model=model,
            )
    ```
  </Tab>
</Tabs>

<Warning>
  **Warning**

  Don't forget the `with client.attach_assets` context manager block! The SDK will not be able to associate text-rendered asset references with the original asset data.
</Warning>

### Named references

To choose your own reference for an asset, pass it through `assets`, keyed by that reference. Use distinct delimiters (such as `<product>`) to avoid matching ordinary text:

<Tabs>
  <Tab title="Async">
    ```python theme={null}
    from pathlib import Path

    from typesafe_sdk import AsyncTypeSafeClient, Image, Noul, SystemOneResponse


    async def inspect_product(
        client: AsyncTypeSafeClient, photo: Path, *, model: str
    ) -> SystemOneResponse:
        return await client.system_one(
            state="Inspect this returned product: <product>",
            questions={"damaged": Noul(instructions="Is the product damaged?")},
            assets={"<product>": Image(photo)},
            model=model,
        )
    ```
  </Tab>

  <Tab title="Sync">
    ```python theme={null}
    from pathlib import Path

    from typesafe_sdk import Image, Noul, SystemOneResponse, TypeSafeClient


    def inspect_product(
        client: TypeSafeClient, photo: Path, *, model: str
    ) -> SystemOneResponse:
        return client.system_one(
            state="Inspect this returned product: <product>",
            questions={"damaged": Noul(instructions="Is the product damaged?")},
            assets={"<product>": Image(photo)},
            model=model,
        )
    ```
  </Tab>
</Tabs>

<Tip>
  **Tip**

  An asset passed through `assets` may also be placed directly in the content: it is sent once, under its name.
</Tip>

## Typed <code>system\_one</code> responses

It is possible to provide a response model to `system_one` to make using the response more *type-safe*:

<Tabs>
  <Tab title="Async">
    ```python theme={null}
    import asyncio

    from typesafe_sdk import AsyncTypeSafeClient, Noul, NoulAnswer, SystemOneResponse


    class BillingResponse(SystemOneResponse):
        billing: NoulAnswer


    async def main() -> None:
        async with AsyncTypeSafeClient() as client:
            result = await client.system_one(
                "I was charged twice.",
                {"billing": Noul(instructions="Is this about billing?")},
                response_model=BillingResponse,
            )
            assert 0 <= result.billing.noul <= 1
            assert result.billing == result.nouls["billing"]
            print(result.request_id)


    asyncio.run(main())
    ```
  </Tab>

  <Tab title="Sync">
    ```python theme={null}
    from typesafe_sdk import Noul, NoulAnswer, SystemOneResponse, TypeSafeClient


    class BillingResponse(SystemOneResponse):
        billing: NoulAnswer


    with TypeSafeClient() as client:
        result = client.system_one(
            "I was charged twice.",
            {"billing": Noul(instructions="Is this about billing?")},
            response_model=BillingResponse,
        )
        assert 0 <= result.billing.noul <= 1
        assert result.billing == result.nouls["billing"]
        print(result.request_id)
    ```
  </Tab>
</Tabs>

### Custom response types

It is also possible to define a completely new response model without inheriting from `SystemOneResponse`:

<Tabs>
  <Tab title="Async">
    ```python theme={null}
    import asyncio

    from pydantic import BaseModel

    from typesafe_sdk import AsyncTypeSafeClient, Noul, NoulAnswer


    class BillingAnswers(BaseModel):
        billing: NoulAnswer


    class BillingResponse(BaseModel):
        answers: BillingAnswers


    async def main() -> None:
        async with AsyncTypeSafeClient() as client:
            result = await client.system_one(
                "I was charged twice.",
                {"billing": Noul(instructions="Is this about billing?")},
                response_model=BillingResponse,
            )
            assert 0 <= result.answers.billing.noul <= 1


    asyncio.run(main())
    ```
  </Tab>

  <Tab title="Sync">
    ```python theme={null}
    from pydantic import BaseModel

    from typesafe_sdk import Noul, NoulAnswer, TypeSafeClient


    class BillingAnswers(BaseModel):
        billing: NoulAnswer


    class BillingResponse(BaseModel):
        answers: BillingAnswers


    result = TypeSafeClient().system_one(
        "I was charged twice.",
        {"billing": Noul(instructions="Is this about billing?")},
        response_model=BillingResponse,
    )
    assert 0 <= result.answers.billing.noul <= 1
    ```
  </Tab>
</Tabs>

## Retries

Pass a custom [`RetryPolicy`](/sdk/python/api/retries) as `retry` on the client or per call. Invalid API keys raise `TypeSafeError` during client creation, before any request or retry.

On the client:

<Tabs>
  <Tab title="Async">
    ```python theme={null}
    from typesafe_sdk import AsyncTypeSafeClient, RetryPolicy

    client = AsyncTypeSafeClient(
        retry=RetryPolicy(max_retries=3, backoff_max=0.2, timeout=1.0)
    )
    ```
  </Tab>

  <Tab title="Sync">
    ```python theme={null}
    from typesafe_sdk import RetryPolicy, TypeSafeClient

    client = TypeSafeClient(retry=RetryPolicy(max_retries=3, backoff_max=0.2, timeout=1.0))
    ```
  </Tab>
</Tabs>

Per call:

<Tabs>
  <Tab title="Async">
    ```python theme={null}
    import asyncio

    from typesafe_sdk import AsyncTypeSafeClient, RetryPolicy


    async def main() -> None:
        async with AsyncTypeSafeClient() as client:
            await client.system_one(
                state,
                questions,
                retry=RetryPolicy(max_retries=3, backoff_max=0.2, timeout=1.0),
            )


    asyncio.run(main())
    ```
  </Tab>

  <Tab title="Sync">
    ```python theme={null}
    from typesafe_sdk import RetryPolicy

    client.system_one(
        state, questions, retry=RetryPolicy(max_retries=3, backoff_max=0.2, timeout=1.0)
    )
    ```
  </Tab>
</Tabs>

## Error handling

Handle [exceptions](/sdk/python/api/exceptions) raised by the SDK:

<Tabs>
  <Tab title="Async">
    ```python theme={null}
    import asyncio

    from typesafe_sdk import AsyncTypeSafeClient, TypeSafeAPIError


    async def main() -> None:
        async with AsyncTypeSafeClient() as client:
            try:
                await client.system_one(state, questions)
            except TypeSafeAPIError as error:
                print(error.status, error.request_id)


    asyncio.run(main())
    ```
  </Tab>

  <Tab title="Sync">
    ```python theme={null}
    from typesafe_sdk import TypeSafeAPIError

    try:
        client.system_one(state, questions)
    except TypeSafeAPIError as error:
        print(error.status, error.request_id)
    ```
  </Tab>
</Tabs>

## Environment variables

The SDK reads and uses the following environment variables:

| Variable | Configures | Default |
| - | - | - |
| `TYPESAFE_API_KEY` | API key (required) | — |
| `TYPESAFE_BASE_URL` | API root URL | `https://api.typesafe.ai` |
| `TYPESAFE_DEFAULT_MODEL` | Default model | `jev-latest` |
| `TYPESAFE_LOG_LEVEL` | `typesafe_sdk` logger level, applied once at import | unset |

See the [constants reference](/sdk/python/api/constants) for SDK defaults.

API keys supplied through `api_key` or `TYPESAFE_API_KEY` have leading and trailing whitespace stripped, including newlines from key files. Empty keys, internal whitespace, control characters, and non-ASCII characters are rejected before sending a request. An explicitly empty key does not fall back to the environment.

## Configuring the base URL

In order to use the SDK with a different API url, set `base_url` on the client or the `TYPESAFE_BASE_URL` environment variable. This requires the alternative API to follow the [TypeSafe OpenAPI spec](https://api.typesafe.ai/docs/).

For example, connect through an AI gateway using its API key and model ID.

<Tabs>
  <Tab title="OpenRouter">
    Use an OpenRouter API key and an [OpenRouter model ID](https://openrouter.ai/~typesafe/jev-latest/):

    <Tabs>
      <Tab title="Async client">
        ```python theme={null}
        import asyncio
        import os

        from typesafe_sdk import AsyncTypeSafeClient, Noul


        async def main() -> None:
            async with AsyncTypeSafeClient(
                api_key=os.environ["OPENROUTER_API_KEY"],
                base_url="https://openrouter.ai/api",
                model="~typesafe/jev-latest",
            ) as client:
                result = await client.system_one(
                    "I was charged twice.",
                    {"billing": Noul(instructions="Is this about billing?")},
                )
                print(result.nouls["billing"].noul)


        asyncio.run(main())
        ```
      </Tab>

      <Tab title="Sync client">
        ```python theme={null}
        import os

        from typesafe_sdk import Noul, TypeSafeClient

        with TypeSafeClient(
            api_key=os.environ["OPENROUTER_API_KEY"],
            base_url="https://openrouter.ai/api",
            model="~typesafe/jev-latest",
        ) as client:
            result = client.system_one(
                "I was charged twice.",
                {"billing": Noul(instructions="Is this about billing?")},
            )
            print(result.nouls["billing"].noul)
        ```
      </Tab>
    </Tabs>
  </Tab>

  <Tab title="Vercel AI Gateway">
    [Vercel's TypeSafe-compatible API](https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe) can be used with the SDK:

    <Tabs>
      <Tab title="Async client">
        ```python theme={null}
        import asyncio
        import os

        from typesafe_sdk import AsyncTypeSafeClient, Noul


        async def main() -> None:
            async with AsyncTypeSafeClient(
                api_key=os.environ["AI_GATEWAY_API_KEY"],
                base_url="https://ai-gateway.vercel.sh/typesafe",
                model="typesafe-ai/jev",
            ) as client:
                result = await client.system_one(
                    "I was charged twice.",
                    {"billing": Noul(instructions="Is this about billing?")},
                )
                print(result.nouls["billing"].noul)


        asyncio.run(main())
        ```
      </Tab>

      <Tab title="Sync client">
        ```python theme={null}
        import os

        from typesafe_sdk import Noul, TypeSafeClient

        with TypeSafeClient(
            api_key=os.environ["AI_GATEWAY_API_KEY"],
            base_url="https://ai-gateway.vercel.sh/typesafe",
            model="typesafe-ai/jev",
        ) as client:
            result = client.system_one(
                "I was charged twice.",
                {"billing": Noul(instructions="Is this about billing?")},
            )
            print(result.nouls["billing"].noul)
        ```
      </Tab>
    </Tabs>
  </Tab>

  <Tab title="Pydantic AI Gateway">
    Use a [Pydantic AI Gateway API key](https://pydantic.dev/articles/jev-pydantic-ai-gateway):

    <Tabs>
      <Tab title="Async client">
        ```python theme={null}
        import asyncio
        import os

        from typesafe_sdk import AsyncTypeSafeClient, Noul


        async def main() -> None:
            async with AsyncTypeSafeClient(
                api_key=os.environ["PYDANTIC_AI_GATEWAY_API_KEY"],
                base_url="https://gateway-us.pydantic.dev/proxy/typesafe",
                model="jev-latest",
            ) as client:
                result = await client.system_one(
                    "I was charged twice.",
                    {"billing": Noul(instructions="Is this about billing?")},
                )
                print(result.nouls["billing"].noul)


        asyncio.run(main())
        ```
      </Tab>

      <Tab title="Sync client">
        ```python theme={null}
        import os

        from typesafe_sdk import Noul, TypeSafeClient

        with TypeSafeClient(
            api_key=os.environ["PYDANTIC_AI_GATEWAY_API_KEY"],
            base_url="https://gateway-us.pydantic.dev/proxy/typesafe",
            model="jev-latest",
        ) as client:
            result = client.system_one(
                "I was charged twice.",
                {"billing": Noul(instructions="Is this about billing?")},
            )
            print(result.nouls["billing"].noul)
        ```
      </Tab>
    </Tabs>
  </Tab>
</Tabs>
