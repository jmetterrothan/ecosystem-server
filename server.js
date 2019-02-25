const { uniqueNamesGenerator } = require('unique-names-generator');

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

  /**
   * Join room
   */
  socket.on('CL_SEND_JOIN_ROOM', roomID => {
    socket.join(roomID);

    const me = {
      id: socket.id,
      name: uniqueNamesGenerator('-', Math.random() < 0.5),
      color: `rgb(${Math.floor(Math.random() * 256)}, ${Math.floor(Math.random() * 256)}, ${Math.floor(Math.random() * 256)})`
    };

    // init room on map if not present
    if (!rooms.has(roomID)) {
      rooms.set(roomID, {
        users: [me],
        objectsAdded: [],
        objectsRemoved: [],
        startTime: Date.now()
      });
    } else {
      // update users list
      const room = rooms.get(roomID);
      rooms.set(roomID, {
        ...room,
        users: [...room.users, me],
      })
    }

    // send socket id and all user id;
    const room = rooms.get(roomID);
    io.to(roomID).emit('SV_SEND_JOIN_ROOM', {
      me,
      startTime: room.startTime,
      usersConnected: room.users,
      objectsAdded: room.objectsAdded,
      objectsRemoved: room.objectsRemoved
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
    if (!room) {
      console.log(`room ${roomID} does not exist`)
      return;
    }

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
    if (!room) {
      console.log(`room ${roomID} does not exist`)
      return;
    }

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

