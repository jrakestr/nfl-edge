<!-- Source: https://docs.typesafe.ai/sdk/python | Fetched: 2026-10-19 via Firecrawl (llms-full.txt) -->

# TypeSafe Python SDK

Install the TypeSafe Python SDK and get started with asynchronous or synchronous API calls.

Browse the [Python SDK source on GitHub](https://github.com/typesafe-ai/typesafe-sdk-python).

Asynchronous and synchronous Python clients for the [TypeSafe](https://typesafe.ai) API. Learn how to use TypeSafe [here](https://docs.typesafe.ai/).

## Quickstart

1. Install the SDK:

   <Tabs>
     <Tab title="uv">
       ```sh theme={null}
       uv add typesafe-sdk
       ```
     </Tab>

     <Tab title="pip">
       ```sh theme={null}
       pip install typesafe-sdk
       ```
     </Tab>
   </Tabs>

   Extras (for example, `typesafe-sdk[http2]`) supported:

   * `http2`: enable [HTTP/2 support](/sdk/python/usage/advanced#http2)
   * `pil`: send [Pillow images](/sdk/python/api/types/assets#typesafe_sdk.Image.from_pil)
   * `zstd`: [compress request bodies](/sdk/python/usage/advanced#ensure-zstd-is-available) on Python 3.13 and earlier
2. Set `TYPESAFE_API_KEY` in your environment (create it [here](https://console.typesafe.ai/))
3. Call the System One API:

   <Tabs>
     <Tab title="Async">
       With [AsyncTypeSafeClient](/sdk/python/api/clients/async):

       ```python theme={null}
       from typesafe_sdk import AsyncTypeSafeClient, Choice, Noul, Score


       async def main() -> None:
           async with AsyncTypeSafeClient() as client:
               response = await client.system_one(
                   state={"document": "I was charged twice. Please fix this ASAP."},
                   questions={
                       "billing": Noul(instructions="Is this ticket about billing?"),
                       "tone": Choice(
                           instructions="What is the customer's tone?",
                           criteria={"calm": None, "frustrated": None, "angry": None},
                       ),
                       "urgency": Score(
                           instructions="How urgent is this ticket?",
                           criteria=["can wait", "this week", "today"],
                       ),
                   },
               )

           print(response.nouls["billing"].noul)
           print(response.choices["tone"].choice)
           print(response.scores["urgency"].score)
       ```
     </Tab>

     <Tab title="Sync">
       With [TypeSafeClient](/sdk/python/api/clients/sync):

       ```python theme={null}
       from typesafe_sdk import Choice, Noul, Score, TypeSafeClient

       with TypeSafeClient() as client:
           response = client.system_one(
               state={"document": "I was charged twice. Please fix this ASAP."},
               questions={
                   "billing": Noul(instructions="Is this ticket about billing?"),
                   "tone": Choice(
                       instructions="What is the customer's tone?",
                       criteria={"calm": None, "frustrated": None, "angry": None},
                   ),
                   "urgency": Score(
                       instructions="How urgent is this ticket?",
                       criteria=["can wait", "this week", "today"],
                   ),
               },
           )

       print(response.nouls["billing"].noul)
       print(response.choices["tone"].choice)
       print(response.scores["urgency"].score)
       ```
     </Tab>
   </Tabs>

## What's next

Visit the [Usage guide](/sdk/python/usage/basic) to learn how to:

* [Choose a System One model](/sdk/python/usage/basic#choosing-a-model)
* [Send media inputs](/sdk/python/usage/basic#attaching-media-assets)
* [Use typed responses](/sdk/python/usage/basic#typed-system_one-responses)
* [Configure retry policy](/sdk/python/usage/basic#retries)
* [Optimize performance](/sdk/python/usage/advanced#performance)
