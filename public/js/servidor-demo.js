/**
 * SERVIDOR DE DEMOSTRACION
 * =======================================================================
 * Este modulo NO forma parte del sistema en produccion.
 *
 * SIGEV funciona con un servidor Node y base de datos SQLite (carpeta src/).
 * Para poder publicar una demostracion navegable en GitHub Pages —donde solo
 * se pueden servir archivos estaticos, sin Node— este modulo reimplementa la
 * misma API dentro del navegador, guardando los datos en localStorage.
 *
 * La aplicacion lo usa unicamente cuando detecta que no hay servidor detras
 * (ver nucleo.js). Las vistas, los formularios y el motor de semaforo son
 * exactamente los mismos en ambos modos.
 * =======================================================================
 */

import { ACCIONES, validarRegistro } from './reglas.js';

// La version cambia cuando cambia el esquema de la demostracion, para que
// los datos guardados de una version anterior se regeneren solos.
const CLAVE_ALMACEN = 'sigev-demostracion-v3';

/* ============================ FECHAS ============================ */

const aISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const hoyISO = () => aISO(new Date());

function sumarDias(iso, dias) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return aISO(d);
}

function sumarMeses(iso, meses) {
  const d = new Date(`${iso}T00:00:00`);
  d.setMonth(d.getMonth() + meses);
  return aISO(d);
}

const esFecha = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function diasRestantes(iso) {
  if (!esFecha(iso)) return null;
  return Math.round((new Date(`${iso}T00:00:00`) - new Date(`${hoyISO()}T00:00:00`)) / 86400000);
}

const ahora = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

/* ============================ SEMILLA ============================ */

