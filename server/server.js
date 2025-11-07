const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const os = require('os'); // <--- THÊM VÀO
const app = express();
app.use(express.static('client'));
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ================== Game constants ==================
const TICK_RATE = 60;
const BROADCAST_RATE = 20;
const WORLD_W = 800, WORLD_H = 600;
const PLAYER_SPEED = 200;
const ORB_RADIUS = 85;
const ORB_SPEED = Math.PI;
let nextId = 1;

const PLAYER_RADIUS = 12;
const SWORD_LENGTH = 150; // chiều dài kiếm
const SWORD_WIDTH = 16; // bề dày hitbox (rất mỏng)

// Cooldown
const SWORD_CLASH_COOLDOWN = 0.5;
const HIT_COOLDOWN = 0.5;
const RESPAWN_TIME = 2;

const COLORS = ['#4CAF50','#2196F3','#E91E63','#FF9800',
                '#9C27B0','#00BCD4','#8BC34A','#FFC107'];

const players = new Map();

// ================== Helper ==================

// HÀM HELPER ĐỂ TÌM IP NỘI BỘ (LAN)
function findLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Bỏ qua các địa chỉ không phải IPv4 và địa chỉ nội bộ (loopback)
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost'; // Trả về localhost nếu không tìm thấy
}

function getRandomColorIndex() {
    return Math.floor(Math.random() * COLORS.length);
}

function createPlayer() {
  return {
    id: nextId++,
    x: Math.random() * (WORLD_W - 50) + 25,
    y: Math.random() * (WORLD_H - 50) + 25,
    vx: 0, vy: 0,
    lastInputSeq: 0,
    orbAngle: Math.random() * Math.PI * 2,
    orbDir: 1,
    lastClashTime: 0,
    lastAttackTime: 0,
    color: getRandomColorIndex(),
    hp: 100,
    isDead: false,
    deathTime: 0,
  };
}

function respawnPlayer(p) {
  p.x = Math.random() * (WORLD_W - 50) + 25;
  p.y = Math.random() * (WORLD_H - 50) + 25;
  p.hp = 100;
  p.isDead = false;
  p.orbAngle = Math.random() * Math.PI * 2;
  p.color = getRandomColorIndex();
}

function dist(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

// Kiểm tra va chạm Line Segment (kiếm) ↔ Circle (người chơi)
function lineCircleIntersect(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const fx = cx - x1;
  const fy = cy - y1;
  const t = (fx * dx + fy * dy) / (dx * dx + dy * dy);
  const tt = Math.max(0, Math.min(1, t));
  const px = x1 + tt * dx;
  const py = y1 + tt * dy;
  return dist(px, py, cx, cy) <= r;
}

// Kiểm tra va chạm Line Segment (kiếm) ↔ Line Segment (kiếm)
function lineLineIntersect(x1,y1,x2,y2, x3,y3,x4,y4) {
  function ccw(ax, ay, bx, by, cx, cy) {
    return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
  }
  return (ccw(x1,y1,x3,y3,x4,y4) != ccw(x2,y2,x3,y3,x4,y4)) &&
         (ccw(x1,y1,x2,y2,x3,y3) != ccw(x1,y1,x2,y2,x4,y4));
}

// ================== WebSocket ==================
wss.on('connection', (ws) => {
  const player = createPlayer();
  players.set(player.id, player);
  ws.playerId = player.id;
  console.log('connect', player.id);

  // Welcome
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
        if (!p || p.isDead) return;
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
          vx = 0; vy = 0;
        }
        p.vx = vx; p.vy = vy;
      } else if (t === 3) {
        const p = players.get(ws.playerId);
        const nowSec = Date.now() / 1000;
        if (p && p.isDead && (nowSec - p.deathTime) >= RESPAWN_TIME) {
          respawnPlayer(p);
        }
      } else if (t === 4) { // Ping
        const pongBuf = new ArrayBuffer(1);
        const pongDv = new DataView(pongBuf);
        pongDv.setUint8(0, 5); // Packet type 5 = pong
        ws.send(pongBuf);
      }
    } catch (e) { console.error(e); }
  });

  ws.on('close', () => { players.delete(ws.playerId); });
});

