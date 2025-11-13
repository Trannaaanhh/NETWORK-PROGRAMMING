import { state } from './state.js';
import { CONSTANTS } from './constants.js';
import { DOM, showGame, showLobby, displayChatMessage, updatePlayersListUI, updateButtonVisibility } from './ui.js';
import { startHostGameLogic, stopHostGameLogic, handleHostInput } from './hostLogic.js';
import { handleGameSnapshot, render, startInputLoop } from './gameClient.js';

export function sendSignalingMessage(payload) {
    if (state.currentGameWs && state.currentGameWs.readyState === WebSocket.OPEN) {
      state.currentGameWs.send(JSON.stringify(payload));
    }
}

export function openRoomWebSocket(roomId) {
    if (state.currentGameWs) try { state.currentGameWs.close(); } catch (e) {}
  
    const roomUrl = `ws://${window.location.hostname}:3000/room/${roomId}?name=${encodeURIComponent(state.playerName)}`;
    console.log(`🔗 Kết nối đến room (Signaling): ${roomUrl}`);
    
    state.currentGameWs = new WebSocket(roomUrl);
    state.currentGameWs.binaryType = "arraybuffer";
    
    DOM.chatDisplayRoom.innerHTML = '';
    displayChatMessage(null, `Đã vào kênh chat phòng.`, 'system-room');
    
    state.currentGameWs.onopen = () => {
      console.log(`✅ Joined room (Signaling) ${roomId}`);
      showGame();
      updateButtonVisibility();
    };
  
    state.currentGameWs.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        try {
          const msg = JSON.parse(ev.data);
          
          if (msg.type !== 'chat_room_msg' && !msg.type.startsWith('webrtc_')) {
            console.log(`📨 Nhận JSON từ server (Signaling):`, msg.type);
          }
          
          if (msg.type === 'lobby_update') {
            const oldPlayerList = new Map(state.localPlayerList.map(p => [p.id, p]));
            state.localPlayerList = msg.players;
            state.currentHostId = msg.hostId;
            
            if (state.myId !== null) {
              const wasHost = state.isHost;
              state.isHost = (state.currentHostId === state.myId);
              console.log(`👑 Host check - myId: ${state.myId}, hostId: ${state.currentHostId}, isHost: ${state.isHost}`);
              if (state.isHost && !wasHost) startHostGameLogic();
              else if (!state.isHost && wasHost) stopHostGameLogic();
              if (state.isHost) startHostGameLogic();
            }
            
            const newPlayerMap = new Map(state.localPlayerList.map(p => [p.id, p]));
            state.localPlayerList.forEach(p => {
              if (p.id !== state.myId && !oldPlayerList.has(p.id) && !state.peerConnections.has(p.id)) {
                console.log(`[P2P] Phát hiện người mới: ${p.name}`);
                if (!state.isHost) {
                  if (p.id === state.currentHostId) {
                    console.log(`[P2P] Guest kết nối tới Host...`);
                    createPeerConnection(p.id, true); 
                  }
                }
              }
            });
            oldPlayerList.forEach((p, id) => {
              if (id !== state.myId && !newPlayerMap.has(id) && state.peerConnections.has(id)) {
                console.log(`[P2P] Dọn dẹp kết nối của: ${p.name}`);
                state.peerConnections.get(id).pc.close();
                state.peerConnections.delete(id);
                if (state.isHost) {
                  state.playerMap.delete(id); state.clientInputMap.delete(id);
                }
              }
            });
            
            updatePlayersListUI(state.localPlayerList, state.currentHostId);
            updateButtonVisibility();
          } else if (msg.type === 'game_start') {
            state.currentRoomState = 'IN_PROGRESS';
            console.log(`🎯 Game started! State set to IN_PROGRESS`);
            updateButtonVisibility();
            DOM.countdownDisplay.style.display = 'none';
            state.historyBuffer.clear();
            if (state.isHost) {
              stopHostGameLogic(); state.playerMap.clear(); state.clientInputMap.clear(); 
              state.nextPlayerColorIndex = 0; startHostGameLogic(); 
            }
          } else if (msg.type === 'game_end') {
            state.currentRoomState = 'WAITING';
            state.myIsDead = false;
            console.log(`🏁 Game ended. State set to WAITING`);
            updateButtonVisibility();
            state.historyBuffer.clear();
            if (state.isHost) {
              stopHostGameLogic(); state.playerMap.clear(); state.clientInputMap.clear(); 
              state.nextPlayerColorIndex = 0; startHostGameLogic(); 
            }
          } else if (msg.type === 'countdown') {
            state.currentRoomState = 'COUNTDOWN';
            DOM.countdownDisplay.textContent = msg.seconds;
            DOM.countdownDisplay.style.display = msg.seconds > 0 ? 'block' : 'none';
            console.log(`⏰ Countdown: ${msg.seconds}. State set to COUNTDOWN`);
            updateButtonVisibility();
            if (msg.seconds <= 0) setTimeout(() => { DOM.countdownDisplay.style.display = 'none'; }, 1000);
          } else if (msg.type === 'error') {
            console.error(`❌ Server error: ${msg.message}`);
            alert(msg.message); state.currentGameWs.close();
          } else if (msg.type === 'chat_room_msg') {
            displayChatMessage(msg.sender, msg.message, 'room');
          } else if (msg.type === 'webrtc_offer') {
            console.log(`[P2P] Nhận offer từ ${msg.senderId}`);
            (async () => {
              try {
                await createPeerConnection(msg.senderId, false); 
                const peer = state.peerConnections.get(msg.senderId);
                await peer.pc.setRemoteDescription(new RTCSessionDescription(msg.offer));
                const answer = await peer.pc.createAnswer();
                await peer.pc.setLocalDescription(answer);
                sendSignalingMessage({ type: 'webrtc_answer', targetId: msg.senderId, answer: answer });
              } catch(e) { console.error(`[P2P] Lỗi xử lý offer:`, e); }
            })();
          } else if (msg.type === 'webrtc_answer') {
            console.log(`[P2P] Nhận answer từ ${msg.senderId} (Host)`);
            (async () => {
              try {
                const peer = state.peerConnections.get(msg.senderId);
                if (peer) await peer.pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
              } catch(e) { console.error(`[P2P] Lỗi xử lý answer:`, e); }
            })();
          } else if (msg.type === 'webrtc_candidate') {
            (async () => {
              try {
                const peer = state.peerConnections.get(msg.senderId);
                if (peer && msg.candidate) await peer.pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
              } catch (e) { console.error(`[P2P] Lỗi thêm candidate:`, e); }
            })();
          }
        } catch (e) { console.error('❌ Error parsing JSON message', e); }
        return;
      }
  
      try {
        const dv = new DataView(ev.data);
        const t = dv.getUint8(0);
        if (t === 0) { 
          state.myId = dv.getUint32(1);
          console.log(`🎉 Welcome! myId = ${state.myId}`);
          if (state.currentHostId !== null) {
            state.isHost = (state.currentHostId === state.myId);
            console.log(`👑 Host status updated - isHost: ${state.isHost}`);
            updateButtonVisibility();
            if (state.isHost) startHostGameLogic();
          }
          updatePlayersListUI(state.localPlayerList, state.currentHostId);
          render(); 
          startInputLoop();
        } else if (t === 5) { 
          state.ping = Math.round(performance.now() - state.lastPingTime);
        }
      } catch (e) { console.error('❌ Error parsing WS message (binary)', e); }
    };
  
    state.currentGameWs.onclose = () => {
      console.log('🔌 Room WS (Signaling) closed, returning to lobby');
      showLobby();
      cleanupRoom();
    };
    state.currentGameWs.onerror = (e) => { console.error('❌ Room WS (Signaling) error', e); };
}

