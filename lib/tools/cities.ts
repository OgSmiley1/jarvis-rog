/**
 * Places JARVIS knows without asking the network.
 *
 * Ajman is resolved from its own coordinates, not the brief's sample
 * (25.20, 55.28 is Dubai). Each entry carries its timezone and the Aladhan
 * calculation method used locally, so a prayer schedule is computed the way
 * that country's mosques announce it. Coordinates are city centres (WGS84).
 */

export interface City {
  name: string;
  nameAr: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  timezone: string;
  /** Aladhan method id; undefined lets Aladhan pick the nearest authority. */
  prayerMethod?: number;
}

const UAE = { country: 'United Arab Emirates', countryCode: 'AE', timezone: 'Asia/Dubai', prayerMethod: 16 };
const KSA = { country: 'Saudi Arabia', countryCode: 'SA', timezone: 'Asia/Riyadh', prayerMethod: 4 };

export const KNOWN_CITIES: City[] = [
  { name: 'Ajman', nameAr: 'عجمان', latitude: 25.4136, longitude: 55.4456, ...UAE },
  { name: 'Dubai', nameAr: 'دبي', latitude: 25.2048, longitude: 55.2708, ...UAE },
  { name: 'Sharjah', nameAr: 'الشارقة', latitude: 25.3463, longitude: 55.4209, ...UAE },
  { name: 'Abu Dhabi', nameAr: 'أبوظبي', latitude: 24.4539, longitude: 54.3773, ...UAE },
  { name: 'Umm Al Quwain', nameAr: 'أم القيوين', latitude: 25.5647, longitude: 55.5552, ...UAE },
  { name: 'Ras Al Khaimah', nameAr: 'رأس الخيمة', latitude: 25.7895, longitude: 55.9432, ...UAE },
  { name: 'Fujairah', nameAr: 'الفجيرة', latitude: 25.1288, longitude: 56.3265, ...UAE },
  { name: 'Al Ain', nameAr: 'العين', latitude: 24.2075, longitude: 55.7447, ...UAE },
  { name: 'Riyadh', nameAr: 'الرياض', latitude: 24.7136, longitude: 46.6753, ...KSA },
  { name: 'Jeddah', nameAr: 'جدة', latitude: 21.4858, longitude: 39.1925, ...KSA },
  { name: 'Makkah', nameAr: 'مكة', latitude: 21.3891, longitude: 39.8579, ...KSA },
  { name: 'Madinah', nameAr: 'المدينة', latitude: 24.5247, longitude: 39.5692, ...KSA },
  { name: 'Doha', nameAr: 'الدوحة', country: 'Qatar', countryCode: 'QA', latitude: 25.2854, longitude: 51.531, timezone: 'Asia/Qatar', prayerMethod: 10 },
  { name: 'Kuwait City', nameAr: 'الكويت', country: 'Kuwait', countryCode: 'KW', latitude: 29.3759, longitude: 47.9774, timezone: 'Asia/Kuwait', prayerMethod: 9 },
  { name: 'Manama', nameAr: 'المنامة', country: 'Bahrain', countryCode: 'BH', latitude: 26.2285, longitude: 50.586, timezone: 'Asia/Bahrain', prayerMethod: 8 },
  { name: 'Muscat', nameAr: 'مسقط', country: 'Oman', countryCode: 'OM', latitude: 23.588, longitude: 58.3829, timezone: 'Asia/Muscat', prayerMethod: 8 },
  { name: 'Cairo', nameAr: 'القاهرة', country: 'Egypt', countryCode: 'EG', latitude: 30.0444, longitude: 31.2357, timezone: 'Africa/Cairo', prayerMethod: 5 },
  { name: 'Khartoum', nameAr: 'الخرطوم', country: 'Sudan', countryCode: 'SD', latitude: 15.5007, longitude: 32.5599, timezone: 'Africa/Khartoum' },
  { name: 'London', nameAr: 'لندن', country: 'United Kingdom', countryCode: 'GB', latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London', prayerMethod: 15 },
];

const ALIASES: Record<string, string> = {
  mecca: 'Makkah', makka: 'Makkah', medina: 'Madinah', kuwait: 'Kuwait City', rak: 'Ras Al Khaimah',
  abudhabi: 'Abu Dhabi', uaq: 'Umm Al Quwain', 'um al quwain': 'Umm Al Quwain', 'ras al-khaimah': 'Ras Al Khaimah',
  'مكة المكرمة': 'Makkah', 'المدينة المنورة': 'Madinah', 'ابوظبي': 'Abu Dhabi', 'أبو ظبي': 'Abu Dhabi', 'ابو ظبي': 'Abu Dhabi',
  'دبى': 'Dubai', 'الشارقه': 'Sharjah', 'عجمان': 'Ajman',
};

export function normalizePlace(text: string): string {
  return text.trim().toLowerCase().replace(/[.,!?؟،]/g, '').replace(/\s+/g, ' ');
}

export function findKnownCity(query: string): City | undefined {
  const q = normalizePlace(query);
  if (!q) return undefined;
  const alias = ALIASES[q] ?? ALIASES[q.replace(/\s/g, '')];
  const target = alias ? normalizePlace(alias) : q;
  return KNOWN_CITIES.find((city) => normalizePlace(city.name) === target || city.nameAr === query.trim() || normalizePlace(city.nameAr) === target);
}

export const DEFAULT_HOME_CITY = 'Ajman';
