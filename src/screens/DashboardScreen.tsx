import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useFinancial } from '../context/FinancialContext';
import { useAppTheme } from '../context/ThemeContext';
import { formatCurrency } from '../utils/formatters';
import { Layout, alpha } from '../components/common/Theme';
import { CustomIcon } from '../components/common/CustomIcon';
import { Text } from '../components/common/AppText';
import { TouchableOpacity } from '../components/common/Touchable';
import { CreditCardVisual, CARD_WIDTH } from '../components/cards/CreditCardVisual';
import { AccountMiniCard, MINI_CARD_WIDTH } from '../components/accounts/AccountMiniCard';
import { TransactionItem } from '../components/transactions/TransactionItem';
import { CardStatementModal } from '../components/cards/CardStatementModal';
import { InstallmentAmortizationModal } from '../components/cards/InstallmentAmortizationModal';
import { AddTransactionModal } from '../components/transactions/AddTransactionModal';
import { QuickIslandBar } from '../components/common/QuickIslandBar';
import { ParsedBankMessage } from '../utils/bankNotificationParser';
import { CreditCard, CardStatementSummary, CardPurchase, Account } from '../types/finance';
import { PayDebtModal } from '../components/accounts/PayDebtModal';

interface DashboardScreenProps {
  onNavigateToTab: (tabName: string, params?: { accountId?: string }) => void;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({ onNavigateToTab }) => {
  const {
    totalBankBalance,
    totalCreditDebt,
    totalOtherDebts,
    totalAllDebts,
    netWorth,
    monthlyIncome,
    monthlyExpense,
    creditCards,
    cardStatements,
    accounts,
    transactions,
    activePurchases,
    refreshData,
    currency,
    isBalanceHidden,
    toggleHideBalance,
  } = useFinancial();
  const { colors, isDark, toggleMode } = useAppTheme();

  const [refreshing, setRefreshing] = useState(false);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [statementModalVisible, setStatementModalVisible] = useState(false);
  const [selectedCardForStatement, setSelectedCardForStatement] = useState<CreditCard | null>(null);
  const [selectedStatement, setSelectedStatement] = useState<CardStatementSummary | null>(null);

  const [amortizationModalVisible, setAmortizationModalVisible] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<CardPurchase | null>(null);
  const [selectedPurchaseCard, setSelectedPurchaseCard] = useState<CreditCard | null>(null);

  const [addTxVisible, setAddTxVisible] = useState(false);
  const [prefillData, setPrefillData] = useState<Partial<ParsedBankMessage> | null>(null);
  const [payDebtModalVisible, setPayDebtModalVisible] = useState(false);
  const [selectedDebtAccountToPay, setSelectedDebtAccountToPay] = useState<Account | null>(null);

  const handleOpenPayDebt = (acc: Account) => {
    setSelectedDebtAccountToPay(acc);
    setPayDebtModalVisible(true);
  };

  const handleOpenAddWithPrefill = (data?: Partial<ParsedBankMessage>) => {
    setPrefillData(data || null);
    setAddTxVisible(true);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  };

  const handleOpenStatement = (card: CreditCard) => {
    const stmt = cardStatements.find((s) => s.cardId === card.id) || null;
    setSelectedCardForStatement(card);
    setSelectedStatement(stmt);
    setStatementModalVisible(true);
  };

  const handleOpenAmortization = (purchase: CardPurchase) => {
    const card = creditCards.find((c) => c.id === purchase.cardId) || null;
    setSelectedPurchase(purchase);
    setSelectedPurchaseCard(card);
    setAmortizationModalVisible(true);
  };

  const recentTransactions = transactions.slice(0, 4);

  return (
    <View style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Header Superior: marca, captura rápida, tema claro/oscuro, ocultar saldo & ajustes */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.appName, { color: colors.textPrimary }]}>keAhorro</Text>
            <Text style={[styles.greeting, { color: colors.textMuted }]}>Control Financiero</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <QuickIslandBar variant="icon" onOpenAddModal={(data) => handleOpenAddWithPrefill(data)} />
            <TouchableOpacity
              style={[
                styles.settingsHeaderBtn,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.borderLight },
              ]}
              onPress={toggleMode}
            >
              <CustomIcon
                name={isDark ? 'Sun' : 'Moon'}
                size={20}
                color={isDark ? colors.warningLight : colors.primary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.settingsHeaderBtn,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.borderLight },
              ]}
              onPress={toggleHideBalance}
            >
              <CustomIcon name={isBalanceHidden ? 'EyeOff' : 'Eye'} size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.settingsHeaderBtn,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.borderLight },
              ]}
              onPress={() => onNavigateToTab('settings')}
            >
              <CustomIcon name="Settings" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Estado Vacío / Onboarding para usuarios nuevos (sin cuentas ni movimientos) */}
        {accounts.length === 0 && transactions.length === 0 && (
          <View
            style={[
              styles.onboardingCard,
              {
                backgroundColor: colors.surfaceCard,
                borderColor: alpha(colors.primary, 0.35),
              },
            ]}
          >
            <View
              style={[
                styles.onboardingIconWrap,
                { backgroundColor: alpha(colors.success, 0.16) },
              ]}
            >
              <CustomIcon name="Sparkles" size={26} color={colors.success} />
            </View>
            <Text style={[styles.onboardingTitle, { color: colors.textPrimary }]}>
              ¡Bienvenido a keAhorro!
            </Text>
            <Text style={[styles.onboardingDesc, { color: colors.textSecondary }]}>
              Organiza tus cuentas, tarjetas y gastos diarios en segundos con total privacidad. Da tu primer paso para empezar:
            </Text>

            <View style={styles.onboardingActionsCol}>
              <TouchableOpacity
                style={[
                  styles.onboardingPrimaryBtn,
                  { backgroundColor: colors.primary },
                ]}
                onPress={() => onNavigateToTab('accounts')}
                activeOpacity={0.85}
              >
                <CustomIcon name="Plus" size={18} color="#FFFFFF" />
                <Text style={styles.onboardingPrimaryBtnText}>
                  Agregar mi primera cuenta
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.onboardingSecondaryBtn,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.success,
                  },
                ]}
                onPress={() => handleOpenAddWithPrefill()}
                activeOpacity={0.85}
              >
                <CustomIcon name="ArrowUpRight" size={18} color={colors.success} />
                <Text
                  style={[
                    styles.onboardingSecondaryBtnText,
                    { color: colors.textPrimary },
                  ]}
                >
                  Registrar mi primer movimiento
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Tarjeta de Saldo Disponible Consolidado */}
        <View
          style={[
            styles.netWorthCard,
            { backgroundColor: colors.surfaceCard, borderColor: colors.border },
          ]}
        >
          <View style={styles.netWorthHeader}>
            <Text style={[styles.netWorthLabel, { color: colors.textMuted }]}>SALDO DISPONIBLE</Text>
            <View style={[styles.privacyBadge, { backgroundColor: colors.successBg }]}>
              <CustomIcon name="ShieldCheck" size={14} color={colors.success} />
              <Text style={[styles.privacyText, { color: colors.success }]}>100% Privado</Text>
            </View>
          </View>

          <Text
            style={[
              styles.netWorthAmount,
              { color: netWorth < 0 ? colors.danger : colors.textPrimary },
            ]}
          >
            {isBalanceHidden ? '$ ••••••' : formatCurrency(netWorth, currency)}
          </Text>

          <View style={[styles.netWorthBreakdown, { backgroundColor: colors.insetOverlay }]}>
            <View style={styles.netWorthItem}>
              <View style={[styles.dotIncome, { backgroundColor: colors.success }]} />
              <View>
                <Text style={[styles.breakdownSub, { color: colors.textMuted }]}>Total Cuentas</Text>
                <Text style={[styles.breakdownVal, { color: colors.textPrimary }]}>
                  {isBalanceHidden ? '••••••' : formatCurrency(totalBankBalance, currency)}
                </Text>
              </View>
            </View>

            <View style={[styles.dividerVertical, { backgroundColor: colors.divider }]} />

            <View style={styles.netWorthItem}>
              <View style={[styles.dotDebt, { backgroundColor: colors.danger }]} />
              <View>
                <Text style={[styles.breakdownSub, { color: colors.textMuted }]}>
                  {totalOtherDebts > 0 ? 'Total Deudas' : 'Deuda Tarjetas'}
                </Text>
                <Text style={[styles.breakdownVal, { color: colors.danger }]}>
                  {isBalanceHidden
                    ? '••••••'
                    : formatCurrency(totalOtherDebts > 0 ? totalAllDebts : totalCreditDebt, currency)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Resumen de Flujo Mensual (Ingresos vs Gastos) */}
        <View style={styles.cashFlowRow}>
          {/* Ingresos */}
          <View
            style={[
              styles.flowCard,
              {
                backgroundColor: colors.surfaceCard,
                borderColor: colors.border,
                borderLeftWidth: 3,
                borderLeftColor: colors.success,
              },
            ]}
          >
            <View style={[styles.flowIconBoxIncome, { backgroundColor: colors.successBg }]}>
              <CustomIcon name="ArrowDownLeft" size={16} color={colors.success} />
            </View>
            <Text style={[styles.flowLabel, { color: colors.textMuted }]}>Ingresos del Mes</Text>
            <Text style={[styles.flowAmountIncome, { color: colors.success }]}>
              {isBalanceHidden ? '••••••' : formatCurrency(monthlyIncome, currency)}
            </Text>
          </View>

          {/* Gastos */}
          <View
            style={[
              styles.flowCard,
              {
                backgroundColor: colors.surfaceCard,
                borderColor: colors.border,
                borderLeftWidth: 3,
                borderLeftColor: colors.danger,
              },
            ]}
          >
            <View style={[styles.flowIconBoxExpense, { backgroundColor: colors.dangerBg }]}>
              <CustomIcon name="ArrowUpRight" size={16} color={colors.danger} />
            </View>
            <Text style={[styles.flowLabel, { color: colors.textMuted }]}>Gastos del Mes</Text>
            <Text style={[styles.flowAmountExpense, { color: colors.danger }]}>
              {isBalanceHidden ? '••••••' : formatCurrency(monthlyExpense, currency)}
            </Text>
          </View>
        </View>

        {/* Sección de Tarjetas de Crédito */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Tarjetas de Crédito</Text>
          <TouchableOpacity onPress={() => onNavigateToTab('cards')}>
            <Text style={[styles.seeAllText, { color: colors.primaryLight }]}>
              Gestionar ({creditCards.length})
            </Text>
          </TouchableOpacity>
        </View>

        {creditCards.length === 0 ? (
          <TouchableOpacity
            style={[
              styles.emptyCard,
              { backgroundColor: colors.surfaceCard, borderColor: colors.border },
            ]}
            onPress={() => onNavigateToTab('cards')}
          >
            <CustomIcon name="CreditCard" size={28} color={colors.primary} />
            <Text style={[styles.emptyCardText, { color: colors.textPrimary }]}>
              No tienes tarjetas registradas
            </Text>
            <Text style={[styles.emptyCardSub, { color: colors.textMuted }]}>
              Toca aquí para agregar tu primera tarjeta de crédito
            </Text>
          </TouchableOpacity>
        ) : (
          <View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={CARD_WIDTH + 12}
              snapToAlignment="start"
              decelerationRate="fast"
              nestedScrollEnabled={true}
              scrollEventThrottle={16}
              onScroll={(e) => {
                const offsetX = e.nativeEvent.contentOffset.x;
                const idx = Math.round(offsetX / (CARD_WIDTH + 12));
                if (idx >= 0 && idx < creditCards.length) {
                  setActiveCardIndex(idx);
                }
              }}
              style={styles.cardsScroll}
            >
              {creditCards.map((card, index) => {
                const stmt = cardStatements.find((s) => s.cardId === card.id);
                const isLast = index === creditCards.length - 1;
                return (
                  <View key={card.id} style={{ width: CARD_WIDTH, marginRight: isLast ? 0 : 12 }}>
                    <CreditCardVisual
                      card={card}
                      statement={stmt}
                      summary
                      onPress={() => onNavigateToTab('cards')}
                    />
                  </View>
                );
              })}
            </ScrollView>

            {/* Indicador de Paginación de Tarjetas */}
            {creditCards.length > 1 && (
              <View style={styles.carouselPagination}>
                {creditCards.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.paginationDot,
                      { backgroundColor: colors.borderLight },
                      activeCardIndex === i && [
                        styles.paginationDotActive,
                        { backgroundColor: colors.primary },
                      ],
                    ]}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Compras a Cuotas Activas */}
        {activePurchases.length > 0 && (
          <View style={styles.installmentsBlock}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Cuotas Pendientes</Text>
              <Text
                style={[
                  styles.activeCountBadge,
                  { color: colors.primaryLight, backgroundColor: alpha(colors.primary, 0.15) },
                ]}
              >
                {activePurchases.length} activas
              </Text>
            </View>

            {activePurchases.map((purch) => {
              const card = creditCards.find((c) => c.id === purch.cardId);
              return (
                <TouchableOpacity
                  key={purch.id}
                  style={[
                    styles.activePurchaseItem,
                    { backgroundColor: colors.surfaceCard, borderColor: colors.border },
                  ]}
                  onPress={() => handleOpenAmortization(purch)}
                  activeOpacity={0.8}
                >
                  <View style={styles.purchLeft}>
                    <View
                      style={[
                        styles.purchIconBox,
                        { backgroundColor: alpha(colors.primary, 0.15) },
                      ]}
                    >
                      <CustomIcon name="CalendarClock" size={16} color={colors.primaryLight} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.purchTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                        {purch.description}
                      </Text>
                      <Text style={[styles.purchSub, { color: colors.textSecondary }]}>
                        {card?.name || 'Tarjeta'} • Cuota {purch.installmentsPaid} de {purch.installmentsTotal}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.purchRight}>
                    <Text style={[styles.purchAmount, { color: colors.successLight }]}>
                      {formatCurrency(purch.monthlyInstallmentAmount, currency)} / mes
                    </Text>
                    <Text style={[styles.purchRate, { color: colors.warning }]}>
                      {purch.interestRateMonthly}% E.M.
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Sección de Cuentas Bancarias */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Mis Cuentas & Billeteras</Text>
          <TouchableOpacity onPress={() => onNavigateToTab('accounts')}>
            <Text style={[styles.seeAllText, { color: colors.primaryLight }]}>Ver todas</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled={true}
          contentContainerStyle={styles.accountsCarousel}
          style={styles.accountsScroll}
          snapToInterval={MINI_CARD_WIDTH + 10}
          decelerationRate="fast"
        >
          {accounts.map((acc) => (
            <AccountMiniCard
              key={acc.id}
              account={acc}
              onPress={() => onNavigateToTab('transactions', { accountId: acc.id })}
              onPayDebt={() => handleOpenPayDebt(acc)}
            />
          ))}
          <TouchableOpacity
            style={[styles.seeAllTile, { borderColor: colors.borderLight }]}
            onPress={() => onNavigateToTab('accounts')}
            activeOpacity={0.8}
          >
            <CustomIcon name="ArrowRight" size={18} color={colors.primaryLight} />
            <Text style={[styles.seeAllTileText, { color: colors.primaryLight }]}>Ver todas</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Últimas Transacciones */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Últimos Movimientos</Text>
        </View>

        {recentTransactions.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              No hay movimientos registrados.
            </Text>
          </View>
        ) : (
          <View style={styles.transactionsList}>
            {recentTransactions.map((tx) => (
              <TransactionItem key={tx.id} transaction={tx} compact />
            ))}
          </View>
        )}

        <TouchableOpacity
          style={[styles.historyBtn, { borderColor: colors.borderLight }]}
          onPress={() => onNavigateToTab('transactions')}
          activeOpacity={0.8}
        >
          <Text style={[styles.historyBtnText, { color: colors.primaryLight }]}>
            Ver todo el historial
          </Text>
        </TouchableOpacity>

        <View style={{ height: Layout.bottomNavSpace }} />
      </ScrollView>

      {/* Modales */}
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
        visible={addTxVisible}
        prefillData={prefillData}
        onClose={() => {
          setAddTxVisible(false);
          setPrefillData(null);
        }}
      />

      <PayDebtModal
        visible={payDebtModalVisible}
        debtAccount={selectedDebtAccountToPay}
        onClose={() => {
          setPayDebtModalVisible(false);
          setSelectedDebtAccountToPay(null);
        }}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  greeting: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  appName: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  settingsHeaderBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  netWorthCard: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
  },
  netWorthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  netWorthLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  privacyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  privacyText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  netWorthAmount: {
    fontSize: 30,
    fontWeight: 'bold',
    marginVertical: 4,
  },
  netWorthBreakdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  netWorthItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  dotIncome: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotDebt: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  breakdownSub: {
    fontSize: 13,
    fontWeight: '500',
  },
  breakdownVal: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 1,
  },
  dividerVertical: {
    width: 1,
    marginHorizontal: 8,
  },
  cashFlowRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
  },
  flowCard: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
  },
  flowIconBoxIncome: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  flowIconBoxExpense: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  flowLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  flowAmountIncome: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 2,
  },
  flowAmountExpense: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: 'bold',
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '600',
  },
  cardsScroll: {
    marginVertical: 4,
  },
  carouselPagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    marginBottom: 4,
  },
  paginationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  paginationDotActive: {
    width: 20,
    height: 6,
    borderRadius: 3,
  },
  emptyCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  emptyCardText: {
    fontSize: 15,
    fontWeight: 'bold',
    marginTop: 8,
  },
  emptyCardSub: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  installmentsBlock: {
    marginBottom: 16,
  },
  activeCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 'bold',
  },
  activePurchaseItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
  },
  purchLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  purchIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  purchTitle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  purchSub: {
    fontSize: 13,
    marginTop: 2,
  },
  purchRight: {
    alignItems: 'flex-end',
  },
  purchAmount: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  purchRate: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 1,
  },
  accountsScroll: {
    marginBottom: 14,
  },
  accountsCarousel: {
    gap: 10,
    paddingRight: 4,
  },
  seeAllTile: {
    width: 96,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  seeAllTileText: {
    fontSize: 13,
    fontWeight: '600',
  },
  historyBtn: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: Layout.minTouchHeight,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 10,
  },
  historyBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  transactionsList: {
    marginBottom: 10,
  },
  emptyBox: {
    padding: 16,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
  },
  onboardingCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  onboardingIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  onboardingTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 6,
  },
  onboardingDesc: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  onboardingActionsCol: {
    width: '100%',
    gap: 10,
  },
  onboardingPrimaryBtn: {
    minHeight: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  onboardingPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  onboardingSecondaryBtn: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  onboardingSecondaryBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
  },
});
