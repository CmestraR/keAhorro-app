import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useFinancial } from '../context/FinancialContext';
import { useAppTheme } from '../context/ThemeContext';
import { formatCurrency } from '../utils/formatters';
import { Layout, alpha } from '../components/common/Theme';
import { CustomIcon } from '../components/common/CustomIcon';
import { Text } from '../components/common/AppText';
import { TouchableOpacity } from '../components/common/Touchable';
import { Account } from '../types/finance';
import { AccountCard } from '../components/accounts/AccountCard';
import { AddAccountModal } from '../components/accounts/AddAccountModal';
import { AddTransactionModal } from '../components/transactions/AddTransactionModal';
import { PayDebtModal } from '../components/accounts/PayDebtModal';

export const AccountsScreen: React.FC = () => {
  const { accounts, totalBankBalance, totalOtherDebts, currency } = useFinancial();
  const { colors } = useAppTheme();
  const [addAccountModalVisible, setAddAccountModalVisible] = useState(false);
  const [selectedAccountToEdit, setSelectedAccountToEdit] = useState<Account | null>(null);
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [payDebtModalVisible, setPayDebtModalVisible] = useState(false);
  const [selectedDebtAccountToPay, setSelectedDebtAccountToPay] = useState<Account | null>(null);

  const handleOpenCreate = () => {
    setSelectedAccountToEdit(null);
    setAddAccountModalVisible(true);
  };

  const handleOpenEdit = (acc: Account) => {
    setSelectedAccountToEdit(acc);
    setAddAccountModalVisible(true);
  };

  const handleOpenPayDebt = (acc: Account) => {
    setSelectedDebtAccountToPay(acc);
    setPayDebtModalVisible(true);
  };

  const liquidAccounts = accounts.filter((a) => a.type !== 'debt');
  const debtAccounts = accounts.filter((a) => a.type === 'debt');

  return (
    <View style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: Layout.bottomNavSpace }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleCol}>
            <Text style={[styles.tag, { color: colors.primaryLight }]}>MIS FONDOS & DEUDAS</Text>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
              Cuentas & Deudas
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            onPress={handleOpenCreate}
            activeOpacity={0.8}
          >
            <CustomIcon name="Plus" size={16} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Nueva</Text>
          </TouchableOpacity>
        </View>

        {/* Resumen Total */}
        <View
          style={[
            styles.heroCard,
            { backgroundColor: colors.surfaceCard, borderColor: colors.border },
          ]}
        >
          <View style={styles.heroRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroLabel, { color: colors.textMuted }]}>
                SALDO DISPONIBLE EN CUENTAS
              </Text>
              <Text style={[styles.heroAmount, { color: colors.textPrimary }]}>
                {formatCurrency(totalBankBalance, currency)}
              </Text>
            </View>
            {totalOtherDebts > 0 && (
              <View style={styles.heroDebtCol}>
                <Text style={[styles.heroDebtLabel, { color: colors.dangerLight }]}>
                  DEUDAS ACTIVAS
                </Text>
                <Text style={[styles.heroDebtAmount, { color: colors.danger }]}>
                  -{formatCurrency(totalOtherDebts, currency)}
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.heroSub, { color: colors.textSecondary }]}>
            {liquidAccounts.length} cuentas disponibles • {debtAccounts.length} deudas activas
          </Text>

          <TouchableOpacity
            style={[
              styles.transferBtn,
              { backgroundColor: colors.surfaceElevated, borderColor: colors.borderLight },
            ]}
            onPress={() => setTransferModalVisible(true)}
          >
            <CustomIcon name="Repeat" size={16} color={colors.primaryLight} />
            <Text style={[styles.transferBtnText, { color: colors.primaryLight }]}>
              Transferir entre Cuentas
            </Text>
          </TouchableOpacity>
        </View>

        {/* Sección: Cuentas y Billeteras Líquidas */}
        <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>
          Cuentas & Billeteras ({liquidAccounts.length})
        </Text>

        {liquidAccounts.length === 0 ? (
          <View
            style={[
              styles.emptyState,
              { backgroundColor: colors.surfaceCard, borderColor: colors.border },
            ]}
          >
            <CustomIcon name="Landmark" size={32} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              Sin cuentas bancarias
            </Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Agrega cuentas de ahorros, corriente, efectivo o billeteras.
            </Text>
          </View>
        ) : (
          liquidAccounts.map((acc) => (
            <AccountCard
              key={acc.id}
              account={acc}
              onPress={() => handleOpenEdit(acc)}
            />
          ))
        )}

        {/* Sección: Deudas y Cuentas por Pagar (Fiados, Cafetería, etc.) */}
        <View style={styles.debtHeaderRow}>
          <Text style={[styles.sectionHeading, { color: colors.dangerLight, marginTop: 16 }]}>
            Deudas & Cuentas por Pagar ({debtAccounts.length})
          </Text>
          {debtAccounts.length > 0 && (
            <View
              style={[
                styles.debtTotalBadge,
                {
                  backgroundColor: colors.dangerBg,
                  borderColor: alpha(colors.danger, 0.3),
                },
              ]}
            >
              <Text style={[styles.debtTotalBadgeText, { color: colors.dangerLight }]}>
                Total: -{formatCurrency(totalOtherDebts, currency)}
              </Text>
            </View>
          )}
        </View>

        {debtAccounts.length === 0 ? (
          <View
            style={[
              styles.emptyState,
              { backgroundColor: colors.debtSurface, borderColor: colors.border },
            ]}
          >
            <CustomIcon name="Receipt" size={32} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              Sin deudas pendientes
            </Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              ¿Consumes en la cafetería o tienes fiados? Crea una cuenta de deuda para registrar consumos y pagarla a fin de mes.
            </Text>
          </View>
        ) : (
          debtAccounts.map((acc) => (
            <AccountCard
              key={acc.id}
              account={acc}
              onPress={() => handleOpenEdit(acc)}
              onPayDebt={() => handleOpenPayDebt(acc)}
            />
          ))
        )}
      </ScrollView>

      {/* Modales */}
      <AddAccountModal
        visible={addAccountModalVisible}
        accountToEdit={selectedAccountToEdit}
        onClose={() => {
          setAddAccountModalVisible(false);
          setSelectedAccountToEdit(null);
        }}
      />

      <AddTransactionModal
        visible={transferModalVisible}
        defaultType="transfer"
        onClose={() => setTransferModalVisible(false)}
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
  headerTitleCol: {
    flex: 1,
    marginRight: 10,
  },
  tag: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  title: {
    fontSize: 21,
    fontWeight: 'bold',
    marginTop: 2,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    minHeight: Layout.minTouchHeight,
    borderRadius: 10,
    gap: 5,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  heroCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  heroAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 4,
  },
  heroDebtCol: {
    alignItems: 'flex-end',
  },
  heroDebtLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  heroDebtAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 2,
  },
  heroSub: {
    fontSize: 13,
    marginTop: 4,
    marginBottom: 14,
  },
  transferBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: Layout.minTouchHeight,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
    borderWidth: 1,
  },
  transferBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 10,
    marginTop: 4,
  },
  debtHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  debtTotalBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  debtTotalBadgeText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  emptyState: {
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    marginTop: 8,
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
});
