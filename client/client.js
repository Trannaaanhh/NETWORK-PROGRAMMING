// client.js
// LOBBY + ROOM client (mới) + P2P gameplay logic (từ code cũ server)

// Panels
const startPanel = document.getElementById('startPanel');
const lobbyPanel = document.getElementById('lobbyPanel');
const createForm = document.getElementById('createForm');
const roomListContainer = document.getElementById('roomListContainer');
const gameContainer = document.getElementById('game-container');

// Start Panel
const playerNameInput = document.getElementById('playerNameInput');
const btnEnter = document.getElementById('btnEnter');
const displayName = document.getElementById('displayName');

// Lobby Panel
const btnCreateRoom = document.getElementById('btnCreateRoom');
const btnJoinRoom = document.getElementById('btnJoinRoom');
const btnCreateConfirm = document.getElementById('btnCreateConfirm');
const btnCreateCancel = document.getElementById('btnCreateCancel');
const btnRoomBack = document.getElementById('btnRoomBack');
const roomNameInput = document.getElementById('roomNameInput');
const roomPassInput = document.getElementById('roomPassInput');
const roomList = document.getElementById('roomList');

// Game Panel
const respawnButton = document.getElementById('respawnButton');
const btnLeaveRoom = document.getElementById('btnLeaveRoom');
const btnStartGame = document.getElementById('btnStartGame');
const btnCancelGame = document.getElementById('btnCancelGame');
const btnEndGame = document.getElementById('btnEndGame');
const playersListEl = document.getElementById('playersList');
const countdownDisplay = document.getElementById('countdownDisplay');

// Password Modal
const passwordModal = document.getElementById('passwordModal');
const passModalTitle = document.getElementById('passModalTitle');
const passInput = document.getElementById('passInput');
const hiddenRoomIdInput = document.getElementById('hiddenRoomIdInput');
const btnPassConfirm = document.getElementById('btnPassConfirm');
const btnPassCancel = document.getElementById('btnPassCancel');

// === UI CHAT MỚI (THEO TAB) ===
const chatContainer = document.getElementById('chat-container');
const tabGlobal = document.getElementById('tabGlobal');
const tabRoom = document.getElementById('tabRoom');
const chatDisplayGlobal = document.getElementById('chatDisplayGlobal');
const chatDisplayRoom = document.getElementById('chatDisplayRoom');
const chatInput = document.getElementById('chatInput');
const btnSendChat = document.getElementById('btnSendChat');
let currentChatMode = 'global'; // 'global' hoặc 'room'
// === KẾT THÚC UI CHAT MỚI ===

let playerName = '';
let rooms = [];
let currentGameWs = null; // Đây sẽ là WebSocket chỉ dùng cho Signaling + Chat

// SỬA LỖI 1: Biến tạm để giữ mật khẩu khi tạo phòng
let tempPasswordForJoin = ''; 

const LOBBY_URL = `ws://${window.location.hostname}:3000/lobby`;
let lobbyWs = null;

// === HÀM CHAT MỚI (SỬA ĐỔI) ===
function displayChatMessage(sender, message, type) {
  let displayBox;
  if (type === 'global') {
    displayBox = chatDisplayGlobal;
  } else if (type === 'room') {
    displayBox = chatDisplayRoom;
  } else {
    // Gửi tin hệ thống cho cả 2
    displayBox = (currentChatMode === 'global') ? chatDisplayGlobal : chatDisplayRoom;
    if (type === 'system-global') displayBox = chatDisplayGlobal;
    if (type === 'system-room') displayBox = chatDisplayRoom;
  }

  if (!displayBox) return;

  const msgEl = document.createElement('div');
  
  // Xử lý HTML-escaping đơn giản để tránh XSS
  const senderNode = document.createElement('strong');
  const messageNode = document.createTextNode(message); // Tin nhắn là text an toàn
  
  if (type === 'global') {
    msgEl.className = 'chat-global';
    senderNode.textContent = `[G] ${sender}:`;
  } else if (type === 'room') {
    msgEl.className = 'chat-room';
    senderNode.textContent = `[R] ${sender}:`;
  } else {
    // Thông báo hệ thống
    msgEl.className = 'chat-system';
    msgEl.textContent = message;
    displayBox.appendChild(msgEl);
    displayBox.scrollTop = displayBox.scrollHeight;
    return;
  }
  
  msgEl.appendChild(senderNode);
  msgEl.appendChild(document.createTextNode(' ')); // Thêm khoảng trắng
  msgEl.appendChild(messageNode);
  
  displayBox.appendChild(msgEl);
  // Tự động cuộn xuống
  displayBox.scrollTop = displayBox.scrollHeight;
}
// === KẾT THÚC HÀM CHAT MỚI ===

// === LOGIC CHUYỂN TAB CHAT ===
function switchChatTab(mode) {
  if (mode === 'global') {
    currentChatMode = 'global';
    tabGlobal.classList.add('active');
    tabRoom.classList.remove('active');
    chatDisplayGlobal.style.display = 'block';
    chatDisplayRoom.style.display = 'none';
  } else if (mode === 'room') {
    currentChatMode = 'room';
    tabGlobal.classList.remove('active');
    tabRoom.classList.add('active');
    chatDisplayGlobal.style.display = 'none';
    chatDisplayRoom.style.display = 'block';
  }
}
tabGlobal.onclick = () => switchChatTab('global');
tabRoom.onclick = () => switchChatTab('room');
// === KẾT THÚC LOGIC TAB ===


