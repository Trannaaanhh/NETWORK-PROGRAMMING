import { state } from './state.js';
import { CONSTANTS } from './constants.js';
import { updatePlayersListUI } from './ui.js';
import { lineCircleIntersect, lineLineIntersect } from './utils.js';
import { handleGameSnapshot } from './gameClient.js';

export function startHostGameLogic() {
    if (!state.isHost) return; 
    if (state.gameTickInterval) console.log("👑 BẮT ĐẦU CHẠY GAME LOGIC TRÊN MÁY HOST");

    state.localPlayerList.forEach(p_info => {
      if (!state.playerMap.has(p_info.id)) { 
        console.log(`[Host] Thêm người chơi mới ${p_info.name} (ID: ${p_info.id}) vào state`);
        const playerState = {
          id: p_info.id, name: p_info.name,
          x: Math.random() * (CONSTANTS.WORLD_W - 50) + 25,
          y: Math.random() * (CONSTANTS.WORLD_H - 50) + 25,
          vx: 0, vy: 0, lastInputSeq: 0,
          orbAngle: Math.random() * Math.PI * 2, orbDir: 1,
          lastClashTime: 0, lastAttackTime: 0,
          color: CONSTANTS.COLORS[state.nextPlayerColorIndex % CONSTANTS.COLORS.length],
          colorIndex: state.nextPlayerColorIndex % CONSTANTS.COLORS.length,
          hp: 100, isDead: false, deathTime: 0
        };
        state.playerMap.set(p_info.id, playerState);
        state.clientInputMap.set(p_info.id, { flags: 0, seq: 0 }); 
        state.nextPlayerColorIndex++;
       }
    });
    
    updatePlayersListUI(state.localPlayerList, state.currentHostId);
    if (state.gameTickInterval) return; 

    state.gameTickInterval = setInterval(() => {
      const dt = 1 / CONSTANTS.ROOM_TICK_RATE;
      const nowSec = Date.now() / 1000;

      for (const [pid, input] of state.clientInputMap.entries()) {
        const p = state.playerMap.get(pid);
        if (!p) continue; 
        if (p.isDead && state.currentRoomState === 'IN_PROGRESS') { p.vx = 0; p.vy = 0; continue; };
        
        p.lastInputSeq = input.seq;
        let vx = 0, vy = 0;
        if (input.flags & 1) vy -= 1; 
        if (input.flags & 2) vy += 1; 
        if (input.flags & 4) vx -= 1; 
        if (input.flags & 8) vx += 1; 
        const len = Math.hypot(vx, vy);
        if (len > 0) { p.vx = (vx / len) * CONSTANTS.PLAYER_SPEED; p.vy = (vy / len) * CONSTANTS.PLAYER_SPEED; } 
        else { p.vx = 0; p.vy = 0; }
      }

      for (const p of state.playerMap.values()) {
        if (p.isDead && state.currentRoomState === 'IN_PROGRESS') continue;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.x < CONSTANTS.PLAYER_RADIUS) p.x = CONSTANTS.PLAYER_RADIUS;
        if (p.y < CONSTANTS.PLAYER_RADIUS) p.y = CONSTANTS.PLAYER_RADIUS;
        if (p.x > CONSTANTS.WORLD_W - CONSTANTS.PLAYER_RADIUS) p.x = CONSTANTS.WORLD_W - CONSTANTS.PLAYER_RADIUS;
        if (p.y > CONSTANTS.WORLD_H - CONSTANTS.PLAYER_RADIUS) p.y = CONSTANTS.WORLD_H - CONSTANTS.PLAYER_RADIUS;

        if (state.currentRoomState === 'IN_PROGRESS') {
          p.orbAngle += CONSTANTS.ORB_SPEED * dt * p.orbDir;
          if (p.orbAngle > Math.PI * 2) p.orbAngle -= Math.PI * 2;
          if (p.orbAngle < 0) p.orbAngle += Math.PI * 2;
        }
      }

      if (state.currentRoomState !== 'IN_PROGRESS') return; 

      for (const p of state.playerMap.values()) {
        if (p.isDead) continue;
        const swordBaseX = p.x; const swordBaseY = p.y;
        const swordTipX = p.x + Math.cos(p.orbAngle) * CONSTANTS.SWORD_LENGTH;
        const swordTipY = p.y + Math.sin(p.orbAngle) * CONSTANTS.SWORD_LENGTH;
        for (const q of state.playerMap.values()) {
          if (q.id === p.id || q.isDead) continue;
          if (lineCircleIntersect(swordBaseX, swordBaseY, swordTipX, swordTipY, q.x, q.y, CONSTANTS.PLAYER_RADIUS)) {
            if ((nowSec - q.lastAttackTime) > 0.5) { 
              q.hp = Math.max(0, q.hp - 10); q.lastAttackTime = nowSec;
              console.log(`[Host] ${p.name} đánh trúng ${q.name}! HP còn: ${q.hp}`);
              if (q.hp <= 0) { q.isDead = true; q.vx = 0; q.vy = 0; q.deathTime = nowSec; }
            }
          }
        }
      }
      const playersArr = Array.from(state.playerMap.values());
      for (let i = 0; i < playersArr.length; i++) {
        const p = playersArr[i]; if (p.isDead) continue;
        const pTipX = p.x + Math.cos(p.orbAngle) * CONSTANTS.SWORD_LENGTH;
        const pTipY = p.y + Math.sin(p.orbAngle) * CONSTANTS.SWORD_LENGTH;
        for (let j = i + 1; j < playersArr.length; j++) {
          const q = playersArr[j]; if (q.isDead) continue;
          const qTipX = q.x + Math.cos(q.orbAngle) * CONSTANTS.SWORD_LENGTH;
          const qTipY = q.y + Math.sin(q.orbAngle) * CONSTANTS.SWORD_LENGTH;
          if (lineLineIntersect(p.x, p.y, pTipX, pTipY, q.x, q.y, qTipX, qTipY)) {
            const aReady = (nowSec - p.lastClashTime) > 0.5;
            const bReady = (nowSec - q.lastClashTime) > 0.5;
            if (aReady && bReady) {
              p.orbDir *= -1; q.orbDir *= -1;
              p.lastClashTime = nowSec; q.lastClashTime = nowSec;
              console.log(`[Host] ${p.name} và ${q.name} chạm kiếm!`);
            }
          }
        }
      }
    }, 1000 / CONSTANTS.ROOM_TICK_RATE);

    state.gameBroadcastInterval = setInterval(() => {
      const n = state.playerMap.size;
      if (n === 0) return;
      const stateByte = state.currentRoomState === 'IN_PROGRESS' ? 1 : state.currentRoomState === 'COUNTDOWN' ? 2 : 0;
      
      const buf = new ArrayBuffer(1 + 4 + 1 + 4 + n * 27);
      const dv = new DataView(buf);
      let off = 0;
      dv.setUint8(off, 2); off += 1;
      dv.setUint32(off, Date.now()); off += 4;
      dv.setUint8(off, stateByte); off += 1;
      dv.setUint32(off, n); off += 4;

      for (const p of state.playerMap.values()) {
        dv.setUint32(off, p.id); off += 4;
        dv.setFloat32(off, p.x); off += 4;
        dv.setFloat32(off, p.y); off += 4;
        dv.setUint32(off, p.lastInputSeq || 0); off += 4;
        const orbX = p.x + Math.cos(p.orbAngle) * CONSTANTS.ORB_RADIUS;
        const orbY = p.y + Math.sin(p.orbAngle) * CONSTANTS.ORB_RADIUS;
        dv.setFloat32(off, orbX); off += 4;
        dv.setFloat32(off, orbY); off += 4;
        dv.setUint8(off, p.colorIndex); off += 1;
        dv.setUint8(off, p.hp); off += 1;
        dv.setUint8(off, p.isDead ? 1 : 0); off += 1;
      }

      handleGameSnapshot(buf);

      state.peerConnections.forEach((peer, guestId) => {
        if (state.playerMap.has(guestId) && peer.dc && peer.dc.readyState === 'open') {
          try { peer.dc.send(buf); } catch (e) { console.error(`Lỗi gửi snapshot P2P tới ${guestId}:`, e); }
        }
      });
    }, 1000 / CONSTANTS.ROOM_BROADCAST_RATE);
}

