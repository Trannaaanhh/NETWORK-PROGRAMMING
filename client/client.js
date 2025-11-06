const swordImg = new Image();
swordImg.src = 'sword.png';

const COLORS = ['#4CAF50','#2196F3','#E91E63','#FF9800',
                '#9C27B0','#00BCD4','#8BC34A','#FFC107'];

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const info = document.getElementById('info');
const debug = document.getElementById('debug');
const respawnButton = document.getElementById('respawnButton');

// ================== SỬA DÒNG NÀY ==================
// const WS_URL = "ws://192.168.1.90:3000"; // <--- DÒNG CŨ
const WS_URL = `ws://${window.location.hostname}:3000`; // <--- DÒNG MỚI

const ws = new WebSocket(WS_URL);
ws.binaryType = 'arraybuffer';

let myId = null;
const historyBuffer = new Map();
let keys = { up: false, down: false, left: false, right: false };
let inputSeq = 0;
let myIsDead = false;
let ping = 0;
let lastPingTime = 0;

const PLAYER_SPEED = 200;
const PLAYER_RADIUS = 12;
const SWORD_LENGTH = 150;
const SWORD_WIDTH = 16;

const INTERP_DELAY = 100;
let showHitbox = true; // toggle bằng phím H

// ================== Players List Update ==================
function updatePlayersList(players) {
  const playersList = document.getElementById('playersList');
  playersList.innerHTML = '';

  players.forEach((player, id) => {
    const playerEl = document.createElement('div');
    const isMe = id === myId;
    const isDead = player.isDead;

    // Chỉ hiển thị người chơi còn sống (hoặc chính mình nếu chết)
    if (!isDead || isMe) {
      playerEl.innerHTML = `
        <strong style="color: ${player.color}">Player ${id}</strong> ${isMe ? '(Bạn)' : ''}
        <div class="hp-bar-container">
          <div class="hp-bar" style="width: ${player.hp}%; background-color: ${player.hp > 50 ? '#4CAF50' : player.hp > 20 ? '#FF9800' : '#F44336'};"></div>
        </div>
        HP: ${player.hp}${isDead ? ' (ĐÃ CHẾT)' : ''}
      `;

      // Thêm style cho player đã chết
      if (isDead) {
        playerEl.style.opacity = '0.6';
        playerEl.style.background = '#5d5d5d';
      }

      playersList.appendChild(playerEl);
    }
  });

  // Nếu không có ai hiển thị
  if (playersList.children.length === 0) {
    playersList.innerHTML = '<div>Không có người chơi nào</div>';
  }
}

// ================= Input buffer =================
function buildInputBuffer(seq, flags) {
  const buf = new ArrayBuffer(1 + 4 + 1);
  const dv = new DataView(buf);
  dv.setUint8(0, 1);
  dv.setUint32(1, seq);
  dv.setUint8(5, flags);
  return buf;
}

function sendRespawnCommand() {
  if (ws.readyState === WebSocket.OPEN) {
    const buf = new ArrayBuffer(1);
    const dv = new DataView(buf);
    dv.setUint8(0, 3);
    ws.send(buf);
  }
}

respawnButton.addEventListener('click', () => {
  if (myIsDead) {
    sendRespawnCommand();
    respawnButton.textContent = 'Đang hồi sinh...';
    respawnButton.disabled = true;

    // Enable lại sau 2 giây
    setTimeout(() => {
      respawnButton.textContent = 'HỒI SINH';
      respawnButton.disabled = false;
    }, 2000);
  }
});

ws.addEventListener('message', (ev) => {
  const dv = new DataView(ev.data);
  const t = dv.getUint8(0);
  if (t === 0) {
    myId = dv.getUint32(1);
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
      const hp = dv.getUint8(off); off += 1;
      const isDead = dv.getUint8(off); off += 1;
      const color = COLORS[colorIndex] || '#fff';
      snapshot.players.set(id, {x,y,orbX,orbY,lastInputSeq:lastAck,color,hp,isDead:isDead===1});

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

    // QUAN TRỌNG: Cập nhật danh sách người chơi
    updatePlayersList(snapshot.players);

    historyBuffer.set(snapshot.time, snapshot);
    for (const [t0] of historyBuffer) {
      if (snapshot.time - t0 > 2000) historyBuffer.delete(t0);
    }
  } else if (t === 5) { // Pong
    ping = Math.round(performance.now() - lastPingTime);
  }
});

