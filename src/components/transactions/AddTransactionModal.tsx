import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  ScrollView,
  Alert,
  Switch,
  Animated,
  Easing,
} from 'react-native';
import { Transaction, CardPurchase, TransactionType } from '../../types/finance';
import { useFinancial } from '../../context/FinancialContext';
import { useAlert } from '../../context/AlertContext';
import { calculateMonthlyQuota, generateAmortizationSchedule } from '../../utils/financialMath';
import { formatCurrency, formatInputNumber, parseInputNumber } from '../../utils/formatters';
import { Theme } from '../common/Theme';
import { CustomIcon } from '../common/CustomIcon';
import { Text, TextInput } from '../common/AppText';
import { TouchableOpacity } from '../common/Touchable';
import { ParsedBankMessage } from '../../utils/bankNotificationParser';
import { predictCategory } from '../../utils/aiCategorizer';
import { useAI } from '../../context/AIContext';
import {
  GeminiExtractedTransaction,
  predictCategoryWithGemini,
} from '../../utils/geminiService';
import { VoiceAssistantOverlay } from './VoiceAssistantOverlay';

interface AddTransactionModalProps {
  visible: boolean;
  onClose: () => void;
  defaultType?: 'expense' | 'income' | 'card_purchase' | 'transfer';
  defaultCardId?: string | null;
  prefillData?: Partial<ParsedBankMessage> | null;
  aiExtractedData?: GeminiExtractedTransaction | null;
}

const getTodayStr = () => new Date().toISOString().split('T')[0];

const getYesterdayStr = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
};

const getDaysAgoStr = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
};

