
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import WebTorrent from 'webtorrent';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server);
const client = new WebTorrent();

const PORT = process.env.PORT || 3000;
const downloadPath = path.join(__dirname, 'downloads');

if (!fs.existsSync(downloadPath)) {
  fs.mkdirSync(downloadPath);
}

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  console.log('New client connected', socket.id);

  socket.on('addTorrent', (magnetURI) => {
    client.add(magnetURI, { path: downloadPath }, (torrent) => {
      console.log('Torrent info hash:', torrent.infoHash);

      torrent.on('done', () => {
        console.log('Download complete');
        socket.emit('downloadComplete', { infoHash: torrent.infoHash });
      });

      torrent.on('download', (bytes) => {
        const progress = (torrent.progress * 100).toFixed(2);
        console.log(`Progress: ${progress}% | Downloaded: ${bytes} bytes`);
        socket.emit('progress', { infoHash: torrent.infoHash, progress, bytes });
      });

      torrent.on('error', (err) => {
        console.error('Torrent error:', err);
        socket.emit('error', { infoHash: torrent.infoHash, err });
      });

      torrent.on('wire', (wire, addr) => {
        console.log(`Connected to peer: ${addr}`);
      });

      torrent.on('noPeers', (announceType) => {
        console.warn(`No peers found via ${announceType}`);
      });

      let lastProgress = 0;
      setInterval(() => {
        const currentProgress = (torrent.progress * 100).toFixed(2);
        if (currentProgress === lastProgress && currentProgress !== '100.00') {
          console.warn(`Download stalled at ${currentProgress}%`);
        }
        lastProgress = currentProgress;
      }, 60000); // Check every minute

      setInterval(() => {
        torrent.discovery.announce();
      }, 600000); // Reannounce every 10 minutes
    });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
