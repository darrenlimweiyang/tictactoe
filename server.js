const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

// ── Tic-Tac-Toe logic ────────────────────────────────────────────────────────
function checkWin(board, gridSize) {
  const N = gridSize;
  for (let r = 0; r < N; r++) {
    const start = r * N;
    const symbol = board[start];
    if (!symbol) continue;
    if (board.slice(start, start + N).every(cell => cell === symbol)) return symbol;
  }
  for (let c = 0; c < N; c++) {
    const symbol = board[c];
    if (!symbol) continue;
    let win = true;
    for (let r = 1; r < N; r++) {
      if (board[r * N + c] !== symbol) { win = false; break; }
    }
    if (win) return symbol;
  }
  const d1 = board[0];
  if (d1) {
    let win = true;
    for (let i = 1; i < N; i++) { if (board[i * N + i] !== d1) { win = false; break; } }
    if (win) return d1;
  }
  const d2 = board[N - 1];
  if (d2) {
    let win = true;
    for (let i = 1; i < N; i++) { if (board[i * N + (N - 1 - i)] !== d2) { win = false; break; } }
    if (win) return d2;
  }
  return null;
}

function isDraw(board) {
  return board.every(cell => cell !== null);
}

// ── TTT AI (minimax) ─────────────────────────────────────────────────────────
function tttAiMove(board, gridSize, aiSymbol) {
  const oppSymbol = aiSymbol === 'X' ? 'O' : 'X';
  const emptyCells = [];
  for (let i = 0; i < board.length; i++) {
    if (board[i] === null) emptyCells.push(i);
  }
  if (emptyCells.length === 0) return -1;

  if (gridSize === 3) {
    // Full minimax with alpha-beta pruning — perfect play
    return tttMinimaxFull(board, gridSize, aiSymbol, oppSymbol);
  } else {
    // Depth-limited minimax with heuristic eval for 4x4/5x5
    return tttMinimaxLimited(board, gridSize, aiSymbol, oppSymbol, 5);
  }
}

function tttMinimaxFull(board, N, aiSymbol, oppSymbol) {
  let bestScore = -Infinity;
  let bestMove = -1;

  for (let i = 0; i < board.length; i++) {
    if (board[i] !== null) continue;
    board[i] = aiSymbol;
    const score = minimaxFull(board, N, false, aiSymbol, oppSymbol, -Infinity, Infinity);
    board[i] = null;
    if (score > bestScore) { bestScore = score; bestMove = i; }
  }
  return bestMove;
}

