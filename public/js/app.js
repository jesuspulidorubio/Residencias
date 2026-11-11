/**
 * Arranque de la aplicacion: acceso, navegacion entre vistas,
 * cinta de estado operativo y sesion del usuario.
 */
import { api, estado, esc, aviso, abrirModal, puede, esAdmin, formulario, leerFormulario, detectarModo } from './nucleo.js';
import * as vistas from './vistas.js';

const ROLES = {
  admin: 'Administrador',
  seguridad: 'Jefe de Seguridad',
  documentacion: 'Enc. de Documentacion',
  consulta: 'Consulta',
};
const VISTA_INICIAL = 'panel';

/* ============================ ARRANQUE ============================ */

document.getElementById('rail-fecha').textContent = new Date().toLocaleDateString('es-MX', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

function actualizarReloj() {
  document.getElementById('reloj').textContent = new Date().toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
actualizarReloj();
setInterval(actualizarReloj, 30000);

iniciar();

async function iniciar() {
  // Sin servidor Node detras, la aplicacion corre en modo demostracion.
  await detectarModo();

  if (estado.demostracion) {
    document.getElementById('nota-servidor').classList.add('oculto');
    document.getElementById('nota-demo').classList.remove('oculto');
    document.getElementById('cinta-demo').classList.remove('oculto');
    // En la demostracion la contrasena es igual al usuario.
    document.querySelectorAll('[data-cuenta]').forEach((boton) => {
      boton.onclick = () => {
        const f = document.getElementById('form-acceso');
        f.usuario.value = boton.dataset.cuenta;
        f.contrasena.value = boton.dataset.cuenta;
        f.requestSubmit();
      };
    });
  }

  try {
    const d = await api.obtener('/api/sesion');
    if (d.usuario) return await entrar(d.usuario);
  } catch {
    /* sin sesion activa */
  }
  document.getElementById('pantalla-acceso').classList.remove('oculto');
  document.getElementById('aplicacion').classList.add('oculto');
}

/* ============================ ACCESO ============================ */

document.getElementById('form-acceso').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const error = document.getElementById('error-acceso');
  const boton = form.querySelector('button');
  error.classList.add('oculto');
  boton.disabled = true;

  try {
    const d = await api.crear('/api/sesion/iniciar', {
      usuario: form.usuario.value,
      contrasena: form.contrasena.value,
    });
    form.reset();
    await entrar(d.usuario);
  } catch (err) {
    error.textContent = err.message;
    error.classList.remove('oculto');
  }
  boton.disabled = false;
});

async function entrar(usuario) {
  estado.usuario = usuario;
  document.getElementById('pantalla-acceso').classList.add('oculto');
  document.getElementById('aplicacion').classList.remove('oculto');

  document.getElementById('nombre-usuario').textContent = usuario.nombre;
  document.getElementById('rol-usuario').textContent = ROLES[usuario.rol] ?? usuario.rol;
  document.getElementById('avatar-usuario').textContent = usuario.nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  aplicarPermisos();

  const [catalogos, config] = await Promise.all([api.obtener('/api/catalogos'), api.obtener('/api/configuracion')]);
  estado.catalogos = catalogos;
  estado.configuracion = config;
  document.getElementById('barra-centro').textContent = config.nombre_centro;

  estado.refrescarEstado = actualizarCinta;
  await actualizarCinta();
  setInterval(actualizarCinta, 60000);

  navegar();
}

/* ============================ PERMISOS ============================ */

/**
 * Ajusta el menu al perfil en sesion:
 *   - [data-rol="admin"] solo para el Administrador
 *   - [data-modulo="x"]  solo si el perfil administra ese modulo
 * Si un perfil no tiene ningun elemento asignado, se oculta el encabezado
 * de la seccion para no dejar un titulo suelto.
 */
function aplicarPermisos() {
  document.querySelectorAll('[data-rol]').forEach((n) => n.classList.toggle('oculto', !esAdmin()));
  document.querySelectorAll('[data-modulo]').forEach((n) => n.classList.toggle('oculto', !puede(n.dataset.modulo)));

  const elementos = ['extintores', 'equipos', 'gafetes', 'licencias'];
  const hayElementos = elementos.some((m) => puede(m));
  document.querySelectorAll('[data-seccion="elementos"]').forEach((n) => n.classList.toggle('oculto', !hayElementos));
}

