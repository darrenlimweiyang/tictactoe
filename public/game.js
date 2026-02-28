const socket = io();

// ══ SHARED STATE ════════════════════════════════════════════════════════════
let myId = null;
let players = [];
let scores = {};
let gameType = 'ttt';

// TTT state
let mySymbol = null;
let gridSize = 3;
let currentTurn = null;
let tttGameOver = false;
let tttWaitingRematch = false;

// SPS state
let bestOf = 3;
let spsRound = 1;
let myChoice = null;
let spsMatchOver = false;
let spsWaitingRematch = false;
let spsIsAiGame = false;
let tttIsAiGame = false;
let gvbIsAiGame = false;
let roundHistory = [];
let timerRafId = null;
let timerStart = null;
const TIMER_DURATION = 10000;

// Lobby state
let selectedGameType = 'ttt';
let selectedGridSize = 3;
let selectedBestOf = 3;

// ══ DOM REFS ════════════════════════════════════════════════════════════════
const screens = {
  lobby:       document.getElementById('screen-lobby'),
  waiting:     document.getElementById('screen-waiting'),
  game:        document.getElementById('screen-game'),
  sps:         document.getElementById('screen-sps'),
  'gvb-alloc': document.getElementById('screen-gvb-alloc'),
  'gvb-battle':document.getElementById('screen-gvb-battle'),
};

// Lobby
const playerNameInput = document.getElementById('player-name');
const roomCodeInput   = document.getElementById('room-code-input');
const lobbyError      = document.getElementById('lobby-error');
const displayRoomCode = document.getElementById('display-room-code');
const gridSizeSection = document.getElementById('grid-size-section');
const bestofSection   = document.getElementById('bestof-section');

// TTT
const gameRoomCode    = document.getElementById('game-room-code');
const boardEl         = document.getElementById('game-board');
const turnIndicator   = document.getElementById('turn-indicator');
const gameOverOverlay = document.getElementById('game-over-overlay');
const disconnOverlay  = document.getElementById('disconnected-overlay');
const resultText      = document.getElementById('result-text');
const resultIcon      = document.getElementById('result-icon');
const finalScores     = document.getElementById('final-scores');
const btnPlayAgain    = document.getElementById('btn-play-again');
const rematchStatus   = document.getElementById('rematch-status');

// SPS
const spsStatus       = document.getElementById('sps-status');
const spsRoundLabel   = document.getElementById('sps-round-label');
const spsRoomCode     = document.getElementById('sps-room-code');
const bestofBar       = document.getElementById('bestof-bar');
const timerWrap       = document.getElementById('timer-wrap');
const timerBar        = document.getElementById('timer-bar');
const choiceArea      = document.getElementById('choice-area');
const revealArea      = document.getElementById('reveal-area');
const countdownDisplay= document.getElementById('countdown-display');
const myRevealCard    = document.getElementById('my-reveal-card');
const oppRevealCard   = document.getElementById('opp-reveal-card');
const myCardContent   = document.getElementById('my-card-content');
const oppCardContent  = document.getElementById('opp-card-content');
const myCardName      = document.getElementById('my-card-name');
const oppCardName     = document.getElementById('opp-card-name');
const roundResultText = document.getElementById('round-result-text');
const historyRows     = document.getElementById('history-rows');
const spsHistory      = document.getElementById('sps-history');
const spsMatchOverEl  = document.getElementById('sps-match-over');
const spsMatchIcon    = document.getElementById('sps-match-icon');
const spsMatchText    = document.getElementById('sps-match-text');
const spsFinalScores  = document.getElementById('sps-final-scores');
const spsBtnPlayAgain = document.getElementById('sps-btn-play-again');
const spsRematchStatus= document.getElementById('sps-rematch-status');
const spsDisconnected = document.getElementById('sps-disconnected');

const CHOICE_EMOJI = { rock: '✊', paper: '🖐️', scissors: '✌️', none: '❓' };

// ══ LOBBY LOGIC ═════════════════════════════════════════════════════════════

// Game type toggle
document.querySelectorAll('.game-type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.game-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedGameType = btn.dataset.game;
    const aiBtn = document.getElementById('btn-play-vs-ai');
    aiBtn.classList.remove('hidden');
    if (selectedGameType === 'sps') {
      gridSizeSection.classList.add('hidden');
      bestofSection.classList.remove('hidden');
    } else if (selectedGameType === 'gvb') {
      gridSizeSection.classList.add('hidden');
      bestofSection.classList.add('hidden');
    } else {
      gridSizeSection.classList.remove('hidden');
      bestofSection.classList.add('hidden');
    }
  });
});

// Grid size
document.querySelectorAll('.size-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedGridSize = parseInt(btn.dataset.size, 10);
  });
});

// Best-of
document.querySelectorAll('.bestof-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.bestof-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedBestOf = parseInt(btn.dataset.bestof, 10);
  });
});

document.getElementById('btn-create').addEventListener('click', () => {
  const name = playerNameInput.value.trim() || 'Player 1';
  socket.emit('createRoom', {
    name,
    gameType: selectedGameType,
    gridSize: selectedGridSize,
    bestOf: selectedBestOf,
  });
});

document.getElementById('btn-play-vs-ai').addEventListener('click', () => {
  const name = playerNameInput.value.trim() || 'Player 1';
  socket.emit('createAiRoom', { name, gameType: selectedGameType, gridSize: selectedGridSize, bestOf: selectedBestOf });
});

document.getElementById('btn-join').addEventListener('click', () => {
  const name = playerNameInput.value.trim() || 'Player 2';
  const code = roomCodeInput.value.trim().toUpperCase();
  if (!code) { showLobbyError('Please enter a room code.'); return; }
  socket.emit('joinRoom', { code, name });
});

roomCodeInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-join').click();
});

// TTT play again
btnPlayAgain.addEventListener('click', () => {
  if (tttWaitingRematch) return;
  socket.emit('playAgain');
  if (!tttIsAiGame) {
    tttWaitingRematch = true;
    btnPlayAgain.disabled = true;
    btnPlayAgain.textContent = 'Waiting...';
    rematchStatus.classList.remove('hidden');
  }
});

// SPS play again
spsBtnPlayAgain.addEventListener('click', () => {
  if (spsWaitingRematch) return;
  socket.emit('playAgain');
  if (!spsIsAiGame) {
    spsWaitingRematch = true;
    spsBtnPlayAgain.disabled = true;
    spsBtnPlayAgain.textContent = 'Waiting...';
    spsRematchStatus.classList.remove('hidden');
  }
});

