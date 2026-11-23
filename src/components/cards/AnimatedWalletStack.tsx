import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
  PanResponder,
  Modal,
  Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CreditCard, CardStatementSummary, CardPurchase } from '../../types/finance';
import { formatCurrency } from '../../utils/formatters';
import { useFinancial } from '../../context/FinancialContext';
import { useAppTheme } from '../../context/ThemeContext';
import { Theme, Layout, alpha } from '../common/Theme';
import { CustomIcon } from '../common/CustomIcon';
import { Text } from '../common/AppText';
import { TouchableOpacity } from '../common/Touchable';
import { AnimatedBar } from '../common/AnimatedBar';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 32;
const CARD_HEIGHT = 208;

interface AnimatedRollingNumberProps {
  value: number;
  currency: string;
  isHidden?: boolean;
  style?: any;
}

/**
 * Contador numérico animado estilo Monobank / Wallet (como en el video de referencia)
 * que interpola suavemente de la cifra anterior a la nueva cuando se cambia de tarjeta.
 */
const AnimatedRollingNumber: React.FC<AnimatedRollingNumberProps> = ({
  value,
  currency,
  isHidden,
  style,
}) => {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValueRef = useRef(value);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const startValue = previousValueRef.current;
    const endValue = value;
    previousValueRef.current = value;

    if (startValue === endValue) {
      setDisplayValue(endValue);
      return;
    }

    const duration = 450;
    const startTime = Date.now();

    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Curva easeOutCubic para que frene suavemente al llegar al número final
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startValue + (endValue - startValue) * eased;
      setDisplayValue(Math.round(current));

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        setDisplayValue(endValue);
      }
    };

    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
    }
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [value]);

  if (isHidden) {
    return <Text style={style}>••••••</Text>;
  }

  return <Text style={style}>{formatCurrency(displayValue, currency)}</Text>;
};

interface RealisticCardFaceProps {
  card: CreditCard;
  statement?: CardStatementSummary;
  isBalanceHidden?: boolean;
  isStackPreview?: boolean;
}

/**
 * Diseño visual realista de tarjeta bancaria inspirado en el video (Monobank / Visa / Mastercard)
 */
