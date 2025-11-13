import { state } from './state.js';

export const DOM = {
    startPanel: document.getElementById('startPanel'),
    lobbyPanel: document.getElementById('lobbyPanel'),
    createForm: document.getElementById('createForm'),
    roomListContainer: document.getElementById('roomListContainer'),
    gameContainer: document.getElementById('game-container'),
    playerNameInput: document.getElementById('playerNameInput'),
    btnEnter: document.getElementById('btnEnter'),
    displayName: document.getElementById('displayName'),
    btnCreateRoom: document.getElementById('btnCreateRoom'),
    btnJoinRoom: document.getElementById('btnJoinRoom'),
    btnCreateConfirm: document.getElementById('btnCreateConfirm'),
    btnCreateCancel: document.getElementById('btnCreateCancel'),
    btnRoomBack: document.getElementById('btnRoomBack'),
    roomNameInput: document.getElementById('roomNameInput'),
    roomPassInput: document.getElementById('roomPassInput'),
    roomList: document.getElementById('roomList'),
    respawnButton: document.getElementById('respawnButton'),
    btnLeaveRoom: document.getElementById('btnLeaveRoom'),
    btnStartGame: document.getElementById('btnStartGame'),
    btnCancelGame: document.getElementById('btnCancelGame'),
    btnEndGame: document.getElementById('btnEndGame'),
    playersListEl: document.getElementById('playersList'),
    countdownDisplay: document.getElementById('countdownDisplay'),
    passwordModal: document.getElementById('passwordModal'),
    passModalTitle: document.getElementById('passModalTitle'),
    passInput: document.getElementById('passInput'),
    hiddenRoomIdInput: document.getElementById('hiddenRoomIdInput'),
    btnPassConfirm: document.getElementById('btnPassConfirm'),
    btnPassCancel: document.getElementById('btnPassCancel'),
    chatContainer: document.getElementById('chat-container'),
    tabGlobal: document.getElementById('tabGlobal'),
    tabRoom: document.getElementById('tabRoom'),
    chatDisplayGlobal: document.getElementById('chatDisplayGlobal'),
    chatDisplayRoom: document.getElementById('chatDisplayRoom'),
    chatInput: document.getElementById('chatInput'),
    btnSendChat: document.getElementById('btnSendChat'),
    canvas: document.getElementById('c'),
    info: document.getElementById('info'),
    debug: document.getElementById('debug'),
    swordImg: new Image()
};

DOM.swordImg.src = 'sword.png';
DOM.ctx = DOM.canvas.getContext('2d');

export function showStart(){ 
  DOM.startPanel.style.display='block'; 
  DOM.lobbyPanel.style.display='none'; 
  DOM.gameContainer.style.display='none';
  DOM.chatContainer.style.display='none'; 
}
export function showLobby(){ 
  DOM.startPanel.style.display='none'; 
  DOM.lobbyPanel.style.display='block'; 
  DOM.gameContainer.style.display='none';
  DOM.chatContainer.style.display='flex'; 
  DOM.tabRoom.style.display = 'none'; 
  switchChatTab('global'); 
}
export function showGame(){ 
  DOM.startPanel.style.display='none'; 
  DOM.lobbyPanel.style.display='none'; 
  DOM.gameContainer.style.display='flex';
  DOM.chatContainer.style.display='flex'; 
  DOM.tabRoom.style.display = 'block'; 
  switchChatTab('room'); 
}

export function switchChatTab(mode) {
  if (mode === 'global') {
    state.currentChatMode = 'global';
    DOM.tabGlobal.classList.add('active');
    DOM.tabRoom.classList.remove('active');
    DOM.chatDisplayGlobal.style.display = 'block';
    DOM.chatDisplayRoom.style.display = 'none';
  } else if (mode === 'room') {
    state.currentChatMode = 'room';
    DOM.tabGlobal.classList.remove('active');
    DOM.tabRoom.classList.add('active');
    DOM.chatDisplayGlobal.style.display = 'none';
    DOM.chatDisplayRoom.style.display = 'block';
  }
}

