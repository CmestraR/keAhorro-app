import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  ScrollView,
  Switch,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { parseBankNotification, ParsedBankMessage } from '../../utils/bankNotificationParser';
import {
  AutoImportedNotificationLog,
  getAutoImportedHistory,
  processAndAutoSaveBankNotification,
  removeAutoImportedHistoryEntry,
} from '../../utils/autoNotificationImporter';
import { useFinancial } from '../../context/FinancialContext';
import { useAlert } from '../../context/AlertContext';
import { useAppTheme } from '../../context/ThemeContext';
import { formatCurrency } from '../../utils/formatters';
import { alpha } from './Theme';
import { CustomIcon } from './CustomIcon';
import { Text, TextInput } from './AppText';
import { TouchableOpacity } from './Touchable';

interface QuickIslandBarProps {
  onOpenAddModal: (prefill?: Partial<ParsedBankMessage>) => void;
  /** 'pill' (por defecto): banner completo. 'icon': ícono con badge para el header. */
  variant?: 'pill' | 'icon';
}

const REAL_BANK_SIMULATIONS = [
  {
    label: 'Bancolombia • Compra Débito',
    badge: 'Gasto',
    color: '#F59E0B',
    text: 'Bancolombia: Compraste $45.900,00 en D1 SAS con tu T.Deb *4829, el 19/11/2026 a las 14:32.',
  },
  {
    label: 'Bancolombia • Te Transfieren / Pagan',
    badge: 'Ingreso',
    color: '#10B981',
    text: 'Bancolombia: Recibiste una transferencia por $250.000,00 de ANDRES PEREZ en tu cuenta *1234, el 19/11/2026 a las 10:15.',
  },
  {
    label: 'RappiCard • Tarjeta de Crédito',
    badge: 'T. Crédito',
    color: '#6366F1',
    text: 'RappiCard: Compra aprobada por $64.900 en CREPES Y WAFFLES con tu tarjeta de crédito RappiCard *9012 el 19/11/2026.',
  },
  {
    label: 'Nequi • Envío de Plata',
    badge: 'Gasto',
    color: '#EC4899',
    text: 'Nequi: Enviaste $35.000 a Carlos Mario el 19/11/2026 a las 16:40.',
  },
  {
    label: 'Nu Colombia • Compra Tarjeta',
    badge: 'T. Crédito',
    color: '#8B5CF6',
    text: 'Nu: Compra aprobada por $78.900,00 en NETFLIX.COM con tu tarjeta *4411 a 1 cuota.',
  },
];