const RealisticCardFace: React.FC<RealisticCardFaceProps> = ({
  card,
  statement,
  isBalanceHidden,
  isStackPreview = false,
}) => {
  const gradientColors: [string, string] =
    card.colorGradient && card.colorGradient.length === 2
      ? card.colorGradient
      : (Theme.colors.cardGradients[0] as [string, string]);

  const usedAmount = Math.max(0, card.creditLimit - card.availableLimit);
  const usedPercentage =
    card.creditLimit > 0 ? Math.min(100, Math.max(0, (usedAmount / card.creditLimit) * 100)) : 0;

  const daysToCutOff = statement?.daysToCutOff ?? 0;
  const daysToPayment = statement?.daysToPayment ?? 0;
  const isPaymentUrgent = (statement?.isPaymentOverdue ?? false) || daysToPayment <= 5;

  const prefixDigits =
    card.cardBrand === 'visa'
      ? '4505  7836'
      : card.cardBrand === 'mastercard'
      ? '5495  7381'
      : card.cardBrand === 'amex'
      ? '3759  8214'
      : '4812  9041';

  return (
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.cardGradient, isStackPreview && styles.cardGradientStack]}
    >
      {/* Brillo diagonal sutil estilo tarjeta física */}
      <LinearGradient
        colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.03)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.8, y: 0.9 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />

      {/* Borde interno luminoso */}
      <View style={styles.innerHighlightBorder} pointerEvents="none" />

      {/* Fila Superior: Banco | Nombre de Tarjeta + Logo de Franquicia */}
      <View style={styles.cardTopRow}>
        <View style={styles.bankTitleRow}>
          <Text style={styles.bankNameText} numberOfLines={1}>
            {card.bankName}
          </Text>
          <Text style={styles.bankDivider}>|</Text>
          <Text style={styles.cardSubtitleText} numberOfLines={1}>
            {card.name}
          </Text>
        </View>

        {/* Logo de Franquicia estilo realista (Mastercard círculos / VISA tipográfico) */}
        {card.cardBrand === 'mastercard' ? (
          <View style={styles.mastercardLogoWrap}>
            <View style={styles.mcCircles}>
              <View style={[styles.mcCircle, { backgroundColor: '#EB001B' }]} />
              <View style={[styles.mcCircle, { backgroundColor: '#F79E1B', marginLeft: -10 }]} />
            </View>
            <Text style={styles.mcLabel}>mastercard</Text>
          </View>
        ) : card.cardBrand === 'visa' ? (
          <Text style={styles.visaLogoText}>VISA</Text>
        ) : (
          <View style={styles.genericBrandPill}>
            <Text style={styles.genericBrandText}>{card.cardBrand.toUpperCase()}</Text>
          </View>
        )}
      </View>

      {/* Fila Central: Chip EMV metálico + Ondas Contactless */}
      <View style={styles.chipRow}>
        <View style={styles.emvChip}>
          <View style={styles.emvChipLineH} />
          <View style={styles.emvChipLineV} />
          <View style={styles.emvChipCore} />
        </View>
        <View style={styles.contactlessWrap}>
          <CustomIcon name="Wifi" size={18} color="rgba(255,255,255,0.55)" />
        </View>
      </View>

      {/* Número de Tarjeta estilo grabado */}
      <Text style={styles.embossedNumber}>
        {prefixDigits}  ••••  {card.lastFourDigits || '0000'}
      </Text>

      {/* Fila Inferior: Fechas de Corte y Pago + Barra de Uso */}
      <View style={styles.cardBottomRow}>
        <View style={styles.datesInline}>
          <View style={styles.dateMetaItem}>
            <Text style={styles.dateMetaLabel}>CORTE</Text>
            <Text style={styles.dateMetaValue}>Día {card.cutOffDay}</Text>
          </View>
          <View style={styles.dateMetaItem}>
            <Text style={styles.dateMetaLabel}>PAGO</Text>
            <Text
              style={[
                styles.dateMetaValue,
                isPaymentUrgent && { color: '#FCA5A5', fontWeight: '800' },
              ]}
            >
              Día {card.paymentDueDay}
            </Text>
          </View>
          <View style={styles.dateMetaItem}>
            <Text style={styles.dateMetaLabel}>USO</Text>
            <Text style={styles.dateMetaValue}>
              {isBalanceHidden ? '••%' : `${usedPercentage.toFixed(0)}%`}
            </Text>
          </View>
        </View>

        <View style={styles.miniProgressTrack}>
          <AnimatedBar
            percent={100 - usedPercentage}
            color={usedPercentage > 85 ? '#F43F5E' : usedPercentage > 60 ? '#F59E0B' : '#34D399'}
            style={styles.miniProgressFill}
          />
        </View>
      </View>
    </LinearGradient>
  );
};

interface AnimatedWalletStackProps {
  creditCards: CreditCard[];
  cardStatements: CardStatementSummary[];
  activePurchases: CardPurchase[];
  currency: string;
  onEditCard: (card: CreditCard) => void;
  onDeleteCard: (card: CreditCard) => void;
  onOpenStatement: (card: CreditCard) => void;
  onOpenPay: (card: CreditCard) => void;
  onOpenReconcile: (card: CreditCard) => void;
  onOpenManualStatement: (card: CreditCard, mode?: 'opening_balance' | 'statement') => void;
  onOpenAmortization: (purchase: CardPurchase) => void;
  onOpenAddPurchase: (card: CreditCard) => void;
  onOpenCreateCard: () => void;
  onOpenAIStatement?: (card: CreditCard) => void;
}

