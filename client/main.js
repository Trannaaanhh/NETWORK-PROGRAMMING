import { state } from './state.js';
import { DOM, showStart, showLobby, switchChatTab } from './ui.js';
import { connectLobby } from './lobby.js';
import { sendChatMessage } from './chat.js';
import { sendCommand, sendRespawnCommand } from './room.js';


DOM.btnEnter.onclick = () => {
  const name = DOM.playerNameInput.value.trim();
  if (!name) return alert("Nhập tên trước!");
  state.playerName = name;
  DOM.displayName.textContent = state.playerName;
  showLobby();
};

DOM.btnLeaveRoom.onclick = () => {
  if (state.currentGameWs && state.currentGameWs.readyState === WebSocket.OPEN) {
    state.currentGameWs.close(); 
  } else {
    showLobby();
  }
};

DOM.btnCreateRoom.onclick = () => { DOM.createForm.style.display = 'block'; DOM.roomListContainer.style.display = 'none'; };
DOM.btnCreateCancel.onclick = () => DOM.createForm.style.display = 'none';

DOM.btnCreateConfirm.onclick = () => {
  const rn = DOM.roomNameInput.value.trim();
  const rp = DOM.roomPassInput.value.trim();
  if (!rn) return alert("Tên phòng không được để trống!");
  state.tempPasswordForJoin = rp; 
  console.log("📤 Gửi create_room:", { name: rn, pass: rp });
  state.lobbyWs.send(JSON.stringify({ type: 'create_room', name: rn, pass: rp }));
  DOM.createForm.style.display = 'none';
  DOM.roomListContainer.style.display = 'block';
  DOM.roomNameInput.value = '';
  DOM.roomPassInput.value = '';
};

DOM.btnJoinRoom.onclick = () => { state.lobbyWs.send(JSON.stringify({ type: 'get_rooms' })); DOM.roomListContainer.style.display = 'block'; };
DOM.btnRoomBack.onclick = () => DOM.roomListContainer.style.display = 'none';

DOM.btnPassCancel.onclick = () => { DOM.passwordModal.style.display = 'none'; };
DOM.btnPassConfirm.onclick = () => {
  const pass = DOM.passInput.value;
  const id = DOM.hiddenRoomIdInput.value;
  console.log(`📤 Gửi join_request với password cho room: ${id}`);
  state.lobbyWs.send(JSON.stringify({ type: 'join_request', id, pass, player: state.playerName }));
  DOM.passwordModal.style.display = 'none';
};
DOM.passInput.onkeydown = (e) => { if (e.key === 'Enter') DOM.btnPassConfirm.click(); };

DOM.btnStartGame.onclick = () => { console.log(`🎮 CLICK: Bắt đầu trận đấu`); sendCommand({ type: 'start_game' }); };
DOM.btnCancelGame.onclick = () => { console.log(`🎮 CLICK: Hủy đếm ngược`); sendCommand({ type: 'cancel_countdown' }); };
DOM.btnEndGame.onclick = () => { console.log(`🎮 CLICK: Kết thúc trận đấu`); sendCommand({ type: 'end_game' }); };

DOM.respawnButton.style.display = 'none';
DOM.respawnButton.onclick = () => {
  if (state.myIsDead) {
    sendRespawnCommand();
    DOM.respawnButton.textContent = 'Đang hồi sinh...';
    DOM.respawnButton.disabled = true;
    setTimeout(() => { DOM.respawnButton.textContent = 'HỒI SINH'; DOM.respawnButton.disabled = false; }, 2000);
  }
};

DOM.tabGlobal.onclick = () => switchChatTab('global');
DOM.tabRoom.onclick = () => switchChatTab('room');
DOM.btnSendChat.onclick = sendChatMessage;
DOM.chatInput.onkeydown = (e) => {
  if (e.key === 'Enter') { e.preventDefault(); sendChatMessage(); }
};

window.addEventListener('keydown', (e) => {
  if (DOM.passwordModal.style.display === 'flex' || document.activeElement === DOM.chatInput) return;
  if (state.myIsDead && state.currentRoomState === 'IN_PROGRESS') return;
  if (['ArrowUp','KeyW'].includes(e.code)) state.keys.up=true;
  if (['ArrowDown','KeyS'].includes(e.code)) state.keys.down=true;
  if (['ArrowLeft','KeyA'].includes(e.code)) state.keys.left=true;
  if (['ArrowRight','KeyD'].includes(e.code)) state.keys.right=true;
  if (e.code === "KeyH") state.showHitbox = !state.showHitbox;
});
window.addEventListener('keyup', (e) => {
  if (DOM.passwordModal.style.display === 'flex' || document.activeElement === DOM.chatInput) return;
  if (['ArrowUp','KeyW'].includes(e.code)) state.keys.up=false;
  if (['ArrowDown','KeyS'].includes(e.code)) state.keys.down=false;
  if (['ArrowLeft','KeyA'].includes(e.code)) state.keys.left=false;
  if (['ArrowRight','KeyD'].includes(e.code)) state.keys.right=false;
});

showStart();
connectLobby();