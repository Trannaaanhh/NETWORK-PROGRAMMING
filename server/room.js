const WebSocket = require('ws');
const { makeId } = require('./utils');

// Hằng số duy nhất server cần là thời gian đếm ngược
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
  room.players = new Set(); // Set các [ws]
  room.playersData = new Map(); // Map [playerId] -> { id, name }
  room.wsToPlayerId = new Map(); // Map [ws] -> playerId
  room.countdownTimer = null;
  room.hostId = null;

  // === CÁC HÀM TIỆN ÍCH CHO PHÒNG ===

  // Gửi JSON cho TẤT CẢ mọi người trong phòng
  function broadcastRoomJson(msg) {
    const payload = JSON.stringify(msg);
    // Tránh spam log chat
    if (msg.type !== 'chat_room_msg' && !msg.type.startsWith('webrtc_')) {
      console.log(`📤 Broadcast to room ${room.name}:`, msg.type);
    }
    room.players.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(payload); } catch (e) { /* ignore */ }
      }
    });
  }

  // Gửi JSON cho MỘT người
  function sendTo(ws, msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        if (msg.type !== 'chat_room_msg' && !msg.type.startsWith('webrtc_')) {
            console.log(`📤 Gửi riêng cho ${room.playersData.get(room.wsToPlayerId.get(ws))?.name}:`, msg.type);
        }
      ws.send(JSON.stringify(msg));
    }
  }

  // Lấy WebSocket từ Player ID
  function getWsByPlayerId(playerId) {
    for (let [ws, id] of room.wsToPlayerId.entries()) {
      if (id === playerId) {
        return ws;
      }
    }
    return null;
  }

  // Thông báo cho mọi người về danh sách người chơi và Host mới
  function broadcastLobbyUpdate() {
    const playersList = Array.from(room.playersData.values()); // Gửi [{id, name}, ...]
    
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

  // === XỬ LÝ KẾT NỐI MỚI ===

  wssRoom.on('connection', (ws, req) => {
    // Dùng WHATWG URL API mới để lấy query param
    const { searchParams } = new URL(req.url, `ws://${req.headers.host}`);
    const playerName = searchParams.get('name') || 'Anonymous';

    console.log(`🔗 New connection to room ${room.name}: ${playerName}`);

    // Từ chối nếu game đang diễn ra
    if (room.state === 'IN_PROGRESS' || room.state === 'COUNTDOWN') {
      console.log(`❌ Room ${room.name} is busy, rejecting ${playerName}`);
      sendTo(ws, { type: 'error', message: 'Trận đấu đang diễn ra hoặc sắp bắt đầu, không thể tham gia!' });
      ws.close();
      return;
    }

    // TẠO PLAYER MỚI (chỉ cần id và name)
    const player = {
      id: nextPlayerId++,
      name: playerName,
    };

    // Gán Host nếu là người đầu tiên
    if (room.hostId === null) {
      room.hostId = player.id;
      console.log(`👑 ${playerName} (id: ${player.id}) is now host of room ${room.name}`);
    }

    room.playersData.set(player.id, player);
    room.players.add(ws);
    room.wsToPlayerId.set(ws, player.id);

    console.log(`✅ Player ${player.id} (${player.name}) connected to room ${room.id}. Players: ${room.players.size}`);

    // Gửi "Welcome" packet (Type 0 binary)
    try {
      const buf0 = new ArrayBuffer(5);
      const dv0 = new DataView(buf0);
      dv0.setUint8(0, 0); // Type 0 = Welcome
      dv0.setUint32(1, player.id); // Gửi ID cho client
      ws.send(buf0);
    } catch (e) { console.error('send welcome error', e); }

    // Thông báo cho sảnh và phòng
    broadcastLobbyUpdate();
    broadcastLobbyRooms();

    // === XỬ LÝ TIN NHẮN ===

    ws.on('message', (data) => {
      const pid = room.wsToPlayerId.get(ws);
      const p = room.playersData.get(pid);
      if (!p) return;

      let msg = null;
      
      // Thử parse JSON
      try {
        // Dùng data.toString() để chuyển đổi Buffer (nếu có)
        msg = JSON.parse(data.toString());
      } catch (e) {
        // Không phải JSON, xử lý binary bên dưới
      }

      // 1. XỬ LÝ JSON
      if (msg) {
        
        // Chat (bất kỳ ai)
        if (msg.type === 'chat_room') {
          const message = String(msg.message || '').trim();
          if (message) {
            // console.log(`[ROOM CHAT - ${room.name}] ${p.name}: ${message}`); // Hơi ồn
            broadcastRoomJson({ type: 'chat_room_msg', sender: p.name, message });
          }
          return;
        }

        // --- BẮT ĐẦU LOGIC SIGNALING (MỚI) ---
        // Chuyển tiếp tin nhắn WebRTC

        if (msg.type === 'webrtc_offer') {
            // Nhận từ Guest, gửi cho Host
            console.log(`[Signaling] Nhận offer từ ${p.name} (Guest), gửi cho Host (id: ${room.hostId})`);
            const hostWs = getWsByPlayerId(room.hostId);
            if (hostWs) {
                sendTo(hostWs, {
                    type: 'webrtc_offer',
                    senderId: p.id, // Báo cho Host biết ai đã gửi
                    offer: msg.offer
                });
            }
        }
        else if (msg.type === 'webrtc_answer') {
            // Nhận từ Host, gửi cho Guest (targetId)
            console.log(`[Signaling] Nhận answer từ Host, gửi cho ${msg.targetId} (Guest)`);
            const guestWs = getWsByPlayerId(msg.targetId);
            if (guestWs) {
                sendTo(guestWs, {
                    type: 'webrtc_answer',
                    senderId: p.id, // Là Host
                    answer: msg.answer
                });
            }
        }
        else if (msg.type === 'webrtc_candidate') {
            // Nhận từ bất kỳ ai, gửi cho người kia (targetId)
            // console.log(`[Signaling] Gửi candidate từ ${p.id} đến ${msg.targetId}`); // Rất ồn
            const targetWs = getWsByPlayerId(msg.targetId);
            if (targetWs) {
                sendTo(targetWs, {
                    type: 'webrtc_candidate',
                    senderId: p.id,
                    candidate: msg.candidate
                });
            }
        }

        // --- KẾT THÚC LOGIC SIGNALING ---


        // === CÁC LỆNH TỪ HOST ===
        // Các lệnh sau chỉ Host mới được dùng
        if (pid !== room.hostId) {
          if (msg.type === 'start_game' || msg.type === 'cancel_countdown' || msg.type === 'end_game') {
            console.log(`❌ LỆNH BỊ TỪ CHỐI: ${p.name} không phải host`);
            sendTo(ws, { type: 'error', message: 'Chỉ chủ phòng mới có quyền này!' });
          }
          return;
        }

        if (msg.type === 'start_game') {
          if (room.state === 'WAITING') {
            // if (room.players.size < 2) { // Bỏ check này để test 1 mình
            //     sendTo(ws, { type: 'error', message: `Cần ít nhất 2 người chơi!` });
            //     return;
            // }

            room.state = 'COUNTDOWN';
            let countdown = COUNTDOWN_SECONDS;
            broadcastRoomJson({ type: 'countdown', seconds: countdown });

            if (room.countdownTimer) clearInterval(room.countdownTimer);

            room.countdownTimer = setInterval(() => {
              countdown--;
              broadcastRoomJson({ type: 'countdown', seconds: countdown });

              if (countdown <= 0) {
                clearInterval(room.countdownTimer);
                room.countdownTimer = null;
                room.state = 'IN_PROGRESS';
                console.log(`🎯 MATCH START in ${room.name}`);
                broadcastRoomJson({ type: 'game_start' });
                broadcastLobbyRooms(); // Cập nhật trạng thái "IN_PROGRESS" cho sảnh
              }
            }, 1000);
          }
        } 
        else if (msg.type === 'cancel_countdown') {
          if (room.state === 'COUNTDOWN') {
            if (room.countdownTimer) clearInterval(room.countdownTimer);
            room.countdownTimer = null;
            room.state = 'WAITING';
            console.log(`✅ Countdown cancelled. Back to WAITING.`);
            broadcastRoomJson({ type: 'countdown', seconds: 0 }); // Báo cho client là 0
            broadcastLobbyRooms();
          }
        } 
        else if (msg.type === 'end_game') {
          if (room.state === 'IN_PROGRESS' || room.state === 'COUNTDOWN') {
            if (room.countdownTimer) clearInterval(room.countdownTimer);
            room.countdownTimer = null;
            room.state = 'WAITING';
            console.log(`✅ Game ended by Host. Back to WAITING.`);
            broadcastRoomJson({ type: 'game_end' });
            broadcastLobbyRooms();
          }
        }

        return; // Kết thúc xử lý JSON
      }

      // 2. XỬ LÝ BINARY
      // Server P2P chỉ quan tâm đến PING (Type 4)
      try {
        const ab = Buffer.isBuffer(data)
          ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
          : data;
        const dv = new DataView(ab);
        const t = dv.getUint8(0);

        if (t === 4) { // Ping -> Pong (5)
          const pongBuf = new ArrayBuffer(1);
          const pongDv = new DataView(pongBuf);
          pongDv.setUint8(0, 5);
          ws.send(pongBuf);
        }
        // Bỏ qua Type 1 (Input) và Type 3 (Respawn)
      } catch (e) {
        console.error('❌ Room binary message error', e);
      }
    }); // end ws.on('message')

    // === XỬ LÝ NGẮT KẾT NỐI ===

    ws.on('close', () => {
      const pid = room.wsToPlayerId.get(ws);
      if (pid) {
        room.playersData.delete(pid);
        room.wsToPlayerId.delete(ws);
      }
      room.players.delete(ws);
      console.log(`🔌 Player ${pid} left room ${room.id}. Remaining: ${room.players.size}`);

      // Dọn dẹp phòng nếu trống
      if (room.players.size === 0) {
        console.log(`🏁 Room ${room.name} is empty, scheduling cleanup`);
        // Đặt hẹn giờ để dọn, phòng trường hợp host rớt mạng và vào lại ngay
        setTimeout(() => {
          if (room.players.size === 0) {
            cleanupRoom(room.id, roomsArray);
            broadcastLobbyRooms();
          }
        }, 5000); // 5 giây
      } else {
        // Nếu Host rời, chọn Host mới
        if (pid === room.hostId) {
          // Lấy người chơi đầu tiên còn lại làm Host
          room.hostId = room.playersData.keys().next().value;
          console.log(`👑 New host is: ${room.playersData.get(room.hostId)?.name} (id: ${room.hostId})`);
        }
        // Cập nhật cho mọi người
        broadcastLobbyUpdate();
        broadcastLobbyRooms();
      }
    });

  }); // end wssRoom.on('connection')

  // === KHÔNG CÓ GAME LOOP ===
  // (Đã xóa room.tickInterval)
  // (Đã xóa room.broadcastInterval)

  console.log(`🔨 P2P Room server created: ${room.name} (${room.id})`);
}

// Hàm dọn dẹp (call từ lobby hoặc server.js)
function cleanupRoom(roomId, roomsArray = []) {
  const idx = roomsArray.findIndex(r => r.id === roomId);
  if (idx === -1) return;
  const room = roomsArray[idx];
  
  if (room.players && room.players.size > 0) {
      // Đã có người vào lại, không dọn dẹp
      return;
  }

  console.log('🧹 Cleaning up room:', roomId);
  try {
    // Dọn dẹp timer (nếu còn)
    if (room.countdownTimer) clearInterval(room.countdownTimer);
    
    // Đóng tất cả kết nối (nếu còn sót)
    if (room.wss) {
      room.players.forEach(ws => {
        try { ws.close(); } catch (e) { }
      });
      room.wss.close();
    }
  } catch (e) { console.error('cleanup error', e); }
  
  roomsArray.splice(idx, 1);
}

// Lấy snapshot cho sảnh (không đổi)
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