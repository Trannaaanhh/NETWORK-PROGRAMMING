export const CONSTANTS = {
    LOBBY_URL: `ws://${window.location.hostname}:3000/lobby`,
    
    RTC_CONFIG: {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    },

    ROOM_TICK_RATE: 60,
    ROOM_BROADCAST_RATE: 20,
    WORLD_W: 800, 
    WORLD_H: 600,
    PLAYER_SPEED: 200,
    ORB_RADIUS: 85,
    ORB_SPEED: Math.PI,
    PLAYER_RADIUS: 12,
    SWORD_LENGTH: 150,
    SWORD_WIDTH: 16,
    INTERP_DELAY: 100, 
    RESPAWN_TIME: 2, 
    
    COLORS: ['#4CAF50','#2196F3','#E91E63','#FF9800','#9C27B0','#00BCD4','#8BC34A','#FFC107']
};