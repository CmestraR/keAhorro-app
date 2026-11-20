const {
  withAndroidManifest,
  withMainApplication,
  withDangerousMod,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const JAVA_SERVICE_CODE = `package com.cristianmestra.gestiongastos;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

public class KeAhorroNotificationListenerService extends NotificationListenerService {
    private static final String TAG = "KeAhorroNotifService";
    public static final String PREFS_NAME = "keahorro_bg_notif_prefs";
    public static final String KEY_PENDING = "pending_bank_notifications";
    private static final String BG_CHANNEL_ID = "keahorro_auto_capture";

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;
        try {
            String pkg = sbn.getPackageName();
            if (pkg == null) return;

            // Ignorar notificaciones de nuestra propia app
            if (pkg.equals(getPackageName())) {
                return;
            }

            Notification notification = sbn.getNotification();
            if (notification == null) return;

            Bundle extras = notification.extras;
            if (extras == null) return;

            CharSequence titleCs = extras.getCharSequence(Notification.EXTRA_TITLE);
            CharSequence textCs = extras.getCharSequence(Notification.EXTRA_TEXT);
            CharSequence bigTextCs = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
            CharSequence subTextCs = extras.getCharSequence(Notification.EXTRA_SUB_TEXT);

            String title = titleCs != null ? titleCs.toString().trim() : "";
            String text = textCs != null ? textCs.toString().trim() : "";
            String bigText = bigTextCs != null ? bigTextCs.toString().trim() : "";
            String subText = subTextCs != null ? subTextCs.toString().trim() : "";

            // Usar bigText si es más largo que text (crucial para SMS de Bancolombia como 85784 donde el monto va al final)
            String body = bigText.length() >= text.length() && !bigText.isEmpty() ? bigText : text;
            if (body.isEmpty() && !subText.isEmpty()) {
                body = subText;
            }

            String combined = (title + " " + body).trim();
            if (combined.length() < 10) return;

            if (!looksLikeFinancialNotification(pkg, combined)) {
                return;
            }

            long postTime = sbn.getPostTime();
            JSONObject item = new JSONObject();
            item.put("id", sbn.getKey() + "_" + postTime);
            item.put("packageName", pkg);
            item.put("title", title);
            item.put("body", body);
            item.put("fullText", combined);
            item.put("timestamp", postTime);

            // 1. Si el módulo React Native está activo en memoria (foreground o background), enviarlo en tiempo real
            boolean deliveredLive = KeAhorroNotificationModule.emitBankNotificationToJS(item);

            // 2. Si la app estaba cerrada por completo, guardar en cola persistente y avisar al usuario
            if (!deliveredLive) {
                enqueuePendingNotification(getApplicationContext(), item);
                sendBackgroundCaptureNotice(getApplicationContext(), title, body);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error processing notification", e);
        }
    }

    private boolean looksLikeFinancialNotification(String pkg, String text) {
        String lower = text.toLowerCase();
        String pkgLower = pkg.toLowerCase();

        // Verificar si menciona entidades o palabras clave financieras de Colombia
        boolean hasBankKeyword =
            lower.contains("bancolombia") ||
            lower.contains("85784") ||
            lower.contains("85432") ||
            lower.contains("rappicard") ||
            lower.contains("rappipay") ||
            lower.contains("nequi") ||
            lower.contains("daviplata") ||
            lower.contains("davivienda") ||
            lower.contains("nubank") ||
            lower.contains("tarjeta nu") ||
            lower.contains("cuenta nu") ||
            lower.contains("lulo") ||
            lower.contains("bbva") ||
            lower.contains("falabella") ||
            lower.contains("colpatria") ||
            lower.contains("scotiabank") ||
            lower.contains("banco de bogot") ||
            pkgLower.contains("bancolombia") ||
            pkgLower.contains("todo1") ||
            pkgLower.contains("nequi") ||
            pkgLower.contains("rappi") ||
            pkgLower.contains("nubank") ||
            pkgLower.contains("nu.production") ||
            pkgLower.contains("daviplata") ||
            pkgLower.contains("davivienda");

        boolean hasActionKeyword =
            lower.contains("compraste") ||
            lower.contains("compra por") ||
            lower.contains("compra aprobada") ||
            lower.contains("transferiste") ||
            lower.contains("transferencia") ||
            lower.contains("recibiste") ||
            lower.contains("enviaste") ||
            lower.contains("pagaste") ||
            lower.contains("retiraste") ||
            lower.contains("abono") ||
            lower.contains("nomina") ||
            lower.contains("nómina") ||
            lower.contains("t.deb") ||
            lower.contains("t.cred");

        boolean hasMoneySymbol =
            lower.contains("$") ||
            lower.contains("cop") ||
            lower.matches(".*\\\\b\\\\d{1,3}(\\\\.\\\\d{3})+\\\\b.*");

        return (hasBankKeyword && (hasActionKeyword || hasMoneySymbol)) || (hasActionKeyword && hasMoneySymbol);
    }

    private static synchronized void enqueuePendingNotification(Context context, JSONObject item) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String raw = prefs.getString(KEY_PENDING, "[]");
            JSONArray arr = new JSONArray(raw);

            // Evitar duplicados exactos en menos de 2 minutos
            String newText = item.optString("fullText", "");
            long newTs = item.optLong("timestamp", 0);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject existing = arr.optJSONObject(i);
                if (existing != null) {
                    String exText = existing.optString("fullText", "");
                    long exTs = existing.optLong("timestamp", 0);
                    if (exText.equals(newText) && Math.abs(newTs - exTs) < 120000) {
                        return;
                    }
                }
            }

            arr.put(item);
            prefs.edit().putString(KEY_PENDING, arr.toString()).apply();
        } catch (Exception e) {
            Log.e(TAG, "Error saving pending notification", e);
        }
    }

    private void sendBackgroundCaptureNotice(Context context, String origTitle, String origBody) {
        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel ch = new NotificationChannel(
                    BG_CHANNEL_ID,
                    "Captura Automática de Movimientos",
                    NotificationManager.IMPORTANCE_HIGH
                );
                ch.setDescription("Avisos cuando keAhorro detecta una notificación bancaria en segundo plano");
                nm.createNotificationChannel(ch);
            }

            Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            PendingIntent pi = null;
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                int flags = PendingIntent.FLAG_UPDATE_CURRENT;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    flags |= PendingIntent.FLAG_IMMUTABLE;
                }
                pi = PendingIntent.getActivity(context, 0, launchIntent, flags);
            }

            Notification.Builder builder;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                builder = new Notification.Builder(context, BG_CHANNEL_ID);
            } else {
                builder = new Notification.Builder(context);
            }

            builder.setSmallIcon(android.R.drawable.ic_dialog_info)
                   .setContentTitle("🤖 keAhorro capturó un movimiento")
                   .setContentText(origBody)
                   .setAutoCancel(true);

            if (pi != null) {
                builder.setContentIntent(pi);
            }

            nm.notify((int) (System.currentTimeMillis() & 0xfffffff), builder.build());
        } catch (Exception e) {
            Log.e(TAG, "Error posting background notice", e);
        }
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        // No-op
    }
}
`;

const JAVA_MODULE_CODE = `package com.cristianmestra.gestiongastos;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.provider.Settings;
import android.text.TextUtils;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import org.json.JSONObject;

public class KeAhorroNotificationModule extends ReactContextBaseJavaModule {
    private static ReactApplicationContext reactContextInstance;

    public KeAhorroNotificationModule(ReactApplicationContext reactContext) {
        super(reactContext);
        reactContextInstance = reactContext;
    }

    @Override
    public String getName() {
        return "KeAhorroNotificationListener";
    }

    public static boolean emitBankNotificationToJS(JSONObject item) {
        try {
            if (reactContextInstance != null && reactContextInstance.hasActiveReactInstance()) {
                WritableMap map = Arguments.createMap();
                map.putString("id", item.optString("id", ""));
                map.putString("packageName", item.optString("packageName", ""));
                map.putString("title", item.optString("title", ""));
                map.putString("body", item.optString("body", ""));
                map.putString("fullText", item.optString("fullText", ""));
                map.putDouble("timestamp", (double) item.optLong("timestamp", System.currentTimeMillis()));

                reactContextInstance
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit("onKeAhorroBankNotification", map);
                return true;
            }
        } catch (Exception ignored) {
        }
        return false;
    }

    @ReactMethod
    public void hasPermission(Promise promise) {
        try {
            Context context = getReactApplicationContext();
            String pkgName = context.getPackageName();
            String flat = Settings.Secure.getString(
                context.getContentResolver(),
                "enabled_notification_listeners"
            );
            boolean enabled = false;
            if (!TextUtils.isEmpty(flat)) {
                String[] names = flat.split(":");
                for (String name : names) {
                    ComponentName cn = ComponentName.unflattenFromString(name);
                    if (cn != null && TextUtils.equals(pkgName, cn.getPackageName())) {
                        enabled = true;
                        break;
                    }
                }
            }
            promise.resolve(enabled);
        } catch (Exception e) {
            promise.resolve(false);
        }
    }

    @ReactMethod
    public void openPermissionSettings(Promise promise) {
        try {
            Context context = getReactApplicationContext();
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            promise.resolve(true);
        } catch (Exception e) {
            promise.resolve(false);
        }
    }

    @ReactMethod
    public void consumePendingNotifications(Promise promise) {
        try {
            Context context = getReactApplicationContext();
            SharedPreferences prefs = context.getSharedPreferences(
                KeAhorroNotificationListenerService.PREFS_NAME,
                Context.MODE_PRIVATE
            );
            String raw = prefs.getString(KeAhorroNotificationListenerService.KEY_PENDING, "[]");
            prefs.edit().putString(KeAhorroNotificationListenerService.KEY_PENDING, "[]").apply();
            promise.resolve(raw);
        } catch (Exception e) {
            promise.resolve("[]");
        }
    }

    @ReactMethod
    public void addListener(String eventName) {
        // Requerido por NativeEventEmitter en React Native
    }

    @ReactMethod
    public void removeListeners(Integer count) {
        // Requerido por NativeEventEmitter en React Native
    }
}
`;

const JAVA_PACKAGE_CODE = `package com.cristianmestra.gestiongastos;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class KeAhorroNotificationPackage implements ReactPackage {
    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
        return Collections.emptyList();
    }

    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
        List<NativeModule> modules = new ArrayList<>();
        modules.add(new KeAhorroNotificationModule(reactContext));
        return modules;
    }
}
`;

function withBankNotificationListener(config) {
  // 1. Registrar el <service> con BIND_NOTIFICATION_LISTENER_SERVICE en AndroidManifest.xml
  config = withAndroidManifest(config, (modConfig) => {
    const mainApp = modConfig.modResults.manifest.application?.[0];
    if (mainApp) {
      if (!mainApp.service) {
        mainApp.service = [];
      }
      const serviceName = '.KeAhorroNotificationListenerService';
      const alreadyExists = mainApp.service.some(
        (s) => s.$?.['android:name'] === serviceName
      );
      if (!alreadyExists) {
        mainApp.service.push({
          $: {
            'android:name': serviceName,
            'android:label': 'keAhorro Lector Bancario',
            'android:permission': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
            'android:exported': 'true',
          },
          'intent-filter': [
            {
              action: [
                {
                  $: {
                    'android:name': 'android.service.notification.NotificationListenerService',
                  },
                },
              ],
            },
          ],
        });
      }
    }
    return modConfig;
  });

  // 2. Registrar KeAhorroNotificationPackage en MainApplication.kt
  config = withMainApplication(config, (modConfig) => {
    let contents = modConfig.modResults.contents;
    if (!contents.includes('KeAhorroNotificationPackage')) {
      contents = contents.replace(
        /PackageList\(this\)\.packages\.apply\s*\{/,
        `PackageList(this).packages.apply {\n              add(KeAhorroNotificationPackage())`
      );
      modConfig.modResults.contents = contents;
    }
    return modConfig;
  });

  // 3. Escribir los archivos Java nativos durante el prebuild de Android
  config = withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const projectRoot = modConfig.modRequest.platformProjectRoot;
      const packageDir = path.join(
        projectRoot,
        'app',
        'src',
        'main',
        'java',
        'com',
        'cristianmestra',
        'gestiongastos'
      );
      fs.mkdirSync(packageDir, { recursive: true });

      fs.writeFileSync(
        path.join(packageDir, 'KeAhorroNotificationListenerService.java'),
        JAVA_SERVICE_CODE,
        'utf8'
      );
      fs.writeFileSync(
        path.join(packageDir, 'KeAhorroNotificationModule.java'),
        JAVA_MODULE_CODE,
        'utf8'
      );
      fs.writeFileSync(
        path.join(packageDir, 'KeAhorroNotificationPackage.java'),
        JAVA_PACKAGE_CODE,
        'utf8'
      );

      return modConfig;
    },
  ]);

  return config;
}

module.exports = withBankNotificationListener;
