const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const apiHandler = require('./api/data.js');

const PORT = process.env.PORT || 8085;
const PUBLIC_DIR = __dirname;

const mimeTypes = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'text/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.csv': 'text/csv; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  let pathname = decodeURIComponent(url.parse(req.url).pathname);

  // API endpoints
  if (pathname === '/api/data' || pathname === '/api/config') {
    try {
      delete require.cache[require.resolve('./api/data.js')];
    } catch (e) {}
    return require('./api/data.js')(req, res);
  }

  if (pathname === '/') pathname = '/index.html';

  const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': mimeTypes[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log('========================================================');
  console.log('🚀 Dashboard Performance Agen Mandiri berjalan di:');
  console.log('✨ http://localhost:' + PORT + '/');
  console.log('📊 Port terisolasi khusus - tidak bentrok dengan merchant');
  console.log('========================================================');
});
