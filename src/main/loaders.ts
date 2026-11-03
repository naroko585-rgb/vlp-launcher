import { join, dirname } from 'path'
import { promises as fs } from 'fs'
import {
  descargarLote,
  dirShared,
  pedirJson,
  type Arg,
  type Libreria,
  type Pendiente,
  type Progreso
} from './descargas'

const META = 'https://meta.fabricmc.net/v2/versions/loader'
const NOMBRE_MAVEN = /^[\w.-]+:[\w.-]+:[\w.+-]+(:[\w.-]+)?$/
const VERSION_LOADER = /^[\w.+-]{1,40}$/
const VERSION_MC = /^\d+\.\d+(\.\d+)?$/

interface PerfilFabric {
  mainClass: string
  arguments?: { game?: Arg[]; jvm?: Arg[] }
  libraries: { name: string; url?: string; sha1?: string; size?: number }[]
}

export interface PerfilLoader {
  version: string
  mainClass: string
  jvm: Arg[]
  game: Arg[]
  libraries: Libreria[]
}

// Convierte "grupo:artefacto:version" en la ruta del .jar dentro de un repositorio Maven
function aLibreria(l: PerfilFabric['libraries'][number]): Libreria {
  if (!NOMBRE_MAVEN.test(l.name) || l.name.includes('..')) {
    throw new Error(`Librería con nombre sospechoso: ${l.name}`)
  }
  const [grupo, artefacto, version, clasificador] = l.name.split(':')
  const archivo = `${artefacto}-${version}${clasificador ? '-' + clasificador : ''}.jar`
  const path = `${grupo.replace(/\./g, '/')}/${artefacto}/${version}/${archivo}`

  const base = l.url ?? 'https://maven.fabricmc.net/'
  if (!base.startsWith('https://')) throw new Error(`Repositorio no seguro: ${base}`)

  return {
    name: l.name,
    downloads: {
      artifact: {
        path,
        url: base.endsWith('/') ? base + path : `${base}/${path}`,
        sha1: l.sha1 ?? '',
        size: l.size ?? 0
      }
    }
  }
}

async function leerCache(archivo: string): Promise<PerfilFabric | null> {
  try {
    return JSON.parse(await fs.readFile(archivo, 'utf-8')) as PerfilFabric
  } catch {
    return null
  }
}

// Sin internet y sin versión fija: usa la copia guardada más reciente
async function cacheMasReciente(
  dir: string,
  mc: string
): Promise<{ version: string; perfil: PerfilFabric } | null> {
  try {
    const prefijo = `${mc}-`
    const nombres = (await fs.readdir(dir))
      .filter((n) => n.startsWith(prefijo) && n.endsWith('.json'))
      .sort()
    const ultimo = nombres[nombres.length - 1]
    if (!ultimo) return null
    const perfil = await leerCache(join(dir, ultimo))
    return perfil ? { version: ultimo.slice(prefijo.length, -5), perfil } : null
  } catch {
    return null
  }
}

// Descarga el perfil de Fabric y sus librerías.
// Si se indica "fijada", usa exactamente esa versión del loader.
export async function asegurarFabric(
  mc: string,
  avisar: (p: Progreso) => void,
  fijada?: string
): Promise<PerfilLoader> {
  if (!VERSION_MC.test(mc)) throw new Error('Versión de Minecraft inválida')
  if (fijada && !VERSION_LOADER.test(fijada)) throw new Error('Versión de Fabric inválida')

  const dir = join(dirShared(), 'loaders', 'fabric')
  const archivoDe = (v: string): string => join(dir, `${mc}-${v}.json`)
  let perfil: PerfilFabric | null = null
  let version = fijada ?? ''

  avisar({ fase: 'Buscando Fabric', hecho: 0, total: 1 })

  if (fijada) perfil = await leerCache(archivoDe(fijada))

  if (!perfil) {
    try {
      if (!version) {
        const lista = await pedirJson<{ loader: { version: string; stable: boolean } }[]>(
          `${META}/${encodeURIComponent(mc)}`
        )
        const elegido = lista.find((x) => x.loader.stable) ?? lista[0]
        if (!elegido) throw new Error(`Fabric no soporta Minecraft ${mc}`)
        if (!VERSION_LOADER.test(elegido.loader.version)) throw new Error('Versión de Fabric inválida')
        version = elegido.loader.version
      }
      perfil = await pedirJson<PerfilFabric>(
        `${META}/${encodeURIComponent(mc)}/${encodeURIComponent(version)}/profile/json`
      )
      await fs.mkdir(dirname(archivoDe(version)), { recursive: true })
      await fs.writeFile(archivoDe(version), JSON.stringify(perfil))
    } catch (e) {
      if (!fijada) {
        const c = await cacheMasReciente(dir, mc)
        if (c) {
          perfil = c.perfil
          version = c.version
        }
      }
      if (!perfil) throw e
    }
  }
  if (!perfil) throw new Error('No se pudo obtener el perfil de Fabric')

  const libreras = perfil.libraries.map(aLibreria)
  const pendientes: Pendiente[] = libreras.map((l) => {
    const a = l.downloads!.artifact!
    return {
      url: a.url,
      sha1: a.sha1,
      size: a.size,
      destino: join(dirShared(), 'libraries', a.path!)
    }
  })
  await descargarLote(pendientes, 'Descargando Fabric', avisar)

  return {
    version,
    mainClass: perfil.mainClass,
    jvm: perfil.arguments?.jvm ?? [],
    game: perfil.arguments?.game ?? [],
    libraries: libreras
  }
}