// Choice buttons
document.querySelectorAll('.choice-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (myChoice) return; // already picked
    const choice = btn.dataset.choice;
    lockInChoice(choice);
  });
});

// ══ UTILS ═══════════════════════════════════════════════════════════════════

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    el.classList.toggle('active', key === name);
  });
}

function showLobbyError(msg) {
  lobbyError.textContent = msg;
  lobbyError.classList.remove('hidden');
}

function getRoomCode() {
  return displayRoomCode.textContent !== '----' ? displayRoomCode.textContent : '';
}

// ══ TTT RENDERING ════════════════════════════════════════════════════════════

function renderBoard(board) {
  const N = gridSize;
  const cellSize = Math.min(Math.floor((Math.min(window.innerWidth, 560) - 56) / N), 120);
  boardEl.style.gridTemplateColumns = `repeat(${N}, ${cellSize}px)`;
  boardEl.innerHTML = '';
  board.forEach((cell, i) => {
    const div = document.createElement('div');
    div.className = 'cell' + (cell ? ` taken ${cell.toLowerCase()}` : '');
    div.style.width  = `${cellSize}px`;
    div.style.height = `${cellSize}px`;
    div.style.fontSize = cellSize < 60 ? '1.2rem' : cellSize < 80 ? '1.6rem' : '2rem';
    div.textContent = cell || '';
    if (!cell && !tttGameOver && currentTurn === myId) {
      div.addEventListener('click', () => socket.emit('makeMove', { index: i }));
    }
    boardEl.appendChild(div);
  });
}

function highlightWinningCells(board) {
  const cells = boardEl.querySelectorAll('.cell');
  const N = gridSize;
  function mark(indices) { indices.forEach(i => cells[i].classList.add('winning')); }
  for (let r = 0; r < N; r++) {
    const row = Array.from({ length: N }, (_, c) => r * N + c);
    const sym = board[row[0]];
    if (sym && row.every(i => board[i] === sym)) { mark(row); return; }
  }
  for (let c = 0; c < N; c++) {
    const col = Array.from({ length: N }, (_, r) => r * N + c);
    const sym = board[col[0]];
    if (sym && col.every(i => board[i] === sym)) { mark(col); return; }
  }
  const d1 = Array.from({ length: N }, (_, i) => i * N + i);
  if (board[d1[0]] && d1.every(i => board[i] === board[d1[0]])) { mark(d1); return; }
  const d2 = Array.from({ length: N }, (_, i) => i * N + (N - 1 - i));
  if (board[d2[0]] && d2.every(i => board[i] === board[d2[0]])) { mark(d2); }
}

function updateTttScoreBar() {
  if (players.length < 2) return;
  const p1 = players[0], p2 = players[1];
  document.getElementById('name-p1').textContent = p1.name;
  document.getElementById('name-p2').textContent = p2.name;
  document.querySelector('#score-p1 .symbol').textContent = p1.symbol;
  document.querySelector('#score-p2 .symbol').textContent = p2.symbol;
  document.querySelector('#score-p1 .symbol').className = `symbol ${p1.symbol === 'X' ? 'x' : 'o'}-symbol`;
  document.querySelector('#score-p2 .symbol').className = `symbol ${p2.symbol === 'X' ? 'x' : 'o'}-symbol`;
  document.getElementById('val-p1').textContent = scores[p1.id] ?? 0;
  document.getElementById('val-p2').textContent = scores[p2.id] ?? 0;
}

function updateTurnIndicator() {
  if (currentTurn === myId) {
    turnIndicator.textContent = 'Your turn!';
    turnIndicator.classList.add('your-turn');
  } else {
    const opp = players.find(p => p.id !== myId);
    turnIndicator.textContent = opp ? `${opp.name}'s turn...` : "Opponent's turn...";
    turnIndicator.classList.remove('your-turn');
  }
}

function showTttGameOver({ winner, draw, board }) {
  tttGameOver = true;
  tttWaitingRematch = false;
  btnPlayAgain.disabled = false;
  btnPlayAgain.textContent = 'Play Again';
  rematchStatus.classList.add('hidden');
  if (draw) {
    resultIcon.textContent = '🤝'; resultText.textContent = "It's a Draw!";
  } else if (winner.id === myId) {
    resultIcon.textContent = '🎉'; resultText.textContent = 'You Win!';
  } else {
    resultIcon.textContent = '😔'; resultText.textContent = `${winner.name} Wins!`;
  }
  finalScores.innerHTML = players.map(p => `
    <div class="final-score-item">
      <span class="fscore" style="color:${p.symbol === 'X' ? 'var(--accent-x)' : 'var(--accent-o)'}">${scores[p.id] ?? 0}</span>
      <span class="fname">${p.name}</span>
    </div>
  `).join('');
  if (board && !draw) highlightWinningCells(board);
  gameOverOverlay.classList.remove('hidden');
}

// ══ SPS LOGIC ════════════════════════════════════════════════════════════════

function updateSpsScoreBar() {
  if (players.length < 2) return;
  const p1 = players[0], p2 = players[1];
  document.getElementById('sps-name-p1').textContent = p1.name;
  document.getElementById('sps-name-p2').textContent = p2.name;

  // Animate score change
  const v1El = document.getElementById('sps-val-p1');
  const v2El = document.getElementById('sps-val-p2');
  const new1 = scores[p1.id] ?? 0;
  const new2 = scores[p2.id] ?? 0;
  if (v1El.textContent !== String(new1)) { v1El.textContent = new1; v1El.style.animation = 'none'; v1El.offsetHeight; v1El.style.animation = 'pulse 0.4s ease'; }
  if (v2El.textContent !== String(new2)) { v2El.textContent = new2; v2El.style.animation = 'none'; v2El.offsetHeight; v2El.style.animation = 'pulse 0.4s ease'; }
}

function startVisualTimer() {
  stopVisualTimer();
  timerBar.style.width = '100%';
  timerBar.classList.remove('urgent');
  timerWrap.classList.remove('urgent');
  timerStart = Date.now();

  function tick() {
    const elapsed = Date.now() - timerStart;
    const remaining = Math.max(0, TIMER_DURATION - elapsed);
    const pct = (remaining / TIMER_DURATION) * 100;
    timerBar.style.width = pct + '%';
    if (remaining <= 3000) {
      timerBar.classList.add('urgent');
      timerWrap.classList.add('urgent');
    }
    if (remaining > 0) {
      timerRafId = requestAnimationFrame(tick);
    }
  }
  timerRafId = requestAnimationFrame(tick);
}

function stopVisualTimer() {
  if (timerRafId) { cancelAnimationFrame(timerRafId); timerRafId = null; }
  timerBar.classList.remove('urgent');
  timerWrap.classList.remove('urgent');
}

