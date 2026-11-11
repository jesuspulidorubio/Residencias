/**
 * Corrige los registros de Equipo de Seguridad que no cumplen las reglas de
 * cronologia de public/js/reglas.js. Los extintores ya las cumplen y no se tocan.
 *
 * Uso (con el servidor APAGADO, desde la carpeta del proyecto):
 *   node scripts/corregir-registros.mjs                  usa datos/sigev.db
 *   node scripts/corregir-registros.mjs ruta/otra.db     otra base
 *
 * Antes de modificar guarda una copia: <base>.respaldo-AAAAMMDD-HHMM
 * Es repetible: si un registro ya esta corregido, no cambia nada.
 */
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reglas = await import(path.join(raiz, 'public/js/reglas.js'));
const archivo = path.resolve(process.argv[2] ?? path.join(raiz, 'datos/sigev.db'));
if (!existsSync(archivo)) { console.error('No existe la base de datos:', archivo); process.exit(1); }

// codigo -> campos que cambian (solo fechas / frecuencia; nada de historial ajeno)
const CORRECCIONES = {
  // El proximo mantenimiento (ultimo + 6 meses) caia a menos de 30 dias de la caducidad: pasa a trimestral.
  'BOT-001': { frecuencia_meses: 3 },
  'EQ-0001': { frecuencia_meses: 3 },
  // Igual, con vigencia de un ano: pasa a semestral.
  'EQ-0004': { frecuencia_meses: 6 },
  // El ultimo mantenimiento (10/09/2026) era posterior a la caducidad (07/08/2026): vuelve al inicio de vigencia.
  'EQ-0002': { fecha_ultimo_mantenimiento: '2025-08-11' },
  // Adquisicion e inicio (21/01/2027) eran posteriores al ultimo mantenimiento (11/11/2026).
  'ARN-003': { fecha_adquisicion: '2026-11-01', fecha_inicio: '2026-11-01' },
};

const copia = `${archivo}.respaldo-${new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-')}`;
const db = new DatabaseSync(archivo);
db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
copyFileSync(archivo, copia);
console.log('Respaldo:', copia, '\n');

for (const [codigo, cambios] of Object.entries(CORRECCIONES)) {
  const r = db.prepare('SELECT * FROM equipos WHERE codigo = ?').get(codigo);
  if (!r) { console.log(codigo.padEnd(8), 'no existe en esta base, se omite'); continue; }
  const pendientes = Object.entries(cambios).filter(([k, v]) => r[k] !== v);
  if (!pendientes.length) { console.log(codigo.padEnd(8), 'ya estaba corregido'); continue; }
  db.prepare(`UPDATE equipos SET ${pendientes.map(([k]) => `${k} = ?`).join(', ')} WHERE codigo = ?`).run(...pendientes.map(([, v]) => v), codigo);
  for (const [k, v] of pendientes) console.log(codigo.padEnd(8), k.padEnd(28), `${r[k]} -> ${v}`);
}

console.log('\nVerificacion con las reglas del sistema:');
let malos = 0;
for (const [modulo, tabla] of [['extintores', 'extintores'], ['equipos', 'equipos']]) {
  for (const r of db.prepare(`SELECT * FROM ${tabla} ORDER BY id`).all()) {
    const { error } = reglas.validarRegistro(modulo, r, {}, reglas.hoyISO());
    if (error) { malos++; console.log('  VIOLA', modulo, r.codigo, '-', error); }
  }
}
console.log(malos ? `\n${malos} registro(s) aun incumplen.` : '  Todos los extintores y equipos cumplen las reglas.');
db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
db.close();
