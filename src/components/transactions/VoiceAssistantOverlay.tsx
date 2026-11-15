import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Easing,
  Platform,
  ActivityIndicator,
  Pressable,
  TextInput as RNTextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFinancial } from '../../context/FinancialContext';
import { useAI } from '../../context/AIContext';
import { useAlert } from '../../context/AlertContext';
import {
  extractTransactionWithGemini,
  GeminiExtractedTransaction,
} from '../../utils/geminiService';
import { calculateMonthlyQuota, generateAmortizationSchedule } from '../../utils/financialMath';
import { formatCurrency } from '../../utils/formatters';
import { CardPurchase, Transaction, TransactionType } from '../../types/finance';
import { CustomIcon } from '../common/CustomIcon';
import { Text } from '../common/AppText';
import { TouchableOpacity } from '../common/Touchable';

interface VoiceAssistantOverlayProps {
  visible: boolean;
  isExternalHolding?: boolean;
  onClose: () => void;
  onSavedSuccess?: () => void;
  onReviewInForm?: (extracted: GeminiExtractedTransaction) => void;
}

interface SavedRecordInfo {
  kind: 'transaction' | 'purchase';
  id: string;
  data: GeminiExtractedTransaction;
}

const WAVE_BAR_COUNT = 18;

export const VoiceAssistantOverlay: React.FC<VoiceAssistantOverlayProps> = ({
  visible,
  isExternalHolding = false,
  onClose,
  onSavedSuccess,
}) => {
  const {
    accounts,
    creditCards,
    categories,
    addTransaction,
    deleteTransaction,
    addCardPurchase,
    deleteCardPurchase,
    currency,
  } = useFinancial();
  const { geminiApiKey, geminiModel } = useAI();
  const { showWarning, showError, showSuccess } = useAlert();

  const [isListening, setIsListening] = useState(true);
  const [isInternalHolding, setIsInternalHolding] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [savedRecord, setSavedRecord] = useState<SavedRecordInfo | null>(null);

  const transcriptRef = useRef('');
  const isSavingRef = useRef(false);
  const hasSavedRef = useRef(false);
  const prevExternalHoldingRef = useRef(isExternalHolding);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognitionRef = useRef<any>(null);
  const hiddenInputRef = useRef<RNTextInput | null>(null);

  const dotPulseAnim = useRef(new Animated.Value(1)).current;
  const waveAnims = useRef(
    Array.from({ length: WAVE_BAR_COUNT }, () => new Animated.Value(0.22))
  ).current;

  const updateTranscript = useCallback((text: string) => {
    transcriptRef.current = text;
    setTranscript(text);
  }, []);

  const clearTimers = useCallback(() => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    if (silenceDebounceRef.current) {
      clearTimeout(silenceDebounceRef.current);
      silenceDebounceRef.current = null;
    }
  }, []);

  const stopSpeechRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
  }, []);

  const startSpeechRecognition = useCallback(() => {
    setIsListening(true);

    // 1. Web Speech API (Chrome / Web / Android WebView)
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          stopSpeechRecognition();
          const recognition = new SpeechRecognition();
          recognition.lang = 'es-CO';
          recognition.interimResults = true;
          recognition.continuous = true;

          recognition.onresult = (event: any) => {
            let liveText = '';
            for (let i = 0; i < event.results.length; i++) {
              liveText += event.results[i][0].transcript;
            }
            if (liveText.trim()) {
              updateTranscript(liveText.trim());
            }
          };

          recognition.onerror = () => {};
          recognition.onend = () => {};

          recognition.start();
          recognitionRef.current = recognition;
        } catch {}
      }
    }

    // 2. Foco en input invisible para dictado de voz del sistema en Android / iOS
    setTimeout(() => {
      hiddenInputRef.current?.focus();
    }, 80);
  }, [stopSpeechRecognition, updateTranscript]);

  // Ejecuta Gemini + Guardado Automático sin pedir confirmación manual
  const processAndAutoSave = useCallback(
    async (rawText?: string) => {
      const cleanText = (rawText ?? transcriptRef.current).trim();
      if (!cleanText || isSavingRef.current || hasSavedRef.current) {
        return;
      }

      if (silenceDebounceRef.current) {
        clearTimeout(silenceDebounceRef.current);
        silenceDebounceRef.current = null;
      }

      stopSpeechRecognition();
      setIsListening(false);
      isSavingRef.current = true;
      setIsSaving(true);

      try {
        const { data: extracted } = await extractTransactionWithGemini({
          transcript: cleanText,
          apiKey: geminiApiKey,
          model: geminiModel,
          accounts,
          creditCards,
          categories,
        });

        if (extracted.monto <= 0) {
          isSavingRef.current = false;
          setIsSaving(false);
          setIsListening(true);
          showWarning(
            'Monto no detectado',
            'Di el valor del movimiento, por ejemplo: "Compra de leche por 3.000".'
          );
          return;
        }

        const nowIso = new Date().toISOString();
        const txDate = extracted.fechaISO || nowIso.split('T')[0];

        if (extracted.tipo === 'TARJETA') {
          const targetCard =
            creditCards.find((c) => c.id === extracted.tarjetaId) || creditCards[0];
          if (!targetCard) {
            isSavingRef.current = false;
            setIsSaving(false);
            showWarning('Tarjeta Requerida', 'Registra primero una tarjeta de crédito.');
            onClose();
            return;
          }

          const installmentsTotal = Math.max(1, extracted.cuotas || 1);
          const rate = installmentsTotal === 1 ? 0 : targetCard.interestRateMonthly || 0;
          const monthlyQuota = calculateMonthlyQuota(
            extracted.monto,
            rate,
            installmentsTotal
          );

          const startDate = new Date(txDate + 'T12:00:00');
          const purchaseId = `purch-${Date.now()}`;
          const newPurchase: CardPurchase = {
            id: purchaseId,
            cardId: targetCard.id,
            description: extracted.concepto,
            categoryId:
              extracted.categoriaId ||
              categories.find((c) => c.type === 'expense')?.id ||
              'cat-food',
            amount: extracted.monto,
            installmentsTotal,
            installmentsPaid: 0,
            monthlyInstallmentAmount: monthlyQuota,
            interestRateMonthly: rate,
            firstInstallmentDate: txDate,
            status: 'active',
            createdAt: txDate,
          };

          const schedule = generateAmortizationSchedule(
            purchaseId,
            extracted.monto,
            rate,
            installmentsTotal,
            startDate,
            0
          );

          await addCardPurchase(newPurchase, schedule);
          hasSavedRef.current = true;
          setSavedRecord({ kind: 'purchase', id: purchaseId, data: extracted });
        } else if (extracted.tipo === 'TRANSFERENCIA') {
          const originId = extracted.cuentaOrigenId || accounts[0]?.id;
          const destId =
            extracted.cuentaDestinoId ||
            accounts.find((a) => a.id !== originId)?.id ||
            originId;

          if (!originId) {
            isSavingRef.current = false;
            setIsSaving(false);
            showWarning('Cuenta Requerida', 'Registra primero una cuenta bancaria o billetera.');
            onClose();
            return;
          }

          const gmfAmount = extracted.aplica4x1000
            ? Math.round(extracted.monto * 0.004)
            : undefined;

          const txId = `tx-${Date.now()}`;
          const newTx: Transaction = {
            id: txId,
            accountId: originId,
            toAccountId: destId,
            type: 'transfer',
            amount: extracted.monto,
            categoryId: 'cat-financial',
            description: extracted.concepto,
            date: txDate,
            gmfAmount,
            createdAt: nowIso,
          };

          await addTransaction(newTx);
          hasSavedRef.current = true;
          setSavedRecord({ kind: 'transaction', id: txId, data: extracted });
        } else {
          const originId = extracted.cuentaOrigenId || accounts[0]?.id;
          if (!originId) {
            isSavingRef.current = false;
            setIsSaving(false);
            showWarning('Cuenta Requerida', 'Registra primero una cuenta bancaria o billetera.');
            onClose();
            return;
          }

          const txType: TransactionType =
            extracted.tipo === 'INGRESO' ? 'income' : 'expense';
          const gmfAmount =
            txType === 'expense' && extracted.aplica4x1000
              ? Math.round(extracted.monto * 0.004)
              : undefined;

          const txId = `tx-${Date.now()}`;
          const newTx: Transaction = {
            id: txId,
            accountId: originId,
            type: txType,
            amount: extracted.monto,
            categoryId:
              extracted.categoriaId ||
              categories.find((c) => c.type === txType)?.id ||
              'cat-food',
            description: extracted.concepto,
            date: txDate,
            gmfAmount,
            createdAt: nowIso,
          };

          await addTransaction(newTx);
          hasSavedRef.current = true;
          setSavedRecord({ kind: 'transaction', id: txId, data: extracted });
        }

        // Cerrar automáticamente después de 2.2 segundos
        autoCloseTimerRef.current = setTimeout(() => {
          onSavedSuccess?.();
          onClose();
        }, 2200);
      } catch {
        showError('Error', 'No fue posible guardar el movimiento por voz.');
      } finally {
        isSavingRef.current = false;
        setIsSaving(false);
      }
    },
    [
      accounts,
      addCardPurchase,
      addTransaction,
      categories,
      creditCards,
      geminiApiKey,
      geminiModel,
      onClose,
      onSavedSuccess,
      showError,
      showWarning,
      stopSpeechRecognition,
    ]
  );

  // Detectar cuando el usuario SUELTA el botón central (+ / 🎙️) desde App.tsx
  useEffect(() => {
    if (prevExternalHoldingRef.current && !isExternalHolding && visible) {
      if (transcriptRef.current.trim().length > 0) {
        processAndAutoSave(transcriptRef.current);
      }
    }
    prevExternalHoldingRef.current = isExternalHolding;
  }, [isExternalHolding, visible, processAndAutoSave]);

  // Si el texto entra por dictado de voz del sistema (Android), auto-guardar al terminar la frase
  const handleSystemVoiceTranscriptChange = (text: string) => {
    updateTranscript(text);
    if (silenceDebounceRef.current) {
      clearTimeout(silenceDebounceRef.current);
    }
    if (!isExternalHolding && !isInternalHolding && text.trim().length >= 4) {
      silenceDebounceRef.current = setTimeout(() => {
        if (!isExternalHolding && !isInternalHolding && transcriptRef.current.trim().length >= 4) {
          processAndAutoSave(transcriptRef.current);
        }
      }, 1250);
    }
  };

  // revertir movimiento recién creado ("Deshacer")
  const handleUndoSaved = async () => {
    if (!savedRecord) return;
    clearTimers();
    try {
      if (savedRecord.kind === 'purchase') {
        await deleteCardPurchase(savedRecord.id);
      } else {
        await deleteTransaction(savedRecord.id);
      }
      showSuccess('Movimiento Deshecho', 'Se revirtió el registro automáticamente.');
    } catch {
      showError('Error', 'No se pudo deshacer el movimiento.');
    } finally {
      onClose();
    }
  };

  // Ciclo de vida al abrir/cerrar el overlay
  useEffect(() => {
    if (!visible) {
      clearTimers();
      stopSpeechRecognition();
      return;
    }

    updateTranscript('');
    setSavedRecord(null);
    setIsSaving(false);
    isSavingRef.current = false;
    hasSavedRef.current = false;
    setIsListening(true);

    startSpeechRecognition();

    const dotLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(dotPulseAnim, {
          toValue: 0.3,
          duration: 650,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(dotPulseAnim, {
          toValue: 1,
          duration: 650,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    dotLoop.start();

    const barLoops = waveAnims.map((anim, idx) => {
      const duration = 240 + (idx % 5) * 85;
      return Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 0.95,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.2,
            duration: duration + 35,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      );
    });

    barLoops.forEach((l) => l.start());

    return () => {
      dotLoop.stop();
      barLoops.forEach((l) => l.stop());
      clearTimers();
      stopSpeechRecognition();
    };
  }, [visible, clearTimers, dotPulseAnim, startSpeechRecognition, stopSpeechRecognition, updateTranscript, waveAnims]);

  if (!visible) return null;

  const getBadgeColors = (tipo: GeminiExtractedTransaction['tipo']) => {
    switch (tipo) {
      case 'INGRESO':
        return { bg: 'rgba(16, 185, 129, 0.2)', text: '#34D399' };
      case 'TARJETA':
        return { bg: 'rgba(99, 102, 241, 0.22)', text: '#818CF8' };
      case 'TRANSFERENCIA':
        return { bg: 'rgba(59, 130, 246, 0.22)', text: '#60A5FA' };
      default:
        return { bg: 'rgba(244, 63, 94, 0.2)', text: '#FB7185' };
    }
  };

  return (
    <View style={styles.rootOverlay} pointerEvents="box-none">
      <Pressable
        style={styles.backdropPressable}
        onPress={() => {
          if (savedRecord) {
            clearTimers();
            onSavedSuccess?.();
            onClose();
          } else if (!isSaving) {
            onClose();
          }
        }}
      >
        {/* Input invisible (1x1px, opacidad 0) para capturar dictado por voz nativo del teclado Android sin mostrar ninguna caja */}
        <RNTextInput
          ref={hiddenInputRef}
          style={styles.hiddenVoiceReceiver}
          value={transcript}
          onChangeText={handleSystemVoiceTranscriptChange}
          onSubmitEditing={() => {
            if (transcriptRef.current.trim().length > 0) {
              processAndAutoSave(transcriptRef.current);
            }
          }}
          autoFocus
          caretHidden
           underlineColorAndroid="transparent"
        />

        {/* 1. Indicador Superior Minimalista y Centrado */}
        <View style={styles.topMinimalBar}>
          <View style={styles.topSpacer} />

          <View style={styles.minimalStatusBadge}>
            {isSaving ? (
              <ActivityIndicator size="small" color="#34D399" />
            ) : (
              <Animated.View
                style={[
                  styles.pulsingDot,
                  {
                    opacity: dotPulseAnim,
                    backgroundColor: savedRecord ? '#10B981' : '#34D399',
                  },
                ]}
              />
            )}
            <Text style={styles.minimalStatusText}>
              {isSaving
                ? 'Guardando movimiento...'
                : savedRecord
                ? 'Listo'
                : 'Escuchando...'}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.closeCornerBtn}
            onPress={() => {
              clearTimers();
              onClose();
            }}
          >
            <CustomIcon name="X" size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* 2. Zona Central: Transcripción Flotante Limpia O Tarjeta de Éxito */}
        <View style={styles.centerStage}>
          {!savedRecord ? (
            <Pressable
              style={styles.floatingTranscriptWrap}
              onPress={() => hiddenInputRef.current?.focus()}
            >
              {transcript.trim().length > 0 ? (
                <Text style={styles.floatingLiveTranscript}>
                  “{transcript}”
                </Text>
              ) : (
                <Text style={styles.floatingGuidePlaceholder}>
                  {isSaving
                    ? 'Guardando movimiento...'
                    : 'Mantén presionado y di tu gasto, ingreso o transferencia...'}
                </Text>
              )}
            </Pressable>
          ) : (
            /* 3. Tarjeta de Movimiento Registrado (Sin desbordamiento / No Overflow) */
            <Pressable
              style={styles.savedCard}
              onPress={(e) => e.stopPropagation()}
            >
              {/* Encabezado: flex items-center justify-between gap-2 flex-wrap */}
              <View style={styles.savedCardHeader}>
                <View style={styles.savedCardTitleWrap}>
                  <CustomIcon name="CheckCircle2" size={19} color="#10B981" />
                  <Text style={styles.savedCardTitleText}>
                    ¡Movimiento Guardado!
                  </Text>
                </View>

                <View
                  style={[
                    styles.savedTypePill,
                    { backgroundColor: getBadgeColors(savedRecord.data.tipo).bg },
                  ]}
                >
                  <Text
                    style={[
                      styles.savedTypePillText,
                      { color: getBadgeColors(savedRecord.data.tipo).text },
                    ]}
                  >
                    {savedRecord.data.tipo}
                  </Text>
                </View>
              </View>

              {/* Resumen claro en una frase */}
              <Text style={styles.savedSummaryText}>
                {savedRecord.data.resumenHumano}
              </Text>

              {/* Grilla 2x2 con minWidth: 0 y truncate seguro */}
              <View style={styles.savedGrid}>
                <View style={styles.savedGridRow}>
                  <View style={styles.savedGridCell}>
                    <Text style={styles.savedCellLabel}>Monto</Text>
                    <Text
                      style={styles.savedCellAmountValue}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {formatCurrency(savedRecord.data.monto, currency)}
                    </Text>
                  </View>

                  <View style={styles.savedGridCell}>
                    <Text style={styles.savedCellLabel}>Fecha</Text>
                    <Text
                      style={styles.savedCellValue}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {savedRecord.data.fechaISO}
                    </Text>
                  </View>
                </View>

                <View style={styles.savedGridRow}>
                  <View style={styles.savedGridCell}>
                    <Text style={styles.savedCellLabel}>
                      {savedRecord.data.tipo === 'TARJETA' ? 'Tarjeta' : 'Cuenta'}
                    </Text>
                    <Text
                      style={styles.savedCellValue}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {savedRecord.data.tipo === 'TARJETA'
                        ? `${
                            creditCards.find((c) => c.id === savedRecord.data.tarjetaId)
                              ?.name || 'Tarjeta'
                          } (${savedRecord.data.cuotas}x)`
                        : accounts.find((a) => a.id === savedRecord.data.cuentaOrigenId)
                            ?.name || 'Cuenta Principal'}
                    </Text>
                  </View>

                  <View style={styles.savedGridCell}>
                    <Text style={styles.savedCellLabel}>Categoría</Text>
                    <Text
                      style={styles.savedCellValue}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {categories.find((c) => c.id === savedRecord.data.categoriaId)
                        ?.name || 'General'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Pie discreto con botón Deshacer */}
              <View style={styles.savedCardFooter}>
                <Text style={styles.autoCloseHintText}>
                  Cerrando automáticamente...
                </Text>
                <TouchableOpacity
                  style={styles.undoButton}
                  onPress={handleUndoSaved}
                >
                  <CustomIcon name="RotateCcw" size={13} color="#CBD5E1" />
                  <Text style={styles.undoButtonText}>Deshacer</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          )}
        </View>

        {/* 3. Parte Inferior: Ondas de Voz Reactivas + Botón Push-to-Talk del Micrófono */}
        <View style={styles.bottomWaveSection}>
          <View style={styles.waveBarsContainer}>
            {waveAnims.map((anim, idx) => (
              <Animated.View
                key={idx}
                style={[
                  styles.waveBarWrapper,
                  {
                    transform: [
                      {
                        scaleY:
                          (isListening || isSaving || isExternalHolding || isInternalHolding) &&
                          !savedRecord
                            ? anim
                            : 0.2,
                      },
                    ],
                  },
                ]}
              >
                <LinearGradient
                  colors={['#10B981', '#6366F1', '#06B6D4']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={styles.waveBarGradient}
                />
              </Animated.View>
            ))}
          </View>

          <Pressable
            onPressIn={() => {
              if (!savedRecord && !isSaving) {
                setIsInternalHolding(true);
                startSpeechRecognition();
              }
            }}
            onPressOut={() => {
              setIsInternalHolding(false);
              if (transcriptRef.current.trim().length > 0 && !savedRecord && !isSaving) {
                processAndAutoSave(transcriptRef.current);
              }
            }}
            style={({ pressed }) => [
              styles.micOrbButton,
              (pressed || isExternalHolding || isInternalHolding) && {
                transform: [{ scale: 1.12 }],
              },
            ]}
          >
            <LinearGradient
              colors={['#10B981', '#6366F1', '#06B6D4']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.micOrbGradient}
            >
              <CustomIcon
                name={savedRecord ? 'Check' : 'Mic'}
                size={28}
                color="#FFFFFF"
              />
            </LinearGradient>
          </Pressable>
        </View>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  rootOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  backdropPressable: {
    flex: 1,
    backgroundColor: 'rgba(11, 15, 25, 0.94)',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'android' ? 48 : 56,
    paddingBottom: 34,
    paddingHorizontal: 20,
  },
  hiddenVoiceReceiver: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    top: 0,
    left: 0,
  },
  topMinimalBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  topSpacer: {
    width: 38,
    height: 38,
  },
  minimalStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(22, 31, 48, 0.85)',
    borderWidth: 1,
    borderColor: '#26334D',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  pulsingDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  minimalStatusText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  closeCornerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(38, 51, 77, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerStage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  floatingTranscriptWrap: {
    width: '100%',
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingLiveTranscript: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 34,
  },
  floatingGuidePlaceholder: {
    color: '#94A3B8',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 27,
  },
  savedCard: {
    width: '100%',
    maxWidth: 384,
    alignSelf: 'center',
    overflow: 'hidden',
    padding: 20,
    borderRadius: 20,
    backgroundColor: '#161F30',
    borderWidth: 1.5,
    borderColor: '#10B981',
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 14,
  },
  savedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  savedCardTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexShrink: 1,
    minWidth: 0,
  },
  savedCardTitleText: {
    color: '#34D399',
    fontSize: 16,
    fontWeight: '800',
  },
  savedTypePill: {
    flexShrink: 0,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  savedTypePillText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  savedSummaryText: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  savedGrid: {
    gap: 8,
    width: '100%',
  },
  savedGridRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  savedGridCell: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    backgroundColor: '#0F172A',
    padding: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#26334D',
  },
  savedCellLabel: {
    color: '#94A3B8',
    fontSize: 13,
  },
  savedCellValue: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  savedCellAmountValue: {
    color: '#34D399',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  savedCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  autoCloseHintText: {
    color: '#94A3B8',
    fontSize: 13,
  },
  undoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#26334D',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  undoButtonText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  bottomWaveSection: {
    alignItems: 'center',
    gap: 14,
  },
  waveBarsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
    gap: 6,
  },
  waveBarWrapper: {
    width: 6,
    height: 50,
    borderRadius: 3,
    overflow: 'hidden',
  },
  waveBarGradient: {
    flex: 1,
    borderRadius: 3,
  },
  micOrbButton: {
    width: 66,
    height: 66,
    borderRadius: 33,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55,
    shadowRadius: 12,
    elevation: 10,
  },
  micOrbGradient: {
    flex: 1,
    borderRadius: 33,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
});