export function displayChatMessage(sender, message, type) {
  let displayBox;
  if (type === 'global') displayBox = DOM.chatDisplayGlobal;
  else if (type === 'room') displayBox = DOM.chatDisplayRoom;
  else {
    displayBox = (state.currentChatMode === 'global') ? DOM.chatDisplayGlobal : DOM.chatDisplayRoom;
    if (type === 'system-global') displayBox = DOM.chatDisplayGlobal;
    if (type === 'system-room') displayBox = DOM.chatDisplayRoom;
  }

  if (!displayBox) return;

  const msgEl = document.createElement('div');
  const senderNode = document.createElement('strong');
  const messageNode = document.createTextNode(message);
  
  if (type === 'global') {
    msgEl.className = 'chat-global';
    senderNode.textContent = `[G] ${sender}:`;
  } else if (type === 'room') {
    msgEl.className = 'chat-room';
    senderNode.textContent = `[R] ${sender}:`;
  } else {
    msgEl.className = 'chat-system';
    msgEl.textContent = message;
    displayBox.appendChild(msgEl);
    displayBox.scrollTop = displayBox.scrollHeight;
    return;
  }
  
  msgEl.appendChild(senderNode);
  msgEl.appendChild(document.createTextNode(' ')); 
  msgEl.appendChild(messageNode);
  displayBox.appendChild(msgEl);
  displayBox.scrollTop = displayBox.scrollHeight;
}

export function updatePlayersListUI(players, hostId) {
    if (!DOM.playersListEl) return;
    DOM.playersListEl.innerHTML = '';
    
    players.forEach(player => { 
      const playerEl = document.createElement('div');
      const isMe = player.id === state.myId;
      const isPlayerHost = player.id === hostId;
      const gameData = state.playerMap.get(player.id);
      const color = gameData ? gameData.color : '#FFFFFF';
      const hp = gameData ? gameData.hp : 100;
      const isDead = gameData ? gameData.isDead : false;

      playerEl.innerHTML = `<strong style="color: ${color}">${player.name}</strong> ${isMe ? '(Bạn)' : ''} ${isPlayerHost ? '👑' : ''}`;

      if (state.currentRoomState === 'IN_PROGRESS' && gameData) {
        playerEl.innerHTML += `<div class="hp-bar-container" style="margin-top:4px; width:120px; background:#333; padding:2px; border-radius:4px;">
            <div class="hp-bar" style="height:8px; width:${hp}%; background:${hp > 50 ? '#4CAF50' : hp > 20 ? '#FF9800' : '#F44336'}; border-radius:3px;"></div>
          </div><div style="font-size:12px; opacity:0.9;">HP: ${hp}${isDead ? ' (ĐÃ CHẾT)' : ''}</div>`;
        if (isDead) {
          playerEl.style.opacity = '0.6';
          playerEl.style.background = '#222';
        }
      } else {
        playerEl.innerHTML += `<div class="hp-bar-container" style="margin-top:4px; width:120px; background:#333; padding:2px; border-radius:4px;">
            <div class="hp-bar" style="height:8px; width:100%; background:#4CAF50; border-radius:3px;"></div>
          </div><div style="font-size:12px; opacity:0.9;">HP: 100 (${state.currentRoomState === 'WAITING' ? 'Đang chờ' : 'Sẵn sàng'})</div>`;
      }
      DOM.playersListEl.appendChild(playerEl);
    });
}

export function updateButtonVisibility() {
    DOM.btnStartGame.style.display = state.isHost && state.currentRoomState === 'WAITING' ? 'block' : 'none';
    DOM.btnCancelGame.style.display = state.isHost && state.currentRoomState === 'COUNTDOWN' ? 'block' : 'none';
    DOM.btnEndGame.style.display = state.isHost && state.currentRoomState === 'IN_PROGRESS' ? 'block' : 'none';
    DOM.btnLeaveRoom.style.display = 'block';
    DOM.respawnButton.style.display = state.myIsDead && state.currentRoomState === 'IN_PROGRESS' ? 'block' : 'none';
    if (state.currentRoomState !== 'IN_PROGRESS') DOM.respawnButton.style.display = 'none';
}