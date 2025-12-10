// Minimal health check script - no external dependencies
const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3030,
  path: '/',
  method: 'GET',
  timeout: 5000,
};

const req = http.request(options, (res) => {
  process.exit(res.statusCode >= 200 && res.statusCode < 400 ? 0 : 1);
});

req.on('error', () => process.exit(1));
req.on('timeout', () => {
  req.destroy();
  process.exit(1);
});

req.end();


