import { ipcMain } from 'electron'
import { join, basename } from 'path'
import { promises as fs } from 'fs'
import { descargarLote } from './descargas'
import { leerInstancia, rutaInstancia, type Instancia } from './instances'

const API = 'https://api.modrinth.com/v2'
const UA = 'VLP-Launcher/1.0 (launcher privado de VELDADELO PANA)'
const ID_PROYECTO = /^[A-Za-z0-9]{8}$/

interface VersionMR {
  version_type: string
  files: {
    url: string
    filename: string
    primary: boolean
    size: number
    hashes: { sha1: string }
  }[]
  dependencies: { project_id: string | null; dependency_type: string }[]
}

async function pedir<T>(ruta: string): Promise<T> {
  const res = await fetch(API + ruta, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`Modrinth respondió HTTP ${res.status}`)
  return (await res.json()) as T
}

const carpetaMods = (id: string): string => join(rutaInstancia(id), 'minecraft', 'mods')

// Solo nombres simples de .jar, sin rutas (evita salirse de la carpeta de mods)
function validarArchivo(nombre: unknown): string {
  if (
    typeof nombre !== 'string' ||
    basename(nombre) !== nombre ||
    !/\.jar(\.disabled)?$/i.test(nombre)
  ) {
    throw new Error('Nombre de archivo inválido')
  }
  return nombre
}

async function instalarProyecto(
  projectId: string,
  inst: Instancia,
  dirMods: string,
  vistos: Set<string>,
  instalados: string[],
  avisos: string[]
): Promise<void> {
  if (vistos.has(projectId)) return
  vistos.add(projectId)

  const q = (v: unknown): string => encodeURIComponent(JSON.stringify(v))
  const versiones = await pedir<VersionMR[]>(
    `/project/${projectId}/version?loaders=${q([inst.loader])}&game_versions=${q([inst.version])}`
  )
  const elegida = versiones.find((v) => v.version_type === 'release') ?? versiones[0]
  if (!elegida) throw new Error(`No hay versión compatible con ${inst.version} y ${inst.loader}`)

  const archivo = elegida.files.find((f) => f.primary) ?? elegida.files[0]
  if (!archivo) throw new Error('La versión no tiene archivos')
  validarArchivo(archivo.filename)
  if (new URL(archivo.url).hostname !== 'cdn.modrinth.com') {
    throw new Error('Descarga desde un servidor no esperado')
  }

  await fs.mkdir(dirMods, { recursive: true })
  await descargarLote(
    [
      {
        url: archivo.url,
        sha1: archivo.hashes.sha1,
        size: archivo.size,
        destino: join(dirMods, archivo.filename)
      }
    ],
    'Mod',
    () => {}
  )
  instalados.push(archivo.filename)

  for (const dep of elegida.dependencies) {
    if (dep.dependency_type !== 'required' || !dep.project_id) continue
    if (!ID_PROYECTO.test(dep.project_id)) continue
    try {
      await instalarProyecto(dep.project_id, inst, dirMods, vistos, instalados, avisos)
    } catch (e) {
      avisos.push(`Dependencia ${dep.project_id}: ${(e as Error).message}`)
    }
  }
}

export function registrarModrinth(): void {
  ipcMain.handle('mods:buscar', async (_e, idInstancia: string, consulta: string) => {
    const inst = await leerInstancia(idInstancia)
    if (inst.loader === 'vanilla') throw new Error('Una instancia vanilla no usa mods')

    const facetas = [
      ['project_type:mod'],
      [`categories:${inst.loader}`],
      [`versions:${inst.version}`]
    ]
    const texto = typeof consulta === 'string' ? consulta.trim().slice(0, 80) : ''
    const r = await pedir<{
      hits: {
        project_id: string
        title: string
        description: string
        icon_url: string | null
        downloads: number
        author: string
      }[]
    }>(
      `/search?query=${encodeURIComponent(texto)}&facets=${encodeURIComponent(
        JSON.stringify(facetas)
      )}&limit=20`
    )
    return r.hits
  })

  ipcMain.handle('mods:instalar', async (_e, idInstancia: string, projectId: string) => {
    if (typeof projectId !== 'string' || !ID_PROYECTO.test(projectId)) {
      throw new Error('ID de proyecto inválido')
    }
    const inst = await leerInstancia(idInstancia)
    if (inst.loader === 'vanilla') throw new Error('Una instancia vanilla no usa mods')

    const instalados: string[] = []
    const avisos: string[] = []
    await instalarProyecto(
      projectId,
      inst,
      carpetaMods(idInstancia),
      new Set(),
      instalados,
      avisos
    )
    return { instalados, avisos }
  })

  ipcMain.handle('mods:listar', async (_e, idInstancia: string) => {
    await leerInstancia(idInstancia)
    const dir = carpetaMods(idInstancia)
    await fs.mkdir(dir, { recursive: true })
    const lista: { archivo: string; activo: boolean; tamano: number }[] = []
    for (const nombre of await fs.readdir(dir)) {
      if (!/\.jar(\.disabled)?$/i.test(nombre)) continue
      const st = await fs.stat(join(dir, nombre))
      lista.push({ archivo: nombre, activo: !nombre.endsWith('.disabled'), tamano: st.size })
    }
    return lista.sort((a, b) => a.archivo.localeCompare(b.archivo))
  })

  ipcMain.handle('mods:alternar', async (_e, idInstancia: string, archivo: string) => {
    const nombre = validarArchivo(archivo)
    await leerInstancia(idInstancia)
    const dir = carpetaMods(idInstancia)
    const nuevo = nombre.endsWith('.disabled') ? nombre.slice(0, -'.disabled'.length) : nombre + '.disabled'
    await fs.rename(join(dir, nombre), join(dir, nuevo))
  })

  ipcMain.handle('mods:eliminar', async (_e, idInstancia: string, archivo: string) => {
    const nombre = validarArchivo(archivo)
    await leerInstancia(idInstancia)
    await fs.rm(join(carpetaMods(idInstancia), nombre), { force: true })
  })
}