function semilla() {
  const hoy = hoyISO();

  return {
    secuencias: { empleados: 7, gafetes: 6, extintores: 6, equipos: 10, licencias: 5, notificaciones: 0, bitacora: 0, usuarios: 1 },

    usuarios: [
      { id: 1, usuario: 'admin', nombre: 'Administrador del Sistema', correo: 'admin@cfe.mx', rol: 'admin', activo: 1, creado_en: ahora(), ultimo_acceso: null },
      { id: 2, usuario: 'seguridad', nombre: 'Maria Fernanda Lopez Cruz', correo: 'mf.lopez@cfe.mx', rol: 'seguridad', activo: 1, creado_en: ahora(), ultimo_acceso: null },
      { id: 3, usuario: 'documentacion', nombre: 'Ana Sofia Herrera Vazquez', correo: 'as.herrera@cfe.mx', rol: 'documentacion', activo: 1, creado_en: ahora(), ultimo_acceso: null },
    ],

    configuracion: {
      dias_criticos: '7',
      dias_proximos: '30',
      correo_administrador: '',
      notificar_por_correo: '0',
      nombre_centro: 'CFE Zona Parral',
      zona: 'Division de Distribucion Norte',
      municipio: 'Hidalgo del Parral, Chihuahua',
      area_responsable: 'Seguridad e Higiene',
    },

    tipos_alerta: [
      { clave: 'gafete', nombre: 'Gafetes de trabajo', dias_proximo: 30, dias_critico: 7, orden: 1 },
      { clave: 'extintor', nombre: 'Extintores', dias_proximo: 30, dias_critico: 7, orden: 2 },
      { clave: 'botiquin', nombre: 'Botiquines de primeros auxilios', dias_proximo: 30, dias_critico: 7, orden: 3 },
      { clave: 'arnes', nombre: 'Arneses de seguridad', dias_proximo: 45, dias_critico: 15, orden: 4 },
      { clave: 'licencia', nombre: 'Licencias de conducir', dias_proximo: 60, dias_critico: 15, orden: 5 },
      { clave: 'equipo', nombre: 'Otro equipo de seguridad', dias_proximo: 30, dias_critico: 7, orden: 6 },
    ],

    empleados: [
      ['RPE10245', 'Juan Carlos Ramirez Soto', 'Linero de Distribucion', 'Distribucion', 'Zona Parral', 'jc.ramirez@cfe.mx', '6271234567', 'O+'],
      ['RPE10312', 'Maria Fernanda Lopez Cruz', 'Ingeniera de Seguridad', 'Seguridad e Higiene', 'Zona Parral', 'mf.lopez@cfe.mx', '6272345678', 'A+'],
      ['RPE10488', 'Roberto Gutierrez Mendoza', 'Tecnico Electricista', 'Mantenimiento', 'Subestacion Parral', 'r.gutierrez@cfe.mx', '6273456789', 'B+'],
      ['RPE10520', 'Ana Sofia Herrera Vazquez', 'Analista de Sistemas', 'Departamento TICS', 'Oficinas Zona Parral', 'as.herrera@cfe.mx', '6274567890', 'O-'],
      ['RPE10634', 'Luis Alberto Nava Trevino', 'Supervisor de Brigada', 'Distribucion', 'Zona Parral', 'la.nava@cfe.mx', '6275678901', 'AB+'],
      ['RPE10711', 'Patricia Elena Dominguez Rios', 'Jefa de Almacen', 'Almacen', 'Zona Parral', 'pe.dominguez@cfe.mx', '6276789012', 'A-'],
      ['RPE10802', 'Sergio Ivan Carrasco Duarte', 'Operador de Vehiculo Grua', 'Distribucion', 'Zona Parral', 'si.carrasco@cfe.mx', '6277890123', 'O+'],
    ].map(([rpe, nombre, puesto, departamento, centro_trabajo, correo, telefono, tipo_sangre], i) => ({
      id: i + 1, rpe, nombre, puesto, departamento, centro_trabajo, correo, telefono, tipo_sangre,
      foto: null, activo: 1, creado_en: ahora(),
    })),

    gafetes: [
      ['GAF-2024-001', 1, 'Empleado', 'Areas energizadas', -700, -12, 'Activo', 'Requiere renovacion inmediata'],
      ['GAF-2024-002', 2, 'Empleado', 'Total', -400, 5, 'Activo', ''],
      ['GAF-2024-003', 3, 'Contratista', 'Subestaciones', -300, 24, 'Activo', ''],
      ['GAF-2025-004', 4, 'Empleado', 'General', -120, 210, 'Activo', ''],
      ['GAF-2025-005', 5, 'Empleado', 'Areas energizadas', -60, 300, 'Activo', ''],
      ['GAF-2025-006', 6, 'Visitante frecuente', 'Almacen', -200, 45, 'Activo', ''],
    ].map(([folio, empleado_id, tipo, nivel_acceso, ini, fin, estado, observaciones], i) => ({
      id: i + 1, folio, empleado_id, tipo, nivel_acceso,
      fecha_emision: sumarDias(hoy, ini), fecha_vencimiento: sumarDias(hoy, fin),
      estado, observaciones, creado_en: ahora(),
    })),

    extintores: [
      ['EXT-001', 'PQS', 9, 'Badger', 'Pasillo principal, planta baja', 'Oficinas Zona Parral', -1800, -370, -5, -1100, 420, 2, 'Operativo', 'Recarga vencida'],
      ['EXT-002', 'CO2', 4.5, 'Amerex', 'Cuarto de tableros', 'Subestacion Parral', -1200, -350, 15, -900, 600, 3, 'Operativo', ''],
      ['EXT-003', 'PQS', 6, 'Extinsa', 'Almacen general', 'Zona Parral', -900, -300, 65, -600, 900, 6, 'Operativo', ''],
      ['EXT-004', 'Agua a presion', 10, 'Badger', 'Taller de mantenimiento', 'Zona Parral', -1500, -340, 25, -1400, 40, 5, 'Operativo', 'Proxima prueba hidrostatica cercana'],
      ['EXT-005', 'Espuma AFFF', 9, 'Amerex', 'Patio de vehiculos', 'Zona Parral', -700, -100, 265, -700, 1440, 1, 'Operativo', ''],
      ['EXT-006', 'PQS', 4.5, 'Extinsa', 'Cuarto de control', 'Subestacion Parral', -2000, -380, -20, -2000, -60, 3, 'Fuera de servicio', 'Enviado a taller'],
    ].map(([codigo, tipo, capacidad_kg, marca, ubicacion, area, fab, rec, prox, hid, proxHid, responsable_id, estado, observaciones], i) => ({
      id: i + 1, codigo, tipo, capacidad_kg, marca, ubicacion, area,
      fecha_fabricacion: sumarDias(hoy, fab), fecha_recarga: sumarDias(hoy, rec),
      fecha_prox_recarga: sumarDias(hoy, prox), fecha_prueba_hidrostatica: sumarDias(hoy, hid),
      fecha_prox_hidrostatica: sumarDias(hoy, proxHid), responsable_id, estado, observaciones, creado_en: ahora(),
    })),

    equipos: [
      ['BOT-001', 'Botiquin de primeros auxilios tipo B', 'Botiquin de primeros auxilios', 'botiquin', 'Generico', 'Tipo B', 'BOT-014', 'Oficinas Zona Parral', 4, -230, -220, 20, 6, -200, 'En servicio', 'Revisar caducidad de medicamentos'],
      ['BOT-002', 'Botiquin de brigada de emergencia', 'Botiquin de primeros auxilios', 'botiquin', 'Generico', 'Tipo C', 'BOT-021', 'Vehiculo grua 44-12', 7, -300, -240, -3, 6, -240, 'En servicio', 'Insumos caducados'],
      ['ARN-001', 'Arnes de cuerpo completo 4 anillos', 'Arnes de seguridad', 'arnes', '3M', 'Protecta AB17530', '3M-99120', 'Brigada Zona Parral', 5, -800, -370, 40, 12, -370, 'En servicio', 'Inspeccion anual'],
      ['ARN-002', 'Arnes dielectrico con linea de vida', 'Arnes de seguridad', 'arnes', 'MSA', 'Workman', 'MSA-3320', 'Brigada Distribucion', 1, -600, -350, 12, 12, -350, 'En servicio', ''],
      ['ARN-003', 'Arnes de posicionamiento', 'Arnes de seguridad', 'arnes', '3M', 'Delta II', '3M-77410', 'Subestacion Parral', 3, -1200, -480, -55, 12, -460, 'Fuera de servicio', 'Costura danada, dado de baja tecnica'],
      ['EQ-0001', 'Guantes dielectricos clase 2', 'Equipo de proteccion personal', 'equipo', 'Salisbury', 'E214B', 'SLB-4471', 'Brigada Distribucion', 1, -400, -180, 3, 6, -180, 'En servicio', 'Prueba dielectrica semestral'],
      ['EQ-0002', 'Detector de tension 34.5 kV', 'Instrumento de medicion', 'equipo', 'Fluke', '1AC-E1', 'FLK-33021', 'Subestacion Parral', 3, -600, -370, -9, 12, -370, 'En servicio', 'Calibracion vencida'],
      ['EQ-0003', 'Casco dielectrico clase E', 'Equipo de proteccion personal', 'equipo', 'MSA', 'V-Gard', 'MSA-7712', 'Brigada Distribucion', 1, -1100, -1100, 340, 0, null, 'En servicio', ''],
      ['EQ-0004', 'Pertiga telescopica 10 m', 'Herramienta aislada', 'equipo', 'Hastings', 'H-1000', 'HST-2214', 'Zona Parral', 5, -1500, -380, 28, 12, -370, 'En servicio', ''],
      ['EQ-0005', 'Multimetro industrial', 'Instrumento de medicion', 'equipo', 'Fluke', '87V', 'FLK-87221', 'Taller de mantenimiento', 3, -1000, -240, 120, 12, -240, 'En servicio', ''],
    ].map(([codigo, nombre, categoria, tipo_alerta, marca, modelo, serie, ubicacion, responsable_id, adq, ini, fin, frecuencia_meses, mant, estado, observaciones], i) => ({
      id: i + 1, codigo, nombre, categoria, tipo_alerta, marca, modelo, serie, ubicacion, responsable_id,
      fecha_adquisicion: sumarDias(hoy, adq), fecha_inicio: sumarDias(hoy, ini),
      fecha_vencimiento: sumarDias(hoy, fin), frecuencia_meses,
      fecha_ultimo_mantenimiento: mant === null ? null : sumarDias(hoy, mant),
      estado, observaciones, creado_en: ahora(),
    })),

    licencias: [
      ['LIC-CHIH-884512', 1, 'Chofer', 'Estatal', 'Gobierno del Estado de Chihuahua', -1000, -18, 'Uso de lentes', 'Vigente', 'Vencida, no puede operar vehiculo oficial'],
      ['LIC-CHIH-902341', 5, 'Chofer', 'Estatal', 'Gobierno del Estado de Chihuahua', -700, 22, '', 'Vigente', ''],
      ['LIC-FED-B-114520', 7, 'Federal tipo B', 'Federal', 'Secretaria de Infraestructura, Comunicaciones y Transportes', -900, 48, '', 'Vigente', 'Requerida para operar la grua'],
      ['LIC-CHIH-771203', 3, 'Automovilista', 'Estatal', 'Gobierno del Estado de Chihuahua', -1400, 190, '', 'Vigente', ''],
      ['LIC-CHIH-812077', 6, 'Automovilista', 'Estatal', 'Gobierno del Estado de Chihuahua', -500, 320, '', 'Vigente', ''],
    ].map(([numero, empleado_id, tipo, ambito, autoridad, ini, fin, restricciones, estado, observaciones], i) => ({
      id: i + 1, numero, empleado_id, tipo, ambito, autoridad,
      fecha_inicio: sumarDias(hoy, ini), fecha_vencimiento: sumarDias(hoy, fin),
      restricciones, estado, observaciones, creado_en: ahora(),
    })),

    notificaciones: [],
    bitacora: [{ id: 1, usuario: 'sistema', accion: 'Instalacion', modulo: 'Sistema', detalle: 'Demostracion iniciada con datos de ejemplo', fecha: ahora() }],
  };
}

