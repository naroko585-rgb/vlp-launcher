import { useEffect, useState } from 'react'

function Inicio(): React.JSX.Element {
  const [instancias, setInstancias] = useState<Instancia[]>([])
  const [eventos, setEventos] = useState<InfoEvento[]>([])
  const [sinConexion, setSinConexion] = useState(false)
  const [hayCatalogo, setHayCatalogo] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [version, setVersion] = useState('')
  const [act, setAct] = useState<EstadoActualizacion>({ estado: 'inactivo' })

  useEffect(() => {
    async function cargar(): Promise<void> {
      try {
        setInstancias(await window.api.instancias.listar())
        const cfg = await window.api.eventos.config()
        setHayCatalogo(!!cfg.catalogoUrl)
        if (cfg.catalogoUrl) {
          const r = await window.api.eventos.listar()
          setEventos(r.lista)
          setSinConexion(r.sinConexion)
        }
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setCargando(false)
      }
    }
    cargar()
  }, [])

  useEffect(() => {
    window.api.app.version().then(setVersion)
    window.api.app.estadoActualizacion().then(setAct)
    return window.api.app.onActualizacion(setAct)
  }, [])

  const conActualizacion = eventos.filter((e) => e.estado === 'actualizacion')
  const deEventos = instancias.filter((i) => i.evento).length

  return (
    <section>
      <h2>Bienvenido a VLP Launcher</h2>
      <p className="sub">Launcher privado de VELDADELO PANA.</p>

      <div className="lista">
        {act.estado === 'disponible' && (
          <div className="tarjeta">
            <h3>
              Nueva versión del launcher
              <span className="insignia nueva">{act.version}</span>
            </h3>
            <p className="sub chico">Cierra Minecraft antes de actualizar.</p>
            <button className="btn primario" onClick={() => window.api.app.descargarActualizacion()}>
              Descargar actualización
            </button>
          </div>
        )}
        {act.estado === 'descargando' && (
          <div className="tarjeta">
            <h3>Descargando actualización…</h3>
            <p className="sub chico estado">{act.porcentaje ?? 0} %</p>
          </div>
        )}
        {act.estado === 'listo' && (
          <div className="tarjeta">
            <h3>
              Actualización lista
              <span className="insignia nueva">{act.version}</span>
            </h3>
            <p className="sub chico">El launcher se reiniciará para instalarla.</p>
            <button className="btn primario" onClick={() => window.api.app.instalarActualizacion()}>
              Reiniciar e instalar
            </button>
          </div>
        )}
        {act.estado === 'error' && (
          <div className="tarjeta">
            <h3>No se pudo comprobar si hay actualizaciones</h3>
            <p className="error">{act.mensaje}</p>
            <button className="btn" onClick={() => window.api.app.buscarActualizacion()}>
              Reintentar
            </button>
          </div>
        )}

        <div className="tarjeta">
          <h3>Tu biblioteca</h3>
          <p className="sub chico">
            {instancias.length === 0
              ? 'Todavía no tienes instancias. Crea una en la Biblioteca.'
              : `${instancias.length} instancia(s), ${deEventos} de eventos.`}
          </p>
        </div>

        {conActualizacion.length > 0 && (
          <div className="tarjeta">
            <h3>
              Actualizaciones de eventos
              <span className="insignia nueva">{conActualizacion.length}</span>
            </h3>
            {conActualizacion.map((e) => (
              <p key={e.id} className="sub chico">
                {e.nombre} · revisión {e.revision}
              </p>
            ))}
            <p className="sub chico">Ve a Eventos para actualizar.</p>
          </div>
        )}

        <div className="tarjeta">
          <h3>Eventos destacados</h3>
          {cargando && <p className="sub chico">Cargando…</p>}
          {!cargando && !hayCatalogo && (
            <p className="sub chico">Configura el catálogo en la sección Eventos.</p>
          )}
          {!cargando && hayCatalogo && eventos.length === 0 && !error && (
            <p className="sub chico">Aún no hay eventos publicados.</p>
          )}
          {sinConexion && (
            <p className="sub chico">Sin conexión: se muestra la última lista guardada.</p>
          )}
          {eventos.map((e) => (
            <p key={e.id} className="sub chico">
              {e.nombre}
              {e.minecraft ? ` · Minecraft ${e.minecraft} · ${e.loader}` : ''}
              {e.estado === 'al_dia' && <span className="insignia">Instalado</span>}
              {e.estado === 'actualizacion' && <span className="insignia nueva">Actualización</span>}
            </p>
          ))}
          {error && <p className="error">{error}</p>}
        </div>

        <p className="sub chico">
          VLP Launcher {version ? `v${version}` : ''}
          {act.estado === 'al_dia' && ' · estás al día'}
        </p>
      </div>
    </section>
  )
}

export default Inicio