import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';

export interface RawAndroidBankNotification {
  id: string;
  packageName: string;
  title: string;
  body: string;
  fullText: string;
  timestamp: number;
}

const NativeListener =
  Platform.OS === 'android' ? NativeModules?.KeAhorroNotificationListener : null;

export const NativeNotificationListener = {
  /**
   * Indica si el APK instalado incluye el servicio nativo KeAhorroNotificationListenerService.
   */
  isAvailable(): boolean {
    return Platform.OS === 'android' && !!NativeListener;
  },

  /**
   * Verifica si el usuario ya otorgó el permiso "Acceso a notificaciones" a keAhorro en Ajustes de Android.
   */
  async hasPermission(): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      const granted = await NativeListener.hasPermission();
      return !!granted;
    } catch {
      return false;
    }
  },

  /**
   * Abre directamente la pantalla del sistema Android "Acceso a notificaciones" (ACTION_NOTIFICATION_LISTENER_SETTINGS)
   * para que el usuario active el interruptor de keAhorro.
   */
  async openPermissionSettings(): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      await NativeListener.openPermissionSettings();
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Drena todas las notificaciones bancarias capturadas en segundo plano mientras la app estaba cerrada.
   */
  async consumePendingNotifications(): Promise<RawAndroidBankNotification[]> {
    if (!this.isAvailable()) return [];
    try {
      const rawJson = await NativeListener.consumePendingNotifications();
      if (!rawJson || typeof rawJson !== 'string') return [];
      const parsed = JSON.parse(rawJson);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  /**
   * Escucha en tiempo real las notificaciones bancarias interceptadas por Android mientras la app está en memoria.
   */
  subscribe(onNotification: (notif: RawAndroidBankNotification) => void): () => void {
    if (Platform.OS !== 'android') return () => {};
    const sub = DeviceEventEmitter.addListener(
      'onKeAhorroBankNotification',
      (payload: RawAndroidBankNotification) => {
        if (payload && payload.fullText) {
          onNotification(payload);
        }
      }
    );
    return () => {
      try {
        sub.remove();
      } catch {}
    };
  },
};
