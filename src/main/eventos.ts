import { app, ipcMain } from 'electron'
import { join, resolve, sep, dirname } from 'path'
import { promises as fs } from 'fs'
import { descargarLote, descargarVersion, type Pendiente, type Progreso } from './descargas'
import { asegurarFabric } from './loaders'
import {
  crearInstanciaDesdeDatos,
  guardarInstancia,
  listarInstancias,
  rutaInstancia,
  type Instancia
} from './instances'

// Solo se aceptan descargas desde estos servidores
const HOSTS = ['raw.githubusercontent.com', 'github.com', 'cdn.modrinth.com']
const ID_EVENTO = /^[a-z0-9][a-z0-9-]{0,39}$/
const VERSION_MC = /^\d+\.\d+(\.\d+)?$/
const VERSION_LOADER = /^[\w.+-]{1,40}$/
const SHA1 = /^[a-f0-9]{40}$/
const SEGMENTO = /^[^<>:"|?*\\\x00-\x1f]+$/
const CARPETAS = ['mods', 'config', 'resourcepacks', 'shaderpacks']

export interface InfoEvento {
  id: string
  nombre: string
  descripcion: string
  minecraft: string
  loader: string
  revision: number
  servidor: string
  archivos: number
  tamano: number
  error: string
  estado: 'no_instalado' | 'al_dia' | 'actualizacion'
  idInstancia: string
}
type InfoBase = Omit<InfoEvento, 'estado' | 'idInstancia'>

interface ArchivoEvento {
  ruta: string
  url: string
  sha1: string
  size: number
}
interface Manifiesto {
  id: string
  nombre: string
  descripcion: string
  revision: number
  minecraft: string
  loader: 'vanilla' | 'fabric'
  loaderVersion: string
  servidor: string
  archivos: ArchivoEvento[]
}
interface EntradaCatalogo {
  id: string
  manifiesto: string
}

const dirApp = (): string => join(app.getPath('appData'), 'VLPLauncher')
const archivoConfig = (): string => join(dirApp(), 'config.json')
const archivoCache = (): string => join(dirApp(), 'cache', 'eventos.json')

// ---------- configuración ----------

async function leerConfig(): Promise<{ catalogoUrl: string }> {
  try {
    const c = JSON.parse(await fs.readFile(archivoConfig(), 'utf-8')) as { catalogoUrl?: unknown }
    return { catalogoUrl: typeof c.catalogoUrl === 'string' ? c.catalogoUrl : '' }
  } catch {
    return { catalogoUrl: '' }
  }
}

async function guardarConfig(c: { catalogoUrl: string }): Promise<void> {
  await fs.mkdir(dirApp(), { recursive: true })
  await fs.writeFile(archivoConfig(), JSON.stringify(c, null, 2))
}

// ---------- validaciones ----------

function urlPermitida(texto: unknown): string {
  if (typeof texto !== 'string') throw new Error('URL inválida')
  let u: URL
  try {
    u = new URL(texto)
  } catch {
    throw new Error('URL inválida')
  }
  if (u.protocol !== 'https:' || !HOSTS.includes(u.hostname)) {
    throw new Error(
      `URL no permitida (${u.hostname}). Usa raw.githubusercontent.com, github.com o cdn.modrinth.com`
    )
  }
  return u.toString()
}

function rutaValida(ruta: unknown): string {
  if (typeof ruta !== 'string' || ruta.length > 200) throw new Error('Ruta de archivo inválida')
  const partes = ruta.split('/')
  const ok =
    partes.length >= 2 &&
    CARPETAS.includes(partes[0]) &&
    partes.every((p) => p !== '' && p !== '.' && p !== '..' && SEGMENTO.test(p))
  if (!ok) throw new Error(`Ruta no permitida en el evento: ${ruta}`)
  return ruta
}

function destinoSeguro(base: string, ruta: string): string {
  const destino = resolve(base, ...rutaValida(ruta).split('/'))
  if (!destino.startsWith(resolve(base) + sep)) throw new Error('Ruta sospechosa')
  return destino
}

function validarManifiesto(crudo: unknown, idEsperado: string): Manifiesto {
  const m = crudo as Record<string, unknown>
  if (!m || typeof m !== 'object') throw new Error('Manifiesto inválido')
  const texto = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '')

  const id = texto(m.id, 40)
  if (!ID_EVENTO.test(id) || id !== idEsperado) {
    throw new Error('El id del manifiesto no coincide con el del catálogo')
  }
  const nombre = texto(m.nombre, 60).trim()
  if (!nombre) throw new Error('El evento no tiene nombre')

  const minecraft = texto(m.minecraft, 20)
  if (!VERSION_MC.test(minecraft)) throw new Error('Versión de Minecraft inválida')

  const loader = texto(m.loader, 10)
  if (loader !== 'vanilla' && loader !== 'fabric') {
    throw new Error(`Loader "${loader}" no soportado todavía (solo vanilla y fabric)`)
  }
  const loaderVersion = texto(m.loaderVersion, 40)
  if (loaderVersion && !VERSION_LOADER.test(loaderVersion)) throw new Error('loaderVersion inválida')

  const revision = Number(m.revision)
  if (!Number.isInteger(revision) || revision < 1) throw new Error('Revisión inválida')

  const servidor = texto(m.servidor, 100)
  if (servidor && !/^[A-Za-z0-9.:-]+$/.test(servidor)) throw new Error('Dirección de servidor inválida')

  if (!Array.isArray(m.archivos) || m.archivos.length > 2000) throw new Error('Lista de archivos inválida')
  const vistos = new Set<string>()
  const archivos: ArchivoEvento[] = m.archivos.map((a: Record<string, unknown>) => {
    const ruta = rutaValida(a.ruta)
    if (vistos.has(ruta)) throw new Error(`Archivo repetido: ${ruta}`)
    vistos.add(ruta)
    const sha1 = typeof a.sha1 === 'string' ? a.sha1.toLowerCase() : ''
    if (!SHA1.test(sha1)) throw new Error(`SHA-1 inválido en ${ruta}`)
    const size = Number(a.size ?? 0)
    return {
      ruta,
      url: urlPermitida(a.url),
      sha1,
      size: Number.isInteger(size) && size > 0 ? size : 0
    }
  })

  return {
    id,
    nombre,
    descripcion: texto(m.descripcion, 400),
    revision,
    minecraft,
    loader,
    loaderVersion,
    servidor,
    archivos
  }
}

