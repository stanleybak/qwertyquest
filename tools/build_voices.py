#!/usr/bin/env python3
"""Record the game's voice clips once with OpenAI text-to-speech.

The key is read from the OPENAI_KEY environment variable and is never written
anywhere. Clips already recorded with the same text, voice and directions are
skipped, so re-running costs nothing unless a line changed.

    OPENAI_KEY=... python3 tools/build_voices.py            # everything
    OPENAI_KEY=... python3 tools/build_voices.py --no-words # characters and letters only
    python3 tools/build_voices.py --dry                     # list what would be recorded

Output: audio/<group>/<name>.mp3 and js/voice-data.js (the list the game reads).
Needs ffmpeg, which trims silence and shrinks the files.
"""
import concurrent.futures as cf
import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AUDIO = ROOT / "audio"
MODEL = "gpt-4o-mini-tts"

# Each character: an OpenAI voice plus standing directions for how they talk.
CAST = {
    "fern": ("coral", "A warm, upbeat construction foreman talking to a young child. Friendly, clear, encouraging, unhurried."),
    "word": ("coral", "A friendly teacher saying one spelling word for a child. Say only the word itself, clearly and naturally, then stop."),
    "phrase": ("coral", "A friendly teacher reading a short phrase for a child to type. Say only the phrase, clearly and naturally, then stop."),
    "letter": ("coral", "A friendly teacher naming one keyboard key for a child. Say only its name, clearly, then stop."),
    "chief": ("onyx", "A fire chief. Deep voice."),
    "plumber": ("echo", "A flustered, good-natured plumber."),
    "kid": ("shimmer", "A young child, high and sweet voice."),
    "officer": ("ash", "A brisk, confident police officer."),
    "thief": ("fable", "A sneaky cartoon villain who is silly, not scary. Giggly and theatrical."),
    "monster": ("onyx", "A big goofy cartoon monster. Growly but funny and harmless, for small children."),
    "grandma": ("sage", "A kind elderly grandmother. Slow, gentle and soft."),
    "roomkid": ("nova", "An excited child showing off a new bedroom. Fast and bubbly."),
    "baker": ("verse", "A jolly, cheerful baker."),
    "petshop": ("alloy", "A kind, slightly frazzled pet shop owner."),
    "librarian": ("sage", "A librarian speaking in a loud whisper. Calm and precise."),
    "scientist": ("echo", "An excitable, eccentric scientist. Quick and enthusiastic."),
    "guide": ("fable", "A grand, proud museum guide. Theatrical."),
    "captain": ("ash", "A cheerful old ferry captain with a salty sailor's voice."),
}

# (clip id, character, text, extra direction for this line)
LINES = [
    ("hello", "fern", "Hi! I'm Fern, the foreman. Welcome to our city! Let's build it together.", ""),
    ("walk", "fern", "Use the arrow keys to walk to a glowing circle.", ""),
    ("type", "fern", "Now type what you see, and you'll carry a load of bricks.", ""),
    ("built", "fern", "Beautiful! That building is finished. Walk up to its door and press Enter to go inside.", "Proud and delighted."),
    ("district", "fern", "The whole neighborhood is done! A new part of the city just opened up. Go explore!", "Thrilled."),
    ("locked", "fern", "That land is still locked. Finish this neighborhood to open more of the city.", "Gentle, matter of fact."),
    ("shift", "fern", "That's your shift for today. Great work! Come back tomorrow for something new.", ""),
    ("promo", "fern", "You earned a promotion! Here come some new keys.", "Excited."),
    ("combo", "fern", "Team combo! Bonus bricks for everybody!", "Cheering."),
    ("river", "fern", "No bridge here yet, so hop in a boat!", "Playful."),
    ("job0", "chief", "Fire! Fire! Grab a hose and help me put it out!", "Urgent and a little panicked, speaking fast."),
    ("job0done", "chief", "Phew. The fire is out. Thank you, builder!", "Relieved, catching his breath, slow."),
    ("job1", "plumber", "Oh no, a pipe burst! There's water everywhere! Help me fix this leak!", "Alarmed and hurried."),
    ("job1done", "plumber", "All dry. Nice work, partner!", "Relieved and cheerful."),
    ("job2", "kid", "My kitten is stuck up the tree! Can you help? Please?", "Worried, close to tears."),
    ("job2done", "kid", "You saved my kitten! Thank you so much!", "Overjoyed."),
    ("job3", "officer", "Stop, thief! Somebody is running off with our bricks. Catch them!", "Shouting, urgent."),
    ("job3done", "officer", "Got them. The bricks are safe. Good work, deputy!", "Satisfied and warm."),
    ("job3gone", "thief", "Hee hee hee! Too slow! See you next time!", "Gleeful, running away."),
    ("boss", "monster", "Rawr! I am the Typo Monster! I love spelling mistakes. Yum yum yum!", "Loud and silly."),
    ("bosswin", "monster", "Ow! Okay, okay! Too many good spellers. I'm leaving!", "Whiny, defeated, comic."),
    ("bossflee", "monster", "Ha ha! I knocked a brick loose. Bye bye!", "Teasing."),
    ("m_grandma", "grandma", "Hello, dear. My new house is so empty. Will you help me bring in the furniture?", ""),
    ("m_grandma_done", "grandma", "Oh, it's lovely. It feels like home. Thank you, dear.", "Touched."),
    ("m_roomkid", "roomkid", "This is my new room! It's got nothing in it yet. Help me set it up!", ""),
    ("m_roomkid_done", "roomkid", "Best room ever! Thanks! You're awesome!", ""),
    ("m_baker", "baker", "Welcome to my bakery! The shelves are bare. Help me fill them up!", ""),
    ("m_baker_done", "baker", "Mmm. It smells delicious in here now. Thank you, my friend!", ""),
    ("m_petshop", "petshop", "The pets arrive today and nothing is ready! Can you help me?", ""),
    ("m_petshop_done", "petshop", "Every pet has a home. You're the best!", "Happy and relieved."),
    ("m_librarian", "librarian", "Shh. Welcome to the library. Could you help me put the books on the shelves?", ""),
    ("m_librarian_done", "librarian", "Wonderful. So many stories to read. Thank you.", ""),
    ("m_scientist", "scientist", "My lab needs equipment for the big experiment! Give me a hand?", ""),
    ("m_scientist_done", "scientist", "Eureka! It all works! Thank you, thank you!", "Ecstatic."),
    ("m_guide", "guide", "Welcome to the museum. Help me put our treasures on display!", ""),
    ("m_guide_done", "guide", "Magnificent. The museum is open to all!", ""),
    ("m_captain", "captain", "Ahoy! This old boathouse needs gear before we can sail. Lend a hand, matey?", ""),
    ("m_captain_done", "captain", "Shipshape! We sail at dawn. Thank ye kindly!", ""),
]

