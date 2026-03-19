const { useState, useEffect, useCallback, useRef } = React;
const supabaseClientFactory = window.supabase?.createClient || null;

const runtimeConfig = window.__SPINNERS_CONFIG || {};
const DEFAULT_REMOTE_CONFIG = {
  supabaseUrl: "https://wgcrujpmqftelxtutgjr.supabase.co",
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndnY3J1anBtcWZ0ZWx4dHV0Z2pyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyODUxMDgsImV4cCI6MjA4ODg2MTEwOH0.65Z6in9zU0Fy4LtjuWPyTvrNO-2aHhgJZfjga9yrI5Q",
};

function getSearchParams() {
  try {
    return new URLSearchParams(window.location.search);
  } catch {
    return new URLSearchParams();
  }
}

function persistConfigValue(localStorageKeys, value) {
  if (!value) return;
  for (const key of localStorageKeys) {
    try {
      window.localStorage.setItem(key, value);
    } catch {}
  }
}

function resolveConfigValue({ runtimeKeys = [], localStorageKeys = [], queryKeys = [], defaultValue = "" }) {
  const params = getSearchParams();

  for (const key of queryKeys) {
    const value = params.get(key);
    if (value) {
      const normalized = value.trim();
      persistConfigValue(localStorageKeys, normalized);
      return normalized;
    }
  }

  for (const key of localStorageKeys) {
    const value = window.localStorage.getItem(key);
    if (value) return value.trim();
  }

  const runtimeValue = runtimeKeys.map(key => runtimeConfig?.[key]).find(Boolean);
  if (runtimeValue) {
    const normalized = String(runtimeValue).trim();
    persistConfigValue(localStorageKeys, normalized);
    return normalized;
  }

  if (defaultValue) {
    const normalized = String(defaultValue).trim();
    persistConfigValue(localStorageKeys, normalized);
    return normalized;
  }

  return "";
}

const SUPABASE_URL = resolveConfigValue({ runtimeKeys: ["supabaseUrl"], localStorageKeys: ["spinners-supabase-url"], queryKeys: ["supabaseUrl"], defaultValue: DEFAULT_REMOTE_CONFIG.supabaseUrl });
const SUPABASE_KEY = resolveConfigValue({ runtimeKeys: ["supabaseKey"], localStorageKeys: ["spinners-supabase-key"], queryKeys: ["supabaseKey"], defaultValue: DEFAULT_REMOTE_CONFIG.supabaseKey });
const DB_ROW_ID = resolveConfigValue({ runtimeKeys: ["dbRowId"], localStorageKeys: ["spinners-db-row-id"], queryKeys: ["dbRowId"] }) || "spinners-cup-2026";
const STATE_CACHE_KEY = `${DB_ROW_ID}-state-cache`;

const supabaseHeaders = {
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
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

function readCachedState() {
  try {
    return normalizeState(JSON.parse(window.localStorage.getItem(STATE_CACHE_KEY) || "null"));
  } catch {
    return null;
  }
}

function cacheStateSnapshot(nextState) {
  if (!nextState) return;
  try {
    window.localStorage.setItem(STATE_CACHE_KEY, JSON.stringify(nextState));
  } catch {}
}

async function load() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    const cached = readCachedState();
    if (cached) return cached;
    return DC(DEFAULT_STATE);
  }
  const params = new URLSearchParams({
    id: `eq.${DB_ROW_ID}`,
    select: "data",
  });
  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/app_state?${params.toString()}`,
    {
      cache: "no-store",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Cache-Control": "no-cache",
      },
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to load remote state (${res.status})`);
  }

  const rows = await res.json();
  const nextState = normalizeState(rows?.[0]?.data) || DC(DEFAULT_STATE);
  cacheStateSnapshot(nextState);
  return nextState;
}

function createRealtimeClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY || !supabaseClientFactory) return null;
  return supabaseClientFactory(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 10 } },
  });
}

async function readSupabaseError(res) {
  if (!res || res.ok) return "";
  try {
    const payload = await res.clone().json();
    return payload?.message || payload?.hint || payload?.details || "";
  } catch {}
  try {
    return (await res.text()).trim();
  } catch {
    return "";
  }
}

async function writeRemoteState(nextState) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return { ok: true };

  const now = new Date().toISOString();
  const rowPayload = { id: DB_ROW_ID, data: nextState, updated_at: now };
  const updatePayload = { data: nextState, updated_at: now };
  const rowFilter = new URLSearchParams({
    id: `eq.${DB_ROW_ID}`,
    select: "id",
  });

  const updateRes = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/app_state?${rowFilter.toString()}`,
    {
      method: "PATCH",
      headers: {
        ...supabaseHeaders,
        "Prefer": "return=representation",
      },
      body: JSON.stringify(updatePayload),
    }
  );

  if (updateRes?.ok) {
    const rows = await updateRes.json().catch(() => []);
    if (Array.isArray(rows) && rows.length > 0) {
      return { ok: true };
    }
  } else {
    const updateError = await readSupabaseError(updateRes);
    return { ok: false, error: updateError || `Supabase update failed (${updateRes?.status || "unknown"})` };
  }

  const insertRes = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/app_state`,
    {
      method: "POST",
      headers: {
        ...supabaseHeaders,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify(rowPayload),
    }
  );

  if (insertRes?.ok) return { ok: true };

  const insertError = await readSupabaseError(insertRes);
  return { ok: false, error: insertError || `Supabase insert failed (${insertRes?.status || "unknown"})` };
}

async function save(s) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Supabase config missing");
  }
  if (!navigator.onLine) {
    throw new Error("Device is offline");
  }

  const result = await writeRemoteState(s);
  if (!result?.ok) {
    throw new Error(result?.error || "Supabase rejected the update");
  }
}

const SK = "spinners-cup-2026-v6";
const PLAYER_LOCK_KEY = "spinners-cup-2026-player-lock";
const ACCESS_GRANTED_KEY = "spinners-cup-2026-access-granted";
const ROUND_KICKOFF_SEEN_KEY = "spinners-cup-2026-round-kickoff";
const ADMIN_CODE = resolveConfigValue({
  runtimeKeys: ["adminCode", "adminPassword"],
  localStorageKeys: ["spinners-admin-code", "spinners-admin-password"],
  queryKeys: ["adminCode", "adminPassword"],
});
const APP_PASSWORD = resolveConfigValue({
  runtimeKeys: ["appPassword", "eventPassword"],
  localStorageKeys: ["spinners-app-password", "spinners-event-password"],
  queryKeys: ["appPassword", "eventPassword"],
});
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
  angus: "./Angus Scott.png",
  nick: "./Nick Tankard.png",
  tom: "./Tom Crawford.png",
  callum: "./Callum Hinwood 2.png",
  jkelly: "./James Kelly (2).png",
  jturner: "./James Turner.png",
  chris: "./Chris Green.png",
  luke: "./Luke Abi-Hanna.png",
  alex: "./Alex Denning.png",
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
  cam: "Cam is widely regarded as one of the genuinely nicest blokes on the trip, which makes it even more annoying when he’s also playing good golf. His trademark laugh will likely be heard echoing around the greens of PK all weekend as he quietly goes about trying to defend the Spinners Cup. In a team environment he’s the ultimate glue guy — positive, competitive, and the bloke everyone wants in their group.",
  chris: "Chris arrives fresh from the international cricket circuit and immediately claims the title of best golfer on the trip, which annoyingly might actually be true. Equal parts pretty boy and elite sportsman, he loves to get out of the gates early with a few birdies before the sledging begins to creep into his head. Under pressure he has been known to wilt slightly — particularly when reminded that his little brother has already won the Spinners Cup twice. In a team environment he’ll bring elite shot-making, provided the chirping doesn’t get to him first.",
  nick: "Nick worships Tiger Woods and approaches the Spinners Cup with the same intensity, which makes last year’s playoff loss sting even more. Working at CBA has perhaps made him a little risk-averse at times — expect plenty of “percentage golf” and cautious lines off the tee while he channels his inner Tiger. In a team setting he’ll bring serious competitive energy, although his teammates may occasionally need to convince him to take the aggressive play.",
  jason: "Jason possesses what many experts are already calling the ugliest swing ever brought to the Mornington Peninsula. Somehow the ball still goes forward often enough to keep him in the game, much to the confusion of everyone watching. Despite the chaotic mechanics, his clean-cut physique suggests a man built for sport — unfortunately the golf swing didn’t get the same treatment. In a team format he’ll happily grind away and try to sneak in the occasional surprisingly solid shot.",
  jturner: "James Turner launches the ball enormous distances for a man who looks like he should still be shopping in the kids section. As the self-appointed Chief Marketing Officer of the Spinners Cup, he’s responsible for most of the hype and very little of the detail. In a team environment he’ll be excellent for morale, even if his concentration occasionally wanders off with the marketing ideas.",
  callum: "Callum owns a slappy swing that could either thrive or be completely destroyed by the notorious Melbourne sandbelt winds. A lawyer by trade, he’s well practiced at arguing his case — particularly when a putt lips out or the scorecard is under review. With his first child on the way, this may be the last weekend of uninterrupted golf for the next 18 years. In a team setting he’ll be desperate to contribute — ideally before the putter starts trembling.",
  lach: "Lach has been putting in serious hours with a golf coach and is determined to let everyone know about it. By day he works in tech sales, which means he’s extremely confident explaining why things should work — even when the results say otherwise. In a team environment he’ll bring energy, optimism, and a very convincing explanation after every slightly wayward shot.",
  jkelly: "James carries the emotional scars of a golf trip where he shanked his first tee shot twice in a row, an achievement few golfers can claim. The face of the infamous Air Kelso sponsorship, he’s also widely tipped as the early favourite for the “drunkest on trip” award. In a team setting he’ll either produce a redemption arc for the ages or double down on the chaos.",
  alex: "Alex is the kind of annoyingly talented sportsman who can turn up to almost anything and be good at it within about five minutes. Between working in the furniture industry, spending suspiciously large amounts of time in China, and managing a major renovation, he somehow still manages to flush golf shots like he actually practises. In a team environment he’ll likely play the role of the quietly reliable performer — frustratingly good without appearing to try.",
  luke: "Luke has flown in from Dubai and arrives convinced the Spinners Cup is already his. A former clutch basketball player, he backs himself in big moments and isn’t shy about reminding the group — although some still whisper about the time he accidentally killed a duck on the course, a reputation that has unfairly branded him the tour’s most notorious wildlife assassin. In a team environment he’ll embrace the pressure moments and happily volunteer for the hero shot.",
};



