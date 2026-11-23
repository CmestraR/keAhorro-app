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
import {
  analyzeCardStatementWithGemini,
  GeminiExtractedStatement,
} from '../../utils/geminiService';
import { formatCurrency, formatInputNumber, parseInputNumber } from '../../utils/formatters';
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

// Paleta Dark Mode unificada de keAhorro (acento Morado/Índigo y Azul)
const DARK = {
  sheetBg: '#121520',
  cardBg: '#181C2A',
  cardElevated: '#1E2336',
  inputBg: '#121520',
  border: '#262D45',
  borderAccent: 'rgba(99, 102, 241, 0.45)',
  divider: 'rgba(255, 255, 255, 0.07)',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  primary: '#6366F1',
  primaryLight: '#818CF8',
  primarySoftBg: 'rgba(99, 102, 241, 0.16)',
  blue: '#3B82F6',
  blueLight: '#60A5FA',
  blueSoftBg: 'rgba(59, 130, 246, 0.16)',
  warning: '#F59E0B',
  warningLight: '#FBBF24',
  danger: '#F43F5E',
  dangerLight: '#FB7185',
};

export const AIStatementAnalyzerModal: React.FC<AIStatementAnalyzerModalProps> = ({
  visible,
  card,
  onClose,
}) => {
  const { creditCards, categories, currency, syncCardFromAIStatement } = useFinancial();
  const { geminiApiKey, geminiModel, openAISettingsModal } = useAI();
  const { showSuccess, showWarning, showError } = useAlert();

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
            fileMimeType:
              file.type || (mimeType === 'application/pdf' ? 'application/pdf' : 'image/jpeg'),
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

        <View style={styles.sheet}>
          {/* Header en Dark Mode con Acento Morado/Azul */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <LinearGradient
                colors={[DARK.primary, DARK.blue]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.headerIconBox}
              >
                <CustomIcon name="FileText" size={20} color="#FFFFFF" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerTag}>
                  LECTOR DE EXTRACTOS PDF CON GEMINI IA
                </Text>
                <Text style={styles.headerTitle}>
                  Subir Extracto de Tarjeta (PDF)
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <CustomIcon name="X" size={18} color={DARK.textSecondary} />
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
                <Text style={styles.sectionTitle}>Tarjeta a Sincronizar:</Text>
                <View style={styles.cardsChipsRow}>
                  {creditCards.map((c) => {
                    const isSelected = c.id === activeCard.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[
                          styles.cardSelectChip,
                          isSelected && styles.cardSelectChipActive,
                        ]}
                        onPress={() => setSelectedCardId(c.id)}
                      >
                        <CustomIcon
                          name="CreditCard"
                          size={15}
                          color={isSelected ? DARK.primaryLight : DARK.textSecondary}
                        />
                        <Text
                          style={[
                            styles.cardSelectChipText,
                            isSelected && styles.cardSelectChipTextActive,
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
                style={styles.apiKeyWarningBox}
                onPress={() => {
                  onClose();
                  openAISettingsModal();
                }}
              >
                <CustomIcon name="KeyRound" size={17} color={DARK.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.apiKeyWarningTitle}>
                    Configura tu Gemini API Key primero
                  </Text>
                  <Text style={styles.apiKeyWarningSub}>
                    Se requiere tu llave de Google AI Studio para que Gemini lea documentos PDF. Toca aquí para configurarla.
                  </Text>
                </View>
                <CustomIcon name="ChevronRight" size={16} color={DARK.warning} />
              </TouchableOpacity>
            )}

            {/* Zona Protagonista: Subir Archivo PDF del Extracto (Tema Oscuro Morado/Azul) */}
            <View
              style={[
                styles.pdfUploadHeroCard,
                selectedFileName && { borderColor: DARK.primaryLight },
              ]}
            >
              <View style={styles.pdfBigIconCircle}>
                {isAnalyzing ? (
                  <ActivityIndicator size="large" color={DARK.primaryLight} />
                ) : (
                  <CustomIcon name="FileUp" size={30} color={DARK.primaryLight} />
                )}
              </View>

              <Text style={styles.pdfHeroTitle}>
                {isAnalyzing
                  ? 'Gemini está leyendo tu extracto PDF...'
                  : selectedFileName
                  ? selectedFileName
                  : `Sube el Extracto PDF de ${activeCard.name}`}
              </Text>

              <Text style={styles.pdfHeroSubtitle}>
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
                style={[styles.pickPdfPrimaryBtn, isAnalyzing && { opacity: 0.6 }]}
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
                style={[styles.pickImageSecondaryBtn, isAnalyzing && { opacity: 0.6 }]}
                onPress={() => handlePickAndAnalyzeFile('image/*')}
                disabled={isAnalyzing}
              >
                <CustomIcon name="Image" size={17} color={DARK.primaryLight} />
                <Text style={styles.pickImageSecondaryBtnText}>
                  O subir captura de pantalla del extracto / app bancaria
                </Text>
              </TouchableOpacity>

              {/* Opción plegable por si el PDF tiene contraseña de cédula */}
              <TouchableOpacity
                style={styles.toggleManualTextLink}
                onPress={() => setShowManualTextOption(!showManualTextOption)}
              >
                <Text style={styles.toggleManualTextLinkLabel}>
                  {showManualTextOption
                    ? '▲ Ocultar opción de pegar texto'
                    : '¿Tu PDF tiene contraseña? Toca aquí para pegar el texto copiado'}
                </Text>
              </TouchableOpacity>

              {showManualTextOption && (
                <View style={styles.manualTextCollapsible}>
                  <TextInput
                    style={styles.statementTextArea}
                    placeholder="Abre tu PDF con tu clave, copia el texto de tus compras y saldos y pégalo aquí..."
                    placeholderTextColor={DARK.textMuted}
                    multiline
                    numberOfLines={4}
                    value={rawStatementText}
                    onChangeText={setRawStatementText}
                  />
                  <TouchableOpacity
                    style={styles.analyzeTextSmallBtn}
                    onPress={handleAnalyzeManualText}
                    disabled={isAnalyzing}
                  >
                    <CustomIcon name="Sparkles" size={15} color="#FFFFFF" />
                    <Text style={styles.analyzeTextSmallBtnLabel}>Analizar Texto Pegado</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Paso 2: Resultado Extraído del PDF por Gemini (Sin borde contenedor exterior) */}
            {extracted && (
              <View style={styles.resultSection}>
                <View style={styles.resultBannerHeader}>
                  <View style={styles.resultBannerIconWrap}>
                    <CustomIcon name="Sparkles" size={18} color={DARK.primaryLight} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resultBannerTitle}>
                      ¡Extracto PDF Analizado con Éxito!
                    </Text>
                    <Text style={styles.resultBannerSub}>
                      {extracted.resumenHumano}
                    </Text>
                  </View>
                </View>

                {/* A. Cifras Oficiales que dejarán la tarjeta igual al banco */}
                <View style={styles.officialBalancesCard}>
                  <Text style={styles.subSectionHeading}>
                    A. Estado Oficial de la Tarjeta (Verificado del PDF):
                  </Text>

                  <View style={styles.grid2Cols}>
                    <View style={styles.fieldCol}>
                      <Text style={styles.fieldLabel}>Cupo Total ($)</Text>
                      <TextInput
                        style={styles.numInput}
                        keyboardType="numeric"
                        value={creditLimitInput}
                        onChangeText={(v) => setCreditLimitInput(formatInputNumber(v))}
                      />
                    </View>

                    <View style={styles.fieldCol}>
                      <Text style={[styles.fieldLabel, { color: DARK.blueLight }]}>
                        Cupo Disponible Banco ($)
                      </Text>
                      <TextInput
                        style={[
                          styles.numInput,
                          {
                            color: DARK.blueLight,
                            borderColor: DARK.blue,
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
                      <Text style={[styles.fieldLabel, { color: DARK.dangerLight }]}>
                        Deuda Total Actual ($)
                      </Text>
                      <TextInput
                        style={[
                          styles.numInput,
                          {
                            color: DARK.dangerLight,
                            borderColor: DARK.danger,
                            fontWeight: 'bold',
                          },
                        ]}
                        keyboardType="numeric"
                        value={totalDebtInput}
                        onChangeText={(v) => setTotalDebtInput(formatInputNumber(v))}
                      />
                    </View>

                    <View style={styles.fieldCol}>
                      <Text style={[styles.fieldLabel, { color: DARK.primaryLight }]}>
                        Facturado este Mes ($)
                      </Text>
                      <TextInput
                        style={[
                          styles.numInput,
                          {
                            color: DARK.primaryLight,
                            borderColor: DARK.primary,
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
                      <Text style={styles.fieldLabel}>Pago Mínimo ($)</Text>
                      <TextInput
                        style={styles.numInputSmall}
                        keyboardType="numeric"
                        value={minPaymentInput}
                        onChangeText={(v) => setMinPaymentInput(formatInputNumber(v))}
                      />
                    </View>

                    <View style={styles.fieldCol}>
                      <Text style={styles.fieldLabel}>Intereses Corte ($)</Text>
                      <TextInput
                        style={styles.numInputSmall}
                        keyboardType="numeric"
                        value={interestInput}
                        onChangeText={(v) => setInterestInput(formatInputNumber(v))}
                      />
                    </View>

                    <View style={styles.fieldCol}>
                      <Text style={styles.fieldLabel}>Cuota Manejo ($)</Text>
                      <TextInput
                        style={styles.numInputSmall}
                        keyboardType="numeric"
                        value={handlingFeeInput}
                        onChangeText={(v) => setHandlingFeeInput(formatInputNumber(v))}
                      />
                    </View>
                  </View>
                </View>

                {/* B. Lista de Todos los Movimientos / Compras a Cuotas Detectados en el PDF */}
                <Text style={[styles.subSectionHeading, { marginTop: 4 }]}>
                  B. Movimientos Extraídos del PDF ({extracted.purchases.length}):
                </Text>

                <View style={styles.purchasesListWrap}>
                  {extracted.purchases.map((p) => (
                    <View key={p.id} style={styles.purchaseCardItem}>
                      {/* Cabecera: Título a la izquierda (flex: 1), chip de cuota + tacho a la derecha */}
                      <View style={styles.purchaseCardTop}>
                        <Text
                          style={styles.purchaseDesc}
                          numberOfLines={1}
                          ellipsizeMode="tail"
                        >
                          {p.description}
                        </Text>

                        <View style={styles.purchaseTopRightGroup}>
                          <View style={styles.quotaBadgePill}>
                            <Text style={styles.quotaBadgeText}>
                              Cuota {p.currentInstallmentNumber} de {p.installmentsTotal}
                            </Text>
                          </View>

                          <TouchableOpacity
                            style={styles.removePurchaseBtn}
                            onPress={() => handleRemovePurchaseRow(p.id)}
                          >
                            <CustomIcon name="Trash2" size={15} color={DARK.dangerLight} />
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Subtítulo en una sola línea limpia */}
                      <Text
                        style={styles.purchaseDateText}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        Fecha: {p.purchaseDate} • Valor original:{' '}
                        {formatCurrency(p.originalAmount, currency)}
                      </Text>

                      {/* Grilla inferior de 3 métricas sin colisión ni desbordamiento */}
                      <View style={styles.purchaseCardBottom}>
                        {/* Izquierda: Cuota mensual */}
                        <View style={styles.metricColLeft}>
                          <Text style={styles.purchaseMetaLabel} numberOfLines={1}>
                            Cuota mensual
                          </Text>
                          <Text
                            style={[styles.purchaseMetaValue, { color: DARK.primaryLight }]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.85}
                          >
                            {formatCurrency(p.monthlyQuota, currency)}/mes
                          </Text>
                        </View>

                        {/* Centro: Progreso */}
                        <View style={styles.metricColCenter}>
                          <Text style={styles.purchaseMetaLabel} numberOfLines={1}>
                            Progreso
                          </Text>
                          <Text
                            style={[styles.purchaseMetaValue, { color: DARK.textPrimary }]}
                            numberOfLines={1}
                          >
                            {p.installmentsPaid}/{p.installmentsTotal} pagadas
                          </Text>
                        </View>

                        {/* Derecha: Capital pendiente */}
                        <View style={styles.metricColRight}>
                          <Text style={styles.purchaseMetaLabel} numberOfLines={1}>
                            Capital pendiente
                          </Text>
                          <Text
                            style={[styles.purchaseMetaValue, { color: DARK.warningLight }]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.82}
                          >
                            {formatCurrency(p.remainingPrincipal, currency)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>

                {/* Switch Reemplazar Estado Anterior (Acento Morado/Índigo) */}
                <View style={styles.replaceSwitchBox}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.replaceSwitchTitle}>
                      Dejar tarjeta exactamente igual al extracto PDF
                    </Text>
                    <Text style={styles.replaceSwitchSub}>
                      Reemplaza los movimientos previos de esta tarjeta por los del PDF analizado para evitar duplicados.
                    </Text>
                  </View>
                  <Switch
                    value={replaceExisting}
                    onValueChange={setReplaceExisting}
                    trackColor={{ false: '#334155', true: DARK.primary }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                {/* Botón Principal de Sincronización en Morado/Índigo */}
                <TouchableOpacity
                  style={[styles.syncConfirmBtn, isSyncing && { opacity: 0.65 }]}
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
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: DARK.sheetBg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: DARK.border,
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
    borderBottomColor: DARK.divider,
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
    color: DARK.primaryLight,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  headerTitle: {
    color: DARK.textPrimary,
    fontSize: 17,
    fontWeight: 'bold',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: DARK.cardElevated,
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
    backgroundColor: DARK.cardBg,
    borderColor: DARK.border,
  },
  cardSelectChipActive: {
    backgroundColor: DARK.primarySoftBg,
    borderColor: DARK.primary,
  },
  cardSelectChipText: {
    fontSize: 13,
    color: DARK.textSecondary,
    fontWeight: '600',
  },
  cardSelectChipTextActive: {
    color: DARK.textPrimary,
    fontWeight: 'bold',
  },
  apiKeyWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 13,
    borderWidth: 1,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: DARK.warning,
  },
  apiKeyWarningTitle: {
    color: DARK.textPrimary,
    fontSize: 13,
    fontWeight: 'bold',
  },
  apiKeyWarningSub: {
    color: DARK.textSecondary,
    fontSize: 13,
    marginTop: 1,
  },
  sectionTitle: {
    color: DARK.textPrimary,
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  pdfUploadHeroCard: {
    backgroundColor: DARK.cardBg,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: DARK.borderAccent,
    alignItems: 'center',
    gap: 10,
  },
  pdfBigIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: DARK.primarySoftBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  pdfHeroTitle: {
    color: DARK.textPrimary,
    fontSize: 17,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  pdfHeroSubtitle: {
    color: DARK.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 4,
  },
  pickPdfPrimaryBtn: {
    width: '100%',
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: DARK.primary,
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
    backgroundColor: DARK.cardElevated,
    borderColor: DARK.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  pickImageSecondaryBtnText: {
    color: DARK.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  toggleManualTextLink: {
    paddingVertical: 6,
  },
  toggleManualTextLinkLabel: {
    color: DARK.textSecondary,
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
    backgroundColor: DARK.inputBg,
    color: DARK.textPrimary,
    borderColor: DARK.border,
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
    backgroundColor: DARK.blue,
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
  resultSection: {
    gap: 12,
  },
  resultBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: DARK.cardElevated,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: DARK.borderAccent,
  },
  resultBannerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: DARK.primarySoftBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultBannerTitle: {
    color: DARK.primaryLight,
    fontSize: 15,
    fontWeight: 'bold',
  },
  resultBannerSub: {
    color: DARK.textSecondary,
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },
  officialBalancesCard: {
    backgroundColor: DARK.cardBg,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: DARK.border,
    gap: 10,
  },
  subSectionHeading: {
    color: DARK.textPrimary,
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
    color: DARK.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  numInput: {
    backgroundColor: DARK.inputBg,
    color: DARK.textPrimary,
    borderColor: DARK.border,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  numInputSmall: {
    backgroundColor: DARK.inputBg,
    color: DARK.textPrimary,
    borderColor: DARK.border,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  purchasesListWrap: {
    gap: 10,
  },
  purchaseCardItem: {
    backgroundColor: DARK.cardElevated,
    borderColor: DARK.border,
    borderRadius: 14,
    borderWidth: 1,
    padding: 13,
    gap: 6,
    overflow: 'hidden',
  },
  purchaseCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  purchaseDesc: {
    flex: 1,
    minWidth: 0,
    color: DARK.textPrimary,
    fontSize: 14,
    fontWeight: 'bold',
  },
  purchaseTopRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  quotaBadgePill: {
    backgroundColor: DARK.primarySoftBg,
    borderWidth: 1,
    borderColor: DARK.borderAccent,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    flexShrink: 0,
  },
  quotaBadgeText: {
    color: DARK.primaryLight,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  removePurchaseBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(244, 63, 94, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  purchaseDateText: {
    color: DARK.textSecondary,
    fontSize: 12.5,
    fontVariant: ['tabular-nums'],
  },
  purchaseCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: DARK.divider,
  },
  metricColLeft: {
    flex: 1.1,
    minWidth: 0,
    flexShrink: 1,
  },
  metricColCenter: {
    flex: 0.9,
    minWidth: 0,
    flexShrink: 1,
    alignItems: 'center',
  },
  metricColRight: {
    flex: 1.15,
    minWidth: 0,
    flexShrink: 1,
    alignItems: 'flex-end',
    paddingRight: 2,
  },
  purchaseMetaLabel: {
    color: DARK.textSecondary,
    fontSize: 11.5,
  },
  purchaseMetaValue: {
    fontSize: 12.5,
    fontWeight: 'bold',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  replaceSwitchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 13,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: DARK.cardElevated,
    borderColor: DARK.border,
    marginTop: 4,
  },
  replaceSwitchTitle: {
    color: DARK.textPrimary,
    fontSize: 13,
    fontWeight: 'bold',
  },
  replaceSwitchSub: {
    color: DARK.textSecondary,
    fontSize: 12.5,
    marginTop: 2,
    lineHeight: 17,
  },
  syncConfirmBtn: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: DARK.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    shadowColor: DARK.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  syncConfirmBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
