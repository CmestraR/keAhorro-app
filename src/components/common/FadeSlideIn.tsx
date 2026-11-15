import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, ViewStyle } from 'react-native';

interface FadeSlideInProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Duración en ms (por defecto 200). */
  duration?: number;
  /** Desplazamiento vertical inicial en px. */
  distance?: number;
}

/**
 * Transición suave de entrada (fade + slide-up de 200 ms).
 * Úsalo con una `key` que cambie para animar al cambiar de pestaña o de vista.
 */
export const FadeSlideIn: React.FC<FadeSlideInProps> = ({
  children,
  style,
  duration = 200,
  distance = 12,
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(distance)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [duration, opacity, translateY]);

  return (
    <Animated.View style={[{ flex: 1 }, style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
};

