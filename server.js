const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Store active players and game state
const players = {};
let gameState = 'LOBBY'; // LOBBY, STARTING, PLAYING

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Host identifies itself
    socket.on('host-join', () => {
        socket.join('host-room');
        // Reset state to LOBBY whenever a new host connects/reloads
        gameState = 'LOBBY';
        io.emit('state-changed', { gameState });
        socket.emit('sync-state', { gameState });
        console.log('Host connected: State reset to LOBBY');
    });

    // Player joins from controller
    socket.on('player-join', (data) => {
        if (gameState !== 'LOBBY') {
            socket.emit('join-error', { message: 'Game sedang berlangsung, tunggu ronde berikutnya.' });
            return;
        }

        const playerName = (data.name || 'Player').substring(0, 10);

        players[socket.id] = {
            id: socket.id,
            name: playerName,
            color: data.color || '#ffffff'
        };

        io.to('host-room').emit('new-player', players[socket.id]);
        console.log(`Player joined: ${playerName} (${socket.id})`);
    });

    // Handle game state changes from host
    socket.on('update-state', (newState) => {
        gameState = newState;
        io.emit('state-changed', { gameState });
        console.log(`Game State Changed: ${gameState}`);
    });

    // Forward input from controller to host
    socket.on('player-input', (inputData) => {
        if (players[socket.id]) {
            // Forwarding to host
            io.to('host-room').emit('player-move', {
                id: socket.id,
                input: inputData // { up, down, left, right }
            });
        }
    });

    // Handle player elimination from host
    socket.on('eliminate-player', (data) => {
        const { id, rank } = data;
        if (players[id]) {
            io.to(id).emit('game-over', { rank: rank });
            console.log(`Player eliminated: ${players[id].name} - Rank #${rank}`);
        }
    });

    // Handle winner declared
    socket.on('winner-declared', (data) => {
        const { id, name } = data;
        io.emit('champion-announced', { name: name });
        console.log(`Champion: ${name}`);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        if (players[socket.id]) {
            console.log(`Player disconnected: ${players[socket.id].name}`);
            io.to('host-room').emit('player-left', socket.id);
            delete players[socket.id];

            // If no players left, reset game state
            if (Object.keys(players).length === 0) {
                gameState = 'LOBBY';
                io.emit('state-changed', { gameState });
                console.log('All players left: State reset to LOBBY');
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Host View: http://localhost:${PORT}`);
    console.log(`Controller View: http://localhost:${PORT}/controller.html`);
});