export const AnimatedWalletStack: React.FC<AnimatedWalletStackProps> = ({
  creditCards,
  cardStatements,
  activePurchases,
  currency,
  onEditCard,
  onDeleteCard,
  onOpenStatement,
  onOpenPay,
  onOpenReconcile,
  onOpenManualStatement,
  onOpenAmortization,
  onOpenAddPurchase,
  onOpenCreateCard,
  onOpenAIStatement,
}) => {
  const { isBalanceHidden } = useFinancial();
  const { colors } = useAppTheme();

  // Orden de las tarjetas: el primer elemento es la Tarjeta Activa (arriba),
  // y el resto conforman el Mazo Inferior (stack).
  const [orderedIds, setOrderedIds] = useState<string[]>(() =>
    creditCards.map((c) => c.id)
  );
  const [balanceMode, setBalanceMode] = useState<'available' | 'debt' | 'billed'>('available');
  const [contextMenuVisible, setContextMenuVisible] = useState(false);

  // Sincronizar cuando se agregan o eliminan tarjetas
  useEffect(() => {
    setOrderedIds((prev) => {
      const currentIds = creditCards.map((c) => c.id);
      const preserved = prev.filter((id) => currentIds.includes(id));
      const added = currentIds.filter((id) => !preserved.includes(id));
      return [...preserved, ...added];
    });
  }, [creditCards]);

  // Valores animados para el vuelo de la tarjeta seleccionada desde el mazo hacia arriba
  const activeFlyY = useRef(new Animated.Value(0)).current;
  const activeScale = useRef(new Animated.Value(1)).current;
  const activeRotate = useRef(new Animated.Value(0)).current;
  const stackAdvanceAnim = useRef(new Animated.Value(1)).current;
  const ambientPulse = useRef(new Animated.Value(1)).current;

  const orderedCards = useMemo(() => {
    const map = new Map(creditCards.map((c) => [c.id, c]));
    const list = orderedIds.map((id) => map.get(id)).filter(Boolean) as CreditCard[];
    if (list.length !== creditCards.length) {
      return creditCards;
    }
    return list;
  }, [creditCards, orderedIds]);

  const activeCard = orderedCards[0] || creditCards[0];
  const stackCards = orderedCards.slice(1);

  const activeStmt = useMemo(
    () => cardStatements.find((s) => s.cardId === activeCard?.id),
    [cardStatements, activeCard]
  );

  const activeCardPurchases = useMemo(
    () => activePurchases.filter((p) => p.cardId === activeCard?.id),
    [activePurchases, activeCard]
  );

  /**
   * Dispara la animación estilo Monobank / Wallet del video:
   * La tarjeta elegida del mazo inferior sube volando con ligera rotación e impulso,
   * mientras las demás tarjetas del mazo avanzan una posición.
   */
  const selectCardFromStack = (targetCardId: string) => {
    if (!activeCard || targetCardId === activeCard.id) return;

    // 1. Cambiar el orden para que la tarjeta seleccionada pase al puesto 0 (arriba)
    // y la anterior activa pase al final del mazo inferior
    setOrderedIds((prev) => {
      const remaining = prev.filter((id) => id !== targetCardId);
      return [targetCardId, ...remaining];
    });

    // 2. Posicionar inicialmente la nueva tarjeta en la coordenada del mazo inferior
    // con la inclinación dinámica que se ve en el segundo 00:00 del video
    activeFlyY.setValue(240);
    activeScale.setValue(0.86);
    activeRotate.setValue(1);
    stackAdvanceAnim.setValue(0);
    ambientPulse.setValue(0.35);

    // 3. Ejecutar animación de vuelo hacia arriba + reacomodo del mazo inferior
    Animated.parallel([
      Animated.spring(activeFlyY, {
        toValue: 0,
        damping: 16,
        stiffness: 150,
        mass: 0.9,
        useNativeDriver: true,
      }),
      Animated.spring(activeScale, {
        toValue: 1,
        damping: 14,
        stiffness: 160,
        useNativeDriver: true,
      }),
      Animated.timing(activeRotate, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(stackAdvanceAnim, {
        toValue: 1,
        damping: 15,
        stiffness: 140,
        useNativeDriver: true,
      }),
      Animated.timing(ambientPulse, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  };

  // Gestos táctiles (Swipe hacia arriba en el mazo o swipe en la tarjeta activa)
  const stackPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dy) > 12 || Math.abs(gesture.dx) > 18,
        onPanResponderRelease: (_, gesture) => {
          if (stackCards.length === 0) return;
          // Deslizar hacia arriba o hacia los lados trae la tarjeta frontal del mazo
          if (gesture.dy < -20 || Math.abs(gesture.dx) > 35) {
            // En el mazo visual, la tarjeta más frontal es la última en renderizarse o la primera de stackCards
            const frontStackCard = stackCards[0];
            if (frontStackCard) {
              selectCardFromStack(frontStackCard.id);
            }
          }
        },
      }),
    [stackCards, activeCard]
  );

  if (!activeCard) return null;

  // Cálculo del valor principal mostrado en el contador animado (Balance: $ XXXX)
  const totalDebt =
    activeStmt?.totalCurrentDebt ?? Math.max(0, activeCard.creditLimit - activeCard.availableLimit);
  const billedThisMonth = activeStmt?.totalToPayThisMonth ?? 0;

  const displayedMetricValue =
    balanceMode === 'available'
      ? activeCard.availableLimit
      : balanceMode === 'debt'
      ? totalDebt
      : billedThisMonth;

  const displayedMetricLabel =
    balanceMode === 'available'
      ? 'Cupo Disponible:'
      : balanceMode === 'debt'
      ? 'Deuda Total Actual:'
      : 'Facturado este Mes:';

  // Estado del extracto de la tarjeta activa
  let statusBadge = { label: 'AL DÍA', color: colors.success, bg: colors.successBg };
  if (activeStmt?.statementStatus === 'paid') {
    statusBadge = { label: 'EXTRACTO PAGADO', color: colors.success, bg: colors.successBg };
  } else if (activeStmt?.statementStatus === 'minimum_covered') {
    statusBadge = { label: 'MÍNIMO CUBIERTO', color: colors.info, bg: colors.infoBg };
  } else if (activeStmt?.statementStatus === 'overdue') {
    statusBadge = { label: 'VENCIDO', color: colors.danger, bg: colors.dangerBg };
  } else if (activeStmt?.statementStatus === 'partially_paid') {
    statusBadge = { label: 'ABONO PARCIAL', color: colors.warning, bg: colors.warningBg };
  }

  const primaryAmbientColor =
    activeCard.colorGradient && activeCard.colorGradient[0]
      ? activeCard.colorGradient[0]
      : '#312E81';

  const rotateInterpolation = activeRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-5.5deg'],
  });

  // Mostrar hasta 4 tarjetas en el mazo apilado inferior (como en el video)
  const visibleStackCards = stackCards.slice(0, 4);

  return (
    <View style={styles.walletContainer}>
      {/* Resplandor Ambiental Dinámico (Ambient Glow que cambia según el color de la tarjeta activa) */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ambientBackdrop,
          {
            backgroundColor: primaryAmbientColor,
            opacity: ambientPulse.interpolate({
              inputRange: [0, 1],
              outputRange: [0.06, 0.18],
            }),
          },
        ]}
      />

      {/* Barra superior de la tarjeta activa: Estado + Indicador de posición + Menú Contextual (⋮) */}
      <View style={styles.activeTopBar}>
        <View style={styles.leftBadgesRow}>
          <View style={[styles.statusBadgePill, { backgroundColor: statusBadge.bg }]}>
            <Text style={[styles.statusBadgeText, { color: statusBadge.color }]}>
              {statusBadge.label}
            </Text>
          </View>
          {creditCards.length > 1 && (
            <View
              style={[
                styles.cardCounterPill,
                { backgroundColor: colors.surfaceCard, borderColor: colors.border },
              ]}
            >
              <CustomIcon name="Layers" size={13} color={colors.textMuted} />
              <Text style={[styles.cardCounterText, { color: colors.textSecondary }]}>
                1 de {creditCards.length}
              </Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[
            styles.contextMenuTriggerBtn,
            { backgroundColor: colors.surfaceCard, borderColor: colors.borderLight },
          ]}
          onPress={() => setContextMenuVisible(true)}
          accessibilityLabel="Más opciones de tarjeta"
        >
          <CustomIcon name="MoreVertical" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* 1. TARJETA ACTIVA DESTACADA (ARRIBA) CON ANIMACIÓN DE VUELO */}
      <Animated.View
        style={[
          styles.activeCardSlot,
          {
            transform: [
              { translateY: activeFlyY },
              { scale: activeScale },
              { rotateZ: rotateInterpolation },
            ],
          },
        ]}
        {...stackPanResponder.panHandlers}
      >
        <TouchableOpacity
          activeOpacity={0.95}
          onPress={() => onOpenStatement(activeCard)}
        >
          <RealisticCardFace
            card={activeCard}
            statement={activeStmt}
            isBalanceHidden={isBalanceHidden}
          />
        </TouchableOpacity>
      </Animated.View>

      {/* 2. SECCIÓN CENTRAL DE BALANCE CON CONTADOR ANIMADO */}
      <View style={styles.balanceHeroSection}>
        <View style={styles.balanceLeftCol}>
          {/* Pestañas sutiles para alternar qué cifra ver en grande */}
          <View style={styles.metricPillsRow}>
            <TouchableOpacity
              onPress={() => setBalanceMode('available')}
              style={[
                styles.metricSwitchPill,
                { backgroundColor: colors.surfaceCard, borderColor: colors.border },
                balanceMode === 'available' && {
                  backgroundColor: alpha(colors.primary, 0.18),
                  borderColor: colors.primaryLight,
                },
              ]}
            >
              <Text
                style={[
                  styles.metricSwitchText,
                  { color: colors.textMuted },
                  balanceMode === 'available' && { color: colors.textPrimary, fontWeight: '700' },
                ]}
              >
                Disponible
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setBalanceMode('debt')}
              style={[
                styles.metricSwitchPill,
                { backgroundColor: colors.surfaceCard, borderColor: colors.border },
                balanceMode === 'debt' && {
                  backgroundColor: alpha(colors.primary, 0.18),
                  borderColor: colors.primaryLight,
                },
              ]}
            >
              <Text
                style={[
                  styles.metricSwitchText,
                  { color: colors.textMuted },
                  balanceMode === 'debt' && { color: colors.textPrimary, fontWeight: '700' },
                ]}
              >
                Deuda Total
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setBalanceMode('billed')}
              style={[
                styles.metricSwitchPill,
                { backgroundColor: colors.surfaceCard, borderColor: colors.border },
                balanceMode === 'billed' && {
                  backgroundColor: alpha(colors.primary, 0.18),
                  borderColor: colors.primaryLight,
                },
              ]}
            >
              <Text
                style={[
                  styles.metricSwitchText,
                  { color: colors.textMuted },
                  balanceMode === 'billed' && { color: colors.textPrimary, fontWeight: '700' },
                ]}
              >
                Facturado
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.balanceCaption, { color: colors.textSecondary }]}>
            {displayedMetricLabel}
          </Text>
          <AnimatedRollingNumber
            value={displayedMetricValue}
            currency={activeCard.currency || currency}
            isHidden={isBalanceHidden}
            style={[
              styles.rollingBalanceText,
              { color: colors.textPrimary },
              balanceMode === 'debt' && totalDebt > 0 && { color: colors.danger },
              balanceMode === 'billed' && billedThisMonth > 0 && { color: colors.warning },
            ]}
          />
          <Text style={[styles.totalLimitSubtext, { color: colors.textSecondary }]}>
            Cupo Total:{' '}
            {isBalanceHidden
              ? '••••••'
              : formatCurrency(activeCard.creditLimit, activeCard.currency || currency)}
          </Text>
        </View>
      </View>

      {/* 2B. DOS ÚNICAS ACCIONES PRIMARIAS (MIN-HEIGHT: 48PX, ALTO CONTRASTE) */}
      <View style={styles.primaryActionsRow}>
        <TouchableOpacity
          style={[
            styles.primaryActionBtn,
            {
              backgroundColor: colors.success,
              borderColor: colors.success,
            },
          ]}
          onPress={() => onOpenAddPurchase(activeCard)}
          activeOpacity={0.8}
        >
          <CustomIcon name="Plus" size={18} color="#FFFFFF" />
          <Text style={styles.primaryActionBtnText} numberOfLines={1}>
            Registrar Compra
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.primaryActionBtn,
            {
              backgroundColor: colors.primary,
              borderColor: colors.primary,
            },
          ]}
          onPress={() => onOpenPay(activeCard)}
          activeOpacity={0.8}
        >
          <CustomIcon name="CreditCard" size={18} color="#FFFFFF" />
          <Text style={styles.primaryActionBtnText} numberOfLines={1}>
            Abonar / Pagar
          </Text>
        </TouchableOpacity>
      </View>

      {/* 2C. BOTÓN DESTACADO DE ANÁLISIS DE EXTRACTO CON GEMINI IA */}
      {onOpenAIStatement && (
        <TouchableOpacity
          style={[
            styles.singleCardAddDeckHint,
            {
              backgroundColor: alpha(colors.success, 0.14),
              borderColor: alpha(colors.success, 0.45),
              marginTop: -4,
              marginBottom: 14,
              minHeight: 46,
            },
          ]}
          onPress={() => onOpenAIStatement(activeCard)}
          activeOpacity={0.85}
        >
          <CustomIcon name="FileText" size={17} color={colors.success} />
          <Text
            style={[
              styles.singleCardAddDeckText,
              { color: colors.textPrimary, fontWeight: '700' },
            ]}
            numberOfLines={1}
          >
            Subir Extracto PDF con IA (Sincronizar Todo)
          </Text>
          <CustomIcon name="ChevronRight" size={16} color={colors.success} />
        </TouchableOpacity>
      )}

      {/* 3. MAZO INFERIOR DE TARJETAS APILADAS (CARD STACK) */}
      {stackCards.length > 0 ? (
        <View style={styles.stackSectionWrapper} {...stackPanResponder.panHandlers}>
          <View style={styles.stackHeaderRow}>
            <Text style={[styles.stackHintTitle, { color: colors.textSecondary }]}>
              Mazo de Tarjetas ({stackCards.length} más)
            </Text>
            <Text style={[styles.stackHintSub, { color: colors.primaryLight }]}>
              Toca o desliza una tarjeta para subirla
            </Text>
          </View>

          <View style={styles.stackDeckContainer}>
            {/* Renderizamos de atrás hacia adelante para que la primera tarjeta del mazo quede al frente */}
            {[...visibleStackCards].reverse().map((stackCard, reversedIdx) => {
              // depthIndex = 0 es la tarjeta más frontal del mazo, 1 es la de detrás, 2 más atrás...
              const depthIndex = visibleStackCards.length - 1 - reversedIdx;

              // Escala decreciente hacia atrás (igual que las tarjetas blanca, roja y negra del video)
              const targetScale = 0.96 - depthIndex * 0.055;
              // Desplazamiento vertical negativo para que asome la franja superior de cada tarjeta trasera
              const targetTranslateY = -depthIndex * 24;

              const animatedScale = stackAdvanceAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [Math.max(0.75, targetScale - 0.04), targetScale],
              });

              const animatedTranslateY = stackAdvanceAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [targetTranslateY - 14, targetTranslateY],
              });

              return (
                <Animated.View
                  key={stackCard.id}
                  style={[
                    styles.stackedCardItem,
                    {
                      zIndex: 20 - depthIndex,
                      transform: [
                        { translateY: animatedTranslateY },
                        { scale: animatedScale },
                        { rotateZ: depthIndex % 2 === 0 ? '-1.2deg' : '1.2deg' },
                      ],
                    },
                  ]}
                >
                  <TouchableOpacity
                    activeOpacity={0.92}
                    onPress={() => selectCardFromStack(stackCard.id)}
                  >
                    <RealisticCardFace
                      card={stackCard}
                      isBalanceHidden={isBalanceHidden}
                      isStackPreview
                    />
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>

          {/* Selector rápido por chips si hay múltiples tarjetas */}
          {creditCards.length > 2 && (
            <View style={styles.quickDotsRow}>
              {creditCards.map((c) => {
                const isCurrent = c.id === activeCard.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => selectCardFromStack(c.id)}
                    style={[
                      styles.cardQuickChip,
                      { backgroundColor: colors.surfaceCard, borderColor: colors.border },
                      isCurrent && {
                        backgroundColor: alpha(colors.primary, 0.2),
                        borderColor: colors.primaryLight,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.chipColorDot,
                        { backgroundColor: c.colorGradient?.[0] || colors.primary },
                      ]}
                    />
                    <Text
                      style={[
                        styles.cardQuickChipText,
                        { color: colors.textSecondary },
                        isCurrent && { color: colors.textPrimary, fontWeight: 'bold' },
                      ]}
                      numberOfLines={1}
                    >
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      ) : (
        /* Si solo tiene 1 tarjeta, mostramos invitación sutil para sumar otra al mazo */
        <TouchableOpacity
          style={[
            styles.singleCardAddDeckHint,
            {
              backgroundColor: alpha(colors.primary, 0.08),
              borderColor: alpha(colors.primary, 0.35),
            },
          ]}
          onPress={onOpenCreateCard}
          activeOpacity={0.8}
        >
          <CustomIcon name="Layers" size={16} color={colors.primaryLight} />
          <Text style={[styles.singleCardAddDeckText, { color: colors.textSecondary }]}>
            Agrega otra tarjeta para activar el mazo interactivo apilado
          </Text>
          <CustomIcon name="Plus" size={15} color={colors.primaryLight} />
        </TouchableOpacity>
      )}

      {/* 4. COMPRAS A CUOTAS DE LA TARJETA ACTIVA */}
      {activeCardPurchases.length > 0 && (
        <View
          style={[
            styles.cardPurchasesList,
            { backgroundColor: colors.surfaceCard, borderColor: colors.border },
          ]}
        >
          <View style={styles.purchasesHeaderRow}>
            <Text style={[styles.cardPurchasesTitle, { color: colors.textSecondary }]}>
              Compras a Cuotas en {activeCard.name} ({activeCardPurchases.length})
            </Text>
          </View>

          {activeCardPurchases.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.purchaseRow, { borderTopColor: colors.divider }]}
              onPress={() => onOpenAmortization(p)}
              activeOpacity={0.7}
            >
              <View style={styles.pLeft}>
                <Text style={[styles.pTitle, { color: colors.textPrimary }]}>{p.description}</Text>
                <Text style={[styles.pSub, { color: colors.textSecondary }]}>
                  Cuota {p.installmentsPaid} de {p.installmentsTotal} ({p.interestRateMonthly}% E.M.)
                </Text>
              </View>
              <View style={styles.pRight}>
                <Text style={[styles.pQuota, { color: colors.successLight }]}>
                  {formatCurrency(p.monthlyInstallmentAmount, currency)}/m
                </Text>
                <View style={styles.detailsBadge}>
                  <Text style={[styles.detailsText, { color: colors.primaryLight }]}>Ver tabla</Text>
                  <CustomIcon name="ChevronRight" size={13} color={colors.primaryLight} />
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* MENÚ CONTEXTUAL (⋮) DE TARJETA ACTIVA */}
      <Modal
        visible={contextMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setContextMenuVisible(false)}
      >
        <Pressable
          style={styles.contextMenuBackdrop}
          onPress={() => setContextMenuVisible(false)}
        >
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
                  {activeCard.bankName.toUpperCase()} •••• {activeCard.lastFourDigits || '0000'}
                </Text>
                <Text style={[styles.contextMenuCardName, { color: colors.textPrimary }]}>
                  {activeCard.name}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.contextMenuCloseBtn, { backgroundColor: colors.surfaceElevated }]}
                onPress={() => setContextMenuVisible(false)}
              >
                <CustomIcon name="X" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {onOpenAIStatement && (
              <TouchableOpacity
                style={styles.contextMenuItem}
                onPress={() => {
                  setContextMenuVisible(false);
                  onOpenAIStatement(activeCard);
                }}
              >
                <View style={[styles.contextMenuIconWrap, { backgroundColor: alpha(colors.success, 0.18) }]}>
                  <CustomIcon name="Sparkles" size={18} color={colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.contextMenuItemTitle, { color: colors.textPrimary }]}>
                    Subir Extracto PDF con IA (Gemini)
                  </Text>
                  <Text style={[styles.contextMenuItemSub, { color: colors.textSecondary }]}>
                    Sube tu PDF para crear todos los movimientos e igualar al banco
                  </Text>
                </View>
                <CustomIcon name="ChevronRight" size={16} color={colors.success} />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.contextMenuItem}
              onPress={() => {
                setContextMenuVisible(false);
                onOpenStatement(activeCard);
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
                setContextMenuVisible(false);
                onOpenReconcile(activeCard);
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
                setContextMenuVisible(false);
                onOpenManualStatement(activeCard, 'opening_balance');
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
                setContextMenuVisible(false);
                onEditCard(activeCard);
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
                setContextMenuVisible(false);
                onDeleteCard(activeCard);
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
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  walletContainer: {
    position: 'relative',
    paddingTop: 4,
    paddingBottom: 16,
  },
  ambientBackdrop: {
    position: 'absolute',
    top: -10,
    left: -16,
    right: -16,
    height: 430,
    borderRadius: 36,
  },
  activeTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    zIndex: 30,
  },
  leftBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadgePill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  cardCounterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardCounterText: {
    color: '#94A3B8',
    fontSize: 10.5,
    fontWeight: '600',
  },
  contextMenuTriggerBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  primaryActionBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  primaryActionBtnText: {
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
  activeCardSlot: {
    width: CARD_WIDTH,
    zIndex: 25,
    elevation: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
  },
  cardGradient: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 22,
    padding: 20,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  cardGradientStack: {
    height: 175,
  },
  innerHighlightBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bankTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  bankNameText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  bankDivider: {
    color: 'rgba(255,255,255,0.35)',
    marginHorizontal: 7,
    fontSize: 14,
    fontWeight: '300',
  },
  cardSubtitleText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12.5,
    fontWeight: '500',
    flexShrink: 1,
  },
  mastercardLogoWrap: {
    alignItems: 'center',
  },
  mcCircles: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mcCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    opacity: 0.92,
  },
  mcLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 8.5,
    fontWeight: '600',
    marginTop: 1,
    letterSpacing: 0.3,
  },
  visaLogoText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: 1,
  },
  genericBrandPill: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 6,
  },
  genericBrandText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  emvChip: {
    width: 40,
    height: 29,
    borderRadius: 6,
    backgroundColor: '#CBD5E1',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  emvChipLineH: {
    position: 'absolute',
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.28)',
  },
  emvChipLineV: {
    position: 'absolute',
    height: '100%',
    width: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.28)',
  },
  emvChipCore: {
    width: 16,
    height: 12,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.35)',
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  contactlessWrap: {
    transform: [{ rotate: '90deg' }],
  },
  embossedNumber: {
    color: '#FFFFFF',
    fontSize: 17.5,
    fontWeight: '600',
    letterSpacing: 2.4,
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    marginTop: 4,
  },
  cardBottomRow: {
    gap: 8,
  },
  datesInline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dateMetaLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  dateMetaValue: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  miniProgressTrack: {
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  miniProgressFill: {
    height: '100%',
    borderRadius: 2,
  },

  /* Sección de Balance con Contador Animado (como en el video) */
  balanceHeroSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 6,
    zIndex: 15,
  },
  balanceLeftCol: {
    flex: 1,
    marginRight: 12,
  },
  metricPillsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  metricSwitchPill: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  metricSwitchPillActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.22)',
    borderColor: 'rgba(129, 140, 248, 0.5)',
  },
  metricSwitchText: {
    color: '#94A3B8',
    fontSize: 10.5,
    fontWeight: '600',
  },
  metricSwitchTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  balanceCaption: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13.5,
    fontWeight: '500',
  },
  rollingBalanceText: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 0.4,
    marginTop: 2,
  },
  totalLimitSubtext: {
    color: '#94A3B8',
    fontSize: 11.5,
    marginTop: 3,
  },
  quickShareArrowBtn: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* Mazo de Tarjetas Apiladas (Bottom Stack) */
  stackSectionWrapper: {
    marginTop: 6,
    marginBottom: 14,
  },
  stackHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  stackHintTitle: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '700',
  },
  stackHintSub: {
    color: '#818CF8',
    fontSize: 11,
    fontWeight: '600',
  },
  stackDeckContainer: {
    height: 168,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingTop: 55,
    overflow: 'hidden',
    borderRadius: 22,
  },
  stackedCardItem: {
    position: 'absolute',
    bottom: -42,
    width: CARD_WIDTH,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 10,
  },
  quickDotsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
    justifyContent: 'center',
  },
  cardQuickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    maxWidth: 135,
  },
  chipColorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cardQuickChipText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '500',
  },
  singleCardAddDeckHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(129, 140, 248, 0.35)',
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  singleCardAddDeckText: {
    color: '#94A3B8',
    fontSize: 11.5,
    fontWeight: '600',
    flex: 1,
  },

  /* Acciones y Compras */
  openingBalanceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.25)',
    gap: 10,
  },
  openingBalanceIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  openingBalanceTitle: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: 'bold',
  },
  openingBalanceSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  openingBalanceBtn: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  openingBalanceBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: 'bold',
  },
  cardActionsBar: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
    marginBottom: 12,
  },
  cardActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: 11,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardActionBtnPrimary: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  cardActionBtnAccent: {
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    borderColor: 'rgba(99, 102, 241, 0.35)',
  },
  cardActionBtnText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '600',
  },
  cardActionBtnTextPrimary: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  cardPurchasesList: {
    backgroundColor: Theme.colors.surfaceCard,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  purchasesHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardPurchasesTitle: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: 'bold',
  },
  addPurchaseInlineLink: {
    color: '#818CF8',
    fontSize: 11.5,
    fontWeight: 'bold',
  },
  purchaseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  pLeft: {
    flex: 1,
  },
  pTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  pSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 1,
  },
  pRight: {
    alignItems: 'flex-end',
  },
  pQuota: {
    color: '#34D399',
    fontSize: 13,
    fontWeight: 'bold',
  },
  detailsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  detailsText: {
    color: '#818CF8',
    fontSize: 10,
    fontWeight: '600',
  },
});

