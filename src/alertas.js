/**
 * Generador de alertas y avisos por correo.
 *
 * Recorre todas las vigencias del sistema y:
 *
 *  1. Crea una notificacion interna cuando un concepto entra en estado
 *     "proximo", "critico" o "vencido". Cada notificacion lleva una clave
 *     unica (modulo + registro + concepto + fecha + nivel) para no duplicar
 *     avisos; si el registro se renueva y cambia su fecha, se vuelve a
 *     notificar en el nuevo ciclo.
 *
 *  2. Envia correo cuando el concepto cruza uno de los umbrales de aviso
 *     (30, 15 y 7 dias por omision, mas los umbrales configurados para su
 *     tipo de elemento) y cuando ya vencio. El envio se registra en la tabla
 *     avisos_correo con la misma logica de clave unica, de modo que el mismo
 *     aviso no se manda dos veces aunque la revision corra cada 6 horas.
 *
 * Destinatarios de cada aviso:
 *   - el trabajador dueno o responsable del elemento;
 *   - el usuario con el perfil encargado de ese modulo;
 *   - el Administrador, que recibe copia de toda alerta sin importar el modulo.
 */
import { bd, leerConfiguracion, bitacora } from './bd.js';
import { listarVigencias } from './vigencias.js';
import { fechaLarga } from './util.js';
import { config, RESPONSABLE_MODULO, NOMBRE_MODULO } from './config.js';

const TITULOS = {
  vencido: 'VENCIDO',
  critico: 'Por vencer (critico)',
  proximo: 'Proximo a vencer',
};

/* ================================================================== */
/* Revision completa                                                   */
/* ================================================================== */

/**
 * Ejecuta la revision de vencimientos.
 * @param {string} origen texto para la bitacora (automatico / usuario)
 */
export async function revisarVencimientos(origen = 'automatico') {
  const todos = listarVigencias();
  const pendientes = todos.filter((i) => i.clasificacion !== 'vigente' && i.clasificacion !== 'sin_fecha');

  /* --- 1. Notificaciones internas --- */
  const insertar = bd.prepare(`INSERT OR IGNORE INTO notificaciones
    (clave, modulo, registro_id, referencia, concepto, titulo, mensaje, severidad, fecha_objetivo, dias_restantes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const nuevas = [];
  for (const i of pendientes) {
    const clave = `${i.modulo}:${i.registro_id}:${i.concepto}:${i.fecha}:${i.clasificacion}`;
    const titulo = `${TITULOS[i.clasificacion]}: ${i.modulo_nombre} ${i.referencia}`;
    const mensaje =
      i.dias < 0
        ? `${i.concepto} de ${i.descripcion} vencio el ${fechaLarga(i.fecha)} (hace ${Math.abs(i.dias)} dias). Ubicacion: ${i.ubicacion || 'no especificada'}.`
        : `${i.concepto} de ${i.descripcion} vence el ${fechaLarga(i.fecha)} (faltan ${i.dias} dias). Ubicacion: ${i.ubicacion || 'no especificada'}.`;

    const r = insertar.run(
      clave, i.modulo, i.registro_id, i.referencia, i.concepto,
      titulo, mensaje, i.clasificacion, i.fecha, i.dias
    );
    if (r.changes > 0) nuevas.push({ ...i, titulo, mensaje, clave });
  }

  /* --- 2. Avisos por correo --- */
  const correo = await enviarAvisos(todos);

  if (nuevas.length || correo.enviados) {
    bitacora(
      'sistema',
      'Revision de vencimientos',
      'Alertas',
      `${nuevas.length} alertas nuevas, ${correo.enviados} correo(s) (${origen})`
    );
  }

  return {
    generadas: nuevas.length,
    revisadas: pendientes.length,
    correo: correo.resumen,
    correosEnviados: correo.enviados,
  };
}

/* ================================================================== */
/* Umbrales de aviso                                                   */
/* ================================================================== */

/**
 * Umbrales aplicables a un concepto: los generales configurados
 * (30, 15 y 7 dias) mas los propios de su tipo de elemento.
 * El umbral 0 representa el aviso de vencimiento.
 */
function umbralesDe(item, generales) {
  const propios = [item.umbral?.proximo, item.umbral?.critico].filter((n) => Number.isFinite(n));
  return [...new Set([...generales, ...propios])].sort((a, b) => b - a);
}

/** Umbral que corresponde a los dias restantes, o null si no toca avisar. */
function umbralAlcanzado(dias, umbrales) {
  if (dias < 0) return 0; // ya vencio
  // Se toma el umbral mas pequeno que el concepto ya cruzo, para que el aviso
  // sea el mas urgente aunque la revision no haya corrido algun dia.
  const cruzados = umbrales.filter((u) => u > 0 && dias <= u);
  return cruzados.length ? Math.min(...cruzados) : null;
}

/* ================================================================== */
/* Envio de correo                                                     */
/* ================================================================== */

async function enviarAvisos(items) {
  const cfg = leerConfiguracion();
  const generales = String(cfg.umbrales_correo ?? '30,15,7')
    .split(',')
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  const yaEnviado = bd.prepare('SELECT 1 FROM avisos_correo WHERE clave = ?');
  const registrar = bd.prepare(`INSERT OR IGNORE INTO avisos_correo
    (clave, modulo, registro_id, referencia, umbral, destinatarios, resultado)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);

  // Se agrupan los avisos pendientes antes de abrir la conexion de correo.
  const porEnviar = [];
  for (const item of items) {
    if (item.clasificacion === 'sin_fecha') continue;
    const umbral = umbralAlcanzado(item.dias, umbralesDe(item, generales));
    if (umbral === null) continue;

    const clave = `${item.modulo}:${item.registro_id}:${item.concepto}:${item.fecha}:${umbral}`;
    if (yaEnviado.get(clave)) continue;

    porEnviar.push({ item, umbral, clave, destinatarios: destinatariosDe(item) });
  }

  if (!porEnviar.length) return { enviados: 0, resumen: 'sin avisos pendientes' };

  const transporte = await abrirTransporte(cfg);

  let enviados = 0;
  for (const aviso of porEnviar) {
    const lista = aviso.destinatarios.join(', ');
    let resultado;

    if (!aviso.destinatarios.length) {
      resultado = 'sin destinatarios con correo';
    } else if (!transporte.disponible) {
      resultado = transporte.motivo;
    } else {
      try {
        await transporte.enviar({
          para: aviso.destinatarios,
          asunto: asuntoDe(aviso.item, aviso.umbral),
          html: cuerpoDe(aviso.item, aviso.umbral, cfg),
        });
        resultado = 'enviado';
        enviados++;
      } catch (e) {
        resultado = `error: ${e.message}`;
      }
    }

    registrar.run(
      aviso.clave, aviso.item.modulo, aviso.item.registro_id,
      aviso.item.referencia, aviso.umbral, lista, resultado
    );

    // El aviso queda marcado en la notificacion interna correspondiente.
    if (resultado === 'enviado') {
      bd.prepare('UPDATE notificaciones SET correo_enviado = 1 WHERE modulo = ? AND registro_id = ? AND fecha_objetivo = ?')
        .run(aviso.item.modulo, aviso.item.registro_id, aviso.item.fecha);
    }
  }

  const resumen = enviados
    ? `${enviados} de ${porEnviar.length} aviso(s) enviados`
    : `${porEnviar.length} aviso(s) pendientes: ${transporte.disponible ? 'sin destinatarios' : transporte.motivo}`;

  return { enviados, resumen };
}

