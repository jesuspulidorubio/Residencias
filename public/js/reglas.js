/**
 * Reglas de negocio de las cuatro acciones del sistema (Renovar, Recarga,
 * Mantto. y Refrendo) y del estado "efectivo" que se muestra en las tablas.
 *
 * Este archivo no usa DOM ni modulos de Node, asi que lo comparten tres
 * piezas y las reglas no pueden divergir entre ellas:
 *   - el servidor real (src/api.js)
 *   - el servidor de demostracion (public/js/servidor-demo.js)
 *   - la interfaz (public/js/vistas.js), que lo usa para avisar antes de enviar
 *
 * Las funciones "plan..." no escriben nada: reciben el registro actual y lo
 * capturado por el usuario y regresan { error } o { cambios }. Quien las llama
 * decide como guardar. Todas las fechas son texto aaaa-mm-dd.
 */

/** Vigencias reglamentarias que se calculan solas (en meses). */
export const MESES = {
  gafete: 12, // vigencia de un gafete renovado
  recarga: 12, // proxima recarga de extintor
  hidrostatica: 60, // proxima prueba hidrostatica (cada 5 anos)
  refrendo: 36, // vigencia de una licencia refrendada (3 anos)
};

/* ============================ FECHAS ============================ */

const aISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const hoyISO = () => aISO(new Date());

