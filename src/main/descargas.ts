import { app, ipcMain } from 'electron'
import { join, dirname } from 'path'
import { promises as fs } from 'fs'
import { createHash } from 'crypto'
import { obtenerManifest } from './minecraft'

export interface Regla {
  action: 'allow' | 'disallow'
  os?: { name?: string; arch?: string }
  features?: Record<string, boolean>
}

export interface Artefacto {
  path?: string
  url: string
  sha1: string
  size: number
}

export interface Libreria {
  name: string
  rules?: Regla[]
  downloads?: {
    artifact?: Artefacto
    classifiers?: Record<string, Artefacto>
  }
  natives?: Record<string, string>
}

export interface Pendiente {
  url: string
  sha1: string
  size: number
  destino: string
}

export type Arg = string | { rules?: Regla[]; value: string | string[] }

export interface VersionJson {
  id: string
  type: string
  mainClass: string
  javaVersion?: { component: string; majorVersion: number }
  arguments?: { game: Arg[]; jvm: Arg[] }
  minecraftArguments?: string
  downloads: { client: Artefacto }
  libraries: Libreria[]
  assetIndex: { id: string; url: string; sha1: string; size: number }
}

export interface Progreso {
  fase: string
  hecho: number
  total: number
}

export const dirShared = (): string => join(app.getPath('appData'), 'VLPLauncher', 'shared')

// Decide si una librería aplica a Windows x64
export function permitida(reglas?: Regla[]): boolean {
  if (!reglas) return true
  let ok = false
  for (const r of reglas) {
    const aplica =
      !r.features && (!r.os || ((!r.os.name || r.os.name === 'windows') && !r.os.arch))
    if (aplica) ok = r.action === 'allow'
  }
  return ok
}

async function sha1De(ruta: string): Promise<string> {
  return createHash('sha1')
    .update(await fs.readFile(ruta))
    .digest('hex')
}

async function yaValido(p: Pendiente): Promise<boolean> {
  try {
    const st = await fs.stat(p.destino)
    if (st.size !== p.size) return false
    return (await sha1De(p.destino)) === p.sha1
  } catch {
    return false
  }
}

async function descargarArchivo(p: Pendiente): Promise<void> {
  const res = await fetch(p.url)
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${p.url}`)
  const datos = Buffer.from(await res.arrayBuffer())
  const hash = createHash('sha1').update(datos).digest('hex')
  if (hash !== p.sha1) throw new Error(`SHA-1 incorrecto en ${p.url}`)
  await fs.mkdir(dirname(p.destino), { recursive: true })
  await fs.writeFile(p.destino, datos)
}

// Descarga una lista de archivos con varios hilos a la vez
export async function descargarLote(
  lista: Pendiente[],
  fase: string,
  avisar: (p: Progreso) => void
): Promise<void> {
  let hecho = 0
  let ultimo = 0
  const total = lista.length
  let indice = 0

  async function trabajador(): Promise<void> {
    while (indice < lista.length) {
      const p = lista[indice++]
      if (!(await yaValido(p))) {
        let intentos = 0
        for (;;) {
          try {
            await descargarArchivo(p)
            break
          } catch (e) {
            if (++intentos >= 3) throw e
          }
        }
      }
      hecho++
      const ahora = Date.now()
      if (ahora - ultimo > 150 || hecho === total) {
        ultimo = ahora
        avisar({ fase, hecho, total })
      }
    }
  }

  await Promise.all(Array.from({ length: 10 }, trabajador))
}

export async function pedirJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`)
  return (await res.json()) as T
}

const enCurso = new Set<string>()

export async function descargarVersion(
  idVersion: string,
  avisar: (p: Progreso) => void
): Promise<void> {
  const base = dirShared()

  // La URL sale del manifest oficial, nunca del interfaz
  const manifest = await obtenerManifest()
  const entrada = manifest.versions.find((v) => v.id === idVersion)
  if (!entrada) throw new Error(`Versión desconocida: ${idVersion}`)

  // 1. JSON de la versión
  avisar({ fase: 'Leyendo versión', hecho: 0, total: 1 })
  const json = await pedirJson<VersionJson>(entrada.url)
  const dirVersion = join(base, 'versions', idVersion)
  await fs.mkdir(dirVersion, { recursive: true })
  await fs.writeFile(join(dirVersion, `${idVersion}.json`), JSON.stringify(json))

  // 2. client.jar
  await descargarLote(
    [
      {
        url: json.downloads.client.url,
        sha1: json.downloads.client.sha1,
        size: json.downloads.client.size,
        destino: join(dirVersion, `${idVersion}.jar`)
      }
    ],
    'Descargando Minecraft',
    avisar
  )

  // 3. Librerías (incluye las nativas de Windows)
  const libs: Pendiente[] = []
  const vistas = new Set<string>()
  const anadir = (a: Artefacto | undefined): void => {
    if (!a || !a.path || vistas.has(a.path)) return
    vistas.add(a.path)
    libs.push({
      url: a.url,
      sha1: a.sha1,
      size: a.size,
      destino: join(base, 'libraries', a.path)
    })
  }

  for (const lib of json.libraries) {
    if (!permitida(lib.rules)) continue
    anadir(lib.downloads?.artifact)
    // Formato antiguo: natives en "classifiers"
    const clave = lib.natives?.windows?.replace('${arch}', '64')
    if (clave) anadir(lib.downloads?.classifiers?.[clave])
  }
  await descargarLote(libs, 'Descargando librerías', avisar)

  // 4. Assets
  const rutaIndice = join(base, 'assets', 'indexes', `${json.assetIndex.id}.json`)
  await descargarLote(
    [
      {
        url: json.assetIndex.url,
        sha1: json.assetIndex.sha1,
        size: json.assetIndex.size,
        destino: rutaIndice
      }
    ],
    'Descargando índice de assets',
    avisar
  )

  const indice = JSON.parse(await fs.readFile(rutaIndice, 'utf-8')) as {
    objects: Record<string, { hash: string; size: number }>
  }
  const assets: Pendiente[] = Object.values(indice.objects).map((o) => ({
    url: `https://resources.download.minecraft.net/${o.hash.slice(0, 2)}/${o.hash}`,
    sha1: o.hash,
    size: o.size,
    destino: join(base, 'assets', 'objects', o.hash.slice(0, 2), o.hash)
  }))
  await descargarLote(assets, 'Descargando assets', avisar)

  avisar({ fase: 'Listo', hecho: 1, total: 1 })
}

export function registrarDescargas(): void {
  ipcMain.handle('minecraft:descargar', async (evento, idVersion: string) => {
    if (typeof idVersion !== 'string') throw new Error('Versión inválida')
    if (enCurso.has(idVersion)) throw new Error('Esa versión ya se está descargando')
    enCurso.add(idVersion)
    try {
      await descargarVersion(idVersion, (p) => {
        if (!evento.sender.isDestroyed()) evento.sender.send('minecraft:progreso', idVersion, p)
      })
    } finally {
      enCurso.delete(idVersion)
    }
  })
}