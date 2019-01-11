const http = require('http').createServer().listen(4200, 'localhost');
const io = require('socket.io').listen(http);


io.on('connection', socket => {

  console.log('new user connected');

  /**
   * Join room
   */
  socket.on('join_room', seed => {
    socket.join(seed);
    const me = socket.id;

    const room = io.sockets.adapter.rooms[seed];
    const allUsers = Object.keys(room.sockets)


    // send socket id and all user id;
    io.to(seed).emit('room_joined', { me, usersConnected: allUsers }); // alert all user in room  
  })

  /**
   * Init objects
   */
  socket.on('objects_init', data => {
    socket.broadcast.to(data.room).emit('objects_initialized', {
      objectsPlaced: data.objectsPlaced
    })
  })

  /**
   * On disconnection
   */
  socket.on('disconnect', () => {
    io.emit('disconnection', { userID: socket.id });
  });


  /**
   * Broadcast position
   */
  socket.on('position', data => {
    socket.broadcast.to(data.room).emit('position_updated', { userID: socket.id, position: data.position });
  })

  /**
   * Broadcast object to add on scene
   */
  socket.on('object', data => {
    socket.broadcast.to(data.room).emit('object_added', { item: data.item });
  })

});
