'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { createClient } from '@supabase/supabase-js';

/* ================================================================== */
/*  SUPABASE                                                           */
/*  Replace with your own project credentials if you ever change them. */
/* ================================================================== */
const SUPABASE_URL = 'https://qdtvducpdaffqcuuijnk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_xXzw0zkeWUf6K8i-uPlVkQ__k3siTjz';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ================================================================== */
/*  CONSTANTS & HELPERS                                                */
/* ================================================================== */
const ENCOUNTER_CHANCE = 0.35; // vehicle trips ("The Micra Experience")
const WALK_ENCOUNTER_CHANCE = 0.12;
const TICK_MS = 1000; // 1 real second...
const TICK_MINUTES = 3; // ...= 3 game minutes (a full day is ~8 real minutes)
const RENT = 8000; // hostel fee, charged every 7th day
const MAX_CHAT_LEN = 280;

const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));
const naira = (n) => '₦' + Math.round(n).toLocaleString('en-NG');
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const dayOf = (m) => Math.floor(m / 1440) + 1;
const skillLevel = (xp) => Math.min(10, Math.floor(Math.sqrt(xp)));
const skillInfo = (xp) => {
  const level = skillLevel(xp);
  const lo = level * level;
  const hi = (level + 1) * (level + 1);
  return { level, pct: level >= 10 ? 100 : Math.round(((xp - lo) / (hi - lo)) * 100) };
};
const fmtTime = (m) => {
  const t = Math.floor(m % 1440);
  const h = Math.floor(t / 60);
  const mm = t % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
const fmtDur = (min) => (min >= 60 ? `${+(min / 60).toFixed(1)}h` : `${min}min`);
const clockIcon = (m) => {
  const h = (m % 1440) / 60;
  if (h < 5 || h >= 19.5) return '🌙';
  if (h < 7) return '🌅';
  if (h < 17) return '☀️';
  return '🌇';
};
const skyFor = (m) => {
  const h = (m % 1440) / 60;
  if (h >= 21 || h < 4.5) return { color: '#0b1030', op: 0.55 };
  if (h < 6.5) return { color: '#ff9a4a', op: 0.22 };
  if (h < 17) return { color: '#000000', op: 0 };
  if (h < 19) return { color: '#ff7a2a', op: 0.25 };
  return { color: '#1a1040', op: 0.42 };
};
const PALETTE = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];
const colorFor = (id = '') => {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

const NEED_KEYS = ['hunger', 'energy', 'hygiene', 'fun', 'social'];
const NEED_META = {
  hunger: { label: 'Food', emoji: '🍲' },
  energy: { label: 'Energy', emoji: '⚡' },
  hygiene: { label: 'Clean', emoji: '🚿' },
  fun: { label: 'Fun', emoji: '🎉' },
  social: { label: 'Social', emoji: '💬' },
};

const initialGame = () => ({
  cash: 5000,
  needs: { hunger: 80, energy: 100, hygiene: 90, fun: 60, social: 50 },
  minutes: 7 * 60, // Day 1, 7:00 AM
  loc: 'ui_gate',
  skills: { tech: 0, hustle: 0, charm: 0 },
  techJob: false,
  nepaUntil: 0,
  borrowDay: 0,
  earned: 0,
  shifts: 0,
});

/* ================================================================== */
/*  THE MAP: locations, roads, pathfinding                             */
/* ================================================================== */
const LOCATIONS = {
  home: {
    id: 'home',
    name: 'Agbowo Hostel',
    area: 'Home · Agbowo',
    emoji: '🏠',
    x: 120,
    y: 420,
    desc: 'Your small rented room. A bucket, a fan that works when NEPA allows, and a window facing a sea of rusty roofs.',
    actions: ['sleep', 'nap', 'shower', 'cook', 'tv', 'code_home'],
  },
  ui_gate: {
    id: 'ui_gate',
    name: 'UI Gate',
    area: 'University of Ibadan',
    emoji: '🎓',
    x: 150,
    y: 170,
    desc: 'The famous gate swarms with students, hawkers shouting "Ọ̀rẹ́ mi, come and see!", and tech bros typing furiously under the shade. Everybody here is hustling something.',
    actions: ['hangout', 'flash_gig', 'library', 'snacks'],
  },
  amala_skye: {
    id: 'amala_skye',
    name: 'Amala Skye',
    area: 'Bodija',
    emoji: '🍲',
    x: 400,
    y: 115,
    desc: 'Steam rises from the pots, the gbegiri is silky, the ewedu is perfectly drawn, and the ata dindin is angry. This is where Ibadan restores souls.',
    actions: ['amala', 'water', 'serve', 'cook_shift'],
  },
  ventura_mall: {
    id: 'ventura_mall',
    name: 'Ventura Mall',
    area: 'Samonda',
    emoji: '🎬',
    x: 655,
    y: 135,
    desc: 'Air-conditioning, neon lights and the smell of popcorn. Ibadan comes here to cool off, show off, and strike a pose.',
    actions: ['bowling', 'movie', 'cashier', 'clothes'],
  },
  mapo_hall: {
    id: 'mapo_hall',
    name: 'Mapo Hall',
    area: 'Mapo Hill',
    emoji: '🏛️',
    x: 415,
    y: 300,
    desc: 'From the hill, a sea of rusty brown roofs spreads to the horizon. The old hall watches over the city like a proud chief.',
    actions: ['brown_roofs', 'selfies'],
  },
  cocoa_house: {
    id: 'cocoa_house',
    name: 'Cocoa House',
    area: 'Dugbe',
    emoji: '🏢',
    x: 575,
    y: 335,
    desc: "Nigeria's first skyscraper still towers over Dugbe. Suits, startups and Wi-Fi hunters share the lobby while the museum quietly keeps history alive.",
    actions: ['apply_job', 'tech_shift', 'senior_shift', 'class', 'museum'],
  },
  challenge: {
    id: 'challenge',
    name: 'Challenge Junction',
    area: 'Challenge',
    emoji: '🚕',
    x: 330,
    y: 475,
    desc: 'Horns, Micras and conductors screaming destinations. If you can drive and talk loud, there is money at this roundabout.',
    actions: ['cab', 'suya'],
  },
  bowers: {
    id: 'bowers',
    name: "Bower's Tower",
    area: 'Oke-Are',
    emoji: '🗼',
    x: 700,
    y: 455,
    desc: 'The highest point in town. Climb the spiral stairs and the whole of Ibadan lies at your feet, tin roofs shining like old coins.',
    actions: ['climb', 'tourists'],
  },
};
const LOCATION_ORDER = Object.keys(LOCATIONS);

const JUNCTIONS = {
  j1: { x: 260, y: 265 },
  j2: { x: 505, y: 215 },
  j3: { x: 520, y: 440 },
  j4: { x: 290, y: 380 },
};
const NODES = {};
Object.values(LOCATIONS).forEach((l) => {
  NODES[l.id] = { x: l.x, y: l.y };
});
Object.entries(JUNCTIONS).forEach(([k, v]) => {
  NODES[k] = v;
});
const EDGES = [
  ['ui_gate', 'j1'],
  ['ui_gate', 'home'],
  ['home', 'j4'],
  ['j1', 'j4'],
  ['j1', 'amala_skye'],
  ['j1', 'mapo_hall'],
  ['amala_skye', 'j2'],
  ['j2', 'ventura_mall'],
  ['j2', 'mapo_hall'],
  ['j2', 'cocoa_house'],
  ['mapo_hall', 'cocoa_house'],
  ['mapo_hall', 'j4'],
  ['j4', 'challenge'],
  ['challenge', 'j3'],
  ['j3', 'cocoa_house'],
  ['j3', 'bowers'],
];
const edgeLen = (a, b) => Math.hypot(NODES[a].x - NODES[b].x, NODES[a].y - NODES[b].y);
const ADJ = {};
EDGES.forEach(([a, b]) => {
  (ADJ[a] = ADJ[a] || []).push(b);
  (ADJ[b] = ADJ[b] || []).push(a);
});

function findPath(from, to) {
  const dist = {};
  const prev = {};
  const todo = new Set(Object.keys(NODES));
  Object.keys(NODES).forEach((k) => {
    dist[k] = Infinity;
  });
  dist[from] = 0;
  while (todo.size) {
    let u = null;
    todo.forEach((k) => {
      if (u === null || dist[k] < dist[u]) u = k;
    });
    if (u === to || dist[u] === Infinity) break;
    todo.delete(u);
    (ADJ[u] || []).forEach((v) => {
      const nd = dist[u] + edgeLen(u, v);
      if (nd < dist[v]) {
        dist[v] = nd;
        prev[v] = u;
      }
    });
  }
  const order = [to];
  let c = to;
  while (c !== from && prev[c]) {
    c = prev[c];
    order.unshift(c);
  }
  return { pts: order.map((k) => ({ ...NODES[k] })), dist: dist[to] };
}

const MODES = {
  walk: { label: 'Walk', icon: '🚶', fare: 0, speed: 60, energy: (d) => Math.max(8, Math.round(d / 14)) },
  micra: { label: 'Shared Micra', icon: '🚕', fare: 200, speed: 140, energy: () => 10 },
  ridehail: { label: 'Ride-hail', icon: '📱', fare: 2000, speed: 230, energy: () => 10 },
};

/* ================================================================== */
/*  ACTIONS (what you can do at each place)                            */
/* ================================================================== */
const ACTIONS = {
  // ---- Home
  sleep: { label: 'Sleep until morning', icon: '😴', sleep: true, hint: 'Restores Energy · wakes ~6:30 AM' },
  nap: { label: 'Take a nap', icon: '🛏️', minutes: 90, needs: { energy: 20 }, maxEnergy: 80 },
  shower: { label: 'Take a shower', icon: '🚿', minutes: 20, needs: { hygiene: 60, fun: 3 } },
  cook: { label: 'Cook indomie & egg', icon: '🍳', minutes: 30, cost: 400, needs: { hunger: 35, fun: 3 } },
  tv: { label: 'Watch Nollywood on TV', icon: '📺', minutes: 90, needs: { fun: 25, social: -2 }, power: true },
  code_home: { label: 'Practice coding on laptop', icon: '💻', minutes: 120, needs: { energy: -8, fun: -3 }, skill: { tech: 2 }, power: true },
  // ---- UI Gate
  hangout: { label: 'Hang out with students', icon: '🧑‍🤝‍🧑', minutes: 60, needs: { fun: 10, energy: -5, social: 25 }, skill: { charm: 1 } },
  flash_gig: { label: 'Flash a tech bro for a gig', icon: '💸', minutes: 60, needs: { energy: -5 }, hint: '50%: +₦10,000 · 50%: -10 Fun', special: 'flash' },
  library: { label: 'Study at the library', icon: '📚', minutes: 120, needs: { energy: -10, fun: -5 }, skill: { tech: 2 } },
  snacks: { label: 'Sell snacks to students', icon: '🥜', minutes: 240, pay: [2200, 3200], needs: { energy: -20, hunger: -15 }, skill: { hustle: 2 } },
  // ---- Amala Skye
  amala: { label: 'Buy Amala, Gbegiri & Ewedu', icon: '🍲', minutes: 40, cost: 1500, needs: { hunger: 60, energy: 25, fun: 8 } },
  water: { label: 'Buy chilled water', icon: '💧', minutes: 5, cost: 200, needs: { hunger: 3, energy: 5 } },
  serve: { label: 'Work as a server', icon: '🍽️', minutes: 240, pay: [3000, 4000], needs: { energy: -20, hunger: 10 }, skill: { hustle: 2 } },
  cook_shift: { label: 'Work as a cook', icon: '👩🏾‍🍳', minutes: 240, pay: [6000, 8000], needs: { energy: -25, hunger: 10 }, skill: { hustle: 3 }, req: { skill: 'hustle', level: 3 } },
  // ---- Ventura Mall
  bowling: { label: 'Go Bowling', icon: '🎳', minutes: 120, cost: 3000, needs: { fun: 30, social: 10, energy: -10 } },
  movie: { label: 'Watch a movie', icon: '🍿', minutes: 150, cost: 2500, needs: { fun: 25, energy: -2 } },
  cashier: { label: 'Work as a cashier', icon: '🧾', minutes: 240, pay: [4000, 5200], needs: { energy: -20 }, skill: { charm: 2 }, req: { skill: 'charm', level: 2 } },
  clothes: { label: 'Buy fresh clothes', icon: '👕', minutes: 60, cost: 6000, needs: { hygiene: 10, fun: 10 }, skill: { charm: 3 } },
  // ---- Mapo Hall
  brown_roofs: { label: 'Look at the legendary Brown Roofs', icon: '🏘️', minutes: 45, needs: { fun: 10, energy: -5 } },
  selfies: { label: 'Take selfies for the gram', icon: '🤳', minutes: 45, needs: { fun: 8, social: 5 }, skill: { charm: 1 } },
  // ---- Cocoa House
  apply_job: { label: 'Apply for a Remote Tech Job', icon: '📨', minutes: 90, minEnergy: 80, power: true, hint: 'Needs >80 Energy · 60%: ₦25,000 + remote shifts', special: 'apply' },
  tech_shift: { label: 'Remote developer shift', icon: '👨🏾‍💻', minutes: 240, pay: [11000, 13000], needs: { energy: -25, hunger: -15 }, skill: { tech: 2 }, req: { techJob: true }, power: true },
  senior_shift: { label: 'Senior dev contract', icon: '🧠', minutes: 300, pay: [22000, 26000], needs: { energy: -30, hunger: -18 }, skill: { tech: 3 }, req: { techJob: true, skill: 'tech', level: 4 }, power: true },
  class: { label: 'Join a coding bootcamp class', icon: '🎒', minutes: 180, cost: 2000, needs: { energy: -15, fun: -5 }, skill: { tech: 4 } },
  museum: { label: 'Visit the museum', icon: '🖼️', minutes: 90, cost: 500, needs: { fun: 15, energy: -5 } },
  // ---- Challenge Junction
  cab: { label: 'Drive a Micra cab', icon: '🚕', minutes: 300, pay: [5000, 8500], needs: { energy: -25, hunger: -15 }, skill: { hustle: 2 }, special: 'cab' },
  suya: { label: 'Eat suya with extra pepper', icon: '🍢', minutes: 20, cost: 1200, needs: { hunger: 35, fun: 5 } },
  // ---- Bower's Tower
  climb: { label: "Climb Bower's Tower", icon: '🪜', minutes: 90, cost: 500, needs: { fun: 30, energy: -15, social: 5 } },
  tourists: { label: 'Chat with tourists', icon: '🌍', minutes: 60, needs: { social: 25, energy: -3 }, skill: { charm: 1 } },
  // ---- Anywhere
  corn: { label: 'Buy roadside roasted corn', icon: '🌽', minutes: 10, cost: 300, needs: { hunger: 15, energy: 5 } },
  borrow: { label: 'Borrow ₦500 from a friend', icon: '🤝', minutes: 15, needs: { social: -3 }, hint: 'Once per day · +₦500', special: 'borrow' },
};
const GLOBAL_ACTIONS = ['corn', 'borrow'];

function hintFor(a) {
  if (a.hint) return a.hint;
  const p = [];
  if (a.cost) p.push(`-${naira(a.cost)}`);
  if (a.pay) p.push(`+${naira(a.pay[0])}–${naira(a.pay[1])}`);
  Object.entries(a.needs || {}).forEach(([k, v]) => p.push(`${v > 0 ? '+' : ''}${v} ${NEED_META[k].label}`));
  Object.entries(a.skill || {}).forEach(([k, v]) => p.push(`+${v} ${cap(k)} XP`));
  p.push(fmtDur(a.minutes));
  return p.join(' · ');
}

function blockReason(a, g) {
  if (a.cost && g.cash < a.cost) return `You need ${naira(a.cost)} for that.`;
  if (a.power && g.nepaUntil) return 'NEPA took light! No power for that right now. 🔦';
  if (a.req?.techJob && !g.techJob) return 'Get hired at Cocoa House first.';
  if (a.req?.skill && skillLevel(g.skills[a.req.skill]) < a.req.level)
    return `Needs ${cap(a.req.skill)} level ${a.req.level}.`;
  if (a.minEnergy && g.needs.energy <= a.minEnergy) return `You need more than ${a.minEnergy} Energy for that.`;
  if (a.sleep && g.needs.energy > 85) return "You're not sleepy yet.";
  if (a.maxEnergy && g.needs.energy > a.maxEnergy) return "You're too awake for a nap.";
  if (a.special === 'borrow' && g.borrowDay === dayOf(g.minutes)) return 'Your friends are tired of you today.';
  const eNeed = a.needs?.energy < 0 ? -a.needs.energy : 0;
  if ((a.pay || eNeed) && g.needs.energy < Math.max(eNeed, a.pay ? 15 : 0)) return 'Too tired. Rest or eat first.';
  if (a.pay && g.needs.hunger < 8) return 'Too hungry to work. Eat first!';
  return null;
}

const sleepMinutes = (minutes) => {
  const t = minutes % 1440;
  const wait = (390 - t + 1440) % 1440;
  return clamp(wait, 240, 600);
};

/* ================================================================== */
/*  TIME STEP (needs decay, NEPA, rent)                                */
/* ================================================================== */
function stepTime(g, mins) {
  const events = [];
  const n = { ...g, needs: { ...g.needs } };
  const nd = n.needs;
  const before = { ...nd };
  const f = mins / 3;
  const starving = nd.hunger <= 0;
  nd.hunger = clamp(nd.hunger - 0.2 * f);
  nd.energy = clamp(nd.energy - (0.12 + (starving ? 0.15 : 0)) * f);
  nd.hygiene = clamp(nd.hygiene - 0.1 * f);
  nd.fun = clamp(nd.fun - 0.15 * f);
  nd.social = clamp(nd.social - 0.08 * f);

  const prevMin = n.minutes;
  n.minutes += mins;

  if (n.nepaUntil && n.minutes >= n.nepaUntil) {
    n.nepaUntil = 0;
    events.push({ text: '💡 Light is back! "Up NEPA!"', type: 'success' });
  } else if (!n.nepaUntil) {
    const p = 1 - Math.pow(1 - 0.0025, f);
    if (Math.random() < p) {
      n.nepaUntil = n.minutes + rand(60, 180);
      events.push({ text: '🔦 NEPA took light! Fans, TV and laptops are off.', type: 'error' });
    }
  }

  const d0 = dayOf(prevMin);
  const d1 = dayOf(n.minutes);
  for (let d = d0 + 1; d <= d1; d += 1) {
    if (d % 7 === 1) {
      if (n.cash >= RENT) {
        n.cash -= RENT;
        events.push({ text: `🏠 Weekly hostel fee paid: -${naira(RENT)}.`, type: 'info' });
      } else {
        n.cash = 0;
        nd.fun = clamp(nd.fun - 30);
        nd.social = clamp(nd.social - 15);
        events.push({ text: '🏠 You could not pay the hostel fee. The landlady shouted at you. -30 Fun', type: 'error' });
      }
    }
  }

  if (before.hunger >= 20 && nd.hunger < 20) events.push({ text: '🍲 You are very hungry. Go and eat!', type: 'error' });
  if (before.energy >= 20 && nd.energy < 20) events.push({ text: '⚡ You are exhausted. Rest or eat something.', type: 'error' });
  return { g: n, events };
}

/* ================================================================== */
/*  RANDOM ENCOUNTERS ("The Micra Experience")                         */
/* ================================================================== */
const SCENARIOS = [
  {
    id: 'segbon',
    modes: ['micra'],
    emoji: '🚕',
    title: 'Ṣẹgbọn!',
    text: "You enter a Micra and the driver tells you to 'Ṣẹgbọn' (shift) so a 5th passenger can sit on your lap. Do you?",
    choices: [
      { label: 'Comply and squeeze in.', resolve: () => ({ text: 'Your knees file a formal complaint. The fare also somehow went up a little.', cash: -500, energy: 0, fun: -15 }) },
      { label: 'Alight angrily and trek.', resolve: () => ({ text: 'You storm out, trek in the sun, and feel weirdly proud of yourself.', cash: 0, energy: -30, fun: 10 }) },
    ],
  },
  {
    id: 'rally',
    modes: ['micra', 'ridehail', 'walk'],
    emoji: '📣',
    title: 'Challenge Junction Rally',
    text: 'You are standing at Challenge junction and a political campaign rally blocks the road, throwing free money into the crowd.',
    choices: [
      {
        label: 'Scramble for the cash.',
        resolve: () =>
          Math.random() < 0.6
            ? { text: 'You catch a fistful of notes and slip away smiling.', cash: 5000, energy: 0, fun: 0 }
            : { text: 'Somebody elbowed you and your pocket got picked in the chaos. Ouch.', cash: -2000, energy: -20, fun: 0 },
      },
      { label: 'Mind your business and walk away.', resolve: () => ({ text: 'You walk on. A wise Ibadan citizen.', cash: 0, energy: 0, fun: 0 }) },
    ],
  },
  {
    id: 'conductor',
    modes: ['micra'],
    emoji: '🗣️',
    title: 'The Conductor and the Change',
    text: 'The conductor says he has no change and offers you a stick of chewing gum instead of ₦100.',
    choices: [
      { label: 'Argue until he finds the change.', resolve: () => ({ text: 'The whole bus joins the debate. You win your ₦100 and some respect.', cash: 100, energy: -10, fun: 5 }) },
      { label: 'Take the gum and let it go.', resolve: () => ({ text: 'The gum is minty. Peace costs ₦100.', cash: -100, energy: 0, fun: 3 }) },
    ],
  },
  {
    id: 'surge',
    modes: ['ridehail'],
    emoji: '📱',
    title: 'Surge Pricing Wahala',
    text: 'Your ride-hail driver calls: "Oga, traffic is heavy, add ₦1,000 or I cancel."',
    choices: [
      { label: 'Pay the extra ₦1,000.', resolve: () => ({ text: 'He arrives grinning. Your wallet cries quietly.', cash: -1000, energy: 0, fun: -3 }) },
      { label: 'Cancel and wait for another driver.', resolve: () => ({ text: 'The next driver is a gentleman and plays good music.', cash: 0, energy: -10, fun: 5 }) },
    ],
  },
  {
    id: 'agbero',
    modes: ['micra', 'walk'],
    emoji: '🧢',
    title: 'The Agbero Wants His Own',
    text: 'An agbero in a faded cap blocks you: "Oga, ticket money. ₦200 only!"',
    choices: [
      { label: 'Pay him quickly.', resolve: () => ({ text: 'He blesses you with three generations of blessings.', cash: -200, energy: 0, fun: 2 }) },
      {
        label: 'Argue that you do not owe anything.',
        resolve: () =>
          Math.random() < 0.5
            ? { text: 'He backs down when he sees your confidence. Free passage!', cash: 0, energy: -3, fun: 8 }
            : { text: 'He and his boys escort you to the roadside. It costs more than ₦200.', cash: -500, energy: -5, fun: -10 },
      },
    ],
  },
  {
    id: 'dog',
    modes: ['walk'],
    emoji: '🐕',
    title: 'Ọjà Dog Chase',
    text: 'A dog starts barking and chasing you near the market. Bold of it.',
    choices: [
      { label: 'Run for your life.', resolve: () => ({ text: 'You sprint like a Olympian. The dog loses interest. You do not.', cash: 0, energy: -15, fun: 5 }) },
      {
        label: 'Stand still and shoo it.',
        resolve: () =>
          Math.random() < 0.6
            ? { text: 'The dog sits down, confused. You continue with dignity.', cash: 0, energy: 0, fun: 5 }
            : { text: 'It barked louder and a crowd gathered to laugh at you.', cash: 0, energy: -5, fun: -15 },
      },
    ],
  },
  {
    id: 'okada',
    modes: ['walk'],
    emoji: '🏍️',
    title: 'Okada Man Special',
    text: 'An okada rider slows beside you: "Oga, I go drop you for ₦500, no wahala."',
    choices: [
      { label: 'Hop on.', resolve: () => ({ text: 'You fly through traffic and reach your destination rested (and a bit scared).', cash: -500, energy: 10, fun: 3 }) },
      { label: 'No thanks, keep trekking.', resolve: () => ({ text: 'Your legs hate you but your wallet loves you.', cash: 0, energy: -5, fun: 3 }) },
    ],
  },
];

/* ================================================================== */
/*  MAP ART (static, memoised)                                         */
/* ================================================================== */
function mulberry32(a) {
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
const ROOF_COLORS = ['#8a4b2a', '#a15a30', '#7a3f22', '#b36b3a', '#6e3820', '#955230'];
const { ROOFS, TREES } = (() => {
  const rng = mulberry32(2024);
  const roofs = [];
  const trees = [];
  const free = (x, y, roadGap, locGap) => {
    for (const [a, b] of EDGES) {
      if (distToSeg(x, y, NODES[a].x, NODES[a].y, NODES[b].x, NODES[b].y) < roadGap) return false;
    }
    for (const l of Object.values(LOCATIONS)) {
      if (Math.hypot(x - l.x, y - l.y) < locGap) return false;
    }
    return true;
  };
  let guard = 0;
  while (roofs.length < 230 && guard < 4000) {
    guard += 1;
    const x = 10 + rng() * 780;
    const y = 10 + rng() * 540;
    if (!free(x, y, 18, 52)) continue;
    roofs.push({
      x,
      y,
      w: 12 + rng() * 14,
      h: 9 + rng() * 9,
      r: (rng() - 0.5) * 50,
      c: ROOF_COLORS[Math.floor(rng() * ROOF_COLORS.length)],
    });
  }
  guard = 0;
  while (trees.length < 55 && guard < 2000) {
    guard += 1;
    const x = 10 + rng() * 780;
    const y = 10 + rng() * 540;
    if (!free(x, y, 16, 50)) continue;
    trees.push({ x, y, r: 5 + rng() * 5 });
  }
  return { ROOFS: roofs, TREES: trees };
})();

const MapGround = memo(function MapGround() {
  return (
    <g>
      <defs>
        <linearGradient id="ground" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5d7d3a" />
          <stop offset="1" stopColor="#7a8a45" />
        </linearGradient>
      </defs>
      <rect width="800" height="560" fill="url(#ground)" />
      <ellipse cx="180" cy="300" rx="150" ry="70" fill="#8a6f3d" opacity=".25" />
      <ellipse cx="620" cy="260" rx="120" ry="60" fill="#8a6f3d" opacity=".22" />
      <ellipse cx="420" cy="500" rx="170" ry="45" fill="#6d8f3c" opacity=".35" />
      {/* Mapo hill rings */}
      <ellipse cx="415" cy="305" rx="105" ry="68" fill="#8f7a45" opacity=".55" />
      <ellipse cx="415" cy="305" rx="78" ry="50" fill="#a08a52" opacity=".6" />
      <ellipse cx="415" cy="305" rx="52" ry="33" fill="#b39c62" opacity=".65" />
      {TREES.map((t, i) => (
        <g key={`t${i}`}>
          <circle cx={t.x} cy={t.y} r={t.r} fill="#2f5a2a" />
          <circle cx={t.x - 1.5} cy={t.y - 1.5} r={t.r * 0.6} fill="#3f7a35" />
        </g>
      ))}
      {ROOFS.map((r, i) => (
        <g key={`r${i}`} transform={`translate(${r.x} ${r.y}) rotate(${r.r})`}>
          <rect x={-r.w / 2} y={-r.h / 2} width={r.w} height={r.h} rx="1.5" fill={r.c} />
          <line x1={-r.w / 2} y1="0" x2={r.w / 2} y2="0" stroke="#00000033" strokeWidth="1" />
        </g>
      ))}
      {/* roads */}
      {EDGES.map(([a, b], i) => (
        <line key={`rb${i}`} x1={NODES[a].x} y1={NODES[a].y} x2={NODES[b].x} y2={NODES[b].y} stroke="#5a4a30" strokeWidth="17" strokeLinecap="round" />
      ))}
      {EDGES.map(([a, b], i) => (
        <line key={`rt${i}`} x1={NODES[a].x} y1={NODES[a].y} x2={NODES[b].x} y2={NODES[b].y} stroke="#d9c7a0" strokeWidth="13" strokeLinecap="round" />
      ))}
      {EDGES.map(([a, b], i) => (
        <line key={`rd${i}`} x1={NODES[a].x} y1={NODES[a].y} x2={NODES[b].x} y2={NODES[b].y} stroke="#ffffff88" strokeWidth="1.5" strokeDasharray="6 8" />
      ))}
      {Object.values(JUNCTIONS).map((j, i) => (
        <circle key={`j${i}`} cx={j.x} cy={j.y} r="9" fill="#d9c7a0" />
      ))}
    </g>
  );
});

function LocIcon({ id }) {
  switch (id) {
    case 'home':
      return (
        <g>
          <rect x="-18" y="-6" width="36" height="24" rx="2" fill="#e8d5b0" />
          <path d="M-25 -4 L0 -27 L25 -4Z" fill="#9a4a24" />
          <rect x="-5" y="4" width="10" height="14" fill="#5b3a22" />
          <rect x="-15" y="0" width="7" height="7" fill="#9fd3ea" />
          <rect x="8" y="0" width="7" height="7" fill="#9fd3ea" />
        </g>
      );
    case 'ui_gate':
      return (
        <g>
          <rect x="-30" y="-16" width="12" height="34" fill="#efe7d4" />
          <rect x="18" y="-16" width="12" height="34" fill="#efe7d4" />
          <path d="M-30 -16 Q0 -46 30 -16 L30 -8 Q0 -34 -30 -8Z" fill="#b8472a" />
          <rect x="-11" y="-30" width="22" height="9" rx="2" fill="#2b1a10" />
          <text x="0" y="-23" textAnchor="middle" fontSize="7" fontWeight="700" fill="#ffd9a0">UI</text>
        </g>
      );
    case 'amala_skye':
      return (
        <g>
          <rect x="-22" y="-4" width="44" height="22" rx="3" fill="#7a4a2a" />
          <path d="M-28 -4 L-22 -22 H22 L28 -4Z" fill="#e24b2a" />
          {[-18, -6, 6, 18].map((x) => (
            <rect key={x} x={x - 3} y="-22" width="6" height="18" fill="#fff4d6" opacity=".85" />
          ))}
          <circle cx="0" cy="8" r="8" fill="#3a2a1a" />
          <circle cx="0" cy="8" r="5" fill="#5a8a2a" />
        </g>
      );
    case 'cocoa_house':
      return (
        <g>
          <rect x="-15" y="-52" width="30" height="70" fill="#c9b79a" />
          <rect x="-15" y="-52" width="30" height="6" fill="#8a6a44" />
          {[0, 1, 2, 3, 4].map((r) =>
            [-9, 3].map((x) => <rect key={`${r}${x}`} x={x} y={-42 + r * 12} width="6" height="7" fill="#6fa0c4" />)
          )}
          <rect x="-4" y="8" width="8" height="10" fill="#5b3a22" />
        </g>
      );
    case 'ventura_mall':
      return (
        <g>
          <rect x="-36" y="-14" width="72" height="32" rx="3" fill="#6d4ca8" />
          <rect x="-36" y="-19" width="72" height="9" rx="3" fill="#8b6bd0" />
          <text x="0" y="-12" textAnchor="middle" fontSize="7" fontWeight="700" fill="#fff">VENTURA</text>
          <rect x="-10" y="2" width="20" height="16" fill="#f6e1a0" />
          <rect x="-28" y="0" width="12" height="9" fill="#cdb8f0" />
          <rect x="16" y="0" width="12" height="9" fill="#cdb8f0" />
        </g>
      );
    case 'mapo_hall':
      return (
        <g>
          <path d="M-32 -8 L0 -28 L32 -8Z" fill="#a8532c" />
          <rect x="-28" y="-8" width="56" height="26" fill="#f0e6d0" />
          {[-22, -9, 4, 17].map((x) => (
            <rect key={x} x={x} y="-8" width="5" height="26" fill="#d5c7a8" />
          ))}
        </g>
      );
    case 'challenge':
      return (
        <g>
          <circle r="28" fill="#5a4a30" />
          <circle r="23" fill="#8aa05a" />
          <circle r="14" fill="#6f8c45" />
          <rect x="-11" y="-5" width="22" height="11" rx="4" fill="#f2c230" stroke="#6b4e00" strokeWidth="1" />
          <rect x="-4" y="-9" width="8" height="5" rx="1" fill="#9fd3ea" />
          <circle cx="-6" cy="7" r="2.5" fill="#222" />
          <circle cx="6" cy="7" r="2.5" fill="#222" />
        </g>
      );
    case 'bowers':
      return (
        <g>
          <path d="M-9 18 L-5 -34 L5 -34 L9 18Z" fill="#b5b0a4" />
          <rect x="-15" y="-44" width="30" height="10" rx="2" fill="#8a5a3a" />
          <path d="M-17 -44 L0 -60 L17 -44Z" fill="#a8532c" />
          <rect x="-3" y="-6" width="6" height="8" fill="#5b3a22" />
        </g>
      );
    default:
      return null;
  }
}

const MapPlaces = memo(function MapPlaces({ currentLoc, onSelect }) {
  return (
    <g>
      {LOCATION_ORDER.map((id) => {
        const l = LOCATIONS[id];
        const w = l.name.length * 6.1 + 14;
        return (
          <g key={id} transform={`translate(${l.x} ${l.y})`} onClick={() => onSelect(id)} style={{ cursor: 'pointer' }}>
            {currentLoc === id && (
              <circle r="40" fill="none" stroke="#ffb347" strokeWidth="3" opacity=".9">
                <animate attributeName="r" values="36;46;36" dur="1.6s" repeatCount="indefinite" />
                <animate attributeName="opacity" values=".95;.3;.95" dur="1.6s" repeatCount="indefinite" />
              </circle>
            )}
            <LocIcon id={id} />
            <g transform="translate(0 36)">
              <rect x={-w / 2} y="0" width={w} height="17" rx="8.5" fill="#1d110bdd" stroke="#f59e0b55" />
              <text x="0" y="12" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fde7c4">
                {l.name}
              </text>
            </g>
            <circle r="40" fill="transparent" />
          </g>
        );
      })}
    </g>
  );
});

function Person({ color }) {
  return (
    <g>
      <ellipse cx="0" cy="13" rx="9" ry="3" fill="#000" opacity=".25" />
      <rect x="-5" y="-2" width="10" height="13" rx="4" fill={color} />
      <circle cx="0" cy="-8" r="6" fill="#8d5a3b" />
      <path d="M-6 -10 Q0 -17 6 -10 Q0 -12 -6 -10Z" fill="#1a1210" />
      <rect x="-4" y="10" width="3" height="5" rx="1" fill="#2b2b2b" />
      <rect x="1" y="10" width="3" height="5" rx="1" fill="#2b2b2b" />
    </g>
  );
}
function Car({ color }) {
  return (
    <g>
      <ellipse cx="0" cy="13" rx="18" ry="4" fill="#000" opacity=".25" />
      <rect x="-16" y="-4" width="32" height="14" rx="5" fill={color} stroke="#00000066" strokeWidth="1" />
      <path d="M-9 -4 L-5 -12 H6 L10 -4Z" fill={color} stroke="#00000066" strokeWidth="1" />
      <rect x="-4" y="-10" width="8" height="5" fill="#9fd3ea" />
      <circle cx="-9" cy="10" r="4" fill="#222" />
      <circle cx="9" cy="10" r="4" fill="#222" />
    </g>
  );
}
function NameTag({ name, y = -24, you }) {
  const w = name.length * 5.6 + 12;
  return (
    <g transform={`translate(0 ${y})`}>
      <rect x={-w / 2} y="-9" width={w} height="14" rx="7" fill={you ? '#f97316' : '#000000bb'} />
      <text x="0" y="1.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff">
        {name}
      </text>
    </g>
  );
}

const MapView = memo(function MapView({ currentLoc, onSelect, others, friendIds, mode, myColor, myName, nepa, sky, posRef, meRef, meInnerRef }) {
  useEffect(() => {
    meRef.current?.setAttribute('transform', `translate(${posRef.current.x} ${posRef.current.y})`);
  }, [meRef, posRef]);
  const vehicleColor = mode === 'ridehail' ? '#3b82f6' : '#f2c230';
  return (
    <svg viewBox="0 0 800 560" className="block h-auto w-full select-none" role="img" aria-label="Map of Ibadan">
      <MapGround />
      <MapPlaces currentLoc={currentLoc} onSelect={onSelect} />

      {others.map((p) => (
        <g key={p.userId} style={{ transform: `translate(${p.x}px, ${p.y}px)`, transition: 'transform .7s linear' }}>
          <g transform="scale(.85)">
            <Person color={p.color || '#888'} />
            <NameTag name={`${friendIds.has(p.userId) ? '⭐ ' : ''}${p.username}`} />
          </g>
        </g>
      ))}

      <g ref={meRef}>
        <circle r="17" fill="none" stroke="#fb923c" strokeWidth="2" opacity=".8" />
        <g ref={meInnerRef}>
          <g className={mode === 'walk' ? 'bob' : ''}>{mode === 'micra' || mode === 'ridehail' ? <Car color={vehicleColor} /> : <Person color={myColor} />}</g>
        </g>
        <NameTag name={`${myName} (you)`} you />
      </g>

      <rect width="800" height="560" style={{ fill: sky.color, opacity: sky.op, transition: 'opacity 2s, fill 2s' }} pointerEvents="none" />
      {nepa && <rect width="800" height="560" fill="#000" className="flicker" pointerEvents="none" />}
    </svg>
  );
});

/* ================================================================== */
/*  SMALL UI PIECES                                                    */
/* ================================================================== */
function NeedBar({ k, v }) {
  const m = NEED_META[k];
  const col = v < 25 ? 'bg-red-500' : v < 50 ? 'bg-amber-400' : 'bg-emerald-400';
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between text-[11px] text-amber-100/80">
        <span>{m.emoji}</span>
        <span className="font-semibold">{Math.round(v)}</span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-black/50">
        <div className={`h-full rounded-full transition-all duration-500 ${col}`} style={{ width: `${v}%` }} />
      </div>
      <div className="mt-0.5 text-center text-[9px] uppercase tracking-wide text-stone-500">{m.label}</div>
    </div>
  );
}

function Toasts({ toasts }) {
  return (
    <div className="pointer-events-none fixed left-1/2 top-2 z-[70] flex w-[calc(100%-1rem)] max-w-sm -translate-x-1/2 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`anim-fade rounded-xl border px-4 py-2.5 text-sm font-medium shadow-xl backdrop-blur ${
            t.type === 'error'
              ? 'border-red-400/40 bg-red-950/90 text-red-100'
              : t.type === 'success'
              ? 'border-emerald-400/40 bg-emerald-950/90 text-emerald-100'
              : 'border-amber-400/40 bg-stone-900/90 text-amber-100'
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

const GLOBAL_CSS = `
@keyframes fadeIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
@keyframes bobKf{from{transform:translateY(0)}to{transform:translateY(-3px)}}
@keyframes flickerKf{0%,100%{opacity:.5}30%{opacity:.38}50%{opacity:.62}70%{opacity:.42}}
.anim-fade{animation:fadeIn .25s ease-out}
.bob{animation:bobKf .3s ease-in-out infinite alternate}
.flicker{animation:flickerKf 1.6s infinite}
`;

/* ================================================================== */
/*  AUTH SCREEN (login / sign up)                                      */
/* ================================================================== */
function AuthScreen() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (mode === 'signup') {
      const uname = username.trim();
      if (!/^[A-Za-z0-9_]{3,16}$/.test(uname)) return setError('Username must be 3–16 letters, numbers or underscores.');
      if (password.length < 6) return setError('Password must be at least 6 characters.');
      setBusy(true);
      const { data: taken } = await supabase
        .from('ibadan_players')
        .select('id')
        .ilike('username', uname.replace(/_/g, '\\_'))
        .limit(1);
      if (taken && taken.length) {
        setBusy(false);
        return setError('That username is taken. Try another.');
      }
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { username: uname } },
      });
      setBusy(false);
      if (err) return setError(err.message);
      if (!data.session) {
        setMode('login');
        setInfo('Account created! Check your email to confirm it, then log in.');
      }
      return undefined;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) setError(err.message);
    return undefined;
  };

  const inputCls =
    'w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-3 text-sm text-amber-50 placeholder-stone-500 outline-none transition focus:border-orange-500';

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#150d09] p-4 text-amber-50">
      <style>{GLOBAL_CSS}</style>
      <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-orange-900/60 bg-stone-900 shadow-2xl">
        <div className="relative bg-gradient-to-br from-orange-600 via-amber-700 to-stone-900 px-6 pb-8 pt-8">
          <svg className="absolute bottom-0 left-0 w-full opacity-30" viewBox="0 0 400 40" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 40 L20 18 L40 40 L60 14 L85 40 L110 20 L135 40 L160 12 L190 40 L215 22 L240 40 L270 16 L300 40 L325 20 L350 40 L375 14 L400 40 Z" fill="#7c3f1d" />
          </svg>
          <div className="relative">
            <div className="text-4xl">🏚️</div>
            <h1 className="mt-2 text-3xl font-extrabold text-white">Ibadan Life</h1>
            <p className="mt-1 text-sm text-amber-100/90">Ride Micra, chop amala, survive NEPA, and make real friends in the city of brown roofs.</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3 p-6">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/40 p-1">
            {[
              ['login', 'Log in'],
              ['signup', 'Sign up'],
            ].map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setMode(k);
                  setError('');
                  setInfo('');
                }}
                className={`rounded-lg py-2 text-sm font-bold transition ${mode === k ? 'bg-orange-600 text-white' : 'text-stone-400'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'signup' && (
            <input className={inputCls} placeholder="Choose a username" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={16} autoComplete="username" />
          )}
          <input className={inputCls} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          <div className="relative">
            <input
              className={inputCls}
              type={showPw ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
            />
            <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-stone-400">
              {showPw ? 'Hide' : 'Show'}
            </button>
          </div>

          {error && <div className="rounded-lg border border-red-500/40 bg-red-950/60 px-3 py-2 text-sm text-red-200">{error}</div>}
          {info && <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/60 px-3 py-2 text-sm text-emerald-200">{info}</div>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-orange-600 py-3 text-sm font-extrabold text-white transition hover:bg-orange-500 active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? 'Please wait…' : mode === 'signup' ? 'Create my account' : 'Enter Ibadan'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  ROOT: auth gate                                                    */
/* ================================================================== */
export default function IbadanLife() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#150d09] text-amber-100">
        <div className="animate-pulse text-lg font-bold">🏚️ Loading Ibadan…</div>
      </div>
    );
  }
  if (!session) return <AuthScreen />;
  return <Game key={session.user.id} user={session.user} />;
}

/* ================================================================== */
/*  THE GAME                                                           */
/* ================================================================== */
function Game({ user }) {
  /* ---------- core game state (ref is the source of truth) ---------- */
  const gRef = useRef(initialGame());
  const [g, setG] = useState(gRef.current);
  const commit = useCallback((n) => {
    gRef.current = n;
    setG(n);
  }, []);

  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [username, setUsername] = useState('');
  const [tab, setTab] = useState('here');
  const [toasts, setToasts] = useState([]);
  const [encounter, setEncounter] = useState(null);
  const [traveling, setTraveling] = useState(null); // {mode, dest}
  const [sheetTarget, setSheetTarget] = useState(null);
  const [others, setOthers] = useState([]);
  const [worldStatus, setWorldStatus] = useState('connecting');

  const toastId = useRef(0);
  const encRef = useRef(null);
  const travelRef = useRef(null);
  const posRef = useRef({ x: LOCATIONS.ui_gate.x, y: LOCATIONS.ui_gate.y });
  const meRef = useRef(null);
  const meInnerRef = useRef(null);
  const trackRef = useRef(null);
  const usernameRef = useRef('');

  const myColor = useMemo(() => colorFor(user.id), [user.id]);
  const loc = LOCATIONS[g.loc] || LOCATIONS.ui_gate;
  const day = dayOf(g.minutes);
  const mood = Math.round(NEED_KEYS.reduce((s, k) => s + g.needs[k], 0) / NEED_KEYS.length);
  const sky = skyFor(g.minutes);

  const toast = useCallback((text, type = 'info') => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-3), { id, text, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400);
  }, []);
  const flush = useCallback((events) => events.forEach((e) => toast(e.text, e.type)), [toast]);

  useEffect(() => {
    encRef.current = encounter;
  }, [encounter]);
  useEffect(() => {
    usernameRef.current = username;
  }, [username]);

  /* ---------- load profile & saved progress ---------- */
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const metaName = user.user_metadata?.username || (user.email || 'player').split('@')[0];
        const { data, error } = await supabase.from('ibadan_players').select('*').eq('id', user.id).maybeSingle();
        if (error) throw error;
        let uname = data?.username || metaName;
        if (!data) {
          let ins = await supabase.from('ibadan_players').insert({ id: user.id, username: uname, state: null });
          if (ins.error && ins.error.code === '23505') {
            uname = `${uname}${rand(100, 999)}`;
            ins = await supabase.from('ibadan_players').insert({ id: user.id, username: uname, state: null });
          }
          if (ins.error) throw ins.error;
        }
        if (cancel) return;
        if (data?.state) {
          const base = initialGame();
          const s = data.state;
          const merged = { ...base, ...s, needs: { ...base.needs, ...s.needs }, skills: { ...base.skills, ...s.skills } };
          if (!LOCATIONS[merged.loc]) merged.loc = 'ui_gate';
          gRef.current = merged;
          setG(merged);
        }
        const l = LOCATIONS[gRef.current.loc];
        posRef.current = { x: l.x, y: l.y };
        setUsername(uname);
        setLoaded(true);
      } catch (err) {
        if (!cancel) setLoadError(err.message || 'Could not load your profile.');
      }
    })();
    return () => {
      cancel = true;
    };
  }, [user.id, user.email, user.user_metadata]);

  /* ---------- autosave ---------- */
  const saveNow = useCallback(async () => {
    if (!loaded || travelRef.current) return;
    await supabase
      .from('ibadan_players')
      .upsert({ id: user.id, username: usernameRef.current, state: gRef.current, updated_at: new Date().toISOString() });
  }, [loaded, user.id]);

  useEffect(() => {
    if (!loaded) return undefined;
    const id = setInterval(saveNow, 15000);
    const onHide = () => {
      if (document.hidden) saveNow();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [loaded, saveNow]);

  /* ---------- game clock ---------- */
  useEffect(() => {
    if (!loaded) return undefined;
    const id = setInterval(() => {
      if (document.hidden || encRef.current) return;
      const { g: n, events } = stepTime(gRef.current, TICK_MINUTES);
      commit(n);
      if (events.length) flush(events);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [loaded, commit, flush]);

  /* ---------- live world: presence (other players on the map) ---------- */
  useEffect(() => {
    if (!loaded) return undefined;
    const ch = supabase.channel('ibadan-world', { config: { presence: { key: user.id } } });
    const payload = () => ({
      username: usernameRef.current,
      x: Math.round(posRef.current.x),
      y: Math.round(posRef.current.y),
      loc: gRef.current.loc,
      color: myColor,
    });
    trackRef.current = () => ch.track(payload());
    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState();
      const list = [];
      Object.entries(st).forEach(([key, metas]) => {
        if (key === user.id || !metas.length) return;
        list.push({ userId: key, ...metas[metas.length - 1] });
      });
      setOthers(list);
    });
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setWorldStatus('live');
        ch.track(payload());
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setWorldStatus('error');
    });
    const keep = setInterval(() => ch.track(payload()), 20000);
    return () => {
      clearInterval(keep);
      trackRef.current = null;
      supabase.removeChannel(ch);
    };
  }, [loaded, user.id, myColor]);

  /* ---------- friends ---------- */
  const [friendRows, setFriendRows] = useState([]);
  const fetchFriends = useCallback(async () => {
    const { data } = await supabase.from('ibadan_friends').select('*').or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);
    setFriendRows(data || []);
  }, [user.id]);
  useEffect(() => {
    if (!loaded) return undefined;
    fetchFriends();
    const id = setInterval(fetchFriends, 20000);
    return () => clearInterval(id);
  }, [loaded, fetchFriends]);

  const social = useMemo(() => {
    const out = new Map();
    const inc = new Map();
    friendRows.forEach((r) => {
      if (r.user_id === user.id) out.set(r.friend_id, r.friend_username);
      if (r.friend_id === user.id) inc.set(r.user_id, r.user_username);
    });
    const friends = [];
    const requests = [];
    const pending = [];
    inc.forEach((name, id) => {
      if (out.has(id)) friends.push({ userId: id, username: name });
      else requests.push({ userId: id, username: name });
    });
    out.forEach((name, id) => {
      if (!inc.has(id)) pending.push({ userId: id, username: name });
    });
    return { friends, requests, pending, friendIds: new Set(friends.map((f) => f.userId)) };
  }, [friendRows, user.id]);

  const relation = (id) => {
    if (social.friendIds.has(id)) return 'friend';
    if (social.pending.some((p) => p.userId === id)) return 'sent';
    if (social.requests.some((p) => p.userId === id)) return 'incoming';
    return 'none';
  };

  const addFriend = async (p) => {
    const { error } = await supabase.from('ibadan_friends').insert({
      user_id: user.id,
      friend_id: p.userId,
      user_username: username,
      friend_username: p.username,
    });
    if (error) {
      toast(error.code === '23505' ? 'Request already sent.' : error.message, 'error');
      return;
    }
    const wasIncoming = social.requests.some((r) => r.userId === p.userId);
    toast(wasIncoming ? `🎉 You and ${p.username} are now friends!` : `Friend request sent to ${p.username}.`, 'success');
    const cur = gRef.current;
    commit({ ...cur, needs: { ...cur.needs, social: clamp(cur.needs.social + 8) } });
    fetchFriends();
  };

  /* ---------- global chat ---------- */
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatStatus, setChatStatus] = useState('connecting');
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef(null);
  const lastBonus = useRef(0);

  useEffect(() => {
    if (!loaded) return undefined;
    let cancelled = false;
    const merge = (a, b) => {
      const map = new Map();
      [...a, ...b].forEach((m) => map.set(m.id, m));
      return Array.from(map.values())
        .sort((x, y) => new Date(x.created_at) - new Date(y.created_at))
        .slice(-100);
    };
    const channel = supabase
      .channel('public:ibadan_life_chats')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ibadan_life_chats' }, (payload) => {
        setMessages((prev) => merge(prev, [payload.new]));
      })
      .subscribe((status) => {
        if (cancelled) return;
        if (status === 'SUBSCRIBED') setChatStatus('live');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setChatStatus('error');
      });
    (async () => {
      const { data, error } = await supabase.from('ibadan_life_chats').select('*').order('created_at', { ascending: false }).limit(50);
      if (cancelled) return;
      if (error) {
        setChatStatus('error');
        return;
      }
      setMessages((prev) => merge(prev, (data || []).slice().reverse()));
    })();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [loaded]);

  useEffect(() => {
    if (tab === 'chat') chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, tab]);

  const sendMessage = async (e) => {
    e.preventDefault();
    const message = chatInput.trim().slice(0, MAX_CHAT_LEN);
    if (!message || sending) return;
    setSending(true);
    const { error } = await supabase.from('ibadan_life_chats').insert([{ username, message, location: loc.name }]);
    setSending(false);
    if (error) {
      toast('Message failed: ' + error.message, 'error');
      return;
    }
    setChatInput('');
    if (Date.now() - lastBonus.current > 20000) {
      lastBonus.current = Date.now();
      const cur = gRef.current;
      commit({ ...cur, needs: { ...cur.needs, social: clamp(cur.needs.social + 4) } });
    }
  };

  /* ---------- running an action ---------- */
  const runAction = (id) => {
    const a = ACTIONS[id];
    const cur = gRef.current;
    if (travelRef.current) return toast('You are on the road. Wait until you arrive.', 'error');
    const why = blockReason(a, cur);
    if (why) return toast(why, 'error');

    const mins = a.sleep ? sleepMinutes(cur.minutes) : a.minutes;
    const { g: n, events } = stepTime(cur, mins);
    const nd = n.needs;
    const skillsBefore = { ...n.skills };
    n.skills = { ...n.skills };
    let earned = 0;
    let note = '';

    if (a.cost) n.cash -= a.cost;
    if (a.sleep) {
      const gain = (mins / 60) * 14 * (n.nepaUntil ? 0.6 : 1);
      nd.energy = clamp(nd.energy + gain);
      nd.hygiene = clamp(nd.hygiene - 5);
      note = n.nepaUntil ? 'Hot and sweaty without a fan...' : 'You wake up refreshed.';
    } else {
      Object.entries(a.needs || {}).forEach(([k, v]) => {
        nd[k] = clamp(nd[k] + v);
      });
    }
    Object.entries(a.skill || {}).forEach(([k, v]) => {
      n.skills[k] += v;
    });
    if (a.pay) {
      earned = rand(a.pay[0], a.pay[1]);
      n.shifts += 1;
    }

    if (a.special === 'flash') {
      if (Math.random() < 0.5) {
        earned = 10000;
        note = 'A tech bro loved your pitch and paid you!';
      } else {
        nd.fun = clamp(nd.fun - 10);
        note = 'He left you on read. -10 Fun 😔';
      }
    } else if (a.special === 'apply') {
      if (Math.random() < 0.6) {
        n.techJob = true;
        earned = 25000;
        note = 'You got the job! Remote shifts unlocked at Cocoa House.';
      } else {
        nd.energy = clamp(nd.energy - 15);
        note = 'They said "we will get back to you". -15 Energy';
      }
    } else if (a.special === 'cab') {
      if (Math.random() < 0.2) {
        earned -= 1000;
        note = 'A policeman stopped you at a checkpoint: -₦1,000.';
      }
    } else if (a.special === 'borrow') {
      earned = 500;
      n.borrowDay = dayOf(n.minutes);
      note = 'A friend sent ₦500 with a lecture attached.';
    }

    n.cash = Math.max(0, n.cash + earned);
    if (earned > 0) n.earned += earned;

    const parts = [];
    if (a.cost) parts.push(`-${naira(a.cost)}`);
    if (earned > 0) parts.push(`+${naira(earned)}`);
    commit(n);
    toast(`${a.icon} ${a.label}${parts.length ? ' · ' + parts.join(' ') : ''}${note ? '. ' + note : ''}`, earned > 0 ? 'success' : 'info');
    flush(events);
    Object.keys(n.skills).forEach((k) => {
      if (skillLevel(n.skills[k]) > skillLevel(skillsBefore[k])) {
        toast(`📈 ${cap(k)} skill reached level ${skillLevel(n.skills[k])}!`, 'success');
      }
    });
    return undefined;
  };

  /* ---------- travel ---------- */
  const startTravel = (destId, modeKey) => {
    const cur = gRef.current;
    const mode = MODES[modeKey];
    setSheetTarget(null);
    if (travelRef.current || destId === cur.loc) return;
    if (cur.needs.energy <= 0) return toast("You're too exhausted to move. Eat something first!", 'error');
    if (cur.cash < mode.fare) return toast(`You can't afford the ${naira(mode.fare)} fare.`, 'error');
    const { pts, dist } = findPath(cur.loc, destId);
    const energyCost = mode.energy(dist);
    commit({ ...cur, cash: cur.cash - mode.fare, needs: { ...cur.needs, energy: clamp(cur.needs.energy - energyCost) } });
    travelRef.current = { pts, seg: 0, t: 0, speed: mode.speed, mode: modeKey, dest: destId, dir: 1 };
    setTraveling({ mode: modeKey, dest: destId });
    toast(`${mode.icon} Heading to ${LOCATIONS[destId].name}${mode.fare ? ` (-${naira(mode.fare)}` : ' ('}${mode.fare ? ', ' : ''}-${energyCost} Energy)`);
    return undefined;
  };

  const finishTravel = useCallback(() => {
    const tr = travelRef.current;
    if (!tr) return;
    travelRef.current = null;
    setTraveling(null);
    commit({ ...gRef.current, loc: tr.dest });
    trackRef.current?.();
    toast(`📍 Arrived at ${LOCATIONS[tr.dest].name}`, 'success');
    const chance = tr.mode === 'walk' ? WALK_ENCOUNTER_CHANCE : ENCOUNTER_CHANCE;
    if (Math.random() < chance) {
      const pool = SCENARIOS.filter((s) => s.modes.includes(tr.mode));
      setEncounter({ scenario: pick(pool), outcome: null });
    }
  }, [commit, toast]);

  useEffect(() => {
    if (!traveling) return undefined;
    let raf = 0;
    let last = performance.now();
    let lastTrack = 0;
    const step = (now) => {
      const tr = travelRef.current;
      if (!tr) return;
      const dt = Math.min(0.06, (now - last) / 1000);
      last = now;
      let remain = tr.speed * dt;
      while (remain > 0 && tr.seg < tr.pts.length - 1) {
        const a = tr.pts[tr.seg];
        const b = tr.pts[tr.seg + 1];
        const left = Math.hypot(b.x - a.x, b.y - a.y) - tr.t;
        if (remain >= left) {
          remain -= left;
          tr.seg += 1;
          tr.t = 0;
        } else {
          tr.t += remain;
          remain = 0;
        }
      }
      let x;
      let y;
      if (tr.seg >= tr.pts.length - 1) {
        const e = tr.pts[tr.pts.length - 1];
        x = e.x;
        y = e.y;
      } else {
        const a = tr.pts[tr.seg];
        const b = tr.pts[tr.seg + 1];
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        x = a.x + (b.x - a.x) * (tr.t / len);
        y = a.y + (b.y - a.y) * (tr.t / len);
        if (Math.abs(b.x - a.x) > 2) tr.dir = b.x > a.x ? 1 : -1;
      }
      posRef.current = { x, y };
      meRef.current?.setAttribute('transform', `translate(${x} ${y})`);
      if (meInnerRef.current) meInnerRef.current.style.transform = `scaleX(${tr.dir})`;
      if (now - lastTrack > 700) {
        lastTrack = now;
        trackRef.current?.();
      }
      if (tr.seg >= tr.pts.length - 1) {
        finishTravel();
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [traveling, finishTravel]);

  const onSelectLoc = useCallback((id) => {
    if (id === gRef.current.loc) setTab('here');
    else if (!travelRef.current) setSheetTarget(id);
  }, []);

  const resolveEncounter = (choice) => {
    const o = choice.resolve();
    const cur = gRef.current;
    commit({
      ...cur,
      cash: Math.max(0, cur.cash + o.cash),
      needs: { ...cur.needs, energy: clamp(cur.needs.energy + o.energy), fun: clamp(cur.needs.fun + o.fun) },
    });
    setEncounter((enc) => ({ ...enc, outcome: o }));
  };

  const logout = async () => {
    await saveNow();
    await supabase.auth.signOut();
  };

  /* ---------- early screens ---------- */
  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#150d09] p-6 text-amber-50">
        <div className="max-w-sm rounded-2xl border border-red-500/40 bg-red-950/50 p-6 text-center">
          <div className="text-4xl">🛠️</div>
          <h2 className="mt-2 text-lg font-extrabold">Database not ready</h2>
          <p className="mt-2 text-sm text-red-100/90">{loadError}</p>
          <p className="mt-2 text-xs text-red-200/70">Run the latest SQL script in your Supabase SQL Editor, then reload.</p>
          <button onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-orange-600 px-5 py-2 text-sm font-bold text-white">
            Reload
          </button>
        </div>
      </div>
    );
  }
  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#150d09] text-amber-100">
        <div className="animate-pulse text-lg font-bold">🏚️ Loading your life in Ibadan…</div>
      </div>
    );
  }

  const nepa = g.nepaUntil > 0;
  const nextRentDay = (() => {
    let d = day + 1;
    while (d % 7 !== 1) d += 1;
    return d;
  })();
  const jobBoard = Object.entries(ACTIONS)
    .filter(([, a]) => a.pay || a.special === 'apply' || a.special === 'flash' || a.special === 'cab')
    .map(([id, a]) => ({ id, a, place: LOCATION_ORDER.map((k) => LOCATIONS[k]).find((l) => l.actions.includes(id)) }));
  const hereOthers = others.filter((p) => p.loc === g.loc);
  const tabs = [
    ['here', '📍', 'Here'],
    ['career', '💼', 'Career'],
    ['people', '👥', 'People'],
    ['chat', '💬', 'Chat'],
  ];
  const pathInfo = sheetTarget ? findPath(g.loc, sheetTarget) : null;

  /* ---------- render ---------- */
  return (
    <div className="min-h-screen bg-[#150d09] text-amber-50">
      <style>{GLOBAL_CSS}</style>
      <Toasts toasts={toasts} />

      {/* HUD */}
      <header className="sticky top-0 z-30 border-b border-amber-900/50 bg-[#1d110b]/95 backdrop-blur">
        <div className="mx-auto max-w-6xl space-y-2 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-base font-extrabold tracking-tight text-orange-400">
              🏚️ Ibadan <span className="text-amber-100">Life</span>
            </h1>
            <div className="flex items-center gap-2 text-xs">
              <span className="rounded-full bg-black/40 px-3 py-1 font-semibold text-amber-100">
                {clockIcon(g.minutes)} {fmtTime(g.minutes)} · Day {day}
              </span>
              <span className="hidden items-center gap-1 rounded-full bg-black/40 px-2 py-1 text-stone-300 sm:flex">
                <span className={`h-2 w-2 rounded-full ${worldStatus === 'live' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                {others.length + 1} online
              </span>
              <button onClick={logout} className="rounded-full border border-stone-600 px-3 py-1 font-semibold text-stone-300 hover:border-orange-500">
                Log out
              </button>
            </div>
          </div>
          <div className="flex items-end gap-3">
            <div className="shrink-0">
              <div className="text-[10px] font-semibold uppercase text-stone-400">💰 Cash</div>
              <div className="text-xl font-extrabold leading-none text-emerald-400">{naira(g.cash)}</div>
            </div>
            <div className="grid flex-1 grid-cols-5 gap-2">
              {NEED_KEYS.map((k) => (
                <NeedBar key={k} k={k} v={g.needs[k]} />
              ))}
            </div>
            <div className="hidden shrink-0 text-right sm:block">
              <div className="text-[10px] font-semibold uppercase text-stone-400">Mood</div>
              <div className="text-lg font-extrabold leading-none text-amber-200">{mood}%</div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* MAP */}
        <div>
          <div className="relative overflow-hidden rounded-2xl border border-amber-900/60 shadow-xl">
            <MapView
              currentLoc={g.loc}
              onSelect={onSelectLoc}
              others={others}
              friendIds={social.friendIds}
              mode={traveling?.mode || null}
              myColor={myColor}
              myName={username}
              nepa={nepa}
              sky={sky}
              posRef={posRef}
              meRef={meRef}
              meInnerRef={meInnerRef}
            />
            <div className="pointer-events-none absolute left-2 top-2 flex flex-col gap-1">
              {traveling && (
                <span className="rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-amber-100">
                  {MODES[traveling.mode].icon} Heading to {LOCATIONS[traveling.dest].name}…
                </span>
              )}
              {nepa && <span className="rounded-full bg-red-900/80 px-3 py-1 text-xs font-bold text-red-100">🔦 NEPA took light</span>}
            </div>
            <div className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/60 px-3 py-1 text-[10px] text-amber-100/80">Tap a place to travel</div>
          </div>
        </div>

        {/* PANELS */}
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-1 rounded-2xl bg-stone-900/80 p-1">
            {tabs.map(([k, icon, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`rounded-xl py-2 text-xs font-bold transition ${tab === k ? 'bg-orange-600 text-white' : 'text-stone-400 hover:text-amber-100'}`}
              >
                <div className="text-base leading-none">{icon}</div>
                {label}
              </button>
            ))}
          </div>

          {/* ---- HERE ---- */}
          {tab === 'here' && (
            <div className="space-y-3">
              <section className="rounded-2xl border border-amber-900/50 bg-gradient-to-br from-orange-900/40 to-stone-900 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-300/80">{loc.area}</p>
                <h2 className="text-xl font-extrabold">
                  {loc.emoji} {loc.name}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-amber-50/85">{loc.desc}</p>
                {hereOthers.length > 0 && (
                  <p className="mt-2 text-xs text-emerald-300">👥 {hereOthers.map((p) => p.username).join(', ')} {hereOthers.length > 1 ? 'are' : 'is'} here too.</p>
                )}
              </section>

              <section className="rounded-2xl border border-amber-900/40 bg-stone-900/70 p-3">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-orange-300">What will you do?</h3>
                <div className="grid gap-2">
                  {[...loc.actions.filter((id) => !(id === 'apply_job' && g.techJob)), ...GLOBAL_ACTIONS].map((id) => {
                    const a = ACTIONS[id];
                    const why = blockReason(a, g);
                    const isGlobal = GLOBAL_ACTIONS.includes(id);
                    return (
                      <button
                        key={id}
                        onClick={() => runAction(id)}
                        disabled={!!traveling}
                        className={`rounded-xl border px-3 py-2.5 text-left transition active:scale-[0.98] disabled:opacity-50 ${
                          why
                            ? 'border-stone-700 bg-stone-800/50'
                            : isGlobal
                            ? 'border-stone-600 bg-stone-800/70 hover:border-amber-500/60'
                            : 'border-orange-700/40 bg-gradient-to-br from-orange-700/25 to-amber-900/25 hover:border-orange-400'
                        }`}
                      >
                        <div className={`text-sm font-semibold ${why ? 'text-stone-400' : 'text-amber-50'}`}>
                          {a.icon} {a.label}
                        </div>
                        <div className={`mt-0.5 text-xs ${why ? 'text-red-300/80' : 'text-amber-200/70'}`}>{why || hintFor(a)}</div>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-2xl border border-amber-900/40 bg-stone-900/70 p-3">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-orange-300">🗺️ Go somewhere</h3>
                <div className="flex flex-wrap gap-2">
                  {LOCATION_ORDER.filter((id) => id !== g.loc).map((id) => (
                    <button
                      key={id}
                      onClick={() => !traveling && setSheetTarget(id)}
                      className="rounded-full border border-stone-600 bg-stone-800 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:border-orange-500"
                    >
                      {LOCATIONS[id].emoji} {LOCATIONS[id].name}
                    </button>
                  ))}
                </div>
              </section>
            </div>
          )}

          {/* ---- CAREER ---- */}
          {tab === 'career' && (
            <div className="space-y-3">
              <section className="rounded-2xl border border-amber-900/40 bg-stone-900/70 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-extrabold text-orange-300">
                    {username} · Hustler Level {Math.floor((g.skills.tech + g.skills.hustle + g.skills.charm) / 6) + 1}
                  </h3>
                  <span className="text-xs text-stone-400">Mood {mood}%</span>
                </div>
                <div className="mt-3 space-y-3">
                  {['tech', 'hustle', 'charm'].map((k) => {
                    const info = skillInfo(g.skills[k]);
                    return (
                      <div key={k}>
                        <div className="flex justify-between text-xs">
                          <span className="font-semibold">
                            {k === 'tech' ? '💻' : k === 'hustle' ? '💪🏾' : '✨'} {cap(k)}
                          </span>
                          <span className="text-amber-200">Level {info.level}</span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/50">
                          <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-300 transition-all duration-500" style={{ width: `${info.pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-xl bg-black/30 p-2">
                    <div className="font-extrabold text-emerald-400">{naira(g.earned)}</div>
                    <div className="text-stone-400">Total earned</div>
                  </div>
                  <div className="rounded-xl bg-black/30 p-2">
                    <div className="font-extrabold text-amber-200">{g.shifts}</div>
                    <div className="text-stone-400">Shifts worked</div>
                  </div>
                  <div className="rounded-xl bg-black/30 p-2">
                    <div className="font-extrabold text-amber-200">{g.techJob ? 'Yes' : 'No'}</div>
                    <div className="text-stone-400">Remote job</div>
                  </div>
                </div>
                <p className="mt-3 text-xs text-stone-400">
                  🏠 Hostel fee {naira(RENT)} is charged on Day {nextRentDay} ({nextRentDay - day} day{nextRentDay - day === 1 ? '' : 's'} left).
                </p>
              </section>

              <section className="rounded-2xl border border-amber-900/40 bg-stone-900/70 p-3">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-orange-300">Job board</h3>
                <div className="space-y-2">
                  {jobBoard.map(({ id, a, place }) => {
                    const lockedReason =
                      a.req?.techJob && !g.techJob
                        ? 'Get hired first'
                        : a.req?.skill && skillLevel(g.skills[a.req.skill]) < a.req.level
                        ? `${cap(a.req.skill)} lvl ${a.req.level} needed`
                        : null;
                    const pay = a.pay ? `${naira(a.pay[0])}–${naira(a.pay[1])}` : id === 'flash_gig' ? 'up to ₦10,000' : id === 'apply_job' ? '₦25,000 sign-on' : '';
                    return (
                      <div key={id} className="flex items-center justify-between rounded-xl bg-black/30 px-3 py-2">
                        <div>
                          <div className="text-sm font-semibold">
                            {a.icon} {a.label}
                          </div>
                          <div className="text-xs text-stone-400">
                            {place?.name} · {pay}
                          </div>
                        </div>
                        <span className={`text-[10px] font-bold ${lockedReason ? 'text-red-300' : 'text-emerald-400'}`}>
                          {id === 'apply_job' && g.techJob ? 'HIRED ✓' : lockedReason || 'OPEN'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          )}

          {/* ---- PEOPLE ---- */}
          {tab === 'people' && (
            <div className="space-y-3">
              {social.requests.length > 0 && (
                <section className="rounded-2xl border border-orange-600/50 bg-orange-950/40 p-3">
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-orange-300">Friend requests</h3>
                  {social.requests.map((r) => (
                    <div key={r.userId} className="flex items-center justify-between py-1">
                      <span className="text-sm font-semibold">{r.username}</span>
                      <button onClick={() => addFriend(r)} className="rounded-lg bg-orange-600 px-3 py-1 text-xs font-bold text-white">
                        Accept
                      </button>
                    </div>
                  ))}
                </section>
              )}

              <section className="rounded-2xl border border-amber-900/40 bg-stone-900/70 p-3">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-orange-300">⭐ Friends ({social.friends.length})</h3>
                {social.friends.length === 0 && <p className="text-xs text-stone-500">No friends yet. Meet players on the map and add them!</p>}
                {social.friends.map((f) => {
                  const online = others.find((p) => p.userId === f.userId);
                  return (
                    <div key={f.userId} className="flex items-center justify-between py-1.5">
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        <span className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-400' : 'bg-stone-600'}`} />
                        {f.username}
                      </span>
                      <span className="text-xs text-stone-400">{online ? `📍 ${LOCATIONS[online.loc]?.name || 'Ibadan'}` : 'offline'}</span>
                    </div>
                  );
                })}
              </section>

              <section className="rounded-2xl border border-amber-900/40 bg-stone-900/70 p-3">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-orange-300">🟢 Online now ({others.length})</h3>
                {others.length === 0 && <p className="text-xs text-stone-500">Nobody else is online. Share the link with friends!</p>}
                {others.map((p) => {
                  const rel = relation(p.userId);
                  return (
                    <div key={p.userId} className="flex items-center justify-between py-1.5">
                      <div>
                        <div className="text-sm font-semibold">{p.username}</div>
                        <div className="text-xs text-stone-400">
                          📍 {LOCATIONS[p.loc]?.name || 'Ibadan'}
                          {p.loc === g.loc ? ' · with you' : ''}
                        </div>
                      </div>
                      {rel === 'friend' && <span className="text-xs font-bold text-amber-300">⭐ Friend</span>}
                      {rel === 'sent' && <span className="text-xs text-stone-400">Request sent</span>}
                      {(rel === 'none' || rel === 'incoming') && (
                        <button onClick={() => addFriend(p)} className="rounded-lg bg-orange-600 px-3 py-1 text-xs font-bold text-white">
                          {rel === 'incoming' ? 'Accept' : 'Add friend'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </section>
            </div>
          )}

          {/* ---- CHAT ---- */}
          {tab === 'chat' && (
            <section className="flex h-[65vh] flex-col overflow-hidden rounded-2xl border border-amber-900/40 bg-stone-900/80 lg:h-[560px]">
              <header className="flex items-center justify-between border-b border-amber-900/40 bg-black/30 px-4 py-3">
                <h3 className="text-sm font-bold text-orange-300">💬 Ibadan Global Chat</h3>
                <span className="flex items-center gap-2 text-xs text-stone-300">
                  <span className={`h-2 w-2 rounded-full ${chatStatus === 'live' ? 'bg-emerald-400' : chatStatus === 'error' ? 'bg-red-500' : 'bg-amber-400 animate-pulse'}`} />
                  {chatStatus === 'live' ? 'Live' : chatStatus === 'error' ? 'Connection error' : 'Connecting…'}
                </span>
              </header>
              {chatStatus === 'error' && (
                <div className="border-b border-red-700/40 bg-red-950/60 px-4 py-2 text-xs text-red-200">
                  Could not reach chat. Make sure you ran the latest SQL (chat policies for logged-in players).
                </div>
              )}
              <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
                {messages.length === 0 && <p className="pt-6 text-center text-sm text-stone-500">No messages yet. Say "E kaaro" to Ibadan!</p>}
                {messages.map((m) => {
                  const mine = m.username === username;
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${mine ? 'rounded-br-sm bg-orange-600 text-white' : 'rounded-bl-sm bg-stone-800 text-amber-50'}`}>
                        <div className="mb-0.5 flex flex-wrap items-center gap-x-2 text-[10px] font-semibold uppercase tracking-wide opacity-70">
                          <span>{m.username}</span>
                          {m.location && <span>· 📍 {m.location}</span>}
                          <span>· {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="break-words">{m.message}</p>
                      </div>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>
              <form onSubmit={sendMessage} className="flex gap-2 border-t border-amber-900/40 bg-black/30 p-3">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  maxLength={MAX_CHAT_LEN}
                  placeholder={`Chat as ${username}`}
                  className="min-w-0 flex-1 rounded-xl border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-amber-50 placeholder-stone-500 outline-none focus:border-orange-500"
                />
                <button
                  type="submit"
                  disabled={sending || !chatInput.trim()}
                  className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {sending ? '…' : 'Send'}
                </button>
              </form>
            </section>
          )}
        </div>
      </main>

      {/* TRAVEL SHEET */}
      {sheetTarget && pathInfo && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSheetTarget(null)}>
          <div className="anim-fade w-full max-w-md rounded-t-3xl border border-orange-800/60 bg-stone-900 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-300/80">{LOCATIONS[sheetTarget].area}</p>
            <h2 className="text-xl font-extrabold">
              {LOCATIONS[sheetTarget].emoji} {LOCATIONS[sheetTarget].name}
            </h2>
            <div className="mt-4 space-y-2">
              {Object.entries(MODES).map(([k, m]) => {
                const eCost = m.energy(pathInfo.dist);
                const broke = g.cash < m.fare;
                return (
                  <button
                    key={k}
                    onClick={() => startTravel(sheetTarget, k)}
                    className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition active:scale-[0.98] ${
                      broke ? 'border-stone-700 bg-stone-800/50 opacity-60' : 'border-orange-700/50 bg-orange-700/20 hover:border-orange-400'
                    }`}
                  >
                    <div>
                      <div className="text-sm font-bold">
                        {m.icon} {m.label}
                      </div>
                      <div className="text-xs text-stone-400">
                        ~{Math.max(2, Math.round(pathInfo.dist / m.speed))}s · -{eCost} Energy
                      </div>
                    </div>
                    <div className="text-sm font-extrabold text-amber-200">{m.fare ? naira(m.fare) : 'Free'}</div>
                  </button>
                );
              })}
            </div>
            <button onClick={() => setSheetTarget(null)} className="mt-3 w-full rounded-xl py-2 text-sm font-semibold text-stone-400">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ENCOUNTER */}
      {encounter && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="anim-fade w-full max-w-md rounded-2xl border border-orange-700/50 bg-gradient-to-b from-stone-900 to-[#1d110b] p-6 shadow-2xl">
            <div className="text-5xl">{encounter.scenario.emoji}</div>
            <p className="mt-2 text-xs font-bold uppercase tracking-widest text-orange-400">The Micra Experience</p>
            <h2 className="text-xl font-extrabold">{encounter.scenario.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-amber-100/90">{encounter.scenario.text}</p>
            {!encounter.outcome ? (
              <div className="mt-5 space-y-2">
                {encounter.scenario.choices.map((c) => (
                  <button
                    key={c.label}
                    onClick={() => resolveEncounter(c)}
                    className="w-full rounded-xl border border-orange-700/50 bg-orange-700/20 px-4 py-3 text-left text-sm font-semibold transition hover:border-orange-400 active:scale-[0.98]"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-5">
                <div className="rounded-xl border border-amber-700/40 bg-black/30 p-4 text-sm">
                  <p>{encounter.outcome.text}</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs font-bold">
                    {encounter.outcome.cash !== 0 && (
                      <span className={encounter.outcome.cash > 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {encounter.outcome.cash > 0 ? '+' : '-'}
                        {naira(Math.abs(encounter.outcome.cash))}
                      </span>
                    )}
                    {encounter.outcome.energy !== 0 && (
                      <span className={encounter.outcome.energy > 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {encounter.outcome.energy > 0 ? '+' : ''}
                        {encounter.outcome.energy} Energy
                      </span>
                    )}
                    {encounter.outcome.fun !== 0 && (
                      <span className={encounter.outcome.fun > 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {encounter.outcome.fun > 0 ? '+' : ''}
                        {encounter.outcome.fun} Fun
                      </span>
                    )}
                    {encounter.outcome.cash === 0 && encounter.outcome.energy === 0 && encounter.outcome.fun === 0 && <span className="text-stone-400">No change</span>}
                  </div>
                </div>
                <button onClick={() => setEncounter(null)} className="mt-4 w-full rounded-xl bg-orange-600 py-2.5 text-sm font-bold text-white transition hover:bg-orange-500 active:scale-[0.98]">
                  Continue
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
