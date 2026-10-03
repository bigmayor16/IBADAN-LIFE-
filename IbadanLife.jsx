'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

/* ------------------------------------------------------------------ */
/*  SUPABASE SETUP                                                     */
/*  >>> Replace these two values with your own project credentials <<< */
/*  (Supabase Dashboard -> Project Settings -> API)                    */
/* ------------------------------------------------------------------ */
const SUPABASE_URL = 'https://qdtvducpdaffqcuuijnk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_xXzw0zkeWUf6K8i-uPlVkQ__k3siTjz';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const IS_CONFIGURED = true;

/* ------------------------------------------------------------------ */
/*  GAME CONSTANTS                                                     */
/* ------------------------------------------------------------------ */
const PHASES = [
  { name: 'Morning', icon: '🌅' },
  { name: 'Afternoon', icon: '☀️' },
  { name: 'Evening', icon: '🌇' },
  { name: 'Night', icon: '🌙' },
];
const START_CASH = 5000;
const MICRA_FARE = 200;
const RIDEHAIL_FARE = 2000;
const TRAVEL_ENERGY = 10;
const ENCOUNTER_CHANCE = 0.35;
const JOB_PASSIVE_INCOME = 1000; // per time phase once employed
const MAX_CHAT_LEN = 280;

const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));
const naira = (n) => '₦' + Number(n).toLocaleString('en-NG');
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const LOCATIONS = {
  ui_gate: {
    id: 'ui_gate',
    name: 'UI Gate',
    area: 'University of Ibadan',
    emoji: '🎓',
    gradient: 'from-orange-600 via-amber-700 to-stone-900',
    description:
      'The famous gate swarms with students, hawkers shouting "Ọ̀rẹ́ mi, come and see!", and tech bros typing furiously on laptops under the shade. Everybody here is hustling something.',
    actions: [
      { id: 'hangout', label: 'Hang out with students', hint: '+10 Happiness, -5 Energy' },
      { id: 'flash_gig', label: 'Flash a tech bro for a gig', hint: '50%: +₦10,000 · 50%: -10 Happiness' },
    ],
  },
  amala_skye: {
    id: 'amala_skye',
    name: 'Amala Skye',
    area: 'Bodija',
    emoji: '🍲',
    gradient: 'from-red-700 via-orange-700 to-stone-900',
    description:
      'Steam rises from the pots, the gbegiri is silky, the ewedu is perfectly drawn, and the ata dindin is angry. This is where Ibadan restores souls.',
    actions: [
      { id: 'buy_amala', label: 'Buy Amala, Gbegiri & Ewedu', hint: `${naira(1500)} · +40 Energy` },
      { id: 'buy_water', label: 'Buy chilled water', hint: `${naira(200)} · +5 Energy` },
    ],
  },
  cocoa_house: {
    id: 'cocoa_house',
    name: 'Cocoa House',
    area: 'Dugbe',
    emoji: '🏢',
    gradient: 'from-sky-800 via-slate-800 to-stone-950',
    description:
      "Nigeria's first skyscraper still towers over Dugbe. Suits, startups and Wi-Fi hunters share the lobby while the old museum quietly keeps history alive.",
    actions: [
      { id: 'apply_job', label: 'Apply for a Remote Tech Job', hint: 'Needs >80 Energy · 60% chance: ₦25,000 + passive income' },
      { id: 'museum', label: 'Visit the museum', hint: `${naira(500)} · +15 Happiness` },
    ],
  },
  ventura_mall: {
    id: 'ventura_mall',
    name: 'Ventura Mall',
    area: 'Samonda',
    emoji: '🎬',
    gradient: 'from-fuchsia-800 via-purple-900 to-stone-950',
    description:
      'Air-conditioning, neon lights and the smell of popcorn. Ibadan comes here to cool off, show off, and strike a pin or two.',
    actions: [
      { id: 'bowling', label: 'Go Bowling', hint: `${naira(3000)} · +30 Happiness` },
      { id: 'movie', label: 'Watch a movie', hint: `${naira(2500)} · +25 Happiness` },
    ],
  },
  mapo_hall: {
    id: 'mapo_hall',
    name: 'Mapo Hall',
    area: 'Mapo Hill',
    emoji: '🏛️',
    gradient: 'from-amber-700 via-orange-800 to-stone-900',
    description:
      'From the hill, a sea of rusty brown roofs spreads to the horizon. The colonial-era hall watches over the city like an old chief.',
    actions: [
      { id: 'brown_roofs', label: 'Look at the legendary Brown Roofs', hint: 'Free · +10 Happiness, -5 Energy' },
    ],
  },
};
const LOCATION_ORDER = ['ui_gate', 'amala_skye', 'cocoa_house', 'ventura_mall', 'mapo_hall'];

