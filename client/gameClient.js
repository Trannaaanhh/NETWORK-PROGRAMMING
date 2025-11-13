import { state } from './state.js';
import { CONSTANTS } from './constants.js';
import { DOM, updatePlayersListUI, updateButtonVisibility } from './ui.js';
import { buildInputBuffer } from './utils.js';
import { handleHostInput } from './hostLogic.js';

export function render() {
    if (!state.currentGameWs) return; 
    
    DOM.ctx.clearRect(0,0,DOM.canvas.width,DOM.canvas.height);
    DOM.ctx.strokeStyle='#444';
    DOM.ctx.strokeRect(0,0,DOM.canvas.width,DOM.canvas.height);

    const renderTime = performance.now() - CONSTANTS.INTERP_DELAY;
    let earlier = null, later = null;
    for (const [t, snap] of state.historyBuffer) {
      if (t <= renderTime) earlier = snap;
      if (t > renderTime) { later = snap; break; }
    }

    if (!earlier) {
      for(const [id, p] of state.playerMap.entries()) {
        if (p.isDead && state.currentRoomState === 'IN_PROGRESS') continue;
        const orbX = p.orbX !== undefined ? p.orbX : p.x + Math.cos(p.orbAngle || 0) * CONSTANTS.ORB_RADIUS;
        const orbY = p.orbY !== undefined ? p.orbY : p.y + Math.sin(p.orbAngle || 0) * CONSTANTS.ORB_RADIUS;
        drawPlayer(p.x, p.y, orbX, orbY, p.color, p.hp);
      }
      state.renderFrameId = requestAnimationFrame(render);
      return;
    }
    
    if (!later) later = earlier;
    const ratio = (later.time === earlier.time) ? 0 : (renderTime - earlier.time) / (later.time - earlier.time);

    for (const [id, ep] of earlier.players) {
      const lp = later.players.get(id);
      if (!lp) continue; 
      if (ep.isDead && state.currentRoomState === 'IN_PROGRESS') continue;
      
      const x = ep.x + (lp.x - ep.x) * ratio;
      const y = ep.y + (lp.y - ep.y) * ratio;
      const orbX = ep.orbX + (lp.orbX - ep.orbX) * ratio;
      const orbY = ep.orbY + (lp.orbY - ep.orbY) * ratio;
      const color = ep.color;
      const hp = (state.currentRoomState === 'WAITING') ? 100 : (ep.hp + (lp.hp - ep.hp) * ratio);

      drawPlayer(x, y, orbX, orbY, color, hp);
    }

    DOM.info.textContent = `Players: ${state.playerMap.size} | State: ${state.currentRoomState}`;
    DOM.debug.textContent = `Ping (Server): ${state.ping} ms | Hitbox: ${state.showHitbox ? "ON" : "OFF"}`;
    state.renderFrameId = requestAnimationFrame(render);
}