function connectLobby() {
  lobbyWs = new WebSocket(LOBBY_URL);

  lobbyWs.onopen = () => {
    console.log("✅ Connected to lobby");
    lobbyWs.send(JSON.stringify({ type: 'get_rooms' }));
    displayChatMessage(null, 'Đã kết nối chat Global.', 'system-global');
  };

  lobbyWs.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      
      // Tách riêng log chat để đỡ nhiễu
      if (data.type !== 'chat_global_msg') {
        console.log("📨 Lobby message:", data.type);
      }
      
      if (data.type === 'rooms_list') {
        rooms = data.rooms || [];
        renderRoomList();
      } else if (data.type === 'created') {
        console.log(`✅ Tạo phòng thành công: ${data.room.name}`);
        // SỬA LỖI 1: Gửi join_request với mật khẩu đã lưu
        lobbyWs.send(JSON.stringify({ 
            type: 'join_request', 
            id: data.room.id, 
            pass: tempPasswordForJoin, // Dùng biến tạm
            player: playerName 
        }));
        tempPasswordForJoin = ''; // Xóa pass sau khi dùng
      } else if (data.type === 'join_ok') {
        console.log(`✅ Join OK, vào room: ${data.room.id}`);
        openRoomWebSocket(data.room.id);
        // Không đóng lobbyWs, giữ nó để chat global
      } else if (data.type === 'error') {
        alert(`❌ Lỗi: ${data.message}`);
      } 
      // === XỬ LÝ NHẬN CHAT GLOBAL ===
      else if (data.type === 'chat_global_msg') {
        displayChatMessage(data.sender, data.message, 'global');
      }
    } catch (e) {
      console.error('❌ Lobby message parse error', e);
    }
  };

  lobbyWs.onclose = () => {
    console.log("🔌 Lobby WS closed, reconnecting...");
    displayChatMessage(null, 'Mất kết nối chat Global. Đang kết nối lại...', 'system-global');
    setTimeout(connectLobby, 1000); // Tăng thời gian chờ 1 chút
  };
  lobbyWs.onerror = (e) => console.error('❌ Lobby WS error', e);
}
connectLobby();

// Quản lý hiển thị các Panel
function showStart(){ 
  startPanel.style.display='block'; 
  lobbyPanel.style.display='none'; 
  gameContainer.style.display='none';
  chatContainer.style.display='none'; // Ẩn chat
}
function showLobby(){ 
  startPanel.style.display='none'; 
  lobbyPanel.style.display='block'; 
  gameContainer.style.display='none';
  chatContainer.style.display='flex'; // Hiện chat
  tabRoom.style.display = 'none'; // Ẩn tab phòng
  switchChatTab('global'); // Chuyển về tab global
}
function showGame(){ 
  startPanel.style.display='none'; 
  lobbyPanel.style.display='none'; 
  gameContainer.style.display='flex';
  chatContainer.style.display='flex'; // Hiện chat
  tabRoom.style.display = 'block'; // Hiện tab phòng
  switchChatTab('room'); // Tự chuyển sang tab phòng
}
showStart();

btnEnter.onclick = () => {
  const name = playerNameInput.value.trim();
  if (!name) return alert("Nhập tên trước!");
  playerName = name;
  displayName.textContent = playerName;
  showLobby();
};

btnLeaveRoom.onclick = () => {
  if (currentGameWs && currentGameWs.readyState === WebSocket.OPEN) {
    currentGameWs.close(); // onclose sẽ tự động showLobby()
  } else {
    showLobby();
  }
};

btnCreateRoom.onclick = () => {
  createForm.style.display = 'block';
  roomListContainer.style.display = 'none';
};
btnCreateCancel.onclick = () => createForm.style.display = 'none';

btnCreateConfirm.onclick = () => {
  const rn = roomNameInput.value.trim();
  const rp = roomPassInput.value.trim();
  if (!rn) return alert("Tên phòng không được để trống!");

  // SỬA LỖI 1: Lưu mật khẩu vào biến tạm
  tempPasswordForJoin = rp; 

  console.log("📤 Gửi create_room:", { name: rn, pass: rp });
  lobbyWs.send(JSON.stringify({ type: 'create_room', name: rn, pass: rp }));
  createForm.style.display = 'none';
  roomListContainer.style.display = 'block';
  roomNameInput.value = '';
  roomPassInput.value = '';
};

btnJoinRoom.onclick = () => {
  lobbyWs.send(JSON.stringify({ type: 'get_rooms' }));
  roomListContainer.style.display = 'block';
};

btnRoomBack.onclick = () => roomListContainer.style.display = 'none';

function renderRoomList() {
  roomList.innerHTML = '';
  if (!rooms || rooms.length === 0) {
    roomList.innerHTML = '<li>Chưa có phòng nào.</li>';
    return;
  }
  rooms.forEach(r => {
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
          passModalTitle.textContent = `Nhập mật khẩu cho phòng: ${r.name}`;
          hiddenRoomIdInput.value = r.id;
          passInput.value = '';
          passwordModal.style.display = 'flex';
          passInput.focus();
        } else {
          console.log(`📤 Gửi join_request cho room: ${r.id}`);
          lobbyWs.send(JSON.stringify({ type: 'join_request', id: r.id, pass: '', player: playerName }));
        }
      };
    }
    roomList.appendChild(li);
  });
}

// Xử lý nút bấm modal mật khẩu
btnPassCancel.onclick = () => {
  passwordModal.style.display = 'none';
};

btnPassConfirm.onclick = () => {
  const pass = passInput.value;
  const id = hiddenRoomIdInput.value;
  console.log(`📤 Gửi join_request với password cho room: ${id}`);
  lobbyWs.send(JSON.stringify({ type: 'join_request', id, pass, player: playerName }));
  passwordModal.style.display = 'none';
};

passInput.onkeydown = (e) => {
  if (e.key === 'Enter') {
    btnPassConfirm.click();
  }
};


// ===== ROOM WS + P2P Gameplay (ĐẠI TU) =====

// Cấu hình WebRTC
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' } // Dùng STUN server của Google
  ]
};

// Hằng số game (Chuyển từ server/room.js)
const ROOM_TICK_RATE = 60;
const ROOM_BROADCAST_RATE = 20;
const WORLD_W = 800, WORLD_H = 600;
const PLAYER_SPEED = 200;
const ORB_RADIUS = 85;
const ORB_SPEED = Math.PI;
const PLAYER_RADIUS = 12;
const SWORD_LENGTH = 150;
const SWORD_WIDTH = 16;
const INTERP_DELAY = 100; // ms
const RESPAWN_TIME = 2; // seconds

// Các hàm logic game (Chuyển từ server/game-logic.js)
function dist(x1, y1, x2, y2) { return Math.hypot(x1 - x2, y1 - y2); }
function lineCircleIntersect(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1, dy = y2 - y1;
  const fx = cx - x1, fy = cy - y1;
  const t = (fx * dx + fy * dy) / (dx * dx + dy * dy);
  const tt = Math.max(0, Math.min(1, t));
  const px = x1 + tt * dx, py = y1 + tt * dy;
  return dist(px, py, cx, cy) <= r;
}
function lineLineIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
  function ccw(ax, ay, bx, by, cx, cy) { return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax); }
  return (ccw(x1, y1, x3, y3, x4, y4) !== ccw(x2, y2, x3, y3, x4, y4)) &&
         (ccw(x1, y1, x2, y2, x3, y3) !== ccw(x1, y1, x2, y2, x4, y4));
}
// KẾT THÚC HÀM LOGIC GAME

