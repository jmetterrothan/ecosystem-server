const { uniqueNamesGenerator } = require('unique-names-generator');

const port = process.env.PORT || 4200;

const express = require('express');
const path = require('path');

const app = express();

const http = require('http').createServer(app);
const io = require('socket.io').listen(http);

app.get('/', (req, res) => {
  res.send('welcome to the ecosystem-server !');
});

// MULTIPLAYER

const rooms = new Map();

const messagesSize = -16;

const colors = ["rgb(150, 226, 221)", "rgb(255, 194, 209)", "rgb(101, 227, 103)", "rgb(255, 203, 63)", "rgb(248, 125, 123)", "rgb(94, 214, 253)", "rgb(58, 144, 179)", "rgb(255, 189, 113)", "rgb(9, 204, 189)", "rgb(120, 200, 151)", "rgb(191, 131, 193)", "rgb(247, 5, 114)"];

io.on('connection', socket => {

  console.log('new user connected');

  /**
   * Join room
   */
  socket.on('CL_SEND_JOIN_ROOM', roomID => {
    socket.join(roomID);

    const me = {
      id: socket.id,
      name: uniqueNamesGenerator('-', true),
      color: !rooms.has(roomID)
        ? colors[0]
        : colors[rooms.get(roomID).colorIndex] || `rgb(${Math.floor(Math.random() * 256)}, ${Math.floor(Math.random() * 256)}, ${Math.floor(Math.random() * 256)})`
    };

    const connectionSystemMessage = {
      type: 'connection',
      user: me,
      content: '',
      id: Date.now()
    };

    // init room on map if not present
    if (!rooms.has(roomID)) {
      rooms.set(roomID, {
        users: [me],
        objectsAdded: [],
        objectsRemoved: [],
        messages: [connectionSystemMessage],
        startTime: Date.now(),
        colorIndex: 1
      });
    } else {
      // update users list
      const room = rooms.get(roomID);
      rooms.set(roomID, {
        ...room,
        colorIndex: room.colorIndex + 1,
        messages: [...room.messages, connectionSystemMessage].slice(messagesSize),
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
      objectsRemoved: room.objectsRemoved,
      messages: room.messages
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
      console.log(`room ${data.roomID} does not exist`);
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
      console.log(`room ${data.roomID} does not exist`);
      return;
    }

    const roomObjectsRemoved = room.objectsRemoved;
    roomObjectsRemoved.push(data.object);
    rooms.set(data.roomID, { ...room, objectsRemoved: roomObjectsRemoved });

    socket.broadcast.to(data.roomID).emit('SV_SEND_REMOVE_OBJECT', { object: data.object });
  });

  /**
   * Add message and broadcast it
   */
  socket.on('CL_SEND_MESSAGE', data => {
    const room = rooms.get(data.roomID);
    if (!room) {
      console.log(`room ${data.roomID} does not exist`);
      return;
    }

    const messages = room.messages;
    messages.push({
      type: data.type,
      id: Date.now(),
      user: data.user,
      content: data.message
    });

    rooms.set(data.roomID, { ...room, messages: messages.slice(messagesSize) });
    io.to(data.roomID).emit('SV_SEND_MESSAGES', messages);
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
      if (Array.isArray(usersInRoom) && usersInRoom.some(user => user.id === socket.id)) break;
      room = allRooms.next();
    }

    const user = usersInRoom.find(user => user.id === socket.id);

    if (!user) {
      console.log(`${socket.id} not found in ${roomID}`, `all users = ${usersInRoom}`);
      return;
    }

    const disconnectionSystemMessage = {
      user,
      type: 'disconnection',
      content: '',
      id: Date.now()
    };

    // delete user in room
    if (Array.isArray(usersInRoom) && usersInRoom.length > 0) {
      usersInRoom.splice(usersInRoom.indexOf(user), 1);
      const currentRoom = rooms.get(roomID);
      rooms.set(roomID, {
        ...currentRoom,
        messages: [...currentRoom.messages, disconnectionSystemMessage].slice(messagesSize),
        users: usersInRoom
      });
    }

    socket.broadcast.to(roomID).emit('SV_SEND_DISCONNECTION', { userID: socket.id, messages: rooms.get(roomID).messages });

    if (Array.isArray(usersInRoom) && usersInRoom.length === 0) {
      rooms.delete(roomID);
    }
  });

});

http.listen(port, _ => console.log(`Listening on port ${port}`));
