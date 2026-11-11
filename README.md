# SIGEV — Página de Gestión y Monitoreo de Caducidades en Equipos y Documentos de Seguridad

Plataforma web para la **Comisión Federal de Electricidad, Zona Parral, Chihuahua**, que registra
y monitorea el **ciclo de vigencia completo** —de la fecha de inicio a la de caducidad— de los
elementos de seguridad y la documentación del personal operativo, y **avisa con anticipación**
al personal responsable antes de cada vencimiento.

Proyecto de residencia profesional · Ingeniería en Sistemas Computacionales ·
Instituto Tecnológico de Parral.

## Los cinco elementos que vigila

| Elemento | Fechas que controla | Aviso previo por omisión |
|---|---|---|
| **Gafetes de trabajo** | Emisión → vencimiento | 30 días (crítico 7) |
| **Extintores** | Recarga → próxima recarga · prueba hidrostática | 30 días (crítico 7) |
| **Botiquines de primeros auxilios** | Inicio → caducidad · revisión periódica | 30 días (crítico 7) |
| **Arneses de seguridad** | Inicio → caducidad · inspección periódica | 45 días (crítico 15) |
| **Licencias de conducir** | Expedición → vencimiento | 60 días (crítico 15) |

Cada tipo tiene **su propia anticipación de aviso**, configurable desde el sistema.

---

## 1. Requisitos y arranque

Solo se necesita **Node.js 22.5 o superior** (probado en Node 24). **No requiere `npm install`**:
el sistema usa únicamente módulos integrados de Node (servidor HTTP, base de datos SQLite y criptografía).

```bash
npm start
```

Después abra el navegador en **http://localhost:3000**

### Ponerlo en la red local

Para que el resto de las computadoras y teléfonos de la misma red lo usen:

```bash
npm run red
```

Es el mismo sistema y la misma base de datos; lo único que cambia es la dirección de escucha
(`0.0.0.0` en lugar de `127.0.0.1`). Al arrancar imprime la dirección exacta que hay que
escribir en los demás dispositivos:

```text
 En este equipo:  http://localhost:3000
 Desde otros dispositivos de la misma red:
   http://192.168.0.5:3000   (Wi-Fi)
```

Windows bloquea las conexiones entrantes, así que **una sola vez** hay que permitir el puerto
desde una consola **como administrador**:

```bash
netsh advfirewall firewall add rule name="SIGEV (puerto 3000)" dir=in action=allow protocol=TCP localport=3000 profile=any
```

En Windows también se puede encender con doble clic en `INICIAR-SIGEV.bat`. La guía completa
—instalar Node, primer arranque, firewall, respaldo y problemas comunes— está en
[`INSTALACION.txt`](INSTALACION.txt), escrita para seguirse desde la consola.

Para desarrollo con recarga automática:

```bash
npm run dev
```

Para ver el **modo demostración** tal como se publica en línea (sin servidor ni base de datos):

```bash
npm run demo
```

Para borrar la base de datos y volver a generarla con datos de demostración:

```bash
npm run reiniciar-bd
```

### Primer acceso

El repositorio **no contiene ninguna contraseña**. En el primer arranque el sistema crea la
cuenta `admin` y genera una contraseña aleatoria de 14 caracteres que se muestra **una sola vez**
en la consola del servidor:

```text
  ***********************************************************
   ACCESO INICIAL (se muestra una sola vez)
     Usuario:    admin
     Contrasena: ··············
  ***********************************************************
```

También queda una copia en `datos/acceso-inicial.txt` (carpeta excluida del repositorio por
`.gitignore`). **Entre al sistema, cambie la contraseña** desde el menú del usuario →
*Cambiar contraseña* y borre ese archivo.

Si prefiere definirla usted, exporte la variable antes del primer arranque:

```bash
set SIGEV_ADMIN_PASS=SuContrasenaSegura
npm start
```

Si esa contraseña se pierde, se restablece desde la consola **del propio equipo**:

```bash
npm run clave -- admin MiContrasenaNueva
```

Ejecutado sin datos (`npm run clave`) lista las cuentas registradas. Requiere acceso al archivo
de la base de datos, así que no puede usarse desde la red.

Las demás cuentas se crean desde el módulo **Usuarios** eligiendo su perfil.

### Perfiles y reparto de módulos

El acceso **no es jerárquico**: el Jefe de Seguridad y el Encargado de Documentación son pares
que atienden elementos distintos. El menú se arma según el perfil de quien entra.