function lockInChoice(choice) {
  myChoice = choice;
  socket.emit('submitChoice', { choice });

  // Animate the chosen button
  document.querySelectorAll('.choice-btn').forEach(btn => {
    if (btn.dataset.choice === choice) {
      btn.classList.add('clicked', 'rippling');
      setTimeout(() => {
        btn.classList.remove('clicked', 'rippling');
        btn.classList.add('locked');
      }, 400);
    } else {
      btn.classList.add('faded');
    }
  });

  spsStatus.textContent = 'Locked in! Waiting for opponent...';
  spsStatus.className = 'sps-status waiting';
  stopVisualTimer();
}

function resetChoiceButtons() {
  document.querySelectorAll('.choice-btn').forEach(btn => {
    btn.classList.remove('faded', 'locked', 'clicked', 'rippling');
  });
}

function showChoicePhase() {
  myChoice = null;
  resetChoiceButtons();
  revealArea.classList.add('hidden');
  choiceArea.classList.remove('hidden');
  timerWrap.classList.remove('hidden');
  roundResultText.textContent = '';
  spsStatus.textContent = 'Make your choice!';
  spsStatus.className = 'sps-status active';
  startVisualTimer();
}

function animateCountdown(callback) {
  countdownDisplay.innerHTML = '';
  revealArea.classList.remove('hidden');
  choiceArea.classList.add('hidden');
  timerWrap.classList.add('hidden');

  const steps = ['3', '2', '1'];
  let i = 0;

  function showNext() {
    if (i < steps.length) {
      const span = document.createElement('span');
      span.className = 'countdown-num';
      span.textContent = steps[i];
      countdownDisplay.innerHTML = '';
      countdownDisplay.appendChild(span);
      i++;
      setTimeout(showNext, 700);
    } else {
      // Show GO!
      const goSpan = document.createElement('span');
      goSpan.className = 'countdown-num go';
      goSpan.textContent = '🔥';
      countdownDisplay.innerHTML = '';
      countdownDisplay.appendChild(goSpan);
      setTimeout(() => {
        countdownDisplay.innerHTML = '';
        callback();
      }, 500);
    }
  }
  showNext();
}

function spawnParticles(el) {
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const colors = ['#4caf7d', '#f5c542', '#fff', '#5c9be0'];

  for (let i = 0; i < 14; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const angle = (i / 14) * 360;
    const dist = 50 + Math.random() * 50;
    const tx = Math.cos((angle * Math.PI) / 180) * dist;
    const ty = Math.sin((angle * Math.PI) / 180) * dist;
    p.style.cssText = `
      left: ${cx - 4}px; top: ${cy - 4}px;
      background: ${colors[i % colors.length]};
      --tx: ${tx}px; --ty: ${ty}px;
      position: fixed; z-index: 999;
    `;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 850);
  }
}

function showRoundResult(data) {
  const { choices, roundWinner, isTie, scores: newScores, roundHistory: hist, matchOver } = data;
  scores = newScores;
  roundHistory = hist;

  stopVisualTimer();
  updateSpsScoreBar();
  renderRoundHistory();

  const me = players.find(p => p.id === myId);
  const opp = players.find(p => p.id !== myId);
  const myC = choices[myId] || 'none';
  const oppC = choices[opp?.id] || 'none';

  // Set card names
  myCardName.textContent = 'You';
  oppCardName.textContent = opp?.name || 'Opponent';

  // Reset cards
  myRevealCard.className = 'reveal-card';
  oppRevealCard.className = 'reveal-card';
  myCardContent.textContent = CHOICE_EMOJI[myC] || '❓';
  oppCardContent.textContent = CHOICE_EMOJI[oppC] || '❓';

  animateCountdown(() => {
    // Flip cards
    myRevealCard.classList.add('flipped');
    oppRevealCard.classList.add('flipped');

    setTimeout(() => {
      // Apply win/lose styles
      if (isTie) {
        myRevealCard.classList.add('tie-card');
        oppRevealCard.classList.add('tie-card');
        roundResultText.textContent = "It's a Tie — Replay!";
        roundResultText.className = 'round-result-text tie';
      } else if (roundWinner === myId) {
        myRevealCard.classList.add('win-card');
        oppRevealCard.classList.add('lose-card');
        roundResultText.textContent = '🎉 You win this round!';
        roundResultText.className = 'round-result-text you-win';
        spawnParticles(myRevealCard);
      } else {
        myRevealCard.classList.add('lose-card');
        oppRevealCard.classList.add('win-card');
        roundResultText.textContent = `😔 ${opp?.name || 'Opponent'} wins this round`;
        roundResultText.className = 'round-result-text you-lose';
        spawnParticles(oppRevealCard);
      }
    }, 700);
  });
}

function renderRoundHistory() {
  if (!roundHistory.length) return;
  spsHistory.classList.add('visible');

  const me = players.find(p => p.id === myId);
  const opp = players.find(p => p.id !== myId);

  historyRows.innerHTML = [...roundHistory].reverse().map(entry => {
    const myC = entry.choices[myId] || 'none';
    const oppC = opp ? entry.choices[opp.id] || 'none' : 'none';
    const myEmoji = CHOICE_EMOJI[myC];
    const oppEmoji = CHOICE_EMOJI[oppC];

    let badge = '';
    if (entry.isTie) {
      badge = `<span class="history-badge badge-tie">Tie</span>`;
    } else if (entry.winnerId === myId) {
      badge = `<span class="history-badge badge-win">W</span>`;
    } else {
      badge = `<span class="history-badge badge-lose">L</span>`;
    }

    return `
      <div class="history-row">
        <span class="history-round">#${entry.roundNum}</span>
        <span class="history-choices">${myEmoji} <span class="history-vs">vs</span> ${oppEmoji}</span>
        ${badge}
      </div>
    `;
  }).join('');
}

function showMatchOver({ winner, scores: finalS, players: finalPlayers }) {
  scores = finalS;
  players = finalPlayers;
  spsMatchOver = false;
  spsWaitingRematch = false;
  spsBtnPlayAgain.disabled = false;
  spsBtnPlayAgain.textContent = 'Play Again';
  spsRematchStatus.classList.add('hidden');

  if (winner.id === myId) {
    spsMatchIcon.textContent = '🏆';
    spsMatchText.textContent = 'You Win the Match!';
    spsMatchText.classList.add('shimmer');
  } else {
    spsMatchIcon.textContent = '😔';
    spsMatchText.textContent = `${winner.name} Wins the Match`;
    spsMatchText.classList.remove('shimmer');
  }

  spsFinalScores.innerHTML = players.map(p => `
    <div class="final-score-item">
      <span class="fscore" style="color:${p.id === winner.id ? 'var(--gold)' : 'var(--accent-x)'}">${scores[p.id] ?? 0}</span>
      <span class="fname">${p.name}</span>
    </div>
  `).join('');

  spsMatchOverEl.classList.remove('hidden');
}

