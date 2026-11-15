import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Linking,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useFinancial } from '../context/FinancialContext';
import { useAlert } from '../context/AlertContext';
import { useAppTheme } from '../context/ThemeContext';
import { useAI } from '../context/AIContext';
import { NotificationService } from '../utils/notificationService';
import { Layout, alpha } from '../components/common/Theme';
import { CustomIcon } from '../components/common/CustomIcon';
import { Text } from '../components/common/AppText';
import { TouchableOpacity } from '../components/common/Touchable';
import { ManageCategoriesModal } from '../components/categories/ManageCategoriesModal';
import { UpdateService } from '../utils/updateService';
import { APP_RELEASE_INFO } from '../utils/versionInfo';

const CURRENCIES = [
  { code: 'COP', label: 'Peso Colombiano (COP $)' },
  { code: 'USD', label: 'Dólar Estadounidense (USD $)' },
  { code: 'MXN', label: 'Peso Mexicano (MXN $)' },
  { code: 'EUR', label: 'Euro (EUR €)' },
];

export const SettingsScreen: React.FC = () => {
  const { currency, setCurrencyPreference, loadDemoData, resetDatabase, creditCards } = useFinancial();
  const { showSuccess, showWarning, showConfirm } = useAlert();
  const { mode, setMode, colors } = useAppTheme();
  const {
    geminiApiKey,
    geminiModel,
    voiceHoldEnabled,
    autoCategorizeEnabled,
    openAISettingsModal,
  } = useAI();
  const [manageCatsVisible, setManageCatsVisible] = useState(false);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const appInfo = UpdateService.getAppInfo();

  const handleCheckUpdatesManual = async () => {
    setIsCheckingUpdates(true);
    try {
      const result = await UpdateService.checkForUpdate();
      if (result.isAvailable) {
        showConfirm(
          '¡Actualización Disponible!',
          'Se ha encontrado una nueva versión con mejoras para la aplicación. ¿Deseas descargarla y aplicarla ahora mismo?',
          async () => {
            showSuccess('Descargando...', 'Aplicando actualización instantánea...');
            await UpdateService.fetchAndApplyUpdate();
          },
          'Actualizar Ahora',
          'Más Tarde'
        );
      } else {
        showSuccess('Versión al Día', result.message);
      }
    } catch {
      showWarning('Aviso', 'No fue posible verificar actualizaciones en este momento.');
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  const handleReset = () => {
    showConfirm(
      '¿Restablecer Base de Datos?',
      'Esta acción borrará todas las cuentas, tarjetas y transacciones locales de tu dispositivo. No se puede deshacer.',
      async () => {
        await resetDatabase();
        showSuccess('Restablecido', 'La base de datos ha sido vaciada con éxito.');
      },
      'Borrar Todo',
      'Cancelar',
      true
    );
  };

  const handleSeed = () => {
    showConfirm(
      'Cargar Datos de Ejemplo',
      'Se generarán cuentas bancarias, tarjetas de crédito (Visa, Nu) y compras a cuotas para demostración.',
      async () => {
        await loadDemoData();
        showSuccess('¡Listo!', 'Datos de ejemplo cargados correctamente.');
      },
      'Cargar Datos',
      'Cancelar'
    );
  };

  const handleTestNotification = async () => {
    const firstCard = creditCards[0];
    if (firstCard) {
      await NotificationService.sendImmediateNotification(
        `⏰ Alerta de Corte: ${firstCard.name}`,
        `Tu fecha de corte se aproxima en 3 días (Día ${firstCard.cutOffDay}). Revisa tu extracto y consumo en la app.`,
        { cardId: firstCard.id }
      );
      showSuccess(
        '🔔 ¡Notificación Enviada!',
        `Se ha disparado una notificación en la barra superior de tu teléfono para ${firstCard.name}. Desliza hacia abajo tu barra de estado para verla.`
      );
    } else {
      showWarning(
        'Sin Tarjetas Registradas',
        'Registra una tarjeta de crédito primero para recibir recordatorios automáticos de corte y fecha de pago.'
      );
    }
  };

  return (
    <View style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: Layout.bottomNavSpace + 24 }}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        bounces={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.tag, { color: colors.primaryLight }]}>CONFIGURACIÓN</Text>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Ajustes & Opciones</Text>
        </View>

        {/* Inteligencia Artificial & APIs */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surfaceCard,
              borderColor: alpha(colors.primary, 0.45),
              borderWidth: 1.5,
            },
          ]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <CustomIcon name="Sparkles" size={18} color={colors.success} />
              <Text style={[styles.cardTitle, { color: colors.textPrimary, marginBottom: 0 }]}>
                Inteligencia Artificial & APIs
              </Text>
            </View>
            <View
              style={{
                backgroundColor: geminiApiKey
                  ? alpha(colors.success, 0.16)
                  : alpha(colors.warning, 0.16),
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 8,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: geminiApiKey ? colors.success : colors.warning,
                }}
              >
                {geminiApiKey ? 'Gemini Activo' : 'Modo Local'}
              </Text>
            </View>
          </View>
          <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
            Configura tu API Key de Google AI Studio (Gemini), modelo de velocidad ({geminiModel}), Google Maps y dictado por voz al mantener presionado (+).
          </Text>

          <TouchableOpacity
            style={[
              styles.actionRow,
              {
                backgroundColor: alpha(colors.primary, 0.14),
                borderColor: alpha(colors.primary, 0.35),
                borderWidth: 1,
                marginBottom: 0,
              },
            ]}
            onPress={openAISettingsModal}
          >
            <View style={[styles.actionIconBox, { backgroundColor: colors.primary }]}>
              <CustomIcon name="Sparkles" size={18} color="#FFFFFF" />
            </View>
            <View style={styles.actionTextBox}>
              <Text style={[styles.actionTitle, { color: colors.textPrimary }]}>
                Configuración de IA & Integraciones
              </Text>
              <Text style={[styles.actionSub, { color: colors.textSecondary }]}>
                Voz (+): {voiceHoldEnabled ? 'Activo' : 'Inactivo'} • Autocategorizar: {autoCategorizeEnabled ? 'Activo' : 'Inactivo'}
              </Text>
            </View>
            <CustomIcon name="ChevronRight" size={18} color={colors.primaryLight} />
          </TouchableOpacity>
        </View>

        {/* Apariencia (Tema Claro Cálido / Oscuro Alto Contraste) */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surfaceCard, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Apariencia & Contraste</Text>
          <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
            Elige entre el Modo Oscuro de Alto Contraste o el Modo Claro Cálido para máxima legibilidad:
          </Text>

          <View style={styles.themeSelectorRow}>
            <TouchableOpacity
              style={[
                styles.themeOption,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: mode === 'dark' ? colors.primary : colors.borderLight,
                },
                mode === 'dark' && {
                  backgroundColor: alpha(colors.primary, 0.16),
                },
              ]}
              onPress={() => setMode('dark')}
            >
              <CustomIcon
                name="Moon"
                size={18}
                color={mode === 'dark' ? colors.primaryLight : colors.textSecondary}
              />
              <Text
                style={[
                  styles.themeOptionTitle,
                  { color: mode === 'dark' ? colors.textPrimary : colors.textSecondary },
                ]}
              >
                Oscuro
              </Text>
              <Text style={[styles.themeOptionSub, { color: colors.textMuted }]}>
                Alto contraste
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.themeOption,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: mode === 'light' ? colors.primary : colors.borderLight,
                },
                mode === 'light' && {
                  backgroundColor: alpha(colors.primary, 0.16),
                },
              ]}
              onPress={() => setMode('light')}
            >
              <CustomIcon
                name="Sun"
                size={18}
                color={mode === 'light' ? colors.warning : colors.textSecondary}
              />
              <Text
                style={[
                  styles.themeOptionTitle,
                  { color: mode === 'light' ? colors.textPrimary : colors.textSecondary },
                ]}
              >
                Claro Cálido
              </Text>
              <Text style={[styles.themeOptionSub, { color: colors.textMuted }]}>
                Lectura diurna
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Selector de Moneda */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surfaceCard, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Moneda Principal</Text>
          <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
            Formato de moneda que se usará en toda la aplicación:
          </Text>

          {CURRENCIES.map((c) => {
            const isSelected = currency === c.code;
            return (
              <TouchableOpacity
                key={c.code}
                style={[
                  styles.currencyRow,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.borderLight,
                  },
                  isSelected && {
                    backgroundColor: alpha(colors.primary, 0.18),
                    borderColor: colors.primaryLight,
                  },
                ]}
                onPress={() => setCurrencyPreference(c.code)}
              >
                <Text
                  style={[
                    styles.currencyText,
                    { color: colors.textSecondary },
                    isSelected && { color: colors.textPrimary, fontWeight: 'bold' },
                  ]}
                >
                  {c.label}
                </Text>
                {isSelected && <CustomIcon name="Check" size={16} color={colors.successLight} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Categorías Inteligentes & Reglas de IA */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surfaceCard, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
            Categorías & Reglas de IA
          </Text>
          <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
            Crea categorías personalizadas y asigna palabras clave para que la app autocomplete tus gastos en automático:
          </Text>

          <TouchableOpacity
            style={[styles.actionRow, { backgroundColor: colors.surfaceElevated }]}
            onPress={() => setManageCatsVisible(true)}
          >
            <View style={[styles.actionIconBox, { backgroundColor: colors.successBg }]}>
              <CustomIcon name="Sparkles" size={16} color={colors.success} />
            </View>
            <View style={styles.actionTextBox}>
              <Text style={[styles.actionTitle, { color: colors.textPrimary }]}>
                Gestionar Categorías & Palabras Clave
              </Text>
              <Text style={[styles.actionSub, { color: colors.textSecondary }]}>
                Configura reglas de detección inteligente
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Notificaciones & Recordatorios de Corte */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surfaceCard, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
            Alertas & Recordatorios de Tarjetas
          </Text>
          <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
            La app monitorea automáticamente tus días de corte y de pago para avisarte 3 días antes de cada vencimiento:
          </Text>

          <TouchableOpacity
            style={[styles.actionRow, { backgroundColor: colors.surfaceElevated }]}
            onPress={handleTestNotification}
          >
            <View style={[styles.actionIconBox, { backgroundColor: colors.warningBg }]}>
              <CustomIcon name="Bell" size={16} color={colors.warning} />
            </View>
            <View style={styles.actionTextBox}>
              <Text style={[styles.actionTitle, { color: colors.textPrimary }]}>
                Probar Alerta en Barra de Notificaciones
              </Text>
              <Text style={[styles.actionSub, { color: colors.textSecondary }]}>
                Envía un aviso real a la barra superior de tu celular
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Privacidad & Datos */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surfaceCard, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
            Datos & Almacenamiento Local
          </Text>
          <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
            Toda tu información financiera se almacena de forma 100% segura y privada en tu dispositivo mediante SQLite. No requiere conexión a internet.
          </Text>

          <TouchableOpacity
            style={[styles.actionRow, { backgroundColor: colors.surfaceElevated }]}
            onPress={handleSeed}
          >
            <View
              style={[
                styles.actionIconBox,
                { backgroundColor: alpha(colors.primary, 0.15) },
              ]}
            >
              <CustomIcon name="Sparkles" size={16} color={colors.primaryLight} />
            </View>
            <View style={styles.actionTextBox}>
              <Text style={[styles.actionTitle, { color: colors.textPrimary }]}>
                Cargar Datos de Ejemplo
              </Text>
              <Text style={[styles.actionSub, { color: colors.textSecondary }]}>
                Genera cuentas, tarjetas de crédito y cuotas de prueba
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionRow, { backgroundColor: colors.dangerBg }]}
            onPress={handleReset}
          >
            <View style={[styles.actionIconBox, { backgroundColor: alpha(colors.danger, 0.2) }]}>
              <CustomIcon name="Trash2" size={16} color={colors.danger} />
            </View>
            <View style={styles.actionTextBox}>
              <Text style={[styles.actionTitle, { color: colors.danger }]}>
                Vaciar Base de Datos
              </Text>
              <Text style={[styles.actionSub, { color: colors.textSecondary }]}>
                Elimina todas las cuentas, tarjetas y movimientos
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Sistema de Versión y Actualizaciones OTA */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surfaceCard, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
            Versión & Actualizaciones
          </Text>
          <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
            Administra las actualizaciones instantáneas (Over-The-Air) y el estado de tu versión instalada:
          </Text>

          <TouchableOpacity
            style={[styles.actionRow, { backgroundColor: colors.surfaceElevated }]}
            onPress={handleCheckUpdatesManual}
            disabled={isCheckingUpdates}
            activeOpacity={0.8}
          >
            <View
              style={[
                styles.actionIconBox,
                { backgroundColor: alpha(colors.primary, 0.15) },
              ]}
            >
              {isCheckingUpdates ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <CustomIcon name="RefreshCw" size={16} color={colors.primary} />
              )}
            </View>
            <View style={styles.actionTextBox}>
              <Text style={[styles.actionTitle, { color: colors.textPrimary }]}>
                {isCheckingUpdates ? 'Buscando Actualizaciones...' : 'Buscar Actualizaciones'}
              </Text>
              <Text style={[styles.actionSub, { color: colors.textSecondary }]}>
                Comprueba si hay mejoras OTA disponibles
              </Text>
            </View>
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: colors.divider }]} />

          {/* Tarjeta de Novedades de la Versión Activa */}
          <View
            style={[
              styles.releaseBadgeCard,
              {
                backgroundColor: alpha(colors.primary, 0.08),
                borderColor: alpha(colors.primary, 0.25),
              },
            ]}
          >
            <View style={styles.releaseHeaderRow}>
              <View style={[styles.releasePill, { backgroundColor: colors.primary }]}>
                <Text style={styles.releasePillText}>v{APP_RELEASE_INFO.version}</Text>
              </View>
              <Text style={[styles.releaseDateText, { color: colors.textMuted }]}>
                {APP_RELEASE_INFO.buildDate}
              </Text>
            </View>
            <Text style={[styles.releaseCodeName, { color: colors.textPrimary }]}>
              {APP_RELEASE_INFO.codeName}
            </Text>

            <View style={styles.releaseHighlightsList}>
              {APP_RELEASE_INFO.highlights.map((item, idx) => (
                <View key={idx} style={styles.highlightItem}>
                  <CustomIcon name="CheckCircle2" size={14} color={colors.success} />
                  <Text style={[styles.highlightText, { color: colors.textSecondary }]}>
                    {item}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.divider }]} />

          <View style={[styles.infoRow, { borderBottomColor: colors.divider }]}>
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Versión de Aplicación</Text>
            <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
              v{APP_RELEASE_INFO.version} (v{appInfo.appVersion})
            </Text>
          </View>
          <View style={[styles.infoRow, { borderBottomColor: colors.divider }]}>
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Compilación (Build)</Text>
            <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
              Build {appInfo.versionCode}
            </Text>
          </View>
          <View style={[styles.infoRow, { borderBottomColor: colors.divider }]}>
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Runtime Version</Text>
            <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
              {appInfo.runtimeVersion}
            </Text>
          </View>
          <View style={[styles.infoRow, { borderBottomColor: colors.divider }]}>
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Canal EAS</Text>
            <Text style={[styles.infoValue, { color: colors.primaryLight, fontWeight: 'bold' }]}>
              {appInfo.channel.toUpperCase()}
            </Text>
          </View>
          <View style={[styles.infoRow, { borderBottomColor: colors.divider }]}>
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Revisión OTA</Text>
            <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
              {appInfo.updateId
                ? `Update ${appInfo.updateId.substring(0, 8)}`
                : `Bundle Base (v${appInfo.appVersion})`}
            </Text>
          </View>
        </View>

        {/* Info App & Creador */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surfaceCard, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Acerca de la App</Text>

          {/* Tarjeta del Creador */}
          <View
            style={[
              styles.creatorCard,
              { backgroundColor: colors.inset, borderColor: colors.borderLight },
            ]}
          >
            <Image
              source={require('../../assets/icon.png')}
              style={styles.creatorAppLogo}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.creatorAppTitle, { color: colors.textPrimary }]}>
                keAhorro
              </Text>
              <Text style={[styles.creatorAuthorText, { color: colors.textSecondary }]}>
                Creado Por:{' '}
                <Text style={[styles.creatorNameText, { color: colors.successLight }]}>
                  Cristian Mestra
                </Text>
              </Text>
            </View>
          </View>

          {/* Botón de Instagram */}
          <TouchableOpacity
            style={[
              styles.instagramButton,
              {
                backgroundColor: colors.dangerBg,
                borderColor: alpha(colors.danger, 0.3),
              },
            ]}
            onPress={() => {
              Linking.openURL('https://www.instagram.com/cristian_mr17?igsi=cW9wZmQzMHdwM3ph');
            }}
            activeOpacity={0.85}
          >
            <View style={styles.instagramIconBadge}>
              <CustomIcon name="Instagram" size={18} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.instagramBtnTitle, { color: colors.textPrimary }]}>
                Seguir al Creador
              </Text>
              <Text style={[styles.instagramBtnSub, { color: colors.dangerLight }]}>
                @cristian_mr17 en Instagram
              </Text>
            </View>
            <CustomIcon name="ExternalLink" size={16} color={colors.danger} />
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: colors.divider }]} />

          <View style={[styles.infoRow, { borderBottomColor: colors.divider }]}>
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Versión</Text>
            <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
              1.0.0 (Android Ready)
            </Text>
          </View>
          <View style={[styles.infoRow, { borderBottomColor: colors.divider }]}>
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Motor Financiero</Text>
            <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
              Amortización Francesa & E.M.
            </Text>
          </View>
          <View style={[styles.infoRow, { borderBottomColor: colors.divider }]}>
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Base de Datos</Text>
            <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
              SQLite Local (Offline First)
            </Text>
          </View>
        </View>
      </ScrollView>

      <ManageCategoriesModal
        visible={manageCatsVisible}
        onClose={() => setManageCatsVisible(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  header: {
    paddingVertical: 14,
  },
  tag: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    marginBottom: 14,
    lineHeight: 19,
  },
  themeSelectorRow: {
    flexDirection: 'row',
    gap: 10,
  },
  themeOption: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    gap: 4,
  },
  themeOptionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 2,
  },
  themeOptionSub: {
    fontSize: 13,
  },
  currencyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    minHeight: Layout.minTouchHeight,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
  },
  currencyText: {
    fontSize: 14,
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    gap: 12,
  },
  actionIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionTextBox: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  actionSub: {
    fontSize: 13,
    marginTop: 2,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: 1,
  },
  infoLabel: {
    fontSize: 13,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  creatorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    padding: 12,
    marginTop: 8,
    marginBottom: 10,
    borderWidth: 1,
  },
  creatorAppLogo: {
    width: 46,
    height: 46,
    borderRadius: 10,
  },
  creatorAppTitle: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  creatorAuthorText: {
    fontSize: 13,
    marginTop: 2,
  },
  creatorNameText: {
    fontWeight: 'bold',
  },
  instagramButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
  },
  instagramIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E1306C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  instagramBtnTitle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  instagramBtnSub: {
    fontSize: 13,
    marginTop: 1,
  },
  divider: {
    height: 1,
    marginVertical: 6,
  },
  releaseBadgeCard: {
    borderRadius: 14,
    padding: 12,
    marginVertical: 4,
    borderWidth: 1,
  },
  releaseHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  releasePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  releasePillText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  releaseDateText: {
    fontSize: 13,
    fontWeight: '500',
  },
  releaseCodeName: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  releaseHighlightsList: {
    gap: 5,
  },
  highlightItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  highlightText: {
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
});
