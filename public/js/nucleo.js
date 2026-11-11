/**
 * Nucleo del cliente: comunicacion con la API, utilerias de formato,
 * componentes reutilizables (tablas, modales, formularios y avisos).
 */

import { estadoEfectivo, sumarDias } from './reglas.js';

export const estado = {
  usuario: null,
  catalogos: null,
  configuracion: {},
  notificaciones: 0,
  /** true cuando la aplicacion corre sin servidor (GitHub Pages). */
  demostracion: false,
};

/* ==================== MODO DEMOSTRACION ==================== */

let servidorDemo = null;

/**
 * Comprueba si hay un servidor Node detras. Si no lo hay —por ejemplo al
 * publicar la carpeta public/ en GitHub Pages— carga el servidor simulado
 * que reimplementa la API dentro del navegador.
 */
export async function detectarModo() {
  try {
    const r = await fetch('/api/sesion', { headers: { Accept: 'application/json' } });
    if ((r.headers.get('content-type') ?? '').includes('application/json')) {
      estado.demostracion = false;
      return false;
    }
  } catch {
    /* sin servidor */
  }
  servidorDemo = await import('./servidor-demo.js');
  estado.demostracion = true;
  return true;
}

/**
 * Permisos por modulo, no por jerarquia: el Jefe de Seguridad y el
 * Encargado de Documentacion son pares que atienden modulos distintos.
 */
export function puede(modulo) {
  return (estado.usuario?.modulos ?? []).includes(modulo);
}

/** Solo el Administrador entra a Usuarios, Configuracion y Bitacora. */
export function esAdmin() {
  return estado.usuario?.rol === 'admin';
}

/* ============================ API ============================ */

async function peticion(metodo, ruta, cuerpo) {
  // En modo demostracion la peticion la atiende el servidor simulado.
  if (estado.demostracion && servidorDemo) {
    try {
      return await servidorDemo.atender(metodo, ruta, cuerpo ?? {});
    } catch (fallo) {
      const error = new Error(fallo?.mensaje ?? 'Error en la demostracion');
      error.codigo = fallo?.codigo ?? 500;
      throw error;
    }
  }

  const respuesta = await fetch(ruta, {
    method: metodo,
    headers: cuerpo ? { 'Content-Type': 'application/json' } : {},
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });

  const tipo = respuesta.headers.get('content-type') ?? '';
  if (!tipo.includes('application/json')) {
    if (!respuesta.ok) throw new Error(`Error ${respuesta.status}`);
    return respuesta.text();
  }

  const datos = await respuesta.json();
  if (!respuesta.ok) {
    const error = new Error(datos.error ?? 'Error inesperado');
    error.codigo = respuesta.status;
    throw error;
  }
  return datos;
}

export const api = {
  obtener: (ruta) => peticion('GET', ruta),
  crear: (ruta, cuerpo) => peticion('POST', ruta, cuerpo ?? {}),
  actualizar: (ruta, cuerpo) => peticion('PUT', ruta, cuerpo),
  eliminar: (ruta) => peticion('DELETE', ruta),
};

/**
 * Descarga el CSV de un modulo. Con servidor navega al servicio de
 * exportacion; en la demostracion genera el archivo en el navegador.
 */
export function descargarCSV(modulo) {
  if (!estado.demostracion) {
    window.location.href = `/api/exportar/${modulo}`;
    return;
  }
  const contenido = servidorDemo?.exportarCSV(modulo);
  if (!contenido) return aviso('Ese modulo no se puede exportar en la demostracion.', 'error');

  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }));
  enlace.download = `${modulo}_${hoy()}.csv`;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 4000);
}

/** Reinicia los datos de la demostracion. */
export function reiniciarDemostracion() {
  servidorDemo?.reiniciarDemostracion();
}

/* ============================ FORMATO ============================ */

