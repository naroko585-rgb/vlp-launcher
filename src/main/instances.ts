import { app, ipcMain, shell } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'
import { randomUUID } from 'crypto'
import os from 'os'

export interface Instancia {
  id: string
  nombre: string
  version: string
  loader: 'vanilla' | 'fabric' | 'forge' | 'neoforge'
  creada: string
  loaderVersion?: string
  memoriaMB?: number
  evento?: { id: string; revision: number; manifiesto: string; servidor: string }
}

const LOADERS = ['vanilla', 'fabric', 'forge', 'neoforge']
const ID_VALIDO = /^[a-f0-9-]{36}$/

const dirInstancias = (): string => join(app.getPath('appData'), 'VLPLauncher', 'instances')

// Máximo permitido: 75 % de la RAM del equipo (mínimo 2 GB), en pasos de 512 MB
function memoriaMaximaMB(): number {
  const total = os.totalmem() / 1024 / 1024
  return Math.max(2048, Math.floor((total * 0.75) / 512) * 512)
}

// Valida el id para que nadie pueda salirse de la carpeta de instancias
export function rutaInstancia(id: string): string {
  if (!ID_VALIDO.test(id)) throw new Error('ID de instancia inválido')
  return join(dirInstancias(), id)
}

export async function leerInstancia(id: string): Promise<Instancia> {
  const texto = await fs.readFile(join(rutaInstancia(id), 'instance.json'), 'utf-8')
  return JSON.parse(texto) as Instancia
}

export async function guardarInstancia(inst: Instancia): Promise<void> {
  await fs.writeFile(join(rutaInstancia(inst.id), 'instance.json'), JSON.stringify(inst, null, 2))
}

export async function listarInstancias(): Promise<Instancia[]> {
  await fs.mkdir(dirInstancias(), { recursive: true })
  const entradas = await fs.readdir(dirInstancias(), { withFileTypes: true })
  const lista: Instancia[] = []

  for (const e of entradas) {
    if (!e.isDirectory()) continue
    try {
      lista.push(await leerInstancia(e.name))
    } catch {
      // carpeta sin instance.json válido: se ignora
    }
  }
  return lista.sort((a, b) => b.creada.localeCompare(a.creada))
}

// Crea la carpeta y el instance.json (sin validar: quien llama ya validó)
export async function crearInstanciaDesdeDatos(
  datos: Omit<Instancia, 'id' | 'creada'>
): Promise<Instancia> {
  const instancia: Instancia = { ...datos, id: randomUUID(), creada: new Date().toISOString() }
  const base = rutaInstancia(instancia.id)
  for (const sub of ['mods', 'config', 'saves', 'resourcepacks']) {
    await fs.mkdir(join(base, 'minecraft', sub), { recursive: true })
  }
  await guardarInstancia(instancia)
  return instancia
}

export async function crearInstancia(datos: {
  nombre: string
  version: string
  loader: string
}): Promise<Instancia> {
  const nombre = datos.nombre.trim()
  if (!nombre || nombre.length > 40) throw new Error('El nombre debe tener entre 1 y 40 caracteres')
  if (!LOADERS.includes(datos.loader)) throw new Error('Loader inválido')
  if (!/^\d+\.\d+(\.\d+)?$/.test(datos.version)) throw new Error('Versión inválida')

  return crearInstanciaDesdeDatos({
    nombre,
    version: datos.version,
    loader: datos.loader as Instancia['loader']
  })
}

export async function duplicarInstancia(id: string): Promise<Instancia> {
  const original = await leerInstancia(id)
  const copia: Instancia = {
    ...original,
    id: randomUUID(),
    nombre: `${original.nombre} (copia)`.slice(0, 40),
    creada: new Date().toISOString()
  }
  delete copia.evento // la copia es editable y ya no pertenece al evento

  await fs.cp(rutaInstancia(id), rutaInstancia(copia.id), { recursive: true })
  await fs.rm(join(rutaInstancia(copia.id), 'evento-archivos.json'), { force: true })
  await guardarInstancia(copia)
  return copia
}

export async function eliminarInstancia(id: string): Promise<void> {
  await fs.rm(rutaInstancia(id), { recursive: true, force: true })
}

export async function ajustarMemoria(id: string, mb: unknown): Promise<Instancia> {
  const inst = await leerInstancia(id)
  const max = memoriaMaximaMB()
  if (typeof mb !== 'number' || !Number.isInteger(mb) || mb < 1024 || mb > max) {
    throw new Error(`La memoria debe estar entre 1024 y ${max} MB`)
  }
  inst.memoriaMB = mb
  await guardarInstancia(inst)
  return inst
}

export function registrarInstancias(): void {
  ipcMain.handle('instancias:listar', () => listarInstancias())
  ipcMain.handle('instancias:crear', (_e, datos) => crearInstancia(datos))
  ipcMain.handle('instancias:duplicar', (_e, id: string) => duplicarInstancia(id))
  ipcMain.handle('instancias:eliminar', (_e, id: string) => eliminarInstancia(id))
  ipcMain.handle('instancias:abrirCarpeta', async (_e, id: string) => {
    await shell.openPath(rutaInstancia(id))
  })
  ipcMain.handle('instancias:memoria', (_e, id: string, mb: unknown) => ajustarMemoria(id, mb))
  ipcMain.handle('sistema:memoria', () => memoriaMaximaMB())
}