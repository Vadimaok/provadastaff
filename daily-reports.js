/* Provoda Staff shift reports — Yandex Disk link workflow */
(() => {
  const $ = (s, root=document) => root.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let cats=[], reports=[], isAdmin=false, isReviewer=false, isEnabled=true, canSubmit=false, userRole='employee', activeShift='day', users=[];
  let liveChannel=null, livePollTimer=null, liveRefreshTimer=null, liveRefreshBusy=false, liveRefreshQueued=false;
  function ensureUI(){
    if(!$('#openDailyReportsBtn')){
      const anchor=$('#openKnzTasksBtn')||$('#openShiftPanelBtn')||$('#openSettingsBtn');
      if(anchor){const b=document.createElement('button');b.type='button';b.id='openDailyReportsBtn';b.className='profile-menu-action';b.innerHTML='<span aria-hidden="true">▤</span><span>Сменные отчёты</span>';anchor.insertAdjacentElement('afterend',b);}
    }
    if($('#dailyReportsSheet'))return;
    const style=document.createElement('style');
    style.textContent=`
      #dailyReportsSheet{position:fixed;inset:0;z-index:850;display:none;overflow:auto;background:rgba(4,8,15,.82);backdrop-filter:blur(12px);padding:clamp(10px,3vw,26px)}
      #dailyReportsSheet.open{display:block}.dr-shell{max-width:1050px;margin:0 auto;border:1px solid var(--line);border-radius:24px;background:var(--card);padding:clamp(14px,3vw,26px);box-shadow:var(--shadow)}
      .dr-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.dr-head h2{margin:0 0 5px}.dr-tabs,.dr-actions{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}
      .dr-btn{border:1px solid var(--line);border-radius:12px;padding:10px 13px;background:rgba(255,255,255,.06);color:var(--text);cursor:pointer}.dr-btn.primary{background:var(--accent);border-color:transparent}.dr-btn:disabled{opacity:.5}
      .dr-card{border:1px solid var(--line);border-radius:16px;padding:14px;margin:12px 0;background:rgba(255,255,255,.025)}.dr-item-head{display:flex;gap:10px;justify-content:space-between;align-items:center}.dr-item h4{margin:0;font-size:14px}
      .dr-comment,.dr-url{width:100%;box-sizing:border-box;min-height:74px;resize:vertical;padding:11px;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--text);font:inherit;margin-top:8px}.dr-url{min-height:42px;resize:none}
      .dr-status{display:inline-block;border-radius:999px;padding:4px 9px;font-size:11px;background:rgba(148,163,184,.14)}.dr-status.approved{color:#34d399;background:rgba(52,211,153,.13)}.dr-status.rejected{color:#fb923c;background:rgba(251,146,60,.14)}
      .dr-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.dr-grid label{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--muted)}.dr-grid input,.dr-grid select{padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--card2);color:var(--text)}
      .dr-table-wrap{overflow:auto}.dr-table{width:100%;border-collapse:collapse;font-size:13px}.dr-table th,.dr-table td{padding:10px;border:1px solid var(--line);text-align:left;vertical-align:top}.dr-table td.good{background:rgba(52,211,153,.17)}.dr-table td.warn{background:rgba(251,146,60,.18)}
      .dr-hidden{display:none!important}.dr-check{display:flex;gap:10px;align-items:flex-start}.dr-check input{margin-top:3px}
      @media(max-width:600px){.dr-grid{grid-template-columns:1fr}.dr-shell{padding:13px}}
    `;
    document.head.appendChild(style);
    const sheet=document.createElement('div');sheet.id='dailyReportsSheet';sheet.setAttribute('aria-hidden','true');
    sheet.innerHTML=`<section class="dr-shell" role="dialog" aria-modal="true" aria-labelledby="drTitle">
      <header class="dr-head"><div><div class="small">PROVODA STAFF · SHIFT CONTROL</div><h2 id="drTitle">Сменные отчёты</h2><p class="small">Отчёт по чек-листу и ссылка на Яндекс Диск</p></div><button class="icon" id="drClose" type="button" aria-label="Закрыть">×</button></header>
      <div id="drDisabled" class="dr-card dr-hidden">Модуль отчётов временно отключён администратором.</div>
      <nav class="dr-tabs" id="drTabs"><button class="dr-btn primary" data-dr-view="new">Новый отчёт</button><button class="dr-btn" data-dr-view="history">История отчётов</button><button class="dr-btn dr-hidden" id="drSettingsTab" data-dr-view="settings">Управление</button></nav>
      <div id="drNotice" class="small" role="status"></div>
      <section id="drNewView"><div class="dr-grid"><label>Тип смены<select id="drShift"><option value="day">Дневная</option><option value="night">Ночная</option></select></label><label>Дата отчёта<input id="drDate" type="date"></label></div><div id="drChecklist"></div>
      <label class="small" for="drYandexUrl">Ссылка на Яндекс Диск</label><input id="drYandexUrl" class="dr-url" type="url" placeholder="https://disk.yandex.ru/..." autocomplete="url">
      <label class="small" for="drSenderComment">Комментарий для Админа / СТ (необязательно)</label><textarea id="drSenderComment" class="dr-comment" placeholder="Пояснение, проблема или сообщение для проверяющих…"></textarea>
      <div class="dr-actions"><button class="dr-btn primary" id="drPreview">Предварительный просмотр</button><button class="dr-btn" id="drSubmit">Отправить отчёт</button></div><div id="drPreviewBox" class="dr-card dr-hidden"></div></section>
      <section id="drHistoryView" class="dr-hidden"><div class="dr-actions"><button class="dr-btn" id="drExport">Предпросмотр Excel</button><button class="dr-btn primary" id="drCopyExcel">Копировать строки для Excel</button><button class="dr-btn" id="drDownloadCsv">Скачать CSV</button></div><div id="drHistoryList"></div><div id="drExcelPreview" class="dr-card dr-hidden"></div></section>
      <section id="drSettingsView" class="dr-hidden"><div class="dr-card" id="drModuleSettingsCard"><label class="dr-item-head"><strong>Модуль сменных отчётов включён</strong><input id="drEnabled" type="checkbox"></label><div class="dr-actions"><button class="dr-btn primary" id="drSaveEnabled">Сохранить</button></div></div>
      <div class="dr-card"><h3>Назначение дневной / ночной роли</h3><p class="small">Доступно Админу и СТ. СТ может назначать дневную и ночную смену.</p><div class="dr-grid"><label>Сотрудник<select id="drUserSelect"></select></label><label>Роль<select id="drUserRole"><option value="shift_day">Дневная смена</option><option value="shift_night">Ночная смена</option><option value="employee">Без роли смены</option></select></label></div><div class="dr-actions"><button class="dr-btn primary" id="drSaveUserRole">Сохранить роль</button></div></div>
      <div class="dr-card"><h3>Категории отчётов</h3><div id="drCategoryList"></div><div class="dr-grid"><label>Смена<select id="drCatShift"><option value="day">Дневная</option><option value="night">Ночная</option></select></label><label>Название категории<input id="drCatTitle" maxlength="180" placeholder="Например, чистая стойка"></label></div><div class="dr-actions"><button class="dr-btn primary" id="drAddCategory">Добавить категорию</button></div></div></section>
    </section>`;
    document.body.appendChild(sheet);
    $('#drClose').addEventListener('click',close);
    $('#drShift').addEventListener('change',renderChecklist);
    $('#drPreview').addEventListener('click',showPreview);
    $('#drSubmit').addEventListener('click',submitReport);
    $('#drExport').addEventListener('click',showExcelPreview);
    $('#drCopyExcel').addEventListener('click',copyExcelRows);
    $('#drDownloadCsv').addEventListener('click',downloadCsv);
    $('#drSaveEnabled').addEventListener('click',saveEnabled);
    $('#drAddCategory').addEventListener('click',addCategory);
    $('#drSaveUserRole').addEventListener('click',saveUserRole);
    $('#drTabs').addEventListener('click',e=>{const b=e.target.closest('[data-dr-view]');if(b)showView(b.dataset.drView);});
    $('#drHistoryList').addEventListener('click',historyAction);
    $('#drCategoryList').addEventListener('click',categoryAction);
  }
  function notice(msg,bad=false){const el=$('#drNotice');if(el){el.textContent=msg;el.style.color=bad?'var(--bad)':'var(--muted)';}}
  function close(){const s=$('#dailyReportsSheet');if(s){s.classList.remove('open');s.setAttribute('aria-hidden','true');}stopLiveUpdates();}
  function open(){ensureUI();if(!cloudClient||!cloudUser){notice('Сначала войди в аккаунт.',true);return;}try{closeProfileMenu()}catch{}$('#dailyReportsSheet').classList.add('open');$('#dailyReportsSheet').setAttribute('aria-hidden','false');$('#drDate').value=new Date().toISOString().slice(0,10);load();startLiveUpdates();}
  async function getRole(){
    try{const {data,error}=await cloudClient.rpc('is_current_admin');if(error)throw error;isAdmin=!!data;}catch{isAdmin=false;}
    try{const {data,error}=await cloudClient.rpc('daily_report_my_role');if(error)throw error;userRole=data||currentUserRole||'employee';}catch{userRole=(typeof currentUserRole!=='undefined'&&currentUserRole)||'employee';}
    isReviewer=isAdmin||userRole==='shift_senior';canSubmit=isAdmin||isReviewer||userRole==='shift_day'||userRole==='shift_night';
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
      $('#drSettingsTab').classList.toggle('dr-hidden',!isReviewer);
      $('#drModuleSettingsCard').classList.toggle('dr-hidden',!isAdmin);
      $('#drEnabled').checked=isEnabled;
      if(!canSubmit&&!isReviewer)notice('Для заполнения отчёта Админ или СТ должен назначить роль дневной или ночной смены.',true);
      renderChecklist();renderHistory();renderCategories();
      if(isReviewer)await loadUsers();
      if(!silent){if(!isEnabled&&!isReviewer)notice('Модуль временно отключён администратором.');
      else if(canSubmit||isReviewer)notice('');}
    }catch(e){notice('Ошибка загрузки сменных отчётов: '+(e.message||'проверь SQL-файл supabase/daily-reports.sql'),true);}
  }
  function showView(view){
    if(view==='settings'&&!isReviewer)return;
    $('#drNewView').classList.toggle('dr-hidden',view!=='new');
    $('#drHistoryView').classList.toggle('dr-hidden',view!=='history');
    $('#drSettingsView').classList.toggle('dr-hidden',view!=='settings');
    document.querySelectorAll('#drTabs [data-dr-view]').forEach(b=>b.classList.toggle('primary',b.dataset.drView===view));
    if(view==='history')renderHistory();if(view==='settings'){renderCategories();loadUsers();}
  }
  function activeCats(){return cats.filter(c=>c.shift_type===activeShift&&c.enabled).sort((a,b)=>a.position-b.position);}
  function renderChecklist(){
    if(userRole==='shift_day')$('#drShift').value='day';else if(userRole==='shift_night')$('#drShift').value='night';
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
    if((userRole==='shift_day'&&$('#drShift').value!=='day')||(userRole==='shift_night'&&$('#drShift').value!=='night')){notice('У тебя нет доступа к этому типу смены.',true);return;}
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
      const sel=$('#drUserSelect'),old=sel.value;sel.innerHTML=users.map(u=>'<option value="'+esc(u.user_id)+'">'+esc(u.display_name)+' · '+esc(({shift_day:'Дневная смена',shift_night:'Ночная смена',shift_senior:'СТ',employee_knz:'КНЗ',employee:'Сотрудник'})[u.role]||u.role)+'</option>').join('');
      if(users.some(u=>u.user_id===old))sel.value=old;
      const chosen=users.find(u=>u.user_id===sel.value);if(chosen&&['shift_day','shift_night'].includes(chosen.role))$('#drUserRole').value=chosen.role;else $('#drUserRole').value='employee';
    }catch(e){notice('Не удалось загрузить список сотрудников для назначения ролей: '+(e.message||''),true);}
  }
  async function saveUserRole(){
    const userId=$('#drUserSelect').value,role=$('#drUserRole').value;if(!userId){notice('Выбери сотрудника.',true);return;}
    try{const {error}=await cloudClient.rpc('admin_set_user_role',{target_user_id:userId,new_role:role});if(error)throw error;notice('Роль сотрудника сохранена.');await loadUsers();}catch(e){notice(e.message||'Не удалось назначить роль.',true);}
  }
  function excelRows(){return reports.filter(r=>r.status!=='pending').map(r=>({fio:r.author_name||(r.submitted_by===cloudUser.id?(cloudUser.user_metadata?.display_name||cloudUser.email||'Вы'):'Сотрудник'),url:r.yandex_disk_url||'',comment:r.reviewer_comment||''}));}
  function showExcelPreview(){
    const rows=excelRows(),box=$('#drExcelPreview');box.classList.remove('dr-hidden');
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
      channel.on('postgres_changes',{event:'*',schema:'public',table:'user_roles',filter:'user_id=eq.'+cloudUser.id},()=>scheduleLiveRefresh());
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
  document.addEventListener('click',e=>{if(e.target.closest('#openDailyReportsBtn'))open();});
  document.addEventListener('DOMContentLoaded',ensureUI);
  if(document.readyState!=='loading')ensureUI();
})();