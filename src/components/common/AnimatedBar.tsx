import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, ViewStyle } from 'react-native';

interface AnimatedBarProps {
  /** Porcentaje 0–100 de la barra. */
  percent: number;
  color: string;
  /** Estilo del relleno (alto, radio, etc.). El ancho lo controla el componente. */
  style?: StyleProp<ViewStyle>;
  /** Duración en ms (por defecto 500, equivalente a `duration-500 ease-out`). */
  duration?: number;
}

/**
 * Relleno de barra de progreso que crece suavemente de 0% a su valor real
 * al montarse y se anima ante cualquier cambio posterior del porcentaje.
 */
export const AnimatedBar: React.FC<AnimatedBarProps> = ({ percent, color, style, duration = 500 }) => {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const target = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
    Animated.timing(progress, {
      toValue: target,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // el ancho es una propiedad de layout
    }).start();
  }, [percent, duration, progress]);

  const width = progress.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return <Animated.View style={[{ height: '100%' }, style, { width, backgroundColor: color }]} />;
};

