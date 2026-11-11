/**
 * Servidor estatico para probar el MODO DEMOSTRACION antes de publicarlo.
 *
 * Sirve unicamente la carpeta public/ sin exponer la API, que es exactamente
 * lo que hace GitHub Pages. La aplicacion detecta que no hay servidor y
 * arranca con el servidor simulado del navegador.
 *
 *   npm run demo   ->  http://127.0.0.1:3100
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ } from '../src/config.js';

const PUERTO = Number(process.env.PORT ?? 3100);
const PUBLICO = path.join(RAIZ, 'public');

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

http
  .createServer((req, res) => {
    const ruta = new URL(req.url, 'http://localhost').pathname;
    const destino = path.join(PUBLICO, ruta === '/' ? 'index.html' : decodeURIComponent(ruta).replace(/^\/+/, ''));

    if (!destino.startsWith(PUBLICO)) {
      res.writeHead(403).end('Acceso denegado');
      return;
    }

    fs.readFile(destino, (err, datos) => {
      if (err) {
        // Igual que GitHub Pages: lo que no existe responde 404 en HTML.
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>404</h1>');
        return;
      }
      res.writeHead(200, {
        'Content-Type': TIPOS[path.extname(destino).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(datos);
    });
  })
  .listen(PUERTO, '127.0.0.1', () => {
    console.log('');
    console.log('  SIGEV - modo demostracion (sin servidor ni base de datos)');
    console.log(`  http://127.0.0.1:${PUERTO}`);
    console.log('  Acceso: admin / demo');
    console.log('');
  });
