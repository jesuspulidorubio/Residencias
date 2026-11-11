/**
 * Utilerias compartidas: manejo de fechas, calculo de vigencias,
 * validaciones y exportacion a CSV.
 */

/** Fecha de hoy en formato ISO corto (AAAA-MM-DD), en hora local. */
export function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Suma dias a una fecha ISO y regresa una nueva fecha ISO. */
export function sumarDias(fechaISO, dias) {
  const d = new Date(`${fechaISO}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Suma meses a una fecha ISO (util para recargas y mantenimientos). */
export function sumarMeses(fechaISO, meses) {
  const d = new Date(`${fechaISO}T00:00:00`);
  d.setMonth(d.getMonth() + meses);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Dias que faltan para la fecha indicada. Negativo = ya vencio. */
export function diasRestantes(fechaISO) {
  if (!esFecha(fechaISO)) return null;
  const objetivo = new Date(`${fechaISO}T00:00:00`);
  const hoy = new Date(`${hoyISO()}T00:00:00`);
  return Math.round((objetivo - hoy) / 86400000);
}

export function esFecha(valor) {
  return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(`${valor}T00:00:00`));
}

/**
 * Clasifica una fecha de vencimiento segun los umbrales configurados.
 * Regresa: vencido | critico | proximo | vigente | sin_fecha
 */
export function estadoVigencia(fechaISO, umbrales = { critico: 7, proximo: 30 }) {
  const dias = diasRestantes(fechaISO);
  if (dias === null) return { estado: 'sin_fecha', dias: null, etiqueta: 'Sin fecha' };
  if (dias < 0) return { estado: 'vencido', dias, etiqueta: `Vencido hace ${Math.abs(dias)} d` };
  if (dias <= umbrales.critico) return { estado: 'critico', dias, etiqueta: dias === 0 ? 'Vence hoy' : `Vence en ${dias} d` };
  if (dias <= umbrales.proximo) return { estado: 'proximo', dias, etiqueta: `Vence en ${dias} d` };
  return { estado: 'vigente', dias, etiqueta: `Vigente (${dias} d)` };
}

/** Texto seguro: recorta y evita nulos. */
export function txt(valor, max = 300) {
  if (valor === null || valor === undefined) return '';
  return String(valor).trim().slice(0, max);
}

export function num(valor, porDefecto = null) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : porDefecto;
}

/** Error de negocio con codigo HTTP, capturado por el router. */
export class ErrorApp extends Error {
  constructor(mensaje, codigo = 400) {
    super(mensaje);
    this.codigo = codigo;
  }
}

/** Valida que existan los campos obligatorios en el cuerpo de la peticion. */
export function requerir(objeto, campos) {
  const faltantes = campos.filter((c) => !txt(objeto?.[c]));
  if (faltantes.length) {
    throw new ErrorApp(`Faltan campos obligatorios: ${faltantes.join(', ')}`, 400);
  }
}

/** Convierte un arreglo de objetos a CSV compatible con Excel (con BOM). */
export function aCSV(filas, columnas) {
  const escapar = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const encabezado = columnas.map((c) => escapar(c.titulo)).join(';');
  const cuerpo = filas.map((f) => columnas.map((c) => escapar(f[c.campo])).join(';'));
  return `﻿${[encabezado, ...cuerpo].join('\r\n')}`;
}

/** Formato legible para correos y bitacora: 14/08/2026 */
export function fechaLarga(fechaISO) {
  if (!esFecha(fechaISO)) return 'sin fecha';
  const [a, m, d] = fechaISO.split('-');
  return `${d}/${m}/${a}`;
}
