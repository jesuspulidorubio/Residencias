/**
 * Arranca SIGEV escuchando en TODA la red local, no solo en este equipo.
 *
 *   npm run red
 *
 * La diferencia con `npm start` es la direccion de escucha: en lugar de
 * 127.0.0.1 (solo esta computadora) usa 0.0.0.0, de modo que cualquier
 * telefono o computadora conectada a la misma red puede abrir el sistema
 * en http://<IP-de-este-equipo>:3000
 *
 * Es el mismo sistema y la misma base de datos que `npm start`: cambia
 * unicamente quien puede alcanzarlo.
 */
process.env.HOST ??= '0.0.0.0';

await import('../server.js');
