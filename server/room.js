// server/room.js
const WebSocket = require('ws');

// SỬA: Xóa 'url' module vì không cần nữa
// const url = require('url'); 

const { lineCircleIntersect, lineLineIntersect } = require('./game-logic');
const { makeId } = require('./utils');

// Game constants (match với code gốc)
const ROOM_TICK_RATE = 60;
const ROOM_BROADCAST_RATE = 20;
const WORLD_W = 800, WORLD_H = 600;
const PLAYER_SPEED = 200;
const ORB_RADIUS = 85;
const ORB_SPEED = Math.PI;
const PLAYER_RADIUS = 12;
const SWORD_LENGTH = 150;
const RESPAWN_TIME = 2; // seconds
const COUNTDOWN_SECONDS = 5;

let nextPlayerId = 1;

/**
 * createRoomServer(room, roomsArray, broadcastLobbyRooms)
 * - room: object with at least { id, name, pass, state, createdAt }
 * - roomsArray: reference to lobby's rooms array (so we can cleanup)
 * - broadcastLobbyRooms: function to call to update lobby clients
 */
function createRoomServer(room, roomsArray, broadcastLobbyRooms = () => {}) {
  const wssRoom = new WebSocket.Server({ noServer: true });
  room.wss = wssRoom;
  room.players = new Set();
  room.playersData = new Map();
  room.wsToPlayerId = new Map();
  room.tickInterval = null;
  room.broadcastInterval = null;
  room.countdownTimer = null;
  room.hostId = null;

  // Helper: broadcast JSON to all in room
  function broadcastRoomJson(msg) {
    const payload = JSON.stringify(msg);
    // avoid chat noise in server logs
    if (msg.type !== 'chat_room_msg') {
      console.log(`📤 Broadcast to room ${room.name}:`, msg.type);
    }
    room.players.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(payload); } catch (e) { /* ignore */ }
      }
    });
  }

  function broadcastLobbyUpdate() {
    const playersList = Array.from(room.playersData.values()).map(p => ({ id: p.id, name: p.name }));
    console.log(`🔄 Lobby update for room ${room.name}:`, {
      players: playersList.length,
      hostId: room.hostId,
      state: room.state
    });

    broadcastRoomJson({
      type: 'lobby_update',
      players: playersList,
      hostId: room.hostId,
      state: room.state
    });
  }

  function resetPlayersForLobby() {
    room.playersData.forEach(p => {
      p.hp = 100;
      p.isDead = false;
      p.x = Math.random() * (WORLD_W - 50) + 25;
      p.y = Math.random() * (WORLD_H - 50) + 25;
      p.vx = 0;
      p.vy = 0;
      p.orbAngle = Math.random() * Math.PI * 2;
    });
  }

  wssRoom.on('connection', (ws, req) => {
    // SỬA: Dùng WHATWG URL API mới để lấy query param
    const { searchParams } = new URL(req.url, `ws://${req.headers.host}`);
    const playerName = searchParams.get('name') || 'Anonymous';

    console.log(`🔗 New connection to room ${room.name}: ${playerName}`);

    // Reject join if game in progress or countdown
    if (room.state === 'IN_PROGRESS' || room.state === 'COUNTDOWN') {
      console.log(`❌ Room ${room.name} is busy, rejecting ${playerName}`);
      ws.send(JSON.stringify({ type: 'error', message: 'Trận đấu đang diễn ra hoặc sắp bắt đầu, không thể tham gia!' }));
      ws.close();
      return;
    }

    const player = {
      id: nextPlayerId++,
      name: playerName,
      x: Math.random() * (WORLD_W - 50) + 25,
      y: Math.random() * (WORLD_H - 50) + 25,
      vx: 0, vy: 0,
      lastInputSeq: 0,
      orbAngle: Math.random() * Math.PI * 2,
      orbDir: 1,
      lastClashTime: 0,
      lastAttackTime: 0,
      color: Math.floor(Math.random() * 8),
      hp: 100,
      isDead: false,
      deathTime: 0,
    };

    // Set host if first player
    if (room.hostId === null) {
      room.hostId = player.id;
      console.log(`👑 ${playerName} is now host of room ${room.name}`);
    }

    room.playersData.set(player.id, player);
    room.players.add(ws);
    room.wsToPlayerId.set(ws, player.id);

    console.log(`✅ Player ${player.id} (${player.name}) connected to room ${room.id}. Players: ${room.players.size}`);

    // Send welcome id as binary packet type 0
    try {
      const buf0 = new ArrayBuffer(5);
      const dv0 = new DataView(buf0);
      dv0.setUint8(0, 0);
      dv0.setUint32(1, player.id);
      ws.send(buf0);
    } catch (e) { console.error('send welcome error', e); }

    // notify lobby & room
    broadcastLobbyUpdate();
    broadcastLobbyRooms();

    ws.on('message', (data) => {
      const pid = room.wsToPlayerId.get(ws);
      const p = room.playersData.get(pid);
      if (!p) return;

      // Identify JSON vs binary
      let isJson = false;
      if (Buffer.isBuffer(data) && data[0] === 123) { // '{'
        isJson = true;
      } else if (typeof data === 'string' && data.startsWith('{')) {
        isJson = true;
      }

      if (isJson) {
        let msg;
        try { msg = JSON.parse(data.toString()); } catch (e) {
          console.error(`❌ Lỗi parse JSON từ ${p.name}`, data.toString(), e);
          return;
        }

        if (msg.type !== 'chat_room') {
          console.log(`📨 Nhận JSON command từ ${p.name} (${pid}):`, msg);
        }

        // Chat in room (anyone)
        if (msg.type === 'chat_room') {
          const message = String(msg.message || '').trim();
          if (message) {
            console.log(`[ROOM CHAT - ${room.name}] ${p.name}: ${message}`);
            broadcastRoomJson({ type: 'chat_room_msg', sender: p.name, message });
          }
          return;
        }

        // only host can run following commands
        if (pid !== room.hostId) {
          console.log(`❌ LỆNH BỊ TỪ CHỐI: ${p.name} không phải host (Host là ${room.hostId})`);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'error', message: 'Chỉ chủ phòng mới có quyền này!' }));
          }
          return;
        }

        if (msg.type === 'start_game') {
          console.log(`🎮 start_game requested. Current state: ${room.state}`);
          if (room.state === 'WAITING') {
            if (room.players.size < 1) { // Cho phép 1 người chơi để test
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'error', message: `Cần ít nhất 1 người chơi để bắt đầu! Hiện có ${room.players.size} người.` }));
              }
              return;
            }

            room.state = 'COUNTDOWN';
            let countdown = COUNTDOWN_SECONDS;
            broadcastRoomJson({ type: 'countdown', seconds: countdown });
            console.log(`📤 Sent countdown: ${countdown}s`);

            if (room.countdownTimer) {
              clearInterval(room.countdownTimer);
              room.countdownTimer = null;
            }

            room.countdownTimer = setInterval(() => {
              countdown--;
              console.log(`⏰ Timer: ${countdown}s`);
              broadcastRoomJson({ type: 'countdown', seconds: countdown });

              if (countdown <= 0) {
                clearInterval(room.countdownTimer);
                room.countdownTimer = null;
                room.state = 'IN_PROGRESS';
                resetPlayersForLobby();
                console.log(`🎯 MATCH START in ${room.name}`);
                broadcastRoomJson({ type: 'game_start' });
                broadcastLobbyRooms();

                const nowSec = Date.now() / 1000;
                for (const player of room.playersData.values()) {
                  player.lastAttackTime = nowSec;
                  player.lastClashTime = nowSec;
                }
              }
            }, 1000);
          } else {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'error', message: `Không thể bắt đầu game. Trạng thái hiện tại: ${room.state}` }));
            }
          }
          return;
        } else if (msg.type === 'cancel_countdown') {
          console.log(`⏹️ cancel_countdown requested, state: ${room.state}`);
          if (room.state === 'COUNTDOWN') {
            if (room.countdownTimer) {
              clearInterval(room.countdownTimer);
              room.countdownTimer = null;
            }
            room.state = 'WAITING';
            console.log(`✅ Countdown cancelled. Back to WAITING.`);
            broadcastRoomJson({ type: 'countdown', seconds: 0 });
            broadcastLobbyUpdate();
          }
          return;
        } else if (msg.type === 'end_game') {
          console.log(`🏁 end_game requested, state: ${room.state}`);
          if (room.state === 'IN_PROGRESS' || room.state === 'COUNTDOWN') {
            if (room.countdownTimer) {
              clearInterval(room.countdownTimer);
              room.countdownTimer = null;
            }
            room.state = 'WAITING';
            resetPlayersForLobby();
            console.log(`✅ Game ended. Back to WAITING.`);
            broadcastRoomJson({ type: 'game_end' });
            broadcastLobbyRooms();
          }
          return;
        }

        return; // end JSON handling
      }

      // Binary handling
      try {
        const ab = Buffer.isBuffer(data)
          ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
          : data;
        const dv = new DataView(ab);
        const t = dv.getUint8(0);

        if (t === 1) { // Input
          if (p.isDead && room.state === 'IN_PROGRESS') return;
          const seq = dv.getUint32(1);
          const flags = dv.getUint8(5);
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
        } else if (t === 3) { // Respawn
          const nowSec = Date.now() / 1000;
          if (p.isDead && (nowSec - p.deathTime) >= RESPAWN_TIME) {
            p.hp = 100;
            p.isDead = false;
            p.x = Math.random() * (WORLD_W - 50) + 25;
            p.y = Math.random() * (WORLD_H - 50) + 25;
          }
        } else if (t === 4) { // Ping -> Pong (5)
          const pongBuf = new ArrayBuffer(1);
          const pongDv = new DataView(pongBuf);
          pongDv.setUint8(0, 5);
          ws.send(pongBuf);
        }
      } catch (e) {
        console.error('❌ Room binary message error', e);
      }
    }); // end ws.on('message')

    ws.on('close', () => {
      const pid = room.wsToPlayerId.get(ws);
      if (pid) {
        room.playersData.delete(pid);
        room.wsToPlayerId.delete(ws);
      }
      room.players.delete(ws);
      console.log(`🔌 Player left room ${room.id}. Remaining: ${room.players.size}`);

      // If countdown and not enough players, cancel
      if (room.state === 'COUNTDOWN' && room.players.size < 2) {
        console.log(`⏹️ Cancelling countdown - not enough players`);
        if (room.countdownTimer) {
          clearInterval(room.countdownTimer);
          room.countdownTimer = null;
        }
        room.state = 'WAITING';
        broadcastLobbyUpdate();
        broadcastLobbyRooms();
      }

      // cleanup room if empty
      if (room.players.size === 0) {
        console.log(`🏁 Room ${room.name} is empty, scheduling cleanup`);
        setTimeout(() => {
          if (room.players.size === 0) {
            cleanupRoom(room.id, roomsArray);
            broadcastLobbyRooms();
          }
        }, 2000);
      } else {
        // if host left, pick new host
        if (pid === room.hostId) {
          room.hostId = room.playersData.keys().next().value;
          console.log(`👑 New host: ${room.hostId}`);
        }
        broadcastLobbyUpdate();
        broadcastLobbyRooms();
      }
    });

  }); // end wssRoom.on('connection')

  // Start tick loop
  room.tickInterval = setInterval(() => {
    const dt = 1 / ROOM_TICK_RATE;

    // movement logic (always)
    for (const p of room.playersData.values()) {
      if (p.isDead && room.state === 'IN_PROGRESS') continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < PLAYER_RADIUS) p.x = PLAYER_RADIUS;
      if (p.y < PLAYER_RADIUS) p.y = PLAYER_RADIUS;
      if (p.x > WORLD_W - PLAYER_RADIUS) p.x = WORLD_W - PLAYER_RADIUS;
      if (p.y > WORLD_H - PLAYER_RADIUS) p.y = WORLD_H - PLAYER_RADIUS;

      if (room.state === 'IN_PROGRESS') {
        p.orbAngle += ORB_SPEED * dt * p.orbDir;
        if (p.orbAngle > Math.PI * 2) p.orbAngle -= Math.PI * 2;
        if (p.orbAngle < 0) p.orbAngle += Math.PI * 2;
      }
    }

    if (room.state !== 'IN_PROGRESS') return;

    const nowSec = Date.now() / 1000;

    // sword vs player
    for (const p of room.playersData.values()) {
      if (p.isDead) continue;
      const swordBaseX = p.x;
      const swordBaseY = p.y;
      const swordTipX = p.x + Math.cos(p.orbAngle) * SWORD_LENGTH;
      const swordTipY = p.y + Math.sin(p.orbAngle) * SWORD_LENGTH;
      for (const q of room.playersData.values()) {
        if (q.id === p.id || q.isDead) continue;
        if (lineCircleIntersect(swordBaseX, swordBaseY, swordTipX, swordTipY, q.x, q.y, PLAYER_RADIUS)) {
          if ((nowSec - q.lastAttackTime) > 0.5) {
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

    // sword vs sword (clash)
    const playersArr = Array.from(room.playersData.values());
    for (let i = 0; i < playersArr.length; i++) {
      const p = playersArr[i];
      if (p.isDead) continue;
      const pTipX = p.x + Math.cos(p.orbAngle) * SWORD_LENGTH;
      const pTipY = p.y + Math.sin(p.orbAngle) * SWORD_LENGTH;
      for (let j = i + 1; j < playersArr.length; j++) {
        const q = playersArr[j];
        if (q.isDead) continue;
        const qTipX = q.x + Math.cos(q.orbAngle) * SWORD_LENGTH;
        const qTipY = q.y + Math.sin(q.orbAngle) * SWORD_LENGTH;
        if (lineLineIntersect(p.x, p.y, pTipX, pTipY, q.x, q.y, qTipX, qTipY)) {
          const aReady = (nowSec - p.lastClashTime) > 0.5;
          const bReady = (nowSec - q.lastClashTime) > 0.5;
          if (aReady && bReady) {
            p.orbDir *= -1;
            q.orbDir *= -1;
            p.lastClashTime = nowSec;
            q.lastClashTime = nowSec;
          }
        }
      }
    }

  }, 1000 / ROOM_TICK_RATE);

  // Broadcast loop
  room.broadcastInterval = setInterval(() => {
    const n = room.playersData.size;
    if (n === 0) return;

    const stateByte =
      room.state === 'IN_PROGRESS' ? 1 :
      room.state === 'COUNTDOWN' ? 2 : 0;

    // compute buffer size per player: 27 bytes as before
    const buf = new ArrayBuffer(1 + 4 + 1 + 4 + n * 27);
    const dv = new DataView(buf);
    let off = 0;
    dv.setUint8(off, 2); off += 1; // packet type 2 = state update
    dv.setUint32(off, Date.now()); off += 4;
    dv.setUint8(off, stateByte); off += 1;
    dv.setUint32(off, n); off += 4;

    for (const p of room.playersData.values()) {
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

    // send to all clients in this room
    room.players.forEach((clientWs) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        try { clientWs.send(Buffer.from(buf)); } catch (e) { /* ignore */ }
      }
    });
  }, 1000 / ROOM_BROADCAST_RATE);

  console.log(`🔨 Room server created: ${room.name} (${room.id})`);
}

// cleanup helper (call from lobby)
function cleanupRoom(roomId, roomsArray = []) {
  const idx = roomsArray.findIndex(r => r.id === roomId);
  if (idx === -1) return;
  const room = roomsArray[idx];
  console.log('🧹 Cleaning up room:', roomId);
  try {
    if (room.tickInterval) clearInterval(room.tickInterval);
    if (room.broadcastInterval) clearInterval(room.broadcastInterval);
    if (room.countdownTimer) clearInterval(room.countdownTimer);
    if (room.wss) {
      room.players.forEach(ws => {
        try { ws.close(); } catch (e) { }
      });
      room.wss.close();
    }
  } catch (e) { console.error('cleanup error', e); }
  roomsArray.splice(idx, 1);
}

function snapshotRoomsForClients(roomsArray) {
  return roomsArray.map(r => ({
    id: r.id,
    name: r.name,
    hasPass: !!r.pass,
    count: r.players ? r.players.size : 0,
    createdAt: r.createdAt,
    state: r.state
  }));
}

module.exports = {
  createRoomServer,
  cleanupRoom,
  snapshotRoomsForClients
};