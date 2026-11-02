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

interface PerfilFabric {
  mainClass: string
  arguments?: { game?: Arg[]; jvm?: Arg[] }
  libraries: { name: string; url?: string; sha1?: string; size?: number }[]
}

export interface PerfilLoader {
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

// Descarga el perfil de Fabric y sus librerías. Si no hay internet, usa la copia guardada.
export async function asegurarFabric(
  mc: string,
  avisar: (p: Progreso) => void
): Promise<PerfilLoader> {
  const archivo = join(dirShared(), 'loaders', 'fabric', `${mc}.json`)
  let perfil: PerfilFabric

  avisar({ fase: 'Buscando Fabric', hecho: 0, total: 1 })
  try {
    const lista = await pedirJson<{ loader: { version: string; stable: boolean } }[]>(
      `${META}/${encodeURIComponent(mc)}`
    )
    const elegido = lista.find((x) => x.loader.stable) ?? lista[0]
    if (!elegido) throw new Error(`Fabric no soporta Minecraft ${mc}`)

    perfil = await pedirJson<PerfilFabric>(
      `${META}/${encodeURIComponent(mc)}/${encodeURIComponent(elegido.loader.version)}/profile/json`
    )
    await fs.mkdir(dirname(archivo), { recursive: true })
    await fs.writeFile(archivo, JSON.stringify(perfil))
  } catch (e) {
    try {
      perfil = JSON.parse(await fs.readFile(archivo, 'utf-8')) as PerfilFabric
    } catch {
      throw e
    }
  }

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
    mainClass: perfil.mainClass,
    jvm: perfil.arguments?.jvm ?? [],
    game: perfil.arguments?.game ?? [],
    libraries: libreras
  }
}