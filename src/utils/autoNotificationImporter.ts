import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Account,
  CardInstallment,
  CardPurchase,
  Category,
  CreditCard,
  Transaction,
} from '../types/finance';
import {
  guessCategoryForNotification,
  parseBankNotification,
  ParsedBankMessage,
} from './bankNotificationParser';
import { calculateMonthlyQuota, generateAmortizationSchedule } from './financialMath';
import { formatCurrency } from './formatters';
import { NotificationService } from './notificationService';

const AUTO_NOTIF_HISTORY_KEY = 'keahorro_auto_notifications_history_v1';

export interface AutoImportedNotificationLog {
  id: string;
  recordId: string;
  recordKind: 'transaction' | 'purchase';
  bankName: string;
  type: ParsedBankMessage['type'];
  amount: number;
  description: string;
  date: string;
  targetName: string;
  rawText: string;
  createdAt: string;
}

export async function getAutoImportedHistory(): Promise<AutoImportedNotificationLog[]> {
  try {
    const raw = await AsyncStorage.getItem(AUTO_NOTIF_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveToAutoImportedHistory(entry: AutoImportedNotificationLog): Promise<void> {
  try {
    const existing = await getAutoImportedHistory();
    const updated = [entry, ...existing.filter((e) => e.id !== entry.id)].slice(0, 30);
    await AsyncStorage.setItem(AUTO_NOTIF_HISTORY_KEY, JSON.stringify(updated));
  } catch {}
}

export async function removeAutoImportedHistoryEntry(id: string): Promise<void> {
  try {
    const existing = await getAutoImportedHistory();
    const updated = existing.filter((e) => e.id !== id);
    await AsyncStorage.setItem(AUTO_NOTIF_HISTORY_KEY, JSON.stringify(updated));
  } catch {}
}

/**
 * Procesa una notificación bancaria entrante (Bancolombia, RappiCard, Nequi, Nu, etc.),
 * guarda automáticamente el movimiento (Gasto, Ingreso, Transferencia o Compra con Tarjeta de Crédito)
 * y envía una notificación push confirmando que fue agregado a keAhorro.
 */
export async function processAndAutoSaveBankNotification(params: {
  rawText: string;
  accounts: Account[];
  creditCards: CreditCard[];
  categories: Category[];
  currency: string;
  addTransaction: (tx: Transaction) => Promise<void>;
  addCardPurchase: (purchase: CardPurchase, installments: CardInstallment[]) => Promise<void>;
  addAccount?: (account: Account) => Promise<void>;
  addCreditCard?: (card: CreditCard) => Promise<void>;
  sendPushConfirmation?: boolean;
  skipDuplicateCheck?: boolean;
}): Promise<{
  ok: boolean;
  message: string;
  logEntry?: AutoImportedNotificationLog;
  parsed?: ParsedBankMessage;
}> {
  const {
    rawText,
    accounts,
    creditCards,
    categories,
    currency,
    addTransaction,
    addCardPurchase,
    addAccount,
    addCreditCard,
    sendPushConfirmation = true,
    skipDuplicateCheck = false,
  } = params;

  const parsed = parseBankNotification(rawText);
  if (!parsed || parsed.amount <= 0) {
    return {
      ok: false,
      message: 'El mensaje no contiene un monto bancario válido para registrar.',
    };
  }

  // Evitar duplicados si la misma notificación llega dos veces en los últimos 5 minutos
  if (!skipDuplicateCheck) {
    const history = await getAutoImportedHistory();
    const nowMs = Date.now();
    const isDuplicate = history.some((h) => {
      const diffMs = nowMs - new Date(h.createdAt).getTime();
      return h.rawText === parsed.rawText && diffMs < 5 * 60 * 1000;
    });
    if (isDuplicate) {
      return {
        ok: false,
        message: 'Esta notificación ya fue registrada recientemente.',
        parsed,
      };
    }
  }

  const nowIso = new Date().toISOString();
  const txDate = parsed.date || nowIso.split('T')[0];
  const categoryId = guessCategoryForNotification(parsed, categories);

  // CASO 1: Compra con Tarjeta de Crédito (RappiCard, Nu, Bancolombia T.Cred, etc.)
  if (parsed.type === 'card_purchase') {
    const bankLower = parsed.bankName.toLowerCase();

    // 1. Buscar por últimos 4 dígitos
    let targetCard = parsed.lastFourDigits
      ? creditCards.find((c) => c.lastFourDigits === parsed.lastFourDigits)
      : undefined;

    // 2. Buscar por entidad emisora (RappiCard / Nu / Bancolombia / Davivienda / etc.)
    if (!targetCard) {
      targetCard = creditCards.find(
        (c) =>
          c.name.toLowerCase().includes(bankLower) ||
          c.bankName.toLowerCase().includes(bankLower) ||
          (bankLower.includes('rappi') &&
            (c.issuerId === 'rappicard' ||
              c.name.toLowerCase().includes('rappi') ||
              c.bankName.toLowerCase().includes('rappi')))
      );
    }

    // 3. Si es una tarjeta específica (ej. RappiCard) que el usuario aún no había creado y tenemos addCreditCard, o si no tiene tarjetas aún
    if (!targetCard && addCreditCard && (bankLower.includes('rappi') || creditCards.length === 0)) {
      const isRappi = bankLower.includes('rappi');
      const isNu = bankLower.includes('nu');
      const newCardId = `card-auto-${Date.now()}`;
      const autoCard: CreditCard = {
        id: newCardId,
        name: isRappi ? 'RappiCard' : isNu ? 'Nu Crédito' : `Tarjeta ${parsed.bankName}`,
        bankName: isRappi ? 'RappiPay / Davivienda' : parsed.bankName,
        cardBrand: isRappi ? 'visa' : 'mastercard',
        issuerId: isRappi ? 'rappicard' : isNu ? 'nu' : bankLower.includes('bancolombia') ? 'bancolombia' : 'generic',
        lastFourDigits: parsed.lastFourDigits || '9012',
        creditLimit: 5000000,
        availableLimit: 5000000,
        cutOffDay: 15,
        paymentDueDay: 5,
        interestRateMonthly: 2.1,
        handlingFee: 0,
        colorGradient: isRappi
          ? ['#1E293B', '#0F172A']
          : isNu
          ? ['#7E22CE', '#4C1D95']
          : ['#312E81', '#1E1B4B'],
        currency,
        isArchived: false,
        createdAt: nowIso,
      };
      await addCreditCard(autoCard);
      targetCard = autoCard;
    }

    // 4. Fallback a la primera tarjeta disponible
    if (!targetCard && creditCards.length > 0) {
      targetCard = creditCards[0];
    }

    if (targetCard) {
      const installmentsTotal = Math.max(1, parsed.installments || 1);
      const rate = installmentsTotal === 1 ? 0 : targetCard.interestRateMonthly || 0;
      const monthlyQuota = calculateMonthlyQuota(parsed.amount, rate, installmentsTotal);
      const purchaseId = `purch-notif-${Date.now()}`;

      const newPurchase: CardPurchase = {
        id: purchaseId,
        cardId: targetCard.id,
        description: parsed.description,
        categoryId,
        amount: parsed.amount,
        installmentsTotal,
        installmentsPaid: 0,
        monthlyInstallmentAmount: monthlyQuota,
        interestRateMonthly: rate,
        firstInstallmentDate: txDate,
        status: 'active',
        createdAt: txDate,
      };

      const startDate = new Date(txDate + 'T12:00:00');
      const schedule = generateAmortizationSchedule(
        purchaseId,
        parsed.amount,
        rate,
        installmentsTotal,
        startDate,
        0
      );

      await addCardPurchase(newPurchase, schedule);

      const formattedAmount = formatCurrency(parsed.amount, currency);
      const summaryMsg = `Compra con ${targetCard.name} por ${formattedAmount} en ${parsed.description} (${txDate})`;

      const logEntry: AutoImportedNotificationLog = {
        id: `autolog-${Date.now()}`,
        recordId: purchaseId,
        recordKind: 'purchase',
        bankName: parsed.bankName,
        type: 'card_purchase',
        amount: parsed.amount,
        description: parsed.description,
        date: txDate,
        targetName: targetCard.name,
        rawText: parsed.rawText,
        createdAt: nowIso,
      };

      await saveToAutoImportedHistory(logEntry);

      if (sendPushConfirmation) {
        await NotificationService.sendImmediateNotification(
          `💳 Compra Registrada (${targetCard.name})`,
          `Se agregó automáticamente: ${parsed.description} por ${formattedAmount} (${installmentsTotal} cuota${installmentsTotal > 1 ? 's' : ''}).`,
          { isKeAhorroAutoSaved: true, recordId: purchaseId, recordKind: 'purchase' }
        );
      }

      return {
        ok: true,
        message: summaryMsg,
        logEntry,
        parsed,
      };
    }
  }

  // CASO 2: Movimiento en Cuenta Bancaria / Billetera (Gasto, Compra Débito, Transferencia Recibida / Nómina o Transferencia Enviada)
  const bankLower = parsed.bankName.toLowerCase();
  let targetAccount = accounts.find(
    (a) =>
      a.type !== 'debt' &&
      (a.name.toLowerCase().includes(bankLower) ||
        a.bankName.toLowerCase().includes(bankLower) ||
        (parsed.lastFourDigits && a.name.includes(parsed.lastFourDigits)))
  );

  if (!targetAccount) {
    targetAccount = accounts.find((a) => a.type !== 'debt') || accounts[0];
  }

  // Si el usuario aún no tiene ninguna cuenta creada, crear automáticamente la cuenta del banco detectado
  if (!targetAccount && addAccount) {
    const isWallet = bankLower.includes('nequi') || bankLower.includes('daviplata');
    const newAcc: Account = {
      id: `acc-auto-${Date.now()}`,
      name:
        parsed.bankName === 'Banco'
          ? 'Cuenta Principal'
          : isWallet
          ? parsed.bankName
          : `Ahorros ${parsed.bankName}`,
      type: isWallet ? 'wallet' : 'savings',
      bankName: parsed.bankName,
      balance: 0,
      initialBalance: 0,
      currency,
      color: bankLower.includes('bancolombia')
        ? '#F59E0B'
        : bankLower.includes('nequi')
        ? '#EC4899'
        : '#10B981',
      icon: isWallet ? 'Smartphone' : 'Landmark',
      includeInTotal: true,
      hasGmf4x1000: false,
      isArchived: false,
      createdAt: nowIso,
    };
    await addAccount(newAcc);
    targetAccount = newAcc;
  }

  if (!targetAccount) {
    return {
      ok: false,
      message: 'No se encontró una cuenta activa para registrar la notificación.',
      parsed,
    };
  }

  const txType: 'income' | 'expense' = parsed.type === 'income' ? 'income' : 'expense';
  const gmfAmount =
    txType === 'expense' && targetAccount.hasGmf4x1000
      ? Math.round(parsed.amount * 0.004)
      : undefined;

  const txId = `tx-notif-${Date.now()}`;
  const newTx: Transaction = {
    id: txId,
    accountId: targetAccount.id,
    type: txType,
    amount: parsed.amount,
    categoryId,
    description: parsed.description,
    notes: `Registrado automáticamente desde notificación de ${parsed.bankName}${
      parsed.time ? ` (${parsed.time})` : ''
    }`,
    date: txDate,
    gmfAmount,
    createdAt: nowIso,
  };

  await addTransaction(newTx);

  const formattedAmount = formatCurrency(parsed.amount, currency);
  const actionLabel = txType === 'income' ? 'Ingreso abonado' : 'Gasto registrado';
  const summaryMsg = `${actionLabel}: ${parsed.description} por ${formattedAmount} en ${targetAccount.name} (${txDate})`;

  const logEntry: AutoImportedNotificationLog = {
    id: `autolog-${Date.now()}`,
    recordId: txId,
    recordKind: 'transaction',
    bankName: parsed.bankName,
    type: txType,
    amount: parsed.amount,
    description: parsed.description,
    date: txDate,
    targetName: targetAccount.name,
    rawText: parsed.rawText,
    createdAt: nowIso,
  };

  await saveToAutoImportedHistory(logEntry);

  if (sendPushConfirmation) {
    const notifTitle =
      txType === 'income'
        ? `💰 Ingreso Agregado (${parsed.bankName})`
        : `✅ Movimiento Agregado (${parsed.bankName})`;
    const notifBody =
      txType === 'income'
        ? `Se abonó automáticamente ${formattedAmount} (${parsed.description}) en ${targetAccount.name}.`
        : `Se registró automáticamente ${parsed.description} por ${formattedAmount} en ${targetAccount.name} (${txDate}).`;

    await NotificationService.sendImmediateNotification(notifTitle, notifBody, {
      isKeAhorroAutoSaved: true,
      recordId: txId,
      recordKind: 'transaction',
    });
  }

  return {
    ok: true,
    message: summaryMsg,
    logEntry,
    parsed,
  };
}

