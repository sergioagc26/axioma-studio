import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './theme.css';

/**
 * Si algo falla al dibujar una pantalla, se muestra qué pasó y cómo seguir, en vez de dejar la
 * app en negro. El trabajo no se pierde: cada cambio ya quedó guardado en el proyecto.
 */
class Safe extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error('Pantalla con error:', error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div className="card col" style={{ maxWidth: 460, gap: 14, padding: 24, borderRadius: 20 }}>
          <h1 style={{ fontSize: 22 }}>Esta pantalla se trabó</h1>
          <span className="muted">Tu video y tus cambios están guardados. Vuelve a cargar para seguir donde ibas.</span>
          <div className="row">
            <button className="btn primary" onClick={() => location.reload()}>Volver a cargar</button>
            <button className="btn rect" onClick={() => { location.hash = '/proyectos'; location.reload(); }}>Ir a Proyectos</button>
          </div>
          <details className="small muted"><summary>Detalle técnico</summary><pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{String(this.state.error.message).slice(0, 400)}</pre></details>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById('root')!).render(<Safe><App /></Safe>);
