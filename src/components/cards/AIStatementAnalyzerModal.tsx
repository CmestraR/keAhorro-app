import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Switch,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CreditCard } from '../../types/finance';
import { useFinancial } from '../../context/FinancialContext';
import { useAI } from '../../context/AIContext';
import { useAlert } from '../../context/AlertContext';
import { useAppTheme } from '../../context/ThemeContext';
import {
  analyzeCardStatementWithGemini,
  GeminiExtractedStatement,
  GeminiExtractedStatementPurchase,
} from '../../utils/geminiService';
import { formatCurrency, formatInputNumber, parseInputNumber } from '../../utils/formatters';
import { alpha } from '../common/Theme';
import { CustomIcon } from '../common/CustomIcon';
import { Text, TextInput } from '../common/AppText';
import { TouchableOpacity } from '../common/Touchable';

let ExpoAudio: any = null;
try {
  const avPkg = require('expo-av');
  ExpoAudio = avPkg?.Audio || null;
} catch {
  ExpoAudio = null;
}

let ExpoFileSystem: any = null;
try {
  ExpoFileSystem = require('expo-file-system/legacy');
} catch {
  try {
    ExpoFileSystem = require('expo-file-system');
  } catch {
    ExpoFileSystem = null;
  }
}

interface AIStatementAnalyzerModalProps {
  visible: boolean;
  card: CreditCard | null;
  onClose: () => void;
}

const SAMPLE_STATEMENTS = [
  {
    label: 'Extracto Bancolombia',
    color: '#F59E0B',
    text: `EXTRACTO TARJETA DE CRÉDITO BANCOLOMBIA MASTERCARD
Fecha de corte: 2026-11-15 | Fecha límite de pago: 2026-12-05
Cupo Total: $8.000.000 | Cupo Disponible: $4.865.000
Deuda Total Actual: $3.169.900
Pago Total del Mes (Facturado al corte): $944.900 | Pago Mínimo: $215.000
Tasa de interés mensual: 2.15% E.M.
Intereses corrientes: $19.900 | Cuota de manejo: $15.000

DETALLE DE MOVIMIENTOS Y COMPRAS A CUOTAS:
1. 2026-09-10 | ALKOSTO HIPERAHORRO | Valor original: $2.400.000 | Cuota 3 de 12 | Cuota mes: $200.000 | Saldo capital pendiente: $2.000.000
2. 2026-10-18 | MERCADOLIBRE COLOMBIA | Valor original: $900.000 | Cuota 2 de 6 | Cuota mes: $150.000 | Saldo capital pendiente: $750.000
3. 2026-11-04 | EXITO WOW MERCADO | Valor original: $310.000 | Cuota 1 de 1 | Cuota mes: $310.000 | Saldo capital pendiente: $310.000
4. 2026-11-11 | CREPES Y WAFFLES | Valor original: $75.000 | Cuota 1 de 1 | Cuota mes: $75.000 | Saldo capital pendiente: $75.000`,
  },
  {
    label: 'Extracto Nu Colombia',
    color: '#8B5CF6',
    text: `ESTADO DE CUENTA TARJETA NU COLOMBIA (LA MORADITA)
Fecha de corte: 2026-11-18 | Fecha límite de pago: 2026-12-03
Cupo Total: $5.000.000 | Cupo Disponible: $3.450.000
Deuda Total: $1.564.500
Total a pagar este mes: $564.500 | Pago Mínimo: $110.000
Tasa mensual: 2.08% E.M. | Intereses corrientes: $14.500 | Cuota de manejo: $0

MOVIMIENTOS DEL PERIODO:
- 2026-08-20 | IPHONE TIENDA MAC | Original: $2.000.000 | Cuota 4 de 10 | Cuota mensual: $200.000 | Saldo pendiente: $1.200.000
- 2026-11-05 | D1 SAS SUPERMERCADO | Original: $185.000 | Cuota 1 de 1 | Cuota mensual: $185.000 | Saldo pendiente: $185.000
- 2026-11-12 | UBER TRIP COLOMBIA | Original: $92.000 | Cuota 1 de 1 | Cuota mensual: $92.000 | Saldo pendiente: $92.000
- 2026-11-14 | NETFLIX.COM | Original: $73.000 | Cuota 1 de 1 | Cuota mensual: $73.000 | Saldo pendiente: $73.000`,
  },
  {
    label: 'Extracto RappiCard',
    color: '#6366F1',
    text: `EXTRACTO RAPPICARD VISA - RAPPIPAY
Fecha de corte: 2026-11-20 | Fecha límite de pago: 2026-12-06
Cupo Total: $6.000.000 | Cupo Disponible: $4.780.000
Deuda Total Acumulada: $1.232.000
Pago Total del Mes: $632.000 | Pago Mínimo: $125.000
Intereses corrientes: $12.000 | Cuota de manejo: $0

COMPRAS ACTIVAS:
- 2026-10-08 | HOMECENTER SODIMAC | Original: $1.200.000 | Cuota 2 de 4 | Cuota mes: $300.000 | Saldo pendiente: $900.000
- 2026-11-09 | RAPPI RESTAURANTES PRIME | Original: $195.000 | Cuota 1 de 1 | Cuota mes: $195.000 | Saldo pendiente: $195.000
- 2026-11-16 | FARMATODO COLOMBIA | Original: $125.000 | Cuota 1 de 1 | Cuota mes: $125.000 | Saldo pendiente: $125.000`,
  },
];

