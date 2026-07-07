/* ============================================================
 * MamaVege 共用登录 + 权限模块（Supabase Auth + app_permissions 白名单）
 * ============================================================
 * 用法（页面需先引入 supabase.min.js）：
 *
 *   <script src="../supabase.min.js"></script>
 *   <script src="../js/auth/auth.js"></script>
 *   <script>
 *     MVAuth.init({ module: 'finance', minRole: 'viewer' }).then(ctx => {
 *       // ctx.client  — 已登录的 supabase client（带用户 JWT，RLS 生效）
 *       // ctx.email   — 登录邮箱
 *       // ctx.role    — 该模块角色：admin / editor / viewer
 *       startApp(ctx);
 *     });
 *   </script>
 *
 * 权限模型：Supabase 表 app_permissions (email / module / role)
 *   - module: finance / purchasing / hr / warehouse / production ...
 *             'all' = 全模块通配
 *   - role:   admin > editor > viewer
 * 真正的数据保护在数据库 RLS 层——没登录或不在白名单，查表返回空。
 * 前端拦截只是体验层。
 * ============================================================ */
(function (global) {
  'use strict';

  const SUPA_URL = 'https://wjhgezvrxlhpexocfsea.supabase.co';
  const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqaGdlenZyeGxocGV4b2Nmc2VhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MDU4NzgsImV4cCI6MjA5NDA4MTg3OH0.jENcrgEDYDlSRUCqve-T6rxYRJfz-dnZQHnXpPLJ_RE';

  const ROLE_RANK = { viewer: 1, editor: 2, admin: 3 };
  let _client = null;

  function getClient() {
    if (!_client) {
      _client = global.supabase.createClient(SUPA_URL, SUPA_ANON);
    }
    return _client;
  }

  /* ---------- UI ---------- */

  const CSS = `
  .mvauth-overlay{position:fixed;inset:0;background:#166534;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;font-family:'DM Sans',sans-serif;}
  .mvauth-card{background:#fff;border-radius:20px;box-shadow:0 8px 40px rgba(0,0,0,.2);padding:36px 32px;width:100%;max-width:400px;}
  .mvauth-logo{text-align:center;margin-bottom:6px;}
  .mvauth-logo img{height:42px;}
  .mvauth-sub{text-align:center;color:#9ca3af;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-bottom:22px;}
  .mvauth-tabs{display:flex;background:#f3f4f6;border-radius:10px;padding:4px;margin-bottom:20px;}
  .mvauth-tab{flex:1;border:none;background:transparent;padding:8px;border-radius:8px;font-size:13px;font-weight:600;color:#6b7280;cursor:pointer;font-family:inherit;}
  .mvauth-tab.active{background:#fff;color:#166534;box-shadow:0 1px 3px rgba(0,0,0,.08);}
  .mvauth-field{margin-bottom:14px;}
  .mvauth-field label{display:block;font-size:11px;font-weight:700;color:#4b5563;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;}
  .mvauth-field input{width:100%;padding:12px 14px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:15px;font-family:inherit;background:#f9fafb;transition:all .2s;box-sizing:border-box;}
  .mvauth-field input:focus{outline:none;border-color:#166534;background:#fff;}
  .mvauth-btn{width:100%;padding:13px;background:#166534;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;margin-top:6px;font-family:inherit;transition:background .2s;}
  .mvauth-btn:hover{background:#14532d;}
  .mvauth-btn:disabled{opacity:.5;cursor:not-allowed;}
  .mvauth-msg{padding:10px 14px;border-radius:8px;font-size:13px;margin-top:12px;display:none;line-height:1.5;}
  .mvauth-msg.err{background:#fef2f2;color:#dc2626;}
  .mvauth-msg.ok{background:#f0fdf4;color:#166534;}
  .mvauth-msg.show{display:block;}
  .mvauth-hint{font-size:11px;color:#9ca3af;margin-top:14px;text-align:center;line-height:1.6;}
  .mvauth-denied-icon{font-size:40px;text-align:center;margin-bottom:10px;}
  .mvauth-denied-title{font-size:17px;font-weight:700;color:#111827;text-align:center;margin-bottom:8px;}
  .mvauth-denied-text{font-size:13px;color:#6b7280;text-align:center;line-height:1.7;margin-bottom:18px;}
  `;

  function ensureStyles() {
    if (document.getElementById('mvauth-css')) return;
    const s = document.createElement('style');
    s.id = 'mvauth-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function removeOverlay() {
    const el = document.getElementById('mvauth-overlay');
    if (el) el.remove();
  }

  function logoPath(base) {
    return (base || '') + 'Mamavege_Logo.png';
  }

  function showLoginOverlay(opts) {
    ensureStyles();
    removeOverlay();
    const wrap = document.createElement('div');
    wrap.className = 'mvauth-overlay';
    wrap.id = 'mvauth-overlay';
    wrap.innerHTML = `
      <div class="mvauth-card">
        <div class="mvauth-logo"><img src="${logoPath(opts.base)}" alt="MamaVege" onerror="this.style.display='none'"></div>
        <p class="mvauth-sub">${opts.title || 'Secure Login'}</p>
        <div class="mvauth-tabs">
          <button type="button" class="mvauth-tab active" id="mvauth-tab-pw">密码登录</button>
          <button type="button" class="mvauth-tab" id="mvauth-tab-ml">邮件链接</button>
        </div>
        <div class="mvauth-field">
          <label>Email 邮箱</label>
          <input type="email" id="mvauth-email" placeholder="you@mamavege.com" autocomplete="username">
        </div>
        <div class="mvauth-field" id="mvauth-pw-field">
          <label>密码</label>
          <input type="password" id="mvauth-pw" placeholder="••••••••" autocomplete="current-password">
        </div>
        <button class="mvauth-btn" id="mvauth-submit">登录</button>
        <div class="mvauth-msg" id="mvauth-msg"></div>
        <div class="mvauth-hint">仅限授权人员访问 · 账号由管理员开通<br>MamaVege · 妈子素</div>
      </div>`;
    document.body.appendChild(wrap);

    const supa = getClient();
    let mode = 'pw';
    const $ = id => document.getElementById(id);
    const msg = (text, cls) => {
      const m = $('mvauth-msg');
      m.textContent = text;
      m.className = 'mvauth-msg show ' + cls;
    };

    function setMode(m) {
      mode = m;
      $('mvauth-tab-pw').classList.toggle('active', m === 'pw');
      $('mvauth-tab-ml').classList.toggle('active', m === 'ml');
      $('mvauth-pw-field').style.display = m === 'pw' ? '' : 'none';
      $('mvauth-submit').textContent = m === 'pw' ? '登录' : '发送登录链接';
      $('mvauth-msg').className = 'mvauth-msg';
    }
    $('mvauth-tab-pw').onclick = () => setMode('pw');
    $('mvauth-tab-ml').onclick = () => setMode('ml');

    async function submit() {
      const email = $('mvauth-email').value.trim();
      const btn = $('mvauth-submit');
      if (!email) { msg('请输入邮箱', 'err'); return; }
      btn.disabled = true;
      try {
        if (mode === 'pw') {
          const pw = $('mvauth-pw').value;
          if (!pw) { msg('请输入密码', 'err'); btn.disabled = false; return; }
          btn.textContent = '登录中…';
          const { error } = await supa.auth.signInWithPassword({ email, password: pw });
          if (error) {
            msg('登录失败：邮箱或密码不正确', 'err');
            btn.disabled = false; btn.textContent = '登录';
          }
          // 成功时由 onAuthStateChange 接手
        } else {
          btn.textContent = '发送中…';
          const { error } = await supa.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: false }
          });
          if (error) {
            msg('发送失败：' + (/not allowed|Signups/i.test(error.message) ? '该邮箱尚未开通账号，请联系管理员' : error.message), 'err');
          } else {
            msg('登录链接已发送到 ' + email + '，请到邮箱点击链接（有效期约 1 小时，注意查看垃圾邮件）。', 'ok');
          }
          btn.disabled = false; btn.textContent = '发送登录链接';
        }
      } catch (e) {
        msg('网络错误，请重试', 'err');
        btn.disabled = false; btn.textContent = mode === 'pw' ? '登录' : '发送登录链接';
      }
    }
    $('mvauth-submit').onclick = submit;
    $('mvauth-pw').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    $('mvauth-email').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  }

  function showDeniedOverlay(opts, email) {
    ensureStyles();
    removeOverlay();
    const wrap = document.createElement('div');
    wrap.className = 'mvauth-overlay';
    wrap.id = 'mvauth-overlay';
    wrap.innerHTML = `
      <div class="mvauth-card">
        <div class="mvauth-denied-icon">🔒</div>
        <div class="mvauth-denied-title">无访问权限</div>
        <div class="mvauth-denied-text">
          账号 <b>${email}</b> 没有「${opts.moduleName || opts.module}」模块的访问权限。<br>
          如需开通，请联系管理员。
        </div>
        <button class="mvauth-btn" id="mvauth-switch">切换账号</button>
      </div>`;
    document.body.appendChild(wrap);
    document.getElementById('mvauth-switch').onclick = async () => {
      await getClient().auth.signOut();
      location.reload();
    };
  }

  /* ---------- 核心流程 ---------- */

  function waitForSignIn(opts) {
    return new Promise(resolve => {
      showLoginOverlay(opts);
      const { data: sub } = getClient().auth.onAuthStateChange((event, session) => {
        if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED')) {
          sub.subscription.unsubscribe();
          resolve(session);
        }
      });
    });
  }

  // 查该用户在此模块的最高角色（RLS 只允许读自己的行）
  async function fetchRole(module) {
    const { data, error } = await getClient()
      .from('app_permissions')
      .select('module, role')
      .in('module', [module, 'all']);
    if (error) throw error;
    let best = null;
    (data || []).forEach(r => {
      if (!best || (ROLE_RANK[r.role] || 0) > (ROLE_RANK[best] || 0)) best = r.role;
    });
    return best;
  }

  async function init(opts) {
    if (!opts || !opts.module) throw new Error('MVAuth.init: 需要 module 参数');
    const supa = getClient();

    let { data: { session } } = await supa.auth.getSession();
    if (!session) {
      session = await waitForSignIn(opts);
    }

    const email = (session.user.email || '').toLowerCase();
    let role = null;
    try {
      role = await fetchRole(opts.module);
    } catch (e) {
      console.error('MVAuth: 权限查询失败', e);
    }

    const minRole = opts.minRole || 'viewer';
    if (!role || (ROLE_RANK[role] || 0) < (ROLE_RANK[minRole] || 0)) {
      showDeniedOverlay(opts, email);
      return new Promise(() => {}); // 永不 resolve，页面停在拦截层
    }

    removeOverlay();
    return { client: supa, user: session.user, email, role };
  }

  async function logout() {
    await getClient().auth.signOut();
    location.reload();
  }

  global.MVAuth = { init, logout, getClient };
})(window);
