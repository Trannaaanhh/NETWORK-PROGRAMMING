const os = require('os');

function makeId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}
function findLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

module.exports = { makeId, findLocalIp };
