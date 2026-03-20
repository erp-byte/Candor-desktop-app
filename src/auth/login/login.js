// ── Login page logic ──
const { ipcRenderer } = require('electron');

let _env = {};
getEnv().then(env => { _env = env; });

const form = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passInput = document.getElementById('password');
const eyeToggle = document.getElementById('eyeToggle');
const eyeOpen = document.getElementById('eyeOpen');
const eyeClosed = document.getElementById('eyeClosed');
const loginBtn = document.getElementById('loginBtn');
const forgotBtn = document.getElementById('forgotBtn');
const forgotModal = document.getElementById('forgotModal');
const modalCancel = document.getElementById('modalCancel');
const modalSend = document.getElementById('modalSend');
const welcomeScreen = document.getElementById('welcomeScreen');

// ── Eye toggle ──
let passVisible = false;
eyeToggle.addEventListener('click', () => {
  passVisible = !passVisible;
  passInput.type = passVisible ? 'text' : 'password';
  eyeOpen.style.display = passVisible ? 'none' : 'block';
  eyeClosed.style.display = passVisible ? 'block' : 'none';
  eyeToggle.setAttribute('aria-label', passVisible ? 'Hide password' : 'Show password');
});

// ── Clear error state on input ──
emailInput.addEventListener('input', () => emailInput.classList.remove('has-error'));
passInput.addEventListener('input', () => passInput.classList.remove('has-error'));

// ── Form submit ──
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = emailInput.value.trim();
  const pass = passInput.value;

  if (!email) {
    emailInput.classList.add('has-error');
    emailInput.focus();
    showToast('Please enter your email address');
    form.classList.add('shake');
    setTimeout(() => form.classList.remove('shake'), 500);
    return;
  }

  if (!pass) {
    passInput.classList.add('has-error');
    passInput.focus();
    showToast('Please enter your password');
    form.classList.add('shake');
    setTimeout(() => form.classList.remove('shake'), 500);
    return;
  }

  loginBtn.classList.add('loading');
  loginBtn.disabled = true;

  await new Promise(r => setTimeout(r, 1200));

  if (email === _env.MOCK_AUTH_EMAIL && pass === _env.MOCK_AUTH_PASSWORD) {
    showToast('Authentication successful', 'success');
    setTimeout(() => {
      welcomeScreen.classList.add('show');
    }, 600);
    setTimeout(() => {
      clearAllPageStates();
      ipcRenderer.send('navigate-to-modules', { from: 'login' });
    }, 2000);
  } else {
    loginBtn.classList.remove('loading');
    loginBtn.disabled = false;
    emailInput.classList.add('has-error');
    passInput.classList.add('has-error');
    showToast('Invalid email or password');
    form.classList.add('shake');
    setTimeout(() => form.classList.remove('shake'), 500);
  }
});

// ── Forgot password modal ──
forgotBtn.addEventListener('click', () => {
  document.getElementById('resetEmail').value = emailInput.value;
  forgotModal.classList.add('show');
});

modalCancel.addEventListener('click', () => {
  forgotModal.classList.remove('show');
});

forgotModal.addEventListener('click', (e) => {
  if (e.target === forgotModal) forgotModal.classList.remove('show');
});

modalSend.addEventListener('click', () => {
  const resetEmail = document.getElementById('resetEmail').value.trim();
  if (!resetEmail) {
    document.getElementById('resetEmail').classList.add('has-error');
    return;
  }
  forgotModal.classList.remove('show');
  showToast('Password reset link sent to your email', 'success');
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && forgotModal.classList.contains('show')) {
    forgotModal.classList.remove('show');
  }
});
