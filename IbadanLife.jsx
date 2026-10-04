'use client';
import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import * as THREE from 'three';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://qdtvducpdaffqcuuijnk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_xXzw0zkeWUf6K8i-uPlVkQ__k3siTjz';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const MAX_CHAT_LEN = 280;

/* ================================================================== */
/*  HELPERS & REAL LAGOS CLOCK                                         */
/* ================================================================== */
const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));
const naira = (n) => (n < 0 ? '-₦' : '₦') + Math.round(Math.abs(n)).toLocaleString('en-NG');
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const pad2 = (n) => String(n).padStart(2, '0');
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
const hashStr = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const LAGOS_OFFSET_MS = 3600000; // Africa/Lagos is UTC+1 all year (no daylight saving)

function lagosParts(ms) {
  const d = new Date(ms + LAGOS_OFFSET_MS);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), dow: d.getUTCDay() };
}
function fmtClock(ms) {
  const p = lagosParts(ms);
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
  return `${h12}:${pad2(p.mi)} ${p.h >= 12 ? 'PM' : 'AM'}`;
}
function fmtDate(ms) {
  const p = lagosParts(ms);
  return `${DAY_NAMES[p.dow]} ${p.d} ${MONTH_NAMES[p.mo]}`;
}
const ymdOf = (ms) => {
  const p = lagosParts(ms);
  return `${p.y}-${pad2(p.mo + 1)}-${pad2(p.d)}`;
};
const hourOf = (ms) => {
  const p = lagosParts(ms);
  return p.h + p.mi / 60;
};
// increments every Monday 00:00 Lagos time
const weekIdOf = (ms) => Math.floor((Math.floor((ms + LAGOS_OFFSET_MS) / 86400000) + 3) / 7);

/* ---- sky colours through the day ---- */
const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgbToHex = (r) => '#' + r.map((v) => pad2(Math.round(clamp(v, 0, 255)).toString(16))).join('');
const lerp = (a, b, t) => a + (b - a) * t;
const lerpHex = (a, b, t) => {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex([lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)]);
};
const SKY_KEYS = [
  { h: 0, bg: '#0f1a40', top: '#0a1230', amb: 0.5, sun: 0.25, sunC: '#8fa8ff', amC: '#9bb0ff' },
  { h: 5, bg: '#2d3566', top: '#1c2350', amb: 0.55, sun: 0.3, sunC: '#a8b6ff', amC: '#a8b6ff' },
  { h: 6.5, bg: '#ffb27a', top: '#7fb4ff', amb: 0.75, sun: 0.75, sunC: '#ffd2a0', amC: '#ffe3c8' },
  { h: 9, bg: '#c9e7ff', top: '#7fc0ff', amb: 0.9, sun: 1.0, sunC: '#ffffff', amC: '#ffffff' },
  { h: 16, bg: '#c9e7ff', top: '#7fc0ff', amb: 0.9, sun: 1.0, sunC: '#fff6e0', amC: '#ffffff' },
  { h: 18, bg: '#ff9d6e', top: '#8a7bd6', amb: 0.72, sun: 0.7, sunC: '#ffb27a', amC: '#ffd9c0' },
  { h: 19.6, bg: '#3b2f6e', top: '#1c2350', amb: 0.55, sun: 0.35, sunC: '#a8b6ff', amC: '#b4b8ff' },
  { h: 21.5, bg: '#0f1a40', top: '#0a1230', amb: 0.5, sun: 0.25, sunC: '#8fa8ff', amC: '#9bb0ff' },
  { h: 24, bg: '#0f1a40', top: '#0a1230', amb: 0.5, sun: 0.25, sunC: '#8fa8ff', amC: '#9bb0ff' },
];
const clockIcon = (h) => (h >= 5 && h < 7 ? '🌅' : h >= 7 && h < 17 ? '☀️' : h >= 17 && h < 19 ? '🌇' : '🌙');
function skyAt(hour) {
  let i = 0;
  while (i < SKY_KEYS.length - 2 && hour >= SKY_KEYS[i + 1].h) i += 1;
  const a = SKY_KEYS[i];
  const b = SKY_KEYS[i + 1];
  const t = clamp((hour - a.h) / (b.h - a.h), 0, 1);
  return {
    bg: lerpHex(a.bg, b.bg, t),
    top: lerpHex(a.top, b.top, t),
    amb: lerp(a.amb, b.amb, t),
    sun: lerp(a.sun, b.sun, t),
    sunC: lerpHex(a.sunC, b.sunC, t),
    amC: lerpHex(a.amC, b.amC, t),
    night: hour < 5.5 || hour >= 19.8,
  };
}

/* ================================================================== */
/*  NEEDS, TRAITS, BIRTH LOTTERY                                       */
/* ================================================================== */
const NEED_KEYS = ['hunger', 'energy', 'fun', 'social', 'hygiene', 'bladder'];
const NEED_META = {
  hunger: { label: 'Food', emoji: '🍲' },
  energy: { label: 'Energy', emoji: '⚡' },
  fun: { label: 'Fun', emoji: '🎉' },
  social: { label: 'Social', emoji: '💬' },
  hygiene: { label: 'Clean', emoji: '🫧' },
  bladder: { label: 'Toilet', emoji: '🚽' },
};
// real minutes for a full bar to run down to empty
const DECAY_MIN = { hunger: 150, energy: 240, fun: 180, social: 240, hygiene: 300, bladder: 120 };
const SKILLS = ['tech', 'hustle', 'charm'];
const SKILL_META = { tech: { emoji: '💻', label: 'Tech' }, hustle: { emoji: '💪🏾', label: 'Hustle' }, charm: { emoji: '✨', label: 'Charm' } };

const TRAITS = {
  hustler: { name: 'Hustler', emoji: '💼', desc: 'Sees money everywhere. Hustle skill grows faster and pay is higher.', payMult: 1.1, xp: { hustle: 1.3 } },
  foodie: { name: 'Foodie', emoji: '🍲', desc: 'Lives for amala and jollof. Food fills you up more and feels extra good.', foodMult: 1.2, eatFun: 6 },
  owambe: { name: 'Owambe Spirit', emoji: '🎉', desc: 'Always ready to spray money. Parties hit different, but you get bored quicker.', funGain: 1.25, decay: { fun: 1.3 } },
  gymrat: { name: 'Gym Rat', emoji: '💪🏾', desc: 'Leg day every day. Your energy lasts longer.', decay: { energy: 0.8 } },
  techbro: { name: 'Tech Bro', emoji: '💻', desc: 'Code is life. Tech skill grows faster.', xp: { tech: 1.3 } },
  gist: { name: 'Gist Master', emoji: '🗣️', desc: 'You talk to everybody. Social drops slower and charm grows faster.', decay: { social: 0.7 }, xp: { charm: 1.3 } },
  sleeper: { name: 'Heavy Sleeper', emoji: '😴', desc: 'You sleep like a log. Sleep restores more, but you get tired faster.', sleepMult: 1.3, decay: { energy: 1.15 } },
  neat: { name: 'Neat Freak', emoji: '🧼', desc: 'Clean is everything. Hygiene drops slower.', decay: { hygiene: 0.7 } },
};
const TRAIT_ORDER = Object.keys(TRAITS);

const LOTTERIES = [
  {
    id: 'esusu', title: 'Esusu Baby!', tag: 'Self-made hits different.', weight: 30, cash: 50000,
    loan: { amount: 50000, weekly: 10000 }, skills: { hustle: 4 }, xpAll: 1.25,
    perks: ['₦50,000 esusu loan to start. Repay ₦10,000 every week', 'Hustle skill starts at level 2', 'You learn every skill 25% faster', 'Start in Agbowo or Mokola and work your way up to Bodija'],
  },
  {
    id: 'bodija', title: 'Bodija Baby!', tag: 'Daddy sends alert.', weight: 10, cash: 150000, weeklyIncome: 20000, skills: { charm: 4 },
    perks: ['Start with ₦150,000', 'Family sends you ₦20,000 every Monday', 'Charm skill starts at level 2', 'No loan, no wahala'],
  },
  {
    id: 'scholar', title: 'UI Scholar!', tag: 'First class loading...', weight: 25, cash: 30000, skills: { tech: 4 }, xp: { tech: 1.4 },
    perks: ['Start with ₦30,000', 'Tech skill starts at level 2', 'Tech skill grows 40% faster', 'Free library vibes'],
  },
  {
    id: 'iyaloja', title: "Iyaloja's Child!", tag: 'The market raised you.', weight: 25, cash: 70000, skills: { hustle: 1, charm: 1 }, foodDiscount: 0.8,
    perks: ['Start with ₦70,000', 'All food costs 20% less (market connections)', 'Hustle and Charm start at level 1', 'You know every trader by name'],
  },
  {
    id: 'fuji', title: 'Fuji Kid!', tag: 'Born with a talking drum.', weight: 10, cash: 40000, skills: { charm: 4 }, funGain: 1.2,
    perks: ['Start with ₦40,000', 'Fun gains are 20% bigger', 'Charm skill starts at level 2', 'Life of the party'],
  },
];
function rollLottery() {
  const total = LOTTERIES.reduce((s, l) => s + l.weight, 0);
  let r = Math.random() * total;
  for (const l of LOTTERIES) {
    r -= l.weight;
    if (r <= 0) return l;
  }
  return LOTTERIES[0];
}

const AREAS = {
  agbowo: { id: 'agbowo', name: 'Agbowo', fee: 5000, emoji: '🎓', desc: 'Student-town rent. Small room, big gist, right next to UI.', bonus: 'Cheapest rent' },
  mokola: { id: 'mokola', name: 'Mokola', fee: 8000, emoji: '🚕', desc: 'Busy and loud. Close to Challenge and everything.', bonus: 'Starts with a fan' },
  bodija: { id: 'bodija', name: 'Bodija', fee: 18000, emoji: '🏡', desc: 'Quiet, posh and expensive. Better neighbours and a better bed.', bonus: 'Starts with a spring bed' },
};

function traitMods(g) {
  const m = { payMult: 1, foodMult: 1, eatFun: 0, funGain: 1, sleepMult: 1, foodDiscount: 1, decay: {}, xp: { tech: 1, hustle: 1, charm: 1 } };
  (g.traits || []).forEach((id) => {
    const t = TRAITS[id];
    if (!t) return;
    if (t.payMult) m.payMult *= t.payMult;
    if (t.foodMult) m.foodMult *= t.foodMult;
    if (t.eatFun) m.eatFun += t.eatFun;
    if (t.funGain) m.funGain *= t.funGain;
    if (t.sleepMult) m.sleepMult *= t.sleepMult;
    Object.entries(t.decay || {}).forEach(([k, v]) => {
      m.decay[k] = (m.decay[k] || 1) * v;
    });
    Object.entries(t.xp || {}).forEach(([k, v]) => {
      m.xp[k] *= v;
    });
  });
  const L = LOTTERIES.find((l) => l.id === g.lottery);
  if (L) {
    if (L.xpAll) SKILLS.forEach((k) => (m.xp[k] *= L.xpAll));
    Object.entries(L.xp || {}).forEach(([k, v]) => {
      m.xp[k] *= v;
    });
    if (L.foodDiscount) m.foodDiscount = L.foodDiscount;
    if (L.funGain) m.funGain *= L.funGain;
  }
  return m;
}

function decayNeeds(needs, secs, mods, scale = 1) {
  const n = { ...needs };
  const starving = n.hunger <= 0;
  NEED_KEYS.forEach((k) => {
    let per = 100 / (DECAY_MIN[k] * 60);
    if (k === 'energy' && starving) per *= 1.5;
    n[k] = clamp(n[k] - per * secs * (mods.decay[k] || 1) * scale);
  });
  return n;
}

/* ================================================================== */
/*  LOOK (avatar appearance)                                           */
/* ================================================================== */
const SKINS = ['#f3cfa8', '#dca877', '#bb7d4a', '#8d5a3b', '#6a4027', '#43281a'];
const HAIR_COLORS = ['#101012', '#2b1b12', '#5a3a1e', '#b0302a', '#e0b04a', '#6a4cff'];
const HAIRS = [
  { id: 'lowcut', name: 'Low cut', price: 0 },
  { id: 'bald', name: 'Bald', price: 0 },
  { id: 'curls', name: 'Curls', price: 2000 },
  { id: 'afro', name: 'Afro', price: 2500 },
  { id: 'locs', name: 'Locs', price: 4000 },
  { id: 'braids', name: 'Braids', price: 3500 },
  { id: 'classic', name: 'Classic', price: 1500 },
];
const OUTFITS = [
  { id: 'casual', name: 'Casual', emoji: '👕', price: 0 },
  { id: 'hoodie', name: 'Hoodie', emoji: '🧥', price: 8000 },
  { id: 'office', name: 'Office', emoji: '👔', price: 15000 },
  { id: 'chill', name: 'Chill', emoji: '🩳', price: 6000 },
  { id: 'ankara', name: 'Ankara', emoji: '🎨', price: 12000 },
  { id: 'agbada', name: 'Agbada', emoji: '👘', price: 40000 },
];
const OUTFIT_COLORS = ['#f2a93b', '#2f6fed', '#e0453a', '#22b573', '#8b5cf6', '#f4f4f4', '#2a2a33'];
const defaultLook = () => ({ body: 'man', skin: 3, hair: 'lowcut', hairColor: 0, outfit: 'casual', color: 0 });
function randomLook() {
  return {
    body: Math.random() < 0.5 ? 'man' : 'woman',
    skin: rand(1, 5),
    hair: pick(HAIRS).id,
    hairColor: rand(0, 2),
    outfit: pick(OUTFITS.slice(0, 5)).id,
    color: rand(0, OUTFIT_COLORS.length - 1),
  };
}

/* ================================================================== */
/*  FURNITURE (the 3D room catalogue)                                  */
/* ================================================================== */
const GRID = 10;
const FURN = {
  mattress: { name: 'Foam Mattress', cat: 'sleep', emoji: '🛏️', price: 1800, size: [1, 2], stars: 0, use: { label: 'Sleep', secs: 10, sleep: 0.7 } },
  bed: { name: 'Spring Bed', cat: 'sleep', emoji: '🛏️', price: 7800, size: [1, 2], stars: 1, use: { label: 'Sleep', secs: 10, sleep: 1.0 } },
  kingbed: { name: 'Lekki King Bed', cat: 'sleep', emoji: '👑', price: 28800, size: [2, 2], stars: 3, use: { label: 'Sleep like a king', secs: 10, sleep: 1.4 } },
  cooler: { name: 'Ice Cooler', cat: 'kitchen', emoji: '🧊', price: 2200, size: [1, 1], stars: 0, use: { label: 'Eat bread & zobo', secs: 3, cost: 300, needs: { hunger: 30, fun: 2 }, eat: true } },
  stove: { name: 'Kerosene Stove', cat: 'kitchen', emoji: '🍳', price: 6500, size: [1, 1], stars: 1, use: { label: 'Cook indomie & egg', secs: 6, cost: 400, needs: { hunger: 45, fun: 4 }, eat: true } },
  cooker: { name: 'Gas Cooker', cat: 'kitchen', emoji: '🔥', price: 24000, size: [1, 1], stars: 2, use: { label: 'Cook jollof rice', secs: 8, cost: 900, needs: { hunger: 70, fun: 10 }, eat: true } },
  fridge: { name: 'Fridge', cat: 'kitchen', emoji: '🧊', price: 65000, size: [1, 1], stars: 3, power: true, use: { label: 'Grab a cold snack', secs: 3, cost: 150, needs: { hunger: 38, fun: 5 }, eat: true } },
  bucket: { name: 'Bath Bucket', cat: 'bath', emoji: '🪣', price: 800, size: [1, 1], stars: 0, use: { label: 'Take a bucket bath', secs: 6, needs: { hygiene: 45 }, bath: true } },
  shower: { name: 'Shower', cat: 'bath', emoji: '🚿', price: 18000, size: [1, 1], stars: 2, use: { label: 'Take a shower', secs: 6, needs: { hygiene: 85, fun: 3 }, bath: true } },
  wc: { name: 'Water Closet', cat: 'bath', emoji: '🚽', price: 12000, size: [1, 1], stars: 1, use: { label: 'Use the toilet', secs: 4, needs: { bladder: 100 } } },
  chair: { name: 'Plastic Chair', cat: 'comfort', emoji: '🪑', price: 1500, size: [1, 1], stars: 0, use: { label: 'Sit and relax', secs: 5, needs: { fun: 6, energy: 4 } } },
  table: { name: 'Side Table', cat: 'comfort', emoji: '🪵', price: 3500, size: [1, 1], stars: 0, use: null },
  sofa: { name: 'Leather Sofa', cat: 'comfort', emoji: '🛋️', price: 32000, size: [2, 1], stars: 2, use: { label: 'Relax on the sofa', secs: 8, needs: { fun: 14, energy: 8, social: 2 } } },
  tv: { name: 'Flat-screen TV', cat: 'tech', emoji: '📺', price: 45000, size: [2, 1], stars: 2, power: true, use: { label: 'Watch Nollywood', secs: 10, needs: { fun: 30 }, power: true } },
  laptop: { name: 'Laptop Desk', cat: 'tech', emoji: '💻', price: 70000, size: [2, 1], stars: 3, power: true, use: { label: 'Freelance on laptop', secs: 15, pay: [3500, 5500], needs: { energy: -10, fun: -3 }, skill: { tech: 2 }, power: true } },
  radio: { name: 'Radio', cat: 'tech', emoji: '📻', price: 4500, size: [1, 1], stars: 0, use: { label: 'Turn on the radio', secs: 1, special: 'radio' } },
  fan: { name: 'Standing Fan', cat: 'tech', emoji: '🌀', price: 12000, size: [1, 1], stars: 1, power: true, use: { label: 'Cool down by the fan', secs: 4, needs: { energy: 6, fun: 3 }, power: true } },
  generator: { name: 'Generator', cat: 'tech', emoji: '⚡', price: 85000, size: [1, 1], stars: 3, use: { label: 'Check generator', secs: 1, special: 'gen' } },
  plant: { name: 'Potted Plant', cat: 'decor', emoji: '🪴', price: 2500, size: [1, 1], stars: 0, use: { label: 'Water the plant', secs: 3, needs: { fun: 3 } } },
  rug: { name: 'Ankara Rug', cat: 'decor', emoji: '🟫', price: 9000, size: [2, 2], stars: 1, walk: true, use: null },
};
const FURN_CATS = [
  { id: 'sleep', name: 'Sleep', emoji: '🛏️' },
  { id: 'kitchen', name: 'Kitchen', emoji: '🍳' },
  { id: 'bath', name: 'Bath', emoji: '🚿' },
  { id: 'comfort', name: 'Comfort', emoji: '🛋️' },
  { id: 'tech', name: 'Tech', emoji: '📺' },
  { id: 'decor', name: 'Decor', emoji: '🪴' },
];

function startItems(area) {
  const items = [
    { uid: uid(), type: area === 'bodija' ? 'bed' : 'mattress', gx: 3, gz: 0, rot: 1 },
    { uid: uid(), type: 'cooler', gx: 8, gz: 0, rot: 0 },
    { uid: uid(), type: 'table', gx: 7, gz: 0, rot: 0 },
    { uid: uid(), type: 'chair', gx: 5, gz: 4, rot: 0 },
    { uid: uid(), type: 'bucket', gx: 8, gz: 9, rot: 0 },
    { uid: uid(), type: 'wc', gx: 9, gz: 9, rot: 0 },
  ];
  if (area === 'mokola') items.push({ uid: uid(), type: 'fan', gx: 1, gz: 3, rot: 0 });
  return items;
}
const footprint = (item) => {
  const [w, d] = FURN[item.type].size;
  return item.rot % 2 ? { w: d, d: w } : { w, d };
};
function buildBlocked(items, exceptUid) {
  const grid = Array.from({ length: GRID }, () => Array(GRID).fill(false));
  items.forEach((it) => {
    if (it.uid === exceptUid || FURN[it.type].walk) return;
    const f = footprint(it);
    for (let x = it.gx; x < it.gx + f.w; x += 1) for (let z = it.gz; z < it.gz + f.d; z += 1) if (x >= 0 && z >= 0 && x < GRID && z < GRID) grid[x][z] = true;
  });
  return grid;
}
function canPlace(items, type, gx, gz, rot, exceptUid) {
  const def = FURN[type];
  const f = footprint({ type, rot });
  if (gx < 0 || gz < 0 || gx + f.w > GRID || gz + f.d > GRID) return false;
  if (def.walk) return true;
  const grid = buildBlocked(items, exceptUid);
  for (let x = gx; x < gx + f.w; x += 1) for (let z = gz; z < gz + f.d; z += 1) if (grid[x][z]) return false;
  return true;
}
// breadth-first search on the room grid. goals is a Set of "x,z" strings.
function bfsPath(blocked, start, goals) {
  const key = (x, z) => `${x},${z}`;
  if (goals.has(key(start.x, start.z))) return [{ x: start.x, z: start.z }];
  const prev = new Map();
  const seen = new Set([key(start.x, start.z)]);
  const q = [start];
  while (q.length) {
    const c = q.shift();
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let i = 0; i < dirs.length; i += 1) {
      const nx = c.x + dirs[i][0];
      const nz = c.z + dirs[i][1];
      if (nx < 0 || nz < 0 || nx >= GRID || nz >= GRID) continue;
      if (blocked[nx][nz]) continue;
      const k = key(nx, nz);
      if (seen.has(k)) continue;
      seen.add(k);
      prev.set(k, c);
      if (goals.has(k)) {
        const path = [{ x: nx, z: nz }];
        let cur = c;
        while (cur && !(cur.x === start.x && cur.z === start.z)) {
          path.unshift({ x: cur.x, z: cur.z });
          cur = prev.get(key(cur.x, cur.z));
        }
        return path;
      }
      q.push({ x: nx, z: nz });
    }
  }
  return null;
}
function neighbourCells(item, blocked) {
  const f = footprint(item);
  const out = new Set();
  for (let x = item.gx - 1; x <= item.gx + f.w; x += 1) {
    for (let z = item.gz - 1; z <= item.gz + f.d; z += 1) {
      const inside = x >= item.gx && x < item.gx + f.w && z >= item.gz && z < item.gz + f.d;
      if (inside || x < 0 || z < 0 || x >= GRID || z >= GRID) continue;
      if (!blocked[x][z]) out.add(`${x},${z}`);
    }
  }
  return out;
}
const hasPower = (g, nowMs) => !g.nepaUntil || nowMs >= g.nepaUntil || g.items.some((i) => i.type === 'generator');

/* ================================================================== */
/*  THE MAP OF IBADAN                                                  */
/* ================================================================== */
const MAP_W = 1000;
const MAP_H = 700;
const LOCATIONS = {
  home: { id: 'home', name: 'Your Room', area: 'Home', emoji: '🏠', x: 110, y: 590, desc: 'Your small rented room. A bucket, a fan that works when NEPA allows, and a window facing a sea of rusty roofs.', actions: [] },
  ui_gate: { id: 'ui_gate', name: 'UI Gate', area: 'University of Ibadan', emoji: '🎓', x: 140, y: 210, desc: 'The famous gate swarms with students, hawkers shouting "Ọ̀rẹ́ mi, come and see!", and tech bros typing furiously under the shade. Everybody here is hustling something.', actions: ['hangout', 'flash_gig', 'study', 'snacks'] },
  amala_skye: { id: 'amala_skye', name: 'Amala Skye', area: 'Bodija', emoji: '🍲', x: 400, y: 120, desc: 'Steam rises from the pots, the gbegiri is silky, the ewedu is perfectly drawn, and the ata dindin is angry. This is where Ibadan restores souls.', actions: ['amala', 'water', 'serve', 'cook_shift'] },
  bodija_market: { id: 'bodija_market', name: 'Bodija Market', area: 'Bodija', emoji: '🥬', x: 300, y: 300, desc: 'Mountains of pepper, yam and tomatoes. The traders will call you "my customer" until you agree to their price.', actions: ['fruits', 'haggle', 'trader'] },
  ventura_mall: { id: 'ventura_mall', name: 'Ventura Mall', area: 'Samonda', emoji: '🎬', x: 720, y: 120, desc: 'Air-conditioning, neon lights and the smell of popcorn. Ibadan comes here to cool off, show off, and strike a pose.', actions: ['bowling', 'movie', 'cashier', 'boutique'] },
  agodi: { id: 'agodi', name: 'Agodi Gardens', area: 'Agodi', emoji: '🌳', x: 890, y: 290, desc: 'Green lawns, calm water and families on picnic mats. The perfect place to breathe, gist and forget your wahala.', actions: ['picnic', 'meet'] },
  mapo_hall: { id: 'mapo_hall', name: 'Mapo Hall', area: 'Mapo Hill', emoji: '🏛️', x: 520, y: 320, desc: 'From the hill, a sea of rusty brown roofs spreads to the horizon. The old hall watches over the city like a proud chief.', actions: ['brown_roofs', 'selfies'] },
  mokola: { id: 'mokola', name: 'Mokola', area: 'Mokola', emoji: '💈', x: 230, y: 440, desc: 'Barbers, akara sellers and loud music on every corner. If you need a fresh cut, this is the place.', actions: ['akara', 'ayo', 'barber'] },
  dugbe_market: { id: 'dugbe_market', name: 'Dugbe Market', area: 'Dugbe', emoji: '🛍️', x: 650, y: 430, desc: 'Ọjà Dugbe never sleeps. Cloth sellers, phone repairers and traders shouting prices over each other.', actions: ['market_job', 'haggle'] },
  cocoa_house: { id: 'cocoa_house', name: 'Cocoa House', area: 'Dugbe', emoji: '🏢', x: 830, y: 460, desc: "Nigeria's first skyscraper still towers over Dugbe. Suits, startups and Wi-Fi hunters share the lobby while the museum quietly keeps history alive.", actions: ['apply_job', 'tech_shift', 'senior_shift', 'class', 'museum'] },
  challenge: { id: 'challenge', name: 'Challenge Junction', area: 'Challenge', emoji: '🚕', x: 430, y: 510, desc: 'Horns, Micras and conductors screaming destinations. If you can drive and talk loud, there is money at this roundabout.', actions: ['cab', 'suya', 'football'] },
  jericho_gym: { id: 'jericho_gym', name: 'FitZone Gym', area: 'Jericho', emoji: '🏋️', x: 290, y: 620, desc: 'Heavy bass, heavy weights. Everyone here looks like they own a protein shake.', actions: ['workout', 'trainer'] },
  bowers: { id: 'bowers', name: "Bower's Tower", area: 'Oke-Are', emoji: '🗼', x: 760, y: 610, desc: 'The highest point in town. Climb the spiral stairs and the whole of Ibadan lies at your feet, tin roofs shining like old coins.', actions: ['climb', 'tourists'] },
};
const LOCATION_ORDER = Object.keys(LOCATIONS);
const JUNCTIONS = {
  j1: { x: 270, y: 210 }, j2: { x: 560, y: 200 }, j3: { x: 840, y: 200 }, j4: { x: 600, y: 390 },
  j5: { x: 270, y: 380 }, j6: { x: 160, y: 520 }, j8: { x: 700, y: 520 }, j9: { x: 110, y: 400 },
};
const NODES = {};
Object.values(LOCATIONS).forEach((l) => {
  NODES[l.id] = { x: l.x, y: l.y };
});
Object.entries(JUNCTIONS).forEach(([k, v]) => {
  NODES[k] = v;
});
const EDGES = [
  ['ui_gate', 'j1'], ['j1', 'amala_skye'], ['j1', 'bodija_market'], ['amala_skye', 'j2'], ['j2', 'ventura_mall'], ['j2', 'mapo_hall'],
  ['ventura_mall', 'j3'], ['j3', 'agodi'], ['agodi', 'cocoa_house'], ['mapo_hall', 'j4'], ['j4', 'dugbe_market'], ['dugbe_market', 'cocoa_house'],
  ['bodija_market', 'j5'], ['j5', 'mokola'], ['mokola', 'j6'], ['j6', 'home'], ['mokola', 'challenge'], ['challenge', 'j4'],
  ['challenge', 'jericho_gym'], ['dugbe_market', 'j8'], ['j8', 'bowers'], ['j8', 'challenge'], ['ui_gate', 'j9'], ['j9', 'mokola'],
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
  walk: { label: 'Walk', icon: '🚶', fare: 0, speed: 70, energy: (d) => Math.max(6, Math.round(d / 18)) },
  micra: { label: 'Shared Micra', icon: '🚕', fare: 200, speed: 150, energy: () => 6 },
  ridehail: { label: 'Ride-hail', icon: '📱', fare: 2000, speed: 260, energy: () => 4 },
};

