/**
 * Sistema de diseño de keAhorro.
 *
 * - `darkColors`: Modo Oscuro de Alto Contraste (por defecto).
 * - `lightColors`: Modo Claro Cálido (accesible desde Ajustes → Apariencia).
 *
 * Los nombres de los tokens son idénticos en ambos temas. En el tema claro, los
 * colores semánticos (éxito, peligro, primario, aviso) se oscurecen un poco para
 * cumplir contraste AA sobre fondos blancos.
 *
 * Semántica:
 *  - success  (Esmeralda)  → Ingresos y botón central "+ Nuevo"
 *  - danger   (Coral)      → Gastos y acciones destructivas
 *  - primary  (Índigo)     → Navegación y Crédito
 *  - warning  (Ámbar)      → Tasas E.M. y avisos de corte
 *  - *Light   → variante para TEXTO/ÍCONOS sobre superficies (más legible)
 */

export type ThemeMode = 'dark' | 'light';

const cardGradients = [
  ['#1E1B4B', '#4338CA'], // Indigo Dark
  ['#3B0764', '#7E22CE'], // Purple Nu
  ['#064E3B', '#059669'], // Emerald Bank
  ['#7C2D12', '#EA580C'], // Orange Titanium
  ['#0F172A', '#334155'], // Slate Stealth
  ['#831843', '#BE185D'], // Rose Gold
] as [string, string][];

export const darkColors = {
  // Fondos y superficies
  background: '#0B0F19',
  surface: '#111827', // hojas modales / barras
  surfaceCard: '#161F30', // cards
  surfaceElevated: '#26334D', // chips, inputs sobre cards
  inset: '#0F172A', // áreas hundidas dentro de una card
  insetOverlay: 'rgba(0, 0, 0, 0.25)',
  debtSurface: '#16131E',
  border: '#26334D',
  borderLight: '#334155', // bordes de inputs / chips
  divider: 'rgba(255, 255, 255, 0.06)',
  navBackground: 'rgba(17, 24, 39, 0.97)',

  // Textos (secundarios con contraste AA sobre las cards)
  textPrimary: '#F8FAFC',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',
  textInverse: '#0B0F19',
  onAccent: '#FFFFFF', // texto sobre botones/píldoras de color

  // Índigo: navegación y crédito
  primary: '#6366F1',
  primaryLight: '#818CF8',
  primaryDark: '#4338CA',

  // Esmeralda: ingresos, "+ Nuevo"
  success: '#10B981',
  successLight: '#34D399',
  successBg: 'rgba(16, 185, 129, 0.14)',

  // Coral: gastos
  danger: '#F43F5E',
  dangerLight: '#FB7185',
  dangerBg: 'rgba(244, 63, 94, 0.14)',

  // Ámbar: tasas E.M. y avisos de corte
  warning: '#F59E0B',
  warningLight: '#FBBF24',
  warningBg: 'rgba(245, 158, 11, 0.14)',

  info: '#06B6D4',
  infoBg: 'rgba(6, 182, 212, 0.14)',

  purple: '#8B5CF6',
  purpleBg: 'rgba(139, 92, 246, 0.14)',

  cardGradients,
};

export type ThemeColors = typeof darkColors;

export const lightColors: ThemeColors = {
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceCard: '#FFFFFF',
  surfaceElevated: '#F1F5F9',
  inset: '#F1F5F9',
  insetOverlay: 'rgba(15, 23, 42, 0.05)',
  debtSurface: '#FFF1F2',
  border: '#E2E8F0',
  borderLight: '#CBD5E1',
  divider: 'rgba(15, 23, 42, 0.08)',
  navBackground: 'rgba(255, 255, 255, 0.97)',

  textPrimary: '#0F172A',
  textSecondary: '#334155',
  textMuted: '#475569',
  textInverse: '#FFFFFF',
  onAccent: '#FFFFFF',

  primary: '#4F46E5',
  primaryLight: '#4F46E5',
  primaryDark: '#3730A3',

  success: '#059669',
  successLight: '#047857',
  successBg: 'rgba(5, 150, 105, 0.12)',

  danger: '#E11D48',
  dangerLight: '#BE123C',
  dangerBg: 'rgba(225, 29, 72, 0.10)',

  warning: '#D97706',
  warningLight: '#B45309',
  warningBg: 'rgba(217, 119, 6, 0.12)',

  info: '#0891B2',
  infoBg: 'rgba(8, 145, 178, 0.12)',

  purple: '#7C3AED',
  purpleBg: 'rgba(124, 58, 237, 0.10)',

  cardGradients,
};

export const getColors = (mode: ThemeMode): ThemeColors =>
  mode === 'light' ? lightColors : darkColors;

/** Convierte '#RRGGBB' en 'rgba(r, g, b, a)'. Si ya es rgba, lo devuelve igual. */
export const alpha = (color: string, opacity: number): string => {
  if (!color.startsWith('#') || color.length < 7) return color;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

const borderRadius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  full: 9999,
};

/** Medidas de layout compartidas. */
export const Layout = {
  /** Espacio mínimo al final de cada pestaña para que la barra flotante nunca tape contenido. */
  bottomNavSpace: 110,
  /** Alto mínimo de botones/chips (accesibilidad táctil). */
  minTouchHeight: 40,
  /** Tamaño mínimo de texto en toda la interfaz. */
  minFontSize: 13,
};

/**
 * Compatibilidad: tema oscuro estático. Los componentes deben preferir
 * `useAppTheme().colors` para respetar el modo elegido por el usuario.
 */
export const Theme = {
  colors: darkColors,
  spacing,
  borderRadius,
};
