// Общий клиент Supabase для SPA-ядра (Главная/Лента/Курсы/Рейтинг/Портфолио).
// Один клиент вместо создания нового на каждой странице, плюс кэш
// сессии/профиля на время работы SPA — именно это убирает повторный
// поход в Supabase при каждом переходе между экранами.
export const SB = supabase.createClient(
  'https://mwzskffecoedpvyflswg.supabase.co',
  'sb_publishable_m1ImqMRye4s4yrpuBTvWvA_yMez-ZhD'
);

let sessionPromise = null;
let profilePromise = null;

export function getSession(force) {
  if (force || !sessionPromise) {
    sessionPromise = SB.auth.getSession().then(({ data }) => data.session);
  }
  return sessionPromise;
}

export async function getMyProfile(force) {
  const session = await getSession();
  if (!session) return null;
  if (force || !profilePromise) {
    profilePromise = SB.from('profiles').select('*').eq('id', session.user.id).single()
      .then(({ data }) => data || null);
  }
  return profilePromise;
}

// Звать после правок своего профиля/роли (например, из настроек или
// когда админ меняет себе роль), чтобы следующий переход подхватил
// свежие данные, а не старые из кэша.
export function invalidateProfileCache() {
  profilePromise = null;
}

export function invalidateSessionCache() {
  sessionPromise = null;
  profilePromise = null;
}

// Общий logout — раньше каждая страница объявляла свою копию этой же
// функции. Централизован тут, потому что теперь есть общий SB-клиент,
// и потому что onclick="logout()" в разметке ищет функцию в window,
// а не внутри модуля экрана — экранные модули её больше не объявляют.
export async function logout() {
  await SB.auth.signOut();
  invalidateSessionCache();
  const inPages = location.pathname.includes('/pages/');
  location.href = inPages ? 'auth.html' : 'pages/auth.html';
}
window.logout = logout;