| Sección del menú | Módulo | Jefe de Seguridad | Enc. de Documentación | Administrador |
|---|---|:--:|:--:|:--:|
| 01 · Operación | Panel, Vigencias, Alertas | ✔ | ✔ | ✔ |
| 02 · Elementos | Extintores | ✔ | — | ✔ |
| 02 · Elementos | Equipo de Seguridad | ✔ | — | ✔ |
| 02 · Elementos | Gafetes | — | ✔ | ✔ |
| 02 · Elementos | Licencias de conducir | — | ✔ | ✔ |
| 03 · Padrón | Personal | ✔ | ✔ | ✔ |
| 04 · Administración | Usuarios, Configuración, Bitácora | — | — | ✔ |

El permiso se comprueba **en el servidor**, no solo en la interfaz: si un perfil escribe a mano
la dirección de un módulo ajeno, la API responde 403 y el sistema lo regresa al Panel.

> El nombre del perfil **Encargado de Documentación** quedó pendiente de definir en el
> anteproyecto. Para cambiarlo basta con editar la tabla `ROLES` en `src/config.js`
> y su etiqueta en `public/js/app.js`.

---

## 2. Módulos del sistema

| Módulo | Qué controla | Fechas que vigila |
|---|---|---|
| **Panel** | Semáforo, reparto por tipo, línea de vencimientos y pendientes | — |
| **Vigencias** | Concentrado único de todo lo que caduca, con filtro por semáforo y por tipo | Todas |
| **Alertas** | Bandeja de avisos generados por el sistema | — |
| **Gafetes** | Credenciales del personal: folio, tipo y nivel de acceso | Emisión → vencimiento |
| **Extintores** | Agente, capacidad, ubicación y responsable | Recarga y prueba hidrostática |
| **Equipo de Seguridad** | Botiquines, arneses, EPP, herramienta aislada e instrumentos, con filtro por categoría | Inicio → caducidad y revisión periódica |
| **Licencias** | Licencias de conducir estatales y federales del personal | Expedición → vencimiento |
| **Personal** | Trabajadores (RPE, puesto, área, tipo de sangre, fotografía) | — |
| **Usuarios** | Cuentas de acceso y perfiles | — |
| **Configuración** | Anticipación por tipo, datos del centro y correo | — |
| **Bitácora** | Auditoría de todas las operaciones | — |

### Funciones destacadas

- **Semáforo de vigencias**: indicador de tres luces en el panel — rojo (vencido), amarillo
  (próximo a vencer) y verde (vigente) — con el conteo en vivo de cada color.
- **Línea de vencimientos**: los próximos 180 días en cuatro carriles (gafetes, extintores,
  equipo de seguridad y licencias) con un marcador por concepto.
- **Credencial imprimible**: en Gafetes → botón *Credencial* se genera el gafete con foto,
  RPE, puesto, tipo de sangre, folio, nivel de acceso y vigencia, listo para imprimir.
- **Acciones rápidas**: *Renovar* gafete (12 meses), *Recarga* de extintor (reprograma a 12
  meses), *Mantenimiento* de equipo y *Refrendo* de licencia (3 años); cada una reinicia el
  ciclo de avisos con la fecha nueva.
- **Filtro por categoría** en *Equipo de Seguridad*: junto al buscador, un desplegable con las
  cinco categorías vigentes (botiquín, arnés, EPP, herramienta aislada e instrumento de medición)
  acota la tabla sin necesidad de separar el módulo en varios. El material contra incendio no
  entra aquí: se registra en el módulo *Extintores*, que lleva su propio ciclo de recarga y
  prueba hidrostática. La lista vive en `CATEGORIAS_EQUIPO` (`src/config.js`) y la usan tanto los
  desplegables como la validación del servidor, así que no pueden divergir.
- **Menú lateral colapsable**: cada sección (01 · Operación, 02 · Elementos, 03 · Padrón,
  04 · Administración) se contrae y expande de forma independiente con su flecha, y el estado se
  recuerda entre sesiones en el navegador de cada usuario. Una sección cerrada nunca bloquea el
  acceso: si la vista abierta está dentro, su encabezado queda marcado en verde.
- **Exportación a CSV** (compatible con Excel) en cada módulo.
- **Fotografía del empleado**: se reduce en el navegador y se guarda en la base de datos.

---

## 3. Cómo funcionan las alertas de vencimiento

