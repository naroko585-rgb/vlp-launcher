
import { ipcMain } from 'electron'
import { join, resolve, sep, delimiter } from 'path'
import { promises as fs } from 'fs'
import { spawn, type ChildProcess } from 'child_process'
import { createHash } from 'crypto'
import { asegurarFabric } from './loaders'
import {
  type Arg,
  type Pendiente,
  type Progreso,
  type VersionJson,
  descargarLote,
  descargarVersion,
  dirShared,
  permitida,
  pedirJson
} from './descargas'
import { leerInstancia, rutaInstancia } from './instances'


const URL_RUNTIMES =
  'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json'

interface Descarga {
  url: string
  sha1: string
  size: number
}
interface ManifestRuntime {
  files: Record<string, { type: string; downloads?: { raw?: Descarga } }>
}

const JVM_ANTIGUO: Arg[] = [
  '-Djava.library.path=${natives_directory}',
  '-Dminecraft.launcher.brand=${launcher_name}',
  '-Dminecraft.launcher.version=${launcher_version}',
  '-cp',
  '${classpath}'
]

const procesos = new Map<string, ChildProcess>()

// UUID de jugador sin conexión (igual que el de un servidor offline)
function uuidOffline(nombre: string): string {
  const h = createHash('md5').update(`OfflinePlayer:${nombre}`).digest()
  h[6] = (h[6] & 0x0f) | 0x30
  h[8] = (h[8] & 0x3f) | 0x80
  const x = h.toString('hex')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`
}

// Descarga el Java de Mojang si no está. Devuelve la ruta de java.exe
async function asegurarJava(
  componente: string,
  avisar: (p: Progreso) => void
): Promise<string> {
  const dir = join(dirShared(), 'runtime', componente)
  const java = join(dir, 'bin', 'java.exe')
  const marca = join(dir, '.listo')

  try {
    await fs.access(marca)
    await fs.access(java)
    return java // ya instalado: no hace falta internet
  } catch {
    // hay que descargarlo
  }

  avisar({ fase: 'Buscando Java', hecho: 0, total: 1 })
  const todos = await pedirJson<Record<string, Record<string, { manifest: Descarga }[]>>>(
    URL_RUNTIMES
  )
  const entrada = todos['windows-x64']?.[componente]?.[0]
  if (!entrada) throw new Error(`Mojang no ofrece Java "${componente}" para Windows x64`)

  const manifest = await pedirJson<ManifestRuntime>(entrada.manifest.url)
  const pendientes: Pendiente[] = []
  for (const [ruta, f] of Object.entries(manifest.files)) {
    if (f.type !== 'file' || !f.downloads?.raw) continue
    const destino = resolve(dir, ruta)
    if (!destino.startsWith(resolve(dir) + sep)) throw new Error('Ruta sospechosa en el runtime')
    pendientes.push({ ...f.downloads.raw, destino })
  }

  await descargarLote(pendientes, 'Descargando Java', avisar)
  await fs.writeFile(marca, 'ok')
  return java
}

function construirClasspath(json: VersionJson, jar: string): string {
  const base = join(dirShared(), 'libraries')
  const rutas: string[] = []
  const vistas = new Set<string>()
  for (const lib of json.libraries) {
    if (!permitida(lib.rules)) continue
    const p = lib.downloads?.artifact?.path
    if (!p || vistas.has(p)) continue
    vistas.add(p)
    rutas.push(join(base, p))
  }
  rutas.push(jar)
  return rutas.join(delimiter)
}

// Convierte la lista de argumentos del JSON en argumentos reales
function resolverArgs(args: Arg[], vars: Record<string, string>): string[] {
  const salida: string[] = []
  for (const a of args) {
    let valores: string[]
    if (typeof a === 'string') {
      valores = [a]
    } else {
      if (!permitida(a.rules)) continue
      valores = Array.isArray(a.value) ? a.value : [a.value]
    }
    for (const v of valores) {
      salida.push(v.replace(/\$\{(\w+)\}/g, (_, k: string) => vars[k] ?? ''))
    }
  }
  return salida
}

export function registrarLanzar(): void {
  ipcMain.handle('minecraft:jugar', async (evento, id: string, usuario: string) => {
    if (typeof usuario !== 'string' || !/^[A-Za-z0-9_]{3,16}$/.test(usuario)) {
      throw new Error('El usuario debe tener entre 3 y 16 letras, números o _')
    }
    if (procesos.has(id)) throw new Error('Esta instancia ya está en ejecución')

    const instancia = await leerInstancia(id) // también valida el id
    const v = instancia.version

    if (instancia.loader === 'forge' || instancia.loader === 'neoforge') {
      throw new Error('Forge y NeoForge todavía no están soportados. Usa vanilla o fabric.')
    }

    const enviar = (canal: string, ...datos: unknown[]): void => {
      if (!evento.sender.isDestroyed()) evento.sender.send(canal, ...datos)
    }
    const avisar = (p: Progreso): void => enviar('minecraft:progreso', v, p)

    // 1. Versión descargada (si no hay internet pero ya existe, seguimos)
    const dirVersion = join(dirShared(), 'versions', v)
    const archivoJson = join(dirVersion, `${v}.json`)
    try {
      await descargarVersion(v, avisar)
    } catch (e) {
      try {
        await fs.access(archivoJson)
      } catch {
        throw e
      }
    }
    const json = JSON.parse(await fs.readFile(archivoJson, 'utf-8')) as VersionJson

    if (instancia.loader === 'fabric') {
      const f = await asegurarFabric(v, avisar)
      json.mainClass = f.mainClass
      json.arguments = {
        jvm: [...(json.arguments?.jvm ?? JVM_ANTIGUO), ...f.jvm],
        game: [
          ...(json.arguments?.game ?? (json.minecraftArguments ?? '').split(' ')),
          ...f.game
        ]
      }
      json.libraries = [...json.libraries, ...f.libraries]
    }

    // 2. Java
    const java = await asegurarJava(json.javaVersion?.component ?? 'jre-legacy', avisar)

    // 3. Argumentos
    const gameDir = join(rutaInstancia(id), 'minecraft')
    const natives = join(dirShared(), 'natives', v)
    await fs.mkdir(natives, { recursive: true })

    const vars: Record<string, string> = {
      auth_player_name: usuario,
      version_name: v,
      game_directory: gameDir,
      assets_root: join(dirShared(), 'assets'),
      assets_index_name: json.assetIndex.id,
      auth_uuid: uuidOffline(usuario),
      auth_access_token: '0',
      clientid: '0',
      auth_xuid: '0',
      user_type: 'legacy',
      user_properties: '{}',
      version_type: json.type,
      natives_directory: natives,
      launcher_name: 'VLP',
      launcher_version: '1.0',
      classpath: construirClasspath(json, join(dirVersion, `${v}.jar`)),
      library_directory: join(dirShared(), 'libraries'),
      classpath_separator: delimiter
    }

    const jvm = resolverArgs(json.arguments?.jvm ?? JVM_ANTIGUO, vars)
    const juego = resolverArgs(
      json.arguments?.game ?? (json.minecraftArguments ?? '').split(' '),
      vars
    )
    const args = ['-Xmx2G', ...jvm, json.mainClass, ...juego]

    // 4. Lanzar
    const proc = spawn(java, args, { cwd: gameDir, windowsHide: true })
    procesos.set(id, proc)

    let salida = ''
    const guardar = (b: Buffer): void => {
      salida = (salida + b.toString()).slice(-4000)
    }
    proc.stdout.on('data', guardar)
    proc.stderr.on('data', guardar)

    proc.on('error', (err) => {
      procesos.delete(id)
      enviar('minecraft:estado', id, { estado: 'cerrado', codigo: -1, salida: err.message })
    })
    proc.on('close', (codigo) => {
      procesos.delete(id)
      enviar('minecraft:estado', id, { estado: 'cerrado', codigo: codigo ?? -1, salida })
    })

    enviar('minecraft:estado', id, { estado: 'corriendo' })
  })
}