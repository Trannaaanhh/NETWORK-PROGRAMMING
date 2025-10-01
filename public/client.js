const swordImg = new Image();
swordImg.src = 'sword.png';

const COLORS = ['#4CAF50','#2196F3','#E91E63','#FF9800',
                '#9C27B0','#00BCD4','#8BC34A','#FFC107'];

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const info = document.getElementById('info');
const debug = document.getElementById('debug');
const WS_URL = "ws://localhost:3000";
const ws = new WebSocket(WS_URL);
ws.binaryType = 'arraybuffer';

let myId = null;
const serverPlayers = new Map(); // lưu trạng thái mới từ server
const renderPlayers = new Map(); // trạng thái vẽ
const historyBuffer = new Map(); // lưu lịch sử cho interpolation

let inputSeq = 0;
let keys = { up: false, down: false, left: false, right: false };
const PLAYER_SPEED = 200;
const ORB_RADIUS = 30;
const pendingInputs = [];
let lastPingTime = 0;
let ping = 0;

// delay 100ms để interpolation
const INTERP_DELAY = 100;

function buildInputBuffer(seq, flags) {
  const buf = new ArrayBuffer(1 + 4 + 1);
  const dv = new DataView(buf);
  dv.setUint8(0, 1);
  dv.setUint32(1, seq);
  dv.setUint8(5, flags);
  return buf;
}

function updatePlayersList(playersMap) {
  const playersList = document.getElementById('playersList');
  playersList.innerHTML = ''; // xoá nội dung cũ

  for (const [id, p] of playersMap) {
    const div = document.createElement('div');
    div.style.marginBottom = '8px';

    div.innerHTML = `
      <strong style="color:${p.color}">P${id}</strong>
      <div style="background:#555; width:100%; height:10px; border-radius:3px; margin:3px 0;">
        <div style="background:#4caf50; width:${p.hp}%; height:100%;"></div>
      </div>
      <span style="font-size:12px;">HP: ${p.hp}</span>
    `;

    playersList.appendChild(div);
  }
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
ws.addEventListener('message', (ev) => {
  const dv = new DataView(ev.data);
  const t = dv.getUint8(0);
  if (t === 0) {
    myId = dv.getUint32(1);
    info.textContent = 'Assigned id: ' + myId;
  } else if (t === 2) {
    const tick = dv.getUint32(1);
    const n = dv.getUint32(5);
    let off = 9;
    const snapshot = { time: performance.now(), players: new Map() };
    for (let i = 0; i < n; i++) {
      const id = dv.getUint32(off); off += 4;
      const x = dv.getFloat32(off); off += 4;
      const y = dv.getFloat32(off); off += 4;
      const lastAck = dv.getUint32(off); off += 4;
      const orbX = dv.getFloat32(off); off += 4;
      const orbY = dv.getFloat32(off); off += 4;
      const colorIndex = dv.getUint8(off); off += 1;
      const hp = dv.getUint8(off); off += 1; // 🔹 đọc máu
      const color = COLORS[colorIndex] || '#fff';

      snapshot.players.set(id, { x, y, orbX, orbY, lastInputSeq: lastAck, color, hp });
    }
    historyBuffer.set(snapshot.time, snapshot);
    for (const [t0] of historyBuffer) {
      if (snapshot.time - t0 > 2000) historyBuffer.delete(t0);
    }
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
}, 1000/60);

// ================= Render =================
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#444';
  ctx.strokeRect(0, 0, canvas.width, canvas.height);

  const renderTime = performance.now() - INTERP_DELAY;

  let earlier, later;
  for (const [t, snap] of historyBuffer) {
    if (t <= renderTime) earlier = snap;
    if (t > renderTime) { later = snap; break; }
  }
  if (!earlier || !later) {
    requestAnimationFrame(render);
    return;
  }

  const ratio = (renderTime - earlier.time) / (later.time - earlier.time);

  for (const [id, ep] of earlier.players) {
    const lp = later.players.get(id);
    if (!lp) continue;
    const x = ep.x + (lp.x - ep.x) * ratio;
    const y = ep.y + (lp.y - ep.y) * ratio;
    const orbX = ep.orbX + (lp.orbX - ep.orbX) * ratio;
    const orbY = ep.orbY + (lp.orbY - ep.orbY) * ratio;
    const color = ep.color;
    const hp = ep.hp + (lp.hp - ep.hp) * ratio;

    // player circle
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.font = '12px sans-serif';
    ctx.fillText('P' + id, x - 10, y - 18);

    // 🔹 vẽ thanh máu
    ctx.fillStyle = 'red';
    ctx.fillRect(x - 15, y - 30, 30, 4);
    ctx.fillStyle = 'green';
    ctx.fillRect(x - 15, y - 30, (hp / 100) * 30, 4);

    // sword
    if (swordImg.complete) {
      ctx.save();
      let dx = orbX - x;
      let dy = orbY - y;
      let dist = Math.hypot(dx, dy);
      let offset = 10;
      let baseX = orbX - (dx / dist) * offset;
      let baseY = orbY - (dy / dist) * offset;
      ctx.translate(baseX, baseY);
      let angle = Math.atan2(dy, dx) + Math.PI / 2;
      ctx.rotate(angle);
      const swordW = 40, swordH = 80;
      ctx.drawImage(swordImg, -swordW/3, -swordH, swordW, swordH);
      ctx.restore();
    }
  }

  debug.textContent = `players: ${earlier.players.size} ping≈${ping}ms`;

  updatePlayersList(earlier.players);
  requestAnimationFrame(render);
}
render();
