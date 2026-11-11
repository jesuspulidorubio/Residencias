/**
 * Motor de vigencias.
 *
 * Reune en una sola lista todos los conceptos con fecha de caducidad de los
 * cinco elementos comprometidos en el anteproyecto (gafetes de trabajo,
 * extintores, botiquines, arneses de seguridad y licencias de conducir) y los
 * clasifica con el semaforo: verde vigente, amarillo por vencer, rojo vencido.
 *
 * Cada elemento se evalua con la anticipacion configurada para SU tipo, no con
 * un umbral unico ("notificaciones preventivas configurables segun el tipo de
 * elemento").
 */
import { bd, umbralesPorTipo } from './bd.js';
import { estadoVigencia, sumarMeses, esFecha, diasRestantes } from './util.js';

/** Estados que ya no requieren vigilancia. */
const IGNORADOS = new Set(['Cancelado', 'Baja', 'Dado de baja', 'Desechado']);

/** Semaforo del anteproyecto: tres colores. */
export const SEMAFORO = {
  vigente: 'verde',
  proximo: 'amarillo',
  critico: 'amarillo',
  vencido: 'rojo',
  sin_fecha: 'gris',
};

/**
 * Devuelve todos los conceptos con vencimiento del sistema.
 * Cada elemento incluye su fecha de inicio, los dias restantes,
 * su clasificacion y el color de semaforo correspondiente.
 */
export function listarVigencias() {
  const umbrales = umbralesPorTipo();
  const items = [];

  const agregar = (base, inicio, fin, concepto) => {
    if (!esFecha(fin)) return;
    const u = umbrales[base.tipo] ?? { proximo: 30, critico: 7 };
    const v = estadoVigencia(fin, u);
    items.push({
      ...base,
      concepto,
      fecha_inicio: esFecha(inicio) ? inicio : null,
      fecha: fin,
      dias: v.dias,
      dias_totales: esFecha(inicio) ? Math.max(0, diasRestantes(fin) - diasRestantes(inicio)) : null,
      clasificacion: v.estado,
      semaforo: SEMAFORO[v.estado],
      etiqueta: v.etiqueta,
      umbral: u,
    });
  };

  // --- Gafetes de trabajo ------------------------------------------
  const gafetes = bd
    .prepare(
      `SELECT g.*, e.nombre AS empleado, e.rpe, e.departamento, e.correo AS correo_empleado
       FROM gafetes g JOIN empleados e ON e.id = g.empleado_id`
    )
    .all();
  for (const g of gafetes) {
    if (IGNORADOS.has(g.estado)) continue;
    agregar(
      {
        modulo: 'gafetes',
        modulo_nombre: 'Gafete',
        tipo: 'gafete',
        registro_id: g.id,
        referencia: g.folio,
        descripcion: `${g.empleado} (${g.rpe})`,
        ubicacion: g.departamento,
        responsable: g.empleado,
        responsable_correo: g.correo_empleado ?? '',
        estado_registro: g.estado,
      },
      g.fecha_emision,
      g.fecha_vencimiento,
      'Vigencia del gafete'
    );
  }

  // --- Extintores --------------------------------------------------
  const extintores = bd
    .prepare(
      `SELECT x.*, e.nombre AS responsable, e.correo AS correo_responsable
       FROM extintores x LEFT JOIN empleados e ON e.id = x.responsable_id`
    )
    .all();
  for (const x of extintores) {
    if (IGNORADOS.has(x.estado)) continue;
    const base = {
      modulo: 'extintores',
      modulo_nombre: 'Extintor',
      tipo: 'extintor',
      registro_id: x.id,
      referencia: x.codigo,
      descripcion: `${x.tipo} ${x.capacidad_kg} kg - ${x.ubicacion}`,
      ubicacion: x.ubicacion,
      responsable: x.responsable ?? 'Sin asignar',
      responsable_correo: x.correo_responsable ?? '',
      estado_registro: x.estado,
    };
    agregar(base, x.fecha_recarga, x.fecha_prox_recarga, 'Recarga');
    agregar(base, x.fecha_prueba_hidrostatica, x.fecha_prox_hidrostatica, 'Prueba hidrostatica');
  }

  // --- Equipo: botiquines, arneses y demas -------------------------
  const equipos = bd
    .prepare(
      `SELECT q.*, e.nombre AS responsable, e.correo AS correo_responsable
       FROM equipos q LEFT JOIN empleados e ON e.id = q.responsable_id`
    )
    .all();
  for (const q of equipos) {
    if (IGNORADOS.has(q.estado)) continue;
    const base = {
      modulo: 'equipos',
      modulo_nombre: q.categoria?.startsWith('Botiquin')
        ? 'Botiquin'
        : q.categoria?.startsWith('Arnes')
          ? 'Arnes'
          : 'Equipo',
      tipo: q.tipo_alerta || 'equipo',
      registro_id: q.id,
      referencia: q.codigo,
      descripcion: `${q.nombre}${q.marca ? ` - ${q.marca}` : ''}`,
      ubicacion: q.ubicacion,
      responsable: q.responsable ?? 'Sin asignar',
      responsable_correo: q.correo_responsable ?? '',
      estado_registro: q.estado,
    };
    agregar(base, q.fecha_inicio ?? q.fecha_adquisicion, q.fecha_vencimiento, 'Vigencia / caducidad');
    if (q.frecuencia_meses > 0 && esFecha(q.fecha_ultimo_mantenimiento)) {
      agregar(
        base,
        q.fecha_ultimo_mantenimiento,
        sumarMeses(q.fecha_ultimo_mantenimiento, q.frecuencia_meses),
        'Revision / mantenimiento'
      );
    }
  }

  // --- Licencias de conducir ---------------------------------------
  const licencias = bd
    .prepare(
      `SELECT l.*, e.nombre AS empleado, e.rpe, e.departamento, e.correo AS correo_empleado
       FROM licencias l JOIN empleados e ON e.id = l.empleado_id`
    )
    .all();
  for (const l of licencias) {
    if (IGNORADOS.has(l.estado)) continue;
    agregar(
      {
        modulo: 'licencias',
        modulo_nombre: 'Licencia',
        tipo: 'licencia',
        registro_id: l.id,
        referencia: l.numero,
        descripcion: `${l.tipo} (${l.ambito}) - ${l.empleado}`,
        ubicacion: l.departamento,
        responsable: l.empleado,
        responsable_correo: l.correo_empleado ?? '',
        estado_registro: l.estado,
      },
      l.fecha_inicio,
      l.fecha_vencimiento,
      'Vigencia de la licencia'
    );
  }

  items.sort((a, b) => a.dias - b.dias);
  return items;
}

/** Conteo por clasificacion para el panel principal. */
export function resumenVigencias(items = listarVigencias()) {
  const r = { vencido: 0, critico: 0, proximo: 0, vigente: 0, total: items.length };
  for (const i of items) r[i.clasificacion] = (r[i.clasificacion] ?? 0) + 1;
  // Lectura de semaforo (tres colores) exigida por el anteproyecto.
  r.rojo = r.vencido;
  r.amarillo = r.proximo + r.critico;
  r.verde = r.vigente;
  return r;
}
