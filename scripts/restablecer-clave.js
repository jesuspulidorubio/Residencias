/**
 * Restablece la contrasena de un usuario del sistema.
 *
 * Se usa cuando se perdio el acceso y no queda ninguna otra cuenta de
 * Administrador con la que entrar. Solo funciona con acceso al equipo y al
 * archivo de la base de datos: no expone nada hacia la red.
 *
 *   npm run clave -- admin MiContrasenaNueva
 *   node scripts/restablecer-clave.js admin MiContrasenaNueva
 *
 * La contrasena se guarda cifrada con scrypt, igual que las demas; en la
 * base de datos nunca queda el texto original.
 */
import { bd } from '../src/bd.js';
import { crearHash } from '../src/auth.js';
import { ROLES } from '../src/config.js';

const [usuario, contrasena] = process.argv.slice(2);

if (!usuario || !contrasena) {
  console.log('');
  console.log('  Uso:  npm run clave -- <usuario> <contrasena-nueva>');
  console.log('  Ej.:  npm run clave -- admin MiContrasenaNueva');
  console.log('');
  console.log('  Cuentas registradas:');
  for (const u of bd.prepare('SELECT usuario, nombre, rol, activo FROM usuarios ORDER BY usuario').all()) {
    console.log(`    ${u.usuario.padEnd(16)} ${(ROLES[u.rol] ?? u.rol).padEnd(28)} ${u.activo ? '' : '(inactivo)'}`);
  }
  console.log('');
  process.exit(1);
}

if (contrasena.length < 6) {
  console.error('  La contrasena debe tener al menos 6 caracteres.');
  process.exit(1);
}

const fila = bd.prepare('SELECT id, usuario, nombre, rol FROM usuarios WHERE usuario = ?').get(usuario);

if (!fila) {
  console.error(`  No existe ningun usuario llamado "${usuario}".`);
  console.error('  Ejecute el comando sin argumentos para ver las cuentas registradas.');
  process.exit(1);
}

bd.prepare('UPDATE usuarios SET hash = ?, activo = 1 WHERE id = ?').run(crearHash(contrasena), fila.id);
bd.prepare(
  "INSERT INTO bitacora (usuario, accion, modulo, detalle) VALUES ('sistema', 'Seguridad', 'Usuarios', ?)"
).run(`Contrasena de ${fila.usuario} restablecida desde la consola del equipo`);

console.log('');
console.log(`  Contrasena actualizada para "${fila.usuario}" (${fila.nombre}).`);
console.log(`  Perfil: ${ROLES[fila.rol] ?? fila.rol}`);
console.log('  La cuenta quedo activa. Puede entrar con la contrasena nueva.');
console.log('');
