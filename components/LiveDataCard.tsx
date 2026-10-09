import { useEffect, useState } from 'react';
import { Alert, Switch, View } from 'react-native';
import { AppText, Button, Card, Field, Row } from '@/components/Ui';
import { useJarvis } from '@/context/JarvisContext';
import { KNOWN_CITIES } from '@/lib/tools/cities';
import { clearFreeApiKey, hasFreeApiKey, setFreeApiKey } from '@/lib/net/apiKeys';
import { PROVIDERS, policyAudit } from '@/lib/net/providerPolicy';

/**
 * Live information and the zero-cost switch, in plain words. The provider
 * list is the manifest the policy enforces — the same data, not a copy.
 */
export function LiveDataCard({ advanced = false }: { advanced?: boolean }) {
  const jarvis = useJarvis();
  const { settings } = jarvis;
  const arabic = settings.language === 'ar';
  const [cityDraft, setCityDraft] = useState(settings.homeCity ?? 'Ajman');
  const [guardianKey, setGuardianKey] = useState('');
  const [hasGuardian, setHasGuardian] = useState(false);
  const [showProviders, setShowProviders] = useState(false);

  useEffect(() => {
    void hasFreeApiKey('guardian').then(setHasGuardian);
  }, []);
  useEffect(() => setCityDraft(settings.homeCity ?? 'Ajman'), [settings.homeCity]);

  const strict = settings.strictZeroCost ?? true;
  const refused = policyAudit().filter((entry) => !entry.allowed).length;

  const toggle = (label: string, value: boolean, onChange: (next: boolean) => void, note?: string) => (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText>{label}</AppText>
        <Switch value={value} onValueChange={onChange} />
      </View>
      {note ? <AppText muted>{note}</AppText> : null}
    </View>
  );

  return (
    <Card title={arabic ? 'المعلومات الحية والتكلفة صفر' : 'Live info & zero cost'}>
      <AppText muted>
        {arabic
          ? 'الطقس ومواقيت الصلاة والقرآن والأخبار من خدمات مجانية لا تطلب بطاقة. الوقت والحسابات والمؤقتات والملاحظات ورمز QR تعمل على الهاتف دون إنترنت.'
          : 'Weather, prayer times, Quran and news come from free services that never ask for a card. Time, sums, timers, notes and QR codes work on the phone with no internet.'}
      </AppText>

      <AppText>{arabic ? 'المدينة الأساسية' : 'Home city'}</AppText>
      <Row>
        {KNOWN_CITIES.slice(0, 4).map((city) => (
          <Button
            key={city.name}
            title={`${arabic ? city.nameAr : city.name}${settings.homeCity === city.name ? ' ✓' : ''}`}
            onPress={() => void jarvis.updateSettings({ homeCity: city.name })}
          />
        ))}
      </Row>
      <Field value={cityDraft} onChangeText={setCityDraft} placeholder={arabic ? 'مدينة أخرى' : 'Another city'} />
      <Button
        title={arabic ? 'احفظ المدينة' : 'Save city'}
        disabled={!cityDraft.trim() || cityDraft.trim() === settings.homeCity}
        onPress={() => void jarvis.updateSettings({ homeCity: cityDraft.trim() })}
      />

      <Row>
        {(['celsius', 'fahrenheit'] as const).map((unit) => (
          <Button
            key={unit}
            title={`${unit === 'celsius' ? '°C' : '°F'}${(settings.temperatureUnit ?? 'celsius') === unit ? ' ✓' : ''}`}
            onPress={() => void jarvis.updateSettings({ temperatureUnit: unit })}
          />
        ))}
      </Row>

      {advanced ? <>
      {toggle(
        arabic ? 'وضع التكلفة صفر (صارم)' : 'Strict zero-cost mode',
        strict,
        (value) => void jarvis.updateSettings({ strictZeroCost: value }),
        arabic
          ? `مفعّل: فقط ما على الهاتف والخدمات المجانية الموثّقة. أي خدمة غير معروفة تُرفض. طلبات رُفضت في هذه الجلسة: ${refused}.`
          : `On: only on-phone work and verified free services. Anything unknown is refused. Refused this session: ${refused}.`,
      )}

      {toggle(
        arabic ? 'الموقع التقريبي من الإنترنت' : 'Approximate location from the internet',
        Boolean(settings.ipLocationAllowed),
        (value) => void jarvis.updateSettings({ ipLocationAllowed: value }),
        arabic ? 'لسؤال «وين أنا». تقريبي، ولا يغيّر مدينتك الأساسية أبدًا.' : 'For "where am I". Approximate, and it never changes your home city.',
      )}

      {!strict
        ? toggle(
            arabic ? 'السماح بـ Puter (يدفع المستخدم)' : 'Allow Puter (user-pays)',
            Boolean(settings.puterConsent),
            (value) => void jarvis.updateSettings({ puterConsent: value }),
            arabic
              ? 'لـ Puter رصيد شهري مجاني ثم يطلب الترقية. جارفيس يتوقف عنده فورًا عند نفاد الرصيد ولن يطلب منك الدفع.'
              : 'Puter gives a free monthly allowance, then asks to upgrade. JARVIS stops using it the moment the allowance runs out and never asks you to pay.',
          )
        : null}
      {settings.puterExhaustedAt ? (
        <AppText muted>
          {arabic ? 'رصيد Puter المجاني انتهى — متوقف حتى الشهر القادم.' : "Puter's free allowance ran out — stopped until next month."}
        </AppText>
      ) : null}

      <AppText>{arabic ? 'عناوين الأخبار (The Guardian)' : 'Headlines (The Guardian)'}</AppText>
      <AppText muted>
        {hasGuardian
          ? arabic ? 'المفتاح محفوظ في خزنة الهاتف.' : 'Key saved in the phone keystore.'
          : arabic
            ? 'مفتاح مجاني دون بطاقة من open-platform.theguardian.com — مرة واحدة.'
            : 'A free key, no card, from open-platform.theguardian.com — once.'}
      </AppText>
      {hasGuardian ? (
        <Button
          title={arabic ? 'احذف المفتاح' : 'Remove key'}
          danger
          onPress={() => void clearFreeApiKey('guardian').then(() => setHasGuardian(false))}
        />
      ) : (
        <>
          <Field secureTextEntry value={guardianKey} onChangeText={setGuardianKey} placeholder="Guardian API key" />
          <Button
            title={arabic ? 'احفظ المفتاح' : 'Save key'}
            disabled={!guardianKey.trim()}
            onPress={() =>
              void setFreeApiKey('guardian', guardianKey)
                .then(() => {
                  setGuardianKey('');
                  setHasGuardian(true);
                })
                .catch(() => Alert.alert(arabic ? 'مفتاح غير صالح' : 'That key does not look right'))
            }
          />
        </>
      )}

      {toggle(
        arabic ? 'وضع الوصول (تسميات مرئية)' : 'Accessibility mode (visible labels)',
        Boolean(settings.coreLabels),
        (value) => void jarvis.updateSettings({ coreLabels: value }),
      )}
      <Button title={arabic ? 'اعرض شرح الإيماءات مجددًا' : 'Show the gesture guide again'} onPress={() => void jarvis.updateSettings({ coreHintSeen: false })} />

      <Button title={showProviders ? (arabic ? 'إخفاء الخدمات' : 'Hide services') : arabic ? 'الخدمات وشروطها' : 'Services and their terms'} onPress={() => setShowProviders((v) => !v)} />
      {showProviders
        ? Object.values(PROVIDERS).map((provider) => (
            <AppText key={provider.id} muted>
              {provider.name} — {provider.class} · {provider.limits} · {provider.termsUrl} ({provider.checked})
            </AppText>
          ))
        : null}
      </> : null}
    </Card>
  );
}
