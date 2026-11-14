// City problems, by neighborhood type. Plain data: tools/build_voices.py reads this file too.
// kind: in = solved inside a finished building, run = it moves and must be caught, spot = stays put.
export default [
 {
  "name": "fire",
  "kind": "in",
  "env": [
   "town",
   "farm",
   "forest",
   "city",
   "beach",
   "snow"
  ],
  "icon": "🔥",
  "tool": "🧯",
  "hint": "Spray the fire!",
  "fx": "💦 splash!",
  "done": "put out the fire",
  "who": "chief",
  "thanks": "Phew. The fire is out. Thank you, builder!",
  "tdir": "Relieved, catching his breath, slow.",
  "v": [
   {
    "art": "🔥",
    "call": "Fire in a building! Go inside and help put it out.",
    "say": "Fire! Fire! Come inside, grab a hose and help me put it out!",
    "dir": "Urgent and a little panicked, speaking fast."
   }
  ]
 },
 {
  "name": "leak",
  "kind": "in",
  "env": [
   "town",
   "farm",
   "forest",
   "city",
   "beach",
   "snow"
  ],
  "icon": "💦",
  "tool": "🔧",
  "hint": "Tighten the pipe!",
  "fx": "🔧 clank!",
  "done": "fixed the leaks",
  "who": "plumber",
  "thanks": "All dry. Nice work, partner!",
  "tdir": "Relieved and cheerful.",
  "v": [
   {
    "art": "💦",
    "call": "A pipe burst in a building! Go inside and fix the leaks.",
    "say": "Oh no, the pipes burst! There's water everywhere! Come in and help me fix these leaks!",
    "dir": "Alarmed and hurried."
   }
  ]
 },
 {
  "name": "tree",
  "kind": "spot",
  "env": [
   "town",
   "farm",
   "forest",
   "city"
  ],
  "icon": "🌳",
  "tool": "🪜",
  "hint": "Climb the ladder!",
  "fx": "🪜 up!",
  "done": "got it down from the tree",
  "who": "kid",
  "thanks": "You saved my kitten! Thank you so much!",
  "tdir": "Overjoyed.",
  "v": [
   {
    "art": "🐱",
    "call": "A kitten is stuck up a tree!",
    "say": "My kitten is stuck up the tree! Can you help? Please?",
    "dir": "Worried, close to tears."
   },
   {
    "art": "🪁",
    "call": "A kite is stuck up a tree!",
    "say": "My kite is stuck in the tree! Can you get it down? Please?",
    "dir": "Worried.",
    "thanks": "You got my kite back! Thank you so much!"
   },
   {
    "art": "🎈",
    "call": "A balloon is caught in a tree!",
    "say": "My balloon floated into the tree! Can you reach it? Please?",
    "dir": "Worried.",
    "thanks": "You got my balloon! Thank you so much!"
   }
  ],
  "bg": "🌳"
 },
 {
  "name": "thief",
  "kind": "run",
  "env": [
   "town",
   "farm",
   "city",
   "beach",
   "snow"
  ],
  "icon": "🦹",
  "tool": "🚨",
  "hint": "Stop, thief!",
  "fx": "🚨 stop!",
  "done": "caught the brick thief",
  "who": "officer",
  "thanks": "Got them. The bricks are safe. Good work, deputy!",
  "tdir": "Satisfied and warm.",
  "v": [
   {
    "art": "🦹",
    "call": "A brick thief is on the loose! Catch up and stop them.",
    "say": "Stop, thief! Somebody is running off with our bricks. Catch them!",
    "dir": "Shouting, urgent."
   }
  ]
 },
 {
  "name": "car",
  "kind": "spot",
  "env": [
   "town",
   "city",
   "farm"
  ],
  "icon": "🚗",
  "tool": "🔧",
  "hint": "Fix it up!",
  "fx": "🔧 clank!",
  "done": "got it rolling again",
  "who": "mechanic",
  "thanks": "Runs like new! Thanks for the help!",
  "tdir": "Pleased.",
  "v": [
   {
    "art": "🚗",
    "call": "A car broke down in the road! Help fix it.",
    "say": "This car won't start! Hand me a wrench and help me fix it!",
    "dir": "Flustered."
   },
   {
    "art": "🚕",
    "call": "A taxi has a flat tire! Help change the wheel.",
    "say": "Flat tire! Help me change this wheel!",
    "dir": "Hurried."
   },
   {
    "art": "🚚",
    "call": "The delivery truck is stuck! Help get it moving.",
    "say": "My delivery truck is stuck! Come and give me a push!",
    "dir": "Straining."
   }
  ]
 },
 {
  "name": "bus",
  "kind": "spot",
  "env": [
   "town",
   "city"
  ],
  "icon": "🚌",
  "tool": "🛑",
  "hint": "Help the kids cross!",
  "fx": "🛑 safe!",
  "done": "got everyone onto the school bus",
  "who": "driver",
  "thanks": "All aboard! Thank you, crossing guard!",
  "tdir": "Cheerful.",
  "v": [
   {
    "art": "🚌",
    "call": "The school bus is here! Help the kids cross the road.",
    "say": "The school bus is here! Can you help the kids cross the road safely?",
    "dir": "Friendly, calling out."
   }
  ]
 },
 {
  "name": "light",
  "kind": "spot",
  "env": [
   "town",
   "city"
  ],
  "icon": "🚦",
  "tool": "🦺",
  "hint": "Wave the cars through!",
  "fx": "👉 go!",
  "done": "kept the traffic moving",
  "who": "officer",
  "thanks": "Traffic is flowing again. Good work, deputy!",
  "tdir": "Satisfied and warm.",
  "v": [
   {
    "art": "🚦",
    "call": "The traffic light is broken! Help direct the cars.",
    "say": "The traffic light is out! Help me direct the cars!",
    "dir": "Loud, over traffic noise."
   }
  ]
 },
 {
  "name": "playground",
  "kind": "spot",
  "env": [
   "town",
   "city"
  ],
  "icon": "🛝",
  "tool": "🔨",
  "hint": "Fix it up!",
  "fx": "🔨 bang!",
  "done": "fixed the playground",
  "who": "kid",
  "thanks": "Yay! We can play again! Thank you!",
  "tdir": "Overjoyed.",
  "v": [
   {
    "art": "🛝",
    "call": "The slide is broken! Help fix the playground.",
    "say": "The slide is broken! Can you fix it? Please?",
    "dir": "Sad."
   },
   {
    "art": "🎠",
    "call": "The merry-go-round is stuck! Help fix it.",
    "say": "The merry-go-round is stuck! Can you fix it? Please?",
    "dir": "Sad."
   }
  ]
 },
 {
  "name": "party",
  "kind": "spot",
  "env": [
   "town",
   "city",
   "beach"
  ],
  "icon": "🎈",
  "tool": "🎈",
  "hint": "Get it ready!",
  "fx": "🎈 puff!",
  "done": "got the party ready",
  "who": "mayor",
  "thanks": "What a wonderful party! Thank you, builders!",
  "tdir": "Delighted.",
  "v": [
   {
    "art": "🎂",
    "call": "A birthday party needs setting up! Help blow up the balloons.",
    "say": "The party starts soon and nothing is ready! Help me blow up the balloons!",
    "dir": "Flustered but jolly."
   },
   {
    "art": "🎪",
    "call": "The fair is opening! Help put up the big tent.",
    "say": "The fair opens today! Help me put up the big tent!",
    "dir": "Excited."
   }
  ]
 },
 {
  "name": "puppy",
  "kind": "run",
  "env": [
   "town",
   "city",
   "farm",
   "beach"
  ],
  "icon": "🐕",
  "tool": "🦴",
  "hint": "Call it back!",
  "fx": "🦴 here!",
  "done": "caught the runaway pet",
  "who": "kid",
  "thanks": "You caught him! Thank you so much!",
  "tdir": "Overjoyed.",
  "v": [
   {
    "art": "🐕",
    "call": "A puppy slipped its leash! Catch up and call it back.",
    "say": "My puppy ran away! Can you catch him? Please?",
    "dir": "Worried."
   },
   {
    "art": "🐇",
    "call": "A bunny hopped out of its hutch! Catch up with it.",
    "say": "My bunny hopped away! Can you catch him? Please?",
    "dir": "Worried."
   }
  ]
 },
 {
  "name": "mail",
  "kind": "spot",
  "env": [
   "town",
   "city",
   "snow"
  ],
  "icon": "📬",
  "tool": "📮",
  "hint": "Sort the mail!",
  "fx": "✉️ sorted!",
  "done": "delivered the mail",
  "who": "mail",
  "thanks": "Every last one delivered. Thank you kindly!",
  "tdir": "Grateful.",
  "v": [
   {
    "art": "📬",
    "call": "The mail bag spilled! Help sort the letters.",
    "say": "Oh dear, my mail bag spilled! Help me sort all these letters!",
    "dir": "Flustered."
   },
   {
    "art": "📦",
    "call": "So many packages! Help carry them to the doors.",
    "say": "So many packages today! Help me carry them!",
    "dir": "Out of breath."
   }
  ]
 },
 {
  "name": "icecream",
  "kind": "spot",
  "env": [
   "town",
   "beach"
  ],
  "icon": "🍦",
  "tool": "🍨",
  "hint": "Scoop fast!",
  "fx": "🍦 scoop!",
  "done": "saved the ice cream",
  "who": "baker",
  "thanks": "Not a drop melted! Ice cream for everyone!",
  "tdir": "Jolly.",
  "v": [
   {
    "art": "🍦",
    "call": "The ice cream truck's freezer broke! Hand out the ice cream before it melts.",
    "say": "My freezer broke! Help me hand out the ice cream before it melts!",
    "dir": "Hurried."
   }
  ]
 },
 {
  "name": "log",
  "kind": "spot",
  "env": [
   "forest",
   "snow"
  ],
  "icon": "🪵",
  "tool": "🪚",
  "hint": "Clear the path!",
  "fx": "🪚 zzzt!",
  "done": "cleared the path",
  "who": "ranger",
  "thanks": "The trail is clear. Thank you, friend!",
  "tdir": "Calm and pleased.",
  "v": [
   {
    "art": "🪵",
    "call": "A tree fell across the path! Help saw it up.",
    "say": "A tree fell across the trail! Help me saw it up!",
    "dir": "Calling out."
   },
   {
    "art": "🪨",
    "call": "Rocks rolled onto the path! Help move them.",
    "say": "Rocks rolled onto the trail! Help me move them!",
    "dir": "Calling out."
   }
  ]
 },
 {
  "name": "camp",
  "kind": "spot",
  "env": [
   "forest",
   "beach"
  ],
  "icon": "🏕️",
  "tool": "🔨",
  "hint": "Put up the tent!",
  "fx": "⛺ up!",
  "done": "set up camp",
  "who": "ranger",
  "thanks": "Camp is all set. Time for marshmallows!",
  "tdir": "Happy.",
  "v": [
   {
    "art": "🏕️",
    "call": "The wind blew the tents down! Help set up camp.",
    "say": "The wind blew our tents down! Help me set up camp again!",
    "dir": "Calling over the wind."
   }
  ]
 },
 {
  "name": "cub",
  "kind": "spot",
  "env": [
   "forest"
  ],
  "icon": "🐻",
  "tool": "🧤",
  "hint": "Gently now!",
  "fx": "🤲 gently!",
  "done": "helped a little animal",
  "who": "ranger",
  "thanks": "There you go, little one. Thank you for helping!",
  "tdir": "Soft and gentle.",
  "v": [
   {
    "art": "🐻",
    "call": "A bear cub has its paw stuck in a honey jar! Help it out.",
    "say": "This little bear cub got its paw stuck in a honey jar! Help me get it out, gently!",
    "dir": "Quiet, so as not to scare it."
   },
   {
    "art": "🦔",
    "call": "A hedgehog is tangled in a net! Help free it.",
    "say": "A hedgehog is tangled in a net! Help me free it, gently!",
    "dir": "Quiet."
   },
   {
    "art": "🦉",
    "call": "A baby owl fell out of its nest! Help put it back.",
    "say": "A baby owl fell out of its nest! Help me put it back!",
    "dir": "Quiet."
   }
  ]
 },
 {
  "name": "plant",
  "kind": "spot",
  "env": [
   "town",
   "farm",
   "forest"
  ],
  "icon": "🌱",
  "tool": "🪴",
  "hint": "Dig and plant!",
  "fx": "🌱 planted!",
  "done": "planted the garden",
  "who": "ranger",
  "thanks": "They will be tall one day. Thank you!",
  "tdir": "Warm.",
  "v": [
   {
    "art": "🌱",
    "call": "It is tree planting day! Help plant the little trees.",
    "say": "It's tree planting day! Help me plant these little trees!",
    "dir": "Cheerful."
   },
   {
    "art": "🌷",
    "call": "The flower beds are empty! Help plant the flowers.",
    "say": "The flower beds are empty! Help me plant the flowers!",
    "dir": "Cheerful."
   }
  ]
 },
 {
  "name": "sandcastle",
  "kind": "spot",
  "env": [
   "beach"
  ],
  "icon": "🏰",
  "tool": "🪣",
  "hint": "Pile up the sand!",
  "fx": "🪣 pat pat!",
  "done": "saved the sandcastle",
  "who": "kid",
  "thanks": "The castle is safe! Thank you!",
  "tdir": "Overjoyed.",
  "v": [
   {
    "art": "🏰",
    "call": "The tide is coming in! Help build a wall around the sandcastle.",
    "say": "The waves are coming! Help me build a wall around my sandcastle!",
    "dir": "Urgent."
   }
  ]
 },
 {
  "name": "dolphin",
  "kind": "spot",
  "env": [
   "beach"
  ],
  "icon": "🐬",
  "tool": "🪣",
  "hint": "Splash and push!",
  "fx": "💦 splash!",
  "done": "got it back to the sea",
  "who": "lifeguard",
  "thanks": "Back in the water! Great teamwork!",
  "tdir": "Thrilled.",
  "v": [
   {
    "art": "🐬",
    "call": "A dolphin is stuck on the sand! Help push it back to sea.",
    "say": "A dolphin is stuck on the sand! Keep it wet and help me push!",
    "dir": "Urgent."
   },
   {
    "art": "🐢",
    "call": "A baby turtle is lost on the beach! Help it to the water.",
    "say": "A baby turtle is lost! Help me guide it to the water!",
    "dir": "Gentle but urgent."
   }
  ]
 },
 {
  "name": "litter",
  "kind": "spot",
  "env": [
   "beach",
   "forest",
   "city"
  ],
  "icon": "🗑️",
  "tool": "🧤",
  "hint": "Pick it up!",
  "fx": "♻️ clean!",
  "done": "cleaned up the litter",
  "who": "lifeguard",
  "thanks": "Spotless! Thanks for keeping it clean!",
  "tdir": "Pleased.",
  "v": [
   {
    "art": "🗑️",
    "call": "Litter everywhere! Help clean it up.",
    "say": "There's litter everywhere! Help me clean it up!",
    "dir": "Calling out."
   }
  ]
 },
 {
  "name": "swimmer",
  "kind": "spot",
  "env": [
   "beach"
  ],
  "icon": "🛟",
  "tool": "🛟",
  "hint": "Throw the ring!",
  "fx": "🛟 got it!",
  "done": "helped the tired swimmer",
  "who": "lifeguard",
  "thanks": "Safe and sound! Nice throw!",
  "tdir": "Relieved.",
  "v": [
   {
    "art": "🏊",
    "call": "A swimmer is tired! Throw them a ring and pull.",
    "say": "A swimmer needs help! Throw the ring and pull!",
    "dir": "Urgent, shouting."
   }
  ]
 },
 {
  "name": "snowedin",
  "kind": "spot",
  "env": [
   "snow"
  ],
  "icon": "❄️",
  "tool": "⛏️",
  "hint": "Shovel the snow!",
  "fx": "❄️ scoop!",
  "done": "dug it out of the snow",
  "who": "skier",
  "thanks": "All clear! Thank you! Brrr!",
  "tdir": "Shivering but happy.",
  "v": [
   {
    "art": "🚙",
    "call": "A car is snowed in! Help shovel it out.",
    "say": "Brrr! My car is snowed in! Help me shovel it out!",
    "dir": "Shivering."
   },
   {
    "art": "🏠",
    "call": "A front door is snowed shut! Help dig it out.",
    "say": "Brrr! The snow blocked my door! Help me dig it out!",
    "dir": "Shivering."
   }
  ]
 },
 {
  "name": "snowman",
  "kind": "spot",
  "env": [
   "snow"
  ],
  "icon": "⛄",
  "tool": "🥕",
  "hint": "Roll the snow!",
  "fx": "⛄ roll!",
  "done": "saved the day in the snow",
  "who": "kid",
  "thanks": "It's perfect! Thank you!",
  "tdir": "Overjoyed.",
  "v": [
   {
    "art": "⛄",
    "call": "The snowman is falling apart! Help build him back up.",
    "say": "My snowman is falling apart! Help me build him back up!",
    "dir": "Worried."
   },
   {
    "art": "🛷",
    "call": "A sled is stuck in a snowdrift! Help pull it out.",
    "say": "My sled is stuck in the snow! Help me pull it out!",
    "dir": "Worried."
   }
  ]
 },
 {
  "name": "penguin",
  "kind": "run",
  "env": [
   "snow"
  ],
  "icon": "🐧",
  "tool": "🐟",
  "hint": "Lead it home!",
  "fx": "🐟 this way!",
  "done": "brought the penguin home",
  "who": "skier",
  "thanks": "Back with the family! Thank you!",
  "tdir": "Happy.",
  "v": [
   {
    "art": "🐧",
    "call": "A little penguin is lost! Catch up and lead it home.",
    "say": "A little penguin wandered off! Help me bring it home!",
    "dir": "Calling out."
   }
  ]
 },
 {
  "name": "runaway",
  "kind": "run",
  "env": [
   "farm"
  ],
  "icon": "🐖",
  "tool": "🥕",
  "hint": "Call it back!",
  "fx": "🥕 come on!",
  "done": "rounded up the runaway",
  "who": "farmer",
  "thanks": "Back in the pen. Much obliged, friend!",
  "tdir": "Warm.",
  "v": [
   {
    "art": "🐖",
    "call": "The pig got out of its pen! Catch it.",
    "say": "My pig got out of the pen! Help me catch her!",
    "dir": "Calling out."
   },
   {
    "art": "🐑",
    "call": "A sheep jumped the fence! Catch it.",
    "say": "A sheep jumped the fence! Help me catch him!",
    "dir": "Calling out."
   },
   {
    "art": "🐓",
    "call": "The rooster is loose! Catch it.",
    "say": "The rooster is loose! Help me catch him!",
    "dir": "Calling out."
   }
  ]
 },
 {
  "name": "harvest",
  "kind": "spot",
  "env": [
   "farm"
  ],
  "icon": "🌽",
  "tool": "🧺",
  "hint": "Pick fast!",
  "fx": "🧺 picked!",
  "done": "brought in the harvest",
  "who": "farmer",
  "thanks": "All in before the rain. Much obliged!",
  "tdir": "Relieved.",
  "v": [
   {
    "art": "🌽",
    "call": "A storm is coming! Help bring in the corn.",
    "say": "Storm's coming! Help me bring in the corn!",
    "dir": "Urgent."
   },
   {
    "art": "🍎",
    "call": "The apples are ripe! Help pick them.",
    "say": "The apples are ripe! Help me pick them before they fall!",
    "dir": "Cheerful."
   },
   {
    "art": "🎃",
    "call": "The pumpkins are ready! Help load the cart.",
    "say": "The pumpkins are ready! Help me load the cart!",
    "dir": "Cheerful."
   }
  ]
 },
 {
  "name": "tractor",
  "kind": "spot",
  "env": [
   "farm"
  ],
  "icon": "🚜",
  "tool": "🪢",
  "hint": "Pull!",
  "fx": "🪢 heave!",
  "done": "pulled the tractor free",
  "who": "farmer",
  "thanks": "She's out! Much obliged, friend!",
  "tdir": "Relieved.",
  "v": [
   {
    "art": "🚜",
    "call": "The tractor is stuck in the mud! Help pull it out.",
    "say": "My tractor is stuck in the mud! Grab the rope and pull!",
    "dir": "Straining."
   }
  ]
 },
 {
  "name": "eggs",
  "kind": "spot",
  "env": [
   "farm"
  ],
  "icon": "🥚",
  "tool": "🧺",
  "hint": "Gently!",
  "fx": "🥚 got one!",
  "done": "gathered the eggs",
  "who": "farmer",
  "thanks": "Not one cracked. Much obliged!",
  "tdir": "Pleased.",
  "v": [
   {
    "art": "🥚",
    "call": "The hens laid eggs all over the yard! Help gather them.",
    "say": "The hens laid eggs all over the yard! Help me gather them, gently!",
    "dir": "Amused."
   }
  ]
 },
 {
  "name": "class",
  "kind": "spot",
  "env": [
   "town",
   "city",
   "forest"
  ],
  "icon": "🎒",
  "tool": "📋",
  "hint": "Count them!",
  "fx": "✅ here!",
  "done": "helped the class line up",
  "who": "teacher",
  "thanks": "Everyone is here. Thank you so much!",
  "tdir": "Relieved.",
  "v": [
   {
    "art": "🧑‍🏫",
    "call": "A class trip is leaving! Help count the children.",
    "say": "Oh my, it's time to go and the class is everywhere! Help me count the children!",
    "dir": "Flustered."
   }
  ]
 }
];