/* ============================ ALMACEN ============================ */

let datos = cargar();

function cargar() {
  try {
    const guardado = localStorage.getItem(CLAVE_ALMACEN);
    if (!guardado) return semilla();
    const objeto = JSON.parse(guardado);
    // Si la semilla se genero otro dia, se regenera para que las fechas
    // relativas (vencidos, por vencer) sigan siendo representativas.
    return objeto.__dia === hoyISO() ? objeto : semilla();
  } catch {
    return semilla();
  }
}

function guardar() {
  try {
    datos.__dia = hoyISO();
    localStorage.setItem(CLAVE_ALMACEN, JSON.stringify(datos));
  } catch {
    /* almacenamiento lleno o bloqueado: la demostracion sigue en memoria */
  }
}

export function reiniciarDemostracion() {
  datos = semilla();
  guardar();
}

function siguienteId(tabla) {
  const max = datos[tabla].reduce((m, r) => Math.max(m, r.id), 0);
  return max + 1;
}

function registrarBitacora(accion, modulo, detalle = '') {
  datos.bitacora.unshift({ id: siguienteId('bitacora'), usuario: 'admin', accion, modulo, detalle, fecha: ahora() });
  datos.bitacora = datos.bitacora.slice(0, 400);
}

/* ============================ VIGENCIAS ============================ */

const IGNORADOS = new Set(['Cancelado', 'Baja', 'Dado de baja', 'Desechado']);
const SEMAFORO = { vigente: 'verde', proximo: 'amarillo', critico: 'amarillo', vencido: 'rojo', sin_fecha: 'gris' };

function umbralesPorTipo() {
  const mapa = {};
  for (const t of datos.tipos_alerta) mapa[t.clave] = { proximo: t.dias_proximo, critico: t.dias_critico };
  return mapa;
}

function empleado(id) {
  return datos.empleados.find((e) => e.id === Number(id)) ?? null;
}

