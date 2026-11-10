/* Provoda Staff — employee stories for the messenger */
(() => {
  'use strict';
  const BUCKET = 'provoda-user-stories';
  const TABLE = 'messenger_user_stories';
  const MAX_BYTES = 50 * 1024 * 1024;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let mounted = false, loading = false, rows = [], people = [], viewerIndex = 0;

  function styles() {
    if ($('#pmUserStoriesStyles')) return;
    const style = document.createElement('style');
    style.id = 'pmUserStoriesStyles';
    style.textContent = `
      .pm-user-stories{padding:12px 12px 10px;border-bottom:1px solid var(--line,#ffffff18);background:rgba(255,255,255,.025)}
      .pm-user-stories-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:9px}
      .pm-user-stories-head strong{font-size:12px;color:var(--text,#fff)}
      .pm-user-stories-head small{font-size:10px;color:var(--muted,#9ca3af)}
      .pm-user-stories-list{display:flex;gap:11px;overflow-x:auto;padding:2px 1px 5px;scrollbar-width:thin}
      .pm-user-story{display:flex;flex:0 0 66px;flex-direction:column;align-items:center;gap:5px;border:0;background:transparent;color:var(--text,#fff);padding:0}
      .pm-user-story-ring{width:56px;height:56px;padding:2px;border-radius:50%;background:linear-gradient(135deg,#7c5cff,#22d3ee 55%,#fb7185)}
      .pm-user-story-ring.seen{background:#687080}
      .pm-user-story-avatar{display:flex;width:100%;height:100%;align-items:center;justify-content:center;overflow:hidden;border:2px solid #111722;border-radius:50%;background:#20283a;font-weight:700}
      .pm-user-story-avatar img,.pm-user-story-avatar video{width:100%;height:100%;object-fit:cover}
      .pm-user-story small{max-width:66px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;color:var(--muted,#9ca3af)}
      .pm-user-story-add{display:flex;align-items:center;justify-content:center;width:56px;height:56px;border:1px dashed #8b7cff;border-radius:50%;background:#7c5cff18;color:#c4b5fd;font-size:25px}
      .pm-user-story-compose{display:flex;gap:7px;margin-top:8px}
      .pm-user-story-compose input[type=file]{display:none}
      .pm-user-story-compose input[type=text]{min-width:0;flex:1;padding:8px 10px;border:1px solid var(--line,#ffffff22);border-radius:10px;background:var(--card2,#151c2a);color:var(--text,#fff);font:inherit;font-size:12px}
      .pm-user-story-compose button{padding:8px 11px;border:1px solid #7c5cff66;border-radius:10px;background:#7c5cff20;color:#ddd6fe;font-size:11px}
      .pm-user-story-hint{margin:6px 0 0;color:var(--muted,#9ca3af);font-size:10px}
      .pm-user-story-viewer{position:fixed;inset:0;z-index:1600;display:none;align-items:center;justify-content:center;padding:12px;background:#03060df2;backdrop-filter:blur(12px)}
      .pm-user-story-viewer.open{display:flex}
      .pm-user-story-stage{position:relative;width:min(420px,100%);height:min(820px,94dvh);overflow:hidden;border:1px solid #ffffff22;border-radius:22px;background:#080c14}
      .pm-user-story-stage>img,.pm-user-story-stage>video{width:100%;height:100%;object-fit:contain}
      .pm-user-story-top{position:absolute;z-index:2;top:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;padding:14px;color:#fff;background:linear-gradient(#000b,transparent)}
      .pm-user-story-top button{width:34px;height:34px;border:0;border-radius:10px;background:#0008;color:white;font-size:22px}
      .pm-user-story-caption{position:absolute;right:0;bottom:0;left:0;padding:32px 18px 20px;color:white;background:linear-gradient(transparent,#000c)}
      .pm-user-story-nav{position:absolute;inset:55px 0 70px;display:flex}
      .pm-user-story-nav button{width:50%;border:0;background:transparent}
      @media(max-width:640px){.pm-user-story-viewer{padding:0}.pm-user-story-stage{width:100%;height:100dvh;border:0;border-radius:0}}
    `;
    document.head.appendChild(style);
  }

  function mount() {
    const modal = $('#provodaMessengerModal'), sidebar = modal?.querySelector('.pm-sidebar');
    if (!modal?.classList.contains('open') || !sidebar) return;
    if (!$('#pmUserStories')) {
      const section = document.createElement('section');
      section.id = 'pmUserStories';
      section.className = 'pm-user-stories';
      section.innerHTML = '<div class="pm-user-stories-head"><strong>Истории команды</strong><small>Видно сотрудникам</small></div><div class="pm-user-stories-list" id="pmUserStoriesList"></div><div class="pm-user-story-compose"><input id="pmUserStoryCaption" type="text" maxlength="180" placeholder="Подпись к истории (необязательно)"><input id="pmUserStoryFile" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"><button id="pmUserStoryChoose" type="button">＋ Добавить</button><button id="pmUserStoryPublish" type="button" disabled>Опубликовать</button></div><p class="pm-user-story-hint">Фото или видео до 50 МБ · публикация на 24 часа</p>';
      const search = $('#pmSearch', sidebar);
      if (search) sidebar.insertBefore(section, search);
      $('#pmUserStoryChoose', section).addEventListener('click', () => $('#pmUserStoryFile').click());
      $('#pmUserStoryFile', section).addEventListener('change', () => {
        const file = $('#pmUserStoryFile').files?.[0];
        $('#pmUserStoryPublish').disabled = !file;
        $('#pmUserStoryChoose').textContent = file ? file.name.slice(0, 22) : '＋ Добавить';
      });
      $('#pmUserStoryPublish', section).addEventListener('click', publish);
    }
    if (!$('#pmUserStoryViewer')) {
      const viewer = document.createElement('div');
      viewer.id = 'pmUserStoryViewer';
      viewer.className = 'pm-user-story-viewer';
      viewer.setAttribute('aria-hidden', 'true');
      viewer.addEventListener('click', e => { if (e.target === viewer) closeViewer(); });
      document.body.appendChild(viewer);
    }
    if (!mounted) { mounted = true; loadStories(); }
  }

  async function loadStories() {
    if (loading || typeof cloudClient === 'undefined' || !cloudClient || typeof cloudUser === 'undefined' || !cloudUser) return;
    loading = true;
    try {
      const [storyResult, peopleResult] = await Promise.all([
        cloudClient.from(TABLE).select('id,user_id,media_path,media_type,caption,expires_at,created_at').gt('expires_at', new Date().toISOString()).order('created_at', {ascending:false}).limit(60),
        cloudClient.rpc('messenger_list_users')
      ]);
      if (storyResult.error) throw storyResult.error;
      rows = Array.isArray(storyResult.data) ? storyResult.data : [];
      people = Array.isArray(peopleResult.data) ? peopleResult.data : [];
      renderStories();
    } catch (error) {
      const list = $('#pmUserStoriesList');
      if (list) list.innerHTML = '<small>Истории временно недоступны.</small>';
      console.warn('Messenger stories load failed:', error?.message || error);
    } finally { loading = false; }
  }

  function renderStories() {
    const list = $('#pmUserStoriesList');
    if (!list) return;
    const grouped = new Map();
    for (const row of rows) if (!grouped.has(row.user_id)) grouped.set(row.user_id, row);
    const items = [...grouped.values()];
    list.innerHTML = '<button class="pm-user-story" type="button" id="pmUserStoryAddShortcut"><span class="pm-user-story-add">＋</span><small>Моя история</small></button>' + items.map(row => {
      const person = people.find(p => p.user_id === row.user_id);
      return '<button class="pm-user-story" type="button" data-user-story="' + esc(row.id) + '"><span class="pm-user-story-ring"><span class="pm-user-story-avatar">' + esc((person?.name || 'С').slice(0,1).toUpperCase()) + '</span></span><small>' + esc(person?.name || 'Сотрудник') + '</small></button>';
    }).join('');
    $('#pmUserStoryAddShortcut')?.addEventListener('click', () => $('#pmUserStoryFile')?.click());
    list.querySelectorAll('[data-user-story]').forEach(button => button.addEventListener('click', () => openViewer(rows.findIndex(r => r.id === button.dataset.userStory))));
  }

  async function publish() {
    const file = $('#pmUserStoryFile')?.files?.[0], button = $('#pmUserStoryPublish');
    if (!file || button?.disabled || typeof cloudClient === 'undefined' || !cloudUser) return;
    const mime = String(file.type || '').toLowerCase().split(';')[0];
    const allowed = new Set(['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime']);
    if (!allowed.has(mime)) { alert('Поддерживаются JPG, PNG, WebP, MP4, WebM и MOV.'); return; }
    if (!file.size || file.size > MAX_BYTES) { alert('Файл пустой или превышает 50 МБ.'); return; }
    button.disabled = true; button.textContent = 'Загрузка…';
    let path = null, uploaded = false;
    try {
      const ext = ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov'})[mime];
      path = cloudUser.id + '/' + crypto.randomUUID() + '.' + ext;
      const upload = await cloudClient.storage.from(BUCKET).upload(path, file, {contentType:mime, cacheControl:'3600', upsert:false});
      if (upload.error) throw upload.error;
      uploaded = true;
      const insert = await cloudClient.from(TABLE).insert({user_id:cloudUser.id,media_path:path,media_type:mime,caption:$('#pmUserStoryCaption')?.value.trim() || null,expires_at:new Date(Date.now()+24*60*60*1000).toISOString()});
      if (insert.error) throw insert.error;
      $('#pmUserStoryFile').value = ''; $('#pmUserStoryCaption').value = '';
      $('#pmUserStoryChoose').textContent = '＋ Добавить';
      if (typeof toast === 'function') toast('История опубликована на 24 часа.');
      rows = []; await loadStories();
    } catch (error) {
      if (path && uploaded) { try { await cloudClient.storage.from(BUCKET).remove([path]); } catch {} }
      const message = [error?.message,error?.statusCode,error?.code].filter(Boolean).join(' · ');
      if (typeof toast === 'function') toast('Не удалось опубликовать историю: ' + (message || 'ошибка хранилища'));
      console.error('Employee story publish failed:', error);
    } finally { button.disabled = false; button.textContent = 'Опубликовать'; }
  }

  async function openViewer(index) {
    if (index < 0 || index >= rows.length) return;
    viewerIndex = index;
    const row = rows[index], person = people.find(p => p.user_id === row.user_id), viewer = $('#pmUserStoryViewer');
    try {
      const {data,error} = await cloudClient.storage.from(BUCKET).createSignedUrl(row.media_path, 900);
      if (error) throw error;
      viewer.innerHTML = '<div class="pm-user-story-stage"><div class="pm-user-story-top"><strong>' + esc(person?.name || 'Сотрудник') + '</strong><button type="button" id="pmUserStoryClose" aria-label="Закрыть">×</button></div>' + (row.media_type.startsWith('video/') ? '<video src="' + esc(data.signedUrl) + '" autoplay controls playsinline></video>' : '<img src="' + esc(data.signedUrl) + '" alt="История сотрудника">') + '<div class="pm-user-story-caption">' + esc(row.caption || '') + '</div><div class="pm-user-story-nav"><button type="button" id="pmUserStoryPrev" aria-label="Предыдущая"></button><button type="button" id="pmUserStoryNext" aria-label="Следующая"></button></div></div>';
      viewer.classList.add('open'); viewer.setAttribute('aria-hidden','false');
      $('#pmUserStoryClose').addEventListener('click',closeViewer);
      $('#pmUserStoryPrev').addEventListener('click',()=>openViewer((viewerIndex-1+rows.length)%rows.length));
      $('#pmUserStoryNext').addEventListener('click',()=>openViewer((viewerIndex+1)%rows.length));
    } catch (error) {
      if (typeof toast === 'function') toast('Не удалось открыть историю: ' + (error?.message || 'ошибка доступа'));
    }
  }

  function closeViewer() {
    const viewer = $('#pmUserStoryViewer');
    if (!viewer) return;
    viewer.classList.remove('open'); viewer.setAttribute('aria-hidden','true'); viewer.innerHTML = '';
  }

  function observe() {
    const observer = new MutationObserver(() => {
      const wasMounted = mounted;
      mount();
      if (wasMounted && !$('#provodaMessengerModal')?.classList.contains('open')) {
        mounted = false; closeViewer();
      }
    });
    observer.observe(document.body, {subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  }

  function init() { styles(); observe(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
