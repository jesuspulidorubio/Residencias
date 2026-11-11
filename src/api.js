/**
 * Definicion de todos los servicios (API REST) del sistema.
 *
 * El acceso no es jerarquico: cada ruta declara el permiso que exige.
 *   'lectura'             -> cualquier usuario con sesion (panel, vigencias, alertas)
 *   { modulo: 'gafetes' } -> solo los perfiles que administran ese modulo
 *   'admin'               -> usuarios, configuracion y bitacora
 *
 * El reparto de modulos por perfil esta en PERMISOS (src/config.js).
 */
import { Router } from './router.js';
import {
  bd, leerConfiguracion, guardarConfiguracion, umbrales, bitacora,
  tiposAlerta, umbralesPorTipo, guardarTipoAlerta,
} from './bd.js';
import { listarVigencias, resumenVigencias, SEMAFORO } from './vigencias.js';
import { revisarVencimientos } from './alertas.js';
import { crearHash, iniciarSesion, cerrarSesion, publico, exigirPermiso } from './auth.js';
import { ErrorApp, txt, num, esFecha, aCSV, hoyISO, estadoVigencia } from './util.js';
import { ROLES, ROLES_ASIGNABLES, PERMISOS, NOMBRE_MODULO, CATEGORIAS_EQUIPO } from './config.js';
// Reglas de Renovar / Recarga / Mantto. / Refrendo: las comparte el navegador.
import { ACCIONES, validarRegistro } from '../public/js/reglas.js';

export const api = new Router();

/* ================================================================== */
/* Utilerias internas                                                  */
/* ================================================================== */

/** Convierte y valida los campos recibidos segun la definicion de la entidad. */
function sanear(campos, cuerpo, parcial = false) {
  const datos = {};
  for (const c of campos) {
    if (parcial && !(c.nombre in cuerpo)) continue;
    let v = cuerpo[c.nombre];
    switch (c.tipo) {
      case 'num':
        v = num(v, c.porDefecto ?? 0);
        break;
      case 'entero':
        v = Math.trunc(num(v, c.porDefecto ?? 0));
        break;
      case 'id':
        v = v === '' || v === null || v === undefined ? null : num(v, null);
        break;
      case 'fecha':
        v = esFecha(v) ? v : null;
        break;
      case 'largo':
        v = txt(v, 200000);
        break;
      default:
        v = txt(v, c.max ?? 300);
    }
    if (c.req && (v === null || v === '')) {
      throw new ErrorApp(`El campo "${c.etiqueta ?? c.nombre}" es obligatorio y debe ser valido`, 400);
    }

    // Campos de catalogo cerrado: se valida contra la lista, no solo en el
    // formulario, para que tampoco se puedan colar llamando la API directo.
    if (c.opciones && v !== '' && v !== null && !c.opciones.includes(v)) {
      throw new ErrorApp(
        `El valor "${v}" no es una opcion valida de "${c.etiqueta ?? c.nombre}". Opciones: ${c.opciones.join(', ')}`,
        400
      );
    }

    datos[c.nombre] = v;
  }
  return datos;
}

function ejecutar(sentencia, valores, mensajeDuplicado) {
  try {
    return sentencia.run(...valores);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new ErrorApp(mensajeDuplicado, 409);
    throw e;
  }
}

function obtenerOFallar(tabla, id) {
  const fila = bd.prepare(`SELECT * FROM ${tabla} WHERE id = ?`).get(num(id, -1));
  if (!fila) throw new ErrorApp('El registro no existe', 404);
  return fila;
}

/**
 * Registra las cuatro operaciones basicas de una entidad.
 * consultaSQL permite unir tablas para mostrar nombres relacionados.
 */
/**
 * Valida la cronologia de un registro (alta o edicion) con las reglas de su
 * modulo (public/js/reglas.js, las mismas que usa el formulario). En una
 * actualizacion parcial se mezcla con el registro guardado para que la
 * comparacion use tambien los valores que no venian en el envio.
 */
function validarCronologia(modulo, datos, previo = {}) {
  const { error } = validarRegistro(modulo, datos, previo, hoyISO());
  if (error) throw new ErrorApp(error, 400);
}