function drawPlayer(x, y, orbX, orbY, color, hp) {
    const ctx = DOM.ctx;
    ctx.beginPath();
    ctx.arc(x, y, CONSTANTS.PLAYER_RADIUS, 0, Math.PI*2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'lime';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (state.currentRoomState === 'IN_PROGRESS' || state.currentRoomState === 'WAITING' || state.currentRoomState === 'COUNTDOWN') {
      const barWidth = 30;
      ctx.fillStyle = 'red';
      ctx.fillRect(x - barWidth/2, y - CONSTANTS.PLAYER_RADIUS - 8, barWidth, 4);
      ctx.fillStyle = 'green';
      ctx.fillRect(x - barWidth/2, y - CONSTANTS.PLAYER_RADIUS - 8, (hp/100) * barWidth, 4);
    }

    if (state.currentRoomState === 'IN_PROGRESS') {
      ctx.save();
      ctx.translate(x, y);
      const angle = Math.atan2(orbY - y, orbX - x);
      ctx.rotate(angle);
      if (DOM.swordImg.complete) {
        ctx.drawImage(DOM.swordImg, 0, -CONSTANTS.SWORD_WIDTH/2, CONSTANTS.SWORD_LENGTH, CONSTANTS.SWORD_WIDTH);
      } else {
        ctx.fillStyle = '#ccc';
        ctx.fillRect(0, -CONSTANTS.SWORD_WIDTH/2, CONSTANTS.SWORD_LENGTH, CONSTANTS.SWORD_WIDTH);
      }
      if (state.showHitbox) {
        ctx.strokeStyle = "red"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(CONSTANTS.SWORD_LENGTH, 0); ctx.stroke();
      }
      ctx.restore();
    } 

    if (state.showHitbox) {
      ctx.beginPath(); ctx.arc(orbX, orbY, 4, 0, Math.PI * 2); ctx.fillStyle = 'yellow'; ctx.fill();
    }
}

export function handleGameSnapshot(data) {
    try {
      const dv = new DataView(data);
      const t = dv.getUint8(0);
      if (t !== 2) return; 

      const tick = dv.getUint32(1);
      const stateByte = dv.getUint8(5);
      
      const newState = stateByte === 0 ? 'WAITING' : stateByte === 1 ? 'IN_PROGRESS' : 'COUNTDOWN';
      if (state.currentRoomState !== newState) {
        console.log(`[Client ${state.myId}] Chuyển trạng thái: ${state.currentRoomState} -> ${newState}`);
        state.currentRoomState = newState;
      }
      
      const n = dv.getUint32(6);
      let off = 10;
      const snapshot = { time: performance.now(), players: new Map() };
      const newPlayerMap = new Map();

      for (let i = 0; i < n; i++) {
        const id = dv.getUint32(off); off += 4;
        const x = dv.getFloat32(off); off += 4;
        const y = dv.getFloat32(off); off += 4;
        const lastAck = dv.getUint32(off); off += 4;
        const orbX = dv.getFloat32(off); off += 4;
        const orbY = dv.getFloat32(off); off += 4;
        const colorIndex = dv.getUint8(off); off += 1;
        const hp = dv.getUint8(off); off += 1;
        const isDead = dv.getUint8(off); off += 1;
        const color = CONSTANTS.COLORS[colorIndex] || '#ffffff';
        
        const playerData = { x, y, orbX, orbY, lastInputSeq: lastAck, color, hp, isDead: isDead === 1, colorIndex };
        snapshot.players.set(id, playerData); 
        
        const p_info = state.localPlayerList.find(p => p.id === id);
        const p_old_state = state.playerMap.get(id) || {}; 

        if (p_info) newPlayerMap.set(id, { ...p_old_state, ...playerData, ...p_info });
        else newPlayerMap.set(id, { ...p_old_state, ...playerData, name: p_old_state.name || 'Loading...' });

        if (id === state.myId) {
          const wasDead = state.myIsDead;
          state.myIsDead = isDead === 1;
          if (state.myIsDead && !wasDead) DOM.respawnButton.style.display = 'block';
          else if (!state.myIsDead) DOM.respawnButton.style.display = 'none';
        }
      }
      
      state.playerMap = newPlayerMap; 
      if (!state.isHost) {
        updatePlayersListUI(state.localPlayerList, state.currentHostId);
        updateButtonVisibility();
      }

      state.historyBuffer.set(snapshot.time, snapshot);
      for (const [t0] of state.historyBuffer) {
        if (snapshot.time - t0 > 2000) state.historyBuffer.delete(t0);
      }
    } catch (e) {
      console.error('❌ Error parsing game snapshot (binary)', e);
    }
}

export function startInputLoop() {
    state.inputInterval = setInterval(() => {
        if (!state.myId || (state.myIsDead && state.currentRoomState === 'IN_PROGRESS')) return;
    
        state.inputSeq++;
        let flags = 0;
        if (state.keys.up) flags |= 1;
        if (state.keys.down) flags |= 2;
        if (state.keys.left) flags |= 4;
        if (state.keys.right) flags |= 8;
    
        const inputBuffer = buildInputBuffer(state.inputSeq, flags);
    
        if (state.isHost) {
          handleHostInput(state.myId, new DataView(inputBuffer));
        } else {
          const hostPeer = state.peerConnections.get(state.currentHostId);
          if (hostPeer && hostPeer.dc && hostPeer.dc.readyState === 'open') {
            hostPeer.dc.send(inputBuffer);
          }
        }
      }, 1000 / 60);
    
      state.pingInterval = setInterval(() => {
        if (state.currentGameWs && state.currentGameWs.readyState === WebSocket.OPEN) {
          state.lastPingTime = performance.now();
          const buf = new ArrayBuffer(1);
           const dv = new DataView(buf);
          dv.setUint8(0, 4); 
          state.currentGameWs.send(buf);
        }
      }, 1000);
}