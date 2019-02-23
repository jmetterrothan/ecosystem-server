const { performance } = require('perf_hooks');

const port = process.env.PORT || 4200;

const express = require('express');
const cors = require('cors');
const app = express();

const voiceModel = require('./voicemodel.json');

app
  .use(cors())
  .use(express.static(__dirname + "/public"));

const http = require('http').createServer(app);
const io = require('socket.io').listen(http);

app.get('/', (req, res) => {
  res.send('welcome to the ecosystem-server !');
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
        objectsAdded: [],
        objectsRemoved: []
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
      objectsAdded: rooms.get(roomID).objectsAdded,
      objectsRemoved: rooms.get(roomID).objectsRemoved
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
    const roomObjects = room.objectsAdded;
    roomObjects.push(data.item);
    rooms.set(data.roomID, { ...room, objectsAdded: roomObjects });

    socket.broadcast.to(data.roomID).emit('SV_SEND_ADD_OBJECT', { item: data.item });
  })

  /**
   * Broadcat object to remove
   */
  socket.on('CL_SEND_REMOVE_OBJECT', data => {
    const room = rooms.get(data.roomID);
    const roomObjectsRemoved = room.objectsRemoved;
    roomObjectsRemoved.push(data.object);
    rooms.set(data.roomID, { ...room, objectsRemoved: roomObjectsRemoved });

    socket.broadcast.to(data.roomID).emit('SV_SEND_REMOVE_OBJECT', { object: data.object })
  });

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
      if (Array.isArray(usersInRoom) && usersInRoom.includes(socket.id)) break;
      room = allRooms.next();
    }

    // delete user in room
    if (Array.isArray(usersInRoom) && usersInRoom.length) usersInRoom.splice(usersInRoom.indexOf(socket.id), 1);
    if (Array.isArray(usersInRoom) && !usersInRoom.length) rooms.delete(roomID);
    else rooms.set(roomID, {
      ...rooms.get(roomID),
      users: usersInRoom
    });

    socket.broadcast.to(roomID).emit('SV_SEND_DISCONNECTION', { userID: socket.id });
  });

});

http.listen(port, _ => console.log(`Listening on port ${port}`));

