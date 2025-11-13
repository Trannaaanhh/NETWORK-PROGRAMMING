// server/server.js (ĐÃ FIX)

const express = require('express');
const http = require('http');
const path = require('path');
const os = require('os');
// const url = require('url'); // Không cần thiết nếu lobby.js không dùng

const { handleUpgrade, wssLobby, rooms } = require('./lobby');
const { findLocalIp } = require('./utils');
// const { cleanupRoom } = require('./room'); // Không cần gọi từ đây nữa

const app = express();
app.use(express.static(path.join(__dirname, '../client')));

// ======== Tạo HTTP server ========
const server = http.createServer(app);

// ======== Xử lý nâng cấp WebSocket ========
server.on('upgrade', (req, socket, head) => {
  handleUpgrade(req, socket, head);
});

// ======== PHẦN SETINTERVAL ĐÃ ĐƯỢC XÓA BỎ ========
// Logic dọn dẹp bây giờ đã nằm bên trong room.js
// và tự kích hoạt khi phòng trống.

// ======== Khởi động server ========
const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  const ip = findLocalIp();
  console.log('🚀 Server started:');
  console.log(`   - Website:  http://localhost:${PORT}`);
  console.log(`   - Lobby WS: ws://${ip}:${PORT}/lobby`);
  console.log(`   - Room WS:  ws://${ip}:${PORT}/room/:id`);
});