function minimaxFull(board, N, isMaximizing, aiSymbol, oppSymbol, alpha, beta) {
  const winner = checkWin(board, N);
  if (winner === aiSymbol) return 10;
  if (winner === oppSymbol) return -10;
  if (isDraw(board)) return 0;

  if (isMaximizing) {
    let best = -Infinity;
    for (let i = 0; i < board.length; i++) {
      if (board[i] !== null) continue;
      board[i] = aiSymbol;
      best = Math.max(best, minimaxFull(board, N, false, aiSymbol, oppSymbol, alpha, beta));
      board[i] = null;
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (let i = 0; i < board.length; i++) {
      if (board[i] !== null) continue;
      board[i] = oppSymbol;
      best = Math.min(best, minimaxFull(board, N, true, aiSymbol, oppSymbol, alpha, beta));
      board[i] = null;
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

function tttMinimaxLimited(board, N, aiSymbol, oppSymbol, maxDepth) {
  let bestScore = -Infinity;
  let bestMove = -1;

  for (let i = 0; i < board.length; i++) {
    if (board[i] !== null) continue;
    board[i] = aiSymbol;
    const score = minimaxLimited(board, N, false, aiSymbol, oppSymbol, maxDepth - 1, -Infinity, Infinity);
    board[i] = null;
    if (score > bestScore) { bestScore = score; bestMove = i; }
  }
  return bestMove;
}

function minimaxLimited(board, N, isMaximizing, aiSymbol, oppSymbol, depth, alpha, beta) {
  const winner = checkWin(board, N);
  if (winner === aiSymbol) return 1000;
  if (winner === oppSymbol) return -1000;
  if (isDraw(board)) return 0;
  if (depth <= 0) return tttHeuristic(board, N, aiSymbol, oppSymbol);

  if (isMaximizing) {
    let best = -Infinity;
    for (let i = 0; i < board.length; i++) {
      if (board[i] !== null) continue;
      board[i] = aiSymbol;
      best = Math.max(best, minimaxLimited(board, N, false, aiSymbol, oppSymbol, depth - 1, alpha, beta));
      board[i] = null;
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (let i = 0; i < board.length; i++) {
      if (board[i] !== null) continue;
      board[i] = oppSymbol;
      best = Math.min(best, minimaxLimited(board, N, true, aiSymbol, oppSymbol, depth - 1, alpha, beta));
      board[i] = null;
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

function tttHeuristic(board, N, aiSymbol, oppSymbol) {
  let score = 0;
  const lines = [];
  // Rows
  for (let r = 0; r < N; r++) {
    const line = [];
    for (let c = 0; c < N; c++) line.push(r * N + c);
    lines.push(line);
  }
  // Cols
  for (let c = 0; c < N; c++) {
    const line = [];
    for (let r = 0; r < N; r++) line.push(r * N + c);
    lines.push(line);
  }
  // Diags
  const d1 = [], d2 = [];
  for (let i = 0; i < N; i++) { d1.push(i * N + i); d2.push(i * N + (N - 1 - i)); }
  lines.push(d1, d2);

  for (const line of lines) {
    let aiCount = 0, oppCount = 0;
    for (const idx of line) {
      if (board[idx] === aiSymbol) aiCount++;
      else if (board[idx] === oppSymbol) oppCount++;
    }
    if (oppCount === 0 && aiCount > 0) score += aiCount * aiCount;
    if (aiCount === 0 && oppCount > 0) score -= oppCount * oppCount;
  }
  // Center control bonus
  const center = Math.floor(N / 2);
  const centerIdx = center * N + center;
  if (board[centerIdx] === aiSymbol) score += 3;
  else if (board[centerIdx] === oppSymbol) score -= 3;
  return score;
}

// ── SPS logic ─────────────────────────────────────────────────────────────────
// Returns: 1 if p1 wins, 2 if p2 wins, 0 if tie
function spsResult(c1, c2) {
  if (c1 === c2) return 0;
  if ((c1 === 'rock' && c2 === 'scissors') ||
      (c1 === 'scissors' && c2 === 'paper') ||
      (c1 === 'paper' && c2 === 'rock')) return 1;
  return 2;
}

function spsAiChoice(room) {
  const picks = ['rock', 'paper', 'scissors'];
  const lastAi = room.roundHistory.length > 0
    ? room.roundHistory[room.roundHistory.length - 1].choices['AI']
    : null;
  if (lastAi && lastAi !== 'none' && Math.random() < 0.3) return lastAi;
  return picks[Math.floor(Math.random() * picks.length)];
}

function resolveSpsRound(room) {
  const p1 = room.players[0];
  const p2 = room.players[1];
  const c1 = room.choices[p1.id] || null;
  const c2 = room.choices[p2.id] || null;

  let winnerId = null;
  let isTie = false;

  if (!c1 && !c2) {
    isTie = true;
  } else if (!c1) {
    winnerId = p2.id;
  } else if (!c2) {
    winnerId = p1.id;
  } else {
    const r = spsResult(c1, c2);
    if (r === 0) isTie = true;
    else winnerId = r === 1 ? p1.id : p2.id;
  }

  if (winnerId) {
    room.scores[winnerId] = (room.scores[winnerId] || 0) + 1;
  }

  // Always add to history (including ties)
  const histEntry = {
    roundNum: room.roundNumber,
    choices: { [p1.id]: c1 || 'none', [p2.id]: c2 || 'none' },
    winnerId: winnerId,
    isTie,
  };
  room.roundHistory.push(histEntry);
  if (room.roundHistory.length > 5) room.roundHistory.shift();

  if (!isTie) room.roundNumber += 1;

  room.choices = {};
  room.roundTimer = null;

  const winsNeeded = Math.ceil(room.bestOf / 2);
  const matchWinner = room.players.find(p => (room.scores[p.id] || 0) >= winsNeeded);

  const payload = {
    choices: { [p1.id]: c1, [p2.id]: c2 },
    roundWinner: winnerId,
    isTie,
    scores: room.scores,
    roundHistory: [...room.roundHistory],
    matchOver: !!matchWinner,
    nextRound: room.roundNumber,
  };

  if (matchWinner) {
    room.status = 'over';
    io.to(room.code).emit('roundResult', payload);
    // Send matchOver after client animation + 2.5s digest time
    setTimeout(() => {
      io.to(room.code).emit('matchOver', {
        winner: { id: matchWinner.id, name: matchWinner.name },
        scores: room.scores,
        players: room.players,
      });
    }, 6000);
  } else {
    io.to(room.code).emit('roundResult', payload);
    // Start next round after client animation + 2.5s digest time
    const delay = isTie ? 5000 : 6000;
    setTimeout(() => {
      if (rooms.get(room.code) === room && room.status === 'playing') {
        startSpsRound(room);
      }
    }, delay);
  }
}

function startSpsRound(room) {
  if (room.roundTimer) {
    clearTimeout(room.roundTimer);
    room.roundTimer = null;
  }
  room.choices = {};

  io.to(room.code).emit('spsRoundStart', {
    roundNumber: room.roundNumber,
    scores: room.scores,
    roundHistory: [...room.roundHistory],
  });

  room.roundTimer = setTimeout(() => {
    room.roundTimer = null;
    resolveSpsRound(room);
  }, 10000);

  // Schedule AI choice for single-player rooms
  if (room.isAiRoom) {
    if (room.aiTimer) { clearTimeout(room.aiTimer); room.aiTimer = null; }
    const humanId = room.players[0].id;
    const delay = 1500 + Math.random() * 3500;
    room.aiTimer = setTimeout(() => {
      room.aiTimer = null;
      if (rooms.get(room.code) !== room) return;
      if (room.status !== 'playing') return;
      if (room.choices['AI']) return;
      room.choices['AI'] = spsAiChoice(room);
      io.to(humanId).emit('opponentChose');
      if (room.choices[humanId]) {
        if (room.roundTimer) { clearTimeout(room.roundTimer); room.roundTimer = null; }
        resolveSpsRound(room);
      }
    }, delay);
  }
}

// ── GVB (Gigaverse Battle) logic ──────────────────────────────────────────────
const GVB_BASE = {
  hp: 10, max_armor: 5,
  sword_atk: 2, sword_def: 0,
  shield_atk: 0, shield_def: 2,
  magic_atk: 1, magic_def: 1,
};

// 'win' = m1 beats m2, 'loss' = m1 loses, 'tie' = same
function gvbOutcome(m1, m2) {
  if (m1 === m2) return 'tie';
  if ((m1 === 'sword' && m2 === 'magic') ||
      (m1 === 'shield' && m2 === 'sword') ||
      (m1 === 'magic' && m2 === 'shield')) return 'win';
  return 'loss';
}

function gvbDealDamage(room, targetId, amount) {
  if (amount <= 0) return;
  const armorAbsorb = Math.min(room.armor[targetId], amount);
  room.armor[targetId] -= armorAbsorb;
  room.hp[targetId] = Math.max(0, room.hp[targetId] - (amount - armorAbsorb));
}

// Called after round resolves. usedMove is the move the player chose this round.
function gvbUpdateCharges(playerCharges, usedMove) {
  for (const move of ['sword', 'shield', 'magic']) {
    const ch = playerCharges[move];
    if (move === usedMove) {
      // Count was decremented on selection — check if now 0
      if (ch.count === 0 && ch.cooldown === 0) ch.cooldown = 2;
      // Used move does not recharge this round
    } else if (ch.cooldown > 0) {
      ch.cooldown -= 1;
      if (ch.cooldown === 0) ch.count = 1; // available again with 1 charge
    } else {
      ch.count = Math.min(3, ch.count + 1); // recharge unused move
    }
  }
}

function validateAllocation(deltas) {
  const keys = ['hp', 'max_armor', 'sword_atk', 'sword_def', 'shield_atk', 'shield_def', 'magic_atk', 'magic_def'];
  if (keys.some(k => (deltas[k] || 0) < 0)) return false;
  return keys.reduce((acc, k) => acc + (deltas[k] || 0), 0) === 10;
}

function autoDistributeRemaining(deltas) {
  const keys = ['hp', 'max_armor', 'sword_atk', 'sword_def', 'shield_atk', 'shield_def', 'magic_atk', 'magic_def'];
  let remaining = 10 - keys.reduce((acc, k) => acc + (deltas[k] || 0), 0);
  if (remaining <= 0) return deltas;
  const result = { ...deltas };
  const toArmor = Math.floor(remaining / 2);
  result.max_armor = (result.max_armor || 0) + toArmor;
  result.hp = (result.hp || 0) + (remaining - toArmor);
  return result;
}

function buildStats(deltas) {
  return {
    hp:         GVB_BASE.hp         + (deltas.hp         || 0),
    max_armor:  GVB_BASE.max_armor  + (deltas.max_armor  || 0),
    sword_atk:  GVB_BASE.sword_atk  + (deltas.sword_atk  || 0),
    sword_def:  GVB_BASE.sword_def  + (deltas.sword_def  || 0),
    shield_atk: GVB_BASE.shield_atk + (deltas.shield_atk || 0),
    shield_def: GVB_BASE.shield_def + (deltas.shield_def || 0),
    magic_atk:  GVB_BASE.magic_atk  + (deltas.magic_atk  || 0),
    magic_def:  GVB_BASE.magic_def  + (deltas.magic_def  || 0),
  };
}

function initCharges() {
  return {
    sword:  { count: 3, cooldown: 0 },
    shield: { count: 3, cooldown: 0 },
    magic:  { count: 3, cooldown: 0 },
  };
}

function randomAvailableMove(playerCharges) {
  const available = ['sword', 'shield', 'magic'].filter(
    m => playerCharges[m].count > 0 && playerCharges[m].cooldown === 0
  );
  if (!available.length) return null;
  return available[Math.floor(Math.random() * available.length)];
}

// ── GVB AI ───────────────────────────────────────────────────────────────────
const GVB_AI_ARCHETYPES = [
  { name: 'Berserker',    hp: 2, max_armor: 1, sword_atk: 4, sword_def: 1, shield_atk: 0, shield_def: 0, magic_atk: 2, magic_def: 0 },
  { name: 'Wall',         hp: 3, max_armor: 3, sword_atk: 0, sword_def: 0, shield_atk: 1, shield_def: 3, magic_atk: 0, magic_def: 0 },
  { name: 'Sorcerer',     hp: 2, max_armor: 1, sword_atk: 0, sword_def: 0, shield_atk: 1, shield_def: 1, magic_atk: 4, magic_def: 1 },
  { name: 'Balanced',     hp: 2, max_armor: 2, sword_atk: 1, sword_def: 1, shield_atk: 1, shield_def: 1, magic_atk: 1, magic_def: 1 },
  { name: 'Glass Cannon', hp: 3, max_armor: 0, sword_atk: 3, sword_def: 0, shield_atk: 0, shield_def: 0, magic_atk: 4, magic_def: 0 },
];

function gvbAiAllocate() {
  const arch = GVB_AI_ARCHETYPES[Math.floor(Math.random() * GVB_AI_ARCHETYPES.length)];
  const { name, ...deltas } = arch;
  return deltas;
}

function gvbAiCombatMove(room) {
  const aiPlayer = room.players.find(p => p.id === 'AI');
  const aiCharges = room.charges['AI'];
  const available = ['sword', 'shield', 'magic'].filter(
    m => aiCharges[m].count > 0 && aiCharges[m].cooldown === 0
  );
  if (!available.length) return randomAvailableMove(aiCharges) || 'sword';
  if (available.length === 1) return available[0];

  // Sudden death: pick highest ATK available
  if (room.suddenDeath) {
    let bestMove = available[0], bestAtk = 0;
    for (const m of available) {
      const atk = aiPlayer.stats[`${m}_atk`];
      if (atk > bestAtk) { bestAtk = atk; bestMove = m; }
    }
    return bestMove;
  }

  const COUNTER = { sword: 'shield', shield: 'magic', magic: 'sword' };

  // Pattern counter (40%): check opponent's last 3 moves
  let counterPick = null;
  if (room.roundHistory.length >= 2) {
    const humanId = room.players.find(p => p.id !== 'AI').id;
    const recent = room.roundHistory.slice(-3);
    const counts = {};
    for (const entry of recent) {
      const m = entry.moves[humanId];
      if (m) counts[m] = (counts[m] || 0) + 1;
    }
    let mostCommon = null, maxCount = 0;
    for (const [m, c] of Object.entries(counts)) {
      if (c >= 2 && c > maxCount) { mostCommon = m; maxCount = c; }
    }
    if (mostCommon && available.includes(COUNTER[mostCommon])) {
      counterPick = COUNTER[mostCommon];
    }
  }

  // Stat-aware bias (30%): highest ATK stat from available
  let statPick = available[0], bestAtk = 0;
  for (const m of available) {
    const atk = aiPlayer.stats[`${m}_atk`];
    if (atk > bestAtk) { bestAtk = atk; statPick = m; }
  }

  // Weighted pick: 40% counter, 30% stat, 30% random
  const roll = Math.random();
  if (roll < 0.4 && counterPick) return counterPick;
  if (roll < 0.7) return statPick;
  return available[Math.floor(Math.random() * available.length)];
}

function startGvbBattle(room) {
  if (room.allocationTimer) { clearTimeout(room.allocationTimer); room.allocationTimer = null; }
  room.status = 'battle';
  const [p1, p2] = room.players;
  room.hp[p1.id]     = p1.stats.hp;     room.armor[p1.id] = p1.stats.max_armor;
  room.hp[p2.id]     = p2.stats.hp;     room.armor[p2.id] = p2.stats.max_armor;
  room.charges[p1.id] = initCharges();
  room.charges[p2.id] = initCharges();
  io.to(p1.id).emit('battle_start', { your_stats: p1.stats, opponent_stats: p2.stats, opponent_name: p2.name, your_charges: room.charges[p1.id], opp_charges: room.charges[p2.id] });
  io.to(p2.id).emit('battle_start', { your_stats: p2.stats, opponent_stats: p1.stats, opponent_name: p1.name, your_charges: room.charges[p2.id], opp_charges: room.charges[p1.id] });
  startGvbTurnTimer(room);
}

function startGvbTurnTimer(room) {
  if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }
  room.turnTimer = setTimeout(() => {
    room.turnTimer = null;
    for (const player of room.players) {
      if (!room.choices[player.id]) {
        const move = randomAvailableMove(room.charges[player.id]);
        if (move) {
          room.charges[player.id][move].count -= 1;
          room.choices[player.id] = move;
        }
      }
    }
    resolveGvbRound(room);
  }, 30000);

  // Schedule AI combat move
  if (room.isAiRoom) {
    if (room.aiTimer) { clearTimeout(room.aiTimer); room.aiTimer = null; }
    const delay = 1000 + Math.random() * 2000;
    room.aiTimer = setTimeout(() => {
      room.aiTimer = null;
      if (rooms.get(room.code) !== room || room.status !== 'battle') return;
      if (room.choices['AI']) return;
      const move = gvbAiCombatMove(room);
      if (!move || room.charges['AI'][move].count <= 0 || room.charges['AI'][move].cooldown > 0) return;
      room.charges['AI'][move].count -= 1;
      room.choices['AI'] = move;
      const humanId = room.players.find(p => p.id !== 'AI').id;
      io.to(humanId).emit('opponent_chose', {});
      if (room.choices[humanId]) resolveGvbRound(room);
    }, delay);
  }
}

function resolveGvbRound(room) {
  if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }
  if (room.aiTimer) { clearTimeout(room.aiTimer); room.aiTimer = null; }
  const [p1, p2] = room.players;
  const m1 = room.choices[p1.id];
  const m2 = room.choices[p2.id];
  const outcome = gvbOutcome(m1, m2); // p1's perspective

  function ms(stats, move) {
    return { atk: stats[`${move}_atk`], def: room.suddenDeath ? 0 : stats[`${move}_def`] };
  }

  const p1ms = ms(p1.stats, m1);
  const p2ms = ms(p2.stats, m2);
  let dmgToP1 = 0, dmgToP2 = 0, restoreP1 = 0, restoreP2 = 0;

  if (outcome === 'tie') {
    restoreP1 = p1ms.def; restoreP2 = p2ms.def;
    dmgToP1 = p2ms.atk;  dmgToP2 = p1ms.atk;
  } else if (outcome === 'win') {
    restoreP1 = p1ms.def; dmgToP2 = p1ms.atk;
  } else {
    restoreP2 = p2ms.def; dmgToP1 = p2ms.atk;
  }

  // Restore armor first (matters for ties), then apply damage
  if (restoreP1 > 0) room.armor[p1.id] = Math.min(p1.stats.max_armor, room.armor[p1.id] + restoreP1);
  if (restoreP2 > 0) room.armor[p2.id] = Math.min(p2.stats.max_armor, room.armor[p2.id] + restoreP2);
  gvbDealDamage(room, p1.id, dmgToP1);
  gvbDealDamage(room, p2.id, dmgToP2);

  gvbUpdateCharges(room.charges[p1.id], m1);
  gvbUpdateCharges(room.charges[p2.id], m2);

  const resolvedRound = room.roundNumber;
  room.roundHistory.push({ roundNum: resolvedRound, moves: { [p1.id]: m1, [p2.id]: m2 }, outcome, dmgToP1, dmgToP2, hpAfter: { [p1.id]: room.hp[p1.id], [p2.id]: room.hp[p2.id] }, armorAfter: { [p1.id]: room.armor[p1.id], [p2.id]: room.armor[p2.id] } });
  if (room.roundHistory.length > 10) room.roundHistory.shift();
  room.roundNumber += 1;
  room.choices = {};

  // Check HP
  const p1dead = room.hp[p1.id] <= 0;
  const p2dead = room.hp[p2.id] <= 0;
  let gameOver = p1dead || p2dead;
  let winnerId = null, reason = null;
  if (gameOver) {
    if (p1dead && p2dead) { winnerId = 'draw'; reason = 'draw'; }
    else if (p1dead)      { winnerId = p2.id;  reason = 'hp_zero'; }
    else                  { winnerId = p1.id;  reason = 'hp_zero'; }
  }

  // Sudden death trigger after round 30
  let triggerSuddenDeath = false;
  if (!gameOver && !room.suddenDeath && resolvedRound >= 30) {
    room.suddenDeath = true;
    room.armor[p1.id] = 0; room.armor[p2.id] = 0;
    p1.stats.max_armor = 0; p2.stats.max_armor = 0;
    triggerSuddenDeath = true;
  }

  // Sudden death timeout after round 40
  if (!gameOver && room.suddenDeath && resolvedRound >= 40) {
    gameOver = true;
    if      (room.hp[p1.id] > room.hp[p2.id]) { winnerId = p1.id;   reason = 'sudden_death_hp'; }
    else if (room.hp[p2.id] > room.hp[p1.id]) { winnerId = p2.id;   reason = 'sudden_death_hp'; }
    else                                        { winnerId = 'draw';  reason = 'sudden_death_timeout'; }
  }

  if (gameOver) room.status = 'over';

  // Emit personalized round_result to each player
  for (const player of room.players) {
    const opp = room.players.find(p => p.id !== player.id);
    const isP1 = player.id === p1.id;
    const myMove    = isP1 ? m1 : m2;
    const oppMove   = isP1 ? m2 : m1;
    const myOutcome = isP1 ? outcome : (outcome === 'win' ? 'loss' : outcome === 'loss' ? 'win' : 'tie');
    const dmgToMe   = isP1 ? dmgToP1 : dmgToP2;
    const dmgToOpp  = isP1 ? dmgToP2 : dmgToP1;
    io.to(player.id).emit('round_result', {
      round: resolvedRound, your_move: myMove, opponent_move: oppMove, outcome: myOutcome,
      damage_to_you: dmgToMe, damage_to_opp: dmgToOpp,
      your_hp: room.hp[player.id], your_armor: room.armor[player.id],
      opp_hp: room.hp[opp.id],     opp_armor: room.armor[opp.id],
      your_charges: room.charges[player.id], opp_charges: room.charges[opp.id],
      is_sudden_death: triggerSuddenDeath, game_over: gameOver,
    });
  }

  if (gameOver) {
    setTimeout(() => {
      for (const player of room.players) {
        const opp = room.players.find(p => p.id !== player.id);
        const myOutcome = winnerId === 'draw' ? 'draw' : winnerId === player.id ? 'win' : 'loss';
        io.to(player.id).emit('game_over', { outcome: myOutcome, reason, your_hp: room.hp[player.id], opp_hp: room.hp[opp.id], rounds_played: resolvedRound });
      }
    }, 3000);
  } else if (triggerSuddenDeath) {
    setTimeout(() => {
      if (rooms.get(room.code) === room && room.status === 'battle') {
        io.to(room.code).emit('sudden_death', {});
        startGvbTurnTimer(room);
      }
    }, 4000);
  } else {
    setTimeout(() => {
      if (rooms.get(room.code) === room && room.status === 'battle') startGvbTurnTimer(room);
    }, 4000);
  }
}

// ── TTT AI move scheduler ────────────────────────────────────────────────────
function scheduleTttAiMove(room, code) {
  if (room.aiTimer) clearTimeout(room.aiTimer);
  const emptyCells = room.board.filter(c => c === null).length;
  const delay = emptyCells > 6 ? 800 + Math.random() * 700 : 300 + Math.random() * 300;
  room.aiTimer = setTimeout(() => {
    room.aiTimer = null;
    if (rooms.get(room.code) !== room || room.status !== 'playing') return;
    const aiPlayer = room.players.find(p => p.id === 'AI');
    const aiIndex = tttAiMove(room.board, room.gridSize, aiPlayer.symbol);
    if (aiIndex < 0) return;
    room.board[aiIndex] = aiPlayer.symbol;

    const winner = checkWin(room.board, room.gridSize);
    const draw = !winner && isDraw(room.board);

    if (winner || draw) {
      room.status = 'over';
      if (winner) room.scores['AI'] = (room.scores['AI'] || 0) + 1;
      io.to(code).emit('gameOver', {
        board: room.board,
        winner: winner ? { id: 'AI', name: aiPlayer.name, symbol: winner } : null,
        draw, scores: room.scores, players: room.players,
      });
    } else {
      const humanId = room.players.find(p => p.id !== 'AI').id;
      room.currentTurn = humanId;
      io.to(code).emit('boardUpdate', { board: room.board, currentTurn: room.currentTurn });
    }
  }, delay);
}

// ── Socket handlers ───────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('createRoom', ({ name, gridSize, gameType, bestOf }) => {
    const code = generateRoomCode();
    const type = gameType === 'sps' ? 'sps' : gameType === 'gvb' ? 'gvb' : 'ttt';
    let room;

    if (type === 'gvb') {
      room = {
        code, gameType: 'gvb',
        players: [{ id: socket.id, name: name || 'Player 1', stats: null }],
        status: 'waiting', allocationTimer: null, turnTimer: null,
        choices: {}, hp: {}, armor: {}, charges: {},
        roundNumber: 1, suddenDeath: false, roundHistory: [], rematchVotes: new Set(),
      };
      socket.emit('roomCreated', { code, gameType: 'gvb' });
    } else if (type === 'ttt') {
      const validSizes = [3, 4, 5];
      const size = validSizes.includes(gridSize) ? gridSize : 3;
      room = {
        code, gameType: 'ttt', gridSize: size,
        board: Array(size * size).fill(null),
        players: [{ id: socket.id, name: name || 'Player 1', symbol: 'X' }],
        currentTurn: null, scores: { [socket.id]: 0 },
        status: 'waiting', rematchVotes: new Set(), round: 1,
      };
      socket.emit('roomCreated', { code, gameType: 'ttt', gridSize: size });
    } else {
      const validBestOf = [3, 5, 7];
      const bo = validBestOf.includes(bestOf) ? bestOf : 3;
      room = {
        code, gameType: 'sps', bestOf: bo,
        players: [{ id: socket.id, name: name || 'Player 1' }],
        scores: { [socket.id]: 0 },
        choices: {}, roundTimer: null,
        roundHistory: [], roundNumber: 1,
        status: 'waiting', rematchVotes: new Set(),
      };
      socket.emit('roomCreated', { code, gameType: 'sps', bestOf: bo });
    }

    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    console.log(`Room ${code} created by ${name} (${type})`);
  });

  socket.on('createAiRoom', ({ name, gameType: gt, gridSize: gs, bestOf }) => {
    const type = gt === 'sps' ? 'sps' : gt === 'gvb' ? 'gvb' : gt === 'ttt' ? 'ttt' : 'sps';
    const code = generateRoomCode();

    if (type === 'ttt') {
      const validSizes = [3, 4, 5];
      const size = validSizes.includes(gs) ? gs : 3;
      const room = {
        code, gameType: 'ttt', gridSize: size, isAiRoom: true,
        board: Array(size * size).fill(null),
        players: [{ id: socket.id, name: name || 'Player 1', symbol: 'X' }, { id: 'AI', name: 'CPU', symbol: 'O' }],
        currentTurn: socket.id, scores: { [socket.id]: 0, 'AI': 0 },
        status: 'playing', rematchVotes: new Set(), round: 1, aiTimer: null,
      };
      rooms.set(code, room);
      socket.join(code);
      socket.data.roomCode = code;
      socket.emit('gameStart', {
        board: room.board, currentTurn: room.currentTurn,
        players: room.players, gridSize: room.gridSize, scores: room.scores,
      });
      console.log(`AI TTT room ${code} created by ${name}`);

    } else if (type === 'gvb') {
      const room = {
        code, gameType: 'gvb', isAiRoom: true,
        players: [{ id: socket.id, name: name || 'Player 1', stats: null }, { id: 'AI', name: 'CPU', stats: null }],
        status: 'allocating', allocationTimer: null, turnTimer: null, aiTimer: null,
        choices: {}, hp: {}, armor: {}, charges: {},
        roundNumber: 1, suddenDeath: false, roundHistory: [], rematchVotes: new Set(),
      };
      rooms.set(code, room);
      socket.join(code);
      socket.data.roomCode = code;
      socket.emit('room_joined', { players: room.players });
      // AI allocates after 2-4s delay
      const aiDelay = 2000 + Math.random() * 2000;
      room.aiTimer = setTimeout(() => {
        room.aiTimer = null;
        if (rooms.get(room.code) !== room || room.status !== 'allocating') return;
        const aiPlayer = room.players.find(p => p.id === 'AI');
        const deltas = gvbAiAllocate();
        aiPlayer.stats = buildStats(deltas);
        socket.emit('opponent_ready', {});
        if (room.players.every(p => p.stats)) startGvbBattle(room);
      }, aiDelay);
      // 60s allocation timer
      room.allocationTimer = setTimeout(() => {
        room.allocationTimer = null;
        for (const player of room.players) {
          if (!player.stats) player.stats = buildStats(autoDistributeRemaining({}));
        }
        if (rooms.get(room.code) === room && room.status === 'allocating') startGvbBattle(room);
      }, 60000);
      console.log(`AI GVB room ${code} created by ${name}`);

    } else {
      // SPS
      const validBestOf = [3, 5, 7];
      const bo = validBestOf.includes(bestOf) ? bestOf : 3;
      const room = {
        code, gameType: 'sps', bestOf: bo, isAiRoom: true,
        players: [{ id: socket.id, name: name || 'Player 1' }, { id: 'AI', name: 'CPU' }],
        scores: { [socket.id]: 0, 'AI': 0 },
        choices: {}, roundTimer: null, aiTimer: null,
        roundHistory: [], roundNumber: 1,
        status: 'playing', rematchVotes: new Set(),
      };
      rooms.set(code, room);
      socket.join(code);
      socket.data.roomCode = code;
      socket.emit('spsGameStart', {
        players: room.players, scores: room.scores,
        bestOf: bo, roundNumber: 1, roundHistory: [],
      });
      setTimeout(() => startSpsRound(room), 1200);
      console.log(`AI SPS room ${code} created by ${name}`);
    }
  });

  socket.on('joinRoom', ({ code, name }) => {
    const room = rooms.get(code?.toUpperCase());
    if (!room) { socket.emit('error', { message: 'Room not found. Check your code and try again.' }); return; }
    if (room.players.length >= 2) { socket.emit('error', { message: 'Room is full.' }); return; }
    if (room.status !== 'waiting') { socket.emit('error', { message: 'Game already in progress.' }); return; }

    socket.join(code.toUpperCase());
    socket.data.roomCode = code.toUpperCase();

    if (room.gameType === 'ttt') {
      room.players.push({ id: socket.id, name: name || 'Player 2', symbol: 'O' });
      room.scores[socket.id] = 0;
      room.currentTurn = room.players[0].id;
      room.status = 'playing';
      io.to(room.code).emit('gameStart', {
        board: room.board, currentTurn: room.currentTurn,
        players: room.players, gridSize: room.gridSize, scores: room.scores,
      });
    } else if (room.gameType === 'sps') {
      room.players.push({ id: socket.id, name: name || 'Player 2' });
      room.scores[socket.id] = 0;
      room.status = 'playing';
      io.to(room.code).emit('spsGameStart', {
        players: room.players, scores: room.scores,
        bestOf: room.bestOf, roundNumber: room.roundNumber,
        roundHistory: [],
      });
      setTimeout(() => startSpsRound(room), 1200);
    } else if (room.gameType === 'gvb') {
      room.players.push({ id: socket.id, name: name || 'Player 2', stats: null });
      room.status = 'allocating';
      io.to(room.code).emit('room_joined', { players: room.players });
      // 60s allocation timer — auto-distribute for anyone who hasn't submitted
      room.allocationTimer = setTimeout(() => {
        room.allocationTimer = null;
        for (const player of room.players) {
          if (!player.stats) player.stats = buildStats(autoDistributeRemaining({}));
        }
        if (rooms.get(room.code) === room && room.status === 'allocating') startGvbBattle(room);
      }, 60000);
    }
    console.log(`${name} joined room ${code}`);
  });

  // TTT move
  socket.on('makeMove', ({ index }) => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room || room.gameType !== 'ttt' || room.status !== 'playing') return;
    if (room.currentTurn !== socket.id) return;
    if (room.board[index] !== null) return;
    if (index < 0 || index >= room.gridSize * room.gridSize) return;

    const player = room.players.find(p => p.id === socket.id);
    room.board[index] = player.symbol;

    const winner = checkWin(room.board, room.gridSize);
    const draw = !winner && isDraw(room.board);

    if (winner || draw) {
      room.status = 'over';
      if (winner) room.scores[socket.id] = (room.scores[socket.id] || 0) + 1;
      io.to(code).emit('gameOver', {
        board: room.board,
        winner: winner ? { id: socket.id, name: player.name, symbol: winner } : null,
        draw, scores: room.scores, players: room.players,
      });
    } else {
      room.currentTurn = room.players.find(p => p.id !== socket.id).id;
      io.to(code).emit('boardUpdate', { board: room.board, currentTurn: room.currentTurn });

      // Schedule AI move if it's now AI's turn
      if (room.isAiRoom && room.currentTurn === 'AI') {
        scheduleTttAiMove(room, code);
      }
    }
  });

  // SPS choice
  socket.on('submitChoice', ({ choice }) => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room || room.gameType !== 'sps' || room.status !== 'playing') return;
    if (room.choices[socket.id]) return;
    if (!['rock', 'paper', 'scissors'].includes(choice)) return;

    room.choices[socket.id] = choice;
    socket.to(code).emit('opponentChose');

    if (Object.keys(room.choices).length === 2) {
      if (room.roundTimer) { clearTimeout(room.roundTimer); room.roundTimer = null; }
      resolveSpsRound(room);
    }
  });

  // GVB allocation submission
  socket.on('submit_allocation', (deltas) => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room || room.gameType !== 'gvb' || room.status !== 'allocating') return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.stats) return; // already submitted
    if (!validateAllocation(deltas)) { socket.emit('error', { message: 'Invalid allocation. Must spend exactly 10 points, all ≥ 0.' }); return; }
    player.stats = buildStats(deltas);
    socket.to(code).emit('opponent_ready', {});
    if (room.players.every(p => p.stats)) startGvbBattle(room);
  });

  // GVB move submission
  socket.on('submit_move', ({ move }) => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room || room.gameType !== 'gvb' || room.status !== 'battle') return;
    if (room.choices[socket.id]) return; // already submitted
    const playerCharges = room.charges[socket.id];
    if (!playerCharges) return;
    let selectedMove = move;
    // Validate move is available; if not, auto-select
    if (!['sword', 'shield', 'magic'].includes(selectedMove) ||
        playerCharges[selectedMove].cooldown > 0 || playerCharges[selectedMove].count <= 0) {
      selectedMove = randomAvailableMove(playerCharges);
      if (!selectedMove) return;
    }
    room.charges[socket.id][selectedMove].count -= 1; // consume charge on selection
    room.choices[socket.id] = selectedMove;
    socket.to(code).emit('opponent_chose', {});
    if (room.players.every(p => room.choices[p.id])) resolveGvbRound(room);
  });

  socket.on('playAgain', () => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room || room.status !== 'over') return;

    if (room.isAiRoom) {
      if (room.aiTimer) { clearTimeout(room.aiTimer); room.aiTimer = null; }
      if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }
      if (room.allocationTimer) { clearTimeout(room.allocationTimer); room.allocationTimer = null; }

      if (room.gameType === 'ttt') {
        room.round += 1;
        room.board = Array(room.gridSize * room.gridSize).fill(null);
        room.players.forEach(p => { p.symbol = p.symbol === 'X' ? 'O' : 'X'; });
        room.currentTurn = room.players.find(p => p.symbol === 'X').id;
        room.status = 'playing';
        socket.emit('rematchReady', {
          board: room.board, currentTurn: room.currentTurn,
          players: room.players, scores: room.scores, gridSize: room.gridSize,
        });
        // If AI is X (goes first), schedule AI move
        if (room.currentTurn === 'AI') {
          scheduleTttAiMove(room, code);
        }
      } else if (room.gameType === 'gvb') {
        room.players.forEach(p => { p.stats = null; });
        room.hp = {}; room.armor = {}; room.charges = {};
        room.choices = {}; room.roundNumber = 1; room.suddenDeath = false; room.roundHistory = [];
        room.status = 'allocating';
        socket.emit('rematch_starting', {});
        // AI re-allocates after 2-4s
        const aiDelay = 2000 + Math.random() * 2000;
        room.aiTimer = setTimeout(() => {
          room.aiTimer = null;
          if (rooms.get(room.code) !== room || room.status !== 'allocating') return;
          const aiPlayer = room.players.find(p => p.id === 'AI');
          const deltas = gvbAiAllocate();
          aiPlayer.stats = buildStats(deltas);
          socket.emit('opponent_ready', {});
          if (room.players.every(p => p.stats)) startGvbBattle(room);
        }, aiDelay);
        room.allocationTimer = setTimeout(() => {
          room.allocationTimer = null;
          for (const player of room.players) {
            if (!player.stats) player.stats = buildStats(autoDistributeRemaining({}));
          }
          if (rooms.get(room.code) === room && room.status === 'allocating') startGvbBattle(room);
        }, 60000);
      } else {
        // SPS
        room.status = 'playing';
        room.scores = { [socket.id]: 0, 'AI': 0 };
        room.roundNumber = 1;
        room.choices = {};
        room.roundHistory = [];
        socket.emit('spsGameStart', {
          players: room.players, scores: room.scores,
          bestOf: room.bestOf, roundNumber: 1, roundHistory: [],
        });
        setTimeout(() => startSpsRound(room), 1200);
      }
      return;
    }

    room.rematchVotes.add(socket.id);

    if (room.rematchVotes.size === 2) {
      room.rematchVotes.clear();
      room.status = 'playing';

      if (room.gameType === 'ttt') {
        room.round += 1;
        room.board = Array(room.gridSize * room.gridSize).fill(null);
        room.players.forEach(p => { p.symbol = p.symbol === 'X' ? 'O' : 'X'; });
        room.currentTurn = room.players.find(p => p.symbol === 'X').id;
        io.to(code).emit('rematchReady', {
          board: room.board, currentTurn: room.currentTurn,
          players: room.players, scores: room.scores, gridSize: room.gridSize,
        });
      } else if (room.gameType === 'sps') {
        room.scores = {};
        room.players.forEach(p => { room.scores[p.id] = 0; });
        room.roundNumber = 1;
        room.choices = {};
        room.roundHistory = [];
        io.to(code).emit('spsGameStart', {
          players: room.players, scores: room.scores,
          bestOf: room.bestOf, roundNumber: 1, roundHistory: [],
        });
        setTimeout(() => startSpsRound(room), 1200);
      } else if (room.gameType === 'gvb') {
        room.players.forEach(p => { p.stats = null; });
        room.hp = {}; room.armor = {}; room.charges = {};
        room.choices = {}; room.roundNumber = 1; room.suddenDeath = false; room.roundHistory = [];
        room.status = 'allocating';
        io.to(code).emit('rematch_starting', {});
        room.allocationTimer = setTimeout(() => {
          room.allocationTimer = null;
          for (const player of room.players) {
            if (!player.stats) player.stats = buildStats(autoDistributeRemaining({}));
          }
          if (rooms.get(room.code) === room && room.status === 'allocating') startGvbBattle(room);
        }, 60000);
      }
    } else {
      socket.to(code).emit('opponentWantsRematch');
    }
  });

  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room) return;
    if (room.roundTimer) clearTimeout(room.roundTimer);
    if (room.aiTimer) clearTimeout(room.aiTimer);
    if (room.allocationTimer) clearTimeout(room.allocationTimer);
    if (room.turnTimer) clearTimeout(room.turnTimer);
    console.log(`Player ${socket.id} disconnected from room ${code}`);
    if (!room.isAiRoom) socket.to(code).emit('opponentDisconnected');
    rooms.delete(code);
    console.log(`Room ${code} deleted`);
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
