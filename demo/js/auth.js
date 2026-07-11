const SB = supabase.createClient(
  'https://mwzskffecoedpvyflswg.supabase.co',
  'sb_publishable_m1ImqMRye4s4yrpuBTvWvA_yMez-ZhD'
);

function showTab(t) {
  document.getElementById('formLogin').style.display = t === 'login' ? 'block' : 'none';
  document.getElementById('formReg').style.display = t === 'reg' ? 'block' : 'none';
  document.getElementById('tabLogin').classList.toggle('on', t === 'login');
  document.getElementById('tabReg').classList.toggle('on', t === 'reg');
}

async function doLogin() {
  const btn = document.getElementById('loginBtn');
  const msg = document.getElementById('loginMsg');
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPass').value;
  
  if (!email || !pass) { msg.className='msg err'; msg.textContent='Заполни все поля'; return; }
  
  btn.disabled = true; msg.className='msg'; msg.textContent='Входим...';
  
  const { error } = await SB.auth.signInWithPassword({ email, password: pass });
  if (error) { msg.className='msg err'; msg.textContent=error.message; btn.disabled=false; return; }
  
  msg.className='msg ok'; msg.textContent='Успешно! Перенаправляем...';
  setTimeout(() => location.href='profile.html', 800);
}

async function doRegister() {
  const btn = document.getElementById('regBtn');
  const msg = document.getElementById('regMsg');
  const name  = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const pass  = document.getElementById('regPass').value;
  
  if (!name || !email || !pass) { msg.className='msg err'; msg.textContent='Заполни все поля'; return; }
  if (name.length < 3) { msg.className='msg err'; msg.textContent='Никнейм минимум 3 символа'; return; }
  if (pass.length < 6) { msg.className='msg err'; msg.textContent='Пароль минимум 6 символов'; return; }
  
  btn.disabled = true; msg.className='msg'; msg.textContent='Создаём аккаунт...';

  const { data: existing, error: checkErr } = await SB.from('profiles').select('id').eq('username', name).maybeSingle();
  if (checkErr) { msg.className='msg err'; msg.textContent='Ошибка проверки никнейма'; btn.disabled=false; return; }
  if (existing) { msg.className='msg err'; msg.textContent='Этот никнейм уже занят'; btn.disabled=false; return; }

  const { data, error } = await SB.auth.signUp({ email, password: pass });
  if (error) { msg.className='msg err'; msg.textContent=error.message; btn.disabled=false; return; }
  if (!data.user) { msg.className='msg err'; msg.textContent='Не удалось создать аккаунт'; btn.disabled=false; return; }

  const colors = ['#22d3ee','#a78bfa','#4ade80','#facc15','#f87171','#fb923c'];
  const color = colors[Math.floor(Math.random()*colors.length)];
  const { error: profileErr } = await SB.from('profiles').insert({ id: data.user.id, username: name, avatar_color: color });
  
  if (profileErr) { msg.className='msg err'; msg.textContent='Аккаунт создан, но профиль не сохранился: '+profileErr.message; btn.disabled=false; return; }

  if (!data.session) {
    msg.className='msg ok'; msg.textContent='Аккаунт создан! Подтверди email и войди.';
    btn.disabled=false; return;
  }

  msg.className='msg ok'; msg.textContent='Аккаунт создан! Входим...';
  setTimeout(() => location.href='profile.html', 900);
}

SB.auth.getSession().then(({ data }) => {
  if (data.session) location.href = 'profile.html';
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const isLogin = document.getElementById('formLogin').style.display !== 'none';
  if (isLogin) doLogin(); else doRegister();
});