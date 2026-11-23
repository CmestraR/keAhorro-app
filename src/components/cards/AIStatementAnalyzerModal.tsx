import React, { useState, useEffect } from 'react';
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
import { File as ExpoFSFile } from 'expo-file-system';
import { CreditCard } from '../../types/finance';
import { useFinancial } from '../../context/FinancialContext';
import { useAI } from '../../context/AIContext';
import { useAlert } from '../../context/AlertContext';
import { useAppTheme } from '../../context/ThemeContext';
import {
  analyzeCardStatementWithGemini,
  GeminiExtractedStatement,
} from '../../utils/geminiService';
import { formatCurrency, formatInputNumber, parseInputNumber } from '../../utils/formatters';
import { alpha } from '../common/Theme';
import { CustomIcon } from '../common/CustomIcon';
import { Text, TextInput } from '../common/AppText';
import { TouchableOpacity } from '../common/Touchable';

let LegacyFileSystem: any = null;
try {
  LegacyFileSystem = require('expo-file-system/legacy');
} catch {
  LegacyFileSystem = null;
}

interface AIStatementAnalyzerModalProps {
  visible: boolean;
  card: CreditCard | null;
  onClose: () => void;
}

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
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [selectedFileSizeKb, setSelectedFileSizeKb] = useState<number | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [showManualTextOption, setShowManualTextOption] = useState(false);
  const [rawStatementText, setRawStatementText] = useState('');

  const [extracted, setExtracted] = useState<GeminiExtractedStatement | null>(null);

  // Campos editables de las cifras oficiales del banco tras analizar el PDF
  const [creditLimitInput, setCreditLimitInput] = useState('');
  const [availableLimitInput, setAvailableLimitInput] = useState('');
  const [totalDebtInput, setTotalDebtInput] = useState('');
  const [billedMonthInput, setBilledMonthInput] = useState('');
  const [minPaymentInput, setMinPaymentInput] = useState('');
  const [interestInput, setInterestInput] = useState('');
  const [handlingFeeInput, setHandlingFeeInput] = useState('');

  const activeCard =
    creditCards.find((c) => c.id === selectedCardId) || card || creditCards[0] || null;

  useEffect(() => {
    if (visible) {
      setSelectedCardId(card?.id || creditCards[0]?.id || '');
      setSelectedFileName(null);
      setSelectedFileSizeKb(null);
      setExtracted(null);
      setIsAnalyzing(false);
      setIsSyncing(false);
      setShowManualTextOption(false);
      setRawStatementText('');
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

  /**
   * Abre el selector nativo de archivos en Android/iOS (o input file en Web) para seleccionar el PDF (o imagen) del extracto,
   * lee su contenido en Base64 y lo envía directamente a Gemini Multimodal.
   */
  const handlePickAndAnalyzeFile = async (mimeType: 'application/pdf' | 'image/*') => {
    if (!activeCard) return;

    if (!geminiApiKey.trim()) {
      showWarning(
        'Gemini API Key Requerida',
        'Para que la IA pueda leer documentos PDF e imágenes de extractos bancarios, configura primero tu Gemini API Key.'
      );
      onClose();
      openAISettingsModal();
      return;
    }

    // Caso Web: usar <input type="file"> del navegador
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = mimeType === 'application/pdf' ? 'application/pdf' : 'image/*';
      input.onchange = async (e: any) => {
        const file = e?.target?.files?.[0];
        if (!file) return;
        setSelectedFileName(file.name);
        setSelectedFileSizeKb(Math.round(file.size / 1024));
        setIsAnalyzing(true);
        try {
          const base64: string = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const resStr = String(reader.result || '');
              const parts = resStr.split(',');
              resolve(parts.length > 1 ? parts[1] : resStr);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          const { data } = await analyzeCardStatementWithGemini({
            fileBase64: base64,
            fileMimeType: file.type || (mimeType === 'application/pdf' ? 'application/pdf' : 'image/jpeg'),
            card: activeCard,
            categories,
            apiKey: geminiApiKey,
            model: geminiModel,
          });
          populateEditableFields(data);
        } catch {
          showError('Error al leer PDF', 'No se pudo analizar el archivo seleccionado.');
        } finally {
          setIsAnalyzing(false);
        }
      };
      input.click();
      return;
    }

    // Caso Nativo Android / iOS: usar File.pickFileAsync de expo-file-system
    try {
      const picked = await ExpoFSFile.pickFileAsync(undefined, mimeType);
      const pickedFile = Array.isArray(picked) ? picked[0] : picked;
      if (!pickedFile) return;

      const fileNameOrUri = (pickedFile as any).name || pickedFile.uri || 'Extracto_Bancario.pdf';
      const rawName = decodeURIComponent(String(fileNameOrUri));
      const displayName = rawName.split('/').pop()?.split('%2F').pop() || 'Extracto_Bancario.pdf';
      setSelectedFileName(displayName);
      if (pickedFile.size && pickedFile.size > 0) {
        setSelectedFileSizeKb(Math.round(pickedFile.size / 1024));
      } else {
        setSelectedFileSizeKb(null);
      }

      setIsAnalyzing(true);
      setExtracted(null);

      let base64Data = '';
      try {
        base64Data = await pickedFile.base64();
      } catch {
        if (LegacyFileSystem?.readAsStringAsync && pickedFile.uri) {
          base64Data = await LegacyFileSystem.readAsStringAsync(pickedFile.uri, {
            encoding: LegacyFileSystem.EncodingType?.Base64 || 'base64',
          });
        }
      }

      if (!base64Data) {
        showError(
          'No se pudo leer el archivo',
          'Asegúrate de elegir un archivo PDF válido descargado en tu teléfono.'
        );
        setIsAnalyzing(false);
        return;
      }

      const detectedMime =
        mimeType === 'application/pdf'
          ? 'application/pdf'
          : pickedFile.type || 'image/jpeg';

      const { data } = await analyzeCardStatementWithGemini({
        fileBase64: base64Data,
        fileMimeType: detectedMime,
        card: activeCard,
        categories,
        apiKey: geminiApiKey,
        model: geminiModel,
      });

      populateEditableFields(data);
    } catch (err: any) {
      const msg = String(err?.message || '');
      // Si el usuario simplemente cerró el selector de archivos sin elegir nada, no mostrar error
      if (/cancel/i.test(msg)) {
        return;
      }
      showError(
        'Error al Analizar PDF',
        'No fue posible procesar el documento PDF. Verifica que no tenga contraseña de apertura o intenta con una captura de pantalla.'
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnalyzeManualText = async () => {
    if (!activeCard) return;
    if (rawStatementText.trim().length < 10) {
      showWarning('Texto Vacío', 'Pega el texto del extracto para analizarlo.');
      return;
    }
    setIsAnalyzing(true);
    try {
      const { data } = await analyzeCardStatementWithGemini({
        statementText: rawStatementText.trim(),
        card: activeCard,
        categories,
        apiKey: geminiApiKey,
        model: geminiModel,
      });
      populateEditableFields(data);
    } catch {
      showError('Error', 'No fue posible analizar el texto.');
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
        '✨ ¡Tarjeta Sincronizada con tu PDF!',
        `Se crearon ${finalPayload.purchases.length} movimientos en ${activeCard.name} y tus saldos (Disponible: ${formatCurrency(
          finalAvailableLimit,
          currency
        )}, Deuda Total: ${formatCurrency(
          finalTotalDebt,
          currency
        )}, Facturado: ${formatCurrency(finalBilledMonth, currency)}) quedaron idénticos a tu extracto bancario.`
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
                <CustomIcon name="FileText" size={20} color="#FFFFFF" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={[styles.headerTag, { color: colors.success }]}>
                  LECTOR DE EXTRACTOS PDF CON GEMINI IA
                </Text>
                <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
                  Subir Extracto de Tarjeta (PDF)
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
                    Configura tu Gemini API Key primero
                  </Text>
                  <Text style={[styles.apiKeyWarningSub, { color: colors.textSecondary }]}>
                    Se requiere tu llave de Google AI Studio para que Gemini lea documentos PDF. Toca aquí para configurarla.
                  </Text>
                </View>
                <CustomIcon name="ChevronRight" size={16} color={colors.warning} />
              </TouchableOpacity>
            )}

            {/* Zona Protagonista: Subir Archivo PDF del Extracto */}
            <View
              style={[
                styles.pdfUploadHeroCard,
                {
                  backgroundColor: colors.surfaceCard,
                  borderColor: selectedFileName ? colors.success : alpha(colors.primary, 0.5),
                },
              ]}
            >
              <View
                style={[
                  styles.pdfBigIconCircle,
                  { backgroundColor: alpha(colors.success, 0.16) },
                ]}
              >
                {isAnalyzing ? (
                  <ActivityIndicator size="large" color={colors.success} />
                ) : (
                  <CustomIcon name="FileUp" size={32} color={colors.success} />
                )}
              </View>

              <Text style={[styles.pdfHeroTitle, { color: colors.textPrimary }]}>
                {isAnalyzing
                  ? 'Gemini está leyendo tu extracto PDF...'
                  : selectedFileName
                  ? selectedFileName
                  : `Sube el Extracto PDF de ${activeCard.name}`}
              </Text>

              <Text style={[styles.pdfHeroSubtitle, { color: colors.textSecondary }]}>
                {isAnalyzing
                  ? 'Extrayendo todas las compras, cuotas pagadas/pendientes, intereses, cupo disponible y deuda total...'
                  : selectedFileName
                  ? `${
                      selectedFileSizeKb ? `${selectedFileSizeKb} KB • ` : ''
                    }Documento cargado. Puedes elegir otro PDF si lo deseas.`
                  : 'Selecciona el archivo .PDF oficial descargado de tu banco (Bancolombia, Nu, RappiCard, Davivienda, BBVA...). Nota: si el PDF tiene clave, usa un PDF sin clave o sube captura de pantalla.'}
              </Text>

              {/* Botón Principal Grande: Seleccionar Archivo PDF */}
              <TouchableOpacity
                style={[
                  styles.pickPdfPrimaryBtn,
                  { backgroundColor: colors.success },
                  isAnalyzing && { opacity: 0.6 },
                ]}
                onPress={() => handlePickAndAnalyzeFile('application/pdf')}
                disabled={isAnalyzing}
              >
                <CustomIcon name="FileText" size={20} color="#FFFFFF" />
                <Text style={styles.pickPdfPrimaryBtnText}>
                  {selectedFileName ? 'Elegir Otro Archivo PDF' : 'Seleccionar Extracto en PDF'}
                </Text>
              </TouchableOpacity>

              {/* Botón Secundario: Subir Captura / Imagen del Extracto */}
              <TouchableOpacity
                style={[
                  styles.pickImageSecondaryBtn,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.borderLight,
                  },
                  isAnalyzing && { opacity: 0.6 },
                ]}
                onPress={() => handlePickAndAnalyzeFile('image/*')}
                disabled={isAnalyzing}
              >
                <CustomIcon name="Image" size={17} color={colors.primaryLight} />
                <Text style={[styles.pickImageSecondaryBtnText, { color: colors.textPrimary }]}>
                  O subir captura de pantalla del extracto / app bancaria
                </Text>
              </TouchableOpacity>

              {/* Opción plegable por si el PDF tiene contraseña de cédula y prefiere pegar el texto */}
              <TouchableOpacity
                style={styles.toggleManualTextLink}
                onPress={() => setShowManualTextOption(!showManualTextOption)}
              >
                <Text style={[styles.toggleManualTextLinkLabel, { color: colors.textMuted }]}>
                  {showManualTextOption
                    ? '▲ Ocultar opción de pegar texto'
                    : '¿Tu PDF tiene contraseña? Toca aquí para pegar el texto copiado'}
                </Text>
              </TouchableOpacity>

              {showManualTextOption && (
                <View style={styles.manualTextCollapsible}>
                  <TextInput
                    style={[
                      styles.statementTextArea,
                      {
                        backgroundColor: colors.surfaceElevated,
                        color: colors.textPrimary,
                        borderColor: colors.borderLight,
                      },
                    ]}
                    placeholder="Abre tu PDF con tu clave, copia el texto de tus compras y saldos y pégalo aquí..."
                    placeholderTextColor={colors.textMuted}
                    multiline
                    numberOfLines={4}
                    value={rawStatementText}
                    onChangeText={setRawStatementText}
                  />
                  <TouchableOpacity
                    style={[styles.analyzeTextSmallBtn, { backgroundColor: colors.primary }]}
                    onPress={handleAnalyzeManualText}
                    disabled={isAnalyzing}
                  >
                    <CustomIcon name="Sparkles" size={15} color="#FFFFFF" />
                    <Text style={styles.analyzeTextSmallBtnLabel}>Analizar Texto Pegado</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Paso 2: Resultado Extraído del PDF por Gemini (Saldos Oficiales + Todos los Movimientos) */}
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
                      ¡Extracto PDF Analizado con Éxito!
                    </Text>
                    <Text style={[styles.resultBannerSub, { color: colors.textSecondary }]}>
                      {extracted.resumenHumano}
                    </Text>
                  </View>
                </View>

                {/* A. Cifras Oficiales que dejarán la tarjeta igual al banco */}
                <Text style={[styles.subSectionHeading, { color: colors.textPrimary }]}>
                  A. Estado Oficial de la Tarjeta (Verificado del PDF):
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

                {/* B. Lista de Todos los Movimientos / Compras a Cuotas Detectados en el PDF */}
                <Text style={[styles.subSectionHeading, { color: colors.textPrimary, marginTop: 8 }]}>
                  B. Movimientos Extraídos del PDF ({extracted.purchases.length}):
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
                      Dejar tarjeta exactamente igual al extracto PDF
                    </Text>
                    <Text style={[styles.replaceSwitchSub, { color: colors.textSecondary }]}>
                      Reemplaza los movimientos previos de esta tarjeta por los del PDF analizado para evitar duplicados.
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
  sectionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  pdfUploadHeroCard: {
    borderRadius: 18,
    padding: 18,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    gap: 10,
  },
  pdfBigIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  pdfHeroTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  pdfHeroSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 4,
  },
  pickPdfPrimaryBtn: {
    width: '100%',
    minHeight: 52,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  pickPdfPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  pickImageSecondaryBtn: {
    width: '100%',
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  pickImageSecondaryBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  toggleManualTextLink: {
    paddingVertical: 6,
  },
  toggleManualTextLinkLabel: {
    fontSize: 13,
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
  manualTextCollapsible: {
    width: '100%',
    gap: 8,
    marginTop: 4,
  },
  statementTextArea: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    fontSize: 13,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  analyzeTextSmallBtn: {
    minHeight: 42,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  analyzeTextSmallBtnLabel: {
    color: '#FFFFFF',
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
