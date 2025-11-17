// Core game logic for Galactic Dust Sweeper
// Handles state, UI wiring, save/load, prestige, and basic feedback effects.

(() => {
  'use strict';

  const SAVE_KEY = 'gds_save';
  const MAX_OFFLINE_MS = 1000 * 60 * 60 * 12; // cap idle gains at 12h
  const prestigeUpgrades = {
    clickBoost: { label: 'Galactic Focus', cost: 3, effect: 0.15, description: '+15% dust per click per level' },
    passiveBoost: { label: 'Fleet Logistics', cost: 4, effect: 0.12, description: '+12% passive/sec per level' },
    autoBoost: { label: 'Automation Mesh', cost: 4, effect: 0.12, description: '+12% auto clicks/sec per level' },
    zoneBonus: { label: 'Zonal Synergy', cost: 5, effect: 0.08, description: '+8% zone bonus per level' },
    globalBoost: { label: 'Continuum Surge', cost: 6, effect: 0.1, description: '+10% all gains per level' },
    prestigeYield: { label: 'Ascendant Yield', cost: 7, effect: 0.12, description: '+12% prestige gain per level' },
    tapSurge: { label: 'Tap Surge', cost: 5, effect: 0.18, description: '+18% dust per click per level' },
    tempoFlux: { label: 'Tempo Flux', cost: 5, effect: 0.15, description: '+15% passive/sec per level' },
    swarmOverclock: { label: 'Swarm Overclock', cost: 5, effect: 0.14, description: '+14% auto clicks/sec per level' },
    macroEconomy: { label: 'Macro Economy', cost: 6, effect: 0.08, description: '+8% all gains per level' },
    windfall: { label: 'Windfall', cost: 7, effect: 0.14, description: '+14% prestige gain per level' },
    cartography: { label: 'Zonal Cartography', cost: 4, effect: 0.12, description: '+12% zone bonus per level' },
  };
  const prestigeTitles = [
    'Initiate Sweeper',
    'Stellar Custodian',
    'Asteroid Keeper',
    'Nebula Warden',
    'Void Navigator',
    'Aurora Marshal',
    'Galactic Overwatch',
    'Cosmic Regent',
    'Eclipse Archon',
    'Starlight Sovereign',
    'Celestial Empress',
  ];
  const prestigeTitleGradients = [
    'linear-gradient(90deg,#7ff3ea,#ffd66b)',
    'linear-gradient(90deg,#6ef0df,#8aa4ff)',
    'linear-gradient(90deg,#ffd66b,#ff9fbf)',
    'linear-gradient(90deg,#9be7ff,#6ef0df)',
    'linear-gradient(90deg,#ffb347,#ffd6ff)',
    'linear-gradient(90deg,#c0ff8c,#6ef0df)',
    'linear-gradient(90deg,#8ed6ff,#b39ddb)',
    'linear-gradient(90deg,#ff9a9e,#fad0c4)',
    'linear-gradient(90deg,#a18cd1,#fbc2eb)',
    'linear-gradient(90deg,#f6d365,#fda085)',
    'linear-gradient(90deg,#84fab0,#8fd3f4)',
  ];

  // Suppress noisy extension messaging errors that can bubble into the console on some browsers.
  const isMessageChannelNoise = reason => {
    const msg = String(reason?.message || reason || '');
    return msg.toLowerCase().includes('message channel closed') ||
      msg.toLowerCase().includes('listener indicated an asynchronous response');
  };
  window.addEventListener('unhandledrejection', evt => {
    if (isMessageChannelNoise(evt.reason)) {
      evt.preventDefault();
      evt.stopPropagation();
      if (evt.stopImmediatePropagation) evt.stopImmediatePropagation();
      console.warn('Ignored extension messaging error:', evt.reason);
    }
  });
  window.addEventListener('error', evt => {
    const reason = evt.error?.message || evt.message || evt.error || '';
    if (isMessageChannelNoise(reason)) {
      evt.preventDefault();
      evt.stopPropagation();
      if (evt.stopImmediatePropagation) evt.stopImmediatePropagation();
      console.warn('Ignored extension messaging error:', reason);
    }
  }, true);

  window.onerror = function onWindowError(message, source, lineno, colno, error) {
    if (isMessageChannelNoise(message) || isMessageChannelNoise(error)) {
      return true; // swallow benign extension noise
    }
    return false;
  };

  // Guard console.error spam from noisy extensions
  const originalConsoleError = console.error.bind(console);
  console.error = (...args) => {
    const text = args.map(a => String(a?.message || a || '')).join(' ').toLowerCase();
    if (isMessageChannelNoise(text)) return;
    originalConsoleError(...args);
  };

  const toolCatalog = {
    basic: { label: 'Basic Sweeper', cost: 20, increment: 1, kind: 'click' },
    laser: { label: 'Laser Sweeper', cost: 200, increment: 5, kind: 'click' },
    autoClicker: { label: 'Auto Clicker', cost: 100, increment: 1, kind: 'autoClick' },
    superVac: { label: 'Super Vac', cost: 500, increment: 10, kind: 'click' },
    magnet: { label: 'Magnetic Net', cost: 1200, increment: 25, kind: 'click' },
    autoDrone: { label: 'Auto Drone', cost: 3500, increment: 50, kind: 'autoClick' },
    solarArray: { label: 'Solar Array', cost: 9000, increment: 150, kind: 'passive' },
    quantumNet: { label: 'Quantum Net', cost: 25000, increment: 500, kind: 'click' },
    ionScoop: { label: 'Ion Scoop', cost: 40000, increment: 800, kind: 'click' },
    nebulaHarvester: { label: 'Nebula Harvester', cost: 60000, increment: 400, kind: 'passive' },
    warpCollector: { label: 'Warp Collector', cost: 85000, increment: 120, kind: 'autoClick' },
    darkMatter: { label: 'Dark Matter Siphon', cost: 120000, increment: 1200, kind: 'passive' },
    stellarBroom: { label: 'Stellar Broom', cost: 180000, increment: 2000, kind: 'click' },
    plasmaRake: { label: 'Plasma Rake', cost: 240000, increment: 2800, kind: 'click' },
    gravityWell: { label: 'Gravity Well', cost: 320000, increment: 3600, kind: 'passive' },
    chronoClicker: { label: 'Chrono Clicker', cost: 450000, increment: 500, kind: 'autoClick' },
    photonArray: { label: 'Photon Array', cost: 600000, increment: 5200, kind: 'passive' },
    antimatterMesh: { label: 'Antimatter Mesh', cost: 800000, increment: 7200, kind: 'click' },
    singularityNet: { label: 'Singularity Net', cost: 1050000, increment: 9500, kind: 'click' },
    quantumVacuum: { label: 'Quantum Vacuum', cost: 1400000, increment: 900, kind: 'autoClick' },
    starForge: { label: 'Star Forge', cost: 1800000, increment: 12000, kind: 'passive' },
    riftEngine: { label: 'Rift Engine', cost: 2300000, increment: 15000, kind: 'click' },
    alienConsortium: { label: 'Alien Consortium', cost: 3000000, increment: 18000, kind: 'passive' },
    cosmicOverseer: { label: 'Cosmic Overseer', cost: 3800000, increment: 1400, kind: 'autoClick' },
    starlitSail: { label: 'Starlit Sail', cost: 5200000, increment: 21000, kind: 'passive' },
    nebulaCycler: { label: 'Nebula Cycler', cost: 7600000, increment: 26000, kind: 'autoClick' },
    voidHarvester: { label: 'Void Harvester', cost: 10500000, increment: 32000, kind: 'click' },
    riftExcavator: { label: 'Rift Excavator', cost: 14500000, increment: 42000, kind: 'passive' },
    auroraWeaver: { label: 'Aurora Weaver', cost: 19000000, increment: 52000, kind: 'passive' },
    stellarEmpress: { label: 'Stellar Empress', cost: 25000000, increment: 68000, kind: 'autoClick' },
  };

  // Map tools to the currency zone they cost from (defaults to Zone 0/Dust if not listed)
  const toolCurrencyZones = {
    // Zone 0 (Dust)
    basic: 0,
    laser: 0,
    autoClicker: 0,
    superVac: 0,
    magnet: 0,
    autoDrone: 0,
    // Zone 1 (Astro Dust)
    solarArray: 1,
    quantumNet: 1,
    ionScoop: 1,
    // Zone 2 (Lunar Dust)
    nebulaHarvester: 2,
    warpCollector: 2,
    darkMatter: 2,
    // Zone 3 (Dune Dust)
    stellarBroom: 3,
    plasmaRake: 3,
    gravityWell: 3,
    chronoClicker: 3,
    // Zone 4 (Nebula Dust)
    photonArray: 4,
    antimatterMesh: 4,
    singularityNet: 4,
    quantumVacuum: 4,
    starForge: 4,
    riftEngine: 4,
    alienConsortium: 4,
    cosmicOverseer: 4,
    // Zone 5 (Starlight Dust)
    starlitSail: 5,
    nebulaCycler: 5,
    // Zone 6 (Void Dust)
    voidHarvester: 6,
    riftExcavator: 6,
    // Zone 7 (Aurora Dust)
    auroraWeaver: 7,
    stellarEmpress: 7,
  };

  const zones = [
    { name: 'Planet A', cost: 0, bonus: 0, currency: 'Dust' },
    { name: 'Asteroid Belt', cost: 1000, bonus: 0.05, currency: 'Astro Dust' },
    { name: 'Moon Outpost', cost: 5000, bonus: 0.1, currency: 'Lunar Dust' },
    { name: 'Red Dunes', cost: 20000, bonus: 0.18, currency: 'Dune Dust' },
    { name: 'Crystal Nebula', cost: 80000, bonus: 0.3, currency: 'Nebula Dust' },
    { name: 'Starlit Reef', cost: 160000, bonus: 0.36, currency: 'Starlight Dust' },
    { name: 'Void Rift', cost: 320000, bonus: 0.44, currency: 'Void Dust' },
    { name: 'Aurora Spire', cost: 640000, bonus: 0.52, currency: 'Aurora Dust' },
  ];

  // Music presets inspired by Tidal/Strudel patterns: chiptune shimmer over chill/lofi grooves.
  const presets = {
    aurora: {
      tempo: 124,
      kick: [0, 4, 8, 12, 16, 20, 24, 28, 31],
      snare: [6, 14, 22, 30],
      hat: [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29],
      hatOpen: [7, 15, 23, 29],
      chordLengthBeats: 4,
      chordRoots: [0, -3, -7, -5, -10, -7, -5, -2], // vi-IV colors
      altChordRoots: [-7, -5, -10, -3, -12, -7, -5, -2], // softer pass
      chords: [
        [0, 4, 7, 11],   // maj7
        [0, 3, 7, 10],   // m7
        [0, 5, 9, 12],   // sus/add9
        [0, 4, 9, 14],   // add6/9
      ],
      baseFreq: 220,
      bassBeats: [0, 3, 6, 8, 11, 14, 16, 19, 22, 24, 27, 30],
      bassLine: [0, -5, -7, -3, -10, -7, -5, -12],
      altBassLine: [-12, -7, -5, -9, -14, -9, -12, -5],
      bassBase: 55,
      arpSteps: [0, 7, 12, 14, 19],
      altArpSteps: [0, 12, 7, 14, 19],
      altHat: [1, 5, 9, 13, 17, 21, 25, 29],
      altHatOpen: [7, 23],
    },
    eclipse: {
      tempo: 132,
      kick: [0, 4, 8, 12, 16, 20, 24, 28],
      snare: [6, 14, 22, 30],
      hat: [2, 3, 6, 7, 10, 11, 14, 15, 18, 19, 22, 23, 26, 27],
      hatOpen: [5, 13, 21, 29],
      chordLengthBeats: 4,
      chordRoots: [0, 2, -3, 5, -2, 3, -4, 7],
      altChordRoots: [-5, -2, 0, 3, -4, 1, -7, 5],
      chords: [
        [0, 4, 7, 14],   // add6/9 sparkle
        [0, 3, 7, 10],   // m7
        [0, 5, 9, 12],   // sus/add9
        [0, 4, 9, 11],   // maj7 add9-ish
      ],
      baseFreq: 246.94,
      bassBeats: [0, 3, 7, 9, 12, 15, 19, 21, 24, 27, 31],
      bassLine: [0, -2, -7, -5, -9, -7, -12, -14],
      altBassLine: [-12, -9, -5, -7, -14, -12, -7, -9],
      bassBase: 61.74,
      arpSteps: [0, 7, 12, 16, 19, 24],
      altArpSteps: [0, 12, 7, 16, 19],
      altHat: [2, 6, 10, 14, 18, 22, 26, 30],
      altHatOpen: [9, 25],
    },
  };

  const achievementDefs = [
    { id: 'first_dust', label: 'First Sweep', description: 'Collect your first dust.', reward: { type: 'dust', value: 50 }, test: () => state.totalDustEarned >= 1 },
    { id: 'hundred_dust', label: 'Collector', description: 'Gather 100 dust.', reward: { type: 'mult', value: 0.02 }, test: () => state.totalDustEarned >= 100 },
    { id: 'thousand_dust', label: 'Hoarder', description: 'Gather 1,000 dust.', reward: { type: 'mult', value: 0.05 }, test: () => state.totalDustEarned >= 1000 },
    { id: 'ten_k', label: 'Dust Tyro', description: 'Gather 10,000 dust.', reward: { type: 'mult', value: 0.08 }, test: () => state.totalDustEarned >= 10000 },
    { id: 'fifty_k', label: 'Dust Adept', description: 'Gather 50,000 dust.', reward: { type: 'mult', value: 0.12 }, test: () => state.totalDustEarned >= 50_000 },
    { id: 'quarter_mil', label: 'Dust Artisan', description: 'Gather 250,000 dust.', reward: { type: 'dust', value: 5000 }, test: () => state.totalDustEarned >= 250_000 },
    { id: 'click_novice', label: 'Click Novice', description: 'Click 50 times.', reward: { type: 'dust', value: 250 }, test: () => state.totalClicks >= 50 },
    { id: 'click_pro', label: 'Click Pro', description: 'Click 1,000 times.', reward: { type: 'mult', value: 0.06 }, test: () => state.totalClicks >= 1000 },
    { id: 'click_legend', label: 'Click Legend', description: 'Click 10,000 times.', reward: { type: 'prestige', value: 2 }, test: () => state.totalClicks >= 10_000 },
    { id: 'first_tool', label: 'Investor', description: 'Buy any tool.', reward: { type: 'dust', value: 500 }, test: () => Object.values(state.tools).some(t => t.level > 0) },
    { id: 'toolmaster', label: 'Fleet Builder', description: 'Reach 20 total tool levels.', reward: { type: 'mult', value: 0.1 }, test: () => Object.values(state.tools).reduce((s, t) => s + t.level, 0) >= 20 },
    { id: 'tool_captain', label: 'Fleet Commander', description: 'Reach 75 total tool levels.', reward: { type: 'mult', value: 0.12 }, test: () => Object.values(state.tools).reduce((s, t) => s + t.level, 0) >= 75 },
    { id: 'tool_legend', label: 'Armada Architect', description: 'Reach 150 total tool levels.', reward: { type: 'prestige', value: 4 }, test: () => Object.values(state.tools).reduce((s, t) => s + t.level, 0) >= 150 },
    { id: 'passive_flow', label: 'Passive Flow', description: 'Reach 1,000 dust/sec.', reward: { type: 'prestige', value: 1 }, test: () => (state.totalPerSecond || 0) >= 1000 },
    { id: 'passive_torrent', label: 'Nebula Torrent', description: 'Reach 10,000 dust/sec.', reward: { type: 'mult', value: 0.18 }, test: () => (state.totalPerSecond || 0) >= 10_000 },
    { id: 'auto_ace', label: 'Auto Ace', description: 'Reach 250 auto clicks/sec.', reward: { type: 'mult', value: 0.1 }, test: () => (state.autoClicksPerSecond || 0) >= 250 },
    { id: 'auto_overdrive', label: 'Auto Overdrive', description: 'Reach 1,000 auto clicks/sec.', reward: { type: 'mult', value: 0.14 }, test: () => (state.autoClicksPerSecond || 0) >= 1000 },
    { id: 'prestige_once', label: 'Begin Again', description: 'Prestige once.', reward: { type: 'mult', value: 0.15 }, test: () => state.prestige > 0 },
    { id: 'prestige_five', label: 'Reborn x5', description: 'Prestige five times.', reward: { type: 'prestige', value: 2 }, test: () => state.prestige >= 5 },
    { id: 'prestige_ten', label: 'Reborn x10', description: 'Prestige ten times.', reward: { type: 'prestige', value: 3 }, test: () => state.prestige >= 10 },
    { id: 'prestige_twentyfive', label: 'Reborn x25', description: 'Prestige twenty-five times.', reward: { type: 'mult', value: 0.2 }, test: () => state.prestige >= 25 },
    { id: 'zone_explorer', label: 'Dune Ranger', description: 'Unlock the Red Dunes (Zone 3).', reward: { type: 'mult', value: 0.1 }, test: () => state.currentZoneIndex >= 3 },
    { id: 'zone_voyager', label: 'Aurora Voyager', description: 'Reach the Aurora Spire (final zone).', reward: { type: 'prestige', value: 3 }, test: () => state.currentZoneIndex >= zones.length - 1 },
    { id: 'lifetime_million', label: 'Stellar Earner', description: 'Reach 1,000,000 lifetime dust.', reward: { type: 'mult', value: 0.18 }, test: () => state.lifetimeDust >= 1_000_000 },
    { id: 'lifetime_ten_million', label: 'Stellar Tycoon', description: 'Reach 10,000,000 lifetime dust.', reward: { type: 'mult', value: 0.22 }, test: () => state.lifetimeDust >= 10_000_000 },
    { id: 'lifetime_billion', label: 'Cosmic Magnate', description: 'Reach 1,000,000,000 lifetime dust.', reward: { type: 'prestige', value: 5 }, test: () => state.lifetimeDust >= 1_000_000_000 },
    { id: 'lifetime_ten_billion', label: 'Cosmic Baron', description: 'Reach 10,000,000,000 lifetime dust.', reward: { type: 'prestige', value: 8 }, test: () => state.lifetimeDust >= 10_000_000_000 },
  ];

  const state = {
    dust: 0, // legacy; kept for backward save compatibility
    currencies: {},
    totalDustEarned: 0,
    lifetimeDust: 0,
    totalClicks: 0,
    prestige: 0,
    prestigeTitleIndex: 0,
    prestigeUpgrades: {},
    currentZoneIndex: 0,
    bgmOn: false,
    clickSoundOn: true,
    lastUpdate: Date.now(),
    tools: {},
    achievements: {},
    achievementMultiplier: 1,
    inMenu: true,
    currencyPerSecond: {},
    currencyClicks: {},
  };

  // Lightweight Web Audio engine for coded music
  const audioEngine = {
    ctx: null,
    master: null,
    pump: null,
    chipCrunch: null,
    loopId: null,
    beatIndex: 0,
    chordIndex: 0,
    presetIndex: 0,
    barCount: 0,
    unlocked: false,
    pendingStart: false,
  };
  const dustFX = {
    canvas: null,
    ctx: null,
    particles: [],
    max: 140,
    lastSpawn: 0,
    width: 0,
    height: 0,
  };

  const els = {
    dustAmount: document.getElementById('dust-amount'),
    currencyLabel: document.getElementById('currency-label'),
    currencyList: document.getElementById('currency-list'),
    currencyPanel: document.getElementById('currency-panel'),
    dpc: document.getElementById('dpc'),
    dps: document.getElementById('dps'),
    autoCps: document.getElementById('auto-cps'),
    clickButton: document.getElementById('click-button'),
    bgmToggle: document.getElementById('bgm-toggle-btn'),
    clickToggle: document.getElementById('click-toggle-btn'),
    saveBtn: document.getElementById('save-btn'),
    loadBtn: document.getElementById('load-btn'),
    saveStatus: document.getElementById('save-status'),
    menuBtn: document.getElementById('menu-btn'),
    prestigeAmount: document.getElementById('prestige-amount'),
    prestigeMult: document.getElementById('prestige-mult'),
    prestigeTitle: document.getElementById('prestige-title'),
    prestigeBtn: document.getElementById('prestige-btn'),
    prestigeProgress: document.getElementById('prestige-progress-fill'),
    prestigeShop: document.getElementById('prestige-shop'),
    zoneName: document.getElementById('zone-name'),
    zoneCost: document.getElementById('zone-cost'),
    unlockZoneBtn: document.getElementById('unlock-zone-btn'),
    showZoneBtn: document.getElementById('show-zone-btn'),
    mapZoneBtn: document.getElementById('map-zone-btn'),
    achievementsList: document.getElementById('achievements-list'),
    toastArea: document.getElementById('toasts'),
    zoneOverlay: document.getElementById('zone-overlay'),
    toolPagePrev: document.getElementById('tool-page-prev'),
    toolPageNext: document.getElementById('tool-page-next'),
    toolPageLabel: document.getElementById('tool-page-label'),
    mainMenu: document.getElementById('main-menu'),
    menuStartBtn: document.getElementById('menu-start-btn'),
    menuResetBtn: document.getElementById('menu-reset-btn'),
    mapModal: document.getElementById('map-modal'),
    mapContent: document.getElementById('map-content'),
    mapCloseBtn: document.getElementById('map-close-btn'),
    prestigeTitles: document.getElementById('prestige-titles'),
    prestigeTitlesPrev: document.getElementById('prestige-titles-prev'),
    prestigeTitlesNext: document.getElementById('prestige-titles-next'),
    prestigeTitlesPage: document.getElementById('prestige-titles-page'),
    prestigeShopPrev: document.getElementById('prestige-shop-prev'),
    prestigeShopNext: document.getElementById('prestige-shop-next'),
    prestigeShopPage: document.getElementById('prestige-shop-page'),
  };

  const toolUI = {};
  const toolPager = { page: 0, pageSize: 8, totalPages: 1, items: [] };
  let uiRenderQueued = false;
  const uiCache = { text: {}, disabled: {} };
  let achievementsDirty = true;
  let saveStatusTimer = null;
  const prestigeTitlesPager = { page: 0, pageSize: 5, totalPages: 1 };
  const prestigeShopPager = { page: 0, pageSize: 4, totalPages: 1 };

  // Initialize currency buckets per zone
  zones.forEach((zone, idx) => {
    const key = currencyKey(idx);
    state.currencies[key] = state.currencies[key] ?? 0;
  });

  Object.keys(toolCatalog).forEach(key => {
    state.tools[key] = createToolState(toolCatalog[key], key);
  });

  document.querySelectorAll('.tool').forEach(el => {
    const type = el.getAttribute('data-type');
    if (!type) return;
    toolUI[type] = {
      root: el,
      buyBtn: el.querySelector('.tool-btn'),
      costEl: el.querySelector('.cost'),
      levelEl: el.querySelector('.level'),
      upgradeBtns: el.querySelectorAll('.upgrade-btn'),
    };
  });
  setupToolPaging();

  bindUI();
  loadGame();
  recalcProduction();
  renderAchievements(true);
  updateUI();
  renderPrestigeShop();
  initDustCanvas();
  startLoop();
  showMenu();

  function createToolState(config, key) {
    return {
      cost: config.cost,
      baseCost: config.cost,
      increment: config.increment,
      kind: config.kind,
      level: 0,
      currencyZone: toolCurrencyZones[key] ?? config.currencyZone ?? 0,
      upgrades: { efficiency: 0, speed: 0, capacity: 0 },
    };
  }

  function bindUI() {
    // Unlock Web Audio on first user gesture to satisfy autoplay policies
    const unlockAudio = () => {
      const ctx = ensureAudioContext();
      ctx.resume().then(() => {
        audioEngine.unlocked = true;
        if (audioEngine.pendingStart && state.bgmOn) {
          audioEngine.pendingStart = false;
          startBgm();
        }
      }).catch(() => {
        audioEngine.unlocked = false;
      });
    };
    document.addEventListener('pointerdown', unlockAudio, { once: true });
    document.addEventListener('keydown', unlockAudio, { once: true });

    els.clickButton?.addEventListener('click', () => {
      handleClick();
    });

    Object.entries(toolUI).forEach(([type, ui]) => {
      ui.buyBtn?.addEventListener('click', () => buyTool(type));
      ui.upgradeBtns?.forEach(btn => {
        btn.addEventListener('click', () => {
          const upgrade = btn.getAttribute('data-upgrade');
          if (upgrade) buyUpgrade(type, upgrade);
        });
      });
    });

    els.unlockZoneBtn?.addEventListener('click', unlockZone);
    els.saveBtn?.addEventListener('click', saveGame);
    els.loadBtn?.addEventListener('click', () => {
      loadGame(true);
      updateUI();
      showToast('Save loaded.', 'info');
      showSaveStatus('Save loaded', 'ok');
    });
    els.showZoneBtn?.addEventListener('click', () => {
      const zone = zones[state.currentZoneIndex];
      showToast(`Current Zone: ${zone?.name || 'Unknown'}`, 'info');
    });
    els.mapZoneBtn?.addEventListener('click', () => {
      const zone = zones[state.currentZoneIndex];
      const map = buildZoneMap(zone?.name || 'Unknown', state.currentZoneIndex);
      if (els.mapContent && els.mapModal) {
        els.mapContent.textContent = map;
        els.mapModal.classList.remove('hidden');
      } else {
        showToast(map, 'info');
      }
    });
    els.mapCloseBtn?.addEventListener('click', () => {
      if (els.mapModal) els.mapModal.classList.add('hidden');
    });

    els.prestigeBtn?.addEventListener('click', doPrestige);

    els.bgmToggle?.addEventListener('click', () => {
      if (!audioEngine.unlocked) {
        const ctx = ensureAudioContext();
        ctx.resume().then(() => {
          audioEngine.unlocked = true;
          if (state.bgmOn) startBgm();
        }).catch(() => {});
      }
      state.bgmOn = !state.bgmOn;
      updateAudioUI();
      state.bgmOn ? startBgm() : stopBgm();
      showToast(`BGM ${state.bgmOn ? 'enabled' : 'muted'}.`, 'info');
    });
    els.clickToggle?.addEventListener('click', () => {
      state.clickSoundOn = !state.clickSoundOn;
      updateClickToggleUI();
    });
    els.menuBtn?.addEventListener('click', showMenu);
    els.menuStartBtn?.addEventListener('click', () => {
      hideMenu();
    });
    els.menuResetBtn?.addEventListener('click', () => {
      localStorage.removeItem(SAVE_KEY);
      window.location.reload();
    });
    updateAudioUI();
    updateClickToggleUI();
    renderToolPage();
    renderPrestigeTitles();
    els.prestigeTitlesPrev?.addEventListener('click', () => changePrestigeTitlesPage(-1));
    els.prestigeTitlesNext?.addEventListener('click', () => changePrestigeTitlesPage(1));
    els.prestigeShopPrev?.addEventListener('click', () => changePrestigeShopPage(-1));
    els.prestigeShopNext?.addEventListener('click', () => changePrestigeShopPage(1));
  }

  function handleClick() {
    if (state.inMenu) return;
    if (!audioEngine.unlocked) {
      const ctx = ensureAudioContext();
      ctx.resume().then(() => {
        audioEngine.unlocked = true;
      }).catch(() => {});
    }
    // Base click always goes to current zone
    addCurrency(state.currentZoneIndex, 1);
    // Distribute tool click power to their respective currencies
    Object.entries(state.currencyClicks || {}).forEach(([zone, amount]) => {
      if (amount > 0) addCurrency(Number(zone), amount);
    });
    state.totalClicks += 1;
    spawnParticle(true);
    maybePlayClick();
    checkAchievements();
    updateUI();
  }

  function buyTool(type) {
    const tool = state.tools[type];
    if (!tool) return;
    const key = currencyKey(tool.currencyZone ?? state.currentZoneIndex);
    const balance = state.currencies[key] || 0;
    if (balance < tool.cost) {
      showToast('Not enough dust.', 'warn');
      return;
    }
    state.currencies[key] = balance - tool.cost;
    tool.level += 1;
    tool.cost = Math.ceil(tool.cost * 1.18);
    recalcProduction();
    checkAchievements();
    updateUI();
    showToast(`${toolCatalog[type].label} upgraded to Lv.${tool.level}.`, 'success');
  }

  function buyUpgrade(type, upgrade) {
    const tool = state.tools[type];
    if (!tool || !tool.upgrades[upgrade] && tool.upgrades[upgrade] !== 0) return;
    const cost = getUpgradeCost(tool, upgrade);
    const key = currencyKey(tool.currencyZone ?? state.currentZoneIndex);
    const balance = state.currencies[key] || 0;
    if (balance < cost) {
      showToast('Not enough dust for upgrade.', 'warn');
      return;
    }
    state.currencies[key] = balance - cost;
    tool.upgrades[upgrade] += 1;
    recalcProduction();
    updateUI();
    showToast(`${capitalize(upgrade)} upgrade applied.`, 'success');
  }

  function getUpgradeCost(tool, upgrade) {
    const level = tool.upgrades[upgrade] ?? 0;
    return Math.ceil((tool.baseCost || tool.cost) * 0.6 * (level + 1));
  }

  function prestigeMult(keys) {
    return keys.reduce((mult, key) => {
      const lvl = state.prestigeUpgrades[key] || 0;
      const eff = prestigeUpgrades[key]?.effect || 0;
      return mult * (1 + lvl * eff);
    }, 1);
  }

  function recalcProduction() {
    const activeZone = state.currentZoneIndex;
    const addContribution = (map, zone, value) => {
      if (!Number.isFinite(value) || value <= 0) return;
      const z = zone ?? 0;
      map[z] = (map[z] || 0) + value;
      if (z !== activeZone) {
        map[activeZone] = (map[activeZone] || 0) + value;
      }
    };

    let dpc = 1;
    let passive = 0;
    let autoClicks = 0;
    const perCurrencyPassive = {};
    const perCurrencyAuto = {};
    const perCurrencyClick = {};

    Object.entries(state.tools).forEach(([key, tool]) => {
      const upgradeMult = 1 + (tool.upgrades.efficiency + tool.upgrades.speed + tool.upgrades.capacity) * 0.12;
      const output = tool.level * tool.increment * upgradeMult;
      const zone = tool.currencyZone ?? 0;
      if (tool.kind === 'click') {
        dpc += output;
        addContribution(perCurrencyClick, zone, output);
      } else if (tool.kind === 'passive') {
        passive += output;
        addContribution(perCurrencyPassive, zone, output);
      } else if (tool.kind === 'autoClick') {
        autoClicks += output;
        addContribution(perCurrencyAuto, zone, output); // clicks/sec for this currency
      }
    });

    state.dustPerClick = dpc;
    state.passivePerSecond = passive;
    state.autoClicksPerSecond = autoClicks;
    const prestigeClickMult = prestigeMult(['clickBoost', 'tapSurge']);
    const prestigePassiveMult = prestigeMult(['passiveBoost', 'tempoFlux']);
    const prestigeAutoMult = prestigeMult(['autoBoost', 'swarmOverclock']);
    const prestigeGlobalMult = prestigeMult(['globalBoost', 'macroEconomy']);
    state.dustPerClick = dpc * prestigeClickMult * prestigeGlobalMult;
    state.passivePerSecond = passive * prestigePassiveMult * prestigeGlobalMult;
    state.autoClicksPerSecond = autoClicks * prestigeAutoMult * prestigeGlobalMult;
    state.totalPerSecond = state.passivePerSecond + state.autoClicksPerSecond * state.dustPerClick;
    state.currencyPerSecond = {};
    state.currencyClicks = perCurrencyClick;
    const allZones = new Set([...Object.keys(perCurrencyPassive), ...Object.keys(perCurrencyAuto)]);
    allZones.forEach(zone => {
      const z = Number(zone);
      const passiveContribution = perCurrencyPassive[z] || 0;
      const autoContribution = (perCurrencyAuto[z] || 0) * dpc;
      state.currencyPerSecond[z] = passiveContribution * prestigePassiveMult + autoContribution * prestigeAutoMult;
    });
  }

  function prestigeAvailable() {
    const effective = Math.max(0, state.lifetimeDust - 50000); // first 50k is free runway
    const baseGain = Math.pow(effective / 150000, 0.7);
    const gainMult = prestigeMult(['prestigeYield', 'windfall']);
    return Math.floor(baseGain * gainMult);
  }

  function doPrestige() {
    const gain = prestigeAvailable();
    if (gain <= 0) {
      showToast('Earn more dust before prestiging.', 'warn');
      return;
    }
    state.prestige += gain;
    state.dust = 0;
    state.currencies = {};
    zones.forEach((_, idx) => {
      state.currencies[currencyKey(idx)] = 0;
    });
    state.totalDustEarned = 0;
    state.lifetimeDust = 0;
    state.totalClicks = 0;
    state.currentZoneIndex = 0;
    Object.keys(state.tools).forEach(key => {
      state.tools[key] = createToolState(toolCatalog[key], key);
    });
    recalcProduction();
    updateUI();
    checkAchievements();
    showToast(`Prestiged! +${gain} prestige earned.`, 'success');
    saveGame();
  }

  function unlockZone() {
    const nextZone = zones[state.currentZoneIndex + 1];
    if (!nextZone) return;
    const key = currencyKey(state.currentZoneIndex);
    const balance = state.currencies[key] || 0;
    if (balance < nextZone.cost) {
      showToast('You need more dust to unlock the next zone.', 'warn');
      return;
    }
    state.currencies[key] = balance - nextZone.cost;
    state.currentZoneIndex += 1;
    // Ensure next zone currency bucket exists
    const newKey = currencyKey(state.currentZoneIndex);
    state.currencies[newKey] = state.currencies[newKey] ?? 0;
    updateUI();
    showToast(`Unlocked ${zones[state.currentZoneIndex].name}!`, 'success');
  }

  function addCurrency(zoneIndex, amount) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const zone = zones[zoneIndex] || {};
    const prestigeZoneMult = prestigeMult(['zoneBonus', 'cartography']);
    const gained = amount * getPrestigeMultiplier() * getAchievementMultiplier() * (1 + (zone.bonus || 0) + (prestigeZoneMult - 1));
    const key = currencyKey(zoneIndex);
    state.currencies[key] = (state.currencies[key] || 0) + gained;
    state.dust += gained; // legacy total for save compatibility
    state.totalDustEarned += gained;
    state.lifetimeDust += gained;
  }

  function addDust(amount) {
    addCurrency(state.currentZoneIndex, amount);
  }

  function updateUI() {
    if (uiRenderQueued) return;
    uiRenderQueued = true;
    requestAnimationFrame(() => {
      uiRenderQueued = false;
      renderUI();
    });
  }

  function renderUI() {
    const totalPerSecond = state.totalPerSecond || 0;
    const autoPerSecond = state.autoClicksPerSecond || 0;
    const activeCurrencyLabel = getCurrencyLabel(state.currentZoneIndex);
    const activeDust = getCurrencyBalance(state.currentZoneIndex);

    setText(els.dustAmount, 'dust-amount', formatNumber(activeDust, 0));
    setText(els.currencyLabel, 'currency-label', activeCurrencyLabel);
    setText(els.dpc, 'dust-per-click', formatNumber(state.dustPerClick, 1));
    setText(els.dps, 'dust-per-second', formatNumber(totalPerSecond, 1));
    setText(els.autoCps, 'auto-cps', formatNumber(autoPerSecond, 1));

    Object.entries(toolUI).forEach(([type, ui]) => {
      const tool = state.tools[type];
      if (!tool) return;
      const toolCurrencyLabel = getCurrencyLabel(tool.currencyZone ?? 0);
      const toolBalance = getCurrencyBalance(tool.currencyZone ?? 0);
      setText(ui.costEl, `tool-${type}-cost`, `${formatNumber(tool.cost, 0)} ${toolCurrencyLabel}`);
      setText(ui.levelEl, `tool-${type}-level`, tool.level);
      setDisabled(ui.buyBtn, `tool-${type}-buy`, toolBalance < tool.cost);
      ui.upgradeBtns?.forEach(btn => {
        const upgrade = btn.getAttribute('data-upgrade');
        if (!upgrade) return;
        const upCost = getUpgradeCost(tool, upgrade);
        setDisabled(btn, `tool-${type}-upgrade-${upgrade}`, toolBalance < upCost);
        setText(btn, `tool-${type}-upgrade-${upgrade}-label`, `${capitalize(upgrade)} (${formatNumber(upCost, 0)} ${toolCurrencyLabel})`);
      });
    });

    const currentZone = zones[state.currentZoneIndex];
    const nextZone = zones[state.currentZoneIndex + 1];
    setText(els.zoneName, 'zone-name', currentZone?.name || 'Unknown');
    if (nextZone) {
      const zoneCurrencyLabel = getCurrencyLabel(state.currentZoneIndex);
      setText(els.zoneCost, 'zone-cost', `${formatNumber(nextZone.cost, 0)} ${zoneCurrencyLabel}`);
      setDisabled(els.unlockZoneBtn, 'unlock-zone', activeDust < nextZone.cost);
    } else {
      setText(els.zoneCost, 'zone-cost', 'Maxed');
      setDisabled(els.unlockZoneBtn, 'unlock-zone', true);
    }

    setText(els.prestigeAmount, 'prestige-amount', state.prestige);
    const multBonus = Math.round((getPrestigeMultiplier() - 1) * 100);
    const gainReady = prestigeAvailable();
    setText(els.prestigeMult, 'prestige-mult', `(+${multBonus}% | +${gainReady} ready)`);
    setDisabled(els.prestigeBtn, 'prestige-btn', gainReady <= 0);
    updatePrestigeProgress(gainReady);
    updatePrestigeTitleUI();

    renderAchievements();
    renderCurrencies();
    renderPrestigeTitles();
  }

  function renderAchievements(force = false) {
    if (!els.achievementsList) return;
    if (!force && !achievementsDirty) return;
    achievementsDirty = false;
    const frag = document.createDocumentFragment();
    achievementDefs.forEach(def => {
      const unlockedState = state.achievements[def.id];
      const unlocked = !!(unlockedState?.unlocked ?? unlockedState);
      const row = document.createElement('div');
      row.className = `achievement ${unlocked ? 'unlocked' : 'locked'}`;
      const title = document.createElement('div');
      title.textContent = def.label;
      const desc = document.createElement('span');
      const rewardText = def.reward ? ` • Reward: ${describeReward(def.reward)}` : '';
      desc.textContent = `${def.description}${rewardText}`;
      row.appendChild(title);
      row.appendChild(desc);
      frag.appendChild(row);
    });
    els.achievementsList.replaceChildren(frag);
  }

  function checkAchievements() {
    let unlockedAny = false;
    achievementDefs.forEach(def => {
      const prior = state.achievements[def.id];
      const already = prior?.unlocked ?? prior === true;
      if (!already && def.test()) {
        state.achievements[def.id] = { unlocked: true };
        applyAchievementReward(def);
        unlockedAny = true;
        showToast(`Achievement unlocked: ${def.label}`, 'success');
      }
    });
    if (unlockedAny) {
      achievementsDirty = true;
      renderAchievements();
    }
  }

  function loadGame(showToastMessage = false) {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      state.dust = data.dust ?? state.dust; // legacy sum
      state.currencies = data.currencies || state.currencies || {};
      state.currencyPerSecond = data.currencyPerSecond || {};
      state.currencyClicks = data.currencyClicks || {};
      state.totalDustEarned = data.totalDustEarned ?? state.totalDustEarned;
      state.lifetimeDust = data.lifetimeDust ?? state.lifetimeDust;
      state.totalClicks = data.totalClicks ?? state.totalClicks;
      state.prestige = data.prestige ?? state.prestige;
      state.prestigeTitleIndex = data.prestigeTitleIndex ?? state.prestigeTitleIndex ?? 0;
      state.achievementMultiplier = data.achievementMultiplier ?? state.achievementMultiplier;
      state.currentZoneIndex = data.currentZoneIndex ?? state.currentZoneIndex;
      state.bgmOn = data.bgmOn ?? state.bgmOn;
      state.clickSoundOn = data.clickSoundOn ?? state.clickSoundOn;
      state.achievements = data.achievements ?? state.achievements;

      if (data.tools) {
        Object.keys(toolCatalog).forEach(key => {
          const incoming = data.tools[key];
          if (incoming) {
            state.tools[key] = {
              ...createToolState(toolCatalog[key], key),
              ...incoming,
              currencyZone: incoming.currencyZone ?? toolCurrencyZones[key] ?? 0,
              upgrades: { ...createToolState(toolCatalog[key], key).upgrades, ...incoming.upgrades },
            };
          }
        });
      }

      // Migrate legacy dust into Zone 1 currency if needed
      const zone0Key = currencyKey(0);
      if (!data.currencies && state.dust > 0) {
        state.currencies[zone0Key] = (state.currencies[zone0Key] || 0) + state.dust;
      }

      recalcProduction();

      // Ensure new currency buckets exist for any newly added zones
      zones.forEach((_, idx) => {
        const key = currencyKey(idx);
        state.currencies[key] = state.currencies[key] ?? 0;
      });
      state.prestigeUpgrades = data.prestigeUpgrades || {};

      if (data.lastUpdate) {
        const elapsed = Math.min(Date.now() - data.lastUpdate, MAX_OFFLINE_MS);
        if (elapsed > 0) {
          const secs = elapsed / 1000;
          const gains = [];
          Object.entries(state.currencyPerSecond || {}).forEach(([zone, perSec]) => {
            const gain = perSec * secs;
            if (gain > 0) {
              addCurrency(Number(zone), gain);
              gains.push(gain);
            }
          });
          const totalGain = gains.reduce((a, b) => a + b, 0);
          if (totalGain > 0 && showToastMessage) {
            showToast(`Idle gains: +${formatNumber(totalGain, 0)} dust (multi-zone).`, 'info');
          }
        }
      }
    } catch (err) {
      console.error('Failed to load save', err);
      showToast('Load failed (corrupt or blocked storage).', 'warn');
      showSaveStatus('Load failed', 'warn');
    }
    achievementsDirty = true;
    renderAchievements();
    updateAudioUI();
    updateClickToggleUI();
  }

  function saveGame() {
    const payload = {
      dust: state.dust,
      totalDustEarned: state.totalDustEarned,
      lifetimeDust: state.lifetimeDust,
      totalClicks: state.totalClicks,
      prestige: state.prestige,
      achievementMultiplier: state.achievementMultiplier,
      currentZoneIndex: state.currentZoneIndex,
      bgmOn: state.bgmOn,
      clickSoundOn: state.clickSoundOn,
      tools: state.tools,
      achievements: state.achievements,
      lastUpdate: Date.now(),
      currencies: state.currencies,
      currencyPerSecond: state.currencyPerSecond,
      prestigeUpgrades: state.prestigeUpgrades,
      currencyClicks: state.currencyClicks,
      prestigeTitleIndex: state.prestigeTitleIndex,
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      showToast('Game saved.', 'success');
      showSaveStatus('Saved just now', 'ok');
    } catch (err) {
      console.error('Save failed', err);
      showToast('Save failed (storage full or blocked).', 'warn');
      showSaveStatus('Save failed', 'warn');
    }
  }

  function startLoop() {
    state.lastUpdate = Date.now();
    requestAnimationFrame(dustFrame);
    setInterval(() => {
      const now = Date.now();
      const delta = (now - state.lastUpdate) / 1000;
      state.lastUpdate = now;
      if (delta <= 0) return;
      Object.entries(state.currencyPerSecond || {}).forEach(([zone, perSec]) => {
        const amt = perSec * delta;
        if (amt > 0) addCurrency(Number(zone), amt);
      });
      updateUI();
    }, 250);
  }

  function updateAudioUI() {
    if (!els.bgmToggle) return;
    els.bgmToggle.classList.toggle('active', state.bgmOn);
    els.bgmToggle.textContent = `BGM: ${state.bgmOn ? 'On' : 'Off'}`;
  }

  function currencyKey(zoneIndex) {
    return `zone_${zoneIndex}`;
  }

  function getCurrencyLabel(zoneIndex) {
    return zones[zoneIndex]?.currency || 'Dust';
  }

  function getCurrencyBalance(zoneIndex) {
    return state.currencies[currencyKey(zoneIndex)] || 0;
  }

  function updateClickToggleUI() {
    if (!els.clickToggle) return;
    els.clickToggle.classList.toggle('active', state.clickSoundOn);
    els.clickToggle.textContent = `Click: ${state.clickSoundOn ? 'On' : 'Off'}`;
  }

  function spawnParticle(force = false) {
    if (!els.zoneOverlay) return;
    if (!force && !state.clickSoundOn) return;
    const val = formatNumber(state.dustPerClick * (1 + state.prestige * 0.1), 0);

    // Floating numeric bubble
    const bubble = document.createElement('div');
    bubble.className = 'particle';
    bubble.textContent = `+${val}`;
    bubble.style.left = `${Math.random() * 70 + 15}%`;
    bubble.style.top = `${Math.random() * 50 + 35}%`;
    bubble.style.color = '#7ff3ea';
    bubble.style.fontWeight = '700';
    bubble.style.textShadow = '0 0 8px rgba(127,243,234,0.35)';
    els.zoneOverlay.appendChild(bubble);
    requestAnimationFrame(() => {
      bubble.style.transform = 'translate(-50%, -80%) scale(1.05)';
      bubble.style.opacity = '0';
    });
    setTimeout(() => bubble.remove(), 650);

    // Burst ring
    const burst = document.createElement('div');
    burst.className = 'sweep-burst';
    burst.style.left = '50%';
    burst.style.top = '55%';
    els.zoneOverlay.appendChild(burst);
    setTimeout(() => burst.remove(), 650);

    // Arc trail
    const arc = document.createElement('div');
    arc.className = 'sweep-arc';
    arc.style.left = '50%';
    arc.style.top = '55%';
    arc.style.transform = `translate(-50%,-30%) rotate(${Math.random() * 24 - 12}deg)`;
    els.zoneOverlay.appendChild(arc);
    setTimeout(() => arc.remove(), 620);
  }

  function showToast(message, variant = 'info') {
    if (!els.toastArea) return;
    const toast = document.createElement('div');
    toast.className = `toast ${variant}`;
    toast.textContent = message;
    els.toastArea.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  function initDustCanvas() {
    const bg = document.getElementById('zone-bg');
    const canvas = document.getElementById('zone-canvas');
    if (!bg || !canvas) return;
    dustFX.canvas = canvas;
    dustFX.ctx = canvas.getContext('2d');
    const resize = () => {
      const { clientWidth, clientHeight } = bg;
      dustFX.width = canvas.width = Math.max(1, clientWidth * window.devicePixelRatio);
      dustFX.height = canvas.height = Math.max(1, clientHeight * window.devicePixelRatio);
      canvas.style.width = `${clientWidth}px`;
      canvas.style.height = `${clientHeight}px`;
    };
    resize();
    window.addEventListener('resize', resize);
  }

  function spawnDustParticle() {
    if (!dustFX.ctx) return;
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * (Math.min(dustFX.width, dustFX.height) * 0.35) + 20;
    const startX = dustFX.width / 2 + Math.cos(angle) * radius;
    const startY = dustFX.height / 2 + Math.sin(angle) * radius;
    const targetX = dustFX.width * (0.35 + Math.random() * 0.3);
    const targetY = dustFX.height * (0.35 + Math.random() * 0.3);
    dustFX.particles.push({
      startX,
      startY,
      targetX,
      targetY,
      life: 1400 + Math.random() * 900,
      age: 0,
      size: 1 + Math.random() * 1.8,
      hue: 160 + Math.random() * 60,
      phase: Math.random() * Math.PI * 2,
      trail: Math.random() < 0.18, // some leave trails
      sparkle: Math.random() < 0.2, // some flicker
    });
  }

  function dustFrame(ts) {
    if (!dustFX.ctx) return;
    if (!dustFX.lastSpawn) dustFX.lastSpawn = ts;
    const ctx = dustFX.ctx;
    const dt = ts - (dustFX.lastTs || ts);
    dustFX.lastTs = ts;

    // spawn
    if (dustFX.particles.length < dustFX.max && ts - dustFX.lastSpawn > 22) {
      const batch = 5 + Math.floor(Math.random() * 3);
      for (let i = 0; i < batch; i++) spawnDustParticle();
      dustFX.lastSpawn = ts;
    }

    ctx.clearRect(0, 0, dustFX.width, dustFX.height);
    dustFX.particles = dustFX.particles.filter(p => {
      p.age += dt;
      const t = Math.min(1, p.age / p.life);
      const osc = 0.5 - 0.5 * Math.cos((Math.PI * 2 * t) + p.phase);
      const x = p.startX + (p.targetX - p.startX) * osc;
      const y = p.startY + (p.targetY - p.startY) * osc;
      const alpha = (1 - t) * 0.7;
      if (alpha <= 0) return false;
      const size = p.size * (p.sparkle ? 2 + Math.sin(ts * 0.02 + p.phase) * 0.4 : 3);
      const grad = ctx.createRadialGradient(x, y, 0, x, y, size);
      grad.addColorStop(0, `hsla(${p.hue},80%,70%,${alpha})`);
      grad.addColorStop(1, `hsla(${p.hue},80%,40%,0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();

      // optional trailing shimmer
      if (p.trail && alpha > 0.1) {
        const tx = p.startX + (p.targetX - p.startX) * (0.5 - 0.5 * Math.cos((Math.PI * 2 * Math.min(1, (p.age - 80) / p.life)) + p.phase));
        const ty = p.startY + (p.targetY - p.startY) * (0.5 - 0.5 * Math.cos((Math.PI * 2 * Math.min(1, (p.age - 80) / p.life)) + p.phase));
        const tAlpha = alpha * 0.35;
        ctx.strokeStyle = `hsla(${p.hue},80%,70%,${tAlpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
      }
      return p.age < p.life;
    });
    requestAnimationFrame(dustFrame);
  }
  function renderPrestigeShop() {
    if (!els.prestigeShop) return;
    const frag = document.createDocumentFragment();
    const entries = Object.entries(prestigeUpgrades);
    prestigeShopPager.totalPages = Math.max(1, Math.ceil(entries.length / prestigeShopPager.pageSize));
    prestigeShopPager.page = Math.max(0, Math.min(prestigeShopPager.page, prestigeShopPager.totalPages - 1));
    const start = prestigeShopPager.page * prestigeShopPager.pageSize;
    const slice = entries.slice(start, start + prestigeShopPager.pageSize);
    slice.forEach(([key, config]) => {
      const row = document.createElement('div');
      row.className = 'prestige-upgrade';
      const title = document.createElement('div');
      title.className = 'prestige-title';
      title.textContent = config.label;
      const desc = document.createElement('div');
      desc.className = 'prestige-desc';
      const level = state.prestigeUpgrades[key] || 0;
      const cost = config.cost * (1 + level);
      desc.textContent = `${config.description} (Lv.${level})`;
      const meta = document.createElement('div');
      meta.className = 'prestige-meta';
      const costTag = document.createElement('span');
      costTag.textContent = `${cost} ⚡`;
      costTag.style.color = state.prestige < cost ? '#ffb3b3' : '#7ff3ea';
      const btn = document.createElement('button');
      btn.className = 'control-btn';
      btn.textContent = 'Buy';
      btn.disabled = state.prestige < cost;
      btn.addEventListener('click', () => {
        if (state.prestige < cost) return;
        state.prestige -= cost;
        state.prestigeUpgrades[key] = level + 1;
        recalcProduction();
        updateUI();
        renderPrestigeShop();
        showToast(`${config.label} upgraded to Lv.${level + 1}`, 'success');
      });
      meta.appendChild(costTag);
      meta.appendChild(btn);
      row.appendChild(title);
      row.appendChild(desc);
      row.appendChild(meta);
      frag.appendChild(row);
    });
    els.prestigeShop.replaceChildren(frag);
    if (els.prestigeShopPage) {
      els.prestigeShopPage.textContent = `${prestigeShopPager.page + 1}/${prestigeShopPager.totalPages}`;
    }
    if (els.prestigeShopPrev) els.prestigeShopPrev.disabled = prestigeShopPager.page === 0;
    if (els.prestigeShopNext) els.prestigeShopNext.disabled = prestigeShopPager.page >= prestigeShopPager.totalPages - 1;
  }

  function toggleCurrencyPanel(show) {
    renderCurrencies();
  }

  function showSaveStatus(message, variant = 'ok') {
    if (!els.saveStatus) return;
    els.saveStatus.textContent = message;
    els.saveStatus.classList.toggle('warn', variant === 'warn');
    els.saveStatus.classList.remove('hidden');
    els.saveStatus.classList.add('visible');
    if (saveStatusTimer) clearTimeout(saveStatusTimer);
    saveStatusTimer = setTimeout(() => {
      els.saveStatus.classList.remove('visible');
      els.saveStatus.classList.add('hidden');
    }, 2500);
  }

  function renderCurrencies() {
    if (!els.currencyList) return;
    if (els.currencyPanel?.classList.contains('hidden')) return;
    const frag = document.createDocumentFragment();
    zones.forEach((zone, idx) => {
      const row = document.createElement('div');
      row.className = 'currency-chip';
      const name = document.createElement('span');
      name.className = 'currency-name';
      name.textContent = zone.currency || 'Dust';
      const value = document.createElement('span');
      value.className = 'currency-value';
      const balance = getCurrencyBalance(idx);
      const perSec = (state.currencyPerSecond && state.currencyPerSecond[idx]) || 0;
      value.textContent = formatNumber(balance, 0);
      const per = document.createElement('span');
      per.className = 'currency-per';
      per.textContent = `+${formatNumber(perSec, 1)}/s`;
      row.appendChild(name);
      row.appendChild(value);
      row.appendChild(per);
      frag.appendChild(row);
    });
    els.currencyList.replaceChildren(frag);
  }

  function getPrestigeMultiplier() {
    const base = 1 + state.prestige * 0.12;
    const bonus = Math.sqrt(state.prestige) * 0.05;
    const shopMult = prestigeMult(['globalBoost', 'macroEconomy']);
    return (base + bonus) * shopMult;
  }

  function updatePrestigeTitleUI() {
    if (!els.prestigeTitle) return;
    const idx = getCurrentPrestigeTitleIndex();
    if (idx > state.prestigeTitleIndex) {
      state.prestigeTitleIndex = idx;
      showToast(`Title earned: ${prestigeTitles[idx]}`, 'success');
    }
    setText(els.prestigeTitle, 'prestige-title', prestigeTitles[idx]);
    const grad = prestigeTitleGradients[idx] || prestigeTitleGradients[prestigeTitleGradients.length - 1];
    els.prestigeTitle.style.backgroundImage = grad;
    els.prestigeTitle.style.webkitBackgroundClip = 'text';
    els.prestigeTitle.style.webkitTextFillColor = 'transparent';
    els.prestigeTitle.style.backgroundSize = '120% 120%';
  }

  function getCurrentPrestigeTitleIndex() {
    const idx = Math.floor(state.prestige / 10);
    return Math.min(idx, prestigeTitles.length - 1);
  }

  function renderPrestigeTitles() {
    if (!els.prestigeTitles) return;
    prestigeTitlesPager.totalPages = Math.max(1, Math.ceil(prestigeTitles.length / prestigeTitlesPager.pageSize));
    prestigeTitlesPager.page = Math.max(0, Math.min(prestigeTitlesPager.page, prestigeTitlesPager.totalPages - 1));
    const start = prestigeTitlesPager.page * prestigeTitlesPager.pageSize;
    const slice = prestigeTitles.slice(start, start + prestigeTitlesPager.pageSize);
    const frag = document.createDocumentFragment();
    slice.forEach((title, i) => {
      const globalIdx = start + i;
      const row = document.createElement('div');
      row.className = 'prestige-title-item';
      const locked = globalIdx > getCurrentPrestigeTitleIndex();
      const titleSpan = document.createElement('span');
      titleSpan.className = 'title-text';
      titleSpan.textContent = locked ? '???' : title;
      const gradient = prestigeTitleGradients[globalIdx] || prestigeTitleGradients[prestigeTitleGradients.length - 1];
      titleSpan.style.backgroundImage = locked ? 'linear-gradient(90deg,#9aa5b4,#c7d1dd)' : gradient;
      titleSpan.style.webkitBackgroundClip = 'text';
      titleSpan.style.webkitTextFillColor = 'transparent';
      titleSpan.style.backgroundSize = '120% 120%';
      const levelSpan = document.createElement('span');
      levelSpan.className = 'title-level';
      levelSpan.textContent = locked ? `Prestige ${globalIdx * 10}` : `#${globalIdx + 1}`;
      row.appendChild(titleSpan);
      row.appendChild(levelSpan);
      frag.appendChild(row);
    });
    els.prestigeTitles.replaceChildren(frag);
    if (els.prestigeTitlesPage) {
      els.prestigeTitlesPage.textContent = `${prestigeTitlesPager.page + 1}/${prestigeTitlesPager.totalPages}`;
    }
    if (els.prestigeTitlesPrev) els.prestigeTitlesPrev.disabled = prestigeTitlesPager.page === 0;
    if (els.prestigeTitlesNext) els.prestigeTitlesNext.disabled = prestigeTitlesPager.page >= prestigeTitlesPager.totalPages - 1;
  }

  function changePrestigeTitlesPage(delta) {
    prestigeTitlesPager.page = Math.max(0, Math.min(prestigeTitlesPager.page + delta, prestigeTitlesPager.totalPages - 1));
    renderPrestigeTitles();
  }

  function changePrestigeShopPage(delta) {
    prestigeShopPager.page = Math.max(0, Math.min(prestigeShopPager.page + delta, prestigeShopPager.totalPages - 1));
    renderPrestigeShop();
  }

  function getAchievementMultiplier() {
    return state.achievementMultiplier || 1;
  }

  function updatePrestigeProgress(gainReady) {
    if (!els.prestigeProgress) return;
    const currentGain = gainReady;
    const currentThreshold = currentGain > 0 ? Math.pow(currentGain, 1 / 0.7) * 150000 + 50000 : 50000;
    const nextThreshold = Math.pow(currentGain + 1, 1 / 0.7) * 150000 + 50000;
    const progress = Math.max(0, Math.min(1, (state.lifetimeDust - currentThreshold) / (nextThreshold - currentThreshold)));
    els.prestigeProgress.style.width = `${(progress * 100).toFixed(1)}%`;
  }

  function applyAchievementReward(def) {
    if (!def.reward) return;
    const { type, value } = def.reward;
    if (type === 'dust') {
      addDust(value);
    } else if (type === 'prestige') {
      state.prestige += value;
    } else if (type === 'mult') {
      state.achievementMultiplier = (state.achievementMultiplier || 1) * (1 + value);
    }
    recalcProduction();
    updateUI();
  }

  function describeReward(reward) {
    if (!reward) return '';
    if (reward.type === 'dust') return `+${formatNumber(reward.value, 0)} dust`;
    if (reward.type === 'prestige') return `+${reward.value} prestige`;
    if (reward.type === 'mult') return `+${Math.round(reward.value * 100)}% boost`;
    return '';
  }

  function buildZoneMap(name, idx) {
    const icons = ['□','■','▲','◆','●','⊙','✦','✧'];
    const innerW = 32;
    const innerH = 14;
    const cx = (innerW - 1) / 2;
    const cy = (innerH - 1) / 2;
    let seed = (idx + 1) * 1234567;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };

    // Galaxy meta (seeded per zone)
    const gx = innerW * (0.25 + rng() * 0.5);
    const gy = innerH * (0.3 + rng() * 0.4);
    const gRadius = 4 + rng() * 3;
    const arms = 3 + Math.floor(rng() * 2);

    const rows = [];
    for (let r = 0; r < innerH; r++) {
      let line = '';
      for (let c = 0; c < innerW; c++) {
        const dist = Math.hypot(r - cy, c - cx);
        const warp = Math.sin((r + idx) * 0.4) + Math.cos((c + idx) * 0.35);
        const lane = (r === Math.floor(cy) || c === Math.floor(cx));

        // Galaxy arm math
        const gd = Math.hypot(r - gy, c - gx);
        const gAngle = Math.atan2(r - gy, c - gx);
        const armWave = Math.sin(gAngle * arms + gd * 0.4);
        const inGalaxy = gd < gRadius + armWave * 0.9;

        // glyph selection
        let glyph;
        if (r === Math.floor(cy) && c === Math.floor(cx)) glyph = '◎';
        else if (dist < 2.8) glyph = '╬';
        else if (inGalaxy && gd < gRadius * 0.55) glyph = '@';
        else if (inGalaxy && gd < gRadius + 2) glyph = icons[(idx + r + c) % icons.length];
        else if (dist + warp * 1.5 < 4.4) glyph = icons[(idx + r * 3 + c * 2) % icons.length];
        else if (lane && dist < 8.5) glyph = '=';
        else if (dist + warp * 1.2 < 6.4) glyph = '*';
        else if (dist + warp < 9.4) glyph = '~';
        else {
          const hash = (r * 37 + c * 17 + idx * 11) % 10;
          glyph = hash < 5 ? '.' : hash < 8 ? '·' : '+';
        }
        line += glyph;
      }
      rows.push(line);
    }

    const top = '┌' + '─'.repeat(innerW) + '┐';
    const bottom = '└' + '─'.repeat(innerW) + '┘';
    const framed = rows.map(row => `│${row}│`);
    const legend = [
      '◎ You  ╬ Core  @ Galaxy  □/■/▲/◆ Landmarks  ✦/✧ Stars',
      '= Warp lanes  * Debris  ~ Dust wisps  ·/+/· Space'
    ].join('\n');
    return `${name} [Zone ${idx + 1}]\n${legend}\n${top}\n${framed.join('\n')}\n${bottom}`;
  }

  function showMenu() {
    state.inMenu = true;
    if (els.mainMenu) els.mainMenu.classList.remove('hidden');
  }

  function hideMenu() {
    state.inMenu = false;
    if (els.mainMenu) els.mainMenu.classList.add('hidden');
  }

  // --- Tool pagination ---
  function setupToolPaging() {
    toolPager.items = Array.from(document.querySelectorAll('.tools-grid .tool'));
    toolPager.totalPages = Math.max(1, Math.ceil(toolPager.items.length / toolPager.pageSize));
    els.toolPagePrev?.addEventListener('click', () => {
      if (toolPager.page > 0) {
        toolPager.page -= 1;
        renderToolPage();
      }
    });
    els.toolPageNext?.addEventListener('click', () => {
      if (toolPager.page < toolPager.totalPages - 1) {
        toolPager.page += 1;
        renderToolPage();
      }
    });
    renderToolPage();
  }

  function renderToolPage() {
    const start = toolPager.page * toolPager.pageSize;
    const end = start + toolPager.pageSize;
    toolPager.items.forEach((el, idx) => {
      el.style.display = idx >= start && idx < end ? 'flex' : 'none';
    });
    if (els.toolPageLabel) {
      els.toolPageLabel.textContent = `Page ${toolPager.page + 1}/${toolPager.totalPages}`;
    }
    if (els.toolPagePrev) els.toolPagePrev.disabled = toolPager.page === 0;
    if (els.toolPageNext) els.toolPageNext.disabled = toolPager.page >= toolPager.totalPages - 1;
  }

  function maybePlayClick() {
    if (!state.clickSoundOn) return;
    const ctx = ensureAudioContext();
    // Try to resume if not yet unlocked; click gesture should satisfy autoplay policy.
    if (!audioEngine.unlocked && ctx.state === 'suspended') {
      ctx.resume().then(() => {
        audioEngine.unlocked = true;
        playClickTone(ctx);
      }).catch(() => {});
      return;
    }
    playClickTone(ctx);
  }

  function playClickTone(ctx) {
    const now = ctx.currentTime;
    const oscA = ctx.createOscillator(); // fundamental
    const oscB = ctx.createOscillator(); // harmonic sparkle
    const noise = ctx.createBufferSource();
    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.25;
    noise.buffer = noiseBuffer;

    const gain = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1400, now);
    lp.frequency.exponentialRampToValueAtTime(800, now + 0.09);

    oscA.type = 'sine';
    oscB.type = 'square';
    oscA.frequency.setValueAtTime(520, now);
    oscB.frequency.setValueAtTime(820, now);
    oscA.frequency.exponentialRampToValueAtTime(280, now + 0.12);
    oscB.frequency.exponentialRampToValueAtTime(420, now + 0.1);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.1, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.00025, now + 0.16);

    oscA.connect(gain);
    oscB.connect(gain);
    noise.connect(gain);
    gain.connect(lp).connect(ctx.destination); // send directly, independent of BGM pump

    oscA.start(now);
    oscB.start(now);
    noise.start(now);
    oscA.stop(now + 0.18);
    oscB.stop(now + 0.16);
    noise.stop(now + 0.07);
  }

  // --- Coded music via Web Audio ---
  function ensureAudioContext() {
    if (audioEngine.ctx) return audioEngine.ctx;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain();
    const pump = ctx.createGain();
    master.gain.value = 0.22;
    pump.gain.value = 1;
    master.connect(pump).connect(ctx.destination);
    audioEngine.ctx = ctx;
    audioEngine.master = master;
    audioEngine.pump = pump;
    return ctx;
  }

  function startBgm() {
    if (!audioEngine.unlocked) {
      audioEngine.pendingStart = true;
      return;
    }
    const ctx = ensureAudioContext();
    stopBgm(); // clear old loops
    audioEngine.beatIndex = 0;
    audioEngine.chordIndex = 0;
    audioEngine.presetIndex = 0;
    audioEngine.barCount = 0;
    scheduleLoop();
  }

  function stopBgm() {
    if (audioEngine.loopId) {
      clearInterval(audioEngine.loopId);
      audioEngine.loopId = null;
    }
  }

  function scheduleLoop() {
    const presetIds = ['aurora', 'eclipse'];
    const preset = presets[presetIds[audioEngine.presetIndex % presetIds.length]];
    const secondsPerBeat = 60 / preset.tempo;
    const step = () => {
      const ctx = ensureAudioContext();
      const t = ctx.currentTime;
      const totalBeats = preset.chordLengthBeats * (preset.chordRoots?.length || 4);
      const beat = audioEngine.beatIndex % totalBeats;
      const useAlt = (audioEngine.barCount % 8) >= 4;
      const breakdown = (audioEngine.barCount % 16) === 12; // softer last 4 bars of a 16-bar block
      const chordRoots = useAlt ? (preset.altChordRoots || preset.chordRoots) : preset.chordRoots;
      const hatPattern = useAlt ? (preset.altHat || preset.hat) : preset.hat;
      const hatOpenPattern = useAlt ? (preset.altHatOpen || preset.hatOpen) : preset.hatOpen;
      const bassLine = useAlt ? (preset.altBassLine || preset.bassLine) : preset.bassLine;
      const arpSteps = useAlt ? (preset.altArpSteps || preset.arpSteps) : preset.arpSteps;
      // Kick
      if (preset.kick.includes(beat)) triggerDrum(ctx, 'kick', t);
      // Snare
      if (!breakdown && preset.snare.includes(beat)) triggerDrum(ctx, 'snare', t);
      // Hat
      if (!breakdown && hatPattern?.includes(beat)) triggerDrum(ctx, 'hat', t);
      // Open hat on offbeats for bounce
      if (!breakdown && hatOpenPattern?.includes(beat)) triggerDrum(ctx, 'hatOpen', t);
      // Bass
      if (preset.bassBeats.includes(beat)) {
        const note = bassLine[beat % bassLine.length];
        if (note !== null && note !== undefined) {
          const bassTime = breakdown ? t + 0.02 : t;
          triggerBass(ctx, note, preset.bassBase, bassTime);
        }
      }
      // Chord/arp at start of each bar
      if (beat % preset.chordLengthBeats === 0) {
        const chordSlot = (audioEngine.beatIndex / preset.chordLengthBeats) % (chordRoots?.length || 1);
        const chord = preset.chords[audioEngine.chordIndex % preset.chords.length];
        const rootSemi = chordRoots?.[Math.floor(chordSlot)] || 0;
        const chordBase = preset.baseFreq * Math.pow(2, (rootSemi || 0) / 12);
        const chordDur = breakdown
          ? secondsPerBeat * (preset.chordLengthBeats - 0.6)
          : secondsPerBeat * (preset.chordLengthBeats - 0.2);
        triggerChord(ctx, chord, chordBase, t, chordDur);
        // Logic bass will get hit by bassBeats above; ensure arp fires here too
        if (arpSteps) {
          const arpDelay = breakdown ? secondsPerBeat * 0.7 : secondsPerBeat * 0.5;
          setTimeout(() => triggerArp(ctx, chordBase, arpSteps, secondsPerBeat), arpDelay * 1000);
        }
        audioEngine.chordIndex += 1;
        audioEngine.barCount += 1;
        // Periodically evolve by swapping preset after a block of bars
        if (audioEngine.barCount % 16 === 0) {
          audioEngine.presetIndex = (audioEngine.presetIndex + 1) % presetIds.length;
          audioEngine.beatIndex = 0;
          audioEngine.chordIndex = 0;
          audioEngine.barCount = 0;
        }
      }
      audioEngine.beatIndex += 1;
    };
    step();
    audioEngine.loopId = setInterval(step, secondsPerBeat * 1000);
  }

  function envGain(ctx, time, duration, peak = 1, tail = 0.001, dest = null) {
    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0.1;
    const safePeak = Number.isFinite(peak) ? peak : 1;
    const safeTail = Number.isFinite(tail) && tail > 0 ? tail : 0.001;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(safePeak, time + 0.01);
    g.gain.exponentialRampToValueAtTime(safeTail, time + safeDuration);
    const target = dest || audioEngine.master;
    g.connect(target);
    return g;
  }

  function createBitCrusher(ctx, bits = 6, mix = 0.35) {
    const steps = Math.pow(2, bits);
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.round(x * steps) / steps;
    }
    const shaper = ctx.createWaveShaper();
    shaper.curve = curve;
    shaper.oversample = 'none';
    const input = ctx.createGain();
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const safeMix = Math.max(0, Math.min(1, mix));
    dry.gain.value = Math.max(0, 1 - safeMix);
    wet.gain.value = safeMix;
    input.connect(dry);
    input.connect(shaper);
    shaper.connect(wet);
    const output = ctx.createGain();
    dry.connect(output);
    wet.connect(output);
    return { input, output };
  }

  function ensureChipCrunch(ctx) {
    if (audioEngine.chipCrunch) return audioEngine.chipCrunch;
    const crunch = createBitCrusher(ctx, 5, 0.34);
    crunch.output.connect(audioEngine.master);
    audioEngine.chipCrunch = crunch;
    return crunch;
  }

  function chipDest(ctx) {
    const crunch = ensureChipCrunch(ctx);
    return crunch.input;
  }

  function triggerDrum(ctx, type, time) {
    if (type === 'kick') {
      const osc = ctx.createOscillator();
      const gain = envGain(ctx, time, 0.4, 1.1);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(110, time);
      osc.frequency.exponentialRampToValueAtTime(45, time + 0.35);
      osc.connect(gain);
      osc.start(time);
      osc.stop(time + 0.4);
      duckSidechain(time);
    } else if (type === 'snare') {
      const noise = ctx.createBufferSource();
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      noise.buffer = buffer;
      const gain = envGain(ctx, time, 0.2, 0.5);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 800;
      noise.connect(hp).connect(gain);
      noise.start(time);
      noise.stop(time + 0.2);
    } else if (type === 'hat') {
      const noise = ctx.createBufferSource();
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      noise.buffer = buffer;
      const crunch = chipDest(ctx);
      const gain = envGain(ctx, time, 0.08, 0.15, 0.001, crunch);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 5000;
      noise.connect(hp).connect(gain);
      noise.start(time);
      noise.stop(time + 0.08);
    } else if (type === 'hatOpen') {
      const noise = ctx.createBufferSource();
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.18, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      noise.buffer = buffer;
      const crunch = chipDest(ctx);
      const gain = envGain(ctx, time, 0.18, 0.22, 0.0001, crunch);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7000;
      noise.connect(hp).connect(gain);
      noise.start(time);
      noise.stop(time + 0.2);
    }
  }

  function triggerBass(ctx, semi, baseFreq, time) {
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const gain = envGain(ctx, time, 0.45, 0.45, 0.0008, chipDest(ctx));
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(90, time);
    filter.frequency.linearRampToValueAtTime(240, time + 0.25);
    osc.type = 'sawtooth';
    sub.type = 'sine';
    osc.frequency.value = baseFreq * Math.pow(2, semi / 12);
    sub.frequency.value = osc.frequency.value / 2; // sub octave
    osc.connect(filter).connect(gain);
    sub.connect(filter);
    osc.start(time);
    sub.start(time);
    osc.stop(time + 0.5);
    sub.stop(time + 0.5);
    duckSidechain(time);
  }

  function duckSidechain(time) {
    if (!audioEngine.pump) return;
    const g = audioEngine.pump.gain;
    g.cancelScheduledValues(time);
    g.setValueAtTime(0.5, time);
    g.linearRampToValueAtTime(1, time + 0.32);
  }

  function triggerChord(ctx, semitones, baseFreq, time, duration = 1.6) {
    semitones.forEach(semi => {
      const osc = ctx.createOscillator();
      const gain = envGain(ctx, time, duration, 0.08, 0.0005, chipDest(ctx));
      osc.type = 'triangle';
      osc.frequency.value = baseFreq * Math.pow(2, semi / 12);
      osc.connect(gain);
      osc.start(time);
      osc.stop(time + duration);
    });
  }

  function triggerArp(ctx, baseFreq, steps, secondsPerBeat) {
    steps.forEach((s, i) => {
      const osc = ctx.createOscillator();
      const gain = envGain(ctx, ctx.currentTime, secondsPerBeat * 0.4, 0.12, 0.0008, chipDest(ctx));
      osc.type = 'square';
      osc.frequency.value = baseFreq * Math.pow(2, s / 12);
      osc.connect(gain);
      const start = ctx.currentTime + i * secondsPerBeat * 0.25;
      osc.start(start);
      osc.stop(start + secondsPerBeat);
    });
  }

  function setText(el, key, value) {
    if (!el) return;
    const str = String(value);
    if (uiCache.text[key] === str) return;
    uiCache.text[key] = str;
    el.textContent = str;
  }

  function setDisabled(el, key, disabled) {
    if (!el) return;
    if (uiCache.disabled[key] === disabled) return;
    uiCache.disabled[key] = disabled;
    el.disabled = disabled;
  }

  function formatNumber(val, decimals = 0) {
    if (val >= 1e9) return `${(val / 1e9).toFixed(2)}B`;
    if (val >= 1e6) return `${(val / 1e6).toFixed(2)}M`;
    if (val >= 1e3) return `${(val / 1e3).toFixed(1)}k`;
    return Number(val).toFixed(decimals);
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
})();