/* Random encounters: each choice resolves to {text, cash, energy, happiness} */
const SCENARIOS = [
  {
    id: 'segbon',
    modes: ['micra'],
    emoji: '🚕',
    title: 'Ṣẹgbọn!',
    text: "You enter a Micra and the driver tells you to 'Ṣẹgbọn' (shift) so a 5th passenger can sit on your lap. Do you?",
    choices: [
      {
        label: 'Comply and squeeze in.',
        resolve: () => ({
          text: 'Your knees file a formal complaint. The fare also somehow went up a little.',
          cash: -500,
          energy: 0,
          happiness: -15,
        }),
      },
      {
        label: 'Alight angrily and trek.',
        resolve: () => ({
          text: 'You storm out, trek in the sun, and feel weirdly proud of yourself.',
          cash: 0,
          energy: -30,
          happiness: 10,
        }),
      },
    ],
  },
  {
    id: 'rally',
    modes: ['micra', 'ridehail'],
    emoji: '📣',
    title: 'Challenge Junction Rally',
    text: 'You are standing at Challenge junction and a political campaign rally blocks the road, throwing free money into the crowd.',
    choices: [
      {
        label: 'Scramble for the cash.',
        resolve: () =>
          Math.random() < 0.6
            ? { text: 'You catch a fistful of notes and slip away smiling.', cash: 5000, energy: 0, happiness: 0 }
            : { text: 'Somebody elbowed you and your pocket got picked in the chaos. Ouch.', cash: -2000, energy: -20, happiness: 0 },
      },
      {
        label: 'Mind your business and walk away.',
        resolve: () => ({ text: 'You walk on. A wise Ibadan citizen.', cash: 0, energy: 0, happiness: 0 }),
      },
    ],
  },
  {
    id: 'conductor',
    modes: ['micra'],
    emoji: '🗣️',
    title: 'The Conductor and the Change',
    text: 'The conductor says he has no change and offers you a stick of chewing gum instead of ₦100.',
    choices: [
      {
        label: 'Argue until he finds the change.',
        resolve: () => ({
          text: 'The whole bus joins the debate. You win your ₦100 and some respect.',
          cash: 100,
          energy: -10,
          happiness: 5,
        }),
      },
      {
        label: 'Take the gum and let it go.',
        resolve: () => ({ text: 'The gum is minty. Peace costs ₦100.', cash: -100, energy: 0, happiness: 3 }),
      },
    ],
  },
  {
    id: 'surge',
    modes: ['ridehail'],
    emoji: '📱',
    title: 'Surge Pricing Wahala',
    text: 'Your ride-hail driver calls: "Oga, traffic is heavy, add ₦1,000 or I cancel."',
    choices: [
      {
        label: 'Pay the extra ₦1,000.',
        resolve: () => ({ text: 'He arrives grinning. Your wallet cries quietly.', cash: -1000, energy: 0, happiness: -3 }),
      },
      {
        label: 'Cancel and wait for another driver.',
        resolve: () => ({ text: 'The next driver is a gentleman and plays good music.', cash: 0, energy: -10, happiness: 5 }),
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  SMALL UI PIECES                                                    */
/* ------------------------------------------------------------------ */
function StatBar({ label, value, icon, color }) {
  return (
    <div className="min-w-[130px] flex-1">
      <div className="mb-1 flex items-center justify-between text-xs font-semibold text-amber-100/80">
        <span>
          {icon} {label}
        </span>
        <span>{value}/100</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/40">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${color}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function Toasts({ toasts }) {
  return (
    <div className="pointer-events-none fixed right-3 top-3 z-[60] flex w-[calc(100%-1.5rem)] max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`animate-[fadeIn_.25s_ease-out] rounded-xl border px-4 py-3 text-sm font-medium shadow-xl backdrop-blur ${
            t.type === 'error'
              ? 'border-red-400/40 bg-red-950/90 text-red-100'
              : t.type === 'success'
              ? 'border-emerald-400/40 bg-emerald-950/90 text-emerald-100'
              : 'border-amber-400/40 bg-stone-900/90 text-amber-100'
          }`}
        >
          {t.type === 'error' ? '⚠️ ' : t.type === 'success' ? '✅ ' : '📌 '}
          {t.text}
        </div>
      ))}
    </div>
  );
}

function mergeMessages(existing, incoming) {
  const map = new Map();
  [...existing, ...incoming].forEach((m) => map.set(m.id, m));
  return Array.from(map.values())
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .slice(-100);
}

/* ------------------------------------------------------------------ */
/*  MAIN COMPONENT                                                     */
/* ------------------------------------------------------------------ */
export default function IbadanLife() {
  /* ---- player state ---- */
  const [cash, setCash] = useState(START_CASH);
  const [energy, setEnergy] = useState(100);
  const [happiness, setHappiness] = useState(50);
  const [locationId, setLocationId] = useState('ui_gate');
  const [tick, setTick] = useState(0);
  const [hasJob, setHasJob] = useState(false);
  const [username, setUsername] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [nameReady, setNameReady] = useState(false);

  /* ---- UI state ---- */
  const [mobileTab, setMobileTab] = useState('game'); // 'game' | 'chat'
  const [toasts, setToasts] = useState([]);
  const [encounter, setEncounter] = useState(null); // {scenario, outcome}

  /* ---- chat state ---- */
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatStatus, setChatStatus] = useState(IS_CONFIGURED ? 'connecting' : 'offline');
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef(null);
  const toastId = useRef(0);

  const location = LOCATIONS[locationId];
  const phase = PHASES[tick % 4];
  const day = Math.floor(tick / 4) + 1;

  /* ---- toasts ---- */
  const toast = useCallback((text, type = 'info') => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-3), { id, text, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  /* ---- username bootstrap ---- */
  const generateName = () =>
    pick(['Danfo', 'Amala', 'Brown_Roof', 'Mapo', 'Bodija', 'Challenge', 'Ọjà', 'Agodi']) +
    '_' +
    pick(['Chief', 'Rider', 'Hustler', 'Baddie', 'Oga', 'Student', 'Baba']) +
    Math.floor(100 + Math.random() * 900);

  useEffect(() => {
    let saved = '';
    try {
      saved = window.localStorage.getItem('ibadan_life_username') || '';
    } catch (e) {
      /* storage unavailable */
    }
    if (saved) setUsername(saved);
    setNameDraft(saved || generateName());
    setNameReady(true);
  }, []);

  const confirmName = () => {
    const clean = nameDraft.trim().slice(0, 24) || generateName();
    setUsername(clean);
    try {
      window.localStorage.setItem('ibadan_life_username', clean);
    } catch (e) {
      /* ignore */
    }
  };

  /* ---- time & stat helpers ---- */
  const advanceTime = useCallback(() => {
    setTick((t) => t + 1);
    if (hasJob) setCash((c) => c + JOB_PASSIVE_INCOME);
  }, [hasJob]);

  const applyDelta = useCallback(({ cash: dc = 0, energy: de = 0, happiness: dh = 0 }) => {
    if (dc) setCash((c) => Math.max(0, c + dc));
    if (de) setEnergy((e) => clamp(e + de));
    if (dh) setHappiness((h) => clamp(h + dh));
  }, []);

  /* ---------------------------------------------------------------- */
  /*  SUPABASE REALTIME CHAT                                           */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    if (!IS_CONFIGURED) return undefined;
    let cancelled = false;

    // 1) Subscribe first so no message is missed between fetch and subscribe
    const channel = supabase
      .channel('public:ibadan_life_chats')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ibadan_life_chats' },
        (payload) => {
          setMessages((prev) => mergeMessages(prev, [payload.new]));
        }
      )
      .subscribe((status) => {
        if (cancelled) return;
        if (status === 'SUBSCRIBED') setChatStatus('live');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setChatStatus('error');
        else if (status === 'CLOSED') setChatStatus('connecting');
      });

    // 2) Fetch the latest 50 messages
    (async () => {
      const { data, error } = await supabase
        .from('ibadan_life_chats')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (cancelled) return;
      if (error) {
        setChatStatus('error');
        return;
      }
      setMessages((prev) => mergeMessages(prev, (data || []).slice().reverse()));
    })();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, mobileTab]);

  const sendMessage = async (e) => {
    e?.preventDefault();
    const message = chatInput.trim().slice(0, MAX_CHAT_LEN);
    if (!message || sending) return;
    if (!IS_CONFIGURED) {
      toast('Add your Supabase URL and anon key at the top of the file to chat.', 'error');
      return;
    }
    setSending(true);
    const { error } = await supabase
      .from('ibadan_life_chats')
      .insert([{ username: username || 'Anonymous', message, location: location.name }]);
    setSending(false);
    if (error) {
      toast('Message failed: ' + error.message, 'error');
      return;
    }
    setChatInput(''); // the new row arrives back via the realtime subscription
  };

  /* ---------------------------------------------------------------- */
  /*  TRAVEL + ENCOUNTERS                                              */
  /* ---------------------------------------------------------------- */
  const travel = (destId, mode) => {
    const fare = mode === 'micra' ? MICRA_FARE : RIDEHAIL_FARE;
    if (energy <= 0) {
      toast("You're too exhausted to move. Eat something first!", 'error');
      return;
    }
    if (cash < fare) {
      toast(`You can't afford the ${naira(fare)} fare.`, 'error');
      return;
    }
    applyDelta({ cash: -fare, energy: -TRAVEL_ENERGY });
    setLocationId(destId);
    advanceTime();
    toast(
      `${mode === 'micra' ? '🚕 Shared Micra' : '📱 Ride-hail'} to ${LOCATIONS[destId].name} (-${naira(fare)}, -${TRAVEL_ENERGY} Energy)`
    );
    if (Math.random() < ENCOUNTER_CHANCE) {
      const pool = SCENARIOS.filter((s) => s.modes.includes(mode));
      setEncounter({ scenario: pick(pool), outcome: null });
    }
  };

  const resolveEncounter = (choice) => {
    const outcome = choice.resolve();
    applyDelta(outcome);
    setEncounter((enc) => ({ ...enc, outcome }));
  };

  /* ---------------------------------------------------------------- */
  /*  LOCATION ACTIONS                                                 */
  /* ---------------------------------------------------------------- */
  const runSimple = ({ cost = 0, energy: de = 0, happiness: dh = 0, success }) => {
    if (cash < cost) {
      toast(`You need ${naira(cost)} for that. You only have ${naira(cash)}.`, 'error');
      return false;
    }
    if (de < 0 && energy < -de) {
      toast("You don't have enough energy for that. Go eat!", 'error');
      return false;
    }
    applyDelta({ cash: -cost, energy: de, happiness: dh });
    advanceTime();
    toast(success, 'success');
    return true;
  };

  const performAction = (actionId) => {
    switch (actionId) {
      case 'hangout':
        return runSimple({ energy: -5, happiness: 10, success: 'You gist with students for hours. +10 Happiness.' });

      case 'flash_gig': {
        if (energy < 5) return toast("You're too tired to hustle. Go eat!", 'error');
        advanceTime();
        if (Math.random() < 0.5) {
          applyDelta({ cash: 10000 });
          return toast('A tech bro liked your pitch and paid you ₦10,000! 💸', 'success');
        }
        applyDelta({ happiness: -10 });
        return toast('He left you on read. -10 Happiness. 😔', 'error');
      }

      case 'buy_amala':
        return runSimple({
          cost: 1500,
          energy: 40,
          success: 'Amala, gbegiri and ewedu: perfection. +40 Energy.',
        });

      case 'buy_water':
        return runSimple({ cost: 200, energy: 5, success: 'Cold water. Refreshing. +5 Energy.' });

      case 'apply_job': {
        if (energy <= 80) return toast('You need more than 80 Energy to nail the interview.', 'error');
        applyDelta({ energy: -20 });
        advanceTime();
        if (Math.random() < 0.6) {
          applyDelta({ cash: 25000 });
          if (!hasJob) {
            setHasJob(true);
            return toast(`You got the job! +₦25,000 signing payout and ${naira(JOB_PASSIVE_INCOME)} every time phase. 🎉`, 'success');
          }
          return toast('Another contract landed! +₦25,000 🎉', 'success');
        }
        return toast('They said "we will get back to you". -20 Energy.', 'error');
      }

      case 'museum':
        return runSimple({ cost: 500, happiness: 15, success: 'You learn something new about Ibadan. +15 Happiness.' });

      case 'bowling':
        return runSimple({ cost: 3000, happiness: 30, success: 'Strike! +30 Happiness. 🎳' });

      case 'movie':
        return runSimple({ cost: 2500, happiness: 25, success: 'Great movie, great popcorn. +25 Happiness. 🍿' });

      case 'brown_roofs':
        return runSimple({ energy: -5, happiness: 10, success: 'The brown roofs stretch forever. +10 Happiness.' });

      case 'street_corn': // emergency food available everywhere
        return runSimple({ cost: 300, energy: 10, success: 'Roasted corn and ube from a roadside hawker. +10 Energy.' });

      default:
        return null;
    }
  };

  const stuck = energy <= 0;
  const statusDot = useMemo(
    () =>
      ({
        live: ['bg-emerald-400', 'Live'],
        connecting: ['bg-amber-400 animate-pulse', 'Connecting…'],
        error: ['bg-red-500', 'Connection error'],
        offline: ['bg-stone-500', 'Not configured'],
      }[chatStatus]),
    [chatStatus]
  );

  /* ---------------------------------------------------------------- */
  /*  RENDER                                                           */
  /* ---------------------------------------------------------------- */
  const gamePanel = (
    <div className="space-y-4">
      {/* Location hero */}
      <section
        className={`relative overflow-hidden rounded-2xl border border-amber-900/50 bg-gradient-to-br ${location.gradient} p-5 shadow-xl transition-all duration-500`}
      >
        <div className="pointer-events-none absolute -right-4 -top-4 select-none text-[7rem] opacity-20">
          {location.emoji}
        </div>
        {/* decorative brown roofs */}
        <svg className="pointer-events-none absolute bottom-0 left-0 w-full opacity-20" viewBox="0 0 400 40" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 40 L20 18 L40 40 L60 14 L85 40 L110 20 L135 40 L160 12 L190 40 L215 22 L240 40 L270 16 L300 40 L325 20 L350 40 L375 14 L400 40 Z" fill="#7c3f1d" />
        </svg>
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-300/80">{location.area}</p>
          <h2 className="mt-1 text-2xl font-extrabold text-white">
            {location.emoji} {location.name}
          </h2>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-amber-50/90">{location.description}</p>
        </div>
      </section>

      {/* Actions */}
      <section className="rounded-2xl border border-amber-900/40 bg-stone-900/70 p-4">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-orange-300">What will you do?</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {location.actions.map((a) => (
            <button
              key={a.id}
              onClick={() => performAction(a.id)}
              className="rounded-xl border border-orange-700/40 bg-gradient-to-br from-orange-700/30 to-amber-900/30 px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-orange-400 hover:from-orange-600/40 active:scale-[0.98]"
            >
              <div className="text-sm font-semibold text-amber-50">{a.label}</div>
              <div className="mt-0.5 text-xs text-amber-200/70">{a.hint}</div>
            </button>
          ))}
          <button
            onClick={() => performAction('street_corn')}
            className="rounded-xl border border-stone-600/50 bg-stone-800/60 px-4 py-3 text-left transition hover:border-amber-500/60 active:scale-[0.98]"
          >
            <div className="text-sm font-semibold text-stone-100">🌽 Buy roadside roasted corn</div>
            <div className="mt-0.5 text-xs text-stone-400">{naira(300)} · +10 Energy · available anywhere</div>
          </button>
        </div>
        {hasJob && (
          <p className="mt-3 text-xs text-emerald-300/90">
            💼 Remote job active: +{naira(JOB_PASSIVE_INCOME)} every time the day moves forward.
          </p>
        )}
      </section>

      {/* Travel */}
      <section className="rounded-2xl border border-amber-900/40 bg-stone-900/70 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-orange-300">🗺️ Travel Across Ibadan</h3>
          <span className="text-xs text-stone-400">-{TRAVEL_ENERGY} Energy per trip</span>
        </div>
        {stuck && (
          <div className="mb-3 rounded-lg border border-red-500/40 bg-red-950/60 px-3 py-2 text-sm text-red-100">
            You have 0 Energy and can't move. Eat something first (the roadside corn above works anywhere).
          </div>
        )}
        <div className="space-y-2">
          {LOCATION_ORDER.filter((id) => id !== locationId).map((id) => {
            const l = LOCATIONS[id];
            return (
              <div
                key={id}
                className="flex flex-col gap-2 rounded-xl border border-stone-700/60 bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="text-sm font-semibold text-amber-50">
                    {l.emoji} {l.name}
                  </div>
                  <div className="text-xs text-stone-400">{l.area}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => travel(id, 'micra')}
                    className="flex-1 rounded-lg bg-orange-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-orange-500 active:scale-95 sm:flex-none"
                  >
                    🚕 Micra {naira(MICRA_FARE)}
                  </button>
                  <button
                    onClick={() => travel(id, 'ridehail')}
                    className="flex-1 rounded-lg bg-stone-700 px-3 py-2 text-xs font-bold text-amber-100 transition hover:bg-stone-600 active:scale-95 sm:flex-none"
                  >
                    📱 Ride-hail {naira(RIDEHAIL_FARE)}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );

  const chatPanel = (
    <section className="flex h-[70vh] flex-col overflow-hidden rounded-2xl border border-amber-900/40 bg-stone-900/80 lg:h-[calc(100vh-11rem)]">
      <header className="flex items-center justify-between border-b border-amber-900/40 bg-black/30 px-4 py-3">
        <h3 className="text-sm font-bold text-orange-300">💬 Ibadan Global Chat</h3>
        <span className="flex items-center gap-2 text-xs text-stone-300">
          <span className={`h-2 w-2 rounded-full ${statusDot[0]}`} />
          {statusDot[1]}
        </span>
      </header>

      {!IS_CONFIGURED && (
        <div className="border-b border-amber-700/40 bg-amber-950/60 px-4 py-2 text-xs text-amber-200">
          Set <code className="font-mono">SUPABASE_URL</code> and <code className="font-mono">SUPABASE_ANON_KEY</code> at the
          top of this file to enable live chat.
        </div>
      )}
      {chatStatus === 'error' && IS_CONFIGURED && (
        <div className="border-b border-red-700/40 bg-red-950/60 px-4 py-2 text-xs text-red-200">
          Couldn't reach the chat table or realtime. Check the SQL setup, RLS policies and the realtime publication.
        </div>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <p className="pt-6 text-center text-sm text-stone-500">
            {IS_CONFIGURED ? 'No messages yet. Say "E kaaro" to Ibadan!' : 'Chat is offline until Supabase is configured.'}
          </p>
        )}
        {messages.map((m) => {
          const mine = m.username === username;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  mine ? 'rounded-br-sm bg-orange-600 text-white' : 'rounded-bl-sm bg-stone-800 text-amber-50'
                }`}
              >
                <div className="mb-0.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide opacity-70">
                  <span>{m.username}</span>
                  {m.location && <span>· 📍 {m.location}</span>}
                  <span>
                    · {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
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
          placeholder={`Chat as ${username || '…'}`}
          className="min-w-0 flex-1 rounded-xl border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-amber-50 placeholder-stone-500 outline-none transition focus:border-orange-500"
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
  );

  return (
    <div className="min-h-screen bg-[#150d09] text-amber-50" style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}`}</style>
      <Toasts toasts={toasts} />

      {/* Top stats bar */}
      <header className="sticky top-0 z-40 border-b border-amber-900/50 bg-[#1d110b]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-extrabold tracking-tight text-orange-400">
              🏚️ Ibadan <span className="text-amber-100">Life</span>
            </h1>
            <div className="flex items-center gap-3 text-xs text-stone-300">
              <span className="rounded-full bg-black/40 px-3 py-1 font-semibold">
                {phase.icon} {phase.name} · Day {day}
              </span>
              <span className="hidden sm:inline">👤 {username}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[110px]">
              <div className="text-xs font-semibold text-amber-100/80">💰 Cash</div>
              <div className="text-xl font-extrabold text-emerald-400 transition-all">{naira(cash)}</div>
            </div>
            <StatBar label="Energy" value={energy} icon="⚡" color="bg-gradient-to-r from-yellow-500 to-orange-500" />
            <StatBar label="Happiness" value={happiness} icon="😄" color="bg-gradient-to-r from-pink-500 to-rose-500" />
          </div>
        </div>
      </header>

      {/* Mobile tab switch */}
      <div className="mx-auto mt-3 flex max-w-6xl gap-2 px-4 lg:hidden">
        {[
          ['game', '🎮 Game'],
          ['chat', '💬 Chat'],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMobileTab(key)}
            className={`flex-1 rounded-xl py-2 text-sm font-bold transition ${
              mobileTab === key ? 'bg-orange-600 text-white' : 'bg-stone-800 text-stone-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Body */}
      <main className="mx-auto grid max-w-6xl gap-4 px-4 py-4 lg:grid-cols-[1fr_380px]">
        <div className={mobileTab === 'game' ? 'block' : 'hidden lg:block'}>{gamePanel}</div>
        <div className={mobileTab === 'chat' ? 'block' : 'hidden lg:block'}>{chatPanel}</div>
      </main>

      {/* Username modal */}
      {nameReady && !username && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-orange-700/50 bg-stone-900 p-6 shadow-2xl">
            <div className="text-4xl">🏚️</div>
            <h2 className="mt-2 text-xl font-extrabold text-orange-400">Welcome to Ibadan Life</h2>
            <p className="mt-1 text-sm text-stone-300">Pick a name other players will see in chat.</p>
            <div className="mt-4 flex gap-2">
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                maxLength={24}
                onKeyDown={(e) => e.key === 'Enter' && confirmName()}
                className="min-w-0 flex-1 rounded-xl border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-amber-50 outline-none focus:border-orange-500"
              />
              <button
                onClick={() => setNameDraft(generateName())}
                className="rounded-xl bg-stone-700 px-3 text-lg transition hover:bg-stone-600"
                title="Random name"
              >
                🎲
              </button>
            </div>
            <button
              onClick={confirmName}
              className="mt-4 w-full rounded-xl bg-orange-600 py-2.5 text-sm font-bold text-white transition hover:bg-orange-500 active:scale-[0.98]"
            >
              Enter Ibadan
            </button>
          </div>
        </div>
      )}

      {/* Random encounter modal */}
      {encounter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-orange-700/50 bg-gradient-to-b from-stone-900 to-[#1d110b] p-6 shadow-2xl">
            <div className="text-5xl">{encounter.scenario.emoji}</div>
            <p className="mt-2 text-xs font-bold uppercase tracking-widest text-orange-400">The Micra Experience</p>
            <h2 className="text-xl font-extrabold text-amber-50">{encounter.scenario.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-amber-100/90">{encounter.scenario.text}</p>

            {!encounter.outcome ? (
              <div className="mt-5 space-y-2">
                {encounter.scenario.choices.map((c) => (
                  <button
                    key={c.label}
                    onClick={() => resolveEncounter(c)}
                    className="w-full rounded-xl border border-orange-700/50 bg-orange-700/20 px-4 py-3 text-left text-sm font-semibold text-amber-50 transition hover:border-orange-400 hover:bg-orange-600/30 active:scale-[0.98]"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-5">
                <div className="rounded-xl border border-amber-700/40 bg-black/30 p-4 text-sm text-amber-100">
                  <p>{encounter.outcome.text}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
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
                    {encounter.outcome.happiness !== 0 && (
                      <span className={encounter.outcome.happiness > 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {encounter.outcome.happiness > 0 ? '+' : ''}
                        {encounter.outcome.happiness} Happiness
                      </span>
                    )}
                    {encounter.outcome.cash === 0 && encounter.outcome.energy === 0 && encounter.outcome.happiness === 0 && (
                      <span className="text-stone-400">No change</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setEncounter(null)}
                  className="mt-4 w-full rounded-xl bg-orange-600 py-2.5 text-sm font-bold text-white transition hover:bg-orange-500 active:scale-[0.98]"
                >
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