El motor de vigencias reúne **todos los conceptos con fecha** de los cinco elementos y los
clasifica con el semáforo, calculando los días restantes a partir del rango
*fecha de inicio → fecha de caducidad*:

| Semáforo | Situación | Regla |
|---|---|---|
| 🟢 **Verde** | Vigente | Falta más que la anticipación configurada para su tipo |
| 🟡 **Amarillo** | Próximo a vencer | Se entró en la anticipación del tipo (30, 45 o 60 días) |
| 🟡 **Amarillo** | Crítico | Se entró en el umbral de urgencia (7 o 15 días) |
| 🔴 **Rojo** | Vencido | La fecha ya pasó |

La anticipación **no es única**: cada tipo de elemento tiene la suya y se edita en
*Configuración → Anticipación por tipo de elemento*. Por ejemplo, una licencia de conducir
avisa con 60 días de anticipación y un extintor con 30.

La revisión se ejecuta:

1. Al **arrancar el servidor**.
2. **Cada 6 horas** de forma automática.
3. Cuando se presiona **⟳ Revisar vencimientos** (barra superior, panel o notificaciones).

Cada alerta nueva se guarda con una clave única
(`módulo : registro : concepto : fecha : nivel`), por lo que **no se duplican avisos**;
si el registro se renueva y cambia su fecha, el ciclo de avisos vuelve a iniciar.

Las alertas se muestran en la **campana** de la barra superior y en la vista de Notificaciones.

### Aviso por correo en cada umbral

Junto con la alerta interna, el sistema **envía un correo** cuando el elemento cruza uno de sus
umbrales de aviso. Los umbrales son los generales —**30, 15 y 7 días**, configurables— más los
propios de cada tipo de elemento (60 y 15 para licencias, 45 y 15 para arneses), y un aviso
adicional el día en que el elemento queda **vencido**.

Cada correo llega a tres destinos:

| Destinatario | Cómo se obtiene |
|---|---|
| El **trabajador** dueño o responsable del elemento | Correo capturado en su ficha de Personal |
| El **perfil encargado** del módulo | Jefe de Seguridad para extintores, botiquines y arneses; Encargado de Documentación para gafetes y licencias |
| El **Administrador**, siempre | Todas las cuentas con perfil Administrador, más el correo capturado en Configuración |

El mensaje incluye el nombre del trabajador, el tipo de elemento con su folio o código, la fecha
de vencimiento, los días restantes y un **enlace directo a la ficha del elemento** dentro del
sistema (`.../#/extintores?ficha=12`), que la abre en cuanto se inicia sesión.

El envío se engancha al mismo ciclo de revisión (arranque, cada 6 horas y el botón *Revisar
vencimientos*) y se apoya en la misma lógica de clave única: cada combinación de
`elemento + fecha + umbral` se envía **una sola vez**, aunque la revisión corra cada 6 horas.
El registro queda en la tabla `avisos_correo` con la lista de destinatarios y el resultado.

**Para activarlo en el servidor de producción:**

```bash
npm install nodemailer
```

```bash
set SMTP_HOST=smtp.cfe.mx
set SMTP_PORT=587
set SMTP_USER=alertas.parral@cfe.mx
set SMTP_PASS=la_contrasena
set SIGEV_URL=http://servidor-tics:3000
npm start
```

Después, en **Configuración**, active *Envío de alertas por correo* y capture el correo del
administrador. Las credenciales se leen de variables de entorno y **nunca se guardan en el
repositorio**; el punto exacto donde se configuran está marcado con un `TODO` en
`src/config.js` y en `src/alertas.js`.

Si no hay SMTP configurado, el sistema sigue operando con normalidad: registra el motivo en
`avisos_correo` y conserva las alertas en la bandeja interna.

---

## 4. Estructura del proyecto