function registrarEntidad({ ruta, tabla, modulo, campos, consultaSQL, orden = 'id DESC', busqueda = [] }) {
  const nombres = campos.map((c) => c.nombre);

  // Cada modulo queda reservado al perfil que lo tiene asignado (ver
  // PERMISOS en src/config.js). El Administrador los tiene todos.
  const permiso = { modulo: ruta };

  api.get(`/api/${ruta}`, ({ query }) => {
    let sql = consultaSQL ?? `SELECT * FROM ${tabla}`;
    const valores = [];
    const filtros = [];
    const q = txt(query.q);
    if (q && busqueda.length) {
      filtros.push(`(${busqueda.map((c) => `${c} LIKE ?`).join(' OR ')})`);
      for (const _ of busqueda) valores.push(`%${q}%`);
    }
    if (filtros.length) sql += ` WHERE ${filtros.join(' AND ')}`;
    sql += ` ORDER BY ${orden}`;
    return bd.prepare(sql).all(...valores);
  }, permiso);

  api.get(`/api/${ruta}/:id`, ({ params }) => obtenerOFallar(tabla, params.id), permiso);

  api.post(`/api/${ruta}`, ({ cuerpo, usuario }) => {
    const datos = sanear(campos, cuerpo);
    validarCronologia(ruta, datos);
    const sql = `INSERT INTO ${tabla} (${nombres.join(', ')}) VALUES (${nombres.map(() => '?').join(', ')})`;
    const r = ejecutar(bd.prepare(sql), nombres.map((n) => datos[n]), `Ya existe un registro con esa clave en ${modulo}`);
    bitacora(usuario.usuario, 'Alta', modulo, `Registro ${Number(r.lastInsertRowid)} creado`);
    return obtenerOFallar(tabla, Number(r.lastInsertRowid));
  }, permiso);

  api.put(`/api/${ruta}/:id`, ({ params, cuerpo, usuario }) => {
    const previo = obtenerOFallar(tabla, params.id);
    const datos = sanear(campos, cuerpo, true);
    const claves = Object.keys(datos);
    if (!claves.length) throw new ErrorApp('No se recibieron datos para actualizar', 400);
    validarCronologia(ruta, datos, previo);
    const sql = `UPDATE ${tabla} SET ${claves.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
    ejecutar(bd.prepare(sql), [...claves.map((k) => datos[k]), num(params.id)], `Ya existe otro registro con esa clave en ${modulo}`);
    bitacora(usuario.usuario, 'Modificacion', modulo, `Registro ${params.id} actualizado`);
    return obtenerOFallar(tabla, params.id);
  }, permiso);

  api.delete(`/api/${ruta}/:id`, ({ params, usuario }) => {
    obtenerOFallar(tabla, params.id);
    bd.prepare(`DELETE FROM ${tabla} WHERE id = ?`).run(num(params.id));
    bd.prepare('DELETE FROM notificaciones WHERE modulo = ? AND registro_id = ?').run(ruta, num(params.id));
    bitacora(usuario.usuario, 'Baja', modulo, `Registro ${params.id} eliminado`);
    return { eliminado: true };
  }, permiso);
}

/* ================================================================== */
/* Sesion                                                              */
/* ================================================================== */

api.post('/api/sesion/iniciar', async ({ cuerpo, cookie }) => {
  const { token, usuario } = await iniciarSesion(cuerpo.usuario, cuerpo.contrasena);
  cookie(token);
  bitacora(usuario.usuario, 'Inicio de sesion', 'Seguridad', `Rol: ${ROLES[usuario.rol] ?? usuario.rol}`);
  return { usuario };
});

api.post('/api/sesion/cerrar', async ({ token, cookie, usuario }) => {
  await cerrarSesion(token);
  cookie('');
  if (usuario) bitacora(usuario.usuario, 'Cierre de sesion', 'Seguridad');
  return { cerrada: true };
});

api.get('/api/sesion', ({ usuario }) => ({
  usuario: usuario ?? null,
  roles: ROLES,
  permisos: PERMISOS,
  nombresModulo: NOMBRE_MODULO,
}));

/* ================================================================== */
/* Panel principal                                                     */
/* ================================================================== */

api.get('/api/panel', () => {
  const items = listarVigencias();
  const resumen = resumenVigencias(items);
  const u = umbrales();

  const contar = (sql) => bd.prepare(sql).get().n;
  const porModulo = {};
  for (const m of ['gafetes', 'extintores', 'equipos', 'licencias']) {
    const propios = items.filter((i) => i.modulo === m);
    porModulo[m] = {
      total: propios.length,
      vencido: propios.filter((i) => i.clasificacion === 'vencido').length,
      critico: propios.filter((i) => i.clasificacion === 'critico').length,
      proximo: propios.filter((i) => i.clasificacion === 'proximo').length,
      vigente: propios.filter((i) => i.clasificacion === 'vigente').length,
    };
  }

  // Distribucion de vencimientos en los proximos 6 meses.
  const meses = [];
  const base = new Date(`${hoyISO()}T00:00:00`);
  for (let k = 0; k < 6; k++) {
    const d = new Date(base.getFullYear(), base.getMonth() + k, 1);
    const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    meses.push({
      clave,
      etiqueta: d.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' }),
      total: items.filter((i) => i.fecha.startsWith(clave)).length,
    });
  }

  // Conceptos que caen dentro de la ventana de 180 dias (linea de tiempo).
  const linea = items
    .filter((i) => i.dias <= 180)
    .map((i) => ({
      modulo: i.modulo,
      referencia: i.referencia,
      concepto: i.concepto,
      fecha: i.fecha,
      dias: i.dias,
      clasificacion: i.clasificacion,
      semaforo: i.semaforo,
    }));

  // Reparto por tipo de elemento del anteproyecto.
  const porTipo = tiposAlerta().map((t) => {
    const propios = items.filter((i) => i.tipo === t.clave);
    return {
      ...t,
      total: propios.length,
      rojo: propios.filter((i) => i.semaforo === 'rojo').length,
      amarillo: propios.filter((i) => i.semaforo === 'amarillo').length,
      verde: propios.filter((i) => i.semaforo === 'verde').length,
    };
  });

  return {
    umbrales: u,
    linea,
    porTipo,
    totales: {
      empleados: contar('SELECT COUNT(*) AS n FROM empleados WHERE activo = 1'),
      gafetes: contar('SELECT COUNT(*) AS n FROM gafetes'),
      extintores: contar('SELECT COUNT(*) AS n FROM extintores'),
      equipos: contar('SELECT COUNT(*) AS n FROM equipos'),
      licencias: contar('SELECT COUNT(*) AS n FROM licencias'),
      notificaciones: contar('SELECT COUNT(*) AS n FROM notificaciones WHERE leida = 0'),
    },
    resumen,
    porModulo,
    meses,
    atencion: items.filter((i) => i.clasificacion !== 'vigente').slice(0, 12),
    configuracion: leerConfiguracion(),
  };
}, 'lectura');

/** Resumen ligero para la cinta de estado operativo de la barra superior. */
api.get('/api/resumen', () => ({
  resumen: resumenVigencias(),
  sinLeer: bd.prepare('SELECT COUNT(*) AS n FROM notificaciones WHERE leida = 0').get().n,
  ultimaRevision:
    bd.prepare("SELECT fecha FROM bitacora WHERE accion = 'Revision de vencimientos' ORDER BY id DESC LIMIT 1").get()
      ?.fecha ?? null,
}), 'lectura');

/* ================================================================== */
/* Catalogos auxiliares (para los formularios)                         */
/* ================================================================== */

api.get('/api/catalogos', () => ({
  empleados: bd.prepare('SELECT id, rpe, nombre, departamento FROM empleados WHERE activo = 1 ORDER BY nombre').all(),
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
  tiposAlerta: tiposAlerta(),
  semaforo: SEMAFORO,
  departamentos: bd.prepare("SELECT DISTINCT departamento AS d FROM empleados WHERE departamento <> '' ORDER BY d").all().map((r) => r.d),
}), 'lectura');

/* ================================================================== */
/* Empleados                                                           */
/* ================================================================== */

registrarEntidad({
  ruta: 'empleados',
  tabla: 'empleados',
  modulo: 'Empleados',
  orden: 'nombre',
  busqueda: ['rpe', 'nombre', 'puesto', 'departamento', 'centro_trabajo'],
  campos: [
    { nombre: 'rpe', req: true, etiqueta: 'RPE', max: 20 },
    { nombre: 'nombre', req: true, etiqueta: 'Nombre completo' },
    { nombre: 'puesto' },
    { nombre: 'departamento' },
    { nombre: 'centro_trabajo' },
    { nombre: 'correo' },
    { nombre: 'telefono', max: 20 },
    { nombre: 'tipo_sangre', max: 5 },
    { nombre: 'foto', tipo: 'largo' },
    { nombre: 'activo', tipo: 'entero', porDefecto: 1 },
  ],
});

/* ================================================================== */
/* Gafetes                                                             */
/* ================================================================== */

registrarEntidad({
  ruta: 'gafetes',
  tabla: 'gafetes',
  modulo: 'Gafetes',
  orden: 'g.fecha_vencimiento',
  busqueda: ['g.folio', 'e.nombre', 'e.rpe', 'g.tipo'],
  consultaSQL: `SELECT g.*, e.nombre AS empleado, e.rpe, e.puesto, e.departamento, e.foto
                FROM gafetes g JOIN empleados e ON e.id = g.empleado_id`,
  campos: [
    { nombre: 'folio', req: true, etiqueta: 'Folio', max: 30 },
    { nombre: 'empleado_id', tipo: 'id', req: true, etiqueta: 'Empleado' },
    { nombre: 'tipo', req: true, etiqueta: 'Tipo' },
    { nombre: 'nivel_acceso' },
    { nombre: 'fecha_emision', tipo: 'fecha', req: true, etiqueta: 'Fecha de emision' },
    { nombre: 'fecha_vencimiento', tipo: 'fecha', req: true, etiqueta: 'Fecha de vencimiento' },
    { nombre: 'estado', req: true, etiqueta: 'Estado' },
    { nombre: 'observaciones', max: 1000 },
  ],
});

/** Datos completos para imprimir la credencial. */
api.get('/api/gafetes/:id/credencial', ({ params }) => {
  const g = bd
    .prepare(
      `SELECT g.*, e.nombre AS empleado, e.rpe, e.puesto, e.departamento, e.centro_trabajo,
              e.tipo_sangre, e.telefono, e.foto
       FROM gafetes g JOIN empleados e ON e.id = g.empleado_id WHERE g.id = ?`
    )
    .get(num(params.id, -1));
  if (!g) throw new ErrorApp('El gafete no existe', 404);
  return {
    gafete: g,
    configuracion: leerConfiguracion(),
    vigencia: estadoVigencia(g.fecha_vencimiento, umbralesPorTipo().gafete ?? umbrales()),
  };
}, { modulo: 'gafetes' });

/* ================================================================== */
/* Extintores                                                          */
/* ================================================================== */

registrarEntidad({
  ruta: 'extintores',
  tabla: 'extintores',
  modulo: 'Extintores',
  orden: 'x.fecha_prox_recarga',
  busqueda: ['x.codigo', 'x.tipo', 'x.ubicacion', 'x.area', 'x.marca'],
  consultaSQL: `SELECT x.*, e.nombre AS responsable
                FROM extintores x LEFT JOIN empleados e ON e.id = x.responsable_id`,
  campos: [
    { nombre: 'codigo', req: true, etiqueta: 'Codigo', max: 30 },
    { nombre: 'tipo', req: true, etiqueta: 'Tipo de agente' },
    { nombre: 'capacidad_kg', tipo: 'num' },
    { nombre: 'marca' },
    { nombre: 'ubicacion', req: true, etiqueta: 'Ubicacion' },
    { nombre: 'area' },
    { nombre: 'fecha_fabricacion', tipo: 'fecha' },
    { nombre: 'fecha_recarga', tipo: 'fecha' },
    { nombre: 'fecha_prox_recarga', tipo: 'fecha', req: true, etiqueta: 'Proxima recarga' },
    { nombre: 'fecha_prueba_hidrostatica', tipo: 'fecha' },
    { nombre: 'fecha_prox_hidrostatica', tipo: 'fecha' },
    { nombre: 'responsable_id', tipo: 'id' },
    { nombre: 'estado', req: true, etiqueta: 'Estado' },
    { nombre: 'observaciones', max: 1000 },
  ],
});

/* ================================================================== */
/* Equipo con vigencia                                                 */
/* ================================================================== */

registrarEntidad({
  ruta: 'equipos',
  tabla: 'equipos',
  modulo: 'Equipo',
  orden: 'q.fecha_vencimiento',
  busqueda: ['q.codigo', 'q.nombre', 'q.categoria', 'q.marca', 'q.ubicacion', 'q.serie'],
  consultaSQL: `SELECT q.*, e.nombre AS responsable
                FROM equipos q LEFT JOIN empleados e ON e.id = q.responsable_id`,
  campos: [
    { nombre: 'codigo', req: true, etiqueta: 'Codigo', max: 30 },
    { nombre: 'nombre', req: true, etiqueta: 'Nombre del equipo' },
    { nombre: 'categoria', req: true, etiqueta: 'Categoria', opciones: CATEGORIAS_EQUIPO },
    { nombre: 'marca' },
    { nombre: 'modelo' },
    { nombre: 'serie' },
    { nombre: 'tipo_alerta', req: true, etiqueta: 'Tipo de elemento', max: 20 },
    { nombre: 'ubicacion' },
    { nombre: 'responsable_id', tipo: 'id' },
    { nombre: 'fecha_adquisicion', tipo: 'fecha' },
    { nombre: 'fecha_inicio', tipo: 'fecha', req: true, etiqueta: 'Fecha de inicio de vigencia' },
    { nombre: 'fecha_vencimiento', tipo: 'fecha', req: true, etiqueta: 'Fecha de vencimiento' },
    { nombre: 'frecuencia_meses', tipo: 'entero' },
    { nombre: 'fecha_ultimo_mantenimiento', tipo: 'fecha' },
    { nombre: 'estado', req: true, etiqueta: 'Estado' },
    { nombre: 'observaciones', max: 1000 },
  ],
});

/* ================================================================== */
/* Licencias de conducir                                               */
/* ================================================================== */

registrarEntidad({
  ruta: 'licencias',
  tabla: 'licencias',
  modulo: 'Licencias',
  orden: 'l.fecha_vencimiento',
  busqueda: ['l.numero', 'e.nombre', 'e.rpe', 'l.tipo', 'l.ambito'],
  consultaSQL: `SELECT l.*, e.nombre AS empleado, e.rpe, e.puesto, e.departamento
                FROM licencias l JOIN empleados e ON e.id = l.empleado_id`,
  campos: [
    { nombre: 'numero', req: true, etiqueta: 'Numero de licencia', max: 40 },
    { nombre: 'empleado_id', tipo: 'id', req: true, etiqueta: 'Empleado' },
    { nombre: 'tipo', req: true, etiqueta: 'Tipo de licencia' },
    { nombre: 'ambito', req: true, etiqueta: 'Ambito' },
    { nombre: 'autoridad', etiqueta: 'Autoridad emisora' },
    { nombre: 'fecha_inicio', tipo: 'fecha', req: true, etiqueta: 'Fecha de expedicion' },
    { nombre: 'fecha_vencimiento', tipo: 'fecha', req: true, etiqueta: 'Fecha de vencimiento' },
    { nombre: 'restricciones', max: 200 },
    { nombre: 'estado', req: true, etiqueta: 'Estado' },
    { nombre: 'observaciones', max: 1000 },
  ],
});

/* ================================================================== */
/* Acciones: Renovar, Recarga, Mantto. y Refrendo                      */
/* ================================================================== */

/**
 * POST /api/<modulo>/:id/<accion>
 *
 * Cada accion tiene su propia regla (ver public/js/reglas.js). El servidor
 * calcula las fechas derivadas (vencimiento, proxima recarga...) y rechaza
 * con 400 lo que no cumpla, sin importar lo que haya validado el navegador.
 */
const NOMBRE_ACCION = { gafetes: 'Gafetes', extintores: 'Extintores', equipos: 'Equipo', licencias: 'Licencias' };

for (const [ruta, { accion, detalle, plan }] of Object.entries(ACCIONES)) {
  const tabla = ruta; // la tabla se llama igual que la ruta
  api.post(
    `/api/${ruta}/:id/${accion}`,
    ({ params, cuerpo, usuario }) => {
      const previo = obtenerOFallar(tabla, params.id);
      const { error, cambios } = plan(previo, cuerpo ?? {}, hoyISO());
      if (error) throw new ErrorApp(error, 400);

      const claves = Object.keys(cambios);
      bd.prepare(`UPDATE ${tabla} SET ${claves.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(
        ...claves.map((k) => cambios[k]),
        num(params.id)
      );
      bitacora(usuario.usuario, 'Modificacion', NOMBRE_ACCION[ruta], `${detalle} del registro ${params.id}: ${claves.map((k) => `${k}=${cambios[k]}`).join(', ')}`);
      return obtenerOFallar(tabla, params.id);
    },
    { modulo: ruta }
  );
}

/* ================================================================== */
/* Tipos de elemento y sus umbrales de aviso                           */
/* ================================================================== */

api.get('/api/tipos-alerta', () => tiposAlerta(), 'lectura');

api.put('/api/tipos-alerta', ({ cuerpo, usuario }) => {
  const claves = tiposAlerta().map((t) => t.clave);
  for (const [clave, valores] of Object.entries(cuerpo)) {
    if (!claves.includes(clave)) continue;
    const proximo = num(valores?.dias_proximo, 30);
    const critico = num(valores?.dias_critico, 7);
    if (critico > proximo) {
      throw new ErrorApp(`En "${clave}" el umbral critico no puede ser mayor que el de aviso previo`, 400);
    }
    guardarTipoAlerta(clave, proximo, critico);
  }
  bitacora(usuario.usuario, 'Modificacion', 'Configuracion', 'Umbrales por tipo de elemento actualizados');
  return tiposAlerta();
}, 'admin');

/* ================================================================== */
/* Vigencias (vista unificada)                                         */
/* ================================================================== */

api.get('/api/vigencias', ({ query }) => {
  let items = listarVigencias();
  const estado = txt(query.estado);
  const modulo = txt(query.modulo);
  const tipo = txt(query.tipo);
  const q = txt(query.q).toLowerCase();
  if (estado && estado !== 'todos') {
    // Admite tanto la clasificacion fina como el color del semaforo.
    items = ['rojo', 'amarillo', 'verde'].includes(estado)
      ? items.filter((i) => i.semaforo === estado)
      : items.filter((i) => i.clasificacion === estado);
  }
  if (modulo && modulo !== 'todos') items = items.filter((i) => i.modulo === modulo);
  if (tipo && tipo !== 'todos') items = items.filter((i) => i.tipo === tipo);
  if (q) {
    items = items.filter((i) =>
      `${i.referencia} ${i.descripcion} ${i.concepto} ${i.ubicacion} ${i.responsable}`.toLowerCase().includes(q)
    );
  }
  return { items, resumen: resumenVigencias(), umbrales: umbrales() };
}, 'lectura');

/* ================================================================== */
/* Notificaciones                                                      */
/* ================================================================== */

api.get('/api/notificaciones', ({ query }) => {
  const soloNuevas = txt(query.nuevas) === '1';
  const filas = bd
    .prepare(
      `SELECT * FROM notificaciones ${soloNuevas ? 'WHERE leida = 0' : ''}
       ORDER BY leida ASC, CASE severidad WHEN 'vencido' THEN 0 WHEN 'critico' THEN 1 ELSE 2 END, dias_restantes ASC
       LIMIT 300`
    )
    .all();
  const sinLeer = bd.prepare('SELECT COUNT(*) AS n FROM notificaciones WHERE leida = 0').get().n;
  return { items: filas, sinLeer };
}, 'lectura');

api.post('/api/notificaciones/:id/leer', ({ params }) => {
  bd.prepare('UPDATE notificaciones SET leida = 1 WHERE id = ?').run(num(params.id, -1));
  return { ok: true };
}, 'lectura');

api.post('/api/notificaciones/leer-todas', ({ usuario }) => {
  const r = bd.prepare('UPDATE notificaciones SET leida = 1 WHERE leida = 0').run();
  bitacora(usuario.usuario, 'Notificaciones', 'Alertas', `${r.changes} notificaciones marcadas como leidas`);
  return { actualizadas: r.changes };
}, 'lectura');

api.delete('/api/notificaciones/:id', ({ params }) => {
  bd.prepare('DELETE FROM notificaciones WHERE id = ?').run(num(params.id, -1));
  return { eliminada: true };
}, 'admin');

api.post('/api/alertas/revisar', async ({ usuario }) => {
  const r = await revisarVencimientos(`manual (${usuario.usuario})`);
  return r;
}, 'lectura');

/* ================================================================== */
/* Usuarios del sistema                                                */
/* ================================================================== */

api.get('/api/usuarios', () => bd.prepare('SELECT * FROM usuarios ORDER BY nombre').all().map(publico), 'admin');

api.post('/api/usuarios', ({ cuerpo, usuario }) => {
  const datos = sanear(
    [
      { nombre: 'usuario', req: true, etiqueta: 'Usuario', max: 40 },
      { nombre: 'nombre', req: true, etiqueta: 'Nombre' },
      { nombre: 'correo' },
      { nombre: 'rol', req: true, etiqueta: 'Rol', max: 20 },
      { nombre: 'activo', tipo: 'entero', porDefecto: 1 },
    ],
    cuerpo
  );
  if (!ROLES_ASIGNABLES.includes(datos.rol)) throw new ErrorApp('Perfil no valido', 400);
  const contrasena = txt(cuerpo.contrasena);
  if (contrasena.length < 6) throw new ErrorApp('La contrasena debe tener al menos 6 caracteres', 400);

  const r = ejecutar(
    bd.prepare('INSERT INTO usuarios (usuario, nombre, correo, rol, activo, hash) VALUES (?, ?, ?, ?, ?, ?)'),
    [datos.usuario, datos.nombre, datos.correo, datos.rol, datos.activo, crearHash(contrasena)],
    'Ya existe un usuario con ese nombre de acceso'
  );
  bitacora(usuario.usuario, 'Alta', 'Usuarios', `Usuario ${datos.usuario} (${datos.rol})`);
  return publico(bd.prepare('SELECT * FROM usuarios WHERE id = ?').get(Number(r.lastInsertRowid)));
}, 'admin');

api.put('/api/usuarios/:id', ({ params, cuerpo, usuario }) => {
  const actual = obtenerOFallar('usuarios', params.id);
  const datos = sanear(
    [
      { nombre: 'nombre', etiqueta: 'Nombre' },
      { nombre: 'correo' },
      { nombre: 'rol', max: 20 },
      { nombre: 'activo', tipo: 'entero' },
    ],
    cuerpo,
    true
  );
  if (datos.rol && !ROLES_ASIGNABLES.includes(datos.rol)) throw new ErrorApp('Perfil no valido', 400);
  if (actual.usuario === 'admin' && datos.activo === 0) {
    throw new ErrorApp('No es posible desactivar la cuenta principal de administrador', 400);
  }
  const claves = Object.keys(datos);
  if (claves.length) {
    bd.prepare(`UPDATE usuarios SET ${claves.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(
      ...claves.map((k) => datos[k]),
      num(params.id)
    );
  }
  if (txt(cuerpo.contrasena)) {
    if (txt(cuerpo.contrasena).length < 6) throw new ErrorApp('La contrasena debe tener al menos 6 caracteres', 400);
    bd.prepare('UPDATE usuarios SET hash = ? WHERE id = ?').run(crearHash(txt(cuerpo.contrasena)), num(params.id));
  }
  bitacora(usuario.usuario, 'Modificacion', 'Usuarios', `Usuario ${actual.usuario} actualizado`);
  return publico(bd.prepare('SELECT * FROM usuarios WHERE id = ?').get(num(params.id)));
}, 'admin');

api.delete('/api/usuarios/:id', ({ params, usuario }) => {
  const actual = obtenerOFallar('usuarios', params.id);
  if (actual.usuario === 'admin') throw new ErrorApp('No es posible eliminar la cuenta principal de administrador', 400);
  if (actual.id === usuario.id) throw new ErrorApp('No puede eliminar su propia cuenta', 400);
  bd.prepare('DELETE FROM usuarios WHERE id = ?').run(actual.id);
  bitacora(usuario.usuario, 'Baja', 'Usuarios', `Usuario ${actual.usuario} eliminado`);
  return { eliminado: true };
}, 'admin');

/** Cambio de contrasena propia. */
api.post('/api/perfil/contrasena', ({ cuerpo, usuario }) => {
  const nueva = txt(cuerpo.nueva);
  if (nueva.length < 6) throw new ErrorApp('La contrasena debe tener al menos 6 caracteres', 400);
  bd.prepare('UPDATE usuarios SET hash = ? WHERE id = ?').run(crearHash(nueva), usuario.id);
  bitacora(usuario.usuario, 'Seguridad', 'Usuarios', 'Cambio de contrasena propia');
  return { ok: true };
}, 'lectura');

/* ================================================================== */
/* Configuracion                                                       */
/* ================================================================== */

api.get('/api/configuracion', () => leerConfiguracion(), 'lectura');

api.put('/api/configuracion', ({ cuerpo, usuario }) => {
  const permitidas = [
    'dias_criticos',
    'dias_proximos',
    'correo_administrador',
    'notificar_por_correo',
    'nombre_centro',
    'zona',
    'municipio',
    'area_responsable',
  ];
  for (const [clave, valor] of Object.entries(cuerpo)) {
    if (permitidas.includes(clave)) guardarConfiguracion(clave, txt(valor, 200));
  }
  bitacora(usuario.usuario, 'Modificacion', 'Configuracion', 'Parametros del sistema actualizados');
  return leerConfiguracion();
}, 'admin');

/* ================================================================== */
/* Bitacora                                                            */
/* ================================================================== */

api.get('/api/bitacora', () => bd.prepare('SELECT * FROM bitacora ORDER BY id DESC LIMIT 400').all(), 'admin');

/* ================================================================== */
/* Exportacion a CSV                                                   */
/* ================================================================== */

const EXPORTACIONES = {
  empleados: {
    sql: 'SELECT rpe, nombre, puesto, departamento, centro_trabajo, correo, telefono, tipo_sangre FROM empleados ORDER BY nombre',
    columnas: [
      { campo: 'rpe', titulo: 'RPE' },
      { campo: 'nombre', titulo: 'Nombre' },
      { campo: 'puesto', titulo: 'Puesto' },
      { campo: 'departamento', titulo: 'Departamento' },
      { campo: 'centro_trabajo', titulo: 'Centro de trabajo' },
      { campo: 'correo', titulo: 'Correo' },
      { campo: 'telefono', titulo: 'Telefono' },
      { campo: 'tipo_sangre', titulo: 'Tipo de sangre' },
    ],
  },
  gafetes: {
    sql: `SELECT g.folio, e.rpe, e.nombre AS empleado, g.tipo, g.nivel_acceso, g.fecha_emision, g.fecha_vencimiento, g.estado
          FROM gafetes g JOIN empleados e ON e.id = g.empleado_id ORDER BY g.fecha_vencimiento`,
    columnas: [
      { campo: 'folio', titulo: 'Folio' },
      { campo: 'rpe', titulo: 'RPE' },
      { campo: 'empleado', titulo: 'Empleado' },
      { campo: 'tipo', titulo: 'Tipo' },
      { campo: 'nivel_acceso', titulo: 'Nivel de acceso' },
      { campo: 'fecha_emision', titulo: 'Emision' },
      { campo: 'fecha_vencimiento', titulo: 'Vencimiento' },
      { campo: 'estado', titulo: 'Estado' },
    ],
  },
  extintores: {
    sql: `SELECT x.codigo, x.tipo, x.capacidad_kg, x.marca, x.ubicacion, x.area, x.fecha_recarga,
                 x.fecha_prox_recarga, x.fecha_prox_hidrostatica, x.estado, e.nombre AS responsable
          FROM extintores x LEFT JOIN empleados e ON e.id = x.responsable_id ORDER BY x.fecha_prox_recarga`,
    columnas: [
      { campo: 'codigo', titulo: 'Codigo' },
      { campo: 'tipo', titulo: 'Tipo' },
      { campo: 'capacidad_kg', titulo: 'Capacidad (kg)' },
      { campo: 'marca', titulo: 'Marca' },
      { campo: 'ubicacion', titulo: 'Ubicacion' },
      { campo: 'area', titulo: 'Area' },
      { campo: 'fecha_recarga', titulo: 'Ultima recarga' },
      { campo: 'fecha_prox_recarga', titulo: 'Proxima recarga' },
      { campo: 'fecha_prox_hidrostatica', titulo: 'Proxima hidrostatica' },
      { campo: 'estado', titulo: 'Estado' },
      { campo: 'responsable', titulo: 'Responsable' },
    ],
  },
  equipos: {
    sql: `SELECT q.codigo, q.nombre, q.categoria, q.marca, q.modelo, q.serie, q.ubicacion,
                 q.fecha_adquisicion, q.fecha_inicio, q.fecha_vencimiento, q.frecuencia_meses,
                 q.estado, e.nombre AS responsable
          FROM equipos q LEFT JOIN empleados e ON e.id = q.responsable_id ORDER BY q.fecha_vencimiento`,
    columnas: [
      { campo: 'codigo', titulo: 'Codigo' },
      { campo: 'nombre', titulo: 'Equipo' },
      { campo: 'categoria', titulo: 'Categoria' },
      { campo: 'marca', titulo: 'Marca' },
      { campo: 'modelo', titulo: 'Modelo' },
      { campo: 'serie', titulo: 'Serie' },
      { campo: 'ubicacion', titulo: 'Ubicacion' },
      { campo: 'fecha_adquisicion', titulo: 'Adquisicion' },
      { campo: 'fecha_inicio', titulo: 'Inicio de vigencia' },
      { campo: 'fecha_vencimiento', titulo: 'Vencimiento' },
      { campo: 'frecuencia_meses', titulo: 'Frecuencia (meses)' },
      { campo: 'estado', titulo: 'Estado' },
      { campo: 'responsable', titulo: 'Responsable' },
    ],
  },
  licencias: {
    sql: `SELECT l.numero, e.rpe, e.nombre AS empleado, l.tipo, l.ambito, l.autoridad,
                 l.fecha_inicio, l.fecha_vencimiento, l.restricciones, l.estado
          FROM licencias l JOIN empleados e ON e.id = l.empleado_id ORDER BY l.fecha_vencimiento`,
    columnas: [
      { campo: 'numero', titulo: 'Numero de licencia' },
      { campo: 'rpe', titulo: 'RPE' },
      { campo: 'empleado', titulo: 'Empleado' },
      { campo: 'tipo', titulo: 'Tipo' },
      { campo: 'ambito', titulo: 'Ambito' },
      { campo: 'autoridad', titulo: 'Autoridad emisora' },
      { campo: 'fecha_inicio', titulo: 'Expedicion' },
      { campo: 'fecha_vencimiento', titulo: 'Vencimiento' },
      { campo: 'restricciones', titulo: 'Restricciones' },
      { campo: 'estado', titulo: 'Estado' },
    ],
  },
  bitacora: {
    sql: 'SELECT fecha, usuario, accion, modulo, detalle FROM bitacora ORDER BY id DESC',
    columnas: [
      { campo: 'fecha', titulo: 'Fecha' },
      { campo: 'usuario', titulo: 'Usuario' },
      { campo: 'accion', titulo: 'Accion' },
      { campo: 'modulo', titulo: 'Modulo' },
      { campo: 'detalle', titulo: 'Detalle' },
    ],
  },
};

api.get('/api/exportar/:modulo', ({ params, usuario }) => {
  const modulo = params.modulo;

  // Exportar un catalogo exige el mismo permiso que consultarlo.
  if (NOMBRE_MODULO[modulo]) exigirPermiso(usuario, { modulo });
  if (modulo === 'bitacora') exigirPermiso(usuario, 'admin');

  if (modulo === 'vigencias') {
    const filas = listarVigencias().map((i) => ({
      modulo: i.modulo_nombre,
      referencia: i.referencia,
      descripcion: i.descripcion,
      concepto: i.concepto,
      inicio: i.fecha_inicio ?? '',
      fecha: i.fecha,
      dias: i.dias,
      clasificacion: i.clasificacion,
      semaforo: i.semaforo,
      ubicacion: i.ubicacion,
      responsable: i.responsable,
    }));
    return {
      __archivo: `vigencias_${hoyISO()}.csv`,
      contenido: aCSV(filas, [
        { campo: 'modulo', titulo: 'Elemento' },
        { campo: 'referencia', titulo: 'Referencia' },
        { campo: 'descripcion', titulo: 'Descripcion' },
        { campo: 'concepto', titulo: 'Concepto' },
        { campo: 'inicio', titulo: 'Fecha de inicio' },
        { campo: 'fecha', titulo: 'Fecha de caducidad' },
        { campo: 'dias', titulo: 'Dias restantes' },
        { campo: 'clasificacion', titulo: 'Clasificacion' },
        { campo: 'semaforo', titulo: 'Semaforo' },
        { campo: 'ubicacion', titulo: 'Ubicacion' },
        { campo: 'responsable', titulo: 'Responsable' },
      ]),
    };
  }

  const def = EXPORTACIONES[modulo];
  if (!def) throw new ErrorApp('Modulo no disponible para exportacion', 404);
  return {
    __archivo: `${modulo}_${hoyISO()}.csv`,
    contenido: aCSV(bd.prepare(def.sql).all(), def.columnas),
  };
}, 'lectura');