/* ================================================================== */
/*  ACTIONS AT PLACES (real-time seconds, not game minutes)            */
/* ================================================================== */
const ACTIONS = {
  hangout: { label: 'Hang out with students', icon: '🧑‍🤝‍🧑', secs: 6, needs: { fun: 12, social: 25, energy: -5 }, skill: { charm: 1 } },
  flash_gig: { label: 'Flash a tech bro for a gig', icon: '💸', secs: 5, needs: { energy: -5 }, special: 'flash', hint: '50%: +₦10,000 · 50%: -10 Fun' },
  study: { label: 'Study at the library steps', icon: '📚', secs: 10, needs: { energy: -8, fun: -4 }, skill: { tech: 2 } },
  snacks: { label: 'Sell snacks to students', icon: '🥜', secs: 25, pay: [2200, 3200], needs: { energy: -15, hunger: -10 }, skill: { hustle: 2 } },
  amala: { label: 'Buy Amala, Gbegiri & Ewedu', icon: '🍲', secs: 6, cost: 1500, needs: { hunger: 60, energy: 15, fun: 8 }, eat: true },
  water: { label: 'Buy chilled water', icon: '💧', secs: 2, cost: 200, needs: { hunger: 3, energy: 5 } },
  serve: { label: 'Work as a server', icon: '🍽️', secs: 25, pay: [3000, 4000], needs: { energy: -15, hunger: -8 }, skill: { hustle: 2 } },
  cook_shift: { label: 'Work as a cook', icon: '👩🏾‍🍳', secs: 30, pay: [6000, 8000], needs: { energy: -20, hunger: -8 }, skill: { hustle: 3 }, req: { skill: 'hustle', level: 3 } },
  fruits: { label: 'Buy fresh fruits', icon: '🍊', secs: 3, cost: 500, needs: { hunger: 20, energy: 5, fun: 2 }, eat: true },
  haggle: { label: 'Haggle with the traders', icon: '🗣️', secs: 8, needs: { energy: -4 }, special: 'haggle', hint: 'Win some cash or lose your cool', skill: { hustle: 1 } },
  trader: { label: 'Sell provisions for a trader', icon: '📦', secs: 25, pay: [2500, 4000], needs: { energy: -15, hunger: -8 }, skill: { hustle: 2 } },
  bowling: { label: 'Go Bowling', icon: '🎳', secs: 10, cost: 3000, needs: { fun: 30, social: 10, energy: -8 }, party: true },
  movie: { label: 'Watch a movie', icon: '🍿', secs: 12, cost: 2500, needs: { fun: 25, energy: -2 }, party: true },
  cashier: { label: 'Work as a cashier', icon: '🧾', secs: 25, pay: [4000, 5200], needs: { energy: -15 }, skill: { charm: 2 }, req: { skill: 'charm', level: 2 } },
  boutique: { label: 'Open the Boutique', icon: '👗', secs: 0, special: 'app:boutique', hint: 'Buy outfits and hairstyles' },
  picnic: { label: 'Relax in the gardens', icon: '🧺', secs: 10, needs: { fun: 18, energy: 8, social: 5 } },
  meet: { label: 'Meet new people', icon: '🤝', secs: 6, needs: { social: 25, fun: 6 }, skill: { charm: 1 } },
  brown_roofs: { label: 'Look at the legendary Brown Roofs', icon: '🏘️', secs: 6, needs: { fun: 12, energy: -4 } },
  selfies: { label: 'Take selfies for the gram', icon: '🤳', secs: 5, needs: { fun: 8, social: 6 }, skill: { charm: 1 } },
  akara: { label: 'Buy akara & pap', icon: '🥣', secs: 4, cost: 600, needs: { hunger: 30, fun: 3 }, eat: true },
  ayo: { label: 'Play ayo with the elders', icon: '🎲', secs: 8, needs: { fun: 12, social: 8 } },
  barber: { label: 'Get a fresh cut', icon: '💈', secs: 0, special: 'app:boutique', hint: 'Change your hairstyle' },
  market_job: { label: 'Sell cloth at the market', icon: '🧵', secs: 25, pay: [3500, 5000], needs: { energy: -15, hunger: -8 }, skill: { hustle: 2 }, req: { skill: 'hustle', level: 1 } },
  apply_job: { label: 'Apply for a Remote Tech Job', icon: '📨', secs: 8, needs: { energy: -15 }, special: 'apply', minEnergy: 60, hint: 'Needs >60 Energy · 60%: ₦25,000 sign-on + remote shifts' },
  tech_shift: { label: 'Remote developer shift', icon: '👨🏾‍💻', secs: 30, pay: [11000, 13000], needs: { energy: -20, hunger: -12 }, skill: { tech: 2 }, req: { job: 'remote' }, power: true },
  senior_shift: { label: 'Senior dev contract', icon: '🧠', secs: 40, pay: [22000, 26000], needs: { energy: -25, hunger: -15 }, skill: { tech: 3 }, req: { job: 'remote', skill: 'tech', level: 4 }, power: true },
  class: { label: 'Join a coding bootcamp class', icon: '🎒', secs: 12, cost: 2000, needs: { energy: -10, fun: -4 }, skill: { tech: 4 } },
  museum: { label: 'Visit the museum', icon: '🖼️', secs: 8, cost: 500, needs: { fun: 15, energy: -4 } },
  cab: { label: 'Drive a Micra cab', icon: '🚕', secs: 30, pay: [5000, 8500], needs: { energy: -20, hunger: -12 }, skill: { hustle: 2 }, special: 'cab' },
  suya: { label: 'Eat suya with extra pepper', icon: '🍢', secs: 5, cost: 1200, needs: { hunger: 35, fun: 5 }, eat: true },
  football: { label: 'Watch football at the viewing centre', icon: '⚽', secs: 12, cost: 500, needs: { fun: 22, social: 15 }, party: true },
  workout: { label: 'Hit the gym', icon: '🏋️', secs: 12, cost: 1000, needs: { energy: -15, fun: 12, hygiene: -15, social: 6 } },
  trainer: { label: 'Work as a personal trainer', icon: '🥇', secs: 30, pay: [7000, 9500], needs: { energy: -22, hunger: -10, hygiene: -10 }, skill: { hustle: 3 }, req: { skill: 'hustle', level: 4 } },
  climb: { label: "Climb Bower's Tower", icon: '🪜', secs: 10, cost: 500, needs: { fun: 30, energy: -12, social: 5 } },
  tourists: { label: 'Chat with tourists', icon: '🌍', secs: 6, needs: { social: 25, energy: -3 }, skill: { charm: 1 } },
  // available anywhere
  corn: { label: 'Buy roadside roasted corn', icon: '🌽', secs: 3, cost: 300, needs: { hunger: 15, energy: 5 }, eat: true },
  toilet: { label: 'Use a public toilet', icon: '🚻', secs: 3, cost: 100, needs: { bladder: 100, hygiene: -2 } },
  borrow: { label: 'Borrow ₦500 from a friend', icon: '🤝', secs: 2, special: 'borrow', hint: 'Once per day · +₦500' },
};
const GLOBAL_ACTIONS = ['corn', 'toilet', 'borrow'];

const SCENARIOS = [
  { id: 'segbon', modes: ['micra'], emoji: '🚕', title: 'Ṣẹgbọn!', text: "You enter a Micra and the driver tells you to 'Ṣẹgbọn' (shift) so a 5th passenger can sit on your lap. Do you?", choices: [
    { label: 'Comply and squeeze in.', resolve: () => ({ text: 'Your knees file a formal complaint. The fare also somehow went up a little.', cash: -500, energy: 0, fun: -15 }) },
    { label: 'Alight angrily and trek.', resolve: () => ({ text: 'You storm out, trek in the sun, and feel weirdly proud of yourself.', cash: 0, energy: -30, fun: 10 }) } ] },
  { id: 'rally', modes: ['micra', 'ridehail', 'walk'], emoji: '📣', title: 'Challenge Junction Rally', text: 'You are standing at Challenge junction and a political campaign rally blocks the road, throwing free money into the crowd.', choices: [
    { label: 'Scramble for the cash.', resolve: () => (Math.random() < 0.6 ? { text: 'You catch a fistful of notes and slip away smiling.', cash: 5000, energy: 0, fun: 0 } : { text: 'Somebody elbowed you and your pocket got picked in the chaos. Ouch.', cash: -2000, energy: -20, fun: 0 }) },
    { label: 'Mind your business and walk away.', resolve: () => ({ text: 'You walk on. A wise Ibadan citizen.', cash: 0, energy: 0, fun: 0 }) } ] },
  { id: 'conductor', modes: ['micra'], emoji: '🗣️', title: 'The Conductor and the Change', text: 'The conductor says he has no change and offers you a stick of chewing gum instead of ₦100.', choices: [
    { label: 'Argue until he finds the change.', resolve: () => ({ text: 'The whole bus joins the debate. You win your ₦100 and some respect.', cash: 100, energy: -10, fun: 5 }) },
    { label: 'Take the gum and let it go.', resolve: () => ({ text: 'The gum is minty. Peace costs ₦100.', cash: -100, energy: 0, fun: 3 }) } ] },
  { id: 'surge', modes: ['ridehail'], emoji: '📱', title: 'Surge Pricing Wahala', text: 'Your ride-hail driver calls: "Oga, traffic is heavy, add ₦1,000 or I cancel."', choices: [
    { label: 'Pay the extra ₦1,000.', resolve: () => ({ text: 'He arrives grinning. Your wallet cries quietly.', cash: -1000, energy: 0, fun: -3 }) },
    { label: 'Cancel and wait for another driver.', resolve: () => ({ text: 'The next driver is a gentleman and plays good music.', cash: 0, energy: -10, fun: 5 }) } ] },
  { id: 'agbero', modes: ['micra', 'walk'], emoji: '🧢', title: 'The Agbero Wants His Own', text: 'An agbero in a faded cap blocks you: "Oga, ticket money. ₦200 only!"', choices: [
    { label: 'Pay him quickly.', resolve: () => ({ text: 'He blesses you with three generations of blessings.', cash: -200, energy: 0, fun: 2 }) },
    { label: 'Argue that you do not owe anything.', resolve: () => (Math.random() < 0.5 ? { text: 'He backs down when he sees your confidence. Free passage!', cash: 0, energy: -3, fun: 8 } : { text: 'He and his boys escort you to the roadside. It costs more than ₦200.', cash: -500, energy: -5, fun: -10 }) } ] },
  { id: 'dog', modes: ['walk'], emoji: '🐕', title: 'Ọjà Dog Chase', text: 'A dog starts barking and chasing you near the market. Bold of it.', choices: [
    { label: 'Run for your life.', resolve: () => ({ text: 'You sprint like an Olympian. The dog loses interest. You do not.', cash: 0, energy: -15, fun: 5 }) },
    { label: 'Stand still and shoo it.', resolve: () => (Math.random() < 0.6 ? { text: 'The dog sits down, confused. You continue with dignity.', cash: 0, energy: 0, fun: 5 } : { text: 'It barked louder and a crowd gathered to laugh at you.', cash: 0, energy: -5, fun: -15 }) } ] },
  { id: 'okada', modes: ['walk'], emoji: '🏍️', title: 'Okada Man Special', text: 'An okada rider slows beside you: "Oga, I go drop you for ₦500, no wahala."', choices: [
    { label: 'Hop on.', resolve: () => ({ text: 'You fly through traffic and reach your destination rested (and a bit scared).', cash: -500, energy: 10, fun: 3 }) },
    { label: 'No thanks, keep trekking.', resolve: () => ({ text: 'Your legs hate you but your wallet loves you.', cash: 0, energy: -5, fun: 3 }) } ] },
];

/* ================================================================== */
/*  JOBS BOARD (display only; the work happens at the place)           */
/* ================================================================== */
const JOB_BOARD = [
  { action: 'snacks', loc: 'ui_gate' }, { action: 'serve', loc: 'amala_skye' }, { action: 'trader', loc: 'bodija_market' },
  { action: 'market_job', loc: 'dugbe_market' }, { action: 'cab', loc: 'challenge' }, { action: 'cashier', loc: 'ventura_mall' },
  { action: 'cook_shift', loc: 'amala_skye' }, { action: 'trainer', loc: 'jericho_gym' }, { action: 'tech_shift', loc: 'cocoa_house' },
  { action: 'senior_shift', loc: 'cocoa_house' },
];

/* ================================================================== */
/*  SKILLS, DAILY TASKS, GAME STATE                                    */
/* ================================================================== */
const skillLevel = (xp) => Math.min(10, Math.floor(Math.sqrt(xp || 0)));
const skillInfo = (xp) => {
  const level = skillLevel(xp);
  const lo = level * level;
  const hi = (level + 1) * (level + 1);
  return { level, pct: level >= 10 ? 100 : Math.round((((xp || 0) - lo) / (hi - lo)) * 100) };
};
const newDaily = (ymd) => ({ ymd, eat: 0, bath: 0, work: 0, sleep: 0, fun: 0, chat: 0, visits: [], claimed: [] });
const TASK_POOL = [
  { id: 'eat', label: 'Eat something', hint: 'Tap the cooler or stove at home', done: (d) => d.eat >= 1 },
  { id: 'bath', label: 'Freshen up', hint: 'Use the bucket or shower', done: (d) => d.bath >= 1 },
  { id: 'work', label: 'Work a shift', hint: 'Hustle at UI Gate or Amala Skye', done: (d) => d.work >= 1 },
  { id: 'sleep', label: 'Get some sleep', hint: 'Rest on your bed', done: (d) => d.sleep >= 1 },
  { id: 'explore', label: 'Explore Ibadan', hint: 'Visit 3 different places', done: (d) => d.visits.length >= 3 },
  { id: 'chat', label: 'Say hello', hint: 'Send a message in the chat', done: (d) => d.chat >= 1 },
  { id: 'fun', label: 'Have some fun', hint: 'Bowling, movies, football or the tower', done: (d) => d.fun >= 1 },
];
const TASK_REWARD = 1500;
function tasksFor(ymd) {
  const start = hashStr(ymd) % TASK_POOL.length;
  return [0, 1, 2].map((i) => TASK_POOL[(start + i * 2) % TASK_POOL.length]);
}

function newGame({ look, traits, lottery, area, username }) {
  const L = lottery;
  const skills = { tech: 0, hustle: 0, charm: 0, ...(L.skills || {}) };
  const now = Date.now();
  return {
    v: 3,
    created: true,
    username,
    look,
    traits,
    lottery: L.id,
    area: area.id,
    fee: area.fee,
    cash: L.cash,
    savings: 0,
    loan: L.loan ? { owed: L.loan.amount, weekly: L.loan.weekly } : { owed: 0, weekly: 0 },
    weeklyIncome: L.weeklyIncome || 0,
    needs: { hunger: 80, energy: 100, fun: 70, social: 60, hygiene: 90, bladder: 80 },
    loc: 'home',
    skills,
    jobs: {},
    items: startItems(area.id),
    owned: ['casual'],
    ownedHair: [look.hair],
    nepaUntil: 0,
    feeWeek: weekIdOf(now),
    lastSeen: now,
    daily: newDaily(ymdOf(now)),
    streak: { last: '', count: 0 },
    borrowDay: '',
    earned: 0,
    shifts: 0,
    createdAt: now,
  };
}
function migrateGame(s) {
  if (!s || s.v !== 3 || !s.created) return null;
  const base = newGame({ look: s.look || defaultLook(), traits: s.traits || [], lottery: LOTTERIES.find((l) => l.id === s.lottery) || LOTTERIES[0], area: AREAS[s.area] || AREAS.agbowo, username: s.username || 'Player' });
  const g = { ...base, ...s, needs: { ...base.needs, ...s.needs }, skills: { ...base.skills, ...s.skills }, loan: { ...base.loan, ...(s.loan || {}) }, daily: s.daily || base.daily, streak: s.streak || base.streak, jobs: s.jobs || {}, items: Array.isArray(s.items) && s.items.length ? s.items : base.items };
  if (!LOCATIONS[g.loc]) g.loc = 'home';
  g.items = g.items.filter((i) => FURN[i.type]);
  return g;
}

/* ---- effects shared by furniture and place actions ---- */
function blockReason(eff, g, ctx) {
  if (!eff) return 'Nothing to do here.';
  if (eff.cost && g.cash < eff.cost * (eff.eat ? ctx.mods.foodDiscount : 1)) return `You need ${naira(eff.cost)} for that.`;
  if (eff.power && !ctx.power) return 'NEPA took light! Switch on a generator or wait. 🔦';
  if (eff.req?.job && !g.jobs[eff.req.job]) return 'Get hired at Cocoa House first.';
  if (eff.req?.skill && skillLevel(g.skills[eff.req.skill]) < eff.req.level) return `Needs ${cap(eff.req.skill)} level ${eff.req.level}.`;
  if (eff.minEnergy && g.needs.energy <= eff.minEnergy) return `You need more than ${eff.minEnergy} Energy for that.`;
  if (eff.sleep && g.needs.energy > 85) return "You're not sleepy yet.";
  if (eff.special === 'apply' && g.jobs.remote) return 'You already have the remote job.';
  if (eff.special === 'borrow' && g.borrowDay === ymdOf(ctx.now)) return 'Your friends are tired of you today.';
  const eNeed = eff.needs && eff.needs.energy < 0 ? -eff.needs.energy : 0;
  if ((eff.pay || eNeed >= 8) && g.needs.energy < Math.max(eNeed, eff.pay ? 15 : 0)) return 'Too tired. Rest or eat first.';
  if (eff.pay && g.needs.hunger < 8) return 'Too hungry to work. Eat first!';
  if (eff.needs && eff.needs.bladder === 100 && g.needs.bladder > 85) return "You don't need the toilet yet.";
  if (eff.needs && eff.needs.hygiene > 30 && g.needs.hygiene > 92) return 'You are already clean.';
  if (eff.needs && eff.needs.hunger > 0 && g.needs.hunger > 92) return "You're not hungry.";
  return null;
}
function applyEffect(g0, eff, mods, now) {
  const g = { ...g0, needs: { ...g0.needs }, skills: { ...g0.skills }, jobs: { ...g0.jobs }, daily: { ...g0.daily, visits: [...g0.daily.visits], claimed: [...g0.daily.claimed] } };
  const nd = g.needs;
  let earned = 0;
  let note = '';
  const levelUps = [];
  if (eff.cost) g.cash -= Math.round(eff.cost * (eff.eat ? mods.foodDiscount : 1));
  if (eff.sleep) {
    nd.energy = clamp(nd.energy + 90 * eff.sleep * mods.sleepMult);
    nd.hunger = clamp(nd.hunger - 10);
    nd.bladder = clamp(nd.bladder - 18);
    nd.hygiene = clamp(nd.hygiene - 3);
    nd.fun = clamp(nd.fun + 4);
    g.daily.sleep += 1;
    note = 'You wake up refreshed.';
  }
  Object.entries(eff.needs || {}).forEach(([k, v]) => {
    let d = v;
    if (k === 'hunger' && v > 0) d = v * mods.foodMult;
    if (k === 'fun' && v > 0) d = v * mods.funGain;
    nd[k] = clamp(nd[k] + d);
  });
  if (eff.eat) {
    nd.fun = clamp(nd.fun + mods.eatFun);
    g.daily.eat += 1;
  }
  if (eff.needs?.hygiene > 30) g.daily.bath += 1;
  if (eff.party || (eff.needs?.fun >= 22 && !eff.eat)) g.daily.fun += 1;
  Object.entries(eff.skill || {}).forEach(([k, v]) => {
    const before = skillLevel(g.skills[k]);
    g.skills[k] = (g.skills[k] || 0) + v * mods.xp[k];
    if (skillLevel(g.skills[k]) > before) levelUps.push(k);
  });
  if (eff.pay) {
    earned = Math.round(rand(eff.pay[0], eff.pay[1]) * mods.payMult);
    g.shifts += 1;
    g.daily.work += 1;
  }
  if (eff.special === 'flash') {
    if (Math.random() < 0.5) {
      earned = 10000;
      note = 'A tech bro loved your pitch and paid you!';
    } else {
      nd.fun = clamp(nd.fun - 10);
      note = 'He left you on read. -10 Fun 😔';
    }
  } else if (eff.special === 'apply') {
    if (Math.random() < 0.6) {
      g.jobs.remote = true;
      earned = 25000;
      note = 'You got the job! Remote shifts unlocked at Cocoa House.';
    } else {
      note = 'They said "we will get back to you".';
    }
  } else if (eff.special === 'cab') {
    if (Math.random() < 0.2) {
      earned -= 1000;
      note = 'A policeman stopped you at a checkpoint: -₦1,000.';
    }
  } else if (eff.special === 'borrow') {
    earned = 500;
    g.borrowDay = ymdOf(now);
    note = 'A friend sent ₦500 with a lecture attached.';
  } else if (eff.special === 'haggle') {
    if (Math.random() < 0.55) {
      earned = rand(1000, 2500);
      note = 'You got a bargain and flipped it for profit!';
    } else {
      nd.fun = clamp(nd.fun - 6);
      note = 'The trader out-talked you. Ouch.';
    }
  }
  g.cash = Math.max(0, g.cash + earned);
  if (earned > 0) g.earned += earned;
  return { g, earned, note, levelUps };
}

/* ---- daily tasks, weekly fees, offline catch-up ---- */
function claimTasks(g0) {
  const events = [];
  let g = g0;
  tasksFor(g.daily.ymd).forEach((t) => {
    if (!g.daily.claimed.includes(t.id) && t.done(g.daily)) {
      g = { ...g, cash: g.cash + TASK_REWARD, earned: g.earned + TASK_REWARD, daily: { ...g.daily, claimed: [...g.daily.claimed, t.id] } };
      events.push({ text: `✅ Task done: ${t.label} · +${naira(TASK_REWARD)}`, type: 'success' });
    }
  });
  return { g, events };
}
function rollDay(g0, nowMs) {
  const today = ymdOf(nowMs);
  if (g0.daily.ymd === today) return { g: g0, events: [] };
  const yesterday = ymdOf(nowMs - 86400000);
  const count = g0.streak.last === yesterday ? g0.streak.count + 1 : 1;
  const bonus = Math.min(count, 7) * 500;
  const g = { ...g0, cash: g0.cash + bonus, daily: newDaily(today), streak: { last: today, count } };
  return { g, events: [{ text: `🔥 Day ${count} streak! Daily bonus +${naira(bonus)}`, type: 'success' }] };
}
function settleWeeks(g0, nowMs) {
  const wk = weekIdOf(nowMs);
  if (g0.feeWeek >= wk) return { g: g0, events: [] };
  const events = [];
  const g = { ...g0, loan: { ...g0.loan } };
  const from = Math.max(g.feeWeek + 1, wk - 3);
  for (let w = from; w <= wk; w += 1) {
    if (g.weeklyIncome) {
      g.cash += g.weeklyIncome;
      events.push({ text: `💌 Family alert! +${naira(g.weeklyIncome)}`, type: 'success' });
    }
    if (g.savings > 0) {
      const interest = Math.floor(g.savings * 0.02);
      if (interest > 0) {
        g.savings += interest;
        events.push({ text: `🏦 Savings interest +${naira(interest)}`, type: 'success' });
      }
    }
    const loanPart = g.loan.owed > 0 ? Math.min(g.loan.weekly, g.loan.owed) : 0;
    const due = g.fee + loanPart;
    if (g.cash >= due) {
      g.cash -= due;
      g.loan.owed -= loanPart;
      events.push({ text: `🏠 Monday bills paid: rent ${naira(g.fee)}${loanPart ? ` + loan ${naira(loanPart)}` : ''}`, type: 'info' });
    } else {
      const paid = g.cash;
      g.loan.owed += due - paid;
      if (!g.loan.weekly) g.loan.weekly = 5000;
      g.cash = 0;
      g.needs = { ...g.needs, fun: clamp(g.needs.fun - 25), social: clamp(g.needs.social - 15) };
      events.push({ text: `🏠 You couldn't pay ${naira(due)}. The landlady shouted. The rest was added to your debt.`, type: 'error' });
    }
  }
  g.feeWeek = wk;
  return { g, events };
}
function catchUp(g0, nowMs) {
  const secs = clamp((nowMs - (g0.lastSeen || nowMs)) / 1000, 0, 8 * 3600);
  const g = { ...g0, needs: decayNeeds(g0.needs, secs, traitMods(g0), 0.3), nepaUntil: g0.nepaUntil && g0.nepaUntil > nowMs ? g0.nepaUntil : 0, lastSeen: nowMs };
  return g;
}
const furnitureValue = (g) => g.items.reduce((s, i) => s + (FURN[i.type]?.price || 0) * 0.5, 0);
const netWorth = (g) => Math.max(0, Math.round(g.cash + g.savings + furnitureValue(g) - g.loan.owed));
const moodScore = (n) => Math.round(NEED_KEYS.reduce((s, k) => s + n[k], 0) / NEED_KEYS.length);
const moodInfo = (score) => (score >= 75 ? { label: 'Happy', face: '😄', color: '#16a36a' } : score >= 55 ? { label: 'Okay', face: '🙂', color: '#c58a00' } : score >= 35 ? { label: 'Stressed', face: '😟', color: '#e0762a' } : { label: 'Miserable', face: '😩', color: '#dc3545' });
const fmtBig = (n) => (n >= 1e9 ? (n / 1e9).toFixed(1) + 'bn' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'm' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n));
/* ================================================================== */
/*  3D: LOW-POLY BUILDERS (avatar, furniture, room)                    */
/* ================================================================== */
const webglOk = () => {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) {
    return false;
  }
};
const lm = (color, opts) => new THREE.MeshLambertMaterial({ color, ...(opts || {}) });
const bm = (color, opts) => new THREE.MeshBasicMaterial({ color, ...(opts || {}) });
function addBox(parent, w, h, d, color, x = 0, y = 0, z = 0, opts) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lm(color, opts));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
function addCyl(parent, rt, rb, h, color, x = 0, y = 0, z = 0, seg = 10, opts) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), lm(color, opts));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
function addSphere(parent, r, color, x = 0, y = 0, z = 0, ws = 10, hs = 8, opts) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), lm(color, opts));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
function addShadow(parent, w, d, op = 0.2) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), bm('#000000', { transparent: true, opacity: op, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.012;
  m.userData.noPick = true;
  parent.add(m);
  return m;
}
function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((mt) => {
        if (mt.map) mt.map.dispose();
        mt.dispose();
      });
    }
  });
}

