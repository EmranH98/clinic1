// =====================================================
// ClinicOS v3 — Authentication (Supabase Auth)
// =====================================================

// Current user profile (set after login)
let me = null;

// ── Login ─────────────────────────────────────────
async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const pass  = document.getElementById('loginPassword').value;

  if (!email || !pass) {
    showToast('error', 'Missing Fields', 'Please enter your email and password.');
    return;
  }

  const loginBtn = document.querySelector('#authScreen .btn-primary');
  loginBtn.textContent = 'Signing in…';
  loginBtn.disabled = true;

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) throw error;

    // Load profile from profiles table
    const profile = await loadProfile(data.user.id);
    if (!profile) throw new Error('Profile not found. Contact your administrator.');
    if (!profile.active) throw new Error('Your account has been deactivated. Contact your administrator.');

    me = profile;
    onLoginSuccess();
  } catch (err) {
    showToast('error', 'Login Failed', err.message || 'Invalid email or password.');
    loginBtn.textContent = 'Sign In →';
    loginBtn.disabled = false;
  }
}

// ── Load profile from DB ──────────────────────────
async function loadProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, branches(name, name_ar)')
    .eq('id', userId)
    .single();

  if (error) { console.error('Profile load error:', error); return null; }
  return data;
}

// ── On login success ──────────────────────────────
function onLoginSuccess() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('appShell').style.display   = 'block';
  initApp();
  showToast('success', `Welcome back, ${me.name.split(' ')[0]}! 👋`, ROLE_LABELS[me.role] + ' access granted.');
}

// ── Logout ────────────────────────────────────────
async function doLogout() {
  await supabase.auth.signOut();
  me = null;
  document.getElementById('appShell').style.display   = 'none';
  document.getElementById('authScreen').style.display = 'flex';
  document.getElementById('loginEmail').value    = '';
  document.getElementById('loginPassword').value = '';
}

// ── Check existing session on page load ───────────
async function checkSession() {
  // Wire up auth state listener here (after client is ready)
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      me = null;
      document.getElementById('appShell').style.display   = 'none';
      document.getElementById('authScreen').style.display = 'flex';
    }
  });

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const profile = await loadProfile(session.user.id);
      if (profile && profile.active) {
        me = profile;
        onLoginSuccess();
        return;
      }
    }
  } catch (err) {
    console.error('Session check error:', err);
  }

  // Show auth screen
  document.getElementById('authScreen').style.display = 'flex';
  document.getElementById('appShell').style.display   = 'none';
}

// ── Permission helpers ────────────────────────────
function hasPerm(key) {
  if (!me) return false;
  if (me.role === 'admin') return true;
  return !!(me.permissions && me.permissions[key]);
}

function isAdmin() { return me?.role === 'admin'; }
function isManager() { return me?.role === 'admin' || me?.role === 'branch_manager'; }

function requirePerm(key) {
  if (!hasPerm(key)) {
    showToast('error', 'Access Denied', 'You do not have permission to do this.');
    return false;
  }
  return true;
}

// ── Password reset (admin resets for other users) ─
async function adminResetPassword(userId, newPassword) {
  if (!isAdmin()) return showToast('error', 'Access Denied', 'Only admins can reset passwords.');
  // Supabase admin API (requires service role key — call via Edge Function in production)
  // For now, call our custom edge function
  const { data, error } = await supabase.functions.invoke('admin-reset-password', {
    body: { userId, newPassword }
  });
  if (error) { showToast('error', 'Error', error.message); return; }
  showToast('success', 'Password Reset', 'Password has been updated successfully.');
}

