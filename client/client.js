// client.js
// LOBBY + ROOM client (mới) + gameplay logic (từ code cũ)

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
let currentGameWs = null;

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
        lobbyWs.send(JSON.stringify({ type: 'join_request', id: data.room.id, pass: '', player: playerName }));
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

// ===== ROOM WS + Gameplay (merged) =====
function openRoomWebSocket(roomId) {
  if (currentGameWs) {
    try { currentGameWs.close(); } catch (e) {}
  }

  const roomUrl = `ws://${window.location.hostname}:3000/room/${roomId}?name=${encodeURIComponent(playerName)}`;
  console.log(`🔗 Kết nối đến room: ${roomUrl}`);
  
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

  // gameplay constants (match server)
  const PLAYER_SPEED = 200;
  const PLAYER_RADIUS = 12;
  const SWORD_LENGTH = 150;
  const SWORD_WIDTH = 16;
  const INTERP_DELAY = 100; // ms

  // Trạng thái trong phòng
  let myId = null;
  let isHost = false;
  let currentRoomState = 'WAITING';
  let playerMap = new Map();
  
  let localPlayerList = [];
  let currentHostId = null;

  let historyBuffer = new Map();
  let keys = { up:false, down:false, left:false, right:false };
  let inputSeq = 0;
  let myIsDead = false;
  let ping = 0;
  let lastPingTime = 0;
  let showHitbox = true;

  let inputInterval = null;
  let pingInterval = null;
  let renderFrameId = null;

  function updatePlayersListUI(players, hostId) {
    if (!playersListEl) return;
    playersListEl.innerHTML = '';
    
    players.forEach(player => {
      const playerEl = document.createElement('div');
      const isMe = player.id === myId;
      const isPlayerHost = player.id === hostId;

      const gameData = playerMap.get(player.id) || { hp: 100, isDead: false, color: '#fff' };

      playerEl.innerHTML = `
        <strong style="color: ${gameData.color}">${player.name}</strong> 
        ${isMe ? '(Bạn)' : ''} 
        ${isPlayerHost ? '👑' : ''}
      `;

      if (currentRoomState === 'IN_PROGRESS') {
        const isDead = gameData.isDead;
        const hp = gameData.hp;
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
      }
      playersListEl.appendChild(playerEl);
    });
  }
  
  function updateButtonVisibility() {
    console.log(`🎯 Update buttons - isHost: ${isHost}, state: ${currentRoomState}, myId: ${myId}, hostId: ${currentHostId}`);
    
    btnStartGame.style.display = isHost && currentRoomState === 'WAITING' ? 'block' : 'none';
    btnCancelGame.style.display = isHost && currentRoomState === 'COUNTDOWN' ? 'block' : 'none';
    btnEndGame.style.display = isHost && currentRoomState === 'IN_PROGRESS' ? 'block' : 'none';
    
    btnLeaveRoom.style.display = 'block';
    respawnButton.style.display = myIsDead && currentRoomState === 'IN_PROGRESS' ? 'block' : 'none';
    
    if (currentRoomState !== 'IN_PROGRESS') {
      respawnButton.style.display = 'none';
    }
  }

  function buildInputBuffer(seq, flags) {
    const buf = new ArrayBuffer(1 + 4 + 1);
    const dv = new DataView(buf);
    dv.setUint8(0, 1);
    dv.setUint32(1, seq);
    dv.setUint8(5, flags);
    return buf;
  }

  function sendRespawnCommand(ws) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      const buf = new ArrayBuffer(1);
      const dv = new DataView(buf);
      dv.setUint8(0, 3);
      ws.send(buf);
    }
  }

  function sendCommand(command) {
    if (currentGameWs && currentGameWs.readyState === WebSocket.OPEN) {
      console.log(`📤 Gửi command đến server:`, command);
      currentGameWs.send(JSON.stringify(command));
    } else {
      console.error(`❌ Không thể gửi command - WebSocket không mở:`, command);
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
      sendRespawnCommand(currentGameWs);
      respawnButton.textContent = 'Đang hồi sinh...';
      respawnButton.disabled = true;
      setTimeout(() => {
        respawnButton.textContent = 'HỒI SINH';
        respawnButton.disabled = false;
      }, 2000);
    }
  };

  currentGameWs.onopen = () => {
    console.log(`✅ Joined room ${roomId}`);
    showGame();
    updateButtonVisibility();
  };

  currentGameWs.onmessage = (ev) => {
    if (typeof ev.data === 'string') {
      try {
        const msg = JSON.parse(ev.data);
        
        // Tách log chat
        if (msg.type !== 'chat_room_msg') {
          console.log(`📨 Nhận JSON từ server:`, msg);
        }
        
        if (msg.type === 'lobby_update') {
          localPlayerList = msg.players;
          currentHostId = msg.hostId;
          currentRoomState = msg.state;
          console.log(`🔄 Lobby update - hostId: ${currentHostId}, state: ${currentRoomState}, players: ${localPlayerList.length}`);
          
          if (myId !== null) {
            isHost = (currentHostId === myId);
            console.log(`👑 Host check - myId: ${myId}, hostId: ${currentHostId}, isHost: ${isHost}`);
          }
          updatePlayersListUI(localPlayerList, currentHostId);
          updateButtonVisibility();
          countdownDisplay.style.display = 'none';
        } 
        else if (msg.type === 'game_start') {
          currentRoomState = 'IN_PROGRESS';
          console.log(`🎯 Game started!`);
          updateButtonVisibility();
          countdownDisplay.style.display = 'none';
          historyBuffer.clear();
        } 
        else if (msg.type === 'game_end') {
          currentRoomState = 'WAITING';
          myIsDead = false;
          console.log(`🏁 Game ended`);
          updateButtonVisibility();
          historyBuffer.clear();
        }
        else if (msg.type === 'countdown') {
          currentRoomState = 'COUNTDOWN';
          countdownDisplay.textContent = msg.seconds;
          countdownDisplay.style.display = msg.seconds > 0 ? 'block' : 'none';
          console.log(`⏰ Countdown: ${msg.seconds}`);
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
          currentGameWs.close();
        }
        // === XỬ LÝ NHẬN CHAT ROOM ===
        else if (msg.type === 'chat_room_msg') {
          displayChatMessage(msg.sender, msg.message, 'room');
        }

      } catch (e) {
        console.error('❌ Error parsing JSON message', e);
      }
      return;
    }

    // === XỬ LÝ BINARY (GAMEPLAY) ===
    try {
      const dv = new DataView(ev.data);
      const t = dv.getUint8(0);

      if (t === 0) { // Welcome packet
        myId = dv.getUint32(1);
        console.log(`🎉 Welcome! myId = ${myId}`);
        
        if (currentHostId !== null) {
          isHost = (currentHostId === myId);
          console.log(`👑 Host status updated - isHost: ${isHost}`);
          updateButtonVisibility();
        }
      } else if (t === 2) {
        // Snapshot
        const tick = dv.getUint32(1);
        const stateByte = dv.getUint8(5);
        currentRoomState = 
          stateByte === 0 ? 'WAITING' : 
          stateByte === 1 ? 'IN_PROGRESS' : 
          'COUNTDOWN';
        
        const n = dv.getUint32(6);
        let off = 10;
        const snapshot = { time: performance.now(), players: new Map() };
        
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
          
          const playerData = { x, y, orbX, orbY, lastInputSeq: lastAck, color, hp, isDead: isDead === 1 };
          snapshot.players.set(id, playerData);
          playerMap.set(id, playerData);

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

        updatePlayersListUI(localPlayerList, currentHostId);
        updateButtonVisibility();

        historyBuffer.set(snapshot.time, snapshot);
        for (const [t0] of historyBuffer) {
          if (snapshot.time - t0 > 2000) historyBuffer.delete(t0);
        }
      } else if (t === 5) { // pong
        ping = Math.round(performance.now() - lastPingTime);
      }
    } catch (e) {
      console.error('❌ Error parsing room message (binary)', e);
    }
  };

  currentGameWs.onclose = () => {
    console.log('🔌 Room WS closed, returning to lobby');
    showLobby();
    myId = null;
    isHost = false;
    historyBuffer.clear();
    playerMap.clear();
    localPlayerList = [];
    currentHostId = null;
    respawnButton.style.display = 'none';
    currentGameWs = null;
    
    // Xóa chat phòng, chuyển về global
    chatDisplayRoom.innerHTML = '';
    // displayChatMessage(null, 'Đã rời phòng.', 'system-global'); // (Đã gọi showLobby() ở trên, nó sẽ tự xử lý)
    
    if (inputInterval) clearInterval(inputInterval);
    if (pingInterval) clearInterval(pingInterval);
    if (renderFrameId) cancelAnimationFrame(renderFrameId);
  };

  currentGameWs.onerror = (e) => {
    console.error('❌ Room WS error', e);
  };

  // Input handling + sending (60Hz)
  window.addEventListener('keydown', (e) => {
    // === SỬA: KHÔNG BẮT PHÍM NẾU ĐANG GÕ CHAT ===
    if (passwordModal.style.display === 'flex' || document.activeElement === chatInput) return;
    
    if (myIsDead && currentRoomState === 'IN_PROGRESS') return;
    if (['ArrowUp','KeyW'].includes(e.code)) keys.up=true;
    if (['ArrowDown','KeyS'].includes(e.code)) keys.down=true;
    if (['ArrowLeft','KeyA'].includes(e.code)) keys.left=true;
    if (['ArrowRight','KeyD'].includes(e.code)) keys.right=true;

    if (e.code === "KeyH") {
      showHitbox = !showHitbox;
    }
  });
  window.addEventListener('keyup', (e) => {
    // === SỬA: KHÔNG BẮT PHÍM NẾU ĐANG GÕ CHAT ===
    if (passwordModal.style.display === 'flex' || document.activeElement === chatInput) return;
    
    if (['ArrowUp','KeyW'].includes(e.code)) keys.up=false;
    if (['ArrowDown','KeyS'].includes(e.code)) keys.down=false;
    if (['ArrowLeft','KeyA'].includes(e.code)) keys.left=false;
    if (['ArrowRight','KeyD'].includes(e.code)) keys.right=false;
  });

  inputInterval = setInterval(() => {
    if (!currentGameWs || currentGameWs.readyState !== WebSocket.OPEN) return;
    if (myIsDead && currentRoomState === 'IN_PROGRESS') return;

    inputSeq++;
    let flags = 0;
    if (keys.up) flags |= 1;
    if (keys.down) flags |= 2;
    if (keys.left) flags |= 4;
    if (keys.right) flags |= 8;

    currentGameWs.send(buildInputBuffer(inputSeq, flags));
  }, 1000 / 60);

  pingInterval = setInterval(() => {
    if (currentGameWs && currentGameWs.readyState === WebSocket.OPEN) {
      lastPingTime = performance.now();
      const buf = new ArrayBuffer(1);
      const dv = new DataView(buf);
      dv.setUint8(0, 4);
      currentGameWs.send(buf);
    }
  }, 1000);

  function render() {
    if (!currentGameWs) return;
    
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
      if (playerMap.size > 0) {
        playerMap.forEach(p => {
          if (p.isDead && currentRoomState === 'IN_PROGRESS') return;
          drawPlayer(p.x, p.y, p.orbX, p.orbY, p.color, p.hp);
        });
      }
      renderFrameId = requestAnimationFrame(render);
      return;
    }
    
    if (!later) later = earlier;

    const ratio = (later.time === earlier.time) ? 0 : (renderTime - earlier.time) / (later.time - earlier.time);

    for (const [id, ep] of earlier.players) {
      const lp = later.players.get(id);
      if (!lp) continue;
      if (ep.isDead && currentRoomState === 'IN_PROGRESS') continue;
      
      const x = ep.x + (lp.x - ep.x) * ratio;
      const y = ep.y + (lp.y - ep.y) * ratio;
      const orbX = ep.orbX + (lp.orbX - ep.orbX) * ratio;
      const orbY = ep.orbY + (lp.orbY - ep.orbY) * ratio;
      const color = ep.color;
      const hp = (currentRoomState === 'WAITING') ? 100 : (ep.hp + (lp.hp - ep.hp) * ratio);

      drawPlayer(x, y, orbX, orbY, color, hp);
    }

    info.textContent = `Players: ${earlier.players.size} | State: ${currentRoomState}`;
    debug.textContent = `Ping: ${ping} ms | Hitbox: ${showHitbox ? "ON" : "OFF"}`;
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

    // HP bar (Chỉ vẽ khi IN_PROGRESS)
    if (currentRoomState === 'IN_PROGRESS') {
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
    }

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