```
Recidencias Pulido/
├── server.js              Servidor HTTP, archivos estáticos y manejo de errores
├── package.json
├── src/
│   ├── config.js          Parámetros (puerto, base de datos, SMTP, sesión)
│   ├── bd.js              Esquema SQLite, configuración y datos de demostración
│   ├── auth.js            Contraseñas (scrypt), sesiones y control de roles
│   ├── router.js          Enrutador de la API
│   ├── api.js             Servicios REST de todos los módulos
│   ├── vigencias.js       Motor que reúne y clasifica lo que caduca
│   ├── alertas.js         Generación de notificaciones y envío de correo
│   └── util.js            Fechas, validaciones y exportación CSV
├── public/
│   ├── index.html         Estructura y biblioteca de iconos SVG
│   ├── css/estilos.css    Tema institucional (verde CFE, negro y papel)
│   ├── img/
│   │   ├── cfe.png              Logotipo oficial a color (fondos claros)
│   │   ├── cfe-blanco.png       Logotipo oficial blanco (pantalla de acceso)
│   │   ├── cfe-marca-blanco.png Marca «CFE» blanca (barra y credencial)
│   │   └── favicon.svg
│   └── js/
│       ├── app.js         Acceso, navegación y cinta de estado
│       ├── nucleo.js      Cliente de la API y componentes reutilizables
│       ├── vistas.js      Pantallas de cada módulo
│       └── servidor-demo.js  Servidor simulado (solo para la demostración en línea)
├── INSTALACION.txt              Guía de instalación y puesta en marcha (consola)
├── INICIAR-SIGEV.bat            Enciende el servidor en red con doble clic
├── recursos/
│   └── logo-oficial-cfe.jpeg    Logotipo oficial del que se derivan los PNG
├── scripts/
│   ├── generar-logos.ps1        Genera las versiones transparentes del logotipo
│   ├── servidor-red.js          Arranque escuchando en toda la red local
│   ├── restablecer-clave.js     Restablece la contraseña de un usuario
│   ├── reiniciar-bd.js
│   ├── servidor-estatico.js     Prueba local del modo demostración
│   └── publicar-demostracion.js Publica public/ en la rama gh-pages
└── datos/
    └── sigev.db           Base de datos (se crea sola en el primer arranque)
```

### Modo demostración

El sistema real necesita Node y SQLite, así que **no puede ejecutarse en GitHub Pages**, que
solo sirve archivos estáticos. Para poder mostrar el sistema con un enlace, la aplicación
detecta al arrancar si hay un servidor detrás:

| | Con servidor (`npm start`) | Sin servidor (GitHub Pages) |
|---|---|---|
| Datos | SQLite en `datos/sigev.db` | `localStorage` del navegador |
| API | `src/api.js` sobre Node | `public/js/servidor-demo.js` |
| Sesión | Token en cookie HttpOnly | Simulada, con los tres perfiles |
| Correo | SMTP opcional | No disponible |
| Interfaz, semáforo y motor de vigencias | **Los mismos** | **Los mismos** |

Cuando corre sin servidor lo advierte en la pantalla de acceso y con una marca
**DEMOSTRACIÓN** en la cinta de estado, para que no se confunda con el sistema en operación.
Las vistas y los formularios no se duplican: solo se sustituye la capa que atiende la API.

**Demostración en línea:** https://blandoxs.github.io/Residencias-Pulido/

Se puede entrar con cualquiera de los tres perfiles para ver cómo cambia el menú. La contraseña
es igual al usuario: `admin` / `admin`, `seguridad` / `seguridad` y `documentacion` / `documentacion`.

Para republicarla después de cambiar la interfaz, con los cambios ya confirmados:

```bash
npm run publicar
```

El comando copia `public/` a la rama `gh-pages` —que es la que sirve GitHub Pages— y el
publicador propio de GitHub la despliega en aproximadamente un minuto. No usa GitHub Actions,
así que funciona aunque la cuenta no lo tenga disponible.

### Identidad gráfica

La interfaz sigue el color institucional de la CFE (verde `#00733F`, negro y papel) con un
lenguaje de **tablero de operación**: retícula estricta, líneas de 1 px, rotulación condensada
en mayúsculas, cifras monoespaciadas e iconos SVG propios (sin librerías externas).

El logotipo es el **oficial de la CFE**. Del archivo institucional (que viene sobre fondo claro)
se derivaron tres versiones con fondo transparente:

| Archivo | Versión | Dónde se usa |
|---|---|---|
| `public/img/cfe.png` | Color, logotipo completo | Fondos claros |
| `public/img/cfe-blanco.png` | Blanca, logotipo completo | Pantalla de acceso |
| `public/img/cfe-marca-blanco.png` | Blanca, solo la marca «CFE» | Barra superior y credencial |

En la barra superior y en la credencial se usa **solo la marca**, sin el renglón «Comisión Federal
de Electricidad»: a 27 px de altura ese texto quedaría ilegible. En la pantalla de acceso, donde
hay espacio, se muestra el logotipo completo con la razón social integrada, por lo que **no se
repite el nombre por separado**; junto al logotipo solo aparece «SIGEV», que es el nombre del
sistema, no de la institución.

