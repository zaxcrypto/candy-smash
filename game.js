'use strict';

/* ══════════════════════════════════════════
   TILE IMAGES – using the custom photos
══════════════════════════════════════════ */
const TILE_IMAGES = [
  'photo_24_2026-04-26_08-41-08.jpg',
  'photo_25_2026-04-26_08-41-08.jpg',
  'photo_26_2026-04-26_08-41-08.jpg',
  'photo_27_2026-04-26_08-41-08.jpg',
  'photo_28_2026-04-26_08-41-08.jpg',
  'photo_29_2026-04-26_08-41-08.jpg',
  'photo_30_2026-04-26_08-41-08.jpg',
  'photo_31_2026-04-26_08-41-08.jpg',
];

const ROWS = 8, COLS = 8;
const TYPES = TILE_IMAGES.length; // 8 types

/* ══════════════════════════════════════════
   LEVEL DEFINITIONS  (30 levels)
══════════════════════════════════════════ */
const LEVELS = (() => {
  const arr = [];
  for (let i = 1; i <= 30; i++) {
    const target = Math.round(10 + (i - 1) * 22 + (i - 1) * (i - 1) * 1.8);
    const moves  = Math.max(10, 35 - Math.floor(i * 0.7));
    arr.push({ level: i, target, moves });
  }
  return arr;
})();

/* ══════════════════════════════════════════
   GAME STATE
══════════════════════════════════════════ */
let board       = [];   // 2-D array of { type, special, el }
let score       = 0;
let movesLeft   = 0;
let currentLevel= 1;
let playerName  = 'Player';
let selectedCell= null; // { r, c }
let busy        = false; // lock during animations
let paused      = false;

/* ══════════════════════════════════════════
   DOM REFS
══════════════════════════════════════════ */
const $board        = () => document.getElementById('game-board');
const $hudLevel     = () => document.getElementById('hud-level');
const $hudScore     = () => document.getElementById('hud-score');
const $hudMoves     = () => document.getElementById('hud-moves');
const $hudTarget    = () => document.getElementById('hud-target');
const $targetFill   = () => document.getElementById('target-bar-fill');
const $comboToast   = () => document.getElementById('combo-toast');
const $playerName   = () => document.getElementById('player-name-display');
const $modalUser    = () => document.getElementById('modal-username');

/* ══════════════════════════════════════════
   SCREEN TRANSITIONS
══════════════════════════════════════════ */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function showModal(id)  { document.getElementById(id).classList.remove('hidden'); }
function hideModal(id)  { document.getElementById(id).classList.add('hidden'); }

/* ══════════════════════════════════════════
   ENTRY POINT
══════════════════════════════════════════ */
function startGame() {
  const input = document.getElementById('username-input');
  playerName = input.value.trim() || 'Player';
  $playerName().textContent = playerName;
  if ($modalUser()) $modalUser().textContent = playerName;
  currentLevel = 1;
  loadLevel(currentLevel);
  showScreen('screen-game');
}

function loadLevel(lvlIndex) {
  hideModal('modal-win');
  hideModal('modal-lose');
  hideModal('modal-complete');
  paused = false;
  busy   = false;
  selectedCell = null;
  const lvl = LEVELS[lvlIndex - 1];
  score     = 0;
  movesLeft = lvl.moves;
  updateHUD();
  $hudLevel().textContent  = lvlIndex;
  $hudTarget().textContent = lvl.target;
  buildBoard();
}

/* ══════════════════════════════════════════
   BOARD GENERATION
══════════════════════════════════════════ */
function buildBoard() {
  board = [];
  const container = $board();
  container.innerHTML = '';

  // Generate a grid without initial matches
  for (let r = 0; r < ROWS; r++) {
    board[r] = [];
    for (let c = 0; c < COLS; c++) {
      board[r][c] = { type: safeType(r, c), special: false, el: null };
    }
  }
  renderFullBoard();
  if (!hasAnyMove()) reshuffleBoard();
}

function safeType(r, c) {
  const forbidden = new Set();
  if (r >= 2 && board[r-1][c].type === board[r-2][c].type) forbidden.add(board[r-1][c].type);
  if (c >= 2 && board[r][c-1].type === board[r][c-2].type) forbidden.add(board[r][c-1].type);
  let t;
  do { t = rndType(); } while (forbidden.has(t));
  return t;
}

function rndType() { return Math.floor(Math.random() * TYPES); }