function listarVigencias() {
  const umbrales = umbralesPorTipo();
  const items = [];

  const agregar = (base, inicio, fin, concepto) => {
    if (!esFecha(fin)) return;
    const u = umbrales[base.tipo] ?? { proximo: 30, critico: 7 };
    const dias = diasRestantes(fin);
    const clasificacion =
      dias < 0 ? 'vencido' : dias <= u.critico ? 'critico' : dias <= u.proximo ? 'proximo' : 'vigente';
    const etiqueta =
      dias < 0 ? `Vencido hace ${Math.abs(dias)} d` : dias === 0 ? 'Vence hoy' : `Vence en ${dias} d`;
    items.push({
      ...base, concepto, fecha_inicio: esFecha(inicio) ? inicio : null, fecha: fin,
      dias, clasificacion, semaforo: SEMAFORO[clasificacion], etiqueta, umbral: u,
    });
  };

  for (const g of datos.gafetes) {
    if (IGNORADOS.has(g.estado)) continue;
    const e = empleado(g.empleado_id);
    agregar({
      modulo: 'gafetes', modulo_nombre: 'Gafete', tipo: 'gafete', registro_id: g.id, referencia: g.folio,
      descripcion: `${e?.nombre ?? '—'} (${e?.rpe ?? '—'})`, ubicacion: e?.departamento ?? '',
      responsable: e?.nombre ?? 'Sin asignar', estado_registro: g.estado,
    }, g.fecha_emision, g.fecha_vencimiento, 'Vigencia del gafete');
  }

  for (const x of datos.extintores) {
    if (IGNORADOS.has(x.estado)) continue;
    const base = {
      modulo: 'extintores', modulo_nombre: 'Extintor', tipo: 'extintor', registro_id: x.id, referencia: x.codigo,
      descripcion: `${x.tipo} ${x.capacidad_kg} kg - ${x.ubicacion}`, ubicacion: x.ubicacion,
      responsable: empleado(x.responsable_id)?.nombre ?? 'Sin asignar', estado_registro: x.estado,
    };
    agregar(base, x.fecha_recarga, x.fecha_prox_recarga, 'Recarga');
    agregar(base, x.fecha_prueba_hidrostatica, x.fecha_prox_hidrostatica, 'Prueba hidrostatica');
  }

  for (const q of datos.equipos) {
    if (IGNORADOS.has(q.estado)) continue;
    const base = {
      modulo: 'equipos',
      modulo_nombre: q.categoria?.startsWith('Botiquin') ? 'Botiquin' : q.categoria?.startsWith('Arnes') ? 'Arnes' : 'Equipo',
      tipo: q.tipo_alerta || 'equipo', registro_id: q.id, referencia: q.codigo,
      descripcion: `${q.nombre}${q.marca ? ` - ${q.marca}` : ''}`, ubicacion: q.ubicacion,
      responsable: empleado(q.responsable_id)?.nombre ?? 'Sin asignar', estado_registro: q.estado,
    };
    agregar(base, q.fecha_inicio ?? q.fecha_adquisicion, q.fecha_vencimiento, 'Vigencia / caducidad');
    if (q.frecuencia_meses > 0 && esFecha(q.fecha_ultimo_mantenimiento)) {
      agregar(base, q.fecha_ultimo_mantenimiento, sumarMeses(q.fecha_ultimo_mantenimiento, q.frecuencia_meses), 'Revision / mantenimiento');
    }
  }

  for (const l of datos.licencias) {
    if (IGNORADOS.has(l.estado)) continue;
    const e = empleado(l.empleado_id);
    agregar({
      modulo: 'licencias', modulo_nombre: 'Licencia', tipo: 'licencia', registro_id: l.id, referencia: l.numero,
      descripcion: `${l.tipo} (${l.ambito}) - ${e?.nombre ?? '—'}`, ubicacion: e?.departamento ?? '',
      responsable: e?.nombre ?? 'Sin asignar', estado_registro: l.estado,
    }, l.fecha_inicio, l.fecha_vencimiento, 'Vigencia de la licencia');
  }

  items.sort((a, b) => a.dias - b.dias);
  return items;
}

function resumenVigencias(items = listarVigencias()) {
  const r = { vencido: 0, critico: 0, proximo: 0, vigente: 0, total: items.length };
  for (const i of items) r[i.clasificacion] = (r[i.clasificacion] ?? 0) + 1;
  r.rojo = r.vencido;
  r.amarillo = r.proximo + r.critico;
  r.verde = r.vigente;
  return r;
}

function revisarVencimientos() {
  const items = listarVigencias().filter((i) => i.clasificacion !== 'vigente');
  const TITULOS = { vencido: 'VENCIDO', critico: 'Por vencer (critico)', proximo: 'Proximo a vencer' };
  let generadas = 0;

  for (const i of items) {
    const clave = `${i.modulo}:${i.registro_id}:${i.concepto}:${i.fecha}:${i.clasificacion}`;
    if (datos.notificaciones.some((n) => n.clave === clave)) continue;
    const [a, m, d] = i.fecha.split('-');
    datos.notificaciones.push({
      id: siguienteId('notificaciones'), clave, modulo: i.modulo, registro_id: i.registro_id,
      referencia: i.referencia, concepto: i.concepto,
      titulo: `${TITULOS[i.clasificacion]}: ${i.modulo_nombre} ${i.referencia}`,
      mensaje: i.dias < 0
        ? `${i.concepto} de ${i.descripcion} vencio el ${d}/${m}/${a} (hace ${Math.abs(i.dias)} dias). Ubicacion: ${i.ubicacion || 'no especificada'}.`
        : `${i.concepto} de ${i.descripcion} vence el ${d}/${m}/${a} (faltan ${i.dias} dias). Ubicacion: ${i.ubicacion || 'no especificada'}.`,
      severidad: i.clasificacion, fecha_objetivo: i.fecha, dias_restantes: i.dias,
      leida: 0, correo_enviado: 0, creada_en: ahora(),
    });
    generadas++;
  }

  if (generadas) registrarBitacora('Revision de vencimientos', 'Alertas', `${generadas} alertas nuevas (demostracion)`);
  guardar();
  return { generadas, revisadas: items.length, correo: 'modo demostracion' };
}

/* ============================ CRUD ============================ */

const OBLIGATORIOS = {
  empleados: [['rpe', 'RPE'], ['nombre', 'Nombre completo']],
  gafetes: [['folio', 'Folio'], ['empleado_id', 'Empleado'], ['tipo', 'Tipo'], ['fecha_emision', 'Fecha de emision'], ['fecha_vencimiento', 'Fecha de vencimiento'], ['estado', 'Estado']],
  extintores: [['codigo', 'Codigo'], ['tipo', 'Tipo de agente'], ['ubicacion', 'Ubicacion'], ['fecha_prox_recarga', 'Proxima recarga'], ['estado', 'Estado']],
  equipos: [['codigo', 'Codigo'], ['nombre', 'Nombre del equipo'], ['categoria', 'Categoria'], ['tipo_alerta', 'Tipo de elemento'], ['fecha_inicio', 'Fecha de inicio de vigencia'], ['fecha_vencimiento', 'Fecha de vencimiento'], ['estado', 'Estado']],
  licencias: [['numero', 'Numero de licencia'], ['empleado_id', 'Empleado'], ['tipo', 'Tipo de licencia'], ['ambito', 'Ambito'], ['fecha_inicio', 'Fecha de expedicion'], ['fecha_vencimiento', 'Fecha de vencimiento'], ['estado', 'Estado']],
};

