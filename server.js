const { performance } = require('perf_hooks');

const port = process.env.PORT || 4200;

const http = require('http').createServer().listen(port);
const io = require('socket.io').listen(http);

console.log(`Listening on port ${port}`)

let startTime;

io.on('connection', socket => {

  console.log('new user connected');

  if (!startTime) startTime = performance.now();

  /**
   * Join room
   */
  socket.on('CL_SEND_JOIN_ROOM', seed => {
    socket.join(seed);
    const me = socket.id;

    const room = io.sockets.adapter.rooms[seed];
    const allUsers = Object.keys(room.sockets)

    // send socket id and all user id;
    io.to(seed).emit('SV_SEND_JOIN_ROOM', { me, usersConnected: allUsers, startTime }); // alert all user in room  
  })

  /**
   * Init objects
   */
  socket.on('CL_SEND_INIT_OBJECTS', data => {
    socket.broadcast.to(data.room).emit('SV_SEND_INIT_OBJECTS', {
      placedObjects: data.placedObjects
    })
  })

  /**
   * On disconnection
   */
  socket.on('disconnect', () => {
    io.emit('SV_SEND_DISCONNECTION', { userID: socket.id });
  });


  /**
   * Broadcast position
   */
  socket.on('CL_SEND_PLAYER_POSITION', data => {
    socket.broadcast.to(data.room).emit('SV_SEND_PLAYER_POSITION', { userID: socket.id, position: data.position });
  })

  /**
   * Broadcast object to add on scene
   */
  socket.on('CL_SEND_ADD_OBJECT', data => {
    socket.broadcast.to(data.room).emit('SV_SEND_ADD_OBJECT', { item: data.item });
  })

});
