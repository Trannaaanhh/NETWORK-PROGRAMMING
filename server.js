const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const app = express();
app.use(express.static('public'));
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ================== Game constants ==================
const TICK_RATE = 100;          // server logic tick
const BROADCAST_RATE = 20;     // 20 updates/s cho client
const WORLD_W = 800, WORLD_H = 600;
const PLAYER_SPEED = 200;
const ORB_RADIUS = 30;
const ORB_SPEED = Math.PI;
let nextId = 1;

// màu random cho player
const COLORS = ['#4CAF50','#2196F3','#E91E63','#FF9800',
                '#9C27B0','#00BCD4','#8BC34A','#FFC107'];

const players = new Map(); // id -> {id, x, y, vx, vy, lastInputSeq, orbAngle, color}

// ================== Helper ==================
function createPlayer() {
  return {
    id: nextId++,
    x: Math.random() * (WORLD_W - 50) + 25,
    y: Math.random() * (WORLD_H - 50) + 25,
    vx: 0,
    vy: 0,
    lastInputSeq: 0,
    orbAngle: 0,
    color: COLORS[Math.floor(Math.random() * COLORS.length)]
  };
}

// ================== WebSocket ==================
wss.on('connection', (ws) => {
  const player = createPlayer();
  players.set(player.id, player);
  ws.playerId = player.id;
  console.log('connect', player.id);

  // send welcome (type=0)
  const buf0 = new ArrayBuffer(5);
  const dv0 = new DataView(buf0);
  dv0.setUint8(0, 0);
  dv0.setUint32(1, player.id);
  ws.send(buf0);

  ws.on('message', (data) => {
    try {
      const ab = Buffer.isBuffer(data)
        ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
        : data;
      const dv = new DataView(ab);
      const t = dv.getUint8(0);
      if (t === 1) {
        const seq = dv.getUint32(1);
        const flags = dv.getUint8(5);
        const p = players.get(ws.playerId);
        if (!p) return;
        p.lastInputSeq = seq;
        let vx = 0, vy = 0;
        if (flags & 1) vy -= 1;
        if (flags & 2) vy += 1;
        if (flags & 4) vx -= 1;
        if (flags & 8) vx += 1;
        const len = Math.hypot(vx, vy);
        if (len > 0) {
          vx = (vx / len) * PLAYER_SPEED;
          vy = (vy / len) * PLAYER_SPEED;
        } else {
          vx = 0;
          vy = 0;
        }
        p.vx = vx;
        p.vy = vy;
      }
    } catch (e) {
      console.error('Error processing message:', e);
    }
  });

  ws.on('close', () => {
    console.log('disconnect', ws.playerId);
    players.delete(ws.playerId);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error for player', ws.playerId, ':', err);
    players.delete(ws.playerId);
  });
});

// ================== Server tick ==================
let lastTime = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  for (const p of players.values()) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.x < 10) p.x = 10;
    if (p.y < 10) p.y = 10;
    if (p.x > WORLD_W - 10) p.x = WORLD_W - 10;
    if (p.y > WORLD_H - 10) p.y = WORLD_H - 10;
    p.orbAngle += ORB_SPEED * dt;
    if (p.orbAngle > Math.PI * 2) p.orbAngle -= Math.PI * 2;
  }
}, 1000 / TICK_RATE);

// ================== Broadcast ==================
let serverTick = 0;
setInterval(() => {
  serverTick++;
  const n = players.size;
  const buf = new ArrayBuffer(1 + 4 + 4 + n * 25);
  const dv = new DataView(buf);
  let off = 0;
  dv.setUint8(off, 2); off += 1;
  dv.setUint32(off, serverTick); off += 4;
  dv.setUint32(off, n); off += 4;
  for (const p of players.values()) {
    dv.setUint32(off, p.id); off += 4;
    dv.setFloat32(off, p.x); off += 4;
    dv.setFloat32(off, p.y); off += 4;
    dv.setUint32(off, p.lastInputSeq || 0); off += 4;
    const orbX = p.x + Math.cos(p.orbAngle) * ORB_RADIUS;
    const orbY = p.y + Math.sin(p.orbAngle) * ORB_RADIUS;
    dv.setFloat32(off, orbX); off += 4;
    dv.setFloat32(off, orbY); off += 4;
    dv.setUint8(off, COLORS.indexOf(p.color)); off += 1; // gửi index màu
  }
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(Buffer.from(buf));
    }
  });
}, 1000 / BROADCAST_RATE);

server.listen(3000, () => console.log('Server running on http://192.168.1.90:3000'));
