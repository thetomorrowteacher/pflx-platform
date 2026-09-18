/* ═══ PFLX STORY MODE — campaign data ═══════════════════════════════════
   The season, as a game. Two projects from the Activity Guide become two
   acts of one campaign: The Alter Ego makes your character, BrandBuilder
   is the quest line you run with that character. Clients are the leads of
   The Nexus Narratives, so the story a player listens to is the brief they
   then have to solve.                                                      */
window.PFLX_STORY = {
version: "1.0",
canva: {
  portfolio: "https://www.canva.com/design/DAHRff57HDw/11Zx6zoAvCgOhC8q4VpAiA/view",
  clientProfile: "https://canva.link/g3swbn7quo6ywr4",
  empathyMap: "https://canva.link/vswti5lctpbmifj",
  ideationForm: "https://canva.link/6vwh7opmw3fzubf",
  sparkLab: "https://pflxsparklab.my.canva.site/",
  briefing: "https://docs.google.com/presentation/d/e/2PACX-1vQ72bPxm9Kn5lMdnE4g_Tf1evJn3ZcV7yW7zj4U9HdlRwOwahnOZZ0fa0Wl9tEgl40GlRA8JNQwL23S/pub",
  characterForge: "https://gemini.google.com/gem/b3f8b96ef0e5",
  clientInterviews: "https://gemini.google.com/gem/1lHxVbRQKPZKU7iJrimTMvNiOCmCgVeYp",
  thinkTable: "https://gemini.google.com/gem/008e61cf5816",
  protoDev: "https://gemini.google.com/gem/13hACoHOicvsImpHROFAjDKWCJTNYTqs-",
  brandBoardHow: "https://youtu.be/aKzcVQe1Avs"
},
traits: [
  { id:"maker",   name:"Maker",      q:"I would rather build the rough version than talk about it." },
  { id:"scout",   name:"Scout",      q:"I notice things other people walk straight past." },
  { id:"voice",   name:"Voice",      q:"I can get a room to listen when it matters." },
  { id:"anchor",  name:"Anchor",     q:"When things go sideways, people look at me." },
  { id:"weaver",  name:"Weaver",     q:"I connect people who should know each other." },
  { id:"archivist",name:"Archivist", q:"I keep the record. I remember what was promised." },
  { id:"breaker", name:"Breaker",    q:"I like finding the crack in a plan before it ships." },
  { id:"dreamer", name:"Dreamer",    q:"I can see the finished thing before it exists." },
  { id:"tuner",   name:"Tuner",      q:"I make other people's work better without taking it over." },
  { id:"runner",  name:"Runner",     q:"I would rather ship today than perfect it next month." },
  { id:"guard",   name:"Guard",      q:"I stand up for the person in the room who is not being heard." },
  { id:"cartographer",name:"Cartographer",q:"I draw the map so everybody can see where we are." }
],
acts: [
 { id:"act0", n:"Act Zero", title:"Arrival", sub:"The Nexus opens a slot for you",
   art:"nexus-1", accent:"0,240,255",
   quests:[
    { id:"a0-brief", title:"The Nexus Opens", kind:"beat", xc:50, xp:25, mins:5,
      blurb:"Tessera has one seat left in the Ring. It wants to know who is taking it.",
      beats:[
       {who:"TESSERA", t:"THERE ARE EIGHT OF THEM. THERE IS ROOM FOR ONE MORE."},
       {cap:"You are standing in a room that is not a room. The Nexus is a ring-like space station, and everything in it was built by somebody who was your age when they started."},
       {who:"TESSERA", t:"EIGHT PEOPLE IN EIGHT CITIES. EACH ONE CAN LEND THE OTHERS WHAT THEY KNOW. I CALL IT THE CHORD."},
       {who:"TESSERA", t:"SOMETHING IS DELETING THE ALTERNATIVES. NOT THE PEOPLE. THE OPTIONS. BY THE TIME ANYONE NOTICES, THE CHOICE IS ALREADY GONE."},
       {cap:"Behind Tessera, eight windows. Dubai. Lagos. Bangkok. Amsterdam. The Amazon basin. Tuvalu. Los Angeles. Mumbai. Each one lit, each one in trouble."},
       {who:"TESSERA", t:"I CANNOT SOLVE THIS. I CAN ONLY LEND. SO I NEED SOMEBODY WHO BUILDS."},
       {who:"TESSERA", t:"BEFORE YOU TAKE A CLIENT, I NEED TO KNOW WHO YOU ARE. NOT YOUR NAME. WHAT YOU DO WHEN A ROOM GOES QUIET."},
       {cap:"A panel slides open. Your file is empty."}
      ] },
    { id:"a0-studio", title:"Pick Your Studio", kind:"studio", xc:50, xp:25, mins:5,
      blurb:"Four startup studios. Each one has a different way of attacking a problem.",
      options:[
       {id:"gentech",     name:"Gentech Studio",     line:"Media that makes people care. Storytelling, campaigns, the SDGs.", accent:"34,197,94"},
       {id:"massive",     name:"Massive Dynamic",    line:"AI, automation and systems. You take the machine apart.",         accent:"239,68,68"},
       {id:"emagination", name:"eMagination Studio", line:"Futuristic design and 3D. You build the thing people walk into.", accent:"167,139,250"},
       {id:"innov8",      name:"Innov8 Inc",         line:"Entrepreneurship and civic tech. You make it work and make it last.", accent:"245,200,66"}
      ] }
   ] },

 { id:"act1", n:"Act One", title:"The Alter Ego", sub:"Branding and Identity",
   art:"unwritten-2", accent:"167,139,250",
   quests:[
    { id:"a1-traits", title:"Personality Trait Inventory", kind:"traits", xc:150, xp:75, mins:15,
      blurb:"Twelve statements. Rate each one honestly. Your top three become your character's core.",
      cp:"Character sheet unlocked" },
    { id:"a1-forge", title:"Character Forge", kind:"forge", xc:200, xp:100, mins:25,
      blurb:"Take your traits to Character Forge and pull out a character design prompt, then bring it back here.",
      link:"characterForge",
      steps:["Screenshot your trait results from the last quest",
             "Open Character Forge and upload the screenshot",
             "Type: Use the attachment to give me a Prompt for my Character",
             "Find your prompt under the Midjourney Prompt heading",
             "Paste the prompt back here"] },
    { id:"a1-profile", title:"Character Profile", kind:"charprofile", xc:200, xp:100, mins:30,
      blurb:"Name your Alter Ego, give it a world, and write the five lines that make it real.",
      cp:"Portfolio slide 5" },
    { id:"a1-board", title:"Brand Board", kind:"board", xc:300, xp:150, mins:45,
      blurb:"Brand name, logo, slogan, vision, colours, type. This is the identity you sign your work with.",
      link:"brandBoardHow", cp:"Portfolio slide 4" },
    { id:"a1-mint", title:"Mint Your Alter Ego", kind:"mint", xc:250, xp:200, mins:5,
      blurb:"Tessera writes you into the Ring. Your card is issued.",
      needs:["a1-traits","a1-profile","a1-board"] }
   ] },

 { id:"act2", n:"Act Two", title:"BrandBuilder · Phase One", sub:"Empathize and Define",
   art:"transit-2", accent:"0,240,255",
   race:true,
   quests:[
    { id:"a2-brief", title:"Client Briefing", kind:"beat", xc:75, xp:40, mins:10,
      blurb:"Eight clients. Eight cities. You take one.",
      link:"briefing",
      beats:[
       {who:"TESSERA", t:"EIGHT FILES. ONE IS YOURS."},
       {cap:"Each file is a person with a real problem in a real city. Listen to their issue of The Nexus Narratives before you choose. The story is the brief."},
       {who:"TESSERA", t:"YOU ARE NOT HERE TO FIX THEM. YOU ARE HERE TO UNDERSTAND THEM WELL ENOUGH THAT THE FIX IS OBVIOUS."},
       {cap:"Phase One is a race. First team to finish takes 1000 X-Coins each. Second takes 700. Third takes 500."}
      ] },
    { id:"a2-pick", title:"Choose Your Client", kind:"pick", xc:100, xp:50, mins:10,
      blurb:"Pick the person whose problem you actually want to live with for a season." },
    { id:"a2-interview", title:"The Client Interview", kind:"interview", xc:350, xp:175, mins:30,
      blurb:"Sit down with your client. Ask eight questions. Every answer drops a clue into your Empathy Map.",
      needs:["a2-pick"] },
    { id:"a2-cprofile", title:"Client Profile", kind:"cprofile", xc:250, xp:125, mins:25,
      blurb:"Write your client up so a stranger on your team could brief someone else on them.",
      needs:["a2-interview"], link:"clientProfile", cp:"Portfolio slide 6" },
    { id:"a2-empathy", title:"Client Empathy Map", kind:"empathy", xc:400, xp:200, mins:40,
      blurb:"Says. Thinks. Does. Feels. Then one Problem Statement that holds all four.",
      needs:["a2-interview"], link:"empathyMap", cp:"Portfolio slide 7" },
    { id:"a2-cp3", title:"Checkpoint 3 Submission", kind:"submit", xc:300, xp:150, mins:10,
      blurb:"Phase One: Empathize and Define. Submit in Google Classroom, then log it here.",
      needs:["a2-cprofile","a2-empathy"], cp:"Checkpoint 3" }
   ] },

 { id:"act3", n:"Act Three", title:"BrandBuilder · Phase Two", sub:"Ideate",
   art:"canopy-1", accent:"141,255,106",
   quests:[
    { id:"a3-r1", title:"SparkLab Round One", kind:"spark1", xc:250, xp:125, mins:25,
      blurb:"Three of the WORST possible solutions to your client's problem. On purpose. Badly.",
      needs:["a2-empathy"], link:"sparkLab" },
    { id:"a3-r2", title:"SparkLab Round Two", kind:"spark2", xc:300, xp:150, mins:30,
      blurb:"Flip each terrible idea into something that could actually work.",
      needs:["a3-r1"], link:"thinkTable" },
    { id:"a3-r3", title:"SparkLab Round Three", kind:"spark3", xc:300, xp:150, mins:40,
      blurb:"Draw the concept art on paper. Photograph it. Make it look like it came out of a studio.",
      needs:["a3-r2"] },
    { id:"a3-merge", title:"The Combined Concept", kind:"merge", xc:350, xp:175, mins:35,
      blurb:"Merge all three flipped ideas into one, then generate the views a blueprint would need.",
      needs:["a3-r3"] },
    { id:"a3-cp4", title:"Checkpoint 4 Submission", kind:"submit", xc:300, xp:150, mins:10,
      blurb:"Phase Two: Ideate. Both slides, submitted and logged.",
      needs:["a3-merge"], cp:"Checkpoint 4" }
   ] },

 { id:"act4", n:"Act Four", title:"The Developer's Workshop", sub:"Prototype",
   art:"submerged-2", accent:"245,200,66",
   quests:[
    { id:"a4-start", title:"Starting State", kind:"logstart", xc:150, xp:75, mins:15,
      blurb:"Photograph where your project actually is right now. Write down what you intend to do today.",
      needs:["a3-cp4"] },
    { id:"a4-log", title:"Daily Growth Log", kind:"log", xc:100, xp:50, mins:10, repeat:true,
      blurb:"One entry per session. Starting state, ending state, goals for next time. This is the log your checkpoint is graded on.",
      needs:["a4-start"], link:"protoDev" },
    { id:"a4-build", title:"Build the Prototype", kind:"build", xc:500, xp:250, mins:180,
      blurb:"The actual thing. Use ProtoDev AI as your guide, not your hands.",
      needs:["a4-start"] }
   ] },

 { id:"act5", n:"Act Five", title:"FeedForward Force", sub:"The Beta Testers' Network",
   art:"silence-2", accent:"255,92,200",
   quests:[
    { id:"a5-course", title:"FeedForward Mini Course", kind:"course", xc:250, xp:125, mins:30,
      blurb:"Feedback tells you what went wrong. Feedforward tells you what to do next. Learn the difference, then prove it.",
      needs:["a4-build"] },
    { id:"a5-give", title:"Give Feedforward", kind:"give", xc:200, xp:100, mins:25,
      blurb:"Test two other teams' prototypes and give each one three usable moves.",
      needs:["a5-course"] },
    { id:"a5-take", title:"Take Feedforward", kind:"take", xc:200, xp:100, mins:25,
      blurb:"Collect what came back at you, and decide out loud what you are changing.",
      needs:["a5-give"] }
   ] },

 { id:"act6", n:"Act Six", title:"Exhibit", sub:"Design and Production",
   art:"trash-1", accent:"239,68,68",
   quests:[
    { id:"a6-design", title:"Exhibit Design", kind:"exhibit", xc:350, xp:175, mins:60,
      blurb:"Design the booth. What does a stranger see in the first four seconds?",
      needs:["a5-take"] },
    { id:"a6-pitch", title:"The Pitch", kind:"pitch", xc:400, xp:200, mins:45,
      blurb:"Ninety seconds. Client, problem, solution, proof, ask.",
      needs:["a6-design"] },
    { id:"a6-show", title:"Showcase", kind:"show", xc:1000, xp:500, mins:120,
      blurb:"The Exhibit. Live, in front of people, on X-Live. This is the end of the season.",
      needs:["a6-pitch"], cp:"Season complete" },
    { id:"a6-eval", title:"Self Evaluation and Future Steps", kind:"eval", xc:250, xp:125, mins:30,
      blurb:"What you would do differently, and what you are taking into next season.",
      needs:["a6-show"] }
   ] }
]
};
