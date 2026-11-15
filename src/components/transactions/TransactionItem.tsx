import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Transaction } from '../../types/finance';
import { useFinancial } from '../../context/FinancialContext';
import { useAlert } from '../../context/AlertContext';
import { useAppTheme } from '../../context/ThemeContext';
import { formatCurrency, formatRelativeDate } from '../../utils/formatters';
import { alpha } from '../common/Theme';
import { CustomIcon } from '../common/CustomIcon';
import { Text } from '../common/AppText';
import { TouchableOpacity } from '../common/Touchable';

interface TransactionItemProps {
  transaction: Transaction;
  onPress?: () => void;
  /** Formato compacto (Home): icono, descripción, fecha corta y monto. */
  compact?: boolean;
}

export const TransactionItem: React.FC<TransactionItemProps> = ({ transaction, onPress, compact = false }) => {
  const { categories, accounts, creditCards, deleteTransaction, currency } = useFinancial();
  const { showConfirm, showSuccess } = useAlert();
  const { colors } = useAppTheme();

  const category = categories.find((c) => c.id === transaction.categoryId);
  const account = accounts.find((a) => a.id === transaction.accountId);
  const toAccount = accounts.find((a) => a.id === transaction.toAccountId);
  const card = creditCards.find((c) => c.id === transaction.cardId);

  const getAccountLabel = () => {
    if (transaction.type === 'transfer') {
      return `${account?.name || 'Cuenta'} → ${toAccount?.name || 'Cuenta'}`;
    }
    if (transaction.type === 'card_purchase' || transaction.cardId) {
      const notes = transaction.notes ? ` (${transaction.notes})` : '';
      return `${card?.name || 'Tarjeta'}${notes}`;
    }
    if (transaction.type === 'card_payment') {
      return `Pago ${card?.name || 'Tarjeta'} desde ${account?.name || 'Cuenta'}`;
    }
    return account?.name || 'Efectivo';
  };

  const getAmountColor = () => {
    switch (transaction.type) {
      case 'income':
        return colors.success;
      case 'expense':
        return colors.danger;
      case 'card_purchase':
        return colors.primaryLight;
      case 'transfer':
        return colors.info;
      case 'card_payment':
        return colors.warning;
      default:
        return colors.textPrimary;
    }
  };

  const getAmountPrefix = () => {
    switch (transaction.type) {
      case 'income':
        return '+';
      case 'expense':
      case 'card_purchase':
      case 'card_payment':
        return '-';
      case 'transfer':
        return '⇄ ';
      default:
        return '';
    }
  };

  const handleLongPress = () => {
    showConfirm(
      'Eliminar Transacción',
      `¿Deseas eliminar "${transaction.description}"? El saldo se actualizará automáticamente.`,
      async () => {
        await deleteTransaction(transaction.id);
        showSuccess('Transacción Eliminada', 'El movimiento ha sido eliminado con éxito.');
      },
      'Eliminar',
      'Cancelar',
      true
    );
  };

  const hasGmf = !!transaction.gmfAmount && transaction.gmfAmount > 0;
  const catColor = category?.color || colors.primary;

  return (
    <TouchableOpacity
      style={[
        styles.container,
        compact && styles.containerCompact,
        {
          backgroundColor: colors.surfaceCard,
          borderColor: colors.border,
        },
      ]}
      onPress={onPress}
      onLongPress={handleLongPress}
      activeOpacity={0.75}
    >
      {/* Icono de Categoría */}
      <View
        style={[
          styles.iconContainer,
          { backgroundColor: alpha(catColor, 0.16) },
        ]}
      >
        <CustomIcon
          name={category?.icon || 'CircleHelp'}
          size={18}
          color={catColor}
        />
      </View>

      {/* Contenido Principal en Filas Estructuradas */}
      <View style={styles.contentContainer}>
        {/* Fila 1: Descripción Principal & Monto Principal (Predominantes) */}
        <View style={styles.row}>
          <Text style={[styles.description, { color: colors.textPrimary }]} numberOfLines={1}>
            {transaction.description}
          </Text>
          <Text style={[styles.amount, { color: getAmountColor() }]}>
            {getAmountPrefix()}
            {formatCurrency(transaction.amount, currency)}
          </Text>
        </View>

        {/* Fila 2 (Opcional): 4x1000 en su propia línea */}
        {hasGmf && !compact && (
          <View style={styles.gmfRow}>
            <View
              style={[
                styles.gmfPill,
                {
                  backgroundColor: colors.dangerBg,
                  borderColor: alpha(colors.danger, 0.3),
                },
              ]}
            >
              <Text style={[styles.gmfPillText, { color: colors.dangerLight }]}>4x1000</Text>
            </View>
            <Text style={[styles.gmfAmountText, { color: colors.dangerLight }]}>
              -{formatCurrency(transaction.gmfAmount!, currency)}
            </Text>
          </View>
        )}

        {/* Fila 3: Cuenta & Fecha */}
        <View style={styles.row}>
          {!compact ? (
            <Text style={[styles.accountText, { color: colors.textSecondary }]} numberOfLines={1}>
              {getAccountLabel()}
            </Text>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <Text style={[styles.dateText, { color: colors.textMuted }]}>
            {formatRelativeDate(transaction.date)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
  },
  containerCompact: {
    paddingVertical: 10,
    marginBottom: 6,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    gap: 3,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  description: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  amount: {
    fontSize: 15,
    fontWeight: '700',
  },
  gmfRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 1,
  },
  gmfPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 0.5,
  },
  gmfPillText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  gmfAmountText: {
    fontSize: 13,
    fontWeight: '600',
  },
  accountText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
    marginRight: 8,
  },
  dateText: {
    fontSize: 13,
  },
});
