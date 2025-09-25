const swordImg = new Image();
swordImg.src = 'sword.png'; // sử dụng file sword bạn vừa upload

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const info = document.getElementById('info');
const debug = document.getElementById('debug');
const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
const ws = new WebSocket(WS_URL);
ws.binaryType = 'arraybuffer';
let myId = null;
const serverPlayers = new Map(); // authoritative positions from server
const renderPlayers = new Map(); // what we draw, used for smoothing {x,y, orbX, orbY}
let inputSeq = 0;
let keys = { up: false, down: false, left: false, right: false };
const PLAYER_SPEED = 200;
const ORB_RADIUS = 30;
// pending inputs for my player
const pendingInputs = [];
let lastPingTime = 0;
let ping = 0;

// pack input flags
function buildInputBuffer(seq, flags) {
  const buf = new ArrayBuffer(1 + 4 + 1);
  const dv = new DataView(buf);
  dv.setUint8(0, 1); // type=1 input
  dv.setUint32(1, seq);
  dv.setUint8(5, flags);
  return buf;
}

function applyInputToLocal(player, flags, dt) {
  let vx = 0, vy = 0;
  if (flags & 1) vy -= 1;
  if (flags & 2) vy += 1;
  if (flags & 4) vx -= 1;
  if (flags & 8) vx += 1;
  const len = Math.hypot(vx, vy);
  if (len > 0) { vx = (vx / len) * PLAYER_SPEED; vy = (vy / len) * PLAYER_SPEED; }
  player.x += vx * dt;
  player.y += vy * dt;
  if (player.x < 10) player.x = 10;
  if (player.y < 10) player.y = 10;
  if (player.x > canvas.width - 10) player.x = canvas.width - 10;
  if (player.y > canvas.height - 10) player.y = canvas.height - 10;
}

// ================= WebSocket =================
ws.addEventListener('open', () => {
  info.textContent = 'Connected, waiting server welcome...';
  setInterval(() => lastPingTime = performance.now(), 2000);
});

ws.addEventListener('message', (ev) => {
  const dv = new DataView(ev.data);
  const t = dv.getUint8(0);
  if (t === 0) {
    myId = dv.getUint32(1);
    info.textContent = 'Assigned id: ' + myId;
  } else if (t === 2) {
    const serverTick = dv.getUint32(1);
    const n = dv.getUint32(5);
    let off = 9;
    if (lastPingTime) {
      ping = Math.round(performance.now() - lastPingTime);
      lastPingTime = 0;
    }
    const seen = new Set();
    for (let i = 0; i < n; i++) {
      const id = dv.getUint32(off); off += 4;
      const x = dv.getFloat32(off); off += 4;
      const y = dv.getFloat32(off); off += 4;
      const lastAck = dv.getUint32(off); off += 4;
      const orbX = dv.getFloat32(off); off += 4;
      const orbY = dv.getFloat32(off); off += 4;
      seen.add(id);
      serverPlayers.set(id, { x, y, lastInputSeq: lastAck, orbX, orbY });
      if (!renderPlayers.has(id)) {
        renderPlayers.set(id, { x, y, orbX, orbY });
      }
    }
    for (const id of [...serverPlayers.keys()]) {
      if (!seen.has(id)) {
        serverPlayers.delete(id);
        renderPlayers.delete(id);
      }
    }
    // Reconciliation for my player
    if (myId != null) {
      const srv = serverPlayers.get(myId);
      if (srv) {
        const predicted = renderPlayers.get(myId) || { x: srv.x, y: srv.y, orbX: srv.orbX, orbY: srv.orbY };
        predicted.x = srv.x;
        predicted.y = srv.y;
        predicted.orbX = srv.orbX;
        predicted.orbY = srv.orbY;
        renderPlayers.set(myId, predicted);
        while (pendingInputs.length > 0 && pendingInputs[0].seq <= srv.lastInputSeq) {
          pendingInputs.shift();
        }
        for (const inp of pendingInputs) {
          applyInputToLocal(predicted, inp.flags, 1/60);
        }
      }
    }
    debug.textContent = `players: ${serverPlayers.size} ping≈${ping}ms`;
  }
});

// ================= Input =================
window.addEventListener('keydown', e => {
  if (['ArrowUp', 'KeyW'].includes(e.code)) keys.up = true;
  if (['ArrowDown', 'KeyS'].includes(e.code)) keys.down = true;
  if (['ArrowLeft', 'KeyA'].includes(e.code)) keys.left = true;
  if (['ArrowRight', 'KeyD'].includes(e.code)) keys.right = true;
});

window.addEventListener('keyup', e => {
  if (['ArrowUp', 'KeyW'].includes(e.code)) keys.up = false;
  if (['ArrowDown', 'KeyS'].includes(e.code)) keys.down = false;
  if (['ArrowLeft', 'KeyA'].includes(e.code)) keys.left = false;
  if (['ArrowRight', 'KeyD'].includes(e.code)) keys.right = false;
});

// ================= Send inputs =================
setInterval(() => {
  if (ws.readyState !== WebSocket.OPEN) return;
  inputSeq++;
  let flags = 0;
  if (keys.up) flags |= 1;
  if (keys.down) flags |= 2;
  if (keys.left) flags |= 4;
  if (keys.right) flags |= 8;
  pendingInputs.push({ seq: inputSeq, flags });
  ws.send(buildInputBuffer(inputSeq, flags));
  lastPingTime = lastPingTime || performance.now();
  if (myId != null) {
    if (!renderPlayers.has(myId)) {
      const srv = serverPlayers.get(myId);
      renderPlayers.set(myId, srv ? { x: srv.x, y: srv.y, orbX: srv.orbX, orbY: srv.orbY } : { x: canvas.width/2, y: canvas.height/2, orbX: canvas.width/2 + ORB_RADIUS, orbY: canvas.height/2 });
    }
    applyInputToLocal(renderPlayers.get(myId), flags, 1/60);
  }
}, 1000/60);

// ================= Render =================
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#444';
  ctx.strokeRect(0, 0, canvas.width, canvas.height);
  for (const [id, srv] of serverPlayers) {
    if (!renderPlayers.has(id)) {
      renderPlayers.set(id, { x: srv.x, y: srv.y, orbX: srv.orbX, orbY: srv.orbY });
    }
  }
  // smooth non-local players toward server pos
  for (const [id, rp] of renderPlayers) {
    const srv = serverPlayers.get(id);
    if (srv && id !== myId) {
      const alpha = 0.12;
      rp.x += (srv.x - rp.x) * alpha;
      rp.y += (srv.y - rp.y) * alpha;
      rp.orbX += (srv.orbX - rp.orbX) * alpha;
      rp.orbY += (srv.orbY - rp.orbY) * alpha;
    }
  }
  // draw players + sword
  for (const [id, p] of renderPlayers) {
    if (!p) continue;
    // player circle
    ctx.beginPath();
    ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
    ctx.fillStyle = (id === myId) ? '#4CAF50' : '#2196F3';
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.font = '12px sans-serif';
    ctx.fillText('P' + id, p.x - 10, p.y - 18);
    // sword image
    if (swordImg.complete) {
      ctx.save();
      ctx.translate(p.orbX, p.orbY); // position at orbX/Y (former orb position)
      ctx.rotate(Math.atan2(p.orbY - p.y, p.orbX - p.x)); // rotate based on direction from player
      ctx.drawImage(swordImg, -53, -32, 106, 64); // scale according to original image ratio
      ctx.restore();
    }
  }
  requestAnimationFrame(render);
}
render();