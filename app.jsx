const { useState, useEffect, useCallback, useRef } = React;
const supabaseClientFactory = window.supabase?.createClient || null;

const runtimeConfig = window.__SPINNERS_CONFIG || {};
const DEFAULT_REMOTE_CONFIG = {
  supabaseUrl: "https://wgcrujpmqftelxtutgjr.supabase.co",
  supabaseKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndnY3J1anBtcWZ0ZWx4dHV0Z2pyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyODUxMDgsImV4cCI6MjA4ODg2MTEwOH0.65Z6in9zU0Fy4LtjuWPyTvrNO-2aHhgJZfjga9yrI5Q",
};
const INTERNAL_TEAM_KEYS = { yellow: "blue", red: "grey" };
const EXTERNAL_TEAM_KEYS = { blue: "yellow", grey: "red" };

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

function resolveConfigValue({
  runtimeKeys = [],
  localStorageKeys = [],
  queryKeys = [],
  defaultValue = "",
}) {
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

  const runtimeValue = runtimeKeys
    .map((key) => runtimeConfig?.[key])
    .find(Boolean);
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

const SUPABASE_URL = resolveConfigValue({
  runtimeKeys: ["supabaseUrl"],
  localStorageKeys: ["spinners-supabase-url"],
  queryKeys: ["supabaseUrl"],
  defaultValue: DEFAULT_REMOTE_CONFIG.supabaseUrl,
});
const SUPABASE_KEY = resolveConfigValue({
  runtimeKeys: ["supabaseKey"],
  localStorageKeys: ["spinners-supabase-key"],
  queryKeys: ["supabaseKey"],
  defaultValue: DEFAULT_REMOTE_CONFIG.supabaseKey,
});
const DB_ROW_ID =
  resolveConfigValue({
    runtimeKeys: ["dbRowId"],
    localStorageKeys: ["spinners-db-row-id"],
    queryKeys: ["dbRowId"],
  }) || "spinners-cup-2026";
const STATE_CACHE_KEY = `${DB_ROW_ID}-state-cache`;
const DEVICE_ID_KEY = `${DB_ROW_ID}-device-id`;
const SLEDGE_READS_STORAGE_KEY = `${DB_ROW_ID}-sledge-reads`;

const supabaseHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
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
    return normalizeState(
      JSON.parse(window.localStorage.getItem(STATE_CACHE_KEY) || "null"),
    );
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

function createDeviceId() {
  try {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  } catch {}
  return `device_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

function getDeviceId() {
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const next = createDeviceId();
    window.localStorage.setItem(DEVICE_ID_KEY, next);
    return next;
  } catch {
    return "device_fallback";
  }
}

function getSledgeReadsStorageKey(viewerId) {
  return `${SLEDGE_READS_STORAGE_KEY}:${viewerId}:${getDeviceId()}`;
}

function readLocalSledgeReads(viewerId) {
  if (!viewerId) return {};
  try {
    return JSON.parse(
      window.localStorage.getItem(getSledgeReadsStorageKey(viewerId)) || "{}",
    );
  } catch {
    return {};
  }
}

function markLocalSledgeReads(viewerId, itemIds) {
  if (!viewerId || !itemIds?.length) return null;
  const next = { ...readLocalSledgeReads(viewerId) };
  let changed = false;
  itemIds.forEach((id) => {
    if (!id || next[id]) return;
    next[id] = true;
    changed = true;
  });
  if (!changed) return null;
  try {
    window.localStorage.setItem(
      getSledgeReadsStorageKey(viewerId),
      JSON.stringify(next),
    );
  } catch {}
  return next;
}

function clearResettableLocalState() {
  try {
    const keysToRemove = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (
        key === ROUND_KICKOFF_SEEN_KEY ||
        key === STATE_CACHE_KEY ||
        key.startsWith(`${SLEDGE_READS_STORAGE_KEY}:`)
      ) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
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
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Cache-Control": "no-cache",
      },
    },
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
  const remoteState = toRemoteState(nextState);
  const rowPayload = { id: DB_ROW_ID, data: remoteState, updated_at: now };
  const updatePayload = { data: remoteState, updated_at: now };
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
        Prefer: "return=representation",
      },
      body: JSON.stringify(updatePayload),
    },
  );

  if (updateRes?.ok) {
    const rows = await updateRes.json().catch(() => []);
    if (Array.isArray(rows) && rows.length > 0) {
      return { ok: true };
    }
  } else {
    const updateError = await readSupabaseError(updateRes);
    return {
      ok: false,
      error:
        updateError ||
        `Supabase update failed (${updateRes?.status || "unknown"})`,
    };
  }

  const insertRes = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/app_state`,
    {
      method: "POST",
      headers: {
        ...supabaseHeaders,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(rowPayload),
    },
  );

  if (insertRes?.ok) return { ok: true };

  const insertError = await readSupabaseError(insertRes);
  return {
    ok: false,
    error:
      insertError ||
      `Supabase insert failed (${insertRes?.status || "unknown"})`,
  };
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
  angus: "./Angus Scott.PNG",
  nick: "./Nick Tankard.png",
  tom: "./Tom Crawford.png",
  callum: "./Callum Hinwood 2.png",
  jkelly: "./James Kelly (2).PNG",
  jturner: "./James Turner.png",
  chris: "./Jasper Taylor.PNG",
  luke: "./Luke Abi-Hanna.png",
  alex: "./Alex Denning.PNG",
  lach: "./Lach Taylor (2).PNG",
  jason: "./Jason McIlwaine (2).png",
  cam: "./Cam Clark.PNG",
};

// ─── Courses (multi-tee: w=white, b=blue/black) ─────────────
const COURSES = [
  {
    id: "standrews",
    name: "St Andrews Beach",
    short: "St Andrews",
    par: 70,
    teeData: {
      white: { slope: 135, rating: 71.4, label: "White" },
      blue: { slope: 139, rating: 73.6, label: "Blue" },
    },
    holes: [
      { n: 1, par: 5, si: 16, w: 452, b: 497 },
      { n: 2, par: 4, si: 18, w: 262, b: 279 },
      { n: 3, par: 4, si: 2, w: 364, b: 405 },
      { n: 4, par: 3, si: 6, w: 184, b: 197 },
      { n: 5, par: 4, si: 4, w: 358, b: 387 },
      { n: 6, par: 3, si: 12, w: 125, b: 169 },
      { n: 7, par: 4, si: 8, w: 349, b: 377 },
      { n: 8, par: 4, si: 14, w: 332, b: 332 },
      { n: 9, par: 4, si: 10, w: 327, b: 339 },
      { n: 10, par: 4, si: 3, w: 366, b: 384 },
      { n: 11, par: 3, si: 15, w: 147, b: 147 },
      { n: 12, par: 4, si: 7, w: 389, b: 389 },
      { n: 13, par: 4, si: 1, w: 426, b: 457 },
      { n: 14, par: 4, si: 13, w: 276, b: 276 },
      { n: 15, par: 4, si: 11, w: 328, b: 358 },
      { n: 16, par: 3, si: 9, w: 182, b: 197 },
      { n: 17, par: 5, si: 17, w: 430, b: 477 },
      { n: 18, par: 4, si: 5, w: 373, b: 404 },
    ],
  },
  {
    id: "pk_south",
    name: "PK South Course",
    short: "PK South",
    par: 72,
    teeData: {
      white: { slope: 134, rating: 72.0, label: "White" },
      blue: { slope: 138, rating: 74.0, label: "Blue/Black" },
    },
    holes: [
      { n: 1, par: 4, si: 7, si2: 25, w: 325, b: 365 },
      { n: 2, par: 4, si: 6, si2: 24, w: 355, b: 380 },
      { n: 3, par: 3, si: 8, si2: 30, w: 170, b: 195 },
      { n: 4, par: 4, si: 2, si2: 20, w: 390, b: 400 },
      { n: 5, par: 5, si: 13, si2: 27, w: 445, b: 455 },
      { n: 6, par: 4, si: 12, si2: 29, w: 345, b: 385 },
      { n: 7, par: 4, si: 17, si2: 32, w: 285, b: 295 },
      { n: 8, par: 5, si: 1, si2: 19, w: 495, b: 515 },
      { n: 9, par: 3, si: 10, si2: 34, w: 150, b: 180 },
      { n: 10, par: 4, si: 4, si2: 22, w: 345, b: 360 },
      { n: 11, par: 4, si: 11, si2: 28, w: 315, b: 335 },
      { n: 12, par: 4, si: 14, si2: 31, w: 285, b: 295 },
      { n: 13, par: 4, si: 5, si2: 23, w: 375, b: 405 },
      { n: 14, par: 3, si: 15, si2: 35, w: 135, b: 145 },
      { n: 15, par: 5, si: 18, si2: 33, w: 475, b: 485 },
      { n: 16, par: 5, si: 9, si2: 26, w: 470, b: 505 },
      { n: 17, par: 3, si: 16, si2: 36, w: 110, b: 120 },
      { n: 18, par: 4, si: 3, si2: 21, w: 385, b: 405 },
    ],
  },
  {
    id: "pk_north",
    name: "PK North Course",
    short: "PK North",
    par: 72,
    teeData: {
      white: { slope: 138, rating: 73.0, label: "White" },
      blue: { slope: 138, rating: 74.0, label: "Blue/Black" },
    },
    holes: [
      { n: 1, par: 4, si: 6, si2: 24, w: 315, b: 335 },
      { n: 2, par: 3, si: 3, si2: 26, w: 150, b: 160 },
      { n: 3, par: 5, si: 15, si2: 29, w: 455, b: 475 },
      { n: 4, par: 4, si: 10, si2: 28, w: 350, b: 370 },
      { n: 5, par: 5, si: 18, si2: 34, w: 455, b: 475 },
      { n: 6, par: 4, si: 7, si2: 25, w: 295, b: 310 },
      { n: 7, par: 3, si: 14, si2: 33, w: 150, b: 155 },
      { n: 8, par: 4, si: 11, si2: 30, w: 320, b: 340 },
      { n: 9, par: 4, si: 4, si2: 21, w: 360, b: 375 },
      { n: 10, par: 4, si: 1, si2: 20, w: 400, b: 415 },
      { n: 11, par: 4, si: 12, si2: 31, w: 335, b: 355 },
      { n: 12, par: 4, si: 2, si2: 19, w: 360, b: 365 },
      { n: 13, par: 4, si: 9, si2: 32, w: 285, b: 310 },
      { n: 14, par: 3, si: 16, si2: 35, w: 135, b: 145 },
      { n: 15, par: 5, si: 13, si2: 27, w: 490, b: 520 },
      { n: 16, par: 3, si: 17, si2: 36, w: 150, b: 165 },
      { n: 17, par: 5, si: 8, si2: 22, w: 485, b: 530 },
      { n: 18, par: 4, si: 5, si2: 23, w: 370, b: 390 },
    ],
  },
  {
    id: "dunes",
    name: "The Dunes",
    short: "Dunes",
    par: 72,
    teeData: {
      blue: { slope: 141, rating: 74.1, label: "Blue" },
      white: { slope: 135, rating: 71.2, label: "White" },
      black: { slope: 148, rating: 75.2, label: "Black" },
    },
    holes: [
      { n: 1, par: 4, si: 1, w: 368, b: 409 },
      { n: 2, par: 4, si: 5, w: 319, b: 365 },
      { n: 3, par: 3, si: 18, w: 124, b: 135 },
      { n: 4, par: 4, si: 15, w: 285, b: 310 },
      { n: 5, par: 5, si: 10, w: 442, b: 473 },
      { n: 6, par: 3, si: 17, w: 180, b: 193 },
      { n: 7, par: 5, si: 14, w: 443, b: 477 },
      { n: 8, par: 4, si: 3, w: 378, b: 392 },
      { n: 9, par: 4, si: 9, w: 337, b: 376 },
      { n: 10, par: 4, si: 12, w: 301, b: 310 },
      { n: 11, par: 4, si: 16, w: 291, b: 340 },
      { n: 12, par: 5, si: 2, w: 430, b: 502 },
      { n: 13, par: 3, si: 7, w: 144, b: 160 },
      { n: 14, par: 4, si: 8, w: 315, b: 354 },
      { n: 15, par: 4, si: 6, w: 370, b: 392 },
      { n: 16, par: 5, si: 11, w: 458, b: 505 },
      { n: 17, par: 3, si: 4, w: 146, b: 179 },
      { n: 18, par: 4, si: 13, w: 346, b: 370 },
    ],
  },
];

const PLAYERS = [
  { id: "angus", name: "Angus Scott", short: "Angus", team: "grey" },
  { id: "nick", name: "Nick Tankard", short: "Nick", team: "blue" },
  { id: "tom", name: "Tom Crawford", short: "Tom", team: "blue" },
  { id: "callum", name: "Callum Hinwood", short: "Callum", team: "blue" },
  { id: "jkelly", name: "James Kelly", short: "J. Kelly", team: "grey" },
  { id: "jturner", name: "James Turner", short: "J. Turner", team: "blue" },
  { id: "chris", name: "Jasper Taylor", short: "Jasper", team: "grey" },
  { id: "luke", name: "Luke Abi-Hanna", short: "Luke", team: "grey" },
  { id: "alex", name: "Alex Denning", short: "Alex", team: "grey" },
  { id: "lach", name: "Lach Taylor", short: "Lach", team: "blue" },
  { id: "jason", name: "Jason McIlwaine", short: "Jason", team: "grey" },
  { id: "cam", name: "Cam Clark", short: "Cam", team: "blue" },
];

const PLAYER_BIOS = {
  angus:
    "Angus arrives with the most violent baseball-bat driver swing the Mornington Peninsula has ever seen, despite barely touching a club thanks to life wrangling young kids. Don’t expect many practice swings, but do expect plenty of stories between shots. In a team environment he’s the bloke keeping morale high and the chat flowing, even if the swing occasionally needs a reminder which direction the fairway goes.",
  tom: "Tom swings the club with the smooth confidence of a man used to making big calls in private equity and expecting them to work out. Armed with a swing that looks far too easy and a head large enough to store all that confidence, he’s quietly convinced the Spinners Cup is his to lose. In a team format he’ll happily assume leadership duties, whether anyone asked him to or not.",
  cam: "Cam is widely regarded as one of the genuinely nicest blokes on the trip, which makes it even more annoying when he’s also playing good golf. His trademark laugh will likely be heard echoing around the greens of PK all weekend as he quietly goes about trying to defend the Spinners Cup. In a team environment he’s the ultimate glue guy — positive, competitive, and the bloke everyone wants in their group.",
  chris:
    "A last-minute replacement who proves our recruitment bar is officially on the floor, Jasper brings elite energy and a golf game as erratic as a Parramatta Eels season. He’s the only man capable of turning a 300-yard drive into a scenic tour of the long grass, making him a lock for the \"Good Times\" award and a nightmare for his betting partner. Just like his footy team, he’ll show up with plenty of hype only to leave everyone asking, \"Is it next year yet?\"",
  nick: "Nick worships Tiger Woods and approaches the Spinners Cup with the same intensity, which makes last year’s playoff loss sting even more. Working at CBA has perhaps made him a little risk-averse at times — expect plenty of “percentage golf” and cautious lines off the tee while he channels his inner Tiger. In a team setting he’ll bring serious competitive energy, although his teammates may occasionally need to convince him to take the aggressive play.",
  jason:
    "Jason possesses what many experts are already calling the ugliest swing ever brought to the Mornington Peninsula. Somehow the ball still goes forward often enough to keep him in the game, much to the confusion of everyone watching. Despite the chaotic mechanics, his clean-cut physique suggests a man built for sport — unfortunately the golf swing didn’t get the same treatment. In a team format he’ll happily grind away and try to sneak in the occasional surprisingly solid shot.",
  jturner:
    "James Turner launches the ball enormous distances for a man who looks like he should still be shopping in the kids section. As the self-appointed Chief Marketing Officer of the Spinners Cup, he’s responsible for most of the hype and very little of the detail. In a team environment he’ll be excellent for morale, even if his concentration occasionally wanders off with the marketing ideas.",
  callum:
    "Callum owns a slappy swing that could either thrive or be completely destroyed by the notorious Melbourne sandbelt winds. A lawyer by trade, he’s well practiced at arguing his case — particularly when a putt lips out or the scorecard is under review. With his first child on the way, this may be the last weekend of uninterrupted golf for the next 18 years. In a team setting he’ll be desperate to contribute — ideally before the putter starts trembling.",
  lach: "Lach has been putting in serious hours with a golf coach and is determined to let everyone know about it. By day he works in tech sales, which means he’s extremely confident explaining why things should work — even when the results say otherwise. In a team environment he’ll bring energy, optimism, and a very convincing explanation after every slightly wayward shot.",
  jkelly:
    "James carries the emotional scars of a golf trip where he shanked his first tee shot twice in a row, an achievement few golfers can claim. The face of the infamous Air Kelso sponsorship, he’s also widely tipped as the early favourite for the “drunkest on trip” award. In a team setting he’ll either produce a redemption arc for the ages or double down on the chaos.",
  alex: "Alex is the kind of annoyingly talented sportsman who can turn up to almost anything and be good at it within about five minutes. Between working in the furniture industry, spending suspiciously large amounts of time in China, and managing a major renovation, he somehow still manages to flush golf shots like he actually practises. In a team environment he’ll likely play the role of the quietly reliable performer — frustratingly good without appearing to try.",
  luke: "Luke has flown in from Dubai and arrives convinced the Spinners Cup is already his. A former clutch basketball player, he backs himself in big moments and isn’t shy about reminding the group — although some still whisper about the time he accidentally killed a duck on the course, a reputation that has unfairly branded him the tour’s most notorious wildlife assassin. In a team environment he’ll embrace the pressure moments and happily volunteer for the hero shot.",
};

const ROUND_PREDICTION_COPY = {
  angus: {
    r1: "Prediction: opening-day launch mode is active — take on the wider lines at St Andrews, feast on the par 5s, and let the driver set the tone.",
    r2: "Prediction: moving day should reward your fearless swings at PK South — pick the smart moments to send it, especially when the hole finally widens.",
    r3: "Prediction: final round freedom golf suits you at PK North — trust the bomb when it’s on and keep the short-game tidy enough to cash in late.",
  },
  nick: {
    r1: "Prediction: a Tiger-approved opener is brewing — fairways first at St Andrews, center greens second, then quietly stack points before lunch chatter starts.",
    r2: "Prediction: moving day is perfect for your percentage golf on PK South — stay disciplined through the awkward approaches and pounce when the green light appears.",
    r3: "Prediction: final round patience could be lethal on PK North — accept the long targets, plot your way around, then let everyone else blink first.",
  },
  tom: {
    r1: "Prediction: opening round boardroom energy — make decisive swings on the exposed tee shots at St Andrews and start monetising birdie looks early.",
    r2: "Prediction: moving day should suit your conviction at PK South — commit to the number, take the smart aggressive line, and let the card compound.",
    r3: "Prediction: final round has closer energy all over it — on PK North, keep the strategy clean for 14 holes and go cash-out mode on the way home.",
  },
  callum: {
    r1: "Prediction: opening arguments are simple — respect the wind at St Andrews, play to the fat side, and let the putter deliver the verdict.",
    r2: "Prediction: moving day could become your best brief yet at PK South if you stay disciplined off the tee until one brave swing changes the evidence.",
    r3: "Prediction: final round is built for courtroom composure — PK North rewards patience, smart targets, and selective heroics only when invited.",
  },
  jkelly: {
    r1: "Prediction: first-round chaos will absolutely knock, but St Andrews offers enough room for a genuine redemption arc if the opening tee ball behaves.",
    r2: "Prediction: moving day might get gloriously weird at PK South — survive the awkward lies, embrace the momentum swings, and suddenly the card could catch fire.",
    r3: "Prediction: final round feels made for Kelso theatre at PK North — just keep the disasters minor long enough for the hero stretch to arrive.",
  },
  jturner: {
    r1: "Prediction: opening day needs a soft launch — market the fireworks later, start with a fairway-first campaign at St Andrews, then scale up once settled.",
    r2: "Prediction: moving day is when the brand can really grow — PK South should reward one hot middle stretch if you stop overswinging the tight holes.",
    r3: "Prediction: final round calls for a polished finish — PK North will hand you enough drama already, so deliver substance before the spin on the back nine.",
  },
  chris: {
    r1: "Prediction: late-callup energy should travel nicely — start composed at St Andrews, lean on tidy irons, and settle into the weekend quickly.",
    r2: "Prediction: moving day could be a big one at PK South if you keep the misses small and stay patient through the awkward middle stretch.",
    r3: "Prediction: final round suits your no-fuss style — PK North rewards committed targets, sensible aggression, and calm execution under pressure.",
  },
  luke: {
    r1: "Prediction: opening day has big-game guard energy — attack the scoring holes at St Andrews, own the moment, and make the group feel your pace early.",
    r2: "Prediction: moving day is made for your clutch gene — PK South will reward one assertive line when the field starts steering it.",
    r3: "Prediction: final round theatre suits you perfectly — PK North asks for nerve on the closing stretch, so embrace the pressure and keep hunting swings that matter.",
  },
  alex: {
    r1: "Prediction: the annoyingly tidy opener is live — St Andrews should suit your crisp contact, low fuss decision-making, and ability to make hard golf look unfairly calm.",
    r2: "Prediction: moving day could quietly become an Alex masterclass at PK South, with clean ball-striking doing the damage before anyone realises what’s happened.",
    r3: "Prediction: final round points haul feels very real — PK North rewards boring elite golf, so keep doing that while others start forcing a miracle.",
  },
  lach: {
    r1: "Prediction: opening day is the perfect time to let the coach-hours do the talking — shape it through the St Andrews breeze and save the swing lecture for post-round drinks.",
    r2: "Prediction: moving day could reward your prep in a big way at PK South — trust the stock shot, manage the angles, and resist narrating every technical thought.",
    r3: "Prediction: final round is about conviction over commentary — PK North wants committed targets and one shape at a time, not an on-course seminar.",
  },
  jason: {
    r1: "Prediction: ugly-swing optics aside, the St Andrews opener has classic Jason sneak-attack potential if the ball keeps obeying your strange little system.",
    r2: "Prediction: moving day could get scrappy in exactly your language — PK South offers enough awkward golf for you to keep nicking points and annoying better swingers.",
    r3: "Prediction: final round only needs one thing from you — keep the move weird, survive PK North’s tougher stretches, and start stealing holes late.",
  },
  cam: {
    r1: "Prediction: opening day should suit your smooth rhythm — St Andrews rewards steady ball-striking, low drama, and the sort of card that sneaks into contention quietly.",
    r2: "Prediction: moving day has defender energy written all over it — PK South should reward your patience if the putter warms up before the banter does.",
    r3: "Prediction: final round could become a proper title-defence grind — PK North asks for composure, tidy misses, and a lot of calm when others get jumpy.",
  },
};

function getPlayerRoundPrediction(state, playerId, roundId) {
  const player = getP(playerId);
  const short = player?.short || "Legend";
  const roundIndex = ROUNDS.findIndex((r) => r.id === roundId);
  let priorForm =
    "Settle in early, avoid doubles, and this round can build quickly.";
  if (roundIndex > 0) {
    const prevRound = ROUNDS[roundIndex - 1];
    const prevScores = state.scores?.[prevRound.id]?.[playerId] || [];
    const filled = prevScores.filter((s) => holeFilled(s)).length;
    if (filled > 0) {
      const prevCourse = getCourse(prevRound.courseId);
      const dH = courseHcp(
        state.handicaps?.[playerId],
        prevCourse,
        getTeeKey(state, prevCourse.id),
      );
      const prevPts = pStab(prevScores, prevCourse, dH);
      if (filled === 18) {
        if (prevPts >= 36)
          priorForm = `You’re coming in hot off ${prevPts} pts yesterday — stay aggressive when the genuine scoring window opens.`;
        else if (prevPts >= 30)
          priorForm = `Solid base with ${prevPts} pts yesterday. Clean up a couple of misses and you’re right in the mix again.`;
        else
          priorForm = `${prevPts} pts yesterday means today is a bounce-back script — simplify targets, bank the easy ones, and rebuild momentum.`;
      } else {
        priorForm = `Previous round showed flashes over ${filled} holes. Start sharply today and you can turn that into a full-card scorer.`;
      }
    }
  }

  const roundSpecific =
    ROUND_PREDICTION_COPY[playerId]?.[roundId] ||
    "Prediction: steady tempo and smart misses should travel well today.";
  return `${short}, ${roundSpecific} ${priorForm}`;
}
const PLAYER_BIO_IMAGES = {
  angus: "./Angus Scott.PNG",
  tom: "./Tom Crawford.png",
  cam: "./Cam Clark.PNG",
  chris: "./Jasper Taylor.PNG",
  nick: "./Nick Tankard.png",
  jason: "./Jason McIlwaine (2).png",
  jturner: "./James Turner.png",
  callum: "./Callum Hinwood 2.png",
  alex: "./Alex Denning.PNG",
  lach: "./Lach Taylor (2).PNG",
  jkelly: "./James Kelly (2).PNG",
  luke: "./Luke Abi-Hanna.png",
};

const NTP_HOLE_BY_ROUND = {
  r0: 13,
  r2: 17,
};

// NTP: par 3, not in first 5 holes of front or back nine (holes 1-5 or 10-14), with round overrides
function getNtpHole(roundId, courseId) {
  const roundOverride = NTP_HOLE_BY_ROUND[roundId];
  if (roundOverride) return roundOverride;
  const c = getCourse(courseId);
  const ok = c.holes.filter(
    (h) => h.par === 3 && h.n > 5 && !(h.n >= 10 && h.n <= 14),
  );
  return ok.length > 0
    ? ok[0].n
    : c.holes.filter((h) => h.par === 3).pop()?.n || 9;
}
// LD: par 5, not in first 5 holes of front or back nine
function getLdHole(courseId) {
  const c = getCourse(courseId);
  const ok = c.holes.filter(
    (h) => h.par === 5 && h.n > 5 && !(h.n >= 10 && h.n <= 14),
  );
  return ok.length > 0
    ? ok[0].n
    : c.holes.filter((h) => h.par === 5).pop()?.n || 17;
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
    "An exacting opening par 4 where the creek shapes both shots. Prioritise a tee ball that finds fairway first, then play to the safe side of the green rather than flirting with water.",
    "A dogleg par 4 that rewards position over power. A controlled tee shot to the right side opens the best angle and leaves a simpler approach over the front mound.",
    "A long par 3 that demands full commitment to the number. Favor a flight that lands pin-high and use the ground softly rather than forcing a hero shot.",
    "A strong par 4 where leaving the right yardage matters more than chasing extra metres. Set up a comfortable approach and stay aware of the green’s front-right contour.",
    "A short par 5 defined by the diagonal creek. Commit to either taking on the narrow driving line for a chance in two or laying back and treating it as a clear three-shot hole.",
    "A deceptively strategic par 4 because the green asks for the right trajectory. Front flags suit height and spin, while back flags reward a lower shot feeding through the valley.",
    "A short par 4 built on tee-shot choice. Lay back for position near the corner or take the aggressive line only if you want to chase a wedge and a birdie chance.",
    "The South’s toughest fairway to find, with the hogsback rejecting sloppy drives. The percentage play is short-right of the rise, leaving an uphill approach you can control.",
    "A testing par 3 where trajectory and start line do the work. Center-green is a very good result here, especially if the wind is moving.",
    "This par 4 plays longer than the card because of the climb. Take enough club into the approach and plan for a soft landing into the tilted green.",
    "A short par 4 where hugging the rise-side bunker from the tee leaves the easiest pitch. Missing left brings awkward sand and a green that runs away.",
    "A strategic short par 4 where pin position should dictate your line. Play for the correct angle first, then attack with the approach only after the tee shot earns it.",
    "A sweeping par 4 that rewards shape and commitment. Match the tee shot to the fairway, then work the approach with the green’s contours instead of fighting them.",
    "A dramatic par 3 over the valley to an elevated green. The percentage miss is right, while left pins demand total commitment to carry all the trouble.",
    "A long par 4 where bunker avoidance is only step one. Favour the side that gives you a clearer second and accept that this is a patience hole.",
    "A true three-shot par 5 for nearly everyone. Plot it as a positional hole, keep the ball in play, and trust wedge distance more than brute force.",
    "A short par 3 that punishes indecision, especially in the wind. Commit to the yardage and take the middle when the pin is tucked.",
    "A demanding finishing par 4 played downhill from the tee. Find position first, then expect a long-club approach that rewards control more than aggression.",
  ],
  pk_north: [
    "A solid opening par 4 with enough room to swing but bunkers squeezing the ideal landing area. Decide early whether you want the short approach from driver or the safer number from less club.",
    "This par 3 is all about carrying the front edge. Take enough club to finish pin-high and avoid getting dragged back by the false front.",
    "A risk-reward hole where the aggressive line over the left side opens everything up. The safer play keeps the ball in the wider fairway but leaves a more awkward look in.",
    "A positional par 4 that rewards a tee shot threaded between the hazards. From the fairway, the right side gives the best chance to run the ball onto the green.",
    "A reachable par 5 for some, but only after a committed drive through the valley. Everyone else should favour the simpler lay-up route and avoid leaving an awkward uphill pitch.",
    "A drivable uphill par 4 with multiple valid strategies. Choose the line that matches the day’s pin and your appetite for a short but tricky second shot.",
    "A strong par 3 where the sensible target is the wider right portion of the green. Taking on a left pin is optional; simply finding the surface is a win.",
    "A short par 4 that rewards bravery if you flirt with the left-side trouble. The bailout right is fine, but expect a harder pitch if you choose safety.",
    "A long par 4 that starts a stern stretch. Favour the right-side sand line from the tee to open the best angle, then accept that two quality shots are required.",
    "One of the narrowest and toughest driving holes on the course. On approach, think landing area and release rather than firing straight at the flag.",
    "A strong par 4 with hazards squeezing decision-making off the tee. Once in position, a controlled running approach is usually the smartest play.",
    "The hogsback fairway is the entire puzzle here. Lay up short for safety or challenge the crowned section only if you are happy to accept the bigger miss.",
    "A hole where restraint matters. For most players, a long iron or hybrid leaves the best scoring chance before a delicate pitch into a strongly tilted green.",
    "A short par 3 surrounded by sand and heath. Precision beats aggression, so take the fat side and avoid short-siding yourself.",
    "A long par 4 with a largely blind tee shot over the ridge. Commit to the line, then trust that the second shot is more manageable than it first appears.",
    "This par 3 favors a left-to-right shape. Start it just left of center if possible and let the contours help rather than taking on the bunker directly.",
    "The longest hole on the property and a genuine three-shot par 5. Position each shot carefully and make sure the approach does not feed into the hollow short of the green.",
    "A strategic finishing par 4 where bold players can challenge the corner bunker for a wedge in. The safer route still offers a good angle if you place the tee shot properly.",
  ],
};

// ─── PK Room Assignments ─────────────────────────────────────
const PK_ROOMS = [
  { room: "1 (Remote Room)", players: ["Tom Crawford", "Luke Abi-Hanna"] },
  { room: "2", players: ["Jasper Taylor", "Cam Clark"] },
  { room: "3", players: ["Nick Tankard", "James Turner"] },
  { room: "4", players: ["Alex Denning", "Lach Taylor"] },
  { room: "5 (Remote Room)", players: ["Jason McIlwaine", "Callum Hinwood"] },
  { room: "6", players: ["James Kelly", "Angus Scott"] },
];

