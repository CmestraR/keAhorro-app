import React, { createContext, useContext } from 'react';
import {
  StyleProp,
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  TextInputProps,
  TextProps,
  TextStyle,
} from 'react-native';
import { areFontsAvailable, fontFamilyForWeight } from '../../utils/fonts';
import { Layout } from './Theme';

/**
 * Reemplazos "drop-in" de <Text> y <TextInput> de React Native.
 * Misma API; añaden de forma global:
 *  - Fuente 'Plus Jakarta Sans' (si el binario la incluye) con el peso correcto.
 *  - Tamaño mínimo de 13px (legibilidad universal).
 *  - `fontVariant: ['tabular-nums']` en todo texto que contenga dígitos
 *    (montos, porcentajes, fechas) para que los números no "bailen".
 */

// Dentro de un <Text> anidado, sin peso explícito se hereda la fuente del padre.
const NestedTextContext = createContext(false);

const containsDigit = (node: React.ReactNode): boolean => {
  if (typeof node === 'number') return true;
  if (typeof node === 'string') return /\d/.test(node);
  if (Array.isArray(node)) return node.some(containsDigit);
  return false;
};

const buildStyle = (
  style: StyleProp<TextStyle>,
  nested: boolean,
  tabular: boolean
): TextStyle => {
  const flat = (StyleSheet.flatten(style) || {}) as TextStyle;
  const out: TextStyle = { ...flat };

  if (typeof flat.fontSize === 'number') {
    out.fontSize = Math.max(Layout.minFontSize, flat.fontSize);
    if (
      typeof flat.lineHeight === 'number' &&
      flat.lineHeight < out.fontSize * 1.15
    ) {
      out.lineHeight = Math.ceil(out.fontSize * 1.3);
    }
  }

  if (areFontsAvailable() && flat.fontFamily == null) {
    if (!nested || flat.fontWeight != null) {
      out.fontFamily = fontFamilyForWeight(flat.fontWeight);
      // El peso ya va dentro de la familia: evita "negrita sintética" doble.
      out.fontWeight = 'normal';
    }
  }

  if (tabular) {
    const variants = new Set<string>((flat.fontVariant as string[] | undefined) ?? []);
    variants.add('tabular-nums');
    out.fontVariant = Array.from(variants) as TextStyle['fontVariant'];
  }

  return out;
};

export const Text = React.forwardRef<RNText, TextProps>(({ style, children, ...rest }, ref) => {
  const nested = useContext(NestedTextContext);
  const computed = buildStyle(style, nested, containsDigit(children));
  return (
    <NestedTextContext.Provider value={true}>
      <RNText ref={ref} {...rest} style={computed}>
        {children}
      </RNText>
    </NestedTextContext.Provider>
  );
});
Text.displayName = 'AppText';

export const TextInput = React.forwardRef<RNTextInput, TextInputProps>(({ style, ...rest }, ref) => {
  const computed = buildStyle(style as StyleProp<TextStyle>, false, true);
  return <RNTextInput ref={ref} {...rest} style={computed} />;
});
TextInput.displayName = 'AppTextInput';

