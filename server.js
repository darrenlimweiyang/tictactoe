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

// ── SPS logic ─────────────────────────────────────────────────────────────────
// Returns: 1 if p1 wins, 2 if p2 wins, 0 if tie
function spsResult(c1, c2) {
  if (c1 === c2) return 0;
  if ((c1 === 'rock' && c2 === 'scissors') ||
      (c1 === 'scissors' && c2 === 'paper') ||
      (c1 === 'paper' && c2 === 'rock')) return 1;
  return 2;
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
}

// ── Socket handlers ───────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('createRoom', ({ name, gridSize, gameType, bestOf }) => {
    const code = generateRoomCode();
    const type = gameType === 'sps' ? 'sps' : 'ttt';
    let room;

    if (type === 'ttt') {
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
    } else {
      room.players.push({ id: socket.id, name: name || 'Player 2' });
      room.scores[socket.id] = 0;
      room.status = 'playing';
      io.to(room.code).emit('spsGameStart', {
        players: room.players, scores: room.scores,
        bestOf: room.bestOf, roundNumber: room.roundNumber,
        roundHistory: [],
      });
      setTimeout(() => startSpsRound(room), 1200);
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

  socket.on('playAgain', () => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room || room.status !== 'over') return;

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
      } else {
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
    console.log(`Player ${socket.id} disconnected from room ${code}`);
    socket.to(code).emit('opponentDisconnected');
    rooms.delete(code);
    console.log(`Room ${code} deleted`);
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
