const { performance } = require('perf_hooks');

const port = process.env.PORT || 4200;

const http = require('http').createServer().listen(port);
const io = require('socket.io').listen(http);

console.log(`Listening on port ${port}`)

let startTime;
const rooms = new Map();

io.on('connection', socket => {

  console.log('new user connected');

  if (!startTime) startTime = performance.now();

  /**
   * Join room
   */
  socket.on('CL_SEND_JOIN_ROOM', roomID => {
    socket.join(roomID);
    const me = socket.id;

    // init room on map if not present
    if (!rooms.has(roomID)) {
      rooms.set(roomID, []);
    }


    // get users in room
    const allUsers = Object.keys(io.sockets.adapter.rooms[roomID].sockets);

    // send socket id and all user id;
    io.to(roomID).emit('SV_SEND_JOIN_ROOM', { me, startTime, usersConnected: allUsers, allObjects: rooms.get(roomID) }); // alert all user in room  
  })

  /**
   * Init objects
   */
  socket.on('CL_SEND_INIT_OBJECTS', data => {
    socket.broadcast.to(data.roomID).emit('SV_SEND_INIT_OBJECTS', {
      placedObjects: data.placedObjects
    })
  })

  /**
   * Broadcast position
   */
  socket.on('CL_SEND_PLAYER_POSITION', data => {
    socket.broadcast.to(data.roomID).emit('SV_SEND_PLAYER_POSITION', { userID: socket.id, position: data.position });
  })

  /**
   * Broadcast object to add on scene
   */
  socket.on('CL_SEND_ADD_OBJECT', data => {
    const roomObjects = rooms.get(data.roomID);
    roomObjects.push(data.item);
    rooms.set(data.roomID, roomObjects);

    socket.broadcast.to(data.roomID).emit('SV_SEND_ADD_OBJECT', { item: data.item });
  })

  /**
 * On disconnection
 */
  socket.on('disconnect', () => {
    io.emit('SV_SEND_DISCONNECTION', { userID: socket.id });
  });

});
