import { useEffect, useState } from 'react'

function Mods(): React.JSX.Element {
  const [instancias, setInstancias] = useState<Instancia[]>([])
  const [idInstancia, setIdInstancia] = useState('')
  const [consulta, setConsulta] = useState('')
  const [resultados, setResultados] = useState<ResultadoMod[]>([])
  const [locales, setLocales] = useState<ModLocal[]>([])
  const [cargando, setCargando] = useState(false)
  const [instalando, setInstalando] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    window.api.instancias.listar().then((lista) => {
      const editables = lista.filter((i) => i.loader !== 'vanilla' && !i.evento)
      setInstancias(editables)
      if (editables.length > 0) setIdInstancia(editables[0].id)
    })
  }, [])

  useEffect(() => {
    if (!idInstancia) return
    setConsulta('')
    buscar('')
    cargarLocales()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idInstancia])

  async function buscar(texto: string): Promise<void> {
    setError('')
    setCargando(true)
    try {
      setResultados(await window.api.mods.buscar(idInstancia, texto))
    } catch (e) {
      setError((e as Error).message)
      setResultados([])
    } finally {
      setCargando(false)
    }
  }

  async function cargarLocales(): Promise<void> {
    setLocales(await window.api.mods.listar(idInstancia))
  }

  async function instalar(m: ResultadoMod): Promise<void> {
    setError('')
    setMensaje('')
    setInstalando(m.project_id)
    try {
      const r = await window.api.mods.instalar(idInstancia, m.project_id)
      setMensaje(`Instalado: ${r.instalados.join(', ')}`)
      if (r.avisos.length > 0) setError(r.avisos.join('\n'))
      await cargarLocales()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setInstalando('')
    }
  }

  async function alternar(archivo: string): Promise<void> {
    await window.api.mods.alternar(idInstancia, archivo)
    await cargarLocales()
  }

  async function eliminar(archivo: string): Promise<void> {
    if (!window.confirm(`¿Eliminar ${archivo}?`)) return
    await window.api.mods.eliminar(idInstancia, archivo)
    await cargarLocales()
  }

  if (instancias.length === 0) {
    return (
      <section>
        <h2>Mods</h2>
        <p className="sub">Buscador e instalación de modificaciones.</p>
        <div className="tarjeta">
          <p>
            Crea una instancia con Fabric en la Biblioteca para instalar mods. Las instancias de
            eventos son oficiales y no se editan: usa &quot;Copia editable&quot; si quieres
            modificarlas.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section>
      <h2>Mods</h2>
      <p className="sub">Buscador e instalación de modificaciones (Modrinth).</p>

      <div className="tarjeta formulario">
        <div className="fila">
          <select value={idInstancia} onChange={(e) => setIdInstancia(e.target.value)}>
            {instancias.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nombre} · {i.version} · {i.loader}
              </option>
            ))}
          </select>
          <input
            placeholder="Buscar mods (ej. sodium)"
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && buscar(consulta)}
          />
          <button className="btn primario" onClick={() => buscar(consulta)}>
            Buscar
          </button>
        </div>
        {mensaje && <p className="ok">{mensaje}</p>}
        {error && <p className="error">{error}</p>}
      </div>

      <h3 className="titulo-seccion">Instalados ({locales.length})</h3>
      <div className="lista">
        {locales.length === 0 && (
          <div className="tarjeta">
            <p>Esta instancia no tiene mods.</p>
          </div>
        )}
        {locales.map((m) => (
          <div key={m.archivo} className="tarjeta instancia">
            <div>
              <h3 className={m.activo ? '' : 'apagado'}>{m.archivo}</h3>
              <p className="sub chico">
                {(m.tamano / 1024).toFixed(0)} KB · {m.activo ? 'Activo' : 'Desactivado'}
              </p>
            </div>
            <div className="acciones">
              <button className="btn" onClick={() => alternar(m.archivo)}>
                {m.activo ? 'Desactivar' : 'Activar'}
              </button>
              <button className="btn peligro" onClick={() => eliminar(m.archivo)}>
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>

      <h3 className="titulo-seccion">{cargando ? 'Buscando…' : 'Resultados'}</h3>
      <div className="lista">
        {resultados.map((m) => (
          <div key={m.project_id} className="tarjeta instancia">
            <div className="mod-info">
              {m.icon_url ? (
                <img className="mod-icono" src={m.icon_url} alt="" />
              ) : (
                <div className="mod-icono" />
              )}
              <div>
                <h3>{m.title}</h3>
                <p className="sub chico">
                  {m.author} · {m.downloads.toLocaleString('es')} descargas
                </p>
                <p className="sub chico">{m.description}</p>
              </div>
            </div>
            <div className="acciones">
              <button
                className="btn primario"
                disabled={!!instalando}
                onClick={() => instalar(m)}
              >
                {instalando === m.project_id ? 'Instalando…' : 'Instalar'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default Mods