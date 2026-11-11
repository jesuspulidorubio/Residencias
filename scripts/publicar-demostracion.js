/**
 * Publica la carpeta public/ en la rama gh-pages, que es la que sirve
 * GitHub Pages. No usa GitHub Actions: el publicador propio de Pages se
 * encarga del resto en cuanto la rama cambia.
 *
 *   npm run publicar
 *
 * El sitio queda en https://<usuario>.github.io/<repositorio>/
 */
import { execFileSync } from 'node:child_process';
import { RAIZ } from '../src/config.js';

const git = (...argumentos) =>
  execFileSync('git', argumentos, { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const gitSilencioso = (...argumentos) => {
  try {
    return git(...argumentos);
  } catch {
    return null;
  }
};

console.log('');
console.log('  Publicando la demostracion en la rama gh-pages');
console.log('  ---------------------------------------------');

// 1. No publicar trabajo a medias.
const pendientes = git('status', '--porcelain');
if (pendientes) {
  console.error('  Hay cambios sin confirmar. Haga commit antes de publicar:');
  console.error(pendientes.split('\n').map((l) => `      ${l}`).join('\n'));
  process.exit(1);
}

// 2. Construir la rama con el contenido de public/ como raiz del sitio.
gitSilencioso('branch', '-D', 'gh-pages');
const commit = git('subtree', 'split', '--prefix', 'public', '-b', 'gh-pages');
console.log(`  Rama construida: ${commit.slice(0, 7)}`);

const archivos = git('ls-tree', '-r', '--name-only', 'gh-pages').split('\n');
console.log(`  Archivos del sitio: ${archivos.length}`);
if (!archivos.includes('index.html')) {
  console.error('  Falta index.html en la raiz del sitio. Se cancela la publicacion.');
  process.exit(1);
}

// 3. Enviar a GitHub.
git('push', '--force', 'origin', 'gh-pages:gh-pages');

const remoto = git('remote', 'get-url', 'origin');
const coincidencia = remoto.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
const url = coincidencia
  ? `https://${coincidencia[1].toLowerCase()}.github.io/${coincidencia[2]}/`
  : 'la URL de GitHub Pages del repositorio';

console.log('');
console.log('  Demostracion publicada.');
console.log(`  ${url}`);
console.log('  GitHub tarda alrededor de un minuto en reflejar el cambio.');
console.log('');
