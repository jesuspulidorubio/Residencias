/**
 * Vistas de la aplicacion. Cada funcion recibe el contenedor principal
 * y se encarga de dibujar la pantalla completa y enlazar sus eventos.
 */
import {
  api, estado, esc, fecha, fechaHora, hoy, marca, marcaFecha, clasificar, tabla, formulario,
  leerFormulario, activarFotos, abrirModal, confirmar, pedirFechas, marcaEstado, enlazarCalendario, aviso, puede, esAdmin, icono, celdaClave, descargarCSV,
} from './nucleo.js';
import {
  ddmmaaaa, requiereHidrostatica, validarRegistro, CALENDARIO, NO_FUTURAS,
  planRenovarGafete, planRecargaExtintor, planMantenimientoEquipo, planRefrendoLicencia,
} from './reglas.js';

/* ================================================================== */
/* Piezas comunes                                                      */
/* ================================================================== */

function rotulo(titulo, descripcion, acciones = '') {
  return `<div class="rotulo">
    <div><h2>${esc(titulo)}</h2><p>${esc(descripcion)}</p></div>
    <div class="rotulo__acciones">${acciones}</div>
  </div>`;
}

const btnExportar = `<button class="boton" id="btn-exportar">${icono('descargar', 'ico--sm')} CSV</button>`;

/**
 * Botones de cada fila. Los de alta, cambio y baja solo aparecen si el
 * perfil en sesion tiene asignado ese modulo.
 */
function botonesFila(id, modulo, extras = []) {
  const otros = extras
    .map((e) => `<button class="boton boton--mini" data-op="${e.op}" data-id="${id}">${esc(e.texto)}</button>`)
    .join('');
  const gestion = puede(modulo)
    ? `<button class="boton boton--mini boton--icono" data-op="editar" data-id="${id}" title="Editar">${icono('editar', 'ico--sm')}</button>
       <button class="boton boton--mini boton--icono boton--peligro" data-op="eliminar" data-id="${id}" title="Eliminar">${icono('eliminar', 'ico--sm')}</button>`
    : '';
  return `<div class="acciones">
    <button class="boton boton--mini boton--icono" data-op="ver" data-id="${id}" title="Ver ficha">${icono('ver', 'ico--sm')}</button>
    ${otros}${gestion}</div>`;
}

function ficha(pares) {
  return `<div class="detalle">${pares.map(([t, v]) => `<div><dt>${esc(t)}</dt><dd>${v ?? '—'}</dd></div>`).join('')}</div>`;
}

