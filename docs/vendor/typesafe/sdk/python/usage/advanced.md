<!-- Source: https://docs.typesafe.ai/sdk/python/usage/advanced | Fetched: 2026-10-19 via Firecrawl (llms-full.txt) -->

# Advanced usage

Performance tuning, logging, and forward compatibility for the TypeSafe Python SDK.

## Performance

If your application sends hundreds of requests per second, follow these recommendations.

### Reuse clients

Make sure to reuse a client instance when sending multiple requests. Setting up a new client involves the overhead of starting new connections and TLS handshakes.

### Ensure <code>zstd</code> is available

The clients compress request bodies of 1 KiB or more with [zstd](https://facebook.github.io/zstd/), which reduces upload size and time, especially for large states.

Make sure `zstd` is installed on Python versions earlier than 3.14:

```shell theme={null}
uv add "typesafe-sdk[zstd]"
```

Compression can be configured or disabled via the `compression` client constructor argument.

### Use <code>aiohttp</code> for async code

For async code at high request rates, pass an [aiohttp](https://docs.aiohttp.org/)-based HTTP client from [`httpx-aiohttp`](https://pypi.org/project/httpx-aiohttp/):

```shell theme={null}
uv add "httpx-aiohttp[httpx2]"
```

```python theme={null}
from httpx_aiohttp.httpx2 import Httpx2AiohttpClient

from typesafe_sdk import AsyncTypeSafeClient

client = AsyncTypeSafeClient(http_client=Httpx2AiohttpClient())
```

### Create a client per thread

`TypeSafeClient` can be shared between threads, but under heavy load its connection pool becomes the bottleneck. Create one client per thread and reuse it for every request that thread sends.

<Note>
  **Example**

  ```python theme={null}
  import threading

  from typesafe_sdk import TypeSafeClient


  class ThreadClients(threading.local):
      def __init__(self) -> None:
          self.client = TypeSafeClient()


  clients = ThreadClients()

  # In any thread, `clients.client` is that thread's own client.
  ```
</Note>

### HTTP/2

The clients use HTTP/1.1 by default and can switch to HTTP/2:

* **HTTP/1.1** sends one request at a time per connection and opens a connection for each concurrent request, up to the [connection limit](/sdk/python/usage/advanced#keep-a-connection-limit). Concurrency scales with the number of connections, at the cost of a TLS handshake for each new one.
* **HTTP/2** multiplexes every request from one client over a single connection. It needs only one handshake and one socket, but that connection caps the client's throughput.

Keep the default HTTP/1.1 for high request rates. Use HTTP/2 for low to moderate concurrency when you want fewer connections, for example behind a proxy or firewall that limits them.

To enable HTTP/2, install the `'typesafe-sdk[http2]'` extra and pass an HTTP/2 client. See the [`httpx2` HTTP/2 guide](https://pydantic.dev/docs/httpx2/guides/http2/) for details.

<Tabs>
  <Tab title="Async">
    ```python theme={null}
    import httpx2

    from typesafe_sdk import AsyncTypeSafeClient

    client = AsyncTypeSafeClient(http_client=httpx2.AsyncClient(http2=True))
    ```
  </Tab>

  <Tab title="Sync">
    ```python theme={null}
    import httpx2

    from typesafe_sdk import TypeSafeClient

    client = TypeSafeClient(http_client=httpx2.Client(http2=True))
    ```
  </Tab>
</Tabs>

### Keep a connection limit

The default clients open at most 100 connections and keep all of them open for 30 seconds while idle, so bursts reuse connections instead of opening new ones. Make sure to set appropriate limits when providing your own `http_client`.

<Note>
  **Example**

  <Tabs>
    <Tab title="Async">
      ```python theme={null}
      import httpx2

      from typesafe_sdk import AsyncTypeSafeClient

      limits = httpx2.Limits(
          max_connections=200, max_keepalive_connections=200, keepalive_expiry=30
      )
      client = AsyncTypeSafeClient(http_client=httpx2.AsyncClient(limits=limits))
      ```
    </Tab>

    <Tab title="Sync">
      ```python theme={null}
      import httpx2

      from typesafe_sdk import TypeSafeClient

      limits = httpx2.Limits(
          max_connections=200, max_keepalive_connections=200, keepalive_expiry=30
      )
      client = TypeSafeClient(http_client=httpx2.Client(limits=limits))
      ```
    </Tab>
  </Tabs>
</Note>

## Logging

The SDK logs to the `typesafe_sdk` logger. Configure it according to [standard logging](https://docs.python.org/3/library/logging.html) guide:

```python theme={null}
import logging

logging.getLogger("typesafe_sdk").setLevel(logging.DEBUG)
```

Or set `TYPESAFE_LOG_LEVEL` to one of `debug`, `info`, `warning`, `error`, or `off` before importing the SDK.

`info` logs one summary line per request; `debug` also logs request and response headers and bodies. Secret headers — authorization, API keys, cookies, and any header whose name contains `token` or `secret` — are redacted from log output. Request and response bodies are **not** redacted.

## Forward compatibility

The SDK keeps working as the TypeSafe API evolves, so you can adopt new API features before an SDK release adds first-class support for them.

### Extra request fields

Send additional API request fields with [`extra_body`](/sdk/python/api/clients/sync). The `beam_width` field below is illustrative; only send fields supported by the API.

<Tabs>
  <Tab title="Async">
    ```python theme={null}
    import asyncio

    from typesafe_sdk import AsyncTypeSafeClient, Noul


    async def main() -> None:
        async with AsyncTypeSafeClient() as client:
            await client.system_one(
                "I was charged twice.",
                {"billing": Noul(instructions="About billing?")},
                extra_body={"beam_width": 4},
            )


    asyncio.run(main())
    ```
  </Tab>

  <Tab title="Sync">
    ```python theme={null}
    from typesafe_sdk import Noul, TypeSafeClient

    with TypeSafeClient() as client:
        client.system_one(
            "I was charged twice.",
            {"billing": Noul(instructions="About billing?")},
            extra_body={"beam_width": 4},
        )
    ```
  </Tab>
</Tabs>

### Raw question dictionaries

<Tabs>
  <Tab title="Async">
    ```python theme={null}
    import asyncio

    from typesafe_sdk import AsyncTypeSafeClient


    async def main() -> None:
        async with AsyncTypeSafeClient() as client:
            await client.system_one(
                "I was charged twice.",
                {
                    "billing": {
                        "type": "noul",
                        "instructions": "About billing?",
                        "weight": 2,
                    }
                },
            )


    asyncio.run(main())
    ```
  </Tab>

  <Tab title="Sync">
    ```python theme={null}
    from typesafe_sdk import TypeSafeClient

    with TypeSafeClient() as client:
        client.system_one(
            "I was charged twice.",
            {"billing": {"type": "noul", "instructions": "About billing?", "weight": 2}},
        )
    ```
  </Tab>
</Tabs>

<Tip>
  **Tip**

  Unknown fields are a forward-compatibility escape hatch. Ignore their type-checking errors and prefer upgrading the SDK instead.
</Tip>

### Unknown answer kinds

The SDK logs a warning and skips unrecognized answer kinds. Use `raw_http_response` to inspect the complete API response, including those answers:

<Tabs>
  <Tab title="Async">
    ```python theme={null}
    import asyncio

    from typesafe_sdk import AsyncTypeSafeClient, Noul


    async def main() -> None:
        async with AsyncTypeSafeClient() as client:
            result = await client.system_one(
                "I was charged twice.",
                {"billing": Noul(instructions="Is this about billing?")},
            )
            print(result.raw_http_response.json()["answers"])


    asyncio.run(main())
    ```
  </Tab>

  <Tab title="Sync">
    ```python theme={null}
    from typesafe_sdk import Noul, TypeSafeClient

    result = TypeSafeClient().system_one(
        "I was charged twice.",
        {"billing": Noul(instructions="Is this about billing?")},
    )
    raw_answers = result.raw_http_response.json()["answers"]
    ```
  </Tab>
</Tabs>

### Unknown response fields

Unknown extra fields on recognized responses are ignored.
