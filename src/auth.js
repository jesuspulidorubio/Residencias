/**
 * Autenticacion y control de acceso.
 * Las contrasenas se guardan con scrypt + sal aleatoria (nunca en texto plano).
 * La sesion se maneja con un token aleatorio guardado en cookie HttpOnly.
 */
import crypto from 'node:crypto';
import { config, puedeModulo, modulosDe, NOMBRE_MODULO } from './config.js';
import { ErrorApp } from './util.js';

const PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };

/** Genera el hash almacenable: scrypt$sal$derivada */
export function crearHash(contrasena) {
  const sal = crypto.randomBytes(16).toString('hex');
  const derivada = crypto.scryptSync(contrasena, sal, PARAMS.keylen, PARAMS).toString('hex');
  return `scrypt$${sal}$${derivada}`;
}

/** Compara en tiempo constante la contrasena contra el hash guardado. */
export function verificarHash(contrasena, guardado) {
  try {
    const [algoritmo, sal, derivada] = String(guardado).split('$');
    if (algoritmo !== 'scrypt' || !sal || !derivada) return false;
    const calculada = crypto.scryptSync(contrasena, sal, PARAMS.keylen, PARAMS);
    const esperada = Buffer.from(derivada, 'hex');
    return calculada.length === esperada.length && crypto.timingSafeEqual(calculada, esperada);
  } catch {
    return false;
  }
}

/* -------------------------- Sesiones -------------------------- */

function ahora() {
  return new Date();
}

function aTexto(fecha) {
  return fecha.toISOString().slice(0, 19).replace('T', ' ');
}

export async function iniciarSesion(usuario, contrasena) {
  const { bd } = await import('./bd.js');
  const fila = bd.prepare('SELECT * FROM usuarios WHERE usuario = ?').get(String(usuario ?? '').trim());
  if (!fila || !fila.activo || !verificarHash(String(contrasena ?? ''), fila.hash)) {
    throw new ErrorApp('Usuario o contrasena incorrectos', 401);
  }

  const token = crypto.randomBytes(32).toString('hex');
  const creada = ahora();
  const expira = new Date(creada.getTime() + config.horasSesion * 3600000);
  bd.prepare('INSERT INTO sesiones (token, usuario_id, creada_en, expira_en) VALUES (?, ?, ?, ?)').run(
    token,
    fila.id,
    aTexto(creada),
    aTexto(expira)
  );
  bd.prepare("UPDATE usuarios SET ultimo_acceso = datetime('now','localtime') WHERE id = ?").run(fila.id);
  limpiarSesionesVencidas(bd);

  return { token, usuario: publico(fila) };
}

export async function cerrarSesion(token) {
  if (!token) return;
  const { bd } = await import('./bd.js');
  bd.prepare('DELETE FROM sesiones WHERE token = ?').run(token);
}

export async function usuarioDeToken(token) {
  if (!token) return null;
  const { bd } = await import('./bd.js');
  const sesion = bd.prepare('SELECT * FROM sesiones WHERE token = ?').get(token);
  if (!sesion) return null;
  if (new Date(sesion.expira_en.replace(' ', 'T')) < ahora()) {
    bd.prepare('DELETE FROM sesiones WHERE token = ?').run(token);
    return null;
  }
  const fila = bd.prepare('SELECT * FROM usuarios WHERE id = ? AND activo = 1').get(sesion.usuario_id);
  return fila ? publico(fila) : null;
}

function limpiarSesionesVencidas(bd) {
  bd.prepare("DELETE FROM sesiones WHERE expira_en < datetime('now')").run();
}

/** Version del usuario sin datos sensibles (sin hash). */
export function publico(fila) {
  return {
    id: fila.id,
    usuario: fila.usuario,
    nombre: fila.nombre,
    correo: fila.correo,
    rol: fila.rol,
    modulos: modulosDe(fila.rol),
    activo: !!fila.activo,
    ultimo_acceso: fila.ultimo_acceso,
    creado_en: fila.creado_en,
  };
}

/**
 * Control de acceso por permiso, no por jerarquia.
 *
 *   'lectura'            -> cualquier usuario con sesion iniciada
 *   'admin'              -> solo el Administrador
 *   { modulo: 'gafetes'} -> perfiles que administran ese modulo
 */
export function exigirPermiso(usuario, permiso) {
  if (!usuario) throw new ErrorApp('Sesion no iniciada', 401);
  if (!permiso || permiso === 'lectura') return;

  if (permiso === 'admin') {
    if (usuario.rol !== 'admin') {
      throw new ErrorApp('Esta seccion es exclusiva del Administrador', 403);
    }
    return;
  }

  if (permiso.modulo) {
    if (!puedeModulo(usuario.rol, permiso.modulo)) {
      throw new ErrorApp(
        `Su perfil no tiene asignado el modulo de ${NOMBRE_MODULO[permiso.modulo] ?? permiso.modulo}`,
        403
      );
    }
  }
}

/** Lee una cookie del encabezado. */
export function leerCookie(encabezado, nombre) {
  if (!encabezado) return null;
  for (const parte of encabezado.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nombre) return decodeURIComponent(v.join('='));
  }
  return null;
}