function openRoomWebSocket(roomId) {
  if (currentGameWs) {
    try { currentGameWs.close(); } catch (e) {}
  }

  const roomUrl = `ws://${window.location.hostname}:3000/room/${roomId}?name=${encodeURIComponent(playerName)}`;
  console.log(`🔗 Kết nối đến room (Signaling): ${roomUrl}`);
  
  currentGameWs = new WebSocket(roomUrl);
  currentGameWs.binaryType = "arraybuffer";
  
  // Xóa chat phòng cũ, thêm tin nhắn chào mừng phòng
  chatDisplayRoom.innerHTML = '';
  displayChatMessage(null, `Đã vào kênh chat phòng.`, 'system-room');
  switchChatTab('room'); // Tự động chuyển sang chat room

  // Gameplay assets / UI
  const swordImg = new Image();
  swordImg.src = 'sword.png';

  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const info = document.getElementById('info');
  const debug = document.getElementById('debug');
  
  const COLORS = ['#4CAF50','#2196F3','#E91E63','#FF9800','#9C27B0','#00BCD4','#8BC34A','#FFC107'];


  // Trạng thái trong phòng (Nhiều thay đổi)
  let myId = null;
  let isHost = false;
  let currentRoomState = 'WAITING';
  let localPlayerList = [];
  let currentHostId = null;

  // playerMap giờ là "state" của game, chỉ Host mới cập nhật
  let playerMap = new Map(); // Map 'playerId' -> 'player state' (x, y, hp...)

  let historyBuffer = new Map();
  let keys = { up:false, down:false, left:false, right:false };
  // <-- SỬA LẠI (1/5): Xóa logic chuột
  // let mousePos = { x: 0, y: 0 }; 
  let inputSeq = 0;
  let myIsDead = false;
  let ping = 0; // Ping tới Signaling Server
  let lastPingTime = 0;
  let showHitbox = true;

  let inputInterval = null;
  let pingInterval = null;
  let renderFrameId = null;

  // Quản lý P2P
  let peerConnections = new Map(); // Map 'otherPlayerId' -> { pc, dc }
  let nextPlayerColorIndex = 0;

  // Logic game (chỉ chạy ở Host)
  let gameTickInterval = null;
  let gameBroadcastInterval = null;
  let clientInputMap = new Map(); 

  // SỬA LỖI 2: Sửa hàm update UI
  function updatePlayersListUI(players, hostId) {
    if (!playersListEl) return;
    playersListEl.innerHTML = '';
    
    players.forEach(player => { 
      const playerEl = document.createElement('div');
      const isMe = player.id === myId;
      const isPlayerHost = player.id === hostId;

      const gameData = playerMap.get(player.id);
      // Cung cấp giá trị mặc định rõ ràng
      const color = gameData ? gameData.color : '#FFFFFF';
      const hp = gameData ? gameData.hp : 100;
      const isDead = gameData ? gameData.isDead : false;

      playerEl.innerHTML = `
        <strong style="color: ${color}">${player.name}</strong> 
        ${isMe ? '(Bạn)' : ''} 
        ${isPlayerHost ? '👑' : ''}
      `;

      // Tách logic hiển thị HP
      if (currentRoomState === 'IN_PROGRESS' && gameData) {
        // Logic khi đang trong game (dùng gameData)
        playerEl.innerHTML += `
          <div class="hp-bar-container" style="margin-top:4px; width:120px; background:#333; padding:2px; border-radius:4px;">
            <div class="hp-bar" style="height:8px; width:${hp}%; background:${hp > 50 ? '#4CAF50' : hp > 20 ? '#FF9800' : '#F44336'}; border-radius:3px;"></div>
          </div>
          <div style="font-size:12px; opacity:0.9;">HP: ${hp}${isDead ? ' (ĐÃ CHẾT)' : ''}</div>
        `;
        if (isDead) {
          playerEl.style.opacity = '0.6';
          playerEl.style.background = '#222';
        }
      } else if (currentRoomState === 'WAITING') {
        // Logic khi đang ở sảnh chờ (luôn 100 HP)
        playerEl.innerHTML += `
          <div class="hp-bar-container" style="margin-top:4px; width:120px; background:#333; padding:2px; border-radius:4px;">
            <div class="hp-bar" style="height:8px; width:100%; background:#4CAF50; border-radius:3px;"></div>
          </div>
          <div style="font-size:12px; opacity:0.9;">HP: 100 (Đang chờ)</div>
        `;
      }
      // Thêm cả khi COUNTDOWN nếu muốn
      else if (currentRoomState === 'COUNTDOWN') {
        playerEl.innerHTML += `
          <div class="hp-bar-container" style="margin-top:4px; width:120px; background:#333; padding:2px; border-radius:4px;">
            <div class="hp-bar" style="height:8px; width:100%; background:#4CAF50; border-radius:3px;"></div>
          </div>
          <div style="font-size:12px; opacity:0.9;">HP: 100 (Sẵn sàng)</div>
        `;
      }
      playersListEl.appendChild(playerEl);
    });
  }
  
  function updateButtonVisibility() {
    // console.log(`🎯 Update buttons - isHost: ${isHost}, state: ${currentRoomState}, myId: ${myId}, hostId: ${currentHostId}`);
    btnStartGame.style.display = isHost && currentRoomState === 'WAITING' ? 'block' : 'none';
    btnCancelGame.style.display = isHost && currentRoomState === 'COUNTDOWN' ? 'block' : 'none';
    btnEndGame.style.display = isHost && currentRoomState === 'IN_PROGRESS' ? 'block' : 'none';
    
    btnLeaveRoom.style.display = 'block';
    respawnButton.style.display = myIsDead && currentRoomState === 'IN_PROGRESS' ? 'block' : 'none';
    
    if (currentRoomState !== 'IN_PROGRESS') {
      respawnButton.style.display = 'none';
    }
  }

  // <-- SỬA LẠI: (2/5) Hoàn lại buildInputBuffer 6-byte
  function buildInputBuffer(seq, flags) {
    const buf = new ArrayBuffer(1 + 4 + 1); // 6 bytes
    const dv = new DataView(buf);
    dv.setUint8(0, 1); // Type 1: Input
    dv.setUint32(1, seq);
    dv.setUint8(5, flags);
    return buf;
  }

  // Gửi Respawn qua P2P
  function sendRespawnCommand() {
    const buf = new ArrayBuffer(1);
    const dv = new DataView(buf);
    dv.setUint8(0, 3); // Type 3: Respawn

    if (isHost) {
      console.log("[Host] Tự xử lý respawn");
      handleHostInput(myId, dv);
    } else {
      const hostPeer = peerConnections.get(currentHostId);
      if (hostPeer && hostPeer.dc && hostPeer.dc.readyState === 'open') {
        console.log("[Guest] Gửi respawn cho Host");
        hostPeer.dc.send(buf);
      } else {
        console.warn("Không thể gửi respawn: Mất kết nối P2P tới Host.");
      }
    }
  }

  // Gửi command (start/stop) qua WebSocket
  function sendCommand(command) {
    if (currentGameWs && currentGameWs.readyState === WebSocket.OPEN) {
      console.log(`📤 Gửi command đến server (Signaling):`, command);
      currentGameWs.send(JSON.stringify(command));
    } else {
      console.error(`❌ Không thể gửi command - WebSocket (Signaling) không mở:`, command);
    }
  }

  btnStartGame.onclick = () => {
    console.log(`🎮 CLICK: Bắt đầu trận đấu - isHost: ${isHost}, state: ${currentRoomState}`);
    sendCommand({ type: 'start_game' });
  };
  
  btnCancelGame.onclick = () => {
    console.log(`🎮 CLICK: Hủy đếm ngược`);
    sendCommand({ type: 'cancel_countdown' });
  };
  
  btnEndGame.onclick = () => {
    console.log(`🎮 CLICK: Kết thúc trận đấu`);
    sendCommand({ type: 'end_game' });
  };
  
  respawnButton.style.display = 'none';
  respawnButton.onclick = () => {
    if (myIsDead) {
      sendRespawnCommand();
      respawnButton.textContent = 'Đang hồi sinh...';
      respawnButton.disabled = true;
      setTimeout(() => {
        respawnButton.textContent = 'HỒI SINH';
        respawnButton.disabled = false;
      }, 2000); // 2 giây
    }
  };

  // Gửi tin nhắn Báo hiệu qua WebSocket
  function sendSignalingMessage(payload) {
    if (currentGameWs && currentGameWs.readyState === WebSocket.OPEN) {
      currentGameWs.send(JSON.stringify(payload));
    }
  }

  function startHostGameLogic() {
    if (!isHost) return; 

    if (!gameTickInterval) {
      console.log("👑 BẮT ĐẦU CHẠY GAME LOGIC TRÊN MÁY HOST");
    }

    localPlayerList.forEach(p_info => {
      if (!playerMap.has(p_info.id)) { 
        console.log(`[Host] Thêm người chơi mới ${p_info.name} (ID: ${p_info.id}) vào state`);
        const playerState = {
          id: p_info.id,
          name: p_info.name,
          x: Math.random() * (WORLD_W - 50) + 25,
          y: Math.random() * (WORLD_H - 50) + 25,
          vx: 0, vy: 0,
          lastInputSeq: 0,
          orbAngle: Math.random() * Math.PI * 2,
          orbDir: 1, // Hướng xoay ban đầu
          lastClashTime: 0,
          lastAttackTime: 0,
          color: COLORS[nextPlayerColorIndex % COLORS.length],
          colorIndex: nextPlayerColorIndex % COLORS.length,
          hp: 100,
          isDead: false,
          deathTime: 0
        };
        playerMap.set(p_info.id, playerState);
        // <-- SỬA LẠI: (2/5) Khởi tạo input đơn giản
        clientInputMap.set(p_info.id, { flags: 0, seq: 0 }); 
        nextPlayerColorIndex++;
       }
    });
    
    updatePlayersListUI(localPlayerList, currentHostId);

    if (gameTickInterval) return; // Đã chạy rồi

    // Bắt đầu các vòng lặp game
    gameTickInterval = setInterval(() => {
      const dt = 1 / ROOM_TICK_RATE;
      const nowSec = Date.now() / 1000;

      // 1. Cập nhật vận tốc
      for (const [pid, input] of clientInputMap.entries()) {
        const p = playerMap.get(pid);
        if (!p) continue; 
        if (p.isDead && currentRoomState === 'IN_PROGRESS') {
          p.vx = 0; p.vy = 0;
          continue;
        };
        
        p.lastInputSeq = input.seq;
        let vx = 0, vy = 0;
        if (input.flags & 1) vy -= 1; // UP
        if (input.flags & 2) vy += 1; // DOWN
        if (input.flags & 4) vx -= 1; // LEFT
        if (input.flags & 8) vx += 1; // RIGHT
        const len = Math.hypot(vx, vy);
        if (len > 0) {
          p.vx = (vx / len) * PLAYER_SPEED;
          p.vy = (vy / len) * PLAYER_SPEED;
        } else {
          p.vx = 0; p.vy = 0;
        }
      }

      // 2. Cập nhật vị trí VÀ LOGIC TỰ XOAY KIẾM
      for (const p of playerMap.values()) {
        if (p.isDead && currentRoomState === 'IN_PROGRESS') continue;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        // Clamp to world bounds
        if (p.x < PLAYER_RADIUS) p.x = PLAYER_RADIUS;
        if (p.y < PLAYER_RADIUS) p.y = PLAYER_RADIUS;
        if (p.x > WORLD_W - PLAYER_RADIUS) p.x = WORLD_W - PLAYER_RADIUS;
        if (p.y > WORLD_H - PLAYER_RADIUS) p.y = WORLD_H - PLAYER_RADIUS;

        // <-- SỬA LẠI: (3/5) Thêm lại logic tự xoay
        if (currentRoomState === 'IN_PROGRESS') {
          p.orbAngle += ORB_SPEED * dt * p.orbDir;
          if (p.orbAngle > Math.PI * 2) p.orbAngle -= Math.PI * 2;
          if (p.orbAngle < 0) p.orbAngle += Math.PI * 2;
        }
      }

      // <-- THÊM LOG (1/4)
      // console.log(`[Host Tick] State: ${currentRoomState}`);
      
      // Logic va chạm chỉ chạy khi IN_PROGRESS
      if (currentRoomState !== 'IN_PROGRESS') {
        return; 
      }
      
      // <-- THÊM LOG (2/4)
      // console.log(`[Host Tick] Đang chạy logic va chạm...`);

      // 3. Logic va chạm
      for (const p of playerMap.values()) {
        if (p.isDead) continue;
        const swordBaseX = p.x;
        const swordBaseY = p.y;
        const swordTipX = p.x + Math.cos(p.orbAngle) * SWORD_LENGTH;
        const swordTipY = p.y + Math.sin(p.orbAngle) * SWORD_LENGTH;
        for (const q of playerMap.values()) {
          if (q.id === p.id || q.isDead) continue;
         if (lineCircleIntersect(swordBaseX, swordBaseY, swordTipX, swordTipY, q.x, q.y, PLAYER_RADIUS)) {
            if ((nowSec - q.lastAttackTime) > 0.5) { 
              q.hp = Math.max(0, q.hp - 10);
              q.lastAttackTime = nowSec;
              console.log(`[Host] ${p.name} đánh trúng ${q.name}! HP còn: ${q.hp}`);
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
      const playersArr = Array.from(playerMap.values());
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
              p.orbDir *= -1; // Đổi chiều xoay
              q.orbDir *= -1; // Đổi chiều xoay
              p.lastClashTime = nowSec;
              q.lastClashTime = nowSec;
              console.log(`[Host] ${p.name} và ${q.name} chạm kiếm!`);
            }
          }
        }
      }
    }, 1000 / ROOM_TICK_RATE);

   // Logic broadcast (từ server cũ)
    gameBroadcastInterval = setInterval(() => {
      const n = playerMap.size;
      if (n === 0) return;

      const stateByte =
        currentRoomState === 'IN_PROGRESS' ? 1 :
        currentRoomState === 'COUNTDOWN' ? 2 : 0;
      
      // <-- THÊM LOG (3/4)
      // console.log(`[Host Broadcast] Gửi snapshot (State: ${currentRoomState}, Byte: ${stateByte})`);
      
      const buf = new ArrayBuffer(1 + 4 + 1 + 4 + n * 27);
      const dv = new DataView(buf);
      let off = 0;
      dv.setUint8(off, 2); off += 1;
      dv.setUint32(off, Date.now()); off += 4;
      dv.setUint8(off, stateByte); off += 1;
      dv.setUint32(off, n); off += 4;

      for (const p of playerMap.values()) {
        dv.setUint32(off, p.id); off += 4;
        dv.setFloat32(off, p.x); off += 4;
        dv.setFloat32(off, p.y); off += 4;
        dv.setUint32(off, p.lastInputSeq || 0); off += 4;
        const orbX = p.x + Math.cos(p.orbAngle) * ORB_RADIUS;
        const orbY = p.y + Math.sin(p.orbAngle) * ORB_RADIUS;
        dv.setFloat32(off, orbX); off += 4;
        dv.setFloat32(off, orbY); off += 4;
        dv.setUint8(off, p.colorIndex); off += 1;
        dv.setUint8(off, p.hp); off += 1;
        dv.setUint8(off, p.isDead ? 1 : 0); off += 1;
      }

      // Tự "nhận" snapshot cho chính mình (Host)
      handleGameSnapshot(buf);

      // Gửi cho tất cả Guest qua P2P
      peerConnections.forEach((peer, guestId) => {
        if (playerMap.has(guestId) && peer.dc && peer.dc.readyState === 'open') {
          try { peer.dc.send(buf); } catch (e) { console.error(`Lỗi gửi snapshot P2P tới ${guestId}:`, e); }
        }
      });
    }, 1000 / ROOM_BROADCAST_RATE);
  }
  
  // Dừng logic game (khi Host rời)
  function stopHostGameLogic() {
    console.log("👑 DỪNG CHẠY GAME LOGIC TRÊN MÁY HOST");
    if (gameTickInterval) clearInterval(gameTickInterval);
    if (gameBroadcastInterval) clearInterval(gameBroadcastInterval);
    gameTickInterval = null;
    gameBroadcastInterval = null;
  }
  
  // <-- SỬA LẠI: (4/5) Hoàn lại handleHostInput
  function handleHostInput(playerId, dv) {
    if (!isHost) return; 
    
    const t = dv.getUint8(0);
    const p = playerMap.get(playerId);
    if (!p) return;

    if (t === 1) { // Input
      if (p.isDead && currentRoomState === 'IN_PROGRESS') return;
      const seq = dv.getUint32(1);
      const flags = dv.getUint8(5);
      
      // <-- THÊM LOG (4/4)
      // Chỉ log khi cờ thay đổi để đỡ spam
      const oldFlags = (clientInputMap.get(playerId) || {}).flags || 0;
      if (flags !== oldFlags) {
        console.log(`[Host] Nhận input (flags: ${flags}) từ ${p.name}`);
      }
      
      // Chỉ lưu flags và seq
      clientInputMap.set(playerId, { flags, seq }); 
    } else if (t === 3) { // Respawn
      const nowSec = Date.now() / 1000;
      if (p.isDead && (nowSec - p.deathTime) >= RESPAWN_TIME) {
        p.hp = 100;
        p.isDead = false;
        p.x = Math.random() * (WORLD_W - 50) + 25;
        p.y = Math.random() * (WORLD_H - 50) + 25;
        console.log(`[Host] Hồi sinh cho ${p.name}`);
      }
    }
  }

  // Xử lý Snapshot (tách ra từ onmessage)
  function handleGameSnapshot(data) {
    try {
      const dv = new DataView(data);
      const t = dv.getUint8(0);
      if (t !== 2) return; 

      const tick = dv.getUint32(1);
      const stateByte = dv.getUint8(5);
      
      // Cập nhật trạng thái game (RẤT QUAN TRỌNG)
      const newState = stateByte === 0 ? 'WAITING' : stateByte === 1 ? 'IN_PROGRESS' : 'COUNTDOWN';
      if (currentRoomState !== newState) {
        console.log(`[Client ${myId}] Chuyển trạng thái: ${currentRoomState} -> ${newState}`);
        currentRoomState = newState;
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
        const color = COLORS[colorIndex] || '#ffffff';
        
        const playerData = { x, y, orbX, orbY, lastInputSeq: lastAck, color, hp, isDead: isDead === 1, colorIndex };
        snapshot.players.set(id, playerData); 
        
        const p_info = localPlayerList.find(p => p.id === id);
        const p_old_state = playerMap.get(id) || {}; // <--- LẤY STATE CŨ (quan trọng)

        if (p_info) {
          // SỬA: Phải ...p_old_state
          newPlayerMap.set(id, { ...p_old_state, ...playerData, ...p_info });
        } else {
          // SỬA: Phải ...p_old_state
          newPlayerMap.set(id, { ...p_old_state, ...playerData, name: p_old_state.name || 'Loading...' });
   }

        if (id === myId) {
          const wasDead = myIsDead;
          myIsDead = isDead === 1;
          if (myIsDead && !wasDead) {
            respawnButton.style.display = 'block';
          } else if (!myIsDead) {
            respawnButton.style.display = 'none';
          }
        }
      }
      
      playerMap = newPlayerMap; // Cập nhật state chính
      
      // Chỉ Guest mới cần update UI ở đây (Host tự update trong loop)
      if (!isHost) {
        updatePlayersListUI(localPlayerList, currentHostId);
       updateButtonVisibility();
      }

      historyBuffer.set(snapshot.time, snapshot);
      for (const [t0] of historyBuffer) {
        if (snapshot.time - t0 > 2000) historyBuffer.delete(t0);
      }
    } catch (e) {
      console.error('❌ Error parsing game snapshot (binary)', e);
    }
  }

  // Tạo và quản lý một kết nối P2P
  async function createPeerConnection(targetPlayerId, isInitiator) {
    console.log(`[P2P] Tạo kết nối tới ${targetPlayerId} (Initiator: ${isInitiator})`);
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnections.set(targetPlayerId, { pc, dc: null });

    // Xử lý candidate
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignalingMessage({
          type: 'webrtc_candidate',
          targetId: targetPlayerId,
          candidate: event.candidate
        });
      }
    };

    // (Phần 3: Voice chat sẽ thêm ontrack ở đây)

    const setupDataChannel = (dc) => {
      console.log(`[P2P] Data Channel tới ${targetPlayerId} đã mở!`);
      peerConnections.get(targetPlayerId).dc = dc;
      dc.binaryType = 'arraybuffer';

      dc.onmessage = (event) => {
        const dv = new DataView(event.data);
        const type = dv.getUint8(0);
        
        // console.log(`[P2P] Nhận data type ${type} từ ${targetPlayerId}`);

        if (isHost) {
          // Host nhận input (t=1) hoặc respawn (t=3) từ Guest
          handleHostInput(targetPlayerId, dv);
        } else {
          // Guest nhận snapshot (t=2) từ Host
          if (type === 2) {
            handleGameSnapshot(event.data);
          }
        }
      };
      dc.onclose = () => {
        console.log(`[P2P] Data Channel tới ${targetPlayerId} đã đóng.`);
   };
      dc.onerror = (e) => {
        console.error(`[P2P] Data Channel tới ${targetPlayerId} lỗi:`, e);
      };
    };

    if (isInitiator) {
      // Guest là người chủ động (initiator)
      const dc = pc.createDataChannel('gameData');
      setupDataChannel(dc);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignalingMessage({
        type: 'webrtc_offer',
        offer: offer
      });
    } else {
      // Host là người nhận
      pc.ondatachannel = (event) => {
        setupDataChannel(event.channel);
      };
    }
  }

  // --- Kết nối WebSocket (Signaling) ---
  currentGameWs.onopen = () => {
    console.log(`✅ Joined room (Signaling) ${roomId}`);
    showGame();
    updateButtonVisibility();
  };

  currentGameWs.onmessage = (ev) => {
    // 1. XỬ LÝ JSON (Signaling, Chat, Lobby)
    if (typeof ev.data === 'string') {
      try {
        const msg = JSON.parse(ev.data);
        
        if (msg.type !== 'chat_room_msg' && !msg.type.startsWith('webrtc_')) {
          console.log(`📨 Nhận JSON từ server (Signaling):`, msg.type);
        }
        
        if (msg.type === 'lobby_update') {
          const oldPlayerList = new Map(localPlayerList.map(p => [p.id, p]));
          localPlayerList = msg.players;
          currentHostId = msg.hostId;
          
          if (myId !== null) {
            const wasHost = isHost;
            isHost = (currentHostId === myId);
            console.log(`👑 Host check - myId: ${myId}, hostId: ${currentHostId}, isHost: ${isHost}`);
            
            // Cập nhật logic game (nếu host thay đổi)
            if (isHost && !wasHost) {
              startHostGameLogic();
            } else if (!isHost && wasHost) {
              stopHostGameLogic();
            }

            if (isHost) {
              startHostGameLogic();
            }
          }
          
          // Cập nhật P2P Connections
          const newPlayerMap = new Map(localPlayerList.map(p => [p.id, p]));
          // - Người mới vào:
          localPlayerList.forEach(p => {
            if (p.id !== myId && !oldPlayerList.has(p.id) && !peerConnections.has(p.id)) {
              console.log(`[P2P] Phát hiện người mới: ${p.name}`);
              if (!isHost) {
                if (p.id === currentHostId) {
                  console.log(`[P2P] Guest kết nối tới Host...`);
                  createPeerConnection(p.id, true); // Guest là initiator
                }
              }
            }
          });
          // - Người vừa rời:
          oldPlayerList.forEach((p, id) => {
            if (id !== myId && !newPlayerMap.has(id) && peerConnections.has(id)) {
              console.log(`[P2P] Dọn dẹp kết nối của: ${p.name}`);
              peerConnections.get(id).pc.close();
              peerConnections.delete(id);
           if (isHost) {
                playerMap.delete(id);
                clientInputMap.delete(id);
              }
            }
          });
          
          updatePlayersListUI(localPlayerList, currentHostId);
       updateButtonVisibility();
        } 
        // <-- SỬA LỖI 3 (1/3): Cập nhật state ngay lập tức
        else if (msg.type === 'game_start') {
          currentRoomState = 'IN_PROGRESS';
          console.log(`🎯 Game started! State set to IN_PROGRESS`);
          updateButtonVisibility();
          countdownDisplay.style.display = 'none';
          historyBuffer.clear();
          if (isHost) {
            stopHostGameLogic();
            playerMap.clear(); 
            clientInputMap.clear(); 
            nextPlayerColorIndex = 0; 
            startHostGameLogic(); 
          }
        } 
        // <-- SỬA LỖI 3 (2/3): Cập nhật state ngay lập tức
        else if (msg.type === 'game_end') {
          currentRoomState = 'WAITING';
          myIsDead = false;
          console.log(`🏁 Game ended. State set to WAITING`);
          updateButtonVisibility();
          historyBuffer.clear();
          if (isHost) {
            stopHostGameLogic();
            playerMap.clear();
            clientInputMap.clear();
            nextPlayerColorIndex = 0;
       startHostGameLogic(); 
         }
        }
        // <-- SỬA LỖI 3 (3/3): Cập nhật state ngay lập tức
        else if (msg.type === 'countdown') {
          currentRoomState = 'COUNTDOWN';
          countdownDisplay.textContent = msg.seconds;
          countdownDisplay.style.display = msg.seconds > 0 ? 'block' : 'none';
          console.log(`⏰ Countdown: ${msg.seconds}. State set to COUNTDOWN`);
          updateButtonVisibility();
          
          if (msg.seconds <= 0) {
            setTimeout(() => {
              countdownDisplay.style.display = 'none';
            }, 1000);
          }
        }
        else if (msg.type === 'error') {
          console.error(`❌ Server error: ${msg.message}`);
          alert(msg.message);
          currentGameWs.close(); // Tự động thoát
       }
        else if (msg.type === 'chat_room_msg') {
          displayChatMessage(msg.sender, msg.message, 'room');
        }

        // === XỬ LÝ TIN NHẮN SIGNALING MỚI ===
        else if (msg.type === 'webrtc_offer') {
          // Chỉ Host mới nhận
          console.log(`[P2P] Nhận offer từ ${msg.senderId}`);
          (async () => {
            try {
              await createPeerConnection(msg.senderId, false); // Host không phải initiator
              const peer = peerConnections.get(msg.senderId);
              await peer.pc.setRemoteDescription(new RTCSessionDescription(msg.offer));
              const answer = await peer.pc.createAnswer();
              await peer.pc.setLocalDescription(answer);
              sendSignalingMessage({
                type: 'webrtc_answer',
                targetId: msg.senderId,
               answer: answer
              });
            } catch(e) { console.error(`[P2P] Lỗi xử lý offer:`, e); }
          })();
        }
        else if (msg.type === 'webrtc_answer') {
          // Chỉ Guest mới nhận
          console.log(`[P2P] Nhận answer từ ${msg.senderId} (Host)`);
       (async () => {
            try {
              const peer = peerConnections.get(msg.senderId);
              if (peer) {
                await peer.pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
              }
            } catch(e) { console.error(`[P2P] Lỗi xử lý answer:`, e); }
          })();
        }
        else if (msg.type === 'webrtc_candidate') {
          // Cả hai đều nhận
          // console.log(`[P2P] Nhận candidate từ ${msg.senderId}`);
    (async () => {
            try {
              const peer = peerConnections.get(msg.senderId);
              if (peer && msg.candidate) {
                await peer.pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
              }
            } catch (e) { console.error(`[P2P] Lỗi thêm candidate:`, e); }
          })();
        }

      } catch (e) {
     console.error('❌ Error parsing JSON message', e);
      }
      return;
    }

    // 2. XỬ LÝ BINARY (Welcome, Pong)
    try {
      const dv = new DataView(ev.data);
      const t = dv.getUint8(0);

      if (t === 0) { // Welcome packet
        myId = dv.getUint32(1);
        console.log(`🎉 Welcome! myId = ${myId}`);
        
        // Cập nhật lại isHost (quan trọng)
        if (currentHostId !== null) {
          isHost = (currentHostId === myId);
         console.log(`👑 Host status updated - isHost: ${isHost}`);
          updateButtonVisibility();
          if (isHost) {
            // Khởi động logic game ở trạng thái chờ
           startHostGameLogic();
          }
        }
        // Cập nhật lại UI list
        updatePlayersListUI(localPlayerList, currentHostId);
      } 
      else if (t === 5) { // pong
        ping = Math.round(performance.now() - lastPingTime);
   }
    } catch (e) {
      console.error('❌ Error parsing WS message (binary)', e);
    }
  };

  currentGameWs.onclose = () => {
    console.log('🔌 Room WS (Signaling) closed, returning to lobby');
   showLobby();
    myId = null;
    isHost = false;
    historyBuffer.clear();
    playerMap.clear();
    localPlayerList = [];
    currentHostId = null;
   respawnButton.style.display = 'none';
    currentGameWs = null;
    
    // Dọn dẹp P2P
    peerConnections.forEach(peer => peer.pc.close());
    peerConnections.clear();
    
    // Dọn dẹp logic game
    stopHostGameLogic();
    
    chatDisplayRoom.innerHTML = '';
    
    if (inputInterval) clearInterval(inputInterval);
   if (pingInterval) clearInterval(pingInterval);
    if (renderFrameId) cancelAnimationFrame(renderFrameId);
  };

  currentGameWs.onerror = (e) => {
    console.error('❌ Room WS (Signaling) error', e);
  };

  // Input handling + sending (60Hz)
  window.addEventListener('keydown', (e) => {
    if (passwordModal.style.display === 'flex' || document.activeElement === chatInput) return;
   if (myIsDead && currentRoomState === 'IN_PROGRESS') return;
    if (['ArrowUp','KeyW'].includes(e.code)) keys.up=true;
    if (['ArrowDown','KeyS'].includes(e.code)) keys.down=true;
    if (['ArrowLeft','KeyA'].includes(e.code)) keys.left=true;
    if (['ArrowRight','KeyD'].includes(e.code)) keys.right=true;
   if (e.code === "KeyH") showHitbox = !showHitbox;
  });
  window.addEventListener('keyup', (e) => {
    if (passwordModal.style.display === 'flex' || document.activeElement === chatInput) return;
    if (['ArrowUp','KeyW'].includes(e.code)) keys.up=false;
    if (['ArrowDown','KeyS'].includes(e.code)) keys.down=false;
    if (['ArrowLeft','KeyA'].includes(e.code)) keys.left=false;
    if (['ArrowRight','KeyD'].includes(e.code)) keys.right=false;
  });

  // <-- SỬA LẠI: (5/5) Xóa listener cho chuột
  // canvas.addEventListener('mousemove', (e) => {
 //   const rect = canvas.getBoundingClientRect();
  //   mousePos.x = e.clientX - rect.left;
  //   mousePos.y = e.clientY - rect.top;
  // });

  // inputInterval
  inputInterval = setInterval(() => {
    if (!myId || (myIsDead && currentRoomState === 'IN_PROGRESS')) return;

    inputSeq++;
    let flags = 0;
    if (keys.up) flags |= 1;
    if (keys.down) flags |= 2;
    if (keys.left) flags |= 4;
    if (keys.right) flags |= 8;

   // SỬA LẠI: Chỉ gửi input phím
    const inputBuffer = buildInputBuffer(inputSeq, flags);

    if (isHost) {
      // Host tự xử lý input của mình
      handleHostInput(myId, new DataView(inputBuffer));
    } else {
      // Guest gửi input cho Host qua P2P
      const hostPeer = peerConnections.get(currentHostId);
      if (hostPeer && hostPeer.dc && hostPeer.dc.readyState === 'open') {
        // if (flags > 0) console.log(`[Guest] Gửi input flags: ${flags}`);
        hostPeer.dc.send(inputBuffer);
      }
    }
  }, 1000 / 60);

  // pingInterval (vẫn ping server)
  pingInterval = setInterval(() => {
    if (currentGameWs && currentGameWs.readyState === WebSocket.OPEN) {
      lastPingTime = performance.now();
      const buf = new ArrayBuffer(1);
       const dv = new DataView(buf);
     dv.setUint8(0, 4); // Type 4: Ping
      currentGameWs.send(buf);
    }
  }, 1000);

  function render() {
    if (!currentGameWs) return; // Dùng cờ hiệu của WS
    
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle='#444';
    ctx.strokeRect(0,0,canvas.width,canvas.height);

    const renderTime = performance.now() - INTERP_DELAY;
    let earlier = null, later = null;
    for (const [t, snap] of historyBuffer) {
      if (t <= renderTime) earlier = snap;
      if (t > renderTime) { later = snap; break; }
    }

    if (!earlier) {
      // Render state cuối cùng nếu không có history
      for(const [id, p] of playerMap.entries()) {
     if (p.isDead && currentRoomState === 'IN_PROGRESS') continue;
        const orbX = p.orbX !== undefined ? p.orbX : p.x + Math.cos(p.orbAngle || 0) * ORB_RADIUS;
       const orbY = p.orbY !== undefined ? p.orbY : p.y + Math.sin(p.orbAngle || 0) * ORB_RADIUS;
        drawPlayer(p.x, p.y, orbX, orbY, p.color, p.hp);
      }
      renderFrameId = requestAnimationFrame(render);
      return;
    }
    
    if (!later) later = earlier;

    const ratio = (later.time === earlier.time) ? 0 : (renderTime - earlier.time) / (later.time - earlier.time);

   for (const [id, ep] of earlier.players) {
      const lp = later.players.get(id);
      if (!lp) continue; // Người chơi không có trong snapshot sau
      if (ep.isDead && currentRoomState === 'IN_PROGRESS') continue;
      
      const x = ep.x + (lp.x - ep.x) * ratio;
       const y = ep.y + (lp.y - ep.y) * ratio;
      const orbX = ep.orbX + (lp.orbX - ep.orbX) * ratio;
      const orbY = ep.orbY + (lp.orbY - ep.orbY) * ratio;
      const color = ep.color;
      const hp = (currentRoomState === 'WAITING') ? 100 : (ep.hp + (lp.hp - ep.hp) * ratio);

      drawPlayer(x, y, orbX, orbY, color, hp);
    }

    info.textContent = `Players: ${playerMap.size} | State: ${currentRoomState}`;
    debug.textContent = `Ping (Server): ${ping} ms | Hitbox: ${showHitbox ? "ON" : "OFF"}`;
   renderFrameId = requestAnimationFrame(render);
  }
  
  function drawPlayer(x, y, orbX, orbY, color, hp) {
    // Player body
    ctx.beginPath();
    ctx.arc(x, y, PLAYER_RADIUS, 0, Math.PI*2);
   ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'lime';
    ctx.lineWidth = 2;
    ctx.stroke();

    // HP bar
    if (currentRoomState === 'IN_PROGRESS' || currentRoomState === 'WAITING' || currentRoomState === 'COUNTDOWN') {
      const barWidth = 30;
      ctx.fillStyle = 'red';
      ctx.fillRect(x - barWidth/2, y - PLAYER_RADIUS - 8, barWidth, 4);
      ctx.fillStyle = 'green';
      ctx.fillRect(x - barWidth/2, y - PLAYER_RADIUS - 8, (hp/100) * barWidth, 4);
    }

    // Sword (Chỉ vẽ khi IN_PROGRESS)
    if (currentRoomState === 'IN_PROGRESS') {
      ctx.save();
      ctx.translate(x, y);
      const angle = Math.atan2(orbY - y, orbX - x);
     ctx.rotate(angle);

      if (swordImg.complete) {
        ctx.drawImage(swordImg, 0, -SWORD_WIDTH/2, SWORD_LENGTH, SWORD_WIDTH);
      } else {
        ctx.fillStyle = '#ccc';
        ctx.fillRect(0, -SWORD_WIDTH/2, SWORD_LENGTH, SWORD_WIDTH);
      }

      if (showHitbox) {
        ctx.strokeStyle = "red";
        ctx.lineWidth = 2;
       ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(SWORD_LENGTH, 0);
        ctx.stroke();
      }
      ctx.restore();
    } // <-- XÓA CHỮ 's' BỊ LỖI Ở ĐÂY

   if (showHitbox) {
      ctx.beginPath();
      ctx.arc(orbX, orbY, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'yellow';
      ctx.fill();
    }
  }

  renderFrameId = requestAnimationFrame(render);
}


