/* =========================================================
   auth.js — Authentication
   ========================================================= */
'use strict';

// ── Login Page Init ───────────────────────────────────────
async function initLoginPage() {
  // If already logged in, redirect
  if (Auth.isLoggedIn()) {
    window.location.href = 'dashboard.html';
    return;
  }

  const form      = document.getElementById('login-form');
  const emailInp  = document.getElementById('login-email');
  const passInp   = document.getElementById('login-password');
  const submitBtn = document.getElementById('login-submit');
  const passToggle= document.getElementById('toggle-password');
  const forgotBtn = document.getElementById('forgot-link');

  // Restore remembered email
  const remembered = localStorage.getItem(LS.REMEMBER);
  if (remembered) {
    emailInp.value = remembered;
    document.getElementById('remember-me').checked = true;
  }

  // Toggle password visibility
  if (passToggle) {
    passToggle.addEventListener('click', () => {
      passInp.type = passInp.type === 'password' ? 'text' : 'password';
      passToggle.textContent = passInp.type === 'password' ? '👁️' : '🙈';
    });
  }

  // Forgot password
  if (forgotBtn) {
    forgotBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const email = emailInp.value.trim();
      if (!email) { Toast.warning('Enter your email first.'); return; }
      Loader.show();
      const res = await API.forgotPassword(email);
      Loader.hide();
      if (res.success) Toast.success('Password reset link sent to your email.');
      else Toast.error(res.error || 'Could not send reset link.');
    });
  }

  // Form submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = emailInp.value.trim();
    const password = passInp.value;
    const remember = document.getElementById('remember-me').checked;

    // Validation
    let ok = true;
    if (!email)    { setInvalid(emailInp, 'Email is required'); ok = false; }
    else if (!/\S+@\S+\.\S+/.test(email)) { setInvalid(emailInp, 'Invalid email'); ok = false; }
    else clearInvalid(emailInp);

    if (!password) { setInvalid(passInp, 'Password is required'); ok = false; }
    else clearInvalid(passInp);

    if (!ok) return;

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px"></span> Signing in…';

    const res = await API.login(email, password);

    submitBtn.disabled = false;
    submitBtn.innerHTML = '🔐 Sign In';

    if (res.success) {
      if (remember) localStorage.setItem(LS.REMEMBER, email);
      else localStorage.removeItem(LS.REMEMBER);

      Auth.setUser(res.user);
      Toast.success(`Welcome back, ${res.user.name}!`);
      setTimeout(() => window.location.href = 'dashboard.html', 800);
    } else {
      Toast.error(res.error || 'Invalid credentials. Please try again.');
      passInp.value = '';
    }
  });

  // Demo login helper (dev)
  document.getElementById('demo-admin')?.addEventListener('click', () => {
    emailInp.value = 'admin@balaji.com';
    passInp.value  = 'Admin@123';
  });
  document.getElementById('demo-emp')?.addEventListener('click', () => {
    emailInp.value = 'emp@balaji.com';
    passInp.value  = 'Emp@123';
  });
}

function setInvalid(el, msg) {
  el.classList.add('is-invalid');
  let fb = el.nextElementSibling;
  if (!fb || !fb.classList.contains('invalid-feedback')) {
    fb = document.createElement('div');
    fb.className = 'invalid-feedback';
    el.parentNode.insertBefore(fb, el.nextSibling);
  }
  fb.textContent = msg;
}
function clearInvalid(el) {
  el.classList.remove('is-invalid');
  const fb = el.nextElementSibling;
  if (fb?.classList.contains('invalid-feedback')) fb.remove();
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('login-form')) initLoginPage();
});
