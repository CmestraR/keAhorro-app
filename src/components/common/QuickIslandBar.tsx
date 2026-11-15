import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
} from 'react-native';
import { parseBankNotification, ParsedBankMessage } from '../../utils/bankNotificationParser';
import { useFinancial } from '../../context/FinancialContext';
import { useAlert } from '../../context/AlertContext';
import { useAppTheme } from '../../context/ThemeContext';
import { formatCurrency } from '../../utils/formatters';
import { CustomIcon } from './CustomIcon';
import { Text, TextInput } from './AppText';
import { TouchableOpacity } from './Touchable';

interface QuickIslandBarProps {
  onOpenAddModal: (prefill?: Partial<ParsedBankMessage>) => void;
  /** 'pill' (por defecto): banner completo. 'icon': ícono con badge para el header. */
  variant?: 'pill' | 'icon';
}

export const QuickIslandBar: React.FC<QuickIslandBarProps> = ({ onOpenAddModal, variant = 'pill' }) => {
  const { currency } = useFinancial();
  const { showWarning } = useAlert();
  const { colors } = useAppTheme();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [notificationText, setNotificationText] = useState('');
  const [parsedPreview, setParsedPreview] = useState<ParsedBankMessage | null>(null);

  const handleTextChange = (text: string) => {
    setNotificationText(text);
    if (text.trim().length > 10) {
      const result = parseBankNotification(text);
      setParsedPreview(result);
    } else {
      setParsedPreview(null);
    }
  };

  const handleApplyParsed = () => {
    if (!parsedPreview) {
      showWarning('No se detectó información', 'Pega el texto completo del SMS o notificación bancaria.');
      return;
    }
    setIsModalOpen(false);
    onOpenAddModal(parsedPreview);
    setNotificationText('');
    setParsedPreview(null);
  };

  const sampleNotifications = [
    'Bancolombia le informa compra por $45.000 en EXITO con t.deb *4829',
    'Nu: Compra aprobada por $120.000 en MercadoLibre a 1 cuota',
    'Nequi: Enviaste $50.000 a Juan Perez',
  ];

  return (
    <>
      {variant === 'icon' ? (
        /* Acceso sutil de ícono con badge (header) */
        <TouchableOpacity
          style={[
            styles.iconTrigger,
            { backgroundColor: colors.surfaceElevated, borderColor: colors.borderLight },
          ]}
          activeOpacity={0.8}
          onPress={() => setIsModalOpen(true)}
          accessibilityLabel="Notificaciones activas - captura rápida"
        >
          <CustomIcon name="Sparkles" size={20} color={colors.primaryLight} />
          <View
            style={[
              styles.iconBadge,
              { backgroundColor: colors.success, borderColor: colors.surfaceElevated },
            ]}
          />
        </TouchableOpacity>
      ) : (
        /* Píldora de Acceso Rápido / Isla Dinámica */
        <TouchableOpacity
          style={styles.islandPill}
          activeOpacity={0.85}
          onPress={() => setIsModalOpen(true)}
        >
          <View style={styles.islandPulseDot} />
          <View style={styles.islandContent}>
            <CustomIcon name="Sparkles" size={14} color="#818CF8" />
            <Text style={styles.islandText}>Captura Rápida de Notificaciones</Text>
          </View>
          <View style={styles.islandBadge}>
            <Text style={styles.islandBadgeText}>Auto</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Modal de Captura Inteligente */}
      <Modal visible={isModalOpen} animationType="fade" transparent onRequestClose={() => setIsModalOpen(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsModalOpen(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={[
              styles.modalContent,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerTitleRow}>
                <View style={[styles.sparkleBox, { backgroundColor: colors.warningBg }]}>
                  <CustomIcon name="Zap" size={16} color={colors.warning} />
                </View>
                <View>
                  <Text style={[styles.tag, { color: colors.warning }]}>DETECCIÓN INTELIGENTE</Text>
                  <Text style={[styles.title, { color: colors.textPrimary }]}>
                    Leer Notificación Bancaria
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setIsModalOpen(false)}
                style={[styles.closeBtn, { backgroundColor: colors.surfaceElevated }]}
              >
                <CustomIcon name="X" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.instruction, { color: colors.textSecondary }]}>
              Pega aquí el texto de una notificación o SMS de Bancolombia, Nu, Nequi, Daviplata o cualquier banco:
            </Text>

            {/* Input para pegar texto */}
            <TextInput
              style={[
                styles.textArea,
                {
                  backgroundColor: colors.surfaceElevated,
                  color: colors.textPrimary,
                  borderColor: colors.borderLight,
                },
              ]}
              placeholder="Pega aquí: ej. 'Bancolombia le informa compra por $85.000 en...' o 'Transferencia a Nu...'"
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={4}
              value={notificationText}
              onChangeText={handleTextChange}
            />

            {/* Ejemplos rápidos */}
            <Text style={[styles.sampleLabel, { color: colors.textMuted }]}>
              O prueba con un ejemplo:
            </Text>
            <View style={styles.samplesRow}>
              {sampleNotifications.map((sample, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.sampleChip,
                    { backgroundColor: colors.surfaceCard, borderColor: colors.border },
                  ]}
                  onPress={() => handleTextChange(sample)}
                >
                  <Text style={[styles.sampleChipText, { color: colors.primaryLight }]} numberOfLines={1}>
                    {sample.substring(0, 24)}...
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Vista Previa de Detección */}
            {parsedPreview ? (
              <View
                style={[
                  styles.previewCard,
                  { backgroundColor: colors.inset, borderColor: colors.success },
                ]}
              >
                <View style={styles.previewHeader}>
                  <CustomIcon name="CheckCircle" size={14} color={colors.success} />
                  <Text style={[styles.previewTitle, { color: colors.success }]}>
                    Datos Detectados con Éxito
                  </Text>
                </View>
                <View style={styles.previewRow}>
                  <Text style={[styles.previewLabel, { color: colors.textMuted }]}>
                    Banco / Origen:
                  </Text>
                  <Text style={[styles.previewVal, { color: colors.textPrimary }]}>
                    {parsedPreview.bankName}
                  </Text>
                </View>
                <View style={styles.previewRow}>
                  <Text style={[styles.previewLabel, { color: colors.textMuted }]}>
                    Monto Extraído:
                  </Text>
                  <Text style={[styles.previewVal, { color: colors.successLight, fontWeight: 'bold' }]}>
                    {formatCurrency(parsedPreview.amount, currency)}
                  </Text>
                </View>
                <View style={styles.previewRow}>
                  <Text style={[styles.previewLabel, { color: colors.textMuted }]}>Concepto:</Text>
                  <Text style={[styles.previewVal, { color: colors.textPrimary }]}>
                    {parsedPreview.description}
                  </Text>
                </View>
                <View style={styles.previewRow}>
                  <Text style={[styles.previewLabel, { color: colors.textMuted }]}>
                    Tipo de Movimiento:
                  </Text>
                  <Text
                    style={[
                      styles.previewVal,
                      { color: colors.textPrimary, textTransform: 'capitalize' },
                    ]}
                  >
                    {parsedPreview.type === 'card_purchase' ? 'Compra Tarjeta' : parsedPreview.type}
                  </Text>
                </View>
              </View>
            ) : (
              notificationText.length > 5 && (
                <View style={[styles.warningBox, { backgroundColor: colors.warningBg }]}>
                  <CustomIcon name="AlertCircle" size={14} color={colors.warning} />
                  <Text style={[styles.warningText, { color: colors.warningLight }]}>
                    No se detectó un valor claro. Asegúrate de incluir el símbolo $ y el monto.
                  </Text>
                </View>
              )
            )}

            {/* Botón de Aplicar */}
            <TouchableOpacity
              style={[
                styles.applyBtn,
                { backgroundColor: colors.primary },
                !parsedPreview && styles.applyBtnDisabled,
              ]}
              disabled={!parsedPreview}
              onPress={handleApplyParsed}
            >
              <CustomIcon name="ArrowRight" size={16} color="#FFFFFF" />
              <Text style={styles.applyBtnText}>Cargar Gasto al Formulario</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  iconTrigger: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  iconBadge: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  islandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1B4B',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#4338CA',
    gap: 8,
    elevation: 4,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  islandPulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  islandContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  islandText: {
    color: '#E0E7FF',
    fontSize: 13,
    fontWeight: '700',
  },
  islandBadge: {
    backgroundColor: 'rgba(99, 102, 241, 0.4)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  islandBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sparkleBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tag: {
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: 'bold',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 16,
  },
  instruction: {
    fontSize: 13,
    marginBottom: 10,
    lineHeight: 18,
  },
  textArea: {
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    borderWidth: 1,
    marginBottom: 10,
  },
  sampleLabel: {
    fontSize: 13,
    marginBottom: 6,
  },
  samplesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  sampleChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  sampleChipText: {
    fontSize: 13,
  },
  previewCard: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  previewTitle: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  previewLabel: {
    fontSize: 13,
  },
  previewVal: {
    fontSize: 13,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    marginBottom: 14,
    gap: 6,
  },
  warningText: {
    fontSize: 13,
    flex: 1,
  },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  applyBtnDisabled: {
    opacity: 0.4,
  },
  applyBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
