const socket = io();

// ── State ────────────────────────────────────────────────────────────────────
let myId = null;
let mySymbol = null;
let gridSize = 3;
let currentTurn = null;
let players = [];
let scores = {};
let gameOver = false;
let waitingForRematch = false;

// ── DOM refs ─────────────────────────────────────────────────────────────────
const screens = {
  lobby:    document.getElementById('screen-lobby'),
  waiting:  document.getElementById('screen-waiting'),
  game:     document.getElementById('screen-game'),
};

const playerNameInput  = document.getElementById('player-name');
const roomCodeInput    = document.getElementById('room-code-input');
const lobbyError       = document.getElementById('lobby-error');
const displayRoomCode  = document.getElementById('display-room-code');
const gameRoomCode     = document.getElementById('game-room-code');
const boardEl          = document.getElementById('game-board');
const turnIndicator    = document.getElementById('turn-indicator');
const gameOverOverlay  = document.getElementById('game-over-overlay');
const disconnOverlay   = document.getElementById('disconnected-overlay');
const resultText       = document.getElementById('result-text');
const resultIcon       = document.getElementById('result-icon');
const finalScores      = document.getElementById('final-scores');
const btnPlayAgain     = document.getElementById('btn-play-again');
const rematchStatus    = document.getElementById('rematch-status');

let selectedGridSize = 3;

// ── Grid size selector ────────────────────────────────────────────────────────
document.querySelectorAll('.size-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedGridSize = parseInt(btn.dataset.size, 10);
  });
});

// ── Lobby buttons ─────────────────────────────────────────────────────────────
document.getElementById('btn-create').addEventListener('click', () => {
  const name = playerNameInput.value.trim() || 'Player 1';
  socket.emit('createRoom', { name, gridSize: selectedGridSize });
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

btnPlayAgain.addEventListener('click', () => {
  if (waitingForRematch) return;
  socket.emit('playAgain');
  waitingForRematch = true;
  btnPlayAgain.disabled = true;
  btnPlayAgain.textContent = 'Waiting...';
  rematchStatus.classList.remove('hidden');
});

// ── Screen management ─────────────────────────────────────────────────────────
function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    el.classList.toggle('active', key === name);
  });
}

function showLobbyError(msg) {
  lobbyError.textContent = msg;
  lobbyError.classList.remove('hidden');
}

// ── Board rendering ───────────────────────────────────────────────────────────
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

    if (!cell && !gameOver && currentTurn === myId) {
      div.addEventListener('click', () => {
        socket.emit('makeMove', { index: i });
      });
    }

    boardEl.appendChild(div);
  });
}

function highlightWinningCells(board) {
  // Re-render with no click handlers, then highlight winners
  const cells = boardEl.querySelectorAll('.cell');
  const N = gridSize;

  function mark(indices) {
    indices.forEach(i => cells[i].classList.add('winning'));
  }

  // Rows
  for (let r = 0; r < N; r++) {
    const row = Array.from({ length: N }, (_, c) => r * N + c);
    const sym = board[row[0]];
    if (sym && row.every(i => board[i] === sym)) { mark(row); return; }
  }
  // Cols
  for (let c = 0; c < N; c++) {
    const col = Array.from({ length: N }, (_, r) => r * N + c);
    const sym = board[col[0]];
    if (sym && col.every(i => board[i] === sym)) { mark(col); return; }
  }
  // Main diagonal
  const diag1 = Array.from({ length: N }, (_, i) => i * N + i);
  if (board[diag1[0]] && diag1.every(i => board[i] === board[diag1[0]])) { mark(diag1); return; }
  // Anti diagonal
  const diag2 = Array.from({ length: N }, (_, i) => i * N + (N - 1 - i));
  if (board[diag2[0]] && diag2.every(i => board[i] === board[diag2[0]])) { mark(diag2); return; }
}

// ── Score display ─────────────────────────────────────────────────────────────
function updateScoreBar() {
  if (players.length < 2) return;
  const p1 = players[0];
  const p2 = players[1];

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
    const opponent = players.find(p => p.id !== myId);
    turnIndicator.textContent = opponent ? `${opponent.name}'s turn...` : "Opponent's turn...";
    turnIndicator.classList.remove('your-turn');
  }
}

// ── Game over overlay ─────────────────────────────────────────────────────────
function showGameOver({ winner, draw, board }) {
  gameOver = true;
  waitingForRematch = false;
  btnPlayAgain.disabled = false;
  btnPlayAgain.textContent = 'Play Again';
  rematchStatus.classList.add('hidden');

  if (draw) {
    resultIcon.textContent = '🤝';
    resultText.textContent = "It's a Draw!";
  } else if (winner.id === myId) {
    resultIcon.textContent = '🎉';
    resultText.textContent = 'You Win!';
  } else {
    resultIcon.textContent = '😔';
    resultText.textContent = `${winner.name} Wins!`;
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

// ── Socket events ─────────────────────────────────────────────────────────────
socket.on('connect', () => {
  myId = socket.id;
});

socket.on('roomCreated', ({ code, gridSize: gs }) => {
  gridSize = gs;
  displayRoomCode.textContent = code;
  showScreen('waiting');
});

socket.on('error', ({ message }) => {
  showLobbyError(message);
  showScreen('lobby');
});

socket.on('gameStart', (data) => {
  players    = data.players;
  scores     = data.scores;
  gridSize   = data.gridSize;
  currentTurn = data.currentTurn;
  gameOver   = false;

  mySymbol = players.find(p => p.id === myId)?.symbol;

  gameOverOverlay.classList.add('hidden');
  disconnOverlay.classList.add('hidden');
  gameRoomCode.textContent = players[0]?.roomCode || '';

  // Get room code from the waiting screen display (if we created the room)
  const codeDisplay = displayRoomCode.textContent;
  if (codeDisplay !== '----') gameRoomCode.textContent = codeDisplay;

  updateScoreBar();
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
  players = newPlayers;
  scores  = newScores;
  currentTurn = null;
  updateScoreBar();
  renderBoard(board);
  showGameOver({ winner, draw, board });
});

socket.on('opponentWantsRematch', () => {
  rematchStatus.textContent = 'Opponent is ready — click Play Again!';
  rematchStatus.classList.remove('hidden');
});

socket.on('rematchReady', (data) => {
  players     = data.players;
  scores      = data.scores;
  gridSize    = data.gridSize;
  currentTurn = data.currentTurn;
  gameOver    = false;
  waitingForRematch = false;

  mySymbol = players.find(p => p.id === myId)?.symbol;

  gameOverOverlay.classList.add('hidden');
  updateScoreBar();
  updateTurnIndicator();
  renderBoard(data.board);
});

socket.on('opponentDisconnected', () => {
  disconnOverlay.classList.remove('hidden');
});
