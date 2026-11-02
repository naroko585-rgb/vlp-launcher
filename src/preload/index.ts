import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  instancias: {
    listar: () => ipcRenderer.invoke('instancias:listar'),
    crear: (datos: { nombre: string; version: string; loader: string }) =>
      ipcRenderer.invoke('instancias:crear', datos),
    duplicar: (id: string) => ipcRenderer.invoke('instancias:duplicar', id),
    eliminar: (id: string) => ipcRenderer.invoke('instancias:eliminar', id),
    abrirCarpeta: (id: string) => ipcRenderer.invoke('instancias:abrirCarpeta', id)
  },
    minecraft: {
    versiones: (): Promise<string[]> => ipcRenderer.invoke('minecraft:versiones'),
    descargar: (version: string): Promise<void> =>
      ipcRenderer.invoke('minecraft:descargar', version),
    onProgreso: (
      callback: (version: string, p: { fase: string; hecho: number; total: number }) => void
    ): (() => void) => {
      const manejador = (
        _e: unknown,
        version: string,
        p: { fase: string; hecho: number; total: number }
      ): void => callback(version, p)
      ipcRenderer.on('minecraft:progreso', manejador)
      return () => ipcRenderer.removeListener('minecraft:progreso', manejador)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}