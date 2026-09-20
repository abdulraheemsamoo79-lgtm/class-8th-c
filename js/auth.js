import { CONFIG } from './config.js';
import { sb } from './db.js';
import { esc, friendlyError } from './utils.js';

function pwField(id, label, auto) {
  return `<div class="row"><label for="${id}">${label}</label>
    <div class="pw"><input class="field" id="${id}" type="password" autocomplete="${auto}" required>
    <button type="button" class="pwt" aria-label="Show password">👁</button></div></div>`;
}

export function renderAuth(view, mode) {
  document.body.classList.add('auth-mode');
  const signup = mode === 'signup';
  view.innerHTML = `
  <div class="auth"><div class="auth-card">
    <div class="logo">📓</div>
    <h1>${esc(CONFIG.APP_NAME)}</h1>
    <p class="muted sub">${signup ? 'Create an account to see the class notes.' : 'Log in to see the class notes.'}</p>
    <form id="af" novalidate>
      ${signup ? `<div class="row"><label for="fn">Your full name</label><input class="field" id="fn" autocomplete="name" maxlength="40" placeholder="e.g. Ali Ahmed"></div>` : ''}
      <div class="row"><label for="em">Email</label><input class="field" id="em" type="email" autocomplete="email" inputmode="email" placeholder="you@gmail.com"></div>
      ${pwField('pw', 'Password', signup ? 'new-password' : 'current-password')}
      ${signup ? `<div class="row"><label for="cc">Class code</label><input class="field" id="cc" autocomplete="off" placeholder="Get it from your class teacher / admin"></div>` : ''}
      <div class="err" id="ae" role="alert"></div>
      <button class="btn block" id="ab" type="submit">${signup ? 'Create account' : 'Login'}</button>
    </form>
    <p class="switch">${signup ? 'Already have an account? <a href="#/login">Log in</a>' : 'New here? <a href="#/signup">Create account</a>'}</p>
  </div></div>`;

  view.querySelectorAll('.pwt').forEach(b => b.onclick = () => {
    const i = b.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password';
  });

  const form = view.querySelector('#af'), err = view.querySelector('#ae'), btn = view.querySelector('#ab');
  const v = id => (view.querySelector('#' + id)?.value || '').trim();

  form.onsubmit = async e => {
    e.preventDefault(); err.textContent = '';
    const email = v('em'), password = view.querySelector('#pw').value;
    if (!/^\S+@\S+\.\S+$/.test(email)) return err.textContent = 'Enter a valid email.';
    if (password.length < 6) return err.textContent = 'Password must be at least 6 characters.';
    const label = btn.textContent; btn.disabled = true; btn.textContent = 'Please wait…';
    try {
      if (signup) {
        const name = v('fn'), code = v('cc');
        if (name.length < 2) throw new Error('__Enter your name.');
        if (!code) throw new Error('__Enter the class code.');
        const chk = await sb.rpc('check_class_code', { p_code: code });
        if (chk.error) throw chk.error;
        if (!chk.data) throw new Error('__Wrong class code.');
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: name, class_code: code } } });
        if (error) throw error;
        if (!data.session) {
          err.style.color = 'var(--ok)';
          err.textContent = 'Account created! Verify your email, then log in.';
          btn.textContent = label; btn.disabled = false; return;
        }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      document.dispatchEvent(new CustomEvent('app:login'));
    } catch (ex) {
      const m = String(ex?.message || '');
      err.style.color = '';
      err.textContent = m.startsWith('__') ? m.slice(2) : friendlyError(ex);
      btn.textContent = label; btn.disabled = false;
    }
  };
}

export function renderBanned(view, reason) {
  document.body.classList.add('auth-mode');
  view.innerHTML = `
  <div class="auth"><div class="auth-card">
    <div class="logo">🚫</div>
    <h1>Account blocked</h1>
    <p class="muted sub">The admin has blocked your account. You cannot view or upload notes.</p>
    ${reason ? `<div class="notice">Reason: ${esc(reason)}</div>` : ''}
    <p class="muted">If this is a mistake, please talk to your class admin.</p>
    <button class="btn block ghost" id="bo">Logout</button>
  </div></div>`;
  view.querySelector('#bo').onclick = () => document.dispatchEvent(new CustomEvent('app:logout'));
}

export function renderProblem(view, title, text) {
  document.body.classList.add('auth-mode');
  view.innerHTML = `
  <div class="auth"><div class="auth-card">
    <div class="logo">⚠️</div>
    <h1>${esc(title)}</h1>
    <p class="muted sub">${esc(text)}</p>
    <button class="btn block" id="pr">Try again</button>
    <p class="switch"><a href="#" id="pl">Logout</a></p>
  </div></div>`;
  view.querySelector('#pr').onclick = () => document.dispatchEvent(new CustomEvent('app:retry'));
  view.querySelector('#pl').onclick = e => { e.preventDefault(); document.dispatchEvent(new CustomEvent('app:logout')); };
}