/* ══════════════════════════════════════════
   RENDER
══════════════════════════════════════════ */
function renderFullBoard() {
  const container = $board();
  container.innerHTML = '';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = board[r][c];
      const el = makeTileEl(cell.type, cell.special);
      el.style.gridColumn = c + 1;
      el.style.gridRow    = r + 1;
      attachTileEvents(el, r, c);
      container.appendChild(el);
      cell.el = el;
    }
  }
}

function makeTileEl(type, special = false) {
  const div = document.createElement('div');
  div.className = 'tile' + (special ? ' special' : '');
  const img = document.createElement('img');
  img.src = TILE_IMAGES[type];
  img.alt = `tile-${type}`;
  img.draggable = false;
  div.appendChild(img);
  return div;
}

function syncTilePosition(r, c) {
  const cell = board[r][c];
  if (!cell || !cell.el) return;
  cell.el.style.gridColumn = c + 1;
  cell.el.style.gridRow    = r + 1;
}

/* ══════════════════════════════════════════
   INPUT – MOUSE & TOUCH
══════════════════════════════════════════ */
let touchStart = null;

function attachTileEvents(el, r, c) {
  // Mouse
  el.addEventListener('mousedown', e => { e.preventDefault(); handleSelect(r, c); });

  // Touch swipe
  el.addEventListener('touchstart', e => {
    touchStart = { r, c, x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });

  el.addEventListener('touchend', e => {
    if (!touchStart) return;
    const dx = e.changedTouches[0].clientX - touchStart.x;
    const dy = e.changedTouches[0].clientY - touchStart.y;
    const absDx = Math.abs(dx), absDy = Math.abs(dy);
    if (Math.max(absDx, absDy) < 12) {
      handleSelect(touchStart.r, touchStart.c);
    } else {
      let tr = touchStart.r, tc = touchStart.c;
      if (absDx > absDy) tc += (dx > 0 ? 1 : -1);
      else               tr += (dy > 0 ? 1 : -1);
      if (inBounds(tr, tc)) trySwap(touchStart.r, touchStart.c, tr, tc);
    }
    touchStart = null;
  }, { passive: true });
}

function handleSelect(r, c) {
  if (busy || paused) return;
  if (!selectedCell) {
    selectedCell = { r, c };
    board[r][c].el.classList.add('selected');
    return;
  }
  const { r: pr, c: pc } = selectedCell;
  board[pr][pc].el.classList.remove('selected');
  if (pr === r && pc === c) { selectedCell = null; return; }
  const dr = Math.abs(r - pr), dc = Math.abs(c - pc);
  if (dr + dc === 1) {
    selectedCell = null;
    trySwap(pr, pc, r, c);
  } else {
    selectedCell = { r, c };
    board[r][c].el.classList.add('selected');
  }
}

/* ══════════════════════════════════════════
   SWAP & MATCH LOGIC
══════════════════════════════════════════ */
async function trySwap(r1, c1, r2, c2) {
  if (busy || paused) return;
  busy = true;

  animateSwap(r1, c1, r2, c2);
  swap(r1, c1, r2, c2);
  await delay(230);

  const matches = findMatches();
  if (matches.length === 0) {
    // Undo swap
    swap(r1, c1, r2, c2);
    animateSwap(r1, c1, r2, c2);
    await delay(230);
    busy = false;
    return;
  }

  movesLeft--;
  $hudMoves().textContent = movesLeft;

  await processMatches(matches, r1, c1, r2, c2);
  busy = false;
  checkEndConditions();
}

function swap(r1, c1, r2, c2) {
  const tmp = board[r1][c1];
  board[r1][c1] = board[r2][c2];
  board[r2][c2] = tmp;
  syncTilePosition(r1, c1);
  syncTilePosition(r2, c2);
}

function animateSwap(r1, c1, r2, c2) {
  const el1 = board[r1][c1].el, el2 = board[r2][c2].el;
  if (!el1 || !el2) return;
  if (r1 === r2) {
    el1.classList.add(c2 > c1 ? 'swap-right' : 'swap-left');
    el2.classList.add(c2 > c1 ? 'swap-left'  : 'swap-right');
    setTimeout(() => { el1.classList.remove('swap-right','swap-left'); el2.classList.remove('swap-right','swap-left'); }, 230);
  } else {
    el1.classList.add(r2 > r1 ? 'swap-down' : 'swap-up');
    el2.classList.add(r2 > r1 ? 'swap-up'   : 'swap-down');
    setTimeout(() => { el1.classList.remove('swap-down','swap-up'); el2.classList.remove('swap-down','swap-up'); }, 230);
  }
}

/* ══════════════════════════════════════════
   FIND MATCHES
══════════════════════════════════════════ */
function findMatches() {
  const matched = new Set();

  // Horizontal
  for (let r = 0; r < ROWS; r++) {
    let run = 1;
    for (let c = 1; c < COLS; c++) {
      if (board[r][c].type === board[r][c-1].type) { run++; }
      else { if (run >= 3) for (let k = c-run; k < c; k++) matched.add(`${r},${k}`); run = 1; }
    }
    if (run >= 3) for (let k = COLS-run; k < COLS; k++) matched.add(`${r},${k}`);
  }

  // Vertical
  for (let c = 0; c < COLS; c++) {
    let run = 1;
    for (let r = 1; r < ROWS; r++) {
      if (board[r][c].type === board[r-1][c].type) { run++; }
      else { if (run >= 3) for (let k = r-run; k < r; k++) matched.add(`${k},${c}`); run = 1; }
    }
    if (run >= 3) for (let k = ROWS-run; k < ROWS; k++) matched.add(`${k},${c}`);
  }

  return [...matched].map(key => { const [r,c] = key.split(','); return { r: +r, c: +c }; });
}

/* ══════════════════════════════════════════
   COUNT MATCH LENGTHS (for bonuses)
══════════════════════════════════════════ */
function getMatchGroups() {
  const groups = [];
  const visited = new Set();

  const addGroup = (cells) => {
    const key = cells.map(c=>`${c.r},${c.c}`).join('|');
    if (cells.length < 3) return;
    groups.push(cells);
    cells.forEach(c => visited.add(`${c.r},${c.c}`));
  };

  // Horizontal runs
  for (let r = 0; r < ROWS; r++) {
    let run = [{ r, c: 0 }], startType = board[r][0].type;
    for (let c = 1; c < COLS; c++) {
      if (board[r][c].type === startType) run.push({ r, c });
      else {
        if (run.length >= 3) addGroup([...run]);
        run = [{ r, c }]; startType = board[r][c].type;
      }
    }
    if (run.length >= 3) addGroup([...run]);
  }

  // Vertical runs
  for (let c = 0; c < COLS; c++) {
    let run = [{ r: 0, c }], startType = board[0][c].type;
    for (let r = 1; r < ROWS; r++) {
      if (board[r][c].type === startType) run.push({ r, c });
      else {
        if (run.length >= 3) addGroup([...run]);
        run = [{ r, c }]; startType = board[r][c].type;
      }
    }
    if (run.length >= 3) addGroup([...run]);
  }

  return groups;
}

/* ══════════════════════════════════════════
   PROCESS MATCHES
══════════════════════════════════════════ */
async function processMatches(matches, swapR1=-1, swapC1=-1, swapR2=-1, swapC2=-1) {
  if (matches.length === 0) return;

  const groups = getMatchGroups();
  let totalPoints = 0;
  let maxGroupLen = 0;
  let cometTriggered = false;
  let cometOrigin = null;

  // Check if a special tile was swapped
  for (const { r, c } of matches) {
    if (board[r][c].special) {
      cometTriggered = true;
      cometOrigin = { r, c };
      break;
    }
  }

  for (const group of groups) {
    const len = group.length;
    if (len > maxGroupLen) maxGroupLen = len;
    const pts = len === 3 ? len * 10 : len === 4 ? len * 10 * 2 : len * 10 * 5;
    totalPoints += pts;
  }

  // Handle special tile detonation
  if (cometTriggered && cometOrigin) {
    await triggerComet(cometOrigin.r, cometOrigin.c);
    return;
  }

  // Create special tile for 5-match
  let specialCreated = false;
  for (const group of groups) {
    if (group.length >= 5 && !specialCreated) {
      const origin = group[Math.floor(group.length / 2)];
      const t = board[origin.r][origin.c].type;
      blastCells(matches.filter(m => !(m.r === origin.r && m.c === origin.c)));
      await delay(400);
      board[origin.r][origin.c].special = true;
      board[origin.r][origin.c].el.classList.add('special');
      specialCreated = true;
    }
  }

  if (!specialCreated) {
    blastCells(matches);
    await delay(400);
  }

  addScore(totalPoints, matches);
  showCombo(maxGroupLen, totalPoints);
  await gravity();
  await delay(100);
  const next = findMatches();
  if (next.length) await processMatches(next);
  else if (!hasAnyMove()) reshuffleBoard();
}

/* ══════════════════════════════════════════
   BLAST CELLS
══════════════════════════════════════════ */
function blastCells(cells) {
  cells.forEach(({ r, c }) => {
    const cell = board[r][c];
    if (!cell || !cell.el) return;
    cell.el.classList.add('blasting');
    cell.el.addEventListener('animationend', () => cell.el.remove(), { once: true });
    board[r][c] = null;
  });
}

/* ══════════════════════════════════════════
   COMET SPECIAL EFFECT
══════════════════════════════════════════ */
async function triggerComet(r, c) {
  const el = board[r][c]?.el;
  if (el) {
    const rect = el.getBoundingClientRect();
    spawnParticles(rect.left + rect.width / 2, rect.top + rect.height / 2, 30);
  }

  // Clear entire row and column
  const toClear = new Set();
  for (let cc = 0; cc < COLS; cc++) toClear.add(`${r},${cc}`);
  for (let rr = 0; rr < ROWS; rr++) toClear.add(`${rr},${c}`);

  const cells = [...toClear].map(k => { const [rr,cc] = k.split(','); return { r:+rr, c:+cc }; });
  blastCells(cells);
  addScore(cells.length * 20);
  showToast('⚡ COMET BLAST!', '#ffd234');
  await delay(500);
  await gravity();
  await delay(100);
  const next = findMatches();
  if (next.length) await processMatches(next);
  else if (!hasAnyMove()) reshuffleBoard();
}

/* ══════════════════════════════════════════
   GRAVITY – tiles fall down
══════════════════════════════════════════ */
async function gravity() {
  const container = $board();

  for (let c = 0; c < COLS; c++) {
    let empty = [];
    for (let r = ROWS - 1; r >= 0; r--) {
      if (!board[r][c]) empty.push(r);
      else if (empty.length) {
        const er = empty.shift();
        board[er][c] = board[r][c];
        board[r][c]  = null;
        board[er][c].el.style.gridRow    = er + 1;
        board[er][c].el.style.gridColumn = c + 1;
        board[er][c].el.classList.add('falling');
        board[er][c].el.addEventListener('animationend', () => board[er][c]?.el?.classList.remove('falling'), { once: true });
        empty.push(r);
      }
    }
    // Fill from top
    for (const er of empty) {
      const type = rndType();
      const el = makeTileEl(type);
      el.style.gridColumn = c + 1;
      el.style.gridRow    = er + 1;
      el.classList.add('falling');
      attachTileEvents(el, er, c);
      container.appendChild(el);
      board[er][c] = { type, special: false, el };
      el.addEventListener('animationend', () => board[er][c]?.el?.classList.remove('falling'), { once: true });
    }
  }

  // Re-attach events for shifted tiles
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const cell = board[r][c];
      if (!cell || !cell.el) continue;
      // Remove old listeners by cloning
      const newEl = cell.el.cloneNode(true);
      cell.el.parentNode.replaceChild(newEl, cell.el);
      cell.el = newEl;
      attachTileEvents(newEl, r, c);
    }

  await delay(350);
}