function initSpsScreen(data) {
  players = data.players;
  scores = data.scores;
  bestOf = data.bestOf;
  spsRound = data.roundNumber;
  roundHistory = data.roundHistory || [];
  spsMatchOver = false;
  spsWaitingRematch = false;
  myChoice = null;

  spsIsAiGame = players.some(p => p.id === 'AI');
  spsRoomCode.textContent = spsIsAiGame ? 'VS CPU' : getRoomCode();
  bestofBar.textContent = `Best of ${bestOf}`;
  spsMatchOverEl.classList.add('hidden');
  spsDisconnected.classList.add('hidden');

  // Hide reveal, show choice
  revealArea.classList.add('hidden');
  choiceArea.classList.remove('hidden');
  timerWrap.classList.add('hidden');
  spsStatus.textContent = 'Get ready...';
  spsStatus.className = 'sps-status';

  updateSpsScoreBar();
  renderRoundHistory();
  showScreen('sps');
}

// ══ SOCKET EVENTS ════════════════════════════════════════════════════════════

socket.on('connect', () => { myId = socket.id; });

socket.on('roomCreated', ({ code, gameType: gt, gridSize: gs, bestOf: bo }) => {
  gameType = gt;
  if (gt === 'ttt') gridSize = gs || 3;
  if (gt === 'sps') bestOf = bo || 3;
  displayRoomCode.textContent = code;
  showScreen('waiting');
});

socket.on('error', ({ message }) => {
  showLobbyError(message);
  showScreen('lobby');
});

// ── TTT events ────────────────────────────────────────────────────────────────
socket.on('gameStart', (data) => {
  gameType = 'ttt';
  players     = data.players;
  scores      = data.scores;
  gridSize    = data.gridSize;
  currentTurn = data.currentTurn;
  tttGameOver = false;
  tttIsAiGame = players.some(p => p.id === 'AI');
  mySymbol = players.find(p => p.id === myId)?.symbol;
  gameOverOverlay.classList.add('hidden');
  disconnOverlay.classList.add('hidden');
  const code = getRoomCode();
  if (code) gameRoomCode.textContent = code;
  if (tttIsAiGame) gameRoomCode.textContent = 'VS CPU';
  updateTttScoreBar();
  updateTurnIndicator();
  renderBoard(data.board);
  showScreen('game');
});

socket.on('boardUpdate', ({ board, currentTurn: turn }) => {
  currentTurn = turn;
  updateTurnIndicator();
  renderBoard(board);
});

socket.on('gameOver', ({ board, winner, draw, scores: newScores, players: newPlayers }) => {
  players = newPlayers; scores = newScores; currentTurn = null;
  updateTttScoreBar();
  renderBoard(board);
  showTttGameOver({ winner, draw, board });
});

socket.on('rematchReady', (data) => {
  players = data.players; scores = data.scores;
  gridSize = data.gridSize; currentTurn = data.currentTurn;
  tttGameOver = false; tttWaitingRematch = false;
  mySymbol = players.find(p => p.id === myId)?.symbol;
  gameOverOverlay.classList.add('hidden');
  updateTttScoreBar(); updateTurnIndicator(); renderBoard(data.board);
});

socket.on('opponentWantsRematch', () => {
  rematchStatus.textContent = 'Opponent is ready — click Play Again!';
  rematchStatus.classList.remove('hidden');
});

// ── SPS events ────────────────────────────────────────────────────────────────
socket.on('spsGameStart', (data) => {
  gameType = 'sps';
  initSpsScreen(data);
});

socket.on('spsRoundStart', ({ roundNumber, scores: newScores, roundHistory: hist }) => {
  spsRound = roundNumber;
  scores = newScores;
  roundHistory = hist;
  spsRoundLabel.textContent = `Round ${spsRound}`;
  updateSpsScoreBar();
  renderRoundHistory();
  showChoicePhase();
});

socket.on('opponentChose', () => {
  if (!myChoice) {
    // They picked but we haven't yet
    spsStatus.textContent = 'Opponent has chosen! Make your pick...';
    spsStatus.className = 'sps-status waiting';
  } else {
    spsStatus.textContent = 'Both picked! Revealing...';
  }
});

socket.on('roundResult', (data) => {
  showRoundResult(data);
});

socket.on('matchOver', (data) => {
  showMatchOver(data);
});

socket.on('opponentWantsRematch', () => {
  // Works for TTT, SPS, and GVB
  if (gameType === 'sps') {
    spsRematchStatus.textContent = 'Opponent is ready — click Play Again!';
    spsRematchStatus.classList.remove('hidden');
  } else if (gameType === 'gvb') {
    const el = document.getElementById('gvb-rematch-status');
    el.textContent = 'Opponent is ready — click Play Again!';
    el.classList.remove('hidden');
  } else {
    rematchStatus.textContent = 'Opponent is ready — click Play Again!';
    rematchStatus.classList.remove('hidden');
  }
});

socket.on('opponentDisconnected', () => {
  stopVisualTimer();
  if (gameType === 'sps') {
    spsDisconnected.classList.remove('hidden');
  } else if (gameType === 'gvb') {
    document.getElementById('gvb-disconnected').classList.remove('hidden');
  } else {
    disconnOverlay.classList.remove('hidden');
  }
});

// ══ GVB (SCISSORME) ══════════════════════════════════════════════════════════

// ── GVB State ─────────────────────────────────────────────────────────────────
let gvbMyStats = null;
let gvbOppStats = null;
let gvbOppName = 'Opponent';
let gvbRoundNumber = 1;
let gvbGameOver = false;
let gvbWaitingRematch = false;
let gvbMoveSelected = false;
let _prevMyArmor  = null;   // armor-break tracking
let _prevOppArmor = null;
let gvbAllocationDeltas = {};
let gvbPointsLeft = 10;
let gvbAllocTimerRaf = null;
let gvbAllocTimerStart = null;
let gvbBattleTimerRaf = null;
let gvbBattleTimerStart = null;
const GVB_ALLOC_DURATION  = 60000;
const GVB_TURN_DURATION   = 30000;
const GVB_BASE_VALUES = { hp: 10, max_armor: 5, sword_atk: 2, sword_def: 0, shield_atk: 0, shield_def: 2, magic_atk: 1, magic_def: 1 };
const MOVE_EMOJI = { sword: '⚔️', shield: '🛡️', magic: '🪄' };

