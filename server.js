const uniqid = require('uniqid');

const http = require('http').createServer().listen(4200, 'localhost');
const io = require('socket.io').listen(http);

io.on('connection', ws => {

  // send unique id when user connected
  const uid = uniqid();
  io.emit('user_id', uid);

  ws.on('message', message => {
    // console.log(message);
  });

  ws.on('broadcast', players => {
    ws.broadcast.emit('update_position', ...players);
  })

  ws.on('disconnect', () => console.log('user disconnected'));

});