function getPlayerRoundPrediction(state, playerId, roundId) {
  const player = getP(playerId);
  const short = player?.short || "Legend";
  const roundCopyByPlayer = {
    angus: {
      r1: "Prediction: opening-day bombs are on the menu, so aim the big stick at every generous fairway and feast on the par 5s.",
      r2: "Prediction: moving day suits your chaos — one towering launch on the LD hole could turn this card into a highlight reel.",
      r3: "Prediction: final round is pure freedom golf for you — swing hard, keep the mood loose, and let the rest of the field tense up.",
    },
    nick: {
      r1: "Prediction: a Tiger-approved opener is coming — fairways, center greens, and a quietly excellent card by the turn.",
      r2: "Prediction: moving day is built for percentage golf with one calculated ambush when the hole finally gives you a green light.",
      r3: "Prediction: final round patience could be lethal — boring targets, tidy pars, then pounce when everyone else starts chasing.",
    },
    tom: {
      r1: "Prediction: first-round boardroom energy — make decisive swings early and you could be monetising birdie chances all afternoon.",
      r2: "Prediction: moving day should reward your conviction, especially if you start treating tucked flags like acquisition targets.",
      r3: "Prediction: final round has CEO closer written all over it — commit to the smart line and cash out on the back nine.",
    },
    callum: {
      r1: "Prediction: opening arguments are simple — play to the fat side, avoid the double, and let the putter present the closing statement.",
      r2: "Prediction: moving day could become your best brief yet if you stay disciplined until one brave swing changes the evidence.",
      r3: "Prediction: final round is for courtroom composure — no heroics unless invited, then bury the field with procedural pars.",
    },
    jkelly: {
      r1: "Prediction: first-round chaos will absolutely knock, but if the opening tee ball behaves you’ve got a genuine redemption script brewing.",
      r2: "Prediction: moving day might get gloriously weird for you — survive the messy holes and suddenly the card could catch fire.",
      r3: "Prediction: final round feels made for all-or-nothing Kelso theatre, just with slightly fewer disasters before the hero moment.",
    },
    jturner: {
      r1: "Prediction: opening day needs a soft launch — market the fireworks later and start with a fairway-first campaign.",
      r2: "Prediction: moving day is when the brand can really scale — one hot stretch through the middle could have you selling a miracle round.",
      r3: "Prediction: final round calls for a strong finish and even stronger spin — close with substance first, slogans second.",
    },
    chris: {
      r1: "Prediction: a classy opener is looming — stripe a few early irons and the group will remember why everyone says you’re the purest striker here.",
      r2: "Prediction: moving day should be your stage if the sledging stays background noise and the swing stays front-page news.",
      r3: "Prediction: final round is all about nerve control — keep the head quiet, trust the talent, and this could look annoyingly easy.",
    },
    luke: {
      r1: "Prediction: opening day has big-game guard energy — stack a couple of early circles and you’ll start demanding the ball on every key hole.",
      r2: "Prediction: moving day is made for your clutch gene, especially if one aggressive line reminds everyone you came to headline the trip.",
      r3: "Prediction: final round theatre suits you perfectly — embrace the pressure, call your shot internally, and let the moments find you.",
    },
    alex: {
      r1: "Prediction: the annoyingly talented opener is live — minimal fuss, crisp contact, and another card that looks easier than it should.",
      r2: "Prediction: moving day could quietly become an Alex masterclass, with clean ball-striking doing the damage before anyone notices.",
      r3: "Prediction: final round points haul feels very real if you keep doing the boring elite stuff while others start forcing it.",
    },
    lach: {
      r1: "Prediction: opening day is a perfect time to let the coach-hours do the talking and save the technical explanation for the drinks cart.",
      r2: "Prediction: moving day could reward your prep in a big way — trust the stock shot and resist the urge to oversell every swing thought.",
      r3: "Prediction: final round is about conviction over commentary — pick the shape, swing it, and let the scorecard close the deal.",
    },
    jason: {
      r1: "Prediction: ugly-swing optics aside, the opener has classic Jason sneak-attack potential if the ball keeps obeying your strange little system.",
      r2: "Prediction: moving day could get scrappy in exactly your language — keep nicking points and suddenly you’re ruining someone else’s plans.",
      r3: "Prediction: final round only needs one thing from you: keep the swing weird, the card tidy, and the late-hole steals coming.",
    },
    cam: {
      r1: "Prediction: opening day should suit your good-bloke rhythm — steady ball-striking, no drama, and a card that sneaks into contention.",
      r2: "Prediction: moving day has defender energy written all over it, especially if the putter warms up before the chatter does.",
      r3: "Prediction: final round could become a proper title-defence grind — stay patient, keep smiling, and make everyone earn every point.",
    },
  };

  const roundIndex = ROUNDS.findIndex(r => r.id === roundId);
  let priorForm = "Settle in early, avoid doubles, and this round can build quickly.";
  if (roundIndex > 0) {
    const prevRound = ROUNDS[roundIndex - 1];
    const prevScores = state.scores?.[prevRound.id]?.[playerId] || [];
    const filled = prevScores.filter(s => holeFilled(s)).length;
    if (filled > 0) {
      const prevCourse = getCourse(prevRound.courseId);
      const dH = courseHcp(state.handicaps?.[playerId], prevCourse, getTeeKey(state, prevCourse.id));
      const prevPts = pStab(prevScores, prevCourse, dH);
      if (filled === 18) {
        if (prevPts >= 36) priorForm = `You’re coming in hot off ${prevPts} pts yesterday — stay aggressive when the green light appears.`;
        else if (prevPts >= 30) priorForm = `Solid base with ${prevPts} pts yesterday. Clean up a couple of errors and you’re right in it.`;
        else priorForm = `${prevPts} pts yesterday means today is a bounce-back script — simplify targets and rebuild momentum.`;
      } else {
        priorForm = `Previous round showed flashes over ${filled} holes. Fast start today and you can turn that into a full-card scorer.`;
      }
    }
  }

  const roundSpecific = roundCopyByPlayer[playerId]?.[roundId] || "Prediction: steady tempo and smart misses should travel well today.";
  return `${short}, ${roundSpecific} ${priorForm}`;
}
const PLAYER_BIO_IMAGES = {
  angus: "./Angus Scott.png",
  tom: "./Tom Crawford.png",
  cam: "./Cam Clark.png",
  chris: "./Chris Green.png",
  nick: "./Nick Tankard.png",
  jason: "./Jason McIlwaine (2).png",
  jturner: "./James Turner.png",
  callum: "./Callum Hinwood 2.png",
  alex: "./Alex Denning.png",
  lach: "./Lach Taylor (2).png",
  jkelly: "./James Kelly (2).png",
  luke: "./Luke Abi-Hanna.png",
};


const NTP_HOLE_BY_ROUND = {
  r2: 17,
};