export const esFecha = (v) =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00`));

export function sumarMeses(iso, meses) {
  const d = new Date(`${iso}T00:00:00`);
  d.setMonth(d.getMonth() + meses);
  return aISO(d);
}

/** AAAA-MM-DD -> DD/MM/AAAA, para los mensajes de error. */
export const ddmmaaaa = (iso) => (esFecha(String(iso).slice(0, 10)) ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');

const dia = (iso) => (iso ? String(iso).slice(0, 10) : '');

/** true si la fecha existe y es anterior a hoy. */
const paso = (iso, hoy) => esFecha(dia(iso)) && dia(iso) < hoy;

/* ====================== ESTADO EFECTIVO (tablas) ====================== */

/**
 * Estado que debe mostrarse en la columna ESTADO. Ignora lo que diga la base
 * de datos cuando el registro dice estar en orden pero sus fechas dicen lo
 * contrario. Los estados que no afirman vigencia (Suspendido, Cancelado,
 * En mantenimiento, Baja...) se respetan tal cual.
 *
 * Regresa { texto, clase, vencido } con clase = vigente | vencido | neutro.
 */
export function estadoEfectivo(modulo, r, hoy = hoyISO()) {
  const estado = r?.estado ?? '';
  const reglas = {
    // estado "bueno", fechas que lo contradicen, texto que se muestra
    gafetes: { bueno: 'Activo', fechas: [r?.fecha_vencimiento], texto: 'Vencido' },
    extintores: { bueno: 'Operativo', fechas: [r?.fecha_prox_recarga, r?.fecha_prox_hidrostatica], texto: 'Vencido' },
    equipos: { bueno: 'En servicio', fechas: [r?.fecha_vencimiento], texto: 'Vencido' },
    licencias: { bueno: 'Vigente', fechas: [r?.fecha_vencimiento], texto: 'Vencida' },
  }[modulo];
  if (!reglas) return { texto: estado, clase: 'neutro', vencido: false };

  if (estado === reglas.bueno) {
    // En extintores basta UNA fecha vencida (recarga O hidrostatica).
    if (reglas.fechas.some((f) => paso(f, hoy))) return { texto: reglas.texto, clase: 'vencido', vencido: true };
    return { texto: estado, clase: 'vigente', vencido: false };
  }
  return { texto: estado, clase: estado === 'Fuera de servicio' ? 'vencido' : 'neutro', vencido: false };
}

/* ================= VALIDACION DE LOS FORMULARIOS DE EDICION ================= */

/** Vigencia maxima de un gafete (meses). Ajustala al criterio real de la CFE. */
export const MAX_MESES_GAFETE = 24;
/** Dias de holgura que debe haber entre un mantenimiento programado y la caducidad. */
export const HOLGURA_MANTTO_DIAS = 30;

export function sumarDias(iso, dias) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return aISO(d);
}

const diasEntre = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000);

/**
 * Valida un registro completo (alta o edicion) con las reglas de cronologia de
 * su modulo. Es lo que ejecutan el formulario, el servidor y la demostracion.
 *
 *  datos   lo que se esta guardando (en una edicion parcial, solo lo enviado)
 *  previo  el registro guardado; se mezcla para comparar tambien lo no enviado
 *  opciones.accion        true cuando viene de Renovar/Recarga/Mantto./Refrendo:
 *                         ahi no aplican la holgura de mantenimiento ni los avisos
 *  opciones.umbralCritico dias que se consideran "demasiado cerca" (extintores)
 *
 * Regresa { error, avisos }: error bloquea el guardado; los avisos solo
 * advierten y el usuario decide si continua.
 */
export function validarRegistro(modulo, datos, previo = {}, hoy = hoyISO(), opciones = {}) {
  const v = { ...previo, ...datos };
  const f = (k) => dia(v[k]);
  const hay = (...ks) => ks.every((k) => esFecha(f(k)));
  const cambio = (...ks) => ks.some((k) => k in datos && dia(datos[k]) !== dia(previo[k]));
  const errores = [];
  const avisos = [];
  /** destino debe ser posterior a origen (estricto) o no anterior (flexible). */
  const orden = (origen, destino, mensaje, estricto = false) => {
    if (!hay(origen, destino)) return;
    if (estricto ? f(destino) <= f(origen) : f(destino) < f(origen)) errores.push(mensaje);
  };

  if (modulo === 'gafetes') {
    orden('fecha_emision', 'fecha_vencimiento', 'La fecha de vencimiento no puede ser igual ni menor a la fecha de emision.', true);
    if (hay('fecha_emision', 'fecha_vencimiento')) {
      const limite = sumarMeses(f('fecha_emision'), MAX_MESES_GAFETE);
      if (f('fecha_vencimiento') > limite) {
        errores.push(
          `La vigencia de un gafete no puede pasar de ${MAX_MESES_GAFETE} meses (hasta el ${ddmmaaaa(limite)} con esa emision). ` +
            'Revisa la fecha de vencimiento: parece un error de captura.'
        );
      }
    }
  }

  if (modulo === 'licencias') {
    if (hay('fecha_inicio') && f('fecha_inicio') > hoy) {
      errores.push(`La fecha de expedicion no puede estar en el futuro (hoy es ${ddmmaaaa(hoy)}).`);
    }
    orden('fecha_inicio', 'fecha_vencimiento', 'La fecha de vencimiento debe ser estrictamente mayor a la fecha de expedicion.', true);
  }

  if (modulo === 'equipos') {
    orden('fecha_inicio', 'fecha_vencimiento', 'El vencimiento / caducidad debe ser posterior al inicio de vigencia.', true);
    orden('fecha_adquisicion', 'fecha_inicio', 'El inicio de vigencia no puede ser anterior a la fecha de adquisicion.');
    orden('fecha_adquisicion', 'fecha_ultimo_mantenimiento', 'El ultimo mantenimiento no puede ser anterior a la fecha de adquisicion.');
    // Todo mantenimiento debe caer dentro de la vigencia del equipo.
    orden('fecha_inicio', 'fecha_ultimo_mantenimiento', 'El mantenimiento no puede ser anterior al inicio de vigencia del equipo.');
    orden('fecha_ultimo_mantenimiento', 'fecha_vencimiento', 'El mantenimiento no puede ser posterior a la caducidad del equipo: un mantenimiento no extiende la vida util.');

    // Margen de seguridad: el proximo mantenimiento no puede quedar pegado a la
    // caducidad. Si cae despues de ella no hay nada programado dentro de la vida
    // util del equipo, y eso no es un error de captura.
    const frecuencia = Number(v.frecuencia_meses) || 0;
    if (!opciones.accion && frecuencia > 0 && hay('fecha_ultimo_mantenimiento', 'fecha_vencimiento')
        && cambio('fecha_ultimo_mantenimiento', 'frecuencia_meses', 'fecha_vencimiento', 'fecha_inicio')) {
      const proximo = sumarMeses(f('fecha_ultimo_mantenimiento'), frecuencia);
      const limite = sumarDias(f('fecha_vencimiento'), -HOLGURA_MANTTO_DIAS);
      if (proximo > limite && proximo <= f('fecha_vencimiento')) {
        errores.push(
          `El proximo mantenimiento (${ddmmaaaa(proximo)}) quedaria a menos de ${HOLGURA_MANTTO_DIAS} dias de la caducidad (${ddmmaaaa(f('fecha_vencimiento'))}). ` +
            `Programalo con holgura: a mas tardar el ${ddmmaaaa(limite)}.`
        );
      }
    }
  }

  if (modulo === 'extintores') {
    orden('fecha_fabricacion', 'fecha_recarga', 'La ultima recarga no puede ser anterior a la fecha de fabricacion del extintor.');
    orden('fecha_fabricacion', 'fecha_prueba_hidrostatica', 'La ultima prueba hidrostatica no puede ser anterior a la fecha de fabricacion del extintor.');
    orden('fecha_recarga', 'fecha_prox_recarga', 'La proxima recarga debe ser mayor a la ultima recarga.', true);
    orden('fecha_prueba_hidrostatica', 'fecha_prox_hidrostatica', 'La proxima prueba hidrostatica debe ser mayor a la ultima prueba hidrostatica.', true);

    // Avisos (no bloquean): una fecha recien programada que ya queda pegada a hoy.
    if (!opciones.accion) {
      const critico = opciones.umbralCritico ?? 7;
      for (const [campo, nombre] of [['fecha_prox_recarga', 'proxima recarga'], ['fecha_prox_hidrostatica', 'proxima prueba hidrostatica']]) {
        if (!hay(campo) || !cambio(campo)) continue;
        const d = diasEntre(hoy, f(campo));
        if (d < 0) avisos.push(`La ${nombre} (${ddmmaaaa(f(campo))}) ya esta vencida.`);
        else if (d <= critico) avisos.push(`La ${nombre} (${ddmmaaaa(f(campo))}) queda a solo ${d} dia(s): programala con mas antelacion.`);
      }
    }
  }

  return { error: errores[0] ?? null, avisos };
}

/* ============= CALENDARIO DE LOS FORMULARIOS (min / max del input) ============= */

/**
 * Limites que el formulario pone al calendario de cada fecha segun las que ya
 * se capturaron, para que el dia invalido ni siquiera se pueda elegir.
 *   despuesDe    -> min = esa fecha + 1 dia (estrictamente posterior)
 *   noAntesDe    -> min = esa fecha
 *   noDespuesDe  -> max = esa fecha
 */
export const CALENDARIO = {
  gafetes: [{ campo: 'fecha_vencimiento', despuesDe: 'fecha_emision' }],
  extintores: [
    { campo: 'fecha_recarga', noAntesDe: 'fecha_fabricacion' },
    { campo: 'fecha_prueba_hidrostatica', noAntesDe: 'fecha_fabricacion' },
    { campo: 'fecha_prox_recarga', despuesDe: 'fecha_recarga' },
    { campo: 'fecha_prox_hidrostatica', despuesDe: 'fecha_prueba_hidrostatica' },
  ],
  equipos: [
    { campo: 'fecha_inicio', noAntesDe: 'fecha_adquisicion' },
    { campo: 'fecha_vencimiento', despuesDe: 'fecha_inicio' },
    { campo: 'fecha_ultimo_mantenimiento', noAntesDe: 'fecha_inicio', noDespuesDe: 'fecha_vencimiento' },
  ],
  licencias: [{ campo: 'fecha_vencimiento', despuesDe: 'fecha_inicio' }],
};

/** Fechas que no pueden estar en el futuro (max = hoy). */
export const NO_FUTURAS = { licencias: ['fecha_inicio'] };

/** Detalle de que fecha vencio, para mostrarlo junto al estado. */
export function motivosVencimiento(modulo, r, hoy = hoyISO()) {
  const m = [];
  if (modulo === 'extintores') {
    if (paso(r.fecha_prox_recarga, hoy)) m.push('recarga');
    if (paso(r.fecha_prox_hidrostatica, hoy)) m.push('prueba hidrostatica');
  } else if (paso(r.fecha_vencimiento, hoy)) m.push('vigencia');
  return m;
}

/* ====================== 1. GAFETES · RENOVAR ====================== */

/**
 * La renovacion captura solo la nueva EMISION; el VENCIMIENTO lo calcula el
 * sistema (+12 meses) y nunca se teclea.
 *
 * La nueva emision no puede ser anterior a la del gafete que se reemplaza (no
 * se puede renovar "hacia atras"). Si se exigiera que fuera posterior al
 * VENCIMIENTO anterior, un gafete no podria renovarse durante los 30 dias de
 * aviso previo, que es justo cuando el sistema avisa que hay que hacerlo.
 */
export function planRenovarGafete(g, entrada, hoy = hoyISO()) {
  const emision = dia(entrada?.fecha_emision);
  if (!esFecha(emision)) return { error: 'Indica la fecha de renovacion (emision) del gafete.' };

  if (esFecha(dia(g.fecha_emision)) && emision < dia(g.fecha_emision)) {
    return {
      error: `La nueva fecha de emision no puede ser anterior a la emision del gafete actual (${ddmmaaaa(g.fecha_emision)}).`,
    };
  }
  const vence = sumarMeses(emision, MESES.gafete);
  if (vence < hoy) {
    return { error: `Con esa emision el gafete venceria el ${ddmmaaaa(vence)}, que ya paso. Verifica la fecha de renovacion.` };
  }
  return conReglas('gafetes', g, { fecha_emision: emision, fecha_vencimiento: vence, estado: 'Activo' }, hoy);
}

/** Aplica ademas las reglas de cronologia del modulo al resultado de una accion. */
function conReglas(modulo, previo, cambios, hoy) {
  const { error } = validarRegistro(modulo, cambios, previo, hoy, { accion: true });
  return error ? { error } : { cambios };
}

/* ===================== 2. EXTINTORES · RECARGA ===================== */

/** true si la prueba hidrostatica ya vencio y debe registrarse junto con la recarga. */
export function requiereHidrostatica(x, hoy = hoyISO()) {
  return paso(x.fecha_prox_hidrostatica, hoy);
}

/**
 * La nueva recarga fija PROX. RECARGA (+12 meses), siempre estrictamente mayor
 * que la recarga. Si la prueba hidrostatica tambien esta vencida, la recarga
 * no se acepta sin la nueva fecha de prueba: de lo contrario el extintor
 * seguiria marcando VENCIDO por la hidrostatica.
 */
export function planRecargaExtintor(x, entrada, hoy = hoyISO()) {
  const recarga = dia(entrada?.fecha_recarga);
  if (!esFecha(recarga)) return { error: 'Indica la fecha de la recarga.' };

  if (esFecha(dia(x.fecha_fabricacion)) && recarga < dia(x.fecha_fabricacion)) {
    return { error: `La recarga no puede ser anterior a la fabricacion del extintor (${ddmmaaaa(x.fecha_fabricacion)}).` };
  }
  if (esFecha(dia(x.fecha_recarga)) && recarga < dia(x.fecha_recarga)) {
    return { error: `La nueva recarga no puede ser anterior a la ultima registrada (${ddmmaaaa(x.fecha_recarga)}).` };
  }
  const proxima = sumarMeses(recarga, MESES.recarga);
  if (!(proxima > recarga)) return { error: 'La proxima recarga debe ser posterior a la recarga.' };
  if (proxima < hoy) {
    return { error: `Con esa recarga la proxima (${ddmmaaaa(proxima)}) ya estaria vencida. Verifica la fecha.` };
  }

  const cambios = { fecha_recarga: recarga, fecha_prox_recarga: proxima, estado: 'Operativo' };

  const prueba = dia(entrada?.fecha_prueba_hidrostatica);
  if (requiereHidrostatica(x, hoy) && !esFecha(prueba)) {
    return {
      error:
        `La prueba hidrostatica vencio el ${ddmmaaaa(x.fecha_prox_hidrostatica)}. ` +
        'Registra tambien la fecha de la nueva prueba hidrostatica; sin ella el extintor seguiria vencido.',
    };
  }
  if (esFecha(prueba)) {
    if (esFecha(dia(x.fecha_fabricacion)) && prueba < dia(x.fecha_fabricacion)) {
      return { error: `La prueba hidrostatica no puede ser anterior a la fabricacion del extintor (${ddmmaaaa(x.fecha_fabricacion)}).` };
    }
    if (esFecha(dia(x.fecha_prueba_hidrostatica)) && prueba < dia(x.fecha_prueba_hidrostatica)) {
      return { error: `La nueva prueba no puede ser anterior a la ultima registrada (${ddmmaaaa(x.fecha_prueba_hidrostatica)}).` };
    }
    const proxPrueba = sumarMeses(prueba, MESES.hidrostatica);
    if (proxPrueba < hoy) {
      return { error: `Con esa prueba la proxima hidrostatica (${ddmmaaaa(proxPrueba)}) ya estaria vencida. Verifica la fecha.` };
    }
    cambios.fecha_prueba_hidrostatica = prueba;
    cambios.fecha_prox_hidrostatica = proxPrueba;
  }
  return conReglas('extintores', x, cambios, hoy);
}

/* ================ 3. EQUIPO DE SEGURIDAD · MANTTO. ================ */

/**
 * Un mantenimiento es preventivo: no extiende la vida util del equipo. Por eso
 * la fecha no puede pasar de su VENCIMIENTO y no se toca fecha_vencimiento.
 */
export function planMantenimientoEquipo(q, entrada, hoy = hoyISO()) {
  const fecha = dia(entrada?.fecha_ultimo_mantenimiento ?? entrada?.fecha);
  if (!esFecha(fecha)) return { error: 'Indica la fecha del mantenimiento.' };

  if (esFecha(dia(q.fecha_vencimiento)) && fecha > dia(q.fecha_vencimiento)) {
    return {
      error:
        `El mantenimiento no puede ser posterior al vencimiento del equipo (${ddmmaaaa(q.fecha_vencimiento)}): ` +
        'un mantenimiento no extiende la vida util. Si ya caduco, debe darse de baja o reemplazarse.',
    };
  }
  if (esFecha(dia(q.fecha_adquisicion)) && fecha < dia(q.fecha_adquisicion)) {
    return { error: `El mantenimiento no puede ser anterior a la adquisicion del equipo (${ddmmaaaa(q.fecha_adquisicion)}).` };
  }
  return conReglas('equipos', q, { fecha_ultimo_mantenimiento: fecha }, hoy);
}

/* ===================== 4. LICENCIAS · REFRENDO ===================== */

/**
 * El refrendo implica un documento fisico nuevo: su EXPEDICION no puede ser
 * anterior al dia de la captura (regla del refrendo) ni estar en el futuro
 * (regla del formulario de edicion, en validarRegistro). Juntas, el refrendo
 * se expide el dia en que se captura. El VENCIMIENTO (+36 meses) se calcula
 * solo y es estrictamente mayor a la expedicion.
 */
export function planRefrendoLicencia(l, entrada, hoy = hoyISO()) {
  const expedicion = dia(entrada?.fecha_inicio ?? entrada?.fecha);
  if (!esFecha(expedicion)) return { error: 'Indica la fecha de expedicion del nuevo documento.' };
  if (expedicion < hoy) {
    return { error: `La expedicion del refrendo no puede ser anterior al dia de la captura (${ddmmaaaa(hoy)}).` };
  }

  const vence = sumarMeses(expedicion, MESES.refrendo);
  return conReglas('licencias', l, { fecha_inicio: expedicion, fecha_vencimiento: vence, estado: 'Vigente' }, hoy);
}

/** Nombre del servicio de cada modulo y la funcion que lo valida. */
export const ACCIONES = {
  gafetes: { accion: 'renovar', detalle: 'Renovacion', plan: planRenovarGafete },
  extintores: { accion: 'recarga', detalle: 'Recarga', plan: planRecargaExtintor },
  equipos: { accion: 'mantenimiento', detalle: 'Mantenimiento', plan: planMantenimientoEquipo },
  licencias: { accion: 'refrendo', detalle: 'Refrendo', plan: planRefrendoLicencia },
};
