import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Modal,
  Pressable,
} from 'react-native';
import { useFinancial } from '../context/FinancialContext';
import { useAlert } from '../context/AlertContext';
import { useAppTheme } from '../context/ThemeContext';
import { formatCurrency } from '../utils/formatters';
import { Layout, alpha } from '../components/common/Theme';
import { CustomIcon } from '../components/common/CustomIcon';
import { Text } from '../components/common/AppText';
import { TouchableOpacity } from '../components/common/Touchable';
import { AnimatedBar } from '../components/common/AnimatedBar';
import { CreditCardVisual } from '../components/cards/CreditCardVisual';
import { AnimatedWalletStack } from '../components/cards/AnimatedWalletStack';
import { AddCreditCardModal } from '../components/cards/AddCreditCardModal';
import { CardStatementModal } from '../components/cards/CardStatementModal';
import { PayCardModal } from '../components/cards/PayCardModal';
import { ReconcileCardModal } from '../components/cards/ReconcileCardModal';
import { ManualStatementModal } from '../components/cards/ManualStatementModal';
import { AIStatementAnalyzerModal } from '../components/cards/AIStatementAnalyzerModal';
import { InstallmentAmortizationModal } from '../components/cards/InstallmentAmortizationModal';
import { AddTransactionModal } from '../components/transactions/AddTransactionModal';
import { CreditCard, CardStatementSummary, CardPurchase } from '../types/finance';

