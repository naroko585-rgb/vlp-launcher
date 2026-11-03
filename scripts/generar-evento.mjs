import { readFile, writeFile, readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { createHash } from 'node:crypto'

const dir = process.argv[2]
if (!dir) {
  console.error('Uso: node scripts/generar-evento.mjs <carpeta-del-evento>')
  process.exit(1)
}

const sha1 = (datos) => createHash('sha1').update(datos).digest('hex')

async function* recorrer(d) {
  for (const e of await readdir(d, { withFileTypes: true })) {
    const p = join(d, e.name)
    if (e.isDirectory()) yield* recorrer(p)
    else yield p
  }
}

const base = JSON.parse(await readFile(join(dir, 'evento.base.json'), 'utf-8'))
if (!base.baseUrl) {
  console.error('evento.base.json necesita "baseUrl" (URL pública de la carpeta "archivos")')
  process.exit(1)
}

const archivos = []

// 1. Archivos propios: todo lo que esté dentro de <carpeta>/archivos
const raiz = join(dir, 'archivos')
try {
  for await (const p of recorrer(raiz)) {
    const datos = await readFile(p)
    const ruta = relative(raiz, p).split(sep).join('/')
    const url = `${base.baseUrl.replace(/\/$/, '')}/${ruta.split('/').map(encodeURIComponent).join('/')}`
    archivos.push({ ruta, url, sha1: sha1(datos), size: datos.length })
  }
} catch (e) {
  if (e.code !== 'ENOENT') throw e
}

// 2. Archivos externos (por ejemplo, mods servidos desde cdn.modrinth.com)
for (const ext of base.externos ?? []) {
  const res = await fetch(ext.url)
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${ext.url}`)
  const datos = Buffer.from(await res.arrayBuffer())
  archivos.push({ ruta: ext.ruta, url: ext.url, sha1: sha1(datos), size: datos.length })
}

archivos.sort((a, b) => a.ruta.localeCompare(b.ruta))

const { baseUrl, externos, ...resto } = base
const manifiesto = { ...resto, archivos }
await writeFile(join(dir, 'manifiesto.json'), JSON.stringify(manifiesto, null, 2))

console.log(`Manifiesto generado: ${archivos.length} archivos, revisión ${manifiesto.revision}`)