const getFormattedDateLabel = (dateStr: string) => {
  if (!dateStr) return 'Hoy';
  const today = getTodayStr();
  const yesterday = getYesterdayStr();
  if (dateStr === today) return 'Hoy';
  if (dateStr === yesterday) return 'Ayer';
  if (dateStr === getDaysAgoStr(2)) return 'Hace 2 días';
  if (dateStr === getDaysAgoStr(3)) return 'Hace 3 días';

  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const mIdx = parseInt(parts[1], 10) - 1;
    return `${parts[2]} ${months[mIdx] || ''} ${parts[0]}`;
  }
  return dateStr;
};

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  visible,
  onClose,
  defaultType = 'expense',
  defaultCardId,
  prefillData,
  aiExtractedData,
}) => {
  const {
    accounts,
    creditCards,
    categories,
    addTransaction,
    addCardPurchase,
    currency,
  } = useFinancial();
  const { showSuccess, showWarning, showError } = useAlert();
  const { autoCategorizeEnabled, geminiApiKey, geminiModel } = useAI();
  const [voiceOverlayVisible, setVoiceOverlayVisible] = useState(false);
  const aiCategorizeTimerRef = useRef<any>(null);

  const [activeTab, setActiveTab] = useState<'expense' | 'income' | 'card_purchase' | 'transfer'>(defaultType);

  // Campos comunes
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>(getTodayStr());
  const [showCustomDateInput, setShowCustomDateInput] = useState(false);
  const [notes, setNotes] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    categories.find((c) => c.type === 'expense')?.id || 'cat-food'
  );
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id || '');
  const [selectedToAccountId, setSelectedToAccountId] = useState(accounts[1]?.id || '');
  const [applyGmf, setApplyGmf] = useState(false);

  // Campos de tarjeta
  const [selectedCardId, setSelectedCardId] = useState(creditCards[0]?.id || '');
  const [installments, setInstallments] = useState('1');
  const [isZeroInterestPromo, setIsZeroInterestPromo] = useState(false);
  const [alreadyPaidQuotas, setAlreadyPaidQuotas] = useState('0');

  // Animación de píldora deslizante en Tabs y estado de botón Guardar
  const [tabsBarWidth, setTabsBarWidth] = useState(0);
  const tabSlideAnim = useRef(new Animated.Value(0)).current;
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveButtonScale = useRef(new Animated.Value(1)).current;

  const tabOrder: Array<'expense' | 'card_purchase' | 'income' | 'transfer'> = [
    'expense',
    'card_purchase',
    'income',
    'transfer',
  ];
  const activeTabIndex = Math.max(0, tabOrder.indexOf(activeTab));

  const activeTabColor =
    activeTab === 'expense'
      ? '#F43F5E'
      : activeTab === 'card_purchase'
      ? '#6366F1'
      : activeTab === 'income'
      ? '#10B981'
      : '#3B82F6';

  useEffect(() => {
    Animated.spring(tabSlideAnim, {
      toValue: activeTabIndex,
      damping: 18,
      stiffness: 180,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [activeTabIndex, tabSlideAnim]);

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  useEffect(() => {
    if (selectedAccount) {
      setApplyGmf(!!selectedAccount.hasGmf4x1000);
    }
  }, [selectedAccountId, selectedAccount]);

  useEffect(() => {
    if (visible) {
      setSelectedDate(getTodayStr());
      setShowCustomDateInput(false);
      setActiveTab(defaultType);
      setSaveState('idle');
      if (defaultCardId) {
        setSelectedCardId(defaultCardId);
      } else if (creditCards[0]?.id) {
        setSelectedCardId((prev) => prev || creditCards[0].id);
      }
    }
  }, [visible, defaultType, defaultCardId, creditCards]);

  const applyAIExtractedTransaction = (extracted: GeminiExtractedTransaction) => {
    const mappedTab =
      extracted.tipo === 'TARJETA'
        ? 'card_purchase'
        : extracted.tipo === 'INGRESO'
        ? 'income'
        : extracted.tipo === 'TRANSFERENCIA'
        ? 'transfer'
        : 'expense';

    setActiveTab(mappedTab);
    if (extracted.monto > 0) {
      setAmount(formatInputNumber(extracted.monto.toString()));
    }
    if (extracted.concepto) {
      setDescription(extracted.concepto);
    }
    if (extracted.fechaISO) {
      setSelectedDate(extracted.fechaISO);
    }
    if (extracted.cuentaOrigenId) {
      setSelectedAccountId(extracted.cuentaOrigenId);
    }
    if (extracted.cuentaDestinoId) {
      setSelectedToAccountId(extracted.cuentaDestinoId);
    }
    if (extracted.tarjetaId) {
      setSelectedCardId(extracted.tarjetaId);
    }
    if (extracted.cuotas > 0) {
      setInstallments(extracted.cuotas.toString());
    }
    if (extracted.categoriaId) {
      setSelectedCategoryId(extracted.categoriaId);
    }
    setApplyGmf(!!extracted.aplica4x1000);
  };

  useEffect(() => {
    if (visible && aiExtractedData) {
      applyAIExtractedTransaction(aiExtractedData);
    }
  }, [visible, aiExtractedData]);

  // Auto-llenado si viene de detección de notificación bancaria
  useEffect(() => {
    if (prefillData) {
      if (prefillData.amount) {
        setAmount(formatInputNumber(prefillData.amount.toString()));
      }
      if (prefillData.description) {
        setDescription(prefillData.description);
        const predicted = predictCategory(prefillData.description, categories, prefillData.type === 'income' ? 'income' : 'expense');
        if (predicted) {
          setSelectedCategoryId(predicted.id);
        }
      }
      if (
        prefillData.type === 'expense' ||
        prefillData.type === 'income' ||
        prefillData.type === 'transfer' ||
        prefillData.type === 'card_purchase'
      ) {
        setActiveTab(prefillData.type);
      }

      // Buscar si coincide con alguna tarjeta o cuenta por nombre de banco
      if (prefillData.bankName) {
        const foundCard = creditCards.find(
          (c) => c.bankName.toLowerCase().includes(prefillData.bankName!.toLowerCase()) ||
                 c.name.toLowerCase().includes(prefillData.bankName!.toLowerCase())
        );
        if (foundCard) {
          setSelectedCardId(foundCard.id);
        }

        const foundAcc = accounts.find(
          (a) => a.bankName.toLowerCase().includes(prefillData.bankName!.toLowerCase()) ||
                 a.name.toLowerCase().includes(prefillData.bankName!.toLowerCase())
        );
        if (foundAcc) {
          setSelectedAccountId(foundAcc.id);
        }
      }
    }
  }, [prefillData, creditCards, accounts]);

  const selectedCard = creditCards.find((c) => c.id === selectedCardId) || creditCards[0];
  const parsedAmount = parseInputNumber(amount);
  const parsedInstallments = parseInt(installments, 10) || 1;

  // Cálculo del impuesto 4x1000 (0.4% = 4 pesos por cada 1000)
  const isGmfEligible = (activeTab === 'expense' || activeTab === 'transfer') && applyGmf && parsedAmount > 0;
  const gmfAmount = isGmfEligible ? Math.round(parsedAmount * 0.004) : 0;
  const totalDebitedWithGmf = parsedAmount + gmfAmount;

  // Si es a 1 cuota o está activada la promo 0% interés, la tasa es 0
  const effectiveMonthlyRate = (parsedInstallments === 1 || isZeroInterestPromo)
    ? 0
    : (selectedCard?.interestRateMonthly || 0);

  // Cálculo en vivo de cuota mensual
  const liveMonthlyQuota = calculateMonthlyQuota(parsedAmount, effectiveMonthlyRate, parsedInstallments);
  const totalProjected = parsedInstallments > 1 ? liveMonthlyQuota * parsedInstallments : parsedAmount;
  const totalInterest = Math.max(0, totalProjected - parsedAmount);

  const filteredCategories = categories.filter((c) => {
    if (activeTab === 'income') return c.type === 'income';
    return c.type === 'expense';
  });

  const handleSave = async () => {
    if (parsedAmount <= 0) {
      showWarning('Monto Inválido', 'Ingresa un valor mayor a cero.');
      return;
    }
    if (!description.trim()) {
      showWarning('Descripción Requerida', 'Por favor escribe en qué consistió el movimiento.');
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const txDate = selectedDate || todayStr;
    const nowIso = new Date().toISOString();

    try {
      setSaveState('saving');
      if (activeTab === 'card_purchase') {
        // Compra con Tarjeta de Crédito
        if (!selectedCard) {
          setSaveState('idle');
          showWarning('Tarjeta Requerida', 'Debes registrar al menos una tarjeta de crédito primero.');
          return;
        }

        const parsedPaid = Math.min(parsedInstallments - 1, Math.max(0, parseInt(alreadyPaidQuotas, 10) || 0));

        // Calcular la fecha de inicio según las cuotas ya pagadas o la fecha seleccionada
        const startDate = new Date(txDate + 'T12:00:00');
        startDate.setMonth(startDate.getMonth() - parsedPaid);
        const startDateStr = startDate.toISOString().split('T')[0];

        const purchaseId = `purch-${Date.now()}`;
        const newPurchase: CardPurchase = {
          id: purchaseId,
          cardId: selectedCard.id,
          description: description.trim(),
          categoryId: selectedCategoryId,
          amount: parsedAmount,
          installmentsTotal: parsedInstallments,
          installmentsPaid: parsedPaid,
          monthlyInstallmentAmount: liveMonthlyQuota,
          interestRateMonthly: effectiveMonthlyRate,
          firstInstallmentDate: startDateStr,
          status: parsedPaid >= parsedInstallments ? 'completed' : 'active',
          createdAt: startDateStr,
        };

        const schedule = generateAmortizationSchedule(
          purchaseId,
          parsedAmount,
          effectiveMonthlyRate,
          parsedInstallments,
          startDate,
          parsedPaid
        );

        await addCardPurchase(newPurchase, schedule);
        const promoText = isZeroInterestPromo && parsedInstallments > 1 ? ' (Promoción 0% Interés)' : '';
        const historyText = parsedPaid > 0 ? ` con ${parsedPaid} cuotas ya pagadas` : '';
        showSuccess('¡Compra Registrada!', `Se registraron ${parsedInstallments} cuotas en ${selectedCard.name}${promoText}${historyText}.`);
      } else if (activeTab === 'transfer') {
        // Transferencia entre cuentas (ej. Bancolombia a Nu)
        if (!selectedAccountId || !selectedToAccountId || selectedAccountId === selectedToAccountId) {
          setSaveState('idle');
          showWarning('Cuentas Inválidas', 'Selecciona dos cuentas diferentes para la transferencia.');
          return;
        }

        const sourceAcc = accounts.find((a) => a.id === selectedAccountId);
        const targetAcc = accounts.find((a) => a.id === selectedToAccountId);

        const newTx: Transaction = {
          id: `tx-${Date.now()}`,
          accountId: selectedAccountId,
          toAccountId: selectedToAccountId,
          type: 'transfer',
          amount: parsedAmount,
          categoryId: 'cat-financial',
          description: description.trim() || `Traspaso de ${sourceAcc?.name} a ${targetAcc?.name}`,
          notes: notes.trim() || undefined,
          date: txDate,
          gmfAmount: isGmfEligible && gmfAmount > 0 ? gmfAmount : undefined,
          createdAt: nowIso,
        };

        await addTransaction(newTx);

        const gmfNotice = isGmfEligible && gmfAmount > 0 ? ` (+${formatCurrency(gmfAmount, currency)} de 4x1000)` : '';
        showSuccess('¡Transferencia Registrada!', `Se transfirieron ${formatCurrency(parsedAmount, currency)}${gmfNotice} exitosamente.`);
      } else {
        // Gasto normal o Ingreso
        if (!selectedAccountId) {
          setSaveState('idle');
          showWarning('Cuenta Requerida', 'Debes seleccionar una cuenta de origen/destino.');
          return;
        }

        const newTx: Transaction = {
          id: `tx-${Date.now()}`,
          accountId: selectedAccountId,
          type: activeTab as TransactionType,
          amount: parsedAmount,
          categoryId: selectedCategoryId,
          description: description.trim(),
          notes: notes.trim() || undefined,
          date: txDate,
          gmfAmount: isGmfEligible && gmfAmount > 0 ? gmfAmount : undefined,
          createdAt: nowIso,
        };

        await addTransaction(newTx);

        const gmfNotice = isGmfEligible && gmfAmount > 0 ? ` (Incluye ${formatCurrency(gmfAmount, currency)} de 4x1000)` : '';
        showSuccess('¡Movimiento Registrado!', `Tus finanzas se actualizaron con éxito${gmfNotice}.`);
      }

      setSaveState('saved');
      Animated.sequence([
        Animated.timing(saveButtonScale, {
          toValue: 0.96,
          duration: 90,
          useNativeDriver: true,
        }),
        Animated.spring(saveButtonScale, {
          toValue: 1,
          friction: 4,
          useNativeDriver: true,
        }),
      ]).start();

      // Reset
      setAmount('');
      setDescription('');
      setSelectedDate(getTodayStr());
      setShowCustomDateInput(false);
      setNotes('');
      setIsZeroInterestPromo(false);
      setSaveState('idle');
      onClose();
    } catch (e) {
      setSaveState('idle');
      showError('Error', 'No se pudo guardar la transacción.');
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={styles.backdropDismiss}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.modalContainer}>
          {/* Fila Superior: Título + Botón Rápido "🎙️ Dictar con IA" */}
          <View style={styles.topDictateRow}>
            <Text style={styles.modalTopTitle}>Nuevo Movimiento</Text>
            <TouchableOpacity
              style={styles.dictateAiBtn}
              onPress={() => setVoiceOverlayVisible(true)}
            >
              <CustomIcon name="Mic" size={15} color="#34D399" />
              <Text style={styles.dictateAiBtnText}>Dictar con IA</Text>
              <CustomIcon name="Sparkles" size={13} color="#818CF8" />
            </TouchableOpacity>
          </View>

          {/* 1. Selector Superior Animado con Píldora Deslizante */}
          <View
            style={styles.tabsContainer}
            onLayout={(e) => setTabsBarWidth(e.nativeEvent.layout.width - 8)}
          >
            {tabsBarWidth > 0 && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.slidingPill,
                  {
                    width: tabsBarWidth / 4,
                    backgroundColor: activeTabColor,
                    transform: [
                      {
                        translateX: tabSlideAnim.interpolate({
                          inputRange: [0, 1, 2, 3],
                          outputRange: [
                            0,
                            tabsBarWidth / 4,
                            (tabsBarWidth / 4) * 2,
                            (tabsBarWidth / 4) * 3,
                          ],
                        }),
                      },
                    ],
                  },
                ]}
              />
            )}

            <TouchableOpacity
              style={styles.tab}
              onPress={() => {
                setActiveTab('expense');
                setSelectedCategoryId(categories.find((c) => c.type === 'expense')?.id || 'cat-food');
              }}
            >
              <CustomIcon name="ArrowUpRight" size={15} color={activeTab === 'expense' ? '#FFFFFF' : '#CBD5E1'} />
              <Text style={[styles.tabText, activeTab === 'expense' && styles.tabTextActive]}>Gasto</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.tab}
              onPress={() => setActiveTab('card_purchase')}
            >
              <CustomIcon name="CreditCard" size={15} color={activeTab === 'card_purchase' ? '#FFFFFF' : '#CBD5E1'} />
              <Text style={[styles.tabText, activeTab === 'card_purchase' && styles.tabTextActive]}>Tarjeta</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.tab}
              onPress={() => {
                setActiveTab('income');
                setSelectedCategoryId(categories.find((c) => c.type === 'income')?.id || 'cat-salary');
              }}
            >
              <CustomIcon name="ArrowDownLeft" size={15} color={activeTab === 'income' ? '#FFFFFF' : '#CBD5E1'} />
              <Text style={[styles.tabText, activeTab === 'income' && styles.tabTextActive]}>Ingreso</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.tab}
              onPress={() => setActiveTab('transfer')}
            >
              <CustomIcon name="Repeat" size={14} color={activeTab === 'transfer' ? '#FFFFFF' : '#CBD5E1'} />
              <Text style={[styles.tabText, activeTab === 'transfer' && styles.tabTextActive]} numberOfLines={1}>Transferir</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* 2. Input de Monto Protagonista y Legible (32px, 700, tabular-nums, foco inmediato) */}
            <View style={[styles.amountBox, { borderColor: activeTabColor }]}>
              <Text style={[styles.currencySymbol, { color: activeTabColor }]}>{currency} $</Text>
              <TextInput
                style={styles.amountInput}
                placeholder="0"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                value={amount}
                onChangeText={(text) => setAmount(formatInputNumber(text))}
                autoFocus
              />
            </View>

            {/* Descripción */}
            <Text style={styles.fieldLabel}>Concepto o Descripción</Text>
            <TextInput
              style={styles.input}
              placeholder="ej. Almuerzo, Uber, Supermercado, Pago Nómina"
              placeholderTextColor="#94A3B8"
              value={description}
              onChangeText={(text) => {
                setDescription(text);
                if (!autoCategorizeEnabled) return;
                const catType = activeTab === 'income' ? 'income' : 'expense';
                const predicted = predictCategory(text, categories, catType);
                if (predicted) {
                  setSelectedCategoryId(predicted.id);
                } else if (geminiApiKey && text.trim().length >= 4) {
                  if (aiCategorizeTimerRef.current) {
                    clearTimeout(aiCategorizeTimerRef.current);
                  }
                  aiCategorizeTimerRef.current = setTimeout(async () => {
                    const aiCatId = await predictCategoryWithGemini({
                      concept: text,
                      type: catType,
                      categories,
                      apiKey: geminiApiKey,
                      model: geminiModel,
                    });
                    if (aiCatId) {
                      setSelectedCategoryId(aiCatId);
                    }
                  }, 420);
                }
              }}
            />

            {/* 3. Simplificación de "Fecha del Movimiento" (3 botones amplios sin cortarse jamás) */}
            <View style={styles.dateSelectorContainer}>
              <Text style={styles.fieldLabel}>Fecha del Movimiento</Text>

              <View style={styles.dateRowFixed}>
                <TouchableOpacity
                  style={[
                    styles.dateChipFixed,
                    selectedDate === getTodayStr() && !showCustomDateInput && [
                      styles.dateChipActive,
                      { backgroundColor: activeTabColor, borderColor: activeTabColor },
                    ],
                  ]}
                  onPress={() => {
                    setSelectedDate(getTodayStr());
                    setShowCustomDateInput(false);
                  }}
                >
                  <CustomIcon
                    name="Calendar"
                    size={15}
                    color={selectedDate === getTodayStr() && !showCustomDateInput ? '#FFFFFF' : '#CBD5E1'}
                  />
                  <Text
                    style={[
                      styles.dateChipText,
                      selectedDate === getTodayStr() && !showCustomDateInput && styles.dateChipTextActive,
                    ]}
                  >
                    Hoy
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.dateChipFixed,
                    selectedDate === getYesterdayStr() && !showCustomDateInput && [
                      styles.dateChipActive,
                      { backgroundColor: activeTabColor, borderColor: activeTabColor },
                    ],
                  ]}
                  onPress={() => {
                    setSelectedDate(getYesterdayStr());
                    setShowCustomDateInput(false);
                  }}
                >
                  <Text
                    style={[
                      styles.dateChipText,
                      selectedDate === getYesterdayStr() && !showCustomDateInput && styles.dateChipTextActive,
                    ]}
                  >
                    Ayer
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.dateChipFixed,
                    styles.dateChipCustomBtn,
                    (showCustomDateInput ||
                      (selectedDate !== getTodayStr() && selectedDate !== getYesterdayStr())) && [
                      styles.dateChipActive,
                      { backgroundColor: activeTabColor, borderColor: activeTabColor },
                    ],
                  ]}
                  onPress={() => setShowCustomDateInput(!showCustomDateInput)}
                >
                  <CustomIcon
                    name="CalendarDays"
                    size={15}
                    color={
                      showCustomDateInput ||
                      (selectedDate !== getTodayStr() && selectedDate !== getYesterdayStr())
                        ? '#FFFFFF'
                        : '#CBD5E1'
                    }
                  />
                  <Text
                    style={[
                      styles.dateChipText,
                      (showCustomDateInput ||
                        (selectedDate !== getTodayStr() && selectedDate !== getYesterdayStr())) &&
                        styles.dateChipTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {selectedDate !== getTodayStr() && selectedDate !== getYesterdayStr()
                      ? getFormattedDateLabel(selectedDate)
                      : 'Elegir fecha...'}
                  </Text>
                </TouchableOpacity>
              </View>

              {showCustomDateInput && (
                <View style={styles.customDateBox}>
                  <Text style={styles.customDateHelp}>Ingresa la fecha (AAAA-MM-DD):</Text>
                  <TextInput
                    style={styles.customDateInput}
                    placeholder="2026-08-20"
                    placeholderTextColor="#94A3B8"
                    value={selectedDate}
                    onChangeText={setSelectedDate}
                    maxLength={10}
                  />
                </View>
              )}
            </View>

            {/* 4A. Configuración Específica de Tarjeta de Crédito (Grilla sin textos cortados + Stepper de Cuotas) */}
            {activeTab === 'card_purchase' && (
              <View style={styles.cardSettingsBlock}>
                <Text style={styles.fieldLabel}>Seleccionar Tarjeta de Crédito</Text>
                <View style={styles.selectorGrid}>
                  {creditCards.map((c) => {
                    const isSelected = c.id === (selectedCard?.id || selectedCardId);
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[
                          styles.gridSelectorCard,
                          creditCards.length === 1 && { width: '100%' },
                          isSelected && styles.cardSelectChipActive,
                        ]}
                        onPress={() => setSelectedCardId(c.id)}
                      >
                        <View style={styles.gridSelectorHeader}>
                          <CustomIcon
                            name="CreditCard"
                            size={16}
                            color={isSelected ? '#FFFFFF' : '#818CF8'}
                          />
                          <Text
                            style={[styles.cardChipText, isSelected && styles.cardChipTextActive]}
                            numberOfLines={1}
                          >
                            {c.name}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.cardChipSub,
                            isSelected && { color: 'rgba(255,255,255,0.9)' },
                          ]}
                          numberOfLines={1}
                        >
                          Disp: {formatCurrency(c.availableLimit, currency)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Control Stepper Numérico Grande y Accesible de Cuotas */}
                <Text style={styles.fieldLabel}>Número de Cuotas</Text>
                <View style={styles.stepperContainer}>
                  <TouchableOpacity
                    style={[
                      styles.stepperBtn,
                      parsedInstallments <= 1 && styles.stepperBtnDisabled,
                    ]}
                    onPress={() => {
                      const next = Math.max(1, parsedInstallments - 1);
                      setInstallments(next.toString());
                    }}
                    disabled={parsedInstallments <= 1}
                  >
                    <Text style={styles.stepperBtnSymbol}>−</Text>
                  </TouchableOpacity>

                  <View style={styles.stepperDisplay}>
                    <Text style={styles.stepperMainText}>
                      {parsedInstallments === 1
                        ? '1 Cuota (0% Interés)'
                        : `${parsedInstallments} Cuotas`}
                    </Text>
                    <Text style={styles.stepperSubText}>
                      {parsedInstallments === 1 || isZeroInterestPromo
                        ? 'Sin intereses corrientes'
                        : `Tasa aplicable: ${effectiveMonthlyRate}% E.M.`}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.stepperBtn,
                      parsedInstallments >= 48 && styles.stepperBtnDisabled,
                    ]}
                    onPress={() => {
                      const next = Math.min(48, parsedInstallments + 1);
                      setInstallments(next.toString());
                    }}
                    disabled={parsedInstallments >= 48}
                  >
                    <Text style={styles.stepperBtnSymbol}>+</Text>
                  </TouchableOpacity>
                </View>

                {/* 4 Accesos Rápidos que caben al 100% sin desbordarse */}
                <View style={styles.quickQuotaRow}>
                  {[1, 3, 6, 12].map((q) => {
                    const isSelected = parsedInstallments === q;
                    return (
                      <TouchableOpacity
                        key={q}
                        style={[styles.quickQuotaChip, isSelected && styles.quotaChipSelected]}
                        onPress={() => setInstallments(q.toString())}
                      >
                        <Text
                          style={[
                            styles.quotaChipText,
                            isSelected && styles.quotaChipTextSelected,
                          ]}
                        >
                          {q}x
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Switch de Promoción 0% Interés para múltiples cuotas */}
                {parsedInstallments > 1 && (
                  <View style={styles.promoToggleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.promoTitle}>Promoción 0% Interés</Text>
                      <Text style={styles.promoSub}>Aplica para compras con alianza / tasa cero</Text>
                    </View>
                    <Switch
                      value={isZeroInterestPromo}
                      onValueChange={setIsZeroInterestPromo}
                      trackColor={{ false: '#334155', true: '#10B981' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                )}

                {/* Cuotas ya pagadas anteriormente (Para compras antiguas en curso) */}
                {parsedInstallments > 1 && (
                  <View style={styles.historicalQuotasBox}>
                    <View style={styles.historicalHeader}>
                      <CustomIcon name="Clock" size={14} color="#818CF8" />
                      <Text style={styles.historicalTitle}>¿Has pagado cuotas de esta compra antes?</Text>
                    </View>
                    <Text style={styles.historicalSub}>
                      Selecciona si es una compra en curso que hiciste meses atrás:
                    </Text>

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.historicalRow}>
                      {Array.from({ length: Math.min(parsedInstallments, 12) }, (_, i) => i).map((paidCount) => {
                        const isSelected = (parseInt(alreadyPaidQuotas, 10) || 0) === paidCount;
                        return (
                          <TouchableOpacity
                            key={paidCount}
                            style={[styles.paidChip, isSelected && styles.paidChipSelected]}
                            onPress={() => setAlreadyPaidQuotas(paidCount.toString())}
                          >
                            <Text style={[styles.paidChipText, isSelected && styles.paidChipTextSelected]}>
                              {paidCount === 0 ? '0 (Nueva compra)' : `${paidCount} pagada${paidCount > 1 ? 's' : ''}`}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>

                    {(parseInt(alreadyPaidQuotas, 10) || 0) > 0 && (
                      <View style={styles.historicalFeedback}>
                        <CustomIcon name="CheckCircle2" size={14} color="#34D399" />
                        <Text style={styles.historicalFeedbackText}>
                          Se registrarán {alreadyPaidQuotas} cuota(s) como ya pagadas. Quedarán {parsedInstallments - (parseInt(alreadyPaidQuotas, 10) || 0)} cuotas pendientes.
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Simulador de Cuota e Intereses en Tiempo Real */}
                {parsedAmount > 0 && (
                  <View style={styles.installmentCalculatorBox}>
                    <View style={styles.calcHeader}>
                      <CustomIcon name="Calculator" size={14} color="#F59E0B" />
                      <Text style={styles.calcTitle}>
                        {parsedInstallments === 1
                          ? 'Compra a 1 Cuota (Sin Interés)'
                          : isZeroInterestPromo
                          ? 'Simulación Promoción 0% Interés'
                          : 'Simulador con Interés Corriente'}
                      </Text>
                      <Text style={styles.calcRate}>{effectiveMonthlyRate}% E.M.</Text>
                    </View>

                    <View style={styles.calcRow}>
                      <Text style={styles.calcLabel}>Cuota Mensual:</Text>
                      <Text style={styles.calcValueHighlight}>
                        {formatCurrency(liveMonthlyQuota, currency)} {parsedInstallments > 1 ? '/ mes' : ''}
                      </Text>
                    </View>

                    {parsedInstallments > 1 && (
                      <>
                        <View style={styles.calcRow}>
                          <Text style={styles.calcLabel}>Total a Pagar ({parsedInstallments} cuotas):</Text>
                          <Text style={styles.calcValue}>{formatCurrency(totalProjected, currency)}</Text>
                        </View>

                        <View style={styles.calcRow}>
                          <Text style={styles.calcLabel}>Intereses Totales:</Text>
                          <Text style={[styles.calcValue, { color: isZeroInterestPromo ? '#10B981' : '#F87171' }]}>
                            {isZeroInterestPromo ? '$ 0 (Sin interés)' : `+${formatCurrency(totalInterest, currency)}`}
                          </Text>
                        </View>
                      </>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* 4B. Selector de Cuentas en Grilla de 2 Columnas Sin Textos Cortados */}
            {activeTab !== 'card_purchase' && (
              <View>
                <Text style={styles.fieldLabel}>
                  {activeTab === 'income' ? 'Depositar en Cuenta' : activeTab === 'transfer' ? 'Cuenta Origen (Sale dinero)' : 'Pagar con la Cuenta'}
                </Text>
                <View style={styles.selectorGrid}>
                  {accounts.map((acc) => {
                    const isSelected = acc.id === selectedAccountId;
                    const isDebtAcc = acc.type === 'debt';
                    return (
                      <TouchableOpacity
                        key={acc.id}
                        style={[
                          styles.gridSelectorCard,
                          accounts.length === 1 && { width: '100%' },
                          isSelected && (isDebtAcc ? styles.debtAccountChipSelected : [styles.accountChipSelected, { backgroundColor: activeTabColor, borderColor: activeTabColor }]),
                          isDebtAcc && !isSelected && styles.debtAccountChip,
                        ]}
                        onPress={() => {
                          setSelectedAccountId(acc.id);
                          if (isDebtAcc) setApplyGmf(false);
                        }}
                      >
                        <View style={styles.gridSelectorHeader}>
                          <CustomIcon
                            name={acc.icon || (isDebtAcc ? 'Receipt' : 'Landmark')}
                            size={15}
                            color={isSelected ? '#FFFFFF' : isDebtAcc ? '#F87171' : '#CBD5E1'}
                          />
                          <Text
                            style={[
                              styles.accountChipText,
                              isSelected && styles.accountChipTextSelected,
                              isDebtAcc && !isSelected && { color: '#F87171' },
                            ]}
                            numberOfLines={1}
                          >
                            {acc.name} {isDebtAcc ? '(Deuda)' : ''}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.cardChipSub,
                            isSelected && { color: 'rgba(255,255,255,0.9)' },
                          ]}
                          numberOfLines={1}
                        >
                          {isDebtAcc ? 'Deuda: ' : 'Saldo: '}
                          {formatCurrency(acc.balance, currency)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Mensaje de cuenta de deuda */}
                {selectedAccount?.type === 'debt' && (
                  <View style={styles.debtExpenseNoticeBox}>
                    <CustomIcon name="Receipt" size={14} color="#EF4444" />
                    <Text style={styles.debtExpenseNoticeText}>
                      Este gasto se sumará a la deuda acumulada de {selectedAccount.name}.
                    </Text>
                  </View>
                )}

                {activeTab === 'transfer' && (
                  <View style={{ marginTop: 10 }}>
                    <Text style={styles.fieldLabel}>Cuenta Destino (Recibe dinero ej. Nu, Nequi, etc.)</Text>
                    <View style={styles.selectorGrid}>
                      {accounts.map((acc) => {
                        const isSelected = acc.id === selectedToAccountId;
                        return (
                          <TouchableOpacity
                            key={acc.id}
                            style={[
                              styles.gridSelectorCard,
                              accounts.length === 1 && { width: '100%' },
                              isSelected && [styles.accountChipSelected, { backgroundColor: activeTabColor, borderColor: activeTabColor }],
                            ]}
                            onPress={() => setSelectedToAccountId(acc.id)}
                          >
                            <View style={styles.gridSelectorHeader}>
                              <CustomIcon
                                name={acc.icon || 'Landmark'}
                                size={15}
                                color={isSelected ? '#FFFFFF' : '#CBD5E1'}
                              />
                              <Text
                                style={[styles.accountChipText, isSelected && styles.accountChipTextSelected]}
                                numberOfLines={1}
                              >
                                {acc.name}
                              </Text>
                            </View>
                            <Text
                              style={[
                                styles.cardChipSub,
                                isSelected && { color: 'rgba(255,255,255,0.9)' },
                              ]}
                              numberOfLines={1}
                            >
                              Saldo: {formatCurrency(acc.balance, currency)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Sección de Impuesto 4x1000 (GMF) solo para cuentas bancarias no-deuda */}
                {(activeTab === 'expense' || activeTab === 'transfer') && selectedAccount?.type !== 'debt' && (
                  <View style={styles.gmfCard}>
                    <TouchableOpacity
                      style={styles.gmfHeaderRow}
                      onPress={() => setApplyGmf(!applyGmf)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.gmfLeftCol}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <CustomIcon name="Percent" size={13} color={applyGmf ? '#EF4444' : '#94A3B8'} />
                          <Text style={styles.gmfTitle}>Impuesto 4x1000 (GMF)</Text>
                          {applyGmf && (
                            <View style={styles.gmfTag}>
                              <Text style={styles.gmfTagText}>0.4%</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.gmfSubtitle}>
                          {selectedAccount?.hasGmf4x1000
                            ? `${selectedAccount.name} cobra 4x1000 en salidas de dinero.`
                            : `¿Deseas aplicar el 4x1000 a este movimiento?`}
                        </Text>
                      </View>
                      <Switch
                        value={applyGmf}
                        onValueChange={setApplyGmf}
                        trackColor={{ false: '#334155', true: '#EF4444' }}
                        thumbColor="#FFFFFF"
                      />
                    </TouchableOpacity>

                    {applyGmf && parsedAmount > 0 && (
                      <View style={styles.gmfBreakdownBox}>
                        <View style={styles.gmfRow}>
                          <Text style={styles.gmfRowLabel}>Monto del movimiento:</Text>
                          <Text style={styles.gmfRowVal}>{formatCurrency(parsedAmount, currency)}</Text>
                        </View>
                        <View style={styles.gmfRow}>
                          <Text style={[styles.gmfRowLabel, { color: '#F87171' }]}>+ Impuesto 4x1000 (0.4%):</Text>
                          <Text style={[styles.gmfRowVal, { color: '#F87171', fontWeight: 'bold' }]}>
                            +{formatCurrency(gmfAmount, currency)}
                          </Text>
                        </View>
                        <View style={[styles.gmfRow, styles.gmfTotalRow]}>
                          <Text style={styles.gmfTotalLabel}>Total a descontar de cuenta:</Text>
                          <Text style={styles.gmfTotalVal}>{formatCurrency(totalDebitedWithGmf, currency)}</Text>
                        </View>
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* Selector de Categorías (Grilla Envolvente sin textos cortados) */}
            {activeTab !== 'transfer' && (
              <View style={styles.categoriesSection}>
                <Text style={styles.fieldLabel}>Categoría</Text>
                <View style={styles.categoriesWrapGrid}>
                  {filteredCategories.map((cat) => {
                    const isSelected = cat.id === selectedCategoryId;
                    return (
                      <TouchableOpacity
                        key={cat.id}
                        style={[
                          styles.catChip,
                          isSelected && { backgroundColor: cat.color, borderColor: cat.color },
                        ]}
                        onPress={() => setSelectedCategoryId(cat.id)}
                      >
                        <CustomIcon
                          name={cat.icon}
                          size={15}
                          color={isSelected ? '#FFFFFF' : cat.color}
                        />
                        <Text style={[styles.catChipText, isSelected && styles.catChipTextSelected]}>
                          {cat.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Notas opcionales */}
            <Text style={styles.fieldLabel}>Notas adicionales (Opcional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Detalles, número de comprobante..."
              placeholderTextColor="#94A3B8"
              value={notes}
              onChangeText={setNotes}
            />

            {/* Botón Guardar con Claridad Contextual y Feedback de Guardado */}
            <Animated.View style={{ transform: [{ scale: saveButtonScale }] }}>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: activeTabColor }]}
                onPress={handleSave}
                disabled={saveState === 'saving'}
              >
                <CustomIcon
                  name={
                    saveState === 'saved'
                      ? 'CheckCircle2'
                      : activeTab === 'expense'
                      ? 'ArrowUpRight'
                      : activeTab === 'card_purchase'
                      ? 'CreditCard'
                      : activeTab === 'income'
                      ? 'ArrowDownLeft'
                      : 'Repeat'
                  }
                  size={18}
                  color="#FFFFFF"
                />
                <Text style={styles.saveBtnText}>
                  {saveState === 'saving'
                    ? 'Guardando movimiento...'
                    : saveState === 'saved'
                    ? '¡Movimiento Registrado!'
                    : activeTab === 'expense'
                    ? 'Registrar Gasto'
                    : activeTab === 'card_purchase'
                    ? 'Registrar Compra con Tarjeta'
                    : activeTab === 'income'
                    ? 'Registrar Ingreso'
                    : 'Registrar Transferencia'}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </ScrollView>
        </View>
      </View>

      {/* Asistente de Voz Futurista integrado en el Modal */}
      <VoiceAssistantOverlay
        visible={voiceOverlayVisible}
        onClose={() => setVoiceOverlayVisible(false)}
        onSavedSuccess={() => {
          setVoiceOverlayVisible(false);
          onClose();
        }}
        onReviewInForm={(extracted) => {
          setVoiceOverlayVisible(false);
          applyAIExtractedTransaction(extracted);
        }}
      />
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    justifyContent: 'flex-end',
  },
  backdropDismiss: {
    flex: 1,
  },
  modalContainer: {
    backgroundColor: Theme.colors.surface,
    borderTopLeftRadius: Theme.borderRadius.xl,
    borderTopRightRadius: Theme.borderRadius.xl,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 42,
    maxHeight: '92%',
    marginBottom: 0,
  },
  topDictateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTopTitle: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: 'bold',
  },
  dictateAiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.45)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  dictateAiBtnText: {
    color: '#34D399',
    fontSize: 13,
    fontWeight: 'bold',
  },
  tabsContainer: {
    position: 'relative',
    flexDirection: 'row',
    backgroundColor: Theme.colors.surfaceCard,
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#26334D',
  },
  slidingPill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: 10,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 10,
    gap: 4,
    zIndex: 2,
  },
  tabText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#334155',
  },
  currencySymbol: {
    color: '#CBD5E1',
    fontSize: 22,
    fontWeight: '800',
    marginRight: 10,
  },
  amountInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    paddingVertical: 2,
  },
  fieldLabel: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 10,
  },
  input: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 6,
  },
  cardSettingsBlock: {
    backgroundColor: Theme.colors.surfaceCard,
    padding: 14,
    borderRadius: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#26334D',
  },
  selectorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  gridSelectorCard: {
    width: '48.5%',
    backgroundColor: Theme.colors.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 4,
  },
  gridSelectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardSelectChipActive: {
    backgroundColor: Theme.colors.primary,
    borderColor: '#818CF8',
  },
  cardChipText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: 'bold',
    flex: 1,
  },
  cardChipTextActive: {
    color: '#FFFFFF',
  },
  cardChipSub: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '500',
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 6,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 10,
  },
  stepperBtn: {
    width: 48,
    height: 48,
    borderRadius: 11,
    backgroundColor: Theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: '#475569',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperBtnDisabled: {
    opacity: 0.4,
  },
  stepperBtnSymbol: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
  },
  stepperDisplay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  stepperMainText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  stepperSubText: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 2,
  },
  quickQuotaRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  quickQuotaChip: {
    flex: 1,
    minHeight: 42,
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quotaChipSelected: {
    backgroundColor: Theme.colors.primary,
    borderColor: '#818CF8',
  },
  quotaChipText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: 'bold',
  },
  quotaChipTextSelected: {
    color: '#FFFFFF',
  },
  promoToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceElevated,
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
  },
  promoTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  promoSub: {
    color: '#CBD5E1',
    fontSize: 13,
  },
  historicalQuotasBox: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  historicalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  historicalTitle: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  historicalSub: {
    color: '#CBD5E1',
    fontSize: 13,
    marginBottom: 8,
  },
  historicalRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  paidChip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  paidChipSelected: {
    backgroundColor: '#6366F1',
    borderColor: '#818CF8',
  },
  paidChipText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
  },
  paidChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  historicalFeedback: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    padding: 8,
    borderRadius: 8,
    marginTop: 6,
  },
  historicalFeedbackText: {
    color: '#6EE7B7',
    fontSize: 13,
    flex: 1,
  },
  installmentCalculatorBox: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  calcHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  calcTitle: {
    color: '#F59E0B',
    fontSize: 13,
    fontWeight: 'bold',
    flex: 1,
  },
  calcRate: {
    color: '#CBD5E1',
    fontSize: 13,
  },
  calcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  calcLabel: {
    color: '#CBD5E1',
    fontSize: 13,
  },
  calcValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  calcValueHighlight: {
    color: '#34D399',
    fontSize: 14,
    fontWeight: 'bold',
  },
  accountChipSelected: {
    backgroundColor: Theme.colors.primary,
    borderColor: '#818CF8',
  },
  accountChipText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: 'bold',
    flex: 1,
  },
  accountChipTextSelected: {
    color: '#FFFFFF',
  },
  categoriesSection: {
    marginTop: 4,
  },
  categoriesWrapGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceElevated,
    paddingHorizontal: 14,
    minHeight: 40,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  catChipText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
  },
  catChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  dateSelectorContainer: {
    marginBottom: 10,
  },
  dateRowFixed: {
    flexDirection: 'row',
    gap: 8,
  },
  dateChipFixed: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  dateChipCustomBtn: {
    flex: 1.35,
  },
  dateChipActive: {
    backgroundColor: '#6366F1',
    borderColor: '#818CF8',
  },
  dateChipText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
  },
  dateChipTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  customDateBox: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  customDateHelp: {
    color: '#CBD5E1',
    fontSize: 13,
    marginBottom: 6,
  },
  customDateInput: {
    backgroundColor: '#1E293B',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#475569',
  },
  gmfCard: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  gmfHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gmfLeftCol: {
    flex: 1,
    marginRight: 8,
  },
  gmfTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  gmfSubtitle: {
    color: '#CBD5E1',
    fontSize: 13,
    marginTop: 2,
  },
  gmfTag: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  gmfTagText: {
    color: '#F87171',
    fontSize: 13,
    fontWeight: 'bold',
  },
  gmfBreakdownBox: {
    backgroundColor: Theme.colors.surfaceCard,
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  gmfRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  gmfRowLabel: {
    color: '#CBD5E1',
    fontSize: 13,
  },
  gmfRowVal: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  gmfTotalRow: {
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 6,
    marginTop: 4,
    marginBottom: 0,
  },
  gmfTotalLabel: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: 'bold',
  },
  gmfTotalVal: {
    color: '#34D399',
    fontSize: 14,
    fontWeight: 'bold',
  },
  saveBtn: {
    backgroundColor: Theme.colors.primary,
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    marginBottom: 16,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  debtAccountChip: {
    borderColor: 'rgba(239, 68, 68, 0.4)',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  debtAccountChipSelected: {
    backgroundColor: '#EF4444',
    borderColor: '#F87171',
  },
  debtExpenseNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  debtExpenseNoticeText: {
    color: '#FCA5A5',
    fontSize: 13,
    flex: 1,
  },
});