const CLAVE_UNICA = { empleados: 'rpe', gafetes: 'folio', extintores: 'codigo', equipos: 'codigo', licencias: 'numero' };

// Espejo de CATEGORIAS_EQUIPO en src/config.js. "Equipo contra incendio" no
// esta: ese material se registra en el modulo Extintores.
const CATEGORIAS_EQUIPO = [
  'Botiquin de primeros auxilios',
  'Arnes de seguridad',
  'Equipo de proteccion personal',
  'Herramienta aislada',
  'Instrumento de medicion',
];

/** Campos de catalogo cerrado que se validan tambien al guardar. */
const OPCIONES_VALIDAS = { equipos: { categoria: CATEGORIAS_EQUIPO } };

const NUMERICOS = new Set(['empleado_id', 'responsable_id', 'capacidad_kg', 'frecuencia_meses', 'activo']);

function normalizar(cuerpo) {
  const salida = {};
  for (const [k, v] of Object.entries(cuerpo)) {
    salida[k] = NUMERICOS.has(k) ? (v === '' || v === null || v === undefined ? null : Number(v)) : v;
  }
  return salida;
}

function validar(tabla, registro) {
  for (const [campo, etiqueta] of OBLIGATORIOS[tabla] ?? []) {
    const v = registro[campo];
    if (v === '' || v === null || v === undefined) {
      throw { codigo: 400, mensaje: `El campo "${etiqueta}" es obligatorio y debe ser valido` };
    }
  }
  for (const [campo, opciones] of Object.entries(OPCIONES_VALIDAS[tabla] ?? {})) {
    const v = registro[campo];
    if (v !== '' && v !== null && v !== undefined && !opciones.includes(v)) {
      throw { codigo: 400, mensaje: `El valor "${v}" no es una opcion valida de "${campo}". Opciones: ${opciones.join(', ')}` };
    }
  }
}

function verificarUnico(tabla, registro, idActual = null) {
  const clave = CLAVE_UNICA[tabla];
  if (!clave) return;
  const repetido = datos[tabla].some((r) => r[clave] === registro[clave] && r.id !== idActual);
  if (repetido) throw { codigo: 409, mensaje: `Ya existe un registro con esa clave en ${tabla}` };
}

function enriquecer(tabla, r) {
  if (tabla === 'gafetes' || tabla === 'licencias') {
    const e = empleado(r.empleado_id);
    return { ...r, empleado: e?.nombre ?? '—', rpe: e?.rpe ?? '', puesto: e?.puesto ?? '', departamento: e?.departamento ?? '', centro_trabajo: e?.centro_trabajo ?? '', tipo_sangre: e?.tipo_sangre ?? '', foto: e?.foto ?? null };
  }
  if (tabla === 'extintores' || tabla === 'equipos') {
    return { ...r, responsable: empleado(r.responsable_id)?.nombre ?? null };
  }
  return { ...r };
}

const CAMPOS_BUSQUEDA = {
  empleados: ['rpe', 'nombre', 'puesto', 'departamento', 'centro_trabajo'],
  gafetes: ['folio', 'empleado', 'rpe', 'tipo'],
  extintores: ['codigo', 'tipo', 'ubicacion', 'area', 'marca'],
  equipos: ['codigo', 'nombre', 'categoria', 'marca', 'ubicacion', 'serie'],
  licencias: ['numero', 'empleado', 'rpe', 'tipo', 'ambito'],
};

const ORDEN = {
  empleados: (a, b) => a.nombre.localeCompare(b.nombre),
  gafetes: (a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento),
  extintores: (a, b) => a.fecha_prox_recarga.localeCompare(b.fecha_prox_recarga),
  equipos: (a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento),
  licencias: (a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento),
};

function listar(tabla, q) {
  let filas = datos[tabla].map((r) => enriquecer(tabla, r));
  const texto = (q ?? '').trim().toLowerCase();
  if (texto) {
    const campos = CAMPOS_BUSQUEDA[tabla] ?? [];
    filas = filas.filter((r) => campos.some((c) => String(r[c] ?? '').toLowerCase().includes(texto)));
  }
  return filas.sort(ORDEN[tabla] ?? ((a, b) => b.id - a.id));
}

/* ============================ CSV ============================ */

const EXPORTACIONES = {
  empleados: { tabla: 'empleados', columnas: [['rpe', 'RPE'], ['nombre', 'Nombre'], ['puesto', 'Puesto'], ['departamento', 'Departamento'], ['centro_trabajo', 'Centro de trabajo'], ['correo', 'Correo'], ['telefono', 'Telefono'], ['tipo_sangre', 'Tipo de sangre']] },
  gafetes: { tabla: 'gafetes', columnas: [['folio', 'Folio'], ['rpe', 'RPE'], ['empleado', 'Empleado'], ['tipo', 'Tipo'], ['nivel_acceso', 'Nivel de acceso'], ['fecha_emision', 'Emision'], ['fecha_vencimiento', 'Vencimiento'], ['estado', 'Estado']] },
  extintores: { tabla: 'extintores', columnas: [['codigo', 'Codigo'], ['tipo', 'Tipo'], ['capacidad_kg', 'Capacidad (kg)'], ['marca', 'Marca'], ['ubicacion', 'Ubicacion'], ['area', 'Area'], ['fecha_recarga', 'Ultima recarga'], ['fecha_prox_recarga', 'Proxima recarga'], ['fecha_prox_hidrostatica', 'Proxima hidrostatica'], ['estado', 'Estado'], ['responsable', 'Responsable']] },
  equipos: { tabla: 'equipos', columnas: [['codigo', 'Codigo'], ['nombre', 'Equipo'], ['categoria', 'Categoria'], ['marca', 'Marca'], ['modelo', 'Modelo'], ['serie', 'Serie'], ['ubicacion', 'Ubicacion'], ['fecha_adquisicion', 'Adquisicion'], ['fecha_inicio', 'Inicio de vigencia'], ['fecha_vencimiento', 'Vencimiento'], ['frecuencia_meses', 'Frecuencia (meses)'], ['estado', 'Estado'], ['responsable', 'Responsable']] },
  licencias: { tabla: 'licencias', columnas: [['numero', 'Numero de licencia'], ['rpe', 'RPE'], ['empleado', 'Empleado'], ['tipo', 'Tipo'], ['ambito', 'Ambito'], ['autoridad', 'Autoridad emisora'], ['fecha_inicio', 'Expedicion'], ['fecha_vencimiento', 'Vencimiento'], ['restricciones', 'Restricciones'], ['estado', 'Estado']] },
  bitacora: { tabla: 'bitacora', columnas: [['fecha', 'Fecha'], ['usuario', 'Usuario'], ['accion', 'Accion'], ['modulo', 'Modulo'], ['detalle', 'Detalle']] },
};

