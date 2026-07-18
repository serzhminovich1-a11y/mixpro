// MIXPRO — бан / разбан пользователя + внесение его email в чёрный список
// (docs/supabase/migrations/031_ban_system.sql). Сам флаг profiles.is_banned
// админ переключает прямо из браузера (обычный update, через RLS-политику
// profiles_update_admin) — эта функция нужна ТОЛЬКО для той части, которую
// из браузера сделать нельзя: узнать email пользователя (он не хранится в
// profiles, только в Supabase Auth) и записать/убрать его из banned_emails,
// чтобы забаненный не смог тут же зарегистрироваться заново под тем же
// адресом. Требует service_role — см. docs/supabase/functions/delete-user
// для инструкции по установке (тот же принцип, другое имя функции:
// "ban-user").

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
    const { user_id, action, reason } = await req.json();
    if (!user_id) throw new Error('user_id обязателен');
    if (action !== 'ban' && action !== 'unban') throw new Error('action должен быть "ban" или "unban"');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Не авторизован');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) throw new Error('Не авторизован');

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: callerProfile } = await admin
      .from('profiles').select('role').eq('id', caller.id).single();
    if (!callerProfile || callerProfile.role !== 'ADMIN') {
      throw new Error('Только ADMIN может банить пользователей');
    }
    if (caller.id === user_id) {
      throw new Error('Нельзя забанить самого себя');
    }

    const { data: target } = await admin.auth.admin.getUserById(user_id);
    const email = target?.user?.email || null;

    if (action === 'ban') {
      if (email) {
        await admin.from('banned_emails').upsert({
          email: email.toLowerCase(),
          reason: reason || null,
          banned_by: caller.id,
          banned_at: new Date().toISOString(),
        });
      }
    } else {
      if (email) {
        await admin.from('banned_emails').delete().eq('email', email.toLowerCase());
      }
    }

    return new Response(JSON.stringify({ ok: true, email_blocked: action === 'ban' ? !!email : undefined }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
