const http = require('http');
const path = require('path');
const express = require('express');
const app = express();
const httpServer = http.createServer(app);
const SimpleNodeLogger = require('simple-node-logger'),
      opts = {
        logFilePath:'./log/server.log',
        timestampFormat:'YYYY-MM-DD HH:mm:ss.SSS'
      },
      log = SimpleNodeLogger.createSimpleLogger( opts );
const dirname = path.resolve();

app.get('*', (req, res, next) => {
  const path = '/sfu/'

  console.log("/sfu ", req.params);

  if (req.path.indexOf(path) == 0 && req.path.length > path.length) return next()

  res.send(`You need to specify a room name in the path e.g. 'https://127.0.0.1/sfu/room'`)
})

app.use('/sfu/:room/:token', express.static(path.join(dirname, 'public')))

const PORT = 3952 || process.env.PORT;

// 404
app.use('*', (req, res) => {
  return res.status(404).json({
    success: false,
    message: 'Route not found'
  })
});

httpServer.listen(PORT);


/** Event listener for HTTP server "listening" event. */
httpServer.on("listening", () => {
console.log(`Server running on port ${PORT}`)
});