// ============================================
//  RISE/FALL MULTI-MARKET SCANNER
//  Tracks tick direction (up/down) per market
// ============================================

const WS_URL = `wss://api.derivws.com/trading/v1/options/ws/public`;

const MARKETS = [
  { symbol: "R_10",     name: "Volatility 10",      short: "V10",      decimals: 3 },
  { symbol: "R_25",     name: "Volatility 25",      short: "V25",      decimals: 3 },
  { symbol: "R_50",     name: "Volatility 50",      short: "V50",      decimals: 4 },
  { symbol: "R_75",     name: "Volatility 75",      short: "V75",      decimals: 4 },
  { symbol: "R_100",    name: "Volatility 100",     short: "V100",     decimals: 2 },
  { symbol: "1HZ10V",   name: "Volatility 10 (1s)", short: "V10 1s",   decimals: 2 },
  { symbol: "1HZ25V",   name: "Volatility 25 (1s)", short: "V25 1s",   decimals: 2 },
  { symbol: "1HZ50V",   name: "Volatility 50 (1s)", short: "V50 1s",   decimals: 2 },
  { symbol: "1HZ75V",   name: "Volatility 75 (1s)", short: "V75 1s",   decimals: 2 },
  { symbol: "1HZ100V",  name: "Volatility 100 (1s)", short: "V100 1s", decimals: 2 },
];

const MIN_TICKS_FOR_SIGNAL = 5;
const DEFAULT_WINDOW = 20;

let reqId = 1;
let ws = null;
let windowSize = DEFAULT_WINDOW;

// State per market
const state = {};
MARKETS.forEach((m) => {
  state[m.symbol] = {
    ticks: [],          // { price, direction } where direction is 'rise'|'fall'|null
    total: 0,
    lastQuote: null,
    lastDirection: null,
    decimals: m.decimals,
  };
});

// DOM
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const marketGrid = document.getElementById("marketGrid");
const windowSelect = document.getElementById("windowSelect");
const resetBtn = document.getElementById("resetBtn");
const strongestRiseEl = document.getElementById("strongestRise");
const strongestFallEl = document.getElementById("strongestFall");
const totalTicksAllEl = document.getElementById("totalTicksAll");
const lastUpdateEl = document.getElementById("lastUpdate");

// ---- BUILD CARDS ----
function buildCards() {
  if (!marketGrid) return;
  marketGrid.innerHTML = MARKETS.map((m) => `
    <div class="market-card" id="card-${m.symbol}" data-symbol="${m.symbol}">
      <div class="mc-header">
        <div>
          <div class="mc-symbol">${m.short}</div>
          <span class="mc-symbol-sub">${m.name}</span>
        </div>
        <div class="mc-ticks" id="ticks-${m.symbol}">0</div>
      </div>

      <div class="mc-price" id="price-${m.symbol}">—</div>

      <div class="mc-rf-labels">
        <span class="rise-label">Rise</span>
        <span class="fall-label">Fall</span>
      </div>
      <div class="mc-rf-bar">
        <div class="mc-rf-rise" id="risebar-${m.symbol}" style="width: 50%;"></div>
        <div class="mc-rf-fall" id="fallbar-${m.symbol}" style="width: 50%;"></div>
      </div>
      <div class="mc-rf-stats">
        <span class="rise-stat" id="rise-${m.symbol}">0%</span>
        <span class="fall-stat" id="fall-${m.symbol}">0%</span>
      </div>

      <div class="mc-signal">
        <span class="mc-signal-label">Signal</span>
        <span class="mc-signal-value neutral" id="signal-${m.symbol}">waiting…</span>
      </div>
    </div>
  `).join("");
}

// ---- CONNECT ----
function connect() {
  setStatus("connecting", "Connecting…");
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    setStatus("connected", "Live");
    MARKETS.forEach((m) => {
      ws.send(JSON.stringify({
        ticks: m.symbol,
        subscribe: 1,
        req_id: reqId++,
      }));
    });
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.error) {
      console.warn("Deriv error:", data.error.message || data.error);
      return;
    }

    if (data.msg_type === "tick" && data.tick) {
      handleTick(data.tick);
    }
  };

  ws.onerror = () => setStatus("error", "Connection error");
  ws.onclose = () => {
    setStatus("error", "Disconnected — retrying…");
    setTimeout(connect, 3000);
  };
}