function sumarMeses(iso, meses) {
  const d = new Date(`${iso}T00:00:00`);
  d.setMonth(d.getMonth() + meses);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const opcionesEmpleados = () =>
  (estado.catalogos?.empleados ?? []).map((e) => ({ valor: e.id, texto: `${e.nombre} (${e.rpe})` }));

/**
 * Pantalla generica de catalogo: herramientas, tabla, alta, cambio y baja.
 */
async function pantallaCatalogo(cont, cfg) {
  // El buscador de texto lo resuelve el servidor; los desplegables de la
  // barra de herramientas afinan el resultado sobre las filas ya cargadas.
  const filtros = { q: '' };
  for (const f of cfg.filtros ?? []) filtros[f.clave] = '';

  async function cargar() {
    const todas = await api.obtener(`${cfg.ruta}?q=${encodeURIComponent(filtros.q)}`);

    let filas = todas;
    for (const f of cfg.filtros ?? []) {
      if (filtros[f.clave]) filas = filas.filter((r) => String(r[f.campo] ?? '') === filtros[f.clave]);
    }

    cont.__filas = filas;
    cont.querySelector('#tabla-catalogo').innerHTML = tabla(cfg.columnas, filas, 'Sin coincidencias');
    cont.querySelector('#conteo').textContent =
      filas.length === todas.length
        ? `${filas.length} registro${filas.length === 1 ? '' : 's'}`
        : `${filas.length} de ${todas.length} registros`;
  }

  const botonNuevo = puede(cfg.clave)
    ? `<button class="boton boton--primario" id="btn-nuevo">${icono('mas', 'ico--sm')} ${esc(cfg.textoNuevo ?? 'Nuevo')}</button>`
    : '';

  cont.innerHTML = `
    ${rotulo(cfg.titulo, cfg.descripcion, `${btnExportar}${botonNuevo}`)}
    <div class="herramientas">
      ${icono('buscar', 'ico--sm')}
      <input type="search" id="buscador" placeholder="Buscar..." />
      ${(cfg.filtros ?? [])
        .map(
          (f) => `<select data-filtro="${f.clave}" aria-label="${esc(f.etiqueta)}">
            <option value="">${esc(f.etiqueta)}</option>
            ${f.opciones().map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}
          </select>`
        )
        .join('')}
      <span class="conteo" id="conteo"></span>
    </div>
    <div id="tabla-catalogo"></div>`;

  const buscador = cont.querySelector('#buscador');
  let temporizador;
  buscador.addEventListener('input', () => {
    clearTimeout(temporizador);
    filtros.q = buscador.value.trim();
    temporizador = setTimeout(cargar, 220);
  });

  cont.querySelectorAll('[data-filtro]').forEach((sel) =>
    sel.addEventListener('change', () => {
      filtros[sel.dataset.filtro] = sel.value;
      cargar();
    })
  );

  cont.querySelector('#btn-exportar').onclick = () => descargarCSV(cfg.exportar ?? cfg.clave);

  const abrirFormulario = (registro) => {
    const esNuevo = !registro;
    const { cuerpo } = abrirModal({
      titulo: `${esNuevo ? 'Alta de' : 'Editar'} ${cfg.singular}`,
      contenido: formulario(cfg.campos(), registro ?? {}),
      acciones: [
        { texto: 'Cancelar', alClic: (_c, cerrar) => cerrar() },
        {
          texto: 'Guardar',
          clase: 'boton--primario',
          alClic: async (capa, cerrar, boton) => {
            const datos = leerFormulario(capa);
            if (!datos) return;
            // Las mismas reglas de cronologia que aplica el servidor (reglas.js).
            const critico = (estado.catalogos?.tiposAlerta ?? []).find((t) => t.clave === 'extintor')?.dias_critico;
            const { error, avisos } = validarRegistro(cfg.clave, datos, registro ?? {}, hoy(), { umbralCritico: critico });
            if (error) return aviso(error, 'error');
            // Aviso no bloqueante. Se usa el cuadro del navegador para no cerrar el formulario capturado.
            if (avisos.length && !window.confirm(`${avisos.join('\n')}\n\n¿Guardar de todos modos?`)) return;
            boton.disabled = true;
            try {
              if (esNuevo) await api.crear(cfg.ruta, datos);
              else await api.actualizar(`${cfg.ruta}/${registro.id}`, datos);
              cerrar();
              aviso(`${cfg.singular} ${esNuevo ? 'registrado' : 'actualizado'}.`);
              await cargar();
              estado.refrescarEstado?.();
            } catch (e) {
              aviso(e.message, 'error');
              boton.disabled = false;
            }
          },
        },
      ],
    });
    activarFotos(cuerpo);
    enlazarCalendario(cuerpo, CALENDARIO[cfg.clave], NO_FUTURAS[cfg.clave]);
  };

  if (botonNuevo) cont.querySelector('#btn-nuevo').onclick = () => abrirFormulario(null);

  cont.addEventListener('click', async (e) => {
    const boton = e.target.closest('[data-op]');
    if (!boton) return;
    const id = Number(boton.dataset.id);
    const registro = (cont.__filas ?? []).find((f) => f.id === id);
    const op = boton.dataset.op;

    if (op === 'ver' && registro) return cfg.ver(registro);
    if (op === 'editar') return abrirFormulario(await api.obtener(`${cfg.ruta}/${id}`));
    if (op === 'eliminar') {
      const ok = await confirmar(`Se dara de baja el registro seleccionado de ${cfg.titulo.toLowerCase()}. La operacion no se puede deshacer.`);
      if (!ok) return;
      try {
        await api.eliminar(`${cfg.ruta}/${id}`);
        aviso('Registro eliminado.');
        await cargar();
        estado.refrescarEstado?.();
      } catch (err) {
        aviso(err.message, 'error');
      }
      return;
    }
    if (cfg.accionesExtra) await cfg.accionesExtra(op, registro, cargar);
  });

  await cargar();

  // Enlace directo desde el correo de aviso:  #/gafetes?ficha=12
  const idFicha = Number(cont.__parametros?.ficha);
  if (idFicha) {
    const registro = (cont.__filas ?? []).find((f) => f.id === idFicha);
    if (registro) cfg.ver(registro);
    else aviso('El registro indicado en el enlace ya no existe.', 'error');
  }
}

/* ================================================================== */
/* Panel principal                                                     */
/* ================================================================== */

const NOMBRE_MODULO = {
  gafetes: 'Gafetes',
  extintores: 'Extintores',
  equipos: 'Eq. Seguridad',
  licencias: 'Licencias',
};

/** Linea de tiempo de 180 dias con un marcador por concepto. */
function lineaTiempo(items) {
  const carril = (clave) => {
    const propios = items.filter((i) => i.modulo === clave);
    const marcadores = propios
      .map((i) => {
        const pos = Math.min(100, Math.max(0, (Math.max(i.dias, 0) / 180) * 100));
        const titulo = `${i.referencia} · ${i.concepto} · ${
          i.dias < 0 ? `vencido hace ${Math.abs(i.dias)} d` : `en ${i.dias} d`
        } (${fecha(i.fecha)})`;
        return `<i class="marcador marcador--${esc(i.clasificacion)}" style="left:${pos}%" title="${esc(titulo)}"></i>`;
      })
      .join('');
    return `<div class="carril">
      <span class="carril__nombre">${esc(NOMBRE_MODULO[clave])}</span>
      <div class="carril__pista">${marcadores}</div>
    </div>`;
  };

  return `<div class="linea-tiempo">
    ${carril('gafetes')}${carril('extintores')}${carril('equipos')}${carril('licencias')}
    <div class="escala">
      <span>Hoy</span><span>45 d</span><span>90 d</span><span>135 d</span><span>180 d</span>
    </div>
  </div>`;
}

/**
 * Semaforo de vigencias: el indicador visual comprometido en el anteproyecto
 * (verde vigente, amarillo proximo a vencer, rojo vencido).
 */
function semaforo(r) {
  const lampara = (color, valor) =>
    `<div class="semaforo__lampara semaforo__lampara--${color} ${valor > 0 ? 'encendida' : ''}">${valor}</div>`;

  const renglon = (color, titulo, detalle, valor) =>
    `<div class="semaforo__renglon">
      <span class="semaforo__punto semaforo__punto--${color}"></span>
      <span class="semaforo__texto"><strong>${esc(titulo)}</strong><span>${esc(detalle)}</span></span>
      <span class="semaforo__cifra">${valor}</span>
    </div>`;

  return `<div class="semaforo">
    <div class="semaforo__poste">
      ${lampara('rojo', r.rojo)}${lampara('amarillo', r.amarillo)}${lampara('verde', r.verde)}
    </div>
    <div class="semaforo__lectura">
      ${renglon('rojo', 'Vencido', 'Fuera de vigencia, retirar de uso', r.rojo)}
      ${renglon('amarillo', 'Proximo a vencer', `Dentro de la anticipacion configurada (${r.critico} en estado critico)`, r.amarillo)}
      ${renglon('verde', 'Vigente', 'Dentro de su periodo de validez', r.verde)}
    </div>
  </div>`;
}

/** Matriz de los cinco tipos de elemento con su anticipacion de aviso. */
function matrizTipos(porTipo) {
  return `<div class="matriz">
    <div class="matriz__fila matriz__fila--cabeza">
      <span>Tipo de elemento</span>
      <span title="Dias de aviso previo / dias del umbral critico">Aviso</span>
      <span title="Rojo: vencidos, fuera de vigencia">R</span>
      <span title="Amarillo: proximos a vencer, dentro del aviso previo">A</span>
      <span title="Verde: vigentes, dentro de su periodo de validez">V</span>
    </div>
    ${porTipo
      .map(
        (t) => `<div class="matriz__fila">
          <span class="matriz__nombre">${esc(t.nombre)}</span>
          <span class="matriz__umbral">${t.dias_proximo}/${t.dias_critico} d</span>
          <span class="matriz__celda matriz__celda--rojo" data-valor="${t.rojo}">${t.rojo}</span>
          <span class="matriz__celda matriz__celda--amarillo" data-valor="${t.amarillo}">${t.amarillo}</span>
          <span class="matriz__celda matriz__celda--verde" data-valor="${t.verde}">${t.verde}</span>
        </div>`
      )
      .join('')}
  </div>
  <p class="matriz__leyenda">
    <span class="matriz__clave matriz__clave--rojo">R</span> Vencido
    <span class="matriz__clave matriz__clave--amarillo">A</span> Por vencer
    <span class="matriz__clave matriz__clave--verde">V</span> Vigente
  </p>`;
}

export async function panel(cont) {
  const d = await api.obtener('/api/panel');
  estado.configuracion = d.configuracion;

  const cifra = (valor, etiqueta, nota, tono = '') =>
    `<div class="cifra" data-tono="${tono}">
      <div class="cifra__valor">${valor}</div>
      <div class="cifra__etiqueta">${esc(etiqueta)}</div>
      ${nota ? `<div class="cifra__nota">${esc(nota)}</div>` : ''}
    </div>`;

  const maxMes = Math.max(1, ...d.meses.map((m) => m.total));

  cont.innerHTML = `
    ${rotulo(
      'Panel de control',
      `${d.configuracion.nombre_centro} · ${d.configuracion.zona} · ${d.configuracion.municipio ?? ''}`,
      `<button class="boton" id="btn-ir-vigencias">Ver vigencias</button>
       <button class="boton boton--primario" id="btn-revisar-panel">${icono('refrescar', 'ico--sm')} Revisar</button>`
    )}

    <div class="cifras">
      ${cifra(d.totales.empleados, 'Trabajadores', 'Personal operativo')}
      ${cifra(d.resumen.total, 'Vigencias', 'Conceptos vigilados', 'azul')}
      ${cifra(d.resumen.vencido ?? 0, 'Vencidos', 'Atencion inmediata', 'vencido')}
      ${cifra((d.resumen.critico ?? 0) + (d.resumen.proximo ?? 0), 'Por vencer', 'Dentro del aviso previo', 'proximo')}
      ${cifra(d.totales.notificaciones, 'Alertas', 'Sin leer', 'critico')}
    </div>

    <div class="rejilla rejilla--2" style="margin-bottom:14px">
      <div class="hoja hoja--acento">
        <h3 class="titulo-bloque">Semaforo de vigencias <small>${d.resumen.total} conceptos</small></h3>
        ${semaforo(d.resumen)}
      </div>

      <div class="hoja hoja--acento">
        <h3 class="titulo-bloque">Reparto por tipo de elemento
          <small title="Rojo: vencido / Amarillo: por vencer / Verde: vigente">R / A / V</small></h3>
        ${matrizTipos(d.porTipo)}
      </div>
    </div>

    <div class="rejilla rejilla--2" style="margin-bottom:14px">
      <div class="hoja hoja--acento">
        <h3 class="titulo-bloque">Linea de vencimientos <small>${d.linea.length} conceptos / 180 dias</small></h3>
        ${lineaTiempo(d.linea)}
      </div>

      <div class="hoja hoja--acento">
        <h3 class="titulo-bloque">Carga por mes <small>Proximos 6 meses</small></h3>
        <div class="barras">
          ${d.meses
            .map(
              (m) => `<div class="barra-fila">
                <span>${esc(m.etiqueta)}</span>
                <div class="barra-pista"><div class="barra-valor" style="width:${(m.total / maxMes) * 100}%"></div></div>
                <b>${m.total}</b>
              </div>`
            )
            .join('')}
        </div>
      </div>
    </div>

    <h3 class="titulo-bloque">Requieren atencion inmediata</h3>
    ${tabla(
      [
        { titulo: 'Modulo', render: (i) => marca('neutro', i.modulo_nombre) },
        { titulo: 'Referencia', render: (i) => celdaClave(i.referencia), clase: 'clave-fila' },
        { titulo: 'Descripcion', campo: 'descripcion' },
        { titulo: 'Concepto', campo: 'concepto' },
        { titulo: 'Vence', render: (i) => fecha(i.fecha), clase: 'fecha' },
        { titulo: 'Dias', render: (i) => i.dias, clase: 'num' },
        { titulo: 'Situacion', render: (i) => marca(i.clasificacion, i.etiqueta) },
      ],
      d.atencion,
      'Sin pendientes'
    )}`;

  cont.querySelector('#btn-ir-vigencias').onclick = () => (window.location.hash = '#/vigencias');
  cont.querySelector('#btn-revisar-panel').onclick = async (e) => {
    e.target.disabled = true;
    const r = await api.crear('/api/alertas/revisar');
    aviso(`Revision terminada: ${r.generadas} alerta(s) nueva(s) de ${r.revisadas} concepto(s).`);
    await estado.refrescarEstado?.();
    panel(cont);
  };
}

/* ================================================================== */
/* Vigencias                                                           */
/* ================================================================== */

export async function vigencias(cont) {
  const filtros = { estado: 'todos', modulo: 'todos', tipo: 'todos', q: '' };

  cont.innerHTML = `
    ${rotulo('Control de vigencias', 'Concentrado de los cinco elementos con fecha de caducidad.', `
      ${btnExportar}
      <button class="boton boton--primario" id="btn-revisar-v">${icono('refrescar', 'ico--sm')} Generar alertas</button>`)}
    <div class="herramientas">
      ${icono('buscar', 'ico--sm')}
      <input type="search" id="buscador" placeholder="Referencia, equipo, trabajador..." />
      <select data-filtro="tipo">
        <option value="todos">Todos los elementos</option>
        ${(estado.catalogos.tiposAlerta ?? [])
          .map((t) => `<option value="${esc(t.clave)}">${esc(t.nombre)}</option>`)
          .join('')}
      </select>
      <select data-filtro="estado">
        <option value="todos">Todo el semaforo</option>
        <option value="rojo">🔴 Rojo · vencidos</option>
        <option value="amarillo">🟡 Amarillo · por vencer</option>
        <option value="verde">🟢 Verde · vigentes</option>
        <option value="critico">Solo criticos</option>
      </select>
      <span class="conteo" id="conteo"></span>
    </div>
    <div id="tabla-vigencias"></div>`;

  async function cargar() {
    const d = await api.obtener(
      `/api/vigencias?estado=${filtros.estado}&modulo=${filtros.modulo}&tipo=${filtros.tipo}&q=${encodeURIComponent(filtros.q)}`
    );
    cont.querySelector('#conteo').textContent =
      `${d.items.length} conceptos · rojo ${d.resumen.rojo} · amarillo ${d.resumen.amarillo} · verde ${d.resumen.verde}`;
    cont.querySelector('#tabla-vigencias').innerHTML = tabla(
      [
        { titulo: 'Elemento', render: (i) => marca('neutro', i.modulo_nombre) },
        { titulo: 'Referencia', render: (i) => celdaClave(i.referencia, i.descripcion) },
        { titulo: 'Concepto', campo: 'concepto' },
        { titulo: 'Responsable', render: (i) => `${esc(i.responsable)}<span class="sub">${esc(i.ubicacion)}</span>` },
        { titulo: 'Inicio', render: (i) => fecha(i.fecha_inicio), clase: 'fecha' },
        { titulo: 'Caducidad', render: (i) => fecha(i.fecha), clase: 'fecha' },
        { titulo: 'Dias', render: (i) => i.dias, clase: 'num' },
        { titulo: 'Aviso', render: (i) => `<span class="matriz__umbral">${i.umbral.proximo}/${i.umbral.critico} d</span>`, clase: 'num' },
        { titulo: 'Semaforo', render: (i) => marca(i.clasificacion, i.etiqueta) },
      ],
      d.items,
      'Sin coincidencias'
    );
  }

  const buscador = cont.querySelector('#buscador');
  let t;
  buscador.addEventListener('input', () => {
    clearTimeout(t);
    filtros.q = buscador.value.trim();
    t = setTimeout(cargar, 220);
  });
  cont.querySelectorAll('[data-filtro]').forEach((s) =>
    s.addEventListener('change', () => {
      filtros[s.dataset.filtro] = s.value;
      cargar();
    })
  );
  cont.querySelector('#btn-exportar').onclick = () => descargarCSV('vigencias');
  cont.querySelector('#btn-revisar-v').onclick = async (e) => {
    e.target.disabled = true;
    const r = await api.crear('/api/alertas/revisar');
    aviso(`${r.generadas} alerta(s) nueva(s). Correo: ${r.correo}.`);
    await estado.refrescarEstado?.();
    e.target.disabled = false;
  };

  await cargar();
}

/* ================================================================== */
/* Alertas                                                             */
/* ================================================================== */

export async function notificaciones(cont) {
  async function cargar() {
    const d = await api.obtener('/api/notificaciones');
    await estado.refrescarEstado?.();

    cont.querySelector('#lista').innerHTML = d.items.length
      ? `<div class="lista-alertas">${d.items
          .map(
            (n) => `<div class="alerta-fila alerta-fila--${esc(n.severidad)} ${n.leida ? 'alerta-fila--leida' : ''}">
              <div class="alerta-fila__cuerpo">
                <strong>${esc(n.titulo)}</strong>
                <p>${esc(n.mensaje)}</p>
                <span class="alerta-fila__sello">${fechaHora(n.creada_en)} · ${esc(n.modulo)} #${n.registro_id} ·
                  ${n.correo_enviado ? 'correo enviado' : 'sin correo'}</span>
              </div>
              <div class="acciones">
                ${n.leida ? '' : `<button class="boton boton--mini" data-leer="${n.id}">Leida</button>`}
                ${esAdmin()
                  ? `<button class="boton boton--mini boton--icono boton--peligro" data-borrar="${n.id}" title="Eliminar">${icono('eliminar', 'ico--sm')}</button>`
                  : ''}
              </div>
            </div>`
          )
          .join('')}</div>`
      : `<div class="tabla-caja"><div class="vacio">Sin alertas registradas</div></div>`;
  }

  cont.innerHTML = `
    ${rotulo('Alertas de vencimiento', 'Avisos generados automaticamente por el motor de vigencias.', `
      <button class="boton" id="btn-todas">Marcar todas leidas</button>
      <button class="boton boton--primario" id="btn-generar">${icono('refrescar', 'ico--sm')} Revisar ahora</button>`)}
    <div id="lista"></div>`;

  cont.querySelector('#btn-todas').onclick = async () => {
    const r = await api.crear('/api/notificaciones/leer-todas');
    aviso(`${r.actualizadas} alerta(s) marcadas como leidas.`);
    await cargar();
  };
  cont.querySelector('#btn-generar').onclick = async (e) => {
    e.target.disabled = true;
    const r = await api.crear('/api/alertas/revisar');
    aviso(`${r.generadas} alerta(s) nueva(s). Correo: ${r.correo}.`);
    await cargar();
    e.target.disabled = false;
  };

  cont.addEventListener('click', async (e) => {
    const leer = e.target.closest('[data-leer]');
    const borrar = e.target.closest('[data-borrar]');
    if (leer) {
      await api.crear(`/api/notificaciones/${leer.dataset.leer}/leer`);
      await cargar();
    }
    if (borrar) {
      await api.eliminar(`/api/notificaciones/${borrar.dataset.borrar}`);
      await cargar();
    }
  });

  await cargar();
}

/* ================================================================== */
/* Gafetes                                                             */
/* ================================================================== */

function credencialHTML(g, cfg) {
  const v = clasificar(g.fecha_vencimiento, 'gafete');
  return `<div class="credencial">
    <div class="credencial__cabeza">
      <img src="img/cfe-marca-blanco.png" alt="CFE" />
      <span>${esc(cfg.nombre_centro ?? '')}<br />${esc(cfg.zona ?? '')}</span>
    </div>
    <div class="credencial__banda"></div>
    <div class="credencial__cuerpo">
      <div class="credencial__foto">${g.foto ? `<img src="${esc(g.foto)}" alt="Fotografia" />` : icono('personal')}</div>
      <dl class="credencial__datos">
        <h4>${esc(g.empleado)}</h4>
        <dt>RPE</dt><dd>${esc(g.rpe)}</dd>
        <dt>Puesto</dt><dd>${esc(g.puesto || '—')}</dd>
        <dt>Area</dt><dd>${esc(g.departamento || '—')}</dd>
        <dt>Sangre</dt><dd>${esc(g.tipo_sangre || '—')}</dd>
      </dl>
    </div>
    <div class="credencial__folio">
      <div><span>Folio</span><b>${esc(g.folio)}</b></div>
      <div><span>Acceso</span><b>${esc(g.nivel_acceso)}</b></div>
      <div><span>Tipo</span><b>${esc(g.tipo)}</b></div>
    </div>
    <div class="credencial__pie">
      <span>${fecha(g.fecha_emision)} — ${fecha(g.fecha_vencimiento)}</span>
      ${marca(v.clase, v.texto)}
    </div>
  </div>`;
}

export async function gafetes(cont, parametros = {}) {
  cont.__parametros = parametros;
  await pantallaCatalogo(cont, {
    clave: 'gafetes',
    ruta: '/api/gafetes',
    titulo: 'Gafetes',
    singular: 'gafete',
    textoNuevo: 'Nuevo gafete',
    descripcion: 'Credenciales del personal con control de vigencia y nivel de acceso.',
    columnas: [
      { titulo: 'Folio', render: (g) => celdaClave(g.folio) },
      { titulo: 'Empleado', render: (g) => `${esc(g.empleado)}<span class="sub">${esc(g.rpe)} · ${esc(g.departamento)}</span>` },
      { titulo: 'Tipo', render: (g) => `${esc(g.tipo)}<span class="sub">${esc(g.nivel_acceso)}</span>` },
      { titulo: 'Emision', render: (g) => fecha(g.fecha_emision), clase: 'fecha' },
      { titulo: 'Vence', render: (g) => fecha(g.fecha_vencimiento), clase: 'fecha' },
      { titulo: 'Vigencia', render: (g) => marcaFecha(g.fecha_vencimiento, 'gafete') },
      // El estado se calcula con la fecha VENCE: "Activo" en la base de datos
      // pero vencido por fecha se muestra como VENCIDO (ver reglas.js).
      { titulo: 'Estado', render: (g) => marcaEstado('gafetes', g) },
      { titulo: '', render: (g) => botonesFila(g.id, 'gafetes', [{ op: 'credencial', texto: 'Credencial' }, { op: 'renovar', texto: 'Renovar' }]) },
    ],
    campos: () => [
      { nombre: 'folio', etiqueta: 'Folio', requerido: true },
      { nombre: 'empleado_id', etiqueta: 'Empleado', tipo: 'select', requerido: true, permiteVacio: true, opciones: opcionesEmpleados() },
      { nombre: 'tipo', etiqueta: 'Tipo de gafete', tipo: 'select', requerido: true, opciones: estado.catalogos.tiposGafete },
      { nombre: 'nivel_acceso', etiqueta: 'Nivel de acceso', tipo: 'select', opciones: estado.catalogos.nivelesAcceso },
      { nombre: 'fecha_emision', etiqueta: 'Fecha de emision', tipo: 'fecha', requerido: true, porDefecto: hoy() },
      { nombre: 'fecha_vencimiento', etiqueta: 'Fecha de vencimiento', tipo: 'fecha', requerido: true },
      { nombre: 'estado', etiqueta: 'Estado', tipo: 'select', requerido: true, opciones: estado.catalogos.estadosGafete },
      { nombre: 'observaciones', etiqueta: 'Observaciones', tipo: 'textarea', ancho: 'completo' },
    ],
    ver: (g) =>
      abrirModal({
        titulo: `Gafete ${g.folio}`,
        contenido: `${ficha([
          ['Empleado', esc(g.empleado)],
          ['RPE', esc(g.rpe)],
          ['Puesto', esc(g.puesto)],
          ['Departamento', esc(g.departamento)],
          ['Tipo', esc(g.tipo)],
          ['Nivel de acceso', esc(g.nivel_acceso)],
          ['Emision', fecha(g.fecha_emision)],
          ['Vencimiento', fecha(g.fecha_vencimiento)],
          ['Situacion', marcaFecha(g.fecha_vencimiento, 'gafete')],
          ['Estado', marcaEstado('gafetes', g)],
        ])}
        <p style="margin-top:16px;font-size:.85rem"><b>Observaciones:</b> ${esc(g.observaciones || 'Sin observaciones.')}</p>`,
        acciones: [{ texto: 'Cerrar', alClic: (_c, cerrar) => cerrar() }],
      }),
    accionesExtra: async (op, g, recargar) => {
      if (op === 'credencial') {
        const d = await api.obtener(`/api/gafetes/${g.id}/credencial`);
        abrirModal({
          titulo: `Credencial ${d.gafete.folio}`,
          ancho: 'modal--angosto',
          contenido: credencialHTML(d.gafete, d.configuracion),
          acciones: [
            { texto: 'Cerrar', alClic: (_c, cerrar) => cerrar() },
            { texto: 'Imprimir', clase: 'boton--primario', alClic: () => window.print() },
          ],
        });
      }
      if (op === 'renovar') {
        if (!puede('gafetes')) return aviso('Su perfil no administra gafetes.', 'error');
        // Solo se captura la EMISION; el vencimiento (+12 meses) lo calcula el
        // sistema y no se puede teclear.
        const v = await pedirFechas({
          titulo: 'Renovar gafete',
          mensaje: `El gafete ${g.folio} vence el ${ddmmaaaa(g.fecha_vencimiento)}. El vencimiento nuevo se calcula solo: 12 meses despues de la emision.`,
          campos: [{
            nombre: 'fecha_emision',
            etiqueta: 'Fecha de emision (renovacion)',
            valor: hoy() < (g.fecha_emision ?? '') ? g.fecha_emision : hoy(),
            min: g.fecha_emision,
            ayuda: `No puede ser anterior a la emision actual (${ddmmaaaa(g.fecha_emision)}).`,
          }],
          textoBoton: 'Renovar',
          validar: (x) => planRenovarGafete(g, x).error ?? null,
        });
        if (!v) return;
        try {
          const nuevo = await api.crear(`/api/gafetes/${g.id}/renovar`, v);
          aviso(`Gafete renovado. Nueva vigencia: ${fecha(nuevo.fecha_vencimiento)}.`);
          await recargar();
          estado.refrescarEstado?.();
        } catch (e) {
          aviso(e.message, 'error');
        }
      }
    },
  });
}

/* ================================================================== */
/* Extintores                                                          */
/* ================================================================== */

export async function extintores(cont, parametros = {}) {
  cont.__parametros = parametros;
  await pantallaCatalogo(cont, {
    clave: 'extintores',
    ruta: '/api/extintores',
    titulo: 'Extintores',
    singular: 'extintor',
    textoNuevo: 'Nuevo extintor',
    descripcion: 'Equipo contra incendio con control de recarga y prueba hidrostatica.',
    columnas: [
      { titulo: 'Codigo', render: (x) => celdaClave(x.codigo, `${x.tipo} ${x.capacidad_kg} kg`) },
      { titulo: 'Ubicacion', render: (x) => `${esc(x.ubicacion)}<span class="sub">${esc(x.area)}</span>` },
      { titulo: 'Recarga', render: (x) => `${fecha(x.fecha_recarga)}<span class="sub">ultima</span>`, clase: 'fecha' },
      { titulo: 'Prox. recarga', render: (x) => `${fecha(x.fecha_prox_recarga)}<br>${marcaFecha(x.fecha_prox_recarga, 'extintor')}`, clase: 'fecha' },
      {
        titulo: 'Prox. hidrostatica',
        render: (x) => (x.fecha_prox_hidrostatica ? `${fecha(x.fecha_prox_hidrostatica)}<br>${marcaFecha(x.fecha_prox_hidrostatica, 'extintor')}` : '—'),
        clase: 'fecha',
      },
      { titulo: 'Responsable', render: (x) => esc(x.responsable ?? 'Sin asignar') },
      // Doble condicion: VENCIDO si la recarga O la prueba hidrostatica ya vencieron.
      { titulo: 'Estado', render: (x) => marcaEstado('extintores', x) },
      { titulo: '', render: (x) => botonesFila(x.id, 'extintores', [{ op: 'recarga', texto: 'Recarga' }]) },
    ],
    campos: () => [
      { nombre: 'codigo', etiqueta: 'Codigo / numero economico', requerido: true },
      { nombre: 'tipo', etiqueta: 'Agente extintor', tipo: 'select', requerido: true, opciones: estado.catalogos.tiposExtintor },
      { nombre: 'capacidad_kg', etiqueta: 'Capacidad (kg)', tipo: 'numero', paso: '0.5' },
      { nombre: 'marca', etiqueta: 'Marca' },
      { nombre: 'ubicacion', etiqueta: 'Ubicacion fisica', requerido: true },
      { nombre: 'area', etiqueta: 'Area / centro de trabajo' },
      { nombre: 'responsable_id', etiqueta: 'Responsable', tipo: 'select', permiteVacio: true, opciones: opcionesEmpleados() },
      { nombre: 'estado', etiqueta: 'Estado', tipo: 'select', requerido: true, opciones: estado.catalogos.estadosExtintor },
      { nombre: 'fecha_fabricacion', etiqueta: 'Fecha de fabricacion', tipo: 'fecha' },
      { nombre: 'fecha_recarga', etiqueta: 'Ultima recarga', tipo: 'fecha' },
      { nombre: 'fecha_prox_recarga', etiqueta: 'Proxima recarga', tipo: 'fecha', requerido: true, ayuda: 'Habitualmente 12 meses despues de la recarga.' },
      { nombre: 'fecha_prueba_hidrostatica', etiqueta: 'Ultima prueba hidrostatica', tipo: 'fecha' },
      { nombre: 'fecha_prox_hidrostatica', etiqueta: 'Proxima prueba hidrostatica', tipo: 'fecha', ayuda: 'Generalmente cada 5 anos.' },
      { nombre: 'observaciones', etiqueta: 'Observaciones', tipo: 'textarea', ancho: 'completo' },
    ],
    ver: (x) =>
      abrirModal({
        titulo: `Extintor ${x.codigo}`,
        contenido: `${ficha([
          ['Agente extintor', esc(x.tipo)],
          ['Capacidad', `${esc(x.capacidad_kg)} kg`],
          ['Marca', esc(x.marca)],
          ['Ubicacion', esc(x.ubicacion)],
          ['Area', esc(x.area)],
          ['Responsable', esc(x.responsable ?? 'Sin asignar')],
          ['Fabricacion', fecha(x.fecha_fabricacion)],
          ['Ultima recarga', fecha(x.fecha_recarga)],
          ['Proxima recarga', `${fecha(x.fecha_prox_recarga)} ${marcaFecha(x.fecha_prox_recarga, 'extintor')}`],
          ['Ultima hidrostatica', fecha(x.fecha_prueba_hidrostatica)],
          ['Proxima hidrostatica', x.fecha_prox_hidrostatica ? `${fecha(x.fecha_prox_hidrostatica)} ${marcaFecha(x.fecha_prox_hidrostatica, 'extintor')}` : '—'],
          ['Estado', marcaEstado('extintores', x)],
        ])}
        <p style="margin-top:16px;font-size:.85rem"><b>Observaciones:</b> ${esc(x.observaciones || 'Sin observaciones.')}</p>`,
        acciones: [{ texto: 'Cerrar', alClic: (_c, cerrar) => cerrar() }],
      }),
    accionesExtra: async (op, x, recargar) => {
      if (op !== 'recarga') return;
      if (!puede('extintores')) return aviso('Su perfil no administra extintores.', 'error');
      // Si la prueba hidrostatica tambien esta vencida, el cuadro exige su
      // nueva fecha: sin ella el extintor seguiria marcando VENCIDO.
      const pideHidro = requiereHidrostatica(x);
      const minRecarga = [x.fecha_fabricacion, x.fecha_recarga].filter(Boolean).sort().pop();
      const campos = [{
        nombre: 'fecha_recarga',
        etiqueta: 'Fecha de recarga',
        valor: minRecarga && hoy() < minRecarga ? minRecarga : hoy(),
        min: minRecarga || undefined,
        ayuda: 'La proxima recarga se calcula sola: 12 meses despues.',
      }];
      if (pideHidro) {
        campos.push({
          nombre: 'fecha_prueba_hidrostatica',
          etiqueta: 'Fecha de la nueva prueba hidrostatica',
          valor: hoy(),
          min: x.fecha_prueba_hidrostatica || x.fecha_fabricacion || undefined,
          ayuda: 'La proxima prueba se calcula sola: 5 anos despues.',
        });
      }
      const v = await pedirFechas({
        titulo: 'Registrar recarga',
        mensaje: pideHidro
          ? `El extintor ${x.codigo} tiene la prueba hidrostatica vencida desde el ${ddmmaaaa(x.fecha_prox_hidrostatica)}. Registra la recarga y tambien la nueva prueba.`
          : `Se registrara la recarga del extintor ${x.codigo}.`,
        campos,
        textoBoton: 'Registrar',
        validar: (datos) => planRecargaExtintor(x, datos).error ?? null,
      });
      if (!v) return;
      try {
        const nuevo = await api.crear(`/api/extintores/${x.id}/recarga`, v);
        aviso(`Recarga registrada. Proxima: ${fecha(nuevo.fecha_prox_recarga)}.`);
        await recargar();
        estado.refrescarEstado?.();
      } catch (e) {
        aviso(e.message, 'error');
      }
    },
  });
}

/* ================================================================== */
/* Equipo                                                              */
/* ================================================================== */

export async function equipos(cont, parametros = {}) {
  cont.__parametros = parametros;
  await pantallaCatalogo(cont, {
    clave: 'equipos',
    ruta: '/api/equipos',
    titulo: 'Equipo de Seguridad',
    singular: 'equipo',
    textoNuevo: 'Nuevo equipo',
    descripcion: 'Botiquines, arneses, proteccion personal, herramienta aislada e instrumentos con caducidad o revision periodica.',
    filtros: [
      {
        clave: 'categoria',
        etiqueta: 'Todas las categorias',
        campo: 'categoria',
        opciones: () => estado.catalogos.categoriasEquipo,
      },
    ],
    columnas: [
      { titulo: 'Codigo', render: (q) => celdaClave(q.codigo, q.serie) },
      { titulo: 'Equipo', render: (q) => `${esc(q.nombre)}<span class="sub">${esc(q.marca)} ${esc(q.modelo)}</span>` },
      { titulo: 'Categoria', campo: 'categoria' },
      { titulo: 'Ubicacion', render: (q) => `${esc(q.ubicacion)}<span class="sub">${esc(q.responsable ?? 'Sin asignar')}</span>` },
      { titulo: 'Inicio', render: (q) => fecha(q.fecha_inicio ?? q.fecha_adquisicion), clase: 'fecha' },
      { titulo: 'Vence', render: (q) => `${fecha(q.fecha_vencimiento)}<br>${marcaFecha(q.fecha_vencimiento, q.tipo_alerta)}`, clase: 'fecha' },
      {
        titulo: 'Mantenimiento',
        clase: 'fecha',
        render: (q) =>
          q.frecuencia_meses > 0 && q.fecha_ultimo_mantenimiento
            ? `${fecha(sumarMeses(q.fecha_ultimo_mantenimiento, q.frecuencia_meses))}<br>${marcaFecha(
                sumarMeses(q.fecha_ultimo_mantenimiento, q.frecuencia_meses)
              )}`
            : '<span class="sub">No aplica</span>',
      },
      // "En servicio" pero con la fecha VENCE pasada se muestra como VENCIDO.
      { titulo: 'Estado', render: (q) => marcaEstado('equipos', q) },
      { titulo: '', render: (q) => botonesFila(q.id, 'equipos', [{ op: 'mantenimiento', texto: 'Mantto.' }]) },
    ],
    campos: () => [
      { nombre: 'codigo', etiqueta: 'Codigo de inventario', requerido: true },
      { nombre: 'nombre', etiqueta: 'Nombre del equipo', requerido: true },
      { nombre: 'categoria', etiqueta: 'Categoria', tipo: 'select', requerido: true, opciones: estado.catalogos.categoriasEquipo },
      {
        nombre: 'tipo_alerta',
        etiqueta: 'Tipo de elemento (define el aviso)',
        tipo: 'select',
        requerido: true,
        opciones: (estado.catalogos.tiposAlerta ?? [])
          .filter((t) => ['botiquin', 'arnes', 'equipo'].includes(t.clave))
          .map((t) => ({ valor: t.clave, texto: `${t.nombre} — aviso ${t.dias_proximo} d` })),
        ayuda: 'Determina con cuantos dias de anticipacion se avisa.',
      },
      { nombre: 'marca', etiqueta: 'Marca' },
      { nombre: 'modelo', etiqueta: 'Modelo' },
      { nombre: 'serie', etiqueta: 'Numero de serie' },
      { nombre: 'ubicacion', etiqueta: 'Ubicacion / area' },
      { nombre: 'responsable_id', etiqueta: 'Responsable', tipo: 'select', permiteVacio: true, opciones: opcionesEmpleados() },
      { nombre: 'fecha_adquisicion', etiqueta: 'Fecha de adquisicion', tipo: 'fecha' },
      { nombre: 'fecha_inicio', etiqueta: 'Inicio de vigencia', tipo: 'fecha', requerido: true, ayuda: 'Fecha desde la que el elemento es valido.' },
      { nombre: 'fecha_vencimiento', etiqueta: 'Vencimiento / caducidad', tipo: 'fecha', requerido: true },
      { nombre: 'frecuencia_meses', etiqueta: 'Frecuencia de mantenimiento (meses)', tipo: 'numero', paso: '1', ayuda: '0 si no requiere mantenimiento periodico.' },
      { nombre: 'fecha_ultimo_mantenimiento', etiqueta: 'Ultimo mantenimiento', tipo: 'fecha' },
      { nombre: 'estado', etiqueta: 'Estado', tipo: 'select', requerido: true, opciones: estado.catalogos.estadosEquipo },
      { nombre: 'observaciones', etiqueta: 'Observaciones', tipo: 'textarea', ancho: 'completo' },
    ],
    ver: (q) =>
      abrirModal({
        titulo: `${q.codigo} · ${q.nombre}`,
        contenido: `${ficha([
          ['Categoria', esc(q.categoria)],
          ['Marca / modelo', `${esc(q.marca)} ${esc(q.modelo)}`],
          ['Numero de serie', esc(q.serie)],
          ['Ubicacion', esc(q.ubicacion)],
          ['Responsable', esc(q.responsable ?? 'Sin asignar')],
          ['Adquisicion', fecha(q.fecha_adquisicion)],
          ['Vencimiento', `${fecha(q.fecha_vencimiento)} ${marcaFecha(q.fecha_vencimiento)}`],
          ['Frecuencia', q.frecuencia_meses > 0 ? `${q.frecuencia_meses} meses` : 'No aplica'],
          ['Ultimo mantenimiento', fecha(q.fecha_ultimo_mantenimiento)],
          ['Estado', marcaEstado('equipos', q)],
        ])}
        <p style="margin-top:16px;font-size:.85rem"><b>Observaciones:</b> ${esc(q.observaciones || 'Sin observaciones.')}</p>`,
        acciones: [{ texto: 'Cerrar', alClic: (_c, cerrar) => cerrar() }],
      }),
    accionesExtra: async (op, q, recargar) => {
      if (op !== 'mantenimiento') return;
      if (!puede('equipos')) return aviso('Su perfil no administra equipo de seguridad.', 'error');
      // Un mantenimiento es preventivo y no extiende la vida util: la fecha
      // no puede pasar del VENCIMIENTO del equipo (atributo max del input).
      const v = await pedirFechas({
        titulo: 'Registrar mantenimiento',
        mensaje: `Mantenimiento del equipo ${q.codigo}. Vence el ${ddmmaaaa(q.fecha_vencimiento)}${
          q.frecuencia_meses > 0 ? `; el proximo mantenimiento se calcula a ${q.frecuencia_meses} meses de la fecha que indiques` : ''
        }.`,
        campos: [{
          nombre: 'fecha_ultimo_mantenimiento',
          etiqueta: 'Fecha de mantenimiento',
          valor: q.fecha_vencimiento && hoy() > q.fecha_vencimiento.slice(0, 10) ? q.fecha_vencimiento.slice(0, 10) : hoy(),
          min: q.fecha_adquisicion || undefined,
          max: q.fecha_vencimiento ? q.fecha_vencimiento.slice(0, 10) : undefined,
          ayuda: `Maximo: fecha de vencimiento (${ddmmaaaa(q.fecha_vencimiento)}).`,
        }],
        textoBoton: 'Registrar',
        validar: (datos) => planMantenimientoEquipo(q, datos).error ?? null,
      });
      if (!v) return;
      try {
        await api.crear(`/api/equipos/${q.id}/mantenimiento`, v);
        aviso('Mantenimiento registrado.');
        await recargar();
        estado.refrescarEstado?.();
      } catch (e) {
        aviso(e.message, 'error');
      }
    },
  });
}

/* ================================================================== */
/* Licencias de conducir                                               */
/* ================================================================== */

export async function licencias(cont, parametros = {}) {
  cont.__parametros = parametros;
  await pantallaCatalogo(cont, {
    clave: 'licencias',
    ruta: '/api/licencias',
    titulo: 'Licencias de conducir',
    singular: 'licencia',
    textoNuevo: 'Nueva licencia',
    descripcion: 'Documentos de conduccion del personal operativo que opera vehiculos oficiales.',
    columnas: [
      { titulo: 'Numero', render: (l) => celdaClave(l.numero) },
      { titulo: 'Titular', render: (l) => `${esc(l.empleado)}<span class="sub">${esc(l.rpe)} · ${esc(l.departamento)}</span>` },
      { titulo: 'Tipo', render: (l) => `${esc(l.tipo)}<span class="sub">${esc(l.ambito)}</span>` },
      { titulo: 'Expedicion', render: (l) => fecha(l.fecha_inicio), clase: 'fecha' },
      { titulo: 'Vence', render: (l) => fecha(l.fecha_vencimiento), clase: 'fecha' },
      { titulo: 'Vigencia', render: (l) => marcaFecha(l.fecha_vencimiento, 'licencia') },
      { titulo: 'Restricciones', render: (l) => esc(l.restricciones || '—') },
      // "Vigente" pero con la fecha VENCE pasada se muestra como VENCIDA.
      { titulo: 'Estado', render: (l) => marcaEstado('licencias', l) },
      { titulo: '', render: (l) => botonesFila(l.id, 'licencias', [{ op: 'refrendo', texto: 'Refrendo' }]) },
    ],
    campos: () => [
      { nombre: 'numero', etiqueta: 'Numero de licencia', requerido: true },
      { nombre: 'empleado_id', etiqueta: 'Titular', tipo: 'select', requerido: true, permiteVacio: true, opciones: opcionesEmpleados() },
      { nombre: 'tipo', etiqueta: 'Tipo de licencia', tipo: 'select', requerido: true, opciones: estado.catalogos.tiposLicencia },
      { nombre: 'ambito', etiqueta: 'Ambito', tipo: 'select', requerido: true, opciones: estado.catalogos.ambitosLicencia },
      { nombre: 'autoridad', etiqueta: 'Autoridad emisora', ancho: 'completo' },
      { nombre: 'fecha_inicio', etiqueta: 'Fecha de expedicion', tipo: 'fecha', requerido: true },
      { nombre: 'fecha_vencimiento', etiqueta: 'Fecha de vencimiento', tipo: 'fecha', requerido: true },
      { nombre: 'restricciones', etiqueta: 'Restricciones', ayuda: 'Uso de lentes, horario diurno, etc.' },
      { nombre: 'estado', etiqueta: 'Estado', tipo: 'select', requerido: true, opciones: estado.catalogos.estadosLicencia },
      { nombre: 'observaciones', etiqueta: 'Observaciones', tipo: 'textarea', ancho: 'completo' },
    ],
    ver: (l) =>
      abrirModal({
        titulo: `Licencia ${l.numero}`,
        contenido: `${ficha([
          ['Titular', esc(l.empleado)],
          ['RPE', esc(l.rpe)],
          ['Puesto', esc(l.puesto)],
          ['Departamento', esc(l.departamento)],
          ['Tipo', esc(l.tipo)],
          ['Ambito', esc(l.ambito)],
          ['Autoridad emisora', esc(l.autoridad)],
          ['Expedicion', fecha(l.fecha_inicio)],
          ['Vencimiento', fecha(l.fecha_vencimiento)],
          ['Situacion', marcaFecha(l.fecha_vencimiento, 'licencia')],
          ['Restricciones', esc(l.restricciones || 'Ninguna')],
          ['Estado', marcaEstado('licencias', l)],
        ])}
        <p style="margin-top:16px;font-size:.85rem"><b>Observaciones:</b> ${esc(l.observaciones || 'Sin observaciones.')}</p>`,
        acciones: [{ texto: 'Cerrar', alClic: (_c, cerrar) => cerrar() }],
      }),
    accionesExtra: async (op, l, recargar) => {
      if (op !== 'refrendo') return;
      if (!puede('licencias')) return aviso('Su perfil no administra licencias.', 'error');
      // El refrendo es un documento fisico nuevo: la expedicion no puede ser
      // anterior al dia de la captura (atributo min) y el vencimiento (+3 anos)
      // lo calcula el sistema.
      const v = await pedirFechas({
        titulo: 'Registrar refrendo',
        mensaje: `Refrendo de la licencia ${l.numero} (vence el ${ddmmaaaa(l.fecha_vencimiento)}). La nueva vigencia se calcula sola: 3 anos despues de la expedicion.`,
        campos: [{
          nombre: 'fecha_inicio',
          etiqueta: 'Fecha de expedicion del nuevo documento',
          valor: hoy(),
          min: hoy(),
          ayuda: 'Hoy o posterior.',
        }],
        textoBoton: 'Registrar',
        validar: (datos) => planRefrendoLicencia(l, datos).error ?? null,
      });
      if (!v) return;
      try {
        const nuevo = await api.crear(`/api/licencias/${l.id}/refrendo`, v);
        aviso(`Refrendo registrado. Nueva vigencia: ${fecha(nuevo.fecha_vencimiento)}.`);
        await recargar();
        estado.refrescarEstado?.();
      } catch (e) {
        aviso(e.message, 'error');
      }
    },
  });
}

/* ================================================================== */
/* Personal                                                            */
/* ================================================================== */

export async function empleados(cont, parametros = {}) {
  cont.__parametros = parametros;
  await pantallaCatalogo(cont, {
    clave: 'empleados',
    ruta: '/api/empleados',
    titulo: 'Personal',
    singular: 'empleado',
    textoNuevo: 'Nuevo empleado',
    descripcion: 'Registro del personal al que se asignan gafetes y equipo.',
    columnas: [
      { titulo: 'RPE', render: (e) => celdaClave(e.rpe) },
      {
        titulo: 'Nombre',
        render: (e) =>
          `<div style="display:flex;align-items:center;gap:10px">
            <span class="usuario__inicial" style="width:26px;height:26px;overflow:hidden">${
              e.foto ? `<img src="${esc(e.foto)}" style="width:100%;height:100%;object-fit:cover" />` : esc(iniciales(e.nombre))
            }</span>${esc(e.nombre)}</div>`,
      },
      { titulo: 'Puesto', render: (e) => `${esc(e.puesto)}<span class="sub">${esc(e.departamento)}</span>` },
      { titulo: 'Centro de trabajo', campo: 'centro_trabajo' },
      { titulo: 'Contacto', render: (e) => `${esc(e.correo)}<span class="sub">${esc(e.telefono)}</span>` },
      { titulo: 'Sangre', campo: 'tipo_sangre', clase: 'num' },
      { titulo: 'Situacion', render: (e) => marca(e.activo ? 'vigente' : 'neutro', e.activo ? 'Activo' : 'Baja') },
      { titulo: '', render: (e) => botonesFila(e.id, 'empleados') },
    ],
    campos: () => [
      { nombre: 'rpe', etiqueta: 'RPE', requerido: true },
      { nombre: 'nombre', etiqueta: 'Nombre completo', requerido: true },
      { nombre: 'puesto', etiqueta: 'Puesto' },
      { nombre: 'departamento', etiqueta: 'Departamento' },
      { nombre: 'centro_trabajo', etiqueta: 'Centro de trabajo' },
      { nombre: 'correo', etiqueta: 'Correo institucional', tipo: 'correo' },
      { nombre: 'telefono', etiqueta: 'Telefono' },
      { nombre: 'tipo_sangre', etiqueta: 'Tipo de sangre', tipo: 'select', permiteVacio: true, opciones: ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'] },
      { nombre: 'activo', etiqueta: 'Situacion', tipo: 'select', opciones: [{ valor: 1, texto: 'Activo' }, { valor: 0, texto: 'Baja' }] },
      { nombre: 'foto', etiqueta: 'Fotografia', tipo: 'foto', ancho: 'completo' },
    ],
    ver: (e) =>
      abrirModal({
        titulo: e.nombre,
        contenido: `<div style="display:flex;gap:18px;flex-wrap:wrap">
          <div class="credencial__foto">${e.foto ? `<img src="${esc(e.foto)}" />` : icono('personal')}</div>
          <div style="flex:1;min-width:240px">${ficha([
            ['RPE', esc(e.rpe)],
            ['Puesto', esc(e.puesto)],
            ['Departamento', esc(e.departamento)],
            ['Centro de trabajo', esc(e.centro_trabajo)],
            ['Correo', esc(e.correo)],
            ['Telefono', esc(e.telefono)],
            ['Tipo de sangre', esc(e.tipo_sangre)],
            ['Situacion', e.activo ? 'Activo' : 'Baja'],
          ])}</div>
        </div>`,
        acciones: [{ texto: 'Cerrar', alClic: (_c, cerrar) => cerrar() }],
      }),
  });
}

function iniciales(nombre = '') {
  return nombre.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

/* ================================================================== */
/* Usuarios                                                            */
/* ================================================================== */

export async function usuarios(cont) {
  const ROLES = [
    { valor: 'admin', texto: 'Administrador' },
    { valor: 'seguridad', texto: 'Jefe de Seguridad' },
    { valor: 'documentacion', texto: 'Encargado de Documentacion' },
  ];

  async function cargar() {
    const lista = await api.obtener('/api/usuarios');
    cont.__filas = lista;
    cont.querySelector('#tabla-usuarios').innerHTML = tabla(
      [
        { titulo: 'Usuario', render: (u) => celdaClave(u.usuario) },
        { titulo: 'Nombre', campo: 'nombre' },
        { titulo: 'Correo', campo: 'correo' },
        { titulo: 'Perfil', render: (u) => marca(u.rol === 'admin' ? 'info' : 'neutro', ROLES.find((r) => r.valor === u.rol)?.texto ?? u.rol) },
        { titulo: 'Ultimo acceso', render: (u) => fechaHora(u.ultimo_acceso), clase: 'fecha' },
        { titulo: 'Estado', render: (u) => marca(u.activo ? 'vigente' : 'neutro', u.activo ? 'Activo' : 'Inactivo') },
        {
          titulo: '',
          render: (u) => `<div class="acciones">
            <button class="boton boton--mini boton--icono" data-op="editar" data-id="${u.id}" title="Editar">${icono('editar', 'ico--sm')}</button>
            ${u.usuario === 'admin' ? '' : `<button class="boton boton--mini boton--icono boton--peligro" data-op="eliminar" data-id="${u.id}" title="Eliminar">${icono('eliminar', 'ico--sm')}</button>`}
          </div>`,
        },
      ],
      lista
    );
  }

  cont.innerHTML = `
    ${rotulo('Usuarios del sistema', 'Cuentas de acceso y perfiles de permisos.', `
      <button class="boton boton--primario" id="btn-nuevo">${icono('mas', 'ico--sm')} Nuevo usuario</button>`)}
    <div class="hoja" style="margin-bottom:14px">
      <h3 class="titulo-bloque">Reparto de modulos por perfil</h3>
      ${tabla(
        [
          { titulo: 'Modulo', render: (f) => `<strong>${esc(f.modulo)}</strong>` },
          { titulo: 'Jefe de Seguridad', render: (f) => (f.seguridad ? marca('vigente', 'Si') : marca('neutro', 'No')) },
          { titulo: 'Enc. de Documentacion', render: (f) => (f.documentacion ? marca('vigente', 'Si') : marca('neutro', 'No')) },
          { titulo: 'Administrador', render: (f) => (f.admin ? marca('info', 'Si') : marca('neutro', 'No')) },
        ],
        [
          { modulo: 'Panel, Vigencias y Alertas', seguridad: 1, documentacion: 1, admin: 1 },
          { modulo: 'Extintores', seguridad: 1, documentacion: 0, admin: 1 },
          { modulo: 'Equipo de Seguridad', seguridad: 1, documentacion: 0, admin: 1 },
          { modulo: 'Gafetes', seguridad: 0, documentacion: 1, admin: 1 },
          { modulo: 'Licencias de conducir', seguridad: 0, documentacion: 1, admin: 1 },
          { modulo: 'Personal', seguridad: 1, documentacion: 1, admin: 1 },
          { modulo: 'Usuarios, Configuracion y Bitacora', seguridad: 0, documentacion: 0, admin: 1 },
        ]
      )}
      <p class="texto-tenue" style="margin:12px 0 0;font-size:.8rem">
        Toda alerta critica llega por correo al trabajador dueno del elemento, al perfil
        encargado del modulo y siempre con copia al Administrador.
      </p>
    </div>
    <div id="tabla-usuarios"></div>`;

  const abrirForm = (u) => {
    const campos = [
      ...(u ? [] : [{ nombre: 'usuario', etiqueta: 'Nombre de acceso', requerido: true }]),
      { nombre: 'nombre', etiqueta: 'Nombre completo', requerido: true },
      { nombre: 'correo', etiqueta: 'Correo (recibe las alertas)', tipo: 'correo' },
      { nombre: 'rol', etiqueta: 'Perfil', tipo: 'select', requerido: true, opciones: ROLES },
      { nombre: 'activo', etiqueta: 'Estado', tipo: 'select', opciones: [{ valor: 1, texto: 'Activo' }, { valor: 0, texto: 'Inactivo' }] },
      { nombre: 'contrasena', etiqueta: u ? 'Nueva contrasena (opcional)' : 'Contrasena', tipo: 'contrasena', requerido: !u, ancho: 'completo' },
    ];
    abrirModal({
      titulo: u ? `Editar ${u.usuario}` : 'Nuevo usuario',
      contenido: formulario(campos, u ?? { rol: 'consulta', activo: 1 }),
      acciones: [
        { texto: 'Cancelar', alClic: (_c, cerrar) => cerrar() },
        {
          texto: 'Guardar',
          clase: 'boton--primario',
          alClic: async (capa, cerrar, boton) => {
            const datos = leerFormulario(capa);
            if (!datos) return;
            if (u && !datos.contrasena) delete datos.contrasena;
            boton.disabled = true;
            try {
              if (u) await api.actualizar(`/api/usuarios/${u.id}`, datos);
              else await api.crear('/api/usuarios', datos);
              cerrar();
              aviso('Usuario guardado.');
              await cargar();
            } catch (e) {
              aviso(e.message, 'error');
              boton.disabled = false;
            }
          },
        },
      ],
    });
  };

  cont.querySelector('#btn-nuevo').onclick = () => abrirForm(null);
  cont.addEventListener('click', async (e) => {
    const boton = e.target.closest('[data-op]');
    if (!boton) return;
    const u = cont.__filas.find((f) => f.id === Number(boton.dataset.id));
    if (boton.dataset.op === 'editar') return abrirForm(u);
    if (boton.dataset.op === 'eliminar') {
      const ok = await confirmar(`Se eliminara la cuenta "${u.usuario}".`);
      if (!ok) return;
      try {
        await api.eliminar(`/api/usuarios/${u.id}`);
        aviso('Usuario eliminado.');
        await cargar();
      } catch (err) {
        aviso(err.message, 'error');
      }
    }
  });

  await cargar();
}

/* ================================================================== */
/* Configuracion                                                       */
/* ================================================================== */

export async function configuracion(cont) {
  const [c, tipos] = await Promise.all([api.obtener('/api/configuracion'), api.obtener('/api/tipos-alerta')]);
  estado.configuracion = c;

  cont.innerHTML = `
    ${rotulo('Configuracion', 'Parametros de alertas y datos del centro de trabajo.')}
    <div class="rejilla rejilla--2">
      <div class="hoja hoja--acento">
        <h3 class="titulo-bloque">Centro de trabajo y correo</h3>
        <div id="form-config">
          ${formulario(
            [
              { nombre: 'nombre_centro', etiqueta: 'Centro de trabajo', ancho: 'completo' },
              { nombre: 'zona', etiqueta: 'Division / zona', ancho: 'completo' },
              { nombre: 'municipio', etiqueta: 'Municipio y estado', ancho: 'completo' },
              { nombre: 'area_responsable', etiqueta: 'Area responsable', ancho: 'completo' },
              { nombre: 'correo_administrador', etiqueta: 'Correo del administrador', tipo: 'correo', ancho: 'completo', ayuda: 'Recibe el concentrado de alertas.' },
              {
                nombre: 'notificar_por_correo',
                etiqueta: 'Envio de alertas por correo',
                tipo: 'select',
                ancho: 'completo',
                opciones: [{ valor: '0', texto: 'Desactivado (solo en el sistema)' }, { valor: '1', texto: 'Activado (requiere SMTP)' }],
              },
              { nombre: 'dias_proximos', etiqueta: 'Aviso previo general (dias)', tipo: 'numero', paso: '1', requerido: true, ayuda: 'Se usa cuando un elemento no tiene umbral propio.' },
              { nombre: 'dias_criticos', etiqueta: 'Critico general (dias)', tipo: 'numero', paso: '1', requerido: true },
            ],
            c
          )}
        </div>
        <button class="boton boton--primario" id="btn-guardar-config">Guardar cambios</button>
      </div>

      <div class="hoja hoja--acento">
        <h3 class="titulo-bloque">Anticipacion por tipo de elemento</h3>
        <p style="font-size:.82rem;color:var(--gris);margin-top:0">
          Cada elemento se avisa con su propia anticipacion. <b>Aviso previo</b> enciende el
          amarillo del semaforo y <b>critico</b> marca la urgencia maxima.
        </p>
        <div id="tabla-tipos"></div>
        <button class="boton boton--primario" id="btn-guardar-tipos" style="margin-top:14px">Guardar umbrales</button>
      </div>
    </div>

    <div class="rejilla rejilla--2" style="margin-top:14px">
      <div class="hoja hoja--acento">
        <h3 class="titulo-bloque">Motor de vencimientos</h3>
        <p style="font-size:.85rem;color:var(--gris);line-height:1.6;margin-top:0">
          Revisa los cinco elementos con fecha de caducidad (gafetes, extintores, botiquines,
          arneses y licencias de conducir) al arrancar el servidor y despues cada 6 horas,
          calculando los dias restantes desde la fecha de inicio hasta la de caducidad.
        </p>
        <ol style="font-size:.85rem;line-height:1.85;padding-left:18px;margin:0">
          <li>Dentro del <b>aviso previo</b> del tipo, el semaforo pasa a <b>amarillo</b>.</li>
          <li>Dentro del umbral <b>critico</b>, la alerta se marca como urgente.</li>
          <li>Pasada la fecha, el semaforo pasa a <b>rojo</b> (vencido).</li>
          <li>Cada alerta llega a la campana y, con el correo activado, al administrador.</li>
          <li>Al renovar un registro el ciclo reinicia con la fecha nueva.</li>
        </ol>
        <div class="alerta alerta--info" style="margin-bottom:0">
          Para el correo defina <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>
          y <code>SMTP_PASS</code> antes de iniciar el servidor.
        </div>
      </div>
    </div>

    <div class="hoja" style="margin-top:14px">
      <h3 class="titulo-bloque">Seguridad de la cuenta</h3>
      <div class="campo--doble" style="max-width:520px">
        <label class="campo"><span>Nueva contrasena</span><input type="password" id="nueva-contrasena" autocomplete="new-password" /></label>
        <label class="campo"><span>Confirmar</span><input type="password" id="confirmar-contrasena" autocomplete="new-password" /></label>
      </div>
      <button class="boton" id="btn-contrasena">Actualizar contrasena</button>
    </div>`;

  // Tabla editable de umbrales por tipo de elemento.
  cont.querySelector('#tabla-tipos').innerHTML = `
    <div class="matriz">
      <div class="matriz__fila matriz__fila--cabeza" style="grid-template-columns:1fr 92px 92px">
        <span>Tipo de elemento</span><span>Aviso previo</span><span>Critico</span>
      </div>
      ${tipos
        .map(
          (t) => `<div class="matriz__fila" style="grid-template-columns:1fr 92px 92px">
            <span class="matriz__nombre">${esc(t.nombre)}</span>
            <input type="number" min="1" max="365" value="${t.dias_proximo}" data-tipo="${esc(t.clave)}" data-campo="dias_proximo" />
            <input type="number" min="0" max="365" value="${t.dias_critico}" data-tipo="${esc(t.clave)}" data-campo="dias_critico" />
          </div>`
        )
        .join('')}
    </div>`;
  cont.querySelectorAll('#tabla-tipos input').forEach((i) => {
    i.style.cssText = 'width:100%;padding:5px 7px;border:1px solid var(--linea);font-family:var(--mono);font-size:.8rem;text-align:center';
  });

  cont.querySelector('#btn-guardar-tipos').onclick = async (e) => {
    const cuerpo = {};
    for (const entrada of cont.querySelectorAll('#tabla-tipos input')) {
      const clave = entrada.dataset.tipo;
      cuerpo[clave] = cuerpo[clave] ?? {};
      cuerpo[clave][entrada.dataset.campo] = Number(entrada.value);
    }
    e.target.disabled = true;
    try {
      estado.catalogos.tiposAlerta = await api.actualizar('/api/tipos-alerta', cuerpo);
      aviso('Umbrales por tipo de elemento actualizados.');
      await estado.refrescarEstado?.();
    } catch (err) {
      aviso(err.message, 'error');
    }
    e.target.disabled = false;
  };

  cont.querySelector('#btn-guardar-config').onclick = async (e) => {
    const datos = leerFormulario(cont.querySelector('#form-config'));
    if (!datos) return;
    e.target.disabled = true;
    try {
      estado.configuracion = await api.actualizar('/api/configuracion', datos);
      aviso('Configuracion actualizada.');
      document.getElementById('barra-centro').textContent = estado.configuracion.nombre_centro;
      await estado.refrescarEstado?.();
    } catch (err) {
      aviso(err.message, 'error');
    }
    e.target.disabled = false;
  };

  cont.querySelector('#btn-contrasena').onclick = async () => {
    const nueva = cont.querySelector('#nueva-contrasena').value;
    const confirmacion = cont.querySelector('#confirmar-contrasena').value;
    if (nueva.length < 6) return aviso('La contrasena debe tener al menos 6 caracteres.', 'error');
    if (nueva !== confirmacion) return aviso('Las contrasenas no coinciden.', 'error');
    try {
      await api.crear('/api/perfil/contrasena', { nueva });
      aviso('Contrasena actualizada.');
      cont.querySelector('#nueva-contrasena').value = '';
      cont.querySelector('#confirmar-contrasena').value = '';
    } catch (e) {
      aviso(e.message, 'error');
    }
  };
}

/* ================================================================== */
/* Bitacora                                                            */
/* ================================================================== */

export async function bitacora(cont) {
  const filas = await api.obtener('/api/bitacora');
  cont.innerHTML = `
    ${rotulo('Bitacora', 'Registro de auditoria de las operaciones del sistema.', btnExportar)}
    ${tabla(
      [
        { titulo: 'Fecha', render: (b) => fechaHora(b.fecha), clase: 'fecha' },
        { titulo: 'Usuario', render: (b) => celdaClave(b.usuario) },
        { titulo: 'Accion', render: (b) => marca('neutro', b.accion) },
        { titulo: 'Modulo', campo: 'modulo' },
        { titulo: 'Detalle', campo: 'detalle' },
      ],
      filas,
      'Bitacora vacia'
    )}`;
  cont.querySelector('#btn-exportar').onclick = () => descargarCSV('bitacora');
}
