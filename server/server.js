const express = require('express');
const http = require('http');
const path = require('path');
const os = require('os');
const url = require('url');
const WebSocket = require('ws');

const { handleUpgrade, wssLobby, rooms } = require('./lobby');
const { findLocalIp } = require('./utils');
const { cleanupRoom } = require('./room');

const app = express();
app.use(express.static(path.join(__dirname, '../client')));

// ======== Tạo HTTP server ========
const server = http.createServer(app);

// ======== Xử lý nâng cấp WebSocket ========
server.on('upgrade', (req, socket, head) => {
  handleUpgrade(req, socket, head);
});

// ======== Dọn dẹp phòng định kỳ (phòng trống, đã kết thúc, lỗi socket, v.v.) ========
setInterval(() => {
  cleanupRoom(rooms);
}, 10000); // 10 giây quét 1 lần

// ======== Khởi động server ========
const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  const ip = findLocalIp();
  console.log('🚀 Server started:');
  console.log(`   - Website:  http://localhost:${PORT}`);
  console.log(`   - Lobby WS: ws://${ip}:${PORT}/lobby`);
  console.log(`   - Room WS:  ws://${ip}:${PORT}/room/:id`);
});