Todas las vistas arman sus tablas con el mismo componente (`tabla()` en `public/js/nucleo.js`)
y su tamaño se define en un solo lugar: los tokens `--tabla-dato`, `--tabla-sub`,
`--tabla-encabezado`, `--tabla-celda` y `--tabla-fila` de `public/css/estilos.css`. Cambiar ahí
el cuerpo de letra, el relleno o el alto de fila ajusta por igual Extintores, Equipo de Seguridad,
Gafetes, Licencias, Personal, Vigencias, Usuarios y Bitácora, sin tocar cada vista.

La segunda línea de cada celda (RPE, ubicación, modelo, responsable) usa la clase `.sub`: más
chica que el dato principal para conservar la jerarquía, pero con contraste 7.7:1 sobre blanco
para leerse sin esfuerzo, y siempre en un solo renglón para que ninguna tabla quede más alta
que las demás.

El original institucional vive en `recursos/logo-oficial-cfe.jpeg`. Las tres versiones se
regeneran desde ahí —recorta el fondo, separa la marca de la razón social y escala— con:

```bash
powershell -File scripts/generar-logos.ps1
```

Si más adelante llega un archivo oficial actualizado, basta con reemplazar el de `recursos/` y
volver a ejecutar el script; no hay que tocar el código.

---

## 5. Modelo de datos

| Tabla | Contenido | Campos con vencimiento |
|---|---|---|
| `usuarios` | Cuentas de acceso (contraseña con scrypt + sal) | — |
| `sesiones` | Sesiones activas con caducidad | — |
| `empleados` | Personal: RPE, puesto, área, contacto, foto | — |
| `gafetes` | Folio, empleado, tipo, nivel de acceso, estado | `fecha_emision` → `fecha_vencimiento` |
| `extintores` | Código, agente, capacidad, ubicación, responsable | `fecha_recarga` → `fecha_prox_recarga`, `fecha_prox_hidrostatica` |
| `equipos` | Botiquines, arneses y demás equipo; `tipo_alerta` define su aviso | `fecha_inicio` → `fecha_vencimiento`, revisión por `frecuencia_meses` |
| `licencias` | Número, titular, tipo, ámbito, autoridad emisora, restricciones | `fecha_inicio` → `fecha_vencimiento` |
| `tipos_alerta` | Los cinco elementos con su anticipación (`dias_proximo`, `dias_critico`) | — |
| `notificaciones` | Alertas generadas, severidad y estado de lectura | — |
| `avisos_correo` | Correos ya enviados (elemento + fecha + umbral), destinatarios y resultado | — |

La categoría **"Insumo con caducidad"** se retiró del catálogo por ambigua: describía que el
elemento caducaba, no qué era. Al arrancar, el sistema reasigna los registros que la usaran a la
categoría que les corresponde según su tipo de alerta (botiquín, arnés o equipo contra incendio;
en cualquier otro caso, equipo de protección personal) y lo informa en la consola, de modo que
ningún registro queda con una categoría que ya no existe en el formulario.
| `configuracion` | Datos del centro de trabajo y correo | — |
| `bitacora` | Auditoría de altas, cambios, bajas y accesos | — |

---

## 6. Servicios de la API

Todas las rutas responden JSON y requieren sesión (cookie `sigev_sesion`, HttpOnly).

| Método y ruta | Rol mínimo | Descripción |
|---|---|---|
| `POST /api/sesion/iniciar` · `POST /api/sesion/cerrar` · `GET /api/sesion` | — | Control de acceso |
| `GET /api/panel` | consulta | Indicadores y gráficas del panel |
| `GET /api/vigencias?estado=&modulo=&q=` | consulta | Concentrado de vencimientos |
| `GET·POST·PUT·DELETE /api/empleados[/:id]` | consulta / supervisor | Personal |
| `GET·POST·PUT·DELETE /api/gafetes[/:id]` | consulta / supervisor | Gafetes |
| `GET /api/gafetes/:id/credencial` | consulta | Datos para imprimir la credencial |
| `GET·POST·PUT·DELETE /api/extintores[/:id]` | consulta / supervisor | Extintores |
| `GET·POST·PUT·DELETE /api/equipos[/:id]` | consulta / supervisor | Botiquines, arneses y demás equipo |
| `GET·POST·PUT·DELETE /api/licencias[/:id]` | consulta / supervisor | Licencias de conducir |
| `GET /api/tipos-alerta` · `PUT /api/tipos-alerta` | consulta / admin | Anticipación de aviso por tipo de elemento |
| `GET /api/resumen` | consulta | Semáforo y alertas sin leer (cinta de estado) |
| `GET /api/notificaciones` · `POST /api/notificaciones/:id/leer` · `POST /api/notificaciones/leer-todas` | consulta | Bandeja de alertas |
| `POST /api/alertas/revisar` | consulta | Ejecuta el motor de vencimientos |
| `GET·POST·PUT·DELETE /api/usuarios[/:id]` | admin | Cuentas del sistema |
| `GET·PUT /api/configuracion` | consulta / admin | Parámetros del sistema |
| `GET /api/bitacora` | admin | Auditoría |
| `GET /api/exportar/:modulo` | consulta | CSV de empleados, gafetes, extintores, equipos, vigencias o bitácora |