/* ══════════════════════════════════════════
   RESHUFFLE (no moves)
══════════════════════════════════════════ */
function reshuffleBoard() {
  const overlay = document.createElement('div');
  overlay.className = 'reshuffling-overlay';
  overlay.textContent = '🔄 Reshuffling…';
  $board().appendChild(overlay);
  setTimeout(() => {
    overlay.remove();
    buildBoard();
  }, 900);
}

/* ══════════════════════════════════════════
   HAS ANY MOVE CHECK
══════════════════════════════════════════ */
function hasAnyMove() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (c + 1 < COLS) { swap(r,c,r,c+1); if(findMatches().length){swap(r,c,r,c+1);return true;} swap(r,c,r,c+1); }
      if (r + 1 < ROWS) { swap(r,c,r+1,c); if(findMatches().length){swap(r,c,r+1,c);return true;} swap(r,c,r+1,c); }
    }
  }
  return false;
}

/* ══════════════════════════════════════════
   SCORE & HUD
══════════════════════════════════════════ */
function addScore(pts, cells) {
  score += pts;
  animateScore(pts, cells);
  updateHUD();
}

function updateHUD() {
  $hudScore().textContent = score;
  $hudMoves().textContent = movesLeft;
  const lvl = LEVELS[currentLevel - 1];
  const pct = Math.min(100, (score / lvl.target) * 100);
  $targetFill().style.width = pct + '%';
}

