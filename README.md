# Word Game Data

Open data for Wordle, Scrabble and other word games, published as a small website at https://eco-dev-x.github.io/word-game-data/.

Tools: a [Wordle solver and helper](wordle-solver/) and a [word unscrambler](word-unscrambler/), both client-side, no build step.

| Dataset | File |
|---|---|
| Every allowed Wordle opener (8,613) ranked against 1,574 answers | [data/wordle-openers-ranked.csv](data/wordle-openers-ranked.csv) |
| Wordle letter frequency by position | [data/wordle-letter-frequency.csv](data/wordle-letter-frequency.csv) |
| 8,613 five-letter words (+ Scrabble points) | [data/five-letter-words.txt](data/five-letter-words.txt), [.csv](data/five-letter-words.csv) |
| 106 two-letter words | [data/two-letter-words.txt](data/two-letter-words.txt), [printable PDF](data/two-letter-words.pdf) |
| 31 Q-without-U words | [data/q-without-u.txt](data/q-without-u.txt), [printable PDF](data/q-without-u.pdf) |

**Headline result:** the best opener overall is RAISE (37.8 answers left on average); the best opener that can also be the answer is RAISE (37.8). RAISE scores 37.8, CRANE 48.3, ADIEU 80.8.

Method, code and charts are on the website. Word lists come from ENABLE (public domain) via [thewordfinder.io](https://thewordfinder.io/), a free word finder with daily puzzle hints and browser word games.

Rebuild: `node build.mjs` (needs the thewordfinder.io site checkout next to this folder). Licence: code MIT, word lists public domain.
