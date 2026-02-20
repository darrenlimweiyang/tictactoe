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
  lobby:   document.getElementById('screen-lobby'),
  waiting: document.getElementById('screen-waiting'),
  game:    document.getElementById('screen-game'),
  sps:     document.getElementById('screen-sps'),
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
    if (selectedGameType === 'sps') {
      gridSizeSection.classList.add('hidden');
      bestofSection.classList.remove('hidden');
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
  tttWaitingRematch = true;
  btnPlayAgain.disabled = true;
  btnPlayAgain.textContent = 'Waiting...';
  rematchStatus.classList.remove('hidden');
});

// SPS play again
spsBtnPlayAgain.addEventListener('click', () => {
  if (spsWaitingRematch) return;
  socket.emit('playAgain');
  spsWaitingRematch = true;
  spsBtnPlayAgain.disabled = true;
  spsBtnPlayAgain.textContent = 'Waiting...';
  spsRematchStatus.classList.remove('hidden');
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

  const code = getRoomCode();
  spsRoomCode.textContent = code;
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
  mySymbol = players.find(p => p.id === myId)?.symbol;
  gameOverOverlay.classList.add('hidden');
  disconnOverlay.classList.add('hidden');
  const code = getRoomCode();
  if (code) gameRoomCode.textContent = code;
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
  // Works for both TTT and SPS
  if (gameType === 'sps') {
    spsRematchStatus.textContent = 'Opponent is ready — click Play Again!';
    spsRematchStatus.classList.remove('hidden');
  } else {
    rematchStatus.textContent = 'Opponent is ready — click Play Again!';
    rematchStatus.classList.remove('hidden');
  }
});

socket.on('opponentDisconnected', () => {
  stopVisualTimer();
  if (gameType === 'sps') {
    spsDisconnected.classList.remove('hidden');
  } else {
    disconnOverlay.classList.remove('hidden');
  }
});
