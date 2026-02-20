const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// In-memory room store
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function checkWin(board, gridSize) {
  const N = gridSize;

  // Check rows
  for (let r = 0; r < N; r++) {
    const start = r * N;
    const symbol = board[start];
    if (!symbol) continue;
    if (board.slice(start, start + N).every(cell => cell === symbol)) {
      return symbol;
    }
  }

  // Check columns
  for (let c = 0; c < N; c++) {
    const symbol = board[c];
    if (!symbol) continue;
    let win = true;
    for (let r = 1; r < N; r++) {
      if (board[r * N + c] !== symbol) { win = false; break; }
    }
    if (win) return symbol;
  }

  // Check main diagonal (top-left to bottom-right)
  const diag1Symbol = board[0];
  if (diag1Symbol) {
    let win = true;
    for (let i = 1; i < N; i++) {
      if (board[i * N + i] !== diag1Symbol) { win = false; break; }
    }
    if (win) return diag1Symbol;
  }

  // Check anti-diagonal (top-right to bottom-left)
  const diag2Symbol = board[N - 1];
  if (diag2Symbol) {
    let win = true;
    for (let i = 1; i < N; i++) {
      if (board[i * N + (N - 1 - i)] !== diag2Symbol) { win = false; break; }
    }
    if (win) return diag2Symbol;
  }

  return null;
}

function isDraw(board) {
  return board.every(cell => cell !== null);
}

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('createRoom', ({ name, gridSize }) => {
    const validSizes = [3, 4, 5];
    const size = validSizes.includes(gridSize) ? gridSize : 3;
    const code = generateRoomCode();

    const room = {
      code,
      gridSize: size,
      board: Array(size * size).fill(null),
      players: [{ id: socket.id, name: name || 'Player 1', symbol: 'X' }],
      currentTurn: null,
      scores: { [socket.id]: 0 },
      status: 'waiting',
      rematchVotes: new Set(),
      round: 1,
    };

    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;

    socket.emit('roomCreated', { code, gridSize: size });
    console.log(`Room ${code} created by ${name} (${size}x${size})`);
  });

  socket.on('joinRoom', ({ code, name }) => {
    const room = rooms.get(code?.toUpperCase());

    if (!room) {
      socket.emit('error', { message: 'Room not found. Check your code and try again.' });
      return;
    }
    if (room.players.length >= 2) {
      socket.emit('error', { message: 'Room is full.' });
      return;
    }
    if (room.status !== 'waiting') {
      socket.emit('error', { message: 'Game already in progress.' });
      return;
    }

    room.players.push({ id: socket.id, name: name || 'Player 2', symbol: 'O' });
    room.scores[socket.id] = 0;
    room.currentTurn = room.players[0].id;
    room.status = 'playing';

    socket.join(code.toUpperCase());
    socket.data.roomCode = code.toUpperCase();

    io.to(room.code).emit('gameStart', {
      board: room.board,
      currentTurn: room.currentTurn,
      players: room.players,
      gridSize: room.gridSize,
      scores: room.scores,
    });

    console.log(`${name} joined room ${code}`);
  });

  socket.on('makeMove', ({ index }) => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);

    if (!room || room.status !== 'playing') return;
    if (room.currentTurn !== socket.id) return;
    if (room.board[index] !== null) return;
    if (index < 0 || index >= room.gridSize * room.gridSize) return;

    const player = room.players.find(p => p.id === socket.id);
    room.board[index] = player.symbol;

    const winner = checkWin(room.board, room.gridSize);
    const draw = !winner && isDraw(room.board);

    if (winner || draw) {
      room.status = 'over';
      if (winner) {
        room.scores[socket.id] = (room.scores[socket.id] || 0) + 1;
      }
      io.to(code).emit('gameOver', {
        board: room.board,
        winner: winner ? { id: socket.id, name: player.name, symbol: winner } : null,
        draw,
        scores: room.scores,
        players: room.players,
      });
    } else {
      // Switch turns
      room.currentTurn = room.players.find(p => p.id !== socket.id).id;
      io.to(code).emit('boardUpdate', {
        board: room.board,
        currentTurn: room.currentTurn,
      });
    }
  });

  socket.on('playAgain', () => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);

    if (!room || room.status !== 'over') return;

    room.rematchVotes.add(socket.id);

    if (room.rematchVotes.size === 2) {
      // Both players voted — start new round
      room.round += 1;
      room.board = Array(room.gridSize * room.gridSize).fill(null);
      room.status = 'playing';
      room.rematchVotes.clear();

      // Swap symbols each round
      room.players.forEach(p => {
        p.symbol = p.symbol === 'X' ? 'O' : 'X';
      });

      // Player with O goes first (they were X last round and went first)
      room.currentTurn = room.players.find(p => p.symbol === 'X').id;

      io.to(code).emit('rematchReady', {
        board: room.board,
        currentTurn: room.currentTurn,
        players: room.players,
        scores: room.scores,
        gridSize: room.gridSize,
      });
    } else {
      // Notify the other player that this player wants a rematch
      socket.to(code).emit('opponentWantsRematch');
    }
  });

  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room) return;

    console.log(`Player ${socket.id} disconnected from room ${code}`);

    socket.to(code).emit('opponentDisconnected');

    // Clean up the room
    rooms.delete(code);
    console.log(`Room ${code} deleted`);
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