// NTP: par 3, not in first 5 holes of front or back nine (holes 1-5 or 10-14), with round overrides
function getNtpHole(roundId, courseId) {
  const roundOverride = NTP_HOLE_BY_ROUND[roundId];
  if (roundOverride) return roundOverride;
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
    "A spectacular opening par 5 from an elevated tee. Longer hitters should note the flag position early because it can disappear from view from the fairway. If laying up, favour the right side short of the green-side bunkers.",
    "A tempting short par 4 that can be reachable downwind. A conservative line left of the centre-line bunker opens the green, while an aggressive right-side line offers a better look but tighter distance control.",
    "Shorter hitters should play left of centre to open the green, while longer hitters can take on the dogleg right for a shorter approach. The chute into the semi-punchbowl green is one of the best approaches on the course.",
    "An intimidating par 3 that usually plays longer than the card. Long and left is the safest miss for consistent pars.",
    "A thrilling downhill par 4 where wind changes the ideal line. Bail-out room exists right, but a bold line over the left fairway bunker can leave a wedge and the best angle.",
    "A short par 3 guarded by gnarly right bunkers. Take enough club and trust the concave green to reward a well-struck shot.",
    "An exposed par 4 with a wide joint fairway and multiple lines from the tee. Approaches from the left are often best into the huge two-tier green.",
    "A short par 4 that demands tee-shot accuracy as the hole falls right. Distance control is critical on approach, with long-left a particularly costly miss.",
    "Another strong par 4 where threading the tee shot between natural contours is key. Short-iron control is vital, and missing right is heavily penalised.",
    "A strong par 4 where centre-left off the tee makes the approach easier. A high, soft landing shot is rewarded on a superb smaller green.",
    "A par 3 that rewards controlled flight and a soft landing. Add a club, avoid short left, and treat middle-of-green as a good result.",
    "A deceptive par 4 where over-aggression from the tee can quickly bring trouble. On approach, short misses can kick hard right, so commit to flying it well onto the green.",
    "The longest par 4 on the course with a blind tee shot and huge fairway undulations. If you cannot reach in two, play smartly; if you can, the punchbowl surrounds can help feed a good long approach onto the green.",
    "One of the most photographed holes and a classic risk-reward short par 4. Keep the ball left to simplify the approach and avoid dropping into the huge right-side valley.",
    "A bunkerless par 4 that looks gentle but demands precision. Both drives and approaches tend to bounce right, so shaping and start lines matter.",
    "A par 3 where a running shot from the right can feed left toward target. The hole often plays longer than it appears; left is effectively dead.",
    "A strategic par 5 where wind and match context shape decisions. Avoid left on the second and avoid long-left on approach to keep big numbers out of play.",
    "A beautiful finishing par 4 that invites one final aggressive tee shot, often downwind. Right side can add roll and leave wedge in, but avoiding the short-right bunker is essential to set up a birdie chance.",
  ],
  pk_south: [
    "A demanding opening par 4 where the creek influences both the tee shot and the approach. Take enough club to find the fairway, then favour the safer line that leaves a full look at the green rather than flirting with the water early.",
    "A dogleg par 4 where driver can bite off more of the corner but brings bunkers into play. The percentage play is a little less club to the right side, leaving a cleaner angle and a choice between a running or aerial approach over the front mound.",
    "A long par 3 that asks for a committed hybrid or long iron. The best miss is a controlled running shot using the contours, especially with a gentle right-to-left shape feeding toward the middle.",
    "A strong par 4 where the left-side bunkers foreshorten the approach and make distance control crucial. Pick a line that leaves a comfortable number, then stay alert to the front-right contour when the pin is cut there.",
    "A short par 5 defined by the diagonal creek at driving distance. Take on the narrow gap and you can set up a go at the green in two; lay back and accept that it becomes a true three-shot hole.",
    "An inviting tee shot gives way to a highly strategic green. Front pins suit a high, soft approach, while back pins are better attacked with a lower shot feeding through the valley.",
    "This short par 4 is all about choosing how much to gamble from the tee. The safe play is a lay-up near the dogleg corner, while the aggressive line chases a better angle and possible birdie chance if conditions suit.",
    "The toughest fairway to find on the South, with the hogsback rejecting anything slightly offline. The smart play is short of the rise on the right, setting up a controlled uphill pitch after a solid second.",
    "A demanding par 3 where shape and trajectory matter. A high fade suits the hole best, but the green is smaller in practice than it looks, so center-green is a strong result.",
    "This par 4 plays longer than the card suggests because of the climbing terrain. Challenge the right-side bunkers only if you want the shorter line; otherwise plan for an extra club and a soft landing into the tilted green.",
    "A short par 4 where the ideal tee shot hugs the bunker on the rise to leave only a pitch. Anything too far left brings the big greenside bunker and a green running away from you into the equation.",
    "A classic strategic short par 4 where the best angle depends entirely on the pin. Play right when the flag is left, and hug or carry the left waste when the flag is right.",
    "A sweeping par 4 that rewards shaping both shots to match the hole. A left-to-right tee shot sets up best, then a right-to-left approach works with the green contours.",
    "A dramatic par 3 over a valley to an elevated green with bold bunkering. The percentage play is out to the right using the slopes, but left-side pins demand a committed shot carrying all the trouble.",
    "A long par 4-and-a-half where avoiding the fairway bunkers is only the first job. If you play out to the right, be ready for a more exacting second over the bunkers short and right of the green.",
    "A true three-shot par 5 for almost everyone. Plot it as a positional hole, because very few will have a realistic chance of getting home in two.",
    "A short hole that looks like a birdie chance but punishes indecision. In the wind especially, commit to your number and take the middle of the green if the pin is awkward.",
    "A strong finishing par 4 played downhill to the fairway, with the right-side sand waste guarding the preferred line. Find position off the tee and expect a demanding long-club approach, especially into the usual breeze.",
  ],
  pk_north: [
    "A solid opening par 4 with room off the tee but bunkers squeezing the landing zone. Driver offers a short approach if you commit, while a safer long iron or hybrid leaves a tougher shot into the elevated green.",
    "This par 3 is all about front-edge yardage and trajectory. Finish even a touch short and the ball can roll well back down the slope, so favor a committed carry that finishes pin-high rather than flirting with the false front.",
    "A risk-reward par 4 where the aggressive drive over the left side opens the hole but brings big trouble into play. Laying back keeps the ball in the wide part of the fairway, though the approach becomes partially blind.",
    "Thread the tee shot between the left waste and right bunkers, then use the right side on approach whenever you can. The green accepts a running shot from that angle, with only left pins asking for a more direct attack.",
    "A reachable par 5 for the longer hitters if they take on the drive through the valley. For everyone else, hugging the left side sets up the simplest lay-up and avoids the awkward uphill pitch from the bowl on the right.",
    "A drivable uphill par 4 with multiple tee-shot options depending on appetite for risk. Choose your line based on the day’s pin, because every option leaves a different angle and level of difficulty for the approach.",
    "A strong par 3 where the safest target is the wider right side of the green. Taking on a left pin is bold, but with deep bunkers and trouble long, simply finding the putting surface is an excellent outcome.",
    "This short par 4 rewards those willing to flirt with the huge hazard on the left for a better angle. The conservative play is right, accepting a trickier pitch, while stronger players may try to carry the trouble and set up birdie.",
    "A long par 4 that starts the toughest stretch on the North. Favor the right-side sand line from the tee to open the best angle, then expect to need two very solid shots to make the green.",
    "One of the narrowest tee shots on the course and a demanding long par 4. On the approach, treat it like a running-shot green and be especially precise to front pins, which require landing well short on the right spot.",
    "A strong par 4 where left-side waste and right bunkers squeeze club selection off the tee. Once in position, the smart approach is a running shot landing short and feeding onto the green.",
    "The hogsback fairway defines this hole. Lay up short for safety and a longer second, or challenge the domed section with driver or 3-wood to gain a shorter approach at the cost of a much bigger miss.",
    "The more club you hit here, the more danger you bring in. For most players, a long iron or hybrid is ideal, preferably from the left side, before a delicate pitch into a green protected by deep bunkers and strong tilt.",
    "A short hole surrounded by sand and heath where precision matters more than power. Pick the correct yardage, aim for the fat side, and avoid short-siding yourself around the bunkers.",
    "A long par 4 with a largely blind tee shot over the ridge and a more inviting second than it first appears. The best line is over the dogleg bunker, especially if the pin is tucked on the right.",
    "This par 3 favors a left-to-right shot shape. The safe line is just left of center using the mound to feed the ball inward, while the far-right pin demands a committed shot directly over the bunker.",
    "The longest hole on the property and a genuine three-shot par 5. Taking on the bunkers from the tee gives a shorter, clearer route, but wherever you are, be careful not to feed the approach into the hollow fronting the green.",
    "A strategic finishing par 4 where long hitters may challenge the corner bunker for a wedge in. The safer play is a shorter club feeding toward the corner, leaving a comfortable short iron with a strong angle into the amphitheater green.",
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
      { id:"m1",blue:["angus","jturner"],grey:["chris","cam"] },
      { id:"m2",blue:["nick","jkelly"],grey:["jason","lach"] },
      { id:"m3",blue:["tom","callum"],grey:["luke","alex"] },
    ],
  },
  {
    id:"r2",num:2,day:"Saturday 28th March",courseId:"pk_south",courseName:"PK South Course",
    teeTimes:["12:44pm","12:52pm","1:00pm"],
    matches:[
      { id:"m4",blue:["angus","nick"],grey:["chris","jason"] },
      { id:"m5",blue:["callum","jkelly"],grey:["luke","lach"] },
      { id:"m6",blue:["tom","jturner"],grey:["alex","cam"] },
    ],
  },
  {
    id:"r3",num:3,day:"Sunday 29th March",courseId:"pk_north",courseName:"PK North Course",
    teeTimes:["8:27am","8:35am","8:43am"],
    matches:[
      { id:"m7",blue:["callum","jturner"],grey:["jason","alex"] },
      { id:"m8",blue:["nick","tom"],grey:["chris","lach"] },
      { id:"m9",blue:["angus","jkelly"],grey:["luke","cam"] },
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

function PlayerAvatar({id, size=32, live=true, border=true, priority="auto"}) {
  const player = getP(id);
  const src = PLAYER_PHOTOS[id];
  const teamColor = player?.team === "blue" ? "#D4A017" : "#DC2626";
  const borderColor = live && border ? teamColor : "#d1d5db";
  const initials = (player?.name || "?").split(" ").map(part => part[0]).slice(0,2).join("").toUpperCase();
  const loading = priority === "high" ? "eager" : "lazy";
  const [visible, setVisible] = useState(priority === "high");
  const [failed, setFailed] = useState(false);
  const holderRef = useRef(null);

  useEffect(() => {
    if (visible || !src || !holderRef.current) return;
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const lowBandwidth = !!(connection?.saveData || ["slow-2g", "2g"].includes(connection?.effectiveType));
    if (lowBandwidth && priority !== "high") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "140px" }
    );
    observer.observe(holderRef.current);
    return () => observer.disconnect();
  }, [priority, src, visible]);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return src ? (
    <div ref={holderRef} style={{width:size,height:size,flexShrink:0}}>
      {!visible || failed ? (
        <div aria-label={player?.name || "Player"} style={{width:size,height:size,borderRadius:"50%",background:"#e2e8f0",border:`2px solid ${borderColor}`,flexShrink:0,display:"grid",placeItems:"center",color:"#475569",fontSize:Math.max(10, Math.round(size*0.32)),fontWeight:700}}>{initials}</div>
      ) : (
        <img src={src} alt={player?.name || "Player"} loading={loading} fetchPriority={priority} decoding="async" width={size} height={size} onError={() => setFailed(true)} style={{
          width:size, height:size, borderRadius:"50%",
          border:`2px solid ${borderColor}`,
          objectFit:"cover", flexShrink:0,
          filter: live ? "none" : "grayscale(100%) brightness(1.1) contrast(0.8) sepia(15%)",
        }}/>
      )}
    </div>
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
  handicaps:{
    angus:4.1,nick:12.3,tom:14.3,callum:15.4,jkelly:35.4,jturner:17.8,
    chris:1.5,luke:14.0,alex:15.6,lach:28.0,jason:14.6,cam:23.2,
  },
  scores:{},
  ntpWinners:{},
  ldWinners:{},
  chulligans:{},
  submitted:{},
  dailySummaries:{},
  dailySummaryDrafts:{},
  sledgeFeed:[],
  sledgeMeta:{},
  sledgeReads:{},
  summaryReads:{},
  eventLive:false,
  roundScoringLive:{r1:true,r2:false,r3:false},
  tees:{standrews:"white",pk_south:"white",pk_north:"white"},
  teamNames:{...DEFAULT_TEAM_NAMES}
};

function normalizeState(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const next = DC(DEFAULT_STATE);
  Object.assign(next, raw);
  next.handicaps = { ...DEFAULT_STATE.handicaps, ...(raw.handicaps || {}) };
  next.scores = raw.scores && typeof raw.scores === "object" ? raw.scores : {};
  next.ntpWinners = raw.ntpWinners && typeof raw.ntpWinners === "object" ? raw.ntpWinners : {};
  next.ldWinners = raw.ldWinners && typeof raw.ldWinners === "object" ? raw.ldWinners : {};
  next.chulligans = raw.chulligans && typeof raw.chulligans === "object" ? raw.chulligans : {};
  next.submitted = raw.submitted && typeof raw.submitted === "object" ? raw.submitted : {};
  next.dailySummaries = raw.dailySummaries && typeof raw.dailySummaries === "object" ? raw.dailySummaries : {};
  next.dailySummaryDrafts = raw.dailySummaryDrafts && typeof raw.dailySummaryDrafts === "object" ? raw.dailySummaryDrafts : {};
  next.sledgeFeed = Array.isArray(raw.sledgeFeed) ? raw.sledgeFeed : [];
  next.sledgeMeta = raw.sledgeMeta && typeof raw.sledgeMeta === "object" ? raw.sledgeMeta : {};
  next.sledgeReads = raw.sledgeReads && typeof raw.sledgeReads === "object" ? raw.sledgeReads : {};
  next.summaryReads = raw.summaryReads && typeof raw.summaryReads === "object" ? raw.summaryReads : {};
  next.roundScoringLive = { ...DEFAULT_STATE.roundScoringLive, ...(raw.roundScoringLive || {}) };
  next.tees = { ...DEFAULT_STATE.tees, ...(raw.tees || {}) };
  next.teamNames = { ...DEFAULT_TEAM_NAMES, ...(raw.teamNames || {}) };
  next.eventLive = !!raw.eventLive;
  return next;
}

const SLEDGE_COOLDOWN_MS = 20 * 60 * 1000;

function pickSledge(lines) {
  return lines[Math.floor(Math.random() * lines.length)] || lines[0] || "";
}

const SLEDGE_LIBRARY = {
  big_points: [
    ({ playerShort, points, hole }) => `🔥 ${playerShort} just peeled off ${points} points on hole ${hole}. Handicap detectives are circling.`,
    ({ playerShort, points, hole }) => `🚨 ${playerShort} walked away from hole ${hole} with ${points} points and absolutely no shame.`,
    ({ playerShort, points, hole }) => `🎯 ${playerShort} turned hole ${hole} into a ${points}-point robbery. Case remains open.`,
    ({ playerShort, points, hole }) => `📈 ${playerShort} just cashed ${points} points on hole ${hole}. Momentum has entered the group chat.`,
    ({ playerShort, points, hole }) => `💰 ${playerShort} found ${points} points on hole ${hole}. Inspector of handicaps has been notified.`,
    ({ playerShort, points, hole }) => `⚡ ${playerShort} nicked ${points} points from hole ${hole}. That felt personal.`,
    ({ playerShort, points, hole }) => `🎲 ${playerShort} rolled up to hole ${hole} and came back with ${points} points. Filthy work.`,
    ({ playerShort, points, hole }) => `🪄 ${playerShort} made ${points} points appear on hole ${hole}. Slight of hand suspected.`,
    ({ playerShort, points, hole }) => `📣 ${playerShort} just posted ${points} points on hole ${hole}. The chatter is already unbearable.`,
    ({ playerShort, points, hole }) => `😮‍💨 Hole ${hole} has just funded a ${points}-point surge for ${playerShort}. Standards are slipping.`,
  ],
  wipe: [
    ({ playerShort, hole }) => `💀 ${playerShort} took a pickup on hole ${hole}. We will absolutely be revisiting this later.`,
    ({ playerShort, hole }) => `🫠 Hole ${hole} folded ${playerShort} into a neat little pickup. Character building only.`,
    ({ playerShort, hole }) => `📉 ${playerShort} has activated the emergency pickup on hole ${hole}. Dignity remains week-to-week.`,
    ({ playerShort, hole }) => `🪦 ${playerShort} left their hopes on hole ${hole} and marked down the pickup.`,
    ({ playerShort, hole }) => `😬 Pickup for ${playerShort} on hole ${hole}. A brave attempt was made by someone.`,
    ({ playerShort, hole }) => `🚧 Hole ${hole} was closed due to a ${playerShort} incident. Pickup recorded.`,
    ({ playerShort, hole }) => `🥀 ${playerShort} has wiped hole ${hole}. The post-mortem will be ruthless.`,
    ({ playerShort, hole }) => `📦 ${playerShort} wrapped up hole ${hole} early with a pickup and a thousand-yard stare.`,
    ({ playerShort, hole }) => `🛟 ${playerShort} needed the pickup button on hole ${hole}. Survival first, questions later.`,
    ({ playerShort, hole }) => `🙃 ${playerShort} and hole ${hole} have mutually agreed to never speak again. Pickup.`,
  ],
  team_double_wipe: [
    ({ playerShort, partnerShort, hole }) => `🧨 Team collapse alert: ${playerShort} + ${partnerShort} both wiped hole ${hole}. Pure cinema.`,
    ({ playerShort, partnerShort, hole }) => `🍿 Hole ${hole} just claimed both ${playerShort} and ${partnerShort}. This duo brought chaos, not caution.`,
    ({ playerShort, partnerShort, hole }) => `🧻 ${playerShort} and ${partnerShort} both wiped hole ${hole} — someone get this team a fresh roll of toilet paper and a reset.`,
    ({ playerShort, partnerShort, hole }) => `🚑 Double pickup on hole ${hole} for ${playerShort} and ${partnerShort}. Send snacks and emotional support.`,
    ({ playerShort, partnerShort, hole }) => `🌪️ ${playerShort} and ${partnerShort} both disappeared into the spin cycle on hole ${hole}.`,
    ({ playerShort, partnerShort, hole }) => `📛 Hole ${hole} has issued matching pickup receipts to ${playerShort} and ${partnerShort}.`,
    ({ playerShort, partnerShort, hole }) => `🧯 ${playerShort}/${partnerShort} both wiped hole ${hole}. The fairway is still smoking.`,
    ({ playerShort, partnerShort, hole }) => `🎭 ${playerShort} and ${partnerShort} have produced a synchronised pickup on hole ${hole}. Bold theatre.`,
    ({ playerShort, partnerShort, hole }) => `🌀 Team ${playerShort}/${partnerShort} both lost hole ${hole} in exactly the same dramatic fashion.`,
    ({ playerShort, partnerShort, hole }) => `📉 ${playerShort} plus ${partnerShort} have managed the full double wipe on hole ${hole}. Efficient, if nothing else.`,
  ],
  chulligan: [
    ({ playerShort, hole }) => `🍺 ${playerShort} just activated a Chulligan on hole ${hole}. Science remains divided on this strategy.`,
    ({ playerShort, hole }) => `🥃 Chulligan called for ${playerShort} on hole ${hole}. Form temporary, confidence permanent.`,
    ({ playerShort, hole }) => `🎪 ${playerShort} has used the Chulligan token on hole ${hole}. The crowd requested this timeline.`,
    ({ playerShort, hole }) => `🧃 ${playerShort} has reached for a Chulligan on hole ${hole}. Hydration has left the chat.`,
    ({ playerShort, hole }) => `🎟️ One Chulligan has been redeemed by ${playerShort} on hole ${hole}. Terms and conditions remain fuzzy.`,
    ({ playerShort, hole }) => `🛞 ${playerShort} has gone to the Chulligan well on hole ${hole}. Wheels may come off, vibes stay high.`,
    ({ playerShort, hole }) => `📣 ${playerShort} is taking the Chulligan route on hole ${hole}. This feels both avoidable and iconic.`,
    ({ playerShort, hole }) => `🧪 Experimental golf continues: ${playerShort} has called a Chulligan on hole ${hole}.`,
    ({ playerShort, hole }) => `🎯 ${playerShort} has paired hole ${hole} with a Chulligan. Accuracy sold separately.`,
    ({ playerShort, hole }) => `🥳 ${playerShort} deployed the Chulligan on hole ${hole}. Coaches everywhere are sighing.`,
  ],
  ntp_claim: [
    ({ playerShort, hole }) => `📍 ${playerShort} just claimed NTP on hole ${hole}. The pin is now requesting witness protection.`,
    ({ playerShort, hole }) => `🎯 NTP belongs to ${playerShort} on hole ${hole}. Everyone else suddenly remembers how to miss greens.`,
    ({ playerShort, hole }) => `🧲 ${playerShort} has grabbed NTP on hole ${hole}. That shot had main-character energy.`,
    ({ playerShort, hole }) => `📏 ${playerShort} now owns the closest look on hole ${hole}. Tape measure under review.`,
    ({ playerShort, hole }) => `👀 ${playerShort} has parked one near the flag on hole ${hole}. The witnesses are rattled.`,
    ({ playerShort, hole }) => `🪄 ${playerShort} just turned hole ${hole} into an NTP audition and nailed it.`,
    ({ playerShort, hole }) => `🚩 ${playerShort} is now sitting nearest on hole ${hole}. Cue a lot of forced compliments.`,
    ({ playerShort, hole }) => `📣 Closest-to-pin on hole ${hole} currently belongs to ${playerShort}. The pressure is delicious.`,
    ({ playerShort, hole }) => `🎬 ${playerShort} has taken NTP on hole ${hole} with a shot that demanded a replay.`,
    ({ playerShort, hole }) => `😎 ${playerShort} owns the prettiest result on hole ${hole}: current NTP holder.`,
  ],
  ld_claim: [
    ({ playerShort, hole }) => `💣 ${playerShort} has claimed Longest Drive on hole ${hole}. Ball may still be airborne.`,
    ({ playerShort, hole }) => `🚀 ${playerShort} now holds LD on hole ${hole}. Nearby suburbs have been notified.`,
    ({ playerShort, hole }) => `📡 Longest Drive on hole ${hole} is currently ${playerShort}'s. Launch angle disrespected physics.`,
    ({ playerShort, hole }) => `🛫 ${playerShort} has sent one into orbit on hole ${hole} and grabbed LD.`,
    ({ playerShort, hole }) => `📏 ${playerShort} is the new bomber-in-chief on hole ${hole}. Longest Drive claimed.`,
    ({ playerShort, hole }) => `🌪️ ${playerShort} just bullied hole ${hole} off the tee and took LD.`,
    ({ playerShort, hole }) => `🧨 ${playerShort} now owns the biggest send on hole ${hole}. Grip it, rip it, boast immediately.`,
    ({ playerShort, hole }) => `🏁 Longest Drive on hole ${hole} has been stolen by ${playerShort}. The field looks wounded.`,
    ({ playerShort, hole }) => `📣 ${playerShort} is the current LD holder on hole ${hole}. Driver face still humming.`,
    ({ playerShort, hole }) => `😤 ${playerShort} has overpowered hole ${hole} and walked off with Longest Drive.`,
  ],
};

function buildSledgeMessage(type, context) {
  const templates = SLEDGE_LIBRARY[type] || [];
  const line = pickSledge(templates);
  return typeof line === "function" ? line(context || {}) : line;
}

function canPushSledgeForPlayers(state, roundId, playerIds, now = Date.now()) {
  if (!state?.eventLive) return false;
  if (!state.sledgeMeta) state.sledgeMeta = {};
  const ids = [...new Set((playerIds || []).filter(Boolean))];
  if (ids.length === 0) return true;
  return ids.every(pid => {
    const playerKey = `${roundId}:player:${pid}`;
    const last = state.sledgeMeta[playerKey] || { at: 0 };
    return (now - last.at) >= SLEDGE_COOLDOWN_MS;
  });
}

function stampSledgePlayers(state, roundId, playerIds, now = Date.now()) {
  if (!state.sledgeMeta) state.sledgeMeta = {};
  [...new Set((playerIds || []).filter(Boolean))].forEach(pid => {
    state.sledgeMeta[`${roundId}:player:${pid}`] = { at: now };
  });
}

function removeSledgeFeedItems(state, predicate) {
  if (!state?.sledgeFeed?.length) return;
  state.sledgeFeed = state.sledgeFeed.filter(item => !predicate(item));
}

function pushSledgeFeed(state, { roundId, playerId, playerIds, hole, catalystKey, message }) {
  if (!state?.eventLive || !message) return false;
  if (!state.sledgeMeta) state.sledgeMeta = {};
  if (!state.sledgeFeed) state.sledgeFeed = [];

  const now = Date.now();
  const impactedPlayers = [...new Set((playerIds || [playerId]).filter(Boolean))];
  const metaKey = `${roundId}:${catalystKey}`;
  const last = state.sledgeMeta[metaKey] || { at: 0 };
  if ((now - last.at) < SLEDGE_COOLDOWN_MS) return false;
  if (!canPushSledgeForPlayers(state, roundId, impactedPlayers, now)) return false;

  state.sledgeMeta[metaKey] = { at: now };
  stampSledgePlayers(state, roundId, impactedPlayers, now);
  state.sledgeFeed.unshift({
    id: `${now}_${metaKey}`,
    roundId,
    playerId: playerId || null,
    playerIds: impactedPlayers,
    hole: hole || null,
    catalystKey,
    message,
    at: new Date(now).toISOString(),
  });
  state.sledgeFeed = state.sledgeFeed.slice(0, 14);
  return true;
}

function maybePushScoreSledge(state, { roundId, playerId, holeIdx, prevVal, nextVal }) {
  if (!state?.eventLive || nextVal === prevVal || !holeFilled(nextVal)) return;
  const round = ROUNDS.find(r => r.id === roundId);
  if (!round) return;
  const course = getCourse(round.courseId);
  const hole = course.holes[holeIdx];
  if (!hole) return;
  const player = getP(playerId);
  const playerShort = player?.short || "Someone";

  const dailyHcp = courseHcp(state.handicaps?.[playerId], course, getTeeKey(state, course.id));
  const points = sPts(nextVal, hole.par, hStrokes(dailyHcp, hole));
  const prevPoints = holeFilled(prevVal) ? sPts(prevVal, hole.par, hStrokes(dailyHcp, hole)) : null;
  if (prevPoints === points) return;

  if (points >= 4) {
    pushSledgeFeed(state, {
      roundId,
      playerId,
      hole: hole.n,
      catalystKey: `big_points:${playerId}`,
      message: buildSledgeMessage("big_points", { playerShort, points, hole: hole.n }),
    });
  }

  if (nextVal === -1) {
    const partnerId = getPartner(playerId, roundId);
    const partnerWiped = partnerId && state.scores?.[roundId]?.[partnerId]?.[holeIdx] === -1;
    if (partnerWiped) {
      const partnerShort = getP(partnerId)?.short || "Partner";
      const teamKey = [playerId, partnerId].sort().join("_");
      removeSledgeFeedItems(state, item => (
        item.roundId === roundId
        && item.hole === hole.n
        && [playerId, partnerId].includes(item.playerId)
        && item.catalystKey === `wipe:${item.playerId}`
      ));
      pushSledgeFeed(state, {
        roundId,
        playerIds: [playerId, partnerId],
        hole: hole.n,
        catalystKey: `team_double_wipe:${teamKey}:${hole.n}`,
        message: buildSledgeMessage("team_double_wipe", { playerShort, partnerShort, hole: hole.n }),
      });
      return;
    }

    pushSledgeFeed(state, {
      roundId,
      playerId,
      hole: hole.n,
      catalystKey: `wipe:${playerId}`,
      message: buildSledgeMessage("wipe", { playerShort, hole: hole.n }),
    });
  }
}

function maybePushChulliganSledge(state, { roundId, playerId, holeIdx }) {
  const playerShort = getP(playerId)?.short || "Someone";
  pushSledgeFeed(state, {
    roundId,
    playerId,
    hole: holeIdx + 1,
    catalystKey: `chulligan:${playerId}`,
    message: buildSledgeMessage("chulligan", { playerShort, hole: holeIdx + 1 }),
  });
}

function maybePushCompClaimSledge(state, { roundId, playerId, type }) {
  const playerShort = getP(playerId)?.short || "Someone";
  const round = ROUNDS.find(r => r.id === roundId);
  if (!round) return;
  const hole = type === "ntp" ? getNtpHole(round.id, round.courseId) : getLdHole(round.courseId);
  pushSledgeFeed(state, {
    roundId,
    playerId,
    hole,
    catalystKey: `${type}_claim:${playerId}`,
    message: buildSledgeMessage(type === "ntp" ? "ntp_claim" : "ld_claim", { playerShort, hole }),
  });
}

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

function getRoundTrendStats(state, round) {
  const course = getCourse(round.courseId);
  const playerStats = PLAYERS.map(player => {
    const scores = state.scores?.[round.id]?.[player.id] || [];
    const dailyHcp = courseHcp(state.handicaps?.[player.id], course, getTeeKey(state, course.id));
    let birdies = 0;
    let wipes = 0;
    let wipeRun = 0;
    let maxWipeRun = 0;
    let bogeyRun = 0;
    let worstBogeyRun = 0;
    const netDiffs = [];

    course.holes.forEach((hole, index) => {
      const gross = scores[index] ?? 0;
      if (!holeFilled(gross)) {
        wipeRun = 0;
        bogeyRun = 0;
        return;
      }

      if (gross === -1) {
        wipes += 1;
        wipeRun += 1;
        maxWipeRun = Math.max(maxWipeRun, wipeRun);
        bogeyRun += 1;
        worstBogeyRun = Math.max(worstBogeyRun, bogeyRun);
        netDiffs.push(5);
        return;
      }

      wipeRun = 0;
      const net = gross - hStrokes(dailyHcp, hole);
      const diff = net - hole.par;
      netDiffs.push(diff);

      if (gross < hole.par) birdies += 1;
      if (diff >= 1) {
        bogeyRun += 1;
        worstBogeyRun = Math.max(worstBogeyRun, bogeyRun);
      } else {
        bogeyRun = 0;
      }
    });

    let worstStretch = null;
    for (let i = 0; i <= netDiffs.length - 3; i += 1) {
      const window = netDiffs.slice(i, i + 3);
      if (window.length < 3) continue;
      const total = window.reduce((a, b) => a + b, 0);
      if (!worstStretch || total > worstStretch.total) {
        worstStretch = { total, startHole: i + 1, endHole: i + 3 };
      }
    }

    return { player, birdies, wipes, maxWipeRun, worstBogeyRun, worstStretch };
  });

  const mostBirdies = [...playerStats].sort((a, b) => b.birdies - a.birdies)[0];
  const mostWipes = [...playerStats].sort((a, b) => b.wipes - a.wipes)[0];
  const worstBogeyRun = [...playerStats].sort((a, b) => b.worstBogeyRun - a.worstBogeyRun)[0];
  const worstStretch = [...playerStats]
    .filter(p => p.worstStretch)
    .sort((a, b) => b.worstStretch.total - a.worstStretch.total)[0];

  return { mostBirdies, mostWipes, worstBogeyRun, worstStretch };
}

function formatRoundSummaryExport(state, roundId) {
  const round = ROUNDS.find(r => r.id === roundId);
  if (!round) return "";
  const leaderboard = getRoundLeaderboard(state, round);
  const overall = getOverallLeaderboard(state);
  const ntpId = state.ntpWinners?.[`${round.id}_ntp`];
  const ldId = state.ldWinners?.[`${round.id}_ld`];
  const trendStats = getRoundTrendStats(state, round);
  const course = getCourse(round.courseId);

  const sections = [
    `Round ${round.num} - ${round.courseName}`,
    `${round.day}`,
    "",
    "ROUND LEADERBOARD",
    ...(leaderboard.length ? leaderboard.map((p, i) => `${i + 1}. ${p.name} - ${p.score} pts`) : ["No scores recorded yet."]),
    "",
    "OVERALL LEADERBOARD",
    ...(overall.length ? overall.map((p, i) => `${i + 1}. ${p.name} - ${p.total} pts`) : ["No overall totals yet."]),
    "",
    `NTP: ${ntpId ? getP(ntpId)?.name : "TBC"}`,
    `LD: ${ldId ? getP(ldId)?.name : "TBC"}`,
    "",
    "ROUND TREND NOTES",
    `Most birdies: ${trendStats.mostBirdies?.player?.name || "TBC"} (${trendStats.mostBirdies?.birdies ?? 0})`,
    `Most wipes (P): ${trendStats.mostWipes?.player?.name || "TBC"} (${trendStats.mostWipes?.wipes ?? 0})`,
    `Worst bogey run: ${trendStats.worstBogeyRun?.player?.name || "TBC"} (${trendStats.worstBogeyRun?.worstBogeyRun ?? 0} holes)`,
    `Worst 3-hole stretch: ${trendStats.worstStretch?.player?.name || "TBC"} (+${trendStats.worstStretch?.worstStretch?.total ?? 0} net over holes ${trendStats.worstStretch?.worstStretch?.startHole ?? "?"}-${trendStats.worstStretch?.worstStretch?.endHole ?? "?"})`,
    "",
    "FULL SCORESHEETS",
  ];

  round.matches.forEach((match, matchIndex) => {
    sections.push(`Match ${matchIndex + 1}: ${match.blue.map(id => getP(id)?.short || id).join(" / ")} vs ${match.grey.map(id => getP(id)?.short || id).join(" / ")}`);
    [...match.blue, ...match.grey].forEach(playerId => {
      const player = getP(playerId);
      const scores = state.scores?.[round.id]?.[playerId] || [];
      const dailyHcp = courseHcp(state.handicaps?.[playerId], course, getTeeKey(state, course.id));
      const holeParts = course.holes.map((hole, idx) => {
        const gross = scores[idx] ?? 0;
        if (!holeFilled(gross)) return `${hole.n}: -`;
        if (gross === -1) return `${hole.n}: P`;
        const points = sPts(gross, hole.par, hStrokes(dailyHcp, hole));
        return `${hole.n}: ${gross} (${points}pt)`;
      });
      const totalPoints = course.holes.reduce((sum, hole, idx) => sum + sPts(scores[idx] ?? 0, hole.par, hStrokes(dailyHcp, hole)), 0);
      sections.push(`${player?.name || playerId} | Total ${totalPoints} pts | ${holeParts.join(", ")}`);
    });
    sections.push("");
  });

  return sections.join("\n");
}

function buildManualRoundSummary(state, roundId, content) {
  const round = ROUNDS.find(r => r.id === roundId);
  if (!round) return null;
  return {
    roundId,
    roundNum: round.num,
    title: `Round ${round.num} Banter Bulletin`,
    content: (content || "").trim(),
    source: "admin",
    releasedAt: new Date().toISOString(),
  };
}

async function copyText(text) {
  if (!text) return false;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "absolute";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return !!ok;
  } catch {
    return false;
  }
}