export function cleanupRoom() {
    state.myId = null;
    state.isHost = false;
    state.historyBuffer.clear();
    state.playerMap.clear();
    state.localPlayerList = [];
    state.currentHostId = null;
    DOM.respawnButton.style.display = 'none';
    state.peerConnections.forEach(peer => peer.pc.close());
    state.peerConnections.clear();
    stopHostGameLogic();
    DOM.chatDisplayRoom.innerHTML = '';
    if (state.inputInterval) clearInterval(state.inputInterval);
    if (state.pingInterval) clearInterval(state.pingInterval);
    if (state.renderFrameId) cancelAnimationFrame(state.renderFrameId);
    state.currentGameWs = null;
}

async function createPeerConnection(targetPlayerId, isInitiator) {
    console.log(`[P2P] Tạo kết nối tới ${targetPlayerId} (Initiator: ${isInitiator})`);
    const pc = new RTCPeerConnection(CONSTANTS.RTC_CONFIG);
    state.peerConnections.set(targetPlayerId, { pc, dc: null });
  
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignalingMessage({
          type: 'webrtc_candidate',
          targetId: targetPlayerId,
          candidate: event.candidate
        });
      }
    };
  
    const setupDataChannel = (dc) => {
      console.log(`[P2P] Data Channel tới ${targetPlayerId} đã mở!`);
      state.peerConnections.get(targetPlayerId).dc = dc;
      dc.binaryType = 'arraybuffer';
      dc.onmessage = (event) => {
        const dv = new DataView(event.data);
        const type = dv.getUint8(0);
        if (state.isHost) handleHostInput(targetPlayerId, dv); 
        else if (type === 2) handleGameSnapshot(event.data); 
      };
      dc.onclose = () => { console.log(`[P2P] Data Channel tới ${targetPlayerId} đã đóng.`); };
      dc.onerror = (e) => { console.error(`[P2P] Data Channel tới ${targetPlayerId} lỗi:`, e); };
    };
  
    if (isInitiator) {
      const dc = pc.createDataChannel('gameData');
      setupDataChannel(dc);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignalingMessage({ type: 'webrtc_offer', offer: offer });
    } else {
      pc.ondatachannel = (event) => { setupDataChannel(event.channel); };
    }
}

export function sendCommand(command) {
    if (state.currentGameWs && state.currentGameWs.readyState === WebSocket.OPEN) {
      console.log(`📤 Gửi command đến server (Signaling):`, command);
      state.currentGameWs.send(JSON.stringify(command));
    } else {
      console.error(`❌ Không thể gửi command - WebSocket (Signaling) không mở:`, command);
    }
}

export function sendRespawnCommand() {
    const buf = new ArrayBuffer(1); const dv = new DataView(buf); dv.setUint8(0, 3); 
    if (state.isHost) {
      console.log("[Host] Tự xử lý respawn");
      handleHostInput(state.myId, dv);
    } else {
      const hostPeer = state.peerConnections.get(state.currentHostId);
      if (hostPeer && hostPeer.dc && hostPeer.dc.readyState === 'open') {
        console.log("[Guest] Gửi respawn cho Host");
        hostPeer.dc.send(buf);
      } else {
        console.warn("Không thể gửi respawn: Mất kết nối P2P tới Host.");
      }
    }
}