// ── GVB DOM Refs ──────────────────────────────────────────────────────────────
const gvbAllocRoomCode  = document.getElementById('gvb-alloc-room-code');
const gvbOpponentStatus = document.getElementById('gvb-opponent-status');
const gvbAllocTimerBar  = document.getElementById('gvb-alloc-timer-bar');
const gvbPointsLeftEl   = document.getElementById('gvb-points-left');
const gvbBtnReady       = document.getElementById('gvb-btn-ready');
const gvbBattleRoomCode = document.getElementById('gvb-battle-room-code');
const gvbRoundCounter   = document.getElementById('gvb-round-counter');
const gvbBattleTimerBar = document.getElementById('gvb-battle-timer-bar');
const gvbBattleStatus   = document.getElementById('gvb-battle-status');
const gvbOppNameEl      = document.getElementById('gvb-opp-name');
const gvbSuddenDeathBanner = document.getElementById('gvb-sudden-death-banner');
const gvbRoundFlash     = document.getElementById('gvb-round-flash');
const gvbFlashContent   = document.getElementById('gvb-flash-content');
const gvbGameOverOverlay= document.getElementById('gvb-game-over-overlay');
const gvbResultIcon     = document.getElementById('gvb-result-icon');
const gvbResultText     = document.getElementById('gvb-result-text');
const gvbFinalScores    = document.getElementById('gvb-final-scores');
const gvbBtnPlayAgain   = document.getElementById('gvb-btn-play-again');
const gvbRematchStatus  = document.getElementById('gvb-rematch-status');
const gvbDisconnected   = document.getElementById('gvb-disconnected');
const gvbHistoryRows    = document.getElementById('gvb-history-rows');
const gvbMoveArea       = document.getElementById('gvb-move-area');

// ── GVB Allocation UI ─────────────────────────────────────────────────────────
function resetAllocDeltas() {
  gvbAllocationDeltas = {};
  Object.keys(GVB_BASE_VALUES).forEach(k => { gvbAllocationDeltas[k] = 0; });
  gvbPointsLeft = 10;
}

function updateAllocUI() {
  gvbPointsLeftEl.textContent = gvbPointsLeft;
  const pointsWrap = document.querySelector('.gvb-points-remaining');
  if (pointsWrap) pointsWrap.classList.toggle('zero', gvbPointsLeft === 0);
  gvbBtnReady.disabled = gvbPointsLeft !== 0;
  for (const stat of Object.keys(GVB_BASE_VALUES)) {
    const delta = gvbAllocationDeltas[stat] || 0;
    const total = GVB_BASE_VALUES[stat] + delta;
    const deltaEl = document.getElementById(`gvb-delta-${stat}`);
    const totalEl = document.getElementById(`gvb-total-${stat}`);
    if (deltaEl) deltaEl.textContent = delta;
    if (totalEl) totalEl.textContent = total;
    const row = document.querySelector(`.stat-row[data-stat="${stat}"]`);
    if (row) {
      row.querySelector('.minus').disabled = delta <= 0;
      row.querySelector('.plus').disabled  = gvbPointsLeft <= 0;
    }
  }
}

document.querySelectorAll('.stat-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const stat = btn.dataset.stat;
    if (btn.classList.contains('plus')) {
      if (gvbPointsLeft <= 0) return;
      gvbAllocationDeltas[stat] = (gvbAllocationDeltas[stat] || 0) + 1;
      gvbPointsLeft -= 1;
    } else {
      if ((gvbAllocationDeltas[stat] || 0) <= 0) return;
      gvbAllocationDeltas[stat] -= 1;
      gvbPointsLeft += 1;
    }
    updateAllocUI();
  });
});

gvbBtnReady.addEventListener('click', () => {
  if (gvbPointsLeft !== 0) return;
  socket.emit('submit_allocation', gvbAllocationDeltas);
  gvbBtnReady.disabled = true;
  gvbBtnReady.textContent = 'SUBMITTED';
  document.querySelectorAll('.stat-btn').forEach(b => b.disabled = true);
});

// ── GVB Timers ────────────────────────────────────────────────────────────────
function startGvbAllocTimer() {
  stopGvbAllocTimer();
  gvbAllocTimerBar.style.width = '100%';
  gvbAllocTimerBar.classList.remove('urgent');
  gvbAllocTimerStart = Date.now();
  function tick() {
    const rem = Math.max(0, GVB_ALLOC_DURATION - (Date.now() - gvbAllocTimerStart));
    gvbAllocTimerBar.style.width = (rem / GVB_ALLOC_DURATION * 100) + '%';
    if (rem <= 10000) gvbAllocTimerBar.classList.add('urgent');
    if (rem > 0) gvbAllocTimerRaf = requestAnimationFrame(tick);
  }
  gvbAllocTimerRaf = requestAnimationFrame(tick);
}
function stopGvbAllocTimer() {
  if (gvbAllocTimerRaf) { cancelAnimationFrame(gvbAllocTimerRaf); gvbAllocTimerRaf = null; }
}
function startGvbBattleTimer() {
  stopGvbBattleTimer();
  gvbBattleTimerBar.style.width = '100%';
  gvbBattleTimerBar.classList.remove('urgent');
  gvbBattleTimerStart = Date.now();
  function tick() {
    const rem = Math.max(0, GVB_TURN_DURATION - (Date.now() - gvbBattleTimerStart));
    gvbBattleTimerBar.style.width = (rem / GVB_TURN_DURATION * 100) + '%';
    if (rem <= 5000) gvbBattleTimerBar.classList.add('urgent');
    if (rem > 0) gvbBattleTimerRaf = requestAnimationFrame(tick);
  }
  gvbBattleTimerRaf = requestAnimationFrame(tick);
}
function stopGvbBattleTimer() {
  if (gvbBattleTimerRaf) { cancelAnimationFrame(gvbBattleTimerRaf); gvbBattleTimerRaf = null; }
}

// ── GVB Screen Init ───────────────────────────────────────────────────────────
function initGvbAllocScreen() {
  resetAllocDeltas();
  gvbAllocRoomCode.textContent = gvbIsAiGame ? 'VS CPU' : displayRoomCode.textContent;
  gvbOpponentStatus.textContent = 'Opponent allocating...';
  gvbOpponentStatus.classList.remove('ready');
  gvbBtnReady.disabled = true;
  gvbBtnReady.textContent = 'READY';
  document.querySelectorAll('.stat-btn').forEach(b => b.disabled = false);
  updateAllocUI();
  startGvbAllocTimer();
  showScreen('gvb-alloc');
}