// === LOGIC GỬI CHAT MỚI (THEO TAB) ===
function sendChatMessage() {
   const message = chatInput.value.trim();
  if (!message) return;

  const mode = currentChatMode; // Lấy từ biến toàn cục

  if (mode === 'global') {
    if (lobbyWs && lobbyWs.readyState === WebSocket.OPEN) {
      lobbyWs.send(JSON.stringify({
        type: 'chat_global',
        message: message,
        player: playerName // Gửi tên của mình
    }));
    } else {
      displayChatMessage(null, 'Lỗi: Mất kết nối chat Global.', 'system-global');
    }
  } 
  else if (mode === 'room') {
    // Chat phòng vẫn gửi qua WebSocket (Signaling server)
    if (currentGameWs && currentGameWs.readyState === WebSocket.OPEN) {
      currentGameWs.send(JSON.stringify({
        type: 'chat_room',
        message: message
       // Server sẽ tự biết mình là ai qua kết nối ws
      }));
    } else {
      displayChatMessage(null, 'Lỗi: Bạn không ở trong phòng để chat.', 'system-room');
    }
  }

  chatInput.value = ''; // Xóa text sau khi gửi
  chatInput.focus();
}

btnSendChat.onclick = sendChatMessage;

chatInput.onkeydown = (e) => {
  if (e.key === 'Enter') {
    // Ngăn không cho Enter xuống dòng (nếu là textarea)
    e.preventDefault(); 
    sendChatMessage();
  }
};
// === KẾT THÚC LOGIC GỬI CHAT MỚI ===