function animateScore(pts, cells) {
  if (!cells || !cells.length) return;
  const cell = cells[Math.floor(cells.length / 2)];
  const tileEl = board[cell?.r]?.[cell?.c]?.el;
  let x = window.innerWidth / 2, y = window.innerHeight / 2;
  if (tileEl) { const rect = tileEl.getBoundingClientRect(); x = rect.left + rect.width/2; y = rect.top + rect.height/2; }
  const el = document.createElement('div');
  el.className = 'score-pop';
  el.textContent = `+${pts}`;
  el.style.cssText = `left:${x}px;top:${y}px;color:${pts > 100 ? '#ffd234' : pts > 50 ? '#3de888' : '#1e90e8'};`;
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

function showCombo(len, pts) {
  if (len < 4) return;
  const msg = len >= 5 ? `🌟 SUPER MATCH ×5! +${pts}` : `🔥 COMBO ×4! +${pts}`;
  showToast(msg, len >= 5 ? '#ffd234' : '#ff6ec7');
}

function showToast(msg, color = '#ffd234') {
  const el = $comboToast();
  el.textContent = msg;
  el.style.color = color;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  el.addEventListener('animationend', () => el.classList.remove('show'), { once: true });
}

/* ══════════════════════════════════════════
   PARTICLE EFFECT (comet)
══════════════════════════════════════════ */
function spawnParticles(x, y, count = 20) {
  const colors = ['#ffd234','#ff6ec7','#5ab8f5','#3de888','#ff4d6d','#fff'];
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const angle = (Math.random() * 360) * Math.PI / 180;
    const dist  = 60 + Math.random() * 120;
    p.style.cssText = `left:${x}px;top:${y}px;background:${colors[i%colors.length]};`+
                      `--dx:${Math.cos(angle)*dist}px;--dy:${Math.sin(angle)*dist}px;`+
                      `animation-delay:${Math.random()*.2}s;`;
    document.body.appendChild(p);
    p.addEventListener('animationend', () => p.remove());
  }
}