export const CardsScreen: React.FC = () => {
  const {
    creditCards,
    cardStatements,
    activePurchases,
    deleteCreditCard,
    currency,
  } = useFinancial();
  const { showConfirm, showSuccess } = useAlert();
  const { colors } = useAppTheme();

  const [addCardModalVisible, setAddCardModalVisible] = useState(false);
  const [selectedCardToEdit, setSelectedCardToEdit] = useState<CreditCard | null>(null);

  const [statementModalVisible, setStatementModalVisible] = useState(false);
  const [selectedCardForStatement, setSelectedCardForStatement] = useState<CreditCard | null>(null);
  const [selectedStatement, setSelectedStatement] = useState<CardStatementSummary | null>(null);

  const [payModalVisible, setPayModalVisible] = useState(false);
  const [selectedCardForPay, setSelectedCardForPay] = useState<CreditCard | null>(null);
  const [selectedStatementForPay, setSelectedStatementForPay] = useState<CardStatementSummary | null>(null);

  const [reconcileModalVisible, setReconcileModalVisible] = useState(false);
  const [selectedCardForReconcile, setSelectedCardForReconcile] = useState<CreditCard | null>(null);

  const [manualStatementModalVisible, setManualStatementModalVisible] = useState(false);
  const [selectedCardForManual, setSelectedCardForManual] = useState<CreditCard | null>(null);
  const [manualStatementMode, setManualStatementMode] = useState<'opening_balance' | 'statement' | undefined>(undefined);

  const [amortizationModalVisible, setAmortizationModalVisible] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<CardPurchase | null>(null);
  const [selectedPurchaseCard, setSelectedPurchaseCard] = useState<CreditCard | null>(null);

  const [addPurchaseModalVisible, setAddPurchaseModalVisible] = useState(false);
  const [selectedCardForPurchase, setSelectedCardForPurchase] = useState<CreditCard | null>(null);
  const [aiStatementModalVisible, setAiStatementModalVisible] = useState(false);
  const [selectedCardForAIStatement, setSelectedCardForAIStatement] = useState<CreditCard | null>(null);
  const [contextMenuCard, setContextMenuCard] = useState<CreditCard | null>(null);
  const [viewMode, setViewMode] = useState<'wallet' | 'list'>('wallet');

  const totalCreditLimit = creditCards.reduce((sum, c) => sum + c.creditLimit, 0);
  const totalAvailable = creditCards.reduce((sum, c) => sum + c.availableLimit, 0);
  const totalUsedDebt = totalCreditLimit - totalAvailable;
  const totalPaymentThisMonth = cardStatements.reduce((sum, s) => sum + s.totalToPayThisMonth, 0);
  const availablePercent = totalCreditLimit > 0 ? (totalAvailable / totalCreditLimit) * 100 : 0;

  const handleOpenCreateCard = () => {
    setSelectedCardToEdit(null);
    setAddCardModalVisible(true);
  };

  const handleCardCreated = (newCard: CreditCard) => {
    showConfirm(
      '¿Ya utilizabas esta tarjeta?',
      'Puedes analizar tu extracto actual con Inteligencia Artificial (Gemini) para crear automáticamente todas tus compras a cuotas y dejar el cupo y deuda idénticos a tu app bancaria.',
      () => handleOpenAIStatement(newCard),
      'Analizar Extracto con IA',
      'Empezar desde cero'
    );
  };

  const handleOpenAIStatement = (card: CreditCard) => {
    setSelectedCardForAIStatement(card);
    setAiStatementModalVisible(true);
  };

  const handleOpenEditCard = (card: CreditCard) => {
    setSelectedCardToEdit(card);
    setAddCardModalVisible(true);
  };

  const handleDeleteCard = (card: CreditCard) => {
    showConfirm(
      'Eliminar Tarjeta',
      `¿Estás seguro de que deseas eliminar la tarjeta "${card.name}" (${card.bankName})? Si tiene compras o movimientos registrados pasará a estado archivado para preservar tu integridad contable.`,
      async () => {
        await deleteCreditCard(card.id);
        showSuccess('Tarjeta Procesada', `La tarjeta ${card.name} fue gestionada correctamente.`);
      },
      'Eliminar / Archivar',
      'Cancelar',
      true
    );
  };

  const handleOpenStatement = (card: CreditCard) => {
    const stmt = cardStatements.find((s) => s.cardId === card.id) || null;
    setSelectedCardForStatement(card);
    setSelectedStatement(stmt);
    setStatementModalVisible(true);
  };

  const handleOpenPay = (card: CreditCard) => {
    const stmt = cardStatements.find((s) => s.cardId === card.id) || null;
    setSelectedCardForPay(card);
    setSelectedStatementForPay(stmt);
    setPayModalVisible(true);
  };

  const handleOpenReconcile = (card: CreditCard) => {
    setSelectedCardForReconcile(card);
    setReconcileModalVisible(true);
  };

  const handleOpenManualStatement = (card: CreditCard, mode?: 'opening_balance' | 'statement') => {
    const stmt = cardStatements.find((s) => s.cardId === card.id) || null;
    setSelectedCardForManual(card);
    setSelectedStatement(stmt);
    setManualStatementMode(mode);
    setManualStatementModalVisible(true);
  };

  const handleOpenAmortization = (purchase: CardPurchase) => {
    const card = creditCards.find((c) => c.id === purchase.cardId) || null;
    setSelectedPurchase(purchase);
    setSelectedPurchaseCard(card);
    setAmortizationModalVisible(true);
  };

  const handleOpenAddPurchase = (card?: CreditCard) => {
    setSelectedCardForPurchase(card || creditCards[0] || null);
    setAddPurchaseModalVisible(true);
  };

  return (
    <View style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: Layout.bottomNavSpace }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={[styles.tag, { color: colors.primaryLight }]}>GESTIÓN DE CRÉDITO</Text>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Tarjetas</Text>
          </View>
          <TouchableOpacity
            style={[styles.addCardBtn, { backgroundColor: colors.primary }]}
            onPress={handleOpenCreateCard}
          >
            <CustomIcon name="Plus" size={16} color="#FFFFFF" />
            <Text style={styles.addCardBtnText}>Nueva Tarjeta</Text>
          </TouchableOpacity>
        </View>

        {/* Resumen Global de Tarjetas */}
        <View
          style={[
            styles.summaryCard,
            { backgroundColor: colors.surfaceCard, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.summaryTitle, { color: colors.textPrimary }]}>
            Resumen Consolidado de Crédito
          </Text>

          <View style={styles.statsGrid}>
            <View style={[styles.statBox, { backgroundColor: colors.surfaceElevated }]}>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                Total Facturado Pendiente
              </Text>
              <Text style={[styles.statValue, { color: colors.warning }]}>
                {formatCurrency(totalPaymentThisMonth, currency)}
              </Text>
            </View>

            <View style={[styles.statBox, { backgroundColor: colors.surfaceElevated }]}>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                Deuda Total Acumulada
              </Text>
              <Text style={[styles.statValue, { color: colors.danger }]}>
                {formatCurrency(totalUsedDebt, currency)}
              </Text>
            </View>
          </View>

          <View style={styles.limitBarSection}>
            <View style={styles.limitRow}>
              <Text style={[styles.limitSub, { color: colors.textSecondary }]}>
                Cupo Total: {formatCurrency(totalCreditLimit, currency)}
              </Text>
              <Text style={[styles.limitSub, { color: colors.success, fontWeight: 'bold' }]}>
                Disponible: {formatCurrency(totalAvailable, currency)}
              </Text>
            </View>
            <View style={[styles.barBg, { backgroundColor: colors.inset }]}>
              <AnimatedBar
                percent={availablePercent}
                color={colors.success}
                style={styles.barFill}
              />
            </View>
          </View>
        </View>

        {/* Tarjetas de Crédito Registradas */}
        <View style={styles.sectionHeadingRow}>
          <View style={styles.headingLeftGroup}>
            <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>
              Tus Tarjetas ({creditCards.length})
            </Text>
            {creditCards.length > 0 && (
              <View
                style={[
                  styles.viewModeSwitch,
                  { backgroundColor: colors.surfaceCard, borderColor: colors.border },
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.viewModeBtn,
                    viewMode === 'wallet' && { backgroundColor: colors.primary },
                  ]}
                  onPress={() => setViewMode('wallet')}
                >
                  <CustomIcon
                    name="Layers"
                    size={13}
                    color={viewMode === 'wallet' ? '#FFFFFF' : colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.viewModeBtnText,
                      { color: colors.textMuted },
                      viewMode === 'wallet' && styles.viewModeBtnTextActive,
                    ]}
                  >
                    Billetera
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.viewModeBtn,
                    viewMode === 'list' && { backgroundColor: colors.primary },
                  ]}
                  onPress={() => setViewMode('list')}
                >
                  <CustomIcon
                    name="List"
                    size={13}
                    color={viewMode === 'list' ? '#FFFFFF' : colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.viewModeBtnText,
                      { color: colors.textMuted },
                      viewMode === 'list' && styles.viewModeBtnTextActive,
                    ]}
                  >
                    Lista
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {creditCards.length === 0 ? (
          <View
            style={[
              styles.emptyState,
              { backgroundColor: colors.surfaceCard, borderColor: colors.border },
            ]}
          >
            <CustomIcon name="CreditCard" size={36} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              Sin tarjetas registradas
            </Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Agrega tus tarjetas de crédito para simular cuotas, imputación de pagos, conciliación y extractos.
            </Text>
            <TouchableOpacity
              style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
              onPress={() => setAddCardModalVisible(true)}
            >
              <Text style={styles.emptyBtnText}>Agregar Tarjeta</Text>
            </TouchableOpacity>
          </View>
        ) : viewMode === 'wallet' ? (
          <AnimatedWalletStack
            creditCards={creditCards}
            cardStatements={cardStatements}
            activePurchases={activePurchases}
            currency={currency}
            onEditCard={handleOpenEditCard}
            onDeleteCard={handleDeleteCard}
            onOpenStatement={handleOpenStatement}
            onOpenPay={handleOpenPay}
            onOpenReconcile={handleOpenReconcile}
            onOpenManualStatement={handleOpenManualStatement}
            onOpenAmortization={handleOpenAmortization}
            onOpenAddPurchase={(card) => handleOpenAddPurchase(card)}
            onOpenCreateCard={handleOpenCreateCard}
            onOpenAIStatement={handleOpenAIStatement}
          />
        ) : (
          creditCards.map((card) => {
            const stmt = cardStatements.find((s) => s.cardId === card.id);
            const cardPurchases = activePurchases.filter((p) => p.cardId === card.id);

            // Estado del extracto
            let statusBadge = { label: 'AL DÍA', color: colors.success, bg: colors.successBg };
            if (stmt?.statementStatus === 'paid') {
              statusBadge = { label: 'EXTRACTO PAGADO', color: colors.success, bg: colors.successBg };
            } else if (stmt?.statementStatus === 'minimum_covered') {
              statusBadge = { label: 'MÍNIMO CUBIERTO', color: colors.info, bg: colors.infoBg };
            } else if (stmt?.statementStatus === 'overdue') {
              statusBadge = { label: 'VENCIDO', color: colors.danger, bg: colors.dangerBg };
            } else if (stmt?.statementStatus === 'partially_paid') {
              statusBadge = { label: 'ABONO PARCIAL', color: colors.warning, bg: colors.warningBg };
            }

            return (
              <View key={card.id} style={styles.cardWrapper}>
                {/* Header superior de la tarjeta con estado y menú contextual (⋮) */}
                <View style={styles.cardHeaderActions}>
                  <View style={[styles.statusBadgePill, { backgroundColor: statusBadge.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: statusBadge.color }]}>
                      {statusBadge.label}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.contextMenuTriggerBtn,
                      { backgroundColor: colors.surfaceCard, borderColor: colors.borderLight },
                    ]}
                    onPress={() => setContextMenuCard(card)}
                    accessibilityLabel="Más opciones de tarjeta"
                  >
                    <CustomIcon name="MoreVertical" size={20} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>

                {/* Componente Visual de Tarjeta */}
                <CreditCardVisual
                  card={card}
                  statement={stmt}
                  onPress={() => handleOpenStatement(card)}
                  compact
                />

                {/* Dos Únicas Acciones Primarias (min-height: 48px) */}
                <View style={styles.cardActionsBar}>
                  <TouchableOpacity
                    style={[
                      styles.cardActionBtn,
                      { backgroundColor: colors.success, borderColor: colors.success },
                    ]}
                    onPress={() => handleOpenAddPurchase(card)}
                    activeOpacity={0.8}
                  >
                    <CustomIcon name="Plus" size={18} color="#FFFFFF" />
                    <Text style={styles.cardActionBtnTextPrimary} numberOfLines={1}>
                      Registrar Compra
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.cardActionBtn,
                      { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                    onPress={() => handleOpenPay(card)}
                    activeOpacity={0.8}
                  >
                    <CustomIcon name="CreditCard" size={18} color="#FFFFFF" />
                    <Text style={styles.cardActionBtnTextPrimary} numberOfLines={1}>
                      Abonar / Pagar
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Compras a cuotas específicas de esta tarjeta */}
                {cardPurchases.length > 0 && (
                  <View
                    style={[
                      styles.cardPurchasesList,
                      { backgroundColor: colors.surfaceCard, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[styles.cardPurchasesTitle, { color: colors.textSecondary }]}>
                      Compras a Cuotas en {card.name}:
                    </Text>
                    {cardPurchases.map((p) => (
                      <TouchableOpacity
                        key={p.id}
                        style={[
                          styles.purchaseRow,
                          { borderTopColor: colors.divider },
                        ]}
                        onPress={() => handleOpenAmortization(p)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.pLeft}>
                          <Text style={[styles.pTitle, { color: colors.textPrimary }]}>
                            {p.description}
                          </Text>
                          <Text style={[styles.pSub, { color: colors.textSecondary }]}>
                            Cuota {p.installmentsPaid} de {p.installmentsTotal} ({p.interestRateMonthly}% E.M.)
                          </Text>
                        </View>
                        <View style={styles.pRight}>
                          <Text style={[styles.pQuota, { color: colors.successLight }]}>
                            {formatCurrency(p.monthlyInstallmentAmount, currency)}/m
                          </Text>
                          <View style={styles.detailsBadge}>
                            <Text style={[styles.detailsText, { color: colors.primaryLight }]}>
                              Ver tabla
                            </Text>
                            <CustomIcon name="ChevronRight" size={13} color={colors.primaryLight} />
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Modales */}
      <AddCreditCardModal
        visible={addCardModalVisible}
        cardToEdit={selectedCardToEdit}
        onCardCreated={handleCardCreated}
        onClose={() => {
          setAddCardModalVisible(false);
          setSelectedCardToEdit(null);
        }}
      />

      <PayCardModal
        visible={payModalVisible}
        card={selectedCardForPay}
        statementSummary={selectedStatementForPay}
        onClose={() => {
          setPayModalVisible(false);
          setSelectedCardForPay(null);
        }}
      />

      <ReconcileCardModal
        visible={reconcileModalVisible}
        card={selectedCardForReconcile}
        statementSummary={selectedStatement}
        onClose={() => {
          setReconcileModalVisible(false);
          setSelectedCardForReconcile(null);
        }}
      />

      <ManualStatementModal
        visible={manualStatementModalVisible}
        card={selectedCardForManual}
        statementSummary={selectedStatement}
        initialMode={manualStatementMode}
        onClose={() => {
          setManualStatementModalVisible(false);
          setSelectedCardForManual(null);
          setSelectedStatement(null);
          setManualStatementMode(undefined);
        }}
      />

      <CardStatementModal
        visible={statementModalVisible}
        card={selectedCardForStatement}
        statement={selectedStatement}
        onClose={() => setStatementModalVisible(false)}
      />

      <InstallmentAmortizationModal
        visible={amortizationModalVisible}
        purchase={selectedPurchase}
        card={selectedPurchaseCard}
        onClose={() => setAmortizationModalVisible(false)}
      />

      <AddTransactionModal
        visible={addPurchaseModalVisible}
        defaultType="card_purchase"
        defaultCardId={selectedCardForPurchase?.id}
        onClose={() => {
          setAddPurchaseModalVisible(false);
          setSelectedCardForPurchase(null);
        }}
      />

      <AIStatementAnalyzerModal
        visible={aiStatementModalVisible}
        card={selectedCardForAIStatement}
        onClose={() => {
          setAiStatementModalVisible(false);
          setSelectedCardForAIStatement(null);
        }}
      />

      {/* Menú Contextual (⋮) en modo Lista */}
      <Modal
        visible={!!contextMenuCard}
        transparent
        animationType="fade"
        onRequestClose={() => setContextMenuCard(null)}
      >
        <Pressable
          style={styles.contextMenuBackdrop}
          onPress={() => setContextMenuCard(null)}
        >
          {contextMenuCard && (
            <Pressable
              style={[
                styles.contextMenuSheet,
                { backgroundColor: colors.surfaceCard, borderColor: colors.borderLight },
              ]}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={[styles.contextMenuHeader, { borderBottomColor: colors.divider }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.contextMenuCardBank, { color: colors.textSecondary }]}>
                    {contextMenuCard.bankName.toUpperCase()} •••• {contextMenuCard.lastFourDigits || '0000'}
                  </Text>
                  <Text style={[styles.contextMenuCardName, { color: colors.textPrimary }]}>
                    {contextMenuCard.name}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.contextMenuCloseBtn, { backgroundColor: colors.surfaceElevated }]}
                  onPress={() => setContextMenuCard(null)}
                >
                  <CustomIcon name="X" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.contextMenuItem}
                onPress={() => {
                  const target = contextMenuCard;
                  setContextMenuCard(null);
                  handleOpenAIStatement(target);
                }}
              >
                <View style={[styles.contextMenuIconWrap, { backgroundColor: alpha(colors.primary, 0.18) }]}>
                  <CustomIcon name="Sparkles" size={18} color={colors.primaryLight} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.contextMenuItemTitle, { color: colors.textPrimary }]}>
                    Subir Extracto PDF con IA (Gemini)
                  </Text>
                  <Text style={[styles.contextMenuItemSub, { color: colors.textSecondary }]}>
                    Sube tu PDF para crear todos los movimientos e igualar al banco
                  </Text>
                </View>
                <CustomIcon name="ChevronRight" size={16} color={colors.primaryLight} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.contextMenuItem}
                onPress={() => {
                  const target = contextMenuCard;
                  setContextMenuCard(null);
                  handleOpenStatement(target);
                }}
              >
                <View style={[styles.contextMenuIconWrap, { backgroundColor: alpha(colors.primary, 0.15) }]}>
                  <CustomIcon name="FileText" size={18} color={colors.primaryLight} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.contextMenuItemTitle, { color: colors.textPrimary }]}>
                    Ver Extracto y Proyección
                  </Text>
                  <Text style={[styles.contextMenuItemSub, { color: colors.textSecondary }]}>
                    Detalle al corte, cargos y calendario de pagos
                  </Text>
                </View>
                <CustomIcon name="ChevronRight" size={16} color={colors.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.contextMenuItem}
                onPress={() => {
                  const target = contextMenuCard;
                  setContextMenuCard(null);
                  handleOpenReconcile(target);
                }}
              >
                <View style={[styles.contextMenuIconWrap, { backgroundColor: alpha(colors.success, 0.15) }]}>
                  <CustomIcon name="ShieldCheck" size={18} color={colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.contextMenuItemTitle, { color: colors.textPrimary }]}>
                    Conciliar Saldo
                  </Text>
                  <Text style={[styles.contextMenuItemSub, { color: colors.textSecondary }]}>
                    Ajusta el cupo disponible con el de tu banco
                  </Text>
                </View>
                <CustomIcon name="ChevronRight" size={16} color={colors.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.contextMenuItem}
                onPress={() => {
                  const target = contextMenuCard;
                  setContextMenuCard(null);
                  handleOpenManualStatement(target, 'opening_balance');
                }}
              >
                <View style={[styles.contextMenuIconWrap, { backgroundColor: alpha(colors.warning, 0.15) }]}>
                  <CustomIcon name="SlidersHorizontal" size={18} color={colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.contextMenuItemTitle, { color: colors.textPrimary }]}>
                    Saldo Inicial / Apertura
                  </Text>
                  <Text style={[styles.contextMenuItemSub, { color: colors.textSecondary }]}>
                    Configura deuda previa o extracto manual
                  </Text>
                </View>
                <CustomIcon name="ChevronRight" size={16} color={colors.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.contextMenuItem}
                onPress={() => {
                  const target = contextMenuCard;
                  setContextMenuCard(null);
                  handleOpenEditCard(target);
                }}
              >
                <View style={[styles.contextMenuIconWrap, { backgroundColor: colors.surfaceElevated }]}>
                  <CustomIcon name="Edit3" size={18} color={colors.textPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.contextMenuItemTitle, { color: colors.textPrimary }]}>
                    Editar Tarjeta
                  </Text>
                  <Text style={[styles.contextMenuItemSub, { color: colors.textSecondary }]}>
                    Cupo total, día de corte, pago y tasa E.M.
                  </Text>
                </View>
                <CustomIcon name="ChevronRight" size={16} color={colors.textMuted} />
              </TouchableOpacity>

              <View style={[styles.contextMenuDivider, { backgroundColor: colors.divider }]} />

              <TouchableOpacity
                style={styles.contextMenuItem}
                onPress={() => {
                  const target = contextMenuCard;
                  setContextMenuCard(null);
                  handleDeleteCard(target);
                }}
              >
                <View style={[styles.contextMenuIconWrap, { backgroundColor: colors.dangerBg }]}>
                  <CustomIcon name="Trash2" size={18} color={colors.danger} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.contextMenuItemTitle, { color: colors.danger }]}>
                    Eliminar Tarjeta
                  </Text>
                  <Text style={[styles.contextMenuItemSub, { color: colors.textSecondary }]}>
                    Eliminar o archivar tarjeta de crédito
                  </Text>
                </View>
              </TouchableOpacity>
            </Pressable>
          )}
        </Pressable>
      </Modal>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  addCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    minHeight: Layout.minTouchHeight,
    borderRadius: 10,
    gap: 5,
  },
  addCardBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  summaryCard: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  statBox: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
  },
  statLabel: {
    fontSize: 13,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 4,
  },
  limitBarSection: {},
  limitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  limitSub: {
    fontSize: 13,
  },
  barBg: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headingLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  viewModeSwitch: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
  },
  viewModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  viewModeBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  viewModeBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  newPurchaseQuick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    minHeight: 36,
    borderRadius: 10,
  },
  newPurchaseQuickText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  cardWrapper: {
    marginBottom: 20,
  },
  cardHeaderActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusBadgePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  contextMenuTriggerBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardActionsBar: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
    marginBottom: 14,
  },
  cardActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
  },
  cardActionBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  cardActionBtnTextPrimary: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  contextMenuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  contextMenuSheet: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  contextMenuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    marginBottom: 4,
  },
  contextMenuCardBank: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  contextMenuCardName: {
    fontSize: 17,
    fontWeight: 'bold',
    marginTop: 2,
  },
  contextMenuCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contextMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    minHeight: 56,
    gap: 12,
  },
  contextMenuIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contextMenuItemTitle: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  contextMenuItemSub: {
    fontSize: 13,
    marginTop: 2,
  },
  contextMenuDivider: {
    height: 1,
    marginVertical: 4,
    marginHorizontal: 18,
  },
  cardPurchasesList: {
    borderRadius: 14,
    padding: 12,
    marginTop: -6,
    borderWidth: 1,
  },
  cardPurchasesTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  purchaseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  pLeft: {
    flex: 1,
    marginRight: 8,
  },
  pTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  pSub: {
    fontSize: 13,
    marginTop: 2,
  },
  pRight: {
    alignItems: 'flex-end',
  },
  pQuota: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  detailsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  detailsText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyState: {
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 10,
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  emptyBtn: {
    paddingHorizontal: 20,
    minHeight: Layout.minTouchHeight,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },
  emptyBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
