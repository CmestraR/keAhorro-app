import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  ScrollView,
  Switch,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useAI } from '../../context/AIContext';
import { useAppTheme } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';
import { GeminiModelType, testGeminiConnection } from '../../utils/geminiService';
import { alpha } from '../common/Theme';
import { CustomIcon } from '../common/CustomIcon';
import { Text, TextInput } from '../common/AppText';
import { TouchableOpacity } from '../common/Touchable';

export const AISettingsModal: React.FC = () => {
  const {
    isAISettingsModalOpen,
    closeAISettingsModal,
    geminiApiKey,
    geminiModel,
    googleMapsApiKey,
    googleMapsEnabled,
    voiceHoldEnabled,
    autoCategorizeEnabled,
    updateAISettings,
  } = useAI();

  const { colors } = useAppTheme();
  const { showSuccess } = useAlert();

  const [geminiKeyDraft, setGeminiKeyDraft] = useState(geminiApiKey);
  const [modelDraft, setModelDraft] = useState<GeminiModelType>(geminiModel);
  const [mapsKeyDraft, setMapsKeyDraft] = useState(googleMapsApiKey);
  const [mapsEnabledDraft, setMapsEnabledDraft] = useState(googleMapsEnabled);
  const [voiceHoldDraft, setVoiceHoldDraft] = useState(voiceHoldEnabled);
  const [autoCatDraft, setAutoCatDraft] = useState(autoCategorizeEnabled);

  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showMapsKey, setShowMapsKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (isAISettingsModalOpen) {
      setGeminiKeyDraft(geminiApiKey);
      setModelDraft(geminiModel);
      setMapsKeyDraft(googleMapsApiKey);
      setMapsEnabledDraft(googleMapsEnabled);
      setVoiceHoldDraft(voiceHoldEnabled);
      setAutoCatDraft(autoCategorizeEnabled);
      setTestResult(null);
    }
  }, [
    isAISettingsModalOpen,
    geminiApiKey,
    geminiModel,
    googleMapsApiKey,
    googleMapsEnabled,
    voiceHoldEnabled,
    autoCategorizeEnabled,
  ]);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    const result = await testGeminiConnection(geminiKeyDraft, modelDraft);
    setTestResult(result);
    setIsTesting(false);
    if (result.ok) {
      await updateAISettings({
        geminiApiKey: geminiKeyDraft.trim(),
        geminiModel: modelDraft,
      });
    }
  };

  const handleSave = async () => {
    await updateAISettings({
      geminiApiKey: geminiKeyDraft.trim(),
      geminiModel: modelDraft,
      googleMapsApiKey: mapsKeyDraft.trim(),
      googleMapsEnabled: mapsEnabledDraft,
      voiceHoldEnabled: voiceHoldDraft,
      autoCategorizeEnabled: autoCatDraft,
    });
    showSuccess(
      'Configuración Guardada',
      'Tus preferencias de Inteligencia Artificial e integraciones se actualizaron localmente.'
    );
    closeAISettingsModal();
  };

  return (
    <Modal
      visible={isAISettingsModalOpen}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={closeAISettingsModal}
    >
      <Pressable style={styles.backdrop} onPress={closeAISettingsModal}>
        <Pressable
          style={[
            styles.sheet,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.divider }]}>
            <View style={styles.headerLeft}>
              <View
                style={[
                  styles.headerIconBox,
                  { backgroundColor: alpha(colors.primary, 0.18) },
                ]}
              >
                <CustomIcon name="Sparkles" size={20} color={colors.primaryLight} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.headerTag, { color: colors.primaryLight }]}>
                  FASE IA-1 • ALMACENAMIENTO LOCAL SEGURO
                </Text>
                <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
                  Configuración de IA & Integraciones
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: colors.surfaceElevated }]}
              onPress={closeAISettingsModal}
            >
              <CustomIcon name="X" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* 1. Gemini API Key */}
            <View
              style={[
                styles.sectionCard,
                { backgroundColor: colors.surfaceCard, borderColor: colors.border },
              ]}
            >
              <View style={styles.sectionTitleRow}>
                <CustomIcon name="KeyRound" size={17} color={colors.success} />
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                  1. Gemini API Key (Google AI Studio)
                </Text>
              </View>
              <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>
                Tu llave se guarda exclusivamente en este dispositivo para procesar dictado por voz y categorización inteligente en milisegundos.
              </Text>

              <View
                style={[
                  styles.passwordInputRow,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.borderLight,
                  },
                ]}
              >
                <TextInput
                  style={[styles.passwordInput, { color: colors.textPrimary }]}
                  placeholder="AIzaSy..."
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!showGeminiKey}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={geminiKeyDraft}
                  onChangeText={setGeminiKeyDraft}
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowGeminiKey(!showGeminiKey)}
                  accessibilityLabel={showGeminiKey ? 'Ocultar llave' : 'Mostrar llave'}
                >
                  <CustomIcon
                    name={showGeminiKey ? 'EyeOff' : 'Eye'}
                    size={19}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[
                  styles.testConnectionBtn,
                  {
                    backgroundColor: alpha(colors.primary, 0.16),
                    borderColor: colors.primaryLight,
                  },
                ]}
                onPress={handleTestConnection}
                disabled={isTesting}
              >
                {isTesting ? (
                  <ActivityIndicator size="small" color={colors.primaryLight} />
                ) : (
                  <CustomIcon name="Zap" size={16} color={colors.primaryLight} />
                )}
                <Text style={[styles.testConnectionText, { color: colors.primaryLight }]}>
                  {isTesting ? 'Probando conexión con Gemini...' : 'Probar conexión'}
                </Text>
              </TouchableOpacity>

              {testResult && (
                <View
                  style={[
                    styles.testFeedbackBox,
                    {
                      backgroundColor: testResult.ok ? colors.successBg : colors.dangerBg,
                      borderColor: testResult.ok ? colors.success : colors.danger,
                    },
                  ]}
                >
                  <CustomIcon
                    name={testResult.ok ? 'CheckCircle2' : 'AlertCircle'}
                    size={16}
                    color={testResult.ok ? colors.success : colors.danger}
                  />
                  <Text
                    style={[
                      styles.testFeedbackText,
                      { color: testResult.ok ? colors.successLight : colors.dangerLight },
                    ]}
                  >
                    {testResult.message}
                  </Text>
                </View>
              )}
            </View>

            {/* 2. Selector de Modelo de Velocidad */}
            <View
              style={[
                styles.sectionCard,
                { backgroundColor: colors.surfaceCard, borderColor: colors.border },
              ]}
            >
              <View style={styles.sectionTitleRow}>
                <CustomIcon name="Cpu" size={17} color={colors.primaryLight} />
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                  2. Selector de Modelo de Velocidad
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.modelOptionCard,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor:
                      modelDraft === 'gemini-2.5-flash'
                        ? colors.success
                        : colors.borderLight,
                  },
                  modelDraft === 'gemini-2.5-flash' && {
                    backgroundColor: alpha(colors.success, 0.14),
                  },
                ]}
                onPress={() => setModelDraft('gemini-2.5-flash')}
              >
                <View style={{ flex: 1 }}>
                  <View style={styles.modelTitleBadgeRow}>
                    <Text style={[styles.modelTitle, { color: colors.textPrimary }]}>
                      gemini-2.5-flash
                    </Text>
                    <View
                      style={[
                        styles.recommendedPill,
                        { backgroundColor: colors.successBg },
                      ]}
                    >
                      <Text style={[styles.recommendedPillText, { color: colors.success }]}>
                        Por defecto • Ultra rápido
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.modelSub, { color: colors.textSecondary }]}>
                    Ideal para dictado por voz al instante y categorización en milisegundos.
                  </Text>
                </View>
                <CustomIcon
                  name={modelDraft === 'gemini-2.5-flash' ? 'CheckCircle2' : 'Circle'}
                  size={20}
                  color={modelDraft === 'gemini-2.5-flash' ? colors.success : colors.textMuted}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modelOptionCard,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor:
                      modelDraft === 'gemini-2.5-pro'
                        ? colors.primary
                        : colors.borderLight,
                  },
                  modelDraft === 'gemini-2.5-pro' && {
                    backgroundColor: alpha(colors.primary, 0.15),
                  },
                ]}
                onPress={() => setModelDraft('gemini-2.5-pro')}
              >
                <View style={{ flex: 1 }}>
                  <View style={styles.modelTitleBadgeRow}>
                    <Text style={[styles.modelTitle, { color: colors.textPrimary }]}>
                      gemini-2.5-pro
                    </Text>
                    <View
                      style={[
                        styles.recommendedPill,
                        { backgroundColor: alpha(colors.primary, 0.2) },
                      ]}
                    >
                      <Text
                        style={[styles.recommendedPillText, { color: colors.primaryLight }]}
                      >
                        Análisis profundo
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.modelSub, { color: colors.textSecondary }]}>
                    Mayor razonamiento para instrucciones financieras múltiples o complejas.
                  </Text>
                </View>
                <CustomIcon
                  name={modelDraft === 'gemini-2.5-pro' ? 'CheckCircle2' : 'Circle'}
                  size={20}
                  color={modelDraft === 'gemini-2.5-pro' ? colors.primaryLight : colors.textMuted}
                />
              </TouchableOpacity>
            </View>

            {/* 3. Google Maps / Places API Key */}
            <View
              style={[
                styles.sectionCard,
                { backgroundColor: colors.surfaceCard, borderColor: colors.border },
              ]}
            >
              <View style={styles.switchHeaderRow}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <View style={styles.sectionTitleRow}>
                    <CustomIcon name="MapPin" size={17} color={colors.warning} />
                    <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                      3. Google Maps / Places API Key
                    </Text>
                  </View>
                  <Text style={[styles.sectionSub, { color: colors.textSecondary, marginBottom: 0 }]}>
                    Preparado para la fase de geolocalización de comercios y mapas de gastos.
                  </Text>
                </View>
                <Switch
                  value={mapsEnabledDraft}
                  onValueChange={setMapsEnabledDraft}
                  trackColor={{ false: '#334155', true: '#10B981' }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View
                style={[
                  styles.passwordInputRow,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.borderLight,
                    marginTop: 10,
                  },
                ]}
              >
                <TextInput
                  style={[styles.passwordInput, { color: colors.textPrimary }]}
                  placeholder="AIzaSy... (Google Maps / Places)"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!showMapsKey}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={mapsKeyDraft}
                  onChangeText={setMapsKeyDraft}
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowMapsKey(!showMapsKey)}
                >
                  <CustomIcon
                    name={showMapsKey ? 'EyeOff' : 'Eye'}
                    size={19}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* 4. Switches de Control */}
            <View
              style={[
                styles.sectionCard,
                { backgroundColor: colors.surfaceCard, borderColor: colors.border },
              ]}
            >
              <View style={styles.sectionTitleRow}>
                <CustomIcon name="SlidersHorizontal" size={17} color={colors.info} />
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                  4. Controles de Asistencia Inteligente
                </Text>
              </View>

              <View style={[styles.toggleRow, { borderBottomColor: colors.divider }]}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={[styles.toggleTitle, { color: colors.textPrimary }]}>
                    Activar Registro por Voz al mantener presionado (+)
                  </Text>
                  <Text style={[styles.toggleSub, { color: colors.textSecondary }]}>
                    Mantén pulsado 300ms el botón central "+ Nuevo" para dictar tu movimiento.
                  </Text>
                </View>
                <Switch
                  value={voiceHoldDraft}
                  onValueChange={setVoiceHoldDraft}
                  trackColor={{ false: '#334155', true: '#10B981' }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View style={[styles.toggleRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={[styles.toggleTitle, { color: colors.textPrimary }]}>
                    Autocategorización inteligente al escribir concepto
                  </Text>
                  <Text style={[styles.toggleSub, { color: colors.textSecondary }]}>
                    Selecciona automáticamente la categoría mientras escribes la descripción.
                  </Text>
                </View>
                <Switch
                  value={autoCatDraft}
                  onValueChange={setAutoCatDraft}
                  trackColor={{ false: '#334155', true: '#6366F1' }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>

            {/* Botón Guardar */}
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colors.primary }]}
              onPress={handleSave}
            >
              <CustomIcon name="CheckCircle2" size={18} color="#FFFFFF" />
              <Text style={styles.saveBtnText}>Guardar Configuración de IA</Text>
            </TouchableOpacity>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    maxHeight: '92%',
    paddingBottom: 28,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 10,
  },
  headerIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTag: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    marginTop: 2,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 18,
    gap: 14,
  },
  sectionCard: {
    borderRadius: 16,
    padding: 15,
    borderWidth: 1,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  sectionSub: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  passwordInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  passwordInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 10,
  },
  eyeBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  testConnectionBtn: {
    marginTop: 10,
    minHeight: 44,
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  testConnectionText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  testFeedbackBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  testFeedbackText: {
    fontSize: 13,
    flex: 1,
    fontWeight: '600',
  },
  modelOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    marginTop: 8,
    gap: 10,
  },
  modelTitleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  modelTitle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  recommendedPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  recommendedPillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  modelSub: {
    fontSize: 13,
  },
  switchHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  toggleSub: {
    fontSize: 13,
    marginTop: 2,
  },
  saveBtn: {
    minHeight: 52,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    marginBottom: 12,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
