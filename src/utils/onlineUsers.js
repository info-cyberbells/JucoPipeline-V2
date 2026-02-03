// Map to store online users
// userId -> Set of socketIds (supports multiple tabs/devices)
const onlineUsers = new Map();

export const addUserSocket = (userId, socketId) => {
  const id = userId.toString();
  if (!onlineUsers.has(id)) {
    onlineUsers.set(id, new Set());
  }
  onlineUsers.get(id).add(socketId);
};

export const removeUserSocket = (userId, socketId) => {
  const id = userId.toString();
  const userSockets = onlineUsers.get(id);

  if (!userSockets) return;

  userSockets.delete(socketId);

  // If no sockets left, user is offline
  if (userSockets.size === 0) {
    onlineUsers.delete(id);
  }
};

export const getOnlineUsers = () => {
  return Array.from(onlineUsers.keys());
};

export const isUserOnline = (userId) => {
  return onlineUsers.has(userId.toString());
};
