// MIXPRO — удаление аккаунта целиком (логин + профиль + данные).
// Выполняется на сервере Supabase (Edge Function), не в браузере — только
// здесь можно безопасно использовать service_role ключ, который умеет
// удалять пользователей из Supabase Auth. Из браузера этого сделать
// нельзя (и не должно быть можно) — секретный ключ туда не передаётся.
//
// Как поставить: Supabase Dashboard → Edge Functions → Deploy a new
// function → Via Editor → назвать "delete-user" → вставить этот файл
// целиком → Deploy. Инструкция подробнее в docs/supabase/README.md.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { user_id } = await req.json();
    if (!user_id) throw new Error('user_id обязателен');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Не авторизован');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Проверяем, кто вызывает — через его собственный токен сессии.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) throw new Error('Не авторизован');

    // Дальше работаем с полными правами (service_role) — но только
    // после того, как убедились, что вызывающий — ADMIN.
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: callerProfile } = await admin
      .from('profiles').select('role').eq('id', caller.id).single();

    if (!callerProfile || callerProfile.role !== 'ADMIN') {
      throw new Error('Только ADMIN может удалять аккаунты');
    }
    if (caller.id === user_id) {
      throw new Error('Нельзя удалить самого себя');
    }

    // Чистим данные явно (не полагаемся на каскады в старых таблицах),
    // затем удаляем сам логин.
    await admin.from('scores').delete().eq('user_id', user_id);
    await admin.from('profiles').delete().eq('id', user_id);
    const { error: delErr } = await admin.auth.admin.deleteUser(user_id);
    if (delErr) throw delErr;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
