export interface ReleaseChange {
  title: string;
  description: string;
}

export interface ReleaseInfo {
  version: string;
  codeName: string;
  buildDate: string;
  channel: string;
  highlights: string[];
}

export const APP_RELEASE_INFO: ReleaseInfo = {
  version: '2.1.0',
  codeName: 'Fase 2 — Sistema Visual, Tema Claro/Oscuro & Micro-animaciones',
  buildDate: 'Nov 2026',
  channel: 'Test / Preview',
  highlights: [
    'Tipografía Plus Jakarta Sans, números tabulares y textos >= 13px',
    'Modo Oscuro de Alto Contraste y nuevo Modo Claro Cálido desde el Header',
    'Micro-interacciones táctiles (escala 0.97) y barras animadas (500ms)',
    'Transiciones suaves (fade + slide-up 200ms) entre pestañas y vistas',
    'Filtros de Historial de 40px+ y espacio inferior seguro (110px)',
  ],
};
