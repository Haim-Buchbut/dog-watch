# Dog Watch 🐕

A small web app (PWA) that simulates a sniffer dog searching a dormitory-style room.

**Play:** https://haim-buchbut.github.io/dog-watch/ (open it on a phone and use *Add to Home Screen* to install)

## How it works
- Each load generates a random room: bunk beds (usually 2–4, rarely 0/1/5/6), about as many closets, a mini fridge, a table, 1–2 chairs, one large kitbag per person and some smaller bags scattered around.
- Click **Start**: the dog enters at the door and searches. It moves mostly to nearby objects, holds 2–3 s (sometimes 5–6 s), sometimes wanders the floor, may go back to the same object and occasionally pauses.
- Click **Stop** to end the search. The summary shows duration and coverage. In about 70% of searches the dog doesn't reach every object.
- There are never drugs in the room.
- **Variations** shows a grid of random rooms. The `?room=<id>` URL parameter reproduces a specific room, so you can share a link to it.

## Run locally
No build step:

```sh
python3 -m http.server 8765
# open http://localhost:8765
```

## Files
- `js/room.js`: seeded room generator
- `js/dog.js`: dog behaviour (state machine)
- `js/nav.js`: occupancy grid + A* so the dog walks around furniture
- `js/render.js`: canvas drawing
- `js/app.js`: UI, timer, log, variations
- `sw.js`, `manifest.webmanifest`: PWA / offline support. Bump `CACHE` in `sw.js` when you release changes.
