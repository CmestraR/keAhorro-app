import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { FinancialProvider, useFinancial } from './src/context/FinancialContext';
import { AlertProvider, useAlert } from './src/context/AlertContext';
import { ThemeProvider, useAppTheme } from './src/context/ThemeContext';
import { AIProvider, useAI } from './src/context/AIContext';
import { NotificationService } from './src/utils/notificationService';
import { UpdateService } from './src/utils/updateService';
import { loadAppFonts } from './src/utils/fonts';
import { GeminiExtractedTransaction } from './src/utils/geminiService';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { CardsScreen } from './src/screens/CardsScreen';
import { AccountsScreen } from './src/screens/AccountsScreen';
import { TransactionsScreen } from './src/screens/TransactionsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { AddTransactionModal } from './src/components/transactions/AddTransactionModal';
import { VoiceAssistantOverlay } from './src/components/transactions/VoiceAssistantOverlay';
import { AISettingsModal } from './src/components/settings/AISettingsModal';
import { CustomIcon } from './src/components/common/CustomIcon';
import { Text } from './src/components/common/AppText';
import { TouchableOpacity } from './src/components/common/Touchable';
import { FadeSlideIn } from './src/components/common/FadeSlideIn';

function MainApp() {
  const { isLoading, creditCards } = useFinancial();
  const { showConfirm, showSuccess } = useAlert();
  const { colors, isDark } = useAppTheme();
  const { voiceHoldEnabled } = useAI();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'cards' | 'accounts' | 'transactions' | 'settings'>('dashboard');
  const [filterAccountId, setFilterAccountId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isVoiceOverlayOpen, setIsVoiceOverlayOpen] = useState(false);
  const [aiExtractedForModal, setAiExtractedForModal] = useState<GeminiExtractedTransaction | null>(null);

  useEffect(() => {
    NotificationService.init();
    if (creditCards && creditCards.length > 0) {
      NotificationService.scheduleCardReminders(creditCards);
    }
  }, [creditCards]);

  useEffect(() => {
    if (!isLoading) {
      UpdateService.checkOnStartupQuietly(() => {
        showConfirm(
          '¡Actualización Disponible!',
          'Se ha publicado una nueva versión con mejoras para la aplicación. ¿Deseas descargarla y aplicarla ahora?',
          async () => {
            showSuccess('Descargando...', 'Aplicando actualización instantánea...');
            await UpdateService.fetchAndApplyUpdate();
          },
          'Actualizar Ahora',
          'Más Tarde'
        );
      });
    }
  }, [isLoading]);

  // Espacio seguro superior e inferior para Android (POCO / Notch / Isla Dinámica)
  const topSafePadding = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 0
  ) + 6;

  const bottomSafePadding = Math.max(insets.bottom, 8);

  const handleNavigateToTab = (
    tab: string,
    params?: { accountId?: string }
  ) => {
    if (params?.accountId) {
      setFilterAccountId(params.accountId);
    } else if (tab === 'transactions') {
      setFilterAccountId(null);
    }
    setActiveTab(tab as any);
  };

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={colors.background}
        />
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>Cargando tus finanzas...</Text>
      </View>
    );
  }

  const renderActiveScreen = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardScreen onNavigateToTab={handleNavigateToTab} />;
      case 'cards':
        return <CardsScreen />;
      case 'accounts':
        return <AccountsScreen />;
      case 'transactions':
        return (
          <TransactionsScreen
            filterAccountId={filterAccountId}
            onClearAccountFilter={() => setFilterAccountId(null)}
          />
        );
      case 'settings':
        return <SettingsScreen />;
      default:
        return <DashboardScreen onNavigateToTab={handleNavigateToTab} />;
    }
  };

  const navItems = [
    { id: 'dashboard', label: 'Inicio', icon: 'LayoutDashboard' },
    { id: 'cards', label: 'Tarjetas', icon: 'CreditCard' },
    { id: 'add_action', label: 'Nuevo', icon: 'Plus', isAction: true },
    { id: 'accounts', label: 'Cuentas', icon: 'Landmark' },
    { id: 'transactions', label: 'Historial', icon: 'Receipt' },
  ];

  return (
    <View style={[styles.container, { paddingTop: topSafePadding, backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
        translucent={true}
      />

      {/* Pantalla Activa con transición suave (fade + slide-up 200ms) */}
      <FadeSlideIn key={activeTab} style={styles.screenContainer}>
        {renderActiveScreen()}
      </FadeSlideIn>

      {/* Barra de Navegación Inferior Flotante con Botón Central */}
      <View style={[styles.bottomNavWrapper, { paddingBottom: bottomSafePadding }]}>
        <View
          style={[
            styles.bottomNav,
            {
              backgroundColor: colors.navBackground,
              borderColor: colors.border,
            },
          ]}
        >
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            const isCenterAction = item.isAction;

            if (isCenterAction) {
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.centerNavBtn}
                  onPress={() => {
                    setAiExtractedForModal(null);
                    setIsAddModalOpen(true);
                  }}
                  delayLongPress={300}
                  onLongPress={() => {
                    if (voiceHoldEnabled) {
                      setIsVoiceOverlayOpen(true);
                    } else {
                      setAiExtractedForModal(null);
                      setIsAddModalOpen(true);
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <View
                    style={[
                      styles.centerIconWrapper,
                      {
                        backgroundColor: colors.success,
                        shadowColor: colors.success,
                        borderColor: colors.background,
                      },
                    ]}
                  >
                    <CustomIcon name="Plus" size={24} color="#FFFFFF" />
                    {voiceHoldEnabled && (
                      <View
                        style={[
                          styles.voiceBadgeDot,
                          { backgroundColor: '#6366F1', borderColor: colors.background },
                        ]}
                      >
                        <CustomIcon name="Mic" size={9} color="#FFFFFF" />
                      </View>
                    )}
                  </View>
                  <Text style={[styles.centerNavLabel, { color: colors.successLight }]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            }

            return (
              <TouchableOpacity
                key={item.id}
                style={styles.navTab}
                onPress={() => {
                  if (item.id === 'transactions') {
                    setFilterAccountId(null);
                  }
                  setActiveTab(item.id as any);
                }}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.iconWrapper,
                    isActive && { backgroundColor: colors.primary },
                  ]}
                >
                  <CustomIcon
                    name={item.icon}
                    size={19}
                    color={isActive ? '#FFFFFF' : colors.textMuted}
                  />
                </View>
                <Text
                  style={[
                    styles.navLabel,
                    { color: colors.textMuted },
                    isActive && { color: colors.textPrimary, fontWeight: '700' },
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Modal Global de Transacción Rápida */}
      <AddTransactionModal
        visible={isAddModalOpen}
        aiExtractedData={aiExtractedForModal}
        onClose={() => {
          setIsAddModalOpen(false);
          setAiExtractedForModal(null);
        }}
      />

      {/* Overlay Futurista de Dictado por Voz al mantener presionado (+) */}
      <VoiceAssistantOverlay
        visible={isVoiceOverlayOpen}
        onClose={() => setIsVoiceOverlayOpen(false)}
        onReviewInForm={(extracted) => {
          setIsVoiceOverlayOpen(false);
          setAiExtractedForModal(extracted);
          setIsAddModalOpen(true);
        }}
      />

      {/* Panel de Configuración de IA & Integraciones */}
      <AISettingsModal />
    </View>
  );
}

export default function App() {
  const [, setFontsTick] = useState(0);

  useEffect(() => {
    loadAppFonts().then((loaded) => {
      if (loaded) setFontsTick((n) => n + 1);
    });
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AlertProvider>
          <AIProvider>
            <FinancialProvider>
              <MainApp />
            </FinancialProvider>
          </AIProvider>
        </AlertProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  screenContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '500',
  },
  bottomNavWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 12,
  },
  bottomNav: {
    flexDirection: 'row',
    borderRadius: 26,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    alignItems: 'center',
    elevation: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  navTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  iconWrapper: {
    width: 36,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerNavBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginTop: -10, // Eleva el botón central para máxima ergonomía
  },
  centerIconWrapper: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    borderWidth: 3,
  },
  voiceBadgeDot: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerNavLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  navLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
});
