/**
 * Capa de base de datos: SQLite integrado en Node (node:sqlite).
 * Crea el esquema si no existe y siembra datos de demostracion la
 * primera vez que se ejecuta el sistema.
 */
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { crearHash } from './auth.js';
import { hoyISO, sumarDias, sumarMeses } from './util.js';

fs.mkdirSync(path.dirname(config.rutaBD), { recursive: true });

export const bd = new DatabaseSync(config.rutaBD);
bd.exec('PRAGMA journal_mode = WAL');
bd.exec('PRAGMA foreign_keys = ON');

/* ------------------------------------------------------------------ */
/* Esquema                                                             */
/* ------------------------------------------------------------------ */

bd.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario       TEXT NOT NULL UNIQUE,
  nombre        TEXT NOT NULL,
  correo        TEXT NOT NULL DEFAULT '',
  rol           TEXT NOT NULL DEFAULT 'consulta',
  hash          TEXT NOT NULL,
  activo        INTEGER NOT NULL DEFAULT 1,
  creado_en     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  ultimo_acceso TEXT
);

CREATE TABLE IF NOT EXISTS sesiones (
  token      TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  creada_en  TEXT NOT NULL,
  expira_en  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS empleados (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  rpe            TEXT NOT NULL UNIQUE,
  nombre         TEXT NOT NULL,
  puesto         TEXT NOT NULL DEFAULT '',
  departamento   TEXT NOT NULL DEFAULT '',
  centro_trabajo TEXT NOT NULL DEFAULT '',
  correo         TEXT NOT NULL DEFAULT '',
  telefono       TEXT NOT NULL DEFAULT '',
  tipo_sangre    TEXT NOT NULL DEFAULT '',
  foto           TEXT,
  activo         INTEGER NOT NULL DEFAULT 1,
  creado_en      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS gafetes (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  folio              TEXT NOT NULL UNIQUE,
  empleado_id        INTEGER NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  tipo               TEXT NOT NULL DEFAULT 'Empleado',
  nivel_acceso       TEXT NOT NULL DEFAULT 'General',
  fecha_emision      TEXT NOT NULL,
  fecha_vencimiento  TEXT NOT NULL,
  estado             TEXT NOT NULL DEFAULT 'Activo',
  observaciones      TEXT NOT NULL DEFAULT '',
  creado_en          TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS extintores (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo                   TEXT NOT NULL UNIQUE,
  tipo                     TEXT NOT NULL DEFAULT 'PQS',
  capacidad_kg             REAL NOT NULL DEFAULT 0,
  marca                    TEXT NOT NULL DEFAULT '',
  ubicacion                TEXT NOT NULL DEFAULT '',
  area                     TEXT NOT NULL DEFAULT '',
  fecha_fabricacion        TEXT,
  fecha_recarga            TEXT,
  fecha_prox_recarga       TEXT NOT NULL,
  fecha_prueba_hidrostatica TEXT,
  fecha_prox_hidrostatica  TEXT,
  responsable_id           INTEGER REFERENCES empleados(id) ON DELETE SET NULL,
  estado                   TEXT NOT NULL DEFAULT 'Operativo',
  observaciones            TEXT NOT NULL DEFAULT '',
  creado_en                TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS equipos (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo              TEXT NOT NULL UNIQUE,
  nombre              TEXT NOT NULL,
  categoria           TEXT NOT NULL DEFAULT 'Equipo de proteccion personal',
  marca               TEXT NOT NULL DEFAULT '',
  modelo              TEXT NOT NULL DEFAULT '',
  serie               TEXT NOT NULL DEFAULT '',
  ubicacion           TEXT NOT NULL DEFAULT '',
  responsable_id      INTEGER REFERENCES empleados(id) ON DELETE SET NULL,
  fecha_adquisicion   TEXT,
  fecha_vencimiento   TEXT NOT NULL,
  frecuencia_meses    INTEGER NOT NULL DEFAULT 0,
  fecha_ultimo_mantenimiento TEXT,
  estado              TEXT NOT NULL DEFAULT 'En servicio',
  observaciones       TEXT NOT NULL DEFAULT '',
  creado_en           TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS notificaciones (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  clave          TEXT NOT NULL UNIQUE,
  modulo         TEXT NOT NULL,
  registro_id    INTEGER NOT NULL,
  referencia     TEXT NOT NULL,
  concepto       TEXT NOT NULL,
  titulo         TEXT NOT NULL,
  mensaje        TEXT NOT NULL,
  severidad      TEXT NOT NULL,
  fecha_objetivo TEXT NOT NULL,
  dias_restantes INTEGER NOT NULL,
  leida          INTEGER NOT NULL DEFAULT 0,
  correo_enviado INTEGER NOT NULL DEFAULT 0,
  creada_en      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS bitacora (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario       TEXT NOT NULL DEFAULT 'sistema',
  accion        TEXT NOT NULL,
  modulo        TEXT NOT NULL,
  detalle       TEXT NOT NULL DEFAULT '',
  fecha         TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS configuracion (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS licencias (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  numero            TEXT NOT NULL UNIQUE,
  empleado_id       INTEGER NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  tipo              TEXT NOT NULL DEFAULT 'Chofer',
  ambito            TEXT NOT NULL DEFAULT 'Estatal',
  autoridad         TEXT NOT NULL DEFAULT '',
  fecha_inicio      TEXT NOT NULL,
  fecha_vencimiento TEXT NOT NULL,
  restricciones     TEXT NOT NULL DEFAULT '',
  estado            TEXT NOT NULL DEFAULT 'Vigente',
  observaciones     TEXT NOT NULL DEFAULT '',
  creado_en         TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Control de los correos ya enviados: evita repetir el mismo aviso.
-- La clave es modulo:registro:concepto:fecha_objetivo:umbral
CREATE TABLE IF NOT EXISTS avisos_correo (
  clave         TEXT PRIMARY KEY,
  modulo        TEXT NOT NULL,
  registro_id   INTEGER NOT NULL,
  referencia    TEXT NOT NULL,
  umbral        INTEGER NOT NULL,
  destinatarios TEXT NOT NULL DEFAULT '',
  resultado     TEXT NOT NULL DEFAULT '',
  enviado_en    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Umbrales de aviso configurables por tipo de elemento
CREATE TABLE IF NOT EXISTS tipos_alerta (
  clave        TEXT PRIMARY KEY,
  nombre       TEXT NOT NULL,
  dias_proximo INTEGER NOT NULL DEFAULT 30,
  dias_critico INTEGER NOT NULL DEFAULT 7,
  orden        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_gafetes_venc     ON gafetes(fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_extintores_venc  ON extintores(fecha_prox_recarga);
CREATE INDEX IF NOT EXISTS idx_equipos_venc     ON equipos(fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_licencias_venc   ON licencias(fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_notif_leida      ON notificaciones(leida, creada_en);
`);

/* ------------------------------------------------------------------ */
/* Migraciones para bases de datos creadas con versiones anteriores    */
/* ------------------------------------------------------------------ */

function agregarColumna(tabla, columna, definicion) {
  const columnas = bd.prepare(`PRAGMA table_info(${tabla})`).all();
  if (!columnas.some((c) => c.name === columna)) {
    bd.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
  }
}

// El anteproyecto exige registrar la fecha de inicio de la vigencia, no solo
// la de caducidad. En gafetes es la emision y en extintores la ultima recarga.
agregarColumna('equipos', 'fecha_inicio', 'TEXT');
agregarColumna('equipos', 'tipo_alerta', "TEXT NOT NULL DEFAULT 'equipo'");

// Los perfiles dejaron de ser jerarquicos (consulta < supervisor < admin) y
// pasaron a repartirse por modulo. El antiguo "supervisor" administraba todo,
// asi que se convierte en Jefe de Seguridad, que es una asignacion menor.
bd.prepare("UPDATE usuarios SET rol = 'seguridad' WHERE rol = 'supervisor'").run();

// La categoria "Insumo con caducidad" se retiro del catalogo por ambigua: no
// describia el elemento, solo que caducaba. Los registros que la usaban se
// reasignan a la categoria que les corresponde segun su tipo de alerta, para
// que ninguno quede con una categoria que ya no existe en el formulario.
const CATEGORIA_RETIRADA = 'Insumo con caducidad';
const porTipo = {
  botiquin: 'Botiquin de primeros auxilios',
  arnes: 'Arnes de seguridad',
  extintor: 'Equipo contra incendio',
};
const heredados = bd
  .prepare('SELECT id, nombre, tipo_alerta FROM equipos WHERE categoria = ?')
  .all(CATEGORIA_RETIRADA);

if (heredados.length) {
  const reasignar = bd.prepare('UPDATE equipos SET categoria = ? WHERE id = ?');
  for (const e of heredados) {
    const destino =
      porTipo[e.tipo_alerta] ??
      (/extintor/i.test(e.nombre) ? 'Equipo contra incendio' : 'Equipo de proteccion personal');
    reasignar.run(destino, e.id);
  }
  console.log(`  Migrados ${heredados.length} equipo(s) desde la categoria "${CATEGORIA_RETIRADA}".`);
}

// "Equipo contra incendio" salio del catalogo de Equipo de Seguridad porque
// el modulo Extintores ya cubre ese material, con su propio ciclo de recarga
// y prueba hidrostatica. Los registros que la usaran NO se reasignan a otra
// categoria: se dan de alta en extintores, que es su lugar correcto, y se
// eliminan de equipos.
const contraIncendio = bd
  .prepare("SELECT * FROM equipos WHERE categoria = 'Equipo contra incendio'")
  .all();

if (contraIncendio.length) {
  const agentePorNombre = (nombre) => {
    const t = String(nombre).toLowerCase();
    if (t.includes('co2') || t.includes('bioxido') || t.includes('dioxido')) return 'CO2';
    if (t.includes('agua')) return 'Agua a presion';
    if (t.includes('espuma') || t.includes('afff')) return 'Espuma AFFF';
    if (t.includes('halotron')) return 'Halotron';
    if (t.includes('acetato')) return 'Acetato de potasio';
    return 'PQS';
  };
  const estadoPorEquipo = { 'En servicio': 'Operativo', 'En almacen': 'Operativo', 'En mantenimiento': 'En mantenimiento', Baja: 'Baja' };

  const insExt = bd.prepare(`INSERT INTO extintores
    (codigo, tipo, capacidad_kg, marca, ubicacion, area, fecha_fabricacion, fecha_recarga,
     fecha_prox_recarga, responsable_id, estado, observaciones)
    VALUES (?, ?, 0, ?, ?, '', ?, ?, ?, ?, ?, ?)`);
  const yaExiste = bd.prepare('SELECT 1 FROM extintores WHERE codigo = ?');
  const borrarEquipo = bd.prepare('DELETE FROM equipos WHERE id = ?');
  const borrarAvisos = bd.prepare("DELETE FROM notificaciones WHERE modulo = 'equipos' AND registro_id = ?");

  let movidos = 0;
  for (const e of contraIncendio) {
    const codigo = yaExiste.get(e.codigo) ? `${e.codigo}-EQ${e.id}` : e.codigo;
    insExt.run(
      codigo,
      agentePorNombre(e.nombre),
      e.marca ?? '',
      e.ubicacion ?? '',
      e.fecha_adquisicion ?? null,
      e.fecha_inicio ?? e.fecha_ultimo_mantenimiento ?? null,
      e.fecha_vencimiento,
      e.responsable_id ?? null,
      estadoPorEquipo[e.estado] ?? 'Operativo',
      `${e.nombre}. Migrado desde Equipo de Seguridad.${e.observaciones ? ` ${e.observaciones}` : ''}`.trim()
    );
    borrarAvisos.run(e.id);
    borrarEquipo.run(e.id);
    movidos++;
  }

  bitacora('sistema', 'Migracion', 'Extintores', `${movidos} registro(s) movidos de Equipo de Seguridad a Extintores`);
  console.log(`  Migrados ${movidos} registro(s) de "Equipo contra incendio" al modulo Extintores.`);
}

/* ------------------------------------------------------------------ */
/* Configuracion por defecto                                           */
/* ------------------------------------------------------------------ */

const CONFIG_DEFECTO = {
  dias_criticos: '7',
  dias_proximos: '30',
  correo_administrador: '',
  notificar_por_correo: '0',
  nombre_centro: 'CFE Zona Parral',
  zona: 'Division de Distribucion Norte',
  municipio: 'Hidalgo del Parral, Chihuahua',
  area_responsable: 'Seguridad e Higiene',
  // Direccion desde la que se abre el sistema. Se usa para armar el enlace
  // directo a la ficha del elemento dentro de los correos de aviso.
  url_sistema: config.urlPublica,
  // Umbrales (en dias) en los que se envia correo, ademas de los criticos
  // configurados para cada tipo de elemento.
  umbrales_correo: '30,15,7',
};

const insConfig = bd.prepare('INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?, ?)');
for (const [clave, valor] of Object.entries(CONFIG_DEFECTO)) insConfig.run(clave, valor);

/**
 * Tipos de elemento del anteproyecto, cada uno con su propia anticipacion
 * de aviso. Son los cinco elementos comprometidos mas una categoria general.
 */
const TIPOS_DEFECTO = [
  ['gafete', 'Gafetes de trabajo', 30, 7, 1],
  ['extintor', 'Extintores', 30, 7, 2],
  ['botiquin', 'Botiquines de primeros auxilios', 30, 7, 3],
  ['arnes', 'Arneses de seguridad', 45, 15, 4],
  ['licencia', 'Licencias de conducir', 60, 15, 5],
  ['equipo', 'Otro equipo de seguridad', 30, 7, 6],
];

const insTipo = bd.prepare(
  'INSERT OR IGNORE INTO tipos_alerta (clave, nombre, dias_proximo, dias_critico, orden) VALUES (?, ?, ?, ?, ?)'
);
for (const t of TIPOS_DEFECTO) insTipo.run(...t);

/** Catalogo de tipos de elemento con sus umbrales. */
export function tiposAlerta() {
  return bd.prepare('SELECT * FROM tipos_alerta ORDER BY orden').all();
}

/** Mapa clave -> {proximo, critico} usado por el motor de vigencias. */
export function umbralesPorTipo() {
  const mapa = {};
  for (const t of tiposAlerta()) mapa[t.clave] = { proximo: t.dias_proximo, critico: t.dias_critico };
  return mapa;
}

export function guardarTipoAlerta(clave, proximo, critico) {
  bd.prepare('UPDATE tipos_alerta SET dias_proximo = ?, dias_critico = ? WHERE clave = ?').run(
    Math.max(1, Number(proximo) || 30),
    Math.max(0, Number(critico) || 7),
    clave
  );
}

export function leerConfiguracion() {
  const filas = bd.prepare('SELECT clave, valor FROM configuracion').all();
  const obj = { ...CONFIG_DEFECTO };
  for (const f of filas) obj[f.clave] = f.valor;
  return obj;
}

export function guardarConfiguracion(clave, valor) {
  bd.prepare(
    'INSERT INTO configuracion (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor'
  ).run(clave, String(valor));
}

/** Umbrales de alerta vigentes (dias). */
export function umbrales() {
  const c = leerConfiguracion();
  return {
    critico: Number(c.dias_criticos) || 7,
    proximo: Number(c.dias_proximos) || 30,
  };
}

/** Registra un movimiento en la bitacora de auditoria. */
export function bitacora(usuario, accion, modulo, detalle = '') {
  bd.prepare('INSERT INTO bitacora (usuario, accion, modulo, detalle) VALUES (?, ?, ?, ?)').run(
    usuario || 'sistema',
    accion,
    modulo,
    detalle
  );
}

/* ------------------------------------------------------------------ */
/* Semilla inicial                                                     */
/* ------------------------------------------------------------------ */

/**
 * Genera una contrasena inicial aleatoria (sin caracteres ambiguos).
 * De esta forma el repositorio no contiene ninguna credencial.
 */
function contrasenaAleatoria(longitud = 14) {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(longitud);
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join('');
}

function sembrar() {
  const total = bd.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n;
  if (total > 0) return;

  // La contrasena del administrador se toma de la variable de entorno
  // SIGEV_ADMIN_PASS o, si no existe, se genera una aleatoria y se muestra
  // una sola vez en la consola y en datos/acceso-inicial.txt
  const contrasenaInicial = (process.env.SIGEV_ADMIN_PASS ?? '').trim() || contrasenaAleatoria();

  bd.prepare('INSERT INTO usuarios (usuario, nombre, correo, rol, hash) VALUES (?, ?, ?, ?, ?)').run(
    'admin',
    'Administrador del Sistema',
    '',
    'admin',
    crearHash(contrasenaInicial)
  );

  const archivoAcceso = path.join(path.dirname(config.rutaBD), 'acceso-inicial.txt');
  fs.writeFileSync(
    archivoAcceso,
    [
      'SIGEV - Acceso inicial al sistema',
      '=================================',
      `Generado: ${new Date().toLocaleString('es-MX')}`,
      '',
      '  Usuario:    admin',
      `  Contrasena: ${contrasenaInicial}`,
      '',
      'Cambie esta contrasena al entrar (menu del usuario > Cambiar contrasena)',
      'y elimine este archivo. Nunca lo suba a un repositorio.',
      '',
    ].join('\r\n'),
    'utf8'
  );

  console.log('');
  console.log('  ***********************************************************');
  console.log('   ACCESO INICIAL (se muestra una sola vez)');
  console.log('     Usuario:    admin');
  console.log(`     Contrasena: ${contrasenaInicial}`);
  console.log(`   Copia guardada en: ${archivoAcceso}`);
  console.log('   Cambie la contrasena al entrar y elimine ese archivo.');
  console.log('  ***********************************************************');
  console.log('');

  const hoy = hoyISO();
  const insEmpleado = bd.prepare(`INSERT INTO empleados
    (rpe, nombre, puesto, departamento, centro_trabajo, correo, telefono, tipo_sangre)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

  const empleados = [
    ['RPE10245', 'Juan Carlos Ramirez Soto', 'Linero de Distribucion', 'Distribucion', 'Zona Parral', 'jc.ramirez@cfe.mx', '6271234567', 'O+'],
    ['RPE10312', 'Maria Fernanda Lopez Cruz', 'Ingeniera de Seguridad', 'Seguridad e Higiene', 'Zona Parral', 'mf.lopez@cfe.mx', '6272345678', 'A+'],
    ['RPE10488', 'Roberto Gutierrez Mendoza', 'Tecnico Electricista', 'Mantenimiento', 'Subestacion Parral', 'r.gutierrez@cfe.mx', '6273456789', 'B+'],
    ['RPE10520', 'Ana Sofia Herrera Vazquez', 'Analista de Sistemas', 'Departamento TICS', 'Oficinas Zona Parral', 'as.herrera@cfe.mx', '6274567890', 'O-'],
    ['RPE10634', 'Luis Alberto Nava Trevino', 'Supervisor de Brigada', 'Distribucion', 'Zona Parral', 'la.nava@cfe.mx', '6275678901', 'AB+'],
    ['RPE10711', 'Patricia Elena Dominguez Rios', 'Jefa de Almacen', 'Almacen', 'Zona Parral', 'pe.dominguez@cfe.mx', '6276789012', 'A-'],
    ['RPE10802', 'Sergio Ivan Carrasco Duarte', 'Operador de Vehiculo Grua', 'Distribucion', 'Zona Parral', 'si.carrasco@cfe.mx', '6277890123', 'O+'],
  ];
  for (const e of empleados) insEmpleado.run(...e);

  const insGafete = bd.prepare(`INSERT INTO gafetes
    (folio, empleado_id, tipo, nivel_acceso, fecha_emision, fecha_vencimiento, estado, observaciones)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const gafetes = [
    ['GAF-2024-001', 1, 'Empleado', 'Areas energizadas', sumarDias(hoy, -700), sumarDias(hoy, -12), 'Activo', 'Requiere renovacion inmediata'],
    ['GAF-2024-002', 2, 'Empleado', 'Total', sumarDias(hoy, -400), sumarDias(hoy, 5), 'Activo', ''],
    ['GAF-2024-003', 3, 'Contratista', 'Subestaciones', sumarDias(hoy, -300), sumarDias(hoy, 24), 'Activo', ''],
    ['GAF-2025-004', 4, 'Empleado', 'General', sumarDias(hoy, -120), sumarDias(hoy, 210), 'Activo', ''],
    ['GAF-2025-005', 5, 'Empleado', 'Areas energizadas', sumarDias(hoy, -60), sumarDias(hoy, 300), 'Activo', ''],
    ['GAF-2025-006', 6, 'Visitante frecuente', 'Almacen', sumarDias(hoy, -200), sumarDias(hoy, 45), 'Activo', ''],
  ];
  for (const g of gafetes) insGafete.run(...g);

  const insExtintor = bd.prepare(`INSERT INTO extintores
    (codigo, tipo, capacidad_kg, marca, ubicacion, area, fecha_fabricacion, fecha_recarga,
     fecha_prox_recarga, fecha_prueba_hidrostatica, fecha_prox_hidrostatica, responsable_id, estado, observaciones)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const extintores = [
    ['EXT-001', 'PQS', 9, 'Badger', 'Pasillo principal, planta baja', 'Oficinas Zona Parral', sumarDias(hoy, -1800), sumarDias(hoy, -370), sumarDias(hoy, -5), sumarDias(hoy, -1100), sumarMeses(hoy, 14), 2, 'Operativo', 'Recarga vencida'],
    ['EXT-002', 'CO2', 4.5, 'Amerex', 'Cuarto de tableros', 'Subestacion Parral', sumarDias(hoy, -1200), sumarDias(hoy, -350), sumarDias(hoy, 15), sumarDias(hoy, -900), sumarMeses(hoy, 20), 3, 'Operativo', ''],
    ['EXT-003', 'PQS', 6, 'Extinsa', 'Almacen general', 'Zona Parral', sumarDias(hoy, -900), sumarDias(hoy, -300), sumarDias(hoy, 65), sumarDias(hoy, -600), sumarMeses(hoy, 30), 6, 'Operativo', ''],
    ['EXT-004', 'Agua a presion', 10, 'Badger', 'Taller de mantenimiento', 'Zona Parral', sumarDias(hoy, -1500), sumarDias(hoy, -340), sumarDias(hoy, 25), sumarDias(hoy, -1400), sumarDias(hoy, 40), 5, 'Operativo', 'Proxima prueba hidrostatica cercana'],
    ['EXT-005', 'Espuma AFFF', 9, 'Amerex', 'Patio de vehiculos', 'Zona Parral', sumarDias(hoy, -700), sumarDias(hoy, -100), sumarDias(hoy, 265), sumarDias(hoy, -700), sumarMeses(hoy, 48), 1, 'Operativo', ''],
    ['EXT-006', 'PQS', 4.5, 'Extinsa', 'Cuarto de control', 'Subestacion Parral', sumarDias(hoy, -2000), sumarDias(hoy, -380), sumarDias(hoy, -20), sumarDias(hoy, -2000), sumarDias(hoy, -60), 3, 'Fuera de servicio', 'Enviado a taller'],
  ];
  for (const e of extintores) insExtintor.run(...e);

  const insEquipo = bd.prepare(`INSERT INTO equipos
    (codigo, nombre, categoria, tipo_alerta, marca, modelo, serie, ubicacion, responsable_id,
     fecha_adquisicion, fecha_inicio, fecha_vencimiento, frecuencia_meses, fecha_ultimo_mantenimiento, estado, observaciones)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const equipos = [
    ['BOT-001', 'Botiquin de primeros auxilios tipo B', 'Botiquin de primeros auxilios', 'botiquin', 'Generico', 'Tipo B', 'BOT-014', 'Oficinas Zona Parral', 4, sumarDias(hoy, -230), sumarDias(hoy, -220), sumarDias(hoy, 20), 6, sumarDias(hoy, -200), 'En servicio', 'Revisar caducidad de medicamentos'],
    ['BOT-002', 'Botiquin de brigada de emergencia', 'Botiquin de primeros auxilios', 'botiquin', 'Generico', 'Tipo C', 'BOT-021', 'Vehiculo grua 44-12', 7, sumarDias(hoy, -300), sumarDias(hoy, -240), sumarDias(hoy, -3), 6, sumarDias(hoy, -240), 'En servicio', 'Insumos caducados'],
    ['ARN-001', 'Arnes de cuerpo completo 4 anillos', 'Arnes de seguridad', 'arnes', '3M', 'Protecta AB17530', '3M-99120', 'Brigada Zona Parral', 5, sumarDias(hoy, -800), sumarDias(hoy, -370), sumarDias(hoy, 40), 12, sumarDias(hoy, -370), 'En servicio', 'Inspeccion anual'],
    ['ARN-002', 'Arnes dielectrico con linea de vida', 'Arnes de seguridad', 'arnes', 'MSA', 'Workman', 'MSA-3320', 'Brigada Distribucion', 1, sumarDias(hoy, -600), sumarDias(hoy, -350), sumarDias(hoy, 12), 12, sumarDias(hoy, -350), 'En servicio', ''],
    ['ARN-003', 'Arnes de posicionamiento', 'Arnes de seguridad', 'arnes', '3M', 'Delta II', '3M-77410', 'Subestacion Parral', 3, sumarDias(hoy, -1200), sumarDias(hoy, -480), sumarDias(hoy, -55), 12, sumarDias(hoy, -460), 'Fuera de servicio', 'Costura danada, dado de baja tecnica'],
    ['EQ-0001', 'Guantes dielectricos clase 2', 'Equipo de proteccion personal', 'equipo', 'Salisbury', 'E214B', 'SLB-4471', 'Brigada Distribucion', 1, sumarDias(hoy, -400), sumarDias(hoy, -180), sumarDias(hoy, 3), 6, sumarDias(hoy, -180), 'En servicio', 'Prueba dielectrica semestral'],
    ['EQ-0002', 'Detector de tension 34.5 kV', 'Instrumento de medicion', 'equipo', 'Fluke', '1AC-E1', 'FLK-33021', 'Subestacion Parral', 3, sumarDias(hoy, -600), sumarDias(hoy, -370), sumarDias(hoy, -9), 12, sumarDias(hoy, -370), 'En servicio', 'Calibracion vencida'],
    ['EQ-0003', 'Casco dielectrico clase E', 'Equipo de proteccion personal', 'equipo', 'MSA', 'V-Gard', 'MSA-7712', 'Brigada Distribucion', 1, sumarDias(hoy, -1100), sumarDias(hoy, -1100), sumarDias(hoy, 340), 0, null, 'En servicio', ''],
    ['EQ-0004', 'Pertiga telescopica 10 m', 'Herramienta aislada', 'equipo', 'Hastings', 'H-1000', 'HST-2214', 'Zona Parral', 5, sumarDias(hoy, -1500), sumarDias(hoy, -380), sumarDias(hoy, 28), 12, sumarDias(hoy, -370), 'En servicio', ''],
    ['EQ-0005', 'Multimetro industrial', 'Instrumento de medicion', 'equipo', 'Fluke', '87V', 'FLK-87221', 'Taller de mantenimiento', 3, sumarDias(hoy, -1000), sumarDias(hoy, -240), sumarDias(hoy, 120), 12, sumarDias(hoy, -240), 'En servicio', ''],
  ];
  for (const e of equipos) insEquipo.run(...e);

  const insLicencia = bd.prepare(`INSERT INTO licencias
    (numero, empleado_id, tipo, ambito, autoridad, fecha_inicio, fecha_vencimiento, restricciones, estado, observaciones)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const licencias = [
    ['LIC-CHIH-884512', 1, 'Chofer', 'Estatal', 'Gobierno del Estado de Chihuahua', sumarDias(hoy, -1000), sumarDias(hoy, -18), 'Uso de lentes', 'Vigente', 'Vencida, no puede operar vehiculo oficial'],
    ['LIC-CHIH-902341', 5, 'Chofer', 'Estatal', 'Gobierno del Estado de Chihuahua', sumarDias(hoy, -700), sumarDias(hoy, 22), '', 'Vigente', ''],
    ['LIC-FED-B-114520', 7, 'Federal tipo B', 'Federal', 'Secretaria de Infraestructura, Comunicaciones y Transportes', sumarDias(hoy, -900), sumarDias(hoy, 48), '', 'Vigente', 'Requerida para operar la grua'],
    ['LIC-CHIH-771203', 3, 'Automovilista', 'Estatal', 'Gobierno del Estado de Chihuahua', sumarDias(hoy, -1400), sumarDias(hoy, 190), '', 'Vigente', ''],
    ['LIC-CHIH-812077', 6, 'Automovilista', 'Estatal', 'Gobierno del Estado de Chihuahua', sumarDias(hoy, -500), sumarDias(hoy, 320), '', 'Vigente', ''],
  ];
  for (const l of licencias) insLicencia.run(...l);

  bitacora('sistema', 'Instalacion', 'Sistema', 'Base de datos creada con informacion de demostracion');
  console.log('  Base de datos inicializada con datos de demostracion.');
}

sembrar();
