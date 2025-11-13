import { state } from './state.js';
import { CONSTANTS } from './constants.js';
import { DOM, displayChatMessage, showLobby } from './ui.js';
import { openRoomWebSocket } from './room.js';

export function connectLobby() {
    state.lobbyWs = new WebSocket(CONSTANTS.LOBBY_URL);
  
    state.lobbyWs.onopen = () => {
      console.log("✅ Connected to lobby");
      state.lobbyWs.send(JSON.stringify({ type: 'get_rooms' }));
      displayChatMessage(null, 'Đã kết nối chat Global.', 'system-global');
    };
  
    state.lobbyWs.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type !== 'chat_global_msg') console.log("📨 Lobby message:", data.type);
        
        if (data.type === 'rooms_list') {
          state.rooms = data.rooms || [];
          renderRoomList();
        } else if (data.type === 'created') {
          console.log(`✅ Tạo phòng thành công: ${data.room.name}`);
          state.lobbyWs.send(JSON.stringify({ 
              type: 'join_request', id: data.room.id, pass: state.tempPasswordForJoin, player: state.playerName 
          }));
          state.tempPasswordForJoin = ''; 
        } else if (data.type === 'join_ok') {
          console.log(`✅ Join OK, vào room: ${data.room.id}`);
          openRoomWebSocket(data.room.id);
        } else if (data.type === 'error') {
          alert(`❌ Lỗi: ${data.message}`);
        } else if (data.type === 'chat_global_msg') {
          displayChatMessage(data.sender, data.message, 'global');
        }
      } catch (e) { console.error('❌ Lobby message parse error', e); }
    };
  
    state.lobbyWs.onclose = () => {
      console.log("🔌 Lobby WS closed, reconnecting...");
      displayChatMessage(null, 'Mất kết nối chat Global. Đang kết nối lại...', 'system-global');
      setTimeout(connectLobby, 1000); 
    };
    state.lobbyWs.onerror = (e) => console.error('❌ Lobby WS error', e);
}

function renderRoomList() {
    DOM.roomList.innerHTML = '';
    if (!state.rooms || state.rooms.length === 0) {
      DOM.roomList.innerHTML = '<li>Chưa có phòng nào.</li>';
      return;
    }
    state.rooms.forEach(r => {
      const li = document.createElement('li');
      let stateText = '';
      if (r.state === 'IN_PROGRESS') stateText = '🔴 ĐANG DIỄN RA';
      else if (r.state === 'COUNTDOWN') stateText = '🟡 CHUẨN BỊ';
      else stateText = '🟢 ĐANG CHỜ';
      
      li.textContent = `${r.name} ${r.hasPass ? '🔒' : ''} (${r.count}/?) - ${stateText}`;
      
      if (r.state === 'IN_PROGRESS') {
        li.classList.add('in-progress');
        li.onclick = () => alert('Trận đấu đang diễn ra! Không thể tham gia.');
      } else if (r.state === 'COUNTDOWN') {
        li.classList.add('countdown');
        li.onclick = () => alert('Trận đấu sắp bắt đầu! Không thể tham gia.');
      } else {
        li.style.cursor = 'pointer';
        li.onclick = () => {
          if (r.hasPass) {
            DOM.passModalTitle.textContent = `Nhập mật khẩu cho phòng: ${r.name}`;
            DOM.hiddenRoomIdInput.value = r.id;
            DOM.passInput.value = '';
            DOM.passwordModal.style.display = 'flex';
            DOM.passInput.focus();
          } else {
            console.log(`📤 Gửi join_request cho room: ${r.id}`);
            state.lobbyWs.send(JSON.stringify({ type: 'join_request', id: r.id, pass: '', player: state.playerName }));
          }
        };
      }
      DOM.roomList.appendChild(li);
    });
}