const ROUNDS = [
  {
    id: "r0",
    num: "Practice",
    day: "Practice Round",
    courseId: "dunes",
    courseName: "The Dunes",
    teeTimes: ["12:33pm", "12:42pm"],
    practiceGroups: [
      ["Tom Crawford", "Luke Abi-Hanna", "James Turner"],
      ["Alex Denning", "Callum Hinwood", "Lach Taylor"],
    ],
    isPractice: true,
    includeInCup: false,
    matches: [],
  },
  {
    id: "r1",
    num: 1,
    day: "Friday 27th March",
    courseId: "standrews",
    courseName: "St Andrews Beach",
    teeTimes: ["11:39am", "11:48am", "11:57am"],
    matches: [
      { id: "m1", blue: ["callum", "jturner"], grey: ["jason", "alex"] },
      { id: "m2", blue: ["nick", "tom"], grey: ["angus", "luke"] },
      { id: "m3", blue: ["cam", "lach"], grey: ["chris", "jkelly"] },
    ],
  },
  {
    id: "r2",
    num: 2,
    day: "Saturday 28th March",
    courseId: "pk_south",
    courseName: "PK South Course",
    teeTimes: ["12:44pm", "12:52pm", "1:00pm"],
    matches: [
      { id: "m4", blue: ["tom", "lach"], grey: ["angus", "alex"] },
      { id: "m5", blue: ["nick", "jturner"], grey: ["jason", "jkelly"] },
      { id: "m6", blue: ["callum", "cam"], grey: ["luke", "chris"] },
    ],
  },
  {
    id: "r3",
    num: 3,
    day: "Sunday 29th March",
    courseId: "pk_north",
    courseName: "PK North Course",
    teeTimes: ["8:27am", "8:35am", "8:43am"],
    matches: [
      { id: "m7", blue: ["nick", "cam"], grey: ["luke", "jason"] },
      { id: "m8", blue: ["jturner", "lach"], grey: ["angus", "jkelly"] },
      { id: "m9", blue: ["tom", "callum"], grey: ["alex", "chris"] },
    ],
  },
];

const PRACTICE_PLAYER_IDS = [
  "tom",
  "alex",
  "luke",
  "jturner",
  "lach",
  "callum",
];
const PRACTICE_TEAMS = [
  { id: "practice-team-1", playerIds: ["tom", "luke", "jturner"] },
  { id: "practice-team-2", playerIds: ["alex", "callum", "lach"] },
];

// ─── Helpers ─────────────────────────────────────────────────
function getP(id) {
  return PLAYERS.find((p) => p.id === id);
}
function TeamPairDisplay({
  ids,
  live,
  color,
  align = "left",
  state,
  roundId,
  showBadges = false,
  fontSize = 12,
}) {
  const showAvatars = live || PLAYER_PHOTOS_VISIBLE;
  const names = live
    ? ids?.length
      ? ids.map((id) => ({
          short: getP(id)?.short || "???",
          badges:
            showBadges && state && roundId
              ? chulliganBadges(getChulliganCount(state, roundId, id))
              : "",
        }))
      : [
          { short: "???", badges: "" },
          { short: "???", badges: "" },
        ]
    : [
        { short: "???", badges: "" },
        { short: "???", badges: "" },
      ];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: align === "right" ? "flex-end" : "flex-start",
        gap: 8,
      }}
    >
      {showAvatars && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginRight: 2,
            opacity: live ? 1 : 0.75,
          }}
        >
          <PlayerAvatar id={ids?.[0]} size={CUP_PHOTO_SIZE} live={live} />
          <div style={{ marginLeft: -10 }}>
            <PlayerAvatar id={ids?.[1]} size={CUP_PHOTO_SIZE} live={live} />
          </div>
        </div>
      )}
      <div
        style={{
          fontSize,
          fontWeight: 600,
          color,
          display: "flex",
          flexDirection: "column",
          alignItems: align === "right" ? "flex-end" : "flex-start",
          lineHeight: 1.15,
          textAlign: align,
        }}
      >
        {names.map((name, idx) => (
          <span
            key={`${name.short}_${idx}`}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: align === "right" ? "flex-end" : "flex-start",
            }}
          >
            <span>{name.short}</span>
            {name.badges && (
              <span style={{ lineHeight: 1, marginTop: 1 }}>{name.badges}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

const HIDDEN_PLAYER_IMAGE_FILTER =
  "grayscale(100%) contrast(1.35) brightness(0.92) blur(6px)";
const HIDDEN_PLAYER_IMAGE_OVERLAY =
  "linear-gradient(180deg, rgba(248,250,252,0.08) 0%, rgba(226,232,240,0.45) 44%, rgba(226,232,240,0.96) 68%, rgba(226,232,240,1) 100%)";
const PLAYER_PHOTOS_VISIBLE = true;

function PlayerAvatar({
  id,
  size = 32,
  live = true,
  border = true,
  priority = "auto",
}) {
  const player = getP(id);
  const src = PLAYER_PHOTOS[id];
  const teamColor = player?.team === "blue" ? "#D4A017" : "#DC2626";
  const avatarLive = live && PLAYER_PHOTOS_VISIBLE;
  const borderColor = avatarLive && border ? teamColor : "#d1d5db";
  const initials = (player?.name || "?")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const loading = priority === "high" ? "eager" : "lazy";
  const [visible, setVisible] = useState(priority === "high");
  const [failed, setFailed] = useState(false);
  const holderRef = useRef(null);

  useEffect(() => {
    if (visible || !src || !holderRef.current) return;
    const connection =
      navigator.connection ||
      navigator.mozConnection ||
      navigator.webkitConnection;
    const lowBandwidth = !!(
      connection?.saveData ||
      ["slow-2g", "2g"].includes(connection?.effectiveType)
    );
    if (lowBandwidth && priority !== "high") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "140px" },
    );
    observer.observe(holderRef.current);
    return () => observer.disconnect();
  }, [priority, src, visible]);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return src ? (
    <div
      ref={holderRef}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        position: "relative",
        overflow: "hidden",
        borderRadius: "50%",
      }}
    >
      {!visible || failed ? (
        <div
          aria-label={player?.name || "Player"}
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            background: "#e2e8f0",
            border: `2px solid ${borderColor}`,
            flexShrink: 0,
            display: "grid",
            placeItems: "center",
            color: "#475569",
            fontSize: Math.max(10, Math.round(size * 0.32)),
            fontWeight: 700,
          }}
        >
          {initials}
        </div>
      ) : (
        <img
          src={src}
          alt={player?.name || "Player"}
          loading={loading}
          fetchPriority={priority}
          decoding="async"
          width={size}
          height={size}
          onError={() => setFailed(true)}
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            border: `2px solid ${borderColor}`,
            objectFit: "cover",
            objectPosition: avatarLive ? "center" : "center 18%",
            transform: avatarLive ? "none" : "scale(1.18)",
            flexShrink: 0,
            filter: avatarLive ? "none" : HIDDEN_PLAYER_IMAGE_FILTER,
          }}
        />
      )}
      {!avatarLive && visible && !failed && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: `2px solid ${borderColor}`,
            background: HIDDEN_PLAYER_IMAGE_OVERLAY,
            display: "grid",
            placeItems: "center",
            boxSizing: "border-box",
            backdropFilter: "blur(1px)",
          }}
        >
          <div
            style={{
              width: Math.round(size * 0.46),
              height: Math.round(size * 0.46),
              borderRadius: "50%",
              background: "rgba(255,255,255,0.86)",
              border: "1px solid rgba(148,163,184,0.6)",
              color: "#475569",
              display: "grid",
              placeItems: "center",
              fontSize: Math.max(9, Math.round(size * 0.18)),
              fontWeight: 800,
              letterSpacing: 0.4,
            }}
          >
            ?
          </div>
        </div>
      )}
    </div>
  ) : (
    <div
      aria-label={player?.name || "Player"}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "#e2e8f0",
        border: `2px solid ${borderColor}`,
        flexShrink: 0,
        display: "grid",
        placeItems: "center",
        color: "#475569",
        fontSize: Math.max(10, Math.round(size * 0.32)),
        fontWeight: 700,
      }}
    >
      {initials}
    </div>
  );
}
function SponsorFooter() {
  return (
    <div style={{ textAlign: "center", padding: "20px 16px 98px" }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "#64748b",
          letterSpacing: 0.3,
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        Sponsored By
      </div>
      <img
        src={SPONSOR_LOGO}
        alt="Air Kelso"
        style={{
          width: BANNER_LOGO_SIZE,
          height: BANNER_LOGO_SIZE,
          objectFit: "contain",
          display: "block",
          margin: "0 auto",
        }}
      />
    </div>
  );
}

function getCourse(id) {
  return COURSES.find((c) => c.id === id);
}
function DC(o) {
  return JSON.parse(JSON.stringify(o));
}
function dlyHcp(gaHcp, slope, rating, par) {
  if (gaHcp == null) return null;
  const ch = (gaHcp * slope) / 113 + ((rating || 72) - (par || 72));
  return Math.round(ch);
}
function courseHcp(gaHcp, course, teeKey) {
  if (gaHcp == null) return null;
  const key = course.id + "_" + teeKey;
  if (HCP_TABLES[key]) return lookupHcp(gaHcp, HCP_TABLES[key]);
  // Fallback formula (shouldn't be needed now)
  return dlyHcp(
    gaHcp,
    getSlope(course, teeKey),
    getRating(course, teeKey),
    course.par,
  );
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
    [-9.8, -10],
    [-8.9, -9],
    [-8.0, -8],
    [-7.1, -7],
    [-6.2, -6],
    [-5.3, -5],
    [-4.4, -4],
    [-3.5, -3],
    [-2.6, -2],
    [-1.7, -1],
    [-0.8, 0],
    [0.1, 1],
    [1.0, 2],
    [1.9, 3],
    [2.8, 4],
    [3.7, 5],
    [4.6, 6],
    [5.5, 7],
    [6.4, 8],
    [7.3, 9],
    [8.2, 10],
    [9.1, 11],
    [10.0, 12],
    [10.9, 13],
    [11.8, 14],
    [12.7, 15],
    [13.6, 16],
    [14.6, 17],
    [15.5, 18],
    [16.4, 19],
    [17.3, 20],
    [18.2, 21],
    [19.1, 22],
    [20.0, 23],
    [20.9, 24],
    [21.8, 25],
    [22.7, 26],
    [23.6, 27],
    [24.5, 28],
    [25.4, 29],
    [26.3, 30],
    [27.2, 31],
    [28.1, 32],
    [29.0, 33],
    [29.9, 34],
    [30.8, 35],
    [31.7, 36],
    [32.6, 37],
    [33.5, 38],
    [34.4, 39],
    [35.3, 40],
    [36.2, 41],
    [37.1, 42],
    [38.0, 43],
    [38.9, 44],
    [39.8, 45],
    [40.7, 46],
    [41.6, 47],
    [42.5, 48],
    [43.4, 49],
    [44.3, 50],
    [45.2, 51],
    [46.1, 52],
    [47.0, 53],
    [47.9, 54],
    [48.8, 55],
    [49.7, 56],
    [50.6, 57],
    [51.5, 58],
    [52.4, 59],
    [53.3, 60],
    [54.0, 61],
  ],
  standrews_blue: [
    [-9.5, -8],
    [-8.7, -7],
    [-7.8, -6],
    [-6.9, -5],
    [-6.0, -4],
    [-5.2, -3],
    [-4.3, -2],
    [-3.4, -1],
    [-2.5, 0],
    [-1.7, 1],
    [-0.8, 2],
    [0.1, 3],
    [1.0, 4],
    [1.8, 5],
    [2.7, 6],
    [3.6, 7],
    [4.5, 8],
    [5.3, 9],
    [6.2, 10],
    [7.1, 11],
    [8.0, 12],
    [8.8, 13],
    [9.7, 14],
    [10.6, 15],
    [11.5, 16],
    [12.3, 17],
    [13.2, 18],
    [14.1, 19],
    [15.0, 20],
    [15.8, 21],
    [16.7, 22],
    [17.6, 23],
    [18.5, 24],
    [19.3, 25],
    [20.2, 26],
    [21.1, 27],
    [22.0, 28],
    [22.8, 29],
    [23.7, 30],
    [24.6, 31],
    [25.5, 32],
    [26.3, 33],
    [27.2, 34],
    [28.1, 35],
    [29.0, 36],
    [29.8, 37],
    [30.7, 38],
    [31.6, 39],
    [32.5, 40],
    [33.4, 41],
    [34.2, 42],
    [35.1, 43],
    [36.0, 44],
    [36.9, 45],
    [37.7, 46],
    [38.6, 47],
    [39.5, 48],
    [40.4, 49],
    [41.2, 50],
    [42.1, 51],
    [43.0, 52],
    [43.9, 53],
    [44.7, 54],
    [45.6, 55],
    [46.5, 56],
    [47.4, 57],
    [48.2, 58],
    [49.1, 59],
    [50.0, 60],
    [50.9, 61],
    [51.7, 62],
    [52.6, 63],
    [53.5, 64],
    [54.0, 65],
  ],
  pk_north_white: [
    [-4.8, -5],
    [-4.0, -4],
    [-3.1, -3],
    [-2.2, -2],
    [-1.3, -1],
    [-0.4, 0],
    [0.5, 1],
    [1.3, 2],
    [2.2, 3],
    [3.1, 4],
    [4.0, 5],
    [4.9, 6],
    [5.7, 7],
    [6.6, 8],
    [7.5, 9],
    [8.4, 10],
    [9.3, 11],
    [10.2, 12],
    [11.0, 13],
    [11.9, 14],
    [12.8, 15],
    [13.7, 16],
    [14.6, 17],
    [15.4, 18],
    [16.3, 19],
    [17.2, 20],
    [18.1, 21],
    [19.0, 22],
    [19.9, 23],
    [20.7, 24],
    [21.6, 25],
    [22.5, 26],
    [23.4, 27],
    [24.3, 28],
    [25.1, 29],
    [26.0, 30],
    [26.9, 31],
    [27.8, 32],
    [28.7, 33],
    [29.6, 34],
    [30.4, 35],
    [31.3, 36],
    [32.2, 37],
    [33.1, 38],
    [34.0, 39],
    [34.8, 40],
    [35.7, 41],
    [36.6, 42],
    [37.5, 43],
    [38.4, 44],
    [39.2, 45],
    [40.1, 46],
    [41.0, 47],
    [41.9, 48],
    [42.8, 49],
    [43.7, 50],
    [44.5, 51],
    [45.4, 52],
    [46.3, 53],
    [47.2, 54],
    [48.1, 55],
    [48.9, 56],
    [49.8, 57],
    [50.7, 58],
    [51.6, 59],
    [52.5, 60],
    [53.4, 61],
    [54.0, 62],
  ],
  pk_north_blue: [
    [-4.8, -4],
    [-3.9, -3],
    [-3.0, -2],
    [-2.1, -1],
    [-1.2, 0],
    [-0.4, 1],
    [0.5, 2],
    [1.4, 3],
    [2.3, 4],
    [3.2, 5],
    [4.0, 6],
    [4.9, 7],
    [5.8, 8],
    [6.7, 9],
    [7.6, 10],
    [8.5, 11],
    [9.3, 12],
    [10.2, 13],
    [11.1, 14],
    [12.0, 15],
    [12.9, 16],
    [13.7, 17],
    [14.6, 18],
    [15.5, 19],
    [16.4, 20],
    [17.3, 21],
    [18.2, 22],
    [19.0, 23],
    [19.9, 24],
    [20.8, 25],
    [21.7, 26],
    [22.6, 27],
    [23.4, 28],
    [24.3, 29],
    [25.2, 30],
    [26.1, 31],
    [27.0, 32],
    [27.8, 33],
    [28.7, 34],
    [29.6, 35],
    [30.5, 36],
    [31.4, 37],
    [32.3, 38],
    [33.1, 39],
    [34.0, 40],
    [34.9, 41],
    [35.8, 42],
    [36.7, 43],
    [37.5, 44],
    [38.4, 45],
    [39.3, 46],
    [40.2, 47],
    [41.1, 48],
    [42.0, 49],
    [42.8, 50],
    [43.7, 51],
    [44.6, 52],
    [45.5, 53],
    [46.4, 54],
    [47.2, 55],
    [48.1, 56],
    [49.0, 57],
    [49.9, 58],
    [50.8, 59],
    [51.7, 60],
    [52.5, 61],
    [53.4, 62],
    [54.0, 63],
  ],
  pk_south_white: [
    [-5.0, -6],
    [-4.1, -5],
    [-3.2, -4],
    [-2.3, -3],
    [-1.4, -2],
    [-0.5, -1],
    [0.4, 0],
    [1.3, 1],
    [2.2, 2],
    [3.1, 3],
    [4.0, 4],
    [4.9, 5],
    [5.9, 6],
    [6.8, 7],
    [7.7, 8],
    [8.6, 9],
    [9.5, 10],
    [10.4, 11],
    [11.3, 12],
    [12.2, 13],
    [13.1, 14],
    [14.0, 15],
    [14.9, 16],
    [15.8, 17],
    [16.7, 18],
    [17.7, 19],
    [18.6, 20],
    [19.5, 21],
    [20.4, 22],
    [21.3, 23],
    [22.2, 24],
    [23.1, 25],
    [24.0, 26],
    [24.9, 27],
    [25.8, 28],
    [26.7, 29],
    [27.6, 30],
    [28.6, 31],
    [29.5, 32],
    [30.4, 33],
    [31.3, 34],
    [32.2, 35],
    [33.1, 36],
    [34.0, 37],
    [34.9, 38],
    [35.8, 39],
    [36.7, 40],
    [37.6, 41],
    [38.5, 42],
    [39.4, 43],
    [40.4, 44],
    [41.3, 45],
    [42.2, 46],
    [43.1, 47],
    [44.0, 48],
    [44.9, 49],
    [45.8, 50],
    [46.7, 51],
    [47.6, 52],
    [48.5, 53],
    [49.4, 54],
    [50.3, 55],
    [51.3, 56],
    [52.2, 57],
    [53.1, 58],
    [54.0, 59],
  ],
  pk_south_blue: [
    [-4.8, -4],
    [-3.9, -3],
    [-3.0, -2],
    [-2.1, -1],
    [-1.2, 0],
    [-0.4, 1],
    [0.5, 2],
    [1.4, 3],
    [2.3, 4],
    [3.2, 5],
    [4.0, 6],
    [4.9, 7],
    [5.8, 8],
    [6.7, 9],
    [7.6, 10],
    [8.5, 11],
    [9.3, 12],
    [10.2, 13],
    [11.1, 14],
    [12.0, 15],
    [12.9, 16],
    [13.7, 17],
    [14.6, 18],
    [15.5, 19],
    [16.4, 20],
    [17.3, 21],
    [18.2, 22],
    [19.0, 23],
    [19.9, 24],
    [20.8, 25],
    [21.7, 26],
    [22.6, 27],
    [23.4, 28],
    [24.3, 29],
    [25.2, 30],
    [26.1, 31],
    [27.0, 32],
    [27.8, 33],
    [28.7, 34],
    [29.6, 35],
    [30.5, 36],
    [31.4, 37],
    [32.3, 38],
    [33.1, 39],
    [34.0, 40],
    [34.9, 41],
    [35.8, 42],
    [36.7, 43],
    [37.5, 44],
    [38.4, 45],
    [39.3, 46],
    [40.2, 47],
    [41.1, 48],
    [42.0, 49],
    [42.8, 50],
    [43.7, 51],
    [44.6, 52],
    [45.5, 53],
    [46.4, 54],
    [47.2, 55],
    [48.1, 56],
    [49.0, 57],
    [49.9, 58],
    [50.8, 59],
    [51.7, 60],
    [52.5, 61],
    [53.4, 62],
    [54.0, 63],
  ],
};
function hStrokes(dHcp, hole) {
  const si = hole.si || hole;
  if (!dHcp || dHcp <= 0) return 0;
  let shots = 0;
  if (si <= dHcp) shots++;
  const si2 = hole.si2 || si + 18;
  if (si2 <= dHcp) shots++;
  const si3 = si2 + 18;
  if (si3 <= dHcp) shots++;
  return shots;
}
function sPts(gross, par, strokes) {
  if (!gross || gross < 0) return 0;
  return Math.max(0, 2 - (gross - strokes - par));
}
function isPickup(val) {
  return val === -1;
}
function holeFilled(val) {
  return val > 0 || val === -1;
}
function grossForHole(val, par) {
  if (val === -1) return par + 5;
  return val > 0 ? val : 0;
}

function holeName(n) {
  const suffix =
    n === 1
      ? "st"
      : n === 2
        ? "nd"
        : n === 3
          ? "rd"
          : n >= 11 && n <= 13
            ? "th"
            : "th";
  const s2 = [21, 22, 23, 31, 32, 33];
  const suf =
    n === 1
      ? "st"
      : n === 2
        ? "nd"
        : n === 3
          ? "rd"
          : n === 21
            ? "st"
            : n === 22
              ? "nd"
              : n === 23
                ? "rd"
                : n === 31
                  ? "st"
                  : "th";
  return `${n}${suf} Hole`;
}
function sLabel(pts) {
  return pts >= 5
    ? "Eagle+"
    : pts === 4
      ? "Eagle"
      : pts === 3
        ? "Birdie"
        : pts === 2
          ? "Par"
          : pts === 1
            ? "Bogey"
            : "Dbl+";
}
function grossLabel(gross, par) {
  if (!gross || gross < 0) return "";
  const diff = gross - par;
  return diff <= -2
    ? "Eagle+"
    : diff === -1
      ? "Birdie"
      : diff === 0
        ? "Par"
        : diff === 1
          ? "Bogey"
          : "Dbl+";
}
function sColor(pts) {
  return pts >= 3
    ? "#16a34a"
    : pts === 2
      ? "#B8860B"
      : pts === 1
        ? "#d97706"
        : "#dc2626";
}
function pStab(scores, course, dHcp) {
  let t = 0;
  course.holes.forEach((h, i) => {
    t += sPts(scores?.[i] || 0, h.par, hStrokes(dHcp, h));
  });
  return t;
}

function practiceTeamStablefordTotals({ state, round, course, team }) {
  const playerRows = team.playerIds.map((playerId) => {
    const scores = state.scores?.[round.id]?.[playerId] || [];
    const dailyHcp = courseHcp(
      state.handicaps?.[playerId],
      course,
      getTeeKey(state, course.id),
    );
    return { playerId, scores, dailyHcp };
  });

  const holeRows = course.holes.map((hole, holeIdx) => {
    const counted = playerRows
      .map((player) => {
        const gross = player.scores?.[holeIdx] || 0;
        if (!holeFilled(gross)) return null;
        return {
          playerId: player.playerId,
          pts: sPts(gross, hole.par, hStrokes(player.dailyHcp, hole)),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.pts - a.pts)
      .slice(0, 2);
    return {
      score: counted.reduce((sum, entry) => sum + entry.pts, 0),
      countedPlayers: counted.length,
    };
  });

  return {
    score: holeRows.reduce((sum, row) => sum + row.score, 0),
    holes: holeRows.filter((row) => row.countedPlayers === 2).length,
    totalHoles: course.holes.length,
  };
}

function getPartner(playerId, roundId) {
  const round = ROUNDS.find((r) => r.id === roundId);
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
  return [rec.front, rec.back].filter((v) => v != null).length;
}

function chulliganBadges(count) {
  return count > 0 ? "🍺".repeat(count) : "";
}

function findMatchByPlayer(roundId, playerId) {
  const round = ROUNDS.find((r) => r.id === roundId);
  if (!round) return null;
  return (
    round.matches.find((m) => [...m.blue, ...m.grey].includes(playerId)) || null
  );
}

function findMatchByTeam(roundId, teamIds) {
  const round = ROUNDS.find((r) => r.id === roundId);
  if (!round) return null;
  const key = [...teamIds].sort().join("_");
  return (
    round.matches.find((m) =>
      [m.blue, m.grey].some((t) => [...t].sort().join("_") === key),
    ) || null
  );
}

function getPracticeTeamByPlayer(playerId) {
  return PRACTICE_TEAMS.find((team) => team.playerIds.includes(playerId)) || null;
}

function isSubmitted(state, roundId, playerId) {
  return !!state.submitted?.[roundId]?.[playerId];
}

function matchStatus(state, match, round) {
  const course = getCourse(round.courseId);
  const bSc = match.blue.map((id) => state.scores?.[round.id]?.[id] || []);
  const gSc = match.grey.map((id) => state.scores?.[round.id]?.[id] || []);
  const any = [...bSc, ...gSc].some((s) => s.some?.((v) => holeFilled(v)));
  if (!any) return { status: "ns", bUp: 0, played: 0 };
  const tk = getTeeKey(state, round.courseId);
  const bH = match.blue.map(
    (id) => courseHcp(state.handicaps?.[id], course, tk) || 0,
  );
  const gH = match.grey.map(
    (id) => courseHcp(state.handicaps?.[id], course, tk) || 0,
  );
  const mn = Math.min(...bH, ...gH);
  const abH = bH.map((h) => h - mn),
    agH = gH.map((h) => h - mn);
  let bUp = 0,
    played = 0;
  let clinched = null;
  for (let i = 0; i < 18; i++) {
    const h = course.holes[i];
    // Match play hole result is based on each side's best stableford score.
    // Pickup/unscored holes contribute 0 unless the partner records points.
    const bPts = match.blue.map((_, pi) => {
      const g = bSc[pi]?.[i];
      if (!holeFilled(g)) return null;
      return isPickup(g) ? 0 : sPts(g, h.par, hStrokes(abH[pi], h));
    });
    const gPts = match.grey.map((_, pi) => {
      const g = gSc[pi]?.[i];
      if (!holeFilled(g)) return null;
      return isPickup(g) ? 0 : sPts(g, h.par, hStrokes(agH[pi], h));
    });
    // At least one from each team must have a score (including pickup)
    const blueHasScore = match.blue.some((_, pi) => holeFilled(bSc[pi]?.[i]));
    const greyHasScore = match.grey.some((_, pi) => holeFilled(gSc[pi]?.[i]));
    if (blueHasScore && greyHasScore) {
      played++;
      const bestB =
        Math.max(...bPts.filter((v) => v !== null));
      const bestG = Math.max(...gPts.filter((v) => v !== null));
      if (bestB > bestG) bUp++;
      else if (bestG > bestB) bUp--;
      const rem = 18 - played;
      if (Math.abs(bUp) > rem) {
        clinched = { bUp, played, rem };
        break;
      }
    }
  }
  if (played === 0) return { status: "ns", bUp: 0, played: 0 };
  if (clinched)
    return {
      status: "done",
      winner: clinched.bUp > 0 ? "blue" : "grey",
      bUp: clinched.bUp,
      played: clinched.played,
      display:
        clinched.rem === 0
          ? `${Math.abs(clinched.bUp)} Up`
          : `${Math.abs(clinched.bUp)}&${clinched.rem}`,
    };
  const rem = 18 - played;
  if (played < 18) {
    return { status: "live", bUp, played, remaining: rem };
  }
  if (bUp === 0)
    return {
      status: "done",
      winner: "halved",
      bUp: 0,
      played: 18,
      display: "Halved",
    };
  return {
    status: "done",
    winner: bUp > 0 ? "blue" : "grey",
    bUp,
    played: 18,
    display: `${Math.abs(bUp)} Up`,
  };
}

const DEFAULT_STATE = {
  handicaps: {
    angus: 4.1,
    nick: 12.3,
    tom: 14.3,
    callum: 15.4,
    jkelly: 35.4,
    jturner: 17.8,
    chris: 20.6,
    luke: 14.0,
    alex: 15.6,
    lach: 28.0,
    jason: 14.6,
    cam: 23.2,
  },
  scores: {},
  ntpWinners: {},
  ldWinners: {},
  chulligans: {},
  submitted: {},
  dailySummaries: {},
  dailySummaryDrafts: {},
  sledgeFeed: [],
  sledgeMeta: {},
  sledgeReads: {},
  summaryReads: {},
  eventLive: false,
  scoringOpenWhenHidden: false,
  roundScoringLive: { r0: false, r1: true, r2: false, r3: false },
  tees: { standrews: "white", pk_south: "white", pk_north: "white", dunes: "blue" },
  teamNames: { ...DEFAULT_TEAM_NAMES },
};

function normalizeState(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const normalizedRaw = fromRemoteState(raw);
  const next = DC(DEFAULT_STATE);
  Object.assign(next, normalizedRaw);
  next.handicaps = {
    ...DEFAULT_STATE.handicaps,
    ...(normalizedRaw.handicaps || {}),
  };
  next.scores =
    normalizedRaw.scores && typeof normalizedRaw.scores === "object"
      ? normalizedRaw.scores
      : {};
  next.ntpWinners =
    normalizedRaw.ntpWinners && typeof normalizedRaw.ntpWinners === "object"
      ? normalizedRaw.ntpWinners
      : {};
  next.ldWinners =
    normalizedRaw.ldWinners && typeof normalizedRaw.ldWinners === "object"
      ? normalizedRaw.ldWinners
      : {};
  next.chulligans =
    normalizedRaw.chulligans && typeof normalizedRaw.chulligans === "object"
      ? normalizedRaw.chulligans
      : {};
  next.submitted =
    normalizedRaw.submitted && typeof normalizedRaw.submitted === "object"
      ? normalizedRaw.submitted
      : {};
  next.dailySummaries =
    normalizedRaw.dailySummaries &&
    typeof normalizedRaw.dailySummaries === "object"
      ? normalizedRaw.dailySummaries
      : {};
  next.dailySummaryDrafts =
    normalizedRaw.dailySummaryDrafts &&
    typeof normalizedRaw.dailySummaryDrafts === "object"
      ? normalizedRaw.dailySummaryDrafts
      : {};
  next.sledgeFeed = Array.isArray(normalizedRaw.sledgeFeed)
    ? pruneExpiredSledges(normalizedRaw.sledgeFeed)
    : [];
  next.sledgeMeta =
    normalizedRaw.sledgeMeta && typeof normalizedRaw.sledgeMeta === "object"
      ? normalizedRaw.sledgeMeta
      : {};
  next.sledgeReads =
    normalizedRaw.sledgeReads && typeof normalizedRaw.sledgeReads === "object"
      ? normalizedRaw.sledgeReads
      : {};
  next.summaryReads =
    normalizedRaw.summaryReads && typeof normalizedRaw.summaryReads === "object"
      ? normalizedRaw.summaryReads
      : {};
  next.roundScoringLive = {
    ...DEFAULT_STATE.roundScoringLive,
    ...(normalizedRaw.roundScoringLive || {}),
  };
  next.tees = { ...DEFAULT_STATE.tees, ...(normalizedRaw.tees || {}) };
  next.scoringOpenWhenHidden = !!normalizedRaw.scoringOpenWhenHidden;
  next.teamNames = { ...DEFAULT_TEAM_NAMES, ...(normalizedRaw.teamNames || {}) };
  next.eventLive = !!normalizedRaw.eventLive;
  return next;
}

function remapTeamNameKeys(teamNames, keyMap) {
  if (!teamNames || typeof teamNames !== "object") return {};
  const mapped = {};
  Object.entries(teamNames).forEach(([key, value]) => {
    mapped[keyMap[key] || key] = value;
  });
  return mapped;
}

function fromRemoteState(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const next = { ...raw };
  next.teamNames = remapTeamNameKeys(raw.teamNames, INTERNAL_TEAM_KEYS);
  return next;
}

function toRemoteState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) return state;
  const next = { ...state };
  next.teamNames = remapTeamNameKeys(state.teamNames, EXTERNAL_TEAM_KEYS);
  return next;
}

