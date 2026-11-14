#!/usr/bin/env python3
"""Build js/content-data.js from the curated lists below.

Every word is checked against the system dictionary, and every sentence is
checked word by word, so a typo in this file fails the build instead of
teaching a child a misspelling. Words are then sorted into the earliest key
stage whose keys can spell them (see STAGES), which is how the game gets
practice text that only uses the letters a player has learned.

Run:  python3 tools/build_content.py
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DICT_PATHS = ["/usr/share/dict/american-english", "/usr/share/dict/words"]

# Key groups in the order they are taught. Two new keys per stage, home row
# first, index fingers first. Keep in sync with nothing: the game reads this
# table from the generated file.
STAGES = [
    ("fj", "Index fingers"),
    ("dk", "Middle fingers"),
    ("sl", "Ring fingers"),
    ("a;", "Pinkies"),
    ("gh", "Index reach"),
    ("ei", "Top row: E and I"),
    ("ru", "Top row: R and U"),
    ("to", "Top row: T and O"),
    ("wy", "Top row: W and Y"),
    ("qp", "Top row: Q and P"),
    ("nm", "Bottom row: N and M"),
    ("cv", "Bottom row: C and V"),
    ("b,", "Bottom row: B and comma"),
    ("x.", "Bottom row: X and period"),
    ("z/", "Bottom row: Z and slash"),
]

WORDS = """
a as ask asks add adds ad dad dads sad lad lads fad all fall falls hall halls
gal gag gas gash has had hash half jag lag lags sag flag flags glad glass lass
lash flash slash dash sash ash salad salads flask flasks shall alas aha ha ah
la salsa gala saga sagas alfalfa flak
is if kid kids lid lids did dig digs gig fig figs fish dish dishes side hide
hid slid slide like likes life field fields lie lies die dial ideal idea ideas
aid laid said sail fail jail hail deal seal sea see seed seek feel feed fee
fed led sled shed she he held self shelf shell sell fell kale sale safe lake
fake flake shake sake jade fade glade age sage edge ledge hedge leaf leg legs
egg eggs keg else lease easel ease fill hill sill skill gill dill silk skid
ski skis kiss hiss disk desk jiggle giggle haggle fiddle saddle ladle flea
fleas flee geese glide aisle isle hike hikes high sigh sleigh eagle eagles
leash shield
red read reads rare rear real reel rid ride rides rise risk rush rug rugs
rule ruler rules fur far fear fire fir fair hair hare here her hers hear
heard herd hurl hurdle girl girls dear deer dark dare drag dress dried juggle
jug jugs judge jar jars large lark laser leader ladder lure sure surf sugar
sir shark share user use used uses us usual hug hugs huge hull fuel fuss
fluff full gulf gull gulls glue glued guess guide guard greed grass grade
grill gruff dull dusk duke due ruffle frail fried fries fresh fridge
rage raid rail raise
the to too toy toys pot pots put pet pets pat path paths potato pie pies pig
pigs pup puppy puppies happy day days say says way ways why who what where
with will well water wet wish wall walk walks wake week would work world word
words write wrote you your yours yes yet year years yard yell yellow eye eyes
ear ears eat eats tea tree trees tall tell till toe toes toad road rope rose
roar root roof door floor food foot good goat got get gets glow grow grew
gray great group ghost jet jets jog jolly joy joke jokes just keep kept kite
kites key keys kitty hat hats hot hop hope house horse hole hold help hero hi
how hello hurry heart head they that this those these their there three throw
threw tiger title take takes talk talks tail tale taste treat trip true try
turtle type typed types typist tower towel tired today quiet quite quit quest
quote quilt queue quail quart squid square squirrel squeak equal power paper
party past paste pass people pool pour pull push play plays plate please pear
peas pal pale pair proud pretty super sport spot stop step steps stay star
stars start story street stripe sweet swept sweater shirt shout short show
shoe shoes sheep ship ships sleep sly sky sit sister seat set salt after air
ago ate art are area apple apples apart adult early earth easy old oak oat
oats oil our out outer otter owl owls of off or other up upper ugly its it
ill fly flew flower fast first forest fort four fruit fluffy feather fight
flight light right sight tight eight weight laugh rough tough little letter
late later last list lost lot lots look looks loud low dog dogs dirt do does
doll duty dust youth yogurt
and can man men mom name new no not now nine one on in an any many my me more
most much must make made may maybe mine moon mouse mud milk map mix box fox
six fix next wax taxi relax exit extra zoo zebra zero zip zap buzz fuzzy
pizza puzzle size prize maze lazy cozy dizzy jazz frozen breeze back bad bag
ball bat bath be bear bed bee been best big bike bird bit black blue boat
body book both boy bring brown bug bus but buy by baby cake call came camp
car card care cat catch chair chase chew chin city clap class clean climb
clock close cloud coat cold come cook cool corn count cow crab cry cup cut
dance drum drink drive each end even ever every face family fan find fine
five from fun funny game garden give gone hand have hen him home jam jump
kind king kitchen know land love lunch monkey morning mother never nice night
nose number ocean once only open over own pan pen pencil pink plan plant
point pony rabbit rain ran run sand sang school second seven sing small smile
snack snow some song soon sound spoon spring stand stone sun swim team ten
than thank them then thing think time town train under van very voice want
warm wave win wind window wing winter woman wonder zoom banana bench blanket
bridge bubble bunny butter button cabin camel candy castle cave circle clown
coin color comb cookie corner cousin crayon dragon dream engine finger friend
giant lemon lion magic melon mitten music orange panda pancake penguin picnic
planet pocket rainbow robot rocket sandwich scooter silver spider summer
sunny tomato tunnel violin volcano wizard keyboard table truck question
dolphin green when quiz
""".split()

# Tier 3: capitals and basic punctuation.
NAMES = """Sam Mia Leo Zoe Max Ava Ben Lily Jack Emma Noah Ruby Finn Ella Owen
Nora Luke Maya Dan Ivy""".split()
PLACES = """Paris Texas Mars Ohio Peru Kenya Japan Maine Rome Cairo Lima Oslo
Utah Chile India Spain""".split()
DAYS = """Monday Tuesday Wednesday Thursday Friday Saturday Sunday January
March April May June July August October""".split()
PHRASES = [
    "The big dog.", "A red kite.", "I like pizza!", "Is it hot?", "We can run.",
    "Yes, please.", "No, thank you.", "Look at that!", "Where is it?",
    "Stop, look, and wait.", "The cat sat.", "Good morning!", "What a day!",
    "I am happy.", "Can we play?", "One, two, three.", "Ready, set, go!",
    "My robot sings.", "Who is there?", "Jump up high!", "The moon is out.",
    "Red, green, and blue.", "Time for lunch!", "Do you like snow?",
    "A panda eats.", "The rocket is fast.", "Wizards love magic.",
    "Is the door open?", "Dragons are big!", "Help me build.",
]

# Tier 4: real sentences with numbers. Keep every one of these true.
FACTS = [
    "A group of lions is called a pride.",
    "An octopus has 3 hearts and 8 arms.",
    "The Earth takes about 365 days to go around the Sun.",
    "A spider has 8 legs, but an insect has 6.",
    "Light from the Sun takes about 8 minutes to reach Earth.",
    "There are 26 letters in the English alphabet.",
    "A triangle has 3 sides and a hexagon has 6.",
    "Water freezes at 32 degrees Fahrenheit, or 0 degrees Celsius.",
    "The Moon is about 239,000 miles away from Earth.",
    "Bananas are berries, but strawberries are not.",
    "A day on Venus is longer than a year on Venus.",
    "Sharks have been around longer than trees.",
    "Your heart beats about 100,000 times each day.",
    "There are 60 seconds in a minute and 60 minutes in an hour.",
    "Giraffes have 7 bones in their necks, just like people.",
    "Butterflies taste with their feet.",
    "The Pacific is the largest ocean on Earth.",
    "A leap year has 366 days.",
    "Mount Everest is about 29,000 feet tall.",
    "Sound travels about 4 times faster in water than in air.",
    "Jupiter is the biggest planet in our solar system.",
    "The adult human body has 206 bones.",
    "Koalas can sleep for 20 hours a day.",
    "There are 7 continents on Earth.",
    "A baby kangaroo is called a joey.",
    "Saturn has rings made of ice and rock.",
    "Penguins are birds that swim but cannot fly.",
    "The first Moon landing was in 1969.",
    "A dozen means 12, and a century means 100 years.",
    "Hummingbirds can fly backward.",
    "Most adults have 32 teeth.",
    "Owls can turn their heads about 270 degrees.",
    "The QWERTY keyboard layout dates back to the 1870s.",
    "Elephants are the largest animals that live on land.",
    "The blue whale is the largest animal that has ever lived.",
    "Lightning is hotter than the surface of the Sun.",
    "Antarctica is the coldest continent on Earth.",
    "Camels store fat, not water, in their humps.",
    "A square has 4 equal sides and 4 right angles.",
    "Mars is called the Red Planet because of its rusty soil.",
    "Polar bears have black skin under their fur.",
    "A cheetah can run faster than 60 miles per hour.",
    "Honey can stay good to eat for thousands of years.",
    "There are 8 planets in our solar system.",
    "A week has 7 days, and a year has 52 weeks.",
    "The number 1,000,000 is called one million.",
    "Ants can carry many times their own weight.",
    "Half of 100 is 50, and half of 50 is 25.",
    "Bats are the only mammals that can truly fly.",
    "A rainbow has 7 colors: red, orange, yellow, green, blue, indigo, and violet.",
]

# Tier 5: longer passages, symbols, awkward letter pairs.
PASSAGES = [
    "The quick brown fox jumps over the lazy dog; then the dog (who wasn't lazy at all) chased it back home.",
    "Recipe: mix 2 cups of flour, 1/2 cup of sugar & a pinch of salt. Bake at 350 degrees for 25 minutes.",
    "\"Where are you going?\" she asked. \"To the library,\" he said, \"and then to buy bread, eggs & milk.\"",
    "Email me at builder@qwertyquest.example before 5:30 p.m. if you can't make it; otherwise, see you there!",
    "Rhythm, myth, and gym are odd words: they have no a, e, i, o, or u, yet we say them just fine.",
    "The score was 21-19 at the half. By the end it was 48-47, and the crowd (all 3,200 of them) went wild!",
    "Squirrels quickly squeeze through square holes; quiet quails queue up and quiz them about the acorns.",
    "A good password is long & odd: mix UPPER and lower case, numbers like 7 or 42, and marks such as # or %.",
    "Many pumpkins, minimum! My opinion: you only join in on Monday, mainly in July, hauling plump lumpy loads.",
    "Was the average wage a great waste? Few readers were aware; we stared at tax records, baffled & vexed.",
    "Sale: 3 for $10 (was $4.50 each). That's about 26% off, so 12 of them cost $40 instead of $54!",
    "Zebras zigzag; puzzled wizards doze. Six jazzy foxes fix a quiz box, mixing extra waxy pizza by the exit.",
]

# Tier 6: code-like lines.
CODE = [
    "for (let i = 0; i < 10; i++) {}", "if (x >= 3 && y != 0) { run(); }",
    "const name = \"Ada\";", "total += price * 1.08;", "let list = [1, 2, 3];",
    "print(f\"{a} + {b} = {a + b}\")", "while (n > 0) { n -= 1; }",
    "def area(w, h): return w * h", "x = (a + b) / 2 - c % 7",
    "user@host:~$ ls -la | grep .js", "git commit -m \"fix typo #42\"",
    "<div class=\"box\">Hi!</div>", "return items[i].id === key;",
    "color: #ff8800; margin: 4px 0;", "SELECT * FROM cities WHERE pop > 500;",
    "let ok = !done || tries < 3;", "arr.map(v => v * 2).filter(v => v > 4)",
    "import { join } from './net.js';", "{\"hat\": true, \"pets\": [\"cat\", \"dog\"]}",
    "x ^= y; y ^= x; x ^= y;", "echo $HOME && cd ~/quest", "a[i][j] = b[j][i] * -1;",
    "try { load(); } catch (e) { log(e); }", "price = `$${(n / 100).toFixed(2)}`;",
]

EXTRA_OK = {"qwerty", "qwertyquest", "fahrenheit", "celsius", "p.m", "wasn't",
            "can't", "that's", "koalas", "example"}


def load_dict():
    for p in DICT_PATHS:
        if Path(p).exists():
            return {w.strip().lower() for w in open(p, encoding="utf-8")}
    sys.exit("no system dictionary found")


def main():
    d = load_dict()
    bad = []
    words = sorted(set(WORDS))
    for w in words:
        if not re.fullmatch(r"[a-z]+", w) or w not in d:
            bad.append(w)
    for text in PHRASES + FACTS + PASSAGES:
        for tok in re.findall(r"[A-Za-z][A-Za-z'.]*[A-Za-z]|[A-Za-z]", text):
            t = tok.lower()
            if t in d or t in EXTRA_OK or t.rstrip("s") in d:
                continue
            if all(part in d or part in EXTRA_OK for part in t.split(".")):
                continue
            bad.append(f"{tok!r} in {text!r}")
    for w in NAMES + PLACES + DAYS:
        if w not in {x.strip() for p in DICT_PATHS if Path(p).exists()
                     for x in open(p, encoding="utf-8")}:
            bad.append(w)
    if bad:
        sys.exit("NOT IN DICTIONARY:\n  " + "\n  ".join(bad))

    # earliest stage whose cumulative keys spell the word
    by_stage = [[] for _ in STAGES]
    have = set()
    cum = []
    for keys, _ in STAGES:
        have |= set(keys)
        cum.append(set(have))
    for w in words:
        for i, ks in enumerate(cum):
            if set(w) <= ks:
                by_stage[i].append(w)
                break
        else:
            sys.exit(f"word {w} uses keys outside all stages")

    # self-check: each word really only uses that stage's keys
    for i, ws in enumerate(by_stage):
        for w in ws:
            assert set(w) <= cum[i], (w, i)
            assert i == 0 or not set(w) <= cum[i - 1], (w, i)

    data = {
        "stages": [{"keys": k, "name": n} for k, n in STAGES],
        "words": by_stage, "names": NAMES, "places": PLACES, "days": DAYS,
        "phrases": PHRASES, "facts": FACTS, "passages": PASSAGES, "code": CODE,
    }
    out = ROOT / "js" / "content-data.js"
    out.write_text("// GENERATED by tools/build_content.py. Do not edit by hand.\n"
                   "export default " + json.dumps(data, indent=1) + ";\n",
                   encoding="utf-8")
    print("words per stage:", [len(x) for x in by_stage], "total", len(words))
    print("wrote", out)


if __name__ == "__main__":
    main()
