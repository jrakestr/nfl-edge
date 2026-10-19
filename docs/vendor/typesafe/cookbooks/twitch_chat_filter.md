<!-- Source: https://docs.typesafe.ai/cookbooks/twitch_chat_filter | Fetched: 2026-10-19 via Firecrawl (llms-full.txt) -->

# Twitch chat filter

Hide insults, spam, and unasked-for gameplay tips in Twitch chat, blur spoilers, and highlight questions. Each message gets one TypeSafe request containing multiple questions. Up to eight messages are processed concurrently, and the rules are defined in code.

You are watching a Twitch stream, and the chat moves faster than you can read it. This
cookbook sorts each message as it arrives: questions are highlighted, spam, insults and
unrequested gameplay tips are hidden, and spoilers are blurred. A keyword list could
catch spam links, but "Go left, there's a treasure box behind the tree" has no bad words
in it, and neither does a plot twist.

Send each message to Jev in its own request, with the stream title and game. Ask
three questions about it: what kind of message it is, whether it is toxic (insulting,
hateful, or harassing), and whether it spoils the game. Plain code then turns those
answers into what the viewer sees.
The video demo below shows a Jev-powered Chrome extension filtering a live Twitch
chat:

<Frame>
  <iframe title="Twitch chat filtering Chrome extension demo" />
</Frame>

This cookbook covers how messages are categorized and filtered by Jev using 29
example chat messages. Seven were hidden, two blurred, and six highlighted as questions.

<img alt="Five chat messages go to Jev at once, each in its own request with the stream's game. The category, toxic, and spoiler answers come back, and decide() shows, highlights, hides, or blurs each message in the viewer's chat" />

<img alt="Five chat messages go to Jev at once, each in its own request with the stream's game. The category, toxic, and spoiler answers come back, and decide() shows, highlights, hides, or blurs each message in the viewer's chat" />

By the end of this cookbook you will have `classify()`, which asks the three questions
about one message, and `decide()`, which turns the answers into show, highlight, dim,
hide, or blur. When you change a rule, for example if spam then hide, only `decide()`
runs again, with no new request to Jev. To filter live chat on Twitch or another
platform, connect this logic to a custom chat viewer, moderation tool, or browser
extension, adapting the message input and questions to your stream.

## Setup

```bash theme={null}
pip install 'typesafe-sdk>=0.7.1,<0.8.0' ipython 'cooksafe>=0.2.0,<0.3.0'
```

Create a new file named `twitch_chat_filter.py`. As you work through this cookbook,
copy each Python code block into that file, in order. For a live run, set
`TYPESAFE_API_KEY` in your environment. Once you have added all the blocks, run this
command from the directory containing it:

```bash theme={null}
python twitch_chat_filter.py
```