function initGvbBattleScreen(data) {
  const { your_stats, opponent_stats, opponent_name, your_charges, opp_charges } = data;
  gvbMyStats = your_stats;
  gvbOppStats = opponent_stats;
  gvbOppName = opponent_name;
  gvbRoundNumber = 1;
  gvbGameOver = false;
  gvbMoveSelected = false;
  _prevMyArmor  = null;
  _prevOppArmor = null;
  document.querySelector('.gvb-arena').classList.remove('sudden-death-mode');
  document.querySelector('.gvb-battle-container').classList.remove('low-hp');
  stopGvbAllocTimer();

  gvbBattleRoomCode.textContent = gvbIsAiGame ? 'VS CPU' : displayRoomCode.textContent;
  gvbOppNameEl.textContent = opponent_name;
  const _myNameEl = document.getElementById('gvb-my-name');
  if (_myNameEl) _myNameEl.textContent = playerNameInput.value || 'YOU';
  document.getElementById('gvb-my-max-hp').textContent     = your_stats.hp;
  document.getElementById('gvb-my-max-armor').textContent  = your_stats.max_armor;
  document.getElementById('gvb-opp-max-hp').textContent    = opponent_stats.hp;
  document.getElementById('gvb-opp-max-armor').textContent = opponent_stats.max_armor;

  renderGvbBars(your_stats.hp, your_stats.max_armor, opponent_stats.hp, opponent_stats.max_armor);
  renderGvbStatSheet('gvb-my-stat-sheet', your_stats);
  renderGvbStatSheet('gvb-opp-stat-sheet', opponent_stats);
  renderGvbCharges(your_charges, opp_charges);

  // Populate move button Atk/Def stats
  const _moveStats = {
    sword:  { atk: your_stats.sword_atk,  def: your_stats.sword_def  },
    shield: { atk: your_stats.shield_atk, def: your_stats.shield_def },
    magic:  { atk: your_stats.magic_atk,  def: your_stats.magic_def  },
  };
  for (const [move, vals] of Object.entries(_moveStats)) {
    const a = document.getElementById(`gvb-${move}-atk`);
    const d = document.getElementById(`gvb-${move}-def`);
    if (a) a.textContent = vals.atk;
    if (d) d.textContent = vals.def;
  }

  document.querySelectorAll('.gvb-move-btn').forEach(b => { b.disabled = false; b.classList.remove('selected', 'on-cooldown', 'faded'); });
  gvbBattleStatus.textContent = 'Pick your move';
  gvbBattleStatus.className = 'gvb-battle-status';
  gvbSuddenDeathBanner.classList.add('hidden');
  gvbRoundFlash.classList.add('hidden');
  gvbGameOverOverlay.classList.add('hidden');
  gvbDisconnected.classList.add('hidden');
  gvbHistoryRows.innerHTML = '';
  const _dmgLayer = document.getElementById('gvb-damage-numbers');
  if (_dmgLayer) _dmgLayer.innerHTML = '';
  gvbRoundCounter.textContent = 'Round 1 / 30';
  resetGvbSprites();
  startGvbBattleTimer();
  showScreen('gvb-battle');
}

// ── GVB Rendering ─────────────────────────────────────────────────────────────
function renderGvbBars(myHp, myArmor, oppHp, oppArmor) {
  document.getElementById('gvb-my-hp').textContent     = myHp;
  document.getElementById('gvb-my-armor').textContent  = myArmor;
  document.getElementById('gvb-opp-hp').textContent    = oppHp;
  document.getElementById('gvb-opp-armor').textContent = oppArmor;

  setHpBar('gvb-my-hp-bar',  myHp,  gvbMyStats.hp);
  setHpBar('gvb-opp-hp-bar', oppHp, gvbOppStats.hp);

  // Armor break detection
  if (_prevMyArmor !== null && _prevMyArmor > 0 && myArmor === 0) {
    const bg = document.getElementById('gvb-my-armor-bar').closest('.gvb-bar-bg');
    if (bg) { bg.classList.add('armor-break'); setTimeout(() => bg.classList.remove('armor-break'), 500); }
  }
  if (_prevOppArmor !== null && _prevOppArmor > 0 && oppArmor === 0) {
    const bg = document.getElementById('gvb-opp-armor-bar').closest('.gvb-bar-bg');
    if (bg) { bg.classList.add('armor-break'); setTimeout(() => bg.classList.remove('armor-break'), 500); }
  }

  setArmorBar('gvb-my-armor-bar',  myArmor,  gvbMyStats.max_armor);
  setArmorBar('gvb-opp-armor-bar', oppArmor, gvbOppStats.max_armor);

  const _myHpNum     = document.getElementById('gvb-my-hp-num');
  const _myArmorNum  = document.getElementById('gvb-my-armor-num');
  const _oppHpNum    = document.getElementById('gvb-opp-hp-num');
  const _oppArmorNum = document.getElementById('gvb-opp-armor-num');
  if (_myHpNum)     _myHpNum.textContent     = `${myHp}/${gvbMyStats.hp}`;
  if (_myArmorNum)  _myArmorNum.textContent  = `${myArmor}/${gvbMyStats.max_armor}`;
  if (_oppHpNum)    _oppHpNum.textContent    = `${oppHp}/${gvbOppStats.hp}`;
  if (_oppArmorNum) _oppArmorNum.textContent = `${oppArmor}/${gvbOppStats.max_armor}`;

  _prevMyArmor  = myArmor;
  _prevOppArmor = oppArmor;

  // Low HP vignette
  const myHpPct = gvbMyStats.hp > 0 ? (myHp / gvbMyStats.hp) * 100 : 0;
  document.querySelector('.gvb-battle-container').classList.toggle('low-hp', myHpPct > 0 && myHpPct <= 25);
}

function setHpBar(id, cur, max) {
  const el = document.getElementById(id);
  if (!el) return;
  const pct = max > 0 ? (cur / max) * 100 : 0;
  el.style.width = pct + '%';
  el.classList.remove('medium', 'low');
  if (pct <= 25) el.classList.add('low');
  else if (pct <= 50) el.classList.add('medium');
}

function setArmorBar(id, cur, max) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.width = max > 0 ? (cur / max) * 100 + '%' : '0%';
}

function renderGvbStatSheet(containerId, stats) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const labels = { sword_atk: '⚔️Atk', sword_def: '⚔️Def', shield_atk: '🛡️Atk', shield_def: '🛡️Def', magic_atk: '🪄Atk', magic_def: '🪄Def' };
  el.innerHTML = Object.entries(labels).map(([k, lbl]) =>
    `<span class="gvb-stat-chip">${lbl} <span>${stats[k]}</span></span>`
  ).join('');
}

