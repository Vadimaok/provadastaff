/* Provoda Staff shift reports — Yandex Disk link workflow */
(() => {
  const $ = (s, root=document) => root.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let cats=[], reports=[], isAdmin=false, isReviewer=false, isEnabled=true, canSubmit=false, userRole='employee', shiftRole=null, activeShift='day', activeView='new', users=[];
  let liveChannel=null, livePollTimer=null, liveRefreshTimer=null, liveRefreshBusy=false, liveRefreshQueued=false;
  const selectedExcelIds=new Set();
  function ensureUI(){
    if(!$('#openDailyReportsBtn')){
      const anchor=$('#openKnzTasksBtn')||$('#openShiftPanelBtn')||$('#openSettingsBtn');
      if(anchor){const b=document.createElement('button');b.type='button';b.id='openDailyReportsBtn';b.className='profile-menu-action';b.innerHTML='<span aria-hidden="true">▤</span><span>Сменные отчёты</span>';anchor.insertAdjacentElement('afterend',b);}
    }
    if($('#dailyReportsSheet'))return;
    const style=document.createElement('style');
    style.textContent=`
      #dailyReportsSheet{position:fixed;inset:0;z-index:850;display:none;overflow-y:auto;overscroll-behavior:contain;background:rgba(4,8,15,.82);backdrop-filter:blur(12px);padding:max(8px,env(safe-area-inset-top)) max(8px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left))}
      #dailyReportsSheet.open{display:block}.dr-shell{width:min(1050px,100%);max-width:1050px;margin:0 auto;border:1px solid var(--line);border-radius:22px;background:var(--card);padding:clamp(12px,2.6vw,26px);box-shadow:var(--shadow);min-width:0}
      .dr-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;position:sticky;top:calc(-1 * clamp(12px,2.6vw,26px));z-index:8;background:var(--card);padding:8px 0 12px;border-bottom:1px solid var(--line)}.dr-head>div{min-width:0;flex:1}.dr-head h2{margin:0 0 5px;overflow-wrap:anywhere}.dr-head #drClose{flex:0 0 42px;width:42px;height:42px;min-width:42px;display:grid;place-items:center;border-radius:13px;font-size:25px;position:sticky;top:0;z-index:9}.dr-tabs,.dr-actions{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0;min-width:0}
      .dr-btn{border:1px solid var(--line);border-radius:12px;min-height:42px;padding:10px 13px;background:rgba(255,255,255,.06);color:var(--text);cursor:pointer;touch-action:manipulation;max-width:100%;white-space:normal}.dr-btn.primary{background:var(--accent);border-color:transparent}.dr-btn:disabled{opacity:.5;cursor:not-allowed}
      .dr-card{border:1px solid var(--line);border-radius:16px;padding:14px;margin:12px 0;background:rgba(255,255,255,.025);min-width:0}.dr-item-head{display:flex;gap:10px;justify-content:space-between;align-items:center}.dr-item h4{margin:0;font-size:14px}
      .dr-comment,.dr-url{display:block;width:100%;box-sizing:border-box;min-height:74px;resize:vertical;padding:11px;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--text);font:inherit;margin-top:8px;max-width:100%}.dr-url{min-height:44px;resize:none}
      .dr-status{display:inline-block;border-radius:999px;padding:4px 9px;font-size:11px;background:rgba(148,163,184,.14)}.dr-status.approved{color:#34d399;background:rgba(52,211,153,.13)}.dr-status.rejected{color:#fb923c;background:rgba(251,146,60,.14)}
      .dr-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.dr-grid label{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--muted);min-width:0}.dr-grid input,.dr-grid select{width:100%;min-width:0;min-height:44px;padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--card2);color:var(--text);font:inherit}
      .dr-table-wrap{overflow:auto;max-width:100%;border-radius:10px}.dr-table{width:100%;border-collapse:collapse;font-size:13px;min-width:560px}.dr-table th,.dr-table td{padding:10px;border:1px solid var(--line);text-align:left;vertical-align:top;overflow-wrap:anywhere}.dr-table td.good{background:rgba(52,211,153,.17)}.dr-table td.warn{background:rgba(251,146,60,.18)}
      .dr-hidden{display:none!important}
      .dr-shift-admin-card{margin-top:16px;overflow:hidden;padding:0!important;border:1px solid rgba(124,92,255,.22)!important;background:linear-gradient(145deg,rgba(124,92,255,.075),rgba(34,211,238,.025))!important}
      .dr-admin-hero{display:flex;gap:14px;align-items:flex-start;padding:18px 18px 14px;border-bottom:1px solid var(--line);background:linear-gradient(115deg,rgba(124,92,255,.12),rgba(34,211,238,.04))}
      .dr-admin-icon{width:44px;height:44px;flex:0 0 44px;display:grid;place-items:center;border-radius:15px;background:linear-gradient(135deg,var(--accent),#4f46e5);color:white;font-size:24px;box-shadow:0 8px 22px rgba(79,70,229,.22)}
      .dr-admin-hero h3{font-size:19px;letter-spacing:-.025em;margin:3px 0 5px;color:var(--text)}
      .dr-admin-hero p{font-size:13px;line-height:1.5;margin:0;color:var(--muted)}
      .dr-admin-notice{margin:14px 16px 0;padding:0;color:var(--muted);font-size:13px;overflow-wrap:anywhere}
      .dr-shift-settings{padding:0 14px 16px}
      .dr-shift-settings>.dr-card{background:rgba(255,255,255,.025);border-radius:15px;padding:15px}
      .dr-shift-settings h3{font-size:15px;letter-spacing:-.01em;margin:0 0 10px}
      .dr-shift-settings .dr-actions{margin:12px 0 0}
      .dr-shift-settings .dr-btn{min-height:43px;font-weight:700}
      .dr-shift-settings .dr-btn.primary{box-shadow:0 7px 18px rgba(79,70,229,.18)}
      .dr-shift-settings .dr-grid{gap:12px}
      .dr-shift-settings .dr-grid label{font-weight:650}
      .dr-shift-settings .dr-grid input,.dr-shift-settings .dr-grid select{border-radius:12px}
      .dr-shift-settings .dr-card[data-dr-category]{background:rgba(255,255,255,.035);border-color:rgba(148,163,184,.16)}
      .dr-shift-settings .dr-check{padding:11px 12px}
      @media(max-width:600px){.dr-admin-hero{padding:15px 13px}.dr-admin-icon{width:40px;height:40px;flex-basis:40px}.dr-shift-settings{padding:0 10px 12px}.dr-shift-settings>.dr-card{padding:12px}.dr-admin-notice{margin-inline:12px}}
      .dr-check{display:flex;gap:12px;align-items:center;padding:14px;border:1px solid var(--line);border-radius:15px;background:linear-gradient(135deg,rgba(124,92,255,.09),rgba(34,211,238,.035));cursor:pointer;transition:border-color .16s,background .16s;min-width:0}.dr-check:has(input:checked){border-color:rgba(52,211,153,.55);background:rgba(52,211,153,.09)}.dr-check>input{appearance:none;-webkit-appearance:none;flex:0 0 23px;width:23px;height:23px;margin:0;border-radius:7px;border:1.5px solid rgba(148,163,184,.7);background:rgba(15,23,42,.45);display:grid;place-content:center;cursor:pointer}.dr-check>input:checked{background:var(--good);border-color:var(--good)}.dr-check>input:checked:before{content:'✓';font-size:16px;line-height:1;font-weight:900;color:#052e25}.dr-check>span{min-width:0}.dr-check strong{display:block;line-height:1.35;overflow-wrap:anywhere}.dr-check .small{line-height:1.45;margin-top:5px}
      .dr-checklist-toggle{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;text-align:left;margin:12px 0 8px;padding:13px 15px;border:1px solid var(--line);border-radius:15px;background:rgba(124,92,255,.09);color:var(--text);font:inherit;font-weight:750;cursor:pointer;min-height:48px}.dr-checklist-toggle:after{content:'＋';font-size:19px;color:var(--muted);flex:0 0 auto}.dr-checklist-toggle[aria-expanded="true"]:after{content:'−'}.dr-checklist-wrap{display:grid;gap:0}
      .dr-manage{border:1px solid var(--line);border-radius:14px;margin:12px 0;background:rgba(255,255,255,.025);overflow:hidden}
      .dr-manage summary{cursor:pointer;padding:13px 15px;font-weight:700;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:48px}
      .dr-manage summary::-webkit-details-marker{display:none}.dr-manage summary:after{content:'＋';font-size:20px;color:var(--muted)}.dr-manage[open] summary:after{content:'−'}
      .dr-manage-body{padding:0 13px 13px}.dr-select-list{display:grid;gap:7px;max-height:260px;overflow:auto;margin:10px 0}
      .dr-select-row{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:10px;border:1px solid var(--line);border-radius:12px;min-width:0}.dr-select-row label{display:flex;gap:10px;align-items:center;min-width:0;flex:1;overflow-wrap:anywhere}.dr-select-row input{appearance:none;-webkit-appearance:none;width:21px;height:21px;flex:0 0 21px;border-radius:6px;border:1.5px solid rgba(148,163,184,.7);background:rgba(15,23,42,.45);display:grid;place-content:center;margin:0}.dr-select-row input:checked{background:var(--good);border-color:var(--good)}.dr-select-row input:checked:before{content:'✓';font-size:15px;line-height:1;font-weight:900;color:#052e25}.dr-danger{border-color:rgba(248,113,113,.45);color:#fca5a5}
      @media(max-width:600px){#dailyReportsSheet{padding:max(6px,env(safe-area-inset-top)) max(6px,env(safe-area-inset-right)) max(6px,env(safe-area-inset-bottom)) max(6px,env(safe-area-inset-left))}.dr-shell{padding:12px;border-radius:17px}.dr-head{top:-12px;padding-top:8px}.dr-head #drClose{width:40px;height:40px;min-width:40px;flex-basis:40px}.dr-grid{grid-template-columns:minmax(0,1fr)}.dr-tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.dr-tabs .dr-btn{width:100%;padding:10px 8px;font-size:12px}.dr-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.dr-actions .dr-btn{width:100%;padding:10px 8px;font-size:12px}.dr-check{padding:12px;gap:10px}.dr-select-row{align-items:flex-start;flex-wrap:wrap}.dr-select-row .dr-btn{width:100%}.dr-manage-body{padding:0 9px 10px}}
      @media(max-width:360px){.dr-actions{grid-template-columns:minmax(0,1fr)}.dr-tabs{grid-template-columns:minmax(0,1fr)}.dr-head .small{font-size:10px}}

    `;
    document.head.appendChild(style);
    const sheet=document.createElement('div');sheet.id='dailyReportsSheet';sheet.setAttribute('aria-hidden','true');
    sheet.innerHTML=`<section class="dr-shell" role="dialog" aria-modal="true" aria-labelledby="drTitle">
      <header class="dr-head"><div><div class="small">PROVODA STAFF · SHIFT CONTROL</div><h2 id="drTitle">Сменные отчёты</h2><p class="small">Отчёт по чек-листу и ссылка на Яндекс Диск</p></div><button class="icon" id="drClose" type="button" aria-label="Закрыть">×</button></header>
      <div id="drDisabled" class="dr-card dr-hidden">Модуль отчётов временно отключён администратором.</div>
      <nav class="dr-tabs" id="drTabs"><button class="dr-btn primary" data-dr-view="new">Новый отчёт</button><button class="dr-btn" data-dr-view="history">История отчётов</button><button class="dr-btn dr-hidden" id="drSettingsTab" data-dr-view="settings">Управление</button></nav>
      <div id="drNotice" class="small" role="status"></div>
      <section id="drNewView"><div class="dr-grid"><label>Тип смены<select id="drShift"><option value="day">Дневная</option><option value="night">Ночная</option></select></label><label>Дата отчёта<input id="drDate" type="date"></label></div><button class="dr-checklist-toggle" id="drToggleChecklist" type="button" aria-expanded="false" aria-controls="drChecklist">Чек-лист смены · показать отметки</button><div id="drChecklist" class="dr-hidden dr-checklist-wrap"></div>
      <label class="small" for="drYandexUrl">Ссылка на Яндекс Диск</label><input id="drYandexUrl" class="dr-url" type="url" placeholder="https://disk.yandex.ru/..." autocomplete="url">
      <label class="small" for="drSenderComment">Комментарий для Админа / СТ (необязательно)</label><textarea id="drSenderComment" class="dr-comment" placeholder="Пояснение, проблема или сообщение для проверяющих…"></textarea>
      <div class="dr-actions"><button class="dr-btn primary" id="drPreview">Предварительный просмотр</button><button class="dr-btn" id="drSubmit">Отправить отчёт</button></div><div id="drPreviewBox" class="dr-card dr-hidden"></div></section>
      <section id="drHistoryView" class="dr-hidden"><div class="dr-actions"><button class="dr-btn" id="drExport">Предпросмотр Excel</button><button class="dr-btn primary" id="drCopyExcel">Копировать строки для Excel</button><button class="dr-btn" id="drDownloadCsv">Скачать CSV</button></div><details id="drExcelManage" class="dr-manage dr-hidden"><summary>Дополнительно · выборочное удаление Excel</summary><div class="dr-manage-body"><p class="small">Галочки скрыты здесь, чтобы не мешали обычной работе. Выбери одну или несколько записей и подтверди удаление. Полное удаление затронет только одобренные и отклонённые отчёты, которые попадают в Excel; ожидающие проверки останутся.</p><div class="dr-actions"><button class="dr-btn" id="drSelectAllExcel" type="button">Выбрать все</button><button class="dr-btn" id="drClearExcelSelection" type="button">Снять выбор</button></div><div id="drExcelSelectionList" class="dr-select-list"></div><div class="dr-actions"><button class="dr-btn dr-danger" id="drDeleteSelectedExcel" type="button" disabled>Удалить выбранные</button><button class="dr-btn dr-danger" id="drDeleteAllExcel" type="button">Полностью очистить Excel</button></div></div></details><div id="drHistoryList"></div><div id="drExcelPreview" class="dr-card dr-hidden"></div></section>
      <section id="drSettingsView" class="dr-hidden"><div class="dr-card" id="drModuleSettingsCard"><label class="dr-item-head"><strong>Модуль сменных отчётов включён</strong><input id="drEnabled" type="checkbox"></label><div class="dr-actions"><button class="dr-btn primary" id="drSaveEnabled">Сохранить</button></div></div>
      <div class="dr-card"><h3>Назначение дневной / ночной роли</h3><p class="small">Доступно Админу и СТ. СТ может назначать дневную и ночную смену.</p><div class="dr-grid"><label>Сотрудник<select id="drUserSelect"></select></label><label>Дополнительная роль смены<select id="drUserRole"><option value="">Без сменной роли</option><option value="shift_day">Дневная смена</option><option value="shift_night">Ночная смена</option></select></label></div><div class="dr-actions"><button class="dr-btn primary" id="drSaveUserRole">Сохранить роль</button></div></div>
      <div class="dr-card"><h3>Категории отчётов</h3><div id="drCategoryList"></div><div class="dr-grid"><label>Смена<select id="drCatShift"><option value="day">Дневная</option><option value="night">Ночная</option></select></label><label>Название категории<input id="drCatTitle" maxlength="180" placeholder="Например, чистая стойка"></label></div><div class="dr-actions"><button class="dr-btn primary" id="drAddCategory">Добавить категорию</button></div></div></section>
    </section>`;
    document.body.appendChild(sheet);
    // Daily-report administration lives inside the ST control panel, not in the employee report window.
    const shiftWorkspace=$('#shiftTasksWorkspace');
    const settingsView=$('#drSettingsView');
    if(shiftWorkspace&&settingsView&&!$('#drShiftAdminCard')){
      const nav=document.createElement('nav');
      nav.id='stQuickNav';nav.className='st-quick-nav';nav.setAttribute('aria-label','Разделы панели управления СТ');
      nav.innerHTML='<button type="button" class="st-quick-btn active" data-st-section="tasks"><span class="st-quick-icon">✓</span><span>Задачи</span></button><button type="button" class="st-quick-btn" data-st-section="reports"><span class="st-quick-icon">▤</span><span>Отчёты</span></button><button type="button" class="st-quick-btn" data-st-section="stock"><span class="st-quick-icon">▦</span><span>Тов. база</span></button><button type="button" class="st-quick-btn" data-st-section="spend"><span class="st-quick-icon">₽</span><span>Общие траты</span></button><button type="button" class="st-quick-btn" data-st-section="analytics"><span class="st-quick-icon">↗</span><span>Аналитика</span></button><button type="button" class="st-quick-btn" data-st-section="roles"><span class="st-quick-icon">♙</span><span>Роли КНЗ</span></button>';
      const navStyle=document.createElement('style');navStyle.id='stQuickNavStyles';
      navStyle.textContent=`.st-quick-nav{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin:0 0 16px}.st-quick-btn{min-width:0;min-height:66px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:9px 5px;border:1px solid var(--line,rgba(255,255,255,.1));border-radius:14px;background:rgba(255,255,255,.025);color:var(--text,#edf3fb);font:600 11px/1.15 inherit;cursor:pointer;transition:background .16s,border-color .16s,transform .16s}.st-quick-btn:hover{border-color:rgba(79,140,255,.45);transform:translateY(-1px)}.st-quick-btn.active{background:linear-gradient(145deg,rgba(79,140,255,.2),rgba(53,198,176,.09));border-color:rgba(79,140,255,.55);box-shadow:inset 0 1px rgba(255,255,255,.04)}.st-quick-icon{display:grid;place-items:center;width:27px;height:27px;border-radius:9px;background:rgba(79,140,255,.12);font-size:15px;color:#8db5ff}.st-quick-btn span:last-child{white-space:nowrap}.st-feature-notice{display:none;padding:16px;border:1px solid var(--line,rgba(255,255,255,.1));border-radius:14px;background:rgba(255,255,255,.025);color:var(--muted,#8d9bad);font-size:13px;line-height:1.55;margin:0 0 14px}.st-feature-notice strong{display:block;color:var(--text,#edf3fb);font-size:14px;margin-bottom:5px}.st-analytics-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}.st-analytics-grid>div{display:flex;flex-direction:column;gap:7px;padding:12px;border-radius:12px;background:rgba(255,255,255,.035);border:1px solid var(--line,rgba(255,255,255,.1));min-width:0}.st-analytics-grid span{font-size:11px;color:var(--muted,#8d9bad)}.st-analytics-grid b{font-size:20px;color:var(--text,#edf3fb)}.st-feature-notice.visible{display:block}@media(max-width:480px){.st-analytics-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.st-analytics-grid b{font-size:18px}}@media(max-width:760px){.st-quick-nav{grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.st-quick-btn{min-height:61px}.st-quick-btn span:last-child{font-size:10px}}@media(max-width:380px){.st-quick-btn{padding:8px 2px}.st-quick-icon{width:24px;height:24px}}`;
      document.head.appendChild(navStyle);
      const featureNotice=document.createElement('div');featureNotice.id='stFeatureNotice';featureNotice.className='st-feature-notice';featureNotice.setAttribute('role','status');
      nav.insertAdjacentElement('afterend',featureNotice);
      shiftWorkspace.parentNode.insertBefore(nav,shiftWorkspace);
      const adminCard=document.createElement('section');adminCard.id='drShiftAdminCard';adminCard.className='admin-card dr-shift-admin-card';
      adminCard.innerHTML='<div class="dr-admin-hero"><div class="dr-admin-icon" aria-hidden="true">▤</div><div><div class="small">PROVODA STAFF · CONTROL</div><h3>Ежедневные отчёты</h3><p>Настройка чек-листов, сменных ролей и доступности отчётов.</p></div></div><div id="drShiftAdminNotice" class="dr-admin-notice" role="status" aria-live="polite"></div>';
      settingsView.classList.add('dr-shift-settings');adminCard.appendChild(settingsView);shiftWorkspace.appendChild(adminCard);$('#drSettingsTab')?.classList.add('dr-hidden');
    }
    $('#drClose').addEventListener('click',close);
    $('#drToggleChecklist').addEventListener('click',()=>{const box=$('#drChecklist'),btn=$('#drToggleChecklist'),open=box.classList.contains('dr-hidden');box.classList.toggle('dr-hidden',!open);btn.setAttribute('aria-expanded',String(open));btn.textContent=open?'Чек-лист смены · скрыть отметки':'Чек-лист смены · показать отметки';});
    $('#drShift').addEventListener('change',renderChecklist);
    $('#drPreview').addEventListener('click',showPreview);
    $('#drSubmit').addEventListener('click',submitReport);
    $('#drExport').addEventListener('click',showExcelPreview);
    $('#drCopyExcel').addEventListener('click',copyExcelRows);
    $('#drDownloadCsv').addEventListener('click',downloadCsv);
    $('#drSelectAllExcel').addEventListener('click',()=>{eligibleExcelReports().forEach(r=>selectedExcelIds.add(r.id));renderExcelManage();});
    $('#drClearExcelSelection').addEventListener('click',()=>{selectedExcelIds.clear();renderExcelManage();});
    $('#drDeleteSelectedExcel').addEventListener('click',deleteSelectedExcel);
    $('#drDeleteAllExcel').addEventListener('click',deleteAllExcel);
    $('#drExcelSelectionList').addEventListener('change',e=>{const cb=e.target.closest('[data-dr-select-excel]');if(!cb)return;if(cb.checked)selectedExcelIds.add(cb.dataset.drSelectExcel);else selectedExcelIds.delete(cb.dataset.drSelectExcel);updateExcelDeleteButton();});
    $('#drExcelSelectionList').addEventListener('click',e=>{const btn=e.target.closest('[data-dr-delete-one]');if(btn){e.preventDefault();deleteExcelRecords([btn.dataset.drDeleteOne],false);}});
    $('#drSaveEnabled').addEventListener('click',saveEnabled);
    $('#drAddCategory').addEventListener('click',addCategory);
    $('#drSaveUserRole').addEventListener('click',saveUserRole);
    $('#drTabs').addEventListener('click',e=>{const b=e.target.closest('[data-dr-view]');if(b)showView(b.dataset.drView);});
    $('#drHistoryList').addEventListener('click',historyAction);
    $('#drCategoryList').addEventListener('click',categoryAction);
  }
  function notice(msg,bad=false){
    const color=bad?'var(--bad)':'var(--muted)';
    ['#drNotice','#drShiftAdminNotice'].forEach(sel=>{const el=$(sel);if(el){el.textContent=msg;el.style.color=color;}});
  }
  function close(){const s=$('#dailyReportsSheet');if(s){s.classList.remove('open');s.setAttribute('aria-hidden','true');}stopLiveUpdates();}
  function open(){ensureUI();activeView='new';if(!cloudClient||!cloudUser){notice('Сначала войди в аккаунт.',true);return;}try{closeProfileMenu()}catch{}$('#dailyReportsSheet').classList.add('open');$('#dailyReportsSheet').setAttribute('aria-hidden','false');$('#drDate').value=new Date().toISOString().slice(0,10);$('#drChecklist').classList.add('dr-hidden');$('#drToggleChecklist').setAttribute('aria-expanded','false');$('#drToggleChecklist').textContent='Чек-лист смены · показать отметки';load();startLiveUpdates();}
  async function getRole(){
    try{const {data,error}=await cloudClient.rpc('is_current_admin');if(error)throw error;isAdmin=!!data;}catch{isAdmin=false;}
    try{const {data,error}=await cloudClient.rpc('daily_report_my_role');if(error)throw error;userRole=data||currentUserRole||'employee';}catch{userRole=(typeof currentUserRole!=='undefined'&&currentUserRole)||'employee';}
    try{const {data,error}=await cloudClient.rpc('user_get_my_shift_role');if(error)throw error;shiftRole=data||null;}catch{shiftRole=null;}
    isReviewer=isAdmin||userRole==='shift_senior';canSubmit=isAdmin||isReviewer||shiftRole==='shift_day'||shiftRole==='shift_night';
    const menuButton=$('#openDailyReportsBtn');if(menuButton)menuButton.classList.toggle('hidden',!canSubmit&&!isReviewer);
  }
  async function load(options={}){
    const silent=options.silent===true;
    if(!silent)notice('Загружаю отчёты…');await getRole();
    try{
      const [{data:setting,error:se},{data:categoryRows,error:ce},{data:rows,error:re}]=await Promise.all([
        cloudClient.from('daily_report_settings').select('*').eq('key','daily_reports').maybeSingle(),
        cloudClient.from('daily_report_categories').select('*').order('shift_type').order('position'),
        cloudClient.from('daily_reports').select('*').order('submitted_at',{ascending:false}).limit(250)
      ]);
      if(se)throw se;if(ce)throw ce;if(re)throw re;
      isEnabled=setting?.enabled!==false;cats=categoryRows||[];reports=rows||[];
      $('#drDisabled').classList.toggle('dr-hidden',(isEnabled&&canSubmit)||isAdmin||isReviewer);
      $('#drNewView').classList.toggle('dr-hidden',(!isEnabled&&!isAdmin&&!isReviewer)||!canSubmit);
      $('#drSettingsTab').classList.add('dr-hidden');
      $('#drModuleSettingsCard').classList.toggle('dr-hidden',!isAdmin);
      $('#drEnabled').checked=isEnabled;
      const canSeeNew=(isEnabled||isAdmin||isReviewer)&&canSubmit;
      $('#drNewView').classList.toggle('dr-hidden',activeView!=='new'||!canSeeNew);
      $('#drHistoryView').classList.toggle('dr-hidden',activeView!=='history');
      $('#drSettingsView').classList.toggle('dr-hidden',!isReviewer);
      document.querySelectorAll('#drTabs [data-dr-view]').forEach(b=>b.classList.toggle('primary',b.dataset.drView===activeView));
      if(!canSubmit&&!isReviewer)notice('Для заполнения отчёта Админ или СТ должен назначить дополнительную роль дневной или ночной смены.',true);
      if(!silent){renderChecklist();renderHistory();renderExcelManage();renderCategories();if(isReviewer)await loadUsers();}
      else if(activeView==='history'){renderHistory();renderExcelManage();}
      if(!silent){if(!isEnabled&&!isReviewer)notice('Модуль временно отключён администратором.');
      else if(canSubmit||isReviewer)notice('');}
    }catch(e){notice('Ошибка загрузки сменных отчётов: '+(e.message||'проверь SQL-файл supabase/daily-reports.sql'),true);}
  }
  function showView(view){
    if(view==='settings'&&!isReviewer)return;
    if(view==='new'&&!canSubmit)return;
    activeView=view;
    $('#drNewView').classList.toggle('dr-hidden',view!=='new');
    $('#drHistoryView').classList.toggle('dr-hidden',view!=='history');
    $('#drSettingsView').classList.toggle('dr-hidden',!isReviewer);
    document.querySelectorAll('#drTabs [data-dr-view]').forEach(b=>b.classList.toggle('primary',b.dataset.drView===view));
    if(view==='history'){renderHistory();renderExcelManage();}if(view==='settings'){renderCategories();loadUsers();}
  }
  function activeCats(){return cats.filter(c=>c.shift_type===activeShift&&c.enabled).sort((a,b)=>a.position-b.position);}
  function renderChecklist(){
    if(shiftRole==='shift_day')$('#drShift').value='day';else if(shiftRole==='shift_night')$('#drShift').value='night';
    $('#drShift').disabled=!isAdmin&&!isReviewer;activeShift=$('#drShift').value;
    $('#drChecklist').innerHTML=activeCats().map((c,i)=>'<article class="dr-card"><label class="dr-check"><input type="checkbox" data-dr-check="'+esc(c.id)+'"><span><strong>'+(i+1)+'. '+esc(c.title)+'</strong><div class="small">Отметь пункт после проверки и загрузки материалов в папку Яндекс Диска.</div></span></label></article>').join('')||'<div class="dr-card">Нет активных категорий для этой смены.</div>';
  }
  function checklistState(){return activeCats().map(c=>({category_id:c.id,title:c.title,completed:!!$('[data-dr-check="'+CSS.escape(c.id)+'"]')?.checked}));}
  function showPreview(){
    const shift=$('#drShift').value,date=$('#drDate').value||new Date().toISOString().slice(0,10),url=$('#drYandexUrl').value.trim(),items=checklistState();
    $('#drPreviewBox').classList.remove('dr-hidden');
    $('#drPreviewBox').innerHTML='<h3>Предварительный отчёт · '+(shift==='day'?'Дневная':'Ночная')+'</h3><p class="small">Дата: '+esc(date)+' · Выполнено '+items.filter(x=>x.completed).length+' из '+items.length+' пунктов</p>'+items.map(x=>'<div>'+ (x.completed?'✓':'○')+' '+esc(x.title)+'</div>').join('')+'<p><strong>Яндекс Диск:</strong> '+(url?'<a href="'+esc(url)+'" target="_blank" rel="noopener">Открыть ссылку</a>':'ссылка не добавлена')+'</p><p><strong>Комментарий:</strong> '+esc($('#drSenderComment').value.trim()||'Нет')+'</p>';
    $('#drPreviewBox').scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  async function submitReport(){
    if(!canSubmit){notice('Для отправки нужна роль дневной или ночной смены.',true);return;}
    if(!isEnabled&&!isReviewer){notice('Модуль отключён.',true);return;}
    if((shiftRole==='shift_day'&&$('#drShift').value!=='day')||(shiftRole==='shift_night'&&$('#drShift').value!=='night')){notice('У тебя нет доступа к этому типу смены.',true);return;}
    const url=$('#drYandexUrl').value.trim();
    if(!/^https?:\/\//i.test(url)||!/(yandex\.(ru|com)|disk\.yandex\.)/i.test(url)){notice('Добавь корректную ссылку на Яндекс Диск.',true);return;}
    const items=checklistState();if(items.some(x=>!x.completed)){notice('Отметь каждый пункт чек-листа перед отправкой.',true);return;}
    const btn=$('#drSubmit');btn.disabled=true;
    try{
      const {error}=await cloudClient.from('daily_reports').insert({submitted_by:cloudUser.id,author_name:(cloudUser.user_metadata?.display_name||cloudUser.user_metadata?.username||cloudUser.email||'Сотрудник'),shift_type:$('#drShift').value,report_date:$('#drDate').value||new Date().toISOString().slice(0,10),status:'pending',items,yandex_disk_url:url,sender_comment:$('#drSenderComment').value.trim()});
      if(error)throw error;
      notice('Отчёт отправлен Админу и СТ на проверку.');$('#drYandexUrl').value='';$('#drSenderComment').value='';$('#drPreviewBox').classList.add('dr-hidden');await load();showView('history');
    }catch(e){notice(e.message||'Не удалось отправить отчёт.',true);}finally{btn.disabled=false;}
  }
  async function renderHistory(){
    const list=$('#drHistoryList');if(!list)return;
    if(!reports.length){list.innerHTML='<div class="dr-card">История отчётов пока пуста.</div>';return;}
    list.innerHTML=reports.map(r=>{
      const status={pending:'На проверке',approved:'Одобрен',rejected:'Отклонён'}[r.status]||r.status;
      const date=new Date(r.submitted_at).toLocaleString('ru-RU');
      const author=r.author_name||(r.submitted_by===cloudUser.id?(cloudUser.user_metadata?.display_name||cloudUser.email||'Вы'):'Сотрудник');
      return '<article class="dr-card"><div class="dr-item-head"><div><strong>'+(r.shift_type==='day'?'Дневная':'Ночная')+' смена</strong><div class="small">'+esc(date)+' · '+esc(r.report_date)+'</div></div><span class="dr-status '+esc(r.status)+'">'+status+'</span></div><p class="small">Ф.И.: '+esc(author)+'</p><p><a href="'+esc(r.yandex_disk_url||'#')+'" target="_blank" rel="noopener">'+esc(r.yandex_disk_url||'Ссылка не указана')+'</a></p><p><strong>Комментарий сотрудника:</strong> '+esc(r.sender_comment||'Нет')+'</p>'+(r.reviewer_comment?'<div class="dr-card"><strong>Замечание Админа / СТ</strong><p>'+esc(r.reviewer_comment)+'</p></div>':'')+'<div class="dr-actions"><button class="dr-btn" data-dr-open="'+esc(r.id)+'">История и пункты</button>'+(isReviewer&&r.status==='pending'?'<button class="dr-btn primary" data-dr-approve="'+esc(r.id)+'">Одобрить</button><button class="dr-btn" data-dr-reject="'+esc(r.id)+'">Отклонить с замечанием</button>':'')+'</div><div class="dr-detail dr-hidden" id="drDetail-'+esc(r.id)+'"><p><strong>Пункты отчёта</strong></p>'+((r.items||[]).map(it=>'<div>'+(it.completed?'✓':'○')+' '+esc(it.title)+'</div>').join(''))+'<p class="small">Отправлен: '+esc(author)+' · '+esc(date)+'</p></div></article>';
    }).join('');
  }
  async function historyAction(e){
    const openBtn=e.target.closest('[data-dr-open]');if(openBtn){$('#drDetail-'+CSS.escape(openBtn.dataset.drOpen))?.classList.toggle('dr-hidden');return;}
    const approve=e.target.closest('[data-dr-approve]'),reject=e.target.closest('[data-dr-reject]');if(!approve&&!reject)return;
    const id=(approve||reject).dataset[approve?'drApprove':'drReject'];let comment='';
    if(reject){comment=prompt('Напиши замечание для сотрудника:')||'';if(!comment.trim()){notice('Для отклонения укажи замечание.',true);return;}}
    else comment=prompt('Комментарий к одобрению (необязательно):')||'';
    try{const {error}=await cloudClient.rpc('daily_report_review',{report_id:id,decision:approve?'approved':'rejected',note:comment});if(error)throw error;notice(approve?'Отчёт одобрен.':'Отчёт отклонён с замечанием.');await load();showView('history');}catch(err){notice(err.message||'Не удалось сохранить решение.',true);}
  }
  function renderCategories(){
    const box=$('#drCategoryList');if(!box)return;
    box.innerHTML=cats.map(c=>'<div class="dr-card" data-dr-category="'+esc(c.id)+'"><div class="dr-grid"><label>Смена<select data-cat-shift><option value="day" '+(c.shift_type==='day'?'selected':'')+'>Дневная</option><option value="night" '+(c.shift_type==='night'?'selected':'')+'>Ночная</option></select></label><label>Название<input data-cat-title value="'+esc(c.title)+'" maxlength="180"></label><label>Порядок<input data-cat-position type="number" value="'+c.position+'"></label><label class="dr-check">Активна <input data-cat-enabled type="checkbox" '+(c.enabled?'checked':'')+'></label></div><div class="dr-actions"><button class="dr-btn primary" data-cat-save="'+esc(c.id)+'">Сохранить категорию</button></div></div>').join('');
  }
  async function categoryAction(e){
    const b=e.target.closest('[data-cat-save]');if(!b)return;const card=b.closest('[data-dr-category]');
    try{const {error}=await cloudClient.rpc('daily_report_admin_save_category',{category_id:b.dataset.catSave,new_shift_type:$('[data-cat-shift]',card).value,new_title:$('[data-cat-title]',card).value,new_position:Number($('[data-cat-position]',card).value)||0,is_enabled:$('[data-cat-enabled]',card).checked});if(error)throw error;notice('Категория сохранена.');await load();showView('settings');}catch(err){notice(err.message||'Не удалось сохранить категорию.',true);}
  }
  async function addCategory(){
    try{const title=$('#drCatTitle').value.trim();if(!title)throw new Error('Введи название категории.');const {error}=await cloudClient.rpc('daily_report_admin_save_category',{category_id:null,new_shift_type:$('#drCatShift').value,new_title:title,new_position:cats.filter(c=>c.shift_type===$('#drCatShift').value).length+1,is_enabled:true});if(error)throw error;$('#drCatTitle').value='';await load();showView('settings');notice('Категория добавлена.');}catch(e){notice(e.message||'Не удалось добавить категорию.',true);}
  }
  async function saveEnabled(){try{const {error}=await cloudClient.rpc('daily_report_admin_set_enabled',{is_enabled:$('#drEnabled').checked});if(error)throw error;notice('Настройка модуля сохранена.');await load();showView('settings');}catch(e){notice(e.message||'Не удалось сохранить настройку.',true);}}
  async function loadUsers(){
    try{
      const {data,error}=await cloudClient.rpc('daily_report_list_users');if(error)throw error;users=Array.isArray(data)?data:[];
      const sel=$('#drUserSelect'),old=sel.value;sel.innerHTML=users.map(u=>'<option value="'+esc(u.user_id)+'">'+esc(u.display_name)+' · '+esc(({shift_senior:'СТ',employee_knz:'Сотрудник КНЗ',employee:'Сотрудник'})[u.role]||u.role)+' · '+esc(({shift_day:'Дневная смена',shift_night:'Ночная смена'})[u.shift_role]||'без сменной роли')+'</option>').join('');
      if(users.some(u=>u.user_id===old))sel.value=old;
      const chosen=users.find(u=>u.user_id===sel.value);$('#drUserRole').value=chosen?.shift_role||'';
    }catch(e){notice('Не удалось загрузить список сотрудников для назначения ролей: '+(e.message||''),true);}
  }
  async function saveUserRole(){
    const userId=$('#drUserSelect').value,role=$('#drUserRole').value;if(!userId){notice('Выбери сотрудника.',true);return;}
    try{const {error}=await cloudClient.rpc('admin_set_user_shift_role',{target_user_id:userId,new_shift_role:role||null});if(error)throw error;notice('Дополнительная роль смены сохранена.');await loadUsers();}catch(e){notice(e.message||'Не удалось назначить роль.',true);}
  }
  function eligibleExcelReports(){return reports.filter(r=>r.status==='approved'||r.status==='rejected');}
  function excelRows(){return eligibleExcelReports().map(r=>({id:r.id,fio:r.author_name||(r.submitted_by===cloudUser.id?(cloudUser.user_metadata?.display_name||cloudUser.email||'Вы'):'Сотрудник'),url:r.yandex_disk_url||'',comment:r.reviewer_comment||''}));}
  function renderExcelManage(){
    const box=$('#drExcelManage'),list=$('#drExcelSelectionList');if(!box||!list)return;
    box.classList.toggle('dr-hidden',!isReviewer);
    const eligible=eligibleExcelReports(),validIds=new Set(eligible.map(r=>r.id));
    [...selectedExcelIds].forEach(id=>{if(!validIds.has(id))selectedExcelIds.delete(id);});
    if(!eligible.length)list.innerHTML='<div class="small">Пока нет одобренных или отклонённых записей для Excel.</div>';
    else list.innerHTML=eligible.map(r=>{
      const fio=r.author_name||(r.submitted_by===cloudUser.id?(cloudUser.user_metadata?.display_name||cloudUser.email||'Вы'):'Сотрудник');
      const date=esc(r.report_date||'Без даты'),shift=r.shift_type==='day'?'Дневная':'Ночная';
      return '<div class="dr-select-row"><label><input type="checkbox" data-dr-select-excel="'+esc(r.id)+'" '+(selectedExcelIds.has(r.id)?'checked':'')+'><span><strong>'+esc(fio)+'</strong><div class="small">'+shift+' смена · '+date+' · '+(r.status==='approved'?'Одобрен':'Отклонён')+'</div></span></label><button class="dr-btn dr-danger" type="button" data-dr-delete-one="'+esc(r.id)+'">Удалить одну</button></div>';
    }).join('');
    updateExcelDeleteButton();
  }
  function updateExcelDeleteButton(){const btn=$('#drDeleteSelectedExcel');if(btn){btn.disabled=selectedExcelIds.size===0;btn.textContent=selectedExcelIds.size?('Удалить выбранные ('+selectedExcelIds.size+')'):'Удалить выбранные';}}
  async function deleteExcelRecords(ids,deleteAll=false){
    if(!isReviewer){notice('Удалять Excel-записи может только Админ или СТ.',true);return;}
    const count=deleteAll?eligibleExcelReports().length:ids.length;
    if(!count){notice('Нет записей для удаления.',true);return;}
    const message=deleteAll
      ? 'ВНИМАНИЕ! Будут безвозвратно удалены ВСЕ одобренные и отклонённые отчёты из Excel, в том числе записи за пределами отображаемого списка. Отчёты на проверке останутся. Продолжить?'
      : 'ВНИМАНИЕ! Будет безвозвратно удалено записей: '+count+'. Продолжить?';
    if(!window.confirm(message))return;
    try{
      const {data,error}=await cloudClient.rpc('daily_report_delete_excel',{report_ids:ids,delete_all:deleteAll});
      if(error)throw error;
      selectedExcelIds.clear();
      notice('Удалено записей: '+Number(data||0)+'.');
      await load();
      showView('history');
      const details=$('#drExcelManage');if(details)details.open=true;
      renderExcelManage();
    }catch(e){notice(e.message||'Не удалось удалить записи Excel.',true);}
  }
  function deleteSelectedExcel(){deleteExcelRecords([...selectedExcelIds],false);}
  function deleteAllExcel(){deleteExcelRecords([],true);}
  function showExcelPreview(){
    const rows=excelRows(),box=$('#drExcelPreview');box.classList.remove('dr-hidden');renderExcelManage();
    box.innerHTML='<h3>Предварительный просмотр Excel</h3><p class="small">Ровно три столбца: Ф.И. · ссылка на Яндекс Диск · замечания. Без замечаний — зелёная ячейка, с замечаниями — оранжевая.</p><div class="dr-table-wrap"><table class="dr-table"><thead><tr><th>Ф.И.</th><th>Ссылка на Яндекс Диск</th><th>Замечания</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r.fio)+'</td><td><a href="'+esc(r.url||'#')+'" target="_blank" rel="noopener">'+esc(r.url)+'</a></td><td class="'+(r.comment?'warn':'good')+'">'+esc(r.comment||'Нет замечаний')+'</td></tr>').join('')+'</tbody></table></div><p class="small">Кнопка «Копировать строки» копирует табуляцию между ячейками — вставь в Excel начиная с A1.</p>';
  }
  async function copyExcelRows(){
    const rows=excelRows(),textOut=[['Ф.И.','Ссылка на Яндекс Диск','Замечания'],...rows.map(r=>[r.fio,r.url,r.comment])].map(row=>row.join('\t')).join('\n');
    try{await navigator.clipboard.writeText(textOut);notice('Скопировано. Вставь в Excel в ячейку A1 — данные разложатся по столбцам A, B и C.');}
    catch{const ta=document.createElement('textarea');ta.value=textOut;document.body.appendChild(ta);ta.select();const ok=document.execCommand('copy');ta.remove();notice(ok?'Скопировано. Вставь в Excel начиная с A1.':'Не удалось скопировать. Открой предпросмотр и скопируй таблицу вручную.',!ok);}
    showExcelPreview();
  }
  function downloadCsv(){
    const rows=excelRows(),csv=[['Ф.И.','Ссылка на Яндекс Диск','Замечания'],...rows.map(r=>[r.fio,r.url,r.comment])].map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(';')).join('\r\n');
    const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Provoda-Staff-report.xlsx.csv';a.click();URL.revokeObjectURL(url);notice('CSV для Excel скачан.');
  }
  function scheduleLiveRefresh(){
    if(!$('#dailyReportsSheet')?.classList.contains('open'))return;
    if(liveRefreshTimer)clearTimeout(liveRefreshTimer);
    liveRefreshTimer=setTimeout(async()=>{
      liveRefreshTimer=null;
      if(liveRefreshBusy){liveRefreshQueued=true;return;}
      liveRefreshBusy=true;
      try{await load({silent:true});}
      finally{
        liveRefreshBusy=false;
        if(liveRefreshQueued){liveRefreshQueued=false;scheduleLiveRefresh();}
      }
    },220);
  }
  function stopLiveUpdates(){
    if(livePollTimer){clearInterval(livePollTimer);livePollTimer=null;}
    if(liveRefreshTimer){clearTimeout(liveRefreshTimer);liveRefreshTimer=null;}
    if(liveChannel&&cloudClient){try{cloudClient.removeChannel(liveChannel);}catch{}}
    liveChannel=null;
  }
  function startLiveUpdates(){
    stopLiveUpdates();
    if(!cloudClient||!cloudUser)return;
    try{
      const channel=cloudClient.channel('daily-reports-live-'+cloudUser.id+'-'+Math.random().toString(36).slice(2,8));
      ['daily_reports','daily_report_categories','daily_report_settings'].forEach(table=>{
        channel.on('postgres_changes',{event:'*',schema:'public',table},()=>scheduleLiveRefresh());
      });
      // Role changes are picked up by the 15-second fallback; avoid requiring direct SELECT on user_roles.
      liveChannel=channel.subscribe(status=>{
        if(status==='SUBSCRIBED')scheduleLiveRefresh();
        if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')console.info('Daily reports realtime connection unavailable; polling remains active.');
      });
    }catch(error){console.info('Daily reports realtime setup failed; polling remains active.',error?.message||error);}
    // Fallback for mobile browsers, sleep/wake and networks that temporarily drop Realtime.
    livePollTimer=setInterval(()=>scheduleLiveRefresh(),15000);
  }
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible'&&$('#dailyReportsSheet')?.classList.contains('open')){
      startLiveUpdates();scheduleLiveRefresh();
    }
  });
  async function loadStockTable(){
    const box=$('#stStockTable'),foot=$('#stStockFoot');if(!box)return;
    if(!cloudClient||!cloudUser){box.innerHTML='<div class="dr-card">Войди в аккаунт.</div>';return;}
    box.innerHTML='<div class="dr-card">Загружаю остатки…</div>';
    try{
      const {data,error}=await cloudClient.from('product_catalog').select('name,category,price,available,active,stock_quantity,stock_unit,low_stock_threshold').eq('active',true).order('name');
      if(error)throw error;
      const saved=Array.isArray(data)?data:[];
      const base=typeof allCatalogProducts==='function'?allCatalogProducts():[];
      const merged=new Map(base.map(x=>[String(x.name||'').trim().toLowerCase(),{...x,stock_quantity:null,stock_unit:'шт',low_stock_threshold:null}]));
      saved.forEach(x=>merged.set(String(x.name||'').trim().toLowerCase(),{...(merged.get(String(x.name||'').trim().toLowerCase())||{}),...x}));
      const rows=[...merged.values()].sort((a,b)=>String(a.name).localeCompare(String(b.name),'ru'));
      box.innerHTML=rows.length?'<table class="dr-table"><thead><tr><th>Товар</th><th>Цена</th><th>Фактический остаток</th><th>Порог</th><th>Статус</th><th></th></tr></thead><tbody>'+rows.map((x,i)=>'<tr><td>'+esc(x.name)+'</td><td>'+esc(x.price)+' ₽</td><td><div style="display:flex;gap:5px;min-width:145px"><input data-st-stock-qty="'+esc(x.name)+'" type="number" min="0" step="0.001" value="'+(x.stock_quantity==null?'':esc(x.stock_quantity))+'" placeholder="Не задан" style="width:90px;min-width:80px;background:var(--card2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:7px"><input data-st-stock-unit="'+esc(x.name)+'" value="'+esc(x.stock_unit||'шт')+'" aria-label="Единица измерения" style="width:55px;min-width:45px;background:var(--card2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:7px"></div></td><td>'+ (x.low_stock_threshold==null?'—':esc(x.low_stock_threshold))+'</td><td class="'+(x.stock_quantity!=null&&x.stock_quantity===0?'warn':x.stock_quantity!=null&&x.low_stock_threshold!=null&&x.stock_quantity<=x.low_stock_threshold?'warn':'good')+'">'+(x.stock_quantity==null?'Не задан':x.stock_quantity===0?'Нет остатка':x.low_stock_threshold!=null&&x.stock_quantity<=x.low_stock_threshold?'Мало':'В норме')+'</td><td><button type="button" class="dr-btn" data-st-stock-save="'+esc(x.name)+'">Сохранить</button></td></tr>').join('')+'</tbody></table>':'<div class="dr-card">В общем каталоге пока нет сохранённых товаров. Добавь товары через каталог, затем укажи фактический остаток.</div>';
      if(foot)foot.textContent='Загружено позиций: '+rows.length+'. Пустой остаток означает «учёт ещё не задан», а не ноль.';
    }catch(e){box.innerHTML='<div class="dr-card">Не удалось загрузить остатки: '+esc(e.message||'')+'. Проверь SQL-миграцию и права.</div>';}
  }
  async function saveStockRow(name){
    const qtyEl=document.querySelector('[data-st-stock-qty="'+CSS.escape(name)+'"]'),unitEl=document.querySelector('[data-st-stock-unit="'+CSS.escape(name)+'"]'),foot=$('#stStockFoot');
    if(!qtyEl)return;
    const raw=qtyEl.value.trim(),qty=raw===''?null:Number(raw);
    if(qty!==null&&(!Number.isFinite(qty)||qty<0)){if(foot)foot.textContent='Остаток должен быть числом не меньше нуля.';return;}
    const unit=(unitEl?.value||'шт').trim()||'шт';
    const item=(typeof allCatalogProducts==='function'?allCatalogProducts():[]).find(x=>String(x.name||'').trim().toLowerCase()===String(name||'').trim().toLowerCase())||{};
    try{const {error}=await cloudClient.rpc('shared_stock_set',{product_name:name,new_quantity:qty,new_unit:unit,new_low_stock_threshold:null,new_category:item.category||'другое',new_price:Number(item.price)||0});if(error)throw error;if(foot)foot.textContent='Остаток для «'+name+'» сохранён.';await loadStockTable();}
    catch(e){if(foot)foot.textContent='Не удалось сохранить остаток: '+(e.message||'ошибка');}
  }
  async function loadSharedSpend(){
    const rows=$('#stSpendRows'),foot=$('#stSpendFoot');if(!rows)return;
    if(!cloudClient||!cloudUser){rows.innerHTML='<tr><td colspan="6">Войди в аккаунт.</td></tr>';return;}
    rows.innerHTML='<tr><td colspan="6">Загружаю журнал…</td></tr>';
    try{
      const {data,error}=await cloudClient.rpc('shared_product_issues_list',{date_from:null,date_to:null});if(error)throw error;
      const items=Array.isArray(data?.items)?data.items:[];const total=Number(data?.total)||0;
      if($('#stSpendTotal'))$('#stSpendTotal').textContent=new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2}).format(total);
      if($('#stSpendCount'))$('#stSpendCount').textContent=String(data?.count||items.length);
      rows.innerHTML=items.length?items.map(x=>'<tr><td>'+esc(new Date(x.created_at).toLocaleString('ru-RU'))+'</td><td>'+esc(x.employee_name||'Сотрудник')+'</td><td>'+esc(x.product_name)+'</td><td>'+esc(x.quantity)+' '+esc(x.unit||'шт')+'</td><td>'+esc(x.unit_price)+' ₽</td><td>'+esc(x.total)+' ₽</td></tr>').join(''):'<tr><td colspan="6">Выдач пока нет. Покупки из общего каталога появятся здесь после установки SQL-миграции.</td></tr>';
      if(foot)foot.textContent='Записей: '+items.length+'. Сумма считается по журналу общих выдач; личные расходы не раскрываются.';
      window.__provodaSharedSpendRows=items;
    }catch(e){rows.innerHTML='<tr><td colspan="6">Не удалось загрузить общие траты. Проверь применение supabase/shared-stock-spend-custom-roles.sql. '+esc(e.message||'')+'</td></tr>';if(foot)foot.textContent='Доступ ограничен Админом и СТ.';}
  }
  function downloadSharedSpendCsv(){
    const rows=window.__provodaSharedSpendRows||[];if(!rows.length){notice('Нет записей для экспорта.',true);return;}
    const csv=[['Дата','Сотрудник','Товар','Количество','Ед.','Цена','Сумма','Комментарий'],...rows.map(x=>[new Date(x.created_at).toLocaleString('ru-RU'),x.employee_name,x.product_name,x.quantity,x.unit,x.unit_price,x.total,x.note||''])].map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');
    const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='provoda-shared-spend.csv';a.click();URL.revokeObjectURL(url);
  }
  document.addEventListener('click',e=>{
    if(e.target.closest('[data-st-spend-refresh]')){loadSharedSpend();return;}
    if(e.target.closest('[data-st-stock-refresh]')){loadStockTable();return;}
    const stockSave=e.target.closest('[data-st-stock-save]');if(stockSave){saveStockRow(stockSave.dataset.stStockSave);return;}
    if(e.target.closest('[data-st-spend-export]')){downloadSharedSpendCsv();return;}
    const quick=e.target.closest('[data-st-section]');
    if(quick){
      const section=quick.dataset.stSection;
      document.querySelectorAll('#stQuickNav [data-st-section]').forEach(b=>b.classList.toggle('active',b===quick));
      const note=$('#stFeatureNotice'),settings=$('#drSettingsView');
      if(section==='tasks'){note?.classList.remove('visible');settings?.classList.add('dr-hidden');const panel=$('#shiftPanelSheet');if(panel)panel.scrollTo({top:0,behavior:'smooth'});setTimeout(()=>$('#shiftTasksWorkspace')?.scrollIntoView({behavior:'smooth',block:'start'}),40);}
      else if(section==='reports'){note?.classList.remove('visible');settings?.classList.add('dr-hidden');open();}
      else if(section==='stock'){settings?.classList.add('dr-hidden');if(note){note.innerHTML='<strong>Товарная база · фактические остатки</strong><p class="small">Указывай фактический остаток по каждому товару. При выдаче товара через общий каталог количество будет уменьшаться автоматически.</p><div class="dr-actions"><button type="button" class="dr-btn" data-st-stock-refresh>Обновить остатки</button></div><div id="stStockTable" class="dr-table-wrap"><div class="dr-card">Загружаю каталог…</div></div><p id="stStockFoot" class="small">Для изменения остатка нужны права Админа или СТ и установленная SQL-миграция.</p>';note.classList.add('visible');}loadStockTable();}
      else if(section==='roles'){note?.classList.remove('visible');if(isReviewer){settings?.classList.remove('dr-hidden');renderCategories();loadUsers();settings?.scrollIntoView({behavior:'smooth',block:'start'});}else if(note){note.innerHTML='<strong>Недостаточно прав</strong>Назначать дневную и ночную смену может только Админ или СТ.';note.classList.add('visible');}}
      else if(section==='spend'){
        settings?.classList.add('dr-hidden');
        if(note){note.innerHTML='<strong>Общие траты · выдача товаров</strong><div class="st-analytics-grid"><div><span>Общая сумма</span><b id="stSpendTotal">—</b></div><div><span>Выдач</span><b id="stSpendCount">—</b></div></div><div class="dr-actions" style="margin-top:12px"><button type="button" class="dr-btn" data-st-spend-refresh>Обновить</button><button type="button" class="dr-btn" data-st-spend-export>Скачать CSV</button></div><div class="dr-table-wrap" style="margin-top:12px"><table class="dr-table" style="min-width:620px"><thead><tr><th>Когда</th><th>Кто</th><th>Что взял</th><th>Количество</th><th>Цена</th><th>Сумма</th></tr></thead><tbody id="stSpendRows"><tr><td colspan="6">Загружаю…</td></tr></tbody></table></div><p id="stSpendFoot" class="small">Журнал выдач из общего каталога. Для совместной работы примени новую SQL-миграцию.</p>';note.classList.add('visible');}
        loadSharedSpend();
      }
      else if(section==='analytics'){
        settings?.classList.add('dr-hidden');
        if(note){note.innerHTML='<strong>Расширенная аналитика · сотрудники и динамика</strong><div class="st-analytics-grid"><div><span>Всего отчётов</span><b id="stMetricTotal">—</b></div><div><span>Одобрено</span><b id="stMetricApproved">—</b></div><div><span>Отклонено / ошибки</span><b id="stMetricRejected">—</b></div><div><span>На проверке</span><b id="stMetricPending">—</b></div><div><span>Успешность</span><b id="stMetricRate">—</b></div><div><span>Дневные / ночные</span><b id="stMetricShifts">—</b></div></div><h4 style="margin:16px 0 8px">Показатели по сотрудникам</h4><div id="stAnalyticsPeople" class="dr-table-wrap"><div class="dr-card">Загружаю…</div></div><h4 style="margin:16px 0 8px">Динамика по дням</h4><div id="stAnalyticsTrend" class="dr-table-wrap"></div><p id="stAnalyticsFoot" style="margin:10px 0 0">Загружаю актуальные данные…</p>';note.classList.add('visible');}
        load({silent:true}).then(()=>{
          const total=reports.length,approved=reports.filter(r=>r.status==='approved').length,rejected=reports.filter(r=>r.status==='rejected').length,pending=reports.filter(r=>r.status==='pending').length,done=approved+rejected,rate=done?Math.round(approved/done*100):0,day=reports.filter(r=>r.shift_type==='day').length,night=reports.filter(r=>r.shift_type==='night').length;
          const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=String(value);};
          set('stMetricTotal',total);set('stMetricApproved',approved);set('stMetricRejected',rejected);set('stMetricPending',pending);set('stMetricRate',done?rate+'%':'—');set('stMetricShifts',day+' / '+night);
          const byPerson=new Map(),byDate=new Map();
          reports.forEach(r=>{const name=r.author_name||users.find(u=>u.user_id===r.submitted_by)?.display_name||r.submitted_by||'Сотрудник';const p=byPerson.get(name)||{total:0,approved:0,rejected:0,pending:0,missing:0};p.total++;p[r.status]=(p[r.status]||0)+1;if(Array.isArray(r.items)&&r.items.some(i=>!i.completed))p.missing++;byPerson.set(name,p);const date=String(r.report_date||r.submitted_at||'').slice(0,10);if(date){const d=byDate.get(date)||{total:0,approved:0,rejected:0};d.total++;d[r.status]=(d[r.status]||0)+1;byDate.set(date,d);}});
          const people=$('#stAnalyticsPeople');if(people){const rows=[...byPerson.entries()].sort((a,b)=>b[1].total-a[1].total);people.innerHTML=rows.length?'<table class="dr-table"><thead><tr><th>Сотрудник</th><th>Всего</th><th>Успешно</th><th>Ошибки / отказ</th><th>На проверке</th><th>Незаполненный чек-лист</th></tr></thead><tbody>'+rows.map(([name,p])=>'<tr><td>'+esc(name)+'</td><td>'+p.total+'</td><td class="good">'+p.approved+'</td><td class="warn">'+p.rejected+'</td><td>'+p.pending+'</td><td>'+p.missing+'</td></tr>').join('')+'</tbody></table>':'Нет отчётов для анализа.';}
          const trend=$('#stAnalyticsTrend');if(trend){const rows=[...byDate.entries()].sort((a,b)=>b[0].localeCompare(a[0])).slice(0,21);trend.innerHTML=rows.length?'<table class="dr-table"><thead><tr><th>Дата</th><th>Всего</th><th>Одобрено</th><th>Отклонено</th><th>Успешность</th></tr></thead><tbody>'+rows.map(([date,p])=>'<tr><td>'+esc(date)+'</td><td>'+p.total+'</td><td class="good">'+(p.approved||0)+'</td><td class="warn">'+(p.rejected||0)+'</td><td>'+((p.approved||0)+(p.rejected||0)?Math.round((p.approved||0)/((p.approved||0)+(p.rejected||0))*100)+'%':'—')+'</td></tr>').join('')+'</tbody></table>':'Нет данных.';}
          set('stAnalyticsFoot','Анализ последних '+total+' загруженных сменных отчётов. «Незаполненный чек-лист» — отчёты, где хотя бы один пункт не отмечен; это индикатор ошибки, а не автоматическое отклонение.');
        }).catch(()=>{const foot=$('#stAnalyticsFoot');if(foot)foot.textContent='Не удалось обновить статистику. Открой «Отчёты» и проверь подключение.';});
      }
      return;
    }
    if(e.target.closest('#openDailyReportsBtn'))open();
    if(e.target.closest('#openShiftPanelBtn')){
      ensureUI();document.querySelectorAll('#stQuickNav [data-st-section]').forEach(b=>b.classList.toggle('active',b.dataset.stSection==='tasks'));$('#stFeatureNotice')?.classList.remove('visible');
      if(cloudClient&&cloudUser)load().then(()=>{if(isReviewer){$('#drSettingsView')?.classList.add('dr-hidden');renderCategories();loadUsers();}});
    }
  });
  document.addEventListener('DOMContentLoaded',ensureUI);
  if(document.readyState!=='loading')ensureUI();
})();