KEY_NAMES = {";": "semicolon", ",": "comma", ".": "period", "/": "slash", " ": "space"}


def jobs(with_words):
    """All clips as (relative path, voice, directions, text)."""
    out = []
    for cid, who, text, extra in LINES:
        voice, style = CAST[who]
        out.append((f"n/{cid}.mp3", voice, (style + " " + extra).strip(), text))
    voice, style = CAST["letter"]
    for c in "abcdefghijklmnopqrstuvwxyz":
        out.append((f"l/{c}.mp3", voice, style, f"{c.upper()}."))
    for c, name in KEY_NAMES.items():
        out.append((f"l/{name}.mp3", voice, style, name.capitalize() + "."))
    if with_words:
        src = (ROOT / "js" / "content-data.js").read_text(encoding="utf-8")
        data = json.loads(src[src.index("{"):src.rindex("}") + 1])
        voice, style = CAST["word"]
        for w in sorted({w for stage in data["words"] for w in stage}):
            out.append((f"w/{w}.mp3", voice, style, w.capitalize() + "."))
        voice, style = CAST["phrase"]
        for text in sorted({t for stage in data["low"] for t in stage}):
            slug = "-".join(re.findall(r"[a-z]+", text))
            out.append((f"p/{slug}.mp3", voice, style, text[0].upper() + text[1:].rstrip(".") + "."))
    return out


def record(job, key):
    rel, voice, style, text = job
    body = json.dumps({"model": MODEL, "voice": voice, "input": text,
                       "instructions": style, "response_format": "mp3"}).encode()
    req = urllib.request.Request(
        "https://api.openai.com/v1/audio/speech", data=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    for attempt in range(3):
        try:
            raw = urllib.request.urlopen(req, timeout=90).read()
            break
        except Exception as e:  # network hiccup or rate limit: try again
            if attempt == 2:
                return rel, f"FAILED: {e}"
    dst = AUDIO / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    # trim leading/trailing silence, mono, small bitrate
    trim = ("silenceremove=start_periods=1:start_threshold=-50dB,areverse,"
            "silenceremove=start_periods=1:start_threshold=-50dB,areverse")
    for filt in (trim, "anull"):  # if trimming eats the whole clip, keep it untrimmed
        p = subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", "pipe:0", "-ac", "1", "-ar", "24000",
             "-af", filt, "-b:a", "40k", str(dst)], input=raw, capture_output=True)
        if p.returncode:
            return rel, "FAILED: ffmpeg " + p.stderr.decode()[:200]
        if dst.stat().st_size > 1200:
            return rel, "ok"
    return rel, "FAILED: empty audio"


def main():
    dry = "--dry" in sys.argv
    all_jobs = jobs("--no-words" not in sys.argv)
    stamp_path = AUDIO / "recorded.json"
    stamps = json.loads(stamp_path.read_text()) if stamp_path.exists() else {}
    sig = lambda j: hashlib.sha1("|".join((MODEL,) + j[1:]).encode()).hexdigest()[:12]
    todo = [j for j in all_jobs if stamps.get(j[0]) != sig(j) or not (AUDIO / j[0]).exists()]
    chars = sum(len(j[3]) for j in todo)
    print(f"{len(all_jobs)} clips, {len(todo)} to record ({chars} characters of text)")
    if dry or not todo:
        write_manifest(all_jobs)
        return
    key = os.environ.get("OPENAI_KEY")
    if not key:
        sys.exit("Set OPENAI_KEY in the environment.")
    failed = 0
    with cf.ThreadPoolExecutor(6) as pool:
        for i, (job, (rel, res)) in enumerate(zip(todo, pool.map(lambda j: record(j, key), todo))):
            if res == "ok":
                stamps[rel] = sig(job)
            else:
                failed += 1
                print(rel, res)
            if i % 50 == 49:
                print(f"  {i + 1}/{len(todo)}")
                stamp_path.write_text(json.dumps(stamps, indent=0, sort_keys=True))
    AUDIO.mkdir(exist_ok=True)
    stamp_path.write_text(json.dumps(stamps, indent=0, sort_keys=True))
    write_manifest(all_jobs)
    print(f"done, {failed} failed")


def write_manifest(all_jobs):
    have = sorted(j[0][:-4] for j in all_jobs if (AUDIO / j[0]).exists())
    (ROOT / "js" / "voice-data.js").write_text(
        "// GENERATED by tools/build_voices.py. Clips that exist under audio/.\n"
        "export default new Set(" + json.dumps(have) + ");\n", encoding="utf-8")
    print(f"manifest: {len(have)} clips")


if __name__ == "__main__":
    main()
