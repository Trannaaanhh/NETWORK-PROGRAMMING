export const state = {
    playerName: '',
    rooms: [],
    lobbyWs: null,
    currentGameWs: null,
    
    currentChatMode: 'global',
    tempPasswordForJoin: '',

    myId: null,
    isHost: false,
    currentRoomState: 'WAITING',
    localPlayerList: [],
    currentHostId: null,
    playerMap: new Map(),
    
    historyBuffer: new Map(),
    keys: { up:false, down:false, left:false, right:false },
    inputSeq: 0,
    myIsDead: false,
    ping: 0,
    lastPingTime: 0,
    showHitbox: true,
    
    inputInterval: null,
    pingInterval: null,
    renderFrameId: null,
    gameTickInterval: null,
    gameBroadcastInterval: null,
    
    clientInputMap: new Map(),
    nextPlayerColorIndex: 0,
    peerConnections: new Map()
};