export const QuickIslandBar: React.FC<QuickIslandBarProps> = ({
  onOpenAddModal,
  variant = 'pill',
}) => {
  const {
    accounts,
    creditCards,
    categories,
    currency,
    addTransaction,
    deleteTransaction,
    addCardPurchase,
    deleteCardPurchase,
    addAccount,
    addCreditCard,
  } = useFinancial();
  const { showSuccess, showWarning, showError } = useAlert();
  const { colors } = useAppTheme();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [notificationText, setNotificationText] = useState('');
  const [parsedPreview, setParsedPreview] = useState<ParsedBankMessage | null>(null);
  const [autoSaveMode, setAutoSaveMode] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [historyLogs, setHistoryLogs] = useState<AutoImportedNotificationLog[]>([]);

  const loadHistory = useCallback(async () => {
    const list = await getAutoImportedHistory();
    setHistoryLogs(list);
  }, []);

  useEffect(() => {
    if (isModalOpen) {
      loadHistory();
    }
  }, [isModalOpen, loadHistory]);

  const handleTextChange = (text: string) => {
    setNotificationText(text);
    if (text.trim().length > 10) {
      const result = parseBankNotification(text);
      setParsedPreview(result);
    } else {
      setParsedPreview(null);
    }
  };

  const handleAutoProcessAndNotify = async (textToProcess?: string) => {
    const raw = (textToProcess ?? notificationText).trim();
    if (!raw) {
      showWarning(
        'Mensaje vacío',
        'Pega o selecciona una notificación bancaria de Bancolombia, RappiCard, Nequi o Nu.'
      );
      return;
    }

    setIsSaving(true);
    try {
      const result = await processAndAutoSaveBankNotification({
        rawText: raw,
        accounts,
        creditCards,
        categories,
        currency,
        addTransaction,
        addCardPurchase,
        addAccount,
        addCreditCard,
        sendPushConfirmation: true,
        skipDuplicateCheck: true,
      });

      if (!result.ok) {
        showWarning('No se pudo registrar', result.message);
        return;
      }

      await loadHistory();
      setNotificationText('');
      setParsedPreview(null);
      showSuccess(
        '🔔 ¡Agregado y Notificado!',
        `${result.message}. Revisa también la notificación en la barra superior de tu teléfono.`
      );
    } catch {
      showError('Error', 'Ocurrió un problema al guardar el movimiento automático.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUndoLogEntry = async (entry: AutoImportedNotificationLog) => {
    try {
      if (entry.recordKind === 'purchase') {
        await deleteCardPurchase(entry.recordId);
      } else {
        await deleteTransaction(entry.recordId);
      }
      await removeAutoImportedHistoryEntry(entry.id);
      await loadHistory();
      showSuccess('Deshecho', `Se revirtió: ${entry.description}`);
    } catch {
      showError('Error', 'No se pudo revertir el movimiento.');
    }
  };

  const handleOpenManualForm = () => {
    if (!parsedPreview) {
      showWarning(
        'No se detectó información',
        'Pega el texto completo del SMS o notificación bancaria.'
      );
      return;
    }
    setIsModalOpen(false);
    onOpenAddModal(parsedPreview);
    setNotificationText('');
    setParsedPreview(null);
  };

  return (
    <>
      {variant === 'icon' ? (
        <TouchableOpacity
          style={[
            styles.iconTrigger,
            { backgroundColor: colors.surfaceElevated, borderColor: colors.borderLight },
          ]}
          activeOpacity={0.8}
          onPress={() => setIsModalOpen(true)}
          accessibilityLabel="Lector automático de notificaciones bancarias"
        >
          <CustomIcon name="Sparkles" size={20} color={colors.primaryLight} />
          <View
            style={[
              styles.iconBadge,
              { backgroundColor: colors.success, borderColor: colors.surfaceElevated },
            ]}
          />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.islandPill}
          activeOpacity={0.85}
          onPress={() => setIsModalOpen(true)}
        >
          <View style={styles.islandPulseDot} />
          <View style={styles.islandContent}>
            <CustomIcon name="Sparkles" size={14} color="#818CF8" />
            <Text style={styles.islandText}>Lectura Automática de Notificaciones</Text>
          </View>
          <View style={styles.islandBadge}>
            <Text style={styles.islandBadgeText}>Auto</Text>
          </View>
        </TouchableOpacity>
      )}

      <Modal
        visible={isModalOpen}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={() => setIsModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setIsModalOpen(false)}
          />

          <View
            style={[
              styles.modalContent,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.divider }]}>
              <View style={styles.headerTitleRow}>
                <View style={[styles.sparkleBox, { backgroundColor: alpha(colors.success, 0.16) }]}>
                  <CustomIcon name="BellRing" size={18} color={colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.tag, { color: colors.success }]}>
                    BANCOLOMBIA • RAPPICARD • NEQUI • NU
                  </Text>
                  <Text style={[styles.title, { color: colors.textPrimary }]}>
                    Lector Automático de Notificaciones
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setIsModalOpen(false)}
                style={[styles.closeBtn, { backgroundColor: colors.surfaceElevated }]}
              >
                <CustomIcon name="X" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
              overScrollMode="never"
              bounces={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scrollBody}
            >
              {/* Switch de Guardado Automático + Notificación Push */}
              <View
                style={[
                  styles.autoSwitchCard,
                  {
                    backgroundColor: colors.surfaceCard,
                    borderColor: autoSaveMode ? colors.success : colors.border,
                  },
                ]}
              >
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={[styles.autoSwitchTitle, { color: colors.textPrimary }]}>
                    Agregar movimiento automáticamente y notificar
                  </Text>
                  <Text style={[styles.autoSwitchSub, { color: colors.textSecondary }]}>
                    Detecta monto, comercio/remitente, fecha y tarjeta/cuenta, lo guarda al instante y lanza una notificación push.
                  </Text>
                </View>
                <Switch
                  value={autoSaveMode}
                  onValueChange={setAutoSaveMode}
                  trackColor={{ false: '#334155', true: '#10B981' }}
                  thumbColor="#FFFFFF"
                />
              </View>

              {/* Simulador de llegada de notificaciones reales en 1 toque */}
              <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>
                ⚡ Simular llegada de notificación real (1 toque):
              </Text>
              <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>
                Toca cualquiera de estas notificaciones reales para ver cómo keAhorro extrae los datos, agrega el movimiento y te envía la notificación al teléfono:
              </Text>

              <View style={styles.simList}>
                {REAL_BANK_SIMULATIONS.map((sim, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.simCard,
                      {
                        backgroundColor: colors.surfaceCard,
                        borderColor: colors.borderLight,
                      },
                    ]}
                    onPress={() => {
                      handleTextChange(sim.text);
                      if (autoSaveMode) {
                        handleAutoProcessAndNotify(sim.text);
                      }
                    }}
                    disabled={isSaving}
                  >
                    <View style={styles.simCardHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                        <View style={[styles.simDot, { backgroundColor: sim.color }]} />
                        <Text
                          style={[styles.simCardTitle, { color: colors.textPrimary }]}
                          numberOfLines={1}
                        >
                          {sim.label}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.simTypeBadge,
                          { backgroundColor: alpha(sim.color, 0.18) },
                        ]}
                      >
                        <Text style={[styles.simTypeBadgeText, { color: sim.color }]}>
                          {sim.badge}
                        </Text>
                      </View>
                    </View>
                    <Text
                      style={[styles.simCardBody, { color: colors.textSecondary }]}
                      numberOfLines={2}
                    >
                      “{sim.text}”
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Caja para pegar cualquier SMS o notificación real */}
              <Text style={[styles.sectionLabel, { color: colors.textPrimary, marginTop: 6 }]}>
                📋 O pega aquí cualquier SMS / Notificación bancaria:
              </Text>
              <TextInput
                style={[
                  styles.textArea,
                  {
                    backgroundColor: colors.surfaceElevated,
                    color: colors.textPrimary,
                    borderColor: colors.borderLight,
                  },
                ]}
                placeholder="Ej: Bancolombia: Compraste $45.900,00 en D1 SAS con tu T.Deb *4829, el 19/11/2026..."
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={3}
                value={notificationText}
                onChangeText={handleTextChange}
              />

              {/* Vista Previa de Detección */}
              {parsedPreview && (
                <View
                  style={[
                    styles.previewCard,
                    { backgroundColor: colors.inset, borderColor: colors.success },
                  ]}
                >
                  <View style={styles.previewHeader}>
                    <CustomIcon name="CheckCircle2" size={16} color={colors.success} />
                    <Text style={[styles.previewTitle, { color: colors.success }]}>
                      Lectura Inteligente Lista
                    </Text>
                  </View>
                  <View style={styles.previewRow}>
                    <Text style={[styles.previewLabel, { color: colors.textMuted }]}>
                      Entidad:
                    </Text>
                    <Text style={[styles.previewVal, { color: colors.textPrimary }]}>
                      {parsedPreview.bankName}{' '}
                      {parsedPreview.lastFourDigits ? `(*${parsedPreview.lastFourDigits})` : ''}
                    </Text>
                  </View>
                  <View style={styles.previewRow}>
                    <Text style={[styles.previewLabel, { color: colors.textMuted }]}>
                      Monto:
                    </Text>
                    <Text
                      style={[
                        styles.previewVal,
                        { color: colors.successLight, fontWeight: 'bold' },
                      ]}
                    >
                      {formatCurrency(parsedPreview.amount, currency)}
                    </Text>
                  </View>
                  <View style={styles.previewRow}>
                    <Text style={[styles.previewLabel, { color: colors.textMuted }]}>
                      Lugar / Concepto:
                    </Text>
                    <Text
                      style={[styles.previewVal, { color: colors.textPrimary }]}
                      numberOfLines={1}
                    >
                      {parsedPreview.description}
                    </Text>
                  </View>
                  <View style={styles.previewRow}>
                    <Text style={[styles.previewLabel, { color: colors.textMuted }]}>
                      Fecha y Tipo:
                    </Text>
                    <Text style={[styles.previewVal, { color: colors.textPrimary }]}>
                      {parsedPreview.date} •{' '}
                      {parsedPreview.type === 'card_purchase'
                        ? 'Tarjeta de Crédito'
                        : parsedPreview.type === 'income'
                        ? 'Ingreso / Abono'
                        : 'Gasto / Débito'}
                    </Text>
                  </View>
                </View>
              )}

              {/* Botones de Acción */}
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[
                    styles.primaryAutoBtn,
                    { backgroundColor: colors.success },
                    (!parsedPreview || isSaving) && styles.btnDisabled,
                  ]}
                  disabled={!parsedPreview || isSaving}
                  onPress={() => handleAutoProcessAndNotify()}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <CustomIcon name="Zap" size={17} color="#FFFFFF" />
                  )}
                  <Text style={styles.primaryAutoBtnText}>
                    Agregar Automáticamente y Notificar
                  </Text>
                </TouchableOpacity>

                {parsedPreview && (
                  <TouchableOpacity
                    style={[
                      styles.secondaryFormBtn,
                      {
                        backgroundColor: colors.surfaceElevated,
                        borderColor: colors.borderLight,
                      },
                    ]}
                    onPress={handleOpenManualForm}
                  >
                    <CustomIcon name="Edit3" size={15} color={colors.textPrimary} />
                    <Text style={[styles.secondaryFormBtnText, { color: colors.textPrimary }]}>
                      Revisar en Formulario
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Historial de Movimientos Agregados Automáticamente */}
              {historyLogs.length > 0 && (
                <View style={styles.historySection}>
                  <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>
                    ✅ Últimos movimientos agregados por notificación:
                  </Text>
                  {historyLogs.slice(0, 6).map((item) => (
                    <View
                      key={item.id}
                      style={[
                        styles.historyItem,
                        {
                          backgroundColor: colors.surfaceCard,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text
                            style={[styles.historyItemTitle, { color: colors.textPrimary }]}
                            numberOfLines={1}
                          >
                            {item.description}
                          </Text>
                        </View>
                        <Text
                          style={[styles.historyItemSub, { color: colors.textSecondary }]}
                          numberOfLines={1}
                        >
                          {item.targetName} • {item.date}
                        </Text>
                      </View>

                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <Text
                          style={[
                            styles.historyItemAmount,
                            {
                              color:
                                item.type === 'income' ? colors.success : colors.textPrimary,
                            },
                          ]}
                        >
                          {item.type === 'income' ? '+' : '-'}
                          {formatCurrency(item.amount, currency)}
                        </Text>
                        <TouchableOpacity
                          style={[
                            styles.undoSmallBtn,
                            { backgroundColor: colors.surfaceElevated },
                          ]}
                          onPress={() => handleUndoLogEntry(item)}
                        >
                          <CustomIcon name="RotateCcw" size={11} color={colors.textSecondary} />
                          <Text
                            style={[styles.undoSmallBtnText, { color: colors.textSecondary }]}
                          >
                            Deshacer
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  iconTrigger: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  iconBadge: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  islandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1B4B',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#4338CA',
    gap: 8,
    elevation: 4,
  },
  islandPulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  islandContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  islandText: {
    color: '#E0E7FF',
    fontSize: 13,
    fontWeight: '700',
  },
  islandBadge: {
    backgroundColor: 'rgba(99, 102, 241, 0.4)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  islandBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderBottomWidth: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  sparkleBox: {
    width: 38,
    height: 38,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tag: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollBody: {
    padding: 18,
    paddingBottom: 34,
    gap: 12,
  },
  autoSwitchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 13,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  autoSwitchTitle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  autoSwitchSub: {
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  sectionHint: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: -4,
  },
  simList: {
    gap: 8,
  },
  simCard: {
    padding: 12,
    borderRadius: 13,
    borderWidth: 1,
    gap: 4,
  },
  simCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  simDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  simCardTitle: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  simTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  simTypeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  simCardBody: {
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  textArea: {
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    minHeight: 72,
    textAlignVertical: 'top',
    borderWidth: 1,
  },
  previewCard: {
    borderRadius: 13,
    padding: 12,
    borderWidth: 1.5,
    gap: 4,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  previewTitle: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  previewLabel: {
    fontSize: 13,
  },
  previewVal: {
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  actionsRow: {
    gap: 8,
  },
  primaryAutoBtn: {
    minHeight: 48,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  primaryAutoBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  secondaryFormBtn: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  secondaryFormBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.45,
  },
  historySection: {
    marginTop: 8,
    gap: 8,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  historyItemTitle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  historyItemSub: {
    fontSize: 13,
    marginTop: 2,
  },
  historyItemAmount: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  undoSmallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  undoSmallBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