const LIVE_SYNC_INTERVAL_MS = 15000;

function App() {
  const [state,setState]=useState(null);
  const [isAdmin,setIsAdmin]=useState(false);
  const [isSpectator,setIsSpectator]=useState(false);
  const [cur,setCur]=useState(null);
  const [tab,setTab]=useState("cup");
  const [sub,setSub]=useState(null);
  const [lockedPlayerId,setLockedPlayerId]=useState(()=>localStorage.getItem(PLAYER_LOCK_KEY));
  const [summaryPopup,setSummaryPopup]=useState(null);
  const [hasAccess,setHasAccess]=useState(()=>localStorage.getItem(ACCESS_GRANTED_KEY)==="1");
  const [syncError, setSyncError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const refreshInFlightRef = useRef(false);
  const saveVersionRef = useRef(0);

  const refreshState = useCallback(async ({ shouldApply, force = false } = {}) => {
    if (refreshInFlightRef.current && !force) return null;
    refreshInFlightRef.current = true;
    try {
      const next = await load();
      if (next && (!shouldApply || shouldApply())) {
        cacheStateSnapshot(next);
        setState(DC(next));
        setSyncError("");
      }
      return next;
    } catch (error) {
      const fallbackState = readCachedState() || DC(DEFAULT_STATE);
      if (!shouldApply || shouldApply()) {
        setState(prev => prev || fallbackState);
        setSyncError(error?.message || "Unable to sync with Supabase.");
      }
      return fallbackState;
    } finally {
      refreshInFlightRef.current = false;
    }
  }, []);

  useEffect(()=>{
    let alive=true;
    const syncState = () => refreshState({ shouldApply: () => alive });
    syncState();
    const interval = window.setInterval(syncState, LIVE_SYNC_INTERVAL_MS);
    return ()=>{
      alive=false;
      window.clearInterval(interval);
    };
  },[refreshState]);

  useEffect(() => {
    const client = createRealtimeClient();
    if (!client) return undefined;

    const channel = client
      .channel(`spinners-app-state-${DB_ROW_ID}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_state", filter: `id=eq.${DB_ROW_ID}` },
        payload => {
          const remoteState = normalizeState(payload.new?.data);
          if (remoteState) {
            cacheStateSnapshot(remoteState);
            setState(DC(remoteState));
            setSyncError("");
          } else {
            refreshState({ force: true });
          }
        }
      )
      .subscribe(status => {
        if (status === "CHANNEL_ERROR") {
          setSyncError("Realtime sync disconnected. Falling back to refresh.");
        }
      });

    return () => {
      client.removeChannel(channel);
      client.removeAllChannels();
    };
  }, [refreshState]);
  useEffect(()=>{
    if (lockedPlayerId && PLAYERS.some(p => p.id === lockedPlayerId)) {
      setCur(lockedPlayerId);
      setTab("cup");
      setSub(null);
    }
  },[lockedPlayerId]);
  useEffect(()=>{
    if(!cur) return;
    refreshState();
  },[cur,tab,sub,refreshState]);

  useEffect(() => {
    const syncState = () => refreshState();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") syncState();
    };
    window.addEventListener("focus", syncState);
    window.addEventListener("pageshow", syncState);
    window.addEventListener("storage", syncState);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", syncState);
      window.removeEventListener("pageshow", syncState);
      window.removeEventListener("storage", syncState);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refreshState]);

  useEffect(() => {
    const onOnline = () => refreshState({ force: true });
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
    };
  }, [refreshState]);

  useEffect(() => {
    if (!state || !cur || cur === "admin" || cur === "spectator") return;
    const released = Object.values(state.dailySummaries || {}).sort((a,b) => new Date(b.releasedAt||0) - new Date(a.releasedAt||0));
    const unseen = released.find(s => !state.summaryReads?.[cur]?.[s.roundId]);
    if (unseen) setSummaryPopup(unseen);
  }, [cur, state?.dailySummaries, state?.summaryReads]);
  const upd=useCallback(fn=>{
    setState(prev=>{
      const base = DC(prev || DEFAULT_STATE);
      fn(base);
      const next = base;
      const saveVersion = ++saveVersionRef.current;
      cacheStateSnapshot(next);
      setIsSaving(true);
      setSyncError("");
      Promise.resolve(save(next))
        .then(() => {
          if (saveVersion === saveVersionRef.current) {
            setIsSaving(false);
            setSyncError("");
          }
        })
        .catch(error => {
          if (saveVersion !== saveVersionRef.current) return;
          setIsSaving(false);
          const message = navigator.onLine
            ? (error?.message || "Unable to save to Supabase.")
            : "Offline. Changes saved locally and will sync when reconnected.";
          setSyncError(message);
          cacheStateSnapshot(next);
        });
      return next;
    });
  },[refreshState]);

  if(!state) return <div style={S.loading}><div style={S.spinner}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>;
  if(!hasAccess) return <AccessGate onGrant={()=>{localStorage.setItem(ACCESS_GRANTED_KEY,"1");setHasAccess(true);}} />;
  if(!cur) return <PlayerSelect state={state} lockedPlayerId={lockedPlayerId} onSelect={id=>{if(lockedPlayerId&&lockedPlayerId!==id)return; if(!lockedPlayerId){localStorage.setItem(PLAYER_LOCK_KEY,id);setLockedPlayerId(id);}setIsSpectator(false);setCur(id);setTab("cup");setSub(null);}} onUnlockSelection={()=>{localStorage.removeItem(PLAYER_LOCK_KEY);setLockedPlayerId(null);}} onSpectator={()=>{setIsAdmin(false);setIsSpectator(true);setCur("spectator");setTab("cup");setSub(null);}} onAdmin={c=>{if(c.trim()===ADMIN_CODE){setIsAdmin(true);setIsSpectator(false);setCur("admin");setTab("cup");setSub(null);}}} />;

  const live = !!state.eventLive || isAdmin;

  return (
    <div style={S.app}>
      {(syncError || isSaving) && (
        <div style={{padding:"10px 14px",background:syncError?"#fef2f2":"#eff6ff",color:syncError?"#991b1b":"#1d4ed8",fontSize:12,fontWeight:600,textAlign:"center",borderBottom:`1px solid ${syncError?"#fecaca":"#bfdbfe"}`}}>
          {syncError || "Syncing changes to Supabase…"}
        </div>
      )}
      <Header isAdmin={isAdmin} name={isAdmin?"Admin":isSpectator?"Spectator":getP(cur)?.short} playerId={isAdmin||isSpectator?null:cur} live={live} onBack={()=>{if(sub){setSub(null);return;}setCur(null);setIsAdmin(false);setIsSpectator(false);}}/>
      <div style={S.content}>
        {tab==="cup"&&!sub&&<CupScreen state={state} cur={cur} upd={upd} onMatch={id=>setSub({t:"m",id})} live={live} isAdmin={isAdmin}/>}
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

function AccessGate({onGrant}){
  const [password,setPassword]=useState("");
  const [err,setErr]=useState(false);
  if (!APP_PASSWORD) {
    return (
      <div style={{...S.app,background:"#f8faf8",display:"flex",flexDirection:"column"}}>
        <div style={{padding:"48px 20px 32px",maxWidth:400,margin:"0 auto",flex:1,width:"100%",boxSizing:"border-box",display:"flex",flexDirection:"column",justifyContent:"center"}}>
          <img src={LOGO} alt="Spinners Cup" style={{width:220,height:220,objectFit:"contain",margin:"0 auto 10px",display:"block"}} />
          <p style={{fontSize:13,color:"#64748b",textAlign:"center",marginBottom:16}}>No app password configured. Tap continue to open the event app.</p>
          <button onClick={onGrant} style={{width:"100%",padding:"12px 16px",borderRadius:10,border:"none",background:"#2d6a4f",color:"#fff",fontWeight:700,cursor:"pointer",fontSize:14,minHeight:44}}>Continue</button>
        </div>
        <SponsorFooter />
      </div>
    );
  }

  return(
    <div style={{...S.app,background:"#f8faf8",display:"flex",flexDirection:"column"}}>
      <div style={{padding:"48px 20px 32px",maxWidth:400,margin:"0 auto",flex:1,width:"100%",boxSizing:"border-box"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <img src={LOGO} alt="Spinners Cup" style={{width:220,height:220,objectFit:"contain",marginBottom:8,display:"block",marginLeft:"auto",marginRight:"auto"}} />
          <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:26,fontWeight:800,color:"#1a2e1a",margin:"0 0 4px"}}>Spinners Cup 2026</h1>
          <p style={{fontSize:13,color:"#6b8a6e",margin:0}}>Enter password to continue</p>
        </div>
        <input
          type="password"
          value={password}
          onChange={e=>{setPassword(e.target.value);setErr(false);}}
          onKeyDown={e=>{if(e.key==="Enter"){if(password.trim()===APP_PASSWORD)onGrant();else setErr(true);}}}
          placeholder="Event password"
          style={{...S.input,marginBottom:10}}
        />
        <button
          onClick={()=>{if(password.trim()===APP_PASSWORD)onGrant();else setErr(true);}}
          style={{width:"100%",padding:"11px 16px",borderRadius:10,border:"none",background:"#2d6a4f",color:"#fff",fontWeight:700,cursor:"pointer",fontSize:14,minHeight:44}}
        >
          Enter
        </button>
        {err&&<p style={{color:"#dc2626",fontSize:12,marginTop:10,textAlign:"center"}}>Incorrect password</p>}
      </div>
      <SponsorFooter />
    </div>
  );
}

function PlayerSelect({state,lockedPlayerId,onSelect,onUnlockSelection,onSpectator,onAdmin}){
  const [showA,setShowA]=useState(false);const [code,setCode]=useState("");const [err,setErr]=useState(false);const [unlockReady,setUnlockReady]=useState(false);
  const live = !!state?.eventLive;
  const playerOrder = ["chris","angus","jason","tom","alex","nick","cam","callum","luke","jturner","lach","jkelly"];
  const displayPlayers = playerOrder.map(id => getP(id)).filter(Boolean);
  const [selectedPlayerId,setSelectedPlayerId]=useState(lockedPlayerId || "");
  const verifyAdminCode = () => {
    if (ADMIN_CODE && code.trim() === ADMIN_CODE) {
      setErr(false);
      setUnlockReady(true);
      return true;
    }
    setUnlockReady(false);
    setErr(true);
    return false;
  };
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
              <input value={code} onChange={e=>{setCode(e.target.value);setErr(false);setUnlockReady(false);}} placeholder="Admin code" style={{...S.input,flex:1,marginBottom:0}}/>
              <button onClick={()=>{if(verifyAdminCode())onAdmin(code);}} style={{padding:"10px 16px",borderRadius:10,border:"none",background:"#2d6a4f",color:"#fff",fontWeight:700,cursor:"pointer",fontSize:13,minHeight:44}}>Go</button>
            </div>
          )}
          <button onClick={onSpectator} aria-label="Open spectator mode" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,border:"1px solid #d1d5db",borderRadius:10,padding:"10px 16px",background:"#fff",color:"#334155",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",minHeight:44}}>👀 Spectator</button>
        </div>
        <p style={{fontSize:11,color:"#94a3b8",marginBottom:12,textAlign:"center"}}>Players: select your name then submit · Spectators: use spectator mode.</p>
        <div style={{marginBottom:20}}>
          <select
            value={selectedPlayerId}
            disabled={!!lockedPlayerId}
            onChange={e=>setSelectedPlayerId(e.target.value)}
            style={{...S.input,marginBottom:10,cursor:lockedPlayerId?"not-allowed":"pointer",opacity:lockedPlayerId?0.7:1}}
          >
            <option value="">Select your name</option>
            {displayPlayers.map(p=>(
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={()=>selectedPlayerId&&onSelect(selectedPlayerId)}
            disabled={!selectedPlayerId || (!!lockedPlayerId && lockedPlayerId!==selectedPlayerId)}
            style={{width:"100%",padding:"11px 16px",borderRadius:10,border:"none",background:"#2d6a4f",color:"#fff",fontWeight:700,cursor:(!selectedPlayerId || (!!lockedPlayerId && lockedPlayerId!==selectedPlayerId))?"not-allowed":"pointer",fontSize:14,minHeight:44,opacity:(!selectedPlayerId || (!!lockedPlayerId && lockedPlayerId!==selectedPlayerId))?0.55:1}}
          >
            Submit
          </button>
        </div>
        {lockedPlayerId&&<p style={{fontSize:11,color:"#94a3b8",marginTop:-8,textAlign:"center"}}>Locked player: {getP(lockedPlayerId)?.name || "Unknown"}</p>}
        {lockedPlayerId&&showA&&<button onClick={()=>{if(verifyAdminCode())onUnlockSelection();}} style={{display:"block",margin:"0 auto 8px",padding:"8px 12px",borderRadius:8,border:"1px solid #fca5a5",background:unlockReady?"#fff":"#fff5f5",color:"#dc2626",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>🔓 Unlock player selection</button>}
        {err&&<p style={{color:"#dc2626",fontSize:12,marginTop:4,textAlign:"center"}}>{ADMIN_CODE ? "Incorrect code" : "Admin code not configured"}</p>}
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
        <div style={{width:72,display:"flex",justifyContent:"center"}}>{playerId ? <PlayerAvatar id={playerId} size={BANNER_PHOTO_SIZE} live={live} border={false} priority="high" /> : <div style={{width:BANNER_PHOTO_SIZE}} />}</div>
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
function CupScreen({state,cur,upd,onMatch,live,isAdmin}){
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
  const activeViewer = cur && cur !== "admin" && cur !== "spectator" ? cur : null;
  const sledgeFeed = (state.sledgeFeed || []).filter(item => !activeViewer || !state.sledgeReads?.[activeViewer]?.[item.id]).slice(0, 5);

  useEffect(() => {
    if (!activeViewer || !sledgeFeed.length) return;
    upd(s => {
      if (!s.sledgeReads) s.sledgeReads = {};
      if (!s.sledgeReads[activeViewer]) s.sledgeReads[activeViewer] = {};
      let changed = false;
      sledgeFeed.forEach(item => {
        if (!s.sledgeReads[activeViewer][item.id]) {
          s.sledgeReads[activeViewer][item.id] = true;
          changed = true;
        }
      });
      if (!changed) return;
    });
  }, [activeViewer, sledgeFeed, upd]);

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

      {live && sledgeFeed.length > 0 && (
        <div style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:12,padding:"10px 12px",marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:800,color:"#9a3412",marginBottom:6}}>📣 Live Sledge Feed</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {sledgeFeed.map(item => (
              <div key={item.id} style={{fontSize:12,color:"#7c2d12",lineHeight:1.35}}>
                {item.message}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{marginTop:-8,marginBottom:14,fontSize:11,color:"#64748b",fontStyle:"italic"}}>Click match for detailed scorecard.</div>

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
  const playerDailyHcp = Object.fromEntries(allIds.map(id => [id, courseHcp(state.handicaps?.[id], course, tk) || 0]));
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
                const dailyH = playerDailyHcp[id] || 0;
                const gross=state.scores?.[round.id]?.[id]?.[i]||0;
                const isPU=isPickup(gross);
                const matchPts=isPU?0:sPts(gross,h.par,hStrokes(adjH,h));
                const displayPts=isPU?0:sPts(gross,h.par,hStrokes(dailyH,h));
                return {gross,matchPts,displayPts,isB,isPU,filled:holeFilled(gross)};
              });
              const blueHas=pD.some(d=>d.isB&&d.filled);
              const greyHas=pD.some(d=>!d.isB&&d.filled);
              const bothScored=blueHas&&greyHas;
              const bMatchPts=pD.filter(d=>d.isB).map(d=>d.matchPts);
              const gMatchPts=pD.filter(d=>!d.isB).map(d=>d.matchPts);
              const bDisplayPts=pD.filter(d=>d.isB).map(d=>d.displayPts);
              const gDisplayPts=pD.filter(d=>!d.isB).map(d=>d.displayPts);
              const bestBMatch=Math.max(...bMatchPts),bestGMatch=Math.max(...gMatchPts);
              const bestBDisplay=Math.max(...bDisplayPts),bestGDisplay=Math.max(...gDisplayPts);
              let hRes="",resCol="#94a3b8";
              if(bothScored){
                if(bestBMatch>bestGMatch){runUp++;hRes="🟡";resCol="#B8860B";}
                else if(bestGMatch>bestBMatch){runUp--;hRes="🔴";resCol="#B91C1C";}
                else hRes="—";
              }
              return(
                <tr key={h.n} style={{borderBottom:"1px solid #f1f5f9"}}>
                  <td style={S.td}>{h.n}</td>
                  <td style={{...S.td,color:"#94a3b8"}}>{h.par}</td>
                  {pD.map((d,pi)=>(
                    <td key={pi} style={S.td}>
                      {d.isPU?(<div><div style={{fontWeight:600,color:"#94a3b8"}}>P</div><div style={{fontSize:8,color:"#94a3b8"}}>0pts</div></div>)
                      :d.gross>0?(<div><div style={{fontWeight:600,color:"#1e293b"}}>{d.gross}</div><div style={{fontSize:8,color:sColor(d.displayPts),fontWeight:600}}>{d.displayPts}pts</div></div>):(
                        isAdmin?<input type="number" inputMode="numeric" value="" min="1" max="15" style={S.tblIn} onChange={e=>{const v=parseInt(e.target.value)||0;const id=allIds[pi];upd(s=>{if(!s.scores[round.id])s.scores[round.id]={};if(!s.scores[round.id][id])s.scores[round.id][id]=Array(18).fill(0);s.scores[round.id][id][i]=Math.max(0,Math.min(15,v));});}}/>:<span style={{color:"#d1d5db"}}>—</span>
                      )}
                    </td>
                  ))}
                  <td style={{...S.td,fontWeight:700,color:"#B8860B",background:bestBMatch>bestGMatch&&bothScored?"#FFFBEB":"transparent"}}>{bothScored?bestBDisplay:blueHas?bestBDisplay:"—"}</td>
                  <td style={{...S.td,fontWeight:700,color:"#B91C1C",background:bestGMatch>bestBMatch&&bothScored?"#FEF2F2":"transparent"}}>{bothScored?bestGDisplay:greyHas?bestGDisplay:"—"}</td>
                  <td style={{...S.td,textAlign:"center"}}>{bothScored&&<div>{hRes}<div style={{fontSize:7,color:runUp>0?"#B8860B":runUp<0?"#B91C1C":"#16a34a",fontWeight:700}}>{runUp===0?"AS":runUp>0?`${getTeamInitial(state, "blue")}+${runUp}`:`${getTeamInitial(state, "grey")}+${Math.abs(runUp)}`}</div></div>}</td>
                </tr>
              );
            })}
            {/* Totals row */}
            {(() => {
              const playerTotals = allIds.map((id, pi) => {
                const isB = match.blue.includes(id);
                const dailyH = playerDailyHcp[id] || 0;
                let totalPts = 0;
                course.holes.forEach((h, i) => {
                  const gross = state.scores?.[round.id]?.[id]?.[i] || 0;
                  totalPts += sPts(gross, h.par, hStrokes(dailyH,h));
                });
                return { totalPts, isB };
              });
              let blueTotalBB = 0, greyTotalBB = 0;
              course.holes.forEach((h, i) => {
                const bPtsArr = allIds.map((id, pi) => {
                  const isB = match.blue.includes(id);
                  const dailyH = playerDailyHcp[id] || 0;
                  const gross = state.scores?.[round.id]?.[id]?.[i] || 0;
                  return { pts: sPts(gross, h.par, hStrokes(dailyH,h)), isB };
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
  const [showRoundKickoff, setShowRoundKickoff] = useState(false);

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

  const ntpH=getNtpHole(round.id, round.courseId),ldH=getLdHole(round.courseId);
  const ntpKey=`${roundId}_ntp`,ldKey=`${roundId}_ld`;
  const myChulligans=getChulliganRecord(state,roundId,playerId);

  let tPts=0,tGross=0;
  course.holes.forEach((h,i)=>{
    const v=scores[i]||0;
    tPts+=sPts(v,h.par,hStrokes(dH,h));
    tGross+=grossForHole(v,h.par);
  });
  const filled = scores.filter(s=>holeFilled(s)).length;

  useEffect(() => {
    if (!isMine) return;
    const seen = JSON.parse(localStorage.getItem(ROUND_KICKOFF_SEEN_KEY) || "{}");
    const roundPlayerKey = `${roundId}:${playerId}`;
    if (filled > 0 || seen[roundPlayerKey]) return;
    setShowRoundKickoff(true);
    localStorage.setItem(ROUND_KICKOFF_SEEN_KEY, JSON.stringify({ ...seen, [roundPlayerKey]: true }));
  }, [filled, isMine, playerId, roundId]);

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
      const prevVal = s.scores[roundId][pid][holeIdx] || 0;
      s.scores[roundId][pid][holeIdx] = val;
      maybePushScoreSledge(s, { roundId, playerId: pid, holeIdx, prevVal, nextVal: val });
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
      else if (current == null) {
        s.chulligans[roundId][pid][nine] = holeIdx;
        maybePushChulliganSledge(s, { roundId, playerId: pid, holeIdx });
      }
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

      {/* First-time round kickoff popup */}
      {showRoundKickoff && (
        <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.58)",zIndex:240,display:"flex",alignItems:"center",justifyContent:"center",padding:18}} onClick={()=>setShowRoundKickoff(false)}>
          <div style={{background:"#fff",borderRadius:16,padding:"18px 16px",maxWidth:420,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:10}}>
              <div>
                <div style={{fontSize:20,fontWeight:800,color:"#1e293b"}}>Good luck, {player?.short || "Legend"}! ⛳</div>
                <div style={{fontSize:12,color:"#64748b",marginTop:2}}>{round.courseName} · Round {round.num}</div>
              </div>
              <button onClick={()=>setShowRoundKickoff(false)} style={{width:30,height:30,borderRadius:15,border:"1px solid #e2e8f0",background:"#f8fafc",cursor:"pointer",color:"#64748b",fontSize:16}}>×</button>
            </div>

            <div style={{fontSize:13,color:"#334155",lineHeight:1.6,background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:10,padding:"10px 12px",marginBottom:10}}>
              <strong>Round Predictions:</strong> {getPlayerRoundPrediction(state, playerId, roundId)}
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
              <div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:10,padding:"10px"}}>
                <div style={{fontSize:11,fontWeight:700,color:"#1d4ed8",marginBottom:2}}>NTP Hole</div>
                <div style={{fontSize:16,fontWeight:800,color:"#1e3a8a"}}>Hole {ntpH}</div>
              </div>
              <div style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:10,padding:"10px"}}>
                <div style={{fontSize:11,fontWeight:700,color:"#c2410c",marginBottom:2}}>LD Hole</div>
                <div style={{fontSize:16,fontWeight:800,color:"#9a3412"}}>Hole {ldH}</div>
              </div>
            </div>

            <div style={{fontSize:11,color:"#7c2d12",background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:10,padding:"9px 10px",marginBottom:10}}>🏁 If you win NTP or LD, remember to <strong>claim it in the app</strong> during the round so it gets counted.</div>

            <div style={{fontSize:12,color:"#475569",marginBottom:14}}>📝 Don’t forget to <strong>submit your score after hole 18</strong> so it counts on the leaderboard.</div>
            <button onClick={()=>setShowRoundKickoff(false)} style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"none",background:"#2d6a4f",color:"#fff",fontWeight:700,cursor:"pointer"}}>Let’s Play</button>
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
                <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
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
                  <div style={{width:60,textAlign:"right",flexShrink:0,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                    {isPU?(<div><div style={{fontSize:18,fontWeight:700,color:"#94a3b8",fontFamily:"'JetBrains Mono',monospace"}}>0pts</div><div style={{fontSize:10,color:"#94a3b8"}}>Pickup</div></div>)
                    :val>0?(<div><div style={{fontSize:22,fontWeight:700,color:sColor(pts),fontFamily:"'JetBrains Mono',monospace"}}>{pts}pts</div><div style={{fontSize:10,fontWeight:600,color:sColor(pts)}}>{sLabel(pts)}</div></div>)
                    :<div style={{color:"#d1d5db"}}>—</div>}
                    {(()=>{const cState=chulliganButtonState(playerId,i);return (
                      <button onClick={()=>canEdit && toggleChulligan(playerId,i)} disabled={!canEdit || cState.locked}
                        style={{padding:"4px 7px",borderRadius:6,border:`1px solid ${cState.active?"#d97706":"#d1d5db"}`,background:cState.active?"#fffbeb":"#fff",fontSize:12,fontWeight:700,color:(!canEdit&& !cState.active)?"#cbd5e1":cState.locked?"#cbd5e1":cState.active?"#d97706":"#94a3b8",cursor:(!canEdit||cState.locked)?"not-allowed":"pointer",opacity:(!canEdit||cState.locked)?0.7:1}}>
                        {cState.active?"✓🍺":"🍺"}
                      </button>
                    );})()}
                  </div>
                  {(isNtp||isLd)&&canEdit&&(
                    <button onClick={()=>{upd(s=>{
                      if(isNtp){
                        if(!s.ntpWinners)s.ntpWinners={};
                        const next = s.ntpWinners[ntpKey]===playerId?null:playerId;
                        s.ntpWinners[ntpKey]=next;
                        if(next===playerId) maybePushCompClaimSledge(s, { roundId, playerId, type:"ntp" });
                      }else{
                        if(!s.ldWinners)s.ldWinners={};
                        const next = s.ldWinners[ldKey]===playerId?null:playerId;
                        s.ldWinners[ldKey]=next;
                        if(next===playerId) maybePushCompClaimSledge(s, { roundId, playerId, type:"ld" });
                      }
                    });}}
                      style={{padding:"4px 8px",borderRadius:6,border:`1px solid ${isNtp?(isNtpW?"#16a34a":"#d1d5db"):(isLdW?"#d97706":"#d1d5db")}`,background:isNtp?(isNtpW?"#f0fdf4":"#fff"):(isLdW?"#fffbeb":"#fff"),fontSize:9,fontWeight:600,color:isNtp?(isNtpW?"#16a34a":"#94a3b8"):(isLdW?"#d97706":"#94a3b8"),cursor:"pointer",whiteSpace:"nowrap",marginLeft:"auto"}}>
                      {isNtp?(isNtpW?"✓ NTP":"Claim NTP ⛳"):(isLdW?"✓ LD":"Claim LD 💣")}
                    </button>
                  )}
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
                    <div style={{minWidth:56,textAlign:"right",display:"flex",flexDirection:"column",alignItems:"flex-end",gap:5}}>
                      {pIsPU?(<div style={{fontSize:11,color:"#94a3b8"}}>0pts</div>)
                      :pVal>0?(<div><div style={{fontSize:14,fontWeight:600,color:sColor(pPts),fontFamily:"'JetBrains Mono',monospace"}}>{pPts}pts</div><div style={{fontSize:8,color:sColor(pPts)}}>{sLabel(pPts)}</div></div>)
                      :<div style={{color:"#d1d5db",fontSize:11}}>—</div>}
                      {(()=>{const cState=chulliganButtonState(partnerId,i); const canEditPartner=(isAdmin || (roundScoringLive && isMine)) && !isSubmitted(state, roundId, partnerId); return (
                        <button onClick={()=>canEditPartner && toggleChulligan(partnerId,i)} disabled={!canEditPartner || cState.locked}
                          style={{minWidth:36,padding:"4px 6px",borderRadius:6,border:`1px solid ${cState.active?"#d97706":"#d1d5db"}`,background:cState.active?"#fffbeb":"#fff",fontSize:11,color:(!canEditPartner && !cState.active)?"#cbd5e1":cState.locked?"#cbd5e1":cState.active?"#d97706":"#94a3b8",cursor:(!canEditPartner||cState.locked)?"not-allowed":"pointer",opacity:(!canEditPartner||cState.locked)?0.7:1}}>
                          {cState.active?"✓🍺":"🍺"}
                        </button>
                      );})()}
                    </div>

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
        const hn=catId==="ntp"?getNtpHole(round.id, round.courseId):getLdHole(round.courseId);
        const key=`${round.id}_${catId}`;
        const wId=catId==="ntp"?state.ntpWinners?.[key]:state.ldWinners?.[key];
        const w=wId?getP(wId):null;
        return(<div key={round.id} style={{...S.card,borderLeft:`3px solid ${w?"#16a34a":"#e2e8f0"}`}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:13,fontWeight:700,color:"#1e293b"}}>Round {round.num} — Hole {hn}</div><div style={{fontSize:11,color:"#94a3b8"}}>{round.courseName}</div></div><div style={{display:"flex",alignItems:"center",gap:8}}>{w && <PlayerAvatar id={w.id} size={LEADER_PHOTO_SIZE} live={live} />}<div style={{fontSize:14,fontWeight:700,color:w?"#1e293b":"#d1d5db"}}>{w?.name||"TBD"}</div></div></div></div>);
      })}
    </div>);
  }
  let rankings=[];
  if(catId==="spinners"){
    const revealedRounds = ROUNDS.filter(r => isRoundRevealed(state, r.id, live, isAdmin));
    rankings=PLAYERS.map(p=>{
      let t=0,holes=0;
      revealedRounds.forEach(r=>{
        const c=getCourse(r.courseId);const sc=state.scores?.[r.id]?.[p.id]||[];
        t+=pStab(sc,c,courseHcp(state.handicaps?.[p.id],c,getTeeKey(state,c.id)));
        holes+=sc.filter(s=>holeFilled(s)).length;
      });
      return{...p,score:t,holes,totalHoles:revealedRounds.length*18};
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
        { time: "After golf", text: "Check-in at AirBnB — 406 Dundas St, St Andrews Beach" },
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
          <div>🏠 <strong>Thu–Fri:</strong> AirBnB — 406 Dundas St, St Andrews Beach</div>
          <div>🏨 <strong>Sat night:</strong> On-site rooms at Peninsula Kingswood</div>
          <div>👔 <strong>PK Dress Code:</strong> They're stricter on dress code here. Golf attire or collared shirts/chinos etc.</div>
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
      {summaries.length===0 && <div style={{...S.card,fontSize:13,color:"#64748b"}}>No daily summary released yet. Admin can draft and launch one when a round is ready.</div>}
      {summaries.map(s => (
        <div key={s.roundId} style={{...S.card,borderLeft:"3px solid #2563eb",background:"#f8fbff"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:6}}>
            <div style={{fontSize:15,fontWeight:700,color:"#0f172a"}}>{s.title}</div>
            <div style={{fontSize:10,color:"#64748b",textTransform:"uppercase",fontWeight:700}}>{s.source === "admin" ? "Admin" : "Manual"}</div>
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
  const [summaryStatus,setSummaryStatus]=useState({});
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
          <div style={{fontSize:14,fontWeight:700,color:"#1e3a8a",marginBottom:8}}>📝 Round Banter Summary Launch</div>
          <div style={{fontSize:11,color:"#1e40af",marginBottom:10}}>Draft the round banter summary yourself, copy the full round scoresheet to use in an external LLM if you want, then launch the finished summary to players.</div>
          {ROUNDS.map(round => {
            const done = isRoundFullySubmitted(state, round.id);
            const released = !!state.dailySummaries?.[round.id];
            const draft = state.dailySummaryDrafts?.[round.id] || "";
            const status = summaryStatus[round.id] || "";
            const exportText = formatRoundSummaryExport(state, round.id);
            return (
              <div key={`summary_${round.id}`} style={{marginBottom:12,paddingBottom:12,borderBottom:"1px dashed #bfdbfe"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:8}}>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:"#1e293b"}}>Round {round.num} · {round.courseName}</div>
                    <div style={{fontSize:10,color:done?"#15803d":"#b45309"}}>{done ? "All scores submitted" : "Scores still live — you can still draft and copy the scoresheet now."}</div>
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"flex-end"}}>
                    <button
                      onClick={async ()=>{
                        const ok = await copyText(exportText);
                        setSummaryStatus(prev => ({ ...prev, [round.id]: ok ? "Scoresheet copied." : "Copy failed on this device." }));
                      }}
                      style={{padding:"7px 12px",borderRadius:8,border:"1px solid #93c5fd",background:"#fff",color:"#1d4ed8",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                      Copy Scoresheet
                    </button>
                    <button
                      disabled={!draft.trim()}
                      onClick={()=>{
                        const summary = buildManualRoundSummary(state, round.id, draft);
                        if (!summary?.content) {
                          setSummaryStatus(prev => ({ ...prev, [round.id]: "Add a summary before launching." }));
                          return;
                        }
                        upd(s => {
                          if (!s.dailySummaries) s.dailySummaries = {};
                          if (!s.summaryReads) s.summaryReads = {};
                          s.dailySummaries[round.id] = summary;
                          PLAYERS.forEach(p => {
                            if (!s.summaryReads[p.id]) s.summaryReads[p.id] = {};
                            s.summaryReads[p.id][round.id] = false;
                          });
                        });
                        setSummaryStatus(prev => ({ ...prev, [round.id]: released ? "Summary re-launched." : "Summary launched." }));
                      }}
                      style={{padding:"7px 12px",borderRadius:8,border:"none",background:released?"#0f766e":"#2563eb",color:"#fff",fontSize:12,fontWeight:700,cursor:!draft.trim()?"not-allowed":"pointer",opacity:!draft.trim()?0.45:1}}>
                      {released ? "Re-launch Summary" : "Launch Summary"}
                    </button>
                  </div>
                </div>
                <textarea
                  value={draft}
                  onChange={e=>upd(s=>{if(!s.dailySummaryDrafts)s.dailySummaryDrafts={}; s.dailySummaryDrafts[round.id]=e.target.value;})}
                  placeholder={`Draft Round ${round.num} banter summary here. Paste in what your external LLM gives you, or write it manually.`}
                  style={{width:"100%",minHeight:132,padding:"10px 12px",borderRadius:10,border:"1px solid #93c5fd",fontSize:13,lineHeight:1.55,color:"#1e293b",boxSizing:"border-box",resize:"vertical",background:"#fff"}}
                />
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,marginTop:8,flexWrap:"wrap"}}>
                  <div style={{fontSize:10,color:"#475569"}}>{draft.trim() ? `${draft.trim().length} chars drafted` : "No draft yet."}</div>
                  <div style={{fontSize:10,color:status.includes("failed") ? "#b91c1c" : "#1d4ed8"}}>{status || "Use Copy Scoresheet to grab the round data for your external prompt."}</div>
                </div>
              </div>
            );
          })}
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
