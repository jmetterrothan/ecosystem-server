const { uniqueNamesGenerator } = require('unique-names-generator');

const port = process.env.PORT || 4200;
const db = "mongodb://admin:9y5qiPvYO1s1@ds135384.mlab.com:35384/3d-ecosystems";

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require("mongoose");
const fs = require('fs-extra');
const path = require('path');
const tf = require('@tensorflow/tfjs-node');

const app = express();

app
  .use(cors())
  .use(express.static(__dirname + "/public"))
  .use(bodyParser.json({ limit: '250mb' }))
  .use(bodyParser.urlencoded({ limit: '250mb', extended: true }));

const http = require('http').createServer(app);
const io = require('socket.io').listen(http);

// DATABASE

mongoose.connect(db, { useNewUrlParser: true }, err => { if (err) console.log('ERROR :', err); });

const voiceModelTemplate = mongoose.model("voiceModel", {
  data: String
});

const voiceSamplesTemplate = mongoose.model("voiceSamples", {
  data: Object
});

const voiceModelBinTemplate = mongoose.model("voiceModelBin", {
  data: Buffer
});

// ROUTING

app.get('/', (req, res) => {
  res.send('welcome to the ecosystem-server !');
});

app.post('/uploadModel', (req, res) => {
  const data = req.body;
  console.log(data);
  res.status(200).send('model successfully received by the server !');
});

app.post('/collect', (req, res) => {
  const data = JSON.stringify(req.body);
  const voiceSamples = new voiceSamplesTemplate({ data });
  voiceSamples.save();
  res.status(200).send('successfully collected samples !');
});

app.get('/trainModel', async (req, res) => {
  const samples =
    await voiceSamplesTemplate.find({}).exec();

  if (!samples) {
    res.send('no samples found in the database');
    return;
  }

  await trainModel();

  res.send('Model training finished');
});

// TENSORFLOW

const NUM_FRAMES = 5;
const INPUT_SHAPE = [NUM_FRAMES, 232, 1];

function flatten(tensors) {
  const size = Object.keys(tensors[0]).length;
  const result = new Float32Array(tensors.length * size);
  tensors.forEach((arr, i) => {
    result.set(arr, i * size);
  });
  return result;
}

async function train(model, samples) {
  const examples = JSON.parse(samples[0].data);

  const ys = tf.oneHot(examples.map(e => parseInt(e.label, 10)), 3);
  const xsShape = [examples.length, ...INPUT_SHAPE];
  const xs = await tf.tensor(flatten(examples.map(e => e.vals)), xsShape);

  await model.fit(xs, ys, {
    batchSize: 16,
    epochs: 10,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        console.log(`Accuracy: ${(logs.acc * 100).toFixed(1)}% Epoch: ${epoch + 1}`);
      }
    }
  });
  tf.dispose([xs, ys]);

  await model.save('file://' + path.join(__dirname, '/public/'));

  const voiceModel = await fs.readJson('./public/model.json');
  const voiceModelDocument = new voiceModelTemplate({ data: JSON.stringify(voiceModel) });
  voiceModelDocument.save();

  const voiceModelBin =
    await fs.readFile(path.join(__dirname, '/public', 'weights.bin'));
  const voiceModelDocumentBin = new voiceModelBinTemplate({ data: voiceModelBin });
  voiceModelDocumentBin.save();
}

async function trainModel() {
  const voiceModel =
    await voiceModelTemplate.findOne(
      {}, {}, { sort: { 'created_at': -1 } }
    ).exec();

  await fs.writeFile(path.join(__dirname, '/public', 'voicemodel.json'),
    voiceModel.data);

  const voiceModelBin =
    await voiceModelBinTemplate.findOne(
      {}, {}, { sort: { 'created_at': -1 } }
    ).exec();


  await fs.writeFile(path.join(__dirname, '/public', 'voicemodel.weights.bin'),
    voiceModelBin.data);

  const samples =
    await voiceSamplesTemplate.find({}).exec();

  voiceSamplesTemplate.deleteMany({});

  const tfVoiceModel = await tf.loadModel('http://localhost:4200/voicemodel.json');

  tfVoiceModel.compile({
    optimizer: tf.train.adam(0.01),
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy']
  });

  await train(tfVoiceModel, samples);
}


// MULTIPLAYER

let startTime;
const rooms = new Map();

const messagesSize = -16;

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
      color: `rgb(${Math.floor(Math.random() * 256)}, ${Math.floor(Math.random() * 256)}, ${Math.floor(Math.random() * 256)})`
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
        startTime: Date.now()
      });
    } else {
      // update users list
      const room = rooms.get(roomID);
      rooms.set(roomID, {
        ...room,
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
      console.log(`room ${roomID} does not exist`);
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
      console.log(`room ${roomID} does not exist`);
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
      console.log(`room ${roomID} does not exist`);
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
      if (Array.isArray(usersInRoom) && usersInRoom.includes(socket.id)) break;
      room = allRooms.next();
    }

    const disconnectionSystemMessage = {
      type: 'disconnection',
      user: usersInRoom.find(user => user.id === socket.id),
      content: '',
      id: Date.now()
    };

    // delete user in room
    if (Array.isArray(usersInRoom) && usersInRoom.length) {
      usersInRoom.splice(usersInRoom.findIndex(user => user.id === socket.id), 1);
      const currentRoom = rooms.get(roomID);
      rooms.set(roomID, {
        ...currentRoom,
        messages: [...currentRoom.messages, disconnectionSystemMessage].slice(messagesSize),
        users: usersInRoom
      });
      socket.broadcast.to(roomID).emit('SV_SEND_DISCONNECTION', { userID: socket.id, messages: rooms.get(roomID).messages });
    }
    if (Array.isArray(usersInRoom) && usersInRoom.length === 0) {
      rooms.delete(roomID);
    }
  });

});

http.listen(port, _ => console.log(`Listening on port ${port}`));
