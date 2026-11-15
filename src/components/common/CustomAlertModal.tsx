import React from 'react';
import {
  Modal,
  View,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { CustomIcon } from './CustomIcon';
import { useAppTheme } from '../../context/ThemeContext';
import { alpha } from './Theme';
import { Text } from './AppText';
import { TouchableOpacity } from './Touchable';

export type AlertType = 'success' | 'info' | 'warning' | 'error' | 'confirm';

export interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export interface CustomAlertOptions {
  title: string;
  message: string;
  type?: AlertType;
  buttons?: AlertButton[];
  icon?: string;
}

interface CustomAlertModalProps {
  visible: boolean;
  options: CustomAlertOptions | null;
  onClose: () => void;
}

const { width } = Dimensions.get('window');

export const CustomAlertModal: React.FC<CustomAlertModalProps> = ({
  visible,
  options,
  onClose,
}) => {
  const { colors } = useAppTheme();

  if (!options) return null;

  const {
    title,
    message,
    type = 'info',
    buttons = [{ text: 'Entendido', style: 'default' }],
  } = options;

  const getIconAndColor = () => {
    switch (type) {
      case 'success':
        return { icon: 'CheckCircle2', color: colors.success, bg: colors.successBg, border: colors.success };
      case 'warning':
        return { icon: 'AlertTriangle', color: colors.warning, bg: colors.warningBg, border: colors.warning };
      case 'error':
        return { icon: 'AlertCircle', color: colors.danger, bg: colors.dangerBg, border: colors.danger };
      case 'confirm':
        return { icon: 'HelpCircle', color: colors.primaryLight, bg: alpha(colors.primary, 0.15), border: colors.primary };
      case 'info':
      default:
        return { icon: 'Sparkles', color: colors.primary, bg: alpha(colors.primary, 0.15), border: colors.primary };
    }
  };

  const { icon, color, bg, border } = getIconAndColor();

  const handleButtonPress = (btn: AlertButton) => {
    onClose();
    if (btn.onPress) {
      setTimeout(() => {
        btn.onPress!();
      }, 100);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View
          style={[
            styles.dialogContainer,
            {
              backgroundColor: colors.surface,
              borderColor: alpha(border, 0.4),
            },
          ]}
        >
          {/* Icon Badge */}
          <View
            style={[
              styles.iconWrapper,
              { backgroundColor: bg, borderColor: alpha(border, 0.6) },
            ]}
          >
            <CustomIcon name={options.icon || icon} size={28} color={color} />
          </View>

          {/* Title & Message */}
          <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
          <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>

          {/* Action Buttons */}
          <View style={[styles.buttonsRow, buttons.length > 2 && styles.buttonsCol]}>
            {buttons.map((btn, index) => {
              const isCancel = btn.style === 'cancel';
              const isDestructive = btn.style === 'destructive';

              return (
                <TouchableOpacity
                  key={index}
                  activeOpacity={0.8}
                  style={[
                    styles.button,
                    isCancel && {
                      backgroundColor: colors.surfaceElevated,
                      borderWidth: 1,
                      borderColor: colors.borderLight,
                    },
                    isDestructive && { backgroundColor: colors.danger, flex: 1 },
                    !isCancel && !isDestructive && { backgroundColor: colors.primary, flex: 1 },
                    buttons.length === 2 && { flex: 1 },
                  ]}
                  onPress={() => handleButtonPress(btn)}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      isCancel && { color: colors.textSecondary },
                      (isDestructive || !isCancel) && { color: '#FFFFFF' },
                    ]}
                  >
                    {btn.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  dialogContainer: {
    width: '100%',
    maxWidth: width - 48,
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    alignItems: 'center',
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 25,
  },
  iconWrapper: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1.5,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 22,
    paddingHorizontal: 6,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  buttonsCol: {
    flexDirection: 'column',
  },
  button: {
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
