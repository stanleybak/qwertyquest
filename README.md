# QwertyQuest

A co-op typing game for ages 6 to adult. Everyone builds one city together;
each player gets typing prompts at their own level, and every finished prompt
is worth the same load of bricks.

Play: open `index.html` from any static web server (GitHub Pages works as is).
There is no build step and no backend.

- **Multiplayer.** Peer to peer over WebRTC ([Trystero](https://github.com/dmotz/trystero),
  vendored in `vendor/`). Players on the same public IPv4 address join the same
  city automatically. Add `#room=word` to the URL to share a city across
  networks. One peer hosts the rules; if it leaves, the next peer takes over.
- **Saving.** Player progress and the city are kept in the browser's
  localStorage. When players meet, the most advanced saved city wins.
- **Content.** `tools/build_content.py` holds the word and sentence lists,
  checks every word against the system dictionary, sorts words by the keys
  they need, and writes `js/content-data.js`.

- **Voices.** `tools/build_voices.py` records every spoken line, letter and
  word once with OpenAI text-to-speech and saves them under `audio/`. It reads
  the key from the `OPENAI_KEY` environment variable; the key is never stored.
  Re-running only records lines that changed.

Local testing: `python3 -m http.server` and open two browser windows.