const SLEDGE_COOLDOWN_MS = 2 * 60 * 60 * 1000;
const SLEDGE_TTL_MS = 60 * 60 * 1000;

function pickSledge(lines) {
  return lines[Math.floor(Math.random() * lines.length)] || lines[0] || "";
}

function isFreshSledge(item, now = Date.now()) {
  const timestamp = item?.at ? new Date(item.at).getTime() : 0;
  return Number.isFinite(timestamp) && now - timestamp <= SLEDGE_TTL_MS;
}

function pruneExpiredSledges(items, now = Date.now()) {
  return (items || []).filter((item) => isFreshSledge(item, now));
}

const SLEDGE_LIBRARY = {
  big_points: [
    ({ playerShort, points, hole }) =>
      `🔥 ${playerShort} just peeled off ${points} points on hole ${hole}. Handicap detectives are circling.`,
    ({ playerShort, points, hole }) =>
      `🚨 ${playerShort} walked away from hole ${hole} with ${points} points and absolutely no shame.`,
    ({ playerShort, points, hole }) =>
      `🎯 ${playerShort} turned hole ${hole} into a ${points}-point robbery. Case remains open.`,
    ({ playerShort, points, hole }) =>
      `📈 ${playerShort} just cashed ${points} points on hole ${hole}. Momentum has entered the group chat.`,
    ({ playerShort, points, hole }) =>
      `💰 ${playerShort} found ${points} points on hole ${hole}. Inspector of handicaps has been notified.`,
    ({ playerShort, points, hole }) =>
      `⚡ ${playerShort} nicked ${points} points from hole ${hole}. That felt personal.`,
    ({ playerShort, points, hole }) =>
      `🎲 ${playerShort} rolled up to hole ${hole} and came back with ${points} points. Filthy work.`,
    ({ playerShort, points, hole }) =>
      `🪄 ${playerShort} made ${points} points appear on hole ${hole}. Sleight of hand suspected.`,
    ({ playerShort, points, hole }) =>
      `📣 ${playerShort} just posted ${points} points on hole ${hole}. The chatter is already unbearable.`,
    ({ playerShort, points, hole }) =>
      `😮‍💨 Hole ${hole} has just funded a ${points}-point surge for ${playerShort}. Standards are slipping.`,
    ({ playerShort, points, hole }) =>
      `🧤 ${playerShort} found ${points} points on hole ${hole}. The leather wedge may have been warming up in the bag.`,
    ({ playerShort, points, hole }) =>
      `🏌️ ${playerShort} squeezed ${points} points out of hole ${hole}. Very convenient bounce, very suspicious grin.`,
    ({ playerShort, points, hole }) =>
      `📬 ${playerShort} has mailed in ${points} points on hole ${hole}. Scorecard handwriting experts are on standby.`,
    ({ playerShort, points, hole }) =>
      `🎣 ${playerShort} reeled in ${points} points on hole ${hole}. That one had breakfast ball energy long after breakfast.`,
    ({ playerShort, points, hole }) =>
      `🕵️ ${playerShort} just logged ${points} points on hole ${hole}. Playing partners are checking for improved lies near the rough.`,
    ({ playerShort, points, hole }) =>
      `🍀 ${playerShort} emerged from hole ${hole} with ${points} points and the kind of luck normally reserved for cart path bounces.`,
    ({ playerShort, points, hole }) =>
      `🧾 ${playerShort} banked ${points} points on hole ${hole}. Committee review pending, banter immediate.`,
    ({ playerShort, points, hole }) =>
      `😏 ${playerShort} collected ${points} points on hole ${hole}. That sounded a lot like a 'gallery ball' being found.`,
    ({ playerShort, points, hole }) =>
      `⛳ ${playerShort} turned hole ${hole} into ${points} points. Someone ask how many mulligans count as 'good rhythm'.`,
    ({ playerShort, points, hole }) =>
      `🥷 ${playerShort} silently escaped hole ${hole} with ${points} points. Ninja scoring, leather wedge rumours, no witnesses.`,
  ],
  wipe: [
    ({ playerShort, hole }) =>
      `💀 ${playerShort} took a pickup on hole ${hole}. We will absolutely be revisiting this later.`,
    ({ playerShort, hole }) =>
      `🫠 Hole ${hole} folded ${playerShort} into a neat little pickup. Character building only.`,
    ({ playerShort, hole }) =>
      `📉 ${playerShort} has activated the emergency pickup on hole ${hole}. Dignity remains week-to-week.`,
    ({ playerShort, hole }) =>
      `🪦 ${playerShort} left their hopes on hole ${hole} and marked down the pickup.`,
    ({ playerShort, hole }) =>
      `😬 Pickup for ${playerShort} on hole ${hole}. A brave attempt was made by someone.`,
    ({ playerShort, hole }) =>
      `🚧 Hole ${hole} was closed due to a ${playerShort} incident. Pickup recorded.`,
    ({ playerShort, hole }) =>
      `🥀 ${playerShort} has wiped hole ${hole}. The post-mortem will be ruthless.`,
    ({ playerShort, hole }) =>
      `📦 ${playerShort} wrapped up hole ${hole} early with a pickup and a thousand-yard stare.`,
    ({ playerShort, hole }) =>
      `🛟 ${playerShort} needed the pickup button on hole ${hole}. Survival first, questions later.`,
    ({ playerShort, hole }) =>
      `🙃 ${playerShort} and hole ${hole} have mutually agreed to never speak again. Pickup.`,
    ({ playerShort, hole }) =>
      `🌵 ${playerShort} wandered into the golfing desert on hole ${hole}. Pickup taken before the search party arrived.`,
    ({ playerShort, hole }) =>
      `🧮 ${playerShort} reached the stage on hole ${hole} where the score stopped being math and became modern art. Pickup.`,
    ({ playerShort, hole }) =>
      `🎭 ${playerShort} tried every shot in the catalogue on hole ${hole} and still landed on pickup. Commitment respected.`,
    ({ playerShort, hole }) =>
      `🫡 ${playerShort} saluted hole ${hole}, accepted defeat, and reached for the pickup. A veteran move.`,
    ({ playerShort, hole }) =>
      `🏖️ ${playerShort} spent enough time on hole ${hole} to qualify for a resort stay. Pickup and move on.`,
    ({ playerShort, hole }) =>
      `🧹 ${playerShort} has been swept off hole ${hole}. Even the leather wedge couldn't rescue that one.`,
    ({ playerShort, hole }) =>
      `📣 ${playerShort} took pickup on hole ${hole}. The group behind has sent a thank-you note.`,
    ({ playerShort, hole }) =>
      `🚑 ${playerShort} needed full emergency services on hole ${hole}. Pickup entered, pride listed as day-to-day.`,
    ({ playerShort, hole }) =>
      `🌊 Hole ${hole} washed ${playerShort} straight out to sea. Pickup, reset, deep breath.`,
    ({ playerShort, hole }) =>
      `🤝 ${playerShort} has called a truce with hole ${hole}. Pickup signed, witnessed, and lightly mocked.`,
  ],
  team_double_wipe: [
    ({ playerShort, partnerShort, hole }) =>
      `🧨 Team collapse alert: ${playerShort} + ${partnerShort} both wiped hole ${hole}. Pure cinema.`,
    ({ playerShort, partnerShort, hole }) =>
      `🍿 Hole ${hole} just claimed both ${playerShort} and ${partnerShort}. This duo brought chaos, not caution.`,
    ({ playerShort, partnerShort, hole }) =>
      `🧻 ${playerShort} and ${partnerShort} both wiped hole ${hole} — someone get this team a fresh roll of toilet paper and a reset.`,
    ({ playerShort, partnerShort, hole }) =>
      `🚑 Double pickup on hole ${hole} for ${playerShort} and ${partnerShort}. Send snacks and emotional support.`,
    ({ playerShort, partnerShort, hole }) =>
      `🌪️ ${playerShort} and ${partnerShort} both disappeared into the spin cycle on hole ${hole}.`,
    ({ playerShort, partnerShort, hole }) =>
      `📛 Hole ${hole} has issued matching pickup receipts to ${playerShort} and ${partnerShort}.`,
    ({ playerShort, partnerShort, hole }) =>
      `🧯 ${playerShort}/${partnerShort} both wiped hole ${hole}. The fairway is still smoking.`,
    ({ playerShort, partnerShort, hole }) =>
      `🎭 ${playerShort} and ${partnerShort} have produced a synchronised pickup on hole ${hole}. Bold theatre.`,
    ({ playerShort, partnerShort, hole }) =>
      `🌀 Team ${playerShort}/${partnerShort} both lost hole ${hole} in exactly the same dramatic fashion.`,
    ({ playerShort, partnerShort, hole }) =>
      `📉 ${playerShort} plus ${partnerShort} have managed the full double wipe on hole ${hole}. Efficient, if nothing else.`,
    ({ playerShort, partnerShort, hole }) =>
      `🪤 ${playerShort} and ${partnerShort} both found the same trap on hole ${hole}. It turns out the leather wedge can't save two blokes at once.`,
    ({ playerShort, partnerShort, hole }) =>
      `🎬 ${playerShort}/${partnerShort} just delivered a double wipe on hole ${hole}. Critics are calling it needlessly ambitious.`,
    ({ playerShort, partnerShort, hole }) =>
      `🧊 ${playerShort} and ${partnerShort} went cold together on hole ${hole}. A rare display of terrible chemistry.`,
    ({ playerShort, partnerShort, hole }) =>
      `🚪 Hole ${hole} showed both ${playerShort} and ${partnerShort} directly to the exit. No encore requested.`,
    ({ playerShort, partnerShort, hole }) =>
      `🛞 ${playerShort} and ${partnerShort} both lost wheels on hole ${hole}. Cart traffic has been affected.`,
    ({ playerShort, partnerShort, hole }) =>
      `🏴‍☠️ ${playerShort}/${partnerShort} attempted to steal a result on hole ${hole} and instead looted their own confidence.`,
    ({ playerShort, partnerShort, hole }) =>
      `📚 ${playerShort} and ${partnerShort} have written a full case study on how not to play hole ${hole}.`,
    ({ playerShort, partnerShort, hole }) =>
      `🎻 Tiny violins out for ${playerShort} and ${partnerShort} after the hole ${hole} double wipe. The symphony is brutal.`,
    ({ playerShort, partnerShort, hole }) =>
      `😵 Hole ${hole} flattened both ${playerShort} and ${partnerShort}. Matching pickups, unmatched embarrassment.`,
    ({ playerShort, partnerShort, hole }) =>
      `🧺 ${playerShort}/${partnerShort} have put both scorecards straight in the laundry on hole ${hole}. Total rinse cycle.`,
  ],
  chulligan: [
    ({ playerShort, hole }) =>
      `🍺 ${playerShort} just activated a Chulligan on hole ${hole}. Science remains divided on this strategy.`,
    ({ playerShort, hole }) =>
      `🥃 Chulligan called for ${playerShort} on hole ${hole}. Form temporary, confidence permanent.`,
    ({ playerShort, hole }) =>
      `🎪 ${playerShort} has used the Chulligan token on hole ${hole}. The crowd requested this timeline.`,
    ({ playerShort, hole }) =>
      `🧃 ${playerShort} has reached for a Chulligan on hole ${hole}. Hydration has left the chat.`,
    ({ playerShort, hole }) =>
      `🎟️ One Chulligan has been redeemed by ${playerShort} on hole ${hole}. Terms and conditions remain fuzzy.`,
    ({ playerShort, hole }) =>
      `🛞 ${playerShort} has gone to the Chulligan well on hole ${hole}. Wheels may come off, vibes stay high.`,
    ({ playerShort, hole }) =>
      `📣 ${playerShort} is taking the Chulligan route on hole ${hole}. This feels both avoidable and iconic.`,
    ({ playerShort, hole }) =>
      `🧪 Experimental golf continues: ${playerShort} has called a Chulligan on hole ${hole}.`,
    ({ playerShort, hole }) =>
      `🎯 ${playerShort} has paired hole ${hole} with a Chulligan. Accuracy sold separately.`,
    ({ playerShort, hole }) =>
      `🥳 ${playerShort} deployed the Chulligan on hole ${hole}. Coaches everywhere are sighing.`,
    ({ playerShort, hole }) =>
      `🍻 ${playerShort} has mixed swing thoughts with a Chulligan on hole ${hole}. What could possibly go right?`,
    ({ playerShort, hole }) =>
      `🧠 ${playerShort} has decided hole ${hole} needed fewer mechanics and more barley. Chulligan confirmed.`,
    ({ playerShort, hole }) =>
      `🎰 ${playerShort} just pulled the Chulligan lever on hole ${hole}. Jackpot odds remain poor, content odds elite.`,
    ({ playerShort, hole }) =>
      `📡 ${playerShort}'s plan for hole ${hole} now includes a Chulligan and blind faith. Signals are mixed.`,
    ({ playerShort, hole }) =>
      `🫗 ${playerShort} has poured confidence directly into hole ${hole}. Chulligan mode engaged.`,
    ({ playerShort, hole }) =>
      `😵‍💫 ${playerShort} has gone full jazz-golf on hole ${hole} with a Chulligan. Rhythm optional.`,
    ({ playerShort, hole }) =>
      `🏌️ ${playerShort} says the Chulligan on hole ${hole} is tactical. The gallery says it's comedic.`,
    ({ playerShort, hole }) =>
      `🧯 ${playerShort} has reached for a Chulligan on hole ${hole}. Usually a sign the round has its own ideas.`,
    ({ playerShort, hole }) =>
      `📦 ${playerShort} unpacked the emergency Chulligan on hole ${hole}. Instructions definitely not included.`,
    ({ playerShort, hole }) =>
      `🍀 ${playerShort} has paired hope with hops on hole ${hole}. Chulligan deployed, consequences pending.`,
  ],
  ntp_claim: [
    ({ playerShort, hole }) =>
      `📍 ${playerShort} just claimed NTP on hole ${hole}. The pin is now requesting witness protection.`,
    ({ playerShort, hole }) =>
      `🎯 NTP belongs to ${playerShort} on hole ${hole}. Everyone else suddenly remembers how to miss greens.`,
    ({ playerShort, hole }) =>
      `🧲 ${playerShort} has grabbed NTP on hole ${hole}. That shot had main-character energy.`,
    ({ playerShort, hole }) =>
      `📏 ${playerShort} now owns the closest look on hole ${hole}. Tape measure under review.`,
    ({ playerShort, hole }) =>
      `👀 ${playerShort} has parked one near the flag on hole ${hole}. The witnesses are rattled.`,
    ({ playerShort, hole }) =>
      `🪄 ${playerShort} just turned hole ${hole} into an NTP audition and nailed it.`,
    ({ playerShort, hole }) =>
      `🚩 ${playerShort} is now sitting nearest on hole ${hole}. Cue a lot of forced compliments.`,
    ({ playerShort, hole }) =>
      `📣 Closest-to-pin on hole ${hole} currently belongs to ${playerShort}. The pressure is delicious.`,
    ({ playerShort, hole }) =>
      `🎬 ${playerShort} has taken NTP on hole ${hole} with a shot that demanded a replay.`,
    ({ playerShort, hole }) =>
      `😎 ${playerShort} owns the prettiest result on hole ${hole}: current NTP holder.`,
    ({ playerShort, hole }) =>
      `🪙 ${playerShort} hit it tight on hole ${hole}. Anyone suggesting a hand wedge assisted the lie will be ignored.`,
    ({ playerShort, hole }) =>
      `🌟 ${playerShort} just stiffed one on hole ${hole}. The flagstick is blushing.`,
    ({ playerShort, hole }) =>
      `🧵 ${playerShort} threaded one onto hole ${hole}. That's dartboard golf with extra swagger.`,
    ({ playerShort, hole }) =>
      `📸 ${playerShort} has produced the screenshot swing on hole ${hole} and now leads NTP.`,
    ({ playerShort, hole }) =>
      `🏹 ${playerShort} fired a laser at hole ${hole}. Closest marker now officially in danger.`,
    ({ playerShort, hole }) =>
      `🫡 ${playerShort} just put one close on hole ${hole}. Respectful applause, deeply resentful tone.`,
    ({ playerShort, hole }) =>
      `🥶 ${playerShort} has gone cold-blooded on hole ${hole} and stolen NTP. Nerves nowhere to be found.`,
    ({ playerShort, hole }) =>
      `📌 ${playerShort} left the ball so close on hole ${hole} it might qualify for valet parking.`,
    ({ playerShort, hole }) =>
      `🧭 ${playerShort} had the exact coordinates on hole ${hole}. That's sat-nav golf.`,
    ({ playerShort, hole }) =>
      `🎉 ${playerShort} now has NTP on hole ${hole}. Everyone else may return to pretending theirs was pin-high.`,
  ],
  ld_claim: [
    ({ playerShort, hole }) =>
      `💣 ${playerShort} has claimed Longest Drive on hole ${hole}. Ball may still be airborne.`,
    ({ playerShort, hole }) =>
      `🚀 ${playerShort} now holds LD on hole ${hole}. Nearby suburbs have been notified.`,
    ({ playerShort, hole }) =>
      `📡 Longest Drive on hole ${hole} is currently ${playerShort}'s. Launch angle disrespected physics.`,
    ({ playerShort, hole }) =>
      `🛫 ${playerShort} has sent one into orbit on hole ${hole} and grabbed LD.`,
    ({ playerShort, hole }) =>
      `📏 ${playerShort} is the new bomber-in-chief on hole ${hole}. Longest Drive claimed.`,
    ({ playerShort, hole }) =>
      `🌪️ ${playerShort} just bullied hole ${hole} off the tee and took LD.`,
    ({ playerShort, hole }) =>
      `🧨 ${playerShort} now owns the biggest send on hole ${hole}. Grip it, rip it, boast immediately.`,
    ({ playerShort, hole }) =>
      `🏁 Longest Drive on hole ${hole} has been stolen by ${playerShort}. The field looks wounded.`,
    ({ playerShort, hole }) =>
      `📣 ${playerShort} is the current LD holder on hole ${hole}. Driver face still humming.`,
    ({ playerShort, hole }) =>
      `😤 ${playerShort} has overpowered hole ${hole} and walked off with Longest Drive.`,
    ({ playerShort, hole }) =>
      `🦾 ${playerShort} has just hit hole ${hole} with enough violence to win LD and lose a friendship.`,
    ({ playerShort, hole }) =>
      `🌩️ ${playerShort} thundered one down hole ${hole}. Longest Drive now belongs to the loudest swing in town.`,
    ({ playerShort, hole }) =>
      `🏎️ ${playerShort} turned hole ${hole} into a runway and left the rest on the tarmac.`,
    ({ playerShort, hole }) =>
      `📦 ${playerShort} delivered absolute freight down hole ${hole}. Longest Drive and same-day shipping secured.`,
    ({ playerShort, hole }) =>
      `🧱 ${playerShort} hit a drive on hole ${hole} that looked built in a lab. Suspicions include a downhill bounce and a favourable toe-peg.`,
    ({ playerShort, hole }) =>
      `🪓 ${playerShort} chopped through hole ${hole} with zero subtlety and full LD intent.`,
    ({ playerShort, hole }) =>
      `🥊 ${playerShort} has thrown hands with hole ${hole} and won Longest Drive on points.`,
    ({ playerShort, hole }) =>
      `📐 ${playerShort} found the perfect mix of speed, shape, and bragging rights on hole ${hole}.`,
    ({ playerShort, hole }) =>
      `😮‍💨 ${playerShort} absolutely smoked hole ${hole}. If that fairway was helped by a tiny foot wedge, nobody saw a thing.`,
    ({ playerShort, hole }) =>
      `👟 ${playerShort} now owns LD on hole ${hole}. Big carry, bigger bounce, even bigger storytelling incoming.`,
  ],
};

function buildSledgeMessage(type, context) {
  const templates = SLEDGE_LIBRARY[type] || [];
  const line = pickSledge(templates);
  return typeof line === "function" ? line(context || {}) : line;
}

function canPushSledgeForPlayers(state, roundId, playerIds, now = Date.now()) {
  if (!state?.eventLive && !isPracticeRoundLive(state)) return false;
  if (!state.sledgeMeta) state.sledgeMeta = {};
  const ids = [...new Set((playerIds || []).filter(Boolean))];
  if (ids.length === 0) return true;
  return ids.every((pid) => {
    const playerKey = `${roundId}:player:${pid}`;
    const last = state.sledgeMeta[playerKey] || { at: 0 };
    return now - last.at >= SLEDGE_COOLDOWN_MS;
  });
}

function stampSledgePlayers(state, roundId, playerIds, now = Date.now()) {
  if (!state.sledgeMeta) state.sledgeMeta = {};
  [...new Set((playerIds || []).filter(Boolean))].forEach((pid) => {
    state.sledgeMeta[`${roundId}:player:${pid}`] = { at: now };
  });
}

function removeSledgeFeedItems(state, predicate) {
  if (!state?.sledgeFeed?.length) return;
  state.sledgeFeed = pruneExpiredSledges(state.sledgeFeed).filter(
    (item) => !predicate(item),
  );
}

function pushSledgeFeed(
  state,
  { roundId, playerId, playerIds, hole, catalystKey, message },
) {
  if ((!state?.eventLive && !isPracticeRoundLive(state)) || !message)
    return false;
  if (!state.sledgeFeed) state.sledgeFeed = [];

  const now = Date.now();
  const impactedPlayers = [
    ...new Set((playerIds || [playerId]).filter(Boolean)),
  ];
  const metaKey = `${roundId}:${catalystKey}`;
  const last = state.sledgeMeta[metaKey] || { at: 0 };
  if (now - last.at < SLEDGE_COOLDOWN_MS) return false;
  if (!canPushSledgeForPlayers(state, roundId, impactedPlayers, now))
    return false;

  state.sledgeMeta[metaKey] = { at: now };
  stampSledgePlayers(state, roundId, impactedPlayers, now);
  state.sledgeFeed = pruneExpiredSledges(state.sledgeFeed, now);
  state.sledgeFeed.unshift({
    id: `${now}_${catalystKey}_${Math.random().toString(36).slice(2, 8)}`,
    roundId,
    playerId: playerId || null,
    playerIds: impactedPlayers,
    hole: hole || null,
    catalystKey,
    message,
    at: new Date(now).toISOString(),
  });
  return true;
}

