import { app, ipcMain } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'

const URL_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'

export interface VersionMC {
  id: string
  type: string
  url: string
}

interface Manifest {
  latest: { release: string; snapshot: string }
  versions: VersionMC[]
}

const dirCache = (): string => join(app.getPath('appData'), 'VLPLauncher', 'cache')
const archivoManifest = (): string => join(dirCache(), 'version_manifest.json')

// Intenta descargar el manifest; si no hay internet usa la copia guardada
export async function obtenerManifest(): Promise<Manifest> {
  await fs.mkdir(dirCache(), { recursive: true })
  try {
    const res = await fetch(URL_MANIFEST)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const texto = await res.text()
    await fs.writeFile(archivoManifest(), texto)
    return JSON.parse(texto) as Manifest
  } catch {
    const texto = await fs.readFile(archivoManifest(), 'utf-8')
    return JSON.parse(texto) as Manifest
  }
}

export function registrarMinecraft(): void {
  // Devuelve solo las versiones oficiales (release), de la más nueva a la más vieja
  ipcMain.handle('minecraft:versiones', async () => {
    const manifest = await obtenerManifest()
    return manifest.versions.filter((v) => v.type === 'release').map((v) => v.id)
  })
}