/**
 * Destinatarios de un aviso:
 *   1. el trabajador dueno o responsable del elemento;
 *   2. los usuarios con el perfil encargado del modulo;
 *   3. el Administrador, siempre.
 */
function destinatariosDe(item) {
  const correos = new Set();
  const cfg = leerConfiguracion();

  const valido = (c) => typeof c === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.trim());

  // 1. Trabajador dueno del elemento
  if (valido(item.responsable_correo)) correos.add(item.responsable_correo.trim());

  // 2. Perfil encargado del modulo
  const perfil = RESPONSABLE_MODULO[item.modulo];
  if (perfil) {
    for (const u of bd.prepare("SELECT correo FROM usuarios WHERE rol = ? AND activo = 1 AND correo <> ''").all(perfil)) {
      if (valido(u.correo)) correos.add(u.correo.trim());
    }
  }

  // 3. Administrador: copia de toda alerta, sin importar el modulo
  for (const u of bd.prepare("SELECT correo FROM usuarios WHERE rol = 'admin' AND activo = 1 AND correo <> ''").all()) {
    if (valido(u.correo)) correos.add(u.correo.trim());
  }
  if (valido(cfg.correo_administrador)) correos.add(cfg.correo_administrador.trim());

  return [...correos];
}

function asuntoDe(item, umbral) {
  const encabezado = umbral === 0 ? 'VENCIDO' : `Vence en ${item.dias} dia(s)`;
  return `[SIGEV] ${encabezado}: ${item.modulo_nombre} ${item.referencia}`;
}

/** Enlace directo a la ficha del elemento dentro del sistema. */
function enlaceDe(item, cfg) {
  const base = String(cfg.url_sistema ?? '').replace(/\/+$/, '');
  return `${base}/#/${item.modulo}?ficha=${item.registro_id}`;
}