function aCSV(filas, columnas) {
  const escapar = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const lineas = [columnas.map(([, t]) => escapar(t)).join(';')];
  for (const f of filas) lineas.push(columnas.map(([c]) => escapar(f[c])).join(';'));
  return `﻿${lineas.join('\r\n')}`;
}

export function exportarCSV(modulo) {
  const modulosPropios = PERMISOS[usuarioEnSesion?.rol] ?? [];
  if (EXPORTACIONES[modulo] && modulo !== 'bitacora' && !modulosPropios.includes(modulo)) return null;
  if (modulo === 'bitacora' && usuarioEnSesion?.rol !== 'admin') return null;

  if (modulo === 'vigencias') {
    const filas = listarVigencias().map((i) => ({ ...i, modulo: i.modulo_nombre, inicio: i.fecha_inicio ?? '' }));
    return aCSV(filas, [['modulo', 'Elemento'], ['referencia', 'Referencia'], ['descripcion', 'Descripcion'], ['concepto', 'Concepto'], ['inicio', 'Fecha de inicio'], ['fecha', 'Fecha de caducidad'], ['dias', 'Dias restantes'], ['clasificacion', 'Clasificacion'], ['semaforo', 'Semaforo'], ['ubicacion', 'Ubicacion'], ['responsable', 'Responsable']]);
  }
  const def = EXPORTACIONES[modulo];
  if (!def) return null;
  return aCSV(listar(def.tabla, ''), def.columnas);
}

/* ============================ ENRUTADOR ============================ */

/**
 * Reparto de modulos por perfil (espejo de PERMISOS en src/config.js).
 */
const PERMISOS = {
  admin: ['extintores', 'equipos', 'gafetes', 'licencias', 'empleados'],
  seguridad: ['extintores', 'equipos', 'empleados'],
  documentacion: ['gafetes', 'licencias', 'empleados'],
  consulta: [],
};

const ROLES = {
  admin: 'Administrador',
  seguridad: 'Jefe de Seguridad',
  documentacion: 'Encargado de Documentacion',
};

/**
 * Cuentas de la demostracion. La contrasena coincide con el usuario para que
 * cualquiera pueda entrar con cada perfil y ver como cambia el menu.
 */
const CLAVES_DEMO = { admin: 'admin', seguridad: 'seguridad', documentacion: 'documentacion' };

let usuarioEnSesion = null;

/** El usuario de la sesion, con la lista de modulos que le corresponde. */
function conPermisos(u) {
  return { ...u, activo: !!u.activo, modulos: PERMISOS[u.rol] ?? [] };
}

/**
 * Atiende una peticion con la misma forma que la API real.
 * Lanza { codigo, mensaje } para reproducir los errores del servidor.
 */
