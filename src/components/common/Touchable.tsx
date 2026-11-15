import React, { useRef } from 'react';
import {
  Animated,
  Easing,
  GestureResponderEvent,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface TouchableOpacityProps extends Omit<PressableProps, 'style' | 'children'> {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  /** Compatibilidad con TouchableOpacity. `activeOpacity={1}` desactiva el feedback (p. ej. fondos de modales). */
  activeOpacity?: number;
}

/**
 * Reemplazo "drop-in" de TouchableOpacity con micro-interacción táctil:
 * al presionar se reduce a escala 0.97 en 150 ms y regresa al soltar
 * (equivalente nativo de `transition-transform duration-150 active:scale-[0.97]`).
 * Mantiene la misma API (onPress, onLongPress, disabled, style, ...).
 */
export const TouchableOpacity = React.forwardRef<View, TouchableOpacityProps>(
  ({ style, children, activeOpacity, onPressIn, onPressOut, disabled, ...rest }, ref) => {
    const scale = useRef(new Animated.Value(1)).current;
    const feedback = activeOpacity !== 1;

    const animateTo = (toValue: number) => {
      Animated.timing(scale, {
        toValue,
        duration: 150,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    };

    const handlePressIn = (e: GestureResponderEvent) => {
      if (feedback && !disabled) animateTo(0.97);
      onPressIn?.(e);
    };

    const handlePressOut = (e: GestureResponderEvent) => {
      if (feedback) animateTo(1);
      onPressOut?.(e);
    };

    const flat = StyleSheet.flatten(style) as ViewStyle | undefined;
    const existingTransform = Array.isArray(flat?.transform) ? flat.transform : [];

    return (
      <AnimatedPressable
        ref={ref}
        disabled={disabled}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          style,
          feedback && { transform: [...existingTransform, { scale }] },
        ] as any}
        {...rest}
      >
        {children}
      </AnimatedPressable>
    );
  }
);
TouchableOpacity.displayName = 'TouchableOpacity';

