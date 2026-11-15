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

const MODEL_OPTIONS: Array<{
  id: string;
  title: string;
  badge: string;
  description: string;
  accent: 'success' | 'primary' | 'info';
}> = [
  {
    id: 'gemini-3.0-flash',
    title: 'Gemini 3 Flash (3.0 / 3.9)',
    badge: 'Por defecto • Nuevos usuarios',
    description:
      'Compatible con nuevas cuentas de Google AI Studio. Auto-detecta la versión Flash 3.x activa en tu llave.',
    accent: 'success',
  },
  {
    id: 'gemini-2.5-flash',
    title: 'gemini-2.5-flash',
    badge: 'Clásico • Ultra rápido',
    description:
      'Ideal para cuentas existentes con acceso a la serie 2.5 (si tu llave es nueva, usará 3.x automáticamente).',
    accent: 'info',
  },
  {
    id: 'gemini-2.5-pro',
    title: 'Gemini Pro (2.5 / 3.0 Pro)',
    badge: 'Análisis profundo',
    description:
      'Mayor razonamiento para instrucciones financieras múltiples o complejas.',
    accent: 'primary',
  },
];

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
      setModelDraft(geminiModel || 'gemini-3.0-flash');
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
    setTestResult({ ok: result.ok, message: result.message });
    setIsTesting(false);
    if (result.ok) {
      const finalModel = result.resolvedModel || modelDraft;
      setModelDraft(finalModel);
      await updateAISettings({
        geminiApiKey: geminiKeyDraft.trim(),
        geminiModel: finalModel,
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

  const isOptionSelected = (optId: string) => {
    if (modelDraft === optId) return true;
    if (
      optId === 'gemini-3.0-flash' &&
      !MODEL_OPTIONS.some((o) => o.id === modelDraft)
    ) {
      return true;
    }
    return false;
  };

  return (
    <Modal
      visible={isAISettingsModalOpen}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={closeAISettingsModal}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeAISettingsModal} />

        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
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
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
            nestedScrollEnabled={true}
            overScrollMode="never"
            bounces={false}
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
                  {isTesting ? 'Probando y detectando modelo compatible...' : 'Probar conexión'}
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

              {MODEL_OPTIONS.map((opt) => {
                const selected = isOptionSelected(opt.id);
                const accentColor =
                  opt.accent === 'success'
                    ? colors.success
                    : opt.accent === 'info'
                    ? colors.info
                    : colors.primaryLight;
                const displayTitle =
                  selected && opt.id === 'gemini-3.0-flash' && modelDraft !== 'gemini-3.0-flash'
                    ? `${opt.title} (${modelDraft})`
                    : opt.title;

                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[
                      styles.modelOptionCard,
                      {
                        backgroundColor: colors.surfaceElevated,
                        borderColor: selected ? accentColor : colors.borderLight,
                      },
                      selected && {
                        backgroundColor: alpha(accentColor, 0.14),
                      },
                    ]}
                    onPress={() => setModelDraft(opt.id)}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={styles.modelTitleBadgeRow}>
                        <Text style={[styles.modelTitle, { color: colors.textPrimary }]}>
                          {displayTitle}
                        </Text>
                        <View
                          style={[
                            styles.recommendedPill,
                            { backgroundColor: alpha(accentColor, 0.18) },
                          ]}
                        >
                          <Text style={[styles.recommendedPillText, { color: accentColor }]}>
                            {opt.badge}
                          </Text>
                        </View>
                      </View>
                      <Text style={[styles.modelSub, { color: colors.textSecondary }]}>
                        {opt.description}
                      </Text>
                    </View>
                    <CustomIcon
                      name={selected ? 'CheckCircle2' : 'Circle'}
                      size={20}
                      color={selected ? accentColor : colors.textMuted}
                    />
                  </TouchableOpacity>
                );
              })}
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
        </View>
      </View>
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
    maxHeight: '90%',
    overflow: 'hidden',
  },
  scrollView: {
    flexGrow: 0,
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
  headerTitle: {
    fontSize: 17,
    fontWeight: 'bold',
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
    paddingBottom: 38,
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