window.addEventListener('keydown', e => {
  if (myIsDead) return;
  if (['ArrowUp','KeyW'].includes(e.code)) keys.up=true;
  if (['ArrowDown','KeyS'].includes(e.code)) keys.down=true;
  if (['ArrowLeft','KeyA'].includes(e.code)) keys.left=true;
  if (['ArrowRight','KeyD'].includes(e.code)) keys.right=true;

  // Toggle hitbox
  if (e.code === "KeyH") {
    showHitbox = !showHitbox;
  }
});
window.addEventListener('keyup', e => {
  if (myIsDead) return;
  if (['ArrowUp','KeyW'].includes(e.code)) keys.up=false;
  if (['ArrowDown','KeyS'].includes(e.code)) keys.down=false;
  if (['ArrowLeft','KeyA'].includes(e.code)) keys.left=false;
  if (['ArrowRight','KeyD'].includes(e.code)) keys.right=false;
});

setInterval(() => {
  if (ws.readyState !== WebSocket.OPEN || myIsDead) return;
  inputSeq++;
  let flags = 0;
  if (keys.up) flags |= 1;
  if (keys.down) flags |= 2;
  if (keys.left) flags |= 4;
  if (keys.right) flags |= 8;

  if (flags > 0) {
    console.log(`Input Sequence: ${inputSeq}, Flags Value: ${flags}`);
  }

  ws.send(buildInputBuffer(inputSeq, flags));
}, 1000 / 60);

// Ping định kỳ
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    lastPingTime = performance.now();
    const buf = new ArrayBuffer(1);
    const dv = new DataView(buf);
    dv.setUint8(0, 4); // Packet type 4 = ping
    ws.send(buf);
  }
}, 1000);

// ================= Render =================
function render() {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle='#444';
  ctx.strokeRect(0,0,canvas.width,canvas.height);

  const renderTime=performance.now()-INTERP_DELAY;
  let earlier,later;
  for (const [t,snap] of historyBuffer) {
    if (t<=renderTime) earlier=snap;
    if (t>renderTime) {later=snap; break;}
  }
  if (!earlier||!later){requestAnimationFrame(render);return;}
  const ratio=(renderTime-earlier.time)/(later.time-earlier.time);

  for (const [id,ep] of earlier.players) {
    const lp=later.players.get(id);
    if (!lp) continue;
    if (ep.isDead) continue;
    const x=ep.x+(lp.x-ep.x)*ratio;
    const y=ep.y+(lp.y-ep.y)*ratio;
    const orbX=ep.orbX+(lp.orbX-ep.orbX)*ratio;
    const orbY=ep.orbY+(lp.orbY-ep.orbY)*ratio;
    const color=ep.color;
    const hp=ep.hp+(lp.hp-ep.hp)*ratio;

    // Player body
    ctx.beginPath();
    ctx.arc(x,y,PLAYER_RADIUS,0,Math.PI*2);
    ctx.fillStyle=color;
    ctx.fill();
    ctx.strokeStyle='lime';
    ctx.lineWidth=2;
    ctx.stroke();

    // HP bar
    const barWidth=30;
    ctx.fillStyle='red';
    ctx.fillRect(x-barWidth/2,y-PLAYER_RADIUS-8,barWidth,4);
    ctx.fillStyle='green';
    ctx.fillRect(x-barWidth/2,y-PLAYER_RADIUS-8,(hp/100)*barWidth,4);

    // Sword
    ctx.save();
    ctx.translate(x, y);
    const angle = Math.atan2(orbY - y, orbX - x);
    ctx.rotate(angle);

    // Vẽ ảnh kiếm (canh đúng góc, không bị lệch 90°)
    ctx.drawImage(
      swordImg,
      0, -SWORD_WIDTH/2,
      SWORD_LENGTH, SWORD_WIDTH
    );

    // Vẽ hitbox đường thẳng
    if (showHitbox) {
      ctx.strokeStyle = "red";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(SWORD_LENGTH, 0);
      ctx.stroke();
    }

    ctx.restore();

    // Orb debug
    if (showHitbox) {
      ctx.beginPath();
      ctx.arc(orbX, orbY, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'yellow';
      ctx.fill();
    }
  }

  info.textContent = `Players: ${earlier.players.size}`;
  debug.textContent = `Ping: ${ping} ms | Hitbox: ${showHitbox?"ON":"OFF"}`;
  requestAnimationFrame(render);
}
requestAnimationFrame(render);