// ---- TICK HANDLER ----
function handleTick(tick) {
  const symbol = tick.symbol;
  const s = state[symbol];
  if (!s) return;

  const quoteNum = parseFloat(tick.quote);
  if (!Number.isFinite(quoteNum)) return;

  const quoteStr = quoteNum.toFixed(s.decimals);

  // Determine direction compared to previous tick
  let direction = null;
  if (s.lastQuote !== null) {
    const prev = parseFloat(s.lastQuote);
    if (quoteNum > prev) direction = "rise";
    else if (quoteNum < prev) direction = "fall";
    // equal = null, don't count
  }

  s.lastQuote = quoteStr;
  s.total++;

  if (direction) {
    s.lastDirection = direction;
    s.ticks.push(direction);
    // Keep only the window
    if (s.ticks.length > windowSize) {
      s.ticks.shift();
    }
  }

  renderCard(symbol);
  renderGlobal();
}

// ---- RENDER CARD ----
function renderCard(symbol) {
  const s = state[symbol];
  const card = document.getElementById(`card-${symbol}`);
  if (!card) return;

  document.getElementById(`ticks-${symbol}`).textContent = s.total.toLocaleString();
  document.getElementById(`price-${symbol}`).textContent = s.lastQuote || "—";

  // Count rise vs fall in window
  let rises = 0, falls = 0;
  s.ticks.forEach((d) => {
    if (d === "rise") rises++;
    else if (d === "fall") falls++;
  });
  const total = rises + falls;

  const risePct = total > 0 ? (rises / total) * 100 : 50;
  const fallPct = total > 0 ? (falls / total) * 100 : 50;

  document.getElementById(`risebar-${symbol}`).style.width = risePct + "%";
  document.getElementById(`fallbar-${symbol}`).style.width = fallPct + "%";
  document.getElementById(`rise-${symbol}`).textContent = risePct.toFixed(0) + "%";
  document.getElementById(`fall-${symbol}`).textContent = fallPct.toFixed(0) + "%";

  // Signal badge + card highlight
  const signalEl = document.getElementById(`signal-${symbol}`);
  card.classList.remove("is-rise", "is-fall");

  if (total < MIN_TICKS_FOR_SIGNAL) {
    signalEl.textContent = `waiting… (${total}/${MIN_TICKS_FOR_SIGNAL})`;
    signalEl.className = "mc-signal-value neutral";
    return;
  }

  const diff = Math.abs(risePct - fallPct);

  if (diff >= 20) {
    const isRise = risePct > fallPct;
    signalEl.textContent = isRise
      ? `📈 Rise ${risePct.toFixed(0)}%`
      : `📉 Fall ${fallPct.toFixed(0)}%`;
    signalEl.className = `mc-signal-value ${isRise ? "rise" : "fall"}`;
    card.classList.add(isRise ? "is-rise" : "is-fall");
  } else {
    signalEl.textContent = "neutral";
    signalEl.className = "mc-signal-value neutral";
  }
}

// ---- GLOBAL STATS ----
function renderGlobal() {
  let totalAll = 0;
  let bestRise = null, bestRisePct = 0;
  let bestFall = null, bestFallPct = 0;

  MARKETS.forEach((m) => {
    const s = state[m.symbol];
    totalAll += s.total;

    let rises = 0, falls = 0;
    s.ticks.forEach((d) => {
      if (d === "rise") rises++;
      else if (d === "fall") falls++;
    });
    const total = rises + falls;
    if (total < MIN_TICKS_FOR_SIGNAL) return;

    const risePct = (rises / total) * 100;
    const fallPct = (falls / total) * 100;

    if (risePct > bestRisePct) {
      bestRisePct = risePct;
      bestRise = `${m.short} · ${risePct.toFixed(0)}%`;
    }
    if (fallPct > bestFallPct) {
      bestFallPct = fallPct;
      bestFall = `${m.short} · ${fallPct.toFixed(0)}%`;
    }
  });

  totalTicksAllEl.textContent = totalAll.toLocaleString();
  strongestRiseEl.textContent = bestRise || "—";
  strongestFallEl.textContent = bestFall || "—";

  const now = new Date();
  lastUpdateEl.textContent = now.toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function setStatus(stateName, text) {
  statusText.textContent = text;
  statusDot.classList.remove("connected", "error");
  if (stateName === "connected") statusDot.classList.add("connected");
  if (stateName === "error") statusDot.classList.add("error");
}

// ---- CONTROLS ----
windowSelect.addEventListener("change", () => {
  windowSize = parseInt(windowSelect.value, 10);
  // Trim all existing windows
  MARKETS.forEach((m) => {
    const s = state[m.symbol];
    while (s.ticks.length > windowSize) s.ticks.shift();
    renderCard(m.symbol);
  });
  renderGlobal();
});

resetBtn.addEventListener("click", () => {
  MARKETS.forEach((m) => {
    const s = state[m.symbol];
    s.ticks = [];
    s.total = 0;
    s.lastQuote = null;
    s.lastDirection = null;
  });
  buildCards();
  renderGlobal();
});

// ---- BOOT ----
buildCards();
connect();

setInterval(() => {
  if (totalTicksAllEl.textContent !== "0") renderGlobal();
}, 1000);