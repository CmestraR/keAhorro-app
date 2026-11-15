import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Account } from '../../types/finance';
import { useFinancial } from '../../context/FinancialContext';
import { useAppTheme } from '../../context/ThemeContext';
import { formatCurrency } from '../../utils/formatters';
import { alpha } from '../common/Theme';
import { CustomIcon } from '../common/CustomIcon';
import { Text } from '../common/AppText';
import { TouchableOpacity } from '../common/Touchable';

interface AccountMiniCardProps {
  account: Account;
  onPress?: () => void;
  onPayDebt?: () => void;
}

export const MINI_CARD_WIDTH = 158;

/**
 * Versión compacta de una cuenta (logo + saldo) para carrusel horizontal.
 */
export const AccountMiniCard: React.FC<AccountMiniCardProps> = ({ account, onPress, onPayDebt }) => {
  const { currency, isBalanceHidden } = useFinancial();
  const { colors } = useAppTheme();

  const isDebt = account.type === 'debt';
  const debtOwed = Math.abs(account.balance);

  const balanceText = isBalanceHidden
    ? '••••••'
    : isDebt
    ? debtOwed > 0
      ? `-${formatCurrency(debtOwed, currency)}`
      : '$0 (Al día)'
    : formatCurrency(account.balance, currency);

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
      activeOpacity={0.8}
    >
      <View style={styles.topRow}>
        <View style={[styles.iconBox, { backgroundColor: alpha(account.color || colors.primary, 0.16) }]}>
          <CustomIcon
            name={account.icon || (isDebt ? 'Receipt' : 'Landmark')}
            size={16}
            color={account.color || colors.primary}
          />
        </View>
        {isDebt && onPayDebt && debtOwed > 0 && (
          <TouchableOpacity
            style={[styles.payBtn, { backgroundColor: colors.success }]}
            onPress={onPayDebt}
            activeOpacity={0.8}
          >
            <Text style={styles.payBtnText}>Abonar</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={[styles.name, { color: colors.textSecondary }]} numberOfLines={1}>
        {account.name}
      </Text>
      <Text
        style={[
          styles.balance,
          {
            color: isDebt
              ? debtOwed > 0
                ? colors.danger
                : colors.success
              : colors.successLight,
          },
        ]}
        numberOfLines={1}
      >
        {balanceText}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    width: MINI_CARD_WIDTH,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  payBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  payBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  name: {
    fontSize: 13,
    fontWeight: '600',
  },
  balance: {
    fontSize: 15,
    fontWeight: 'bold',
    marginTop: 2,
  },
});

