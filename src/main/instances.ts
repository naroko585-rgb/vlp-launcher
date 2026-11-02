import { app, ipcMain, shell } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'
import { randomUUID } from 'crypto'

export interface Instancia {
  id: string
  nombre: string
  version: string
  loader: 'vanilla' | 'fabric' | 'forge' | 'neoforge'
  creada: string
}

const LOADERS = ['vanilla', 'fabric', 'forge', 'neoforge']
const ID_VALIDO = /^[a-f0-9-]{36}$/

const dirInstancias = (): string => join(app.getPath('appData'), 'VLPLauncher', 'instances')

// Valida el id para que nadie pueda salirse de la carpeta de instancias
function rutaInstancia(id: string): string {
  if (!ID_VALIDO.test(id)) throw new Error('ID de instancia inválido')
  return join(dirInstancias(), id)
}

async function leerInstancia(id: string): Promise<Instancia> {
  const texto = await fs.readFile(join(rutaInstancia(id), 'instance.json'), 'utf-8')
  return JSON.parse(texto) as Instancia
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

export async function crearInstancia(datos: {
  nombre: string
  version: string
  loader: string
}): Promise<Instancia> {
  const nombre = datos.nombre.trim()
  if (!nombre || nombre.length > 40) throw new Error('El nombre debe tener entre 1 y 40 caracteres')
  if (!LOADERS.includes(datos.loader)) throw new Error('Loader inválido')
  if (!/^\d+\.\d+(\.\d+)?$/.test(datos.version)) throw new Error('Versión inválida')

  const instancia: Instancia = {
    id: randomUUID(),
    nombre,
    version: datos.version,
    loader: datos.loader as Instancia['loader'],
    creada: new Date().toISOString()
  }

  const base = rutaInstancia(instancia.id)
  for (const sub of ['mods', 'config', 'saves', 'resourcepacks']) {
    await fs.mkdir(join(base, 'minecraft', sub), { recursive: true })
  }
  await fs.writeFile(join(base, 'instance.json'), JSON.stringify(instancia, null, 2))
  return instancia
}

export async function duplicarInstancia(id: string): Promise<Instancia> {
  const original = await leerInstancia(id)
  const copia: Instancia = {
    ...original,
    id: randomUUID(),
    nombre: `${original.nombre} (copia)`.slice(0, 40),
    creada: new Date().toISOString()
  }
  await fs.cp(rutaInstancia(id), rutaInstancia(copia.id), { recursive: true })
  await fs.writeFile(
    join(rutaInstancia(copia.id), 'instance.json'),
    JSON.stringify(copia, null, 2)
  )
  return copia
}

export async function eliminarInstancia(id: string): Promise<void> {
  await fs.rm(rutaInstancia(id), { recursive: true, force: true })
}

export function registrarInstancias(): void {
  ipcMain.handle('instancias:listar', () => listarInstancias())
  ipcMain.handle('instancias:crear', (_e, datos) => crearInstancia(datos))
  ipcMain.handle('instancias:duplicar', (_e, id: string) => duplicarInstancia(id))
  ipcMain.handle('instancias:eliminar', (_e, id: string) => eliminarInstancia(id))
  ipcMain.handle('instancias:abrirCarpeta', async (_e, id: string) => {
    await shell.openPath(rutaInstancia(id))
  })
}