export async function atender(metodo, rutaCompleta, cuerpo = {}) {
  const url = new URL(rutaCompleta, location.origin);
  const ruta = url.pathname;
  const q = Object.fromEntries(url.searchParams);
  const partes = ruta.split('/').filter(Boolean); // ['api', 'gafetes', '3']
  const recurso = partes[1];
  const id = partes[2] ? Number(partes[2]) : null;

  /* --- Sesion --- */
  if (ruta === '/api/sesion') {
    return {
      usuario: usuarioEnSesion ? conPermisos(usuarioEnSesion) : null,
      roles: ROLES,
      permisos: PERMISOS,
    };
  }
  if (ruta === '/api/sesion/iniciar') {
    const nombre = String(cuerpo.usuario ?? '').trim().toLowerCase();
    const clave = String(cuerpo.contrasena ?? '');
    const cuenta = datos.usuarios.find((u) => u.usuario === nombre);
    if (!cuenta || CLAVES_DEMO[nombre] !== clave) {
      throw {
        codigo: 401,
        mensaje: 'Usuario o contrasena incorrectos. En la demostracion la contrasena es igual al usuario (admin / admin).',
      };
    }
    usuarioEnSesion = cuenta;
    cuenta.ultimo_acceso = ahora();
    registrarBitacora('Inicio de sesion', 'Seguridad', `Perfil: ${ROLES[cuenta.rol] ?? cuenta.rol}`);
    guardar();
    return { usuario: conPermisos(cuenta) };
  }
  if (ruta === '/api/sesion/cerrar') {
    usuarioEnSesion = null;
    return { cerrada: true };
  }

  /* --- Control de acceso por modulo --- */
  const modulosPropios = PERMISOS[usuarioEnSesion?.rol] ?? [];
  if (['empleados', 'gafetes', 'extintores', 'equipos', 'licencias'].includes(recurso) && !modulosPropios.includes(recurso)) {
    throw { codigo: 403, mensaje: 'Su perfil no tiene asignado ese modulo' };
  }
  if (['usuarios', 'bitacora'].includes(recurso) && usuarioEnSesion?.rol !== 'admin') {
    throw { codigo: 403, mensaje: 'Esta seccion es exclusiva del Administrador' };
  }
  if (ruta === '/api/configuracion' && metodo === 'PUT' && usuarioEnSesion?.rol !== 'admin') {
    throw { codigo: 403, mensaje: 'Esta seccion es exclusiva del Administrador' };
  }
  if (ruta === '/api/tipos-alerta' && metodo === 'PUT' && usuarioEnSesion?.rol !== 'admin') {
    throw { codigo: 403, mensaje: 'Esta seccion es exclusiva del Administrador' };
  }

  /* --- Tablero --- */
  if (ruta === '/api/panel') {
    const items = listarVigencias();
    const resumen = resumenVigencias(items);
    const porModulo = {};
    for (const m of ['gafetes', 'extintores', 'equipos', 'licencias']) {
      const p = items.filter((i) => i.modulo === m);
      porModulo[m] = {
        total: p.length,
        vencido: p.filter((i) => i.clasificacion === 'vencido').length,
        critico: p.filter((i) => i.clasificacion === 'critico').length,
        proximo: p.filter((i) => i.clasificacion === 'proximo').length,
        vigente: p.filter((i) => i.clasificacion === 'vigente').length,
      };
    }
    const meses = [];
    const base = new Date(`${hoyISO()}T00:00:00`);
    for (let k = 0; k < 6; k++) {
      const d = new Date(base.getFullYear(), base.getMonth() + k, 1);
      const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      meses.push({ clave, etiqueta: d.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' }), total: items.filter((i) => i.fecha.startsWith(clave)).length });
    }
    return {
      umbrales: { critico: Number(datos.configuracion.dias_criticos), proximo: Number(datos.configuracion.dias_proximos) },
      linea: items.filter((i) => i.dias <= 180).map((i) => ({ modulo: i.modulo, referencia: i.referencia, concepto: i.concepto, fecha: i.fecha, dias: i.dias, clasificacion: i.clasificacion, semaforo: i.semaforo })),
      porTipo: datos.tipos_alerta.map((t) => {
        const p = items.filter((i) => i.tipo === t.clave);
        return { ...t, total: p.length, rojo: p.filter((i) => i.semaforo === 'rojo').length, amarillo: p.filter((i) => i.semaforo === 'amarillo').length, verde: p.filter((i) => i.semaforo === 'verde').length };
      }),
      totales: {
        empleados: datos.empleados.filter((e) => e.activo).length,
        gafetes: datos.gafetes.length, extintores: datos.extintores.length,
        equipos: datos.equipos.length, licencias: datos.licencias.length,
        notificaciones: datos.notificaciones.filter((n) => !n.leida).length,
      },
      resumen, porModulo, meses,
      atencion: items.filter((i) => i.clasificacion !== 'vigente').slice(0, 12),
      configuracion: datos.configuracion,
    };
  }

  if (ruta === '/api/resumen') {
    return {
      resumen: resumenVigencias(),
      sinLeer: datos.notificaciones.filter((n) => !n.leida).length,
      ultimaRevision: datos.bitacora.find((b) => b.accion === 'Revision de vencimientos')?.fecha ?? null,
    };
  }

  if (ruta === '/api/catalogos') {
    return {
      empleados: datos.empleados.filter((e) => e.activo).map((e) => ({ id: e.id, rpe: e.rpe, nombre: e.nombre, departamento: e.departamento })).sort((a, b) => a.nombre.localeCompare(b.nombre)),
      tiposExtintor: ['PQS', 'CO2', 'Agua a presion', 'Espuma AFFF', 'Halotron', 'Acetato de potasio'],
      tiposGafete: ['Empleado', 'Contratista', 'Visitante frecuente', 'Prestador de servicio social', 'Residente'],
      nivelesAcceso: ['General', 'Areas energizadas', 'Subestaciones', 'Almacen', 'Total'],
      categoriasEquipo: CATEGORIAS_EQUIPO,
      tiposLicencia: ['Automovilista', 'Chofer', 'Chofer de servicio publico', 'Federal tipo B', 'Federal tipo C', 'Federal tipo E', 'Motociclista'],
      ambitosLicencia: ['Estatal', 'Federal'],
      estadosGafete: ['Activo', 'Suspendido', 'Cancelado', 'En tramite'],
      estadosExtintor: ['Operativo', 'En mantenimiento', 'Fuera de servicio', 'Baja'],
      estadosEquipo: ['En servicio', 'En almacen', 'En mantenimiento', 'Baja'],
      estadosLicencia: ['Vigente', 'En tramite', 'Suspendida', 'Cancelado'],
      tiposAlerta: datos.tipos_alerta,
      semaforo: SEMAFORO,
      departamentos: [...new Set(datos.empleados.map((e) => e.departamento).filter(Boolean))].sort(),
    };
  }

  if (ruta === '/api/vigencias') {
    let items = listarVigencias();
    if (q.estado && q.estado !== 'todos') {
      items = ['rojo', 'amarillo', 'verde'].includes(q.estado)
        ? items.filter((i) => i.semaforo === q.estado)
        : items.filter((i) => i.clasificacion === q.estado);
    }
    if (q.modulo && q.modulo !== 'todos') items = items.filter((i) => i.modulo === q.modulo);
    if (q.tipo && q.tipo !== 'todos') items = items.filter((i) => i.tipo === q.tipo);
    if (q.q) {
      const t = q.q.toLowerCase();
      items = items.filter((i) => `${i.referencia} ${i.descripcion} ${i.concepto} ${i.ubicacion} ${i.responsable}`.toLowerCase().includes(t));
    }
    return { items, resumen: resumenVigencias(), umbrales: { critico: 7, proximo: 30 } };
  }

  /* --- Alertas --- */
  if (ruta === '/api/alertas/revisar') return revisarVencimientos();

  if (ruta === '/api/notificaciones') {
    const orden = { vencido: 0, critico: 1, proximo: 2 };
    const items = datos.notificaciones
      .filter((n) => (q.nuevas === '1' ? !n.leida : true))
      .sort((a, b) => a.leida - b.leida || orden[a.severidad] - orden[b.severidad] || a.dias_restantes - b.dias_restantes);
    return { items, sinLeer: datos.notificaciones.filter((n) => !n.leida).length };
  }
  if (ruta === '/api/notificaciones/leer-todas') {
    const n = datos.notificaciones.filter((x) => !x.leida).length;
    datos.notificaciones.forEach((x) => (x.leida = 1));
    guardar();
    return { actualizadas: n };
  }
  if (recurso === 'notificaciones' && partes[3] === 'leer') {
    const n = datos.notificaciones.find((x) => x.id === id);
    if (n) n.leida = 1;
    guardar();
    return { ok: true };
  }
  if (recurso === 'notificaciones' && metodo === 'DELETE') {
    datos.notificaciones = datos.notificaciones.filter((x) => x.id !== id);
    guardar();
    return { eliminada: true };
  }

  /* --- Configuracion y tipos --- */
  if (ruta === '/api/configuracion') {
    if (metodo === 'PUT') {
      Object.assign(datos.configuracion, cuerpo);
      registrarBitacora('Modificacion', 'Configuracion', 'Parametros actualizados');
      guardar();
    }
    return datos.configuracion;
  }
  if (ruta === '/api/tipos-alerta') {
    if (metodo === 'PUT') {
      for (const [clave, valores] of Object.entries(cuerpo)) {
        const t = datos.tipos_alerta.find((x) => x.clave === clave);
        if (!t) continue;
        const proximo = Number(valores.dias_proximo) || 30;
        const critico = Number(valores.dias_critico) || 7;
        if (critico > proximo) throw { codigo: 400, mensaje: `En "${clave}" el umbral critico no puede ser mayor que el de aviso previo` };
        t.dias_proximo = proximo;
        t.dias_critico = critico;
      }
      registrarBitacora('Modificacion', 'Configuracion', 'Umbrales por tipo actualizados');
      guardar();
    }
    return datos.tipos_alerta;
  }

  if (ruta === '/api/bitacora') return datos.bitacora;

  /* --- Usuarios (solo lectura en la demostracion) --- */
  if (recurso === 'usuarios') {
    if (metodo === 'GET') return datos.usuarios;
    throw { codigo: 403, mensaje: 'La demostracion no permite modificar cuentas de acceso' };
  }
  if (ruta === '/api/perfil/contrasena') throw { codigo: 403, mensaje: 'La demostracion no permite cambiar la contrasena' };

  /* --- Credencial --- */
  if (recurso === 'gafetes' && partes[3] === 'credencial') {
    const g = datos.gafetes.find((x) => x.id === id);
    if (!g) throw { codigo: 404, mensaje: 'El gafete no existe' };
    return { gafete: enriquecer('gafetes', g), configuracion: datos.configuracion, vigencia: {} };
  }

  /* --- Acciones: Renovar, Recarga, Mantto. y Refrendo (mismas reglas que el servidor) --- */
  if (metodo === 'POST' && ACCIONES[recurso] && id !== null && partes[3] === ACCIONES[recurso].accion) {
    const actual = datos[recurso].find((x) => x.id === id);
    if (!actual) throw { codigo: 404, mensaje: 'El registro no existe' };
    const { error, cambios } = ACCIONES[recurso].plan(actual, cuerpo, hoyISO());
    if (error) throw { codigo: 400, mensaje: error };
    Object.assign(actual, cambios);
    registrarBitacora('Modificacion', recurso, `${ACCIONES[recurso].detalle} del registro ${id}`);
    guardar();
    return enriquecer(recurso, actual);
  }

  /* --- CRUD generico --- */
  if (['empleados', 'gafetes', 'extintores', 'equipos', 'licencias'].includes(recurso)) {
    if (metodo === 'GET' && id === null) return listar(recurso, q.q);
    if (metodo === 'GET') {
      const r = datos[recurso].find((x) => x.id === id);
      if (!r) throw { codigo: 404, mensaje: 'El registro no existe' };
      return enriquecer(recurso, r);
    }
    if (metodo === 'POST') {
      const registro = { id: siguienteId(recurso), creado_en: ahora(), ...normalizar(cuerpo) };
      validar(recurso, registro);
      const c1 = validarRegistro(recurso, registro, {}, hoyISO());
      if (c1.error) throw { codigo: 400, mensaje: c1.error };
      verificarUnico(recurso, registro);
      datos[recurso].push(registro);
      registrarBitacora('Alta', recurso, `Registro ${registro.id} creado`);
      guardar();
      return enriquecer(recurso, registro);
    }
    if (metodo === 'PUT') {
      const actual = datos[recurso].find((x) => x.id === id);
      if (!actual) throw { codigo: 404, mensaje: 'El registro no existe' };
      const nuevo = { ...actual, ...normalizar(cuerpo) };
      validar(recurso, nuevo);
      const c2 = validarRegistro(recurso, normalizar(cuerpo), actual, hoyISO());
      if (c2.error) throw { codigo: 400, mensaje: c2.error };
      verificarUnico(recurso, nuevo, id);
      Object.assign(actual, nuevo);
      registrarBitacora('Modificacion', recurso, `Registro ${id} actualizado`);
      guardar();
      return enriquecer(recurso, actual);
    }
    if (metodo === 'DELETE') {
      datos[recurso] = datos[recurso].filter((x) => x.id !== id);
      datos.notificaciones = datos.notificaciones.filter((n) => !(n.modulo === recurso && n.registro_id === id));
      registrarBitacora('Baja', recurso, `Registro ${id} eliminado`);
      guardar();
      return { eliminado: true };
    }
  }

  throw { codigo: 404, mensaje: 'Servicio no disponible en la demostracion' };
}

// La primera revision se ejecuta al cargar, igual que hace el servidor real.
revisarVencimientos();