function renderGvbCharges(myCharges, oppCharges) {
  for (const move of ['sword', 'shield', 'magic']) {
    renderChargeDisplay(`gvb-my-chg-${move}`, myCharges[move]);
    renderChargeDisplay(`gvb-opp-chg-${move}`, oppCharges[move]);
    const btn = document.getElementById(`gvb-btn-${move}`);
    if (btn) {
      const ch = myCharges[move];
      btn.disabled = ch.cooldown > 0 || ch.count <= 0 || gvbMoveSelected || gvbGameOver;
      btn.classList.toggle('on-cooldown', ch.cooldown > 0);
    }
  }
}

function renderChargeDisplay(id, charge) {
  const el = document.getElementById(id);
  if (!el) return;
  if (charge.cooldown > 0) {
    el.textContent = `${charge.cooldown}t`;
    el.className = 'gvb-charge-dots cooldown';
  } else {
    el.textContent = '●'.repeat(charge.count) + '○'.repeat(3 - charge.count);
    el.className = 'gvb-charge-dots' + (charge.count === 0 ? ' depleted' : '');
  }
}

function showGvbRoundFlash(data) {
  const cls  = { win: 'win', loss: 'lose', tie: 'tie' };
  const txt  = { win: 'YOU WIN', loss: 'YOU LOSE', tie: 'TIE' };
  const { your_move, opponent_move, outcome, damage_to_you, damage_to_opp, your_hp, opp_hp } = data;
  gvbFlashContent.innerHTML = `
    <div class="gvb-flash-outcome ${cls[outcome]}">${txt[outcome]}</div>
    <div class="gvb-flash-moves">
      <span class="gvb-fm-${your_move}">${MOVE_EMOJI[your_move]}</span>
      <span class="gvb-fm-label">You</span>
      <span class="gvb-fm-vs">vs</span>
      <span class="gvb-fm-label">Opp</span>
      <span class="gvb-fm-${opponent_move}">${MOVE_EMOJI[opponent_move]}</span>
    </div>
    <div class="gvb-flash-damage">
      ${damage_to_you  > 0 ? `<div>You took ${damage_to_you} → ${your_hp} HP</div>` : ''}
      ${damage_to_opp  > 0 ? `<div>Opp took ${damage_to_opp} → ${opp_hp} HP</div>` : ''}
      ${damage_to_you === 0 && damage_to_opp === 0 ? '<div>No damage dealt</div>' : ''}
    </div>`;
  gvbRoundFlash.classList.remove('hidden');
  setTimeout(() => gvbRoundFlash.classList.add('hidden'), 3000);
}

function appendGvbHistoryRow(data) {
  const badge = o => o === 'win'  ? '<span class="gvb-history-badge gvb-badge-win">W</span>'
                   : o === 'loss' ? '<span class="gvb-history-badge gvb-badge-lose">L</span>'
                   : '<span class="gvb-history-badge gvb-badge-tie">T</span>';
  const row = document.createElement('div');
  row.className = 'gvb-history-row';
  row.innerHTML = `<span>#${data.round}</span><span>${MOVE_EMOJI[data.your_move]} vs ${MOVE_EMOJI[data.opponent_move]}</span>${badge(data.outcome)}`;
  gvbHistoryRows.appendChild(row);
}

function showGvbGameOver(data) {
  const { outcome, your_hp, opp_hp, rounds_played } = data;
  gvbGameOver = true;
  gvbWaitingRematch = false;
  stopGvbBattleTimer();
  gvbBtnPlayAgain.disabled = false;
  gvbBtnPlayAgain.textContent = 'Play Again';
  gvbRematchStatus.classList.add('hidden');
  if (outcome === 'win')       { gvbResultIcon.textContent = '🏆'; gvbResultText.textContent = 'You Win!'; }
  else if (outcome === 'loss') { gvbResultIcon.textContent = '😔'; gvbResultText.textContent = 'You Lose'; }
  else                         { gvbResultIcon.textContent = '🤝'; gvbResultText.textContent = 'Draw!'; }
  gvbFinalScores.innerHTML = `
    <div class="final-score-item"><span class="fscore" style="color:var(--accent-o)">${your_hp} HP</span><span class="fname">You</span></div>
    <div class="final-score-item"><span class="fscore" style="color:var(--accent-x)">${opp_hp} HP</span><span class="fname">${gvbOppName}</span></div>
    <div style="font-size:0.8rem;color:var(--text-muted);margin-top:6px">${rounds_played} rounds played</div>`;
  gvbGameOverOverlay.classList.remove('hidden');
}

// ── GVB Move Buttons ──────────────────────────────────────────────────────────
document.querySelectorAll('.gvb-move-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (gvbMoveSelected || gvbGameOver) return;
    const move = btn.dataset.move;
    socket.emit('submit_move', { move });
    gvbMoveSelected = true;
    btn.classList.add('selected');
    document.querySelectorAll('.gvb-move-btn').forEach(b => {
      if (b !== btn) b.classList.add('faded');
    });
    document.querySelectorAll('.gvb-move-btn').forEach(b => b.disabled = true);
    gvbBattleStatus.textContent = 'Waiting for opponent...';
    gvbBattleStatus.className = 'gvb-battle-status waiting';
    stopGvbBattleTimer();
  });
});

// ── GVB Play Again ────────────────────────────────────────────────────────────
gvbBtnPlayAgain.addEventListener('click', () => {
  if (gvbWaitingRematch) return;
  socket.emit('playAgain');
  if (!gvbIsAiGame) {
    gvbWaitingRematch = true;
    gvbBtnPlayAgain.disabled = true;
    gvbBtnPlayAgain.textContent = 'Waiting...';
    gvbRematchStatus.classList.remove('hidden');
  }
});

// ── GVB Socket Events ─────────────────────────────────────────────────────────
socket.on('room_joined', ({ players: ps }) => {
  gameType = 'gvb';
  players = ps;
  gvbIsAiGame = players.some(p => p.id === 'AI');
  initGvbAllocScreen();
});

socket.on('opponent_ready', () => {
  gvbOpponentStatus.textContent = 'Opponent ready!';
  gvbOpponentStatus.classList.add('ready');
});

socket.on('battle_start', (data) => {
  gameType = 'gvb';
  // gvbIsAiGame is already set from room_joined; don't overwrite
  initGvbBattleScreen(data);
});

