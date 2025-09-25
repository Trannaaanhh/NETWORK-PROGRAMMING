const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const app = express();
app.use(express.static('public')); // index.html + client.js + sword.jpg
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
// ================== Game constants ==================
const TICK_RATE = 100; // Hz
const BROADCAST_RATE = 20; // times per second
const WORLD_W = 800, WORLD_H = 600;
const PLAYER_SPEED = 200; // px/s
const ORB_RADIUS = 30; // khoảng cách sword đến player (matches client)
const ORB_SPEED = Math.PI; // rad/s (sword rotation speed)
let nextId = 1;
const players = new Map(); // id -> {id, x, y, vx, vy, lastInputSeq, orbAngle}
// ================== Helper ==================
function createPlayer() {
  return {
    id: nextId++,
    x: Math.random() * (WORLD_W - 50) + 25,
    y: Math.random() * (WORLD_H - 50) + 25,
    vx: 0,
    vy: 0,
    lastInputSeq: 0,
    orbAngle: 0 // rad (controls sword rotation)
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
      // Ensure data is a Buffer or ArrayBuffer
      const ab = Buffer.isBuffer(data) ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data;
      const dv = new DataView(ab);
      const t = dv.getUint8(0);
      if (t === 1) {
        const seq = dv.getUint32(1);
        const flags = dv.getUint8(5);
        const p = players.get(ws.playerId);
        if (!p) return;
        p.lastInputSeq = seq;
        let vx = 0, vy = 0;
        if (flags & 1) vy -= 1; // up
        if (flags & 2) vy += 1; // down
        if (flags & 4) vx -= 1; // left
        if (flags & 8) vx += 1; // right
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
    // update sword angle
    p.orbAngle += ORB_SPEED * dt;
    if (p.orbAngle > Math.PI * 2) p.orbAngle -= Math.PI * 2;
  }
}, 1000 / TICK_RATE);
// ================== Broadcast ==================
let serverTick = 0;
setInterval(() => {
  serverTick++;
  const n = players.size;
  const buf = new ArrayBuffer(1 + 4 + 4 + n * 24); // type + serverTick + count + n*(id + x + y + lastInputSeq + orbX + orbY)
  const dv = new DataView(buf);
  let off = 0;
  dv.setUint8(off, 2); off += 1; // type=2 (state update)
  dv.setUint32(off, serverTick); off += 4;
  dv.setUint32(off, n); off += 4;
  for (const p of players.values()) {
    dv.setUint32(off, p.id); off += 4;
    dv.setFloat32(off, p.x); off += 4;
    dv.setFloat32(off, p.y); off += 4;
    dv.setUint32(off, p.lastInputSeq || 0); off += 4;
    // sword position relative to player
    const orbX = p.x + Math.cos(p.orbAngle) * ORB_RADIUS;
    const orbY = p.y + Math.sin(p.orbAngle) * ORB_RADIUS;
    dv.setFloat32(off, orbX); off += 4;
    dv.setFloat32(off, orbY); off += 4;
  }
  // broadcast to all clients
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(Buffer.from(buf));
    }
  });
}, 1000 / BROADCAST_RATE);
server.listen(3000, () => console.log('Server running on http://localhost:3000'));