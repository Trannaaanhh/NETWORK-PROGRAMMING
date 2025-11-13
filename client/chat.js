import { state } from './state.js';
import { DOM, displayChatMessage } from './ui.js';

export function sendChatMessage() {
  const message = DOM.chatInput.value.trim();
  if (!message) return;

  const mode = state.currentChatMode;

  if (mode === 'global') {
    if (state.lobbyWs && state.lobbyWs.readyState === WebSocket.OPEN) {
      state.lobbyWs.send(JSON.stringify({
        type: 'chat_global',
        message: message,
        player: state.playerName
      }));
    } else {
      displayChatMessage(null, 'Lỗi: Mất kết nối chat Global.', 'system-global');
    }
  } else if (mode === 'room') {
    if (state.currentGameWs && state.currentGameWs.readyState === WebSocket.OPEN) {
      state.currentGameWs.send(JSON.stringify({
        type: 'chat_room',
        message: message
      }));
    } else {
      displayChatMessage(null, 'Lỗi: Bạn không ở trong phòng để chat.', 'system-room');
    }
  }

  DOM.chatInput.value = '';
  DOM.chatInput.focus();
}