const WebSocketServer = require('ws').Server;
const wss = new WebSocketServer({ port: 4200 });

wss.on('connection', ws => {

  ws.on('message', message => {
    // console.log(message);
  })


  ws.on('close', () => {
    console.log('user déconnecté');
  })

})
