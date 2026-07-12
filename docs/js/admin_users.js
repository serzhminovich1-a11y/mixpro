const SB = supabase.createClient(
  'https://mwzskffecoedpvyflswg.supabase.co',
  'sb_publishable_m1ImqMRye4s4yrpuBTvWvA_yMez-ZhD'
);

const ROLES = ['STUDENT', 'ENGINEER', 'MENTOR', 'VERIFIED_PRO', 'ADMIN'];
const VSTATUSES = ['none', 'pending', 'approved', 'rejected'];

let allUsers = [];

function flashSaved(el){
  const dot = el.parentElement.querySelector('.au-saved');
  if (!dot) return;
  dot.classList.add('show');
  setTimeout(() => dot.classList.remove('show'), 1200);
}

async function saveField(userId, field, value, el){
  const { error } = await SB.from('profiles').update({ [field]: value }).eq('id', userId);
  if (error) {
    alert('Не удалось сохранить: ' + error.message);
    return;
  }
  flashSaved(el);
}

function userRow(u){
  const tr = document.createElement('tr');

  const roleOptions = ROLES.map(r => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${r}</option>`).join('');
  const vOptions = VSTATUSES.map(v => `<option value="${v}" ${v === u.verification_status ? 'selected' : ''}>${v}</option>`).join('');
  const initials = (u.username || '??').slice(0, 2).toUpperCase();
  const date = u.created_at ? new Date(u.created_at).toLocaleDateString('ru-RU') : '—';

  tr.innerHTML = `
    <td><div class="au-user"><div class="au-avatar" style="background:${u.avatar_color || ''}">${initials}</div><div class="au-username">${u.username || '(без имени)'}</div></div></td>
    <td><select class="au-role role-${u.role}">${roleOptions}</select><span class="au-saved"></span></td>
    <td><input type="number" class="au-xp" value="${u.xp || 0}" min="0"><span class="au-saved"></span></td>
    <td><select class="au-vstatus">${vOptions}</select><span class="au-saved"></span></td>
    <td class="au-date">${date}</td>`;

  const roleSel = tr.querySelector('.au-role');
  roleSel.addEventListener('change', () => {
    roleSel.className = 'au-role role-' + roleSel.value;
    saveField(u.id, 'role', roleSel.value, roleSel);
  });
  tr.querySelector('.au-xp').addEventListener('change', (e) => {
    const val = Math.max(0, parseInt(e.target.value, 10) || 0);
    e.target.value = val;
    saveField(u.id, 'xp', val, e.target);
  });
  tr.querySelector('.au-vstatus').addEventListener('change', (e) => {
    saveField(u.id, 'verification_status', e.target.value, e.target);
  });

  return tr;
}

function renderUsers(list){
  const body = document.getElementById('usersBody');
  body.innerHTML = '';
  list.forEach(u => body.appendChild(userRow(u)));
  document.getElementById('userCount').textContent = list.length + ' из ' + allUsers.length;
}

function handleSearch(){
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  const filtered = q ? allUsers.filter(u => (u.username || '').toLowerCase().includes(q)) : allUsers;
  renderUsers(filtered);
}

async function logout() {
  await SB.auth.signOut();
  location.href = 'auth.html';
}

async function init() {
  const { data: { session } } = await SB.auth.getSession();
  if (!session) { location.href = 'auth.html'; return; }
  const uid = session.user.id;

  const { data: profile } = await SB.from('profiles').select('role').eq('id', uid).single();
  document.getElementById('loading').style.display = 'none';

  if (!profile || profile.role !== 'ADMIN') {
    document.getElementById('noAccess').style.display = 'block';
    return;
  }

  document.getElementById('content').style.display = 'flex';
  document.getElementById('content').style.flexDirection = 'column';
  document.getElementById('content').style.gap = '20px';

  const { data: users } = await SB.from('profiles').select('*').order('created_at', { ascending: false });
  allUsers = users || [];
  renderUsers(allUsers);

  document.getElementById('searchInput').addEventListener('input', handleSearch);
}

init();
