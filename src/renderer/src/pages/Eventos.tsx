import { useEffect, useState } from 'react'

function formatoTamano(bytes: number): string {
  if (bytes <= 0) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function Eventos(): React.JSX.Element {
  const [catalogoUrl, setCatalogoUrl] = useState('')
  const [urlEditada, setUrlEditada] = useState('')
  const [lista, setLista] = useState<InfoEvento[]>([])
  const [cargando, setCargando] = useState(false)
  const [sinConexion, setSinConexion] = useState(false)
  const [error, setError] = useState('')
  const [progreso, setProgreso] = useState<Record<string, string>>({})
  const [ocupado, setOcupado] = useState('')
  const [copiado, setCopiado] = useState('')

  async function cargar(): Promise<void> {
    setError('')
    setCargando(true)
    try {
      const r = await window.api.eventos.listar()
      setLista(r.lista)
      setSinConexion(r.sinConexion)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    window.api.eventos.config().then((c) => {
      setCatalogoUrl(c.catalogoUrl)
      setUrlEditada(c.catalogoUrl)
      if (c.catalogoUrl) cargar()
    })
    return window.api.eventos.onProgreso((id, p) => {
      setProgreso((prev) => ({
        ...prev,
        [id]: p.fase === 'Listo' ? '' : `${p.fase}: ${p.hecho}/${p.total}`
      }))
    })
  }, [])

  async function guardarUrl(): Promise<void> {
    setError('')
    try {
      const limpia = await window.api.eventos.guardarConfig(urlEditada)
      setCatalogoUrl(limpia)
      setUrlEditada(limpia)
      setLista([])
      if (limpia) await cargar()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function instalar(ev: InfoEvento): Promise<void> {
    setError('')
    setOcupado(ev.id)
    try {
      await window.api.eventos.instalar(ev.id)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupado('')
      setProgreso((prev) => ({ ...prev, [ev.id]: '' }))
      await cargar()
    }
  }

  async function copiar(ev: InfoEvento): Promise<void> {
    try {
      await navigator.clipboard.writeText(ev.servidor)
      setCopiado(ev.id)
      setTimeout(() => setCopiado(''), 1500)
    } catch {
      setError('No se pudo copiar la dirección del servidor')
    }
  }

  function textoBoton(ev: InfoEvento): string {
    if (ocupado === ev.id) return 'Trabajando…'
    if (ev.estado === 'no_instalado') return 'Instalar'
    if (ev.estado === 'actualizacion') return 'Actualizar'
    return 'Verificar'
  }

  return (
    <section>
      <h2>Eventos</h2>
      <p className="sub">Eventos y modpacks publicados por el administrador.</p>

      <div className="tarjeta formulario">
        <h3>Catálogo de eventos</h3>
        <div className="fila">
          <input
            placeholder="URL del eventos.json (https://raw.githubusercontent.com/...)"
            value={urlEditada}
            onChange={(e) => setUrlEditada(e.target.value)}
          />
          <button className="btn" onClick={guardarUrl} disabled={urlEditada === catalogoUrl}>
            Guardar
          </button>
          <button className="btn primario" onClick={cargar} disabled={!catalogoUrl || cargando}>
            {cargando ? 'Cargando…' : 'Actualizar lista'}
          </button>
        </div>
        {sinConexion && (
          <p className="sub chico">Sin conexión: se muestra la última lista guardada.</p>
        )}
        {error && <p className="error">{error}</p>}
      </div>

      <div className="lista">
        {!catalogoUrl && (
          <div className="tarjeta">
            <p>Pega la URL del catálogo de eventos que te dio el administrador.</p>
          </div>
        )}
        {catalogoUrl && !cargando && lista.length === 0 && !error && (
          <div className="tarjeta">
            <p>No hay eventos publicados.</p>
          </div>
        )}

        {lista.map((ev) => (
          <div key={ev.id} className="tarjeta instancia">
            <div>
              <h3>
                {ev.nombre}
                {ev.estado === 'actualizacion' && <span className="insignia nueva">Actualización</span>}
                {ev.estado === 'al_dia' && <span className="insignia">Instalado</span>}
              </h3>
              {ev.error ? (
                <p className="error">{ev.error}</p>
              ) : (
                <>
                  {ev.descripcion && <p className="sub chico">{ev.descripcion}</p>}
                  <p className="sub chico">
                    Minecraft {ev.minecraft} · {ev.loader} · revisión {ev.revision} · {ev.archivos}{' '}
                    archivos ({formatoTamano(ev.tamano)})
                  </p>
                  {ev.servidor && (
                    <p className="sub chico">
                      Servidor: <span className="seleccionable">{ev.servidor}</span>{' '}
                      <button className="btn mini" onClick={() => copiar(ev)}>
                        {copiado === ev.id ? 'Copiado ✓' : 'Copiar'}
                      </button>
                    </p>
                  )}
                </>
              )}
              {progreso[ev.id] && <p className="sub chico estado">{progreso[ev.id]}</p>}
            </div>
            <div className="acciones">
              <button
                className="btn primario"
                disabled={!!ocupado || !!ev.error}
                onClick={() => instalar(ev)}
              >
                {textoBoton(ev)}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default Eventos