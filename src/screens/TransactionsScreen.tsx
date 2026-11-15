import React, { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useFinancial } from '../context/FinancialContext';
import { useAppTheme } from '../context/ThemeContext';
import { TransactionItem } from '../components/transactions/TransactionItem';
import { AddTransactionModal } from '../components/transactions/AddTransactionModal';
import { formatCurrency, getMonthName } from '../utils/formatters';
import { Layout, alpha } from '../components/common/Theme';
import { CustomIcon } from '../components/common/CustomIcon';
import { Text, TextInput } from '../components/common/AppText';
import { TouchableOpacity } from '../components/common/Touchable';
import { AnimatedBar } from '../components/common/AnimatedBar';
import { FadeSlideIn } from '../components/common/FadeSlideIn';

interface TransactionsScreenProps {
  filterAccountId?: string | null;
  onClearAccountFilter?: () => void;
}

export const TransactionsScreen: React.FC<TransactionsScreenProps> = ({
  filterAccountId,
  onClearAccountFilter,
}) => {
  const { transactions, categories, accounts, currency } = useFinancial();
  const { colors } = useAppTheme();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(filterAccountId || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [addTxVisible, setAddTxVisible] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'chart'>('list');

  // Sincronizar cuando cambie la prop desde afuera
  React.useEffect(() => {
    if (filterAccountId !== undefined) {
      setSelectedAccountId(filterAccountId);
    }
  }, [filterAccountId]);

  const activeAccount = accounts.find((a) => a.id === selectedAccountId);

  // Mes y Año en formato YYYY-MM
  const currentYearMonth = useMemo(() => {
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }, [selectedDate]);

  const handlePrevMonth = () => {
    setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1));
  };

  // Filtrar transacciones por mes, tipo y búsqueda
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      // Filtro de mes
      if (!tx.date.startsWith(currentYearMonth)) return false;

      // Filtro de tipo
      if (selectedType !== 'all') {
        if (selectedType === 'expense' && tx.type !== 'expense') return false;
        if (selectedType === 'income' && tx.type !== 'income') return false;
        if (selectedType === 'transfer' && tx.type !== 'transfer') return false;
        if (selectedType === 'card_purchase' && tx.type !== 'card_purchase') return false;
      }

      // Filtro de cuenta específica
      if (selectedAccountId) {
        const matchAcc = tx.accountId === selectedAccountId || tx.toAccountId === selectedAccountId;
        if (!matchAcc) return false;
      }

      // Filtro de búsqueda
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchDesc = tx.description.toLowerCase().includes(q);
        const matchNotes = tx.notes?.toLowerCase().includes(q);
        if (!matchDesc && !matchNotes) return false;
      }

      return true;
    });
  }, [transactions, currentYearMonth, selectedType, selectedAccountId, searchQuery]);

  // Totales del mes seleccionado
  const monthTotals = useMemo(() => {
    let income = 0;
    let expense = 0;

    for (const tx of filteredTransactions) {
      if (tx.type === 'income') {
        income += tx.amount;
      } else if (tx.type === 'expense' || tx.type === 'card_purchase') {
        expense += (tx.amount + (tx.gmfAmount || 0));
      } else if (tx.type === 'transfer' && tx.gmfAmount) {
        expense += tx.gmfAmount;
      }
    }

    return { income, expense, balance: +(income - expense).toFixed(2) };
  }, [filteredTransactions]);

  // Datos para la vista gráfica por categorías
  const categoryStats = useMemo(() => {
    const expenseByCategory: Record<string, number> = {};
    const incomeByCategory: Record<string, number> = {};

    filteredTransactions.forEach((tx) => {
      if (tx.type === 'expense' || tx.type === 'card_purchase') {
        expenseByCategory[tx.categoryId] = (expenseByCategory[tx.categoryId] || 0) + tx.amount + (tx.gmfAmount || 0);
      } else if (tx.type === 'transfer' && tx.gmfAmount) {
        expenseByCategory['cat-financial'] = (expenseByCategory['cat-financial'] || 0) + tx.gmfAmount;
      } else if (tx.type === 'income') {
        incomeByCategory[tx.categoryId] = (incomeByCategory[tx.categoryId] || 0) + tx.amount;
      }
    });

    const expenseList = Object.keys(expenseByCategory)
      .map((catId) => {
        const cat = categories.find((c) => c.id === catId);
        const amount = expenseByCategory[catId];
        const percentage = monthTotals.expense > 0 ? (amount / monthTotals.expense) * 100 : 0;
        return {
          catId,
          name: cat?.name || 'Varios',
          icon: cat?.icon || 'ShoppingBag',
          color: cat?.color || colors.danger,
          amount,
          percentage,
        };
      })
      .sort((a, b) => b.amount - a.amount);

    const incomeList = Object.keys(incomeByCategory)
      .map((catId) => {
        const cat = categories.find((c) => c.id === catId);
        const amount = incomeByCategory[catId];
        const percentage = monthTotals.income > 0 ? (amount / monthTotals.income) * 100 : 0;
        return {
          catId,
          name: cat?.name || 'Ingreso',
          icon: cat?.icon || 'TrendingUp',
          color: cat?.color || colors.success,
          amount,
          percentage,
        };
      })
      .sort((a, b) => b.amount - a.amount);

    return { expenseList, incomeList };
  }, [filteredTransactions, categories, monthTotals, colors.danger, colors.success]);

  const typeFilterChips = [
    { id: 'all', label: 'Todos' },
    { id: 'expense', label: 'Gastos' },
    { id: 'card_purchase', label: 'Tarjetas' },
    { id: 'income', label: 'Ingresos' },
    { id: 'transfer', label: 'Transferencias' },
  ];

  const incomePercent =
    monthTotals.income > 0
      ? (monthTotals.income / (monthTotals.income + monthTotals.expense || 1)) * 100
      : 0;
  const expensePercent =
    monthTotals.expense > 0
      ? (monthTotals.expense / (monthTotals.income + monthTotals.expense || 1)) * 100
      : 0;

  return (
    <View style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.tag, { color: colors.primaryLight }]}>HISTORIAL</Text>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Movimientos</Text>
          </View>

          {/* Toggle Vista Lista / Vista Gráfica */}
          <View
            style={[
              styles.viewToggle,
              { backgroundColor: colors.surfaceCard, borderColor: colors.border },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.toggleBtn,
                viewMode === 'list' && { backgroundColor: colors.primary },
              ]}
              onPress={() => setViewMode('list')}
            >
              <CustomIcon
                name="List"
                size={16}
                color={viewMode === 'list' ? '#FFFFFF' : colors.textMuted}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.toggleBtn,
                viewMode === 'chart' && { backgroundColor: colors.primary },
              ]}
              onPress={() => setViewMode('chart')}
            >
              <CustomIcon
                name="BarChart3"
                size={16}
                color={viewMode === 'chart' ? '#FFFFFF' : colors.textMuted}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Selector de Mes */}
        <View
          style={[
            styles.monthSelector,
            { backgroundColor: colors.surfaceCard, borderColor: colors.border },
          ]}
        >
          <TouchableOpacity onPress={handlePrevMonth} style={styles.monthArrow}>
            <CustomIcon name="ChevronLeft" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={styles.monthTitleBox}>
            <CustomIcon name="Calendar" size={15} color={colors.primaryLight} />
            <Text style={[styles.monthTitleText, { color: colors.textPrimary }]}>
              {getMonthName(selectedDate.getMonth())} {selectedDate.getFullYear()}
            </Text>
          </View>
          <TouchableOpacity onPress={handleNextMonth} style={styles.monthArrow}>
            <CustomIcon name="ChevronRight" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Resumen del Mes Filtrado */}
        <View
          style={[
            styles.summaryBar,
            { backgroundColor: colors.surfaceCard, borderColor: colors.border },
          ]}
        >
          <View style={styles.summaryCol}>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Ingresos</Text>
            <Text style={[styles.summaryVal, { color: colors.success }]}>
              +{formatCurrency(monthTotals.income, currency)}
            </Text>
          </View>
          <View style={styles.summaryCol}>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Gastos</Text>
            <Text style={[styles.summaryVal, { color: colors.danger }]}>
              -{formatCurrency(monthTotals.expense, currency)}
            </Text>
          </View>
          <View style={styles.summaryCol}>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Balance</Text>
            <Text
              style={[
                styles.summaryVal,
                { color: monthTotals.balance >= 0 ? colors.successLight : colors.dangerLight },
              ]}
            >
              {formatCurrency(monthTotals.balance, currency)}
            </Text>
          </View>
        </View>

        {/* Barra de Búsqueda */}
        <View style={styles.searchRow}>
          <View
            style={[
              styles.searchInputBox,
              { backgroundColor: colors.surfaceCard, borderColor: colors.border },
            ]}
          >
            <CustomIcon name="Search" size={16} color={colors.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: colors.textPrimary }]}
              placeholder="Buscar movimiento..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <CustomIcon name="X" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Chips de Categorías / Filtros (scroll suave + indicador + altura >= 40px) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={true}
          persistentScrollbar={true}
          decelerationRate="fast"
          style={styles.filterChipsRow}
          contentContainerStyle={styles.filterChipsContent}
        >
          {typeFilterChips.map((chip) => {
            const isSelected = selectedType === chip.id;
            return (
              <TouchableOpacity
                key={chip.id}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: colors.surfaceCard,
                    borderColor: colors.border,
                  },
                  isSelected && {
                    backgroundColor: colors.primary,
                    borderColor: colors.primaryLight,
                  },
                ]}
                onPress={() => setSelectedType(chip.id)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: colors.textSecondary },
                    isSelected && styles.filterChipTextSelected,
                  ]}
                >
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Chips de Cuentas (scroll suave + indicador + altura >= 40px) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={true}
          persistentScrollbar={true}
          decelerationRate="fast"
          style={styles.accountChipsRow}
          contentContainerStyle={styles.accountChipsContent}
        >
          <TouchableOpacity
            style={[
              styles.accountChip,
              {
                backgroundColor: colors.surfaceCard,
                borderColor: colors.border,
              },
              !selectedAccountId && {
                backgroundColor: colors.primary,
                borderColor: colors.primaryLight,
              },
            ]}
            onPress={() => {
              setSelectedAccountId(null);
              onClearAccountFilter?.();
            }}
          >
            <CustomIcon
              name="Layers"
              size={14}
              color={!selectedAccountId ? '#FFFFFF' : colors.textSecondary}
            />
            <Text
              style={[
                styles.accountChipText,
                { color: colors.textSecondary },
                !selectedAccountId && styles.accountChipTextSelected,
              ]}
            >
              Todas las Cuentas
            </Text>
          </TouchableOpacity>
          {accounts.map((acc) => {
            const isSelected = selectedAccountId === acc.id;
            return (
              <TouchableOpacity
                key={acc.id}
                style={[
                  styles.accountChip,
                  {
                    backgroundColor: colors.surfaceCard,
                    borderColor: colors.border,
                  },
                  isSelected && { backgroundColor: acc.color, borderColor: acc.color },
                ]}
                onPress={() => {
                  if (isSelected) {
                    setSelectedAccountId(null);
                    onClearAccountFilter?.();
                  } else {
                    setSelectedAccountId(acc.id);
                  }
                }}
              >
                <CustomIcon
                  name={acc.icon || 'Landmark'}
                  size={14}
                  color={isSelected ? '#FFFFFF' : acc.color}
                />
                <Text
                  style={[
                    styles.accountChipText,
                    { color: colors.textSecondary },
                    isSelected && styles.accountChipTextSelected,
                  ]}
                >
                  {acc.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Banner de Filtro Activo por Cuenta */}
        {activeAccount && (
          <View
            style={[
              styles.activeFilterBanner,
              {
                backgroundColor: alpha(colors.primary, 0.14),
                borderColor: alpha(colors.primary, 0.3),
              },
            ]}
          >
            <View style={styles.activeFilterLeft}>
              <CustomIcon name={activeAccount.icon || 'Landmark'} size={14} color={activeAccount.color} />
              <Text style={[styles.activeFilterText, { color: colors.textSecondary }]}>
                Filtrando por:{' '}
                <Text style={{ color: colors.textPrimary, fontWeight: 'bold' }}>
                  {activeAccount.name}
                </Text>
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                setSelectedAccountId(null);
                onClearAccountFilter?.();
              }}
              style={[styles.clearFilterBadge, { backgroundColor: colors.surfaceElevated }]}
            >
              <CustomIcon name="X" size={12} color={colors.textSecondary} />
              <Text style={[styles.clearFilterText, { color: colors.textPrimary }]}>Quitar</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Vista Lista o Vista Gráfica con transición suave (fade + slide-up 200ms) */}
        <FadeSlideIn key={viewMode} style={styles.list}>
          {viewMode === 'list' ? (
            <ScrollView
              style={styles.list}
              contentContainerStyle={{ paddingBottom: Layout.bottomNavSpace }}
              showsVerticalScrollIndicator={false}
            >
              {filteredTransactions.length === 0 ? (
                <View style={styles.emptyState}>
                  <CustomIcon name="Receipt" size={36} color={colors.textMuted} />
                  <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
                    Sin movimientos
                  </Text>
                  <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                    No hay transacciones que coincidan con los filtros para este mes.
                  </Text>
                </View>
              ) : (
                filteredTransactions.map((tx) => (
                  <TransactionItem key={tx.id} transaction={tx} />
                ))
              )}
            </ScrollView>
          ) : (
            /* Vista Gráfica */
            <ScrollView
              style={styles.list}
              contentContainerStyle={{ paddingBottom: Layout.bottomNavSpace }}
              showsVerticalScrollIndicator={false}
            >
              {/* Gráfica de Comparación Visual Ingresos vs Gastos */}
              <View
                style={[
                  styles.chartCard,
                  { backgroundColor: colors.surfaceCard, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.chartTitle, { color: colors.textPrimary }]}>
                  Comparación del Mes
                </Text>
                <View style={styles.comparisonBarContainer}>
                  <View style={styles.comparisonBarRow}>
                    <Text style={[styles.compBarLabel, { color: colors.textSecondary }]}>
                      Ingresos
                    </Text>
                    <View style={[styles.compBarBg, { backgroundColor: colors.inset }]}>
                      <AnimatedBar
                        percent={incomePercent}
                        color={colors.success}
                        style={styles.compBarFill}
                      />
                    </View>
                    <Text style={[styles.compBarVal, { color: colors.success }]}>
                      {formatCurrency(monthTotals.income, currency)}
                    </Text>
                  </View>

                  <View style={styles.comparisonBarRow}>
                    <Text style={[styles.compBarLabel, { color: colors.textSecondary }]}>
                      Gastos
                    </Text>
                    <View style={[styles.compBarBg, { backgroundColor: colors.inset }]}>
                      <AnimatedBar
                        percent={expensePercent}
                        color={colors.danger}
                        style={styles.compBarFill}
                      />
                    </View>
                    <Text style={[styles.compBarVal, { color: colors.danger }]}>
                      {formatCurrency(monthTotals.expense, currency)}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Desglose Gráfico de Gastos por Categoría */}
              <View
                style={[
                  styles.chartCard,
                  { backgroundColor: colors.surfaceCard, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.chartTitle, { color: colors.textPrimary }]}>
                  Gastos por Categoría
                </Text>
                {categoryStats.expenseList.length === 0 ? (
                  <Text style={[styles.emptyChartText, { color: colors.textMuted }]}>
                    No hay gastos registrados este mes.
                  </Text>
                ) : (
                  categoryStats.expenseList.map((cat) => (
                    <View key={cat.catId} style={styles.catStatRow}>
                      <View style={styles.catStatHeader}>
                        <View style={styles.catStatLeft}>
                          <View style={[styles.catStatDot, { backgroundColor: cat.color }]} />
                          <Text style={[styles.catStatName, { color: colors.textPrimary }]}>
                            {cat.name}
                          </Text>
                        </View>
                        <View style={styles.catStatRight}>
                          <Text style={[styles.catStatAmount, { color: colors.textPrimary }]}>
                            {formatCurrency(cat.amount, currency)}
                          </Text>
                          <Text style={[styles.catStatPercent, { color: colors.textMuted }]}>
                            {cat.percentage.toFixed(1)}%
                          </Text>
                        </View>
                      </View>
                      <View style={[styles.catProgressBarBg, { backgroundColor: colors.inset }]}>
                        <AnimatedBar
                          percent={cat.percentage}
                          color={cat.color}
                          style={styles.catProgressBarFill}
                        />
                      </View>
                    </View>
                  ))
                )}
              </View>

              {/* Desglose Gráfico de Ingresos por Categoría */}
              <View
                style={[
                  styles.chartCard,
                  { backgroundColor: colors.surfaceCard, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.chartTitle, { color: colors.textPrimary }]}>
                  Ingresos por Categoría
                </Text>
                {categoryStats.incomeList.length === 0 ? (
                  <Text style={[styles.emptyChartText, { color: colors.textMuted }]}>
                    No hay ingresos registrados este mes.
                  </Text>
                ) : (
                  categoryStats.incomeList.map((cat) => (
                    <View key={cat.catId} style={styles.catStatRow}>
                      <View style={styles.catStatHeader}>
                        <View style={styles.catStatLeft}>
                          <View style={[styles.catStatDot, { backgroundColor: cat.color }]} />
                          <Text style={[styles.catStatName, { color: colors.textPrimary }]}>
                            {cat.name}
                          </Text>
                        </View>
                        <View style={styles.catStatRight}>
                          <Text style={[styles.catStatAmount, { color: colors.textPrimary }]}>
                            {formatCurrency(cat.amount, currency)}
                          </Text>
                          <Text style={[styles.catStatPercent, { color: colors.textMuted }]}>
                            {cat.percentage.toFixed(1)}%
                          </Text>
                        </View>
                      </View>
                      <View style={[styles.catProgressBarBg, { backgroundColor: colors.inset }]}>
                        <AnimatedBar
                          percent={cat.percentage}
                          color={cat.color}
                          style={styles.catProgressBarFill}
                        />
                      </View>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          )}
        </FadeSlideIn>
      </View>

      <AddTransactionModal
        visible={addTxVisible}
        onClose={() => setAddTxVisible(false)}
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
    paddingVertical: 12,
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
  viewToggle: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
    gap: 2,
    borderWidth: 1,
  },
  toggleBtn: {
    minHeight: 34,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 12,
    borderWidth: 1,
  },
  monthArrow: {
    padding: 6,
    minHeight: 36,
    minWidth: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthTitleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  monthTitleText: {
    fontSize: 15,
    fontWeight: 'bold',
    textTransform: 'capitalize',
  },
  summaryBar: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  summaryCol: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  summaryVal: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 2,
  },
  searchRow: {
    marginBottom: 10,
  },
  searchInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    gap: 8,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  filterChipsRow: {
    flexGrow: 0,
    minHeight: 46,
    marginBottom: 8,
  },
  filterChipsContent: {
    alignItems: 'center',
    paddingVertical: 2,
    paddingRight: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginRight: 8,
    borderWidth: 1,
    minHeight: Layout.minTouchHeight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  accountChipsRow: {
    flexGrow: 0,
    minHeight: 46,
    marginBottom: 8,
  },
  accountChipsContent: {
    alignItems: 'center',
    paddingVertical: 2,
    paddingRight: 8,
  },
  accountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginRight: 8,
    borderWidth: 1,
    minHeight: Layout.minTouchHeight,
    justifyContent: 'center',
  },
  accountChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  accountChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  activeFilterBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
    borderWidth: 1,
  },
  activeFilterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activeFilterText: {
    fontSize: 13,
  },
  clearFilterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  clearFilterText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  list: {
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 30,
  },
  chartCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
  },
  chartTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  emptyChartText: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 10,
  },
  comparisonBarContainer: {
    gap: 12,
  },
  comparisonBarRow: {
    gap: 4,
  },
  compBarLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  compBarBg: {
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
  },
  compBarFill: {
    height: '100%',
    borderRadius: 6,
  },
  compBarVal: {
    fontSize: 13,
    fontWeight: 'bold',
    alignSelf: 'flex-end',
    marginTop: 2,
  },
  catStatRow: {
    marginBottom: 12,
  },
  catStatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  catStatLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  catStatDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  catStatName: {
    fontSize: 13,
    fontWeight: '500',
  },
  catStatRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  catStatAmount: {
    fontSize: 13,
    fontWeight: '600',
  },
  catStatPercent: {
    fontSize: 13,
  },
  catProgressBarBg: {
    height: 7,
    borderRadius: 4,
    overflow: 'hidden',
  },
  catProgressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
});