let ankaraTex = null;
function getAnkaraTexture(base) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = base;
  x.fillRect(0, 0, 128, 128);
  for (let gy = 0; gy < 4; gy += 1) {
    for (let gx = 0; gx < 4; gx += 1) {
      const cx = gx * 32 + 16;
      const cy = gy * 32 + 16;
      x.strokeStyle = '#1f8a5b';
      x.lineWidth = 3;
      x.beginPath();
      x.ellipse(cx, cy, 9, 12, 0, 0, Math.PI * 2);
      x.stroke();
      x.fillStyle = '#f7f1d2';
      x.beginPath();
      x.arc(cx, cy, 3, 0, Math.PI * 2);
      x.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
  ankaraTex = t;
  return t;
}

/* ---------------- the person ---------------- */
function buildAvatar(look) {
  const L = { ...defaultLook(), ...(look || {}) };
  const skin = SKINS[L.skin] || SKINS[3];
  const hairC = HAIR_COLORS[L.hairColor] || HAIR_COLORS[0];
  const top = OUTFIT_COLORS[L.color] || OUTFIT_COLORS[0];
  const woman = L.body === 'woman';
  const outfit = L.outfit;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const trouser = outfit === 'office' ? '#16161d' : outfit === 'chill' ? '#d8c28a' : '#1b2236';
  const torsoW = woman ? 0.4 : 0.5;
  const topMat = () => {
    if (outfit === 'ankara') return lm('#ffffff', { map: getAnkaraTexture(top) });
    if (outfit === 'office') return lm('#f4f4f4');
    return lm(top);
  };

  // legs
  const legs = [];
  [-1, 1].forEach((s) => {
    const leg = new THREE.Group();
    leg.position.set(s * 0.11, 0.82, 0);
    if (outfit === 'chill') {
      addBox(leg, 0.16, 0.34, 0.18, trouser, 0, -0.17, 0);
      addBox(leg, 0.14, 0.42, 0.16, skin, 0, -0.55, 0);
    } else {
      addBox(leg, 0.16, 0.76, 0.18, trouser, 0, -0.38, 0);
    }
    addBox(leg, 0.17, 0.08, 0.27, outfit === 'office' ? '#2a1a12' : '#c0392b', 0, -0.78, 0.04);
    body.add(leg);
    legs.push(leg);
  });

  // torso
  const torsoH = 0.6;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(torsoW + (outfit === 'hoodie' ? 0.06 : 0), torsoH, 0.27 + (outfit === 'hoodie' ? 0.04 : 0)), topMat());
  torso.position.set(0, 1.12, 0);
  body.add(torso);
  if (outfit === 'office') addBox(body, 0.07, 0.4, 0.02, top, 0, 1.15, 0.145);
  if (outfit === 'hoodie') {
    addBox(body, 0.34, 0.14, 0.14, top, 0, 1.46, -0.12);
    addBox(body, 0.26, 0.12, 0.02, top, 0, 0.92, 0.16);
  }
  if (woman && (outfit === 'ankara' || outfit === 'agbada' || outfit === 'casual')) {
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.21, outfit === 'agbada' ? 0.42 : 0.3, outfit === 'agbada' ? 0.95 : 0.5, 10), outfit === 'ankara' ? lm('#ffffff', { map: getAnkaraTexture(top) }) : lm(outfit === 'casual' ? '#2b3a67' : top));
    skirt.position.set(0, outfit === 'agbada' ? 0.5 : 0.78, 0);
    body.add(skirt);
  } else if (outfit === 'agbada') {
    const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.4, 1.15, 10), lm(top));
    robe.position.set(0, 0.62, 0);
    body.add(robe);
    addBox(body, 0.5, 0.06, 0.3, '#f4e3a1', 0, 1.3, 0.01);
  }

  // arms
  const arms = [];
  [-1, 1].forEach((s) => {
    const arm = new THREE.Group();
    arm.position.set(s * (torsoW / 2 + 0.08), 1.38, 0);
    const longSleeve = outfit === 'hoodie' || outfit === 'office' || outfit === 'agbada';
    const sleeveMat = outfit === 'ankara' ? lm('#ffffff', { map: getAnkaraTexture(top) }) : outfit === 'office' ? lm('#f4f4f4') : lm(top);
    const sleeveH = longSleeve ? 0.5 : 0.26;
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(longSleeve ? 0.14 : 0.13, sleeveH, 0.15), sleeveMat);
    sleeve.position.set(0, -sleeveH / 2, 0);
    arm.add(sleeve);
    if (!longSleeve) addBox(arm, 0.11, 0.32, 0.13, skin, 0, -0.26 - 0.16, 0);
    addSphere(arm, 0.075, skin, 0, -0.6, 0, 8, 6);
    body.add(arm);
    arms.push(arm);
  });

  // neck + head
  addCyl(body, 0.07, 0.08, 0.1, skin, 0, 1.46, 0, 8);
  const head = new THREE.Group();
  head.position.set(0, 1.66, 0);
  body.add(head);
  const skull = addSphere(head, 0.19, skin, 0, 0, 0, 12, 10);
  skull.scale.set(1, 1.05, 1);
  addBox(head, 0.045, 0.05, 0.02, '#111111', -0.075, 0.0, 0.178);
  addBox(head, 0.045, 0.05, 0.02, '#111111', 0.075, 0.0, 0.178);
  addBox(head, 0.07, 0.015, 0.02, '#7a2e22', 0, -0.085, 0.18);
  addSphere(head, 0.03, skin, -0.19, 0, 0, 6, 5);
  addSphere(head, 0.03, skin, 0.19, 0, 0, 6, 5);

  // hair
  const capHair = () => {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.205, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), lm(hairC));
    cap.position.set(0, 0.02, -0.005);
    head.add(cap);
  };
  switch (L.hair) {
    case 'bald':
      break;
    case 'lowcut': {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), lm(hairC));
      cap.position.set(0, 0.03, -0.01);
      head.add(cap);
      break;
    }
    case 'curls':
      capHair();
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * Math.PI * 2;
        addSphere(head, 0.07, hairC, Math.cos(a) * 0.15, 0.15 + (i % 2) * 0.03, Math.sin(a) * 0.15 - 0.01, 6, 5);
      }
      addSphere(head, 0.08, hairC, 0, 0.22, 0, 6, 5);
      break;
    case 'afro':
      addSphere(head, 0.3, hairC, 0, 0.1, -0.03, 10, 8);
      break;
    case 'locs':
      capHair();
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * Math.PI * 2;
        if (Math.sin(a) > 0.75) continue;
        addCyl(head, 0.022, 0.018, 0.4, hairC, Math.cos(a) * 0.185, -0.08, Math.sin(a) * 0.185 - 0.02, 5);
      }
      break;
    case 'braids':
      capHair();
      for (let i = 0; i < 9; i += 1) {
        const x = -0.16 + i * 0.04;
        addBox(head, 0.03, 0.5, 0.03, hairC, x, -0.1, -0.18);
      }
      break;
    case 'classic':
      capHair();
      addBox(head, 0.2, 0.08, 0.14, hairC, 0, 0.19, 0.08);
      break;
    default:
      break;
  }
  if (outfit === 'agbada') addBox(head, 0.3, 0.15, 0.3, top, 0, 0.19, 0);
  addShadow(root, 0.7, 0.5, 0.25);
  root.userData = { legs, arms, body, head };
  return root;
}
function animateAvatar(av, t, mode) {
  const u = av.userData;
  if (!u || !u.legs) return;
  if (mode === 'walk') {
    const s = Math.sin(t * 9);
    u.legs[0].rotation.x = s * 0.7;
    u.legs[1].rotation.x = -s * 0.7;
    u.arms[0].rotation.x = -s * 0.6;
    u.arms[1].rotation.x = s * 0.6;
    u.body.position.y = Math.abs(Math.sin(t * 9)) * 0.04;
  } else if (mode === 'busy') {
    u.legs[0].rotation.x = 0;
    u.legs[1].rotation.x = 0;
    u.arms[0].rotation.x = -1.0 + Math.sin(t * 10) * 0.45;
    u.arms[1].rotation.x = -1.0 + Math.sin(t * 10 + 1.5) * 0.45;
    u.body.position.y = 0;
  } else if (mode === 'sleep') {
    u.legs[0].rotation.x = 0;
    u.legs[1].rotation.x = 0;
    u.arms[0].rotation.x = 0;
    u.arms[1].rotation.x = 0;
    u.body.position.y = Math.sin(t * 2) * 0.01;
  } else {
    u.legs[0].rotation.x = 0;
    u.legs[1].rotation.x = 0;
    u.arms[0].rotation.x = Math.sin(t * 1.6) * 0.05;
    u.arms[1].rotation.x = -Math.sin(t * 1.6) * 0.05;
    u.body.position.y = Math.sin(t * 2) * 0.008;
    u.head.rotation.y = Math.sin(t * 0.7) * 0.15;
  }
}

/* ---------------- furniture ---------------- */
function buildFurniture(type) {
  const g = new THREE.Group();
  const [w, d] = FURN[type].size;
  g.userData.type = type;
  g.userData.screens = [];
  const screen = (w0, h0, x, y, z, color) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w0, h0, 0.02), bm(color));
    m.position.set(x, y, z);
    m.userData.on = color;
    g.add(m);
    g.userData.screens.push(m);
    return m;
  };
  switch (type) {
    case 'mattress':
      addBox(g, 0.9, 0.14, 1.9, '#4a90d9', 0, 0.07, 0);
      addBox(g, 0.6, 0.1, 0.3, '#e8eef5', 0, 0.18, -0.68);
      addBox(g, 0.9, 0.04, 0.9, '#3b78bd', 0, 0.16, 0.45);
      break;
    case 'bed':
      addBox(g, 0.98, 0.22, 1.95, '#d9b98a', 0, 0.11, 0);
      addBox(g, 0.88, 0.14, 1.85, '#e0643a', 0, 0.29, 0.02);
      addBox(g, 0.6, 0.1, 0.3, '#f1f4f8', 0, 0.4, -0.7);
      addBox(g, 0.98, 0.7, 0.08, '#c9a574', 0, 0.45, -0.97);
      addBox(g, 0.88, 0.05, 0.7, '#c9502b', 0, 0.37, 0.5);
      break;
    case 'kingbed':
      addBox(g, 1.95, 0.3, 1.95, '#6b3f22', 0, 0.15, 0);
      addBox(g, 1.8, 0.22, 1.8, '#6d3fb0', 0, 0.41, 0.02);
      addBox(g, 0.7, 0.14, 0.38, '#f1f4f8', -0.45, 0.58, -0.7);
      addBox(g, 0.7, 0.14, 0.38, '#f1f4f8', 0.45, 0.58, -0.7);
      addBox(g, 1.95, 1.0, 0.12, '#5a3219', 0, 0.8, -0.95);
      addBox(g, 1.8, 0.06, 0.8, '#4f2c86', 0, 0.54, 0.5);
      break;
    case 'cooler':
      addBox(g, 0.7, 0.5, 0.5, '#2f6fed', 0, 0.25, 0);
      addBox(g, 0.74, 0.1, 0.54, '#f4f4f4', 0, 0.55, 0);
      break;
    case 'stove':
      addBox(g, 0.7, 0.5, 0.6, '#cbd5e1', 0, 0.25, 0);
      addCyl(g, 0.18, 0.18, 0.06, '#222222', 0, 0.53, 0, 12);
      addCyl(g, 0.13, 0.13, 0.14, '#9aa3ad', 0, 0.63, 0, 10);
      break;
    case 'cooker':
      addBox(g, 0.8, 0.85, 0.7, '#f1f5f9', 0, 0.425, 0);
      addBox(g, 0.8, 0.04, 0.7, '#2b2b33', 0, 0.87, 0);
      addBox(g, 0.5, 0.3, 0.02, '#333a44', 0, 0.4, 0.355);
      [-0.25, 0.25].forEach((x) => addCyl(g, 0.15, 0.15, 0.03, '#111111', x, 0.9, 0, 10));
      addCyl(g, 0.12, 0.12, 0.16, '#e0453a', 0.25, 1.0, 0, 10);
      break;
    case 'fridge':
      addBox(g, 0.8, 1.7, 0.75, '#e9eef3', 0, 0.85, 0);
      addBox(g, 0.78, 0.03, 0.02, '#aeb6c0', 0, 1.15, 0.38);
      addBox(g, 0.04, 0.4, 0.05, '#8a8f98', 0.3, 1.4, 0.4);
      addBox(g, 0.04, 0.3, 0.05, '#8a8f98', 0.3, 0.75, 0.4);
      break;
    case 'bucket':
      addCyl(g, 0.24, 0.19, 0.38, '#ef4444', 0, 0.19, 0, 12);
      addCyl(g, 0.21, 0.21, 0.02, '#7cc4ff', 0, 0.36, 0, 12);
      break;
    case 'shower':
      addBox(g, 0.9, 0.06, 0.9, '#dbeafe', 0, 0.03, 0);
      addCyl(g, 0.03, 0.03, 2.0, '#9aa3ad', 0.3, 1.0, -0.35, 6);
      addCyl(g, 0.14, 0.14, 0.05, '#9aa3ad', 0.3, 2.0, -0.2, 10);
      addBox(g, 0.88, 1.8, 0.02, '#7cc4ff', 0, 0.95, 0.42, { transparent: true, opacity: 0.3 });
      break;
    case 'wc':
      addBox(g, 0.45, 0.3, 0.55, '#f8fafc', 0, 0.15, 0.05);
      addCyl(g, 0.22, 0.17, 0.2, '#f8fafc', 0, 0.4, 0.08, 10);
      addBox(g, 0.5, 0.5, 0.16, '#eef2f7', 0, 0.6, -0.3);
      addCyl(g, 0.17, 0.17, 0.02, '#cde6ff', 0, 0.5, 0.08, 10);
      break;
    case 'chair':
      addBox(g, 0.5, 0.06, 0.5, '#ef4444', 0, 0.45, 0);
      addBox(g, 0.5, 0.5, 0.06, '#ef4444', 0, 0.75, -0.22);
      [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].forEach(([x, z]) => addCyl(g, 0.025, 0.025, 0.45, '#b02e2e', x, 0.225, z, 5));
      break;
    case 'table':
      addBox(g, 0.8, 0.06, 0.8, '#e9c9a0', 0, 0.7, 0);
      [[-0.34, -0.34], [0.34, -0.34], [-0.34, 0.34], [0.34, 0.34]].forEach(([x, z]) => addCyl(g, 0.03, 0.03, 0.7, '#c9a574', x, 0.35, z, 5));
      addCyl(g, 0.07, 0.06, 0.12, '#2c6e49', 0.15, 0.79, 0.1, 8);
      break;
    case 'sofa':
      addBox(g, 1.9, 0.4, 0.85, '#8b5a3c', 0, 0.3, 0);
      addBox(g, 1.9, 0.55, 0.2, '#7a4c30', 0, 0.75, -0.32);
      addBox(g, 0.2, 0.55, 0.85, '#7a4c30', -0.85, 0.5, 0);
      addBox(g, 0.2, 0.55, 0.85, '#7a4c30', 0.85, 0.5, 0);
      addBox(g, 0.7, 0.14, 0.6, '#a67048', -0.35, 0.57, 0.08);
      addBox(g, 0.7, 0.14, 0.6, '#a67048', 0.35, 0.57, 0.08);
      break;
    case 'tv':
      addBox(g, 1.6, 0.5, 0.5, '#8b6a4a', 0, 0.25, 0);
      addBox(g, 1.3, 0.78, 0.08, '#101114', 0, 1.0, 0);
      screen(1.2, 0.68, 0, 1.0, 0.045, '#5cc8ff');
      addBox(g, 0.3, 0.02, 0.2, '#101114', 0, 0.51, 0.1);
      break;
    case 'laptop':
      addBox(g, 1.8, 0.08, 0.8, '#e9c9a0', 0, 0.75, 0);
      [[-0.8, -0.3], [0.8, -0.3], [-0.8, 0.3], [0.8, 0.3]].forEach(([x, z]) => addCyl(g, 0.03, 0.03, 0.75, '#c9a574', x, 0.375, z, 5));
      addBox(g, 0.55, 0.03, 0.38, '#cbd5e1', 0, 0.81, 0.05);
      {
        const lid = addBox(g, 0.55, 0.36, 0.03, '#cbd5e1', 0, 1.0, -0.12);
        lid.rotation.x = -0.15;
      }
      screen(0.5, 0.31, 0, 1.0, -0.095, '#9be37a');
      addBox(g, 0.1, 0.12, 0.1, '#2c6e49', 0.7, 0.85, -0.2);
      break;
    case 'radio':
      addCyl(g, 0.22, 0.2, 0.3, '#8b5a3c', 0, 0.15, 0, 8);
      addBox(g, 0.5, 0.28, 0.22, '#2b2b33', 0, 0.44, 0);
      addCyl(g, 0.07, 0.07, 0.02, '#cbd5e1', -0.12, 0.44, 0.115, 8).rotation.x = Math.PI / 2;
      addBox(g, 0.02, 0.35, 0.02, '#9aa3ad', 0.2, 0.75, 0);
      break;
    case 'fan': {
      addCyl(g, 0.22, 0.24, 0.05, '#2a2a33', 0, 0.025, 0, 10);
      addCyl(g, 0.03, 0.03, 1.15, '#9aa3ad', 0, 0.6, 0, 6);
      const head = new THREE.Group();
      head.position.set(0, 1.25, 0);
      addCyl(head, 0.05, 0.05, 0.2, '#2a2a33', 0, 0, -0.05, 6).rotation.x = Math.PI / 2;
      const blades = new THREE.Group();
      blades.position.z = 0.08;
      for (let i = 0; i < 3; i += 1) {
        const b = addBox(blades, 0.08, 0.38, 0.015, '#8fd3ff', 0, 0, 0);
        b.rotation.z = (i * Math.PI * 2) / 3;
        b.position.set(Math.sin((i * Math.PI * 2) / 3) * -0.19, Math.cos((i * Math.PI * 2) / 3) * 0.19, 0);
      }
      head.add(blades);
      g.add(head);
      g.userData.spin = blades;
      break;
    }
    case 'generator':
      addBox(g, 0.8, 0.5, 0.55, '#e0453a', 0, 0.35, 0);
      addBox(g, 0.86, 0.06, 0.6, '#2a2a33', 0, 0.07, 0);
      addBox(g, 0.7, 0.04, 0.04, '#2a2a33', 0, 0.68, 0.2);
      addCyl(g, 0.05, 0.05, 0.3, '#444a55', 0.3, 0.72, -0.15, 6);
      addBox(g, 0.2, 0.1, 0.02, '#ffd23f', -0.2, 0.4, 0.28);
      break;
    case 'plant': {
      addCyl(g, 0.2, 0.15, 0.3, '#d9714e', 0, 0.15, 0, 8);
      [[0, 0], [0.1, 0.05], [-0.1, 0.05], [0.04, -0.1]].forEach(([x, z], i) => {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.55 + i * 0.1, 5), lm(i % 2 ? '#2f9e44' : '#37b24d'));
        c.position.set(x, 0.55 + i * 0.05, z);
        c.rotation.z = (i - 1.5) * 0.15;
        g.add(c);
      });
      break;
    }
    case 'rug':
      addBox(g, 1.9, 0.03, 1.9, '#e8a33d', 0, 0.015, 0);
      addBox(g, 1.5, 0.035, 1.5, '#1f8a5b', 0, 0.02, 0);
      addBox(g, 0.9, 0.04, 0.9, '#e0453a', 0, 0.025, 0);
      break;
    default:
      addBox(g, 0.6, 0.6, 0.6, '#999999', 0, 0.3, 0);
  }
  if (!FURN[type].walk) addShadow(g, w * 1.0, d * 1.0, 0.18);
  return g;
}

/* ---------------- the room ---------------- */
function makeFloorTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const x = c.getContext('2d');
  const n = GRID;
  const s = 512 / n;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      x.fillStyle = (i + j) % 2 ? '#c9a574' : '#b8915f';
      x.fillRect(i * s, j * s, s, s);
      x.strokeStyle = '#dcc39a';
      x.lineWidth = 2;
      x.strokeRect(i * s + 1, j * s + 1, s - 2, s - 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const cellToWorld = (gx, gz) => ({ x: gx - GRID / 2 + 0.5, z: gz - GRID / 2 + 0.5 });

function buildRoom() {
  const room = new THREE.Group();
  const H = 3.2;
  const half = GRID / 2;
  // ground
  const ground = new THREE.Mesh(new THREE.CylinderGeometry(19, 19, 0.4, 40), lm('#8fd36a'));
  ground.position.y = -0.55;
  room.add(ground);
  // brown roofs of Ibadan around the house
  for (let i = 0; i < 46; i += 1) {
    const a = (i / 46) * Math.PI * 2 + (i % 3) * 0.1;
    const r = 8.5 + ((i * 37) % 9);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (x > 5.5 && z > 5.5) continue;
    const rw = 1.2 + ((i * 13) % 10) / 8;
    const rd = 1.1 + ((i * 7) % 10) / 9;
    const wall = addBox(room, rw, 0.7, rd, '#f0e0c0', x, 0.0, z);
    const roof = addBox(room, rw + 0.2, 0.18, rd + 0.2, ['#e8672a', '#d9531c', '#f58b3a', '#c94f2a'][i % 4], x, 0.45, z);
    roof.rotation.y = (i % 5) * 0.1;
    wall.userData.noPick = true;
    roof.userData.noPick = true;
  }
  // trees
  [[-9, -3], [-7, 6], [6, -9], [10, 2], [-3, -10]].forEach(([x, z]) => {
    addCyl(room, 0.15, 0.2, 1.2, '#7a4b2a', x, 0.2, z, 6);
    const c = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.4, 7), lm('#2fae4f'));
    c.position.set(x, 1.9, z);
    room.add(c);
  });
  // floor slab + tiles
  addBox(room, GRID + 0.6, 0.3, GRID + 0.6, '#d9ad5a', 0, -0.15, 0);
  const floorTex = makeFloorTexture();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(GRID, GRID), lm('#ffffff', { map: floorTex }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.004;
  floor.userData.isFloor = true;
  room.add(floor);
  // walls
  const wallC = '#f0c85a';
  const back = addBox(room, GRID + 0.5, H, 0.25, wallC, 0, H / 2, -half - 0.125);
  const left = addBox(room, 0.25, H, GRID + 0.5, wallC, -half - 0.125, H / 2, 0);
  back.userData.noPick = true;
  left.userData.noPick = true;
  addBox(room, GRID + 0.5, 0.18, 0.05, '#fff1c4', 0, 0.09, -half + 0.03).userData.noPick = true;
  addBox(room, 0.05, 0.18, GRID, '#fff1c4', -half + 0.03, 0.09, 0).userData.noPick = true;
  addBox(room, GRID + 0.5, 0.12, 0.3, '#d9ad5a', 0, H + 0.02, -half - 0.125).userData.noPick = true;
  addBox(room, 0.3, 0.12, GRID + 0.5, '#d9ad5a', -half - 0.125, H + 0.02, 0).userData.noPick = true;
  // window on the left wall (glass colour follows the sky)
  const win = new THREE.Group();
  win.position.set(-half + 0.02, 1.9, 1.5);
  addBox(win, 0.06, 1.3, 1.9, '#ffffff', 0, 0, 0);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.15, 1.75), bm('#bfe2ff'));
  win.add(glass);
  for (let i = -3; i <= 3; i += 1) addBox(win, 0.1, 1.15, 0.03, '#ffffff', 0.02, 0, i * 0.25);
  addBox(win, 0.1, 0.04, 1.8, '#ffffff', 0.02, 0.15, 0);
  room.add(win);
  // door on the back wall
  const door = new THREE.Group();
  door.position.set(-3.0, 1.1, -half + 0.05);
  const doorSlab = addBox(door, 1.05, 2.2, 0.1, '#6b3a1c', 0, 0, 0);
  addBox(door, 0.1, 0.1, 0.06, '#e8c24a', 0.38, -0.05, 0.08);
  addBox(door, 0.8, 0.8, 0.02, '#7d4a28', 0, 0.45, 0.06);
  doorSlab.userData.isDoor = true;
  room.add(door);
  // lamps
  const bulbs = [];
  [[-1.2, -half + 0.2], [2.8, -half + 0.2]].forEach(([x, z]) => {
    addBox(room, 0.14, 0.14, 0.14, '#9aa3ad', x, 2.5, z - 0.05);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), bm('#fff2a8'));
    b.position.set(x, 2.38, z + 0.04);
    room.add(b);
    bulbs.push(b);
  });
  // poster
  addBox(room, 0.04, 0.7, 0.5, '#f5f5f5', -half + 0.03, 2.1, -2.2).userData.noPick = true;
  addBox(room, 0.05, 0.25, 0.5, '#d33f49', -half + 0.04, 2.25, -2.2).userData.noPick = true;
  room.userData = { glass, bulbs, ground, floorTex };
  return room;
}
/* ================================================================== */
/*  3D: ROOM SCENE CONTROLLER                                          */
/* ================================================================== */
const BED_TOP = { mattress: 0.2, bed: 0.4, kingbed: 0.56 };
const itemCenter = (item) => {
  const f = footprint(item);
  return { x: item.gx + f.w / 2 - GRID / 2, z: item.gz + f.d / 2 - GRID / 2 };
};