Every API response is saved in
[`json_cache.json`](https://github.com/typesafe-ai/typesafe-public-examples/blob/main/cookbooks/twitch_chat_filter/json_cache.json)
beside the script. Download it there to replay the published numbers instead of calling
the API. In a notebook, put the cache in the notebook's working directory instead. To run
everything live again, move the cache aside and set your key. Do the same when changing
`TYPESAFE_MODEL`, because the cache key below includes the state and questions, not the
model.

Numbers below came from `jev-1.13.0` on 2026-09-25.

```python theme={null}
from concurrent.futures import ThreadPoolExecutor
import os
from pathlib import Path
from time import perf_counter

from cooksafe import JsonCache, make_playground_link
from IPython.display import Markdown, display
from typesafe_sdk import Choice, Noul, NoulCriteria, TypeSafeClient

TYPESAFE_MODEL = "jev-1.13.0"

client = TypeSafeClient(
    api_key=os.environ.get("TYPESAFE_API_KEY", "cache-only"),  # cached re-renders need no key
    base_url=os.environ.get("TYPESAFE_ENDPOINT"),
    timeout=60.0,
)
CACHE_DIR = Path(__file__).resolve().parent if "__file__" in globals() else Path.cwd()
json_cache = JsonCache(CACHE_DIR / "json_cache.json")
```

## Load a stretch of chat

We wrote these 29 messages ourselves for an Elden Ring stream, so every kind of message
turns up at least twice. Two of the messages are emote-only lines (emotes are small
chat images on Twitch, typed as words like `PogChamp`).

Whether a message is a spoiler or backseat advice (gameplay tips the streamer did not ask
for) depends on which game is being played, so the stream title and game go into every
request.

```python expandable theme={null}
STREAM = {"title": "Elden Ring first playthrough! No spoilers please", "game": "Elden Ring"}

CHAT = [
    ("NightOwl_22", "hi chat, first time catching a stream live"),
    ("ggwp_andy", "PogChamp PogChamp PogChamp"),
    ("mira_plays", "how many hours have you played so far?"),
    ("tarnished_tom", "this area looks so good at night"),
    ("backseat_bert", "go left, there's a site of grace behind the tree"),
    ("follow4follow_bot", "Want more viewers? Buy 1000 followers for $5 at cheapviewz dot com"),
    ("LoreHound", "wait till you find out Ranni planned the Night of Black Knives"),
    ("kappa_kev", "LUL LUL LUL"),
    ("sunny_d", "are you going to do a no-hit run after this?"),
    ("rage_ryan", "you're genuinely the worst player i've ever seen, uninstall trash"),
    ("cozy_cat", "the music in this area is so good"),
    ("backseat_bert", "use your flask NOW, why are you not healing"),
    ("mira_plays", "W streamer"),
    ("ggwp_andy", "GG that was insane"),
    ("quiet_quinn", "anyone else watching from Brazil?"),
    ("tarnished_tom", "what build are you going for?"),
    ("LoreHound", "the ending where you become Elden Lord with Ranni is the best one"),
    ("kappa_kev", "chat is wild today lol"),
    ("backseat_bert", "the boss is weak to fire, equip the torch before you go in"),
    ("rage_ryan", "nobody cares about your opinion, go back to your basement"),
    ("cozy_cat", "you're so bad at this boss lmao, love you tho"),
    ("sunny_d", "who is the final boss?"),
    ("ggwp_andy", "LETS GOOOO"),
    ("NightOwl_22", "i just got this game too, it's so hard"),
    ("promo_pete", "check out my channel, I stream every day, follow me!"),
    ("quiet_quinn", "dodge rolling through that was clean"),
    ("mira_plays", "is the DLC worth it?"),
    ("cozy_cat", "your character looks so cool"),
    ("NightOwl_22", "this boss took me 40 tries lol"),
]

print(f"{len(CHAT)} messages. What one request sends as its state:")
print({"stream": STREAM, "message": {"user": CHAT[4][0], "text": CHAT[4][1]}})
```

```
29 messages. What one request sends as its state:
{'stream': {'title': 'Elden Ring first playthrough! No spoilers please', 'game': 'Elden Ring'}, 'message': {'user': 'backseat_bert', 'text': "go left, there's a site of grace behind the tree"}}
```

## Write the questions

We'll ask three questions, which are all answered in one request, against the same
state: the stream plus one message.

* The `category` question is a `Choice` over five kinds of message. The label it picks
  decides what happens to the message: show, highlight, dim, or hide.
* The `toxic` question is a `Noul`. If its probability is 0.7 or higher (the threshold
  `TOXIC_AT`, set further down), the message is hidden, whatever its category.
* The `spoiler` question is a `Noul`. If its probability is 0.7 or higher (the threshold
  `SPOILER_AT`), the message is blurred, unless it is already hidden.

The category describes the message's main purpose. Repeated emotes and cheering count
as `hype`; unsolicited promotion counts as `spam`. A link alone is not spam.
`conversation` is the fallback when none of the other categories fits.

```python theme={null}
QUESTIONS = {
    "category": Choice(
        instructions="Which category best describes the main purpose of `message.text`?",
        criteria={
            "question": "A genuine request for information from the streamer or chat, "
            "not gameplay instructions phrased as a question or a promotional pitch",
            "hype": "Cheering, reactions, or repeated emotes (PogChamp, LUL, GG, W, "
            "lets gooo); repetition alone does not make cheering spam",
            "conversation": "Ordinary chatter, opinions, replies, useful shared links, "
            "or any message whose main purpose does not fit the other categories",
            "backseat": "Unrequested gameplay advice telling the streamer what to do, "
            "including instructions phrased as a question; not a request for information",
            "spam": "Unsolicited advertising, self-promotion, follower selling, or "
            "promotional links; not ordinary cheering, repeated emotes, or a useful link",
        },
    ),
    "toxic": Noul(
        instructions="Is this message insulting, hateful or harassing towards someone?",
        criteria=NoulCriteria(
            true="Insults, slurs, threats or personal attacks on the streamer or another viewer",
            false="Friendly, neutral, or light banter with no target",
        ),
    ),
    "spoiler": Noul(
        instructions="Does this message reveal a plot point or ending of the game being played?"
    ),
}
```

## Classify one message

The `classify()` function below builds the state from one message and sends the request.
The cache saves each answer under a key made from the state and the questions, written
out as JSON. Editing a question changes that key, so the next run sends a new request
instead of replaying the old answer.

```python expandable theme={null}
def classify(user: str, text: str, stream: dict | None = None) -> dict:
    state = {
        "stream": STREAM if stream is None else stream,
        "message": {"user": user, "text": text},
    }
    questions = {key: q.model_dump(mode="json", exclude_none=True) for key, q in QUESTIONS.items()}
    return _ask(state, questions)


@json_cache
def _ask(state: dict, questions: dict) -> dict:
    if not os.environ.get("TYPESAFE_API_KEY"):
        raise RuntimeError(
            "Set TYPESAFE_API_KEY for a live request, or put the cookbook's "
            "json_cache.json beside your script (in the working directory for a notebook)."
        )
    started = perf_counter()
    response = client.system_one(state=state, questions=questions, model=TYPESAFE_MODEL)
    category = response.answers["category"]
    return {
        "category": category.choice,
        "probabilities": dict(category.probabilities),
        "toxic": response.answers["toxic"].noul,
        "spoiler": response.answers["spoiler"].noul,
        "model": response.model,
        "seconds": round(perf_counter() - started, 2),
        "input_tokens": response.usage.input_tokens,
    }


def show(user: str, text: str) -> None:
    result = classify(user, text)
    print(f"{user}: {text}")
    for label, p in sorted(result["probabilities"].items(), key=lambda kv: -kv[1]):
        print(f"  {label:<13}{p:5.2f}  {'#' * round(p * 30)}".rstrip())
    print(f"  {'toxic':<13}{result['toxic']:5.2f}")
    print(f"  {'spoiler':<13}{result['spoiler']:5.2f}\n")


show("backseat_bert", "go left, there's a site of grace behind the tree")
show("LoreHound", "wait till you find out Ranni planned the Night of Black Knives")
show("cozy_cat", "you're so bad at this boss lmao, love you tho")
```

```
backseat_bert: go left, there's a site of grace behind the tree
  backseat      1.00  ##############################
  question      0.00
  hype          0.00
  conversation  0.00
  spam          0.00
  toxic         0.02
  spoiler       0.09

LoreHound: wait till you find out Ranni planned the Night of Black Knives
  conversation  0.57  #################
  backseat      0.42  #############
  hype          0.01
  spam          0.00
  question      0.00
  toxic         0.03
  spoiler       0.94

cozy_cat: you're so bad at this boss lmao, love you tho
  conversation  0.81  ########################
  hype          0.18  #####
  backseat      0.01
  question      0.00
  spam          0.00
  toxic         0.21
  spoiler       0.02
```

The backseat advice comes back as `backseat` at 1.00, with low `toxic` and `spoiler`. The
Night of Black Knives message narrowly favors `conversation` over `backseat`, and the
`spoiler` question catches it. The last message reads like an insult, but `toxic` stays
low. With "love you tho" on the end, it fits the "light banter" description in the
question.

## Decide what the viewer sees

The `decide()` function below only reads the answers, it doesn't send requests. It checks
three things and decides what to do based on a set of rules:

1. A message at or above `TOXIC_AT` is hidden.
2. A message whose category has the rule `hide` is hidden.
3. A message at or above `SPOILER_AT` is blurred.

Any message left gets the rule for its category.

On the sample messages, every toxic probability is 0.97 or higher or 0.24 or lower, and
every spoiler probability 0.94 or higher or 0.20 or lower, so any threshold between those
gives the same result here. Chat from your own channel will land in between; check both
thresholds against it before using them live.

```python theme={null}
RULES = {
    "question": "highlight",
    "hype": "show",
    "conversation": "show",
    "backseat": "hide",
    "spam": "hide",
}
TOXIC_AT = 0.7  # hide at or above this chance of toxic
SPOILER_AT = 0.7  # blur at or above this chance of a spoiler


def decide(result: dict, rules: dict = RULES) -> str:
    if result["toxic"] >= TOXIC_AT:
        return "hide (toxic)"
    action = rules[result["category"]]
    if action == "hide":
        return f"hide ({result['category']})"
    if result["spoiler"] >= SPOILER_AT:
        return "blur (spoiler)"
    return action
```

## Filter the whole chat

The three messages above get cached, leaving 26 new requests on a first live run.
No message depends on another, so the requests run
eight at a time, and `pool.map` returns the answers in chat order.

The chat prints below as the viewer sees it. A hidden message shows only the reason it was
hidden, a blurred one shows only its author, and highlighted questions are marked with
`>>`. The label on the right of each line is the `category` answer.

```python theme={null}
with ThreadPoolExecutor(max_workers=8) as pool:  # 29 requests, one per message, 8 at once
    results = list(pool.map(lambda message: classify(*message), CHAT))

counts: dict[str, int] = {}
for (user, text), result in zip(CHAT, results):
    action = decide(result)
    counts[action] = counts.get(action, 0) + 1
    if action.startswith("hide"):
        line = f"   · hidden, {action[6:-1]}"
    elif action == "blur (spoiler)":
        line = f"   {user}: ░░░░░░░░ spoiler"
    else:
        mark = {"highlight": ">>", "dim": "..", "show": "  "}[action]
        line = f"{mark} {user}: {text}"
    print(f"{line[:78]:<80}{result['category']}")

print()
for action, n in sorted(counts.items(), key=lambda kv: -kv[1]):
    print(f"{action:<20}{n:>3}")
```

```text expandable theme={null}
   NightOwl_22: hi chat, first time catching a stream live                      conversation
   ggwp_andy: PogChamp PogChamp PogChamp                                        hype
>> mira_plays: how many hours have you played so far?                           question
   tarnished_tom: this area looks so good at night                              conversation
   · hidden, backseat                                                           backseat
   · hidden, spam                                                               spam
   LoreHound: ░░░░░░░░ spoiler                                                  conversation
   kappa_kev: LUL LUL LUL                                                       hype
>> sunny_d: are you going to do a no-hit run after this?                        question
   · hidden, toxic                                                              conversation
   cozy_cat: the music in this area is so good                                  conversation
   · hidden, backseat                                                           backseat
   mira_plays: W streamer                                                       hype
   ggwp_andy: GG that was insane                                                hype
>> quiet_quinn: anyone else watching from Brazil?                               question
>> tarnished_tom: what build are you going for?                                 question
   LoreHound: ░░░░░░░░ spoiler                                                  conversation
   kappa_kev: chat is wild today lol                                            conversation
   · hidden, backseat                                                           backseat
   · hidden, toxic                                                              conversation
   cozy_cat: you're so bad at this boss lmao, love you tho                      conversation
>> sunny_d: who is the final boss?                                              question
   ggwp_andy: LETS GOOOO                                                        hype
   NightOwl_22: i just got this game too, it's so hard                          conversation
   · hidden, spam                                                               spam
   quiet_quinn: dodge rolling through that was clean                            hype
>> mira_plays: is the DLC worth it?                                             question
   cozy_cat: your character looks so cool                                       conversation
   NightOwl_22: this boss took me 40 tries lol                                  conversation

show                 14
highlight             6
hide (backseat)       3
hide (spam)           2
blur (spoiler)        2
hide (toxic)          2
```

That is the whole filter: `QUESTIONS`, `classify()`, and `decide()`. To run it on your own
chat, replace `STREAM` and `CHAT`, or pass a different `stream` to `classify()` for each
channel.

If you hit a rate
limit, lower `max_workers` and run again; completed answers are already cached.
Here, `pool.map()` preserves chat order, so each result matches its message by position
in the list. In a live integration, you can instead keep the platform's message ID or a
reference to the message's page element alongside each request to update the right
message when its answers arrive.

## Change a rule without a new request

The answers describe the message, and `decide()` turns them into an action. The example
below hides hype (cheering and emote-only lines) and dims conversation, reusing the 29
results from the step above.

```python theme={null}
QUIET = RULES | {"hype": "hide", "conversation": "dim"}

changed = 0
for (user, text), result in zip(CHAT, results):
    before, after = decide(result), decide(result, QUIET)
    if before != after:
        changed += 1
        print(f"{user + ': ' + text:<62.62}  {before:<10} -> {after}")
print(f"\n{changed} messages changed, 0 new requests")
```

```
NightOwl_22: hi chat, first time catching a stream live         show       -> dim
ggwp_andy: PogChamp PogChamp PogChamp                           show       -> hide (hype)
tarnished_tom: this area looks so good at night                 show       -> dim
kappa_kev: LUL LUL LUL                                          show       -> hide (hype)
cozy_cat: the music in this area is so good                     show       -> dim
mira_plays: W streamer                                          show       -> hide (hype)
ggwp_andy: GG that was insane                                   show       -> hide (hype)
kappa_kev: chat is wild today lol                               show       -> dim
cozy_cat: you're so bad at this boss lmao, love you tho         show       -> dim
ggwp_andy: LETS GOOOO                                           show       -> hide (hype)
NightOwl_22: i just got this game too, it's so hard             show       -> dim
quiet_quinn: dodge rolling through that was clean               show       -> hide (hype)
cozy_cat: your character looks so cool                          show       -> dim
NightOwl_22: this boss took me 40 tries lol                     show       -> dim

14 messages changed, 0 new requests
```

## Before you use it on a live channel

* **Each message waits for its answer.** Requests in this cookbook took a median of about
  0.4 seconds, so a new line appears in chat before its answer comes back. Either hide
  each new line until its answer arrives, or accept that a toxic message is on screen
  for that long.
* **One request at a time can't keep up with a busy chat.** Run several requests at once,
  such as the eight in *Filter the whole chat*.
* **At the time this cookbook was published, Jev was trained mainly on English.** It
  accepted other languages but answered them less accurately, so expect more misses on a
  non-English channel.
* **A winning category can still be uncertain.** This example always applies the winning
  label's rule. Before using it live, choose how to handle close category probabilities
  and Noul values near 0.5. You could flag those messages for review or leave them visible
  rather than hide them automatically. Test that policy on your own channel's chat.
* **The spoiler check has no record of the streamer's progress.** It uses the game title
  and the model's knowledge to identify likely plot revelations, not whether this viewer
  or streamer already knows them. To filter only unseen plot points, supply the current
  progress and relevant plot information, then adapt the question to use that context.

## Open it in the playground

The link below opens the playground with the state for the backseat message and the three
questions filled in. Run the call live there, or edit the questions and run it again.

```python theme={null}
playground_link = make_playground_link(
    {"stream": STREAM, "message": {"user": CHAT[4][0], "text": CHAT[4][1]}},
    QUESTIONS,
    models=[TYPESAFE_MODEL],
)
# Print a usable URL in a script; render a clickable link in a notebook.
if "__file__" in globals():
    print(f"Open the state + questions in the TypeSafe playground:\n{playground_link}")
else:
    display(Markdown(f"🔗 [Open the state + questions in the TypeSafe playground]({playground_link})"))
```

<a href="https://console.typesafe.ai/playground#share/N4IgJg9gxgrgtgUwHYBcAqCAeKQC4AEIwAOiAM4oBOCAhnKQSSCgJYoA2CD+pAou2GT4ASiyQBzfADMWlCvgAO7GgE8UAC0oQY49QEJ8AOQj4yCiC05zFnGmS4gANDxDi6DgnwFDRE0gF9nUkQyMhpxD3wmGHtKblIAIxooAGt7GhQAfQSEShRSIOYsfLwXcRNOKRRnDVyEAHIyfBpTNgR8CCl8cUpk9pz1MTB8WpHqB39-J0IFLTgFFDIMbFKiUigMhHLKFW4mFBUFSPX1CygHQrEKShgoVggkMniQAHVBqHV8DZQtiB38HLyQRkKCUFiAkbqdpwGhiRQwSjmewdLoAAxCYQiADofthUQB+AouUFtME0PakACOMAQFBYD2eAEFusgYGJ2tRqbSUNI-vgxFI-jD7khpHNIe1rrREJQOrKPhlnEgIDy3IglKp+Y8qLcRU0FJo7AhhnZmvguXSHnKzbMIHAVfSkDR2Io2B8iaR1IdjiAAMJQ3JicTOajJPXOPnUI6bYYIe0-JoACgAChBxP66ApnAAZACq2ecAHFC84Xs5OItuhBqwBKADc+CjCFYIua7Ae7UgtPwyp5MJS7Q+CEDElMCjoHpAUAeADdcmERc8APKUMBiGj-BUoH6UCMKMSOsghhBKFi05wxBBSGAusjqDfG-DsMRpCOymhIFT4DHhdoAd1OZEYThBQESRTsIG7XtpDYCUOlqeVNm2M8nmmRJkjSWgSk8EBcyQTkaQoR81RPZQvxoMAZxYc4RgQdhn1HUYpXcWUAIyEYTEgZwxCgdgYDXUcrh1O5D0UQ17BNJoWgtEUG2gloCO5XlZQFIUMkdSczAnUpSDwsgIGfKA2hNSjclYMgg2cex2CkABaW140dZxBXoiA-1yUw6IY4NrQch0HmdJ8XzIOSVTlASNy-IcRx8psY3wOMVXPa0Wkva8XQYlIAkCFwUAgTBqIpZhvWeZUb0nISbhEh5UJwgBJJoNBYJofwiLUyBvVgJGce8fnS61716UIgw4v8NzAJp9MQDtCTQqcwR3FhyVKfYbh9OrHk6o9TD4uQak0LCmj5I45ACl0MhQDCjtFJiqGlDy+Q-FUoVlKiEHcuI5qkZ17GeAAxMFkDAdgVCVBAYCoZ03yC3QeSSVAPL-NhPmVEYNwiEpJkKMwLCsIqDiOUrtHYCrtSqvVngAEUgxrBha2lMQ5BA50ClolDC8wxB5PkgZGzo4JIgEEBGjUVGNWbJmmEAaH3AA1edHVWGcAEYpeshA7mNABZCBBHYMhSgAbRAAArZnbOVrFlYAZixAAGEAAF1-CAA">Open the state + questions in the TypeSafe playground →</a>