/* ==================== MENU COLAPSABLE ==================== */

// Preferencia visual de cada usuario, no un dato del sistema: se guarda en
// el navegador para que el menu conserve su forma entre sesiones.
const CLAVE_MENU = 'sigev-secciones-colapsadas';

function leerColapsadas() {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_MENU));
    return guardado && typeof guardado === 'object' ? guardado : {};
  } catch {
    return {};
  }
}

function guardarColapsadas(estadoSecciones) {
  try {
    localStorage.setItem(CLAVE_MENU, JSON.stringify(estadoSecciones));
  } catch {
    /* almacenamiento bloqueado: el menu sigue funcionando en esta sesion */
  }
}

function pintarSeccion(encabezado, grupo, colapsada) {
  encabezado.setAttribute('aria-expanded', String(!colapsada));
  grupo.classList.toggle('colapsado', colapsada);
  grupo.setAttribute('aria-hidden', String(colapsada));
}

/** Marca el encabezado cuando la vista abierta quedo dentro de una seccion cerrada. */
function marcarSeccionActiva() {
  document.querySelectorAll('.rail__grupo').forEach((grupo) => {
    const encabezado = document.querySelector(`.rail__seccion[data-grupo="${grupo.dataset.grupo}"]`);
    if (!encabezado) return;
    const contieneActiva = !!grupo.querySelector('a.activo');
    encabezado.classList.toggle('rail__seccion--activa', contieneActiva && grupo.classList.contains('colapsado'));
  });
}

function prepararMenu() {
  const colapsadas = leerColapsadas();

  document.querySelectorAll('.rail__seccion').forEach((encabezado) => {
    const clave = encabezado.dataset.grupo;
    const grupo = document.querySelector(`.rail__grupo[data-grupo="${clave}"]`);
    if (!grupo) return;

    pintarSeccion(encabezado, grupo, !!colapsadas[clave]);

    encabezado.addEventListener('click', () => {
      const colapsada = !grupo.classList.contains('colapsado');
      pintarSeccion(encabezado, grupo, colapsada);

      const actual = leerColapsadas();
      if (colapsada) actual[clave] = true;
      else delete actual[clave];
      guardarColapsadas(actual);

      marcarSeccionActiva();
    });
  });
}

prepararMenu();

/** Vistas que cualquier perfil puede abrir. */
const VISTAS_ABIERTAS = ['panel', 'vigencias', 'notificaciones'];

/** true si el perfil en sesion puede abrir la vista indicada. */
function vistaPermitida(nombre) {
  if (VISTAS_ABIERTAS.includes(nombre)) return true;
  if (['usuarios', 'configuracion', 'bitacora'].includes(nombre)) return esAdmin();
  return puede(nombre);
}

/* ============================ NAVEGACION ============================ */

window.addEventListener('hashchange', navegar);

async function navegar() {
  if (!estado.usuario) return;
  const [ruta, consulta = ''] = location.hash.replace('#/', '').split('?');
  const nombre = ruta || VISTA_INICIAL;
  const parametros = Object.fromEntries(new URLSearchParams(consulta));

  // Un perfil no puede abrir a mano una vista que no le corresponde.
  if (!vistas[nombre] || !vistaPermitida(nombre)) {
    if (nombre !== VISTA_INICIAL) {
      aviso('Su perfil no tiene acceso a esa seccion.', 'error');
      location.hash = `#/${VISTA_INICIAL}`;
      return;
    }
  }

  const vista = vistas[nombre] ?? vistas[VISTA_INICIAL];

  document.querySelectorAll('.rail a').forEach((a) => a.classList.toggle('activo', a.dataset.vista === nombre));
  marcarSeccionActiva();
  document.getElementById('rail').classList.remove('abierta');

  // Se reemplaza el contenedor para liberar los eventos de la vista anterior.
  const anterior = document.getElementById('contenido');
  const contenedor = anterior.cloneNode(false);
  anterior.replaceWith(contenedor);
  contenedor.innerHTML = '<div class="tabla-caja"><div class="vacio">Cargando</div></div>';

  try {
    await vista(contenedor, parametros);
  } catch (e) {
    if (e.codigo === 401) return location.reload();
    contenedor.innerHTML = `<div class="alerta alerta--error">No fue posible cargar la vista: ${esc(e.message)}</div>`;
  }
}