// ---------- red ----------

async function pedirJsonUrl<T>(url: string): Promise<T> {
  const res = await fetch(urlPermitida(url), {
    cache: 'no-store',
    signal: AbortSignal.timeout(20000)
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} al leer ${new URL(url).pathname}`)
  return (await res.json()) as T
}

async function pedirCatalogo(url: string): Promise<EntradaCatalogo[]> {
  const c = await pedirJsonUrl<{ eventos?: unknown }>(url)
  if (!Array.isArray(c.eventos) || c.eventos.length > 50) throw new Error('Catálogo inválido')
  return c.eventos.map((e: Record<string, unknown>) => {
    const id = typeof e.id === 'string' ? e.id : ''
    if (!ID_EVENTO.test(id)) throw new Error(`Id de evento inválido en el catálogo: ${id}`)
    return { id, manifiesto: urlPermitida(e.manifiesto) }
  })
}

// ---------- listado ----------

function infoDe(m: Manifiesto): InfoBase {
  return {
    id: m.id,
    nombre: m.nombre,
    descripcion: m.descripcion,
    minecraft: m.minecraft,
    loader: m.loader,
    revision: m.revision,
    servidor: m.servidor,
    archivos: m.archivos.length,
    tamano: m.archivos.reduce((s, a) => s + a.size, 0),
    error: ''
  }
}

function infoVacia(id: string, error: string): InfoBase {
  return {
    id,
    nombre: id,
    descripcion: '',
    minecraft: '',
    loader: '',
    revision: 0,
    servidor: '',
    archivos: 0,
    tamano: 0,
    error
  }
}

async function listarEventos(): Promise<{ lista: InfoEvento[]; sinConexion: boolean }> {
  const { catalogoUrl } = await leerConfig()
  if (!catalogoUrl) return { lista: [], sinConexion: false }

  const instancias = await listarInstancias()
  let base: InfoBase[]
  let sinConexion = false

  try {
    const catalogo = await pedirCatalogo(catalogoUrl)
    base = await Promise.all(
      catalogo.map(async (e) => {
        try {
          return infoDe(validarManifiesto(await pedirJsonUrl(e.manifiesto), e.id))
        } catch (err) {
          return infoVacia(e.id, (err as Error).message)
        }
      })
    )
    await fs.mkdir(dirname(archivoCache()), { recursive: true })
    await fs.writeFile(archivoCache(), JSON.stringify(base))
  } catch (e) {
    try {
      base = JSON.parse(await fs.readFile(archivoCache(), 'utf-8')) as InfoBase[]
      sinConexion = true
    } catch {
      throw e
    }
  }

  const lista: InfoEvento[] = base.map((b) => {
    const inst = instancias.find((i) => i.evento?.id === b.id)
    let estado: InfoEvento['estado'] = 'no_instalado'
    if (inst) {
      estado = b.error || inst.evento!.revision >= b.revision ? 'al_dia' : 'actualizacion'
    }
    return { ...b, estado, idInstancia: inst?.id ?? '' }
  })
  return { lista, sinConexion }
}

// ---------- instalar / actualizar ----------

async function sincronizar(
  inst: Instancia,
  man: Manifiesto,
  avisar: (p: Progreso) => void
): Promise<void> {
  const dirMc = join(rutaInstancia(inst.id), 'minecraft')
  const pendientes: Pendiente[] = man.archivos.map((a) => ({
    url: a.url,
    sha1: a.sha1,
    size: a.size,
    destino: destinoSeguro(dirMc, a.ruta)
  }))
  // Solo descarga lo que falta o cambió (verifica SHA-1)
  await descargarLote(pendientes, 'Descargando archivos del evento', avisar)

  // Borra los archivos que antes eran del evento y ya no están
  const archivoEstado = join(rutaInstancia(inst.id), 'evento-archivos.json')
  let anteriores: unknown[] = []
  try {
    anteriores = JSON.parse(await fs.readFile(archivoEstado, 'utf-8')) as unknown[]
  } catch {
    // primera instalación
  }
  const nuevos = new Set(man.archivos.map((a) => a.ruta))
  for (const r of anteriores) {
    if (typeof r !== 'string' || nuevos.has(r)) continue
    try {
      await fs.rm(destinoSeguro(dirMc, r), { force: true })
    } catch {
      // ruta inválida en el estado antiguo: se ignora
    }
  }
  await fs.writeFile(archivoEstado, JSON.stringify([...nuevos]))
}

const enCurso = new Set<string>()

async function instalarEvento(
  idEvento: string,
  avisar: (p: Progreso) => void
): Promise<Instancia> {
  if (typeof idEvento !== 'string' || !ID_EVENTO.test(idEvento)) throw new Error('Evento inválido')
  if (enCurso.has(idEvento)) throw new Error('Este evento ya se está instalando')
  enCurso.add(idEvento)

  try {
    const { catalogoUrl } = await leerConfig()
    if (!catalogoUrl) throw new Error('Configura primero la URL del catálogo')

    // Todo se vuelve a leer desde el catálogo: la interfaz solo manda el id
    avisar({ fase: 'Leyendo evento', hecho: 0, total: 1 })
    const catalogo = await pedirCatalogo(catalogoUrl)
    const entrada = catalogo.find((e) => e.id === idEvento)
    if (!entrada) throw new Error('Ese evento ya no está en el catálogo')
    const man = validarManifiesto(await pedirJsonUrl(entrada.manifiesto), idEvento)

    const existentes = await listarInstancias()
    let inst = existentes.find((i) => i.evento?.id === idEvento)
    if (!inst) {
      inst = await crearInstanciaDesdeDatos({
        nombre: man.nombre.slice(0, 40),
        version: man.minecraft,
        loader: man.loader,
        loaderVersion: man.loaderVersion || undefined,
        evento: { id: idEvento, revision: 0, manifiesto: entrada.manifiesto, servidor: man.servidor }
      })
    }

    // Minecraft y loader listos para jugar
    await descargarVersion(man.minecraft, avisar)
    let loaderVersion: string | undefined = man.loaderVersion || inst.loaderVersion
    if (man.loader === 'fabric') {
      const f = await asegurarFabric(man.minecraft, avisar, loaderVersion)
      loaderVersion = f.version
    } else {
      loaderVersion = undefined
    }

    // Archivos del evento
    await sincronizar(inst, man, avisar)

    inst.nombre = man.nombre.slice(0, 40)
    inst.version = man.minecraft
    inst.loader = man.loader
    inst.loaderVersion = loaderVersion
    inst.evento = {
      id: idEvento,
      revision: man.revision,
      manifiesto: entrada.manifiesto,
      servidor: man.servidor
    }
    await guardarInstancia(inst)

    avisar({ fase: 'Listo', hecho: 1, total: 1 })
    return inst
  } finally {
    enCurso.delete(idEvento)
  }
}

export function registrarEventos(): void {
  ipcMain.handle('eventos:config', () => leerConfig())

  ipcMain.handle('eventos:guardarConfig', async (_e, url: string) => {
    if (typeof url !== 'string') throw new Error('URL inválida')
    const limpia = url.trim() === '' ? '' : urlPermitida(url.trim())
    await guardarConfig({ catalogoUrl: limpia })
    return limpia
  })

  ipcMain.handle('eventos:listar', () => listarEventos())

  ipcMain.handle('eventos:instalar', (evento, id: string) =>
    instalarEvento(id, (p) => {
      if (!evento.sender.isDestroyed()) evento.sender.send('eventos:progreso', id, p)
    })
  )
}