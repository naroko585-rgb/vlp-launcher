import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'

export interface EstadoActualizacion {
  estado: 'inactivo' | 'buscando' | 'disponible' | 'al_dia' | 'descargando' | 'listo' | 'error'
  version?: string
  porcentaje?: number
  mensaje?: string
}

let ultimo: EstadoActualizacion = { estado: 'inactivo' }

function emitir(e: EstadoActualizacion): void {
  ultimo = e
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('app:actualizacion', e)
  }
}

export function registrarActualizador(): void {
  // El usuario decide cuándo descargar e instalar
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('checking-for-update', () => emitir({ estado: 'buscando' }))
  autoUpdater.on('update-available', (info) =>
    emitir({ estado: 'disponible', version: info.version })
  )
  autoUpdater.on('update-not-available', () => emitir({ estado: 'al_dia' }))
  autoUpdater.on('download-progress', (p) =>
    emitir({ estado: 'descargando', version: ultimo.version, porcentaje: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) =>
    emitir({ estado: 'listo', version: info.version })
  )
  autoUpdater.on('error', (err) => emitir({ estado: 'error', mensaje: err.message }))

  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:estadoActualizacion', () => ultimo)

  ipcMain.handle('app:buscarActualizacion', async () => {
    if (!app.isPackaged) {
      emitir({ estado: 'al_dia', mensaje: 'Modo desarrollo: las actualizaciones están desactivadas' })
      return
    }
    try {
      await autoUpdater.checkForUpdates()
    } catch (e) {
      emitir({ estado: 'error', mensaje: (e as Error).message })
    }
  })

  ipcMain.handle('app:descargarActualizacion', async () => {
    if (!app.isPackaged || ultimo.estado !== 'disponible') return
    try {
      await autoUpdater.downloadUpdate()
    } catch (e) {
      emitir({ estado: 'error', mensaje: (e as Error).message })
    }
  })

  ipcMain.handle('app:instalarActualizacion', () => {
    if (ultimo.estado !== 'listo') throw new Error('No hay ninguna actualización lista')
    autoUpdater.quitAndInstall()
  })

  // Revisión automática poco después de abrir (solo en la versión instalada)
  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((e: Error) => emitir({ estado: 'error', mensaje: e.message }))
    }, 5000)
  }
}