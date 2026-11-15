import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Account } from '../../types/finance';
import { useFinancial } from '../../context/FinancialContext';
import { useAlert } from '../../context/AlertContext';
import { useAppTheme } from '../../context/ThemeContext';
import { formatCurrency } from '../../utils/formatters';
import { alpha } from '../common/Theme';
import { CustomIcon } from '../common/CustomIcon';
import { Text } from '../common/AppText';
import { TouchableOpacity } from '../common/Touchable';

interface AccountCardProps {
  account: Account;
  onPress?: () => void;
  onPayDebt?: () => void;
}

export const AccountCard: React.FC<AccountCardProps> = ({
  account,
  onPress,
  onPayDebt,
}) => {
  const { deleteAccount, currency, isBalanceHidden } = useFinancial();
  const { showConfirm, showSuccess } = useAlert();
  const { colors } = useAppTheme();

  const handleLongPress = () => {
    showConfirm(
      'Eliminar Cuenta',
      `¿Deseas eliminar "${account.name}" y todos sus registros asociados?`,
      async () => {
        await deleteAccount(account.id);
        showSuccess('Cuenta Eliminada', `La cuenta ${account.name} ha sido eliminada.`);
      },
      'Eliminar',
      'Cancelar',
      true
    );
  };

  const getTypeName = (type: Account['type']) => {
    switch (type) {
      case 'savings':
        return 'Ahorros';
      case 'checking':
        return 'Corriente';
      case 'wallet':
        return 'Billetera';
      case 'cash':
        return 'Efectivo';
      case 'investment':
        return 'Inversión';
      case 'debt':
        return 'Deuda / Fiado';
      default:
        return 'Cuenta';
    }
  };

  const isDebt = account.type === 'debt';
  const debtOwed = Math.abs(account.balance);

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: isDebt ? colors.debtSurface : colors.surfaceCard,
          borderColor: isDebt ? alpha(colors.danger, 0.35) : colors.border,
        },
      ]}
      onPress={onPress}
      onLongPress={handleLongPress}
      activeOpacity={0.8}
    >
      <View style={styles.topRow}>
        <View style={[styles.iconBox, { backgroundColor: alpha(account.color || colors.primary, 0.16) }]}>
          <CustomIcon
            name={account.icon || (isDebt ? 'Receipt' : 'Landmark')}
            size={18}
            color={account.color || colors.primary}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {isDebt && (
            <View
              style={[
                styles.typeBadge,
                {
                  backgroundColor: colors.dangerBg,
                  borderColor: alpha(colors.danger, 0.4),
                  borderWidth: 1,
                },
              ]}
            >
              <Text style={[styles.debtBadgeText, { color: colors.danger }]}>DEUDA</Text>
            </View>
          )}
          {account.hasGmf4x1000 && (
            <View
              style={[
                styles.typeBadge,
                {
                  backgroundColor: colors.dangerBg,
                  borderColor: alpha(colors.danger, 0.4),
                  borderWidth: 1,
                },
              ]}
            >
              <Text style={[styles.gmfBadgeText, { color: colors.danger }]}>4x1000</Text>
            </View>
          )}
          {account.includeInTotal === false && !isDebt && (
            <View
              style={[
                styles.typeBadge,
                {
                  backgroundColor: colors.warningBg,
                  borderColor: colors.warning,
                  borderWidth: 1,
                },
              ]}
            >
              <Text style={[styles.separatedBadgeText, { color: colors.warning }]}>Separado</Text>
            </View>
          )}
          <View style={[styles.typeBadge, { backgroundColor: colors.surfaceElevated }]}>
            <Text style={[styles.typeBadgeText, { color: colors.textSecondary }]}>
              {getTypeName(account.type)}
            </Text>
          </View>
        </View>
      </View>

      <Text style={[styles.accountName, { color: colors.textPrimary }]} numberOfLines={1}>
        {account.name}
      </Text>
      <Text style={[styles.bankName, { color: colors.textSecondary }]}>
        {account.bankName}
        {!isDebt && !account.hasGmf4x1000 ? ' • Exenta de 4x1000' : ''}
      </Text>

      <View style={[styles.balanceSection, { borderTopColor: colors.divider }]}>
        <View style={styles.balanceRow}>
          <View>
            <Text style={[styles.balanceLabel, { color: colors.textMuted }]}>
              {isDebt ? 'Deuda Pendiente' : 'Saldo Disponible'}
            </Text>
            <Text
              style={[
                styles.balanceValue,
                {
                  color: isDebt
                    ? debtOwed > 0
                      ? colors.danger
                      : colors.success
                    : colors.successLight,
                },
              ]}
            >
              {isBalanceHidden
                ? '••••••'
                : isDebt
                ? debtOwed > 0
                  ? `-${formatCurrency(debtOwed, currency)}`
                  : '$0 (Al día)'
                : formatCurrency(account.balance, currency)}
            </Text>
          </View>

          {/* Botón de Pagar/Abonar si es cuenta de deuda y debe dinero */}
          {isDebt && onPayDebt && (
            <TouchableOpacity
              style={[styles.payDebtBtn, { backgroundColor: colors.success }]}
              onPress={onPayDebt}
              activeOpacity={0.8}
            >
              <CustomIcon name="CreditCard" size={14} color="#FFFFFF" />
              <Text style={styles.payDebtBtnText}>Pagar / Abonar</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 13,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  debtBadgeText: {
    fontWeight: 'bold',
    fontSize: 13,
  },
  gmfBadgeText: {
    fontWeight: 'bold',
    fontSize: 13,
  },
  separatedBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  accountName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  bankName: {
    fontSize: 13,
    marginTop: 2,
    marginBottom: 12,
  },
  balanceSection: {
    borderTopWidth: 1,
    paddingTop: 10,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 13,
  },
  balanceValue: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 2,
  },
  payDebtBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  payDebtBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
});