export function stopHostGameLogic() {
    console.log("👑 DỪNG CHẠY GAME LOGIC TRÊN MÁY HOST");
    if (state.gameTickInterval) clearInterval(state.gameTickInterval);
    if (state.gameBroadcastInterval) clearInterval(state.gameBroadcastInterval);
    state.gameTickInterval = null;
    state.gameBroadcastInterval = null;
}

export function handleHostInput(playerId, dv) {
    if (!state.isHost) return; 
    const t = dv.getUint8(0);
    const p = state.playerMap.get(playerId);
    if (!p) return;

    if (t === 1) { 
      if (p.isDead && state.currentRoomState === 'IN_PROGRESS') return;
      const seq = dv.getUint32(1);
      const flags = dv.getUint8(5);
      const oldFlags = (state.clientInputMap.get(playerId) || {}).flags || 0;
      if (flags !== oldFlags) console.log(`[Host] Nhận input (flags: ${flags}) từ ${p.name}`);
      state.clientInputMap.set(playerId, { flags, seq }); 
    } else if (t === 3) { 
      const nowSec = Date.now() / 1000;
      if (p.isDead && (nowSec - p.deathTime) >= CONSTANTS.RESPAWN_TIME) {
        p.hp = 100; p.isDead = false;
        p.x = Math.random() * (CONSTANTS.WORLD_W - 50) + 25;
        p.y = Math.random() * (CONSTANTS.WORLD_H - 50) + 25;
        console.log(`[Host] Hồi sinh cho ${p.name}`);
      }
    }
}