function createRoomScene(canvas, handlers) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 300);
  const amb = new THREE.AmbientLight('#ffffff', 1.6);
  const sun = new THREE.DirectionalLight('#ffffff', 2.2);
  sun.position.set(-6, 12, 8);
  scene.add(amb);
  scene.add(sun);
  const room = buildRoom();
  scene.add(room);
  const itemsGroup = new THREE.Group();
  scene.add(itemsGroup);
  const itemMap = new Map();
  const itemData = new Map();
  const target = new THREE.Vector3(0, 0.9, 0);
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  const st = {
    items: [],
    pose: 'idle',
    poseUid: null,
    power: true,
    sky: skyAt(12),
    ghostKey: '',
    ghost: null,
    sel: null,
    walk: null,
    cell: { x: 1, z: 6 },
    lookKey: '',
    t: 0,
    dead: false,
    raf: 0,
    last: performance.now(),
  };
  let avatar = null;
  const placeAvatarAtCell = (c) => {
    const w = cellToWorld(c.x, c.z);
    avatar.position.set(w.x, 0, w.z);
    avatar.rotation.order = 'YXZ';
    avatar.rotation.x = 0;
    st.cell = { x: c.x, z: c.z };
  };
  const setLook = (look) => {
    const key = JSON.stringify(look || {});
    if (key === st.lookKey && avatar) return;
    st.lookKey = key;
    const prev = avatar;
    avatar = buildAvatar(look);
    avatar.rotation.order = 'YXZ';
    if (prev) {
      avatar.position.copy(prev.position);
      avatar.rotation.set(prev.rotation.x, prev.rotation.y, prev.rotation.z);
      scene.remove(prev);
      disposeTree(prev);
    } else {
      placeAvatarAtCell(st.cell);
      avatar.rotation.y = Math.PI / 4;
    }
    scene.add(avatar);
  };

  /* ---- camera fit ---- */
  const fit = () => {
    const w = canvas.clientWidth || 300;
    const h = canvas.clientHeight || 300;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    camera.aspect = aspect;
    camera.fov = aspect < 0.85 ? 42 : 34;
    const th = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const hh = th * aspect;
    const D = Math.max(9.6 / hh, 7.6 / th);
    const dir = new THREE.Vector3(1, 1.05, 1).normalize();
    camera.position.copy(target).add(dir.multiplyScalar(D));
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  };

  /* ---- items ---- */
  const placeGroup = (grp, item) => {
    const c = itemCenter(item);
    grp.position.set(c.x, 0, c.z);
    grp.rotation.y = (item.rot % 4) * (Math.PI / 2);
  };
  const setItems = (items) => {
    st.items = items;
    const seen = new Set();
    items.forEach((it) => {
      seen.add(it.uid);
      let grp = itemMap.get(it.uid);
      if (!grp || grp.userData.type !== it.type) {
        if (grp) {
          itemsGroup.remove(grp);
          disposeTree(grp);
        }
        grp = buildFurniture(it.type);
        grp.userData.uid = it.uid;
        itemsGroup.add(grp);
        itemMap.set(it.uid, grp);
      }
      itemData.set(it.uid, it);
      placeGroup(grp, it);
    });
    Array.from(itemMap.keys()).forEach((k) => {
      if (!seen.has(k)) {
        const grp = itemMap.get(k);
        itemsGroup.remove(grp);
        disposeTree(grp);
        itemMap.delete(k);
        itemData.delete(k);
      }
    });
    applyEnv();
  };

  /* ---- sky and lights ---- */
  const applyEnv = () => {
    const sky = st.sky;
    const lit = st.power;
    amb.color.set(sky.amC);
    amb.intensity = sky.amb * Math.PI * 0.55 + (sky.night && lit ? 0.5 : 0);
    sun.color.set(sky.sunC);
    sun.intensity = sky.sun * Math.PI * 0.75;
    room.userData.glass.material.color.set(sky.night ? '#16275a' : lerpHex('#9fd3ff', sky.bg, 0.35));
    room.userData.bulbs.forEach((b) => b.material.color.set(lit ? '#fff2a8' : '#5a5a5a'));
    room.userData.ground.material.color.set(lerpHex('#1c3d34', '#8fd36a', clamp((sky.amb - 0.5) / 0.4, 0, 1)));
    itemMap.forEach((grp) => {
      (grp.userData.screens || []).forEach((m) => m.material.color.set(lit ? m.userData.on : '#1a1a1a'));
    });
  };
  const setEnv = (sky, power) => {
    st.sky = sky;
    st.power = power;
    applyEnv();
  };

  /* ---- ghost + selection ---- */
  const clearGhost = () => {
    if (st.ghost) {
      scene.remove(st.ghost);
      disposeTree(st.ghost);
      st.ghost = null;
      st.ghostKey = '';
    }
  };
  const setGhost = (gh) => {
    if (!gh) {
      clearGhost();
      return;
    }
    if (!st.ghost || st.ghostKey !== gh.type) {
      clearGhost();
      st.ghost = buildFurniture(gh.type);
      st.ghostKey = gh.type;
      st.ghost.traverse((o) => {
        o.userData.noPick = true;
        if (o.material && !o.userData.keep) {
          o.material.transparent = true;
          o.material.opacity = 0.7;
        }
      });
      scene.add(st.ghost);
    }
    const item = { type: gh.type, gx: gh.gx, gz: gh.gz, rot: gh.rot };
    placeGroup(st.ghost, item);
    st.ghost.position.y = 0.04;
    st.ghost.traverse((o) => {
      if (o.material && o.material.emissive) o.material.emissive.set(gh.valid ? '#103a1c' : '#7a1010');
    });
  };
  const selRing = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bm('#22b573', { transparent: true, opacity: 0.45, depthWrite: false }));
  selRing.rotation.x = -Math.PI / 2;
  selRing.position.y = 0.03;
  selRing.visible = false;
  selRing.userData.noPick = true;
  scene.add(selRing);
  const setSelected = (uidSel) => {
    st.sel = uidSel;
    const it = uidSel ? itemData.get(uidSel) : null;
    if (!it) {
      selRing.visible = false;
      return;
    }
    const f = footprint(it);
    const c = itemCenter(it);
    selRing.scale.set(f.w + 0.15, f.d + 0.15, 1);
    selRing.position.set(c.x, 0.03, c.z);
    selRing.visible = true;
  };

  /* ---- walking + poses ---- */
  const blockedNow = () => buildBlocked(st.items);
  const startWalk = (cells, done) => {
    if (!cells || !cells.length) {
      if (done) done(false);
      return;
    }
    st.pose = 'idle';
    st.poseUid = null;
    standUp();
    st.walk = { pts: cells.map((c) => ({ c, w: cellToWorld(c.x, c.z) })), i: 0, done };
  };
  const faceTo = (x, z) => {
    if (!avatar) return;
    avatar.rotation.y = Math.atan2(x - avatar.position.x, z - avatar.position.z);
  };
  const walkToCell = (gx, gz, done) => {
    const bl = blockedNow();
    if (gx < 0 || gz < 0 || gx >= GRID || gz >= GRID || bl[gx][gz]) {
      if (done) done(false);
      return;
    }
    const path = bfsPath(bl, st.cell, new Set([`${gx},${gz}`]));
    if (!path) {
      if (done) done(false);
      return;
    }
    startWalk(path, done);
  };
  const walkToItem = (uidTarget, done) => {
    const it = itemData.get(uidTarget);
    if (!it) {
      if (done) done(false);
      return;
    }
    const bl = blockedNow();
    const goals = neighbourCells(it, bl);
    const path = bfsPath(bl, st.cell, goals);
    if (!path) {
      if (done) done(false);
      return;
    }
    const c = itemCenter(it);
    startWalk(path, (ok) => {
      faceTo(c.x, c.z);
      if (done) done(ok);
    });
  };
  const standUp = () => {
    if (!avatar) return;
    avatar.rotation.set(0, avatar.rotation.y, 0, 'YXZ');
    avatar.position.y = 0;
  };
  const setPose = (pose, uidTarget) => {
    const leavingSleep = st.pose === 'sleep' && pose !== 'sleep';
    st.pose = pose;
    st.poseUid = uidTarget || null;
    if (!avatar) return;
    if (pose === 'sleep' && uidTarget && itemData.has(uidTarget)) {
      const it = itemData.get(uidTarget);
      const c = itemCenter(it);
      const yaw = (it.rot % 4) * (Math.PI / 2);
      const dx = -Math.sin(yaw);
      const dz = -Math.cos(yaw);
      avatar.rotation.set(-Math.PI / 2, yaw, 0, 'YXZ');
      avatar.position.set(c.x - dx * 0.9, (BED_TOP[it.type] || 0.3) + 0.14, c.z - dz * 0.9);
    } else if (leavingSleep) {
      const it = itemData.get(st.lastSleepUid);
      standUp();
      if (it) {
        const bl = blockedNow();
        const nb = Array.from(neighbourCells(it, bl))[0];
        if (nb) {
          const [x, z] = nb.split(',').map(Number);
          placeAvatarAtCell({ x, z });
        }
      }
    }
    if (pose === 'sleep') st.lastSleepUid = uidTarget;
  };

  /* ---- input ---- */
  const pickAt = (cx, cy) => {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects([itemsGroup, room], true);
    for (let i = 0; i < hits.length; i += 1) {
      const o = hits[i].object;
      if (o.userData.noPick) continue;
      const pt = hits[i].point;
      const gx = clamp(Math.floor(pt.x + GRID / 2), 0, GRID - 1);
      const gz = clamp(Math.floor(pt.z + GRID / 2), 0, GRID - 1);
      let p = o;
      while (p && !p.userData.uid) p = p.parent;
      if (p && p.userData.uid && itemData.has(p.userData.uid)) return { kind: 'item', uid: p.userData.uid, gx, gz };
      if (o.userData.isDoor) return { kind: 'door' };
      if (o.userData.isFloor) return { kind: 'floor', gx, gz };
    }
    return null;
  };
  let down = null;
  const onDown = (e) => {
    down = { x: e.clientX, y: e.clientY };
  };
  const onUp = (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 12) return;
    const hit = pickAt(e.clientX, e.clientY);
    if (hit && handlers.onTap) handlers.onTap(hit);
  };
  const onMove = (e) => {
    if (e.pointerType === 'touch' || !handlers.onHover) return;
    const hit = pickAt(e.clientX, e.clientY);
    if (hit && (hit.kind === 'floor' || hit.kind === 'item')) handlers.onHover(hit);
  };
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointermove', onMove);

  /* ---- frame loop ---- */
  const frame = (now) => {
    if (st.dead) return;
    try {
      const dt = Math.min(0.05, (now - st.last) / 1000);
      st.last = now;
      st.t += dt;
      let mode = st.pose === 'busy' ? 'busy' : st.pose === 'sleep' ? 'sleep' : 'idle';
      if (st.walk && avatar) {
        const w = st.walk;
        const tgt = w.pts[w.i].w;
        const dx = tgt.x - avatar.position.x;
        const dz = tgt.z - avatar.position.z;
        const dist = Math.hypot(dx, dz);
        const step = 3.0 * dt;
        mode = 'walk';
        if (dist <= step) {
          avatar.position.x = tgt.x;
          avatar.position.z = tgt.z;
          st.cell = w.pts[w.i].c;
          w.i += 1;
          if (w.i >= w.pts.length) {
            const cb = w.done;
            st.walk = null;
            if (cb) cb(true);
          }
        } else {
          avatar.position.x += (dx / dist) * step;
          avatar.position.z += (dz / dist) * step;
          avatar.rotation.y = Math.atan2(dx, dz);
        }
      }
      if (avatar) animateAvatar(avatar, st.t, mode);
      itemMap.forEach((grp) => {
        if (grp.userData.spin && st.power) grp.userData.spin.rotation.z += dt * 12;
      });
      if (!document.hidden) renderer.render(scene, camera);
      st.raf = requestAnimationFrame(frame);
    } catch (err) {
      st.dead = true;
      if (handlers.onError) handlers.onError(err);
    }
  };

  fit();
  let ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => fit());
    ro.observe(canvas.parentElement || canvas);
  } else {
    window.addEventListener('resize', fit);
  }
  st.raf = requestAnimationFrame(frame);

  const destroy = () => {
    st.dead = true;
    cancelAnimationFrame(st.raf);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointermove', onMove);
    if (ro) ro.disconnect();
    else window.removeEventListener('resize', fit);
    clearGhost();
    disposeTree(scene);
    renderer.dispose();
    if (renderer.forceContextLoss) renderer.forceContextLoss();
  };
  return {
    setLook, setItems, setEnv, setGhost, setSelected, walkToCell, walkToItem, setPose, destroy,
    isWalking: () => !!st.walk,
    cell: () => st.cell,
    setCell: (c) => {
      if (!avatar) {
        st.cell = c;
        return;
      }
      placeAvatarAtCell(c);
    },
  };
}

/* ================================================================== */
/*  3D: CHARACTER PREVIEW (creator + profile)                          */
/* ================================================================== */
function createAvatarScene(canvas, handlers) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  scene.add(new THREE.AmbientLight('#ffffff', 1.9));
  const key = new THREE.DirectionalLight('#ffffff', 2.1);
  key.position.set(2, 4, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#bcd8ff', 0.9);
  rim.position.set(-3, 2, -4);
  scene.add(rim);
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.0, 0.08, 28), lm('#dfe3ea'));
  plat.position.y = -0.04;
  scene.add(plat);
  let avatar = null;
  let lookKey = '';
  let yaw = -0.35;
  let vel = 0;
  const st = { dead: false, raf: 0, t: 0, last: performance.now() };
  const fit = () => {
    const w = canvas.clientWidth || 300;
    const h = canvas.clientHeight || 300;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const th = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const D = Math.max(1.35 / th, 1.0 / (th * camera.aspect));
    camera.position.set(0, 1.0, D);
    camera.lookAt(0, 0.92, 0);
    camera.updateProjectionMatrix();
  };
  const setLook = (look) => {
    const k = JSON.stringify(look || {});
    if (k === lookKey && avatar) return;
    lookKey = k;
    if (avatar) {
      scene.remove(avatar);
      disposeTree(avatar);
    }
    avatar = buildAvatar(look);
    scene.add(avatar);
  };
  let drag = null;
  const onDown = (e) => {
    drag = { x: e.clientX };
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {
      /* ignore */
    }
  };
  const onMove = (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    drag.x = e.clientX;
    yaw += dx * 0.012;
    vel = dx * 0.012;
  };
  const onUp = () => {
    drag = null;
  };
  canvas.style.touchAction = 'pan-y';
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  const frame = (now) => {
    if (st.dead) return;
    try {
      const dt = Math.min(0.05, (now - st.last) / 1000);
      st.last = now;
      st.t += dt;
      if (!drag) {
        yaw += vel;
        vel *= 0.92;
        if (Math.abs(vel) < 0.0005) yaw += dt * 0.25;
      }
      if (avatar) {
        avatar.rotation.y = yaw;
        animateAvatar(avatar, st.t, 'idle');
      }
      renderer.render(scene, camera);
      st.raf = requestAnimationFrame(frame);
    } catch (err) {
      st.dead = true;
      if (handlers && handlers.onError) handlers.onError(err);
    }
  };
  fit();
  let ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => fit());
    ro.observe(canvas.parentElement || canvas);
  } else window.addEventListener('resize', fit);
  st.raf = requestAnimationFrame(frame);
  return {
    setLook,
    destroy: () => {
      st.dead = true;
      cancelAnimationFrame(st.raf);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      if (ro) ro.disconnect();
      else window.removeEventListener('resize', fit);
      disposeTree(scene);
      renderer.dispose();
      if (renderer.forceContextLoss) renderer.forceContextLoss();
    },
  };
}
/* ================================================================== */
/*  AUDIO: original Nigerian-style radio, made live in the browser     */
/*  (no copyrighted songs: every groove below is synthesised)          */
/* ================================================================== */
const STATIONS = [
  { id: 'afrobeat', name: 'Naija Afrobeat', emoji: '🥁', bpm: 104 },
  { id: 'amapiano', name: 'Piano Vibes', emoji: '🎹', bpm: 112 },
  { id: 'highlife', name: 'Highlife Gold', emoji: '🎸', bpm: 118 },
  { id: 'fuji', name: 'Fuji Fire', emoji: '🪘', bpm: 96 },
];
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

const AudioEngine = (() => {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let sfxGain = null;
  let timer = null;
  let step = 0;
  let nextTime = 0;
  let station = 'afrobeat';
  let playing = false;
  let musicOn = true;
  let sfxOn = true;
  let noiseBuf = null;

  const ensure = () => {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.32;
    musicGain.connect(master);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.5;
    sfxGain.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
    return ctx;
  };

  const tone = (dest, t, freq, dur, type, vol, opts = {}) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (opts.glideTo) o.frequency.exponentialRampToValueAtTime(opts.glideTo, t + dur * 0.9);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (opts.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    let out = g;
    if (opts.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = opts.lp;
      g.connect(f);
      out = f;
    }
    out.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  };
  const noise = (dest, t, dur, vol, hp, lp) => {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const f = ctx.createBiquadFilter();
    f.type = hp ? 'highpass' : 'lowpass';
    f.frequency.value = hp || lp || 3000;
    s.connect(f);
    f.connect(g);
    g.connect(dest);
    s.start(t);
    s.stop(t + dur + 0.05);
  };
  const kick = (t, v = 0.9) => tone(musicGain, t, 150, 0.22, 'sine', v, { glideTo: 45, attack: 0.002 });
  const snare = (t, v = 0.35) => {
    noise(musicGain, t, 0.14, v, 1500);
    tone(musicGain, t, 190, 0.1, 'triangle', v * 0.5, { attack: 0.002 });
  };
  const hat = (t, v = 0.12, open = false) => noise(musicGain, t, open ? 0.12 : 0.04, v, 7000);
  const shaker = (t, v = 0.1) => noise(musicGain, t, 0.07, v, 5000);
  const conga = (t, hi, v = 0.3) => tone(musicGain, t, hi ? 330 : 220, 0.13, 'sine', v, { glideTo: hi ? 270 : 180, attack: 0.002 });
  const clave = (t, v = 0.28) => tone(musicGain, t, 1250, 0.05, 'square', v * 0.4, { attack: 0.001, lp: 3200 });
  const bass = (t, m, dur, v = 0.5) => tone(musicGain, t, midiHz(m), dur, 'triangle', v, { attack: 0.008, lp: 700 });
  const logdrum = (t, m, v = 0.7) => tone(musicGain, t, midiHz(m), 0.34, 'sine', v, { glideTo: midiHz(m) * 0.93, attack: 0.003 });
  const stab = (t, notes, dur, v = 0.12, type = 'triangle') => notes.forEach((m) => tone(musicGain, t, midiHz(m), dur, type, v, { attack: 0.01, lp: 2600 }));
  const pluck = (t, m, dur = 0.18, v = 0.2) => tone(musicGain, t, midiHz(m), dur, 'sawtooth', v, { attack: 0.003, lp: 2200 });
  const talk = (t, base, v = 0.28) => tone(musicGain, t, base, 0.18, 'sine', v, { glideTo: base * 1.45, attack: 0.004 });

  // 16 steps per bar, 4 bars per loop (chords: Am - F - C - G flavours)
  const CH = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
  const ROOT = [45, 41, 36, 43];
  const patterns = {
    afrobeat: (i, t, spb) => {
      const bar = Math.floor(i / 16) % 4;
      const s = i % 16;
      if ([0, 7, 10].includes(s)) kick(t);
      if ([4, 12].includes(s)) snare(t);
      hat(t, s % 2 ? 0.07 : 0.12, s === 14);
      if ([0, 3, 6, 10, 12].includes(s)) clave(t);
      if ([2, 5, 9, 13, 15].includes(s)) conga(t, s % 2 === 0);
      if ([0, 3, 6, 8, 11, 14].includes(s)) bass(t, ROOT[bar] + ([0, 6].includes(s) ? 0 : s === 11 ? 7 : 12), spb * 0.9);
      if ([2, 6, 10, 14].includes(s)) stab(t, CH[bar].map((m) => m + 12), spb * 0.7, 0.07, 'square');
      if (s === 0 && bar % 2 === 0) pluck(t, CH[bar][2] + 24, spb * 2.5, 0.12);
    },
    amapiano: (i, t, spb) => {
      const bar = Math.floor(i / 16) % 4;
      const s = i % 16;
      if (s % 4 === 0) kick(t, 0.75);
      if ([4, 12].includes(s)) snare(t, 0.2);
      shaker(t, s % 2 ? 0.07 : 0.11);
      if ([0, 3, 6, 10, 13].includes(s)) logdrum(t, ROOT[bar] + ([0, 6].includes(s) ? 0 : s === 13 ? 7 : 12) - 12 + 12);
      if ([0, 6, 10].includes(s)) stab(t, CH[bar].map((m) => m + 12), spb * 1.6, 0.1, 'sine');
      if ([2, 8, 14].includes(s)) pluck(t, CH[bar][(s / 2) % 3 | 0] + 24, spb * 0.8, 0.1);
      if (s === 12) hat(t, 0.15, true);
    },
    highlife: (i, t, spb) => {
      const bar = Math.floor(i / 16) % 4;
      const s = i % 16;
      if ([0, 8].includes(s)) kick(t, 0.7);
      if ([4, 12].includes(s)) snare(t, 0.22);
      shaker(t, s % 2 ? 0.06 : 0.1);
      if ([0, 6, 8, 14].includes(s)) bass(t, ROOT[bar] + (s === 6 || s === 14 ? 7 : 0), spb * 1.2, 0.45);
      const arp = [0, 1, 2, 1];
      if (s % 2 === 0) pluck(t, CH[bar][arp[(s / 2) % 4]] + 24, spb * 1.2, 0.14);
      if ([2, 10].includes(s)) conga(t, true, 0.22);
      if (s === 7 || s === 15) clave(t, 0.2);
    },
    fuji: (i, t, spb) => {
      const bar = Math.floor(i / 16) % 4;
      const s = i % 16;
      if ([0, 6, 8].includes(s)) kick(t, 0.6);
      if ([4, 12].includes(s)) conga(t, false, 0.35);
      if ([2, 3, 10, 11, 14, 15].includes(s)) conga(t, true, 0.24);
      if ([1, 5, 9, 13].includes(s)) talk(t, 280 + ((s * 37 + bar * 11) % 5) * 40);
      shaker(t, 0.1);
      if (s % 4 === 0) bass(t, ROOT[bar] + 12, spb * 2.5, 0.35);
      if ([0, 8].includes(s)) stab(t, CH[bar], spb * 3, 0.07, 'sine');
    },
  };

  const schedule = () => {
    if (!ctx || !playing) return;
    const st = STATIONS.find((s) => s.id === station) || STATIONS[0];
    const spb = 60 / st.bpm / 4; // seconds per 16th
    while (nextTime < ctx.currentTime + 0.25) {
      if (nextTime >= ctx.currentTime - 0.05) patterns[station](step, nextTime, spb);
      nextTime += spb;
      step = (step + 1) % 64;
    }
  };
  const startLoop = () => {
    if (timer || !ctx) return;
    playing = true;
    step = 0;
    nextTime = ctx.currentTime + 0.1;
    timer = setInterval(schedule, 70);
  };
  const stopLoop = () => {
    playing = false;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  return {
    unlock() {
      const c = ensure();
      if (c && c.state === 'suspended') c.resume();
      if (c && musicOn && !timer) startLoop();
    },
    setMusic(on) {
      musicOn = on;
      if (on) this.unlock();
      else stopLoop();
    },
    setStation(id) {
      station = id;
      step = 0;
      if (musicOn) this.unlock();
    },
    getStation: () => station,
    isMusic: () => musicOn,
    setSfx(on) {
      sfxOn = on;
    },
    sfx(kind) {
      if (!sfxOn) return;
      const c = ensure();
      if (!c) return;
      if (c.state === 'suspended') c.resume();
      const t = c.currentTime + 0.01;
      if (kind === 'tap') tone(sfxGain, t, 660, 0.06, 'triangle', 0.35, { attack: 0.002 });
      else if (kind === 'coin') {
        tone(sfxGain, t, 988, 0.08, 'square', 0.12, { attack: 0.002, lp: 4000 });
        tone(sfxGain, t + 0.08, 1319, 0.2, 'square', 0.12, { attack: 0.002, lp: 4000 });
      } else if (kind === 'error') tone(sfxGain, t, 180, 0.2, 'sawtooth', 0.2, { glideTo: 110, attack: 0.005, lp: 800 });
      else if (kind === 'level') [523, 659, 784, 1047].forEach((f, i) => tone(sfxGain, t + i * 0.09, f, 0.22, 'triangle', 0.3, { attack: 0.004 }));
      else if (kind === 'msg') {
        tone(sfxGain, t, 880, 0.08, 'sine', 0.3, { attack: 0.002 });
        tone(sfxGain, t + 0.09, 1175, 0.14, 'sine', 0.3, { attack: 0.002 });
      } else if (kind === 'eat') [0, 0.12, 0.24].forEach((d) => noise(sfxGain, t + d, 0.06, 0.25, 900));
      else if (kind === 'power') tone(sfxGain, t, 300, 0.5, 'sine', 0.2, { glideTo: 90, attack: 0.01 });
    },
  };
})();
/* ================================================================== */
/*  UI: STYLES + SMALL PIECES                                          */
/* ================================================================== */
const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap');
.il-root{font-family:'Plus Jakarta Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#1f2433;-webkit-tap-highlight-color:transparent}
.il-root *{box-sizing:border-box}
@keyframes ilFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes ilSheet{from{transform:translateY(100%)}to{transform:none}}
@keyframes ilPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
@keyframes ilSpin{to{transform:rotate(360deg)}}
.il-fade{animation:ilFade .22s ease-out}
.il-sheet{animation:ilSheet .26s cubic-bezier(.2,.8,.2,1)}
.il-pulse{animation:ilPulse 1.4s ease-in-out infinite}
.il-glass{background:rgba(255,255,255,.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 6px 24px rgba(20,30,60,.14)}
.il-scroll{overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
.il-btn{transition:transform .08s,opacity .15s}
.il-btn:active{transform:scale(.96)}
`;
const GREEN = '#22b573';
const NAVY = '#1f2433';

function Toasts({ toasts }) {
  return (
    <div className="pointer-events-none fixed left-1/2 top-3 z-[90] flex w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="il-fade il-glass rounded-2xl px-4 py-2.5 text-[13px] font-bold"
          style={{ color: t.type === 'error' ? '#c0392b' : t.type === 'success' ? '#0f8a5a' : NAVY, borderLeft: `5px solid ${t.type === 'error' ? '#e5484d' : t.type === 'success' ? GREEN : '#6d7bff'}` }}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

function FaceBadge({ look, size = 44, ring }) {
  const L = { ...defaultLook(), ...(look || {}) };
  const skin = SKINS[L.skin] || SKINS[3];
  const hair = HAIR_COLORS[L.hairColor] || HAIR_COLORS[0];
  const shirt = OUTFIT_COLORS[L.color] || OUTFIT_COLORS[0];
  const style = L.hair;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ borderRadius: '50%', background: '#e8f1ff', boxShadow: ring ? `0 0 0 3px ${ring}` : undefined, flex: 'none' }} aria-hidden="true">
      <rect x="10" y="46" width="44" height="22" rx="10" fill={L.outfit === 'office' ? '#f4f4f4' : shirt} />
      {L.outfit === 'ankara' && [16, 28, 40].map((x) => <circle key={x} cx={x + 4} cy={54} r="2.4" fill="#1f8a5b" />)}
      <rect x="27" y="38" width="10" height="10" rx="3" fill={skin} />
      {style === 'afro' && <circle cx="32" cy="22" r="19" fill={hair} />}
      {(style === 'locs' || style === 'braids') && <rect x="12" y="18" width="40" height="32" rx="14" fill={hair} />}
      <ellipse cx="32" cy="27" rx="13" ry="14" fill={skin} />
      {style !== 'bald' && style !== 'afro' && <path d="M18 24 Q20 10 32 11 Q44 10 46 24 Q40 16 32 17 Q24 16 18 24Z" fill={hair} />}
      {style === 'curls' && [20, 27, 34, 41].map((x) => <circle key={x} cx={x} cy={14} r="4.5" fill={hair} />)}
      {style === 'afro' && <path d="M19 24 Q21 14 32 14 Q43 14 45 24 Q40 19 32 19 Q24 19 19 24Z" fill={hair} />}
      <circle cx="27" cy="27" r="1.7" fill="#101010" />
      <circle cx="37" cy="27" r="1.7" fill="#101010" />
      <path d="M28 34 Q32 37 36 34" stroke="#7a2e22" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function NeedPill({ k, v }) {
  const col = v < 25 ? '#e5484d' : v < 50 ? '#f5a524' : GREEN;
  return (
    <div className="flex items-center gap-1.5" title={NEED_META[k].label}>
      <span className="text-[15px] leading-none">{NEED_META[k].emoji}</span>
      <div className="h-[7px] w-full overflow-hidden rounded-full bg-[#e3e8f1]">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(3, v)}%`, background: col }} />
      </div>
    </div>
  );
}