---

## 7. Seguridad

- **El repositorio no contiene credenciales**: la contraseña del administrador se genera de
  forma aleatoria en el primer arranque (o se toma de `SIGEV_ADMIN_PASS`), y la base de datos
  junto con `acceso-inicial.txt` están excluidas por `.gitignore`.
- Contraseñas almacenadas con **scrypt + sal aleatoria**; nunca en texto plano.
- Sesión mediante **token aleatorio de 256 bits** en cookie `HttpOnly` + `SameSite=Strict`,
  con caducidad de 8 horas (configurable con `SIGEV_HORAS_SESION`).
- **Tres perfiles** de permisos verificados en el servidor, no solo en la interfaz.
- Validación y saneamiento de todos los campos recibidos; consultas con parámetros
  (sin concatenar valores, evita inyección SQL).
- Escape de HTML en la interfaz para evitar inyección de código.
- **Bitácora** de accesos, altas, cambios y bajas.

---

## 8. Variables de entorno

| Variable | Valor por omisión | Uso |
|---|---|---|
| `PORT` | `3000` | Puerto del servidor |
| `HOST` | `127.0.0.1` | `0.0.0.0` lo abre a la red local (lo hace `npm run red`) |
| `SIGEV_BD` | `datos/sigev.db` | Ubicación de la base de datos |
| `SIGEV_HORAS_SESION` | `8` | Duración de la sesión |
| `SIGEV_HORAS_REVISION` | `6` | Frecuencia de la revisión automática |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SEGURO` | — | Servidor de correo saliente |

---

## 9. Respaldo

Toda la información vive en `datos/sigev.db`. Para respaldar, **detenga el servidor** y copie
la carpeta `datos/` completa (incluye los archivos `-wal` y `-shm`). Para restaurar, reemplácela
y vuelva a iniciar.

---

## 10. Correspondencia con el anteproyecto

| Compromiso del anteproyecto | Dónde se cumple |
|---|---|
| Registrar extintores, botiquines, arneses, licencias de conducir y gafetes | Módulos *Gafetes*, *Extintores*, *Equipo de Seguridad* y *Licencias* |
| Variables: número de empleado, nombre, tipo de elemento, fecha de inicio, fecha de caducidad y área de adscripción | Tabla `empleados` (RPE, nombre, departamento) y campos `fecha_inicio` / `fecha_vencimiento` de cada elemento |
| Interfaz web intuitiva para registrar, consultar y actualizar | Alta, cambio, baja y búsqueda en cada módulo, con acciones rápidas de renovación |
| Base de datos relacional | SQLite con 10 tablas y llaves foráneas (sección 5) |
| Cálculo automático de días restantes con base en el rango de fechas | `src/vigencias.js` — columna *Días* en Vigencias y en el panel |
| Notificaciones preventivas **configurables según el tipo de elemento** | Tabla `tipos_alerta`, editable en *Configuración → Anticipación por tipo de elemento* |
| Alertas automáticas que notifican con anticipación | `src/alertas.js`: revisión al arrancar y cada 6 h, campana, bandeja y correo opcional |
| Indicadores visuales de semáforo: verde, amarillo y rojo | Componente *Semáforo de vigencias* del panel y banderines en todas las tablas |
| Diseño responsivo en distintos dispositivos | Verificado en 1440 px y 375 px; el rail se convierte en menú lateral |
| Documentación técnica y manual de usuario | Este documento (secciones 1 a 9) |