export function esc(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** AAAA-MM-DD -> DD/MM/AAAA */
export function fecha(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export function fechaHora(texto) {
  if (!texto) return '—';
  const [f, h = ''] = String(texto).split(' ');
  return `${fecha(f)} ${h.slice(0, 5)}`.trim();
}

export function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function diasEntre(iso) {
  if (!iso) return null;
  return Math.round((new Date(`${iso.slice(0, 10)}T00:00:00`) - new Date(`${hoy()}T00:00:00`)) / 86400000);
}

const ETIQUETAS = {
  vencido: 'Vencido',
  critico: 'Critico',
  proximo: 'Por vencer',
  vigente: 'Vigente',
  sin_fecha: 'Sin fecha',
};

/** Icono de la biblioteca incluida en index.html. */
export function icono(nombre, clase = '') {
  return `<svg class="ico ${clase}" aria-hidden="true"><use href="#i-${nombre}"></use></svg>`;
}

/** Colores del semaforo del anteproyecto. */
export const SEMAFORO = { vigente: 'verde', proximo: 'amarillo', critico: 'amarillo', vencido: 'rojo', sin_fecha: 'gris' };

/**
 * Clasifica una fecha usando la anticipacion configurada para SU tipo de
 * elemento (gafete, extintor, botiquin, arnes, licencia o equipo).
 */
export function clasificar(iso, tipo = null) {
  const dias = diasEntre(iso);
  if (dias === null) return { clase: 'sin_fecha', dias: null, texto: 'Sin fecha', semaforo: 'gris' };

  const t = (estado.catalogos?.tiposAlerta ?? []).find((x) => x.clave === tipo);
  const critico = t ? t.dias_critico : Number(estado.configuracion.dias_criticos ?? 7);
  const proximo = t ? t.dias_proximo : Number(estado.configuracion.dias_proximos ?? 30);

  const salida =
    dias < 0
      ? { clase: 'vencido', texto: `Vencido hace ${Math.abs(dias)} d` }
      : dias <= critico
        ? { clase: 'critico', texto: dias === 0 ? 'Vence hoy' : `${dias} d` }
        : dias <= proximo
          ? { clase: 'proximo', texto: `${dias} d` }
          : { clase: 'vigente', texto: `${dias} d` };

  return { ...salida, dias, semaforo: SEMAFORO[salida.clase] };
}

/** Banderin de estado: cuadro de color + rotulacion tecnica. */
export function marca(clase, texto) {
  return `<span class="marca marca--${esc(clase)}">${esc(texto ?? ETIQUETAS[clase] ?? clase)}</span>`;
}

/** Banderin calculado a partir de una fecha de vencimiento y su tipo. */
export function marcaFecha(iso, tipo = null) {
  const c = clasificar(iso, tipo);
  return marca(c.clase, c.texto);
}

/* ============================ AVISOS ============================ */

export function aviso(mensaje, tipo = 'exito') {
  const caja = document.getElementById('avisos');
  const nodo = document.createElement('div');
  nodo.className = `aviso aviso--${tipo}`;
  nodo.textContent = mensaje;
  caja.appendChild(nodo);
  setTimeout(() => {
    nodo.style.opacity = '0';
    nodo.style.transition = 'opacity .3s';
    setTimeout(() => nodo.remove(), 300);
  }, 3800);
}

/* ============================ MODAL ============================ */

let cerrarActual = null;

export function abrirModal({ titulo, contenido, acciones = [], ancho = '' }) {
  const capa = document.getElementById('capa-modal');
  capa.innerHTML = `
    <div class="modal ${ancho}">
      <div class="modal__barra">
        <h3>${esc(titulo)}</h3>
        <button class="modal__cerrar" data-cerrar aria-label="Cerrar">${icono('cerrar')}</button>
      </div>
      <div class="modal__cuerpo">${contenido}</div>
      ${acciones.length ? `<div class="modal__pie">${acciones.map((a, i) =>
        `<button class="boton ${a.clase ?? ''}" data-accion="${i}">${esc(a.texto)}</button>`).join('')}</div>` : ''}
    </div>`;
  capa.classList.remove('oculto');

  const cerrar = () => {
    capa.classList.add('oculto');
    capa.innerHTML = '';
    cerrarActual = null;
  };
  cerrarActual = cerrar;

  capa.querySelector('[data-cerrar]').onclick = cerrar;
  capa.onclick = (e) => {
    if (e.target === capa) cerrar();
  };
  acciones.forEach((a, i) => {
    const boton = capa.querySelector(`[data-accion="${i}"]`);
    if (boton) boton.onclick = () => a.alClic?.(capa, cerrar, boton);
  });

  return { capa, cerrar, cuerpo: capa.querySelector('.modal__cuerpo') };
}

export function cerrarModal() {
  cerrarActual?.();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') cerrarModal();
});

/** Cuadro de confirmacion. */
export function confirmar(mensaje, textoBoton = 'Eliminar') {
  return new Promise((resolve) => {
    abrirModal({
      titulo: 'Confirmar operacion',
      icono: '⚠️',
      ancho: 'modal--angosto',
      contenido: `<p style="margin:0">${esc(mensaje)}</p>`,
      acciones: [
        { texto: 'Cancelar', alClic: (_c, cerrar) => { cerrar(); resolve(false); } },
        { texto: textoBoton, clase: 'boton--peligro', alClic: (_c, cerrar) => { cerrar(); resolve(true); } },
      ],
    });
  });
}

/**
 * Cuadro que pide capturar una fecha antes de confirmar una operacion
 * (renovar, refrendo, recarga, mantenimiento, etc). Viene prellenado con
 * hoy() pero se puede cambiar libremente. Devuelve la fecha elegida
 * (formato aaaa-mm-dd) o null si se cancela.
 */
export function pedirFecha({
  titulo = 'Confirmar operacion',
  mensaje = '',
  etiqueta = 'Fecha',
  valorInicial = hoy(),
  textoBoton = 'Registrar',
} = {}) {
  return new Promise((resolve) => {
    const { capa } = abrirModal({
      titulo,
      ancho: 'modal--angosto',
      contenido: `
        <p style="margin:0 0 14px">${esc(mensaje)}</p>
        <label class="campo">
          <span>${esc(etiqueta)}</span>
          <input type="date" id="campo-fecha-modal" value="${esc(valorInicial)}" />
        </label>`,
      acciones: [
        { texto: 'Cancelar', alClic: (_c, cerrar) => { cerrar(); resolve(null); } },
        {
          texto: textoBoton,
          clase: 'boton--primario',
          alClic: (c, cerrar) => {
            const valor = c.querySelector('#campo-fecha-modal')?.value;
            if (!valor) return;
            cerrar();
            resolve(valor);
          },
        },
      ],
    });
    setTimeout(() => capa.querySelector('#campo-fecha-modal')?.focus(), 50);
  });
}

/**
 * Version general de pedirFecha: uno o varios campos de fecha, cada uno con
 * su rango (min / max como atributos HTML del input) y una validacion final.
 *
 * campos:  [{ nombre, etiqueta, valor, min, max, ayuda }]
 * validar: (valores) => mensaje de error | null. Si devuelve texto, el cuadro
 *          se queda abierto y lo muestra para que el usuario corrija.
 * Devuelve { nombre: 'aaaa-mm-dd', ... } o null si se cancela.
 */
export function pedirFechas({ titulo, mensaje = '', campos, textoBoton = 'Registrar', validar } = {}) {
  return new Promise((resolve) => {
    const { capa } = abrirModal({
      titulo,
      ancho: 'modal--angosto',
      contenido: `
        <p style="margin:0 0 14px">${esc(mensaje)}</p>
        ${campos
          .map(
            (c) => `<label class="campo">
              <span>${esc(c.etiqueta)} *</span>
              <input type="date" data-fecha="${esc(c.nombre)}" value="${esc(c.valor ?? '')}"
                ${c.min ? `min="${esc(c.min)}"` : ''} ${c.max ? `max="${esc(c.max)}"` : ''} required />
              ${c.ayuda ? `<small class="texto-tenue">${esc(c.ayuda)}</small>` : ''}
            </label>`
          )
          .join('')}`,
      acciones: [
        { texto: 'Cancelar', alClic: (_c, cerrar) => { cerrar(); resolve(null); } },
        {
          texto: textoBoton,
          clase: 'boton--primario',
          alClic: (c, cerrar) => {
            const valores = {};
            for (const input of c.querySelectorAll('[data-fecha]')) valores[input.dataset.fecha] = input.value;
            if (Object.values(valores).some((v) => !v)) return aviso('Captura todas las fechas.', 'error');
            const error = validar?.(valores);
            if (error) return aviso(error, 'error');
            cerrar();
            resolve(valores);
          },
        },
      ],
    });
    setTimeout(() => capa.querySelector('[data-fecha]')?.focus(), 50);
  });
}

/** Banderin del ESTADO de un registro, calculado con sus fechas (ver reglas.js). */
export function marcaEstado(modulo, registro) {
  const e = estadoEfectivo(modulo, registro);
  return marca(e.clase, e.texto);
}

/**
 * Bloquea en el calendario los dias invalidos segun las fechas ya elegidas
 * (reglas: ver CALENDARIO en reglas.js). Se recalcula al cambiar cualquier
 * fecha del formulario, por ejemplo al elegir la expedicion de una licencia el
 * calendario del vencimiento deja de permitir ese dia y los anteriores.
 */
export function enlazarCalendario(contenedor, reglas = [], noFuturas = []) {
  const entrada = (n) => contenedor.querySelector(`input[name="${n}"]`);
  const valor = (n) => entrada(n)?.value || '';
  const fijar = (el, atributo, v) => (v ? el.setAttribute(atributo, v) : el.removeAttribute(atributo));

  const aplicar = () => {
    for (const r of reglas) {
      const el = entrada(r.campo);
      if (!el) continue;
      if (r.despuesDe) fijar(el, 'min', valor(r.despuesDe) && sumarDias(valor(r.despuesDe), 1));
      else if (r.noAntesDe) fijar(el, 'min', valor(r.noAntesDe));
      if (r.noDespuesDe) fijar(el, 'max', valor(r.noDespuesDe));
    }
    for (const n of noFuturas) {
      const el = entrada(n);
      if (el) el.setAttribute('max', hoy());
    }
  };

  contenedor.querySelectorAll('input[type="date"]').forEach((el) => el.addEventListener('change', aplicar));
  aplicar();
}

/**
 * Valida que un conjunto de fechas respete el orden logico esperado.
 *
 * reglas: [{ origen, destino, mensaje }]
 *   origen  = campo cuya fecha manda (la anterior en el tiempo)
 *   destino = campo que no puede ser anterior al origen
 *
 * Solo compara cuando ambas fechas vienen capturadas: los campos vacios
 * u opcionales se dejan pasar para no estorbar en altas parciales.
 * Devuelve el mensaje del primer error encontrado, o null si todo esta bien.
 */
export function validarOrdenFechas(datos, reglas = []) {
  for (const { origen, destino, mensaje } of reglas) {
    const a = datos[origen];
    const b = datos[destino];
    if (!a || !b) continue;
    if (String(b) < String(a)) return mensaje;
  }
  return null;
}

/* ============================ TABLAS ============================ */

/**
 * Genera una tabla.
 * columnas: [{ titulo, campo | render(fila), clase }]
 */
export function tabla(columnas, filas, mensajeVacio = 'No hay registros para mostrar.') {
  if (!filas.length) return `<div class="tabla-caja"><div class="vacio">${esc(mensajeVacio)}</div></div>`;
  const cabeza = columnas.map((c) => `<th class="${c.clase ?? ''}">${esc(c.titulo)}</th>`).join('');
  const cuerpo = filas
    .map(
      (f, i) =>
        `<tr data-fila="${i}">${columnas
          .map((c) => `<td class="${c.clase ?? ''}">${c.render ? c.render(f, i) : esc(f[c.campo])}</td>`)
          .join('')}</tr>`
    )
    .join('');
  return `<div class="tabla-caja"><table class="tabla"><thead><tr>${cabeza}</tr></thead><tbody>${cuerpo}</tbody></table></div>`;
}

/* ============================ FORMULARIOS ============================ */

/**
 * Construye el HTML de un formulario.
 * campos: [{ nombre, etiqueta, tipo, opciones, requerido, ancho, ayuda, paso }]
 * tipos: texto | numero | fecha | correo | select | textarea | foto | contrasena
 */
export function formulario(campos, valores = {}) {
  const control = (c) => {
    const v = valores[c.nombre] ?? c.porDefecto ?? '';
    const req = c.requerido ? 'required' : '';
    switch (c.tipo) {
      case 'select':
        return `<select name="${c.nombre}" ${req}>
          ${c.permiteVacio ? `<option value="">— Seleccione —</option>` : ''}
          ${(c.opciones ?? [])
            .map((o) => {
              const valor = typeof o === 'object' ? o.valor : o;
              const texto = typeof o === 'object' ? o.texto : o;
              return `<option value="${esc(valor)}" ${String(valor) === String(v) ? 'selected' : ''}>${esc(texto)}</option>`;
            })
            .join('')}
        </select>`;
      case 'textarea':
        return `<textarea name="${c.nombre}" ${req}>${esc(v)}</textarea>`;
      case 'numero':
        return `<input type="number" name="${c.nombre}" value="${esc(v)}" step="${c.paso ?? 'any'}" min="${c.min ?? 0}" ${req} />`;
      case 'fecha':
        return `<input type="date" name="${c.nombre}" value="${esc(String(v).slice(0, 10))}" ${c.min ? `min="${esc(c.min)}"` : ''} ${c.max ? `max="${esc(c.max)}"` : ''} ${req} />`;
      case 'correo':
        return `<input type="email" name="${c.nombre}" value="${esc(v)}" ${req} />`;
      case 'contrasena':
        return `<input type="password" name="${c.nombre}" value="" ${req} autocomplete="new-password" />`;
      case 'foto':
        return `<div class="campo--doble" style="align-items:center">
            <input type="file" name="${c.nombre}_archivo" accept="image/*" data-foto="${c.nombre}" />
            <div class="credencial__foto" data-vista-previa="${c.nombre}">
              ${v ? `<img src="${esc(v)}" alt="foto" />` : icono('personal')}
            </div>
            <input type="hidden" name="${c.nombre}" value="${esc(v)}" />
          </div>`;
      default:
        return `<input type="text" name="${c.nombre}" value="${esc(v)}" ${req} maxlength="${c.max ?? 300}" />`;
    }
  };

  return `<form class="formulario__rejilla" autocomplete="off">
    ${campos
      .map(
        (c) => `<label class="campo ${c.ancho === 'completo' ? 'formulario__ancho' : ''}">
          <span>${esc(c.etiqueta)}${c.requerido ? ' *' : ''}</span>
          ${control(c)}
          ${c.ayuda ? `<small class="texto-tenue">${esc(c.ayuda)}</small>` : ''}
        </label>`
      )
      .join('')}
  </form>`;
}

/** Activa la carga de fotografias (se reduce y convierte a base64). */
export function activarFotos(contenedor) {
  contenedor.querySelectorAll('[data-foto]').forEach((entrada) => {
    entrada.addEventListener('change', () => {
      const archivo = entrada.files?.[0];
      if (!archivo) return;
      const lector = new FileReader();
      lector.onload = () => {
        const img = new Image();
        img.onload = () => {
          const lienzo = document.createElement('canvas');
          const escala = Math.min(1, 320 / Math.max(img.width, img.height));
          lienzo.width = Math.round(img.width * escala);
          lienzo.height = Math.round(img.height * escala);
          lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
          const datos = lienzo.toDataURL('image/jpeg', 0.8);
          const campo = entrada.dataset.foto;
          contenedor.querySelector(`input[name="${campo}"]`).value = datos;
          contenedor.querySelector(`[data-vista-previa="${campo}"]`).innerHTML = `<img src="${datos}" alt="foto" />`;
        };
        img.src = lector.result;
      };
      lector.readAsDataURL(archivo);
    });
  });
}

/** Lee los valores de un formulario generado con formulario(). */
export function leerFormulario(contenedor) {
  const form = contenedor.querySelector('form');
  if (!form.reportValidity()) return null;
  const datos = {};
  for (const [clave, valor] of new FormData(form).entries()) {
    if (clave.endsWith('_archivo')) continue;
    datos[clave] = valor;
  }
  return datos;
}

/* ============================ TABLA: CELDAS ============================ */

/** Celda de clave (folio, codigo, RPE) con subtitulo opcional. */
export function celdaClave(valor, subtitulo) {
  return `<span class="clave-fila">${esc(valor)}</span>${
    subtitulo ? `<span class="sub" title="${esc(subtitulo)}">${esc(subtitulo)}</span>` : ''
  }`;
}
