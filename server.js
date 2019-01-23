const { performance } = require('perf_hooks');

const port = process.env.PORT || 4200;

const express = require('express');
const app = express();

const http = require('http').createServer(app);
const io = require('socket.io').listen(http);

const voiceModel = require('./voicemodel.json');

app.get('/model', (req ,res) => {
  res.json(voiceModel);
});

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

    // get users in room
    const allUsers = Object.keys(io.sockets.adapter.rooms[roomID].sockets);

    // init room on map if not present
    if (!rooms.has(roomID)) {
      rooms.set(roomID, {
        users: allUsers,
        objects: []
      });
    } else {
      // update users list
      rooms.set(roomID, {
        ...rooms.get(roomID),
        users: allUsers,
      })
    }

    // send socket id and all user id;
    io.to(roomID).emit('SV_SEND_JOIN_ROOM', {
      me,
      startTime,
      usersConnected: allUsers,
      allObjects: rooms.get(roomID).objects
    });
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
    // stock new objects on room data
    const room = rooms.get(data.roomID);
    const roomObjects = room.objects;
    roomObjects.push(data.item);
    rooms.set(data.roomID, { ...room, objects: roomObjects });

    socket.broadcast.to(data.roomID).emit('SV_SEND_ADD_OBJECT', { item: data.item });
  })

  /**
 * On disconnection
 */
  socket.on('disconnect', () => {
    const allRooms = rooms.entries();
    let room = allRooms.next();
    let roomID;
    let usersInRoom;
    while (!room.done) {
      roomID = room.value[0];
      usersInRoom = room.value[1].users;
      if (usersInRoom.includes(socket.id)) break;
      room = allRooms.next();
    }

    // delete user in room
    if (usersInRoom.length) usersInRoom.splice(usersInRoom.indexOf(socket.id), 1);
    if (!usersInRoom.length) rooms.delete(roomID);
    else rooms.set(roomID, {
      ...rooms.get(roomID),
      users: usersInRoom
    });

    socket.broadcast.to(roomID).emit('SV_SEND_DISCONNECTION', { userID: socket.id });
  });

});

http.listen(port, _ => console.log(`Listening on port ${port}`));

