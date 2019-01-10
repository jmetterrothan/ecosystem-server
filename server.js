const uniqid = require('uniqid');

const http = require('http').createServer().listen(4200, 'localhost');
const io = require('socket.io').listen(http);

io.on('connection', socket => {

  console.log('new user connected');

  /**
   * Join room
   */
  socket.on('room', seed => {
    socket.join(seed);
    const userCount = io.sockets.adapter.rooms[seed].length;
    io.to(seed).emit('room_joined', userCount); // alert room
  })

  /**
   * On disconnection
   */
  socket.on('disconnect', () => console.log('----------------------'));
});