// ================== Server tick ==================
let lastTime = Date.now();
setInterval(() => {
  const now = Date.now();
  const nowSec = now / 1000;
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  for (const p of players.values()) {
    if (p.isDead) continue;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.x < PLAYER_RADIUS) p.x = PLAYER_RADIUS;
    if (p.y < PLAYER_RADIUS) p.y = PLAYER_RADIUS;
    if (p.x > WORLD_W - PLAYER_RADIUS) p.x = WORLD_W - PLAYER_RADIUS;
    if (p.y > WORLD_H - PLAYER_RADIUS) p.y = WORLD_H - PLAYER_RADIUS;

    p.orbAngle += ORB_SPEED * dt * p.orbDir;
    if (p.orbAngle > Math.PI * 2) p.orbAngle -= Math.PI * 2;
    if (p.orbAngle < 0) p.orbAngle += Math.PI * 2;
  }

  // --- check Sword vs Player ---
  for (const p of players.values()) {
    if (p.isDead) continue;

    const swordBaseX = p.x;
    const swordBaseY = p.y;
    const swordTipX = p.x + Math.cos(p.orbAngle) * SWORD_LENGTH;
    const swordTipY = p.y + Math.sin(p.orbAngle) * SWORD_LENGTH;

    for (const q of players.values()) {
      if (q.id === p.id || q.isDead) continue;
      if (lineCircleIntersect(swordBaseX, swordBaseY, swordTipX, swordTipY, q.x, q.y, PLAYER_RADIUS)) {
        if ((nowSec - q.lastAttackTime) > HIT_COOLDOWN) {
          q.hp = Math.max(0, q.hp - 10);
          q.lastAttackTime = nowSec;
          if (q.hp <= 0) {
            q.isDead = true;
            q.vx = 0; q.vy = 0;
            q.deathTime = nowSec;
          }
        }
      }
    }
  }

  // --- check Sword vs Sword ---
  for (const p of players.values()) {
    if (p.isDead) continue;
    const pTipX = p.x + Math.cos(p.orbAngle) * SWORD_LENGTH;
    const pTipY = p.y + Math.sin(p.orbAngle) * SWORD_LENGTH;

    for (const q of players.values()) {
      if (q.id <= p.id || q.isDead) continue;
      const qTipX = q.x + Math.cos(q.orbAngle) * SWORD_LENGTH;
      const qTipY = q.y + Math.sin(q.orbAngle) * SWORD_LENGTH;

      if (lineLineIntersect(p.x,p.y,pTipX,pTipY, q.x,q.y,qTipX,qTipY)) {
        const aReady = (nowSec - p.lastClashTime) > SWORD_CLASH_COOLDOWN;
        const bReady = (nowSec - q.lastClashTime) > SWORD_CLASH_COOLDOWN;
        if (aReady && bReady) {
          p.orbDir *= -1;
          q.orbDir *= -1;
          p.lastClashTime = nowSec;
          q.lastClashTime = nowSec;
        }
      }
    }
  }

}, 1000 / TICK_RATE);

// ================== Broadcast ==================
setInterval(() => {
  const n = players.size;
  const buf = new ArrayBuffer(1 + 4 + 4 + n * 27);
  const dv = new DataView(buf);
  let off = 0;
  dv.setUint8(off, 2); off += 1;
  dv.setUint32(off, Date.now()); off += 4;
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
    dv.setUint8(off, p.color); off += 1;
    dv.setUint8(off, p.hp); off += 1;
    dv.setUint8(off, p.isDead ? 1 : 0); off += 1;
  }

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(Buffer.from(buf));
    }
  });
}, 1000 / BROADCAST_RATE);

// ================== SỬA PHẦN NÀY ==================
const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => { // Lắng nghe trên 0.0.0.0
    const ip = findLocalIp();
    console.log('==================================================');
    console.log('🚀 Server đang chạy! Có thể truy cập tại:');
    console.log(`   - Trên máy này: http://localhost:${PORT}`);
    console.log(`   - Trong mạng LAN: http://${ip}:${PORT}`);
    console.log('==================================================');
});