export const AIStatementAnalyzerModal: React.FC<AIStatementAnalyzerModalProps> = ({
  visible,
  card,
  onClose,
}) => {
  const { creditCards, categories, currency, syncCardFromAIStatement } = useFinancial();
  const { geminiApiKey, geminiModel, openAISettingsModal } = useAI();
  const { showSuccess, showWarning, showError } = useAlert();
  const { colors } = useAppTheme();

  const [selectedCardId, setSelectedCardId] = useState<string>(card?.id || '');
  const [rawStatementText, setRawStatementText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(true);

  const [extracted, setExtracted] = useState<GeminiExtractedStatement | null>(null);

  // Campos editables de las cifras oficiales del banco tras analizar
  const [creditLimitInput, setCreditLimitInput] = useState('');
  const [availableLimitInput, setAvailableLimitInput] = useState('');
  const [totalDebtInput, setTotalDebtInput] = useState('');
  const [billedMonthInput, setBilledMonthInput] = useState('');
  const [minPaymentInput, setMinPaymentInput] = useState('');
  const [interestInput, setInterestInput] = useState('');
  const [handlingFeeInput, setHandlingFeeInput] = useState('');

  const audioRecordingRef = useRef<any>(null);

  const activeCard =
    creditCards.find((c) => c.id === selectedCardId) || card || creditCards[0] || null;

  useEffect(() => {
    if (visible) {
      setSelectedCardId(card?.id || creditCards[0]?.id || '');
      setExtracted(null);
      setIsAnalyzing(false);
      setIsRecordingVoice(false);
      setIsSyncing(false);
    }
  }, [visible, card, creditCards]);

  const populateEditableFields = (data: GeminiExtractedStatement) => {
    setExtracted(data);
    setCreditLimitInput(formatInputNumber(String(data.creditLimit)));
    setAvailableLimitInput(formatInputNumber(String(data.availableLimit)));
    setTotalDebtInput(formatInputNumber(String(data.totalCurrentDebt)));
    setBilledMonthInput(formatInputNumber(String(data.totalStatementBalance)));
    setMinPaymentInput(formatInputNumber(String(data.minimumPayment)));
    setInterestInput(
      formatInputNumber(String((data.currentInterest || 0) + (data.lateInterest || 0)))
    );
    setHandlingFeeInput(
      formatInputNumber(String((data.handlingFee || 0) + (data.taxesAndFees || 0)))
    );
  };

  const handleAnalyzeText = async (textOverride?: string) => {
    if (!activeCard) return;
    const textToUse = (textOverride ?? rawStatementText).trim();
    if (textToUse.length < 10) {
      showWarning(
        'Texto del Extracto Requerido',
        'Pega el texto de tu extracto PDF/App bancaria, usa el micrófono de voz o toca una plantilla de ejemplo.'
      );
      return;
    }

    setIsAnalyzing(true);
    try {
      const { data } = await analyzeCardStatementWithGemini({
        statementText: textToUse,
        card: activeCard,
        categories,
        apiKey: geminiApiKey,
        model: geminiModel,
      });
      populateEditableFields(data);
    } catch {
      showError('Error de Análisis', 'No fue posible analizar el extracto.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const startVoiceRecording = async () => {
    if (!ExpoAudio || Platform.OS === 'web') {
      showWarning(
        'Micrófono Nativo',
        'Pega el texto del extracto o usa el micrófono desde tu teléfono Android.'
      );
      return;
    }

    try {
      const perm = await ExpoAudio.requestPermissionsAsync();
      if (!perm?.granted) {
        showWarning('Permiso de Micrófono', 'Concede permiso de micrófono para dictar el extracto.');
        return;
      }

      await ExpoAudio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      if (audioRecordingRef.current) {
        try {
          await audioRecordingRef.current.stopAndUnloadAsync();
        } catch {}
        audioRecordingRef.current = null;
      }

      const { recording } = await ExpoAudio.Recording.createAsync(
        ExpoAudio.RecordingOptionsPresets.HIGH_QUALITY
      );
      audioRecordingRef.current = recording;
      setIsRecordingVoice(true);
    } catch {
      setIsRecordingVoice(false);
    }
  };

  const stopVoiceAndAnalyze = async () => {
    if (!activeCard || !audioRecordingRef.current) {
      setIsRecordingVoice(false);
      return;
    }

    setIsRecordingVoice(false);
    setIsAnalyzing(true);

    try {
      const rec = audioRecordingRef.current;
      audioRecordingRef.current = null;
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();

      if (uri && ExpoFileSystem?.readAsStringAsync) {
        const audioBase64 = await ExpoFileSystem.readAsStringAsync(uri, {
          encoding: ExpoFileSystem.EncodingType?.Base64 || 'base64',
        });

        const { data } = await analyzeCardStatementWithGemini({
          audioBase64,
          audioMimeType: 'audio/mp4',
          card: activeCard,
          categories,
          apiKey: geminiApiKey,
          model: geminiModel,
        });
        populateEditableFields(data);
      }
    } catch {
      showError('Error de Voz IA', 'No se pudo procesar el dictado del extracto.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRemovePurchaseRow = (purchaseId: string) => {
    if (!extracted) return;
    const nextPurchases = extracted.purchases.filter((p) => p.id !== purchaseId);
    const nextRemainingSum = nextPurchases.reduce((s, p) => s + p.remainingPrincipal, 0);
    const nextQuotasSum = nextPurchases.reduce((s, p) => s + p.monthlyQuota, 0);
    const nonPrincipal =
      parseInputNumber(interestInput) + parseInputNumber(handlingFeeInput);
    const nextTotalDebt = nextRemainingSum + nonPrincipal;
    const nextBilled = nextQuotasSum + nonPrincipal;
    const currentLimit = parseInputNumber(creditLimitInput) || activeCard?.creditLimit || 5000000;
    const nextAvailable = Math.max(0, currentLimit - nextRemainingSum);

    const updated: GeminiExtractedStatement = {
      ...extracted,
      purchases: nextPurchases,
      totalCurrentDebt: nextTotalDebt,
      totalStatementBalance: nextBilled,
      availableLimit: nextAvailable,
      previousUnitemizedPrincipal: 0,
    };
    populateEditableFields(updated);
  };

  const handleConfirmSyncWithBank = async () => {
    if (!activeCard || !extracted) return;

    const finalCreditLimit = parseInputNumber(creditLimitInput) || activeCard.creditLimit;
    const finalAvailableLimit = parseInputNumber(availableLimitInput);
    const finalTotalDebt = parseInputNumber(totalDebtInput);
    const finalBilledMonth = parseInputNumber(billedMonthInput);
    const finalMinPayment = parseInputNumber(minPaymentInput);
    const finalInterest = parseInputNumber(interestInput);
    const finalHandlingFee = parseInputNumber(handlingFeeInput);

    const sumPurchasesPrincipal = extracted.purchases.reduce(
      (sum, p) => sum + p.remainingPrincipal,
      0
    );
    const nonPrincipal = finalInterest + finalHandlingFee;
    const impliedPrincipalDebt = Math.max(
      sumPurchasesPrincipal,
      finalTotalDebt - nonPrincipal
    );
    const unitemizedDiff = Math.max(0, impliedPrincipalDebt - sumPurchasesPrincipal);

    const finalPayload: GeminiExtractedStatement = {
      ...extracted,
      creditLimit: finalCreditLimit,
      availableLimit: finalAvailableLimit,
      totalCurrentDebt: finalTotalDebt,
      totalStatementBalance: finalBilledMonth,
      minimumPayment: finalMinPayment,
      currentInterest: finalInterest,
      lateInterest: 0,
      handlingFee: finalHandlingFee,
      taxesAndFees: 0,
      previousUnitemizedPrincipal: unitemizedDiff,
    };

    setIsSyncing(true);
    try {
      await syncCardFromAIStatement(activeCard.id, finalPayload, replaceExisting);
      showSuccess(
        '✨ ¡Tarjeta Sincronizada con el Banco!',
        `Se crearon ${finalPayload.purchases.length} compras activas en ${activeCard.name} y tus saldos (Disponible: ${formatCurrency(
          finalAvailableLimit,
          currency
        )}, Deuda Total: ${formatCurrency(
          finalTotalDebt,
          currency
        )}, Facturado: ${formatCurrency(finalBilledMonth, currency)}) quedaron idénticos a tu app bancaria.`
      );
      onClose();
    } catch (e: any) {
      showError(
        'Error al Sincronizar',
        e?.message || 'No se pudo sincronizar el extracto con la tarjeta.'
      );
    } finally {
      setIsSyncing(false);
    }
  };

  if (!activeCard) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.divider }]}>
            <View style={styles.headerLeft}>
              <LinearGradient
                colors={['#10B981', '#6366F1']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.headerIconBox}
              >
                <CustomIcon name="Sparkles" size={20} color="#FFFFFF" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={[styles.headerTag, { color: colors.success }]}>
                  SINCRONIZACIÓN BANCARIA CON GEMINI IA
                </Text>
                <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
                  Analizar Extracto de Tarjeta
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: colors.surfaceElevated }]}
              onPress={onClose}
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
            {/* Selector de Tarjeta Destino */}
            {creditCards.length > 1 && (
              <View>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                  Tarjeta a Sincronizar:
                </Text>
                <View style={styles.cardsChipsRow}>
                  {creditCards.map((c) => {
                    const isSelected = c.id === activeCard.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[
                          styles.cardSelectChip,
                          {
                            backgroundColor: colors.surfaceCard,
                            borderColor: isSelected ? colors.primary : colors.borderLight,
                          },
                          isSelected && {
                            backgroundColor: alpha(colors.primary, 0.18),
                          },
                        ]}
                        onPress={() => setSelectedCardId(c.id)}
                      >
                        <CustomIcon
                          name="CreditCard"
                          size={15}
                          color={isSelected ? colors.primaryLight : colors.textSecondary}
                        />
                        <Text
                          style={[
                            styles.cardSelectChipText,
                            {
                              color: isSelected ? colors.textPrimary : colors.textSecondary,
                              fontWeight: isSelected ? 'bold' : '600',
                            },
                          ]}
                        >
                          {c.name} ({c.bankName})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Aviso si no ha configurado su Gemini API Key */}
            {!geminiApiKey && (
              <TouchableOpacity
                style={[
                  styles.apiKeyWarningBox,
                  {
                    backgroundColor: alpha(colors.warning, 0.14),
                    borderColor: colors.warning,
                  },
                ]}
                onPress={() => {
                  onClose();
                  openAISettingsModal();
                }}
              >
                <CustomIcon name="KeyRound" size={17} color={colors.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.apiKeyWarningTitle, { color: colors.textPrimary }]}>
                    Configura tu Gemini API Key para máxima precisión
                  </Text>
                  <Text style={[styles.apiKeyWarningSub, { color: colors.textSecondary }]}>
                    Actualmente estás en modo local. Toca aquí para activar Gemini 3 Flash.
                  </Text>
                </View>
                <CustomIcon name="ChevronRight" size={16} color={colors.warning} />
              </TouchableOpacity>
            )}

            {/* Paso 1: Ingresar o Dictar el Extracto */}
            <View
              style={[
                styles.cardBox,
                { backgroundColor: colors.surfaceCard, borderColor: colors.border },
              ]}
            >
              <View style={styles.sectionHeaderRow}>
                <CustomIcon name="FileText" size={17} color={colors.primaryLight} />
                <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 0 }]}>
                  1. Pega o Dicta tu Extracto ({activeCard.name})
                </Text>
              </View>
              <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>
                Copia y pega el texto de tu extracto PDF o de tu app bancaria (con tus compras a cuotas, cupo, pago del mes y deuda total), o mantén presionado el botón de micrófono para dictarlo:
              </Text>

              {/* Plantillas reales para probar en 1 toque */}
              <Text style={[styles.sampleLabel, { color: colors.textMuted }]}>
                Ejemplos reales (toca uno para cargar y analizar con IA):
              </Text>
              <View style={styles.samplesRow}>
                {SAMPLE_STATEMENTS.map((sample, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.sampleChip,
                      {
                        backgroundColor: alpha(sample.color, 0.14),
                        borderColor: alpha(sample.color, 0.45),
                      },
                    ]}
                    onPress={() => {
                      setRawStatementText(sample.text);
                      handleAnalyzeText(sample.text);
                    }}
                    disabled={isAnalyzing}
                  >
                    <CustomIcon name="Sparkles" size={13} color={sample.color} />
                    <Text style={[styles.sampleChipText, { color: colors.textPrimary }]}>
                      {sample.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={[
                  styles.statementTextArea,
                  {
                    backgroundColor: colors.surfaceElevated,
                    color: colors.textPrimary,
                    borderColor: colors.borderLight,
                  },
                ]}
                placeholder="Pega aquí el texto del extracto PDF o escribe tus compras (ej: Cupo 5.000.000, Deuda total 1.800.000, Pago del mes 450.000. Compras: Alkosto $1.200.000 cuota 2 de 6, Mercado $250.000 a 1 cuota...)"
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={6}
                value={rawStatementText}
                onChangeText={setRawStatementText}
              />

              {/* Botones: Analizar Texto con Gemini + Dictar Extracto por Voz */}
              <View style={styles.inputActionsRow}>
                <TouchableOpacity
                  style={[
                    styles.analyzeBtn,
                    { backgroundColor: colors.primary },
                    isAnalyzing && { opacity: 0.65 },
                  ]}
                  onPress={() => handleAnalyzeText()}
                  disabled={isAnalyzing}
                >
                  {isAnalyzing ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <CustomIcon name="Sparkles" size={17} color="#FFFFFF" />
                  )}
                  <Text style={styles.analyzeBtnText}>
                    {isAnalyzing ? 'Analizando con Gemini...' : 'Analizar Extracto con IA'}
                  </Text>
                </TouchableOpacity>

                <Pressable
                  onPressIn={startVoiceRecording}
                  onPressOut={stopVoiceAndAnalyze}
                  style={({ pressed }) => [
                    styles.voiceHoldBtn,
                    {
                      backgroundColor: isRecordingVoice
                        ? colors.danger
                        : alpha(colors.success, 0.16),
                      borderColor: isRecordingVoice ? colors.danger : colors.success,
                    },
                    pressed && { transform: [{ scale: 0.96 }] },
                  ]}
                >
                  <CustomIcon
                    name="Mic"
                    size={18}
                    color={isRecordingVoice ? '#FFFFFF' : colors.success}
                  />
                  <Text
                    style={[
                      styles.voiceHoldBtnText,
                      { color: isRecordingVoice ? '#FFFFFF' : colors.success },
                    ]}
                  >
                    {isRecordingVoice ? 'Suelta para Procesar...' : 'Mantén para Dictar'}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Paso 2: Resultado Extraído por Gemini (Saldos Oficiales + Todos los Movimientos) */}
            {extracted && (
              <View
                style={[
                  styles.resultContainer,
                  {
                    backgroundColor: colors.surfaceCard,
                    borderColor: colors.success,
                  },
                ]}
              >
                <View style={styles.resultBannerHeader}>
                  <CustomIcon name="CheckCircle2" size={19} color={colors.success} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.resultBannerTitle, { color: colors.success }]}>
                      ¡Extracto Analizado con Éxito!
                    </Text>
                    <Text style={[styles.resultBannerSub, { color: colors.textSecondary }]}>
                      {extracted.resumenHumano}
                    </Text>
                  </View>
                </View>

                {/* A. Cifras Oficiales que dejarán la tarjeta igual al banco */}
                <Text style={[styles.subSectionHeading, { color: colors.textPrimary }]}>
                  A. Estado Oficial de la Tarjeta (Editable):
                </Text>

                <View style={styles.grid2Cols}>
                  <View style={styles.fieldCol}>
                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                      Cupo Total ($)
                    </Text>
                    <TextInput
                      style={[
                        styles.numInput,
                        {
                          backgroundColor: colors.surfaceElevated,
                          color: colors.textPrimary,
                          borderColor: colors.borderLight,
                        },
                      ]}
                      keyboardType="numeric"
                      value={creditLimitInput}
                      onChangeText={(v) => setCreditLimitInput(formatInputNumber(v))}
                    />
                  </View>

                  <View style={styles.fieldCol}>
                    <Text style={[styles.fieldLabel, { color: colors.success }]}>
                      Cupo Disponible Banco ($)
                    </Text>
                    <TextInput
                      style={[
                        styles.numInput,
                        {
                          backgroundColor: colors.surfaceElevated,
                          color: colors.success,
                          borderColor: colors.success,
                          fontWeight: 'bold',
                        },
                      ]}
                      keyboardType="numeric"
                      value={availableLimitInput}
                      onChangeText={(v) => setAvailableLimitInput(formatInputNumber(v))}
                    />
                  </View>
                </View>

                <View style={styles.grid2Cols}>
                  <View style={styles.fieldCol}>
                    <Text style={[styles.fieldLabel, { color: colors.danger }]}>
                      Deuda Total Actual ($)
                    </Text>
                    <TextInput
                      style={[
                        styles.numInput,
                        {
                          backgroundColor: colors.surfaceElevated,
                          color: colors.dangerLight,
                          borderColor: colors.danger,
                          fontWeight: 'bold',
                        },
                      ]}
                      keyboardType="numeric"
                      value={totalDebtInput}
                      onChangeText={(v) => setTotalDebtInput(formatInputNumber(v))}
                    />
                  </View>

                  <View style={styles.fieldCol}>
                    <Text style={[styles.fieldLabel, { color: colors.warning }]}>
                      Facturado este Mes ($)
                    </Text>
                    <TextInput
                      style={[
                        styles.numInput,
                        {
                          backgroundColor: colors.surfaceElevated,
                          color: colors.warningLight,
                          borderColor: colors.warning,
                          fontWeight: 'bold',
                        },
                      ]}
                      keyboardType="numeric"
                      value={billedMonthInput}
                      onChangeText={(v) => setBilledMonthInput(formatInputNumber(v))}
                    />
                  </View>
                </View>

                <View style={styles.grid3Cols}>
                  <View style={styles.fieldCol}>
                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                      Pago Mínimo ($)
                    </Text>
                    <TextInput
                      style={[
                        styles.numInputSmall,
                        {
                          backgroundColor: colors.surfaceElevated,
                          color: colors.textPrimary,
                          borderColor: colors.borderLight,
                        },
                      ]}
                      keyboardType="numeric"
                      value={minPaymentInput}
                      onChangeText={(v) => setMinPaymentInput(formatInputNumber(v))}
                    />
                  </View>

                  <View style={styles.fieldCol}>
                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                      Intereses Corte ($)
                    </Text>
                    <TextInput
                      style={[
                        styles.numInputSmall,
                        {
                          backgroundColor: colors.surfaceElevated,
                          color: colors.textPrimary,
                          borderColor: colors.borderLight,
                        },
                      ]}
                      keyboardType="numeric"
                      value={interestInput}
                      onChangeText={(v) => setInterestInput(formatInputNumber(v))}
                    />
                  </View>

                  <View style={styles.fieldCol}>
                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                      Cuota Manejo ($)
                    </Text>
                    <TextInput
                      style={[
                        styles.numInputSmall,
                        {
                          backgroundColor: colors.surfaceElevated,
                          color: colors.textPrimary,
                          borderColor: colors.borderLight,
                        },
                      ]}
                      keyboardType="numeric"
                      value={handlingFeeInput}
                      onChangeText={(v) => setHandlingFeeInput(formatInputNumber(v))}
                    />
                  </View>
                </View>

                {/* B. Lista de Todos los Movimientos / Compras a Cuotas Detectados */}
                <Text style={[styles.subSectionHeading, { color: colors.textPrimary, marginTop: 8 }]}>
                  B. Movimientos y Compras que se Crearán ({extracted.purchases.length}):
                </Text>

                <View style={styles.purchasesListWrap}>
                  {extracted.purchases.map((p) => {
                    const remainingQuotas = Math.max(1, p.installmentsTotal - p.installmentsPaid);
                    return (
                      <View
                        key={p.id}
                        style={[
                          styles.purchaseCardItem,
                          {
                            backgroundColor: colors.surfaceElevated,
                            borderColor: colors.borderLight,
                          },
                        ]}
                      >
                        <View style={styles.purchaseCardTop}>
                          <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                            <Text
                              style={[styles.purchaseDesc, { color: colors.textPrimary }]}
                              numberOfLines={1}
                            >
                              {p.description}
                            </Text>
                            <Text style={[styles.purchaseDateText, { color: colors.textMuted }]}>
                              Fecha: {p.purchaseDate} • Valor original:{' '}
                              {formatCurrency(p.originalAmount, currency)}
                            </Text>
                          </View>

                          <View
                            style={[
                              styles.quotaBadgePill,
                              { backgroundColor: alpha(colors.primary, 0.2) },
                            ]}
                          >
                            <Text style={[styles.quotaBadgeText, { color: colors.primaryLight }]}>
                              Cuota {p.currentInstallmentNumber} de {p.installmentsTotal}
                            </Text>
                          </View>

                          <TouchableOpacity
                            style={styles.removePurchaseBtn}
                            onPress={() => handleRemovePurchaseRow(p.id)}
                          >
                            <CustomIcon name="Trash2" size={15} color={colors.danger} />
                          </TouchableOpacity>
                        </View>

                        <View
                          style={[
                            styles.purchaseCardBottom,
                            { borderTopColor: colors.divider },
                          ]}
                        >
                          <View>
                            <Text style={[styles.purchaseMetaLabel, { color: colors.textMuted }]}>
                              Cuota Mensual
                            </Text>
                            <Text style={[styles.purchaseMetaValue, { color: colors.success }]}>
                              {formatCurrency(p.monthlyQuota, currency)}/mes
                            </Text>
                          </View>

                          <View style={{ alignItems: 'center' }}>
                            <Text style={[styles.purchaseMetaLabel, { color: colors.textMuted }]}>
                              Estado Cuotas
                            </Text>
                            <Text style={[styles.purchaseMetaValue, { color: colors.textPrimary }]}>
                              {p.installmentsPaid} pagadas • {remainingQuotas} pend.
                            </Text>
                          </View>

                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={[styles.purchaseMetaLabel, { color: colors.textMuted }]}>
                              Capital Pendiente
                            </Text>
                            <Text style={[styles.purchaseMetaValue, { color: colors.warningLight }]}>
                              {formatCurrency(p.remainingPrincipal, currency)}
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>

                {/* Switch Reemplazar Estado Anterior */}
                <View
                  style={[
                    styles.replaceSwitchBox,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.borderLight,
                    },
                  ]}
                >
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={[styles.replaceSwitchTitle, { color: colors.textPrimary }]}>
                      Dejar tarjeta exactamente igual al extracto
                    </Text>
                    <Text style={[styles.replaceSwitchSub, { color: colors.textSecondary }]}>
                      Reemplaza los movimientos previos de esta tarjeta por los del extracto analizado para evitar duplicados.
                    </Text>
                  </View>
                  <Switch
                    value={replaceExisting}
                    onValueChange={setReplaceExisting}
                    trackColor={{ false: '#334155', true: '#10B981' }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                {/* Botón Principal de Sincronización */}
                <TouchableOpacity
                  style={[
                    styles.syncConfirmBtn,
                    { backgroundColor: colors.success },
                    isSyncing && { opacity: 0.65 },
                  ]}
                  onPress={handleConfirmSyncWithBank}
                  disabled={isSyncing}
                >
                  {isSyncing ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <CustomIcon name="CheckCircle2" size={20} color="#FFFFFF" />
                  )}
                  <Text style={styles.syncConfirmBtnText}>
                    {isSyncing
                      ? 'Sincronizando Tarjeta...'
                      : 'Crear Movimientos y Sincronizar Tarjeta'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    maxHeight: '92%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 10,
  },
  headerIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTag: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  headerTitle: {
    fontSize: 17,
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
    paddingBottom: 38,
    gap: 14,
  },
  cardsChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  cardSelectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  cardSelectChipText: {
    fontSize: 13,
  },
  apiKeyWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 13,
    borderWidth: 1,
  },
  apiKeyWarningTitle: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  apiKeyWarningSub: {
    fontSize: 13,
    marginTop: 1,
  },
  cardBox: {
    borderRadius: 16,
    padding: 15,
    borderWidth: 1,
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  sectionSub: {
    fontSize: 13,
    lineHeight: 18,
  },
  sampleLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  samplesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sampleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  sampleChipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  statementTextArea: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    fontSize: 13,
    minHeight: 115,
    textAlignVertical: 'top',
  },
  inputActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  analyzeBtn: {
    flex: 1.3,
    minHeight: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 12,
  },
  analyzeBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  voiceHoldBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  voiceHoldBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  resultContainer: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    gap: 12,
  },
  resultBannerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  resultBannerTitle: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  resultBannerSub: {
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },
  subSectionHeading: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  grid2Cols: {
    flexDirection: 'row',
    gap: 10,
  },
  grid3Cols: {
    flexDirection: 'row',
    gap: 8,
  },
  fieldCol: {
    flex: 1,
    minWidth: 0,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  numInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 14,
  },
  numInputSmall: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 13,
  },
  purchasesListWrap: {
    gap: 9,
  },
  purchaseCardItem: {
    borderRadius: 13,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  purchaseCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  purchaseDesc: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  purchaseDateText: {
    fontSize: 13,
    marginTop: 2,
  },
  quotaBadgePill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    marginRight: 6,
  },
  quotaBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  removePurchaseBtn: {
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  purchaseCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
  },
  purchaseMetaLabel: {
    fontSize: 12,
  },
  purchaseMetaValue: {
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 1,
  },
  replaceSwitchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  replaceSwitchTitle: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  replaceSwitchSub: {
    fontSize: 13,
    marginTop: 2,
    lineHeight: 17,
  },
  syncConfirmBtn: {
    minHeight: 52,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  syncConfirmBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
