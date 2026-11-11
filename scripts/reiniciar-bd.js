/**
 * Reinicia la base de datos: elimina el archivo actual y vuelve a crear
 * el esquema con la informacion de demostracion.
 *
 *   npm run reiniciar-bd
 */
import fs from 'node:fs';
import { config } from '../src/config.js';

for (const sufijo of ['', '-wal', '-shm']) {
  const archivo = `${config.rutaBD}${sufijo}`;
  if (fs.existsSync(archivo)) {
    fs.unlinkSync(archivo);
    console.log(`  Eliminado: ${archivo}`);
  }
}

await import('../src/bd.js');
console.log('  Base de datos reiniciada correctamente.');
