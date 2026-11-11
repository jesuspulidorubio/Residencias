/**
 * SIGEV - Sistema de Gestion de Equipo y Vigencias (CFE)
 * Servidor HTTP sin dependencias externas: usa unicamente los modulos
 * integrados de Node.js (http, sqlite, crypto, fs).
 *
 * Arranque:
 *   npm start   ->  solo este equipo      http://localhost:3000
 *   npm run red ->  toda la red local     http://<IP-del-equipo>:3000
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { config, RAIZ, direccionesRed } from './src/config.js';
import { api } from './src/api.js';
import { usuarioDeToken, leerCookie, exigirPermiso } from './src/auth.js';
import { programarRevision } from './src/alertas.js';
import { ErrorApp } from './src/util.js';
import { leerConfiguracion, guardarConfiguracion } from './src/bd.js';

const PUBLICO = path.join(RAIZ, 'public');
const LIMITE_CUERPO = 8 * 1024 * 1024; // 8 MB (permite fotografias en base64)

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function responder(res, codigo, cuerpo, encabezados = {}) {
  res.writeHead(codigo, { 'X-Content-Type-Options': 'nosniff', ...encabezados });
  res.end(cuerpo);
}

function json(res, codigo, datos, encabezados = {}) {
  responder(res, codigo, JSON.stringify(datos), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...encabezados,
  });
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let bruto = '';
    req.on('data', (parte) => {
      bruto += parte;
      if (bruto.length > LIMITE_CUERPO) {
        reject(new ErrorApp('El contenido enviado es demasiado grande', 413));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!bruto) return resolve({});
      try {
        resolve(JSON.parse(bruto));
      } catch {
        reject(new ErrorApp('El formato de los datos enviados no es valido', 400));
      }
    });
    req.on('error', reject);
  });
}

/* ------------------------- Archivos estaticos ------------------------- */

function servirEstatico(req, res, ruta) {
  const relativa = ruta === '/' ? 'index.html' : decodeURIComponent(ruta).replace(/^\/+/, '');
  const destino = path.join(PUBLICO, relativa);

  // Evita salir de la carpeta public (path traversal).
  if (!destino.startsWith(PUBLICO)) return responder(res, 403, 'Acceso denegado');

  fs.readFile(destino, (err, datos) => {
    if (err) {
      // Rutas de la aplicacion de una sola pagina: se devuelve index.html
      if (!path.extname(destino)) {
        return fs.readFile(path.join(PUBLICO, 'index.html'), (e2, html) =>
          e2 ? responder(res, 404, 'No encontrado') : responder(res, 200, html, { 'Content-Type': TIPOS['.html'] })
        );
      }
      return responder(res, 404, 'No encontrado');
    }
    responder(res, 200, datos, {
      'Content-Type': TIPOS[path.extname(destino).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
  });
}

/* ----------------------------- Servidor ------------------------------ */

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  const ruta = url.pathname;

  if (!ruta.startsWith('/api/')) return servirEstatico(req, res, ruta);

  const coincidencia = api.buscar(req.method, ruta);
  if (!coincidencia) return json(res, 404, { error: 'Servicio no encontrado' });

  try {
    const token = leerCookie(req.headers.cookie, 'sigev_sesion');
    const usuario = await usuarioDeToken(token);

    if (coincidencia.permiso) exigirPermiso(usuario, coincidencia.permiso);

    const cuerpo = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await leerCuerpo(req) : {};
    const query = Object.fromEntries(url.searchParams);

    let cookiePendiente = null;
    const cookie = (valor) => {
      cookiePendiente = valor
        ? `sigev_sesion=${valor}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${config.horasSesion * 3600}`
        : 'sigev_sesion=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0';
    };

    const resultado = await coincidencia.manejador({
      req,
      res,
      params: coincidencia.params,
      query,
      cuerpo,
      usuario,
      token,
      cookie,
    });

    const encabezados = cookiePendiente ? { 'Set-Cookie': cookiePendiente } : {};

    // Descarga de archivos (CSV)
    if (resultado && resultado.__archivo) {
      return responder(res, 200, resultado.contenido, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${resultado.__archivo}"`,
        ...encabezados,
      });
    }

    json(res, 200, resultado ?? { ok: true }, encabezados);
  } catch (err) {
    const codigo = err instanceof ErrorApp ? err.codigo : 500;
    if (codigo === 500) console.error('Error interno:', err);
    json(res, codigo, { error: err.message ?? 'Error interno del servidor' });
  }
});

servidor.listen(config.puerto, config.host, () => {
  const enRed = config.host === '0.0.0.0' || config.host === '::';

  console.log('');
  console.log('  ============================================================');
  console.log('   SIGEV  |  Sistema de Gestion de Equipo y Vigencias  |  CFE');
  console.log('  ============================================================');
  console.log(`   En este equipo:  http://localhost:${config.puerto}`);

  if (enRed) {
    const tarjetas = direccionesRed();
    if (tarjetas.length) {
      console.log('   Desde otros dispositivos de la misma red:');
      for (const t of tarjetas) {
        console.log(`     http://${t.ip}:${config.puerto}   (${t.tarjeta})`);
      }
    } else {
      console.log('   Este equipo no tiene conexion de red activa.');
    }
  } else {
    console.log('   Solo accesible desde este equipo. Para abrirlo a la red: npm run red');
  }

  console.log(`   Base de datos:   ${config.rutaBD}`);
  console.log('  ------------------------------------------------------------');

  // Los correos de aviso llevan un enlace a la ficha del elemento. Si apunta
  // a localhost no le sirve a nadie mas, asi que al abrir el sistema a la red
  // se actualiza solo (se respeta cualquier direccion puesta a mano).
  if (enRed) {
    const actual = leerConfiguracion().url_sistema ?? '';
    if (/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(actual)) {
      guardarConfiguracion('url_sistema', config.urlPublica);
      console.log(`   Enlace de los correos actualizado a ${config.urlPublica}`);
    }
  }

  programarRevision();
});
