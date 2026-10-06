<!-- Source: https://api.fantasypros.com/public/v2/docs | Fetched: 2026-10-05 via Firecrawl (markdown, main content) | Canonical spec: fantasypros_v2_public.yml -->

[![FantasyPros logo](https://images.fantasypros.com/images/branding/fantasypros-fullcolor-light-bg.svg)](https://secure.fantasypros.com/support-request/)

- Players
  - getPlayers
  - getCompare Players
- News & Injuries
  - getNews
  - getInjuries
- Rankings
  - getRankings
  - getConsensus Rankings
  - getExperts
- Projections
  - getNFL Projections
  - getMLB Projections
  - getNBA Projections
- Scoring & Lineups
  - getNFL Player Points
  - getMLB Lineups

[![redocly logo](https://cdn.redoc.ly/redoc/logo-mini.svg)API docs by Redocly](https://redocly.com/redoc/)

# FantasyPros Public API (2.0)

Download OpenAPI specification: [Download](https://api.fantasypros.com/public/v2/docs/fantasypros_v2_public.yml)

URL: [https://secure.fantasypros.com/support-request/](https://secure.fantasypros.com/support-request/)[Terms of Service](https://api.fantasypros.com/public/v2/terms-of-use)

This is the free limited public API. To request an API key, go to [https://secure.fantasypros.com/api-keys/request/](https://secure.fantasypros.com/api-keys/request/) and apply. The base url for this API is: [https://api.fantasypros.com/public/v2/json](https://api.fantasypros.com/public/v2/json). Need help? Request support at [https://secure.fantasypros.com/support-request/](https://secure.fantasypros.com/support-request/)

## [tag/Players](https://api.fantasypros.com/public/v2/docs\#tag/Players) Players

Player rosters, metadata, and head-to-head comparisons across all supported sports.

## [tag/Players/paths/~1{sport}~1players/get](https://api.fantasypros.com/public/v2/docs\#tag/Players/paths/~1{sport}~1players/get) Players

get/{sport}/players

test

https://api.fantasypros.com/public/v2/json/{sport}/players

##### Authorizations:

_api\_key_

##### path Parameters

|     |     |
| --- | --- |
| sport<br>required | string<br>Enum:"nfl""mlb""nba""nhl""pga""ncaaf"<br>Example: nfl<br>A key indicating a sport |

##### query Parameters

|     |     |
| --- | --- |
| player | integer<br>Default: null<br>Example: player=6880<br>A FantasyPros player ID to filter results on |
| update | string<br>Default: null<br>Example: update=2025-05-13<br>Only return players that have been updated since this date. Format YYYY-MM-DD |
| ecr | string<br>Default: null<br>Enum:"included""excluded"null<br>Example: ecr=included<br>A flag on whether to include or exclude players that are in consensus rankings. |
| external\_ids | string^(\\w+)((?:\\:\\w+)+)?$<br>Default: null<br>Enum:"yahoo""espn""cbs""rts""fanduel""draftkings""fantasydraft""rotogrinders""fleaflicker""rotowire""rotoworld""numberfire""fantrax""nfl""mfl""tsn""onroto""xmlteam""ffwc""mlbam""nba"null<br>Example: external\_ids=yahoo:espn:cbs<br>Colon-delimited string of external IDs to include in the player object |
| show | string<br>Default: null<br>Enum:"pos\_rank"null<br>Example: show=pos\_rank<br>Show the players positional consensus ranking in addition to overall |

### Responses

**200**

A successful response

##### Response Schema: application/json

|     |     |
| --- | --- |
| sport<br>required | string<br>NHLNBAMLBNFLNFL |
| count<br>required | integer |
| season<br>required | string |
| week<br>required | string |
| players<br>required | Array of objects (NFLPlayer) |

### Request samples

- cURL
- JavaScript
- Python

Copy

```
curl "https://api.fantasypros.com/public/v2/json/nfl/players?ecr=included&show=pos_rank" -H "x-api-key: YOUR_API_KEY"
```

### Response samples

- 200

Content type

application/json

Example

NFLMLBNBANHLNFL

Copy
Expand all  Collapse all

`{"sport": "NFL",

"count": 8660,

"season": 2025,

"week": 0,

"players": [{"player_id": 6880,\
\
"player_name": "Daniel Jones",\
\
"short_name": "D. Jones",\
\
"first_name": "Daniel",\
\
"last_name": "Jones",\
\
"reverse_name": "Jones, Daniel",\
\
"position_id": "QB",\
\
"positions": ["QB"\
\
],\
\
"team_id": "IND",\
\
"filename": "https://www.fantasypros.com/nfl/players/daniel-jones.php",\
\
"sportsdata_player_id": "1146776b-e591-4f81-8a56-459c1845bead",\
\
"rank_ecr": 314,\
\
"rank_adp": 314,\
\
"rank_ecr_pos": 314,\
\
"birthdate": "1997-05-27",\
\
"birthdatetime": 864691200,\
\
"age": 27,\
\
"rank_ecr_ppr": 314,\
\
"rank_ecr_half": 314,\
\
"rank_adp_ppr": 314,\
\
"rookie": "Y"\
\
}\
\
]

}`

## [tag/Players/paths/~1{sport}~1compare-players/get](https://api.fantasypros.com/public/v2/docs\#tag/Players/paths/~1{sport}~1compare-players/get) Compare Players

get/{sport}/compare-players

test

https://api.fantasypros.com/public/v2/json/{sport}/compare-players

Compare 2-4 players based on rankings

##### Authorizations:

_api\_key_

##### path Parameters

|     |     |
| --- | --- |
| sport<br>required | string<br>Enum:"nfl""mlb""nba""nhl""pga""ncaaf"<br>Example: nfl<br>A key indicating a sport |

##### query Parameters

|     |     |
| --- | --- |
| players<br>required | string (digitColon) ^(\\d+)((?:\\:\\d+)+)?$<br>Examples: <br>- players=7354 \- A single player<br>- players=7354:6880 \- Multiple players<br>Colon delimited list of FP player IDs to compare |
| position<br>required | NFLPositions (string) or MLBPositions (string) or NBAPositions (string) or NHLPositions (string) or NCAAFPositions (string) (SPORTPositions) |
| year | integer<br>Example: year=2025 |
| week | integer >= 0 <br>Example: week=0<br>NFL week to request injuries for. (NFL ONLY) |
| experts | string (digitColon) ^(\\d+)((?:\\:\\d+)+)?$<br>Examples: <br>- experts=232 \- A single expert<br>- experts=232:6633 \- Multiple multiple experts<br>Colon delimited list of expert IDs to compare |
| ranking\_type | string<br>Enum:"draft""weekly""ros"<br>Example: ranking\_type=draft<br>The name of the ranking type you wish to compare rankings for |
| details | string<br>Enum:"players""experts""all"<br>Example: details=all<br>Include details about experts, player or both in the response |

### Responses

**200**

A successful response

##### Response Schema: application/json

|     |     |
| --- | --- |
| sport<br>required | string (Sport keys) <br>A key indicating a sport<br>NFLMLBNBANHLNFL |
| year<br>required | string |
| week<br>required | string |
| position\_id<br>required | string |
| ranking\_type<br>required | string |
| rankings<br>required | object |
| players | object |
| experts | object |

### Request samples

- cURL
- JavaScript
- Python

Copy

```
curl "https://api.fantasypros.com/public/v2/json/nfl/compare-players?players=17240:23133&position=RB&ranking_type=draft&details=all" -H "x-api-key: YOUR_API_KEY"
```

### Response samples

- 200

Content type

application/json

Example

NFLMLBNBANHLNFL

Copy
Expand all  Collapse all

`{"sport": "NFL",

"year": 2025,

"week": 0,

"position_id": "RB",

"ranking_type": "draft",

"rankings": {"STD": {"17240": [{"expert_id": "6586",\
\
"rank": "1"\
\
},\
\
{"expert_id": "22",\
\
"rank": "1"\
\
},\
\
{"expert_id": "_0",\
\
"rank": "1"\
\
}\
\
],

"23133": [{"expert_id": "6586",\
\
"rank": "2"\
\
},\
\
{"expert_id": "22",\
\
"rank": "5"\
\
},\
\
{"expert_id": "_0",\
\
"rank": "2"\
\
}\
\
]

},

"PPR": {"17240": [{"expert_id": "6586",\
\
"rank": "1"\
\
},\
\
{"expert_id": "22",\
\
"rank": "1"\
\
},\
\
{"expert_id": "_0",\
\
"rank": "1"\
\
}\
\
],

"23133": [{"expert_id": "6586",\
\
"rank": "2"\
\
},\
\
{"expert_id": "22",\
\
"rank": "5"\
\
},\
\
{"expert_id": "_0",\
\
"rank": "2"\
\
}\
\
]

},

"HALF": {"17240": [{"expert_id": "6586",\
\
"rank": "1"\
\
},\
\
{"expert_id": "22",\
\
"rank": "1"\
\
},\
\
{"expert_id": "_0",\
\
"rank": "1"\
\
}\
\
],

"23133": [{"expert_id": "6586",\
\
"rank": "2"\
\
},\
\
{"expert_id": "22",\
\
"rank": "5"\
\
},\
\
{"expert_id": "_0",\
\
"rank": "2"\
\
}\
\
]

}

},

"players": {"17240": {"player_name": "Saquon Barkley",

"player_team_id": "PHI",

"player_position_id": "RB",

"player_page_url": "http://www.fantasypros.com/nfl/players/saquon-barkley.php"

},

"23133": {"player_name": "Bijan Robinson",

"player_team_id": "ATL",

"player_position_id": "RB",

"player_page_url": "http://www.fantasypros.com/nfl/players/bijan-robinson.php"

}

},

"experts": {"2": {"expert_name": "Christopher Harris",

"expert_display_name": "Christopher Harris - Harris Football",

"expert_twitter_url": "https://twitter.com/HarrisFootball",

"expert_source_id": "315",

"expert_source_name": "Harris Football",

"expert_source_url": "http://www.harrisfootball.com/"

},

"3": {"expert_name": "Eric Karabell",

"expert_display_name": "Eric Karabell - ESPN",

"expert_twitter_url": "https://twitter.com/",

"expert_source_id": "1",

"expert_source_name": "ESPN",

"expert_source_url": "http://espn.go.com/"

},

"4": {"expert_name": "Erik Kuselias",

"expert_display_name": "Erik Kuselias - ESPN",

"expert_twitter_url": "https://twitter.com/fantasyEK",

"expert_source_id": "1",

"expert_source_name": "ESPN",

"expert_source_url": "http://espn.go.com/"

}

}

}`

## [tag/News-and-Injuries](https://api.fantasypros.com/public/v2/docs\#tag/News-and-Injuries) News & Injuries

Breaking player news, impact analysis, and current injury statuses.

## [tag/News-and-Injuries/paths/~1{sport}~1news/get](https://api.fantasypros.com/public/v2/docs\#tag/News-and-Injuries/paths/~1{sport}~1news/get) News

get/{sport}/news

test

https://api.fantasypros.com/public/v2/json/{sport}/news

Returns player news updates by sport

##### Authorizations:

_api\_key_

##### path Parameters

|     |     |
| --- | --- |
| sport<br>required | string<br>Enum:"nfl""mlb""nba""nhl""pga""ncaaf"<br>Example: nfl<br>A key indicating a sport |

##### query Parameters

|     |     |
| --- | --- |
| MLBAMID | integer<br>Default: null<br>Example: MLBAMID=701350<br>A MLBAM player ID. Only used for MLB |
| fpid | integer<br>Default: null<br>Example: fpid=6880<br>A FantasyPros player id to filter returned news |
| limit | integer <= 100 <br>Default: 25<br>The number of news items to be returned |
| category | string<br>Default: null<br>Enum:"injury""recap""transaction""rumor""breaking"null<br>The type of news items to return |
| order\_by | string<br>Default: "created"<br>Enum:"updated""created"<br>The order by direction for the news items |

### Responses

**200**

A successful response

##### Response Schema: application/json

|     |     |
| --- | --- |
| sport<br>required | string |
| title<br>required | string |
| description<br>required | string |
| count<br>required | integer |
| items<br>required | Array of objects |

### Request samples

- cURL
- JavaScript
- Python

Copy

```
curl "https://api.fantasypros.com/public/v2/json/mlb/news?limit=25&category=injury" -H "x-api-key: YOUR_API_KEY"
```

### Response samples

- 200

Content type

application/json

Copy
Expand all  Collapse all

`{"sport": "MLB",

"title": "Fantasy Player News",

"description": "Breaking Fantasy Baseball player news along with the impact for fantasy managers",

"count": 25,

"items": [{"id": 51970,\
\
"created": "2025-05-12 07:29:02",\
\
"created_formated": "Mon, May 12th 7:29am UTC",\
\
"author": "Ari Koslow",\
\
"player_id": 6880,\
\
"team_id": "IND",\
\
"title": "Caleb Freeman optioned to Triple-A",\
\
"sport_id": "MLB",\
\
"categories": ["Commentary",\
\
"News"\
\
],\
\
"link": "https://www.fantasypros.com/mlb/news/519470/caleb-freeman-optioned-to-triple-a.php",\
\
"desc": "The White Sox optioned RHP Caleb Freeman to Triple-A Charlotte.",\
\
"impact": "Freeman is sent back down one week after he had his contract selected. The White Sox needed to open a roster spot after claiming Yoendys Gómez off waivers from the Dodgers."\
\
}\
\
]

}`

## [tag/News-and-Injuries/paths/~1{sport}~1injuries/get](https://api.fantasypros.com/public/v2/docs\#tag/News-and-Injuries/paths/~1{sport}~1injuries/get) Injuries

get/{sport}/injuries

test

https://api.fantasypros.com/public/v2/json/{sport}/injuries

Returns details about player injuries.

##### Authorizations:

_api\_key_

##### path Parameters

|     |     |
| --- | --- |
| sport<br>required | string<br>Enum:"nfl""mlb""nba""nhl""pga""ncaaf"<br>Example: nfl<br>A key indicating a sport |

##### query Parameters

|     |     |
| --- | --- |
| year | integer<br>Example: year=2025 |
| week | integer >= 0 <br>Example: week=0<br>NFL week to request injuries for. (NFL ONLY) |
| include\_minors | string<br>Value:"true"<br>Example: include\_minors=true<br>Include minor league players as injury statuses (MLB ONLY) |
| include\_probabilities | string<br>Value:"true"<br>Example: include\_probabilities=true<br>Include players that might not have an injury status but are on the practice report. (NFL ONLY) |
| team\_id | string (wordColon) ^(\\w+)((?:\\:\\w+)+)?$<br>Examples: <br>- team\_id=SF \- A single team\_id<br>- team\_id=SF:MIN \- Multiple team\_ids<br>Colon delimited list of team\_ids to filter response by |
| player\_ids | string (digitColon) ^(\\d+)((?:\\:\\d+)+)?$<br>Examples: <br>- player\_ids=7354 \- A single player<br>- player\_ids=7354:6880 \- Multiple players<br>Colon delimited list of FP player IDs to filter response by |

### Responses

**200**

A successful response

##### Response Schema: application/json

|     |     |
| --- | --- |
| sport<br>required | string (Sport keys) <br>A key indicating a sport<br>NFLMLBNBANHLNFL |
| count<br>required | integer |
| injuries<br>required | Array of objects |

### Request samples

- cURL
- JavaScript
- Python

Copy

```
curl "https://api.fantasypros.com/public/v2/json/nfl/injuries?year=2025&week=1" -H "x-api-key: YOUR_API_KEY"
```

### Response samples

- 200

Content type

application/json

Example

NFLMLBNBANHLNFL

Copy
Expand all  Collapse all

`{"sport": "NFL",

"count": 509,

"injuries": [{"player_id": 15901,\
\
"yahoo_id": "5529",\
\
"name": "Brandon Saad",\
\
"injury_type": "Lower body",\
\
"comment": "Saad will be a game-time decision for Wednesday's (May 14) Game 5 against the Oilers, per SinBin.vegas.",\
\
"injury_update_date": "2025-05-14",\
\
"status": "Questionable",\
\
"status_short": "O",\
\
"filename": "jamarr-chase.php",\
\
"ir_weeks": [4,\
\
5,\
\
6\
\
],\
\
"probability_of_playing": "0.88797",\
\
"practice_1": "Limit",\
\
"practice_2": "Limit",\
\
"practice_3": "Full",\
\
"practice_report_injury_type": "Abdomen",\
\
"team_practice_1_submitted": true,\
\
"team_practice_2_submitted": true,\
\
"team_practice_3_submitted": true\
\
}\
\
]

}`

## [tag/Rankings](https://api.fantasypros.com/public/v2/docs\#tag/Rankings) Rankings

Expert rankings, consensus rankings, and expert profiles by position and scoring format.

## [tag/Rankings/paths/~1{sport}~1{season}~1rankings/get](https://api.fantasypros.com/public/v2/docs\#tag/Rankings/paths/~1{sport}~1{season}~1rankings/get) Rankings

get/{sport}/{season}/rankings

test

https://api.fantasypros.com/public/v2/json/{sport}/{season}/rankings

Returns player rankings for multiple ranking types and positions.

##### Authorizations:

_api\_key_

##### path Parameters

|     |     |
| --- | --- |
| season<br>required | integer (Season)  >= 2012 <br>Example: 2024<br>A numerical season in the format YYYY |
| sport<br>required | string<br>Enum:"nfl""mlb""nba""nhl""pga""ncaaf"<br>Example: nfl<br>A key indicating a sport |

##### query Parameters

|     |     |
| --- | --- |
| week | integer >= 0 <br>Example: week=0 |
| player | integer<br>Default: null<br>Example: player=6880<br>A FantasyPros player ID to filter results on |
| filters | string^(\\d+)((?:\\:\\d+)+)?$<br>Example: filters=345:332:12<br>A comma delimited string of expert IDs filter rankings by |
| min | string<br>Default: "false"<br>Enum:"true""false"<br>Example: min=true<br>Controls the level of player information returned in the response. A value of `true` will return less player information for a smaller response. |
| range | string<br>Default: "false"<br>Enum:"true""false"<br>Example: range=true<br>Display the min and max rank for a player |
| rankstats | string<br>Default: "false"<br>Enum:"true""false"<br>Example: rankstats=true<br>Display the average and standard deviation of a ranking |
| type | string<br>Value:"DRAFTERS"<br>Example: type=DRAFTERS<br>Include Drafters ranking type (NFL ONLY) |
| site\_eligibility | string or integer<br>Enum:"AO""E""Y""C""CBSSP""FANSP"123103122<br>Use this fantasy site's position eligibility (MLB ONLY) |

### Responses

**200**

A successful response

##### Response Schema: application/json

|     |     |
| --- | --- |
| sport<br>required | string (Sport keys) <br>A key indicating a sport<br>NFLMLBNBANHLNFL |
| count<br>required | integer |
| season<br>required | string |
| week<br>required | string |
| experts<br>required | object<br>Expert count for many different ranking types (NFL ONLY) |
| players<br>required | Array of objects |
| ecr\_experts | object<br>An object containing expert IDs associated with each ranking type and position |

### Request samples

- cURL
- JavaScript
- Python

Copy

```
curl "https://api.fantasypros.com/public/v2/json/nfl/2025/rankings?week=0&range=true" -H "x-api-key: YOUR_API_KEY"
```

### Response samples

- 200

Content type

application/json

Example

NFLMLBNBANHLNFL

Copy
Expand all  Collapse all

`{"sport": "NFL",

"count": 509,

"season": 2024,

"week": "0",

"experts": {"WK1-STD": {"QB": 204,

"RB": 195,

"WR": 195,

"TE": 195,

"FLX": 190,

"OP": 188,

"K": 144,

"DST": 148,

"IDP": 27,

"DL": 29,

"LB": 29,

"DB": 29

},

"WK1-PPR": {"RB": 197,

"WR": 197,

"TE": 196,

"FLX": 190,

"OP": 189

},

"WK1-HALF": {"RB": 199,

"WR": 199,

"TE": 198,

"FLX": 193,

"OP": 190

},

"STD": {"ALL": 225,

"QB": 232,

"RB": 224,

"WR": 224,

"TE": 224,

"OP": 217,

"K": 173,

"DST": 163,

"IDP": 32,

"DL": 33,

"LB": 33,

"DB": 33,

"TQB": 1,

"TRB": 1,

"TWR": 1,

"TTE": 1,

"TK": 1,

"TOL": 3,

"HC": 1

},

"PPR": {"ALL": 223,

"RB": 223,

"WR": 223,

"TE": 223,

"OP": 215

},

"HALF": {"ALL": 227,

"RB": 228,

"WR": 228,

"TE": 228,

"OP": 220

},

"DYN": {"ALL": 55,

"QB": 54,

"RB": 54,

"WR": 55,

"TE": 54,

"K": 25,

"DST": 22,

"OP": 55,

"IDP": 7,

"DL": 8,

"LB": 8,

"DB": 8

},

"BB-HALF": {"ALL": 18,

"QB": 19,

"RB": 19,

"WR": 19,

"TE": 19,

"FLX": 18,

"DST": 11

}

},

"players": [{"id": 15901,\
\
"player_name": "Al Horford",\
\
"short_name": "A. Horford",\
\
"first_name": "Al",\
\
"last_name": "Horford",\
\
"reverse_name": "Horford, Al",\
\
"position_id": "PF, C",\
\
"positions": ["PF",\
\
"C"\
\
],\
\
"team_id": "BOS",\
\
"filename": "http://www.fantasypros.com/nba/players/al-horford.php",\
\
"rank": {"ECR": {"property1": 115,\
\
"property2": 115\
\
},\
\
"ECR_MIN": {"property1": 115,\
\
"property2": 115\
\
},\
\
"ECR_MAX": {"property1": 115,\
\
"property2": 115\
\
},\
\
"ECR_AVG": {"property1": 115,\
\
"property2": 115\
\
},\
\
"ECR_STD": {"property1": 115,\
\
"property2": 115\
\
},\
\
"ADP": {"ALL": 0\
\
}\
\
}\
\
}\
\
],

"ecr_experts": { }

}`

## [tag/Rankings/paths/~1{sport}~1{season}~1consensus-rankings/get](https://api.fantasypros.com/public/v2/docs\#tag/Rankings/paths/~1{sport}~1{season}~1consensus-rankings/get) Consensus Rankings

get/{sport}/{season}/consensus-rankings

test

https://api.fantasypros.com/public/v2/json/{sport}/{season}/consensus-rankings

Returns detailed consensus player rankings by ranking type and position.

##### Authorizations:

_api\_key_

##### path Parameters

|     |     |
| --- | --- |
| season<br>required | integer (Season)  >= 2012 <br>Example: 2024<br>A numerical season in the format YYYY |
| sport<br>required | string<br>Enum:"nfl""mlb""nba""nhl""pga""ncaaf"<br>Example: nfl<br>A key indicating a sport |

##### query Parameters

|     |     |
| --- | --- |
| position<br>required | NFLPositions (string) or MLBPositions (string) or NBAPositions (string) or NHLPositions (string) or NCAAFPositions (string) (SPORTPositions) |
| type | NFLRankingTypes (string) or MLBRankingTypes (string) or NBARankingTypes (string) or NHLRankingTypes (string) (SPORTRankingTypes) |
| scoring | NFLScoringTypes (string) or NBAScoringTypes (string) (SPORTScoringTypes) |
| week | integer >= 0 <br>Example: week=0 |
| include\_idp | string<br>Value:"true"<br>Example: include\_idp=true |
| filters | string^(\\d+)((?:\\:\\d+)+)?$<br>Example: filters=345:332:12<br>A comma delimited string of expert IDs filter rankings by |
| experts | string<br>Enum:"show""available"<br>Example: experts=show<br>Include details about the experts included in the ranking set |

### Responses

**200**

A successful response

##### Response Schema: application/json

|     |     |
| --- | --- |
| sport<br>required | string (Sport keys) <br>A key indicating a sport<br>NFLMLBNBANHLNFL |
| year<br>required | string |
| week<br>required | string |
| filters<br>required | string or null |
| count<br>required | integer |
| total\_experts<br>required | integer |
| last\_updated<br>required | string\\d+\\/\\d+ |
| last\_updated\_ts<br>required | integer |
| players<br>required | Array of objects (NFLRankingPlayer) |
| scoring<br>required | string (NFLScoringTypes) <br>Enum:"STD""PPR""HALF" |
| position\_id<br>required | string (NFLPositions) <br>Enum:"ALL""FLX""OP""QB""RB""WR""TE""K""DST""IDP""DL""LB""DB""TK""TQB""TRB""TWR""TTE""TOL""HC""P""RK""OT""OG""IOL""C""IDL""DE""DT""CB""S" |
| ranking\_type\_name<br>required | string (NFLRankingTypes) <br>Enum:"WW""WAIVER""ROS""DRAFT""PRESEASON""SLEEPERS""ADP""BEST""PROSPECT""PRO""DEVY""ROOKIES""DYNADP""RKADP""BESTADP""DYNASTY""PRE""DRAFTERS""PRO""PROSPECT""MOCK" |
| expert\_pub | object<br>Map of expert-ID (as string) → publication timestamp |
| expert\_name | object<br>Map of expert-ID → expert’s full name |
| expert\_twitter | object<br>Map of expert-ID → Twitter handle |
| experts\_available | object<br>Metadata about which experts are available and when it was last updated |

**400**

400 response

### Request samples

- cURL
- JavaScript
- Python

Copy

```
curl "https://api.fantasypros.com/public/v2/json/nfl/2025/consensus-rankings?position=RB&scoring=PPR&experts=show" -H "x-api-key: YOUR_API_KEY"
```

### Response samples

- 200
- 400

Content type

application/json

Example

NFLMLBNBANHLNFL

Copy
Expand all  Collapse all

`{"sport": "NFL",

"year": "2023",

"week": "0",

"filters": "6297,6318,375,4317,908,5446",

"count": 40,

"total_experts": 25,

"last_updated": "04/15",

"last_updated_ts": 1747173394,

"expert_pub": {"7": "2022-04-06 13:10:02",

"9": "2022-04-07 15:59:20",

"22": "2022-04-01 20:36:52"

},

"expert_name": {"3": "Eric Karabell",

"5": "Staff Composite",

"6": "Brandon Funston"

},

"expert_twitter": {"5": "ESPN",

"6": "BrandonFunston",

"7": "andybehrens"

},

"experts_available": {"total": 48,

"included": [9,\
\
174,\
\
2420,\
\
759,\
\
2475,\
\
394,\
\
406,\
\
203,\
\
766,\
\
3040\
\
],

"excluded": [ ],

"ineligible": [ ],

"last_update": 1649347160

},

"players": [{"player_id": 19217,\
\
"player_name": "Jonathan Taylor",\
\
"sportsdata_id": "925195a4-06ba-4e37-ae7d-a3d6a5419139",\
\
"player_team_id": "IND",\
\
"player_position_id": "RB",\
\
"player_positions": "RB",\
\
"player_short_name": "J. Taylor",\
\
"player_eligibility": "RB",\
\
"player_yahoo_positions": "RB",\
\
"player_page_url": "https://www.fantasypros.com/nfl/players/jonathan-taylor.php",\
\
"player_filename": "jonathan-taylor.php",\
\
"player_yahoo_id": "32711",\
\
"cbs_player_id": "2866395",\
\
"player_bye_week": "14",\
\
"player_owned_avg": 98.2,\
\
"player_owned_espn": 99.5,\
\
"player_owned_yahoo": 100,\
\
"player_ecr_delta": null,\
\
"rank_ecr": 1,\
\
"pos_rank": "RB1",\
\
"tier": 1\
\
}\
\
],

"scoring": "STD",

"position_id": "QB",

"ranking_type_name": "ROS"

}`

## [tag/Rankings/paths/~1{sport}~1{season}~1rankings~1experts/get](https://api.fantasypros.com/public/v2/docs\#tag/Rankings/paths/~1{sport}~1{season}~1rankings~1experts/get) Experts

get/{sport}/{season}/rankings/experts

test

https://api.fantasypros.com/public/v2/json/{sport}/{season}/rankings/experts

Returns detailed information on experts.

##### Authorizations:

_api\_key_

##### path Parameters

|     |     |
| --- | --- |
| season<br>required | integer (Season)  >= 2012 <br>Example: 2024<br>A numerical season in the format YYYY |
| sport<br>required | string<br>Enum:"nfl""mlb""nba""nhl""pga""ncaaf"<br>Example: nfl<br>A key indicating a sport |

##### query Parameters

|     |     |
| --- | --- |
| position | NFLPositions (string) or MLBPositions (string) or NBAPositions (string) or NHLPositions (string) or NCAAFPositions (string) (SPORTPositions) |
| type | NFLRankingTypes (string) or MLBRankingTypes (string) or NBARankingTypes (string) or NHLRankingTypes (string) (SPORTRankingTypes) |
| scoring | NFLScoringTypes (string) or NBAScoringTypes (string) (SPORTScoringTypes) |
| include\_overall | string<br>Value:"true"<br>Example: include\_overall=true<br>Include overall ranking accuracy in response |

### Responses

**200**

200 response

##### Response Schema: application/json

|     |     |
| --- | --- |
| sport<br>required | string (Sport keys) <br>A key indicating a sport<br>NFLMLBNBANHLNFL |
| count<br>required | integer |
| season<br>required | string |
| week<br>required | string |
| accuracy\_weekly\_season<br>required | string |
| accuracy\_draft\_season<br>required | string |
| experts<br>required | Array of objects |
| accuracy\_weekly\_last\_season<br>required | string |

### Request samples

- cURL
- JavaScript
- Python

Copy

```
curl "https://api.fantasypros.com/public/v2/json/nfl/2025/rankings/experts?position=QB&include_overall=true" -H "x-api-key: YOUR_API_KEY"
```

### Response samples

- 200

Content type

application/json

Example

NFLMLBNBANHLNFL

Copy
Expand all  Collapse all

`{"sport": "NFL",

"count": 206,

"season": 2024,

"week": 1,

"accuracy_weekly_season": 2024,

"accuracy_draft_season": 2023,

"experts": {"expert_id": 93,

"name": "Jared Smola",

"source": "Draft Sharks",

"url": "http://draftsharks.com/",

"twitter": "SmolaDS",

"bio": "Jared has been with Draft Sharks since 2007, helping the site capture numerous expert league titles and accuracy awards.  He got his start in fantasy football at the tender age of 9, winning a championship on the legs of Barry Sanders.  Jared is known as \"Rain Man\" around the Draft Sharks office for his tight-knit relationship with projections.",

"accuracy_weekly": {"ALL": 27,

"QB": 39,

"RB": 30,

"WR": 40,

"TE": 28,

"K": 5,

"DST": 37

},

"accuracy_draft": {"ALL": 35,

"DST": 63,

"K": 27,

"QB": 64,

"RB": 36,

"TE": 215,

"WR": 46

},

"accuracy_weekly_last_season": {"ALL": 51,

"QB": 54,

"RB": 32,

"WR": 63,

"TE": 109,

"K": 43,

"DST": 89

},

"positions": {"QB": "2024-09-08 16:54:28",

"DST": "2024-09-08 16:54:29",

"K": "2024-09-08 16:54:29",

"RB": "2024-09-08 16:54:29",

"WR": "2024-09-08 16:54:29",

"TE": "2024-09-08 16:54:29",

"FLX": "2024-09-08 16:54:29",

"OP": "2024-09-08 16:54:29"

},

"default": {"QB": true,

"DST": true,

"K": true,

"RB": true,

"WR": true,

"TE": true,

"FLX": true,

"OP": true

}

},

"accuracy_weekly_last_season": 2022

}`

## [tag/Projections](https://api.fantasypros.com/public/v2/docs\#tag/Projections) Projections

Projected statistics for NFL, MLB, and NBA players.

## [tag/Projections/paths/~1nfl~1{season}~1projections/get](https://api.fantasypros.com/public/v2/docs\#tag/Projections/paths/~1nfl~1{season}~1projections/get) NFL Projections

get/nfl/{season}/projections

test

https://api.fantasypros.com/public/v2/json/nfl/{season}/projections

Returns player projections.

##### Authorizations:

_api\_key_

##### path Parameters

|     |     |
| --- | --- |
| season<br>required | integer (Season)  >= 2012 <br>Example: 2024<br>A numerical season in the format YYYY |

##### query Parameters

|     |     |
| --- | --- |
| position<br>required | NFLPositions (string) or MLBPositions (string) or NBAPositions (string) or NHLPositions (string) or NCAAFPositions (string) (SPORTPositions) |
| filters | string^(\\d+)((?:\\:\\d+)+)?$<br>Example: filters=345:332:12<br>A comma delimited string of expert IDs filter rankings by |
| experts | string<br>Value:"show"<br>Example: experts=show<br>Include details about the experts included in the projection set |
| positions | string (wordColon) ^(\\w+)((?:\\:\\w+)+)?$<br>Colon delimited list of positions to filter response by |
| players | string (digitColon) ^(\\d+)((?:\\:\\d+)+)?$<br>Examples: <br>- players=7354 \- A single player<br>- players=7354:6880 \- Multiple players<br>Colon delimited list of FP player IDs to filter response by |
| week | integer<br>Example: week=4<br>The week to request projections for use week = 0 for preseason projections. |
| ros | boolean<br>Default: false<br>Example: ros=true<br>Return Rest of Season projections |
| r2p | boolean<br>Default: false<br>Example: r2p=true<br>Return FantasyPros rankings-to-projections (R2P) projections built from the weekly consensus rankings. Without a week, next week is used once its rankings and R2P projections exist for every requested position. Expert filters and week ranges are ignored. Not available for team positions, week 0, or with ros, league\_key or scoring\_system. |

### Responses

**200**

200 response

##### Response Schema: application/json

|     |     |
| --- | --- |
| season<br>required | string |
| week<br>required | string |
| count<br>required | string |
| positions<br>required | string |
| scoring<br>required | string |
| experts<br>required | Array of integers<br>An array containing the expert\_ids included in the projection data |
| players<br>required | Array of objects |
| expert\_pub | object (ExpertPublished) <br>Map of expert ID (as string) → timestamp the expert last published. Only present when experts=show |
| expert\_names | object (ExpertNames) <br>Map of expert ID (as string) → expert's full name. Only present when experts=show |
| expert\_source\_name | object (ExpertSourceName) <br>Map of expert ID (as string) → name of the site or source the expert belongs to. Only present when experts=show |
| expert\_twitter | object (ExpertTwitter) <br>Map of expert ID (as string) → expert's Twitter handle. Only present when experts=show |

### Request samples

- cURL
- JavaScript
- Python

Copy

```
curl "https://api.fantasypros.com/public/v2/json/nfl/2025/projections?position=RB&week=4" -H "x-api-key: YOUR_API_KEY"
```

### Response samples

- 200

Content type

application/json

Copy
Expand all  Collapse all

`{"season": 2025,

"week": 0,

"count": 194,

"positions": "RB",

"scoring": "STD",

"experts": [9,\
\
22,\
\
285,\
\
552,\
\
1139\
\
],

"expert_pub": {"71": "2025-09-02 13:10:02",

"72": "2025-09-03 15:59:20"

},

"expert_names": {"71": "Site Projections",

"72": "Site Projections"

},

"expert_source_name": {"71": "ESPN",

"72": "Yahoo! Sports"

},

"expert_twitter": {"71": "ESPN",

"72": "yahoosports"

},

"players": [{"fpid": 17240,\
\
"mflid": 13604,\
\
"name": "Saquon Barkley",\
\
"position_id": "RB",\
\
"team_id": "PHI",\
\
"filename": "saquon-barkley.php",\
\
"stats": [{"points": 371.11,\
\
"points_ppr": 371.11,\
\
"points_half": 371.11,\
\
"pass_att": 436.85,\
\
"pass_cmp": 294.13,\
\
"pass_yds": 3723.59,\
\
"pass_tds": 32.07,\
\
"pass_ints": 7.47,\
\
"pass_yds_300": 0,\
\
"pass_yds_400": 0,\
\
"rush_att": 137.42,\
\
"rush_yds": 866.91,\
\
"rush_tds": 3.94,\
\
"rush_yds_100": 0,\
\
"rush_yds_200": 0,\
\
"scrimage_yards_100": 0,\
\
"scrimage_yards_200": 0,\
\
"fumbles": 4.47,\
\
"ret_tds": 0,\
\
"2pt_tds": 0\
\
}\
\
]\
\
}\
\
]

}`

## [tag/Projections/paths/~1mlb~1{season}~1projections/get](https://api.fantasypros.com/public/v2/docs\#tag/Projections/paths/~1mlb~1{season}~1projections/get) MLB Projections

get/mlb/{season}/projections

test

https://api.fantasypros.com/public/v2/json/mlb/{season}/projections

Returns MLB player projections.

##### Authorizations:

_api\_key_

##### path Parameters

|     |     |
| --- | --- |
| season<br>required | integer (Season)  >= 2012 <br>Example: 2024<br>A numerical season in the format YYYY |

##### query Parameters

|     |     |
| --- | --- |
| filters | string^(\\d+)((?:\\:\\d+)+)?$<br>Example: filters=345:332:12<br>A comma delimited string of expert IDs filter rankings by |
| experts | string<br>Value:"show"<br>Example: experts=show<br>Include details about the experts included in the projection set |
| site\_eligibility | string or integer<br>Enum:"AO""E""Y""C""CBSSP""FANSP"123103122<br>Use this fantasy site's position eligibility (MLB ONLY) |
| fpIds | string (digitComma) ^(\\d+)((?:\\,\\d+)+)?$<br>Examples: <br>- fpIds=7354 \- A single player<br>- fpIds=7354,6880 \- Multiple players<br>Comma delimited list of FP player IDs to filter response by |
| type | string<br>Default: "preseason"<br>Enum:"ros""daily""weekly""preseason"<br>Example: type=ros<br>Type of projections, rest of season, daily or weekly |
| position | string (MLBPositions) <br>Enum:"ALL""H""P""1B""2B""3B""SS""C""OF""SP""RP""DH""LF""CF""RF"<br>Example: position=OF |
| date | string<br>Example: date=2025-05-13<br>Date to return for daily projections |
| week | integer<br>Example: week=4<br>Week number to return for weekly projections. Ignored if start\_date and end\_date are both provided. |
| start\_date | string <date> <br>Example: start\_date=2025-05-13<br>Start date of a custom range for weekly projections. Must be provided together with end\_date, must fall within the current MLB season, and the range may span no more than 7 days. |
| end\_date | string <date> <br>Example: end\_date=2025-05-19<br>End date (inclusive) of a custom range for weekly projections. Must be provided together with start\_date, on or after start\_date and no more than 6 days after it. A range running past the end of the regular season is trimmed to its final day, so the response may cover fewer days than requested. |
| league\_key | string (mpbLeagueKey) ^(mlb\|nfl\|nba)~\[0-9a-fA-F\]{8}-\[0-9a-fA-F\]{4}-...Show pattern<br>Example: league\_key=nfl~cd789a16-00f2-43c0-af80-f9d876c9e33e<br>An MPB/DW league key |

### Responses

**200**

A successful response

##### Response Schema: application/json

|     |     |
| --- | --- |
| season<br>required | string |
| week<br>required | string |
| date<br>required | string |
| type<br>required | string<br>Enum:"ros""daily""weekly""preseason" |
| position<br>required | string (MLBPositions) <br>Enum:"ALL""H""P""1B""2B""3B""SS""C""OF""SP""RP""DH""LF""CF""RF" |
| experts<br>required | Array of integers<br>An array containing the expert\_ids included in the projection data |
| position\_name<br>required | any<br>The full name of the positon returned in the response |
| count<br>required | integer |
| player<br>required | Array of H Projections (object) or P Projections (object)<br>An array of player projection objects |
| expert\_pub | object (ExpertPublished) <br>Map of expert ID (as string) → timestamp the expert last published. Only present when experts=show |
| expert\_names | object (ExpertNames) <br>Map of expert ID (as string) → expert's full name. Only present when experts=show |
| expert\_source\_name | object (ExpertSourceName) <br>Map of expert ID (as string) → name of the site or source the expert belongs to. Only present when experts=show |
| expert\_twitter | object (ExpertTwitter) <br>Map of expert ID (as string) → expert's Twitter handle. Only present when experts=show |

### Request samples

- cURL
- JavaScript
- Python

Copy

```
curl "https://api.fantasypros.com/public/v2/json/mlb/2025/projections?type=ros&position=OF" -H "x-api-key: YOUR_API_KEY"
```

### Response samples

- 200

Content type

application/json

Copy
Expand all  Collapse all

`{"season": 2024,

"week": 0,

"date": "2025-05-19",

"type": "preseason",

"position": "OF",

"experts": [71,\
\
538,\
\
1370,\
\
1369,\
\
224,\
\
230,\
\
231,\
\
3916,\
\
650,\
\
7491\
\
],

"expert_pub": {"71": "2025-09-02 13:10:02",

"72": "2025-09-03 15:59:20"

},

"expert_names": {"71": "Site Projections",

"72": "Site Projections"

},

"expert_source_name": {"71": "ESPN",

"72": "Yahoo! Sports"

},

"expert_twitter": {"71": "ESPN",

"72": "yahoosports"

},

"position_name": "First Basemen",

"count": 291,

"player": [{"fpid": 6810,\
\
"player_id": 6810,\
\
"yahooid": "11771",\
\
"team_id": "KC",\
\
"name": "Bobby Witt Jr.",\
\
"pa": 665,\
\
"ab": 604,\
\
"g": 153,\
\
"hits": 178,\
\
"1b": 105,\
\
"2b": 36,\
\
"3b": 8,\
\
"runs": 104,\
\
"hrs": 30,\
\
"rbi": 95,\
\
"bb": 48,\
\
"ibb": 4,\
\
"hbp": 6,\
\
"sf": 6,\
\
"sb": 34,\
\
"cs": 10,\
\
"so": 109,\
\
"ave": ".295",\
\
"obp": ".347",\
\
"slg": ".533",\
\
"ops": ".880"\
\
}\
\
]

}`

## [tag/Projections/paths/~1nba~1{season}~1projections/get](https://api.fantasypros.com/public/v2/docs\#tag/Projections/paths/~1nba~1{season}~1projections/get) NBA Projections

get/nba/{season}/projections

test

https://api.fantasypros.com/public/v2/json/nba/{season}/projections

Returns NBA player projections.

##### Authorizations:

_api\_key_

##### path Parameters

|     |     |
| --- | --- |
| season<br>required | integer (Season)  >= 2012 <br>Example: 2024<br>A numerical season in the format YYYY |

##### query Parameters

|     |     |
| --- | --- |
| filters | string^(\\d+)((?:\\:\\d+)+)?$<br>Example: filters=345:332:12<br>A comma delimited string of expert IDs filter rankings by |
| experts | string<br>Value:"show"<br>Example: experts=show<br>Include details about the experts included in the projection set |
| fpIds | string (digitComma) ^(\\d+)((?:\\,\\d+)+)?$<br>Examples: <br>- fpIds=7354 \- A single player<br>- fpIds=7354,6880 \- Multiple players<br>Comma delimited list of FP player IDs to filter response by |
| team\_id | string (digitComma) ^(\\d+)((?:\\,\\d+)+)?$<br>Examples: <br>- team\_id=MIL \- A single team<br>- team\_id=MIL,BOS \- Multiple teams<br>Comma delimited list of team IDs to filter response by |
| stat\_values | string<br>Value:"precise"<br>Show more precise values for projected values |
| stype | string<br>Default: "total"<br>Enum:"total""avg"<br>Example: stype=total<br>Stats type, totals or averages |
| type | string<br>Default: "preseason"<br>Enum:"ros""daily""weekly""preseason"<br>Example: type=ros<br>Type of projections, rest of season, daily or weekly |
| position | string (NBAPositions) <br>Enum:"ALL""PG""SG""SF""PF""G""F""C""SGF""PFC"<br>Example: position=PG |
| date | string<br>Example: date=2025-05-13<br>Date to return for daily projections |

### Responses

**200**

A successful response

##### Response Schema: application/json

|     |     |
| --- | --- |
| season<br>required | string |
| week<br>required | string |
| date<br>required | string |
| type<br>required | string<br>Enum:"ros""daily""weekly""preseason" |
| position<br>required | string (NBAPositions) <br>Enum:"ALL""PG""SG""SF""PF""G""F""C""SGF""PFC" |
| experts<br>required | Array of integers<br>An array containing the expert\_ids included in the projection data |
| count<br>required | integer |
| player<br>required | Array of objects<br>An array of player projection objects |
| expert\_pub | object (ExpertPublished) <br>Map of expert ID (as string) → timestamp the expert last published. Only present when experts=show |
| expert\_names | object (ExpertNames) <br>Map of expert ID (as string) → expert's full name. Only present when experts=show |
| expert\_source\_name | object (ExpertSourceName) <br>Map of expert ID (as string) → name of the site or source the expert belongs to. Only present when experts=show |
| expert\_twitter | object (ExpertTwitter) <br>Map of expert ID (as string) → expert's Twitter handle. Only present when experts=show |

### Request samples

- cURL
- JavaScript
- Python

Copy

```
curl "https://api.fantasypros.com/public/v2/json/nba/2025/projections?type=ros&position=PG" -H "x-api-key: YOUR_API_KEY"
```

### Response samples

- 200

Content type

application/json

Copy
Expand all  Collapse all

`{"season": 2024,

"week": 0,

"date": "2025-05-19",

"type": "preseason",

"position": "PG",

"experts": [71,\
\
538,\
\
1370,\
\
1369,\
\
224\
\
],

"expert_pub": {"71": "2025-09-02 13:10:02",

"72": "2025-09-03 15:59:20"

},

"expert_names": {"71": "Site Projections",

"72": "Site Projections"

},

"expert_source_name": {"71": "ESPN",

"72": "Yahoo! Sports"

},

"expert_twitter": {"71": "ESPN",

"72": "yahoosports"

},

"count": 291,

"player": [{"fpid": 2918,\
\
"player_id": 2918,\
\
"yahooid": 5352,\
\
"nbacom_player_id": "203999",\
\
"name": "Nikola Jokic",\
\
"position_id": "PG",\
\
"team_id": "DEN",\
\
"player_page_url": "https://www.fantasypros.com/nba/players/nikola-jokic.php",\
\
"points": 2066,\
\
"rebounds": 941,\
\
"assists": 670,\
\
"blocks": 67,\
\
"steals": 110,\
\
"field_goals_pct": 0.573,\
\
"free_throws_pct": 0.809,\
\
"three_points_made": 93,\
\
"games_played": 77,\
\
"games_started": 70,\
\
"minutes": 2698,\
\
"field_goals_made": 803,\
\
"field_goals_att": 1402,\
\
"field_goals_missed": 598,\
\
"three_points_att": 262,\
\
"blocked_att": null,\
\
"three_points_missed": 169,\
\
"free_throws_made": 366,\
\
"free_throws_att": 453,\
\
"free_throws_missed": 87,\
\
"offensive_rebounds": null,\
\
"defensive_rebounds": null,\
\
"turnovers": 257,\
\
"personal_fouls": 3,\
\
"tech_fouls": 2,\
\
"flagrant_fouls": 1,\
\
"two_points_pct": 0.557,\
\
"three_points_pct": 0.357,\
\
"assists_turnover_ratio": 0.232,\
\
"two_points_made": 10,\
\
"two_points_att": null,\
\
"two_points_missed": null,\
\
"double_double": null,\
\
"triple_double": null\
\
}\
\
]

}`

## [tag/Scoring-and-Lineups](https://api.fantasypros.com/public/v2/docs\#tag/Scoring-and-Lineups) Scoring & Lineups

NFL fantasy points scored by players and confirmed or projected MLB batting orders.

## [tag/Scoring-and-Lineups/paths/~1nfl~1{season}~1player-points/get](https://api.fantasypros.com/public/v2/docs\#tag/Scoring-and-Lineups/paths/~1nfl~1{season}~1player-points/get) NFL Player Points

get/nfl/{season}/player-points

test

https://api.fantasypros.com/public/v2/json/nfl/{season}/player-points

Returns fantasy points for NFL players.

##### Authorizations:

_api\_key_

##### path Parameters

|     |     |
| --- | --- |
| season<br>required | integer (Season)  >= 2012 <br>Example: 2024<br>A numerical season in the format YYYY |

##### query Parameters

|     |     |
| --- | --- |
| min | string<br>Default: "false"<br>Enum:"true""false"<br>Example: min=true<br>Controls the level of player information returned in the response. A value of `true` will return less player information for a smaller response. |
| start | integer<br>Default: 1<br>Example: start=5<br>The starting week to return data from. |
| end | integer<br>Example: end=18<br>The ending week to return data through. Defaults to the final week of the regular season for the requested season. |
| position | string<br>Default: "ALL"<br>Enum:"ALL""QB""RB""WR""TE""OT""OL""OG""C""DE""DT""LB""CB""S""DB""K""P""DST"<br>Example: position=QB<br>Only return players with this position. |
| scoring | string<br>Default: "STD"<br>Enum:"STD""PPR""HALF"<br>Example: scoring=PPR<br>The scoring type to use to calculate points. |

### Responses

**200**

A successful response

##### Response Schema: application/json

|     |     |
| --- | --- |
| season<br>required | string<br>The season that was evaluated. |
| scoring<br>required | string<br>The scoring that was evaluated. |
| players<br>required | Array of objects<br>An array containing player objects. |

### Request samples

- cURL
- JavaScript
- Python

Copy

```
curl "https://api.fantasypros.com/public/v2/json/nfl/2024/player-points?position=QB&scoring=PPR" -H "x-api-key: YOUR_API_KEY"
```

### Response samples

- 200

Content type

application/json

Copy
Expand all  Collapse all

`{"season": "2024",

"scoring": "STD",

"players": [{"player_id": 6880,\
\
"player_name": "Daniel Jones",\
\
"position_id": "QB",\
\
"team_id": "IND",\
\
"filename": "daniel-jones.php",\
\
"games": 10,\
\
"points": 142.5,\
\
"average": 14.25,\
\
"weeks": {"1": 6.9,\
\
"2": 18.3,\
\
"3": 19.4,\
\
"4": 10.5,\
\
"5": 22.1,\
\
"6": 12.8,\
\
"7": 6,\
\
"8": 7.7,\
\
"9": 24.4,\
\
"10": 14.2\
\
}\
\
}\
\
]

}`

## [tag/Scoring-and-Lineups/paths/~1mlb~1lineups/get](https://api.fantasypros.com/public/v2/docs\#tag/Scoring-and-Lineups/paths/~1mlb~1lineups/get) MLB Lineups

get/mlb/lineups

test

https://api.fantasypros.com/public/v2/json/mlb/lineups

Returns MLB lineups.

##### Authorizations:

_api\_key_

##### query Parameters

|     |     |
| --- | --- |
| start | string<br>Example: start=2025-05-13<br>Date to return lineups for |
| period | string<br>Default: "REG"<br>Enum:"PRE""REG""PST"<br>Example: period=REG<br>A season type to return games for |
| projected | string<br>Default: "false"<br>Example: projected=true<br>Return projected lineups for the provided date |

### Responses

**200**

A successful response

##### Response Schema: application/json

|     |     |
| --- | --- |
| league\_key<br>required | string |
| season<br>required | string<br>The season queried for games |
| start<br>required | string<br>The date of games |
| end<br>required | string<br>The date of games |
| count<br>required | integer |
| games<br>required | Array of objects<br>An array of games |

### Request samples

- cURL
- JavaScript
- Python

Copy

```
curl "https://api.fantasypros.com/public/v2/json/mlb/lineups?start=2025-06-25&period=REG" -H "x-api-key: YOUR_API_KEY"
```

### Response samples

- 200

Content type

application/json

Copy
Expand all  Collapse all

`{"league_key": "",

"season": "2025",

"start": "2025-06-23",

"end": "2025-06-23",

"count": 9,

"games": {"game_id": "97000",

"event_id": "97000",

"status": "scheduled",

"weather": "Mostly Clear, 97° F, 8 mph wind",

"chance_rain": 0,

"weather_icon": "https://images.fantasypros.com/images/icons/weather/cloud.png",

"temp": 97,

"wind": 8,

"wind_direction": 308,

"deg_offset": "30",

"teams": {"BAL": {"record": ""

},

"TEX": {"record": ""

}

},

"away_probable_id": 4655,

"home_probable_id": 6995,

"hitters": {"BAL": {"1": {"player_id": "46268",

"rank_vbr": 149,

"position": "2B"

},

"2": {"player_id": "6740",

"rank_vbr": 509,

"position": "RF"

},

"3": {"player_id": "23372",

"rank_vbr": 14,

"position": "SS"

},

"4": {"player_id": "4670",

"rank_vbr": 820,

"position": "DH"

},

"5": {"player_id": "8377",

"rank_vbr": 463,

"position": "3B"

},

"6": {"player_id": "44669",

"rank_vbr": 121,

"position": "LF"

},

"7": {"player_id": "44345",

"rank_vbr": 1223,

"position": "1B"

},

"8": {"player_id": "7400",

"rank_vbr": 94,

"position": "CF"

},

"9": {"player_id": "43989",

"rank_vbr": 0,

"position": "C"

}

},

"TEX": {"1": {"player_id": "8227",

"rank_vbr": 568,

"position": "LF"

},

"2": {"player_id": "47238",

"rank_vbr": 26,

"position": "CF"

},

"3": {"player_id": "4544",

"rank_vbr": 119,

"position": "2B"

},

"4": {"player_id": "6901",

"rank_vbr": 127,

"position": "RF"

},

"5": {"player_id": "6457",

"rank_vbr": 633,

"position": "DH"

},

"6": {"player_id": "6168",

"rank_vbr": 722,

"position": "C"

},

"7": {"player_id": "23130",

"rank_vbr": 133,

"position": "3B"

},

"8": {"player_id": "43722",

"rank_vbr": 1213,

"position": "SS"

},

"9": {"player_id": "43832",

"rank_vbr": 0,

"position": "1B"

}

}

},

"pitchers": {"BAL": {"player_id": "6995",

"player_name": "Trevor Rogers",

"rank_vbr": 642,

"record": "0-0"

},

"TEX": {"player_id": "4655",

"player_name": "Patrick Corbin",

"rank_vbr": 684,

"record": "4-6"

}

}

}

}`

▶ Live API tester