function Sheet({ children, onClose, title, tall, noPad, z = 70 }) {
  return (
    <div className="fixed inset-0 flex items-end justify-center" style={{ zIndex: z, background: 'rgba(15,20,40,.45)' }} onClick={onClose}>
      <div
        className={`il-sheet il-scroll w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-white ${noPad ? '' : 'px-5 pb-8 pt-3'} shadow-2xl`}
        style={{ maxHeight: tall ? '92vh' : '78vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {!noPad && <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[#dfe4ee]" />}
        {title && <h2 className="mb-3 text-[22px] font-extrabold" style={{ color: NAVY }}>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

function BigButton({ children, onClick, disabled, color = GREEN, className = '' }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`il-btn w-full rounded-full py-3.5 text-[16px] font-extrabold text-white disabled:opacity-40 ${className}`}
      style={{ background: color }}
    >
      {children}
    </button>
  );
}
function Chip({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      className="il-btn shrink-0 rounded-full px-4 py-2.5 text-[14px] font-bold"
      style={{ background: active ? NAVY : '#f0f3f9', color: active ? '#fff' : '#566078' }}
    >
      {children}
    </button>
  );
}

/* ---- canvases ---- */
function AvatarCanvas({ look, className = '' }) {
  const ref = useRef(null);
  const sceneRef = useRef(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!webglOk()) {
      setFailed(true);
      return undefined;
    }
    let sc = null;
    try {
      sc = createAvatarScene(ref.current, { onError: () => setFailed(true) });
      sceneRef.current = sc;
      sc.setLook(look);
    } catch (e) {
      setFailed(true);
    }
    return () => {
      if (sc) sc.destroy();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (sceneRef.current) sceneRef.current.setLook(look);
  }, [look]);
  if (failed) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <FaceBadge look={look} size={150} />
      </div>
    );
  }
  return (
    <div className={className} style={{ position: 'relative' }}>
      <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}

/* ================================================================== */
/*  AUTH                                                               */
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
      const { data, error: err } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { username: uname } } });
      setBusy(false);
      if (err) return setError(err.message);
      if (!data.session) {
        setMode('login');
        setInfo('Account created! If email confirmation is on in Supabase, confirm your email, then log in.');
      }
      return undefined;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) setError(err.message);
    return undefined;
  };
  const inputCls = 'w-full rounded-2xl border-2 border-transparent bg-[#f0f3f9] px-4 py-3.5 text-[15px] font-semibold outline-none transition focus:border-[#22b573] focus:bg-white';
  return (
    <div className="il-root flex min-h-screen items-center justify-center p-4" style={{ background: 'linear-gradient(180deg,#cfe6ff 0%,#eaf6e4 100%)' }}>
      <style>{GLOBAL_CSS}</style>
      <div className="il-fade w-full max-w-sm overflow-hidden rounded-[32px] bg-white shadow-2xl">
        <div className="relative px-6 pb-7 pt-8" style={{ background: 'linear-gradient(135deg,#22b573 0%,#f5a524 100%)' }}>
          <div className="text-5xl">🏘️</div>
          <h1 className="mt-2 text-[32px] font-extrabold leading-none text-white">Ibadan Life</h1>
          <p className="mt-2 text-[14px] font-semibold text-white/90">Ride Micra, chop amala, survive NEPA, and make real friends in the city of brown roofs.</p>
        </div>
        <form onSubmit={submit} className="space-y-3 p-6">
          <div className="grid grid-cols-2 gap-1 rounded-full bg-[#f0f3f9] p-1">
            {[['login', 'Log in'], ['signup', 'Sign up']].map(([k, label]) => (
              <button key={k} type="button" onClick={() => { setMode(k); setError(''); setInfo(''); }} className="il-btn rounded-full py-2.5 text-[14px] font-extrabold" style={{ background: mode === k ? NAVY : 'transparent', color: mode === k ? '#fff' : '#566078' }}>
                {label}
              </button>
            ))}
          </div>
          {mode === 'signup' && <input className={inputCls} placeholder="Choose a username" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={16} autoComplete="username" />}
          <input className={inputCls} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          <div className="relative">
            <input className={inputCls} type={showPw ? 'text' : 'password'} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required />
            <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-4 top-1/2 -translate-y-1/2 text-[12px] font-bold text-[#8a93a8]">{showPw ? 'Hide' : 'Show'}</button>
          </div>
          {error && <div className="rounded-2xl bg-[#fdecec] px-4 py-2.5 text-[13px] font-bold text-[#c0392b]">{error}</div>}
          {info && <div className="rounded-2xl bg-[#e6f7ef] px-4 py-2.5 text-[13px] font-bold text-[#0f8a5a]">{info}</div>}
          <BigButton disabled={busy}>{busy ? 'Please wait…' : mode === 'signup' ? 'Create my account' : 'Enter Ibadan'}</BigButton>
        </form>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  CHARACTER CREATOR (look -> personality -> birth lottery -> home)   */
/* ================================================================== */
function Creator({ initialName, onDone }) {
  const [step, setStep] = useState(0);
  const [look, setLook] = useState(defaultLook());
  const [traits, setTraits] = useState([]);
  const [lottery, setLottery] = useState(() => rollLottery());
  const [spun, setSpun] = useState(0);
  const [area, setArea] = useState('agbowo');
  const set = (patch) => setLook((l) => ({ ...l, ...patch }));
  const titles = ['Look', 'Personality', 'Birth lottery', 'Choose where to live'];
  const toggleTrait = (id) => setTraits((t) => (t.includes(id) ? t.filter((x) => x !== id) : t.length < 2 ? [...t, id] : t));
  const randomize = () => {
    if (step === 0) setLook(randomLook());
    else if (step === 1) setTraits([...TRAIT_ORDER].sort(() => Math.random() - 0.5).slice(0, 2));
    else if (step === 2) {
      setLottery(rollLottery());
      setSpun((s) => s + 1);
    }
  };
  const canNext = step === 1 ? traits.length === 2 : true;
  const next = () => {
    AudioEngine.sfx('tap');
    if (step < 3) setStep(step + 1);
    else onDone({ look, traits, lottery, area: AREAS[area] });
  };
  return (
    <div className="il-root flex min-h-screen flex-col" style={{ background: 'linear-gradient(180deg,#d6e9ff 0%,#eef6ff 55%,#ffffff 100%)' }}>
      <style>{GLOBAL_CSS}</style>
      <div className="flex items-center justify-between px-4 pt-4">
        <button onClick={() => step > 0 && setStep(step - 1)} className="il-btn il-glass flex h-11 w-11 items-center justify-center rounded-full text-xl font-bold" style={{ opacity: step ? 1 : 0.35 }}>‹</button>
        <div className="text-center">
          <div className="text-[19px] font-extrabold">{titles[step]}</div>
          <div className="mt-1.5 flex justify-center gap-1.5">
            {titles.map((t, i) => <span key={t} className="h-1.5 w-9 rounded-full" style={{ background: i <= step ? GREEN : '#cdd5e3' }} />)}
          </div>
        </div>
        <div className="flex gap-2">
          {step < 3 && <button onClick={randomize} className="il-btn il-glass flex h-11 w-11 items-center justify-center rounded-full text-lg">🔀</button>}
        </div>
      </div>
      <div className="relative mx-auto mt-1 w-full max-w-md" style={{ height: step === 3 ? '24vh' : '36vh' }}>
        <AvatarCanvas look={look} className="h-full w-full" />
        <div className="pointer-events-none absolute bottom-1 left-0 right-0 text-center text-[12px] font-bold text-[#8a93a8]">Drag to spin</div>
      </div>
      <div className="il-scroll mx-auto w-full max-w-md flex-1 overflow-y-auto rounded-t-[30px] bg-white px-5 pb-28 pt-5 shadow-[0_-8px_30px_rgba(20,30,60,.1)]">
        {step === 0 && (
          <div className="space-y-5">
            <div className="rounded-2xl bg-[#f0f3f9] px-4 py-3.5"><span className="text-[11px] font-bold uppercase text-[#8a93a8]">Your Sim's name</span><div className="text-[20px] font-extrabold">@{initialName}</div></div>
            <div><div className="mb-2 text-[13px] font-bold text-[#8a93a8]">Body</div><div className="grid grid-cols-2 gap-2">{['woman', 'man'].map((b) => <button key={b} onClick={() => set({ body: b })} className="il-btn rounded-full py-3.5 text-[15px] font-extrabold" style={{ background: look.body === b ? NAVY : '#f0f3f9', color: look.body === b ? '#fff' : NAVY }}>{cap(b)}</button>)}</div></div>
            <div><div className="mb-2 text-[13px] font-bold text-[#8a93a8]">Skin</div><div className="flex gap-3">{SKINS.map((c, i) => <button key={c} onClick={() => set({ skin: i })} className="il-btn h-10 w-10 rounded-full" style={{ background: c, boxShadow: look.skin === i ? `0 0 0 3px #fff, 0 0 0 6px ${GREEN}` : 'inset 0 0 0 2px rgba(0,0,0,.08)' }} />)}</div></div>
            <div><div className="mb-2 text-[13px] font-bold text-[#8a93a8]">Hairstyle</div><div className="flex flex-wrap gap-2">{HAIRS.map((h) => <Chip key={h.id} active={look.hair === h.id} onClick={() => set({ hair: h.id })}>{h.name}</Chip>)}</div></div>
            <div><div className="mb-2 text-[13px] font-bold text-[#8a93a8]">Hair colour</div><div className="flex gap-3">{HAIR_COLORS.map((c, i) => <button key={c} onClick={() => set({ hairColor: i })} className="il-btn h-9 w-9 rounded-full" style={{ background: c, boxShadow: look.hairColor === i ? `0 0 0 3px #fff, 0 0 0 6px ${GREEN}` : 'inset 0 0 0 2px rgba(0,0,0,.1)' }} />)}</div></div>
            <div><div className="mb-2 text-[13px] font-bold text-[#8a93a8]">Outfit</div><div className="flex flex-wrap gap-2">{OUTFITS.filter((o) => o.price <= 15000).map((o) => <Chip key={o.id} active={look.outfit === o.id} onClick={() => set({ outfit: o.id })}>{o.emoji} {o.name}</Chip>)}</div></div>
            <div><div className="mb-2 text-[13px] font-bold text-[#8a93a8]">Outfit colour</div><div className="flex gap-3">{OUTFIT_COLORS.map((c, i) => <button key={c} onClick={() => set({ color: i })} className="il-btn h-9 w-9 rounded-full" style={{ background: c, boxShadow: look.color === i ? `0 0 0 3px #fff, 0 0 0 6px ${GREEN}` : 'inset 0 0 0 2px rgba(0,0,0,.1)' }} />)}</div></div>
          </div>
        )}
        {step === 1 && (
          <div>
            <p className="mb-3 text-[14px] font-semibold text-[#566078]">Choose 2 traits for @{initialName}.</p>
            <div className="grid grid-cols-2 gap-3">
              {TRAIT_ORDER.map((id) => {
                const t = TRAITS[id];
                const on = traits.includes(id);
                return (
                  <button key={id} onClick={() => toggleTrait(id)} className="il-btn rounded-3xl p-4 text-left" style={{ background: on ? '#e6f7ef' : '#f0f3f9', boxShadow: on ? `inset 0 0 0 2.5px ${GREEN}` : 'none' }}>
                    <div className="text-3xl">{t.emoji}</div>
                    <div className="mt-1.5 text-[16px] font-extrabold">{t.name}</div>
                    <div className="mt-0.5 text-[12.5px] font-semibold leading-snug text-[#566078]">{t.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {step === 2 && (
          <div key={spun} className="il-fade">
            <div className="text-center"><div className="text-[30px] font-extrabold leading-tight">{lottery.title}</div><div className="mt-1 text-[16px] font-semibold text-[#566078]">{lottery.tag}</div></div>
            <div className="mt-4 space-y-2.5">{lottery.perks.map((p) => <div key={p} className="flex gap-3 rounded-full bg-[#f0f3f9] px-4 py-3 text-[14.5px] font-semibold"><span>💪🏾</span><span>{p}</span></div>)}</div>
            <p className="mt-4 text-center text-[12.5px] font-semibold text-[#8a93a8]">Tap 🔀 above to spin again until you like your luck.</p>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-3">
            {Object.values(AREAS).map((a) => (
              <button key={a.id} onClick={() => setArea(a.id)} className="il-btn flex w-full items-center gap-4 rounded-3xl p-4 text-left" style={{ background: area === a.id ? '#e6f7ef' : '#f0f3f9', boxShadow: area === a.id ? `inset 0 0 0 2.5px ${GREEN}` : 'none' }}>
                <div className="text-4xl">{a.emoji}</div>
                <div className="flex-1"><div className="text-[17px] font-extrabold">{a.name}</div><div className="text-[13px] font-semibold text-[#566078]">{a.desc}</div><div className="mt-1 text-[12px] font-bold" style={{ color: GREEN }}>{a.bonus}</div></div>
                <div className="text-right text-[14px] font-extrabold">{naira(a.fee)}<div className="text-[11px] font-semibold text-[#8a93a8]">/week</div></div>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="fixed bottom-0 left-0 right-0 z-10 mx-auto max-w-md bg-white/95 px-5 pb-5 pt-3 backdrop-blur">
        <BigButton onClick={next} disabled={!canNext}>{step === 0 ? 'Next' : step === 1 ? (traits.length === 2 ? 'Next' : `Choose ${2 - traits.length} more`) : step === 2 ? 'Choose where to live' : 'Start my life'}</BigButton>
      </div>
    </div>
  );
}
/* ================================================================== */
/*  SCREENS: MAP, PLACE, AND THE PHONE APPS                            */
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
const MAP_ROOFS = (() => {
  const rng = mulberry32(77);
  const out = [];
  const colors = ['#e8672a', '#d9531c', '#f58b3a', '#cf4519', '#ee7a35', '#ff9a4d'];
  let guard = 0;
  while (out.length < 320 && guard < 6000) {
    guard += 1;
    const x = 8 + rng() * (MAP_W - 16);
    const y = 8 + rng() * (MAP_H - 16);
    let ok = true;
    for (let i = 0; i < EDGES.length && ok; i += 1) if (distToSeg(x, y, NODES[EDGES[i][0]].x, NODES[EDGES[i][0]].y, NODES[EDGES[i][1]].x, NODES[EDGES[i][1]].y) < 20) ok = false;
    const ids = Object.keys(LOCATIONS);
    for (let i = 0; i < ids.length && ok; i += 1) if (Math.hypot(x - LOCATIONS[ids[i]].x, y - LOCATIONS[ids[i]].y) < 62) ok = false;
    if (Math.hypot(x - 890, y - 330) < 95) ok = false;
    if (!ok) continue;
    out.push({ x, y, w: 13 + rng() * 15, h: 10 + rng() * 9, r: (rng() - 0.5) * 40, c: colors[Math.floor(rng() * colors.length)] });
  }
  return out;
})();

function hintFor(a) {
  if (a.hint) return a.hint;
  const p = [];
  if (a.cost) p.push(`-${naira(a.cost)}`);
  if (a.pay) p.push(`+${naira(a.pay[0])}–${naira(a.pay[1])}`);
  Object.entries(a.needs || {}).forEach(([k, v]) => {
    if (k === 'bladder' && v === 100) p.push('Toilet reset');
    else p.push(`${v > 0 ? '+' : ''}${Math.round(v)} ${NEED_META[k].label}`);
  });
  Object.entries(a.skill || {}).forEach(([k, v]) => p.push(`+${v} ${cap(k)} XP`));
  if (a.secs) p.push(`${a.secs}s`);
  return p.join(' · ');
}

const MapScreen = memo(function MapScreen({ loc, onSelect, travel, look, counts }) {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: '#9ad7ff' }}>
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} preserveAspectRatio="xMidYMid slice" className="block h-full w-full select-none">
        <defs>
          <linearGradient id="mgr" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8fdc6a" />
            <stop offset="1" stopColor="#b9ea70" />
          </linearGradient>
        </defs>
        <rect width={MAP_W} height={MAP_H} fill="url(#mgr)" />
        <ellipse cx="170" cy="330" rx="170" ry="80" fill="#ffe29a" opacity=".45" />
        <ellipse cx="640" cy="600" rx="210" ry="70" fill="#5cc95a" opacity=".5" />
        <ellipse cx="520" cy="320" rx="140" ry="90" fill="#f0c36a" opacity=".6" />
        <ellipse cx="520" cy="320" rx="95" ry="60" fill="#f7d584" opacity=".7" />
        <ellipse cx="890" cy="335" rx="100" ry="62" fill="#5bc0f0" opacity=".85" />
        <ellipse cx="890" cy="335" rx="78" ry="46" fill="#7fd3ff" opacity=".9" />
        {MAP_ROOFS.map((r, i) => (
          <g key={i} transform={`translate(${r.x} ${r.y}) rotate(${r.r})`}>
            <rect x={-r.w / 2} y={-r.h / 2} width={r.w} height={r.h} rx="1.5" fill={r.c} />
            <line x1={-r.w / 2} y1="0" x2={r.w / 2} y2="0" stroke="#00000030" strokeWidth="1" />
          </g>
        ))}
        {EDGES.map(([a, b], i) => <line key={`b${i}`} x1={NODES[a].x} y1={NODES[a].y} x2={NODES[b].x} y2={NODES[b].y} stroke="#b9873d" strokeWidth="19" strokeLinecap="round" />)}
        {EDGES.map(([a, b], i) => <line key={`t${i}`} x1={NODES[a].x} y1={NODES[a].y} x2={NODES[b].x} y2={NODES[b].y} stroke="#fff0c2" strokeWidth="14" strokeLinecap="round" />)}
        {EDGES.map(([a, b], i) => <line key={`d${i}`} x1={NODES[a].x} y1={NODES[a].y} x2={NODES[b].x} y2={NODES[b].y} stroke="#ffffffaa" strokeWidth="1.6" strokeDasharray="7 9" />)}
        {Object.values(JUNCTIONS).map((j, i) => <circle key={i} cx={j.x} cy={j.y} r="10" fill="#fff0c2" />)}
        {[[60, 90], [350, 40], [610, 60], [930, 80], [60, 330], [340, 440], [640, 520], [940, 560], [820, 380]].map(([x, y], i) => (
          <g key={i}><circle cx={x} cy={y} r="13" fill="#17a34a" /><circle cx={x - 3} cy={y - 3} r="8" fill="#4ade80" /></g>
        ))}
        {LOCATION_ORDER.map((id) => {
          const l = LOCATIONS[id];
          const label = l.name;
          const w = label.length * 7.4 + 44;
          const here = loc === id && !travel;
          return (
            <g key={id} transform={`translate(${l.x} ${l.y})`} onClick={() => onSelect(id)} style={{ cursor: 'pointer' }}>
              {here && <circle r="30" fill="none" stroke="#22b573" strokeWidth="4"><animate attributeName="r" values="26;38;26" dur="1.6s" repeatCount="indefinite" /><animate attributeName="opacity" values="1;.2;1" dur="1.6s" repeatCount="indefinite" /></circle>}
              <circle r="21" fill="#ffffff" stroke="#1f2433" strokeWidth="2.5" />
              <text textAnchor="middle" y="9" fontSize="23">{l.emoji}</text>
              <g transform="translate(0 38)">
                <rect x={-w / 2} y="-12" width={w} height="24" rx="12" fill="#ffffff" stroke="#1f243340" />
                <text textAnchor="middle" y="5" fontSize="13.5" fontWeight="800" fill="#1f2433">{label}</text>
              </g>
              {counts[id] > 0 && <g transform="translate(18 -20)"><circle r="11" fill="#22b573" stroke="#fff" strokeWidth="2" /><text textAnchor="middle" y="4.5" fontSize="12" fontWeight="800" fill="#fff">{counts[id]}</text></g>}
            </g>
          );
        })}
        {travel && (
          <g style={{ transform: `translate(${travel.x}px, ${travel.y}px)`, transition: 'transform .26s linear' }}>
            <circle r="22" fill="#fff" stroke="#22b573" strokeWidth="4" />
            <text textAnchor="middle" y="9" fontSize="25">{MODES[travel.mode].icon}</text>
          </g>
        )}
      </svg>
    </div>
  );
});

function ActionRow({ icon, label, hint, reason, onClick, accent = '#fff3e0' }) {
  return (
    <button onClick={onClick} className="il-btn flex w-full items-center gap-3 rounded-3xl p-3 text-left" style={{ background: reason ? '#f4f6fa' : '#fff', boxShadow: '0 2px 10px rgba(20,30,60,.08)', opacity: reason ? 0.8 : 1 }}>
      <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl text-[26px]" style={{ background: reason ? '#e9edf5' : accent }}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-extrabold leading-tight">{label}</span>
        <span className="mt-0.5 block text-[12.5px] font-semibold" style={{ color: reason ? '#d6453d' : '#6b7690' }}>{reason || hint}</span>
      </span>
    </button>
  );
}

function PlaceView({ loc, ctx, hereNames }) {
  const l = LOCATIONS[loc];
  const g = ctx.g;
  const ids = [...l.actions, ...GLOBAL_ACTIONS].filter((id) => !(id === 'apply_job' && g.jobs.remote));
  return (
    <div className="il-scroll absolute inset-0 overflow-y-auto px-4 pb-44 pt-40">
      <div className="il-fade relative overflow-hidden rounded-[30px] p-5 text-white shadow-xl" style={{ background: 'linear-gradient(135deg,#22b573 0%,#f5a524 100%)' }}>
        <div className="absolute -right-3 -top-4 text-[110px] opacity-25">{l.emoji}</div>
        <div className="relative">
          <div className="text-[12px] font-extrabold uppercase tracking-widest text-white/80">{l.area}</div>
          <div className="text-[28px] font-extrabold leading-tight">{l.emoji} {l.name}</div>
          <p className="mt-1.5 text-[14px] font-semibold leading-snug text-white/95">{l.desc}</p>
          {hereNames.length > 0 && <p className="mt-2 text-[12.5px] font-bold">👥 {hereNames.join(', ')} {hereNames.length > 1 ? 'are' : 'is'} here too.</p>}
        </div>
      </div>
      <div className="mt-4 space-y-2.5">
        {ids.map((id) => {
          const a = ACTIONS[id];
          const why = ctx.reasonFor(a);
          return <ActionRow key={id} icon={a.icon} label={a.label} hint={hintFor(a)} reason={why} onClick={() => ctx.doPlaceAction(id)} accent={a.pay ? '#e6f7ef' : a.cost ? '#fff3e0' : '#eaf0ff'} />;
        })}
        <ActionRow icon="🏠" label="Go home" hint="Back to your room" onClick={() => ctx.goMap('home')} accent="#eaf0ff" />
      </div>
    </div>
  );
}

/* ---------------- phone apps ---------------- */
const APPS = [
  { id: 'jobs', name: 'Jobs', emoji: '💼', bg: 'linear-gradient(135deg,#23c784,#12945f)' },
  { id: 'messages', name: 'Messages', emoji: '💬', bg: 'linear-gradient(135deg,#4aa3ff,#2563eb)' },
  { id: 'bank', name: 'Bank', emoji: '🏦', bg: 'linear-gradient(135deg,#8b7bff,#5b3fd6)' },
  { id: 'ride', name: 'Ride', emoji: '🚕', bg: 'linear-gradient(135deg,#ffcc33,#f59e0b)' },
  { id: 'boutique', name: 'Boutique', emoji: '👗', bg: 'linear-gradient(135deg,#f472b6,#a855f7)' },
  { id: 'forbes', name: 'Forbes', emoji: '👑', bg: 'linear-gradient(135deg,#17382c,#0b1f19)' },
  { id: 'radio', name: 'Radio', emoji: '📻', bg: 'linear-gradient(135deg,#ff7a45,#e0453a)' },
  { id: 'me', name: 'Me', emoji: '🧑🏾', bg: 'linear-gradient(135deg,#38bdf8,#0ea5e9)' },
];

function AppShell({ title, onBack, children, right }) {
  return (
    <div className="flex h-full flex-col bg-[#f6f8fc]">
      <div className="flex items-center gap-3 bg-white px-4 py-3 shadow-sm">
        <button onClick={onBack} className="il-btn flex h-10 w-10 items-center justify-center rounded-full bg-[#f0f3f9] text-xl font-bold">‹</button>
        <div className="flex-1 text-[19px] font-extrabold">{title}</div>
        {right}
      </div>
      <div className="il-scroll flex-1 overflow-y-auto p-4 pb-10">{children}</div>
    </div>
  );
}

function JobsApp({ ctx, onBack }) {
  const g = ctx.g;
  return (
    <AppShell title="Jobs" onBack={onBack}>
      <div className="mb-3 rounded-3xl bg-white p-4 shadow-sm">
        <div className="text-[13px] font-bold text-[#6b7690]">Your career</div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-[#f0f3f9] p-2"><div className="text-[15px] font-extrabold" style={{ color: GREEN }}>{naira(g.earned)}</div><div className="text-[11px] font-bold text-[#6b7690]">Earned</div></div>
          <div className="rounded-2xl bg-[#f0f3f9] p-2"><div className="text-[15px] font-extrabold">{g.shifts}</div><div className="text-[11px] font-bold text-[#6b7690]">Shifts</div></div>
          <div className="rounded-2xl bg-[#f0f3f9] p-2"><div className="text-[15px] font-extrabold">{g.jobs.remote ? 'Hired' : 'No'}</div><div className="text-[11px] font-bold text-[#6b7690]">Remote job</div></div>
        </div>
      </div>
      <div className="space-y-2.5">
        {JOB_BOARD.map(({ action, loc }) => {
          const a = ACTIONS[action];
          const lock = a.req?.job && !g.jobs[a.req.job] ? 'Get hired first' : a.req?.skill && skillLevel(g.skills[a.req.skill]) < a.req.level ? `${cap(a.req.skill)} lvl ${a.req.level} needed` : null;
          const pay = a.pay ? `${naira(a.pay[0] * ctx.mods.payMult)}–${naira(a.pay[1] * ctx.mods.payMult)}` : '';
          return (
            <div key={action} className="flex items-center gap-3 rounded-3xl bg-white p-3 shadow-sm">
              <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-[#e6f7ef] text-[26px]">{a.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-extrabold leading-tight">{a.label}</div>
                <div className="text-[12.5px] font-semibold text-[#6b7690]">{LOCATIONS[loc].name} · {pay} · {a.secs}s</div>
                {lock && <div className="text-[12px] font-bold text-[#d6453d]">🔒 {lock}</div>}
              </div>
              <button onClick={() => ctx.goMap(loc)} className="il-btn rounded-full px-4 py-2 text-[13px] font-extrabold text-white" style={{ background: lock ? '#aab3c5' : GREEN }}>Go</button>
            </div>
          );
        })}
        {!g.jobs.remote && (
          <div className="rounded-3xl bg-[#fff6e0] p-4 text-[13.5px] font-semibold text-[#8a5a00]">💡 Apply for the <b>Remote Tech Job</b> at Cocoa House (needs more than 60 Energy). It pays ₦25,000 to sign and unlocks the best shifts.</div>
        )}
      </div>
    </AppShell>
  );
}

function BankApp({ ctx, onBack }) {
  const g = ctx.g;
  const [msg, setMsg] = useState('');
  const dueIn = Math.max(0, Math.ceil(((weekIdOf(ctx.nowMs) + 1) * 7 - 3) * 86400000 - LAGOS_OFFSET_MS - ctx.nowMs) / 86400000);
  const mv = (kind, amt) => {
    const a = Math.floor(amt === 'all' ? (kind === 'dep' ? g.cash : kind === 'wd' ? g.savings : Math.min(g.cash, g.loan.owed)) : amt);
    if (a <= 0) return setMsg('Nothing to move.');
    if (kind === 'dep') {
      if (a > g.cash) return setMsg("You don't have that much cash.");
      ctx.update((x) => ({ ...x, cash: x.cash - a, savings: x.savings + a }));
      AudioEngine.sfx('coin');
    } else if (kind === 'wd') {
      if (a > g.savings) return setMsg('Not enough savings.');
      ctx.update((x) => ({ ...x, cash: x.cash + a, savings: x.savings - a }));
      AudioEngine.sfx('coin');
    } else {
      if (a > g.cash) return setMsg("You don't have that much cash.");
      const pay = Math.min(a, g.loan.owed);
      ctx.update((x) => ({ ...x, cash: x.cash - pay, loan: { ...x.loan, owed: x.loan.owed - pay } }));
      AudioEngine.sfx('coin');
    }
    return setMsg('');
  };
  const Row = ({ kind, label }) => (
    <div className="mt-2 flex flex-wrap gap-2">
      {[1000, 5000, 20000, 'all'].map((a) => (
        <button key={a} onClick={() => mv(kind, a)} className="il-btn rounded-full bg-[#f0f3f9] px-3.5 py-2 text-[13px] font-extrabold">{label} {a === 'all' ? 'all' : naira(a)}</button>
      ))}
    </div>
  );
  return (
    <AppShell title="Bank" onBack={onBack}>
      <div className="rounded-3xl p-5 text-white shadow-lg" style={{ background: 'linear-gradient(135deg,#8b7bff,#5b3fd6)' }}>
        <div className="text-[13px] font-bold text-white/80">Net worth</div>
        <div className="text-[34px] font-extrabold leading-tight">{naira(netWorth(g))}</div>
        <div className="mt-2 flex gap-4 text-[13px] font-bold"><span>💵 Cash {naira(g.cash)}</span><span>🏦 Savings {naira(g.savings)}</span></div>
      </div>
      <div className="mt-3 rounded-3xl bg-white p-4 shadow-sm">
        <div className="text-[16px] font-extrabold">Savings</div>
        <div className="text-[12.5px] font-semibold text-[#6b7690]">Earns 2% interest every Monday. Safe from pickpockets!</div>
        <Row kind="dep" label="Save" />
        <Row kind="wd" label="Take" />
      </div>
      <div className="mt-3 rounded-3xl bg-white p-4 shadow-sm">
        <div className="text-[16px] font-extrabold">Loan</div>
        <div className="text-[13.5px] font-semibold text-[#566078]">{g.loan.owed > 0 ? `You owe ${naira(g.loan.owed)}${g.loan.weekly ? ` · ${naira(Math.min(g.loan.weekly, g.loan.owed))} auto-paid each Monday` : ''}` : 'You are debt free. 🎉'}</div>
        {g.loan.owed > 0 && <Row kind="loan" label="Repay" />}
      </div>
      <div className="mt-3 rounded-3xl bg-[#fff6e0] p-4 text-[13.5px] font-semibold text-[#8a5a00]">🏠 Monday bills: rent {naira(g.fee)}{g.loan.owed > 0 ? ` + loan ${naira(Math.min(g.loan.weekly || 0, g.loan.owed))}` : ''}. Next one in {dueIn < 1 ? 'less than a day' : `${Math.ceil(dueIn)} day${Math.ceil(dueIn) === 1 ? '' : 's'}`}.</div>
      {msg && <div className="mt-3 rounded-2xl bg-[#fdecec] px-4 py-2.5 text-[13px] font-bold text-[#c0392b]">{msg}</div>}
    </AppShell>
  );
}

function RideApp({ ctx, onBack }) {
  const g = ctx.g;
  return (
    <AppShell title="Ride" onBack={onBack}>
      <p className="mb-3 text-[13.5px] font-semibold text-[#566078]">Ride-hail is fast and easy on your legs: {naira(MODES.ridehail.fare)} per trip.</p>
      <div className="space-y-2.5">
        {LOCATION_ORDER.filter((id) => id !== g.loc).map((id) => {
          const l = LOCATIONS[id];
          const { dist } = findPath(g.loc, id);
          return (
            <button key={id} onClick={() => ctx.startTravel(id, 'ridehail')} className="il-btn flex w-full items-center gap-3 rounded-3xl bg-white p-3 text-left shadow-sm">
              <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-[#fff3d6] text-[26px]">{l.emoji}</span>
              <span className="flex-1"><span className="block text-[15px] font-extrabold">{l.name}</span><span className="text-[12.5px] font-semibold text-[#6b7690]">{l.area} · ~{Math.max(2, Math.round(dist / MODES.ridehail.speed))}s</span></span>
              <span className="text-[14px] font-extrabold">{naira(MODES.ridehail.fare)}</span>
            </button>
          );
        })}
      </div>
    </AppShell>
  );
}

function BoutiqueApp({ ctx, onBack }) {
  const g = ctx.g;
  const [tab, setTab] = useState('outfit');
  const [prev, setPrev] = useState(g.look);
  const buyOutfit = (o) => {
    if (g.owned.includes(o.id)) {
      ctx.update((x) => ({ ...x, look: { ...x.look, outfit: o.id } }));
      setPrev((p) => ({ ...p, outfit: o.id }));
      return AudioEngine.sfx('tap');
    }
    if (g.cash < o.price) return ctx.toast(`You need ${naira(o.price)}.`, 'error');
    ctx.update((x) => ({ ...x, cash: x.cash - o.price, owned: [...x.owned, o.id], look: { ...x.look, outfit: o.id } }));
    setPrev((p) => ({ ...p, outfit: o.id }));
    AudioEngine.sfx('coin');
    return ctx.toast(`Bought the ${o.name} outfit!`, 'success');
  };
  const buyHair = (h) => {
    if (g.ownedHair.includes(h.id)) {
      ctx.update((x) => ({ ...x, look: { ...x.look, hair: h.id } }));
      setPrev((p) => ({ ...p, hair: h.id }));
      return AudioEngine.sfx('tap');
    }
    if (g.cash < h.price) return ctx.toast(`You need ${naira(h.price)}.`, 'error');
    ctx.update((x) => ({ ...x, cash: x.cash - h.price, ownedHair: [...x.ownedHair, h.id], look: { ...x.look, hair: h.id } }));
    setPrev((p) => ({ ...p, hair: h.id }));
    AudioEngine.sfx('coin');
    return ctx.toast('Fresh cut! 💈', 'success');
  };
  const setColor = (patch) => {
    ctx.update((x) => ({ ...x, look: { ...x.look, ...patch } }));
    setPrev((p) => ({ ...p, ...patch }));
  };
  return (
    <AppShell title="Boutique" onBack={onBack}>
      <div className="mb-3 h-56 overflow-hidden rounded-3xl" style={{ background: 'linear-gradient(180deg,#e6f0ff,#fff)' }}><AvatarCanvas look={prev} className="h-full w-full" /></div>
      <div className="mb-3 flex gap-2">{[['outfit', '👕 Outfits'], ['hair', '💈 Hair'], ['colour', '🎨 Colours']].map(([k, l]) => <Chip key={k} active={tab === k} onClick={() => setTab(k)}>{l}</Chip>)}</div>
      {tab === 'outfit' && <div className="grid grid-cols-2 gap-2.5">{OUTFITS.map((o) => {
        const own = g.owned.includes(o.id);
        const worn = g.look.outfit === o.id;
        return (
          <button key={o.id} onClick={() => buyOutfit(o)} className="il-btn rounded-3xl bg-white p-3 text-left shadow-sm" style={{ boxShadow: worn ? `inset 0 0 0 2.5px ${GREEN}, 0 2px 10px rgba(20,30,60,.08)` : undefined }}>
            <div className="text-3xl">{o.emoji}</div><div className="text-[15px] font-extrabold">{o.name}</div>
            <div className="text-[13px] font-extrabold" style={{ color: own ? GREEN : NAVY }}>{worn ? 'Wearing' : own ? 'Wear' : naira(o.price)}</div>
          </button>
        );
      })}</div>}
      {tab === 'hair' && <div className="grid grid-cols-2 gap-2.5">{HAIRS.map((h) => {
        const own = g.ownedHair.includes(h.id);
        const worn = g.look.hair === h.id;
        return (
          <button key={h.id} onClick={() => buyHair(h)} className="il-btn rounded-3xl bg-white p-3 text-left shadow-sm" style={{ boxShadow: worn ? `inset 0 0 0 2.5px ${GREEN}, 0 2px 10px rgba(20,30,60,.08)` : undefined }}>
            <div className="text-[15px] font-extrabold">{h.name}</div>
            <div className="text-[13px] font-extrabold" style={{ color: own ? GREEN : NAVY }}>{worn ? 'Wearing' : own ? 'Wear' : h.price ? naira(h.price) : 'Free'}</div>
          </button>
        );
      })}</div>}
      {tab === 'colour' && (
        <div className="space-y-4 rounded-3xl bg-white p-4 shadow-sm">
          <div><div className="mb-2 text-[13px] font-bold text-[#6b7690]">Outfit colour (free)</div><div className="flex flex-wrap gap-3">{OUTFIT_COLORS.map((c, i) => <button key={c} onClick={() => setColor({ color: i })} className="il-btn h-10 w-10 rounded-full" style={{ background: c, boxShadow: g.look.color === i ? `0 0 0 3px #fff, 0 0 0 6px ${GREEN}` : 'inset 0 0 0 2px rgba(0,0,0,.1)' }} />)}</div></div>
          <div><div className="mb-2 text-[13px] font-bold text-[#6b7690]">Hair colour (free)</div><div className="flex flex-wrap gap-3">{HAIR_COLORS.map((c, i) => <button key={c} onClick={() => setColor({ hairColor: i })} className="il-btn h-10 w-10 rounded-full" style={{ background: c, boxShadow: g.look.hairColor === i ? `0 0 0 3px #fff, 0 0 0 6px ${GREEN}` : 'inset 0 0 0 2px rgba(0,0,0,.1)' }} />)}</div></div>
        </div>
      )}
    </AppShell>
  );
}

function ForbesApp({ ctx, onBack }) {
  const [rows, setRows] = useState(null);
  const [rank, setRank] = useState(null);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState('');
  const mine = netWorth(ctx.g);
  useEffect(() => {
    let off = false;
    (async () => {
      const r = await supabase.from('ibadan_scores').select('user_id,username,net_worth,look,area').order('net_worth', { ascending: false }).limit(50);
      if (off) return;
      if (r.error) return setErr(r.error.message);
      setRows(r.data || []);
      const c1 = await supabase.from('ibadan_scores').select('user_id', { count: 'exact', head: true }).gt('net_worth', mine);
      const c2 = await supabase.from('ibadan_scores').select('user_id', { count: 'exact', head: true });
      if (off) return;
      setRank((c1.count || 0) + 1);
      setTotal(c2.count || 0);
      return undefined;
    })();
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const top = (rows || []).slice(0, 3);
  const podium = [top[1], top[0], top[2]];
  const heights = [78, 110, 60];
  const medals = ['#cfd6e0', '#f3c64b', '#d9955a'];
  return (
    <div className="flex h-full flex-col" style={{ background: 'linear-gradient(180deg,#0b2a21 0%,#0b1f19 100%)' }}>
      <div className="flex items-center justify-between px-4 py-3"><button onClick={onBack} className="il-btn flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xl font-bold text-white">‹</button><div className="text-[11px] font-extrabold uppercase tracking-[.25em] text-white/50">Updated just now</div><div className="w-10" /></div>
      <div className="px-4 text-center"><div className="text-[12px] font-extrabold tracking-[.4em] text-[#e9c56a]">IBADAN</div><div className="text-[44px] font-extrabold leading-none text-[#e9c56a]">FORBES</div><div className="mt-1 text-[13px] font-semibold text-white/70">The richest in Ibadan Life · {total} players ranked</div></div>
      {err && <div className="m-4 rounded-2xl bg-red-900/50 p-3 text-[13px] font-bold text-red-100">Couldn't load the leaderboard: {err}. Did you run the latest SQL?</div>}
      <div className="mt-4 flex items-end justify-center gap-3 px-4">
        {podium.map((r, i) => (
          <div key={i} className="flex w-[30%] flex-col items-center">
            {r ? <><FaceBadge look={r.look} size={i === 1 ? 70 : 56} ring={medals[i]} /><div className="mt-1 max-w-full truncate text-[12.5px] font-extrabold text-white">@{r.username}</div><div className="text-[12.5px] font-extrabold text-[#e9c56a]">{naira(r.net_worth)}</div></> : <div className="h-16" />}
            <div className="mt-1 flex w-full items-start justify-center rounded-t-2xl pt-2 text-[22px] font-extrabold text-[#0b1f19]" style={{ height: heights[i], background: medals[i] }}>{i === 1 ? 1 : i === 0 ? 2 : 3}</div>
          </div>
        ))}
      </div>
      <div className="il-scroll flex-1 overflow-y-auto rounded-t-[26px] bg-[#f7f3e8] px-4 pb-24 pt-3">
        {rows === null && !err && <div className="p-6 text-center text-[14px] font-bold text-[#8a8570]">Loading…</div>}
        {(rows || []).slice(3).map((r, i) => (
          <div key={r.user_id} className="flex items-center gap-3 border-b border-black/5 py-2.5">
            <div className="w-6 text-center text-[15px] font-extrabold text-[#8a8570]">{i + 4}</div>
            <FaceBadge look={r.look} size={40} />
            <div className="min-w-0 flex-1"><div className="truncate text-[15px] font-extrabold">@{r.username}</div><div className="text-[12px] font-semibold text-[#8a8570]">{AREAS[r.area]?.name || 'Ibadan'}</div></div>
            <div className="text-[15px] font-extrabold" style={{ color: '#0f6b49' }}>{naira(r.net_worth)}</div>
          </div>
        ))}
      </div>
      <div className="absolute bottom-0 left-0 right-0 flex items-center gap-3 bg-[#14352b] px-4 py-3">
        <FaceBadge look={ctx.g.look} size={42} />
        <div className="flex-1"><div className="text-[10px] font-extrabold uppercase tracking-widest text-white/50">Your rank</div><div className="text-[20px] font-extrabold text-white">{rank ? `#${rank}` : '…'} <span className="text-[13px] font-semibold text-white/60">of {total}</span></div></div>
        <div className="text-[19px] font-extrabold text-[#e9c56a]">{naira(mine)}</div>
      </div>
    </div>
  );
}

function RadioApp({ ctx, onBack }) {
  const [, force] = useState(0);
  const cur = AudioEngine.getStation();
  const on = AudioEngine.isMusic();
  return (
    <AppShell title="Naija Radio" onBack={onBack}>
      <div className="mb-3 rounded-3xl p-4 text-white shadow-lg" style={{ background: 'linear-gradient(135deg,#ff7a45,#e0453a)' }}>
        <div className="text-[13px] font-bold text-white/80">Now playing</div>
        <div className="text-[24px] font-extrabold">{on ? `${STATIONS.find((s) => s.id === cur)?.emoji} ${STATIONS.find((s) => s.id === cur)?.name}` : 'Music is off'}</div>
        <div className="mt-1 text-[12.5px] font-semibold text-white/85">Original grooves made live in your browser, inspired by Nigerian sounds.</div>
      </div>
      <div className="space-y-2.5">
        {STATIONS.map((s) => (
          <button key={s.id} onClick={() => { AudioEngine.setStation(s.id); AudioEngine.setMusic(true); ctx.setMusicOn(true); force((n) => n + 1); }} className="il-btn flex w-full items-center gap-3 rounded-3xl bg-white p-3 text-left shadow-sm" style={{ boxShadow: on && cur === s.id ? `inset 0 0 0 2.5px ${GREEN}, 0 2px 10px rgba(20,30,60,.08)` : undefined }}>
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fff1e8] text-[26px]">{s.emoji}</span>
            <span className="flex-1"><span className="block text-[15px] font-extrabold">{s.name}</span><span className="text-[12.5px] font-semibold text-[#6b7690]">{s.bpm} BPM</span></span>
            {on && cur === s.id && <span className="text-[13px] font-extrabold" style={{ color: GREEN }}>▶ Playing</span>}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <button onClick={() => { const n = !on; AudioEngine.setMusic(n); ctx.setMusicOn(n); force((x) => x + 1); }} className="il-btn rounded-full bg-white py-3.5 text-[14px] font-extrabold shadow-sm">{on ? '🔇 Turn music off' : '🔊 Turn music on'}</button>
        <button onClick={() => { const n = !ctx.sfxOn; AudioEngine.setSfx(n); ctx.setSfxOn(n); }} className="il-btn rounded-full bg-white py-3.5 text-[14px] font-extrabold shadow-sm">{ctx.sfxOn ? '🔔 Sounds on' : '🔕 Sounds off'}</button>
      </div>
    </AppShell>
  );
}

function MeApp({ ctx, onBack }) {
  const g = ctx.g;
  const mood = moodInfo(moodScore(g.needs));
  const L = LOTTERIES.find((l) => l.id === g.lottery);
  return (
    <AppShell title="Me" onBack={onBack}>
      <div className="rounded-3xl bg-white p-5 text-center shadow-sm">
        <div className="mx-auto h-56 w-full max-w-[260px]"><AvatarCanvas look={g.look} className="h-full w-full" /></div>
        <div className="text-[22px] font-extrabold">@{g.username}</div>
        <div className="text-[13px] font-bold" style={{ color: mood.color }}>{mood.face} {mood.label}</div>
        <div className="mt-2 flex flex-wrap justify-center gap-2">{g.traits.map((id) => <span key={id} className="rounded-full bg-[#f0f3f9] px-3 py-1.5 text-[12.5px] font-extrabold">{TRAITS[id]?.emoji} {TRAITS[id]?.name}</span>)}{L && <span className="rounded-full bg-[#fff3d6] px-3 py-1.5 text-[12.5px] font-extrabold">🎲 {L.title.replace('!', '')}</span>}</div>
      </div>
      <div className="mt-3 rounded-3xl bg-white p-4 shadow-sm">
        <div className="mb-2 text-[16px] font-extrabold">Skills</div>
        {SKILLS.map((k) => {
          const info = skillInfo(g.skills[k]);
          return (
            <div key={k} className="mb-3 last:mb-0"><div className="flex justify-between text-[13.5px] font-extrabold"><span>{SKILL_META[k].emoji} {SKILL_META[k].label}</span><span style={{ color: GREEN }}>Level {info.level}</span></div><div className="mt-1 h-2.5 overflow-hidden rounded-full bg-[#e3e8f1]"><div className="h-full rounded-full" style={{ width: `${info.pct}%`, background: 'linear-gradient(90deg,#22b573,#f5a524)' }} /></div></div>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2.5 text-center">
        <div className="rounded-3xl bg-white p-3 shadow-sm"><div className="text-[20px]">🔥</div><div className="text-[17px] font-extrabold">{g.streak.count}</div><div className="text-[11px] font-bold text-[#6b7690]">Day streak</div></div>
        <div className="rounded-3xl bg-white p-3 shadow-sm"><div className="text-[20px]">💰</div><div className="text-[17px] font-extrabold">{fmtBig(netWorth(g))}</div><div className="text-[11px] font-bold text-[#6b7690]">Net worth</div></div>
        <div className="rounded-3xl bg-white p-3 shadow-sm"><div className="text-[20px]">🏠</div><div className="text-[17px] font-extrabold">{AREAS[g.area]?.name}</div><div className="text-[11px] font-bold text-[#6b7690]">Lives in</div></div>
      </div>
      <button onClick={ctx.logout} className="il-btn mt-4 w-full rounded-full bg-white py-3.5 text-[15px] font-extrabold text-[#d6453d] shadow-sm">Log out</button>
    </AppShell>
  );
}

/* ---------------- messages (city chat + friends + private chat) ---------------- */
function MessagesApp({ ctx, onBack }) {
  const [tab, setTab] = useState('friends');
  const [thread, setThread] = useState(null); // friend {userId, username}
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [found, setFound] = useState(null);
  const endRef = useRef(null);
  const { social, others } = ctx;
  const dmList = thread ? ctx.dms.filter((m) => (m.sender_id === thread.userId && m.receiver_id === ctx.user.id) || (m.sender_id === ctx.user.id && m.receiver_id === thread.userId)) : [];
  useEffect(() => {
    if (thread) ctx.markRead(thread.userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread, dmList.length]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [dmList.length, ctx.city.length, tab, thread]);
  const doSearch = async (e) => {
    e.preventDefault();
    const q = search.trim();
    if (q.length < 2) return;
    const r = await supabase.from('ibadan_scores').select('user_id,username,look').ilike('username', q.replace(/[%_]/g, '')).neq('user_id', ctx.user.id).limit(5);
    setFound(r.error ? [] : r.data || []);
  };
  const send = async (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText('');
    if (thread) await ctx.sendDm(thread, t);
    else await ctx.sendCity(t);
  };

  if (thread) {
    return (
      <div className="flex h-full flex-col bg-[#f6f8fc]">
        <div className="flex items-center gap-3 bg-white px-4 py-3 shadow-sm">
          <button onClick={() => setThread(null)} className="il-btn flex h-10 w-10 items-center justify-center rounded-full bg-[#f0f3f9] text-xl font-bold">‹</button>
          <FaceBadge look={thread.look} size={38} />
          <div className="flex-1"><div className="text-[16px] font-extrabold leading-tight">@{thread.username}</div><div className="text-[11.5px] font-bold" style={{ color: others.find((o) => o.userId === thread.userId) ? GREEN : '#9aa3b8' }}>{others.find((o) => o.userId === thread.userId) ? '● Online' : 'Offline'}</div></div>
        </div>
        <div className="il-scroll flex-1 space-y-2 overflow-y-auto p-4">
          {dmList.length === 0 && <p className="pt-10 text-center text-[13.5px] font-semibold text-[#8a93a8]">Private chat with @{thread.username}. Only you two can see this. Say hello! 👋</p>}
          {dmList.map((m) => {
            const mine = m.sender_id === ctx.user.id;
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[80%] rounded-3xl px-4 py-2.5 text-[14.5px] font-semibold" style={{ background: mine ? GREEN : '#fff', color: mine ? '#fff' : NAVY, boxShadow: '0 1px 6px rgba(20,30,60,.08)', borderBottomRightRadius: mine ? 8 : undefined, borderBottomLeftRadius: mine ? undefined : 8 }}>
                  <p className="break-words">{m.message}</p>
                  <div className="mt-0.5 text-right text-[10px] font-bold opacity-60">{fmtClock(new Date(m.created_at).getTime())}</div>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
        <form onSubmit={send} className="flex gap-2 bg-white p-3 shadow-[0_-4px_16px_rgba(20,30,60,.06)]">
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX_CHAT_LEN} placeholder="Message…" className="min-w-0 flex-1 rounded-full bg-[#f0f3f9] px-4 py-3 text-[15px] font-semibold outline-none" />
          <button disabled={!text.trim()} className="il-btn rounded-full px-5 text-[15px] font-extrabold text-white disabled:opacity-40" style={{ background: GREEN }}>Send</button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#f6f8fc]">
      <div className="flex items-center gap-3 bg-white px-4 py-3 shadow-sm">
        <button onClick={onBack} className="il-btn flex h-10 w-10 items-center justify-center rounded-full bg-[#f0f3f9] text-xl font-bold">‹</button>
        <div className="flex-1 text-[19px] font-extrabold">Messages</div>
      </div>
      <div className="flex gap-2 bg-white px-4 pb-3">
        <Chip active={tab === 'friends'} onClick={() => setTab('friends')}>👥 Friends{ctx.totalUnread + social.requests.length > 0 ? ` (${ctx.totalUnread + social.requests.length})` : ''}</Chip>
        <Chip active={tab === 'city'} onClick={() => setTab('city')}>🌆 City chat</Chip>
      </div>
      {tab === 'city' ? (
        <>
          <div className="il-scroll flex-1 space-y-2 overflow-y-auto p-4">
            {ctx.city.length === 0 && <p className="pt-10 text-center text-[13.5px] font-semibold text-[#8a93a8]">No messages yet. Say "E kaaro" to Ibadan!</p>}
            {ctx.city.map((m) => {
              const mine = m.username === ctx.username;
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[82%] rounded-3xl px-4 py-2.5" style={{ background: mine ? GREEN : '#fff', color: mine ? '#fff' : NAVY, boxShadow: '0 1px 6px rgba(20,30,60,.08)' }}>
                    <div className="text-[10.5px] font-extrabold uppercase opacity-70">{m.username}{m.location ? ` · 📍 ${m.location}` : ''}</div>
                    <p className="break-words text-[14.5px] font-semibold">{m.message}</p>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
          <form onSubmit={send} className="flex gap-2 bg-white p-3 shadow-[0_-4px_16px_rgba(20,30,60,.06)]">
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX_CHAT_LEN} placeholder={`Chat as ${ctx.username}`} className="min-w-0 flex-1 rounded-full bg-[#f0f3f9] px-4 py-3 text-[15px] font-semibold outline-none" />
            <button disabled={!text.trim()} className="il-btn rounded-full px-5 text-[15px] font-extrabold text-white disabled:opacity-40" style={{ background: GREEN }}>Send</button>
          </form>
        </>
      ) : (
        <div className="il-scroll flex-1 overflow-y-auto p-4 pb-10">
          {social.requests.length > 0 && (
            <div className="mb-4 rounded-3xl bg-[#fff6e0] p-3">
              <div className="mb-1 text-[13px] font-extrabold text-[#8a5a00]">Friend requests</div>
              {social.requests.map((r) => <div key={r.userId} className="flex items-center justify-between py-1.5"><span className="text-[15px] font-extrabold">@{r.username}</span><button onClick={() => ctx.addFriend(r)} className="il-btn rounded-full px-4 py-2 text-[13px] font-extrabold text-white" style={{ background: GREEN }}>Accept</button></div>)}
            </div>
          )}
          <div className="mb-1 text-[13px] font-extrabold text-[#6b7690]">⭐ FRIENDS ({social.friends.length})</div>
          <div className="space-y-2">
            {social.friends.length === 0 && <p className="rounded-3xl bg-white p-4 text-[13.5px] font-semibold text-[#8a93a8]">No friends yet. Add someone below, or tap a player who is online. You can only message friends, and only the two of you see it.</p>}
            {social.friends.map((f) => {
              const online = others.find((o) => o.userId === f.userId);
              const un = ctx.unread[f.userId] || 0;
              return (
                <button key={f.userId} onClick={() => setThread({ ...f, look: online?.look })} className="il-btn flex w-full items-center gap-3 rounded-3xl bg-white p-3 text-left shadow-sm">
                  <FaceBadge look={online?.look} size={44} ring={online ? GREEN : undefined} />
                  <span className="flex-1"><span className="block text-[15px] font-extrabold">@{f.username}</span><span className="text-[12.5px] font-semibold" style={{ color: online ? GREEN : '#9aa3b8' }}>{online ? `● ${LOCATIONS[online.loc]?.name || 'Online'}` : 'Offline'}</span></span>
                  {un > 0 && <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[#e5484d] px-2 text-[12px] font-extrabold text-white">{un}</span>}
                  <span className="text-[20px]">💬</span>
                </button>
              );
            })}
          </div>
          <div className="mb-1 mt-5 text-[13px] font-extrabold text-[#6b7690]">ADD A FRIEND</div>
          <form onSubmit={doSearch} className="flex gap-2">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by username" className="min-w-0 flex-1 rounded-full bg-white px-4 py-3 text-[15px] font-semibold shadow-sm outline-none" />
            <button className="il-btn rounded-full px-5 text-[14px] font-extrabold text-white" style={{ background: NAVY }}>Find</button>
          </form>
          {found && (
            <div className="mt-2 space-y-2">
              {found.length === 0 && <p className="text-[13px] font-semibold text-[#8a93a8]">No player with that exact username.</p>}
              {found.map((p) => {
                const rel = ctx.relation(p.user_id);
                return (
                  <div key={p.user_id} className="flex items-center gap-3 rounded-3xl bg-white p-3 shadow-sm">
                    <FaceBadge look={p.look} size={40} /><span className="flex-1 text-[15px] font-extrabold">@{p.username}</span>
                    {rel === 'friend' ? <span className="text-[13px] font-extrabold text-[#e0a000]">⭐ Friends</span> : rel === 'sent' ? <span className="text-[12.5px] font-bold text-[#8a93a8]">Requested</span> : <button onClick={() => ctx.addFriend({ userId: p.user_id, username: p.username })} className="il-btn rounded-full px-4 py-2 text-[13px] font-extrabold text-white" style={{ background: GREEN }}>{rel === 'incoming' ? 'Accept' : 'Add'}</button>}
                  </div>
                );
              })}
            </div>
          )}
          <div className="mb-1 mt-5 text-[13px] font-extrabold text-[#6b7690]">🟢 ONLINE NOW ({others.length})</div>
          <div className="space-y-2">
            {others.length === 0 && <p className="text-[13px] font-semibold text-[#8a93a8]">Nobody else is online. Share the game link with your friends!</p>}
            {others.map((p) => {
              const rel = ctx.relation(p.userId);
              return (
                <div key={p.userId} className="flex items-center gap-3 rounded-3xl bg-white p-3 shadow-sm">
                  <FaceBadge look={p.look} size={40} /><span className="flex-1"><span className="block text-[15px] font-extrabold">@{p.username}</span><span className="text-[12px] font-semibold text-[#6b7690]">📍 {LOCATIONS[p.loc]?.name || 'Ibadan'}</span></span>
                  {rel === 'friend' ? <span className="text-[13px] font-extrabold text-[#e0a000]">⭐</span> : rel === 'sent' ? <span className="text-[12.5px] font-bold text-[#8a93a8]">Requested</span> : <button onClick={() => ctx.addFriend(p)} className="il-btn rounded-full px-4 py-2 text-[13px] font-extrabold text-white" style={{ background: GREEN }}>{rel === 'incoming' ? 'Accept' : 'Add'}</button>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function PhoneScreen({ ctx, initialApp, onClose }) {
  const [app, setApp] = useState(initialApp || null);
  const back = () => setApp(null);
  const body = app === 'jobs' ? <JobsApp ctx={ctx} onBack={back} /> : app === 'messages' ? <MessagesApp ctx={ctx} onBack={back} /> : app === 'bank' ? <BankApp ctx={ctx} onBack={back} /> : app === 'ride' ? <RideApp ctx={ctx} onBack={back} /> : app === 'boutique' ? <BoutiqueApp ctx={ctx} onBack={back} /> : app === 'forbes' ? <ForbesApp ctx={ctx} onBack={back} /> : app === 'radio' ? <RadioApp ctx={ctx} onBack={back} /> : app === 'me' ? <MeApp ctx={ctx} onBack={back} /> : null;
  return (
    <div className="il-fade fixed inset-0 z-[60] flex items-start justify-center" style={{ background: 'rgba(15,20,40,.55)', backdropFilter: 'blur(6px)' }}>
      <div className="relative mt-3 flex h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] max-w-md flex-col overflow-hidden rounded-[38px] border-[7px] border-[#12151f] shadow-2xl" style={{ background: 'linear-gradient(180deg,#5b3fd6 0%,#8b3fc4 38%,#f26a4b 78%,#f5a524 100%)' }}>
        {body ? <div className="relative flex-1 overflow-hidden">{body}</div> : (
          <div className="il-scroll flex-1 overflow-y-auto px-5 pb-8 pt-5 text-white">
            <div className="flex items-center justify-between text-[14px] font-extrabold"><span>{fmtClock(ctx.nowMs)}</span><span>4G ▮▮▮</span></div>
            <div className="mt-4 text-[64px] font-extrabold leading-none">{fmtClock(ctx.nowMs).replace(/ (AM|PM)/, '')}</div>
            <div className="mt-1 text-[15px] font-bold text-white/85">{fmtDate(ctx.nowMs)} · Ibadan</div>
            <div className="mt-6 grid grid-cols-4 gap-x-3 gap-y-5">
              {APPS.map((a) => {
                const badge = a.id === 'messages' ? ctx.totalUnread + ctx.social.requests.length : 0;
                return (
                  <button key={a.id} onClick={() => { AudioEngine.sfx('tap'); setApp(a.id); }} className="il-btn flex flex-col items-center gap-1.5">
                    <span className="relative flex h-[62px] w-[62px] items-center justify-center rounded-[18px] text-[30px] shadow-lg" style={{ background: a.bg }}>
                      {a.emoji}
                      {badge > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#ff4d5e] px-1.5 text-[11px] font-extrabold">{badge}</span>}
                    </span>
                    <span className="text-[12px] font-bold">{a.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <button onClick={onClose} className="il-btn absolute right-3 top-3 z-10 rounded-full bg-white px-4 py-2 text-[13px] font-extrabold shadow-lg" style={{ display: app ? 'none' : 'block', color: NAVY }}>✕ Close</button>
        {app && <button onClick={onClose} className="il-btn absolute right-3 top-3 z-10 rounded-full bg-black/40 px-3 py-1.5 text-[12px] font-extrabold text-white">✕</button>}
      </div>
    </div>
  );
}
/* ================================================================== */
/*  ROOM VIEW (3D canvas + sync effects)                               */
/* ================================================================== */
function RoomView({ look, items, sky, power, ghost, selUid, handlersRef, sceneRef, onFail, startCell }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    let sc = null;
    try {
      sc = createRoomScene(canvasRef.current, {
        onTap: (h) => handlersRef.current.onTap(h),
        onError: () => onFail(),
      });
    } catch (e) {
      onFail();
      return undefined;
    }
    sceneRef.current = sc;
    sc.setCell(startCell);
    sc.setLook(look);
    sc.setItems(items);
    sc.setEnv(sky, power);
    return () => {
      sc.destroy();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (sceneRef.current) sceneRef.current.setLook(look);
  }, [look, sceneRef]);
  useEffect(() => {
    if (sceneRef.current) sceneRef.current.setItems(items);
  }, [items, sceneRef]);
  useEffect(() => {
    if (sceneRef.current) sceneRef.current.setEnv(sky, power);
  }, [sky, power, sceneRef]);
  useEffect(() => {
    if (sceneRef.current) sceneRef.current.setGhost(ghost);
  }, [ghost?.type, ghost?.gx, ghost?.gz, ghost?.rot, ghost?.valid, sceneRef]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (sceneRef.current) sceneRef.current.setSelected(selUid);
  }, [selUid, items, sceneRef]);
  return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />;
}

function RoomFallback({ items, onUse, onDoor }) {
  return (
    <div className="il-scroll absolute inset-0 overflow-y-auto px-4 pb-44 pt-44">
      <div className="mb-3 rounded-3xl bg-white/90 p-4 text-[13.5px] font-semibold text-[#566078]">Your phone can't show the 3D room, so here is your room as a list. Tap things to use them. (Buy mode needs 3D.)</div>
      <div className="grid grid-cols-2 gap-2.5">
        {items.filter((i) => FURN[i.type].use).map((i) => (
          <button key={i.uid} onClick={() => onUse(i.uid)} className="il-btn rounded-3xl bg-white p-3 text-left shadow-sm">
            <div className="text-3xl">{FURN[i.type].emoji}</div>
            <div className="text-[14px] font-extrabold">{FURN[i.type].name}</div>
            <div className="text-[12px] font-semibold text-[#6b7690]">{FURN[i.type].use.label}</div>
          </button>
        ))}
        <button onClick={onDoor} className="il-btn rounded-3xl bg-white p-3 text-left shadow-sm"><div className="text-3xl">🚪</div><div className="text-[14px] font-extrabold">Door</div><div className="text-[12px] font-semibold text-[#6b7690]">Go outside</div></button>
      </div>
    </div>
  );
}

function freeCellNear(items, cell) {
  const bl = buildBlocked(items);
  if (!bl[cell.x][cell.z]) return cell;
  const goals = new Set();
  for (let x = 0; x < GRID; x += 1) for (let z = 0; z < GRID; z += 1) if (!bl[x][z]) goals.add(`${x},${z}`);
  const p = bfsPath(bl, cell, goals);
  return p && p.length ? p[p.length - 1] : { x: 0, z: GRID - 1 };
}
function firstValidSpot(items, type, rot) {
  for (let z = GRID - 2; z >= 0; z -= 1) for (let x = 0; x < GRID; x += 1) if (canPlace(items, type, x, z, rot)) return { gx: x, gz: z };
  return { gx: 0, gz: 0 };
}

/* ================================================================== */
/*  ROOT: auth gate + profile loader                                   */
/* ================================================================== */
export default function IbadanLife() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  if (session === undefined) return <Splash text="Loading Ibadan…" />;
  if (!session) return <AuthScreen />;
  return <Loader key={session.user.id} user={session.user} />;
}
function Splash({ text }) {
  return (
    <div className="il-root flex min-h-screen items-center justify-center" style={{ background: 'linear-gradient(180deg,#cfe6ff,#eaf6e4)' }}>
      <style>{GLOBAL_CSS}</style>
      <div className="il-pulse text-[20px] font-extrabold">🏘️ {text}</div>
    </div>
  );
}

function Loader({ user }) {
  const [phase, setPhase] = useState('loading');
  const [err, setErr] = useState('');
  const [uname, setUname] = useState('');
  const [initial, setInitial] = useState(null);
  const [events, setEvents] = useState([]);
  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const metaName = user.user_metadata?.username || (user.email || 'player').split('@')[0];
        const { data, error } = await supabase.from('ibadan_players').select('*').eq('id', user.id).maybeSingle();
        if (error) throw error;
        let name = data?.username || metaName;
        if (!data) {
          let ins = await supabase.from('ibadan_players').insert({ id: user.id, username: name, state: null });
          if (ins.error && ins.error.code === '23505') {
            name = `${name}${rand(100, 999)}`;
            ins = await supabase.from('ibadan_players').insert({ id: user.id, username: name, state: null });
          }
          if (ins.error) throw ins.error;
        }
        const chk = await supabase.from('ibadan_scores').select('user_id').limit(1);
        if (chk.error) throw new Error('The new database tables are missing. Run the latest SQL in Supabase (see the SQL block).');
        if (off) return;
        setUname(name);
        const saved = migrateGame(data?.state);
        if (saved) {
          const now = Date.now();
          const evs = [];
          let g = catchUp(saved, now);
          g.username = name;
          [rollDay, settleWeeks].forEach((fn) => {
            const r = fn(g, now);
            g = r.g;
            evs.push(...r.events);
          });
          setInitial(g);
          setEvents(evs);
          setPhase('play');
        } else setPhase('creator');
      } catch (e) {
        if (!off) {
          setErr(e.message || 'Could not load your profile.');
          setPhase('error');
        }
      }
    })();
    return () => {
      off = true;
    };
  }, [user]);
  if (phase === 'loading') return <Splash text="Loading your life in Ibadan…" />;
  if (phase === 'error') {
    return (
      <div className="il-root flex min-h-screen items-center justify-center p-6" style={{ background: 'linear-gradient(180deg,#cfe6ff,#eaf6e4)' }}>
        <style>{GLOBAL_CSS}</style>
        <div className="max-w-sm rounded-[28px] bg-white p-6 text-center shadow-xl">
          <div className="text-4xl">🛠️</div>
          <h2 className="mt-2 text-[19px] font-extrabold">Database not ready</h2>
          <p className="mt-2 text-[14px] font-semibold text-[#566078]">{err}</p>
          <div className="mt-4 grid gap-2"><BigButton onClick={() => window.location.reload()}>Reload</BigButton><button onClick={() => supabase.auth.signOut()} className="py-2 text-[14px] font-bold text-[#8a93a8]">Log out</button></div>
        </div>
      </div>
    );
  }
  if (phase === 'creator') {
    return (
      <Creator
        initialName={uname}
        onDone={({ look, traits, lottery, area }) => {
          const g = newGame({ look, traits, lottery, area, username: uname });
          setInitial(g);
          setEvents([{ text: `🎲 ${lottery.title} ${lottery.tag}`, type: 'success' }]);
          setPhase('play');
        }}
      />
    );
  }
  return <Play user={user} username={uname} initial={initial} initialEvents={events} />;
}

/* ================================================================== */
/*  THE GAME                                                           */
/* ================================================================== */
function Play({ user, username, initial, initialEvents }) {
  const gRef = useRef(initial);
  const [g, setG] = useState(initial);
  const commit = useCallback((n) => {
    gRef.current = n;
    setG(n);
  }, []);
  const update = useCallback((fn) => commit(fn(gRef.current)), [commit]);

  const [nowMs, setNowMs] = useState(Date.now());
  const [tab, setTab] = useState('home');
  const [phoneApp, setPhoneApp] = useState(null); // null = closed, '' = home screen
  const [toasts, setToasts] = useState([]);
  const [clean, setClean] = useState(false);
  const [encounter, setEncounter] = useState(null);
  const [sheetTarget, setSheetTarget] = useState(null);
  const [busy, setBusy] = useState(null);
  const [travel, setTravel] = useState(null);
  const [roomFailed, setRoomFailed] = useState(() => !webglOk());
  const [musicOn, setMusicOn] = useState(true);
  const [sfxOn, setSfxOn] = useState(true);
  const [buy, setBuy] = useState({ cat: 'sleep', ghost: null, sel: null });

  const toastId = useRef(0);
  const busyRef = useRef(null);
  const travelRef = useRef(null);
  const sceneRef = useRef(null);
  const handlersRef = useRef({});
  const lastTick = useRef(Date.now());
  const trackRef = useRef(null);
  const encRef = useRef(null);
  const buyRef = useRef(buy);
  const tabRef = useRef(tab);
  buyRef.current = buy;
  tabRef.current = tab;
  encRef.current = encounter;

  const mods = useMemo(() => traitMods(g), [g.traits, g.lottery]); // eslint-disable-line react-hooks/exhaustive-deps
  const power = hasPower(g, nowMs);
  const hour = hourOf(nowMs);
  const sky = useMemo(() => skyAt(hour), [Math.floor(hour * 6)]); // eslint-disable-line react-hooks/exhaustive-deps
  const mood = moodInfo(moodScore(g.needs));
  const atHome = g.loc === 'home';

  const toast = useCallback((text, type = 'info') => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text, type }]);
    if (type === 'error') AudioEngine.sfx('error');
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);
  const flush = useCallback((evs) => evs.forEach((e) => toast(e.text, e.type)), [toast]);

  useEffect(() => {
    if (initialEvents && initialEvents.length) flush(initialEvents);
    let m = true;
    try {
      m = window.localStorage.getItem('il_music') !== '0';
    } catch (e) {
      /* ignore */
    }
    setMusicOn(m);
    AudioEngine.setMusic(false);
    const unlock = () => {
      if (m) AudioEngine.setMusic(true);
      else AudioEngine.unlock();
      window.removeEventListener('pointerdown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      AudioEngine.setMusic(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const changeMusic = (on) => {
    setMusicOn(on);
    AudioEngine.setMusic(on);
    try {
      window.localStorage.setItem('il_music', on ? '1' : '0');
    } catch (e) {
      /* ignore */
    }
  };

  /* ---------- effects of actions ---------- */
  const reasonFor = useCallback((eff) => blockReason(eff, gRef.current, { mods: traitMods(gRef.current), power: hasPower(gRef.current, Date.now()), now: Date.now() }), []);

  const finishBusy = useCallback(() => {
    const b = busyRef.current;
    if (!b) return;
    busyRef.current = null;
    setBusy(null);
    if (sceneRef.current) sceneRef.current.setPose('idle');
    const cur = gRef.current;
    const m = traitMods(cur);
    const now = Date.now();
    const why = reasonFor({ ...b.eff, secs: 0, minEnergy: 0, sleep: b.eff.sleep ? 0 : undefined });
    if (why && b.eff.cost && cur.cash < b.eff.cost) {
      toast(why, 'error');
      return;
    }
    const res = applyEffect(cur, b.eff, m, now);
    const cl = claimTasks(res.g);
    commit({ ...cl.g, lastSeen: now });
    const bits = [];
    if (b.eff.cost) bits.push(`-${naira(Math.round(b.eff.cost * (b.eff.eat ? m.foodDiscount : 1)))}`);
    if (res.earned !== 0) bits.push(`${res.earned > 0 ? '+' : ''}${naira(res.earned)}`);
    toast(`${b.icon} ${b.label}${bits.length ? ' · ' + bits.join(' ') : ''}${res.note ? '. ' + res.note : ''}`, res.earned > 0 ? 'success' : 'info');
    if (res.earned > 0) AudioEngine.sfx('coin');
    else if (b.eff.eat) AudioEngine.sfx('eat');
    else AudioEngine.sfx('tap');
    res.levelUps.forEach((k) => {
      toast(`📈 ${SKILL_META[k].label} reached level ${skillLevel(res.g.skills[k])}!`, 'success');
      AudioEngine.sfx('level');
    });
    flush(cl.events);
  }, [commit, flush, reasonFor, toast]);

  const startAction = useCallback((eff, meta) => {
    if (busyRef.current) {
      toast("You're busy right now.", 'error');
      return false;
    }
    if (travelRef.current) {
      toast('You are on the road. Wait until you arrive.', 'error');
      return false;
    }
    const why = reasonFor(eff);
    if (why) {
      toast(why, 'error');
      return false;
    }
    if (eff.special === 'radio') {
      setPhoneApp('radio');
      return true;
    }
    if (eff.special === 'gen') {
      toast(hasPower(gRef.current, Date.now()) && gRef.current.nepaUntil ? '⚡ The generator is running. You have light!' : '⚡ The generator is ready for when NEPA strikes.', 'success');
      return true;
    }
    if (typeof eff.special === 'string' && eff.special.startsWith('app:')) {
      setPhoneApp(eff.special.slice(4));
      return true;
    }
    const now = Date.now();
    busyRef.current = { start: now, end: now + (eff.secs || 1) * 1000, eff, icon: meta.icon, label: meta.label };
    setBusy({ start: now, end: now + (eff.secs || 1) * 1000, icon: meta.icon, label: meta.label, sleep: !!eff.sleep });
    if (sceneRef.current && meta.pose) sceneRef.current.setPose(meta.pose, meta.uid);
    return true;
  }, [reasonFor, toast]);

  const doPlaceAction = useCallback((id) => {
    const a = ACTIONS[id];
    startAction(a, { icon: a.icon, label: a.label });
  }, [startAction]);

  const useFurniture = useCallback((uid, instant) => {
    const item = gRef.current.items.find((i) => i.uid === uid);
    if (!item) return;
    const def = FURN[item.type];
    if (!def.use) {
      toast(`${def.emoji} ${def.name}`);
      return;
    }
    const eff = { ...def.use, power: def.use.power || def.power };
    if (!['radio', 'gen'].includes(eff.special)) {
      const why = reasonFor(eff);
      if (why) {
        toast(why, 'error');
        return;
      }
    }
    const go = () => startAction(eff, { icon: def.emoji, label: def.use.label, pose: eff.sleep ? 'sleep' : 'busy', uid });
    if (instant || !sceneRef.current) {
      go();
      return;
    }
    if (busyRef.current) {
      toast("You're busy right now.", 'error');
      return;
    }
    sceneRef.current.walkToItem(uid, (ok) => {
      if (ok) go();
    });
  }, [reasonFor, startAction, toast]);

  /* ---------- room taps + buy mode ---------- */
  const afterItemsChange = useCallback((items) => {
    const sc = sceneRef.current;
    if (!sc) return;
    const cell = sc.cell();
    const free = freeCellNear(items, cell);
    if (free.x !== cell.x || free.z !== cell.z) sc.setCell(free);
  }, []);
  const setGhostPos = (hit) => {
    const b = buyRef.current;
    if (!b.ghost) return;
    const f = footprint(b.ghost);
    const gx = clamp(hit.gx - Math.floor(f.w / 2), 0, GRID - f.w);
    const gz = clamp(hit.gz - Math.floor(f.d / 2), 0, GRID - f.d);
    const valid = canPlace(gRef.current.items, b.ghost.type, gx, gz, b.ghost.rot, b.ghost.moveUid);
    setBuy({ ...b, ghost: { ...b.ghost, gx, gz, valid } });
  };
  handlersRef.current.onTap = (hit) => {
    if (tabRef.current === 'buy') {
      const b = buyRef.current;
      if (b.ghost) {
        if (hit.kind === 'floor' || hit.kind === 'item') setGhostPos(hit);
        return;
      }
      if (hit.kind === 'item') setBuy({ ...b, sel: hit.uid });
      else setBuy({ ...b, sel: null });
      return;
    }
    if (busyRef.current) {
      toast("You're busy right now.", 'error');
      return;
    }
    if (hit.kind === 'door') {
      setTab('map');
      return;
    }
    if (hit.kind === 'floor') {
      if (sceneRef.current) sceneRef.current.walkToCell(hit.gx, hit.gz);
      return;
    }
    if (hit.kind === 'item') useFurniture(hit.uid);
  };

  const pickFurniture = (type) => {
    const def = FURN[type];
    const cur = gRef.current;
    if (cur.cash < def.price) {
      toast(`You need ${naira(def.price)} for the ${def.name}.`, 'error');
      return;
    }
    const spot = firstValidSpot(cur.items, type, 0);
    setBuy((b) => ({ ...b, sel: null, ghost: { type, gx: spot.gx, gz: spot.gz, rot: 0, valid: canPlace(cur.items, type, spot.gx, spot.gz, 0), moveUid: null, orig: null } }));
    AudioEngine.sfx('tap');
  };
  const rotateGhost = () => {
    const b = buyRef.current;
    if (!b.ghost) return;
    const rot = (b.ghost.rot + 1) % 4;
    const f = footprint({ type: b.ghost.type, rot });
    const gx = clamp(b.ghost.gx, 0, GRID - f.w);
    const gz = clamp(b.ghost.gz, 0, GRID - f.d);
    setBuy({ ...b, ghost: { ...b.ghost, rot, gx, gz, valid: canPlace(gRef.current.items, b.ghost.type, gx, gz, rot, b.ghost.moveUid) } });
  };
  const placeGhost = () => {
    const b = buyRef.current;
    const gh = b.ghost;
    if (!gh) return;
    if (!canPlace(gRef.current.items, gh.type, gh.gx, gh.gz, gh.rot, gh.moveUid)) {
      toast("It doesn't fit there.", 'error');
      return;
    }
    const def = FURN[gh.type];
    update((x) => {
      const item = { uid: gh.moveUid || uid(), type: gh.type, gx: gh.gx, gz: gh.gz, rot: gh.rot };
      const items = [...x.items, item];
      return { ...x, cash: gh.moveUid ? x.cash : x.cash - def.price, items };
    });
    afterItemsChange([...gRef.current.items]);
    AudioEngine.sfx(gh.moveUid ? 'tap' : 'coin');
    toast(gh.moveUid ? `Moved the ${def.name}.` : `Bought the ${def.name} · -${naira(def.price)}`, 'success');
    setBuy({ ...b, ghost: null, sel: null });
  };
  const cancelGhost = () => {
    const b = buyRef.current;
    if (b.ghost?.orig) update((x) => ({ ...x, items: [...x.items, b.ghost.orig] }));
    setBuy({ ...b, ghost: null });
  };
  const moveSel = (uidSel) => {
    const it = gRef.current.items.find((i) => i.uid === uidSel);
    if (!it) return;
    const rest = gRef.current.items.filter((i) => i.uid !== uidSel);
    update((x) => ({ ...x, items: rest }));
    setBuy({ ...buyRef.current, sel: null, ghost: { type: it.type, gx: it.gx, gz: it.gz, rot: it.rot, valid: true, moveUid: it.uid, orig: it } });
  };
  const rotateSel = (uidSel) => {
    const it = gRef.current.items.find((i) => i.uid === uidSel);
    if (!it) return;
    const rot = (it.rot + 1) % 4;
    const f = footprint({ type: it.type, rot });
    const gx = clamp(it.gx, 0, GRID - f.w);
    const gz = clamp(it.gz, 0, GRID - f.d);
    if (!canPlace(gRef.current.items, it.type, gx, gz, rot, it.uid)) {
      toast("It doesn't fit when turned.", 'error');
      return;
    }
    update((x) => ({ ...x, items: x.items.map((i) => (i.uid === uidSel ? { ...i, rot, gx, gz } : i)) }));
    AudioEngine.sfx('tap');
  };
  const sellSel = (uidSel) => {
    const it = gRef.current.items.find((i) => i.uid === uidSel);
    if (!it) return;
    const refund = Math.floor(FURN[it.type].price * 0.5);
    update((x) => ({ ...x, cash: x.cash + refund, items: x.items.filter((i) => i.uid !== uidSel) }));
    AudioEngine.sfx('coin');
    toast(`Sold the ${FURN[it.type].name} · +${naira(refund)}`, 'success');
    setBuy({ ...buyRef.current, sel: null });
  };

  /* ---------- travel ---------- */
  const startTravel = (destId, modeKey) => {
    const cur = gRef.current;
    const mode = MODES[modeKey];
    setSheetTarget(null);
    setPhoneApp(null);
    if (travelRef.current || destId === cur.loc) return;
    if (busyRef.current) return toast("You're busy right now.", 'error');
    if (cur.needs.energy <= 0) return toast("You're too exhausted to move. Eat something first!", 'error');
    if (cur.cash < mode.fare) return toast(`You can't afford the ${naira(mode.fare)} fare.`, 'error');
    const { pts, dist } = findPath(cur.loc, destId);
    const cost = mode.energy(dist);
    commit({ ...cur, cash: cur.cash - mode.fare, needs: { ...cur.needs, energy: clamp(cur.needs.energy - cost) } });
    const dur = Math.max(1800, (dist / mode.speed) * 1000);
    travelRef.current = { pts, dist, start: Date.now(), dur, mode: modeKey, dest: destId };
    setTravel({ x: pts[0].x, y: pts[0].y, mode: modeKey, dest: destId });
    setTab('map');
    toast(`${mode.icon} Heading to ${LOCATIONS[destId].name}${mode.fare ? ` (-${naira(mode.fare)})` : ''}`);
    if (sceneRef.current) sceneRef.current.setPose('idle');
    AudioEngine.sfx('tap');
    return undefined;
  };
  const goMap = (dest) => {
    setPhoneApp(null);
    setTab('map');
    if (dest && dest !== gRef.current.loc) setSheetTarget(dest);
  };
  const finishTravel = () => {
    const tr = travelRef.current;
    if (!tr) return;
    travelRef.current = null;
    setTravel(null);
    const cur = gRef.current;
    const visits = cur.daily.visits.includes(tr.dest) ? cur.daily.visits : [...cur.daily.visits, tr.dest];
    commit({ ...cur, loc: tr.dest, daily: { ...cur.daily, visits } });
    if (trackRef.current) trackRef.current();
    setTab('home');
    toast(`📍 Arrived at ${LOCATIONS[tr.dest].name}`, 'success');
    const chance = tr.mode === 'walk' ? 0.12 : 0.35;
    if (Math.random() < chance) setEncounter({ scenario: pick(SCENARIOS.filter((s) => s.modes.includes(tr.mode))), outcome: null });
  };
  const resolveEncounter = (choice) => {
    const o = choice.resolve();
    update((x) => ({ ...x, cash: Math.max(0, x.cash + o.cash), needs: { ...x.needs, energy: clamp(x.needs.energy + o.energy), fun: clamp(x.needs.fun + o.fun) } }));
    setEncounter((e) => ({ ...e, outcome: o }));
  };

  /* ---------- the master clock ---------- */
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setNowMs(now);
      const dt = clamp((now - lastTick.current) / 1000, 0, 30);
      lastTick.current = now;
      // travel progress
      const tr = travelRef.current;
      if (tr) {
        const f = clamp((now - tr.start) / tr.dur, 0, 1);
        let want = f * tr.dist;
        let pos = tr.pts[tr.pts.length - 1];
        for (let i = 0; i < tr.pts.length - 1; i += 1) {
          const a = tr.pts[i];
          const b = tr.pts[i + 1];
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          if (want <= len) {
            pos = { x: a.x + ((b.x - a.x) * want) / (len || 1), y: a.y + ((b.y - a.y) * want) / (len || 1) };
            break;
          }
          want -= len;
        }
        setTravel({ x: pos.x, y: pos.y, mode: tr.mode, dest: tr.dest });
        if (f >= 1) finishTravel();
      }
      // pausing needs while an encounter is open is not needed: needs decay slowly
      let cur = gRef.current;
      const m = traitMods(cur);
      const evs = [];
      const before = cur.needs;
      cur = { ...cur, needs: decayNeeds(cur.needs, dt, m), lastSeen: now };
      if (cur.nepaUntil && now >= cur.nepaUntil) {
        cur.nepaUntil = 0;
        evs.push({ text: '💡 Light is back! "Up NEPA!"', type: 'success' });
      } else if (!cur.nepaUntil && !encRef.current && Math.random() < dt / 700) {
        cur.nepaUntil = now + rand(90, 220) * 1000;
        evs.push({ text: cur.items.some((i) => i.type === 'generator') ? '🔦 NEPA took light, but your generator kicked in!' : '🔦 NEPA took light! TV, fan and laptop are off.', type: 'error' });
        AudioEngine.sfx('power');
      }
      [rollDay, settleWeeks, claimTasks].forEach((fn) => {
        const r = fn(cur, now);
        cur = r.g;
        evs.push(...r.events);
      });
      NEED_KEYS.forEach((k) => {
        if (before[k] >= 20 && cur.needs[k] < 20) evs.push({ text: `${NEED_META[k].emoji} Your ${NEED_META[k].label.toLowerCase()} is very low!`, type: 'error' });
      });
      commit(cur);
      if (evs.length) flush(evs);
      // action progress
      const b = busyRef.current;
      if (b && now >= b.end) finishBusy();
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- saving ---------- */
  const saveNow = useCallback(async () => {
    const cur = gRef.current;
    await supabase.from('ibadan_players').upsert({ id: user.id, username, state: cur, updated_at: new Date().toISOString() });
  }, [user.id, username]);
  const saveScore = useCallback(async () => {
    const cur = gRef.current;
    await supabase.from('ibadan_scores').upsert({ user_id: user.id, username, net_worth: netWorth(cur), look: cur.look, area: cur.area, updated_at: new Date().toISOString() });
  }, [user.id, username]);
  useEffect(() => {
    saveNow();
    saveScore();
    const a = setInterval(saveNow, 15000);
    const b = setInterval(saveScore, 45000);
    const onHide = () => {
      if (document.hidden) {
        saveNow();
        saveScore();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', saveNow);
    return () => {
      clearInterval(a);
      clearInterval(b);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', saveNow);
    };
  }, [saveNow, saveScore]);
  const logout = async () => {
    await saveNow();
    await saveScore();
    await supabase.auth.signOut();
  };

  /* ---------- presence (who is online) ---------- */
  const [others, setOthers] = useState([]);
  useEffect(() => {
    const ch = supabase.channel('ibadan-world', { config: { presence: { key: user.id } } });
    const payload = () => ({ username, loc: gRef.current.loc, look: gRef.current.look });
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
      if (status === 'SUBSCRIBED') ch.track(payload());
    });
    const keep = setInterval(() => ch.track(payload()), 20000);
    return () => {
      clearInterval(keep);
      trackRef.current = null;
      supabase.removeChannel(ch);
    };
  }, [user.id, username]);
  const counts = useMemo(() => {
    const c = {};
    others.forEach((o) => {
      c[o.loc] = (c[o.loc] || 0) + 1;
    });
    return c;
  }, [others]);

  /* ---------- friends ---------- */
  const [friendRows, setFriendRows] = useState([]);
  const fetchFriends = useCallback(async () => {
    const { data } = await supabase.from('ibadan_friends').select('*').or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);
    setFriendRows(data || []);
  }, [user.id]);
  useEffect(() => {
    fetchFriends();
    const id = setInterval(fetchFriends, 15000);
    return () => clearInterval(id);
  }, [fetchFriends]);
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
    inc.forEach((name, id) => (out.has(id) ? friends.push({ userId: id, username: name }) : requests.push({ userId: id, username: name })));
    out.forEach((name, id) => {
      if (!inc.has(id)) pending.push({ userId: id, username: name });
    });
    return { friends, requests, pending };
  }, [friendRows, user.id]);
  const relation = (id) => (social.friends.some((f) => f.userId === id) ? 'friend' : social.pending.some((f) => f.userId === id) ? 'sent' : social.requests.some((f) => f.userId === id) ? 'incoming' : 'none');
  const addFriend = async (p) => {
    const { error } = await supabase.from('ibadan_friends').insert({ user_id: user.id, friend_id: p.userId, user_username: username, friend_username: p.username });
    if (error) return toast(error.code === '23505' ? 'Request already sent.' : error.message, 'error');
    const was = social.requests.some((r) => r.userId === p.userId);
    toast(was ? `🎉 You and @${p.username} are now friends!` : `Friend request sent to @${p.username}.`, 'success');
    update((x) => ({ ...x, needs: { ...x.needs, social: clamp(x.needs.social + 8) } }));
    fetchFriends();
    return undefined;
  };

  /* ---------- city chat + private chat ---------- */
  const [city, setCity] = useState([]);
  const [dms, setDms] = useState([]);
  const [lastRead, setLastRead] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem(`il_read_${user.id}`) || '{}');
    } catch (e) {
      return {};
    }
  });
  const mergeById = (a, b) => {
    const m = new Map();
    [...a, ...b].forEach((x) => m.set(x.id, x));
    return Array.from(m.values()).sort((x, y) => new Date(x.created_at) - new Date(y.created_at)).slice(-200);
  };
  const lastCityBonus = useRef(0);
  useEffect(() => {
    let off = false;
    const ch = supabase
      .channel('public:ibadan_life_chats')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ibadan_life_chats' }, (p) => setCity((prev) => mergeById(prev, [p.new])))
      .subscribe();
    supabase.from('ibadan_life_chats').select('*').order('created_at', { ascending: false }).limit(50).then(({ data }) => {
      if (!off && data) setCity((prev) => mergeById(prev, data.slice().reverse()));
    });
    const dch = supabase
      .channel(`dms_${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ibadan_dms' }, (p) => {
        const m = p.new;
        if (m.sender_id !== user.id && m.receiver_id !== user.id) return;
        setDms((prev) => mergeById(prev, [m]));
        if (m.receiver_id === user.id) {
          AudioEngine.sfx('msg');
          toast(`💬 @${m.sender_username}: ${m.message.slice(0, 60)}`);
        }
      })
      .subscribe();
    supabase.from('ibadan_dms').select('*').or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`).order('created_at', { ascending: false }).limit(200).then(({ data }) => {
      if (!off && data) setDms((prev) => mergeById(prev, data.slice().reverse()));
    });
    return () => {
      off = true;
      supabase.removeChannel(ch);
      supabase.removeChannel(dch);
    };
  }, [user.id, toast]);
  const sendCity = async (message) => {
    const { error } = await supabase.from('ibadan_life_chats').insert([{ username, message: message.slice(0, MAX_CHAT_LEN), location: LOCATIONS[gRef.current.loc]?.name }]);
    if (error) return toast('Message failed: ' + error.message, 'error');
    update((x) => ({ ...x, daily: { ...x.daily, chat: x.daily.chat + 1 }, needs: Date.now() - lastCityBonus.current > 20000 ? { ...x.needs, social: clamp(x.needs.social + 4) } : x.needs }));
    lastCityBonus.current = Date.now();
    return undefined;
  };
  const sendDm = async (friend, message) => {
    const { data, error } = await supabase.from('ibadan_dms').insert({ sender_id: user.id, receiver_id: friend.userId, sender_username: username, message: message.slice(0, 500) }).select().single();
    if (error) return toast('Could not send. You can only message friends who accepted your request.', 'error');
    setDms((prev) => mergeById(prev, [data]));
    update((x) => ({ ...x, daily: { ...x.daily, chat: x.daily.chat + 1 }, needs: { ...x.needs, social: clamp(x.needs.social + 2) } }));
    return undefined;
  };
  const markRead = (friendId) => {
    const latest = dms.filter((m) => m.sender_id === friendId).map((m) => m.created_at).sort().pop();
    if (!latest || lastRead[friendId] === latest) return;
    const next = { ...lastRead, [friendId]: latest };
    setLastRead(next);
    try {
      window.localStorage.setItem(`il_read_${user.id}`, JSON.stringify(next));
    } catch (e) {
      /* ignore */
    }
  };
  const unread = useMemo(() => {
    const u = {};
    dms.forEach((m) => {
      if (m.receiver_id !== user.id) return;
      const lr = lastRead[m.sender_id];
      if (!lr || new Date(m.created_at) > new Date(lr)) u[m.sender_id] = (u[m.sender_id] || 0) + 1;
    });
    return u;
  }, [dms, lastRead, user.id]);
  const totalUnread = Object.values(unread).reduce((s, n) => s + n, 0);

  const ctx = {
    g, mods, nowMs, update, toast, user, username, social, others, relation, addFriend, city, sendCity, dms, sendDm, unread, totalUnread, markRead,
    startTravel, goMap, setMusicOn: changeMusic, sfxOn, setSfxOn, logout, reasonFor, doPlaceAction,
  };

  /* ---------- derived UI ---------- */
  const tasks = tasksFor(g.daily.ymd).map((t) => ({ ...t, ok: g.daily.claimed.includes(t.id), now: t.done(g.daily) }));
  const hereNames = others.filter((o) => o.loc === g.loc).map((o) => `@${o.username}`);
  const progress = busy ? clamp(((nowMs - busy.start) / (busy.end - busy.start)) * 100, 0, 100) : 0;
  const showRoom = atHome && !roomFailed;
  const pathInfo = sheetTarget ? findPath(g.loc, sheetTarget) : null;
  const buyDef = buy.ghost ? FURN[buy.ghost.type] : null;
  const selItem = buy.sel ? g.items.find((i) => i.uid === buy.sel) : null;
  const ghostForScene = buy.ghost ? { type: buy.ghost.type, gx: buy.ghost.gx, gz: buy.ghost.gz, rot: buy.ghost.rot, valid: buy.ghost.valid } : null;
  const startCell = useMemo(() => freeCellNear(g.items, { x: 2, z: 1 }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const bottomTab = (id, icon, label, onClick) => (
    <button key={id} onClick={() => { AudioEngine.sfx('tap'); onClick(); }} className="il-btn flex flex-1 flex-col items-center gap-0.5 rounded-full py-2.5" style={{ background: tab === id && !phoneApp && phoneApp !== '' ? NAVY : 'transparent', color: tab === id && !phoneApp && phoneApp !== '' ? '#fff' : '#5b6578' }}>
      <span className="text-[22px] leading-none">{icon}</span>
      <span className="text-[12.5px] font-extrabold">{label}</span>
    </button>
  );

  return (
    <div className="il-root fixed inset-0 overflow-hidden select-none" style={{ background: `linear-gradient(180deg, ${sky.top} 0%, ${sky.bg} 100%)`, transition: 'background 3s' }}>
      <style>{GLOBAL_CSS}</style>
      <Toasts toasts={toasts} />

      {/* ---- world layer ---- */}
      {atHome && showRoom && (
        <RoomView look={g.look} items={g.items} sky={sky} power={power} ghost={ghostForScene} selUid={buy.sel} handlersRef={handlersRef} sceneRef={sceneRef} onFail={() => setRoomFailed(true)} startCell={startCell} />
      )}
      {atHome && roomFailed && tab !== 'map' && <RoomFallback items={g.items} onUse={(uidx) => useFurniture(uidx, true)} onDoor={() => setTab('map')} />}
      {!atHome && tab !== 'map' && <PlaceView loc={g.loc} ctx={ctx} hereNames={hereNames} />}
      {tab === 'map' && <MapScreen loc={g.loc} onSelect={(id) => (id === g.loc ? setTab('home') : !travelRef.current && setSheetTarget(id))} travel={travel} look={g.look} counts={counts} />}
      {!power && <div className="pointer-events-none absolute inset-0 z-10" style={{ background: 'rgba(5,8,25,.38)' }} />}

      {/* ---- HUD ---- */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 mx-auto max-w-lg px-3 pt-3">
        <div className="il-glass pointer-events-auto flex items-center gap-2 rounded-full py-2 pl-4 pr-2">
          <span className="text-[20px]">{clockIcon(hour)}</span>
          <span className="text-[16px] font-extrabold">{fmtClock(nowMs)}</span>
          <span className="mx-1 h-5 w-px bg-[#d9dfeb]" />
          <span className="text-[15px] font-extrabold" style={{ color: mood.color }}>{mood.face} {mood.label}</span>
          <span className="flex-1" />
          <button onClick={() => changeMusic(!musicOn)} className="il-btn flex h-9 w-9 items-center justify-center rounded-full text-[18px]" aria-label="Music">{musicOn ? '🔊' : '🔇'}</button>
          <span className="rounded-full bg-[#f0f3f9] px-3.5 py-2 text-[15px] font-extrabold">{naira(g.cash)}</span>
        </div>
        <div className="pointer-events-auto mt-2 flex flex-wrap gap-2">
          <span className="il-glass rounded-full px-3 py-1.5 text-[12.5px] font-extrabold">📅 {fmtDate(nowMs)}</span>
          <span className="il-glass rounded-full px-3 py-1.5 text-[12.5px] font-extrabold" style={{ color: GREEN }}>● {others.length + 1} online</span>
          {g.nepaUntil > nowMs && <span className="rounded-full bg-[#1f2433] px-3 py-1.5 text-[12.5px] font-extrabold text-[#ffd23f]">{power ? '⚡ Generator on' : '🔦 NEPA took light'}</span>}
          {g.streak.count > 1 && <span className="il-glass rounded-full px-3 py-1.5 text-[12.5px] font-extrabold">🔥 {g.streak.count}-day streak</span>}
        </div>
        {!clean && tab !== 'map' && tab !== 'buy' && (
          <div className="pointer-events-auto mt-2 space-y-2">
            {tasks.map((t) => (
              <div key={t.id} className="il-glass flex items-center gap-3 rounded-full py-2 pl-2 pr-4" style={{ opacity: t.ok ? 0.65 : 1, width: 'fit-content', maxWidth: '88%' }}>
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-[17px]" style={{ background: t.ok ? GREEN : '#eaf0ff', color: t.ok ? '#fff' : NAVY }}>{t.ok ? '✓' : '🎯'}</span>
                <span className="min-w-0"><span className="block text-[13.5px] font-extrabold leading-tight" style={{ textDecoration: t.ok ? 'line-through' : 'none' }}>{t.label} <span className="font-bold text-[#9aa3b8]">+{naira(TASK_REWARD)}</span></span><span className="block truncate text-[11.5px] font-semibold text-[#6b7690]">{t.hint}</span></span>
              </div>
            ))}
          </div>
        )}
        {tab !== 'map' && tab !== 'buy' && (
          <button onClick={() => setClean((c) => !c)} className="il-glass il-btn pointer-events-auto mt-2 rounded-full px-3.5 py-1.5 text-[12.5px] font-extrabold">{clean ? '⌄ Show tasks' : '⌃ Clean screen'}</button>
        )}
      </div>

      {/* ---- busy bar ---- */}
      {busy && (
        <div className="il-fade il-glass absolute left-1/2 z-30 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 rounded-3xl p-3" style={{ bottom: 232 }}>
          <div className="flex items-center gap-3"><span className="text-[24px]">{busy.sleep ? '💤' : busy.icon}</span><span className="flex-1 text-[14px] font-extrabold">{busy.label}…</span><span className="text-[13px] font-extrabold text-[#6b7690]">{Math.max(0, Math.ceil((busy.end - nowMs) / 1000))}s</span></div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#e3e8f1]"><div className="h-full rounded-full" style={{ width: `${progress}%`, background: GREEN, transition: 'width .25s linear' }} /></div>
        </div>
      )}

      {/* ---- buy mode controls ---- */}
      {tab === 'buy' && atHome && (
        <>
          <div className="pointer-events-none absolute left-0 right-0 z-20 mx-auto flex max-w-lg justify-between px-3" style={{ top: 118 }}>
            <span className="il-glass rounded-full px-4 py-2 text-[14px] font-extrabold">🛍️ Buy mode</span>
            <button onClick={() => { setBuy({ cat: buy.cat, ghost: null, sel: null }); setTab('home'); }} className="il-glass il-btn pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full text-[18px] font-bold">✕</button>
          </div>
          {buy.ghost && (
            <div className="il-fade il-glass absolute left-1/2 z-30 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 rounded-3xl p-3" style={{ bottom: 100 }}>
              <div className="flex items-center gap-3"><span className="text-[26px]">{buyDef.emoji}</span><div className="flex-1"><div className="text-[15px] font-extrabold">{buyDef.name}</div><div className="text-[12px] font-bold" style={{ color: buy.ghost.valid ? GREEN : '#d6453d' }}>{buy.ghost.valid ? (buy.ghost.moveUid ? 'Tap the floor to move it' : `Tap the floor to position it · ${naira(buyDef.price)}`) : "It doesn't fit there"}</div></div></div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <button onClick={cancelGhost} className="il-btn rounded-full bg-[#f0f3f9] py-3 text-[14px] font-extrabold">Cancel</button>
                <button onClick={rotateGhost} className="il-btn rounded-full bg-[#f0f3f9] py-3 text-[14px] font-extrabold">⟳ Turn</button>
                <button onClick={placeGhost} disabled={!buy.ghost.valid} className="il-btn rounded-full py-3 text-[14px] font-extrabold text-white disabled:opacity-40" style={{ background: GREEN }}>✓ Place</button>
              </div>
            </div>
          )}
          {!buy.ghost && selItem && (
            <div className="il-fade il-glass absolute left-1/2 z-30 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 rounded-3xl p-3" style={{ bottom: 100 }}>
              <div className="flex items-center gap-3"><span className="text-[26px]">{FURN[selItem.type].emoji}</span><div className="flex-1 text-[15px] font-extrabold">{FURN[selItem.type].name}</div><button onClick={() => setBuy({ ...buy, sel: null })} className="text-[18px] font-bold text-[#8a93a8]">✕</button></div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <button onClick={() => moveSel(selItem.uid)} className="il-btn rounded-full bg-[#f0f3f9] py-3 text-[14px] font-extrabold">✋ Move</button>
                <button onClick={() => rotateSel(selItem.uid)} className="il-btn rounded-full bg-[#f0f3f9] py-3 text-[14px] font-extrabold">⟳ Turn</button>
                <button onClick={() => sellSel(selItem.uid)} className="il-btn rounded-full py-3 text-[14px] font-extrabold text-white" style={{ background: '#e5484d' }}>Sell {fmtBig(Math.floor(FURN[selItem.type].price * 0.5))}</button>
              </div>
            </div>
          )}
          {!buy.ghost && !selItem && (
            <div className="il-sheet il-glass absolute bottom-0 left-0 right-0 z-30 mx-auto max-w-lg rounded-t-[28px] px-4 pb-24 pt-3" style={{ background: '#fff' }}>
              <div className="mb-2 flex items-center justify-between"><h2 className="text-[24px] font-extrabold">Catalogue</h2><span className="rounded-full bg-[#f0f3f9] px-3 py-1.5 text-[12px] font-bold text-[#6b7690]">Tap furniture in your room to move or sell</span></div>
              <div className="il-scroll flex gap-2 overflow-x-auto pb-3">{FURN_CATS.map((c) => <Chip key={c.id} active={buy.cat === c.id} onClick={() => setBuy({ ...buy, cat: c.id })}>{c.emoji} {c.name}</Chip>)}</div>
              <div className="il-scroll flex gap-3 overflow-x-auto pb-1">
                {Object.entries(FURN).filter(([, d]) => d.cat === buy.cat).map(([type, d]) => (
                  <button key={type} onClick={() => pickFurniture(type)} className="il-btn w-[148px] flex-none rounded-[26px] bg-[#f3f6fc] p-3 text-left" style={{ opacity: g.cash < d.price ? 0.55 : 1 }}>
                    <div className="flex items-center justify-between text-[12px] font-bold text-[#6b7690]"><span>{d.size[0]}×{d.size[1]}</span><span style={{ color: '#e0a000' }}>{'★'.repeat(d.stars)}</span></div>
                    <div className="my-1 text-center text-[44px] leading-none">{d.emoji}</div>
                    <div className="text-[14px] font-extrabold leading-tight">{d.name}</div>
                    <div className="mt-1 text-[14px] font-extrabold" style={{ color: GREEN }}>{naira(d.price)}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ---- needs dock + bottom nav ---- */}
      {tab !== 'buy' && (
        <div className="absolute bottom-[92px] left-0 right-0 z-20 mx-auto flex max-w-lg items-center gap-3 px-3">
          <button onClick={() => setPhoneApp('me')} className="il-btn rounded-full bg-white p-1 shadow-lg" style={{ boxShadow: `0 0 0 4px ${mood.color}55, 0 6px 18px rgba(20,30,60,.2)` }}><FaceBadge look={g.look} size={58} /></button>
          <div className="il-glass grid flex-1 grid-cols-3 gap-x-4 gap-y-2.5 rounded-[26px] px-4 py-3">
            {['hunger', 'energy', 'fun', 'social', 'hygiene', 'bladder'].map((k) => <NeedPill key={k} k={k} v={g.needs[k]} />)}
          </div>
        </div>
      )}
      <div className="absolute bottom-3 left-0 right-0 z-30 mx-auto max-w-lg px-3">
        <div className="il-glass flex items-center gap-1 rounded-full p-1.5">
          {bottomTab('home', '🏠', 'Home', () => { setPhoneApp(null); setBuy({ ...buy, ghost: null, sel: null }); setTab('home'); })}
          {bottomTab('buy', '🛋️', 'Buy', () => { setPhoneApp(null); if (!atHome) return toast('Go home to redecorate your room.', 'error'); if (roomFailed) return toast('Buy mode needs 3D, which your phone could not start.', 'error'); setTab('buy'); return undefined; })}
          {bottomTab('map', '🗺️', 'Map', () => { setPhoneApp(null); setTab('map'); })}
          <button onClick={() => { AudioEngine.sfx('tap'); setPhoneApp(''); }} className="il-btn relative flex flex-1 flex-col items-center gap-0.5 rounded-full py-2.5" style={{ background: phoneApp !== null ? NAVY : 'transparent', color: phoneApp !== null ? '#fff' : '#5b6578' }}>
            <span className="text-[22px] leading-none">📱</span><span className="text-[12.5px] font-extrabold">Phone</span>
            {totalUnread + social.requests.length > 0 && <span className="absolute right-4 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#e5484d] px-1.5 text-[11px] font-extrabold text-white">{totalUnread + social.requests.length}</span>}
          </button>
        </div>
      </div>

      {/* ---- phone ---- */}
      {phoneApp !== null && <PhoneScreen ctx={ctx} initialApp={phoneApp || null} onClose={() => setPhoneApp(null)} />}

      {/* ---- travel sheet ---- */}
      {sheetTarget && pathInfo && (
        <Sheet onClose={() => setSheetTarget(null)} z={75}>
          <div className="text-[12px] font-extrabold uppercase tracking-widest text-[#8a93a8]">{LOCATIONS[sheetTarget].area}</div>
          <h2 className="text-[26px] font-extrabold">{LOCATIONS[sheetTarget].emoji} {LOCATIONS[sheetTarget].name}</h2>
          <p className="mt-1 text-[13.5px] font-semibold text-[#566078]">{LOCATIONS[sheetTarget].desc}</p>
          <div className="mt-4 space-y-2.5">
            {Object.entries(MODES).map(([k, m]) => {
              const broke = g.cash < m.fare;
              return (
                <button key={k} onClick={() => startTravel(sheetTarget, k)} className="il-btn flex w-full items-center gap-3 rounded-3xl p-3.5 text-left" style={{ background: broke ? '#f4f6fa' : '#f3f6fc', opacity: broke ? 0.6 : 1 }}>
                  <span className="text-[28px]">{m.icon}</span>
                  <span className="flex-1"><span className="block text-[15px] font-extrabold">{m.label}</span><span className="text-[12.5px] font-semibold text-[#6b7690]">~{Math.max(2, Math.round(pathInfo.dist / m.speed))}s · -{m.energy(pathInfo.dist)} Energy</span></span>
                  <span className="text-[15px] font-extrabold">{m.fare ? naira(m.fare) : 'Free'}</span>
                </button>
              );
            })}
          </div>
        </Sheet>
      )}

      {/* ---- encounter ---- */}
      {encounter && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center p-4" style={{ background: 'rgba(15,20,40,.6)' }}>
          <div className="il-fade w-full max-w-md rounded-[32px] bg-white p-6 shadow-2xl">
            <div className="text-5xl">{encounter.scenario.emoji}</div>
            <p className="mt-2 text-[11.5px] font-extrabold uppercase tracking-widest" style={{ color: '#f5a524' }}>The Micra Experience</p>
            <h2 className="text-[24px] font-extrabold">{encounter.scenario.title}</h2>
            <p className="mt-2 text-[14.5px] font-semibold leading-relaxed text-[#566078]">{encounter.scenario.text}</p>
            {!encounter.outcome ? (
              <div className="mt-5 space-y-2.5">{encounter.scenario.choices.map((c) => <button key={c.label} onClick={() => resolveEncounter(c)} className="il-btn w-full rounded-full bg-[#f0f3f9] px-5 py-3.5 text-left text-[14.5px] font-extrabold">{c.label}</button>)}</div>
            ) : (
              <div className="mt-5">
                <div className="rounded-3xl bg-[#f6f8fc] p-4 text-[14.5px] font-semibold">
                  <p>{encounter.outcome.text}</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-[13px] font-extrabold">
                    {encounter.outcome.cash !== 0 && <span style={{ color: encounter.outcome.cash > 0 ? GREEN : '#d6453d' }}>{encounter.outcome.cash > 0 ? '+' : '-'}{naira(Math.abs(encounter.outcome.cash))}</span>}
                    {encounter.outcome.energy !== 0 && <span style={{ color: encounter.outcome.energy > 0 ? GREEN : '#d6453d' }}>{encounter.outcome.energy > 0 ? '+' : ''}{encounter.outcome.energy} Energy</span>}
                    {encounter.outcome.fun !== 0 && <span style={{ color: encounter.outcome.fun > 0 ? GREEN : '#d6453d' }}>{encounter.outcome.fun > 0 ? '+' : ''}{encounter.outcome.fun} Fun</span>}
                    {encounter.outcome.cash === 0 && encounter.outcome.energy === 0 && encounter.outcome.fun === 0 && <span className="text-[#8a93a8]">No change</span>}
                  </div>
                </div>
                <div className="mt-4"><BigButton onClick={() => setEncounter(null)}>Continue</BigButton></div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
