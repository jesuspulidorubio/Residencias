/**
 * Enrutador minimo para la API (sin dependencias externas).
 * Soporta parametros dinamicos del tipo /api/gafetes/:id
 */
export class Router {
  constructor() {
    this.rutas = [];
  }

  agregar(metodo, patron, manejador, permiso = null) {
    const nombres = [];
    const expresion = new RegExp(
      `^${patron
        .split('/')
        .map((seg) => {
          if (seg.startsWith(':')) {
            nombres.push(seg.slice(1));
            return '([^/]+)';
          }
          return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        })
        .join('/')}$`
    );
    this.rutas.push({ metodo, expresion, nombres, manejador, permiso });
    return this;
  }

  get(p, h, permiso) {
    return this.agregar('GET', p, h, permiso);
  }
  post(p, h, permiso) {
    return this.agregar('POST', p, h, permiso);
  }
  put(p, h, permiso) {
    return this.agregar('PUT', p, h, permiso);
  }
  delete(p, h, permiso) {
    return this.agregar('DELETE', p, h, permiso);
  }

  buscar(metodo, ruta) {
    for (const r of this.rutas) {
      const m = ruta.match(r.expresion);
      if (!m) continue;
      if (r.metodo !== metodo) continue;
      const params = {};
      r.nombres.forEach((n, i) => (params[n] = decodeURIComponent(m[i + 1])));
      return { ...r, params };
    }
    return null;
  }
}
