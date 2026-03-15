const { useState, useEffect, useCallback, useRef } = React;

// ─── Supabase Configuration ──────────────────────────────────
// INSTRUCTIONS: Replace these with your Supabase project values (see setup guide)
const SUPABASE_URL = "https://wgcrujpmqftelxtutgjr.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndnY3J1anBtcWZ0ZWx4dHV0Z2pyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyODUxMDgsImV4cCI6MjA4ODg2MTEwOH0.65Z6in9zU0Fy4LtjuWPyTvrNO-2aHhgJZfjga9yrI5Q";
const DB_ROW_ID = "spinners-cup-2026";

const supabaseHeaders = {
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  "Prefer": "return=minimal",
};

async function fetchWithTimeout(url, opts = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function load() {
  try {
    if (SUPABASE_URL && SUPABASE_KEY) {
      const res = await fetchWithTimeout(
        `${SUPABASE_URL}/rest/v1/app_state?id=eq.${DB_ROW_ID}&select=data`,
        { headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` } }
      );
      if (res.ok) {
        const rows = await res.json();
        if (rows?.[0]?.data && Object.keys(rows[0].data).length > 0) return rows[0].data;
      }
    }
    return null;
  } catch { return null; }
}

async function save(s) {
  try {
    if (SUPABASE_URL && SUPABASE_KEY) {
      await fetchWithTimeout(
        `${SUPABASE_URL}/rest/v1/app_state?id=eq.${DB_ROW_ID}`,
        {
          method: "PATCH",
          headers: supabaseHeaders,
          body: JSON.stringify({ data: s, updated_at: new Date().toISOString() }),
        }
      );
    }
  } catch {}
}

const SK = "spinners-cup-2026-v6";
const PLAYER_LOCK_KEY = "spinners-cup-2026-player-lock";
const ADMIN_CODE = "admin2026";
const LOGO = "./public/Artboard 1.png";
const SPONSOR_LOGO = "./AirKelsoBlack.png";
const BANNER_PHOTO_SIZE = 34;
const BANNER_LOGO_SIZE = 44;
const CUP_PHOTO_SIZE = 30;
const LEADER_PHOTO_SIZE = 30;
const LEADER_SINGLE_PHOTO_SIZE = 34;
const DEFAULT_TEAM_NAMES = { blue: "Yellow", grey: "Red" };

function cleanTeamName(name, fallback) {
  const value = String(name || "").trim();
  return value || fallback;
}

function getTeamName(state, teamKey) {
  const fallback = DEFAULT_TEAM_NAMES[teamKey] || teamKey;
  return cleanTeamName(state?.teamNames?.[teamKey], fallback);
}

function getTeamLabel(state, teamKey) {
  return `Team ${getTeamName(state, teamKey)}`;
}

function getTeamInitial(state, teamKey) {
  return getTeamName(state, teamKey).charAt(0).toUpperCase() || "?";
}

const PLAYER_PHOTOS = {
  angus: "./public/Angus Scott.png",
  nick: "./Nick Tankard.png",
  tom: "./Tom Crawford.png",
  callum: "./Callum Hinwood.png",
  jkelly: "./James Kelly (2).png",
  jturner: "./James Turner.png",
  chris: "./Chris Green.png",
  luke: "./Luke Abi-Hanna.png",
  lach: "./Lach Taylor (2).png",
  jason: "./Jason McIlwaine (2).png",
  cam: "./Cam Clark.png",
};

// ─── Courses (multi-tee: w=white, b=blue/black) ─────────────
const COURSES = [
  {
    id: "standrews", name: "St Andrews Beach", short: "St Andrews", par: 70,
    teeData: {
      white: { slope:135, rating:71.4, label:"White" },
      blue:  { slope:139, rating:73.6, label:"Blue" },
    },
    holes: [
      { n:1,par:5,si:16,w:452,b:497 },{ n:2,par:4,si:18,w:262,b:279 },{ n:3,par:4,si:2,w:364,b:405 },
      { n:4,par:3,si:6,w:184,b:197 },{ n:5,par:4,si:4,w:358,b:387 },{ n:6,par:3,si:12,w:125,b:169 },
      { n:7,par:4,si:8,w:349,b:377 },{ n:8,par:4,si:14,w:332,b:332 },{ n:9,par:4,si:10,w:327,b:339 },
      { n:10,par:4,si:3,w:366,b:384 },{ n:11,par:3,si:15,w:147,b:147 },{ n:12,par:4,si:7,w:389,b:389 },
      { n:13,par:4,si:1,w:426,b:457 },{ n:14,par:4,si:13,w:276,b:276 },{ n:15,par:4,si:11,w:328,b:358 },
      { n:16,par:3,si:9,w:182,b:197 },{ n:17,par:5,si:17,w:430,b:477 },{ n:18,par:4,si:5,w:373,b:404 },
    ],
  },
  {
    id: "pk_south", name: "PK South Course", short: "PK South", par: 72,
    teeData: {
      white: { slope:134, rating:72.0, label:"White" },
      blue:  { slope:138, rating:74.0, label:"Blue/Black" },
    },
    holes: [
      { n:1,par:4,si:7,si2:25,w:325,b:365 },{ n:2,par:4,si:6,si2:24,w:355,b:380 },{ n:3,par:3,si:8,si2:30,w:170,b:195 },
      { n:4,par:4,si:2,si2:20,w:390,b:400 },{ n:5,par:5,si:13,si2:27,w:445,b:455 },{ n:6,par:4,si:12,si2:29,w:345,b:385 },
      { n:7,par:4,si:17,si2:32,w:285,b:295 },{ n:8,par:5,si:1,si2:19,w:495,b:515 },{ n:9,par:3,si:10,si2:34,w:150,b:180 },
      { n:10,par:4,si:4,si2:22,w:345,b:360 },{ n:11,par:4,si:11,si2:28,w:315,b:335 },{ n:12,par:4,si:14,si2:31,w:285,b:295 },
      { n:13,par:4,si:5,si2:23,w:375,b:405 },{ n:14,par:3,si:15,si2:35,w:135,b:145 },{ n:15,par:5,si:18,si2:33,w:475,b:485 },
      { n:16,par:5,si:9,si2:26,w:470,b:505 },{ n:17,par:3,si:16,si2:36,w:110,b:120 },{ n:18,par:4,si:3,si2:21,w:385,b:405 },
    ],
  },
  {
    id: "pk_north", name: "PK North Course", short: "PK North", par: 72,
    teeData: {
      white: { slope:138, rating:73.0, label:"White" },
      blue:  { slope:138, rating:74.0, label:"Blue/Black" },
    },
    holes: [
      { n:1,par:4,si:6,si2:24,w:315,b:335 },{ n:2,par:3,si:3,si2:26,w:150,b:160 },{ n:3,par:5,si:15,si2:29,w:455,b:475 },
      { n:4,par:4,si:10,si2:28,w:350,b:370 },{ n:5,par:5,si:18,si2:34,w:455,b:475 },{ n:6,par:4,si:7,si2:25,w:295,b:310 },
      { n:7,par:3,si:14,si2:33,w:150,b:155 },{ n:8,par:4,si:11,si2:30,w:320,b:340 },{ n:9,par:4,si:4,si2:21,w:360,b:375 },
      { n:10,par:4,si:1,si2:20,w:400,b:415 },{ n:11,par:4,si:12,si2:31,w:335,b:355 },{ n:12,par:4,si:2,si2:19,w:360,b:365 },
      { n:13,par:4,si:9,si2:32,w:285,b:310 },{ n:14,par:3,si:16,si2:35,w:135,b:145 },{ n:15,par:5,si:13,si2:27,w:490,b:520 },
      { n:16,par:3,si:17,si2:36,w:150,b:165 },{ n:17,par:5,si:8,si2:22,w:485,b:530 },{ n:18,par:4,si:5,si2:23,w:370,b:390 },
    ],
  },
];

const PLAYERS = [
  { id:"angus",name:"Angus Scott",short:"Angus",team:"blue" },
  { id:"nick",name:"Nick Tankard",short:"Nick",team:"blue" },
  { id:"tom",name:"Tom Crawford",short:"Tom",team:"blue" },
  { id:"callum",name:"Callum Hinwood",short:"Callum",team:"blue" },
  { id:"jkelly",name:"James Kelly",short:"J. Kelly",team:"blue" },
  { id:"jturner",name:"James Turner",short:"J. Turner",team:"blue" },
  { id:"chris",name:"Chris Green",short:"Chris",team:"grey" },
  { id:"luke",name:"Luke Abi-Hanna",short:"Luke",team:"grey" },
  { id:"alex",name:"Alex Denning",short:"Alex",team:"grey" },
  { id:"lach",name:"Lach Taylor",short:"Lach",team:"grey" },
  { id:"jason",name:"Jason McIlwaine",short:"Jason",team:"grey" },
  { id:"cam",name:"Cam Clark",short:"Cam",team:"grey" },
];

const PLAYER_BIOS = {
  angus: "Angus arrives with the most violent baseball-bat driver swing the Mornington Peninsula has ever seen, despite barely touching a club thanks to life wrangling young kids. Don’t expect many practice swings, but do expect plenty of stories between shots. In a team environment he’s the bloke keeping morale high and the chat flowing, even if the swing occasionally needs a reminder which direction the fairway goes.",
  tom: "Tom swings the club with the smooth confidence of a man used to making big calls in private equity and expecting them to work out. Armed with a swing that looks far too easy and a head large enough to store all that confidence, he’s quietly convinced the Spinners Cup is his to lose. In a team format he’ll happily assume leadership duties, whether anyone asked him to or not.",
  cam: "Cam has flown down from Brisbane with a rugby-hardened physique and a downswing that looks like it’s trying to tackle the ball through the turf. The defending champion is chasing back-to-back Spinners Cups and carries himself with the quiet confidence of a former pro athlete. In a team setting he’ll bring a competitive edge and expect everyone else to lift to his standards.",
  chris: "Chris arrives fresh from the international cricket circuit and immediately claims the title of best golfer on the trip, which annoyingly might actually be true. Equal parts pretty boy and elite sportsman, he stripes it around the course while quietly trying to escape the long shadow of his little brother, a two-time Spinners Cup champion. In a team environment he’ll be the steady hand — although the sledging will start the moment someone mentions his brother.",
  nick: "Nick worships Tiger Woods and approaches the Spinners Cup with the same intensity, which makes last year’s playoff loss sting even more. With his home course being short, there’s enormous pressure on his driver to finally prove itself on a proper track. In a team setting he’ll bring serious competitive energy, along with the occasional Tiger-inspired fist pump.",
  jason: "Jason possesses what many experts are already calling the ugliest swing ever brought to the Mornington Peninsula. Somehow the ball still goes forward often enough to keep him in the game, much to the confusion of everyone watching. Despite the chaotic mechanics, his clean-cut physique suggests a man built for sport — unfortunately the golf swing didn’t get the same treatment. In a team format he’ll happily grind away and try to sneak in the occasional surprisingly solid shot.",
  jturner: "James Turner launches the ball enormous distances for a man who looks like he should still be shopping in the kids section. As the self-appointed Chief Marketing Officer of the Spinners Cup, he’s responsible for most of the hype and very little of the detail. In a team environment he’ll be excellent for morale, even if his concentration occasionally wanders off with the marketing ideas.",
  callum: "Callum owns a slappy swing that could either thrive or be completely destroyed by the notorious Melbourne sandbelt winds. On the greens his hands have a habit of shaking like a washing machine under pressure. With his first child on the way, this may be the last weekend of uninterrupted golf for the next 18 years. In a team setting he’ll be desperate to contribute — ideally before the putter starts trembling.",
  lach: "Lach has been putting in serious hours with a golf coach and is determined to let everyone know about it. Still relatively new to the game, but already talks like he’s got a green jacket in the wardrobe. Confidence is sky high — the scorecard remains under investigation. In a team environment he’ll bring enthusiasm and plenty of advice, requested or otherwise.",
  jkelly: "James carries the emotional scars of a golf trip where he shanked his first tee shot twice in a row, an achievement few golfers can claim. The tech sales professional insists those days are behind him, but the group will be watching nervously on the first tee. In a team setting he’ll be keen to redeem himself and prove the shank era is officially over.",
  alex: "Alex is annoyingly good at basically every sport he tries, and golf appears to be no exception. When he’s not working for a furniture manufacturer, renovating a house, or flying to China, he somehow finds time to stripe the ball. Natural talent is a dangerous thing in the Spinners Cup. In a team format he’ll likely be the dependable contributor who quietly carries the side.",
  luke: "Luke has flown in from Dubai and arrives convinced the Spinners Cup is already his. A former clutch basketball player, he backs himself in big moments and isn’t shy about reminding the group. Whether the confidence translates to golf remains the weekend’s biggest subplot. In a team environment he’ll relish the big moments and happily take responsibility for the pressure shots.",
};

const PLAYER_BIO_IMAGES = {
  angus: "./public/Angus Scott.png",
  tom: "./Tom Crawford.png",
  cam: "./Cam Clark.png",
  chris: "./Chris Green.png",
  nick: "./Nick Tankard.png",
  jason: "./Jason McIlwaine (2).png",
  jturner: "./James Turner.png",
  callum: "./Callum Hinwood.png",
  lach: "./Lach Taylor (2).png",
  jkelly: "./James Kelly (2).png",
  luke: "./Luke Abi-Hanna.png",
};


// NTP: par 3, not in first 5 holes of front or back nine (holes 1-5 or 10-14)
function getNtpHole(courseId) {
  const c = getCourse(courseId);
  const ok = c.holes.filter(h => h.par === 3 && h.n > 5 && !(h.n >= 10 && h.n <= 14));
  return ok.length > 0 ? ok[0].n : c.holes.filter(h => h.par === 3).pop()?.n || 9;
}
// LD: par 5, not in first 5 holes of front or back nine
function getLdHole(courseId) {
  const c = getCourse(courseId);
  const ok = c.holes.filter(h => h.par === 5 && h.n > 5 && !(h.n >= 10 && h.n <= 14));
  return ok.length > 0 ? ok[0].n : c.holes.filter(h => h.par === 5).pop()?.n || 17;
}

// ─── Hole Descriptions (from course websites) ───────────────
const HOLE_DESC = {
  standrews: [
    "Blind tee shot with coloured aiming posts. The green sits in a pseudo punchbowl that should be forgiving on approach, but the front spills out to a chipping area. Par here takes a full stroke on the field.",
    "Signature hole. Short driveable par 4 with dramatic risk/reward. One of the favourite holes in all of Australia.",
    "As good as it is difficult. Risk/reward opportunities with a safe play up the left or bold line over the right corner. Blind approach through a bunkered chute to a bush-enclosed green. Play it like a short par 5.",
    "Mid-length par 3 with an elevated green.",
    "Strong par 4 requiring a well-positioned tee shot to set up the approach.",
    "Scenic short par 3 over undulating ground.",
    "Mid-length par 4 with rolling fairway and strategic bunkering.",
    "Short par 4 offering multiple options from the tee depending on conditions.",
    "Solid par 4 to close the front nine with a testing approach to a well-protected green.",
    "Strong opening par 4 on the back nine with bunkers guarding the landing area.",
    "Short par 3 with a tricky green complex.",
    "Solid par 4 with fairway bunkering requiring accurate tee shot placement.",
    "Reportedly the longest par 4 in Australia. Brutal, generally playing into the wind. Blind tee shot, tiny green with a punchbowl that denies short approaches. Par takes a full stroke on the field all day.",
    "Short driveable par 4 — best birdie chance. Keep your drive up the left side for an easy chip. Drives right leave a testing chip over a bunker to a blind target.",
    "Mid-length par 4 with undulating fairway requiring a well-struck approach.",
    "Mid-length par 3 with deep sandbelt-style bunkering.",
    "Reachable par 5 offering a scoring opportunity with an accurate drive.",
    "Strong finishing hole requiring solid iron play into a well-defended green.",
  ],
  pk_south: [
    "The creek features on many holes including here. Some widening of the fairway over the creek allows forgiveness for the first shot of the day. From the back tee it becomes a strong par four with the creek guarding the green.",
    "Doglegging around old Manna Gums. Opening up the tee shot has improved it. The green has a large mound cut into the front, forcing a decision between a running shot and the aerial route.",
    "Long par 3 designed with a running shot in mind. The contours nudge a well-played low ball towards the middle of the green, especially with a right to left shape.",
    "A hole inspired by classic short par fours. Strategy from the tee is key — bunkers and positioning determine the difficulty of the approach.",
    "A genuine three-shot par 5 with the creek in play. Strategy off the tee and good course management are essential.",
    "A par 4 with options from the tee. The fairway widens in places, rewarding accurate positioning for the approach into a green defended by bunkers.",
    "Short par 4 — a driveable hole for longer hitters, but bunkers and the small green punish aggression. The conservative play leaves a straightforward pitch.",
    "A strong par 5 with a tight landing area off the tee and a green perched uphill surrounded by traps. One of the more demanding holes on the course.",
    "A short par 3 redesigned with a more exciting green complex. The contours reward well-judged approach shots.",
    "A solid par 4 with wetlands along the left side. Accuracy off the tee is rewarded with a more manageable approach.",
    "A par 4 with gentle slopes and creek lines adding interest. Positioning from the tee sets up the approach into a well-bunkered green.",
    "A short par 4 with a hogsback feature in the fairway. Accurate driving is essential to set up a straightforward approach.",
    "An undulating par 4 — one of the standout holes. The fairway movement and green complex combine to create a memorable challenge.",
    "The shortest hole on the course. A small, well-bunkered green demands precision with the short iron. The uphill approach adds a club.",
    "A long par 5 with creek lines and bunkers creating strategic decisions on each shot. Reachable in two for longer hitters who find the right line.",
    "A par 5 with bunkering either side of the fairway. Large tier on the green and bunkers on both sides make the approach demanding.",
    "A very short par 3 — the smallest hole. Precise distance control is everything here.",
    "Played from the highest point on the South to a fairway below. A sprawling sand waste extends up the right side. Often into a southerly breeze, testing your ability with longer clubs.",
  ],
  pk_north: [
    "Like a firm handshake — not a pushover but not grueling. Ample room off the tee but bunkers pinch in around driving distance. Playing left with your approach uses a handy backstop.",
    "One of the most picturesque holes. The shot across the valley to a green set into a large dune has similarities to Royal Melbourne West's 5th. Front edge yardage is critical — land short and you're 30m from the green.",
    "A par 5 through native heathland. The routing takes advantage of the site's natural sandy terrain and elevation changes.",
    "A strong par 4 where bunkers and positioning from the tee determine the difficulty of the approach. The green complex rewards strategic play.",
    "A thrilling drive through a valley with steep banks on either side. The fairway is wider both short and long of the valley. Easily reachable par 5 for longer hitters.",
    "The first driveable par 4 on the North, playing fairly steeply uphill. Multiple options from the tee depending on how you feel on the day.",
    "One of the highest points on the property. Among the most picturesque tee shots on the North course. Aiming for the widest part of the green on the right is generally the best play.",
    "A wonderful short par 4 featuring a penal hazard. Many of the world's great short par fours use this design philosophy to create risk and reward.",
    "Back to back strong par fours at 9 and 10. A demanding tee shot sets up a testing approach to a well-guarded green.",
    "Another strong par 4. One of the longest holes on the back nine, requiring two solid shots to find the putting surface.",
    "A long sandscape lines the hole. The green is well-defended with bunkers on multiple sides, demanding an accurate approach.",
    "The 'hogsback' is a wonderful feature in golf course design. The fairway movement creates blind and semi-blind shots that reward local knowledge.",
    "A short par 4 similar to the 6th, offering a driveable option. Playing it conservatively still leaves a straightforward pitch into the green.",
    "Surrounded by an amazing expanse of heath and sand. With careful tree removal, the heathland plants and grasses have returned, giving this par 3 its unique look.",
    "For years a medium-length par 5. The redesigned hole takes advantage of the natural terrain with new tee positions adding variety and challenge.",
    "A short par 3 on one of the highest points. The green is nestled in the landscape with bunkering that rewards accurate iron play.",
    "At 530m from the blue tees, the penultimate hole is a true three-shot par 5. Strategy and course management are key across all three shots.",
    "The tee shot gives no hint to what lies around the corner. Perhaps the most photogenic approach on the property, with the green at the base of a huge natural amphitheatre framed by bunkers and heath.",
  ],
};

// ─── PK Room Assignments ─────────────────────────────────────
const PK_ROOMS = [
  { room: "1 (Remote Room)", players: ["Tom Crawford", "Luke Abi-Hanna"] },
  { room: "2", players: ["Chris Green", "Cam Clark"] },
  { room: "3", players: ["Nick Tankard", "James Turner"] },
  { room: "4", players: ["Alex Denning", "Lach Taylor"] },
  { room: "5", players: ["Jason McIlwaine", "Callum Hinwood"] },
  { room: "6", players: ["James Kelly", "Angus Scott"] },
];

const ROUNDS = [
  {
    id:"r1",num:1,day:"Friday 27th March",courseId:"standrews",courseName:"St Andrews Beach",
    teeTimes:["11:39am","11:48am","11:57am"],
    matches:[
      { id:"m1",blue:["angus","nick"],grey:["chris","luke"] },
      { id:"m2",blue:["tom","jturner"],grey:["jason","cam"] },
      { id:"m3",blue:["callum","jkelly"],grey:["alex","lach"] },
    ],
  },
  {
    id:"r2",num:2,day:"Saturday 28th March",courseId:"pk_south",courseName:"PK South Course",
    teeTimes:["12:44pm","12:52pm","1:00pm"],
    matches:[
      { id:"m4",blue:["tom","callum"],grey:["chris","lach"] },
      { id:"m5",blue:["nick","jturner"],grey:["jason","alex"] },
      { id:"m6",blue:["angus","jkelly"],grey:["luke","cam"] },
    ],
  },
  {
    id:"r3",num:3,day:"Sunday 29th March",courseId:"pk_north",courseName:"PK North Course",
    teeTimes:["8:27am","8:35am","8:43am"],
    matches:[
      { id:"m7",blue:["angus","tom"],grey:["chris","alex"] },
      { id:"m8",blue:["nick","callum"],grey:["luke","jason"] },
      { id:"m9",blue:["jturner","jkelly"],grey:["cam","lach"] },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────
function getP(id) { return PLAYERS.find(p => p.id === id); }
function TeamPairDisplay({ids,live,color,align="left",state,roundId,showBadges=false,fontSize=12}){
  const showAvatars = live;
  const names = live
    ? (ids?.length ? ids.map(id => ({
        short: getP(id)?.short || "???",
        badges: showBadges && state && roundId ? chulliganBadges(getChulliganCount(state,roundId,id)) : "",
      })) : [{ short: "???", badges: "" }, { short: "???", badges: "" }])
    : [{ short: "???", badges: "" }, { short: "???", badges: "" }];
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:align==="right"?"flex-end":"flex-start",gap:8}}>
      {showAvatars && (
        <div style={{display:"flex",alignItems:"center",marginRight:2,opacity:live?1:0.75}}>
          <PlayerAvatar id={ids?.[0]} size={CUP_PHOTO_SIZE} live={live} />
          <div style={{marginLeft:-10}}><PlayerAvatar id={ids?.[1]} size={CUP_PHOTO_SIZE} live={live} /></div>
        </div>
      )}
      <div style={{fontSize,fontWeight:600,color,display:"flex",flexDirection:"column",alignItems:align==="right"?"flex-end":"flex-start",lineHeight:1.15,textAlign:align}}>
        {names.map((name, idx) => (
          <span key={`${name.short}_${idx}`} style={{display:"flex",flexDirection:"column",alignItems:align==="right"?"flex-end":"flex-start"}}>
            <span>{name.short}</span>
            {name.badges && <span style={{lineHeight:1,marginTop:1}}>{name.badges}</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

function PlayerAvatar({id, size=32, live=true, border=true}) {
  const player = getP(id);
  const src = PLAYER_PHOTOS[id];
  const teamColor = player?.team === "blue" ? "#D4A017" : "#DC2626";
  const borderColor = live && border ? teamColor : "#d1d5db";
  const initials = (player?.name || "?").split(" ").map(part => part[0]).slice(0,2).join("").toUpperCase();
  return src ? (
    <img src={src} alt={player?.name || "Player"} loading="lazy" decoding="async" style={{
      width:size, height:size, borderRadius:"50%",
      border:`2px solid ${borderColor}`,
      objectFit:"cover", flexShrink:0,
      filter: live ? "none" : "grayscale(100%) brightness(1.1) contrast(0.8) sepia(15%)",
    }}/>
  ) : (
    <div aria-label={player?.name || "Player"} style={{width:size,height:size,borderRadius:"50%",background:"#e2e8f0",border:`2px solid ${borderColor}`,flexShrink:0,display:"grid",placeItems:"center",color:"#475569",fontSize:Math.max(10, Math.round(size*0.32)),fontWeight:700}}>{initials}</div>
  );
}
function SponsorFooter(){
  return (
    <div style={{textAlign:"center",padding:"20px 16px 98px"}}>
      <div style={{fontSize:12,fontWeight:700,color:"#64748b",letterSpacing:0.3,textTransform:"uppercase",marginBottom:8}}>Sponsored By</div>
      <img src={SPONSOR_LOGO} alt="Air Kelso" style={{width:BANNER_LOGO_SIZE,height:BANNER_LOGO_SIZE,objectFit:"contain",display:"block",margin:"0 auto"}} />
    </div>
  );
}

function getCourse(id) { return COURSES.find(c => c.id === id); }
function DC(o) { return JSON.parse(JSON.stringify(o)); }
function dlyHcp(gaHcp, slope, rating, par) {
  if (gaHcp == null) return null;
  const ch = (gaHcp * slope / 113) + ((rating || 72) - (par || 72));
  return Math.round(ch);
}
function courseHcp(gaHcp, course, teeKey) {
  if (gaHcp == null) return null;
  const key = course.id + "_" + teeKey;
  if (HCP_TABLES[key]) return lookupHcp(gaHcp, HCP_TABLES[key]);
  // Fallback formula (shouldn't be needed now)
  return dlyHcp(gaHcp, getSlope(course, teeKey), getRating(course, teeKey), course.par);
}

function lookupHcp(gaHcp, table) {
  for (let i = 0; i < table.length; i++) {
    if (gaHcp <= table[i][0]) return table[i][1];
  }
  return table[table.length - 1][1];
}

// Official GA Daily Handicap Tables (from GA/PK slope index PDFs)
const HCP_TABLES = {
  standrews_white: [
    [-9.8,-10],[-8.9,-9],[-8.0,-8],[-7.1,-7],[-6.2,-6],[-5.3,-5],[-4.4,-4],[-3.5,-3],
    [-2.6,-2],[-1.7,-1],[-0.8,0],[0.1,1],[1.0,2],[1.9,3],[2.8,4],[3.7,5],[4.6,6],
    [5.5,7],[6.4,8],[7.3,9],[8.2,10],[9.1,11],[10.0,12],[10.9,13],[11.8,14],[12.7,15],
    [13.6,16],[14.6,17],[15.5,18],[16.4,19],[17.3,20],[18.2,21],[19.1,22],[20.0,23],
    [20.9,24],[21.8,25],[22.7,26],[23.6,27],[24.5,28],[25.4,29],[26.3,30],[27.2,31],
    [28.1,32],[29.0,33],[29.9,34],[30.8,35],[31.7,36],[32.6,37],[33.5,38],[34.4,39],
    [35.3,40],[36.2,41],[37.1,42],[38.0,43],[38.9,44],[39.8,45],[40.7,46],[41.6,47],
    [42.5,48],[43.4,49],[44.3,50],[45.2,51],[46.1,52],[47.0,53],[47.9,54],[48.8,55],
    [49.7,56],[50.6,57],[51.5,58],[52.4,59],[53.3,60],[54.0,61],
  ],
  standrews_blue: [
    [-9.5,-8],[-8.7,-7],[-7.8,-6],[-6.9,-5],[-6.0,-4],[-5.2,-3],[-4.3,-2],[-3.4,-1],
    [-2.5,0],[-1.7,1],[-0.8,2],[0.1,3],[1.0,4],[1.8,5],[2.7,6],[3.6,7],[4.5,8],
    [5.3,9],[6.2,10],[7.1,11],[8.0,12],[8.8,13],[9.7,14],[10.6,15],[11.5,16],[12.3,17],
    [13.2,18],[14.1,19],[15.0,20],[15.8,21],[16.7,22],[17.6,23],[18.5,24],[19.3,25],
    [20.2,26],[21.1,27],[22.0,28],[22.8,29],[23.7,30],[24.6,31],[25.5,32],[26.3,33],
    [27.2,34],[28.1,35],[29.0,36],[29.8,37],[30.7,38],[31.6,39],[32.5,40],[33.4,41],
    [34.2,42],[35.1,43],[36.0,44],[36.9,45],[37.7,46],[38.6,47],[39.5,48],[40.4,49],
    [41.2,50],[42.1,51],[43.0,52],[43.9,53],[44.7,54],[45.6,55],[46.5,56],[47.4,57],
    [48.2,58],[49.1,59],[50.0,60],[50.9,61],[51.7,62],[52.6,63],[53.5,64],[54.0,65],
  ],
  pk_north_white: [
    [-4.8,-5],[-4.0,-4],[-3.1,-3],[-2.2,-2],[-1.3,-1],[-0.4,0],
    [0.5,1],[1.3,2],[2.2,3],[3.1,4],[4.0,5],[4.9,6],[5.7,7],[6.6,8],[7.5,9],
    [8.4,10],[9.3,11],[10.2,12],[11.0,13],[11.9,14],[12.8,15],[13.7,16],[14.6,17],
    [15.4,18],[16.3,19],[17.2,20],[18.1,21],[19.0,22],[19.9,23],[20.7,24],[21.6,25],
    [22.5,26],[23.4,27],[24.3,28],[25.1,29],[26.0,30],[26.9,31],[27.8,32],[28.7,33],
    [29.6,34],[30.4,35],[31.3,36],[32.2,37],[33.1,38],[34.0,39],[34.8,40],[35.7,41],
    [36.6,42],[37.5,43],[38.4,44],[39.2,45],[40.1,46],[41.0,47],[41.9,48],[42.8,49],
    [43.7,50],[44.5,51],[45.4,52],[46.3,53],[47.2,54],[48.1,55],[48.9,56],[49.8,57],
    [50.7,58],[51.6,59],[52.5,60],[53.4,61],[54.0,62],
  ],
  pk_north_blue: [
    [-4.8,-4],[-3.9,-3],[-3.0,-2],[-2.1,-1],[-1.2,0],[-0.4,1],
    [0.5,2],[1.4,3],[2.3,4],[3.2,5],[4.0,6],[4.9,7],[5.8,8],[6.7,9],[7.6,10],
    [8.5,11],[9.3,12],[10.2,13],[11.1,14],[12.0,15],[12.9,16],[13.7,17],[14.6,18],
    [15.5,19],[16.4,20],[17.3,21],[18.2,22],[19.0,23],[19.9,24],[20.8,25],[21.7,26],
    [22.6,27],[23.4,28],[24.3,29],[25.2,30],[26.1,31],[27.0,32],[27.8,33],[28.7,34],
    [29.6,35],[30.5,36],[31.4,37],[32.3,38],[33.1,39],[34.0,40],[34.9,41],[35.8,42],
    [36.7,43],[37.5,44],[38.4,45],[39.3,46],[40.2,47],[41.1,48],[42.0,49],[42.8,50],
    [43.7,51],[44.6,52],[45.5,53],[46.4,54],[47.2,55],[48.1,56],[49.0,57],[49.9,58],
    [50.8,59],[51.7,60],[52.5,61],[53.4,62],[54.0,63],
  ],
  pk_south_white: [
    [-5.0,-6],[-4.1,-5],[-3.2,-4],[-2.3,-3],[-1.4,-2],[-0.5,-1],
    [0.4,0],[1.3,1],[2.2,2],[3.1,3],[4.0,4],[4.9,5],[5.9,6],[6.8,7],[7.7,8],
    [8.6,9],[9.5,10],[10.4,11],[11.3,12],[12.2,13],[13.1,14],[14.0,15],[14.9,16],
    [15.8,17],[16.7,18],[17.7,19],[18.6,20],[19.5,21],[20.4,22],[21.3,23],[22.2,24],
    [23.1,25],[24.0,26],[24.9,27],[25.8,28],[26.7,29],[27.6,30],[28.6,31],[29.5,32],
    [30.4,33],[31.3,34],[32.2,35],[33.1,36],[34.0,37],[34.9,38],[35.8,39],[36.7,40],
    [37.6,41],[38.5,42],[39.4,43],[40.4,44],[41.3,45],[42.2,46],[43.1,47],[44.0,48],
    [44.9,49],[45.8,50],[46.7,51],[47.6,52],[48.5,53],[49.4,54],[50.3,55],[51.3,56],
    [52.2,57],[53.1,58],[54.0,59],
  ],
  pk_south_blue: [
    [-4.8,-4],[-3.9,-3],[-3.0,-2],[-2.1,-1],[-1.2,0],[-0.4,1],
    [0.5,2],[1.4,3],[2.3,4],[3.2,5],[4.0,6],[4.9,7],[5.8,8],[6.7,9],[7.6,10],
    [8.5,11],[9.3,12],[10.2,13],[11.1,14],[12.0,15],[12.9,16],[13.7,17],[14.6,18],
    [15.5,19],[16.4,20],[17.3,21],[18.2,22],[19.0,23],[19.9,24],[20.8,25],[21.7,26],
    [22.6,27],[23.4,28],[24.3,29],[25.2,30],[26.1,31],[27.0,32],[27.8,33],[28.7,34],
    [29.6,35],[30.5,36],[31.4,37],[32.3,38],[33.1,39],[34.0,40],[34.9,41],[35.8,42],
    [36.7,43],[37.5,44],[38.4,45],[39.3,46],[40.2,47],[41.1,48],[42.0,49],[42.8,50],
    [43.7,51],[44.6,52],[45.5,53],[46.4,54],[47.2,55],[48.1,56],[49.0,57],[49.9,58],
    [50.8,59],[51.7,60],[52.5,61],[53.4,62],[54.0,63],
  ],
};
function hStrokes(dHcp, hole) {
  const si = hole.si || hole;
  if (!dHcp || dHcp <= 0) return 0;
  let shots = 0;
  if (si <= dHcp) shots++;
  const si2 = hole.si2 || (si + 18);
  if (si2 <= dHcp) shots++;
  const si3 = si2 + 18;
  if (si3 <= dHcp) shots++;
  return shots;
}
function sPts(gross, par, strokes) { if (!gross || gross < 0) return 0; return Math.max(0, 2 - (gross - strokes - par)); }
function isPickup(val) { return val === -1; }
function holeFilled(val) { return val > 0 || val === -1; }
function grossForHole(val, par) { if (val === -1) return par + 5; return val > 0 ? val : 0; }

function holeName(n) {
  const suffix = n===1?"st":n===2?"nd":n===3?"rd":(n>=11&&n<=13)?"th":"th";
  const s2 = [21,22,23,31,32,33];
  const suf = n===1?"st":n===2?"nd":n===3?"rd":n===21?"st":n===22?"nd":n===23?"rd":n===31?"st":"th";
  return `${n}${suf} Hole`;
}
function sLabel(pts) { return pts>=5?"Eagle+":pts===4?"Eagle":pts===3?"Birdie":pts===2?"Par":pts===1?"Bogey":"Dbl+"; }
function sColor(pts) { return pts>=3?"#16a34a":pts===2?"#B8860B":pts===1?"#d97706":"#dc2626"; }
function pStab(scores,course,dHcp) { let t=0; course.holes.forEach((h,i)=>{t+=sPts(scores?.[i]||0,h.par,hStrokes(dHcp,h));}); return t; }

function getPartner(playerId, roundId) {
  const round = ROUNDS.find(r => r.id === roundId);
  if (!round) return null;
  for (const m of round.matches) {
    const bIdx = m.blue.indexOf(playerId);
    if (bIdx >= 0) return m.blue[bIdx === 0 ? 1 : 0];
    const gIdx = m.grey.indexOf(playerId);
    if (gIdx >= 0) return m.grey[gIdx === 0 ? 1 : 0];
  }
  return null;
}

function getChulliganRecord(state, roundId, playerId) {
  return state.chulligans?.[roundId]?.[playerId] || {};
}

function getChulliganHole(state, roundId, playerId, nine) {
  return getChulliganRecord(state, roundId, playerId)?.[nine] ?? null;
}

function getChulliganCount(state, roundId, playerId) {
  const rec = getChulliganRecord(state, roundId, playerId);
  return [rec.front, rec.back].filter(v => v != null).length;
}

function chulliganBadges(count) {
  return count > 0 ? "🍺".repeat(count) : "";
}

function findMatchByPlayer(roundId, playerId) {
  const round = ROUNDS.find(r => r.id === roundId);
  if (!round) return null;
  return round.matches.find(m => [...m.blue, ...m.grey].includes(playerId)) || null;
}

function findMatchByTeam(roundId, teamIds) {
  const round = ROUNDS.find(r => r.id === roundId);
  if (!round) return null;
  const key = [...teamIds].sort().join("_");
  return round.matches.find(m => [m.blue, m.grey].some(t => [...t].sort().join("_") === key)) || null;
}

function isSubmitted(state, roundId, playerId) {
  return !!state.submitted?.[roundId]?.[playerId];
}

function matchStatus(state, match, round) {
  const course = getCourse(round.courseId);
  const bSc = match.blue.map(id => state.scores?.[round.id]?.[id] || []);
  const gSc = match.grey.map(id => state.scores?.[round.id]?.[id] || []);
  const any = [...bSc,...gSc].some(s => s.some?.(v => holeFilled(v)));
  if (!any) return { status:"ns",bUp:0,played:0 };
  const tk=getTeeKey(state,round.courseId);const bH = match.blue.map(id => courseHcp(state.handicaps?.[id],course,tk)||0);
  const gH = match.grey.map(id => courseHcp(state.handicaps?.[id],course,tk)||0);
  const mn = Math.min(...bH,...gH);
  const abH = bH.map(h=>h-mn), agH = gH.map(h=>h-mn);
  let bUp=0, played=0;
  let clinched=null;
  for(let i=0;i<18;i++){
    const h=course.holes[i];
    // For each player: pickup(-1) = 99 net (worst possible), >0 = gross - strokes, else not scored
    const bN = match.blue.map((_,pi)=>{ const g=bSc[pi]?.[i]; if(g===-1)return 99; return g>0?g-hStrokes(abH[pi],h):null; });
    const gN = match.grey.map((_,pi)=>{ const g=gSc[pi]?.[i]; if(g===-1)return 99; return g>0?g-hStrokes(agH[pi],h):null; });
    // At least one from each team must have a score (including pickup)
    const blueHasScore = match.blue.some((_,pi) => holeFilled(bSc[pi]?.[i]));
    const greyHasScore = match.grey.some((_,pi) => holeFilled(gSc[pi]?.[i]));
    if(blueHasScore && greyHasScore){
      played++;
      const bestB = Math.min(...bN.filter(v=>v!==null));
      const bestG = Math.min(...gN.filter(v=>v!==null));
      if(bestB<bestG)bUp++; else if(bestG<bestB)bUp--;
      const rem=18-played;
      if(Math.abs(bUp)>rem){clinched={bUp,played,rem};break;}
    }
  }
  if(played===0) return {status:"ns",bUp:0,played:0};
  if(clinched) return {status:"done",winner:clinched.bUp>0?"blue":"grey",bUp:clinched.bUp,played:clinched.played,display:`${Math.abs(clinched.bUp)}&${clinched.rem}`};
  const rem=18-played;
  if(played<18){
    return {status:"live",bUp,played,remaining:rem};
  }
  if(bUp===0) return {status:"done",winner:"halved",bUp:0,played:18,display:"Halved"};
  return {status:"done",winner:bUp>0?"blue":"grey",bUp,played:18,display:`${Math.abs(bUp)} Up`};
}

const DEFAULT_STATE = {
  handicaps:{},
  scores:{},
  ntpWinners:{},
  ldWinners:{},
  chulligans:{},
  submitted:{},
  dailySummaries:{},
  summaryReads:{},
  eventLive:false,
  roundScoringLive:{r1:false,r2:false,r3:false},
  tees:{standrews:"white",pk_south:"white",pk_north:"white"},
  teamNames:{...DEFAULT_TEAM_NAMES}
};

function isRoundScoringLive(state, roundId) {
  return !!state?.roundScoringLive?.[roundId];
}

function isRoundRevealed(state, roundId, live, isAdmin) {
  if (isAdmin) return true;
  if (!live) return false;
  return isRoundScoringLive(state, roundId);
}

// ─── Main App ────────────────────────────────────────────────
function getTeeKey(state, courseId) { return state.tees?.[courseId] || "white"; }
function getSlope(course, teeKey) { return course.teeData[teeKey]?.slope || 132; }
function getRating(course, teeKey) { return course.teeData[teeKey]?.rating || 72; }
function getTeeLabel(course, teeKey) { return course.teeData[teeKey]?.label || "White"; }
function getM(hole, teeKey) { return teeKey === "blue" ? hole.b : hole.w; }

function isRoundFullySubmitted(state, roundId) {
  return PLAYERS.every(p => !!state?.submitted?.[roundId]?.[p.id]);
}

function getRoundLeaderboard(state, round) {
  const course = getCourse(round.courseId);
  return PLAYERS.map(p => {
    const scores = state.scores?.[round.id]?.[p.id] || [];
    const holes = scores.filter(s => holeFilled(s)).length;
    return {
      ...p,
      score: pStab(scores, course, courseHcp(state.handicaps?.[p.id], course, getTeeKey(state, course.id))),
      holes,
    };
  }).sort((a,b)=>b.score-a.score);
}

function getOverallLeaderboard(state) {
  return PLAYERS.map(p => {
    let total = 0;
    ROUNDS.forEach(r => {
      const course = getCourse(r.courseId);
      const scores = state.scores?.[r.id]?.[p.id] || [];
      total += pStab(scores, course, courseHcp(state.handicaps?.[p.id], course, getTeeKey(state, course.id)));
    });
    return { ...p, total };
  }).sort((a,b)=>b.total-a.total);
}

function callBanterModel(prompt) {
  const apiKey = window.localStorage.getItem("spinners-llm-api-key");
  if (!apiKey) return null;
  return fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.9,
      messages: [
        { role: "system", content: "You write funny, cheeky but friendly golf weekend banter." },
        { role: "user", content: prompt },
      ],
    }),
  })
    .then(r => (r.ok ? r.json() : null))
    .then(d => d?.choices?.[0]?.message?.content || null)
    .catch(() => null);
}

async function generateRoundSummary(state, roundId) {
  const round = ROUNDS.find(r => r.id === roundId);
  if (!round) return null;
  const leaderboard = getRoundLeaderboard(state, round);
  const overall = getOverallLeaderboard(state);
  const ntpId = state.ntpWinners?.[`${round.id}_ntp`];
  const ldId = state.ldWinners?.[`${round.id}_ld`];
  const top3 = leaderboard.slice(0,3).map((p,i)=>`${i+1}. ${p.name} (${p.score} pts)`).join("\n");
  const overallTop = overall.slice(0,3).map((p,i)=>`${i+1}. ${p.name} (${p.total} total)`).join("\n");
  const prompt = `Write a short daily summary for round ${round.num} (${round.courseName}).\nRound leaders:\n${top3}\n\nOverall leaders:\n${overallTop}\n\nNTP winner: ${ntpId ? getP(ntpId)?.name : "TBC"}\nLD winner: ${ldId ? getP(ldId)?.name : "TBC"}\n\nReturn exactly three bullet points: one funny headline, one stat nugget, one friendly sledge line.`;
  const aiText = await callBanterModel(prompt);

  if (aiText) {
    return {
      roundId,
      roundNum: round.num,
      title: `Round ${round.num} Banter Bulletin`,
      content: aiText,
      source: "llm",
      releasedAt: new Date().toISOString(),
    };
  }

  const [first, second] = leaderboard;
  const leaderGap = first && second ? first.score - second.score : 0;
  return {
    roundId,
    roundNum: round.num,
    title: `Round ${round.num} Banter Bulletin`,
    content: [
      `• **Clubhouse Headline:** ${first?.short || "Someone"} strutted into ${round.courseName} like they owned the joint, posting **${first?.score ?? "??"} pts** and charging into first.` ,
      `• **Stat Nerd Corner:** The gap from 1st to 2nd is **${leaderGap} pts**, while overall leaderboard chaos remains deliciously alive going into the next round.`,
      `• **Weekend Sledge:** NTP went to **${ntpId ? getP(ntpId)?.short : "the mystery sniper"}** and LD to **${ldId ? getP(ldId)?.short : "the unknown bomber"}** — receipts are being checked by the loudest man in the group chat.`,
    ].join("\n"),
    source: "fallback",
    releasedAt: new Date().toISOString(),
  };
}

function App() {
  const [state,setState]=useState(()=>DC(DEFAULT_STATE));
  const [isAdmin,setIsAdmin]=useState(false);
  const [isSpectator,setIsSpectator]=useState(false);
  const [cur,setCur]=useState(null);
  const [tab,setTab]=useState("cup");
  const [sub,setSub]=useState(null);
  const [lockedPlayerId,setLockedPlayerId]=useState(()=>localStorage.getItem(PLAYER_LOCK_KEY));
  const [summaryPopup,setSummaryPopup]=useState(null);

  useEffect(()=>{
    let alive=true;
    load().then(s=>{if(alive&&s)setState(s);});
    return ()=>{alive=false;};
  },[]);
  useEffect(()=>{
    if (lockedPlayerId && PLAYERS.some(p => p.id === lockedPlayerId)) {
      setCur(lockedPlayerId);
      setTab("cup");
      setSub(null);
    }
  },[lockedPlayerId]);
  useEffect(()=>{
    if(!cur) return;
    load().then(s=>{if(s)setState(s);});
  },[cur,tab,sub]);

  useEffect(() => {
    if (!cur || cur === "admin" || cur === "spectator") return;
    const released = Object.values(state.dailySummaries || {}).sort((a,b) => new Date(b.releasedAt||0) - new Date(a.releasedAt||0));
    const unseen = released.find(s => !state.summaryReads?.[cur]?.[s.roundId]);
    if (unseen) setSummaryPopup(unseen);
  }, [cur, state.dailySummaries, state.summaryReads]);
  const upd=useCallback(fn=>{setState(prev=>{const next=DC(prev);fn(next);save(next);return next;});},[]);

  if(!state) return <div style={S.loading}><div style={S.spinner}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>;
  if(!cur) return <PlayerSelect state={state} lockedPlayerId={lockedPlayerId} onSelect={id=>{if(lockedPlayerId&&lockedPlayerId!==id)return; if(!lockedPlayerId){localStorage.setItem(PLAYER_LOCK_KEY,id);setLockedPlayerId(id);}setIsSpectator(false);setCur(id);setTab("cup");setSub(null);}} onUnlockSelection={()=>{localStorage.removeItem(PLAYER_LOCK_KEY);setLockedPlayerId(null);}} onSpectator={()=>{setIsAdmin(false);setIsSpectator(true);setCur("spectator");setTab("cup");setSub(null);}} onAdmin={c=>{if(c===ADMIN_CODE){setIsAdmin(true);setIsSpectator(false);setCur("admin");setTab("cup");setSub(null);}}} />;

  const live = !!state.eventLive || isAdmin;

  return (
    <div style={S.app}>
      <Header isAdmin={isAdmin} name={isAdmin?"Admin":isSpectator?"Spectator":getP(cur)?.short} playerId={isAdmin||isSpectator?null:cur} live={live} onBack={()=>{if(sub){setSub(null);return;}setCur(null);setIsAdmin(false);setIsSpectator(false);}}/>
      <div style={S.content}>
        {tab==="cup"&&!sub&&<CupScreen state={state} onMatch={id=>setSub({t:"m",id})} live={live} isAdmin={isAdmin}/>}
        {tab==="cup"&&sub?.t==="m"&&(live?<MatchView state={state} upd={upd} isAdmin={isAdmin} matchId={sub.id} onBack={()=>setSub(null)}/>:<LockedMessage title="Match Details" msg="Match details will be revealed on game day." onBack={()=>setSub(null)}/>)}
        {tab==="scores"&&!sub&&(live?<ScoresList state={state} cur={cur} isAdmin={isAdmin} onSelect={(r,p)=>setSub({t:"sc",r,p})}/>:<LockedPage title="Scoring" msg="Scoring will open when the event goes live." icon="⛳"/>)}
        {tab==="scores"&&sub?.t==="sc"&&<ScoreEntry state={state} upd={upd} roundId={sub.r} playerId={sub.p||cur} isAdmin={isAdmin} cur={cur} onBack={()=>setSub(null)}/>}
        {tab==="leaders"&&!sub&&<LeaderList onSelect={id=>setSub({t:"lb",id})}/>}
        {tab==="leaders"&&sub?.t==="lb"&&<LeaderView state={state} catId={sub.id} live={live} isAdmin={isAdmin} onBack={()=>setSub(null)} onOpenMatch={(roundId,matchId)=>{setTab("cup");setSub({t:"m",id:matchId,roundId});}}/>}
        {tab==="schedule"&&!sub&&<ScheduleMenu onSelect={id=>setSub({t:"sched",id})}/>}
        {tab==="schedule"&&sub?.t==="sched"&&sub.id==="matches"&&(live?<MatchSchedule state={state} live={live} isAdmin={isAdmin} onBack={()=>setSub(null)}/>:<LockedMessage title="Match Schedule" msg="The match schedule and team draw will be revealed on game day. Stay tuned! 🏌️" onBack={()=>setSub(null)}/>)}
        {tab==="schedule"&&sub?.t==="sched"&&sub.id==="trip"&&<TripSchedule onBack={()=>setSub(null)}/>}
        {tab==="schedule"&&sub?.t==="sched"&&sub.id==="pkrooms"&&<PkRoomsPage onBack={()=>setSub(null)}/>}
        {tab==="schedule"&&sub?.t==="sched"&&sub.id==="rules"&&<RulesPage state={state} onBack={()=>setSub(null)}/>}
        {tab==="schedule"&&sub?.t==="sched"&&sub.id==="summaries"&&<SummaryHubPage state={state} cur={cur} upd={upd} onBack={()=>setSub(null)}/>}
        {tab==="schedule"&&sub?.t==="sched"&&sub.id==="champions"&&<PastChampionsPage onBack={()=>setSub(null)}/>}
        {tab==="players"&&<PlayersPage state={state} upd={upd} isAdmin={isAdmin} live={live}/>}
      </div>
      {summaryPopup && (
        <DailySummaryModal
          summary={summaryPopup}
          onClose={() => {
            const active = summaryPopup;
            setSummaryPopup(null);
            if (cur && cur !== "admin" && cur !== "spectator") {
              upd(s => {
                if (!s.summaryReads) s.summaryReads = {};
                if (!s.summaryReads[cur]) s.summaryReads[cur] = {};
                s.summaryReads[cur][active.roundId] = true;
              });
            }
          }}
        />
      )}
      <SponsorFooter />
      <NavBar tab={tab} isSpectator={isSpectator} onTab={t=>{setTab(t);setSub(null);}}/>
    </div>
  );
}

function PlayerSelect({state,lockedPlayerId,onSelect,onUnlockSelection,onSpectator,onAdmin}){
  const [showA,setShowA]=useState(false);const [code,setCode]=useState("");const [err,setErr]=useState(false);
  const live = !!state?.eventLive;
  // Shuffle player order when not live so teams can't be guessed from ordering
  const displayPlayers = live ? PLAYERS : [...PLAYERS].sort((a,b) => {
    // Stable alphabetical-by-first-name shuffle that mixes teams
    const order = ["chris","angus","jason","tom","alex","nick","cam","callum","luke","jturner","lach","jkelly"];
    return order.indexOf(a.id) - order.indexOf(b.id);
  });
  return(
    <div style={{...S.app,background:"#f8faf8",display:"flex",flexDirection:"column"}}>
            <div style={{padding:"48px 20px 32px",maxWidth:400,margin:"0 auto",flex:1,width:"100%",boxSizing:"border-box"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <img src={LOGO} alt="Spinners Cup" style={{width:220,height:220,objectFit:"contain",marginBottom:8,display:"block",marginLeft:"auto",marginRight:"auto"}} />
          <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:26,fontWeight:800,color:"#1a2e1a",margin:"0 0 4px"}}>Spinners Cup 2026</h1>
          <p style={{fontSize:13,color:"#6b8a6e",margin:0}}>Mornington Peninsula · March 27–29</p>
        </div>
        <p style={{fontSize:13,color:"#64748b",marginBottom:12,textAlign:"center"}}>{lockedPlayerId?"This phone is locked to one player.":"Choose your role or select your name:"}</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:6}}>
          {!showA?(<button onClick={()=>setShowA(true)} aria-label="Open admin login" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,background:"none",border:"1px solid #d1d5db",borderRadius:10,padding:"10px 16px",color:"#64748b",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",minHeight:44}}>🔒 Admin</button>):(
            <div style={{display:"flex",gap:8,gridColumn:"span 2"}}>
              <input value={code} onChange={e=>{setCode(e.target.value);setErr(false);}} placeholder="Admin code" style={{...S.input,flex:1,marginBottom:0}}/>
              <button onClick={()=>{if(code===ADMIN_CODE)onAdmin(code);else setErr(true);}} style={{padding:"10px 16px",borderRadius:10,border:"none",background:"#2d6a4f",color:"#fff",fontWeight:700,cursor:"pointer",fontSize:13,minHeight:44}}>Go</button>
            </div>
          )}
          <button onClick={onSpectator} aria-label="Open spectator mode" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,border:"1px solid #d1d5db",borderRadius:10,padding:"10px 16px",background:"#fff",color:"#334155",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",minHeight:44}}>👀 Spectator</button>
        </div>
        <p style={{fontSize:11,color:"#94a3b8",marginBottom:12,textAlign:"center"}}>Players: tap your name · Spectators: use spectator mode.</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
          {displayPlayers.map(p=>(
            <button key={p.id} disabled={!!lockedPlayerId&&lockedPlayerId!==p.id} onClick={()=>onSelect(p.id)} style={{padding:"10px 12px",minHeight:52,borderRadius:10,border:"1px solid #e2e8f0",borderLeft:`3px solid ${live?(p.team==="blue"?"#D4A017":"#DC2626"):"#e2e8f0"}`,background:"#fff",fontSize:13,fontWeight:700,color:"#1e293b",cursor:!!lockedPlayerId&&lockedPlayerId!==p.id?"not-allowed":"pointer",opacity:!!lockedPlayerId&&lockedPlayerId!==p.id?0.45:1,textAlign:"left",fontFamily:"'DM Sans',sans-serif",display:"flex",alignItems:"center",gap:8}}>
              <PlayerAvatar id={p.id} size={42} live={live} />
              {p.name}
            </button>
          ))}
        </div>
        {lockedPlayerId&&<p style={{fontSize:11,color:"#94a3b8",marginTop:-8,textAlign:"center"}}>Locked player: {getP(lockedPlayerId)?.name || "Unknown"}</p>}
        {lockedPlayerId&&showA&&<button onClick={onUnlockSelection} style={{display:"block",margin:"0 auto 8px",padding:"8px 12px",borderRadius:8,border:"1px solid #fca5a5",background:"#fff",color:"#dc2626",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>🔓 Unlock player selection</button>}
        {err&&<p style={{color:"#dc2626",fontSize:12,marginTop:4,textAlign:"center"}}>Incorrect code</p>}
      </div>
      <SponsorFooter />
    </div>
  );
}

function Header({isAdmin,name,playerId,live,onBack}){
  return(
    <div style={S.header}>
      <button onClick={onBack} style={{background:"none",border:"none",color:"#2d6a4f",cursor:"pointer",padding:4}}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6"/></svg>
      </button>
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",flex:1}}>
        <div style={{width:72,display:"flex",justifyContent:"center"}}><img src={LOGO} alt="" style={{width:BANNER_LOGO_SIZE,height:BANNER_LOGO_SIZE,objectFit:"contain"}} /></div>
        <div style={{textAlign:"center"}}>
          <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:17,fontWeight:800,color:"#1a2e1a",margin:0}}>Spinners Cup 2026</h1>
          <p style={{fontSize:10,color:"#94a3b8",margin:0}}>{isAdmin?"🔑 Admin":name}</p>
        </div>
        <div style={{width:72,display:"flex",justifyContent:"center"}}>{playerId ? <PlayerAvatar id={playerId} size={BANNER_PHOTO_SIZE} live={live} border={false} /> : <div style={{width:BANNER_PHOTO_SIZE}} />}</div>
      </div>
    </div>
  );
}

function NavBar({tab,isSpectator,onTab}){
  const items=isSpectator
    ? [{k:"cup",l:"Cup",e:"🏆"},{k:"leaders",l:"Leaders",e:"📊"},{k:"schedule",l:"Info",e:"📋"},{k:"players",l:"Players",e:"👥"}]
    : [{k:"cup",l:"Cup",e:"🏆"},{k:"scores",l:"Scores",e:"⛳"},{k:"leaders",l:"Leaders",e:"📊"},{k:"schedule",l:"Info",e:"📋"},{k:"players",l:"Players",e:"👥"}];
  return(
    <div style={S.nav}>
      {items.map(({k,l,e})=>(
        <button key={k} onClick={()=>onTab(k)} style={{...S.navBtn,color:tab===k?"#2d6a4f":"#94a3b8",fontWeight:tab===k?700:400}}>
          <span style={{fontSize:16}}>{e}</span><span style={{fontSize:9,marginTop:1}}>{l}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Locked States ───────────────────────────────────────────
function LockedPage({title,msg,icon}){
  return(
    <div style={{textAlign:"center",padding:"60px 20px"}}>
      <div style={{fontSize:56,marginBottom:16}}>{icon||"🔒"}</div>
      <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:700,color:"#1a2e1a",marginBottom:8}}>{title}</h2>
      <p style={{fontSize:14,color:"#64748b",lineHeight:1.6,maxWidth:280,margin:"0 auto"}}>{msg}</p>
    </div>
  );
}

function LockedMessage({title,msg,onBack}){
  return(
    <div>
      <button onClick={onBack} style={S.backBtn}>← Back</button>
      <div style={{textAlign:"center",padding:"48px 20px"}}>
        <div style={{fontSize:48,marginBottom:12}}>🔒</div>
        <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:"#1a2e1a",marginBottom:8}}>{title}</h2>
        <p style={{fontSize:14,color:"#64748b",lineHeight:1.6,maxWidth:300,margin:"0 auto"}}>{msg}</p>
      </div>
    </div>
  );
}

// ─── Cup Screen ──────────────────────────────────────────────
function CupScreen({state,onMatch,live,isAdmin}){
  let bT=0,gT=0,bLive=0,gLive=0;
  ROUNDS.forEach(r=>{
    if(!isRoundRevealed(state,r.id,live,isAdmin)) return;
    r.matches.forEach(m=>{
    const res=matchStatus(state,m,r);
    if(res.status==="done"){if(res.winner==="blue")bT+=1;else if(res.winner==="grey")gT+=1;else{bT+=0.5;gT+=0.5;}}
    if(res.status==="live"){
      if(res.bUp>0)bLive+=1;
      else if(res.bUp<0)gLive+=1;
      else{bLive+=0.5;gLive+=0.5;}
    }
  });
  });
  const bInterim=bT+bLive;
  const gInterim=gT+gLive;
  const totalPoints=9;
  const blocks=Array.from({length:totalPoints},(_,i)=>i);
  const fmt=n=>n%1===0?n:n.toFixed(1);
  const showLiveTotals=live&&(bLive>0||gLive>0);
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const blockFill=(points,idx)=>clamp(points-idx,0,1);
  const segStep=0.5;
  const segments=Array.from({length:Math.round(totalPoints/segStep)},(_,i)=>i+1);

  const statusSeg=(side,segVal)=>{
    const official=side==="blue"?bT:gT;
    const interim=side==="blue"?bInterim:gInterim;
    const dark=side==="blue"?"#D4A017":"#B91C1C";
    const light=side==="blue"?"#F6DB86":"#FCA5A5";
    if(segVal<=official) return dark;
    if(segVal<=interim) return light;
    return "#e5e7eb";
  };

  return(
    <div>
      <div style={{background:"linear-gradient(135deg,#f0f7f0,#e8f0e8)",borderRadius:16,padding:"20px 16px",marginBottom:20,border:"1px solid #d4e5d4"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{textAlign:"center",flex:1}}>
            <div style={{fontSize:10,fontWeight:700,color:"#D4A017",textTransform:"uppercase",letterSpacing:1}}>{getTeamLabel(state, "blue")}</div>
            <div style={{fontSize:44,fontWeight:800,fontFamily:"'Playfair Display',serif",color:"#D4A017"}}>{live?fmt(bT):"—"}</div>
            {showLiveTotals&&<div style={{fontSize:11,fontWeight:700,color:"#A16207",marginTop:-4}}>Live: {fmt(bInterim)}</div>}
          </div>
          <div style={{fontSize:12,color:"#94a3b8",fontWeight:600}}>vs</div>
          <div style={{textAlign:"center",flex:1}}>
            <div style={{fontSize:10,fontWeight:700,color:"#B91C1C",textTransform:"uppercase",letterSpacing:1}}>{getTeamLabel(state, "grey")}</div>
            <div style={{fontSize:44,fontWeight:800,fontFamily:"'Playfair Display',serif",color:"#B91C1C"}}>{live?fmt(gT):"—"}</div>
            {showLiveTotals&&<div style={{fontSize:11,fontWeight:700,color:"#B91C1C",marginTop:-4}}>Live: {fmt(gInterim)}</div>}
          </div>
        </div>
        {live ? (
          <div style={{position:"relative",paddingTop:18}}>
            <div style={{display:"flex",gap:3,alignItems:"center"}}>
              {blocks.map(i=>{
                const rightIdx=(totalPoints-1)-i;
                const yOfficial=blockFill(bT,i);
                const yInterim=blockFill(bInterim,i);
                const rOfficial=blockFill(gT,rightIdx);
                const rInterim=blockFill(gInterim,rightIdx);
                return (
                  <div key={i} style={{position:"relative",flex:1,height:11,borderRadius:3,background:"#e5e7eb",overflow:"hidden"}}>
                    {yOfficial>0&&<div style={{position:"absolute",left:0,top:0,bottom:0,width:`${yOfficial*100}%`,background:"#D4A017"}}/>}
                    {yInterim>yOfficial&&<div style={{position:"absolute",left:`${yOfficial*100}%`,top:0,bottom:0,width:`${(yInterim-yOfficial)*100}%`,background:"#F6DB86"}}/>}
                    {rOfficial>0&&<div style={{position:"absolute",right:0,top:0,bottom:0,width:`${rOfficial*100}%`,background:"#B91C1C"}}/>}
                    {rInterim>rOfficial&&<div style={{position:"absolute",right:`${rOfficial*100}%`,top:0,bottom:0,width:`${(rInterim-rOfficial)*100}%`,background:"#FCA5A5"}}/>}
                  </div>
                );
              })}
            </div>
            <div style={{position:"absolute",left:"50%",top:4,transform:"translateX(-50%)",display:"flex",flexDirection:"column",alignItems:"center",pointerEvents:"none"}}>
              <div style={{fontSize:10,fontWeight:700,color:"#111827",lineHeight:1}}>4.5</div>
              <div style={{width:2,height:24,background:"#111",marginTop:2,borderRadius:1}}/>
            </div>
          </div>
        ) : (
          <div style={{textAlign:"center",paddingTop:8}}>
            <span style={{fontSize:12,color:"#94a3b8",fontStyle:"italic"}}>Teams & scores revealed on game day</span>
          </div>
        )}
      </div>

      {ROUNDS.map(round=>{
        const roundScoringOpen = isRoundScoringLive(state, round.id);
        const showMatchDetails = isAdmin || (!!state?.eventLive && roundScoringOpen);
        return (
        <div key={round.id} style={{marginBottom:20}}>
          <div style={{marginBottom:8}}>
            <div style={{fontSize:13,fontWeight:700,color:"#1a2e1a"}}>{round.day}</div>
            <div style={{fontSize:11,color:"#94a3b8"}}>{round.courseName}</div>
            {!showMatchDetails && !isAdmin && state?.eventLive && (
              <div style={{fontSize:10,color:"#b45309",marginTop:2}}>Round details are hidden until open scoring is enabled.</div>
            )}
          </div>

          {round.matches.map((match,mi)=>{
            const res=matchStatus(state,match,round);
            let bg="#fff",bdr="#e2e8f0";
            if(showMatchDetails&&(res.status==="done"||res.status==="live")){
              const ahead=res.bUp>0?"blue":res.bUp<0?"grey":"even";
              if(ahead==="blue"||res.winner==="blue"){bg="#FFFBEB";bdr="#FDE68A";}
              else if(ahead==="grey"||res.winner==="grey"){bg="#FEF2F2";bdr="#FECACA";}
              else{bg="#f0fdf4";bdr="#86efac";}
            }
            let midTxt="vs",midCol="#94a3b8";
            if(showMatchDetails&&res.status==="live"){
              midTxt=res.bUp===0?"All Square":`${Math.abs(res.bUp)} Up`;
              midCol=res.bUp>0?"#B8860B":res.bUp<0?"#B91C1C":"#16a34a";
            } else if(showMatchDetails&&res.status==="done"){
              midTxt=res.display;
              midCol=res.winner==="blue"?"#B8860B":res.winner==="grey"?"#B91C1C":"#16a34a";
            }
            return(
              <button key={match.id} onClick={()=>{if(showMatchDetails)onMatch(match.id);}} style={{...S.card,background:bg,borderColor:bdr,cursor:showMatchDetails?"pointer":"default",opacity:showMatchDetails?1:0.75}}>
                <div style={{display:"flex",alignItems:"center"}}>
                  <div style={{flex:1}}><TeamPairDisplay ids={match.blue} live={showMatchDetails} color={showMatchDetails?"#B8860B":"#94a3b8"} state={state} roundId={round.id} showBadges={showMatchDetails} /></div>
                  <div style={{padding:"0 8px",minWidth:70,textAlign:"center"}}>
                    <div style={{fontSize:11,fontWeight:700,color:midCol,fontFamily:"'JetBrains Mono',monospace"}}>{midTxt}</div>
                    {showMatchDetails&&res.status==="live"&&<div style={{fontSize:8,color:"#94a3b8"}}>thru {res.played}</div>}
                  </div>
                  <div style={{flex:1,textAlign:"right"}}><TeamPairDisplay ids={match.grey} live={showMatchDetails} color={showMatchDetails?"#B91C1C":"#94a3b8"} align="right" state={state} roundId={round.id} showBadges={showMatchDetails} /></div>
                </div>
              </button>
            );
          })}

        </div>
      );})}
    </div>
  );
}

// ─── Match View ──────────────────────────────────────────────
function MatchView({state,upd,isAdmin,matchId,onBack}){
  let match,round;
  for(const r of ROUNDS){const m=r.matches.find(x=>x.id===matchId);if(m){match=m;round=r;break;}}
  if(!match)return null;
  const course=getCourse(round.courseId);
  const allIds=[...match.blue,...match.grey];
  const tk=getTeeKey(state,round.courseId);const bH=match.blue.map(id=>courseHcp(state.handicaps?.[id],course,tk)||0);
  const gH=match.grey.map(id=>courseHcp(state.handicaps?.[id],course,tk)||0);
  const mn=Math.min(...bH,...gH);
  const abH=bH.map(h=>h-mn),agH=gH.map(h=>h-mn);
  const res=matchStatus(state,match,round);
  let runUp=0;

  return(
    <div>
      <button onClick={onBack} style={S.backBtn}>← Cup</button>
      <h2 style={S.sectTitle}>Match {round.matches.indexOf(match)+1} — Round {round.num}</h2>
      <p style={{fontSize:12,color:"#94a3b8",marginBottom:12}}>{round.courseName} · {round.day}</p>

      <div style={{display:"flex",justifyContent:"space-between",marginBottom:16,padding:"10px 14px",background:res.winner==="blue"?"#FFFBEB":res.winner==="grey"?"#FEF2F2":"#f0fdf4",borderRadius:10,border:"1px solid #e2e8f0"}}>
        <div><TeamPairDisplay ids={match.blue} live={true} color="#B8860B" state={state} roundId={round.id} showBadges={true} fontSize={13} /></div>
        <span style={{fontSize:13,fontWeight:700,color:res.winner==="blue"?"#B8860B":res.winner==="grey"?"#B91C1C":"#16a34a"}}>{res.status==="ns"?"vs":res.status==="live"?(res.bUp===0?"All Square":res.bUp>0?`${getTeamName(state, "blue")} ${res.bUp} Up`:`${getTeamName(state, "grey")} ${Math.abs(res.bUp)} Up`):res.display}</span>
        <div><TeamPairDisplay ids={match.grey} live={true} color="#B91C1C" align="right" state={state} roundId={round.id} showBadges={true} fontSize={13} /></div>
      </div>

      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,fontFamily:"'DM Sans',sans-serif"}}>
          <thead>
            <tr style={{background:"#f8faf8"}}>
              <th style={S.th}>Hole</th><th style={S.th}>Par</th>
              {allIds.map(id=><th key={id} style={{...S.th,color:getP(id)?.team==="blue"?"#B8860B":"#B91C1C",fontSize:9}}>{getP(id)?.short} {chulliganBadges(getChulliganCount(state,round.id,id))}</th>)}
              <th style={{...S.th,color:"#B8860B",fontSize:9}}>{getTeamName(state, "blue")}</th>
              <th style={{...S.th,color:"#B91C1C",fontSize:9}}>{getTeamName(state, "grey")}</th>
              <th style={{...S.th,fontSize:9}}>Result</th>
            </tr>
          </thead>
          <tbody>
            {course.holes.map((h,i)=>{
              const pD=allIds.map((id,pi)=>{
                const isB=match.blue.includes(id);
                const adjH=isB?abH[match.blue.indexOf(id)]:agH[match.grey.indexOf(id)];
                const gross=state.scores?.[round.id]?.[id]?.[i]||0;
                const isPU=isPickup(gross);
                const pts=isPU?0:sPts(gross,h.par,hStrokes(adjH,h));
                return {gross,pts,isB,isPU,filled:holeFilled(gross)};
              });
              const blueHas=pD.some(d=>d.isB&&d.filled);
              const greyHas=pD.some(d=>!d.isB&&d.filled);
              const bothScored=blueHas&&greyHas;
              const bPts=pD.filter(d=>d.isB).map(d=>d.pts);
              const gPts=pD.filter(d=>!d.isB).map(d=>d.pts);
              const bestB=Math.max(...bPts),bestG=Math.max(...gPts);
              let hRes="",resCol="#94a3b8";
              if(bothScored){
                if(bestB>bestG){runUp++;hRes="🟡";resCol="#B8860B";}
                else if(bestG>bestB){runUp--;hRes="🔴";resCol="#B91C1C";}
                else hRes="—";
              }
              return(
                <tr key={h.n} style={{borderBottom:"1px solid #f1f5f9"}}>
                  <td style={S.td}>{h.n}</td>
                  <td style={{...S.td,color:"#94a3b8"}}>{h.par}</td>
                  {pD.map((d,pi)=>(
                    <td key={pi} style={S.td}>
                      {d.isPU?(<div><div style={{fontWeight:600,color:"#94a3b8"}}>P</div><div style={{fontSize:8,color:"#94a3b8"}}>0pts</div></div>)
                      :d.gross>0?(<div><div style={{fontWeight:600,color:"#1e293b"}}>{d.gross}</div><div style={{fontSize:8,color:sColor(d.pts),fontWeight:600}}>{d.pts}pts</div></div>):(
                        isAdmin?<input type="number" inputMode="numeric" value="" min="1" max="15" style={S.tblIn} onChange={e=>{const v=parseInt(e.target.value)||0;const id=allIds[pi];upd(s=>{if(!s.scores[round.id])s.scores[round.id]={};if(!s.scores[round.id][id])s.scores[round.id][id]=Array(18).fill(0);s.scores[round.id][id][i]=Math.max(0,Math.min(15,v));});}}/>:<span style={{color:"#d1d5db"}}>—</span>
                      )}
                    </td>
                  ))}
                  <td style={{...S.td,fontWeight:700,color:"#B8860B",background:bestB>bestG&&bothScored?"#FFFBEB":"transparent"}}>{bothScored?bestB:blueHas?bestB:"—"}</td>
                  <td style={{...S.td,fontWeight:700,color:"#B91C1C",background:bestG>bestB&&bothScored?"#FEF2F2":"transparent"}}>{bothScored?bestG:greyHas?bestG:"—"}</td>
                  <td style={{...S.td,textAlign:"center"}}>{bothScored&&<div>{hRes}<div style={{fontSize:7,color:runUp>0?"#B8860B":runUp<0?"#B91C1C":"#16a34a",fontWeight:700}}>{runUp===0?"AS":runUp>0?`${getTeamInitial(state, "blue")}+${runUp}`:`${getTeamInitial(state, "grey")}+${Math.abs(runUp)}`}</div></div>}</td>
                </tr>
              );
            })}
            {/* Totals row */}
            {(() => {
              const playerTotals = allIds.map((id, pi) => {
                const isB = match.blue.includes(id);
                const adjH = isB ? abH[match.blue.indexOf(id)] : agH[match.grey.indexOf(id)];
                let totalPts = 0;
                course.holes.forEach((h, i) => {
                  const gross = state.scores?.[round.id]?.[id]?.[i] || 0;
                  totalPts += sPts(gross, h.par, hStrokes(adjH,h));
                });
                return { totalPts, isB };
              });
              let blueTotalBB = 0, greyTotalBB = 0;
              course.holes.forEach((h, i) => {
                const bPtsArr = allIds.map((id, pi) => {
                  const isB = match.blue.includes(id);
                  const adjH = isB ? abH[match.blue.indexOf(id)] : agH[match.grey.indexOf(id)];
                  const gross = state.scores?.[round.id]?.[id]?.[i] || 0;
                  return { pts: sPts(gross, h.par, hStrokes(adjH,h)), isB };
                });
                blueTotalBB += Math.max(...bPtsArr.filter(d => d.isB).map(d => d.pts));
                greyTotalBB += Math.max(...bPtsArr.filter(d => !d.isB).map(d => d.pts));
              });
              const anyScored = playerTotals.some(p => p.totalPts > 0);
              return (
                <tr style={{background:"#f0f7f0",borderTop:"2px solid #d4e5d4"}}>
                  <td style={{...S.td,fontWeight:700,fontSize:10,color:"#1a2e1a"}}>Tot</td>
                  <td style={{...S.td,fontWeight:700,color:"#94a3b8"}}>{course.par}</td>
                  {playerTotals.map((p, pi) => (
                    <td key={pi} style={{...S.td,fontWeight:700,color:p.isB?"#B8860B":"#B91C1C",fontSize:12}}>{p.totalPts > 0 ? p.totalPts : "—"}</td>
                  ))}
                  <td style={{...S.td,fontWeight:800,color:"#B8860B",fontSize:12,background:"#FFFBEB"}}>{anyScored ? blueTotalBB : "—"}</td>
                  <td style={{...S.td,fontWeight:800,color:"#B91C1C",fontSize:12,background:"#FEF2F2"}}>{anyScored ? greyTotalBB : "—"}</td>
                  <td style={S.td}></td>
                </tr>
              );
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Scores List ─────────────────────────────────────────────
function ScoresList({state,cur,isAdmin,onSelect}){
  return(
    <div>
      <h2 style={S.sectTitle}>Enter Scores</h2>
      {ROUNDS.map(round=>{
        const scoringLive = isRoundScoringLive(state, round.id);
        return (
        <div key={round.id} style={{marginBottom:20}}>
          <div style={{marginBottom:8}}>
            <div style={{fontSize:13,fontWeight:700,color:"#1a2e1a"}}>Round {round.num} — {round.day}</div>
            <div style={{fontSize:11,color:"#94a3b8"}}>{round.courseName}</div>
            {!scoringLive && !isAdmin && <div style={{fontSize:10,color:"#b45309",marginTop:2}}>Scoring locked by admin</div>}
          </div>
          {(isAdmin?PLAYERS:PLAYERS.filter(p=>p.id===cur)).map(p=>{
            const sc=state.scores?.[round.id]?.[p.id]||[];
            const filled=sc.filter(s=>holeFilled(s)).length;
            const course=getCourse(round.courseId);
            const dH=courseHcp(state.handicaps?.[p.id],course,getTeeKey(state,course.id));
            const pts=pStab(sc,course,dH);
            const sub=isSubmitted(state,round.id,p.id);
            return(
              <button key={p.id} onClick={()=>onSelect(round.id,p.id)} disabled={!isAdmin && !scoringLive}
                style={{...S.card,borderLeft:`3px solid ${p.team==="blue"?"#D4A017":"#DC2626"}`,background:sub?"#f0fdf4":"#fff",opacity:(!isAdmin && !scoringLive)?0.65:1,cursor:(!isAdmin && !scoringLive)?"not-allowed":"pointer"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:600,color:"#1e293b"}}>
                      {p.name} {sub && <span style={{fontSize:11,color:"#16a34a"}}>✓ Submitted</span>}
                    </div>
                    {dH!=null&&<div style={{fontSize:10,color:"#94a3b8"}}>HCP {dH}</div>}
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:11,color:filled===18?"#16a34a":"#94a3b8",fontFamily:"'JetBrains Mono',monospace"}}>{filled}/18</div>
                    {pts>0&&<div style={{fontSize:11,fontWeight:700,color:"#2d6a4f"}}>{pts}pts</div>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      );})}
    </div>
  );
}

// ─── Score Entry ─────────────────────────────────────────────
function ScoreEntry({state,upd,roundId,playerId,isAdmin,cur,onBack}){
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [showHoleInfo, setShowHoleInfo] = useState(null); // hole index or null

  const round=ROUNDS.find(r=>r.id===roundId);
  const course=getCourse(round.courseId);
  const player=getP(playerId);
  const partnerId = getPartner(playerId, roundId);
  const partner = partnerId ? getP(partnerId) : null;

  const isMine = playerId === cur;
  const mySubmitted = isSubmitted(state, roundId, playerId);
  const roundScoringLive = isRoundScoringLive(state, roundId);
  const canEdit = isAdmin || (roundScoringLive && isMine && !mySubmitted);

  const scores=state.scores?.[roundId]?.[playerId]||[];
  const partnerScores=state.scores?.[roundId]?.[partnerId]||[];
  const dH=courseHcp(state.handicaps?.[playerId],course,getTeeKey(state,course.id));
  const partnerDH = partnerId ? courseHcp(state.handicaps?.[partnerId],course,getTeeKey(state,course.id)) : null;

  const ntpH=getNtpHole(round.courseId),ldH=getLdHole(round.courseId);
  const ntpKey=`${roundId}_ntp`,ldKey=`${roundId}_ld`;
  const myChulligans=getChulliganRecord(state,roundId,playerId);

  let tPts=0,tGross=0;
  course.holes.forEach((h,i)=>{
    const v=scores[i]||0;
    tPts+=sPts(v,h.par,hStrokes(dH,h));
    tGross+=grossForHole(v,h.par);
  });
  const filled = scores.filter(s=>holeFilled(s)).length;

  let pTotalPts=0,pTotalGross=0,pFilled=0;
  if(partnerId){
    course.holes.forEach((h,i)=>{
      const v=partnerScores[i]||0;
      pTotalPts+=sPts(v,h.par,hStrokes(partnerDH,h));
      pTotalGross+=grossForHole(v,h.par);
      if(holeFilled(v))pFilled++;
    });
  }

  const handleSubmit = () => {
    upd(s => {
      if (!s.submitted) s.submitted = {};
      if (!s.submitted[roundId]) s.submitted[roundId] = {};
      s.submitted[roundId][playerId] = true;
    });
    setConfirmSubmit(false);
  };

  const handleUnsubmit = () => {
    upd(s => {
      if (s.submitted?.[roundId]) s.submitted[roundId][playerId] = false;
    });
  };

  const setScore = (pid, holeIdx, val) => {
    upd(s => {
      if (!s.scores[roundId]) s.scores[roundId] = {};
      if (!s.scores[roundId][pid]) s.scores[roundId][pid] = Array(18).fill(0);
      s.scores[roundId][pid][holeIdx] = val;
    });
  };

  const toggleChulligan = (pid, holeIdx) => {
    const nine = holeIdx < 9 ? "front" : "back";
    upd(s => {
      if (!s.chulligans) s.chulligans = {};
      if (!s.chulligans[roundId]) s.chulligans[roundId] = {};
      if (!s.chulligans[roundId][pid]) s.chulligans[roundId][pid] = {};
      const current = s.chulligans[roundId][pid][nine];
      if (current === holeIdx) s.chulligans[roundId][pid][nine] = null;
      else if (current == null) s.chulligans[roundId][pid][nine] = holeIdx;
    });
  };

  const chulliganButtonState = (pid, holeIdx) => {
    const nine = holeIdx < 9 ? "front" : "back";
    const current = getChulliganHole(state, roundId, pid, nine);
    return { active: current === holeIdx, locked: current != null && current !== holeIdx };
  };

  return(
    <div>
      <button onClick={onBack} style={S.backBtn}>← Back</button>

      {/* Hole Info Popup */}
      {showHoleInfo !== null && (
        <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setShowHoleInfo(null)}>
          <div style={{background:"#fff",borderRadius:16,padding:"20px",maxWidth:380,width:"100%",maxHeight:"70vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div>
                <div style={{fontSize:18,fontWeight:800,color:"#1e293b"}}>{holeName(course.holes[showHoleInfo].n)}</div>
                <div style={{fontSize:13,color:"#64748b"}}>Par {course.holes[showHoleInfo].par} · {getM(course.holes[showHoleInfo],getTeeKey(state,course.id))}m · SI {course.holes[showHoleInfo].si}{course.holes[showHoleInfo].si2 ? `/${course.holes[showHoleInfo].si2}/${course.holes[showHoleInfo].si2+18}` : ""}</div>
              </div>
              <button onClick={()=>setShowHoleInfo(null)} style={{width:32,height:32,borderRadius:16,border:"1px solid #e2e8f0",background:"#f8faf8",fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#64748b"}}>×</button>
            </div>
            <div style={{fontSize:14,color:"#475569",lineHeight:1.7}}>{HOLE_DESC[course.id]?.[showHoleInfo] || "No description available."}</div>
            <div style={{marginTop:12,fontSize:11,color:"#94a3b8",fontStyle:"italic"}}>{course.name}</div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
        <div>
          <h2 style={{...S.sectTitle,marginBottom:2}}>{player?.name} {chulliganBadges(getChulliganCount(state,roundId,playerId))}</h2>
          <div style={{fontSize:10,color:"#b45309",fontWeight:700}}>🍺 Chulligans: {getChulliganCount(state,roundId,playerId)}/2</div>
          <p style={{fontSize:12,color:"#94a3b8",margin:0}}>{round.courseName} · {round.day}</p>
          {mySubmitted && <div style={{fontSize:11,color:"#16a34a",fontWeight:600,marginTop:4}}>✓ Score Submitted</div>}
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:20,fontWeight:700,color:"#2d6a4f",fontFamily:"'JetBrains Mono',monospace"}}>{tPts}pts</div>
          {tGross>0&&<div style={{fontSize:11,color:"#94a3b8"}}>Gross: {tGross}</div>}
          <div style={{fontSize:10,color:"#94a3b8"}}>Daily HCP: {dH??"—"} · Slope: {getSlope(course,getTeeKey(state,course.id))} · {getTeeLabel(course,getTeeKey(state,course.id))} Tees</div>
        </div>
      </div>

      {/* Partner summary bar */}
      {partner && (
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderRadius:8,border:"1px solid #e2e8f0",background:"#f8faff",marginBottom:8}}>
          <span style={{fontSize:12,fontWeight:600,color:"#B8860B"}}>👥 {partner.short} {chulliganBadges(getChulliganCount(state,roundId,partnerId))}</span>
          <span style={{fontSize:10,color:"#b45309",fontWeight:700}}>🍺 {getChulliganCount(state,roundId,partnerId)}/2</span>
          <span style={{marginLeft:"auto",fontSize:11,color:"#94a3b8",fontFamily:"'JetBrains Mono',monospace"}}>
            {pTotalPts}pts · Gross: {pTotalGross} · {pFilled}/18
          </span>
        </div>
      )}

      {!roundScoringLive && !isAdmin && (
        <div style={{padding:"8px 12px",marginBottom:8,borderRadius:8,background:"#fffbeb",border:"1px solid #fde68a",fontSize:12,color:"#92400e",fontWeight:600}}>
          Scoring for this round is locked. The admin will open it on game day.
        </div>
      )}

      {/* Column labels */}
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"4px 14px",marginBottom:4}}>
        <div style={{minWidth:72,fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:0.5}}>Hole</div>
        <div style={{flex:1,textAlign:"center",fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:0.5}}>Shots</div>
        <div style={{minWidth:60,textAlign:"right",fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:0.5}}>Stableford</div>
        <div style={{minWidth:36}}/>
      </div>

      {/* Scrollable hole list */}
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {course.holes.map((h,i)=>{
          const val=scores[i]||0;
          const isPU=isPickup(val);
          const strk=hStrokes(dH,h);
          const pts=sPts(val,h.par,strk);
          const isNtp=h.n===ntpH,isLd=h.n===ldH;
          const isNtpW=state.ntpWinners?.[ntpKey]===playerId;
          const isLdW=state.ldWinners?.[ldKey]===playerId;

          const pVal=partnerScores[i]||0;
          const pIsPU=isPickup(pVal);
          const pStrk=hStrokes(partnerDH,h);
          const pPts=sPts(pVal,h.par,pStrk);

          let rowBg="#fff";
          if(isPU) rowBg="#f8f8f8";
          else if(val>0){rowBg=pts>=3?"#f0fdf4":pts===2?"#fafafa":pts===1?"#fffbeb":"#fef2f2";}

          return(
            <div key={h.n}>
              {i===9&&(
                <div style={{padding:"8px 12px",background:"#f1f5f9",borderRadius:8,marginBottom:6,display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontSize:11,fontWeight:700,color:"#64748b"}}>Front 9 {myChulligans.front != null ? "🍺" : ""}</span>
                  <span style={{fontSize:11,fontWeight:700,color:"#2d6a4f",fontFamily:"'JetBrains Mono',monospace"}}>
                    {course.holes.slice(0,9).reduce((a,_,j)=>a+sPts(scores[j]||0,course.holes[j].par,hStrokes(dH,course.holes[j])),0)}pts · Gross: {course.holes.slice(0,9).reduce((a,_,j)=>a+grossForHole(scores[j]||0,course.holes[j].par),0)}
                  </span>
                </div>
              )}
              <div style={{background:rowBg,borderRadius:12,padding:"14px 14px",border:"1px solid #e2e8f0"}}>
                {/* My score row */}
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{minWidth:72}}>
                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                      <span style={{fontSize:18,fontWeight:800,color:"#1e293b"}}>{holeName(h.n)}</span>
                      {HOLE_DESC[course.id]?.[i] && (
                        <button onClick={()=>setShowHoleInfo(i)} style={{width:20,height:20,borderRadius:10,border:"1px solid #d1d5db",background:"#f8faf8",color:"#64748b",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,flexShrink:0}}>i</button>
                      )}
                    </div>
                    <div style={{fontSize:13,color:"#64748b",fontWeight:600}}>Par {h.par}</div>
                    <div style={{fontSize:12,color:"#94a3b8"}}>{getM(h,getTeeKey(state,course.id))}m · SI {h.si}{h.si2 ? `/${h.si2}/${h.si2+18}` : ""}</div>
                    {strk>0&&<div style={{fontSize:11,color:"#2d6a4f",fontWeight:700}}>+{strk} shot{strk>1?"s":""}</div>}
                  </div>
                  <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                    {canEdit?(
                      <>
                        {isPU ? (
                          <div onClick={()=>setScore(playerId,i,0)}
                            style={{width:64,height:56,borderRadius:10,border:"2px solid #94a3b8",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:700,color:"#94a3b8",background:"#f1f5f9",cursor:"pointer"}}>
                            P
                          </div>
                        ) : (
                          <input type="number" inputMode="numeric" value={val||""} min="1" max="15"
                            onChange={e=>{const v=parseInt(e.target.value)||0;setScore(playerId,i,Math.max(0,Math.min(15,v)));}}
                            style={{width:64,height:56,borderRadius:10,border:"2px solid #d1d5db",textAlign:"center",fontFamily:"'JetBrains Mono',monospace",fontSize:26,fontWeight:700,color:"#1e293b",background:"#fff",outline:"none",WebkitAppearance:"none",MozAppearance:"textfield"}}
                          />
                        )}
                        <button onClick={()=>setScore(playerId,i,isPU?0:-1)}
                          style={{width:34,height:34,borderRadius:6,border:`1px solid ${isPU?"#64748b":"#d1d5db"}`,background:isPU?"#B8860B":"#fff",color:isPU?"#fff":"#94a3b8",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                          P
                        </button>
                      </>
                    ):(
                      <div style={{width:64,height:56,borderRadius:10,border:"1px solid #e2e8f0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,fontWeight:700,color:isPU?"#94a3b8":"#1e293b",fontFamily:"'JetBrains Mono',monospace",background:"#f8faf8"}}>{isPU?"P":val||"—"}</div>
                    )}
                  </div>
                  <div style={{minWidth:60,textAlign:"right"}}>
                    {isPU?(<div><div style={{fontSize:18,fontWeight:700,color:"#94a3b8",fontFamily:"'JetBrains Mono',monospace"}}>0pts</div><div style={{fontSize:10,color:"#94a3b8"}}>Pickup</div></div>)
                    :val>0?(<div><div style={{fontSize:22,fontWeight:700,color:sColor(pts),fontFamily:"'JetBrains Mono',monospace"}}>{pts}pts</div><div style={{fontSize:10,fontWeight:600,color:sColor(pts)}}>{sLabel(pts)}</div></div>)
                    :<div style={{color:"#d1d5db"}}>—</div>}
                  </div>
                  {(isNtp||isLd)&&canEdit&&(
                    <button onClick={()=>{upd(s=>{if(isNtp){if(!s.ntpWinners)s.ntpWinners={};s.ntpWinners[ntpKey]=s.ntpWinners[ntpKey]===playerId?null:playerId;}else{if(!s.ldWinners)s.ldWinners={};s.ldWinners[ldKey]=s.ldWinners[ldKey]===playerId?null:playerId;}});}}
                      style={{padding:"4px 8px",borderRadius:6,border:`1px solid ${isNtp?(isNtpW?"#16a34a":"#d1d5db"):(isLdW?"#d97706":"#d1d5db")}`,background:isNtp?(isNtpW?"#f0fdf4":"#fff"):(isLdW?"#fffbeb":"#fff"),fontSize:9,fontWeight:600,color:isNtp?(isNtpW?"#16a34a":"#94a3b8"):(isLdW?"#d97706":"#94a3b8"),cursor:"pointer",whiteSpace:"nowrap"}}>
                      {isNtp?(isNtpW?"✓ NTP":"Claim NTP ⛳"):(isLdW?"✓ LD":"Claim LD 💣")}
                    </button>
                  )}
                  {(()=>{const cState=chulliganButtonState(playerId,i);return (
                    <button onClick={()=>canEdit && toggleChulligan(playerId,i)} disabled={!canEdit || cState.locked}
                      style={{padding:"4px 7px",borderRadius:6,border:`1px solid ${cState.active?"#d97706":"#d1d5db"}`,background:cState.active?"#fffbeb":"#fff",fontSize:12,fontWeight:700,color:(!canEdit&& !cState.active)?"#cbd5e1":cState.locked?"#cbd5e1":cState.active?"#d97706":"#94a3b8",cursor:(!canEdit||cState.locked)?"not-allowed":"pointer",opacity:(!canEdit||cState.locked)?0.7:1}}>
                      {cState.active?"✓🍺":"🍺"}
                    </button>
                  );})()}
                </div>

                {/* Partner row — always visible */}
                {partner && (
                  <div style={{display:"flex",alignItems:"center",gap:10,marginTop:10,paddingTop:10,borderTop:"1px dashed #e2e8f0"}}>
                    <div style={{minWidth:72}}>
                      <div style={{fontSize:14,fontWeight:700,color:"#64748b"}}>{partner.short}</div>
                      {pStrk>0&&<div style={{fontSize:11,color:"#2d6a4f",fontWeight:600}}>+{pStrk}</div>}
                    </div>
                    <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                      {(isAdmin || (roundScoringLive && isMine)) && !isSubmitted(state, roundId, partnerId) ? (
                        <>
                          {pIsPU ? (
                            <div onClick={()=>setScore(partnerId,i,0)}
                              style={{width:52,height:40,borderRadius:8,border:"1.5px solid #94a3b8",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:"#94a3b8",background:"#f1f5f9",cursor:"pointer"}}>
                              P
                            </div>
                          ) : (
                            <input type="number" inputMode="numeric" value={pVal||""} min="1" max="15"
                              onChange={e=>{const v=parseInt(e.target.value)||0;setScore(partnerId,i,Math.max(0,Math.min(15,v)));}}
                              style={{width:52,height:40,borderRadius:8,border:"1.5px solid #FECACA",textAlign:"center",fontFamily:"'JetBrains Mono',monospace",fontSize:18,fontWeight:600,color:"#B8860B",background:"#f8faff",outline:"none",WebkitAppearance:"none",MozAppearance:"textfield"}}
                            />
                          )}
                          <button onClick={()=>setScore(partnerId,i,pIsPU?0:-1)}
                            style={{width:26,height:26,borderRadius:4,border:`1px solid ${pIsPU?"#64748b":"#d1d5db"}`,background:pIsPU?"#B8860B":"#fff",color:pIsPU?"#fff":"#94a3b8",fontSize:10,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                            P
                          </button>
                        </>
                      ):(
                        <div style={{width:52,height:40,borderRadius:8,border:"1px solid #e2e8f0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:600,color:pIsPU?"#94a3b8":"#B8860B",fontFamily:"'JetBrains Mono',monospace",background:"#fafafa"}}>{pIsPU?"P":pVal||"—"}</div>
                      )}
                    </div>
                    <div style={{minWidth:56,textAlign:"right"}}>
                      {pIsPU?(<div style={{fontSize:11,color:"#94a3b8"}}>0pts</div>)
                      :pVal>0?(<div><div style={{fontSize:14,fontWeight:600,color:sColor(pPts),fontFamily:"'JetBrains Mono',monospace"}}>{pPts}pts</div><div style={{fontSize:8,color:sColor(pPts)}}>{sLabel(pPts)}</div></div>)
                      :<div style={{color:"#d1d5db",fontSize:11}}>—</div>}
                    </div>
                    {(()=>{const cState=chulliganButtonState(partnerId,i); const canEditPartner=(isAdmin || (roundScoringLive && isMine)) && !isSubmitted(state, roundId, partnerId); return (
                      <button onClick={()=>canEditPartner && toggleChulligan(partnerId,i)} disabled={!canEditPartner || cState.locked}
                        style={{minWidth:36,padding:"4px 6px",borderRadius:6,border:`1px solid ${cState.active?"#d97706":"#d1d5db"}`,background:cState.active?"#fffbeb":"#fff",fontSize:11,color:(!canEditPartner && !cState.active)?"#cbd5e1":cState.locked?"#cbd5e1":cState.active?"#d97706":"#94a3b8",cursor:(!canEditPartner||cState.locked)?"not-allowed":"pointer",opacity:(!canEditPartner||cState.locked)?0.7:1}}>
                        {cState.active?"✓🍺":"🍺"}
                      </button>
                    );})()}

                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Back 9 total */}
        <div style={{padding:"8px 12px",background:"#f1f5f9",borderRadius:8,display:"flex",justifyContent:"space-between"}}>
          <span style={{fontSize:11,fontWeight:700,color:"#64748b"}}>Back 9 {myChulligans.back != null ? "🍺" : ""}</span>
          <span style={{fontSize:11,fontWeight:700,color:"#2d6a4f",fontFamily:"'JetBrains Mono',monospace"}}>
            {course.holes.slice(9).reduce((a,_,j)=>a+sPts(scores[j+9]||0,course.holes[j+9].par,hStrokes(dH,course.holes[j+9])),0)}pts · Gross: {course.holes.slice(9).reduce((a,_,j)=>a+grossForHole(scores[j+9]||0,course.holes[j+9].par),0)}
          </span>
        </div>

        {/* Total */}
        <div style={{padding:"12px 16px",background:"#2d6a4f",borderRadius:12,display:"flex",justifyContent:"space-between",color:"#fff",fontWeight:700}}>
          <span>Total</span>
          <span style={{fontFamily:"'JetBrains Mono',monospace"}}>{tPts}pts · Gross: {tGross}</span>
        </div>

        {/* Submit / Confirm section */}
        {roundScoringLive && isMine && !mySubmitted && filled === 18 && (
          <div style={{marginTop:8}}>
            {!confirmSubmit ? (
              <button onClick={() => setConfirmSubmit(true)}
                style={{width:"100%",padding:"14px",borderRadius:12,border:"none",background:"#B91C1C",color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>
                Submit Score
              </button>
            ) : (
              <div style={{padding:"16px",background:"#fffbeb",borderRadius:12,border:"1px solid #fde68a"}}>
                <p style={{fontSize:13,fontWeight:600,color:"#92400e",margin:"0 0 8px",lineHeight:1.4}}>
                  Confirm your score of <strong>{tGross} gross ({tPts} stableford pts)</strong>? This will lock your scorecard.
                </p>
                <p style={{fontSize:11,color:"#a16207",margin:"0 0 12px"}}>
                  {partner ? `${partner.short}'s tracked scores won't be locked.` : ""}
                </p>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={handleSubmit}
                    style={{flex:1,padding:"10px",borderRadius:8,border:"none",background:"#16a34a",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer"}}>
                    ✓ Confirm & Submit
                  </button>
                  <button onClick={() => setConfirmSubmit(false)}
                    style={{flex:1,padding:"10px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",color:"#64748b",fontSize:14,fontWeight:600,cursor:"pointer"}}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {roundScoringLive && isMine && !mySubmitted && filled < 18 && filled > 0 && (
          <div style={{marginTop:8,padding:"10px 14px",background:"#f1f5f9",borderRadius:10,textAlign:"center"}}>
            <span style={{fontSize:12,color:"#64748b"}}>{18 - filled} hole{18-filled!==1?"s":""} remaining before you can submit</span>
          </div>
        )}

        {mySubmitted && !isAdmin && (
          <div style={{marginTop:8,padding:"12px 14px",background:"#f0fdf4",borderRadius:10,textAlign:"center",border:"1px solid #bbf7d0"}}>
            <span style={{fontSize:13,fontWeight:600,color:"#16a34a"}}>✓ Score submitted and locked</span>
          </div>
        )}

        {isAdmin && mySubmitted && (
          <div style={{marginTop:8}}>
            <button onClick={handleUnsubmit}
              style={{width:"100%",padding:"10px",borderRadius:8,border:"1px solid #fca5a5",background:"#fff",color:"#dc2626",fontSize:12,fontWeight:600,cursor:"pointer"}}>
              🔓 Unlock Score (Admin)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Leaderboards ────────────────────────────────────────────
function LeaderList({onSelect}){
  const cats=[
    {id:"spinners",name:"🏆 Spinners Cup",desc:"Cumulative stableford across 3 rounds"},
    {id:"d1",name:"Day 1 Stableford",desc:"St Andrews Beach"},
    {id:"d2",name:"Day 2 Stableford",desc:"PK South"},
    {id:"d3",name:"Day 3 Stableford",desc:"PK North"},
    {id:"2b1",name:"Day 1 2-Ball Best Ball",desc:"St Andrews Beach"},
    {id:"2b2",name:"Day 2 2-Ball Best Ball",desc:"PK South"},
    {id:"2b3",name:"Day 3 2-Ball Best Ball",desc:"PK North"},
    {id:"ntp",name:"📍 Nearest the Pin",desc:"Winners per round"},
    {id:"ld",name:"💪 Longest Drive",desc:"Winners per round"},
  ];
  return(<div><h2 style={S.sectTitle}>Leaderboards</h2>{cats.map(c=>(<button key={c.id} onClick={()=>onSelect(c.id)} style={S.card}><div style={{fontSize:14,fontWeight:700,color:"#1e293b"}}>{c.name}</div><div style={{fontSize:11,color:"#94a3b8"}}>{c.desc}</div></button>))}</div>);
}

function LeaderView({state,catId,live,isAdmin,onBack,onOpenMatch}){
  const hideDailyPlayerPhotos = !live && (catId.startsWith("d") || catId.startsWith("2b"));
  if(catId==="ntp"||catId==="ld"){
    return(<div><button onClick={onBack} style={S.backBtn}>← Back</button><h2 style={S.sectTitle}>{catId==="ntp"?"📍 Nearest the Pin":"💪 Longest Drive"}</h2>
      {ROUNDS.map(round=>{
        const hn=catId==="ntp"?getNtpHole(round.courseId):getLdHole(round.courseId);
        const key=`${round.id}_${catId}`;
        const wId=catId==="ntp"?state.ntpWinners?.[key]:state.ldWinners?.[key];
        const w=wId?getP(wId):null;
        return(<div key={round.id} style={{...S.card,borderLeft:`3px solid ${w?"#16a34a":"#e2e8f0"}`}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:13,fontWeight:700,color:"#1e293b"}}>Round {round.num} — Hole {hn}</div><div style={{fontSize:11,color:"#94a3b8"}}>{round.courseName}</div></div><div style={{display:"flex",alignItems:"center",gap:8}}>{w && <PlayerAvatar id={w.id} size={LEADER_PHOTO_SIZE} live={live} />}<div style={{fontSize:14,fontWeight:700,color:w?"#1e293b":"#d1d5db"}}>{w?.name||"TBD"}</div></div></div></div>);
      })}
    </div>);
  }
  let rankings=[];
  if(catId==="spinners"){
    rankings=PLAYERS.map(p=>{
      let t=0,holes=0;
      ROUNDS.forEach(r=>{
        if(!isRoundRevealed(state,r.id,live,isAdmin)) return;
        const c=getCourse(r.courseId);const sc=state.scores?.[r.id]?.[p.id]||[];
        t+=pStab(sc,c,courseHcp(state.handicaps?.[p.id],c,getTeeKey(state,c.id)));
        holes+=sc.filter(s=>holeFilled(s)).length;
      });
      return{...p,score:t,holes,totalHoles:54};
    }).sort((a,b)=>b.score-a.score);
  } else if(catId.startsWith("d")){
    const ri=parseInt(catId[1])-1;const round=ROUNDS[ri];const course=getCourse(round.courseId);
    if(!isRoundRevealed(state,round.id,live,isAdmin)){
      return(<div><button onClick={onBack} style={S.backBtn}>← Back</button><h2 style={S.sectTitle}>Round locked</h2><div style={{...S.card,borderStyle:"dashed",borderColor:"#cbd5e1",background:"#f8fafc"}}><div style={{fontSize:12,fontWeight:700,color:"#334155"}}>This leaderboard is hidden</div><div style={{fontSize:11,color:"#64748b",marginTop:2}}>It will unlock once admin opens scoring for this round.</div></div></div>);
    }
    rankings=PLAYERS.map(p=>{
      const sc=state.scores?.[round.id]?.[p.id]||[];
      const holes=sc.filter(s=>holeFilled(s)).length;
      return{...p,score:pStab(sc,course,courseHcp(state.handicaps?.[p.id],course,getTeeKey(state,course.id))),holes,totalHoles:18,roundId:round.id,matchId:findMatchByPlayer(round.id,p.id)?.id};
    }).sort((a,b)=>b.score-a.score);
  } else if(catId.startsWith("2b")){
    const ri=parseInt(catId[2])-1;const round=ROUNDS[ri];const course=getCourse(round.courseId);
    if(!isRoundRevealed(state,round.id,live,isAdmin)){
      return(<div><button onClick={onBack} style={S.backBtn}>← Back</button><h2 style={S.sectTitle}>Round locked</h2><div style={{...S.card,borderStyle:"dashed",borderColor:"#cbd5e1",background:"#f8fafc"}}><div style={{fontSize:12,fontWeight:700,color:"#334155"}}>This leaderboard is hidden</div><div style={{fontSize:11,color:"#64748b",marginTop:2}}>It will unlock once admin opens scoring for this round.</div></div></div>);
    }
    const pairs=[];
    round.matches.forEach(match=>{[match.blue,match.grey].forEach(team=>{
      const [a,b]=team;const sA=state.scores?.[round.id]?.[a]||[];const sB=state.scores?.[round.id]?.[b]||[];
      const hA=courseHcp(state.handicaps?.[a],course,getTeeKey(state,course.id));const hB=courseHcp(state.handicaps?.[b],course,getTeeKey(state,course.id));
      let pts=0,holes=0;
      course.holes.forEach((h,i)=>{
        const pA=sPts(sA[i]||0,h.par,hStrokes(hA,h));const pB=sPts(sB[i]||0,h.par,hStrokes(hB,h));
        pts+=Math.max(pA,pB);
        if(holeFilled(sA[i]||0)||holeFilled(sB[i]||0)) holes++;
      });
      pairs.push({id:`${a}_${b}`,topName:getP(a)?.short,bottomName:getP(b)?.short,team:getP(a)?.team,score:pts,holes,totalHoles:18,roundId:round.id,matchId:findMatchByTeam(round.id,[a,b])?.id,chCount:getChulliganCount(state,round.id,a)+getChulliganCount(state,round.id,b)});
    });});
    rankings=pairs.sort((a,b)=>b.score-a.score);
  }
  const titles={spinners:"🏆 Spinners Cup",d1:"Day 1 Stableford",d2:"Day 2 Stableford",d3:"Day 3 Stableford","2b1":"Day 1 2-Ball","2b2":"Day 2 2-Ball","2b3":"Day 3 2-Ball"};
  return(<div><button onClick={onBack} style={S.backBtn}>← Back</button><h2 style={S.sectTitle}>{titles[catId]}</h2>
    {rankings.map((r,i)=>{const canOpen=!!(r.roundId&&r.matchId&&onOpenMatch);return (<button key={r.id} onClick={()=>{if(canOpen)onOpenMatch(r.roundId,r.matchId);}} style={{...S.card,borderLeft:`3px solid ${r.team==="blue"?"#D4A017":"#DC2626"}`,background:i===0?"#f0fdf4":"#fff",width:"100%",textAlign:"left",borderTop:"1px solid #e2e8f0",borderRight:"1px solid #e2e8f0",borderBottom:"1px solid #e2e8f0",cursor:canOpen?"pointer":"default"}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:24,fontSize:i<3?16:13,fontWeight:700,color:"#94a3b8",textAlign:"center"}}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":i+1}</div>
        {!hideDailyPlayerPhotos && (r.id && r.id.includes("_") ? (
          <div style={{display:"flex",alignItems:"center",marginRight:2}}>
            <PlayerAvatar id={r.id.split("_")[0]} size={LEADER_PHOTO_SIZE} live={live} />
            <div style={{marginLeft:-10}}><PlayerAvatar id={r.id.split("_")[1]} size={LEADER_PHOTO_SIZE} live={live} /></div>
          </div>
        ) : (
          <PlayerAvatar id={r.id} size={LEADER_SINGLE_PHOTO_SIZE} live={live} />
        ))}
        <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:"#1e293b",display:"flex",flexDirection:"column",lineHeight:1.15}}>{r.id && r.id.includes("_") ? (<><span>{r.topName}</span><span>{r.bottomName} {r.chCount?chulliganBadges(r.chCount):""}</span></>) : (<span>{r.name} {chulliganBadges(getChulliganCount(state,r.roundId||"",r.id))}</span>)}</div></div>
        <div style={{textAlign:"right"}}>
          <div style={{display:"flex",alignItems:"baseline",gap:4,justifyContent:"flex-end"}}>
            <span style={{fontSize:16,fontWeight:700,color:"#2d6a4f",fontFamily:"'JetBrains Mono',monospace"}}>{r.score}</span>
            <span style={{fontSize:10,color:r.holes===r.totalHoles?"#16a34a":"#94a3b8",fontWeight:500}}>({r.holes}/{r.totalHoles})</span>
          </div>
        </div>
      </div>
    </button>);})}
  </div>);
}

// ─── Schedule ────────────────────────────────────────────────
// ─── Schedule Menu ───────────────────────────────────────────
function ScheduleMenu({onSelect}){
  return(
    <div>
      <h2 style={S.sectTitle}>Info</h2>
      <button onClick={()=>onSelect("matches")} style={{...S.card,display:"flex",alignItems:"center",gap:12,padding:"16px"}}>
        <span style={{fontSize:28}}>⛳</span>
        <div>
          <div style={{fontSize:15,fontWeight:700,color:"#1e293b"}}>Match Schedule & Draw</div>
          <div style={{fontSize:12,color:"#94a3b8"}}>Tee times, pairings & course info for each round</div>
        </div>
      </button>
      <button onClick={()=>onSelect("trip")} style={{...S.card,display:"flex",alignItems:"center",gap:12,padding:"16px"}}>
        <span style={{fontSize:28}}>🗓️</span>
        <div>
          <div style={{fontSize:15,fontWeight:700,color:"#1e293b"}}>Trip Itinerary</div>
          <div style={{fontSize:12,color:"#94a3b8"}}>Full trip schedule from Thursday to Sunday</div>
        </div>
      </button>
      <button onClick={()=>onSelect("pkrooms")} style={{...S.card,display:"flex",alignItems:"center",gap:12,padding:"16px"}}>
        <span style={{fontSize:28}}>🏨</span>
        <div>
          <div style={{fontSize:15,fontWeight:700,color:"#1e293b"}}>PK Rooms</div>
          <div style={{fontSize:12,color:"#94a3b8"}}>Peninsula Kingswood room allocations</div>
        </div>
      </button>
      <button onClick={()=>onSelect("rules")} style={{...S.card,display:"flex",alignItems:"center",gap:12,padding:"16px"}}>
        <span style={{fontSize:28}}>📖</span>
        <div>
          <div style={{fontSize:15,fontWeight:700,color:"#1e293b"}}>Competition Rules</div>
          <div style={{fontSize:12,color:"#94a3b8"}}>Formats, scoring & special rules for the weekend</div>
        </div>
      </button>
      <button onClick={()=>onSelect("summaries")} style={{...S.card,display:"flex",alignItems:"center",gap:12,padding:"16px"}}>
        <span style={{fontSize:28}}>🧠</span>
        <div>
          <div style={{fontSize:15,fontWeight:700,color:"#1e293b"}}>Weekend Banter Summary</div>
          <div style={{fontSize:12,color:"#94a3b8"}}>Released daily write-ups with stats, laughs and sledges</div>
        </div>
      </button>
      <button onClick={()=>onSelect("champions")} style={{...S.card,display:"flex",alignItems:"center",gap:12,padding:"16px"}}>
        <span style={{fontSize:28}}>👑</span>
        <div>
          <div style={{fontSize:15,fontWeight:700,color:"#1e293b"}}>Past Champions</div>
          <div style={{fontSize:12,color:"#94a3b8"}}>Hall of fame, legends, and highly selective historical truth</div>
        </div>
      </button>
    </div>
  );
}

// ─── Match Schedule ──────────────────────────────────────────
function MatchSchedule({state,live,isAdmin,onBack}){
  return(<div>
    <button onClick={onBack} style={S.backBtn}>← Schedule</button>
    <h2 style={S.sectTitle}>Match Schedule & Draw</h2>
    {ROUNDS.map(round=>{const course=getCourse(round.courseId);return(
      <div key={round.id} style={{...S.card,border:"1px solid #d4e5d4",background:"#f8faf8",marginBottom:16}}>
        <div style={{fontSize:10,fontWeight:700,color:"#2d6a4f",textTransform:"uppercase",letterSpacing:1}}>Round {round.num}</div>
        <div style={{fontSize:17,fontWeight:800,color:"#1a2e1a",fontFamily:"'Playfair Display',serif",marginTop:2}}>{round.courseName}</div>
        <div style={{fontSize:12,color:"#64748b",marginTop:2}}>{round.day}</div>
        <div style={{fontSize:11,color:"#94a3b8",fontFamily:"'JetBrains Mono',monospace"}}>Par {course.par} · Slope {getSlope(course,'white')} · CR {getRating(course,'white')} · White Tees</div>
        <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid #e2e8f0"}}>
          <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>Tee Times & Draw</div>
          {!isRoundRevealed(state,round.id,live,isAdmin) ? (
            <div style={{padding:"10px 12px",background:"#fff",borderRadius:8,border:"1px dashed #cbd5e1"}}>
              <div style={{fontSize:12,fontWeight:700,color:"#334155"}}>Round locked</div>
              <div style={{fontSize:11,color:"#64748b",marginTop:2}}>Pairings reveal when scoring opens for this round.</div>
            </div>
          ) : (
            <>
          {round.matches.map((match,mi)=>(
            <div key={match.id} style={{padding:"8px 10px",background:"#fff",borderRadius:8,marginBottom:6,border:"1px solid #e2e8f0"}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span style={{fontSize:12,fontWeight:700,color:"#2d6a4f",fontFamily:"'JetBrains Mono',monospace"}}>{round.teeTimes[mi]}</span>
                <span style={{fontSize:10,color:"#94a3b8"}}>Match {mi+1}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:12,fontWeight:600,color:"#B8860B",flex:1}}><span style={{display:"inline-flex",flexDirection:"column",lineHeight:1.2,alignItems:"flex-start"}}><span>{match.blue.map(id=>getP(id)?.name)[0]}</span><span>{match.blue.map(id=>getP(id)?.name)[1]}</span></span></span>
                <span style={{fontSize:10,color:"#94a3b8"}}>vs</span>
                <span style={{fontSize:12,fontWeight:600,color:"#B91C1C",flex:1,textAlign:"right"}}><span style={{display:"inline-flex",flexDirection:"column",lineHeight:1.2,alignItems:"flex-end"}}><span>{match.grey.map(id=>getP(id)?.name)[0]}</span><span>{match.grey.map(id=>getP(id)?.name)[1]}</span></span></span>
              </div>
            </div>
          ))}
            </>
          )}
        </div>
      </div>
    );})}
  </div>);
}

// ─── Trip Schedule ───────────────────────────────────────────
function TripSchedule({onBack}){
  const days = [
    {
      day: "Thursday 27th March",
      label: "Travel & Warm-Up",
      emoji: "✈️",
      items: [
        { time: "6:00am", text: "Thursday golfers flight to Melbourne" },
        { time: "12:30pm", text: "Warm-up round at The Dunes Golf Course" },
        { time: "After golf", text: "Check-in at AirBnB, St Andrews Beach" },
        { time: "Evening", text: "Dinner — Portsea Hotel" },
      ],
    },
    {
      day: "Friday 28th March",
      label: "Round 1 — St Andrews Beach",
      emoji: "🏌️",
      items: [
        { time: "6:00am", text: "Friday golfers flight to Melbourne" },
        { time: "10:00am", text: "Spinners Cup Launch at AirBnB 🏆" },
        { time: "11:30am", text: "Round 1 — St Andrews Beach Golf Club", highlight: true },
        { time: "After golf", text: "Beers & Dinner at St Andrews Beach Brewery 🍺" },
      ],
    },
    {
      day: "Saturday 29th March",
      label: "Round 2 — PK South",
      emoji: "🏌️",
      items: [
        { time: "10:30am", text: "Check-out AirBnB" },
        { time: "~11:30am", text: "Arrive Peninsula Kingswood (1hr drive)" },
        { time: "12:40pm", text: "Round 2 — PK South Course", highlight: true },
        { time: "7:00pm", text: "BBQ Dinner at PK Clubhouse 🥩" },
      ],
    },
    {
      day: "Sunday 30th March",
      label: "Round 3 — PK North",
      emoji: "🏆",
      items: [
        { time: "7:30am", text: "Check-out of rooms" },
        { time: "7:30am", text: "Breakfast at PK Clubhouse (included in room rate)" },
        { time: "8:25am", text: "Round 3 — PK North Course", highlight: true },
        { time: "1:00pm", text: "Jacket Presentation 🧥", highlight: true },
        { time: "~2:30pm", text: "Depart for Melbourne Airport ✈️" },
      ],
    },
  ];

  return(
    <div>
      <button onClick={onBack} style={S.backBtn}>← Schedule</button>
      <h2 style={S.sectTitle}>Trip Itinerary</h2>
      <p style={{fontSize:12,color:"#94a3b8",marginBottom:16}}>Spinners Cup 2026 · Mornington Peninsula</p>

      {days.map((d, di) => (
        <div key={di} style={{marginBottom:16}}>
          <div style={{...S.card, border:"1px solid #d4e5d4", background:"#f8faf8", padding:"14px 14px 10px"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <span style={{fontSize:22}}>{d.emoji}</span>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:"#1a2e1a",fontFamily:"'Playfair Display',serif"}}>{d.day}</div>
                <div style={{fontSize:11,color:"#2d6a4f",fontWeight:600}}>{d.label}</div>
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {d.items.map((item, ii) => (
                <div key={ii} style={{
                  display:"flex", gap:10, padding:"8px 10px", borderRadius:8,
                  background: item.highlight ? "#e8f5e0" : "#fff",
                  border: item.highlight ? "1px solid #86efac" : "1px solid #e2e8f0",
                }}>
                  <div style={{
                    minWidth:62, fontSize:11, fontWeight:600, color:"#2d6a4f",
                    fontFamily:"'JetBrains Mono',monospace", paddingTop:1,
                  }}>
                    {item.time}
                  </div>
                  <div style={{
                    fontSize:13, color: item.highlight ? "#1a2e1a" : "#B8860B",
                    fontWeight: item.highlight ? 700 : 400, lineHeight: 1.4,
                  }}>
                    {item.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

      <div style={{padding:"12px 14px",background:"#f1f5f9",borderRadius:10,marginTop:8}}>
        <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:6}}>📋 Key Info</div>
        <div style={{fontSize:12,color:"#475569",lineHeight:1.6}}>
          <div>🏠 <strong>Thu–Fri:</strong> AirBnB at St Andrews Beach</div>
          <div>🏨 <strong>Sat night:</strong> On-site rooms at Peninsula Kingswood</div>
          <div>👔 <strong>PK Dress Code:</strong> Collared shirt, tailored shorts/pants, soft spikes</div>
        </div>
      </div>
    </div>
  );
}

function PkRoomsPage({onBack}){
  return (
    <div>
      <button onClick={onBack} style={S.backBtn}>← Info</button>
      <h2 style={S.sectTitle}>PK Rooms</h2>
      <p style={{fontSize:12,color:"#94a3b8",marginBottom:12}}>Saturday night accommodation at Peninsula Kingswood.</p>
      <div style={{padding:"14px",background:"#fff",borderRadius:12,border:"1px solid #e2e8f0"}}>
        <div style={{fontSize:13,fontWeight:700,color:"#1e293b",marginBottom:10}}>🏨 PK Room Assignments</div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {PK_ROOMS.map((r,i) => (
            <div key={i} style={{display:"flex",alignItems:"center",padding:"8px 10px",background:"#f8faf8",borderRadius:8,border:"1px solid #e2e8f0"}}>
              <div style={{minWidth:90,fontSize:12,fontWeight:700,color:"#2d6a4f"}}>Room {r.room}</div>
              <div style={{fontSize:13,color:"#1e293b"}}>{r.players.join(" & ")}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Rules Page ──────────────────────────────────────────────
function RulesPage({state,onBack}){
  const rules = [
    {
      title: "🏆 Teams Cup (Ryder Cup Format)",
      emoji: "🏆",
      items: [
        `Two teams — ${getTeamLabel(state, "grey")} vs ${getTeamLabel(state, "blue")} — compete across 3 rounds.`,
        "Each round has 3 matches (2v2 pairs), for a total of 9 matches over the weekend.",
        "Each match is a 2-ball best ball net match play. On each hole, each team takes the best net stableford score from their pair.",
        "The team with the higher stableford score wins the hole. If scores are equal, the hole is halved.",
        "The pair that wins the most holes wins the match, scoring 1 point for their team. A drawn match scores 0.5 points each.",
        "The team with the most points out of 9 at the end of Sunday wins the Teams Cup.",
      ],
    },
    {
      title: "⭐ Spinners Cup (Individual Stableford)",
      items: [
        "Cumulative individual net stableford competition across all 3 rounds.",
        "The player with the highest total stableford points after 54 holes wins the Spinners Cup.",
        "Stableford scoring: Double Eagle+ = 5pts, Eagle = 4pts, Birdie = 3pts, Par = 2pts, Bogey = 1pt, Double Bogey+ = 0pts. All scores are calculated on net (after handicap strokes).",
      ],
    },
    {
      title: "🥇 Daily Stableford",
      items: [
        "Best individual net stableford score for each round.",
        "One winner per day — 3 daily prizes across the weekend.",
        "Same stableford scoring as the Spinners Cup.",
      ],
    },
    {
      title: "🤝 2-Ball Best Ball (Daily)",
      items: [
        "Each pair's combined stableford score for the round, taking the best net stableford score from the pair on each hole.",
        "One winning pair per day — 3 daily prizes.",
        "Pairs are determined by the match draw for each round.",
      ],
    },
    {
      title: "📍 Nearest the Pin (NTP)",
      items: [
        "One NTP competition per round on a designated par 3 hole.",
        "The ball must settle on the green to count.",
        "Players can claim NTP via the scoring app. The closest verified shot wins.",
      ],
    },
    {
      title: "💪 Longest Drive (LD)",
      items: [
        "One Longest Drive competition per round on a designated par 5 hole.",
        "The ball must settle on the fairway to count.",
        "Players can claim LD via the scoring app.",
      ],
    },
    {
      title: "💵 Prize Money",
      items: [
        "Round 1, Round 2, Round 3 payouts:",
        "• IND Winner: $100 per round.",
        "• NTP: $50 per round.",
        "• Longest Drive: $50 per round.",
        "• Daily Team Winners: $100 per team per round ($50 each).",
      ],
    },
    {
      title: "🍺 Chulligans",
      items: [
        "Each player is allowed 1 Chulligan per 9 holes (2 per round).",
        "A Chulligan allows you to retake a shot (mulligan) — but only if you skull a drink first.",
        "No Chulligans in front of the clubhouse.",
        "Chulligans are on the honour system. Your playing partners are your witnesses.",
      ],
    },
    {
      title: "📱 Scoring & Submission",
      items: [
        "All scores are entered via this app. Enter your gross (actual) score for each hole — the app calculates your stableford points automatically using your daily handicap.",
        "You can also track your partner's score on the app to help keep the match updated.",
        "Use the 'P' button for a pickup (out of the hole) — this records 0 stableford points for that hole.",
        "Once all 18 holes are entered, submit your score to lock it in. Only your own score is locked — your partner's tracked scores remain editable by them.",
        "The admin can unlock a submitted score if corrections are needed.",
      ],
    },
  ];

  return(
    <div>
      <button onClick={onBack} style={S.backBtn}>← Info</button>
      <h2 style={S.sectTitle}>Competition Rules</h2>
      <p style={{fontSize:12,color:"#94a3b8",marginBottom:16}}>Spinners Cup 2026 — Mornington Peninsula</p>

      {rules.map((section, si) => (
        <div key={si} style={{...S.card,marginBottom:12,cursor:"default"}}>
          <div style={{fontSize:15,fontWeight:700,color:"#1e293b",marginBottom:10}}>{section.title}</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {section.items.map((item, ii) => (
              <div key={ii} style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                <div style={{width:6,height:6,borderRadius:3,background:"#2d6a4f",marginTop:7,flexShrink:0}} />
                <div style={{fontSize:13,color:"#475569",lineHeight:1.6}}>{item}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DailySummaryModal({summary,onClose}) {
  return (
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(15,23,42,0.65)",zIndex:260,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div style={{width:"min(560px,100%)",background:"#fff",borderRadius:16,border:"1px solid #dbeafe",padding:18,boxShadow:"0 20px 40px rgba(0,0,0,.25)"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:"#2563eb",letterSpacing:0.7,textTransform:"uppercase"}}>Daily Release</div>
            <div style={{fontSize:20,fontWeight:800,color:"#0f172a",fontFamily:"'Playfair Display',serif"}}>{summary.title}</div>
          </div>
          <button onClick={onClose} style={{width:30,height:30,borderRadius:15,border:"1px solid #cbd5e1",background:"#fff",color:"#475569",cursor:"pointer",fontWeight:700}}>×</button>
        </div>
        <div style={{marginTop:12,fontSize:13,color:"#475569",lineHeight:1.65,whiteSpace:"pre-wrap"}}>{summary.content}</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:14}}>
          <div style={{fontSize:11,color:"#94a3b8"}}>Find this again later in Info → Weekend Banter Summary.</div>
          <button onClick={onClose} style={{padding:"8px 14px",borderRadius:8,border:"none",background:"#0f766e",color:"#fff",fontWeight:700,cursor:"pointer"}}>Got it</button>
        </div>
      </div>
    </div>
  );
}

function SummaryHubPage({state,cur,onBack}) {
  const summaries = Object.values(state.dailySummaries || {}).sort((a,b)=>new Date(b.releasedAt||0)-new Date(a.releasedAt||0));
  return (
    <div>
      <button onClick={onBack} style={S.backBtn}>← Info</button>
      <h2 style={S.sectTitle}>Weekend Banter Summary</h2>
      {summaries.length===0 && <div style={{...S.card,fontSize:13,color:"#64748b"}}>No daily summary released yet. Admin can release once all scores are submitted for a round.</div>}
      {summaries.map(s => (
        <div key={s.roundId} style={{...S.card,borderLeft:"3px solid #2563eb",background:"#f8fbff"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:6}}>
            <div style={{fontSize:15,fontWeight:700,color:"#0f172a"}}>{s.title}</div>
            <div style={{fontSize:10,color:"#64748b",textTransform:"uppercase",fontWeight:700}}>{s.source === "llm" ? "LLM" : "Fallback"}</div>
          </div>
          <div style={{fontSize:13,color:"#475569",lineHeight:1.65,whiteSpace:"pre-wrap"}}>{s.content}</div>
          {cur && cur !== "admin" && cur !== "spectator" && (
            <div style={{marginTop:8,fontSize:11,color:state.summaryReads?.[cur]?.[s.roundId] ? "#16a34a" : "#94a3b8"}}>
              {state.summaryReads?.[cur]?.[s.roundId] ? "✓ Read" : "Unread"}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PastChampionsPage({onBack}) {
  const champs = [
    { year: "2022", name: "Luke Abi-Hanna", line: "Set the original benchmark and immediately started negotiating appearance fees. He makes the long flight back from Dubai to try and clinch another win." },
    { year: "2023", name: "Cam Green", line: "Won with the calm of a monk and the confidence of a bloke who never misses a slider." },
    { year: "2024", name: "Cam Green", line: "Back-to-back. Historians call it a dynasty; rivals call it textbook burglar behaviour with that handicap." },
    { year: "2025", name: "Cam Clark", line: "Went absolutely ice cold in the playoff and closed like a man with Antarctic veins." },
  ];
  return (
    <div>
      <button onClick={onBack} style={S.backBtn}>← Info</button>
      <h2 style={S.sectTitle}>Past Champions</h2>
      <p style={{fontSize:12,color:"#64748b",lineHeight:1.5,marginBottom:12}}>Their names are etched into Spinners history — and into the jacket — for all eternity (or at least until someone nicks it).</p>
      {champs.map(c => (
        <div key={c.year} style={{...S.card,borderLeft:"3px solid #ca8a04",background:"#fffdf5"}}>
          <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:0.8,fontWeight:700,color:"#a16207"}}>{c.year}</div>
          <div style={{fontSize:17,fontWeight:800,color:"#1e293b",fontFamily:"'Playfair Display',serif",marginTop:2}}>{c.name}</div>
          <div style={{fontSize:13,color:"#475569",lineHeight:1.6,marginTop:6}}>{c.line}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Players ─────────────────────────────────────────────────
function PlayersPage({state,upd,isAdmin,live}){
  const [isGeneratingSummary,setIsGeneratingSummary]=useState(false);
  const [confirmReset,setConfirmReset]=useState(false);
  const [selectedBio, setSelectedBio] = useState(null);
  const teams = [
    { label:getTeamLabel(state, "blue"), team:"blue", color:"#D4A017", border:"#D4A017" },
    { label:getTeamLabel(state, "grey"), team:"grey", color:"#B91C1C", border:"#DC2626" },
  ];

  return (
    <div>
      <h2 style={S.sectTitle}>Players & Handicaps</h2>

      {/* Admin event control */}
      {isAdmin && (
        <div style={{padding:"14px 16px",background:state.eventLive?"#f0fdf4":"#FEF2F2",borderRadius:12,border:`1px solid ${state.eventLive?"#bbf7d0":"#FECACA"}`,marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:14,fontWeight:700,color:"#1e293b"}}>🎛️ Event Status</div>
              <div style={{fontSize:11,color:"#64748b",marginTop:2}}>
                {state.eventLive ? "Event is LIVE — players can see teams, matches & enter scores" : "Event is HIDDEN — teams, matches & scoring are hidden from players"}
              </div>
            </div>
            <button onClick={()=>upd(s=>{s.eventLive=!s.eventLive;})}
              style={{padding:"8px 16px",borderRadius:8,border:"none",background:state.eventLive?"#dc2626":"#16a34a",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
              {state.eventLive ? "Go Hidden" : "Go Live"}
            </button>
          </div>
        </div>
      )}

      {isAdmin && (
        <div style={{padding:"14px 16px",background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:700,color:"#1e293b",marginBottom:10}}>🏷️ Team Names</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:"#D4A017",marginBottom:4}}>Yellow Slot Name</div>
              <input
                type="text"
                value={getTeamName(state, "blue")}
                onChange={e=>upd(s=>{if(!s.teamNames)s.teamNames={...DEFAULT_TEAM_NAMES};s.teamNames.blue=cleanTeamName(e.target.value, DEFAULT_TEAM_NAMES.blue);})}
                style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,fontWeight:600,color:"#1e293b",boxSizing:"border-box"}}
                placeholder="Yellow"
              />
            </div>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:"#B91C1C",marginBottom:4}}>Red Slot Name</div>
              <input
                type="text"
                value={getTeamName(state, "grey")}
                onChange={e=>upd(s=>{if(!s.teamNames)s.teamNames={...DEFAULT_TEAM_NAMES};s.teamNames.grey=cleanTeamName(e.target.value, DEFAULT_TEAM_NAMES.grey);})}
                style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,fontWeight:600,color:"#1e293b",boxSizing:"border-box"}}
                placeholder="Red"
              />
            </div>
          </div>
          <div style={{fontSize:10,color:"#64748b",marginTop:8}}>Team colors stay mapped to their original slots.</div>
        </div>
      )}

      {isAdmin && (
        <div style={{padding:"14px 16px",background:"#f8fafc",borderRadius:12,border:"1px solid #cbd5e1",marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:700,color:"#1e293b",marginBottom:10}}>🎯 Round Scoring Release</div>
          {ROUNDS.map(round=>{
            const open = isRoundScoringLive(state, round.id);
            return (
              <div key={round.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:"#1e293b"}}>Round {round.num}</div>
                  <div style={{fontSize:10,color:"#94a3b8"}}>{round.courseName}</div>
                </div>
                <button onClick={()=>upd(s=>{if(!s.roundScoringLive)s.roundScoringLive={r1:false,r2:false,r3:false}; s.roundScoringLive[round.id]=!s.roundScoringLive[round.id];})}
                  style={{padding:"7px 12px",borderRadius:8,border:"none",background:open?"#dc2626":"#16a34a",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                  {open?"Lock Scoring":"Open Scoring"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {isAdmin && (
        <div style={{padding:"14px 16px",background:"#eef6ff",borderRadius:12,border:"1px solid #bfdbfe",marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:700,color:"#1e3a8a",marginBottom:8}}>🧠 Daily Summary Release</div>
          <div style={{fontSize:11,color:"#1e40af",marginBottom:10}}>Release a round summary after all 12 scores are submitted. It uses round results + leaderboard + LD/NTP to generate banter.</div>
          {ROUNDS.map(round => {
            const done = isRoundFullySubmitted(state, round.id);
            const released = !!state.dailySummaries?.[round.id];
            return (
              <div key={`summary_${round.id}`} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:8,paddingBottom:8,borderBottom:"1px dashed #bfdbfe"}}>
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:"#1e293b"}}>Round {round.num} · {round.courseName}</div>
                  <div style={{fontSize:10,color:done?"#15803d":"#b45309"}}>{done ? "All scores submitted" : "Waiting for score submissions"}</div>
                </div>
                <button
                  disabled={!done || isGeneratingSummary}
                  onClick={async ()=>{
                    setIsGeneratingSummary(true);
                    const summary = await generateRoundSummary(state, round.id);
                    setIsGeneratingSummary(false);
                    if (!summary) return;
                    upd(s => {
                      if (!s.dailySummaries) s.dailySummaries = {};
                      if (!s.summaryReads) s.summaryReads = {};
                      s.dailySummaries[round.id] = summary;
                      PLAYERS.forEach(p => {
                        if (!s.summaryReads[p.id]) s.summaryReads[p.id] = {};
                        s.summaryReads[p.id][round.id] = false;
                      });
                    });
                  }}
                  style={{padding:"7px 12px",borderRadius:8,border:"none",background:released?"#0f766e":"#2563eb",color:"#fff",fontSize:12,fontWeight:700,cursor:(!done || isGeneratingSummary)?"not-allowed":"pointer",opacity:(!done || isGeneratingSummary)?0.45:1}}>
                  {isGeneratingSummary ? "Generating..." : released ? "Re-release Summary" : "Release Summary"}
                </button>
              </div>
            );
          })}
          <div style={{fontSize:10,color:"#334155"}}>Tip: add your key in browser localStorage as <code>spinners-llm-api-key</code> for live AI output. Otherwise, app generates a local fallback summary.</div>
        </div>
      )}

      {isAdmin && (
        <div style={{padding:"14px 16px",background:"#fff1f2",borderRadius:12,border:"1px solid #fecdd3",marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:700,color:"#9f1239",marginBottom:6}}>🧨 Reset App Data</div>
          <div style={{fontSize:11,color:"#9f1239",marginBottom:10}}>Clears all scores, claims, handicaps, submissions, chulligans, tees and visibility settings.</div>
          {!confirmReset ? (
            <button onClick={()=>setConfirmReset(true)} style={{padding:"8px 12px",borderRadius:8,border:"1px solid #fda4af",background:"#fff",color:"#be123c",fontSize:12,fontWeight:700,cursor:"pointer"}}>
              Reset All Scoring & Data
            </button>
          ) : (
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{upd(s=>Object.assign(s,DC(DEFAULT_STATE)));setConfirmReset(false);}} style={{padding:"8px 12px",borderRadius:8,border:"none",background:"#be123c",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                Confirm Reset
              </button>
              <button onClick={()=>setConfirmReset(false)} style={{padding:"8px 12px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",color:"#64748b",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* Admin tee selection */}
      {isAdmin && (
        <div style={{padding:"14px 16px",background:"#f8faf8",borderRadius:12,border:"1px solid #d4e5d4",marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:700,color:"#1e293b",marginBottom:10}}>⛳ Tee Selection</div>
          {COURSES.map(course => {
            const curTee = getTeeKey(state, course.id);
            return (
              <div key={course.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:"#1e293b"}}>{course.short}</div>
                  <div style={{fontSize:10,color:"#94a3b8"}}>Slope: {getSlope(course,curTee)} · CR: {getRating(course,curTee)}</div>
                </div>
                <div style={{display:"flex",gap:4}}>
                  {Object.entries(course.teeData).map(([key, td]) => (
                    <button key={key} onClick={() => upd(s => { if(!s.tees)s.tees={}; s.tees[course.id]=key; })}
                      style={{padding:"5px 12px",borderRadius:6,border:`1px solid ${curTee===key?"#2d6a4f":"#d1d5db"}`,background:curTee===key?"#2d6a4f":"#fff",color:curTee===key?"#fff":"#64748b",fontSize:11,fontWeight:600,cursor:"pointer"}}>
                      {td.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p style={{fontSize:12,color:"#64748b",marginBottom:16,lineHeight:1.5}}>
        GA Handicap Index is used to calculate daily handicaps per course using the slope rating.
      </p>

      {live ? (
        /* Show teams when live */
        teams.map(({label, team, color, border}) => (
          <div key={team} style={{marginBottom:20}}>
            <div style={{fontSize:11,fontWeight:700,color:color,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>{label}</div>
            {PLAYERS.filter(p => p.team === team).map(player => {
              const gaHcp = state.handicaps?.[player.id];
              const hasHcp = gaHcp != null;
              return (
                <div key={player.id} style={{...S.card, borderLeft:`3px solid ${border}`, cursor:"default"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,flex:1}}>
                      <PlayerAvatar id={player.id} size={42} live={true} />
                      <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:700,color:"#1e293b"}}>{player.name}</div>
                      <button
                        onClick={() => setSelectedBio(player.id)}
                        style={{marginTop:6,padding:"5px 10px",borderRadius:999,border:"1px solid #bfdbfe",background:"#eff6ff",color:"#1d4ed8",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}
                      >
                        View Bio
                      </button>
                      {hasHcp && (
                        <div style={{fontSize:10,color:"#94a3b8",marginTop:6,display:"flex",gap:12,flexWrap:"wrap"}}>
                          {COURSES.map(c => {
                            const dh = courseHcp(gaHcp, c, getTeeKey(state, c.id));
                            return (
                              <span key={c.id} style={{display:"inline-flex",gap:3}}>
                                <span style={{fontWeight:600,color:"#64748b"}}>{c.short}:</span>
                                <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:600,color:"#1e293b"}}>{dh}</span>
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {!hasHcp && (
                        <div style={{fontSize:10,color:"#d1d5db",marginTop:4}}>No handicap set</div>
                      )}
                    </div>
                    </div>
                    <div style={{width:80,flexShrink:0}}>
                      {isAdmin ? (
                        <div>
                          <div style={{fontSize:9,color:"#94a3b8",marginBottom:3,textAlign:"center"}}>GA HCP</div>
                          <input type="number" step="0.1" value={gaHcp ?? ""} placeholder="—"
                            onChange={e => { const v = parseFloat(e.target.value); upd(s => { s.handicaps[player.id] = isNaN(v) ? null : v; }); }}
                            style={{width:"100%",padding:"6px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:14,fontWeight:600,fontFamily:"'JetBrains Mono',monospace",color:"#1e293b",textAlign:"center",outline:"none",boxSizing:"border-box",background:"#fff"}}
                          />
                        </div>
                      ) : (
                        <div style={{textAlign:"right"}}>
                          <div style={{fontSize:9,color:"#94a3b8",marginBottom:2}}>GA HCP</div>
                          <div style={{fontSize:18,fontWeight:700,color:hasHcp?"#1e293b":"#d1d5db",fontFamily:"'JetBrains Mono',monospace"}}>{hasHcp ? gaHcp : "—"}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))
      ) : (
        /* Show all players without teams when not live */
        <div>
          <div style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>All Players</div>
          {[...PLAYERS].sort((a,b) => {
            const order = ["chris","angus","jason","tom","alex","nick","cam","callum","luke","jturner","lach","jkelly"];
            return order.indexOf(a.id) - order.indexOf(b.id);
          }).map(player => {
            const gaHcp = state.handicaps?.[player.id];
            const hasHcp = gaHcp != null;
            return (
              <div key={player.id} style={{...S.card, borderLeft:"3px solid #e2e8f0", cursor:"default"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,flex:1}}>
                    <PlayerAvatar id={player.id} size={42} live={false} />
                    <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:700,color:"#1e293b"}}>{player.name}</div>
                    <button
                      onClick={() => setSelectedBio(player.id)}
                      style={{marginTop:6,padding:"5px 10px",borderRadius:999,border:"1px solid #bfdbfe",background:"#eff6ff",color:"#1d4ed8",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}
                    >
                      View Bio
                    </button>
                    {hasHcp && (
                      <div style={{fontSize:10,color:"#94a3b8",marginTop:6,display:"flex",gap:12,flexWrap:"wrap"}}>
                        {COURSES.map(c => (
                          <span key={c.id} style={{display:"inline-flex",gap:3}}>
                            <span style={{fontWeight:600,color:"#64748b"}}>{c.short}:</span>
                            <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:600,color:"#1e293b"}}>{courseHcp(gaHcp, c, getTeeKey(state, c.id))}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {!hasHcp && <div style={{fontSize:10,color:"#d1d5db",marginTop:4}}>No handicap set</div>}
                  </div>
                  </div>
                  <div style={{width:80,flexShrink:0,textAlign:"right"}}>
                    <div style={{fontSize:9,color:"#94a3b8",marginBottom:2}}>GA HCP</div>
                    <div style={{fontSize:18,fontWeight:700,color:hasHcp?"#1e293b":"#d1d5db",fontFamily:"'JetBrains Mono',monospace"}}>{hasHcp ? gaHcp : "—"}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedBio && (
        <div
          onClick={() => setSelectedBio(null)}
          style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.65)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:16}}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{width:"100%",maxWidth:400,maxHeight:"85vh",overflowY:"auto",background:"#fff",borderRadius:16,padding:18,border:"1px solid #e2e8f0",boxShadow:"0 20px 40px rgba(15,23,42,0.22)"}}
          >
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"start",gap:10,marginBottom:10}}>
              <div style={{fontSize:20,fontWeight:800,color:"#0f172a",fontFamily:"'Playfair Display',serif"}}>{getP(selectedBio)?.name}</div>
              <button onClick={() => setSelectedBio(null)} style={{border:"none",background:"transparent",fontSize:20,lineHeight:1,color:"#64748b",cursor:"pointer"}}>×</button>
            </div>
            <img
              src={PLAYER_BIO_IMAGES[selectedBio] || PLAYER_PHOTOS[selectedBio]}
              alt={getP(selectedBio)?.name}
              style={{
                display:"block",
                width:"100%",
                maxWidth:280,
                aspectRatio:"1 / 1",
                borderRadius:14,
                objectFit:"cover",
                margin:"0 auto 14px",
                border:"2px solid #e2e8f0",
                filter: live ? "none" : "grayscale(100%) brightness(1.1) contrast(0.8) sepia(15%)",
              }}
            />
            <p style={{margin:0,fontSize:14,color:"#334155",lineHeight:1.65,whiteSpace:"pre-wrap"}}>{PLAYER_BIOS[selectedBio] || "Bio coming soon."}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────
const S = {
  app:{minHeight:"100vh",background:"#fafcfa",fontFamily:"'DM Sans',sans-serif",maxWidth:480,margin:"0 auto",position:"relative",paddingBottom:80},
  loading:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#fafcfa"},
  spinner:{width:40,height:40,borderRadius:"50%",border:"3px solid #e2e8f0",borderTopColor:"#2d6a4f",animation:"spin 1s linear infinite"},
  header:{display:"flex",alignItems:"center",padding:"10px 12px",background:"#fff",borderBottom:"1px solid #e2e8f0",position:"sticky",top:0,zIndex:100},
  content:{padding:"16px"},
  nav:{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,display:"flex",background:"rgba(255,255,255,0.97)",backdropFilter:"blur(12px)",borderTop:"1px solid #e2e8f0",padding:"4px 0 env(safe-area-inset-bottom,4px)",zIndex:100},
  navBtn:{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,background:"none",border:"none",padding:"8px 0",minHeight:52,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",touchAction:"manipulation"},
  input:{display:"block",width:"100%",padding:"10px 14px",borderRadius:8,border:"1px solid #d1d5db",fontFamily:"'DM Sans',sans-serif",fontSize:14,color:"#1e293b",background:"#fff",outline:"none",boxSizing:"border-box",marginBottom:12},
  card:{display:"block",width:"100%",background:"#fff",borderRadius:12,padding:"12px 14px",marginBottom:8,border:"1px solid #e2e8f0",cursor:"pointer",textAlign:"left",boxSizing:"border-box"},
  backBtn:{display:"inline-flex",alignItems:"center",gap:4,background:"none",border:"none",color:"#2d6a4f",fontWeight:600,fontSize:13,cursor:"pointer",padding:"4px 0",marginBottom:10,fontFamily:"'DM Sans',sans-serif"},
  sectTitle:{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:700,color:"#1a2e1a",margin:"0 0 12px"},
  th:{padding:"6px 4px",fontSize:10,fontWeight:700,color:"#64748b",textAlign:"center",borderBottom:"2px solid #e2e8f0"},
  td:{padding:"6px 3px",textAlign:"center",borderBottom:"1px solid #f1f5f9",fontSize:11},
  tblIn:{width:28,height:22,borderRadius:4,border:"1px solid #d1d5db",textAlign:"center",fontSize:11,fontWeight:600,color:"#1e293b",outline:"none",WebkitAppearance:"none",MozAppearance:"textfield"},
};
