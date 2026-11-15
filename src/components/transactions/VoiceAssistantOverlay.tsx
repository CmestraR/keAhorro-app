import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  Animated,
  Easing,
  Platform,
  ActivityIndicator,
  ScrollView,
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
import { Text, TextInput } from '../common/AppText';
import { TouchableOpacity } from '../common/Touchable';

interface VoiceAssistantOverlayProps {
  visible: boolean;
  onClose: () => void;
  onReviewInForm?: (extracted: GeminiExtractedTransaction) => void;
}

const WAVE_BAR_COUNT = 18;

const VOICE_EXAMPLES = [
  'Me pagaron 10.000 de Andrés en Nequi',
  'Compré almuerzo de 35.000 con la Visa a 1 cuota',
  'Gasté 48.000 en supermercado ayer',
];

export const VoiceAssistantOverlay: React.FC<VoiceAssistantOverlayProps> = ({
  visible,
  onClose,
  onReviewInForm,
}) => {
  const {
    accounts,
    creditCards,
    categories,
    addTransaction,
    addCardPurchase,
    currency,
  } = useFinancial();
  const { geminiApiKey, geminiModel, openAISettingsModal } = useAI();
  const { showSuccess, showWarning, showError } = useAlert();

  const [isListening, setIsListening] = useState(true);
  const [transcript, setTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedResult, setExtractedResult] = useState<GeminiExtractedTransaction | null>(null);
  const [extractionSource, setExtractionSource] = useState<'gemini' | 'local_fallback'>('gemini');

  const recognitionRef = useRef<any>(null);
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const waveAnims = useRef(
    Array.from({ length: WAVE_BAR_COUNT }, () => new Animated.Value(0.25))
  ).current;

  // Animación continua de ondas de audio futuristas (Esmeralda #10B981, Índigo #6366F1, Cian #06B6D4)
  useEffect(() => {
    if (!visible) {
      stopWebSpeech();
      return;
    }

    setTranscript('');
    setExtractedResult(null);
    setIsProcessing(false);
    setIsListening(true);

    startWebSpeechIfAvailable();

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.start();

    const barLoops = waveAnims.map((anim, idx) => {
      const duration = 280 + (idx % 5) * 95;
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
            duration: duration + 40,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      );
    });

    barLoops.forEach((l) => l.start());

    return () => {
      pulseLoop.stop();
      barLoops.forEach((l) => l.stop());
      stopWebSpeech();
    };
  }, [visible]);

  const startWebSpeechIfAvailable = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognition.lang = 'es-CO';
          recognition.interimResults = true;
          recognition.continuous = false;

          recognition.onresult = (event: any) => {
            let liveText = '';
            for (let i = 0; i < event.results.length; i++) {
              liveText += event.results[i][0].transcript;
            }
            setTranscript(liveText);
          };

          recognition.onerror = () => {
            setIsListening(false);
          };

          recognition.onend = () => {
            setIsListening(false);
          };

          recognition.start();
          recognitionRef.current = recognition;
        } catch {
          // continúa con input interactivo
        }
      }
    }
  };

  const stopWebSpeech = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
  };

  const handleAnalyzeWithGemini = async (textToProcess?: string) => {
    const cleanText = (textToProcess ?? transcript).trim();
    if (!cleanText) {
      showWarning('Dicta o escribe tu movimiento', 'Di por ejemplo: "Compré almuerzo de 35.000 con la Visa a 1 cuota".');
      return;
    }

    stopWebSpeech();
    setIsListening(false);
    setIsProcessing(true);

    try {
      const { data, source } = await extractTransactionWithGemini({
        transcript: cleanText,
        apiKey: geminiApiKey,
        model: geminiModel,
        accounts,
        creditCards,
        categories,
      });
      setExtractedResult(data);
      setExtractionSource(source);
    } catch {
      showError('Error de IA', 'No fue posible procesar el comando de voz.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmAndSave = async () => {
    if (!extractedResult) return;
    if (extractedResult.monto <= 0) {
      showWarning('Monto no detectado', 'Revisa el movimiento en el formulario para ajustar el valor.');
      if (onReviewInForm) {
        onClose();
        onReviewInForm(extractedResult);
      }
      return;
    }

    const nowIso = new Date().toISOString();
    const txDate = extractedResult.fechaISO || nowIso.split('T')[0];

    try {
      if (extractedResult.tipo === 'TARJETA') {
        const targetCard =
          creditCards.find((c) => c.id === extractedResult.tarjetaId) || creditCards[0];
        if (!targetCard) {
          showWarning('Tarjeta Requerida', 'Registra primero una tarjeta de crédito.');
          return;
        }

        const installmentsTotal = Math.max(1, extractedResult.cuotas || 1);
        const rate = installmentsTotal === 1 ? 0 : targetCard.interestRateMonthly || 0;
        const monthlyQuota = calculateMonthlyQuota(
          extractedResult.monto,
          rate,
          installmentsTotal
        );

        const startDate = new Date(txDate + 'T12:00:00');
        const purchaseId = `purch-${Date.now()}`;
        const newPurchase: CardPurchase = {
          id: purchaseId,
          cardId: targetCard.id,
          description: extractedResult.concepto,
          categoryId:
            extractedResult.categoriaId ||
            categories.find((c) => c.type === 'expense')?.id ||
            'cat-food',
          amount: extractedResult.monto,
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
          extractedResult.monto,
          rate,
          installmentsTotal,
          startDate,
          0
        );

        await addCardPurchase(newPurchase, schedule);
        showSuccess('¡Compra con IA Registrada!', extractedResult.resumenHumano);
      } else if (extractedResult.tipo === 'TRANSFERENCIA') {
        const originId = extractedResult.cuentaOrigenId || accounts[0]?.id;
        const destId =
          extractedResult.cuentaDestinoId ||
          accounts.find((a) => a.id !== originId)?.id;

        if (!originId || !destId || originId === destId) {
          if (onReviewInForm) {
            onClose();
            onReviewInForm(extractedResult);
          }
          return;
        }

        const gmfAmount = extractedResult.aplica4x1000
          ? Math.round(extractedResult.monto * 0.004)
          : undefined;

        const newTx: Transaction = {
          id: `tx-${Date.now()}`,
          accountId: originId,
          toAccountId: destId,
          type: 'transfer',
          amount: extractedResult.monto,
          categoryId: 'cat-financial',
          description: extractedResult.concepto,
          date: txDate,
          gmfAmount,
          createdAt: nowIso,
        };

        await addTransaction(newTx);
        showSuccess('¡Transferencia con IA Registrada!', extractedResult.resumenHumano);
      } else {
        const originId = extractedResult.cuentaOrigenId || accounts[0]?.id;
        if (!originId) {
          showWarning('Cuenta Requerida', 'Registra primero una cuenta bancaria o billetera.');
          return;
        }

        const txType: TransactionType =
          extractedResult.tipo === 'INGRESO' ? 'income' : 'expense';
        const gmfAmount =
          txType === 'expense' && extractedResult.aplica4x1000
            ? Math.round(extractedResult.monto * 0.004)
            : undefined;

        const newTx: Transaction = {
          id: `tx-${Date.now()}`,
          accountId: originId,
          type: txType,
          amount: extractedResult.monto,
          categoryId:
            extractedResult.categoriaId ||
            categories.find((c) => c.type === txType)?.id ||
            'cat-food',
          description: extractedResult.concepto,
          date: txDate,
          gmfAmount,
          createdAt: nowIso,
        };

        await addTransaction(newTx);
        showSuccess('¡Movimiento con IA Registrado!', extractedResult.resumenHumano);
      }

      onClose();
    } catch {
      showError('Error', 'No se pudo guardar el movimiento.');
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlayContainer}>
        {/* Halo de luz superior futurista */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ambientOrb,
            {
              opacity: pulseAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.22, 0.45],
              }),
              transform: [
                {
                  scale: pulseAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.95, 1.12],
                  }),
                },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={['#10B981', '#6366F1', '#06B6D4']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
        </Animated.View>

        {/* Barra Superior */}
        <View style={styles.topHeader}>
          <TouchableOpacity
            style={styles.aiStatusPill}
            onPress={() => {
              onClose();
              openAISettingsModal();
            }}
          >
            <View
              style={[
                styles.statusDot,
                { backgroundColor: geminiApiKey ? '#10B981' : '#F59E0B' },
              ]}
            />
            <Text style={styles.aiStatusText}>
              {geminiApiKey
                ? `Gemini Activo (${geminiModel})`
                : 'IA Local • Toca para configurar Gemini API Key'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <CustomIcon name="X" size={20} color="#CBD5E1" />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.centerContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.badgeRow}>
            <CustomIcon name="Mic" size={16} color="#10B981" />
            <Text style={styles.listeningTag}>
              {isProcessing
                ? 'PROCESANDO CON GEMINI IA...'
                : isListening
                ? 'ESCUCHANDO TU VOZ EN VIVO...'
                : 'LISTO PARA PROCESAR'}
            </Text>
          </View>

          <Text style={styles.heroTitle}>
            Dicta tu gasto, ingreso o compra con tarjeta
          </Text>

          {/* Cuadro de Transcripción en Vivo */}
          <View style={styles.transcriptCard}>
            <TextInput
              style={styles.transcriptInput}
              placeholder='Di o escribe aquí: "Compré almuerzo de 35.000 con la Visa a 1 cuota"...'
              placeholderTextColor="#94A3B8"
              multiline
              autoFocus
              value={transcript}
              onChangeText={(text) => {
                setTranscript(text);
                if (extractedResult) setExtractedResult(null);
              }}
            />

            {transcript.length > 0 && (
              <View style={styles.transcriptActionsRow}>
                <TouchableOpacity
                  style={styles.clearBtn}
                  onPress={() => {
                    setTranscript('');
                    setExtractedResult(null);
                  }}
                >
                  <CustomIcon name="RotateCcw" size={14} color="#94A3B8" />
                  <Text style={styles.clearBtnText}>Limpiar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.processNowBtn}
                  onPress={() => handleAnalyzeWithGemini()}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <CustomIcon name="Sparkles" size={15} color="#FFFFFF" />
                  )}
                  <Text style={styles.processNowBtnText}>
                    {isProcessing ? 'Analizando...' : 'Procesar con IA'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Ejemplos sutiles interactivos */}
          {!extractedResult && (
            <View style={styles.examplesSection}>
              <Text style={styles.examplesHint}>
                Ejemplos rápidos (toca uno para probar al instante):
              </Text>
              {VOICE_EXAMPLES.map((ex, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.examplePill}
                  onPress={() => {
                    setTranscript(ex);
                    handleAnalyzeWithGemini(ex);
                  }}
                >
                  <CustomIcon name="Sparkles" size={14} color="#34D399" />
                  <Text style={styles.examplePillText}>"{ex}"</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Tarjeta de Resultado Extraído por Gemini (JSON estructurado) */}
          {extractedResult && (
            <View style={styles.resultCard}>
              <View style={styles.resultHeader}>
                <View style={styles.resultBadge}>
                  <CustomIcon name="CheckCircle2" size={15} color="#10B981" />
                  <Text style={styles.resultBadgeText}>
                    {extractionSource === 'gemini'
                      ? `EXTRAÍDO CON ${geminiModel.toUpperCase()}`
                      : 'EXTRACCIÓN INTELIGENTE'}
                  </Text>
                </View>
                <Text style={styles.resultTypeTag}>{extractedResult.tipo}</Text>
              </View>

              <Text style={styles.resultHumanSummary}>
                {extractedResult.resumenHumano}
              </Text>

              <View style={styles.resultGrid}>
                <View style={styles.resultCell}>
                  <Text style={styles.resultCellLabel}>Monto</Text>
                  <Text style={styles.resultCellValueHighlight}>
                    {formatCurrency(extractedResult.monto, currency)}
                  </Text>
                </View>

                <View style={styles.resultCell}>
                  <Text style={styles.resultCellLabel}>Fecha</Text>
                  <Text style={styles.resultCellValue}>{extractedResult.fechaISO}</Text>
                </View>

                <View style={styles.resultCell}>
                  <Text style={styles.resultCellLabel}>
                    {extractedResult.tipo === 'TARJETA' ? 'Tarjeta / Cuotas' : 'Cuenta'}
                  </Text>
                  <Text style={styles.resultCellValue} numberOfLines={1}>
                    {extractedResult.tipo === 'TARJETA'
                      ? `${
                          creditCards.find((c) => c.id === extractedResult.tarjetaId)?.name ||
                          'Tarjeta'
                        } (${extractedResult.cuotas}x)`
                      : accounts.find((a) => a.id === extractedResult.cuentaOrigenId)?.name ||
                        'Cuenta principal'}
                  </Text>
                </View>

                <View style={styles.resultCell}>
                  <Text style={styles.resultCellLabel}>Categoría</Text>
                  <Text style={styles.resultCellValue} numberOfLines={1}>
                    {categories.find((c) => c.id === extractedResult.categoriaId)?.name ||
                      'General'}
                  </Text>
                </View>
              </View>

              <View style={styles.resultButtonsRow}>
                {onReviewInForm && (
                  <TouchableOpacity
                    style={styles.reviewBtn}
                    onPress={() => {
                      onClose();
                      onReviewInForm(extractedResult);
                    }}
                  >
                    <CustomIcon name="Edit3" size={16} color="#CBD5E1" />
                    <Text style={styles.reviewBtnText}>Revisar en Formulario</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.confirmSaveBtn}
                  onPress={handleConfirmAndSave}
                >
                  <CustomIcon name="Check" size={18} color="#FFFFFF" />
                  <Text style={styles.confirmSaveBtnText}>Confirmar y Guardar</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Banner Inferior: Visualizador de Onda de Voz en Movimiento con Gradiente + Glow */}
        <View style={styles.waveFooter}>
          <View style={styles.waveBarsContainer}>
            {waveAnims.map((anim, idx) => (
              <Animated.View
                key={idx}
                style={[
                  styles.waveBarWrapper,
                  {
                    transform: [
                      {
                        scaleY: isListening || isProcessing ? anim : 0.22,
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

          <TouchableOpacity
            style={styles.micOrbButton}
            onPress={() => {
              if (transcript.trim().length > 0 && !extractedResult) {
                handleAnalyzeWithGemini();
              } else {
                setIsListening(!isListening);
                if (!isListening) startWebSpeechIfAvailable();
              }
            }}
          >
            <LinearGradient
              colors={['#10B981', '#6366F1', '#06B6D4']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.micOrbGradient}
            >
              <CustomIcon
                name={transcript.trim().length > 0 && !extractedResult ? 'Sparkles' : 'Mic'}
                size={26}
                color="#FFFFFF"
              />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlayContainer: {
    flex: 1,
    backgroundColor: 'rgba(11, 15, 25, 0.95)',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'android' ? 44 : 54,
    paddingBottom: 28,
    paddingHorizontal: 18,
  },
  ambientOrb: {
    position: 'absolute',
    top: -90,
    alignSelf: 'center',
    width: 340,
    height: 340,
    borderRadius: 170,
    overflow: 'hidden',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    zIndex: 10,
  },
  aiStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(22, 31, 48, 0.9)',
    borderWidth: 1,
    borderColor: '#26334D',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    flex: 1,
    marginRight: 10,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  aiStatusText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  closeBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(38, 51, 77, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerContent: {
    paddingVertical: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  listeningTag: {
    color: '#34D399',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  heroTitle: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 14,
  },
  transcriptCard: {
    backgroundColor: '#161F30',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#6366F1',
    padding: 16,
    marginBottom: 16,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 10,
  },
  transcriptInput: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    minHeight: 76,
    textAlignVertical: 'top',
  },
  transcriptActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  clearBtnText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  processNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
    minHeight: 42,
    borderRadius: 12,
  },
  processNowBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  examplesSection: {
    gap: 8,
  },
  examplesHint: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  examplePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(22, 31, 48, 0.85)',
    borderWidth: 1,
    borderColor: '#26334D',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
  },
  examplePillText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontStyle: 'italic',
    flex: 1,
  },
  resultCard: {
    backgroundColor: '#161F30',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#10B981',
    padding: 16,
    gap: 12,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  resultBadgeText: {
    color: '#34D399',
    fontSize: 13,
    fontWeight: '800',
  },
  resultTypeTag: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    color: '#818CF8',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 'bold',
  },
  resultHumanSummary: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: 'bold',
    lineHeight: 22,
  },
  resultGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  resultCell: {
    width: '48%',
    backgroundColor: '#0F172A',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#26334D',
  },
  resultCellLabel: {
    color: '#94A3B8',
    fontSize: 13,
  },
  resultCellValue: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 2,
  },
  resultCellValueHighlight: {
    color: '#34D399',
    fontSize: 15,
    fontWeight: 'bold',
    marginTop: 2,
  },
  resultButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  reviewBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#26334D',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  reviewBtnText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: 'bold',
  },
  confirmSaveBtn: {
    flex: 1.2,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  confirmSaveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  waveFooter: {
    alignItems: 'center',
    gap: 14,
    paddingTop: 8,
  },
  waveBarsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 58,
    gap: 6,
  },
  waveBarWrapper: {
    width: 6,
    height: 54,
    borderRadius: 3,
    overflow: 'hidden',
    shadowColor: '#06B6D4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 8,
    elevation: 6,
  },
  waveBarGradient: {
    flex: 1,
    borderRadius: 3,
  },
  micOrbButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 14,
    elevation: 12,
  },
  micOrbGradient: {
    flex: 1,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
});

