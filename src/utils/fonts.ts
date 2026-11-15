/**
 * Carga de 'Plus Jakarta Sans' (fuente principal de keAhorro).
 *
 * `expo-font` es un módulo nativo: solo existe en APK compilados DESPUÉS de
 * instalarlo. Para no romper APK antiguos que reciben actualizaciones OTA, la
 * carga es defensiva: si el módulo nativo no está, la app usa la fuente del
 * sistema (con los mismos tamaños, contraste y números tabulares).
 */

export const FONT_FAMILY = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;

let fontsAvailable = false;

export const areFontsAvailable = (): boolean => fontsAvailable;

/** Familia de la fuente según el `fontWeight` de RN. */
export const fontFamilyForWeight = (weight?: string | number): string => {
  switch (String(weight ?? '400')) {
    case '500':
      return FONT_FAMILY.medium;
    case '600':
      return FONT_FAMILY.semibold;
    case '700':
    case 'bold':
      return FONT_FAMILY.bold;
    case '800':
    case '900':
      return FONT_FAMILY.extrabold;
    default:
      return FONT_FAMILY.regular;
  }
};

/** Intenta cargar las fuentes. Nunca lanza: devuelve true si quedaron disponibles. */
export const loadAppFonts = async (): Promise<boolean> => {
  try {
    // require() diferido y dentro de try/catch: si falta el módulo nativo no rompe el arranque.
    const Font = require('expo-font');
    await Font.loadAsync({
      [FONT_FAMILY.regular]: require('@expo-google-fonts/plus-jakarta-sans/400Regular/PlusJakartaSans_400Regular.ttf'),
      [FONT_FAMILY.medium]: require('@expo-google-fonts/plus-jakarta-sans/500Medium/PlusJakartaSans_500Medium.ttf'),
      [FONT_FAMILY.semibold]: require('@expo-google-fonts/plus-jakarta-sans/600SemiBold/PlusJakartaSans_600SemiBold.ttf'),
      [FONT_FAMILY.bold]: require('@expo-google-fonts/plus-jakarta-sans/700Bold/PlusJakartaSans_700Bold.ttf'),
      [FONT_FAMILY.extrabold]: require('@expo-google-fonts/plus-jakarta-sans/800ExtraBold/PlusJakartaSans_800ExtraBold.ttf'),
    });
    fontsAvailable = true;
  } catch {
    fontsAvailable = false;
  }
  return fontsAvailable;
};