/* ==================== CINTA DE ESTADO Y CAMPANA ==================== */

async function actualizarCinta() {
  try {
    const d = await api.obtener('/api/resumen');
    for (const clave of ['vencido', 'critico', 'proximo', 'vigente']) {
      document.getElementById(`c-${clave}`).textContent = d.resumen[clave] ?? 0;
    }

    const insignia = document.getElementById('contador-notificaciones');
    insignia.textContent = d.sinLeer > 99 ? '99+' : d.sinLeer;
    insignia.classList.toggle('oculto', !d.sinLeer);

    const railAlertas = document.getElementById('rail-alertas');
    railAlertas.textContent = d.sinLeer;
    railAlertas.classList.toggle('oculto', !d.sinLeer);

    document.getElementById('cinta-sello').textContent = d.ultimaRevision
      ? `Ultima revision: ${d.ultimaRevision.slice(0, 16).replace(' ', ' · ')}`
      : 'Sin revisiones registradas';
    estado.notificaciones = d.sinLeer;
  } catch {
    /* la sesion pudo expirar */
  }
}

document.getElementById('btn-campana').onclick = () => (location.hash = '#/notificaciones');

document.getElementById('btn-revisar').onclick = async (e) => {
  const boton = e.currentTarget;
  boton.disabled = true;
  try {
    const r = await api.crear('/api/alertas/revisar');
    aviso(`Revision de vencimientos: ${r.generadas} alerta(s) nueva(s). Correo: ${r.correo}.`);
    await actualizarCinta();
    const actual = location.hash.replace('#/', '') || VISTA_INICIAL;
    if (actual === 'panel' || actual === 'notificaciones' || actual === 'vigencias') navegar();
  } catch (err) {
    aviso(err.message, 'error');
  }
  boton.disabled = false;
};

document.getElementById('btn-menu').onclick = () => document.getElementById('rail').classList.toggle('abierta');

/* ============================ MENU DE USUARIO ============================ */

const menuUsuario = document.getElementById('menu-usuario');
const desplegable = document.getElementById('menu-desplegable');

menuUsuario.addEventListener('click', (e) => {
  if (e.target.closest('[data-accion]')) return;
  desplegable.classList.toggle('abierto');
  e.stopPropagation();
});
document.addEventListener('click', () => desplegable.classList.remove('abierto'));

desplegable.addEventListener('click', async (e) => {
  const accion = e.target.closest('[data-accion]')?.dataset.accion;
  desplegable.classList.remove('abierto');

  if (accion === 'salir') {
    await api.crear('/api/sesion/cerrar');
    estado.usuario = null;
    location.hash = '';
    location.reload();
  }

  if (accion === 'contrasena') {
    abrirModal({
      titulo: 'Cambiar contrasena',
      ancho: 'modal--angosto',
      contenido: formulario([
        { nombre: 'nueva', etiqueta: 'Nueva contrasena', tipo: 'contrasena', requerido: true, ancho: 'completo' },
        { nombre: 'confirmar', etiqueta: 'Confirmar contrasena', tipo: 'contrasena', requerido: true, ancho: 'completo' },
      ]),
      acciones: [
        { texto: 'Cancelar', alClic: (_c, cerrar) => cerrar() },
        {
          texto: 'Guardar',
          clase: 'boton--primario',
          alClic: async (capa, cerrar) => {
            const datos = leerFormulario(capa);
            if (!datos) return;
            if (datos.nueva.length < 6) return aviso('La contrasena debe tener al menos 6 caracteres.', 'error');
            if (datos.nueva !== datos.confirmar) return aviso('Las contrasenas no coinciden.', 'error');
            try {
              await api.crear('/api/perfil/contrasena', { nueva: datos.nueva });
              cerrar();
              aviso('Contrasena actualizada.');
            } catch (err) {
              aviso(err.message, 'error');
            }
          },
        },
      ],
    });
  }
});