function cuerpoDe(item, umbral, cfg) {
  const vencido = umbral === 0;
  const color = vencido ? '#bf3a2b' : item.dias <= 7 ? '#d1541f' : '#c07800';
  const enlace = enlaceDe(item, cfg);

  const fila = (etiqueta, valor) => `
    <tr>
      <td style="padding:7px 14px 7px 0;color:#6c726e;font-size:12px;text-transform:uppercase;letter-spacing:1px;white-space:nowrap">${etiqueta}</td>
      <td style="padding:7px 0;font-size:14px;font-weight:600;color:#101312">${valor}</td>
    </tr>`;

  return `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;border:1px solid #d3d7d0">
    <div style="background:#101312;color:#fff;padding:14px 18px">
      <strong style="letter-spacing:3px;font-size:15px">SIGEV</strong>
      <span style="color:#9aa09b;font-size:11px;letter-spacing:1px"> &nbsp;|&nbsp; ${cfg.nombre_centro} · ${cfg.zona}</span>
    </div>

    <div style="background:${color};color:#fff;padding:11px 18px;font-size:15px;font-weight:700">
      ${vencido
        ? `ELEMENTO VENCIDO HACE ${Math.abs(item.dias)} DIA(S)`
        : `AVISO DE VENCIMIENTO A ${umbral} DIA(S)`}
    </div>

    <div style="padding:18px">
      <p style="margin:0 0 16px;font-size:14px;color:#2f3437">
        ${vencido
          ? 'El siguiente elemento de seguridad ya no esta vigente y no debe utilizarse hasta su reposicion o renovacion:'
          : 'El siguiente elemento de seguridad esta por vencer y requiere gestion:'}
      </p>

      <table style="border-collapse:collapse;width:100%">
        ${fila('Trabajador', item.responsable || 'Sin asignar')}
        ${fila('Elemento', `${item.modulo_nombre} — ${NOMBRE_MODULO[item.modulo] ?? item.modulo}`)}
        ${fila('Folio / codigo', item.referencia)}
        ${fila('Descripcion', item.descripcion)}
        ${fila('Concepto', item.concepto)}
        ${fila('Ubicacion', item.ubicacion || 'No especificada')}
        ${fila('Fecha de vencimiento', fechaLarga(item.fecha))}
        ${fila('Dias restantes', vencido ? `Vencido hace ${Math.abs(item.dias)} dias` : `${item.dias} dias`)}
      </table>

      <p style="margin:22px 0 0">
        <a href="${enlace}" style="background:#00733f;color:#fff;text-decoration:none;padding:11px 20px;font-size:13px;font-weight:600;display:inline-block">
          Abrir la ficha en SIGEV
        </a>
      </p>
      <p style="margin:10px 0 0;font-size:11px;color:#9aa09b">${enlace}</p>
    </div>

    <div style="background:#eef0ec;padding:12px 18px;font-size:11px;color:#6c726e;border-top:1px solid #d3d7d0">
      Mensaje generado automaticamente por SIGEV · ${cfg.area_responsable}. No responda a este correo.
    </div>
  </div>`;
}

/* ================================================================== */
/* Transporte de correo                                                */
/* ================================================================== */

/**
 * Abre la conexion con el servidor de correo.
 *
 * TODO: Configurar aqui la API / credenciales del servicio de correo
 * (SMTP o API key) al desplegar en el servidor de produccion.
 * Las credenciales se leen de variables de entorno (ver src/config.js);
 * no deben colocarse en el repositorio.
 */
async function abrirTransporte(cfg) {
  if (cfg.notificar_por_correo !== '1') {
    return { disponible: false, motivo: 'envio de correo desactivado' };
  }
  if (!config.smtp.host) {
    return { disponible: false, motivo: 'SMTP no configurado' };
  }

  let nodemailer;
  try {
    nodemailer = (await import('nodemailer')).default;
  } catch {
    return { disponible: false, motivo: 'falta instalar nodemailer' };
  }

  try {
    const transporte = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.puerto,
      secure: config.smtp.seguro,
      auth: config.smtp.usuario ? { user: config.smtp.usuario, pass: config.smtp.contrasena } : undefined,
    });

    return {
      disponible: true,
      motivo: 'listo',
      enviar: ({ para, asunto, html }) =>
        transporte.sendMail({ from: config.smtp.remitente, to: para.join(','), subject: asunto, html }),
    };
  } catch (e) {
    return { disponible: false, motivo: `error de conexion: ${e.message}` };
  }
}

/* ================================================================== */
/* Programacion                                                        */
/* ================================================================== */

/** Programa la revision automatica periodica. */
export function programarRevision() {
  const cada = Math.max(1, config.horasRevisionAlertas) * 3600000;

  revisarVencimientos('automatico (arranque)').then((r) =>
    console.log(`  Revision inicial: ${r.generadas} alerta(s) nueva(s), correo: ${r.correo}.`)
  );

  const temporizador = setInterval(() => {
    revisarVencimientos('automatico (programado)').catch((e) => console.error(e));
  }, cada);
  temporizador.unref?.();
  return temporizador;
}
