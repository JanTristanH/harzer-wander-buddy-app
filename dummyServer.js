// server.js
const http = require('http');
const server = http.createServer((req, res) => res.end('Hello World'));
server.listen(8080, '0.0.0.0', () => {
  console.log('Listening on', server.address());
});