/* ══════════════════════════════════════════
   END CONDITION CHECK
══════════════════════════════════════════ */
function checkEndConditions() {
  const lvl = LEVELS[currentLevel - 1];
  if (score >= lvl.target) {
    setTimeout(() => showWin(), 300);
  } else if (movesLeft <= 0) {
    setTimeout(() => showLose(), 300);
  }
}

function showWin() {
  const stars = score >= LEVELS[currentLevel-1].target * 1.5 ? '⭐⭐⭐' :
                score >= LEVELS[currentLevel-1].target * 1.2 ? '⭐⭐' : '⭐';
  document.getElementById('win-stars').textContent = stars;
  document.getElementById('win-sub-text').textContent =
    `Score: ${score} / Target: ${LEVELS[currentLevel-1].target}`;
  const nextBtn = document.getElementById('btn-next-level');
  if (currentLevel >= 30) {
    nextBtn.textContent = '🏆 Finish!';
    nextBtn.onclick = () => { hideModal('modal-win'); showModal('modal-complete'); };
  } else {
    nextBtn.textContent = 'Next Level →';
    nextBtn.onclick = nextLevel;
  }
  showModal('modal-win');
}

function showLose() {
  document.getElementById('lose-sub-text').textContent =
    `Score: ${score} / Target: ${LEVELS[currentLevel-1].target}`;
  showModal('modal-lose');
}

/* ══════════════════════════════════════════
   MODAL ACTIONS (called from HTML)
══════════════════════════════════════════ */
function nextLevel() {
  if (currentLevel >= 30) { hideModal('modal-win'); showModal('modal-complete'); return; }
  currentLevel++;
  loadLevel(currentLevel);
}

function restartLevel() {
  hideModal('modal-lose'); hideModal('modal-win');
  loadLevel(currentLevel);
}

function goHome() {
  hideModal('modal-settings'); hideModal('modal-win'); hideModal('modal-lose'); hideModal('modal-complete');
  showScreen('screen-welcome');
}

function openSettings() {
  if (busy) return;
  paused = true;
  if ($modalUser()) $modalUser().textContent = playerName;
  showModal('modal-settings');
}

function closeSettings(e) {
  if (e && e.target !== document.getElementById('modal-settings')) return;
  hideModal('modal-settings');
  paused = false;
}

function resumeGame() { hideModal('modal-settings'); paused = false; }

/* ══════════════════════════════════════════
   UTILITY
══════════════════════════════════════════ */
function inBounds(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }
function delay(ms) { return new Promise(res => setTimeout(res, ms)); }

/* ══════════════════════════════════════════
   KEYBOARD SHORTCUT: Enter to start
══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('username-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') startGame();
  });
});