socket.on('round_result', (data) => {
  stopGvbBattleTimer();
  renderGvbCharges(data.your_charges, data.opp_charges);
  gvbRoundNumber = data.round + 1;
  const maxRound = data.is_sudden_death ? 40 : 30;
  gvbRoundCounter.textContent = `Round ${gvbRoundNumber} / ${maxRound}`;
  appendGvbHistoryRow(data);
  // Short anticipation pause — both players see "Both chose!" before anything happens
  gvbBattleStatus.textContent = 'Both chose!';
  gvbBattleStatus.className = 'gvb-battle-status waiting';
  setTimeout(() => {
    // Animations fire + HP bars update together
    triggerGvbRoundAnimations(data.outcome, data.damage_to_you, data.damage_to_opp, data.your_move, data.opponent_move);
    renderGvbBars(data.your_hp, data.your_armor, data.opp_hp, data.opp_armor);
    gvbBattleStatus.textContent = '';
    gvbBattleStatus.className = 'gvb-battle-status';
    showMoveIndicator('player', data.your_move);
    showMoveIndicator('opp',    data.opponent_move);
  }, 1200);
  // Flash appears after animations have had time to play out
  setTimeout(() => {
    showGvbRoundFlash(data);
    if (!data.game_over) {
      setTimeout(() => {
        gvbMoveSelected = false;
        document.querySelectorAll('.gvb-move-btn').forEach(b => b.classList.remove('selected', 'faded'));
        renderGvbCharges(data.your_charges, data.opp_charges);
        gvbBattleStatus.textContent = 'Pick your move';
        gvbBattleStatus.className = 'gvb-battle-status';
        startGvbBattleTimer();
      }, 3500);
    }
  }, 2500); // 1200ms anticipation + ~1300ms for animations to complete
});

socket.on('sudden_death', () => {
  gvbSuddenDeathBanner.classList.remove('hidden');
  document.querySelector('.gvb-arena').classList.add('sudden-death-mode');
  document.getElementById('gvb-my-max-armor').textContent  = 0;
  document.getElementById('gvb-opp-max-armor').textContent = 0;
  if (gvbMyStats)  gvbMyStats.max_armor  = 0;
  if (gvbOppStats) gvbOppStats.max_armor = 0;
});

socket.on('game_over', (data) => {
  showGvbGameOver(data);
});

socket.on('rematch_starting', () => {
  gvbGameOverOverlay.classList.add('hidden');
  initGvbAllocScreen();
});

// ── GVB Sprite Animation Controller ──────────────────────────────────────────
const _gvbSpritePlayer = document.getElementById('gvb-sprite-player');
const _gvbSpriteOpp    = document.getElementById('gvb-sprite-opp');

function _playSpriteAnim(el, cls, ms) {
  if (!el) return;
  el.classList.remove('sprite-attack', 'sprite-hit', 'sprite-sword', 'sprite-shield', 'sprite-magic');
  void el.offsetWidth; // force reflow → restart animation
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}

function triggerGvbRoundAnimations(outcome, dmgToYou, dmgToOpp, yourMove, oppMove) {
  const myAtkCls  = `sprite-${yourMove}`;
  const oppAtkCls = `sprite-${oppMove}`;

  if (outcome === 'win') {
    _playSpriteAnim(_gvbSpritePlayer, myAtkCls, 700);
    spawnCombatFX('player', yourMove);
    setTimeout(() => {
      if (dmgToOpp > 0) {
        _playSpriteAnim(_gvbSpriteOpp, 'sprite-hit', 800);
        showDamageNum(dmgToOpp, 'opp');
      }
    }, 280);
  } else if (outcome === 'loss') {
    _playSpriteAnim(_gvbSpriteOpp, oppAtkCls, 700);
    spawnCombatFX('opp', oppMove);
    setTimeout(() => {
      if (dmgToYou > 0) {
        _playSpriteAnim(_gvbSpritePlayer, 'sprite-hit', 800);
        showDamageNum(dmgToYou, 'player');
        const _arena = document.querySelector('.gvb-arena');
        _arena.classList.remove('shake');
        void _arena.offsetWidth;
        _arena.classList.add('shake');
        setTimeout(() => _arena.classList.remove('shake'), 450);
      }
    }, 280);
  } else {
    _playSpriteAnim(_gvbSpritePlayer, myAtkCls, 700);
    _playSpriteAnim(_gvbSpriteOpp, oppAtkCls, 700);
    spawnCombatFX('player', yourMove);
    spawnCombatFX('opp', oppMove);
  }
}

function spawnCombatFX(attackerSide, move) {
  const arena = document.querySelector('.gvb-arena');
  if (!arena) return;

  const defenderPos = attackerSide === 'player' ? 'right' : 'left';
  const attackerPos = attackerSide === 'player' ? 'left' : 'right';

  // Arena tint flash (attacker's weapon color)
  const tint = document.createElement('div');
  tint.className = `gvb-arena-tint gvb-tint-${move}`;
  arena.appendChild(tint);
  setTimeout(() => tint.remove(), 350);

  if (move === 'sword') {
    const el = document.createElement('div');
    el.className = `gvb-fx gvb-fx-slash gvb-fx-at-${defenderPos}`;
    arena.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  } else if (move === 'shield') {
    const el = document.createElement('div');
    el.className = `gvb-fx gvb-fx-shield-barrier gvb-fx-at-${attackerPos}`;
    arena.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  } else if (move === 'magic') {
    const el = document.createElement('div');
    el.className = `gvb-fx gvb-fx-magic-burst gvb-fx-at-${defenderPos}`;
    arena.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
}

function showDamageNum(value, side) {
  const layer = document.getElementById('gvb-damage-numbers');
  if (!layer) return;
  const el = document.createElement('div');
  el.className = 'gvb-damage-num' + (side === 'opp' ? ' dmg-opp' : '');
  el.textContent = '-' + value;
  if (side === 'player') { el.style.left = '18%'; el.style.bottom = '40%'; }
  else                   { el.style.right = '18%'; el.style.bottom = '40%'; }
  layer.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

function showMoveIndicator(side, move) {
  const layer = document.getElementById('gvb-damage-numbers');
  if (!layer) return;
  const el = document.createElement('div');
  el.className = `gvb-move-indicator gvb-mi-${move}`;
  el.textContent = MOVE_EMOJI[move];
  if (side === 'player') { el.style.left = '28%'; }
  else                   { el.style.right = '28%'; }
  el.style.bottom = '55%';
  layer.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function resetGvbSprites() {
  [_gvbSpritePlayer, _gvbSpriteOpp].forEach(el => {
    if (el) el.classList.remove('sprite-attack', 'sprite-hit', 'sprite-sword', 'sprite-shield', 'sprite-magic');
  });
}