function maybePushScoreSledge(
  state,
  { roundId, playerId, holeIdx, prevVal, nextVal },
) {
  if (
    (!state?.eventLive && !isPracticeRoundLive(state)) ||
    nextVal === prevVal ||
    !holeFilled(nextVal)
  )
    return;
  const round = ROUNDS.find((r) => r.id === roundId);
  if (!round) return;
  const course = getCourse(round.courseId);
  const hole = course.holes[holeIdx];
  if (!hole) return;
  const player = getP(playerId);
  const playerShort = player?.short || "Someone";

  const dailyHcp = courseHcp(
    state.handicaps?.[playerId],
    course,
    getTeeKey(state, course.id),
  );
  const points = sPts(nextVal, hole.par, hStrokes(dailyHcp, hole));
  const prevPoints = holeFilled(prevVal)
    ? sPts(prevVal, hole.par, hStrokes(dailyHcp, hole))
    : null;
  if (prevPoints === points) return;

  if (points >= 4) {
    pushSledgeFeed(state, {
      roundId,
      playerId,
      hole: hole.n,
      catalystKey: `big_points:${playerId}`,
      message: buildSledgeMessage("big_points", {
        playerShort,
        points,
        hole: hole.n,
      }),
    });
  }

  if (nextVal === -1) {
    const partnerId = getPartner(playerId, roundId);
    const partnerWiped =
      partnerId && state.scores?.[roundId]?.[partnerId]?.[holeIdx] === -1;
    if (partnerWiped) {
      const partnerShort = getP(partnerId)?.short || "Partner";
      const teamKey = [playerId, partnerId].sort().join("_");
      removeSledgeFeedItems(
        state,
        (item) =>
          item.roundId === roundId &&
          item.hole === hole.n &&
          [playerId, partnerId].includes(item.playerId) &&
          item.catalystKey === `wipe:${item.playerId}`,
      );
      pushSledgeFeed(state, {
        roundId,
        playerIds: [playerId, partnerId],
        hole: hole.n,
        catalystKey: `team_double_wipe:${teamKey}:${hole.n}`,
        message: buildSledgeMessage("team_double_wipe", {
          playerShort,
          partnerShort,
          hole: hole.n,
        }),
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
    message: buildSledgeMessage("chulligan", {
      playerShort,
      hole: holeIdx + 1,
    }),
  });
}

function maybePushCompClaimSledge(state, { roundId, playerId, type }) {
  const playerShort = getP(playerId)?.short || "Someone";
  const round = ROUNDS.find((r) => r.id === roundId);
  if (!round) return;
  const hole =
    type === "ntp"
      ? getNtpHole(round.id, round.courseId)
      : getLdHole(round.courseId);
  pushSledgeFeed(state, {
    roundId,
    playerId,
    hole,
    catalystKey: `${type}_claim:${playerId}`,
    message: buildSledgeMessage(type === "ntp" ? "ntp_claim" : "ld_claim", {
      playerShort,
      hole,
    }),
  });
}

function isRoundScoringLive(state, roundId) {
  return !!state?.roundScoringLive?.[roundId];
}

function isPracticeRoundLive(state) {
  return isRoundScoringLive(state, "r0");
}

function isRoundRevealed(state, roundId, live, isAdmin) {
  if (isAdmin) return true;
  if (!live && !state?.scoringOpenWhenHidden) return false;
  return isRoundScoringLive(state, roundId);
}

// ─── Main App ────────────────────────────────────────────────
function getTeeKey(state, courseId) {
  return state.tees?.[courseId] || "white";
}
function getSlope(course, teeKey) {
  return course.teeData[teeKey]?.slope || 132;
}
function getRating(course, teeKey) {
  return course.teeData[teeKey]?.rating || 72;
}
function getTeeLabel(course, teeKey) {
  return course.teeData[teeKey]?.label || "White";
}
function getM(hole, teeKey) {
  if (teeKey === "blue") return hole.b;
  if (teeKey === "black") return hole.black || hole.b;
  return hole.w;
}

function isRoundFullySubmitted(state, roundId) {
  return PLAYERS.every((p) => !!state?.submitted?.[roundId]?.[p.id]);
}

function canEnterHoleScores(state, roundId, playerId, holeIdx) {
  if (holeIdx <= 0) return true;
  const prevScore = state.scores?.[roundId]?.[playerId]?.[holeIdx - 1] || 0;
  return holeFilled(prevScore);
}

function getRoundLeaderboard(state, round) {
  const course = getCourse(round.courseId);
  return PLAYERS.map((p) => {
    const scores = state.scores?.[round.id]?.[p.id] || [];
    const holes = scores.filter((s) => holeFilled(s)).length;
    return {
      ...p,
      score: pStab(
        scores,
        course,
        courseHcp(state.handicaps?.[p.id], course, getTeeKey(state, course.id)),
      ),
      holes,
    };
  }).sort((a, b) => b.score - a.score);
}

function getOverallLeaderboard(state) {
  return PLAYERS.map((p) => {
    let total = 0;
    ROUNDS.forEach((r) => {
      if (r.includeInCup === false) return;
      const course = getCourse(r.courseId);
      const scores = state.scores?.[r.id]?.[p.id] || [];
      total += pStab(
        scores,
        course,
        courseHcp(state.handicaps?.[p.id], course, getTeeKey(state, course.id)),
      );
    });
    return { ...p, total };
  }).sort((a, b) => b.total - a.total);
}

function getRoundTrendStats(state, round) {
  const course = getCourse(round.courseId);
  const playerStats = PLAYERS.map((player) => {
    const scores = state.scores?.[round.id]?.[player.id] || [];
    const dailyHcp = courseHcp(
      state.handicaps?.[player.id],
      course,
      getTeeKey(state, course.id),
    );
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
  const worstBogeyRun = [...playerStats].sort(
    (a, b) => b.worstBogeyRun - a.worstBogeyRun,
  )[0];
  const worstStretch = [...playerStats]
    .filter((p) => p.worstStretch)
    .sort((a, b) => b.worstStretch.total - a.worstStretch.total)[0];

  return { mostBirdies, mostWipes, worstBogeyRun, worstStretch };
}

function formatRoundSummaryExport(state, roundId) {
  const round = ROUNDS.find((r) => r.id === roundId);
  if (!round) return "";
  const leaderboard = getRoundLeaderboard(state, round);
  const overall = getOverallLeaderboard(state);
  const ntpId = state.ntpWinners?.[`${round.id}_ntp`];
  const ldId = state.ldWinners?.[`${round.id}_ld`];
  const trendStats = getRoundTrendStats(state, round);
  const course = getCourse(round.courseId);
  const teeKey = getTeeKey(state, course.id);
  const nextRound = ROUNDS.find((candidate) => candidate.num === round.num + 1);

  const sections = [
    `Round ${round.num} - ${round.courseName}`,
    `${round.day}`,
    `Course setup: Par ${course.par} | ${getTeeLabel(course, teeKey)} tees | Slope ${getSlope(course, teeKey)} | Course rating ${getRating(course, teeKey)}`,
    "",
    "ROUND LEADERBOARD",
    ...(leaderboard.length
      ? leaderboard.map((p, i) => `${i + 1}. ${p.name} - ${p.score} pts`)
      : ["No scores recorded yet."]),
    "",
    "OVERALL LEADERBOARD",
    ...(overall.length
      ? overall.map((p, i) => `${i + 1}. ${p.name} - ${p.total} pts`)
      : ["No overall totals yet."]),
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
    "NEXT ROUND DETAILS",
    ...(nextRound
      ? [
          `Round ${nextRound.num} - ${nextRound.courseName}`,
          `${nextRound.day}`,
          `Tee times: ${nextRound.teeTimes.join(", ")}`,
          ...nextRound.matches.map(
            (match, matchIndex) =>
              `Match ${matchIndex + 1}: ${match.blue.map((id) => getP(id)?.name || id).join(" / ")} vs ${match.grey.map((id) => getP(id)?.name || id).join(" / ")}`,
          ),
        ]
      : ["No following round scheduled. This is the final round."]),
    "",
    "PLAYER HANDICAPS & BIOS",
    ...PLAYERS.map((player) => {
      const handicap = state.handicaps?.[player.id];
      const dailyHcp = courseHcp(handicap, course, teeKey);
      return `${player.name} | Team ${getTeamName(state, player.team)} | GA ${handicap ?? "-"} | Daily ${dailyHcp ?? "-"} | Bio: ${PLAYER_BIOS[player.id] || "No bio on file."}`;
    }),
    "",
    "FULL SCORESHEETS",
  ];

  round.matches.forEach((match, matchIndex) => {
    sections.push(
      `Match ${matchIndex + 1}: ${match.blue.map((id) => getP(id)?.short || id).join(" / ")} vs ${match.grey.map((id) => getP(id)?.short || id).join(" / ")}`,
    );
    [...match.blue, ...match.grey].forEach((playerId) => {
      const player = getP(playerId);
      const scores = state.scores?.[round.id]?.[playerId] || [];
      const dailyHcp = courseHcp(
        state.handicaps?.[playerId],
        course,
        getTeeKey(state, course.id),
      );
      const holeParts = course.holes.map((hole, idx) => {
        const gross = scores[idx] ?? 0;
        if (!holeFilled(gross)) return `${hole.n}: -`;
        if (gross === -1) return `${hole.n}: P`;
        const points = sPts(gross, hole.par, hStrokes(dailyHcp, hole));
        return `${hole.n}: ${gross} (${points}pt)`;
      });
      const totalPoints = course.holes.reduce(
        (sum, hole, idx) =>
          sum + sPts(scores[idx] ?? 0, hole.par, hStrokes(dailyHcp, hole)),
        0,
      );
      sections.push(
        `${player?.name || playerId} | GA ${state.handicaps?.[playerId] ?? "-"} | Daily ${dailyHcp ?? "-"} | Total ${totalPoints} pts | ${holeParts.join(", ")}`,
      );
    });
    sections.push("");
  });

  return sections.join("\n");
}

function buildManualRoundSummary(state, roundId, content) {
  const round = ROUNDS.find((r) => r.id === roundId);
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

function buildSummaryShareCard(state, roundId) {
  const round = ROUNDS.find((r) => r.id === roundId);
  if (!round) return null;
  const leaderboard = getRoundLeaderboard(state, round);
  const leader = leaderboard[0];
  const ntpWinnerId = state.ntpWinners?.[`${round.id}_ntp`];
  const ldWinnerId = state.ldWinners?.[`${round.id}_ld`];
  const summary = state.dailySummaries?.[round.id] || null;
  const preview = (summary?.content || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return {
    roundId,
    title: `Round ${round.num} Recap Card`,
    body: [
      `🏆 ${round.courseName} · Round ${round.num}`,
      leader
        ? `Leader: ${leader.name} (${leader.score} pts${leader.holes < 18 ? ` through ${leader.holes}` : ""})`
        : "Leader: TBD",
      `📍 NTP: ${ntpWinnerId ? getP(ntpWinnerId)?.name : "TBD"}`,
      `💪 LD: ${ldWinnerId ? getP(ldWinnerId)?.name : "TBD"}`,
      preview ? `📝 ${preview}${summary?.content?.length > preview.length ? "…" : ""}` : "",
      "#SpinnersCup2026",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

function buildLiveTimelineItems(state) {
  const sledgeItems = pruneExpiredSledges(state?.sledgeFeed || []).map((item) => ({
    ...item,
    type: "sledge",
    feedKey: item.id,
  }));
  const summaryItems = Object.values(state?.dailySummaries || {}).map((summary) => ({
    id: `summary_${summary.roundId}`,
    type: "summary",
    feedKey: `summary_${summary.roundId}`,
    roundId: summary.roundId,
    title: summary.title,
    message: summary.content,
    at: summary.releasedAt,
    source: summary.source || "admin",
  }));
  return [...sledgeItems, ...summaryItems].sort(
    (a, b) => new Date(b.at || 0) - new Date(a.at || 0),
  );
}

async function shareOrCopyText(title, text) {
  if (!text) return false;
  try {
    if (navigator?.share) {
      await navigator.share({ title, text });
      return true;
    }
  } catch {}
  return copyText(text);
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
  const [state, setState] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSpectator, setIsSpectator] = useState(false);
  const [cur, setCur] = useState(null);
  const [tab, setTab] = useState("cup");
  const [sub, setSub] = useState(null);
  const [lockedPlayerId, setLockedPlayerId] = useState(() =>
    localStorage.getItem(PLAYER_LOCK_KEY),
  );
  const [summaryPopup, setSummaryPopup] = useState(null);
  const [hasAccess, setHasAccess] = useState(
    () => localStorage.getItem(ACCESS_GRANTED_KEY) === "1",
  );
  const [syncError, setSyncError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const refreshInFlightRef = useRef(false);
  const saveVersionRef = useRef(0);

  const refreshState = useCallback(
    async ({ shouldApply, force = false } = {}) => {
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
          setState((prev) => prev || fallbackState);
          setSyncError(error?.message || "Unable to sync with Supabase.");
        }
        return fallbackState;
      } finally {
        refreshInFlightRef.current = false;
      }
    },
    [],
  );

  useEffect(() => {
    let alive = true;
    const syncState = () => refreshState({ shouldApply: () => alive });
    syncState();
    const interval = window.setInterval(syncState, LIVE_SYNC_INTERVAL_MS);
    return () => {
      alive = false;
      window.clearInterval(interval);
    };
  }, [refreshState]);

  useEffect(() => {
    const client = createRealtimeClient();
    if (!client) return undefined;

    const channel = client
      .channel(`spinners-app-state-${DB_ROW_ID}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "app_state",
          filter: `id=eq.${DB_ROW_ID}`,
        },
        (payload) => {
          const remoteState = normalizeState(payload.new?.data);
          if (remoteState) {
            cacheStateSnapshot(remoteState);
            setState(DC(remoteState));
            setSyncError("");
          } else {
            refreshState({ force: true });
          }
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          setSyncError("Realtime sync disconnected. Falling back to refresh.");
        }
      });

    return () => {
      client.removeChannel(channel);
      client.removeAllChannels();
    };
  }, [refreshState]);
  useEffect(() => {
    if (lockedPlayerId && PLAYERS.some((p) => p.id === lockedPlayerId)) {
      setCur(lockedPlayerId);
      setTab("cup");
      setSub(null);
    }
  }, [lockedPlayerId]);
  useEffect(() => {
    if (!cur) return;
    refreshState();
  }, [cur, tab, sub, refreshState]);

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
    const released = Object.values(state.dailySummaries || {}).sort(
      (a, b) => new Date(b.releasedAt || 0) - new Date(a.releasedAt || 0),
    );
    const unseen = released.find(
      (s) => !state.summaryReads?.[cur]?.[s.roundId],
    );
    if (unseen) setSummaryPopup(unseen);
  }, [cur, state?.dailySummaries, state?.summaryReads]);
  const upd = useCallback(
    (fn) => {
      setState((prev) => {
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
          .catch((error) => {
            if (saveVersion !== saveVersionRef.current) return;
            setIsSaving(false);
            const message = navigator.onLine
              ? error?.message || "Unable to save to Supabase."
              : "Offline. Changes saved locally and will sync when reconnected.";
            setSyncError(message);
            cacheStateSnapshot(next);
          });
        return next;
      });
    },
    [refreshState],
  );

  if (!state)
    return (
      <div style={S.loading}>
        <div style={S.spinner} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  if (!hasAccess)
    return (
      <AccessGate
        onGrant={() => {
          localStorage.setItem(ACCESS_GRANTED_KEY, "1");
          setHasAccess(true);
        }}
        onSpectator={() => {
          localStorage.setItem(ACCESS_GRANTED_KEY, "1");
          setHasAccess(true);
          setIsAdmin(false);
          setIsSpectator(true);
          setCur("spectator");
          setTab("cup");
          setSub(null);
        }}
      />
    );
  if (!cur)
    return (
      <PlayerSelect
        state={state}
        lockedPlayerId={lockedPlayerId}
        onSelect={(id) => {
          if (lockedPlayerId && lockedPlayerId !== id) return;
          if (!lockedPlayerId) {
            localStorage.setItem(PLAYER_LOCK_KEY, id);
            setLockedPlayerId(id);
          }
          setIsSpectator(false);
          setCur(id);
          setTab("cup");
          setSub(null);
        }}
        onUnlockSelection={() => {
          localStorage.removeItem(PLAYER_LOCK_KEY);
          setLockedPlayerId(null);
        }}
        onSpectator={() => {
          setIsAdmin(false);
          setIsSpectator(true);
          setCur("spectator");
          setTab("cup");
          setSub(null);
        }}
        onAdmin={(c) => {
          if (c.trim() === ADMIN_CODE) {
            setIsAdmin(true);
            setIsSpectator(false);
            setCur("admin");
            setTab("cup");
            setSub(null);
          }
        }}
      />
    );

  const openScoringBeforeLive = !!state.scoringOpenWhenHidden;
  const live = !!state.eventLive || isAdmin;
  const sledgeLive = live || isPracticeRoundLive(state);
  const scoringTabOpen = live || openScoringBeforeLive;

  return (
    <div style={S.app}>
      {(syncError || isSaving) && (
        <div
          style={{
            padding: "10px 14px",
            background: syncError ? "#fef2f2" : "#eff6ff",
            color: syncError ? "#991b1b" : "#1d4ed8",
            fontSize: 12,
            fontWeight: 600,
            textAlign: "center",
            borderBottom: `1px solid ${syncError ? "#fecaca" : "#bfdbfe"}`,
          }}
        >
          {syncError || "Syncing changes to Supabase…"}
        </div>
      )}
      <Header
        isAdmin={isAdmin}
        name={isAdmin ? "Admin" : isSpectator ? "Spectator" : getP(cur)?.short}
        playerId={isAdmin || isSpectator ? null : cur}
        live={live}
        onBack={() => {
          if (sub) {
            setSub(null);
            return;
          }
          setCur(null);
          setIsAdmin(false);
          setIsSpectator(false);
        }}
      />
      <div style={S.content}>
        {tab === "cup" && !sub && (
          <CupScreen
            state={state}
            cur={cur}
            upd={upd}
            onMatch={(id, roundId) => setSub({ t: "m", id, roundId: roundId || null })}
            live={live}
            isAdmin={isAdmin}
          />
        )}
        {tab === "cup" &&
          sub?.t === "m" &&
          (live ? (
            <MatchView
              state={state}
              upd={upd}
              isAdmin={isAdmin}
              matchId={sub.id}
              roundId={sub.roundId}
              onBack={() => setSub(null)}
            />
          ) : (
            <LockedMessage
              title="Match Details"
              msg="Match details will be revealed on game day."
              onBack={() => setSub(null)}
            />
          ))}
        {tab === "scores" &&
          !sub &&
          (scoringTabOpen ? (
            <ScoresList
              state={state}
              cur={cur}
              isAdmin={isAdmin}
              onSelect={(r, p) => setSub({ t: "sc", r, p })}
            />
          ) : (
            <LockedPage
              title="Scoring"
              msg="Scoring will open once admin enables open scoring."
              icon="⛳"
            />
          ))}
        {tab === "scores" && sub?.t === "sc" && (
          <ScoreEntry
            state={state}
            upd={upd}
            roundId={sub.r}
            playerId={sub.p || cur}
            isAdmin={isAdmin}
            cur={cur}
            onBack={() => setSub(null)}
          />
        )}
        {tab === "sledge" && !sub && (
          <SledgeFeedPage state={state} cur={cur} live={sledgeLive} />
        )}
        {tab === "leaders" && !sub && (
          <LeaderList onSelect={(id) => setSub({ t: "lb", id })} />
        )}
        {tab === "leaders" && sub?.t === "lb" && (
          <LeaderView
            state={state}
            catId={sub.id}
            live={live}
            isAdmin={isAdmin}
            onBack={() => setSub(null)}
            onOpenMatch={(roundId, matchId) => {
              setTab("cup");
              setSub({ t: "m", id: matchId, roundId });
            }}
            onOpenPracticeScorecard={({ roundId, practiceTeamId, focusPlayerId }) => {
              setSub({
                t: "practice_sc",
                roundId,
                practiceTeamId,
                focusPlayerId: focusPlayerId || null,
                fromCatId: sub.id,
              });
            }}
          />
        )}
        {tab === "leaders" && sub?.t === "practice_sc" && (
          <PracticeRoundScorecardView
            state={state}
            roundId={sub.roundId}
            practiceTeamId={sub.practiceTeamId}
            focusPlayerId={sub.focusPlayerId}
            onBack={() => setSub({ t: "lb", id: sub.fromCatId || "practice" })}
          />
        )}
        {tab === "schedule" && !sub && (
          <ScheduleMenu onSelect={(id) => setSub({ t: "sched", id })} />
        )}
        {tab === "schedule" &&
          sub?.t === "sched" &&
          sub.id === "matches" && (
            <MatchSchedule
              state={state}
              isAdmin={isAdmin}
              onOpenMatch={(matchId) => {
                setTab("cup");
                setSub({ t: "m", id: matchId });
              }}
              onBack={() => setSub(null)}
            />
          )}
        {tab === "schedule" && sub?.t === "sched" && sub.id === "trip" && (
          <TripSchedule onBack={() => setSub(null)} />
        )}
        {tab === "schedule" && sub?.t === "sched" && sub.id === "pkrooms" && (
          <PkRoomsPage onBack={() => setSub(null)} />
        )}
        {tab === "schedule" && sub?.t === "sched" && sub.id === "rules" && (
          <RulesPage state={state} onBack={() => setSub(null)} />
        )}
        {tab === "schedule" && sub?.t === "sched" && sub.id === "summaries" && (
          <SummaryHubPage
            state={state}
            cur={cur}
            upd={upd}
            onBack={() => setSub(null)}
          />
        )}
        {tab === "schedule" && sub?.t === "sched" && sub.id === "champions" && (
          <PastChampionsPage onBack={() => setSub(null)} />
        )}
        {tab === "players" && (
          <PlayersPage state={state} upd={upd} isAdmin={isAdmin} live={live} />
        )}
      </div>
      {summaryPopup && (
        <DailySummaryModal
          summary={summaryPopup}
          onClose={() => {
            const active = summaryPopup;
            setSummaryPopup(null);
            if (cur && cur !== "admin" && cur !== "spectator") {
              upd((s) => {
                if (!s.summaryReads) s.summaryReads = {};
                if (!s.summaryReads[cur]) s.summaryReads[cur] = {};
                s.summaryReads[cur][active.roundId] = true;
              });
            }
          }}
        />
      )}
      <SponsorFooter />
      <NavBar
        tab={tab}
        isSpectator={isSpectator}
        onTab={(t) => {
          setTab(t);
          setSub(null);
        }}
      />
    </div>
  );
}

function AccessGate({ onGrant, onSpectator }) {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState(false);
  if (!APP_PASSWORD) {
    return (
      <div
        style={{
          ...S.app,
          background: "#f8faf8",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "48px 20px 32px",
            maxWidth: 400,
            margin: "0 auto",
            flex: 1,
            width: "100%",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <img
            src={LOGO}
            alt="Spinners Cup"
            style={{
              width: 220,
              height: 220,
              objectFit: "contain",
              margin: "0 auto 10px",
              display: "block",
            }}
          />
          <p
            style={{
              fontSize: 13,
              color: "#64748b",
              textAlign: "center",
              marginBottom: 16,
            }}
          >
            No app password configured. Tap continue to open the event app.
          </p>
          <button
            onClick={onGrant}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 10,
              border: "none",
              background: "#2d6a4f",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
              fontSize: 14,
              minHeight: 44,
              marginBottom: 10,
            }}
          >
            Continue
          </button>
          <button
            onClick={onSpectator}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: "#fff",
              color: "#334155",
              fontWeight: 700,
              cursor: "pointer",
              fontSize: 14,
              minHeight: 44,
            }}
          >
            Continue as spectator
          </button>
        </div>
        <SponsorFooter />
      </div>
    );
  }

  return (
    <div
      style={{
        ...S.app,
        background: "#f8faf8",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "48px 20px 32px",
          maxWidth: 400,
          margin: "0 auto",
          flex: 1,
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <img
            src={LOGO}
            alt="Spinners Cup"
            style={{
              width: 220,
              height: 220,
              objectFit: "contain",
              marginBottom: 8,
              display: "block",
              marginLeft: "auto",
              marginRight: "auto",
            }}
          />
          <h1
            style={{
              fontFamily: "'Playfair Display',serif",
              fontSize: 26,
              fontWeight: 800,
              color: "#1a2e1a",
              margin: "0 0 4px",
            }}
          >
            Spinners Cup 2026
          </h1>
          <p style={{ fontSize: 13, color: "#6b8a6e", margin: 0 }}>
            Enter password to continue
          </p>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setErr(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (password.trim() === APP_PASSWORD) onGrant();
              else setErr(true);
            }
          }}
          placeholder="Event password"
          style={{ ...S.input, marginBottom: 10 }}
        />
        <button
          onClick={() => {
            if (password.trim() === APP_PASSWORD) onGrant();
            else setErr(true);
          }}
          style={{
            width: "100%",
            padding: "11px 16px",
            borderRadius: 10,
            border: "none",
            background: "#2d6a4f",
            color: "#fff",
            fontWeight: 700,
            cursor: "pointer",
            fontSize: 14,
            minHeight: 44,
            marginBottom: 10,
          }}
        >
          Enter
        </button>
        <button
          onClick={onSpectator}
          style={{
            width: "100%",
            padding: "11px 16px",
            borderRadius: 10,
            border: "1px solid #d1d5db",
            background: "#fff",
            color: "#334155",
            fontWeight: 700,
            cursor: "pointer",
            fontSize: 14,
            minHeight: 44,
          }}
        >
          Continue as spectator
        </button>
        {err && (
          <p
            style={{
              color: "#dc2626",
              fontSize: 12,
              marginTop: 10,
              textAlign: "center",
            }}
          >
            Incorrect password
          </p>
        )}
      </div>
      <SponsorFooter />
    </div>
  );
}

function PlayerSelect({
  state,
  lockedPlayerId,
  onSelect,
  onUnlockSelection,
  onSpectator,
  onAdmin,
}) {
  const [selectedRole, setSelectedRole] = useState(lockedPlayerId ? "player" : "");
  const [showAdminEntry, setShowAdminEntry] = useState(false);
  const [code, setCode] = useState("");
  const [err, setErr] = useState(false);
  const live = !!state?.eventLive;
  const playerOrder = [
    "chris",
    "angus",
    "jason",
    "tom",
    "alex",
    "nick",
    "cam",
    "callum",
    "luke",
    "jturner",
    "lach",
    "jkelly",
  ];
  const displayPlayers = playerOrder.map((id) => getP(id)).filter(Boolean);
  const [selectedPlayerId, setSelectedPlayerId] = useState(lockedPlayerId || "");

  const roleCards = [
    {
      key: "player",
      emoji: "🏌️",
      title: "I’m Playing",
      hint: lockedPlayerId
        ? "This device is already linked to a player profile."
        : "Lock this phone to your scorecard, predictions, and player view.",
      tone: "#ecfdf5",
      border: "#86efac",
    },
    {
      key: "spectator",
      emoji: "👀",
      title: "I’m Watching",
      hint: "Jump straight into live matches, leaders, and the timeline.",
      tone: "#eff6ff",
      border: "#93c5fd",
    },
    {
      key: "admin",
      emoji: "🔒",
      title: "I’m Admin",
      hint: "Open scoring controls, launches, and event setup tools.",
      tone: "#faf5ff",
      border: "#d8b4fe",
    },
  ];

  return (
    <div
      style={{
        ...S.app,
        background: "#f8faf8",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "48px 20px 32px",
          maxWidth: 420,
          margin: "0 auto",
          flex: 1,
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <img
            src={LOGO}
            alt="Spinners Cup"
            style={{
              width: 220,
              height: 220,
              objectFit: "contain",
              marginBottom: 8,
              display: "block",
              marginLeft: "auto",
              marginRight: "auto",
            }}
          />
          <h1
            style={{
              fontFamily: "'Playfair Display',serif",
              fontSize: 26,
              fontWeight: 800,
              color: "#1a2e1a",
              margin: "0 0 4px",
            }}
          >
            Spinners Cup 2026
          </h1>
          <p style={{ fontSize: 13, color: "#6b8a6e", margin: 0 }}>
            Mornington Peninsula · March 27–29
          </p>
        </div>

        <div
          style={{
            ...S.card,
            background: live ? "#eff6ff" : "#f8fafc",
            border: `1px solid ${live ? "#bfdbfe" : "#dbeafe"}`,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: 0.8,
              color: live ? "#1d4ed8" : "#475569",
              marginBottom: 6,
            }}
          >
            Start here
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: "#0f172a",
              fontFamily: "'Playfair Display',serif",
              marginBottom: 6,
            }}
          >
            Pick how you’re joining the weekend.
          </div>
          <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.55 }}>
            Players can lock this device to one scorecard for the trip. Spectators
            can browse freely. Admin access unlocks controls and can reassign a
            locked device later.
          </div>
        </div>

        {lockedPlayerId && (
          <div
            style={{
              ...S.card,
              background: "#fff7ed",
              border: "1px solid #fdba74",
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, color: "#9a3412" }}>
              This phone is currently locked to {getP(lockedPlayerId)?.name || "Unknown"}.
            </div>
            <div style={{ fontSize: 12, color: "#9a3412", marginTop: 6, lineHeight: 1.5 }}>
              You can keep playing from this profile, or use admin access below to
              unlock and reassign the device.
            </div>
          </div>
        )}

        <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
          {roleCards.map((card) => {
            const active = selectedRole === card.key;
            return (
              <button
                key={card.key}
                onClick={() => {
                  setSelectedRole(card.key);
                  setErr(false);
                  if (card.key === "spectator") onSpectator();
                  if (card.key !== "admin") setShowAdminEntry(false);
                  if (card.key === "admin") setShowAdminEntry(true);
                }}
                style={{
                  ...S.card,
                  marginBottom: 0,
                  textAlign: "left",
                  background: active ? card.tone : "#fff",
                  border: `1px solid ${active ? card.border : "#e2e8f0"}`,
                  boxShadow: active
                    ? "0 12px 28px rgba(15,23,42,0.08)"
                    : "0 1px 2px rgba(15,23,42,0.04)",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 28 }}>{card.emoji}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>
                      {card.title}
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 4, lineHeight: 1.45 }}>
                      {card.hint}
                    </div>
                  </div>
                  <div style={{ fontSize: 18, color: active ? "#0f172a" : "#cbd5e1" }}>
                    {active ? "✓" : "→"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {(selectedRole === "player" || lockedPlayerId) && (
          <div
            style={{
              ...S.card,
              background: "#ffffff",
              border: "1px solid #d4e5d4",
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, color: "#2d6a4f", marginBottom: 6 }}>
              Player setup
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12, lineHeight: 1.5 }}>
              Choose your player profile to open your scoring, match view, and round predictions.
            </div>
            <select
              value={selectedPlayerId}
              disabled={!!lockedPlayerId}
              onChange={(e) => setSelectedPlayerId(e.target.value)}
              style={{
                ...S.input,
                marginBottom: 10,
                cursor: lockedPlayerId ? "not-allowed" : "pointer",
                opacity: lockedPlayerId ? 0.7 : 1,
              }}
            >
              <option value="">Select your name</option>
              {displayPlayers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => selectedPlayerId && onSelect(selectedPlayerId)}
              disabled={
                !selectedPlayerId ||
                (!!lockedPlayerId && lockedPlayerId !== selectedPlayerId)
              }
              style={{
                width: "100%",
                padding: "11px 16px",
                borderRadius: 10,
                border: "none",
                background: "#2d6a4f",
                color: "#fff",
                fontWeight: 700,
                cursor:
                  !selectedPlayerId ||
                  (!!lockedPlayerId && lockedPlayerId !== selectedPlayerId)
                    ? "not-allowed"
                    : "pointer",
                fontSize: 14,
                minHeight: 44,
                opacity:
                  !selectedPlayerId ||
                  (!!lockedPlayerId && lockedPlayerId !== selectedPlayerId)
                    ? 0.55
                    : 1,
              }}
            >
              Open Player View
            </button>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 10, lineHeight: 1.5 }}>
              {lockedPlayerId
                ? "Admin can unlock this device later if you need to switch players."
                : "Your selection locks this phone to one player until an admin unlocks it."}
            </div>
          </div>
        )}

        {showAdminEntry && (
          <div
            style={{
              ...S.card,
              background: "#faf5ff",
              border: "1px solid #d8b4fe",
              marginBottom: 10,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, color: "#7c3aed", marginBottom: 6 }}>
              Admin access
            </div>
            <div style={{ fontSize: 12, color: "#6d28d9", marginBottom: 12, lineHeight: 1.5 }}>
              Enter the admin code to manage scoring, publish recap cards, or unlock this device.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setErr(false);
                }}
                placeholder={lockedPlayerId ? "Admin code to unlock or continue" : "Admin code"}
                style={{ ...S.input, flex: 1, marginBottom: 0 }}
              />
              <button
                onClick={() => {
                  if (ADMIN_CODE && code.trim() === ADMIN_CODE) {
                    setErr(false);
                    onAdmin(code);
                    return;
                  }
                  setErr(true);
                }}
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: "none",
                  background: "#7c3aed",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: 13,
                  minHeight: 44,
                }}
              >
                Enter
              </button>
            </div>
            {lockedPlayerId && (
              <button
                onClick={() => {
                  if (code.trim() === ADMIN_CODE) {
                    setErr(false);
                    onUnlockSelection();
                    setSelectedPlayerId("");
                    return;
                  }
                  setErr(true);
                }}
                disabled={!code.trim()}
                style={{
                  marginTop: 10,
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #c4b5fd",
                  background: "#fff",
                  color: "#6d28d9",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: !code.trim() ? "not-allowed" : "pointer",
                  opacity: !code.trim() ? 0.55 : 1,
                }}
              >
                Unlock player selection
              </button>
            )}
            {err && (
              <p
                style={{
                  color: "#dc2626",
                  fontSize: 12,
                  marginTop: 10,
                  textAlign: "left",
                }}
              >
                {ADMIN_CODE ? "Incorrect admin code" : "Admin code not configured"}
              </p>
            )}
          </div>
        )}
      </div>
      <SponsorFooter />
    </div>
  );
}

function Header({ isAdmin, name, playerId, live, onBack }) {
  return (
    <div style={S.header}>
      <button
        onClick={onBack}
        style={{
          background: "none",
          border: "none",
          color: "#2d6a4f",
          cursor: "pointer",
          padding: 4,
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flex: 1,
        }}
      >
        <div style={{ width: 72, display: "flex", justifyContent: "center" }}>
          <img
            src={LOGO}
            alt=""
            style={{
              width: BANNER_LOGO_SIZE,
              height: BANNER_LOGO_SIZE,
              objectFit: "contain",
            }}
          />
        </div>
        <div style={{ textAlign: "center" }}>
          <h1
            style={{
              fontFamily: "'Playfair Display',serif",
              fontSize: 17,
              fontWeight: 800,
              color: "#1a2e1a",
              margin: 0,
            }}
          >
            Spinners Cup 2026
          </h1>
          <p style={{ fontSize: 10, color: "#94a3b8", margin: 0 }}>
            {isAdmin ? "🔑 Admin" : name}
          </p>
        </div>
        <div style={{ width: 72, display: "flex", justifyContent: "center" }}>
          {playerId ? (
            <PlayerAvatar
              id={playerId}
              size={BANNER_PHOTO_SIZE}
              live={live}
              border={false}
              priority="high"
            />
          ) : (
            <div style={{ width: BANNER_PHOTO_SIZE }} />
          )}
        </div>
      </div>
    </div>
  );
}

function NavBar({ tab, isSpectator, onTab }) {
  const items = isSpectator
    ? [
        { k: "cup", l: "Cup", e: "🏆" },
        { k: "sledge", l: "Live", e: "📣" },
        { k: "leaders", l: "Leaders", e: "📊" },
        { k: "schedule", l: "Info", e: "📋" },
        { k: "players", l: "Players", e: "👥" },
      ]
    : [
        { k: "cup", l: "Cup", e: "🏆" },
        { k: "scores", l: "Scores", e: "⛳" },
        { k: "sledge", l: "Live", e: "📣" },
        { k: "leaders", l: "Leaders", e: "📊" },
        { k: "schedule", l: "Info", e: "📋" },
        { k: "players", l: "Players", e: "👥" },
      ];
  return (
    <div style={S.nav}>
      {items.map(({ k, l, e }) => (
        <button
          key={k}
          onClick={() => onTab(k)}
          style={{
            ...S.navBtn,
            color: tab === k ? "#2d6a4f" : "#94a3b8",
            fontWeight: tab === k ? 700 : 400,
          }}
        >
          <span style={{ fontSize: 16 }}>{e}</span>
          <span style={{ fontSize: 9, marginTop: 1 }}>{l}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Locked States ───────────────────────────────────────────
function LockedPage({ title, msg, icon }) {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px" }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>{icon || "🔒"}</div>
      <h2
        style={{
          fontFamily: "'Playfair Display',serif",
          fontSize: 22,
          fontWeight: 700,
          color: "#1a2e1a",
          marginBottom: 8,
        }}
      >
        {title}
      </h2>
      <p
        style={{
          fontSize: 14,
          color: "#64748b",
          lineHeight: 1.6,
          maxWidth: 280,
          margin: "0 auto",
        }}
      >
        {msg}
      </p>
    </div>
  );
}

function LockedMessage({ title, msg, onBack }) {
  return (
    <div>
      <button onClick={onBack} style={S.backBtn}>
        ← Back
      </button>
      <div style={{ textAlign: "center", padding: "48px 20px" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
        <h2
          style={{
            fontFamily: "'Playfair Display',serif",
            fontSize: 20,
            fontWeight: 700,
            color: "#1a2e1a",
            marginBottom: 8,
          }}
        >
          {title}
        </h2>
        <p
          style={{
            fontSize: 14,
            color: "#64748b",
            lineHeight: 1.6,
            maxWidth: 300,
            margin: "0 auto",
          }}
        >
          {msg}
        </p>
      </div>
    </div>
  );
}

// ─── Cup Screen ──────────────────────────────────────────────
function CupScreen({ state, cur, upd, onMatch, live, isAdmin }) {
  if (!state?.eventLive) {
    const practiceRound = ROUNDS.find((r) => r.id === "r0");
    const practiceCourse = practiceRound ? getCourse(practiceRound.courseId) : null;

    const individualRows = practiceCourse
      ? PLAYERS.filter((p) => PRACTICE_PLAYER_IDS.includes(p.id))
          .map((p) => {
            const sc = state.scores?.[practiceRound.id]?.[p.id] || [];
            return {
              ...p,
              score: pStab(
                sc,
                practiceCourse,
                courseHcp(
                  state.handicaps?.[p.id],
                  practiceCourse,
                  getTeeKey(state, practiceCourse.id),
                ),
              ),
              holes: sc.filter((s) => holeFilled(s)).length,
            };
          })
          .sort((a, b) => b.score - a.score)
      : [];

    const teamRows = practiceCourse
      ? PRACTICE_TEAMS.map((team, idx) => {
          const totals = practiceTeamStablefordTotals({
            state,
            round: practiceRound,
            course: practiceCourse,
            team,
          });
          return {
            id: team.id,
            rankSeed: idx,
            players: team.playerIds.map((playerId) => getP(playerId)?.short),
            score: totals.score,
            holes: totals.holes,
          };
        }).sort((a, b) => b.score - a.score || a.rankSeed - b.rankSeed)
      : [];

    const rankLabel = (idx) =>
      idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1;

    return (
      <div>
        <div style={{ ...S.card, background: "#f0f9ff", borderColor: "#bfdbfe" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#1d4ed8" }}>
            Pre-live view
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#1e293b",
              marginTop: 2,
            }}
          >
            Practice Round Leaderboards
          </div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 4, lineHeight: 1.45 }}>
            The app is currently in pre-live mode, so this page shows live practice
            standings for both individual and 3-ball team events.
          </div>
        </div>

        <h2 style={{ ...S.sectTitle, marginTop: 16, marginBottom: 10 }}>
          Practice Stableford
        </h2>
        {individualRows.map((row, idx) => (
          <div
            key={row.id}
            style={{
              ...S.card,
              marginBottom: 8,
              borderLeft: `3px solid ${idx === 0 ? "#16a34a" : "#cbd5e1"}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 24,
                  textAlign: "center",
                  fontSize: idx < 3 ? 16 : 13,
                  fontWeight: 700,
                  color: "#94a3b8",
                }}
              >
                {rankLabel(idx)}
              </div>
              <PlayerAvatar id={row.id} size={LEADER_SINGLE_PHOTO_SIZE} live={true} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>
                  {row.name}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: "#2d6a4f",
                    fontFamily: "'JetBrains Mono',monospace",
                  }}
                >
                  {row.score}
                </div>
                <div style={{ fontSize: 10, color: "#94a3b8" }}>({row.holes}/18)</div>
              </div>
            </div>
          </div>
        ))}

        <h2 style={{ ...S.sectTitle, marginTop: 16, marginBottom: 10 }}>
          Practice 3-Ball Teams
        </h2>
        {teamRows.map((row, idx) => (
          <div
            key={row.id}
            style={{
              ...S.card,
              marginBottom: 8,
              borderLeft: `3px solid ${idx === 0 ? "#16a34a" : "#cbd5e1"}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 24,
                  textAlign: "center",
                  fontSize: idx < 3 ? 16 : 13,
                  fontWeight: 700,
                  color: "#94a3b8",
                }}
              >
                {rankLabel(idx)}
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#1e293b",
                    lineHeight: 1.25,
                  }}
                >
                  {row.players.join(" / ")}
                </div>
                <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>
                  Best 2 scores count
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: "#2d6a4f",
                    fontFamily: "'JetBrains Mono',monospace",
                  }}
                >
                  {row.score}
                </div>
                <div style={{ fontSize: 10, color: "#94a3b8" }}>({row.holes}/18)</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  let bT = 0,
    gT = 0,
    bLive = 0,
    gLive = 0;
  ROUNDS.forEach((r) => {
    if (!isRoundRevealed(state, r.id, live, isAdmin)) return;
    r.matches.forEach((m) => {
      const res = matchStatus(state, m, r);
      if (res.status === "done") {
        if (res.winner === "blue") bT += 1;
        else if (res.winner === "grey") gT += 1;
        else {
          bT += 0.5;
          gT += 0.5;
        }
      }
      if (res.status === "live") {
        if (res.bUp > 0) bLive += 1;
        else if (res.bUp < 0) gLive += 1;
        else {
          bLive += 0.5;
          gLive += 0.5;
        }
      }
    });
  });
  const cupWinner = bT > 4.5 ? "blue" : gT > 4.5 ? "grey" : null;
  const bInterim = bT + bLive;
  const gInterim = gT + gLive;
  const totalPoints = 9;
  const blocks = Array.from({ length: totalPoints }, (_, i) => i);
  const fmt = (n) => (n % 1 === 0 ? n : n.toFixed(1));
  const showLiveTotals = live && (bLive > 0 || gLive > 0);
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const blockFill = (points, idx) => clamp(points - idx, 0, 1);
  const segStep = 0.5;
  const segments = Array.from(
    { length: Math.round(totalPoints / segStep) },
    (_, i) => i + 1,
  );

  const statusSeg = (side, segVal) => {
    const official = side === "blue" ? bT : gT;
    const interim = side === "blue" ? bInterim : gInterim;
    const dark = side === "blue" ? "#D4A017" : "#B91C1C";
    const light = side === "blue" ? "#F6DB86" : "#FCA5A5";
    if (segVal <= official) return dark;
    if (segVal <= interim) return light;
    return "#e5e7eb";
  };

  return (
    <div>
      {cupWinner && live && (
        <div
          style={{
            background:
              cupWinner === "blue"
                ? "linear-gradient(135deg,#fff7cc,#fde68a,#facc15)"
                : "linear-gradient(135deg,#fee2e2,#fca5a5,#ef4444)",
            borderRadius: 20,
            padding: "20px 18px",
            marginBottom: 16,
            border: `1px solid ${cupWinner === "blue" ? "#f59e0b" : "#ef4444"}`,
            boxShadow: "0 16px 32px rgba(15,23,42,0.14)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              right: -18,
              top: -14,
              fontSize: 76,
              opacity: 0.2,
            }}
          >
            {cupWinner === "blue" ? "🏆" : "🎉"}
          </div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: cupWinner === "blue" ? "#92400e" : "#7f1d1d",
              marginBottom: 6,
            }}
          >
            Spinners Cup decided
          </div>
          <div
            style={{
              fontFamily: "'Playfair Display',serif",
              fontSize: 28,
              fontWeight: 800,
              color: cupWinner === "blue" ? "#78350f" : "#7f1d1d",
              marginBottom: 6,
            }}
          >
            {getTeamLabel(state, cupWinner)} Wins!
          </div>
          <div
            style={{
              fontSize: 13,
              lineHeight: 1.5,
              color: cupWinner === "blue" ? "#78350f" : "#7f1d1d",
              maxWidth: 280,
            }}
          >
            The Cup is officially done and dusted with{" "}
            {fmt(cupWinner === "blue" ? bT : gT)} points on the board. Cue the
            chest-puffing, forced speeches, and deeply reluctant applause.
          </div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              marginTop: 12,
              padding: "8px 12px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.55)",
              fontSize: 12,
              fontWeight: 700,
              color: cupWinner === "blue" ? "#92400e" : "#7f1d1d",
            }}
          >
            <span>
              {cupWinner === "blue"
                ? "✨ Gold jackets on"
                : "🎊 Red confetti deployed"}
            </span>
            <span>
              {fmt(bT)} - {fmt(gT)}
            </span>
          </div>
        </div>
      )}

      <div
        style={{
          background: "linear-gradient(135deg,#f0f7f0,#e8f0e8)",
          borderRadius: 16,
          padding: "20px 16px",
          marginBottom: 20,
          border: "1px solid #d4e5d4",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <div style={{ textAlign: "center", flex: 1 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#D4A017",
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              {getTeamLabel(state, "blue")}
            </div>
            <div
              style={{
                fontSize: 44,
                fontWeight: 800,
                fontFamily: "'Playfair Display',serif",
                color: "#D4A017",
              }}
            >
              {live ? fmt(bT) : "—"}
            </div>
            {showLiveTotals && (
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#A16207",
                  marginTop: -4,
                }}
              >
                Live: {fmt(bInterim)}
              </div>
            )}
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>
            vs
          </div>
          <div style={{ textAlign: "center", flex: 1 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#B91C1C",
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              {getTeamLabel(state, "grey")}
            </div>
            <div
              style={{
                fontSize: 44,
                fontWeight: 800,
                fontFamily: "'Playfair Display',serif",
                color: "#B91C1C",
              }}
            >
              {live ? fmt(gT) : "—"}
            </div>
            {showLiveTotals && (
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#B91C1C",
                  marginTop: -4,
                }}
              >
                Live: {fmt(gInterim)}
              </div>
            )}
          </div>
        </div>
        {live ? (
          <div style={{ position: "relative", paddingTop: 18 }}>
            <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
              {blocks.map((i) => {
                const rightIdx = totalPoints - 1 - i;
                const yOfficial = blockFill(bT, i);
                const yInterim = blockFill(bInterim, i);
                const rOfficial = blockFill(gT, rightIdx);
                const rInterim = blockFill(gInterim, rightIdx);
                return (
                  <div
                    key={i}
                    style={{
                      position: "relative",
                      flex: 1,
                      height: 11,
                      borderRadius: 3,
                      background: "#e5e7eb",
                      overflow: "hidden",
                    }}
                  >
                    {yOfficial > 0 && (
                      <div
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 0,
                          bottom: 0,
                          width: `${yOfficial * 100}%`,
                          background: "#D4A017",
                        }}
                      />
                    )}
                    {yInterim > yOfficial && (
                      <div
                        style={{
                          position: "absolute",
                          left: `${yOfficial * 100}%`,
                          top: 0,
                          bottom: 0,
                          width: `${(yInterim - yOfficial) * 100}%`,
                          background: "#F6DB86",
                        }}
                      />
                    )}
                    {rOfficial > 0 && (
                      <div
                        style={{
                          position: "absolute",
                          right: 0,
                          top: 0,
                          bottom: 0,
                          width: `${rOfficial * 100}%`,
                          background: "#B91C1C",
                        }}
                      />
                    )}
                    {rInterim > rOfficial && (
                      <div
                        style={{
                          position: "absolute",
                          right: `${rOfficial * 100}%`,
                          top: 0,
                          bottom: 0,
                          width: `${(rInterim - rOfficial) * 100}%`,
                          background: "#FCA5A5",
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: 4,
                transform: "translateX(-50%)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#111827",
                  lineHeight: 1,
                }}
              >
                4.5
              </div>
              <div
                style={{
                  width: 2,
                  height: 24,
                  background: "#111",
                  marginTop: 2,
                  borderRadius: 1,
                }}
              />
            </div>
          </div>
        ) : (
          <div style={{ textAlign: "center", paddingTop: 8 }}>
            <span
              style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}
            >
              Teams & scores revealed on game day
            </span>
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: -8,
          marginBottom: 14,
          fontSize: 11,
          color: "#64748b",
          fontStyle: "italic",
        }}
      >
        Click match for detailed scorecard.
      </div>

      {ROUNDS.map((round) => {
        const roundScoringOpen = isRoundScoringLive(state, round.id);
        const showMatchDetails =
          isAdmin || (!!state?.eventLive && roundScoringOpen);
        return (
          <div key={round.id} style={{ marginBottom: 20 }}>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2e1a" }}>
                {round.day}
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>
                {round.courseName}
              </div>
              {!showMatchDetails && !isAdmin && state?.eventLive && (
                <div style={{ fontSize: 10, color: "#b45309", marginTop: 2 }}>
                  Round details are hidden until open scoring is enabled.
                </div>
              )}
            </div>

            {round.matches.map((match, mi) => {
              const res = matchStatus(state, match, round);
              let bg = "#fff",
                bdr = "#e2e8f0";
              if (
                showMatchDetails &&
                (res.status === "done" || res.status === "live")
              ) {
                const ahead =
                  res.bUp > 0 ? "blue" : res.bUp < 0 ? "grey" : "even";
                if (ahead === "blue" || res.winner === "blue") {
                  bg = "#FFFBEB";
                  bdr = "#FDE68A";
                } else if (ahead === "grey" || res.winner === "grey") {
                  bg = "#FEF2F2";
                  bdr = "#FECACA";
                } else {
                  bg = "#f0fdf4";
                  bdr = "#86efac";
                }
              }
              let midTxt = "vs",
                midCol = "#94a3b8";
              if (showMatchDetails && res.status === "live") {
                midTxt =
                  res.bUp === 0 ? "All Square" : `${Math.abs(res.bUp)} Up`;
                midCol =
                  res.bUp > 0 ? "#B8860B" : res.bUp < 0 ? "#B91C1C" : "#16a34a";
              } else if (showMatchDetails && res.status === "done") {
                midTxt = res.display;
                midCol =
                  res.winner === "blue"
                    ? "#B8860B"
                    : res.winner === "grey"
                      ? "#B91C1C"
                      : "#16a34a";
              }
              return (
                <button
                  key={match.id}
                  onClick={() => {
                    if (showMatchDetails) onMatch(match.id, round.id);
                  }}
                  style={{
                    ...S.card,
                    background: bg,
                    borderColor: bdr,
                    cursor: showMatchDetails ? "pointer" : "default",
                    opacity: showMatchDetails ? 1 : 0.75,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <div style={{ flex: 1 }}>
                      <TeamPairDisplay
                        ids={match.blue}
                        live={showMatchDetails}
                        color={showMatchDetails ? "#B8860B" : "#94a3b8"}
                        state={state}
                        roundId={round.id}
                        showBadges={showMatchDetails}
                      />
                    </div>
                    <div
                      style={{
                        padding: "0 8px",
                        minWidth: 70,
                        textAlign: "center",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: midCol,
                          fontFamily: "'JetBrains Mono',monospace",
                        }}
                      >
                        {midTxt}
                      </div>
                      {showMatchDetails && res.status === "live" && (
                        <div style={{ fontSize: 8, color: "#94a3b8" }}>
                          thru {res.played}
                        </div>
                      )}
                    </div>
                    <div style={{ flex: 1, textAlign: "right" }}>
                      <TeamPairDisplay
                        ids={match.grey}
                        live={showMatchDetails}
                        color={showMatchDetails ? "#B91C1C" : "#94a3b8"}
                        align="right"
                        state={state}
                        roundId={round.id}
                        showBadges={showMatchDetails}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─── Match View ──────────────────────────────────────────────
function MatchView({ state, upd, isAdmin, matchId, roundId, onBack }) {
  let match = null;
  let round = null;

  if (roundId) {
    const scopedRound = ROUNDS.find((r) => r.id === roundId);
    const scopedMatch = scopedRound?.matches?.find((x) => x.id === matchId);
    if (scopedRound && scopedMatch) {
      round = scopedRound;
      match = scopedMatch;
    }
  }

  if (!match || !round) {
    for (const r of ROUNDS) {
      const m = r.matches.find((x) => x.id === matchId);
      if (m) {
        match = m;
        round = r;
        break;
      }
    }
  }

  if (!match) return null;
  const course = getCourse(round.courseId);
  const allIds = [...match.blue, ...match.grey];
  const tk = getTeeKey(state, round.courseId);
  const bH = match.blue.map(
    (id) => courseHcp(state.handicaps?.[id], course, tk) || 0,
  );
  const gH = match.grey.map(
    (id) => courseHcp(state.handicaps?.[id], course, tk) || 0,
  );
  const playerDailyHcp = Object.fromEntries(
    allIds.map((id) => [id, courseHcp(state.handicaps?.[id], course, tk) || 0]),
  );
  const mn = Math.min(...bH, ...gH);
  const abH = bH.map((h) => h - mn),
    agH = gH.map((h) => h - mn);
  const res = matchStatus(state, match, round);
  let runUp = 0;

  return (
    <div>
      <button onClick={onBack} style={S.backBtn}>
        ← Cup
      </button>
      <h2 style={S.sectTitle}>
        Match {round.matches.indexOf(match) + 1} — Round {round.num}
      </h2>
      <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
        {round.courseName} · {round.day}
      </p>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 16,
          padding: "10px 14px",
          background:
            res.winner === "blue"
              ? "#FFFBEB"
              : res.winner === "grey"
                ? "#FEF2F2"
                : "#f0fdf4",
          borderRadius: 10,
          border: "1px solid #e2e8f0",
        }}
      >
        <div>
          <TeamPairDisplay
            ids={match.blue}
            live={true}
            color="#B8860B"
            state={state}
            roundId={round.id}
            showBadges={true}
            fontSize={13}
          />
        </div>
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color:
              res.winner === "blue"
                ? "#B8860B"
                : res.winner === "grey"
                  ? "#B91C1C"
                  : "#16a34a",
          }}
        >
          {res.status === "ns"
            ? "vs"
            : res.status === "live"
              ? res.bUp === 0
                ? "All Square"
                : res.bUp > 0
                  ? `${getTeamName(state, "blue")} ${res.bUp} Up`
                  : `${getTeamName(state, "grey")} ${Math.abs(res.bUp)} Up`
              : res.display}
        </span>
        <div>
          <TeamPairDisplay
            ids={match.grey}
            live={true}
            color="#B91C1C"
            align="right"
            state={state}
            roundId={round.id}
            showBadges={true}
            fontSize={13}
          />
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 11,
            fontFamily: "'DM Sans',sans-serif",
          }}
        >
          <thead>
            <tr style={{ background: "#f8faf8" }}>
              <th style={S.th}>Hole</th>
              <th style={S.th}>Par</th>
              {allIds.map((id) => (
                <th
                  key={id}
                  style={{
                    ...S.th,
                    color: getP(id)?.team === "blue" ? "#B8860B" : "#B91C1C",
                    fontSize: 9,
                  }}
                >
                  {getP(id)?.short}{" "}
                  {chulliganBadges(getChulliganCount(state, round.id, id))}
                </th>
              ))}
              <th style={{ ...S.th, color: "#B8860B", fontSize: 9 }}>
                {getTeamName(state, "blue")}
              </th>
              <th style={{ ...S.th, color: "#B91C1C", fontSize: 9 }}>
                {getTeamName(state, "grey")}
              </th>
              <th style={{ ...S.th, fontSize: 9 }}>Result</th>
            </tr>
          </thead>
          <tbody>
            {course.holes.map((h, i) => {
              const holeNumber = i + 1;
              const pD = allIds.map((id, pi) => {
                const isB = match.blue.includes(id);
                const adjH = isB
                  ? abH[match.blue.indexOf(id)]
                  : agH[match.grey.indexOf(id)];
                const dailyH = playerDailyHcp[id] || 0;
                const gross = state.scores?.[round.id]?.[id]?.[i] || 0;
                const isPU = isPickup(gross);
                const matchPts = isPU
                  ? 0
                  : sPts(gross, h.par, hStrokes(adjH, h));
                const displayPts = isPU
                  ? 0
                  : sPts(gross, h.par, hStrokes(dailyH, h));
                return {
                  gross,
                  matchPts,
                  displayPts,
                  isB,
                  isPU,
                  filled: holeFilled(gross),
                };
              });
              const blueHas = pD.some((d) => d.isB && d.filled);
              const greyHas = pD.some((d) => !d.isB && d.filled);
              const bothScored = blueHas && greyHas;
              const bMatchPts = pD.filter((d) => d.isB).map((d) => d.matchPts);
              const gMatchPts = pD.filter((d) => !d.isB).map((d) => d.matchPts);
              const bDisplayPts = pD
                .filter((d) => d.isB)
                .map((d) => d.displayPts);
              const gDisplayPts = pD
                .filter((d) => !d.isB)
                .map((d) => d.displayPts);
              const forcedBlueId = getForcedMatchPlayScorerId(
                round,
                match,
                "blue",
                holeNumber,
              );
              const forcedBlueMatchPts =
                forcedBlueId != null
                  ? pD.find(
                      (_, idx) => allIds[idx] === forcedBlueId,
                    )?.matchPts
                  : null;
              const forcedBlueDisplayPts =
                forcedBlueId != null
                  ? pD.find(
                      (_, idx) => allIds[idx] === forcedBlueId,
                    )?.displayPts
                  : null;
              const bestBMatch =
                  forcedBlueMatchPts ?? Math.max(...bMatchPts),
                bestGMatch = Math.max(...gMatchPts);
              const bestBDisplay =
                  forcedBlueDisplayPts ?? Math.max(...bDisplayPts),
                bestGDisplay = Math.max(...gDisplayPts);
              let hRes = "",
                resCol = "#94a3b8";
              if (bothScored) {
                if (bestBMatch > bestGMatch) {
                  runUp++;
                  hRes = "🟡";
                  resCol = "#B8860B";
                } else if (bestGMatch > bestBMatch) {
                  runUp--;
                  hRes = "🔴";
                  resCol = "#B91C1C";
                } else hRes = "—";
              }
              return (
                <tr key={h.n} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={S.td}>{h.n}</td>
                  <td style={{ ...S.td, color: "#94a3b8" }}>{h.par}</td>
                  {pD.map((d, pi) => (
                    <td key={pi} style={S.td}>
                      {d.isPU ? (
                        <div>
                          <div style={{ fontWeight: 600, color: "#94a3b8" }}>
                            P
                          </div>
                          <div style={{ fontSize: 8, color: "#94a3b8" }}>
                            0pts
                          </div>
                        </div>
                      ) : d.gross > 0 ? (
                        <div>
                          <div style={{ fontWeight: 600, color: "#1e293b" }}>
                            {d.gross}
                          </div>
                          <div
                            style={{
                              fontSize: 8,
                              color: sColor(d.displayPts),
                              fontWeight: 600,
                            }}
                          >
                            {d.displayPts}pts
                          </div>
                        </div>
                      ) : isAdmin ? (
                        <input
                          type="number"
                          inputMode="numeric"
                          value=""
                          min="1"
                          max="15"
                          style={S.tblIn}
                          onChange={(e) => {
                            const v = parseInt(e.target.value) || 0;
                            const id = allIds[pi];
                            upd((s) => {
                              if (!s.scores[round.id]) s.scores[round.id] = {};
                              if (!s.scores[round.id][id])
                                s.scores[round.id][id] = Array(18).fill(0);
                              s.scores[round.id][id][i] = Math.max(
                                0,
                                Math.min(15, v),
                              );
                            });
                          }}
                        />
                      ) : (
                        <span style={{ color: "#d1d5db" }}>—</span>
                      )}
                    </td>
                  ))}
                  <td
                    style={{
                      ...S.td,
                      fontWeight: 700,
                      color: "#B8860B",
                      background:
                        bestBMatch > bestGMatch && bothScored
                          ? "#FFFBEB"
                          : "transparent",
                    }}
                  >
                    {bothScored ? bestBDisplay : blueHas ? bestBDisplay : "—"}
                  </td>
                  <td
                    style={{
                      ...S.td,
                      fontWeight: 700,
                      color: "#B91C1C",
                      background:
                        bestGMatch > bestBMatch && bothScored
                          ? "#FEF2F2"
                          : "transparent",
                    }}
                  >
                    {bothScored ? bestGDisplay : greyHas ? bestGDisplay : "—"}
                  </td>
                  <td style={{ ...S.td, textAlign: "center" }}>
                    {bothScored && (
                      <div>
                        {hRes}
                        <div
                          style={{
                            fontSize: 7,
                            color:
                              runUp > 0
                                ? "#B8860B"
                                : runUp < 0
                                  ? "#B91C1C"
                                  : "#16a34a",
                            fontWeight: 700,
                          }}
                        >
                          {runUp === 0
                            ? "AS"
                            : runUp > 0
                              ? `${getTeamInitial(state, "blue")}+${runUp}`
                              : `${getTeamInitial(state, "grey")}+${Math.abs(runUp)}`}
                        </div>
                      </div>
                    )}
                  </td>
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
                  totalPts += sPts(gross, h.par, hStrokes(dailyH, h));
                });
                return { totalPts, isB };
              });
              let blueTotalBB = 0,
                greyTotalBB = 0;
              course.holes.forEach((h, i) => {
                const bPtsArr = allIds.map((id, pi) => {
                  const isB = match.blue.includes(id);
                  const dailyH = playerDailyHcp[id] || 0;
                  const gross = state.scores?.[round.id]?.[id]?.[i] || 0;
                  return { pts: sPts(gross, h.par, hStrokes(dailyH, h)), isB };
                });
                blueTotalBB += Math.max(
                  ...bPtsArr.filter((d) => d.isB).map((d) => d.pts),
                );
                greyTotalBB += Math.max(
                  ...bPtsArr.filter((d) => !d.isB).map((d) => d.pts),
                );
              });
              const anyScored = playerTotals.some((p) => p.totalPts > 0);
              return (
                <tr
                  style={{
                    background: "#f0f7f0",
                    borderTop: "2px solid #d4e5d4",
                  }}
                >
                  <td
                    style={{
                      ...S.td,
                      fontWeight: 700,
                      fontSize: 10,
                      color: "#1a2e1a",
                    }}
                  >
                    Tot
                  </td>
                  <td style={{ ...S.td, fontWeight: 700, color: "#94a3b8" }}>
                    {course.par}
                  </td>
                  {playerTotals.map((p, pi) => (
                    <td
                      key={pi}
                      style={{
                        ...S.td,
                        fontWeight: 700,
                        color: p.isB ? "#B8860B" : "#B91C1C",
                        fontSize: 12,
                      }}
                    >
                      {p.totalPts > 0 ? p.totalPts : "—"}
                    </td>
                  ))}
                  <td
                    style={{
                      ...S.td,
                      fontWeight: 800,
                      color: "#B8860B",
                      fontSize: 12,
                      background: "#FFFBEB",
                    }}
                  >
                    {anyScored ? blueTotalBB : "—"}
                  </td>
                  <td
                    style={{
                      ...S.td,
                      fontWeight: 800,
                      color: "#B91C1C",
                      fontSize: 12,
                      background: "#FEF2F2",
                    }}
                  >
                    {anyScored ? greyTotalBB : "—"}
                  </td>
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

function SledgeFeedPage({ state, cur, live }) {
  const activeViewer =
    cur && cur !== "admin" && cur !== "spectator" ? cur : null;
  const [filter, setFilter] = useState("all");
  const [localSledgeReads, setLocalSledgeReads] = useState(() =>
    readLocalSledgeReads(activeViewer),
  );
  useEffect(() => {
    setLocalSledgeReads(readLocalSledgeReads(activeViewer));
  }, [activeViewer, state?.sledgeFeed?.length]);

  useEffect(() => {
    if (!activeViewer) return undefined;
    const syncReads = () =>
      setLocalSledgeReads(readLocalSledgeReads(activeViewer));
    window.addEventListener("storage", syncReads);
    return () => window.removeEventListener("storage", syncReads);
  }, [activeViewer]);

  const items = buildLiveTimelineItems(state);
  const filteredItems = items.filter((item) =>
    filter === "all" ? true : item.type === filter,
  );
  const unreadItems = filteredItems.filter(
    (item) => item.type === "sledge" && (!activeViewer || !localSledgeReads?.[item.id]),
  );

  useEffect(() => {
    if (!activeViewer || !unreadItems.length) return;
    const nextReads = markLocalSledgeReads(
      activeViewer,
      unreadItems.map((item) => item.id),
    );
    if (nextReads) setLocalSledgeReads(nextReads);
  }, [activeViewer, unreadItems]);

  const filterOptions = [
    { key: "all", label: "All activity" },
    { key: "sledge", label: "Banter" },
    { key: "summary", label: "Summaries" },
  ];

  return (
    <div>
      <h2 style={S.sectTitle}>Live Timeline</h2>
      <div
        style={{
          ...S.card,
          background: "linear-gradient(135deg,#fff7ed,#eef6ff)",
          border: "1px solid #cbd5e1",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: "#475569",
            textTransform: "uppercase",
            letterSpacing: 1,
            marginBottom: 6,
          }}
        >
          Matchday pulse
        </div>
        <div
          style={{
            fontFamily: "'Playfair Display',serif",
            fontSize: 22,
            fontWeight: 800,
            color: "#0f172a",
            marginBottom: 6,
          }}
        >
          Live banter, recap drops, and round moments in one feed.
        </div>
        <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
          Follow the weekend as it unfolds: auto-fired sledges, released round summaries,
          and the loudest moments worth sending straight into the group chat.
        </div>
      </div>

      {!live ? (
        <LockedPage
          title="Live Timeline"
          msg="The live feed opens when the event goes live. Until then, the weekend remains suspiciously calm."
          icon="📣"
        />
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {filterOptions.map((option) => (
              <button
                key={option.key}
                onClick={() => setFilter(option.key)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: `1px solid ${filter === option.key ? "#fdba74" : "#cbd5e1"}`,
                  background: filter === option.key ? "#fff7ed" : "#fff",
                  color: filter === option.key ? "#9a3412" : "#475569",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {option.label}
              </button>
            ))}
          </div>

          {filteredItems.length === 0 ? (
            <div
              style={{
                ...S.card,
                borderStyle: "dashed",
                background: "#fff7ed",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 34, marginBottom: 8 }}>🕰️</div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#7c2d12",
                  marginBottom: 4,
                }}
              >
                Nothing in this lane just yet
              </div>
              <div style={{ fontSize: 12, color: "#9a3412", lineHeight: 1.5 }}>
                Once the banter starts or a recap gets released, it will land here instantly.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filteredItems.map((item, idx) => {
                const isSummary = item.type === "summary";
                const isUnread =
                  item.type === "sledge" && !!activeViewer && !localSledgeReads?.[item.id];
                const round = item.roundId
                  ? ROUNDS.find((entry) => entry.id === item.roundId)
                  : null;
                return (
                  <div
                    key={item.feedKey}
                    style={{
                      ...S.card,
                      marginBottom: 0,
                      border: `1px solid ${
                        isSummary ? "#bfdbfe" : isUnread ? "#fdba74" : "#e2e8f0"
                      }`,
                      background: isSummary ? "#f8fbff" : isUnread ? "#fff7ed" : "#fff",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 8,
                      }}
                    >
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 800,
                            color: isSummary ? "#1d4ed8" : "#9a3412",
                            background: isSummary ? "#dbeafe" : "#ffedd5",
                            padding: "4px 8px",
                            borderRadius: 999,
                            textTransform: "uppercase",
                            letterSpacing: 0.7,
                          }}
                        >
                          {isSummary ? "Recap drop" : `Banter #${filteredItems.length - idx}`}
                        </span>
                        {round && (
                          <span style={{ fontSize: 10, color: "#64748b", fontWeight: 700 }}>
                            Round {round.num} · {round.courseName}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: "#94a3b8" }}>
                        {new Date(item.at || Date.now()).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: isSummary ? 16 : 14,
                        fontWeight: isSummary ? 800 : 700,
                        color: "#0f172a",
                        marginBottom: 6,
                        fontFamily: isSummary ? "'Playfair Display',serif" : "'DM Sans',sans-serif",
                      }}
                    >
                      {isSummary ? item.title : item.message}
                    </div>
                    {isSummary ? (
                      <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                        {item.message}
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: "#7c2d12", lineHeight: 1.55 }}>
                        {item.message}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ScoresList({ state, cur, isAdmin, onSelect }) {
  return (
    <div>
      <h2 style={S.sectTitle}>Enter Scores</h2>
      {ROUNDS.map((round) => {
        const scoringLive = isRoundScoringLive(state, round.id);
        return (
          <div key={round.id} style={{ marginBottom: 20 }}>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2e1a" }}>
                Round {round.num} — {round.day}
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>
                {round.courseName}
              </div>
              {!scoringLive && !isAdmin && (
                <div style={{ fontSize: 10, color: "#b45309", marginTop: 2 }}>
                  Scoring locked by admin
                </div>
              )}
            </div>
            {(isAdmin ? PLAYERS : PLAYERS.filter((p) => p.id === cur)).map(
              (p) => {
                const sc = state.scores?.[round.id]?.[p.id] || [];
                const filled = sc.filter((s) => holeFilled(s)).length;
                const course = getCourse(round.courseId);
                const dH = courseHcp(
                  state.handicaps?.[p.id],
                  course,
                  getTeeKey(state, course.id),
                );
                const pts = pStab(sc, course, dH);
                const sub = isSubmitted(state, round.id, p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => onSelect(round.id, p.id)}
                    disabled={!isAdmin && !scoringLive}
                    style={{
                      ...S.card,
                      borderLeft: `3px solid ${p.team === "blue" ? "#D4A017" : "#DC2626"}`,
                      background: sub ? "#f0fdf4" : "#fff",
                      opacity: !isAdmin && !scoringLive ? 0.65 : 1,
                      cursor:
                        !isAdmin && !scoringLive ? "not-allowed" : "pointer",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: "#1e293b",
                          }}
                        >
                          {p.name}{" "}
                          {sub && (
                            <span style={{ fontSize: 11, color: "#16a34a" }}>
                              ✓ Submitted
                            </span>
                          )}
                        </div>
                        {dH != null && (
                          <div style={{ fontSize: 10, color: "#94a3b8" }}>
                            HCP {dH}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div
                          style={{
                            fontSize: 11,
                            color: filled === 18 ? "#16a34a" : "#94a3b8",
                            fontFamily: "'JetBrains Mono',monospace",
                          }}
                        >
                          {filled}/18
                        </div>
                        {pts > 0 && (
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: "#2d6a4f",
                            }}
                          >
                            {pts}pts
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              },
            )}
          </div>
        );
      })}
    </div>
  );
}

function PracticeRoundScorecardView({
  state,
  roundId,
  practiceTeamId,
  focusPlayerId,
  onBack,
}) {
  const round = ROUNDS.find((r) => r.id === roundId);
  const team = PRACTICE_TEAMS.find((t) => t.id === practiceTeamId);
  if (!round || !team) return null;
  const course = getCourse(round.courseId);
  const tk = getTeeKey(state, course.id);
  const players = team.playerIds.map((playerId) => ({
    playerId,
    short: getP(playerId)?.short || "???",
    dailyHcp: courseHcp(state.handicaps?.[playerId], course, tk) || 0,
    scores: state.scores?.[round.id]?.[playerId] || [],
  }));
  const holeData = course.holes.map((h, i) => {
    const entries = players.map((player) => {
      const gross = player.scores[i] || 0;
      const filled = holeFilled(gross);
      const isPU = isPickup(gross);
      const pts =
        gross > 0 || isPU ? sPts(gross, h.par, hStrokes(player.dailyHcp, h)) : 0;
      return { ...player, gross, filled, isPU, pts };
    });
    const taken = [...entries]
      .filter((entry) => entry.filled)
      .sort((a, b) => b.pts - a.pts)
      .slice(0, 2);
    const takenIds = new Set(taken.map((entry) => entry.playerId));
    const teamScore = taken.reduce((sum, entry) => sum + entry.pts, 0);
    return { h, entries, takenIds, teamScore };
  });

  return (
    <div>
      <button onClick={onBack} style={S.backBtn}>
        ← Back
      </button>
      <h2 style={S.sectTitle}>Practice Team Scorecard</h2>
      <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
        {team.playerIds.map((playerId) => getP(playerId)?.short).join(" / ")} ·{" "}
        {round.courseName}
        {focusPlayerId ? ` · Opened from ${getP(focusPlayerId)?.short}` : ""}
      </p>
      <div
        style={{
          ...S.card,
          borderColor: "#bbf7d0",
          background: "#f0fdf4",
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 11, color: "#166534", fontWeight: 700 }}>
          Highlighted player scores are the two counted for team Stableford.
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 11,
            fontFamily: "'DM Sans',sans-serif",
          }}
        >
          <thead>
            <tr style={{ background: "#f8faf8" }}>
              <th style={S.th}>Hole</th>
              <th style={S.th}>Par</th>
              {players.map((player) => (
                <th key={player.playerId} style={{ ...S.th, fontSize: 9 }}>
                  {player.short}
                </th>
              ))}
              <th style={{ ...S.th, fontSize: 9, color: "#166534" }}>Team</th>
            </tr>
          </thead>
          <tbody>
            {holeData.map(({ h, entries, takenIds, teamScore }) => (
              <tr key={h.n} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={S.td}>{h.n}</td>
                <td style={{ ...S.td, color: "#94a3b8" }}>{h.par}</td>
                {entries.map((entry) => (
                  <td
                    key={`${h.n}_${entry.playerId}`}
                    style={{
                      ...S.td,
                      background: takenIds.has(entry.playerId)
                        ? "#ecfdf5"
                        : "transparent",
                    }}
                  >
                    {entry.isPU ? (
                      <div>
                        <div style={{ fontWeight: 600, color: "#94a3b8" }}>P</div>
                        <div style={{ fontSize: 8, color: "#94a3b8" }}>0pts</div>
                      </div>
                    ) : entry.gross > 0 ? (
                      <div>
                        <div style={{ fontWeight: 600, color: "#1e293b" }}>
                          {entry.gross}
                        </div>
                        <div
                          style={{
                            fontSize: 8,
                            color: sColor(entry.pts),
                            fontWeight: 600,
                          }}
                        >
                          {entry.pts}pts
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: "#d1d5db" }}>—</span>
                    )}
                  </td>
                ))}
                <td
                  style={{
                    ...S.td,
                    fontWeight: 700,
                    color: "#166534",
                    background: takenIds.size === 2 ? "#dcfce7" : "transparent",
                  }}
                >
                  {takenIds.size ? teamScore : "—"}
                </td>
              </tr>
            ))}
            <tr style={{ borderTop: "2px solid #e2e8f0", background: "#f8fafc" }}>
              <td style={{ ...S.td, fontWeight: 700 }}>Total</td>
              <td style={{ ...S.td, color: "#94a3b8" }}>—</td>
              {players.map((player) => (
                <td key={`total_${player.playerId}`} style={{ ...S.td, fontWeight: 700 }}>
                  {pStab(player.scores, course, player.dailyHcp)}
                </td>
              ))}
              <td style={{ ...S.td, fontWeight: 800, color: "#166534" }}>
                {holeData.reduce((sum, row) => sum + row.teamScore, 0)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Score Entry ─────────────────────────────────────────────
function ScoreEntry({ state, upd, roundId, playerId, isAdmin, cur, onBack }) {
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [showHoleInfo, setShowHoleInfo] = useState(null); // hole index or null
  const [showRoundKickoff, setShowRoundKickoff] = useState(false);
  const [pendingCompClaim, setPendingCompClaim] = useState(null);

  const round = ROUNDS.find((r) => r.id === roundId);
  const course = getCourse(round.courseId);
  const player = getP(playerId);
  const partnerId = getPartner(playerId, roundId);
  const partner = partnerId ? getP(partnerId) : null;

  const isMine = playerId === cur;
  const mySubmitted = isSubmitted(state, roundId, playerId);
  const roundScoringLive = isRoundScoringLive(state, roundId);
  const canEdit = isAdmin || (roundScoringLive && isMine && !mySubmitted);

  const scores = state.scores?.[roundId]?.[playerId] || [];
  const partnerScores = state.scores?.[roundId]?.[partnerId] || [];
  const dH = courseHcp(
    state.handicaps?.[playerId],
    course,
    getTeeKey(state, course.id),
  );
  const partnerDH = partnerId
    ? courseHcp(
        state.handicaps?.[partnerId],
        course,
        getTeeKey(state, course.id),
      )
    : null;

  const ntpH = getNtpHole(round.id, round.courseId),
    ldH = getLdHole(round.courseId);
  const ntpKey = `${roundId}_ntp`,
    ldKey = `${roundId}_ld`;
  const chulligansEnabled = !round.isPractice;
  const myChulligans = getChulliganRecord(state, roundId, playerId);

  let tPts = 0,
    tGross = 0;
  course.holes.forEach((h, i) => {
    const v = scores[i] || 0;
    tPts += sPts(v, h.par, hStrokes(dH, h));
    tGross += grossForHole(v, h.par);
  });
  const filled = scores.filter((s) => holeFilled(s)).length;

  useEffect(() => {
    if (!isMine) return;
    const seen = JSON.parse(
      localStorage.getItem(ROUND_KICKOFF_SEEN_KEY) || "{}",
    );
    const roundPlayerKey = `${roundId}:${playerId}`;
    if (filled > 0 || seen[roundPlayerKey]) return;
    setShowRoundKickoff(true);
    localStorage.setItem(
      ROUND_KICKOFF_SEEN_KEY,
      JSON.stringify({ ...seen, [roundPlayerKey]: true }),
    );
  }, [filled, isMine, playerId, roundId]);

  let pTotalPts = 0,
    pTotalGross = 0,
    pFilled = 0;
  if (partnerId) {
    course.holes.forEach((h, i) => {
      const v = partnerScores[i] || 0;
      pTotalPts += sPts(v, h.par, hStrokes(partnerDH, h));
      pTotalGross += grossForHole(v, h.par);
      if (holeFilled(v)) pFilled++;
    });
  }

  const firstLockedHoleIdx = course.holes.findIndex(
    (_, idx) => !canEnterHoleScores(state, roundId, playerId, idx),
  );

  const handleSubmit = () => {
    upd((s) => {
      if (!s.submitted) s.submitted = {};
      if (!s.submitted[roundId]) s.submitted[roundId] = {};
      s.submitted[roundId][playerId] = true;
    });
    setConfirmSubmit(false);
  };

  const handleUnsubmit = () => {
    upd((s) => {
      if (s.submitted?.[roundId]) s.submitted[roundId][playerId] = false;
    });
  };

  const setScore = (pid, holeIdx, val) => {
    if (!isAdmin && !canEnterHoleScores(state, roundId, pid, holeIdx))
      return;
    upd((s) => {
      if (!s.scores[roundId]) s.scores[roundId] = {};
      if (!s.scores[roundId][pid]) s.scores[roundId][pid] = Array(18).fill(0);
      const prevVal = s.scores[roundId][pid][holeIdx] || 0;
      s.scores[roundId][pid][holeIdx] = val;
      maybePushScoreSledge(s, {
        roundId,
        playerId: pid,
        holeIdx,
        prevVal,
        nextVal: val,
      });
    });
  };

  const toggleChulligan = (pid, holeIdx) => {
    if (!chulligansEnabled) return;
    const nine = holeIdx < 9 ? "front" : "back";
    upd((s) => {
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
    return {
      active: current === holeIdx,
      locked: current != null && current !== holeIdx,
    };
  };

  const confirmCompClaim = ({ type, key, playerId: claimPlayerId, hole }) => {
    upd((s) => {
      if (type === "ntp") {
        if (!s.ntpWinners) s.ntpWinners = {};
        const next = s.ntpWinners[key] === claimPlayerId ? null : claimPlayerId;
        s.ntpWinners[key] = next;
        if (next === claimPlayerId)
          maybePushCompClaimSledge(s, {
            roundId,
            playerId: claimPlayerId,
            type: "ntp",
          });
      } else {
        if (!s.ldWinners) s.ldWinners = {};
        const next = s.ldWinners[key] === claimPlayerId ? null : claimPlayerId;
        s.ldWinners[key] = next;
        if (next === claimPlayerId)
          maybePushCompClaimSledge(s, {
            roundId,
            playerId: claimPlayerId,
            type: "ld",
          });
      }
    });
    setPendingCompClaim(null);
  };

  const pendingClaimPlayer = pendingCompClaim?.playerId
    ? getP(pendingCompClaim.playerId)
    : null;
  const pendingClaimLabel = pendingCompClaim?.type === "ld" ? "Longest Drive" : "NTP";
  const pendingClaimBadge = pendingCompClaim?.type === "ld" ? "💣 Claim LD" : "⛳ Claim NTP";
  const pendingClaimCopy =
    pendingCompClaim?.type === "ld"
      ? "Confirm this only if the big dog absolutely sent it and everyone on the tee agrees it was a proper Longest Drive."
      : "Confirm this only if it really is stone-dead by the pin — if it is miles away, that is tiny-pecker optimism, not NTP.";

  return (
    <div>
      <button onClick={onBack} style={S.backBtn}>
        ← Back
      </button>

      {/* Competition Claim Popup */}
      {pendingCompClaim && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15,23,42,0.55)",
            zIndex: 220,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setPendingCompClaim(null)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 18,
              padding: "22px 20px",
              maxWidth: 380,
              width: "100%",
              boxShadow: "0 20px 60px rgba(15,23,42,0.28)",
              border: `1px solid ${pendingCompClaim.type === "ld" ? "#fdba74" : "#86efac"}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 800,
                color: pendingCompClaim.type === "ld" ? "#c2410c" : "#15803d",
                textTransform: "uppercase",
                letterSpacing: 0.8,
                marginBottom: 8,
              }}
            >
              {pendingClaimBadge}
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: "#0f172a",
                marginBottom: 8,
              }}
            >
              Confirm {pendingClaimLabel} for {pendingClaimPlayer?.short || "this player"}?
            </div>
            <p
              style={{
                fontSize: 13,
                lineHeight: 1.55,
                color: "#475569",
                margin: "0 0 10px",
              }}
            >
              Hole {pendingCompClaim.hole}. {pendingClaimCopy}
            </p>
            <p
              style={{
                fontSize: 12,
                lineHeight: 1.5,
                color: "#64748b",
                margin: "0 0 16px",
              }}
            >
              Quick vibe check: only tap confirm when the shot actually deserves the bragging rights.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() =>
                  confirmCompClaim({
                    type: pendingCompClaim.type,
                    key: pendingCompClaim.key,
                    playerId: pendingCompClaim.playerId,
                    hole: pendingCompClaim.hole,
                  })
                }
                style={{
                  flex: 1,
                  padding: "11px 12px",
                  borderRadius: 10,
                  border: "none",
                  background: pendingCompClaim.type === "ld" ? "#ea580c" : "#16a34a",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Yep, confirm it
              </button>
              <button
                onClick={() => setPendingCompClaim(null)}
                style={{
                  flex: 1,
                  padding: "11px 12px",
                  borderRadius: 10,
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  color: "#334155",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hole Info Popup */}
      {showHoleInfo !== null && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setShowHoleInfo(null)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: "20px",
              maxWidth: 380,
              width: "100%",
              maxHeight: "70vh",
              overflow: "auto",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <div>
                <div
                  style={{ fontSize: 18, fontWeight: 800, color: "#1e293b" }}
                >
                  {holeName(course.holes[showHoleInfo].n)}
                </div>
                <div style={{ fontSize: 13, color: "#64748b" }}>
                  Par {course.holes[showHoleInfo].par} ·{" "}
                  {getM(
                    course.holes[showHoleInfo],
                    getTeeKey(state, course.id),
                  )}
                  m · SI {course.holes[showHoleInfo].si}
                  {course.holes[showHoleInfo].si2
                    ? `/${course.holes[showHoleInfo].si2}/${course.holes[showHoleInfo].si2 + 18}`
                    : ""}
                </div>
              </div>
              <button
                onClick={() => setShowHoleInfo(null)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  border: "1px solid #e2e8f0",
                  background: "#f8faf8",
                  fontSize: 16,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#64748b",
                }}
              >
                ×
              </button>
            </div>
            <div style={{ fontSize: 14, color: "#475569", lineHeight: 1.7 }}>
              {HOLE_DESC[course.id]?.[showHoleInfo] ||
                "No description available."}
            </div>
            <div
              style={{
                marginTop: 12,
                fontSize: 11,
                color: "#94a3b8",
                fontStyle: "italic",
              }}
            >
              {course.name}
            </div>
          </div>
        </div>
      )}

      {/* First-time round kickoff popup */}
      {showRoundKickoff && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.58)",
            zIndex: 240,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 18,
          }}
          onClick={() => setShowRoundKickoff(false)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: "18px 16px",
              maxWidth: 420,
              width: "100%",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 8,
                marginBottom: 10,
              }}
            >
              <div>
                <div
                  style={{ fontSize: 20, fontWeight: 800, color: "#1e293b" }}
                >
                  Good luck, {player?.short || "Legend"}! ⛳
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                  {round.courseName} · Round {round.num}
                </div>
              </div>
              <button
                onClick={() => setShowRoundKickoff(false)}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  border: "1px solid #e2e8f0",
                  background: "#f8fafc",
                  cursor: "pointer",
                  color: "#64748b",
                  fontSize: 16,
                }}
              >
                ×
              </button>
            </div>

            <div
              style={{
                fontSize: 13,
                color: "#334155",
                lineHeight: 1.6,
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 10,
                padding: "10px 12px",
                marginBottom: 10,
              }}
            >
              <strong>Round Predictions:</strong>{" "}
              {getPlayerRoundPrediction(state, playerId, roundId)}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: 10,
                  padding: "10px",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#1d4ed8",
                    marginBottom: 2,
                  }}
                >
                  NTP Hole
                </div>
                <div
                  style={{ fontSize: 16, fontWeight: 800, color: "#1e3a8a" }}
                >
                  Hole {ntpH}
                </div>
              </div>
              <div
                style={{
                  background: "#fff7ed",
                  border: "1px solid #fed7aa",
                  borderRadius: 10,
                  padding: "10px",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#c2410c",
                    marginBottom: 2,
                  }}
                >
                  LD Hole
                </div>
                <div
                  style={{ fontSize: 16, fontWeight: 800, color: "#9a3412" }}
                >
                  Hole {ldH}
                </div>
              </div>
            </div>

            <div
              style={{
                fontSize: 11,
                color: "#7c2d12",
                background: "#fff7ed",
                border: "1px solid #fed7aa",
                borderRadius: 10,
                padding: "9px 10px",
                marginBottom: 10,
              }}
            >
              🏁 If you win NTP or LD, remember to{" "}
              <strong>claim it in the app</strong> during the round so it gets
              counted.
            </div>

            <div style={{ fontSize: 12, color: "#475569", marginBottom: 14 }}>
              📝 Don’t forget to{" "}
              <strong>submit your score after hole 18</strong> so it counts on
              the leaderboard.
            </div>
            <button
              onClick={() => setShowRoundKickoff(false)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "none",
                background: "#2d6a4f",
                color: "#fff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Let’s Play
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 6,
        }}
      >
        <div>
          <h2 style={{ ...S.sectTitle, marginBottom: 2 }}>
            {player?.name}{" "}
            {chulligansEnabled
              ? chulliganBadges(getChulliganCount(state, roundId, playerId))
              : ""}
          </h2>
          {chulligansEnabled && (
            <div style={{ fontSize: 10, color: "#b45309", fontWeight: 700 }}>
              🍺 Chulligans: {getChulliganCount(state, roundId, playerId)}/2
            </div>
          )}
          <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>
            {round.courseName} · {round.day}
          </p>
          {mySubmitted && (
            <div
              style={{
                fontSize: 11,
                color: "#16a34a",
                fontWeight: 600,
                marginTop: 4,
              }}
            >
              ✓ Score Submitted
            </div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "#2d6a4f",
              fontFamily: "'JetBrains Mono',monospace",
            }}
          >
            {tPts}pts
          </div>
          {tGross > 0 && (
            <div style={{ fontSize: 11, color: "#94a3b8" }}>
              Gross: {tGross}
            </div>
          )}
          <div style={{ fontSize: 10, color: "#94a3b8" }}>
            Daily HCP: {dH ?? "—"} · Slope:{" "}
            {getSlope(course, getTeeKey(state, course.id))} ·{" "}
            {getTeeLabel(course, getTeeKey(state, course.id))} Tees
          </div>
        </div>
      </div>

      {/* Partner summary bar */}
      {partner && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #e2e8f0",
            background: "#f8faff",
            marginBottom: 8,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: "#B8860B" }}>
            👥 {partner.short}{" "}
            {chulligansEnabled
              ? chulliganBadges(getChulliganCount(state, roundId, partnerId))
              : ""}
          </span>
          {chulligansEnabled && (
            <span style={{ fontSize: 10, color: "#b45309", fontWeight: 700 }}>
              🍺 {getChulliganCount(state, roundId, partnerId)}/2
            </span>
          )}
          <span
            style={{
              marginLeft: "auto",
              fontSize: 11,
              color: "#94a3b8",
              fontFamily: "'JetBrains Mono',monospace",
            }}
          >
            {pTotalPts}pts · Gross: {pTotalGross} · {pFilled}/18
          </span>
        </div>
      )}

      {!roundScoringLive && !isAdmin && (
        <div
          style={{
            padding: "8px 12px",
            marginBottom: 8,
            borderRadius: 8,
            background: "#fffbeb",
            border: "1px solid #fde68a",
            fontSize: 12,
            color: "#92400e",
            fontWeight: 600,
          }}
        >
          Scoring for this round is locked. The admin will open it on game day.
        </div>
      )}

      {roundScoringLive && isMine && !isAdmin && firstLockedHoleIdx > 0 && (
        <div
          style={{
            padding: "8px 12px",
            marginBottom: 8,
            borderRadius: 8,
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            fontSize: 12,
            color: "#1d4ed8",
            fontWeight: 600,
          }}
        >
          Enter hole {firstLockedHoleIdx} before moving to hole{" "}
          {firstLockedHoleIdx + 1}.
        </div>
      )}

      {/* Column labels */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "4px 14px",
          marginBottom: 4,
        }}
      >
        <div
          style={{
            minWidth: 72,
            fontSize: 10,
            fontWeight: 700,
            color: "#94a3b8",
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          Hole
        </div>
        <div
          style={{
            flex: 1,
            textAlign: "center",
            fontSize: 10,
            fontWeight: 700,
            color: "#94a3b8",
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          Shots
        </div>
        <div
          style={{
            minWidth: 60,
            textAlign: "right",
            fontSize: 10,
            fontWeight: 700,
            color: "#94a3b8",
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          Stableford
        </div>
        <div style={{ minWidth: 36 }} />
      </div>

      {/* Scrollable hole list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {course.holes.map((h, i) => {
          const holeUnlocked =
            isAdmin || canEnterHoleScores(state, roundId, playerId, i);
          const partnerHoleUnlocked = partnerId
            ? isAdmin || canEnterHoleScores(state, roundId, partnerId, i)
            : false;
          const val = scores[i] || 0;
          const isPU = isPickup(val);
          const strk = hStrokes(dH, h);
          const pts = sPts(val, h.par, strk);
          const isNtp = h.n === ntpH,
            isLd = h.n === ldH;
          const isNtpW = state.ntpWinners?.[ntpKey] === playerId;
          const isLdW = state.ldWinners?.[ldKey] === playerId;

          const pVal = partnerScores[i] || 0;
          const pIsPU = isPickup(pVal);
          const pStrk = hStrokes(partnerDH, h);
          const pPts = sPts(pVal, h.par, pStrk);

          let rowBg = "#fff";
          if (isPU) rowBg = "#f8f8f8";
          else if (val > 0) {
            rowBg =
              pts >= 3
                ? "#f0fdf4"
                : pts === 2
                  ? "#fafafa"
                  : pts === 1
                    ? "#fffbeb"
                    : "#fef2f2";
          }

          return (
            <div key={h.n}>
              {i === 9 && (
                <div
                  style={{
                    padding: "8px 12px",
                    background: "#f1f5f9",
                    borderRadius: 8,
                    marginBottom: 6,
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span
                    style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}
                  >
                    Front 9{" "}
                    {chulligansEnabled && myChulligans.front != null ? "🍺" : ""}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#2d6a4f",
                      fontFamily: "'JetBrains Mono',monospace",
                    }}
                  >
                    {course.holes
                      .slice(0, 9)
                      .reduce(
                        (a, _, j) =>
                          a +
                          sPts(
                            scores[j] || 0,
                            course.holes[j].par,
                            hStrokes(dH, course.holes[j]),
                          ),
                        0,
                      )}
                    pts · Gross:{" "}
                    {course.holes
                      .slice(0, 9)
                      .reduce(
                        (a, _, j) =>
                          a + grossForHole(scores[j] || 0, course.holes[j].par),
                        0,
                      )}
                  </span>
                </div>
              )}
              <div
                style={{
                  background: rowBg,
                  borderRadius: 12,
                  padding: "14px 14px",
                  border: "1px solid #e2e8f0",
                }}
              >
                {/* My score row */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 72 }}>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 4 }}
                    >
                      <span
                        style={{
                          fontSize: 18,
                          fontWeight: 800,
                          color: "#1e293b",
                        }}
                      >
                        {holeName(h.n)}
                      </span>
                      {HOLE_DESC[course.id]?.[i] && (
                        <button
                          onClick={() => setShowHoleInfo(i)}
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 10,
                            border: "1px solid #d1d5db",
                            background: "#f8faf8",
                            color: "#64748b",
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 0,
                            flexShrink: 0,
                          }}
                        >
                          i
                        </button>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: "#64748b",
                        fontWeight: 600,
                      }}
                    >
                      Par {h.par}
                    </div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>
                      {getM(h, getTeeKey(state, course.id))}m · SI {h.si}
                      {h.si2 ? `/${h.si2}/${h.si2 + 18}` : ""}
                    </div>
                    {strk > 0 && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "#2d6a4f",
                          fontWeight: 700,
                        }}
                      >
                        +{strk} shot{strk > 1 ? "s" : ""}
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    {canEdit && holeUnlocked ? (
                      <>
                        {isPU ? (
                          <div
                            onClick={() => setScore(playerId, i, 0)}
                            style={{
                              width: 64,
                              height: 56,
                              borderRadius: 10,
                              border: "2px solid #94a3b8",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 20,
                              fontWeight: 700,
                              color: "#94a3b8",
                              background: "#f1f5f9",
                              cursor: "pointer",
                            }}
                          >
                            P
                          </div>
                        ) : (
                          <input
                            type="number"
                            inputMode="numeric"
                            value={val || ""}
                            min="1"
                            max="15"
                            onChange={(e) => {
                              const v = parseInt(e.target.value) || 0;
                              setScore(
                                playerId,
                                i,
                                Math.max(0, Math.min(15, v)),
                              );
                            }}
                            style={{
                              width: 64,
                              height: 56,
                              borderRadius: 10,
                              border: "2px solid #d1d5db",
                              textAlign: "center",
                              fontFamily: "'JetBrains Mono',monospace",
                              fontSize: 26,
                              fontWeight: 700,
                              color: "#1e293b",
                              background: "#fff",
                              outline: "none",
                              WebkitAppearance: "none",
                              MozAppearance: "textfield",
                            }}
                          />
                        )}
                        <button
                          onClick={() => setScore(playerId, i, isPU ? 0 : -1)}
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 6,
                            border: `1px solid ${isPU ? "#64748b" : "#d1d5db"}`,
                            background: isPU ? "#B8860B" : "#fff",
                            color: isPU ? "#fff" : "#94a3b8",
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          P
                        </button>
                      </>
                    ) : (
                      <div
                        style={{
                          width: 64,
                          height: 56,
                          borderRadius: 10,
                          border: "1px solid #e2e8f0",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 26,
                          fontWeight: 700,
                          color: isPU ? "#94a3b8" : "#1e293b",
                          fontFamily: "'JetBrains Mono',monospace",
                          background: "#f8faf8",
                        }}
                      >
                          {!holeUnlocked && !val ? "🔒" : isPU ? "P" : val || "—"}
                        </div>
                    )}
                  </div>
                  <div
                    style={{
                      width: 60,
                      textAlign: "right",
                      flexShrink: 0,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: 6,
                    }}
                  >
                    {isPU ? (
                      <div>
                        <div
                          style={{
                            fontSize: 18,
                            fontWeight: 700,
                            color: "#94a3b8",
                            fontFamily: "'JetBrains Mono',monospace",
                          }}
                        >
                          0pts
                        </div>
                        <div style={{ fontSize: 10, color: "#94a3b8" }}>
                          Pickup
                        </div>
                      </div>
                    ) : val > 0 ? (
                      <div>
                        <div
                          style={{
                            fontSize: 22,
                            fontWeight: 700,
                            color: sColor(pts),
                            fontFamily: "'JetBrains Mono',monospace",
                          }}
                        >
                          {pts}pts
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: sColor(pts),
                          }}
                        >
                          {grossLabel(val, h.par)}
                        </div>
                      </div>
                    ) : (
                      <div style={{ color: "#d1d5db" }}>—</div>
                    )}
                    {chulligansEnabled &&
                      (() => {
                        const cState = chulliganButtonState(playerId, i);
                        return (
                          <button
                            onClick={() =>
                              canEdit && holeUnlocked && toggleChulligan(playerId, i)
                            }
                            disabled={!canEdit || !holeUnlocked || cState.locked}
                            style={{
                              padding: "4px 7px",
                              borderRadius: 6,
                              border: `1px solid ${cState.active ? "#d97706" : "#d1d5db"}`,
                              background: cState.active ? "#fffbeb" : "#fff",
                              fontSize: 12,
                              fontWeight: 700,
                              color:
                                  (!canEdit || !holeUnlocked) && !cState.active
                                    ? "#cbd5e1"
                                  : cState.locked
                                    ? "#cbd5e1"
                                    : cState.active
                                      ? "#d97706"
                                      : "#94a3b8",
                              cursor:
                                !canEdit || !holeUnlocked || cState.locked
                                  ? "not-allowed"
                                  : "pointer",
                              opacity:
                                !canEdit || !holeUnlocked || cState.locked
                                  ? 0.7
                                  : 1,
                            }}
                          >
                            {cState.active ? "✓🍺" : "🍺"}
                          </button>
                        );
                      })()}
                  </div>
                  {(isNtp || isLd) && canEdit && (
                    <button
                      onClick={() => {
                        const claimType = isNtp ? "ntp" : "ld";
                        const claimKey = isNtp ? ntpKey : ldKey;
                        const isCurrentWinner = isNtp ? isNtpW : isLdW;

                        if (isCurrentWinner) {
                          confirmCompClaim({
                            type: claimType,
                            key: claimKey,
                            playerId,
                            hole: hole.n,
                          });
                          return;
                        }

                        setPendingCompClaim({
                          type: claimType,
                          key: claimKey,
                          playerId,
                          hole: hole.n,
                        });
                      }}
                      style={{
                        padding: "4px 8px",
                        borderRadius: 6,
                        border: `1px solid ${isNtp ? (isNtpW ? "#16a34a" : "#d1d5db") : isLdW ? "#d97706" : "#d1d5db"}`,
                        background: isNtp
                          ? isNtpW
                            ? "#f0fdf4"
                            : "#fff"
                          : isLdW
                            ? "#fffbeb"
                            : "#fff",
                        fontSize: 9,
                        fontWeight: 600,
                        color: isNtp
                          ? isNtpW
                            ? "#16a34a"
                            : "#94a3b8"
                          : isLdW
                            ? "#d97706"
                            : "#94a3b8",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        marginLeft: "auto",
                      }}
                    >
                      {isNtp
                        ? isNtpW
                          ? "✓ NTP"
                          : "Claim NTP ⛳"
                        : isLdW
                          ? "✓ LD"
                          : "Claim LD 💣"}
                    </button>
                  )}
                </div>

                {/* Partner row — always visible */}
                {partner && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginTop: 10,
                      paddingTop: 10,
                      borderTop: "1px dashed #e2e8f0",
                    }}
                  >
                    <div style={{ minWidth: 72 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: "#64748b",
                        }}
                      >
                        {partner.short}
                      </div>
                      {pStrk > 0 && (
                        <div
                          style={{
                            fontSize: 11,
                            color: "#2d6a4f",
                            fontWeight: 600,
                          }}
                        >
                          +{pStrk}
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                      }}
                    >
                      {(isAdmin || (roundScoringLive && isMine && partnerHoleUnlocked)) &&
                      !isSubmitted(state, roundId, partnerId) ? (
                        <>
                          {pIsPU ? (
                            <div
                              onClick={() => setScore(partnerId, i, 0)}
                              style={{
                                width: 52,
                                height: 40,
                                borderRadius: 8,
                                border: "1.5px solid #94a3b8",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 14,
                                fontWeight: 700,
                                color: "#94a3b8",
                                background: "#f1f5f9",
                                cursor: "pointer",
                              }}
                            >
                              P
                            </div>
                          ) : (
                            <input
                              type="number"
                              inputMode="numeric"
                              value={pVal || ""}
                              min="1"
                              max="15"
                              onChange={(e) => {
                                const v = parseInt(e.target.value) || 0;
                                setScore(
                                  partnerId,
                                  i,
                                  Math.max(0, Math.min(15, v)),
                                );
                              }}
                              style={{
                                width: 52,
                                height: 40,
                                borderRadius: 8,
                                border: "1.5px solid #FECACA",
                                textAlign: "center",
                                fontFamily: "'JetBrains Mono',monospace",
                                fontSize: 18,
                                fontWeight: 600,
                                color: "#B8860B",
                                background: "#f8faff",
                                outline: "none",
                                WebkitAppearance: "none",
                                MozAppearance: "textfield",
                              }}
                            />
                          )}
                          <button
                            onClick={() =>
                              setScore(partnerId, i, pIsPU ? 0 : -1)
                            }
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: 4,
                              border: `1px solid ${pIsPU ? "#64748b" : "#d1d5db"}`,
                              background: pIsPU ? "#B8860B" : "#fff",
                              color: pIsPU ? "#fff" : "#94a3b8",
                              fontSize: 10,
                              fontWeight: 700,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            P
                          </button>
                        </>
                      ) : (
                        <div
                          style={{
                            width: 52,
                            height: 40,
                            borderRadius: 8,
                            border: "1px solid #e2e8f0",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 18,
                            fontWeight: 600,
                            color: pIsPU ? "#94a3b8" : "#B8860B",
                            fontFamily: "'JetBrains Mono',monospace",
                            background: "#fafafa",
                          }}
                        >
                          {!partnerHoleUnlocked && !pVal ? "🔒" : pIsPU ? "P" : pVal || "—"}
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        minWidth: 56,
                        textAlign: "right",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                        gap: 5,
                      }}
                    >
                      {pIsPU ? (
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>
                          0pts
                        </div>
                      ) : pVal > 0 ? (
                        <div>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              color: sColor(pPts),
                              fontFamily: "'JetBrains Mono',monospace",
                            }}
                          >
                            {pPts}pts
                          </div>
                          <div style={{ fontSize: 8, color: sColor(pPts) }}>
                            {grossLabel(pVal, h.par)}
                          </div>
                        </div>
                      ) : (
                        <div style={{ color: "#d1d5db", fontSize: 11 }}>—</div>
                      )}
                      {chulligansEnabled &&
                        (() => {
                          const cState = chulliganButtonState(partnerId, i);
                          const canEditPartner =
                            (isAdmin ||
                              (roundScoringLive && isMine && partnerHoleUnlocked)) &&
                            !isSubmitted(state, roundId, partnerId);
                          return (
                            <button
                              onClick={() =>
                                canEditPartner && toggleChulligan(partnerId, i)
                              }
                              disabled={!canEditPartner || cState.locked}
                              style={{
                                minWidth: 36,
                                padding: "4px 6px",
                                borderRadius: 6,
                                border: `1px solid ${cState.active ? "#d97706" : "#d1d5db"}`,
                                background: cState.active ? "#fffbeb" : "#fff",
                                fontSize: 11,
                                color:
                                  !canEditPartner && !cState.active
                                    ? "#cbd5e1"
                                    : cState.locked
                                      ? "#cbd5e1"
                                      : cState.active
                                        ? "#d97706"
                                        : "#94a3b8",
                                cursor:
                                  !canEditPartner || cState.locked
                                    ? "not-allowed"
                                    : "pointer",
                                opacity:
                                  !canEditPartner || cState.locked ? 0.7 : 1,
                              }}
                            >
                              {cState.active ? "✓🍺" : "🍺"}
                            </button>
                          );
                        })()}
                    </div>
                  </div>
                )}

                {!holeUnlocked && !isAdmin && (
                  <div
                    style={{
                      marginTop: 10,
                      paddingTop: 10,
                      borderTop: "1px dashed #e2e8f0",
                      fontSize: 11,
                      color: "#1d4ed8",
                      fontWeight: 600,
                    }}
                  >
                    Locked until the prior hole is scored (hole {h.n - 1}).
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Back 9 total */}
        <div
          style={{
            padding: "8px 12px",
            background: "#f1f5f9",
            borderRadius: 8,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>
            Back 9{" "}
            {chulligansEnabled && myChulligans.back != null ? "🍺" : ""}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#2d6a4f",
              fontFamily: "'JetBrains Mono',monospace",
            }}
          >
            {course.holes
              .slice(9)
              .reduce(
                (a, _, j) =>
                  a +
                  sPts(
                    scores[j + 9] || 0,
                    course.holes[j + 9].par,
                    hStrokes(dH, course.holes[j + 9]),
                  ),
                0,
              )}
            pts · Gross:{" "}
            {course.holes
              .slice(9)
              .reduce(
                (a, _, j) =>
                  a + grossForHole(scores[j + 9] || 0, course.holes[j + 9].par),
                0,
              )}
          </span>
        </div>

        {/* Total */}
        <div
          style={{
            padding: "12px 16px",
            background: "#2d6a4f",
            borderRadius: 12,
            display: "flex",
            justifyContent: "space-between",
            color: "#fff",
            fontWeight: 700,
          }}
        >
          <span>Total</span>
          <span style={{ fontFamily: "'JetBrains Mono',monospace" }}>
            {tPts}pts · Gross: {tGross}
          </span>
        </div>

        {/* Submit / Confirm section */}
        {roundScoringLive && isMine && !mySubmitted && filled === 18 && (
          <div style={{ marginTop: 8 }}>
            {!confirmSubmit ? (
              <button
                onClick={() => setConfirmSubmit(true)}
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: 12,
                  border: "none",
                  background: "#B91C1C",
                  color: "#fff",
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "'DM Sans',sans-serif",
                }}
              >
                Submit Score
              </button>
            ) : (
              <div
                style={{
                  padding: "16px",
                  background: "#fffbeb",
                  borderRadius: 12,
                  border: "1px solid #fde68a",
                }}
              >
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#92400e",
                    margin: "0 0 8px",
                    lineHeight: 1.4,
                  }}
                >
                  Confirm your score of{" "}
                  <strong>
                    {tGross} gross ({tPts} stableford pts)
                  </strong>
                  ? This will lock your scorecard.
                </p>
                <p
                  style={{ fontSize: 11, color: "#a16207", margin: "0 0 12px" }}
                >
                  {partner
                    ? `${partner.short}'s tracked scores won't be locked.`
                    : ""}
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={handleSubmit}
                    style={{
                      flex: 1,
                      padding: "10px",
                      borderRadius: 8,
                      border: "none",
                      background: "#16a34a",
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    ✓ Confirm & Submit
                  </button>
                  <button
                    onClick={() => setConfirmSubmit(false)}
                    style={{
                      flex: 1,
                      padding: "10px",
                      borderRadius: 8,
                      border: "1px solid #d1d5db",
                      background: "#fff",
                      color: "#64748b",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {roundScoringLive &&
          isMine &&
          !mySubmitted &&
          filled < 18 &&
          filled > 0 && (
            <div
              style={{
                marginTop: 8,
                padding: "10px 14px",
                background: "#f1f5f9",
                borderRadius: 10,
                textAlign: "center",
              }}
            >
              <span style={{ fontSize: 12, color: "#64748b" }}>
                {18 - filled} hole{18 - filled !== 1 ? "s" : ""} remaining
                before you can submit
              </span>
            </div>
          )}

        {mySubmitted && !isAdmin && (
          <div
            style={{
              marginTop: 8,
              padding: "12px 14px",
              background: "#f0fdf4",
              borderRadius: 10,
              textAlign: "center",
              border: "1px solid #bbf7d0",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: "#16a34a" }}>
              ✓ Score submitted and locked
            </span>
          </div>
        )}

        {isAdmin && mySubmitted && (
          <div style={{ marginTop: 8 }}>
            <button
              onClick={handleUnsubmit}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: 8,
                border: "1px solid #fca5a5",
                background: "#fff",
                color: "#dc2626",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              🔓 Unlock Score (Admin)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Leaderboards ────────────────────────────────────────────
function LeaderList({ onSelect }) {
  const cats = [
    {
      id: "spinners",
      name: "🏆 Spinners Cup",
      desc: "Cumulative stableford across 3 rounds",
    },
    { id: "practice", name: "Practice Stableford", desc: "The Dunes" },
    {
      id: "practice_teams",
      name: "Practice 3-Ball Teams",
      desc: "Best 2 stableford scores count",
    },
    { id: "d1", name: "Day 1 Stableford", desc: "St Andrews Beach" },
    { id: "d2", name: "Day 2 Stableford", desc: "PK South" },
    { id: "d3", name: "Day 3 Stableford", desc: "PK North" },
    { id: "2b1", name: "Day 1 2-Ball Best Ball", desc: "St Andrews Beach" },
    { id: "2b2", name: "Day 2 2-Ball Best Ball", desc: "PK South" },
    { id: "2b3", name: "Day 3 2-Ball Best Ball", desc: "PK North" },
    { id: "ntp", name: "📍 Nearest the Pin", desc: "Winners per round" },
    { id: "ld", name: "💪 Longest Drive", desc: "Winners per round" },
  ];
  return (
    <div>
      <h2 style={S.sectTitle}>Leaderboards</h2>
      {cats.map((c) => (
        <button key={c.id} onClick={() => onSelect(c.id)} style={S.card}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>
            {c.name}
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>{c.desc}</div>
        </button>
      ))}
    </div>
  );
}

function LeaderView({
  state,
  catId,
  live,
  isAdmin,
  onBack,
  onOpenMatch,
  onOpenPracticeScorecard,
}) {
  const hideDailyPlayerPhotos =
    !live && (catId.startsWith("d") || catId.startsWith("2b"));
  const competitionRounds = ROUNDS.filter((round) => !round.isPractice);
  if (catId === "ntp" || catId === "ld") {
    return (
      <div>
        <button onClick={onBack} style={S.backBtn}>
          ← Back
        </button>
        <h2 style={S.sectTitle}>
          {catId === "ntp" ? "📍 Nearest the Pin" : "💪 Longest Drive"}
        </h2>
        {ROUNDS.map((round) => {
          const hn =
            catId === "ntp"
              ? getNtpHole(round.id, round.courseId)
              : getLdHole(round.courseId);
          const key = `${round.id}_${catId}`;
          const wId =
            catId === "ntp" ? state.ntpWinners?.[key] : state.ldWinners?.[key];
          const w = wId ? getP(wId) : null;
          return (
            <div
              key={round.id}
              style={{
                ...S.card,
                borderLeft: `3px solid ${w ? "#16a34a" : "#e2e8f0"}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div
                    style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}
                  >
                    Round {round.num} — Hole {hn}
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>
                    {round.courseName}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {w && (
                    <PlayerAvatar
                      id={w.id}
                      size={LEADER_PHOTO_SIZE}
                      live={live}
                    />
                  )}
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: w ? "#1e293b" : "#d1d5db",
                    }}
                  >
                    {w?.name || "TBD"}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  let rankings = [];
  if (catId === "spinners") {
    const openingRound = competitionRounds[0];
    if (!isRoundRevealed(state, openingRound.id, live, isAdmin)) {
      return (
        <div>
          <button onClick={onBack} style={S.backBtn}>
            ← Back
          </button>
          <h2 style={S.sectTitle}>Leaderboard locked</h2>
          <div
            style={{
              ...S.card,
              borderStyle: "dashed",
              borderColor: "#cbd5e1",
              background: "#f8fafc",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>
              The Spinners Cup leaderboard is hidden
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              It will unlock once admin opens scoring for Round 1.
            </div>
          </div>
        </div>
      );
    }
    const revealedRounds = ROUNDS.filter((r) =>
      r.includeInCup !== false && isRoundRevealed(state, r.id, live, isAdmin),
    );
    rankings = PLAYERS.map((p) => {
      let t = 0,
        holes = 0;
      revealedRounds.forEach((r) => {
        const c = getCourse(r.courseId);
        const sc = state.scores?.[r.id]?.[p.id] || [];
        t += pStab(
          sc,
          c,
          courseHcp(state.handicaps?.[p.id], c, getTeeKey(state, c.id)),
        );
        holes += sc.filter((s) => holeFilled(s)).length;
      });
      return { ...p, score: t, holes, totalHoles: revealedRounds.length * 18 };
    }).sort((a, b) => b.score - a.score);
  } else if (catId === "practice") {
    const round = ROUNDS.find((r) => r.id === "r0");
    const course = getCourse(round.courseId);
    if (!isRoundRevealed(state, round.id, live, isAdmin)) {
      return (
        <div>
          <button onClick={onBack} style={S.backBtn}>
            ← Back
          </button>
          <h2 style={S.sectTitle}>Round locked</h2>
          <div
            style={{
              ...S.card,
              borderStyle: "dashed",
              borderColor: "#cbd5e1",
              background: "#f8fafc",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>
              This leaderboard is hidden
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              It will unlock once admin opens scoring for this round.
            </div>
          </div>
        </div>
      );
    }
    rankings = PLAYERS.filter((p) => PRACTICE_PLAYER_IDS.includes(p.id)).map((p) => {
      const practiceTeam = getPracticeTeamByPlayer(p.id);
      const sc = state.scores?.[round.id]?.[p.id] || [];
      const holes = sc.filter((s) => holeFilled(s)).length;
      return {
        ...p,
        score: pStab(
          sc,
          course,
          courseHcp(
            state.handicaps?.[p.id],
            course,
            getTeeKey(state, course.id),
          ),
        ),
        holes,
        totalHoles: 18,
        roundId: round.id,
        practiceTeamId: practiceTeam?.id || null,
      };
    }).sort((a, b) => b.score - a.score);
  } else if (catId === "practice_teams") {
    const round = ROUNDS.find((r) => r.id === "r0");
    const course = getCourse(round.courseId);
    if (!isRoundRevealed(state, round.id, live, isAdmin)) {
      return (
        <div>
          <button onClick={onBack} style={S.backBtn}>
            ← Back
          </button>
          <h2 style={S.sectTitle}>Round locked</h2>
          <div
            style={{
              ...S.card,
              borderStyle: "dashed",
              borderColor: "#cbd5e1",
              background: "#f8fafc",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>
              This leaderboard is hidden
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              It will unlock once admin opens scoring for this round.
            </div>
          </div>
        </div>
      );
    }
    rankings = PRACTICE_TEAMS.map((team, idx) => {
      const totals = practiceTeamStablefordTotals({ state, round, course, team });
      return {
        id: team.id,
        name: team.playerIds.map((playerId) => getP(playerId)?.short).join(" / "),
        score: totals.score,
        holes: totals.holes,
        totalHoles: totals.totalHoles,
        hideAvatar: true,
        neutralBorder: true,
        roundId: round.id,
        practiceTeamId: team.id,
        sortOrder: idx,
      };
    }).sort((a, b) => b.score - a.score || a.sortOrder - b.sortOrder);
  } else if (catId.startsWith("d")) {
    const ri = parseInt(catId[1]) - 1;
    const round = competitionRounds[ri];
    const course = getCourse(round.courseId);
    if (!isRoundRevealed(state, round.id, live, isAdmin)) {
      return (
        <div>
          <button onClick={onBack} style={S.backBtn}>
            ← Back
          </button>
          <h2 style={S.sectTitle}>Round locked</h2>
          <div
            style={{
              ...S.card,
              borderStyle: "dashed",
              borderColor: "#cbd5e1",
              background: "#f8fafc",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>
              This leaderboard is hidden
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              It will unlock once admin opens scoring for this round.
            </div>
          </div>
        </div>
      );
    }
    rankings = PLAYERS.map((p) => {
      const sc = state.scores?.[round.id]?.[p.id] || [];
      const holes = sc.filter((s) => holeFilled(s)).length;
      return {
        ...p,
        score: pStab(
          sc,
          course,
          courseHcp(
            state.handicaps?.[p.id],
            course,
            getTeeKey(state, course.id),
          ),
        ),
        holes,
        totalHoles: 18,
        roundId: round.id,
        matchId: findMatchByPlayer(round.id, p.id)?.id,
      };
    }).sort((a, b) => b.score - a.score);
  } else if (catId.startsWith("2b")) {
    const ri = parseInt(catId[2]) - 1;
    const round = competitionRounds[ri];
    const course = getCourse(round.courseId);
    if (!isRoundRevealed(state, round.id, live, isAdmin)) {
      return (
        <div>
          <button onClick={onBack} style={S.backBtn}>
            ← Back
          </button>
          <h2 style={S.sectTitle}>Round locked</h2>
          <div
            style={{
              ...S.card,
              borderStyle: "dashed",
              borderColor: "#cbd5e1",
              background: "#f8fafc",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>
              This leaderboard is hidden
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              It will unlock once admin opens scoring for this round.
            </div>
          </div>
        </div>
      );
    }
    const pairs = [];
    round.matches.forEach((match) => {
      [match.blue, match.grey].forEach((team) => {
        const [a, b] = team;
        const sA = state.scores?.[round.id]?.[a] || [];
        const sB = state.scores?.[round.id]?.[b] || [];
        const hA = courseHcp(
          state.handicaps?.[a],
          course,
          getTeeKey(state, course.id),
        );
        const hB = courseHcp(
          state.handicaps?.[b],
          course,
          getTeeKey(state, course.id),
        );
        let pts = 0,
          holes = 0;
        course.holes.forEach((h, i) => {
          let pA = sPts(sA[i] || 0, h.par, hStrokes(hA, h));
          const pB = sPts(sB[i] || 0, h.par, hStrokes(hB, h));
          if (round.id === "r1" && a === "jkelly") pA *= 2;
          if (round.id === "r1" && b === "jkelly") {
            pts += Math.max(pA, pB * 2);
          } else {
            pts += Math.max(pA, pB);
          }
          if (holeFilled(sA[i] || 0) || holeFilled(sB[i] || 0)) holes++;
        });
        pairs.push({
          id: `${a}_${b}`,
          topName: getP(a)?.short,
          bottomName: getP(b)?.short,
          team: getP(a)?.team,
          score: pts,
          holes,
          totalHoles: 18,
          roundId: round.id,
          matchId: findMatchByTeam(round.id, [a, b])?.id,
          chCount:
            getChulliganCount(state, round.id, a) +
            getChulliganCount(state, round.id, b),
        });
      });
    });
    rankings = pairs.sort((a, b) => b.score - a.score);
  }
  const titles = {
    spinners: "🏆 Spinners Cup",
    practice: "Practice Stableford",
    practice_teams: "Practice 3-Ball Teams",
    d1: "Day 1 Stableford",
    d2: "Day 2 Stableford",
    d3: "Day 3 Stableford",
    "2b1": "Day 1 2-Ball",
    "2b2": "Day 2 2-Ball",
    "2b3": "Day 3 2-Ball",
  };
  return (
    <div>
      <button onClick={onBack} style={S.backBtn}>
        ← Back
      </button>
      <h2 style={S.sectTitle}>{titles[catId]}</h2>
      {rankings.map((r, i) => {
        const canOpen = !!(r.roundId && r.matchId && onOpenMatch);
        const canOpenPractice = !!(
          r.roundId &&
          r.practiceTeamId &&
          onOpenPracticeScorecard
        );
        const teamBorderColor = r.neutralBorder
          ? "#cbd5e1"
          : live
          ? r.team === "blue"
            ? "#D4A017"
            : "#DC2626"
          : "#cbd5e1";
        return (
          <button
            key={r.id}
            onClick={() => {
              if (canOpen) onOpenMatch(r.roundId, r.matchId);
              else if (canOpenPractice) {
                onOpenPracticeScorecard({
                  roundId: r.roundId,
                  practiceTeamId: r.practiceTeamId,
                  focusPlayerId: catId === "practice" ? r.id : null,
                });
              }
            }}
            style={{
              ...S.card,
              borderLeft: `3px solid ${teamBorderColor}`,
              background: i === 0 ? "#f0fdf4" : "#fff",
              width: "100%",
              textAlign: "left",
              borderTop: "1px solid #e2e8f0",
              borderRight: "1px solid #e2e8f0",
              borderBottom: "1px solid #e2e8f0",
              cursor: canOpen || canOpenPractice ? "pointer" : "default",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 24,
                  fontSize: i < 3 ? 16 : 13,
                  fontWeight: 700,
                  color: "#94a3b8",
                  textAlign: "center",
                }}
              >
                {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
              </div>
              {!hideDailyPlayerPhotos &&
                !r.hideAvatar &&
                (r.id && r.id.includes("_") ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      marginRight: 2,
                    }}
                  >
                    <PlayerAvatar
                      id={r.id.split("_")[0]}
                      size={LEADER_PHOTO_SIZE}
                      live={live}
                    />
                    <div style={{ marginLeft: -10 }}>
                      <PlayerAvatar
                        id={r.id.split("_")[1]}
                        size={LEADER_PHOTO_SIZE}
                        live={live}
                      />
                    </div>
                  </div>
                ) : (
                  <PlayerAvatar
                    id={r.id}
                    size={LEADER_SINGLE_PHOTO_SIZE}
                    live={live}
                  />
                ))}
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#1e293b",
                    display: "flex",
                    flexDirection: "column",
                    lineHeight: 1.15,
                  }}
                >
                  {r.id && r.id.includes("_") ? (
                    <>
                      <span>{r.topName}</span>
                      <span>
                        {r.bottomName}{" "}
                        {r.chCount ? chulliganBadges(r.chCount) : ""}
                      </span>
                    </>
                  ) : (
                    <span>
                      {r.name}{" "}
                      {chulliganBadges(
                        getChulliganCount(state, r.roundId || "", r.id),
                      )}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 4,
                    justifyContent: "flex-end",
                  }}
                >
                  <span
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: "#2d6a4f",
                      fontFamily: "'JetBrains Mono',monospace",
                    }}
                  >
                    {r.score}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      color: r.holes === r.totalHoles ? "#16a34a" : "#94a3b8",
                      fontWeight: 500,
                    }}
                  >
                    ({r.holes}/{r.totalHoles})
                  </span>
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Schedule ────────────────────────────────────────────────
// ─── Schedule Menu ───────────────────────────────────────────
function ScheduleMenu({ onSelect }) {
  return (
    <div>
      <h2 style={S.sectTitle}>Info</h2>
      <button
        onClick={() => onSelect("matches")}
        style={{
          ...S.card,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "16px",
        }}
      >
        <span style={{ fontSize: 28 }}>⛳</span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>
            Match Schedule & Draw
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            Tee times, pairings & course info for each round
          </div>
        </div>
      </button>
      <button
        onClick={() => onSelect("trip")}
        style={{
          ...S.card,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "16px",
        }}
      >
        <span style={{ fontSize: 28 }}>🗓️</span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>
            Trip Itinerary
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            Full trip schedule from Thursday to Sunday
          </div>
        </div>
      </button>
      <button
        onClick={() => onSelect("pkrooms")}
        style={{
          ...S.card,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "16px",
        }}
      >
        <span style={{ fontSize: 28 }}>🏨</span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>
            PK Rooms
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            Peninsula Kingswood room allocations
          </div>
        </div>
      </button>
      <button
        onClick={() => onSelect("rules")}
        style={{
          ...S.card,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "16px",
        }}
      >
        <span style={{ fontSize: 28 }}>📖</span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>
            Competition Rules
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            Formats, scoring & special rules for the weekend
          </div>
        </div>
      </button>
      <button
        onClick={() => onSelect("summaries")}
        style={{
          ...S.card,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "16px",
        }}
      >
        <span style={{ fontSize: 28 }}>🧠</span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>
            Weekend Banter Summary
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            Released daily write-ups with stats, laughs and sledges
          </div>
        </div>
      </button>
      <button
        onClick={() => onSelect("champions")}
        style={{
          ...S.card,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "16px",
        }}
      >
        <span style={{ fontSize: 28 }}>👑</span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>
            Past Champions
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            Hall of fame, legends, and highly selective historical truth
          </div>
        </div>
      </button>
    </div>
  );
}

// ─── Match Schedule ──────────────────────────────────────────
function MatchSchedule({ state, isAdmin, onOpenMatch, onBack }) {
  return (
    <div>
      <button onClick={onBack} style={S.backBtn}>
        ← Schedule
      </button>
      <h2 style={S.sectTitle}>Match Schedule & Draw</h2>
      {ROUNDS.map((round) => {
        const course = getCourse(round.courseId);
        const teeKey = getTeeKey(state, round.courseId);
        const teeLabel = getTeeLabel(course, teeKey);
        const showPlayerNames = isAdmin || isRoundScoringLive(state, round.id);
        return (
          <div
            key={round.id}
            style={{
              ...S.card,
              border: "1px solid #d4e5d4",
              background: "#f8faf8",
              marginBottom: 16,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#2d6a4f",
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              Round {round.num}
            </div>
            <div
              style={{
                fontSize: 17,
                fontWeight: 800,
                color: "#1a2e1a",
                fontFamily: "'Playfair Display',serif",
                marginTop: 2,
              }}
            >
              {round.courseName}
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
              {round.day}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "#94a3b8",
                fontFamily: "'JetBrains Mono',monospace",
              }}
            >
              Par {course.par} · Slope {getSlope(course, teeKey)} · CR{" "}
              {getRating(course, teeKey)} · {teeLabel} Tees
            </div>
            <div
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: "1px solid #e2e8f0",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 8,
                }}
              >
                Tee Times & Draw
              </div>
              {round.matches.length === 0 && (
                <div
                  style={{
                    padding: "8px 10px",
                    background: "#fff",
                    borderRadius: 8,
                    marginBottom: 6,
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1e293b" }}>
                    Practice round — 2 groups of 3
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                    3-ball teams event: best 2 stableford scores per team count.
                  </div>
                  <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                    {(
                      round.practiceGroups?.length
                        ? round.practiceGroups
                        : round.teeTimes.map(() => [])
                    ).map((group, idx) => (
                      <div
                        key={`${round.id}_practice_${idx}`}
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: 8,
                          padding: "8px 10px",
                          background: "#f8fafc",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 800,
                            color: "#166534",
                            fontFamily: "'JetBrains Mono',monospace",
                          }}
                        >
                          Group {idx + 1}: {round.teeTimes[idx] || "TBC"}
                        </div>
                        {group.length > 0 && (
                          <div
                            style={{
                              marginTop: 4,
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr",
                              gap: "2px 10px",
                            }}
                          >
                            {group.map((name) => (
                              <div
                                key={`${round.id}_${idx}_${name}`}
                                style={{ fontSize: 12, color: "#334155", fontWeight: 600 }}
                              >
                                • {name}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {round.matches.map((match, mi) => (
                <button
                  key={match.id}
                  onClick={() => {
                    if (showPlayerNames && onOpenMatch) onOpenMatch(match.id);
                  }}
                  style={{
                    padding: "8px 10px",
                    background: "#fff",
                    borderRadius: 8,
                    marginBottom: 6,
                    border: "1px solid #e2e8f0",
                    width: "100%",
                    textAlign: "left",
                    cursor: showPlayerNames && onOpenMatch ? "pointer" : "default",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#2d6a4f",
                        fontFamily: "'JetBrains Mono',monospace",
                      }}
                    >
                      {round.teeTimes[mi]}
                    </span>
                    <span style={{ fontSize: 10, color: "#94a3b8" }}>
                      Match {mi + 1}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#B8860B",
                        flex: 1,
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          flexDirection: "column",
                          lineHeight: 1.2,
                          alignItems: "flex-start",
                        }}
                      >
                        <span>
                          {showPlayerNames
                            ? match.blue.map((id) => getP(id)?.name)[0]
                            : "Player 1"}
                        </span>
                        <span>
                          {showPlayerNames
                            ? match.blue.map((id) => getP(id)?.name)[1]
                            : "Player 2"}
                        </span>
                      </span>
                    </span>
                    <span style={{ fontSize: 10, color: "#94a3b8" }}>vs</span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#B91C1C",
                        flex: 1,
                        textAlign: "right",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          flexDirection: "column",
                          lineHeight: 1.2,
                          alignItems: "flex-end",
                        }}
                      >
                        <span>
                          {showPlayerNames
                            ? match.grey.map((id) => getP(id)?.name)[0]
                            : "Player 3"}
                        </span>
                        <span>
                          {showPlayerNames
                            ? match.grey.map((id) => getP(id)?.name)[1]
                            : "Player 4"}
                        </span>
                      </span>
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Trip Schedule ───────────────────────────────────────────
function TripSchedule({ onBack }) {
  const days = [
    {
      day: "Thursday 27th March",
      label: "Travel & Warm-Up",
      emoji: "✈️",
      items: [
        { time: "6:00am", text: "Thursday golfers flight to Melbourne" },
        { time: "12:30pm", text: "Warm-up round at The Dunes Golf Course" },
        {
          time: "After golf",
          text: "Check-in at AirBnB — 406 Dundas St, St Andrews Beach",
        },
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
        {
          time: "11:30am",
          text: "Round 1 — St Andrews Beach Golf Club",
          highlight: true,
        },
        {
          time: "After golf",
          text: "Dinner — TBC",
        },
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
        {
          time: "7:30am",
          text: "Breakfast at PK Clubhouse (included in room rate)",
        },
        { time: "8:25am", text: "Round 3 — PK North Course", highlight: true },
        { time: "1:00pm", text: "Jacket Presentation 🧥", highlight: true },
        { time: "~2:30pm", text: "Depart for Melbourne Airport ✈️" },
      ],
    },
  ];

  return (
    <div>
      <button onClick={onBack} style={S.backBtn}>
        ← Schedule
      </button>
      <h2 style={S.sectTitle}>Trip Itinerary</h2>
      <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>
        Spinners Cup 2026 · Mornington Peninsula
      </p>

      <div
        style={{
          padding: "12px 14px",
          background: "#fff7ed",
          borderRadius: 10,
          border: "1px solid #fed7aa",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#9a3412",
            marginBottom: 4,
          }}
        >
          🏠 AirBnB Address
        </div>
        <div style={{ fontSize: 13, color: "#7c2d12", lineHeight: 1.5 }}>
          406 Dundas St, St Andrews Beach
        </div>
      </div>

      {days.map((d, di) => (
        <div key={di} style={{ marginBottom: 16 }}>
          <div
            style={{
              ...S.card,
              border: "1px solid #d4e5d4",
              background: "#f8faf8",
              padding: "14px 14px 10px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 10,
              }}
            >
              <span style={{ fontSize: 22 }}>{d.emoji}</span>
              <div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#1a2e1a",
                    fontFamily: "'Playfair Display',serif",
                  }}
                >
                  {d.day}
                </div>
                <div
                  style={{ fontSize: 11, color: "#2d6a4f", fontWeight: 600 }}
                >
                  {d.label}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {d.items.map((item, ii) => (
                <div
                  key={ii}
                  style={{
                    display: "flex",
                    gap: 10,
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: item.highlight ? "#e8f5e0" : "#fff",
                    border: item.highlight
                      ? "1px solid #86efac"
                      : "1px solid #e2e8f0",
                  }}
                >
                  <div
                    style={{
                      minWidth: 62,
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#2d6a4f",
                      fontFamily: "'JetBrains Mono',monospace",
                      paddingTop: 1,
                    }}
                  >
                    {item.time}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: item.highlight ? "#1a2e1a" : "#B8860B",
                      fontWeight: item.highlight ? 700 : 400,
                      lineHeight: 1.4,
                    }}
                  >
                    {item.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

      <div
        style={{
          padding: "12px 14px",
          background: "#f1f5f9",
          borderRadius: 10,
          marginTop: 8,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#64748b",
            marginBottom: 6,
          }}
        >
          📋 Key Info
        </div>
        <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.6 }}>
          <div>
            🏠 <strong>Thu–Fri:</strong> AirBnB — 406 Dundas St, St Andrews
            Beach
          </div>
          <div>
            🏨 <strong>Sat night:</strong> On-site rooms at Peninsula Kingswood
          </div>
          <div>
            👔 <strong>PK Dress Code:</strong> They're stricter on dress code
            here. Golf attire or collared shirts/chinos etc.
          </div>
        </div>
      </div>
    </div>
  );
}

function PkRoomsPage({ onBack }) {
  return (
    <div>
      <button onClick={onBack} style={S.backBtn}>
        ← Info
      </button>
      <h2 style={S.sectTitle}>PK Rooms</h2>
      <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
        Saturday night accommodation at Peninsula Kingswood.
      </p>
      <div
        style={{
          padding: "14px",
          background: "#fff",
          borderRadius: 12,
          border: "1px solid #e2e8f0",
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "#1e293b",
            marginBottom: 10,
          }}
        >
          🏨 PK Room Assignments
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {PK_ROOMS.map((r, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "8px 10px",
                background: "#f8faf8",
                borderRadius: 8,
                border: "1px solid #e2e8f0",
              }}
            >
              <div
                style={{
                  minWidth: 90,
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#2d6a4f",
                }}
              >
                Room {r.room}
              </div>
              <div style={{ fontSize: 13, color: "#1e293b" }}>
                {r.players.join(" & ")}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Rules Page ──────────────────────────────────────────────
function RulesPage({ state, onBack }) {
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
        "Chulligans cannot be used on a putt.",
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

  return (
    <div>
      <button onClick={onBack} style={S.backBtn}>
        ← Info
      </button>
      <h2 style={S.sectTitle}>Competition Rules</h2>
      <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>
        Spinners Cup 2026 — Mornington Peninsula
      </p>

      {rules.map((section, si) => (
        <div
          key={si}
          style={{ ...S.card, marginBottom: 12, cursor: "default" }}
        >
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "#1e293b",
              marginBottom: 10,
            }}
          >
            {section.title}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {section.items.map((item, ii) => (
              <div
                key={ii}
                style={{ display: "flex", gap: 8, alignItems: "flex-start" }}
              >
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    background: "#2d6a4f",
                    marginTop: 7,
                    flexShrink: 0,
                  }}
                />
                <div
                  style={{ fontSize: 13, color: "#475569", lineHeight: 1.6 }}
                >
                  {item}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DailySummaryModal({ summary, onClose }) {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(15,23,42,0.65)",
        zIndex: 260,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(560px,100%)",
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #dbeafe",
          padding: 18,
          boxShadow: "0 20px 40px rgba(0,0,0,.25)",
          maxHeight: "calc(100vh - 32px)",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#2563eb",
                letterSpacing: 0.7,
                textTransform: "uppercase",
              }}
            >
              Daily Release
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 800,
                color: "#0f172a",
                fontFamily: "'Playfair Display',serif",
              }}
            >
              {summary.title}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              border: "1px solid #cbd5e1",
              background: "#fff",
              color: "#475569",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            ×
          </button>
        </div>
        <div
          style={{
            marginTop: 12,
            fontSize: 13,
            color: "#475569",
            lineHeight: 1.65,
            whiteSpace: "pre-wrap",
            overflowY: "auto",
            flex: 1,
            minHeight: 0,
            paddingRight: 4,
          }}
        >
          {summary.content}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 14,
          }}
        >
          <div style={{ fontSize: 11, color: "#94a3b8" }}>
            Find this again later in Info → Weekend Banter Summary, or in the Live Timeline.
          </div>
          <button
            onClick={onClose}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "none",
              background: "#0f766e",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryHubPage({ state, cur, onBack }) {
  const [shareStatus, setShareStatus] = useState({});
  const summaries = Object.values(state.dailySummaries || {}).sort(
    (a, b) => new Date(b.releasedAt || 0) - new Date(a.releasedAt || 0),
  );
  return (
    <div>
      <button onClick={onBack} style={S.backBtn}>
        ← Info
      </button>
      <h2 style={S.sectTitle}>Weekend Banter Summary</h2>
      {summaries.length === 0 && (
        <div style={{ ...S.card, fontSize: 13, color: "#64748b" }}>
          No daily summary released yet. Admin can draft and launch one when a
          round is ready.
        </div>
      )}
      {summaries.map((s) => {
        const shareCard = buildSummaryShareCard(state, s.roundId);
        const status = shareStatus[s.roundId] || "";
        return (
          <div
            key={s.roundId}
            style={{
              ...S.card,
              borderLeft: "3px solid #2563eb",
              background: "#f8fbff",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                marginBottom: 6,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                {s.title}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "#64748b",
                  textTransform: "uppercase",
                  fontWeight: 700,
                }}
              >
                {s.source === "admin" ? "Admin" : "Manual"}
              </div>
            </div>
            <div
              style={{
                fontSize: 13,
                color: "#475569",
                lineHeight: 1.65,
                whiteSpace: "pre-wrap",
              }}
            >
              {s.content}
            </div>
            {shareCard && (
              <div
                style={{
                  marginTop: 12,
                  padding: "12px",
                  borderRadius: 12,
                  background: "#fff",
                  border: "1px solid #bfdbfe",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 800, color: "#1d4ed8", marginBottom: 4 }}>
                  Shareable recap card
                </div>
                <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                  {shareCard.body}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  <button
                    onClick={async () => {
                      const ok = await shareOrCopyText(shareCard.title, shareCard.body);
                      setShareStatus((prev) => ({
                        ...prev,
                        [s.roundId]: ok ? "Recap card shared or copied." : "Sharing failed on this device.",
                      }));
                    }}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "none",
                      background: "#2563eb",
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Share Recap Card
                  </button>
                  <button
                    onClick={async () => {
                      const ok = await copyText(shareCard.body);
                      setShareStatus((prev) => ({
                        ...prev,
                        [s.roundId]: ok ? "Recap text copied." : "Copy failed on this device.",
                      }));
                    }}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid #93c5fd",
                      background: "#fff",
                      color: "#1d4ed8",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Copy Card Text
                  </button>
                </div>
                {!!status && (
                  <div style={{ marginTop: 8, fontSize: 11, color: "#1d4ed8" }}>{status}</div>
                )}
              </div>
            )}
            {cur && cur !== "admin" && cur !== "spectator" && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 11,
                  color: state.summaryReads?.[cur]?.[s.roundId]
                    ? "#16a34a"
                    : "#94a3b8",
                }}
              >
                {state.summaryReads?.[cur]?.[s.roundId] ? "✓ Read" : "Unread"}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PastChampionsPage({ onBack }) {
  const champs = [
    {
      year: "2022",
      name: "Luke Abi-Hanna",
      line: "Set the original benchmark and immediately started negotiating appearance fees. He makes the long flight back from Dubai to try and clinch another win.",
    },
    {
      year: "2023",
      name: "Cam Green",
      line: "Won with the calm of a monk and the confidence of a bloke who never misses a slider.",
    },
    {
      year: "2024",
      name: "Cam Green",
      line: "Back-to-back. Historians call it a dynasty; rivals call it textbook burglar behaviour with that handicap.",
    },
    {
      year: "2025",
      name: "Cam Clark",
      line: "Went absolutely ice cold in the playoff and closed like a man with Antarctic veins.",
    },
  ];
  return (
    <div>
      <button onClick={onBack} style={S.backBtn}>
        ← Info
      </button>
      <h2 style={S.sectTitle}>Past Champions</h2>
      <p
        style={{
          fontSize: 12,
          color: "#64748b",
          lineHeight: 1.5,
          marginBottom: 12,
        }}
      >
        Their names are etched into Spinners history — and into the jacket — for
        all eternity (or at least until someone nicks it).
      </p>
      {champs.map((c) => (
        <div
          key={c.year}
          style={{
            ...S.card,
            borderLeft: "3px solid #ca8a04",
            background: "#fffdf5",
          }}
        >
          <div
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: 0.8,
              fontWeight: 700,
              color: "#a16207",
            }}
          >
            {c.year}
          </div>
          <div
            style={{
              fontSize: 17,
              fontWeight: 800,
              color: "#1e293b",
              fontFamily: "'Playfair Display',serif",
              marginTop: 2,
            }}
          >
            {c.name}
          </div>
          <div
            style={{
              fontSize: 13,
              color: "#475569",
              lineHeight: 1.6,
              marginTop: 6,
            }}
          >
            {c.line}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Players ─────────────────────────────────────────────────
function PlayersPage({ state, upd, isAdmin, live }) {
  const [summaryStatus, setSummaryStatus] = useState({});
  const [confirmReset, setConfirmReset] = useState(false);
  const [selectedBio, setSelectedBio] = useState(null);
  const teams = [
    {
      label: getTeamLabel(state, "blue"),
      team: "blue",
      color: "#D4A017",
      border: "#D4A017",
    },
    {
      label: getTeamLabel(state, "grey"),
      team: "grey",
      color: "#B91C1C",
      border: "#DC2626",
    },
  ];

  return (
    <div>
      <h2 style={S.sectTitle}>Players & Handicaps</h2>

      {/* Admin event control */}
      {isAdmin && (
        <div
          style={{
            padding: "14px 16px",
            background: state.eventLive ? "#f0fdf4" : "#FEF2F2",
            borderRadius: 12,
            border: `1px solid ${state.eventLive ? "#bbf7d0" : "#FECACA"}`,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>
                🎛️ Event Status
              </div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                {state.eventLive
                  ? "Event is LIVE — players can see teams, matches & enter scores"
                  : "Event is HIDDEN — teams and matches stay hidden until launch"}
              </div>
            </div>
            <button
              onClick={() =>
                upd((s) => {
                  s.eventLive = !s.eventLive;
                })
              }
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "none",
                background: state.eventLive ? "#dc2626" : "#16a34a",
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {state.eventLive ? "Go Hidden" : "Go Live"}
            </button>
          </div>
        </div>
      )}

      {isAdmin && (
        <div
          style={{
            padding: "14px 16px",
            background: "#fff",
            borderRadius: 12,
            border: "1px solid #e2e8f0",
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>
            🔓 Open Scoring (Pre-Launch)
          </div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
            Allow score entry before the event is marked live.
          </div>
          <button
            onClick={() =>
              upd((s) => {
                s.scoringOpenWhenHidden = !s.scoringOpenWhenHidden;
              })
            }
            style={{
              marginTop: 10,
              padding: "8px 12px",
              borderRadius: 8,
              border: "none",
              background: state.scoringOpenWhenHidden ? "#dc2626" : "#16a34a",
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {state.scoringOpenWhenHidden
              ? "Disable Open Scoring"
              : "Enable Open Scoring"}
          </button>
        </div>
      )}

      {isAdmin && (
        <div
          style={{
            padding: "14px 16px",
            background: "#fff",
            borderRadius: 12,
            border: "1px solid #e2e8f0",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#1e293b",
              marginBottom: 10,
            }}
          >
            🏷️ Team Names
          </div>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#D4A017",
                  marginBottom: 4,
                }}
              >
                Yellow Slot Name
              </div>
              <input
                type="text"
                value={getTeamName(state, "blue")}
                onChange={(e) =>
                  upd((s) => {
                    if (!s.teamNames) s.teamNames = { ...DEFAULT_TEAM_NAMES };
                    s.teamNames.blue = cleanTeamName(
                      e.target.value,
                      DEFAULT_TEAM_NAMES.blue,
                    );
                  })
                }
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#1e293b",
                  boxSizing: "border-box",
                }}
                placeholder="Yellow"
              />
            </div>
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#B91C1C",
                  marginBottom: 4,
                }}
              >
                Red Slot Name
              </div>
              <input
                type="text"
                value={getTeamName(state, "grey")}
                onChange={(e) =>
                  upd((s) => {
                    if (!s.teamNames) s.teamNames = { ...DEFAULT_TEAM_NAMES };
                    s.teamNames.grey = cleanTeamName(
                      e.target.value,
                      DEFAULT_TEAM_NAMES.grey,
                    );
                  })
                }
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#1e293b",
                  boxSizing: "border-box",
                }}
                placeholder="Red"
              />
            </div>
          </div>
          <div style={{ fontSize: 10, color: "#64748b", marginTop: 8 }}>
            Team colors stay mapped to their original slots.
          </div>
        </div>
      )}

      {isAdmin && (
        <div
          style={{
            padding: "14px 16px",
            background: "#f8fafc",
            borderRadius: 12,
            border: "1px solid #cbd5e1",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#1e293b",
              marginBottom: 10,
            }}
          >
            🎯 Round Scoring Release
          </div>
          {ROUNDS.map((round) => {
            const open = isRoundScoringLive(state, round.id);
            return (
              <div
                key={round.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <div>
                  <div
                    style={{ fontSize: 12, fontWeight: 700, color: "#1e293b" }}
                  >
                    Round {round.num}
                  </div>
                  <div style={{ fontSize: 10, color: "#94a3b8" }}>
                    {round.courseName}
                  </div>
                </div>
                <button
                  onClick={() =>
                    upd((s) => {
                      if (!s.roundScoringLive)
                        s.roundScoringLive = {
                          r0: false,
                          r1: false,
                          r2: false,
                          r3: false,
                        };
                      s.roundScoringLive[round.id] =
                        !s.roundScoringLive[round.id];
                    })
                  }
                  style={{
                    padding: "7px 12px",
                    borderRadius: 8,
                    border: "none",
                    background: open ? "#dc2626" : "#16a34a",
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {open ? "Lock Scoring" : "Open Scoring"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {isAdmin && (
        <div
          style={{
            padding: "14px 16px",
            background: "#eef6ff",
            borderRadius: 12,
            border: "1px solid #bfdbfe",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#1e3a8a",
              marginBottom: 8,
            }}
          >
            📝 Round Banter Summary Launch
          </div>
          <div style={{ fontSize: 11, color: "#1e40af", marginBottom: 10 }}>
            Write the round banter summary yourself, copy the full round
            scoresheet if you want to use another tool, then launch the finished
            summary to players.
          </div>
          {ROUNDS.map((round) => {
            const done = isRoundFullySubmitted(state, round.id);
            const released = !!state.dailySummaries?.[round.id];
            const draft = state.dailySummaryDrafts?.[round.id] || "";
            const status = summaryStatus[round.id] || "";
            const exportText = formatRoundSummaryExport(state, round.id);
            const shareCard = buildSummaryShareCard(state, round.id);
            return (
              <div
                key={`summary_${round.id}`}
                style={{
                  marginBottom: 12,
                  paddingBottom: 12,
                  borderBottom: "1px dashed #bfdbfe",
                }}
              >
                {shareCard && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: "10px 12px",
                      borderRadius: 10,
                      background: "#fff",
                      border: "1px solid #bfdbfe",
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#1d4ed8", marginBottom: 4 }}>
                      Recap card preview
                    </div>
                    <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                      {shareCard.body}
                    </div>
                  </div>
                )}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 10,
                    marginBottom: 8,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#1e293b",
                      }}
                    >
                      Round {round.num} · {round.courseName}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: done ? "#15803d" : "#b45309",
                      }}
                    >
                      {done
                        ? "All scores submitted"
                        : "Scores still live — you can still draft and copy the scoresheet now."}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      justifyContent: "flex-end",
                    }}
                  >
                    <button
                      onClick={async () => {
                        const ok = await copyText(exportText);
                        setSummaryStatus((prev) => ({
                          ...prev,
                          [round.id]: ok
                            ? "Scoresheet copied."
                            : "Copy failed on this device.",
                        }));
                      }}
                      style={{
                        padding: "7px 12px",
                        borderRadius: 8,
                        border: "1px solid #93c5fd",
                        background: "#fff",
                        color: "#1d4ed8",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Copy Scoresheet
                    </button>
                    {shareCard && (
                      <button
                        onClick={async () => {
                          const ok = await shareOrCopyText(shareCard.title, shareCard.body);
                          setSummaryStatus((prev) => ({
                            ...prev,
                            [round.id]: ok
                              ? "Recap card shared or copied."
                              : "Sharing failed on this device.",
                          }));
                        }}
                        style={{
                          padding: "7px 12px",
                          borderRadius: 8,
                          border: "1px solid #bfdbfe",
                          background: "#eff6ff",
                          color: "#1d4ed8",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Share Recap Card
                      </button>
                    )}
                    <button
                      disabled={!draft.trim()}
                      onClick={() => {
                        const summary = buildManualRoundSummary(
                          state,
                          round.id,
                          draft,
                        );
                        if (!summary?.content) {
                          setSummaryStatus((prev) => ({
                            ...prev,
                            [round.id]: "Add a summary before launching.",
                          }));
                          return;
                        }
                        upd((s) => {
                          if (!s.dailySummaries) s.dailySummaries = {};
                          if (!s.summaryReads) s.summaryReads = {};
                          s.dailySummaries[round.id] = summary;
                          PLAYERS.forEach((p) => {
                            if (!s.summaryReads[p.id])
                              s.summaryReads[p.id] = {};
                            s.summaryReads[p.id][round.id] = false;
                          });
                        });
                        setSummaryStatus((prev) => ({
                          ...prev,
                          [round.id]: released
                            ? "Summary re-launched."
                            : "Summary launched.",
                        }));
                      }}
                      style={{
                        padding: "7px 12px",
                        borderRadius: 8,
                        border: "none",
                        background: released ? "#0f766e" : "#2563eb",
                        color: "#fff",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: !draft.trim() ? "not-allowed" : "pointer",
                        opacity: !draft.trim() ? 0.45 : 1,
                      }}
                    >
                      {released ? "Re-launch Summary" : "Launch Summary"}
                    </button>
                  </div>
                </div>
                <textarea
                  value={draft}
                  onChange={(e) =>
                    upd((s) => {
                      if (!s.dailySummaryDrafts) s.dailySummaryDrafts = {};
                      s.dailySummaryDrafts[round.id] = e.target.value;
                    })
                  }
                  placeholder={`Write Round ${round.num} banter summary here, then launch it to players when ready.`}
                  style={{
                    width: "100%",
                    minHeight: 132,
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #93c5fd",
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: "#1e293b",
                    boxSizing: "border-box",
                    resize: "vertical",
                    background: "#fff",
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                    marginTop: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ fontSize: 10, color: "#475569" }}>
                    {draft.trim()
                      ? `${draft.trim().length} chars drafted`
                      : "No draft yet."}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: status.includes("failed") ? "#b91c1c" : "#1d4ed8",
                    }}
                  >
                    {status ||
                      "Use Copy Scoresheet to grab the full round data before launching your manual summary."}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isAdmin && (
        <div
          style={{
            padding: "14px 16px",
            background: "#fff1f2",
            borderRadius: 12,
            border: "1px solid #fecdd3",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#9f1239",
              marginBottom: 6,
            }}
          >
            🧨 Reset App Data
          </div>
          <div style={{ fontSize: 11, color: "#9f1239", marginBottom: 10 }}>
            Clears all scores, claims, handicaps, submissions, chulligans, tees,
            visibility settings, sledge feed activity, and winner/banner history.
          </div>
          {!confirmReset ? (
            <button
              onClick={() => setConfirmReset(true)}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #fda4af",
                background: "#fff",
                color: "#be123c",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Reset All Scoring & Data
            </button>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => {
                  clearResettableLocalState();
                  upd((s) => Object.assign(s, DC(DEFAULT_STATE)));
                  setConfirmReset(false);
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: "#be123c",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Confirm Reset
              </button>
              <button
                onClick={() => setConfirmReset(false)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  color: "#64748b",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* Admin tee selection */}
      {isAdmin && (
        <div
          style={{
            padding: "14px 16px",
            background: "#f8faf8",
            borderRadius: 12,
            border: "1px solid #d4e5d4",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#1e293b",
              marginBottom: 10,
            }}
          >
            ⛳ Tee Selection
          </div>
          {COURSES.map((course) => {
            const curTee = getTeeKey(state, course.id);
            return (
              <div
                key={course.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <div>
                  <div
                    style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}
                  >
                    {course.short}
                  </div>
                  <div style={{ fontSize: 10, color: "#94a3b8" }}>
                    Slope: {getSlope(course, curTee)} · CR:{" "}
                    {getRating(course, curTee)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {Object.entries(course.teeData).map(([key, td]) => (
                    <button
                      key={key}
                      onClick={() =>
                        upd((s) => {
                          if (!s.tees) s.tees = {};
                          s.tees[course.id] = key;
                        })
                      }
                      style={{
                        padding: "5px 12px",
                        borderRadius: 6,
                        border: `1px solid ${curTee === key ? "#2d6a4f" : "#d1d5db"}`,
                        background: curTee === key ? "#2d6a4f" : "#fff",
                        color: curTee === key ? "#fff" : "#64748b",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {td.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p
        style={{
          fontSize: 12,
          color: "#64748b",
          marginBottom: 16,
          lineHeight: 1.5,
        }}
      >
        GA Handicap Index is used to calculate daily handicaps per course using
        the slope rating.
      </p>

      {live ? (
        /* Show teams when live */
        teams.map(({ label, team, color, border }) => (
          <div key={team} style={{ marginBottom: 20 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: color,
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 8,
              }}
            >
              {label}
            </div>
            {PLAYERS.filter((p) => p.team === team).map((player) => {
              const gaHcp = state.handicaps?.[player.id];
              const hasHcp = gaHcp != null;
              return (
                <div
                  key={player.id}
                  style={{
                    ...S.card,
                    borderLeft: `3px solid ${border}`,
                    cursor: "default",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flex: 1,
                      }}
                    >
                      <PlayerAvatar id={player.id} size={42} live={true} />
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: "#1e293b",
                          }}
                        >
                          {player.name}
                        </div>
                        <button
                          onClick={() => setSelectedBio(player.id)}
                          style={{
                            marginTop: 6,
                            padding: "5px 10px",
                            borderRadius: 999,
                            border: "1px solid #bfdbfe",
                            background: "#eff6ff",
                            color: "#1d4ed8",
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                            fontFamily: "'DM Sans',sans-serif",
                          }}
                        >
                          View Bio
                        </button>
                        {hasHcp && (
                          <div
                            style={{
                              fontSize: 10,
                              color: "#94a3b8",
                              marginTop: 6,
                              display: "flex",
                              gap: 12,
                              flexWrap: "wrap",
                            }}
                          >
                            {COURSES.map((c) => {
                              const dh = courseHcp(
                                gaHcp,
                                c,
                                getTeeKey(state, c.id),
                              );
                              return (
                                <span
                                  key={c.id}
                                  style={{ display: "inline-flex", gap: 3 }}
                                >
                                  <span
                                    style={{
                                      fontWeight: 600,
                                      color: "#64748b",
                                    }}
                                  >
                                    {c.short}:
                                  </span>
                                  <span
                                    style={{
                                      fontFamily: "'JetBrains Mono',monospace",
                                      fontWeight: 600,
                                      color: "#1e293b",
                                    }}
                                  >
                                    {dh}
                                  </span>
                                </span>
                              );
                            })}
                          </div>
                        )}
                        {!hasHcp && (
                          <div
                            style={{
                              fontSize: 10,
                              color: "#d1d5db",
                              marginTop: 4,
                            }}
                          >
                            No handicap set
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ width: 80, flexShrink: 0 }}>
                      {isAdmin ? (
                        <div>
                          <div
                            style={{
                              fontSize: 9,
                              color: "#94a3b8",
                              marginBottom: 3,
                              textAlign: "center",
                            }}
                          >
                            GA HCP
                          </div>
                          <input
                            type="number"
                            step="0.1"
                            value={gaHcp ?? ""}
                            placeholder="—"
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              upd((s) => {
                                s.handicaps[player.id] = isNaN(v) ? null : v;
                              });
                            }}
                            style={{
                              width: "100%",
                              padding: "6px 8px",
                              borderRadius: 6,
                              border: "1px solid #d1d5db",
                              fontSize: 14,
                              fontWeight: 600,
                              fontFamily: "'JetBrains Mono',monospace",
                              color: "#1e293b",
                              textAlign: "center",
                              outline: "none",
                              boxSizing: "border-box",
                              background: "#fff",
                            }}
                          />
                        </div>
                      ) : (
                        <div style={{ textAlign: "right" }}>
                          <div
                            style={{
                              fontSize: 9,
                              color: "#94a3b8",
                              marginBottom: 2,
                            }}
                          >
                            GA HCP
                          </div>
                          <div
                            style={{
                              fontSize: 18,
                              fontWeight: 700,
                              color: hasHcp ? "#1e293b" : "#d1d5db",
                              fontFamily: "'JetBrains Mono',monospace",
                            }}
                          >
                            {hasHcp ? gaHcp : "—"}
                          </div>
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
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#64748b",
              textTransform: "uppercase",
              letterSpacing: 1,
              marginBottom: 8,
            }}
          >
            All Players
          </div>
          {[...PLAYERS]
            .sort((a, b) => {
              const order = [
                "chris",
                "angus",
                "jason",
                "tom",
                "alex",
                "nick",
                "cam",
                "callum",
                "luke",
                "jturner",
                "lach",
                "jkelly",
              ];
              return order.indexOf(a.id) - order.indexOf(b.id);
            })
            .map((player) => {
              const gaHcp = state.handicaps?.[player.id];
              const hasHcp = gaHcp != null;
              return (
                <div
                  key={player.id}
                  style={{
                    ...S.card,
                    borderLeft: "3px solid #e2e8f0",
                    cursor: "default",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flex: 1,
                      }}
                    >
                      <PlayerAvatar id={player.id} size={42} live={false} />
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: "#1e293b",
                          }}
                        >
                          {player.name}
                        </div>
                        <button
                          onClick={() => setSelectedBio(player.id)}
                          style={{
                            marginTop: 6,
                            padding: "5px 10px",
                            borderRadius: 999,
                            border: "1px solid #bfdbfe",
                            background: "#eff6ff",
                            color: "#1d4ed8",
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                            fontFamily: "'DM Sans',sans-serif",
                          }}
                        >
                          View Bio
                        </button>
                        {hasHcp && (
                          <div
                            style={{
                              fontSize: 10,
                              color: "#94a3b8",
                              marginTop: 6,
                              display: "flex",
                              gap: 12,
                              flexWrap: "wrap",
                            }}
                          >
                            {COURSES.map((c) => (
                              <span
                                key={c.id}
                                style={{ display: "inline-flex", gap: 3 }}
                              >
                                <span
                                  style={{ fontWeight: 600, color: "#64748b" }}
                                >
                                  {c.short}:
                                </span>
                                <span
                                  style={{
                                    fontFamily: "'JetBrains Mono',monospace",
                                    fontWeight: 600,
                                    color: "#1e293b",
                                  }}
                                >
                                  {courseHcp(gaHcp, c, getTeeKey(state, c.id))}
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                        {!hasHcp && (
                          <div
                            style={{
                              fontSize: 10,
                              color: "#d1d5db",
                              marginTop: 4,
                            }}
                          >
                            No handicap set
                          </div>
                        )}
                      </div>
                    </div>
                    <div
                      style={{ width: 80, flexShrink: 0, textAlign: "right" }}
                    >
                      <div
                        style={{
                          fontSize: 9,
                          color: "#94a3b8",
                          marginBottom: 2,
                        }}
                      >
                        GA HCP
                      </div>
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 700,
                          color: hasHcp ? "#1e293b" : "#d1d5db",
                          fontFamily: "'JetBrains Mono',monospace",
                        }}
                      >
                        {hasHcp ? gaHcp : "—"}
                      </div>
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
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 200,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 400,
              maxHeight: "85vh",
              overflowY: "auto",
              background: "#fff",
              borderRadius: 16,
              padding: 18,
              border: "1px solid #e2e8f0",
              boxShadow: "0 20px 40px rgba(15,23,42,0.22)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "start",
                gap: 10,
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  color: "#0f172a",
                  fontFamily: "'Playfair Display',serif",
                }}
              >
                {getP(selectedBio)?.name}
              </div>
              <button
                onClick={() => setSelectedBio(null)}
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: 20,
                  lineHeight: 1,
                  color: "#64748b",
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>
            <div
              style={{
                position: "relative",
                width: "100%",
                maxWidth: 280,
                aspectRatio: "1 / 1",
                margin: "0 auto 14px",
                borderRadius: 14,
                overflow: "hidden",
                border: "2px solid #e2e8f0",
                background: "#e2e8f0",
              }}
            >
              <img
                src={PLAYER_BIO_IMAGES[selectedBio] || PLAYER_PHOTOS[selectedBio]}
                alt={getP(selectedBio)?.name}
                style={{
                  display: "block",
                  width: "100%",
                  height: "100%",
                  borderRadius: 14,
                  objectFit: "cover",
                  objectPosition: PLAYER_PHOTOS_VISIBLE
                    ? "center"
                    : "center 15%",
                  transform: PLAYER_PHOTOS_VISIBLE ? "none" : "scale(1.22)",
                  filter: PLAYER_PHOTOS_VISIBLE
                    ? "none"
                    : HIDDEN_PLAYER_IMAGE_FILTER,
                }}
              />
              {!PLAYER_PHOTOS_VISIBLE && (
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: HIDDEN_PLAYER_IMAGE_OVERLAY,
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "center",
                    padding: 18,
                    boxSizing: "border-box",
                  }}
                >
                  <div
                    style={{
                      padding: "9px 14px",
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.92)",
                      border: "1px solid rgba(148,163,184,0.65)",
                      color: "#475569",
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: 0.7,
                      textTransform: "uppercase",
                    }}
                  >
                    Revealed when live
                  </div>
                </div>
              )}
            </div>
            <p
              style={{
                margin: 0,
                fontSize: 14,
                color: "#334155",
                lineHeight: 1.65,
                whiteSpace: "pre-wrap",
              }}
            >
              {PLAYER_BIOS[selectedBio] || "Bio coming soon."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────
const S = {
  app: {
    minHeight: "100vh",
    background: "#fafcfa",
    fontFamily: "'DM Sans',sans-serif",
    maxWidth: 480,
    margin: "0 auto",
    position: "relative",
    paddingBottom: 80,
  },
  loading: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#fafcfa",
  },
  spinner: {
    width: 40,
    height: 40,
    borderRadius: "50%",
    border: "3px solid #e2e8f0",
    borderTopColor: "#2d6a4f",
    animation: "spin 1s linear infinite",
  },
  header: {
    display: "flex",
    alignItems: "center",
    padding: "10px 12px",
    background: "#fff",
    borderBottom: "1px solid #e2e8f0",
    position: "sticky",
    top: 0,
    zIndex: 100,
  },
  content: { padding: "16px" },
  nav: {
    position: "fixed",
    bottom: 0,
    left: "50%",
    transform: "translateX(-50%)",
    width: "100%",
    maxWidth: 480,
    display: "flex",
    background: "rgba(255,255,255,0.97)",
    backdropFilter: "blur(12px)",
    borderTop: "1px solid #e2e8f0",
    padding: "4px 0 env(safe-area-inset-bottom,4px)",
    zIndex: 100,
  },
  navBtn: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    background: "none",
    border: "none",
    padding: "8px 0",
    minHeight: 52,
    cursor: "pointer",
    fontFamily: "'DM Sans',sans-serif",
    touchAction: "manipulation",
  },
  input: {
    display: "block",
    width: "100%",
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    fontFamily: "'DM Sans',sans-serif",
    fontSize: 14,
    color: "#1e293b",
    background: "#fff",
    outline: "none",
    boxSizing: "border-box",
    marginBottom: 12,
  },
  card: {
    display: "block",
    width: "100%",
    background: "#fff",
    borderRadius: 12,
    padding: "12px 14px",
    marginBottom: 8,
    border: "1px solid #e2e8f0",
    cursor: "pointer",
    textAlign: "left",
    boxSizing: "border-box",
  },
  backBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    background: "none",
    border: "none",
    color: "#2d6a4f",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    padding: "4px 0",
    marginBottom: 10,
    fontFamily: "'DM Sans',sans-serif",
  },
  sectTitle: {
    fontFamily: "'Playfair Display',serif",
    fontSize: 22,
    fontWeight: 700,
    color: "#1a2e1a",
    margin: "0 0 12px",
  },
  th: {
    padding: "6px 4px",
    fontSize: 10,
    fontWeight: 700,
    color: "#64748b",
    textAlign: "center",
    borderBottom: "2px solid #e2e8f0",
  },
  td: {
    padding: "6px 3px",
    textAlign: "center",
    borderBottom: "1px solid #f1f5f9",
    fontSize: 11,
  },
  tblIn: {
    width: 28,
    height: 22,
    borderRadius: 4,
    border: "1px solid #d1d5db",
    textAlign: "center",
    fontSize: 11,
    fontWeight: 600,
    color: "#1e293b",
    outline: "none",
    WebkitAppearance: "none",
    MozAppearance: "textfield",
  },
};
