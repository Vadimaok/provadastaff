/* Provoda Staff daily/night shift reports module */
(() => {
  const $ = (s, root=document) => root.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let cats=[], reports=[], isAdmin=false, isReviewer=false, isEnabled=true, canSubmit=false, userRole='employee', activeShift='day', draftFiles={}, previewDraft=null;
  const defaults = {
    day:['Фотография заполненного холодильника','Фотография кухни','Фотографии мусорок','Заполненные салфетницы'],
    night:['Заполненный холодильник','Фотография кухни','Чистая техника: аэрогриль, духовка, кофемашинка','Фотография бойлера','Фотография кружек','Общий план стойки администрации','Прибранные комнаты; где необходимо — кондиционеры выключены, пульты на месте','Беспроводные девайсы на зарядке','Дополнительные девайсы + сообщение от шефа']
  };
  function ensureUI(){
    if(!$('#openDailyReportsBtn')){
      const anchor=$('#openKnzTasksBtn') || $('#openShiftPanelBtn') || $('#openSettingsBtn');
      if(anchor){
        const b=document.createElement('button');b.type='button';b.id='openDailyReportsBtn';b.className='profile-menu-action';b.innerHTML='<span aria-hidden="true">▤</span><span>Сменные отчёты</span>';
        anchor.insertAdjacentElement('afterend',b);
      }
    }
    if($('#dailyReportsSheet'))return;
    const style=document.createElement('style');
    style.textContent=`
      #dailyReportsSheet{position:fixed;inset:0;z-index:850;display:none;overflow:auto;background:rgba(4,8,15,.82);backdrop-filter:blur(12px);padding:clamp(10px,3vw,26px)}
      #dailyReportsSheet.open{display:block}.dr-shell{max-width:1050px;margin:0 auto;border:1px solid var(--line);border-radius:24px;background:var(--card);padding:clamp(14px,3vw,26px);box-shadow:var(--shadow)}
      .dr-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.dr-head h2{margin:0 0 5px}.dr-tabs,.dr-actions{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}
      .dr-btn{border:1px solid var(--line);border-radius:12px;padding:10px 13px;background:rgba(255,255,255,.06);color:var(--text);cursor:pointer}.dr-btn.primary{background:var(--accent);border-color:transparent}.dr-btn:disabled{opacity:.5}
      .dr-card{border:1px solid var(--line);border-radius:16px;padding:14px;margin:12px 0;background:rgba(255,255,255,.025)}.dr-item-head{display:flex;gap:10px;justify-content:space-between;align-items:center}.dr-item h4{margin:0 0 9px;font-size:14px}.dr-upload{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.dr-upload input{max-width:100%;font-size:12px}.dr-comment{width:100%;min-height:76px;resize:vertical;padding:11px;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--text);font:inherit;margin-top:8px}
      .dr-photo-grid{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.dr-photo-grid img{width:110px;height:90px;object-fit:cover;border-radius:10px;border:1px solid var(--line)}.dr-status{display:inline-block;border-radius:999px;padding:4px 9px;font-size:11px;background:rgba(148,163,184,.14)}.dr-status.approved{color:#34d399;background:rgba(52,211,153,.13)}.dr-status.rejected{color:#fb923c;background:rgba(251,146,60,.14)}
      .dr-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.dr-grid label{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--muted)}.dr-grid input,.dr-grid select{padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--card2);color:var(--text)}
      .dr-table-wrap{overflow:auto}.dr-table{width:100%;border-collapse:collapse;font-size:13px}.dr-table th,.dr-table td{padding:10px;border:1px solid var(--line);text-align:left;vertical-align:top}.dr-table td.good{background:rgba(52,211,153,.17)}.dr-table td.warn{background:rgba(251,146,60,.18)}
      .dr-hidden{display:none!important}@media(max-width:600px){.dr-grid{grid-template-columns:1fr}.dr-shell{padding:13px}.dr-photo-grid img{width:84px;height:74px}}
    `;
    document.head.appendChild(style);
    const sheet=document.createElement('div');sheet.id='dailyReportsSheet';sheet.setAttribute('aria-hidden','true');
    sheet.innerHTML=`<section class="dr-shell" role="dialog" aria-modal="true" aria-labelledby="drTitle">
      <header class="dr-head"><div><div class="small">PROVODA STAFF · SHIFT CONTROL</div><h2 id="drTitle">Сменные отчёты</h2><p class="small">Фотографии смены, проверка и архив</p></div><button class="icon" id="drClose" type="button" aria-label="Закрыть">×</button></header>
      <div id="drDisabled" class="dr-card dr-hidden">Модуль отчётов временно отключён администратором.</div>
      <nav class="dr-tabs" id="drTabs"><button class="dr-btn primary" data-dr-view="new">Новый отчёт</button><button class="dr-btn" data-dr-view="history">История отчётов</button><button class="dr-btn dr-hidden" id="drSettingsTab" data-dr-view="settings">Настройки</button></nav>
      <div id="drNotice" class="small" role="status"></div>
      <section id="drNewView"><div class="dr-grid"><label>Тип смены<select id="drShift"><option value="day">Дневная</option><option value="night">Ночная</option></select></label><label>Дата отчёта<input id="drDate" type="date"></label></div><div id="drChecklist"></div><label class="small" for="drSenderComment">Комментарий к отчёту (необязательно)</label><textarea id="drSenderComment" class="dr-comment" placeholder="Добавь пояснение для Админа / СТ…"></textarea><div class="dr-actions"><button class="dr-btn primary" id="drPreview">Предварительный просмотр</button><button class="dr-btn" id="drSubmit">Отправить отчёт</button></div><div id="drPreviewBox" class="dr-card dr-hidden"></div></section>
      <section id="drHistoryView" class="dr-hidden"><div class="dr-actions"><button class="dr-btn" id="drExport">Выгрузить в Excel</button></div><div id="drHistoryList"></div><div id="drExcelPreview" class="dr-card dr-hidden"></div></section>
      <section id="drSettingsView" class="dr-hidden"><div class="dr-card"><label class="dr-item-head"><strong>Модуль сменных отчётов включён</strong><input id="drEnabled" type="checkbox"></label><div class="dr-actions"><button class="dr-btn primary" id="drSaveEnabled">Сохранить</button></div></div><div class="dr-card"><h3>Категории дневной и ночной смены</h3><div id="drCategoryList"></div><div class="dr-grid"><label>Смена<select id="drCatShift"><option value="day">Дневная</option><option value="night">Ночная</option></select></label><label>Название категории<input id="drCatTitle" maxlength="180" placeholder="Например, чистая стойка"></label></div><div class="dr-actions"><button class="dr-btn primary" id="drAddCategory">Добавить категорию</button></div><p class="small">Можно изменить название и порядок категории или временно выключить её.</p></div></section>
    </section>`;
    document.body.appendChild(sheet);
    $('#drClose').addEventListener('click',close);
    $('#drShift').addEventListener('change',()=>renderChecklist());
    $('#drPreview').addEventListener('click',showPreview);
    $('#drSubmit').addEventListener('click',submitReport);
    $('#drExport').addEventListener('click',showExcelPreview);
    $('#drSaveEnabled').addEventListener('click',saveEnabled);
    $('#drAddCategory').addEventListener('click',addCategory);
    $('#drTabs').addEventListener('click',e=>{const b=e.target.closest('[data-dr-view]');if(b)showView(b.dataset.drView);});
    $('#drChecklist').addEventListener('change',e=>{const input=e.target.closest('[data-dr-files]');if(input){draftFiles[input.dataset.drFiles]=[...(input.files||[])];previewDraft=null;previewLocalFiles(e);}});
    $('#drHistoryList').addEventListener('click',historyAction);
    $('#drCategoryList').addEventListener('click',categoryAction);
  }
  function notice(msg,bad=false){const el=$('#drNotice');if(el){el.textContent=msg;el.style.color=bad?'var(--bad)':'var(--muted)';}}
  function close(){const s=$('#dailyReportsSheet');if(s){s.classList.remove('open');s.setAttribute('aria-hidden','true');}}
  function open(){ensureUI();if(!cloudClient||!cloudUser){notice('Сначала войди в аккаунт.',true);return;}closeProfile();$('#dailyReportsSheet').classList.add('open');$('#dailyReportsSheet').setAttribute('aria-hidden','false');$('#drDate').value=new Date().toISOString().slice(0,10);load();}
  function closeProfile(){try{if(typeof closeProfileMenu==='function')closeProfileMenu();}catch{}}
  async function getAdmin(){try{const {data,error}=await cloudClient.rpc('is_current_admin');if(error)throw error;isAdmin=!!data;}catch{isAdmin=false;}userRole=(typeof currentUserRole!=='undefined'&&currentUserRole)||'employee';isReviewer=isAdmin||userRole==='shift_senior';canSubmit=isAdmin||isReviewer||userRole==='shift_day'||userRole==='shift_night';}
  async function load(){
    notice('Загружаю отчёты…');await getAdmin();
    try{
      const [{data:setting,error:se},{data:categoryRows,error:ce},{data:rows,error:re}]=await Promise.all([
        cloudClient.from('daily_report_settings').select('*').eq('key','daily_reports').maybeSingle(),
        cloudClient.from('daily_report_categories').select('*').order('shift_type').order('position'),
        cloudClient.from('daily_reports').select('*').order('submitted_at',{ascending:false}).limit(100)
      ]);
      if(se)throw se;if(ce)throw ce;if(re)throw re;
      isEnabled=setting?.enabled!==false;cats=categoryRows||[];reports=rows||[];
      $('#drDisabled').classList.toggle('dr-hidden',(isEnabled&&canSubmit)||isAdmin||isReviewer);
      $('#drNewView').classList.toggle('dr-hidden',(!isEnabled&&!isAdmin&&!isReviewer)||!canSubmit);
      $('#drSettingsTab').classList.toggle('dr-hidden',!isAdmin);
      if(!canSubmit&&!isAdmin&&!isReviewer)notice('Для заполнения отчётов Админ должен назначить роль «Дневная смена» или «Ночная смена».',true);
      $('#drEnabled').checked=isEnabled;
      renderChecklist();renderHistory();renderCategories();
      if(!isEnabled&&!isAdmin&&!isReviewer)notice('Модуль временно отключён администратором.');
      else notice('');
    }catch(e){notice('Не удалось загрузить модуль. Выполни supabase/daily-reports.sql в SQL Editor. '+(e.message||''),true);}
  }
  function showView(view){
    if(view==='settings'&&!isAdmin)return;
    $('#drNewView').classList.toggle('dr-hidden',view!=='new');
    $('#drHistoryView').classList.toggle('dr-hidden',view!=='history');
    $('#drSettingsView').classList.toggle('dr-hidden',view!=='settings');
    document.querySelectorAll('#drTabs [data-dr-view]').forEach(b=>b.classList.toggle('primary',b.dataset.drView===view));
    if(view==='history')renderHistory();if(view==='settings')renderCategories();
  }
  function activeCats(){return cats.filter(c=>c.shift_type===activeShift&&c.enabled).sort((a,b)=>a.position-b.position);}
  function renderChecklist(){
    if(userRole==='shift_day')$('#drShift').value='day';else if(userRole==='shift_night')$('#drShift').value='night';
    $('#drShift').disabled=!isAdmin&&!isReviewer;activeShift=$('#drShift').value;draftFiles={};previewDraft=null;
    const list=activeCats();
    $('#drChecklist').innerHTML=list.map((c,i)=>`<article class="dr-card dr-item"><div class="dr-item-head"><h4>${i+1}. ${esc(c.title)}</h4><span class="small">Фото</span></div><div class="dr-upload"><input type="file" accept="image/*" capture="environment" multiple data-dr-files="${esc(c.id)}" aria-label="Фото: ${esc(c.title)}"></div><div class="dr-photo-grid" data-dr-preview="${esc(c.id)}"></div></article>`).join('')||'<div class="dr-card">Нет активных категорий для этой смены.</div>';
    // File preview listener is attached once in ensureUI.
  }
  function previewLocalFiles(e){
    const input=e.target.closest('[data-dr-files]');if(!input)return;
    const box=$('[data-dr-preview="'+CSS.escape(input.dataset.drFiles)+'"]');if(!box)return;
    box.innerHTML='';[...(input.files||[])].forEach(f=>{const img=document.createElement('img');img.alt=f.name;img.src=URL.createObjectURL(f);box.appendChild(img);});
  }
  function showPreview(){
    const shift=$('#drShift').value, date=$('#drDate').value||new Date().toISOString().slice(0,10);
    const items=activeCats().map(c=>({category_id:c.id,title:c.title,photos:(draftFiles[c.id]||[]).map(f=>f.name)}));
    previewDraft={shift_type:shift,report_date:date,items,sender_comment:$('#drSenderComment').value.trim()};
    $('#drPreviewBox').classList.remove('dr-hidden');
    $('#drPreviewBox').innerHTML='<h3>Предварительный отчёт · '+(shift==='day'?'Дневная':'Ночная')+'</h3><p class="small">Дата: '+esc(date)+' · Фотографий: '+items.reduce((n,x)=>n+x.photos.length,0)+'</p>'+items.map(x=>'<div class="row"><strong>'+esc(x.title)+'</strong><span>'+x.photos.length+' фото</span></div>').join('')+'<p>'+esc(previewDraft.sender_comment||'Комментарий не добавлен')+'</p>';
    $('#drPreviewBox').scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  async function submitReport(){
    if(!canSubmit){notice('Для отправки отчёта нужна роль дневной или ночной смены.',true);return;}\n    if(!canSubmit){notice('Для отправки отчёта нужна роль дневной или ночной смены.',true);return;}
    if(!isEnabled&&!isAdmin&&!isReviewer){notice('Модуль отключён.',true);return;}
    if((userRole==='shift_day'&&$('#drShift').value!=='day')||(userRole==='shift_night'&&$('#drShift').value!=='night')){notice('У тебя нет доступа к этому типу смены.',true);return;}\n    if(userRole==='shift_day'&&$('#drShift').value!=='day'||userRole==='shift_night'&&$('#drShift').value!=='night'){notice('У тебя нет доступа к этому типу смены.',true);return;}\n    if(userRole==='shift_day'&&$('#drShift').value!=='day'||userRole==='shift_night'&&$('#drShift').value!=='night'){notice('У тебя нет доступа к этому типу смены.',true);return;}
    if(!cloudClient||!cloudUser){notice('Сначала войди в аккаунт.',true);return;}
    const button=$('#drSubmit');button.disabled=true;notice('Загружаю фотографии…');
    try{
      const shift=$('#drShift').value, date=$('#drDate').value||new Date().toISOString().slice(0,10), items=[];
      const categories=activeCats();
      for(const c of categories){
        const files=draftFiles[c.id]||[];
        if(!files.length)throw new Error('Добавь фотографию: '+c.title);
        const photos=[];
        for(let i=0;i<files.length;i++){
          const f=files[i];if(!f.type.startsWith('image/'))continue;
          const ext=(f.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
          const path='reports/'+cloudUser.id+'/'+crypto.randomUUID()+'-'+i+'.'+ext;
          const {error}=await cloudClient.storage.from('daily-report-photos').upload(path,f,{contentType:f.type,upsert:false});
          if(error)throw error;photos.push({path,name:f.name,type:f.type,size:f.size});
        }
        items.push({category_id:c.id,title:c.title,photos});
      }
      const {error}=await cloudClient.from('daily_reports').insert({submitted_by:cloudUser.id,author_name:(cloudUser.user_metadata?.username||cloudUser.user_metadata?.name||cloudUser.email||'Сотрудник'),shift_type:shift,report_date:date,status:'pending',items,sender_comment:$('#drSenderComment').value.trim()});
      if(error)throw error;
      notice('Отчёт отправлен на проверку.');draftFiles={};$('#drSenderComment').value='';$('#drPreviewBox').classList.add('dr-hidden');await load();showView('history');
    }catch(e){notice(e.message||'Не удалось отправить отчёт.',true);}finally{button.disabled=false;}
  }
  async function signedPhoto(path){try{const {data,error}=await cloudClient.storage.from('daily-report-photos').createSignedUrl(path,900);return error?'':data?.signedUrl||'';}catch{return '';}}
  async function renderHistory(){
    const list=$('#drHistoryList');if(!list)return;
    if(!reports.length){list.innerHTML='<div class="dr-card">История отчётов пока пуста.</div>';return;}
    list.innerHTML=reports.map(r=>{
      const status={pending:'На проверке',approved:'Одобрен',rejected:'Отклонён'}[r.status]||r.status;
      const date=new Date(r.submitted_at).toLocaleString('ru-RU');
      return '<article class="dr-card"><div class="dr-item-head"><div><strong>'+(r.shift_type==='day'?'Дневная':'Ночная')+' смена</strong><div class="small">'+esc(date)+' · '+esc(r.report_date)+'</div></div><span class="dr-status '+esc(r.status)+'">'+status+'</span></div><p class="small">Автор: '+esc(r.author_name||(r.submitted_by===cloudUser.id?(cloudUser.user_metadata?.username||cloudUser.email||'Вы'):'Сотрудник'))+'</p><p>'+esc(r.sender_comment||'Без комментария')+'</p>'+(r.reviewer_comment?'<div class="dr-card"><strong>Замечание проверяющего</strong><p>'+esc(r.reviewer_comment)+'</p></div>':'')+'<div class="dr-actions"><button class="dr-btn" data-dr-open="'+esc(r.id)+'">Открыть историю</button>'+(isReviewer&&r.status==='pending'?'<button class="dr-btn primary" data-dr-approve="'+esc(r.id)+'">Одобрить</button><button class="dr-btn" data-dr-reject="'+esc(r.id)+'">Отклонить с замечанием</button>':'')+'</div><div class="dr-detail dr-hidden" id="drDetail-'+esc(r.id)+'">'+(r.items||[]).map(it=>'<div class="dr-card"><strong>'+esc(it.title)+'</strong><div class="dr-photo-grid">'+(it.photos||[]).map(p=>'<span data-dr-photo="'+esc(p.path)+'"></span>').join('')+'</div></div>').join('')+'</div></article>';
    }).join('');
    for(const el of list.querySelectorAll('[data-dr-photo]')){const url=await signedPhoto(el.dataset.drPhoto);if(url){const img=document.createElement('img');img.src=url;img.alt='Фото отчёта';el.appendChild(img);}}
  }
  async function historyAction(e){
    const openBtn=e.target.closest('[data-dr-open]');if(openBtn){const id=openBtn.dataset.drOpen;$('#drDetail-'+CSS.escape(id))?.classList.toggle('dr-hidden');return;}
    const approve=e.target.closest('[data-dr-approve]');const reject=e.target.closest('[data-dr-reject]');if(!approve&&!reject)return;
    const id=(approve||reject).dataset[approve?'drApprove':'drReject'];let comment='';
    if(reject){comment=prompt('Напиши замечание для сотрудника:')||'';if(!comment.trim()){notice('Для отклонения укажи замечание.',true);return;}}
    try{const {error}=await cloudClient.rpc('daily_report_review',{report_id:id,decision:approve?'approved':'rejected',note:comment});if(error)throw error;notice(approve?'Отчёт одобрен.':'Отчёт отклонён с замечанием.');await load();showView('history');}catch(err){notice(err.message||'Не удалось сохранить решение.',true);}
  }
  function renderCategories(){
    const box=$('#drCategoryList');if(!box)return;
    box.innerHTML=cats.map(c=>'<div class="dr-card" data-dr-category="'+esc(c.id)+'"><div class="dr-grid"><label>Смена<select data-cat-shift><option value="day" '+(c.shift_type==='day'?'selected':'')+'>Дневная</option><option value="night" '+(c.shift_type==='night'?'selected':'')+'>Ночная</option></select></label><label>Название<input data-cat-title value="'+esc(c.title)+'" maxlength="180"></label><label>Порядок<input data-cat-position type="number" value="'+c.position+'"></label><label>Активна<input data-cat-enabled type="checkbox" '+(c.enabled?'checked':'')+'></label></div><div class="dr-actions"><button class="dr-btn primary" data-cat-save="'+esc(c.id)+'">Сохранить категорию</button></div></div>').join('');
  }
  async function categoryAction(e){
    const b=e.target.closest('[data-cat-save]');if(!b)return;const card=b.closest('[data-dr-category]');
    try{const {error}=await cloudClient.rpc('daily_report_admin_save_category',{category_id:b.dataset.catSave,new_shift_type:$('[data-cat-shift]',card).value,new_title:$('[data-cat-title]',card).value,new_position:Number($('[data-cat-position]',card).value)||0,is_enabled:$('[data-cat-enabled]',card).checked});if(error)throw error;notice('Категория сохранена.');await load();showView('settings');}catch(err){notice(err.message||'Не удалось сохранить категорию.',true);}
  }
  async function addCategory(){
    try{const title=$('#drCatTitle').value.trim();if(!title)throw new Error('Введи название категории.');const {error}=await cloudClient.rpc('daily_report_admin_save_category',{category_id:null,new_shift_type:$('#drCatShift').value,new_title:title,new_position:activeCats().length+1,is_enabled:true});if(error)throw error;$('#drCatTitle').value='';await load();showView('settings');notice('Категория добавлена.');}catch(e){notice(e.message||'Не удалось добавить категорию.',true);}
  }
  async function saveEnabled(){try{const {error}=await cloudClient.rpc('daily_report_admin_set_enabled',{is_enabled:$('#drEnabled').checked});if(error)throw error;notice('Настройка модуля сохранена.');await load();showView('settings');}catch(e){notice(e.message||'Не удалось сохранить настройку.',true);}}
  function showExcelPreview(){
    const rows=reports.map(r=>({fio:r.submitted_by===cloudUser.id?(cloudUser.user_metadata?.username||cloudUser.email||'Вы'):'Сотрудник',drive:'',comment:r.reviewer_comment||'',status:r.status,shift:r.shift_type==='day'?'Дневная':'Ночная',date:r.report_date,id:r.id}));
    const box=$('#drExcelPreview');box.classList.remove('dr-hidden');
    box.innerHTML='<h3>Предварительный просмотр Excel</h3><p class="small">Зелёный — замечаний нет; оранжевый — есть замечание. Ссылка на Яндекс Диск пока оставлена пустой.</p><div class="dr-table-wrap"><table class="dr-table"><thead><tr><th>Ф.И</th><th>Ссылка на Яндекс Диск</th><th>Замечания</th><th>Смена / дата</th><th>Статус</th><th>История</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r.fio)+'</td><td></td><td class="'+(r.comment?'warn':'good')+'">'+esc(r.comment||'Нет замечаний')+'</td><td>'+esc(r.shift)+' · '+esc(r.date)+'</td><td>'+esc(({pending:'На проверке',approved:'Одобрен',rejected:'Отклонён'})[r.status]||r.status)+'</td><td><button class="dr-btn" data-dr-excel-open="'+esc(r.id)+'">Открыть</button></td></tr>').join('')+'</tbody></table></div><div class="dr-actions"><button class="dr-btn primary" id="drDownloadCsv">Скачать таблицу для Excel (.csv)</button></div>';
    $('#drDownloadCsv').addEventListener('click',()=>{const csv=[['Ф.И','Ссылка на Яндекс Диск','Замечания','Смена','Дата','Статус','ID отчёта'],...rows.map(r=>[r.fio,r.drive,r.comment,r.shift,r.date,r.status,r.id])].map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(';')).join('\r\n');const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='Provoda-Staff-daily-reports.csv';a.click();URL.revokeObjectURL(url);});
    box.querySelectorAll('[data-dr-excel-open]').forEach(b=>b.addEventListener('click',()=>{showView('history');$('#drDetail-'+CSS.escape(b.dataset.drExcelOpen))?.classList.remove('dr-hidden');}));
  }
  document.addEventListener('click',e=>{if(e.target.closest('#openDailyReportsBtn'))open();});
  document.addEventListener('DOMContentLoaded',ensureUI);
  if(document.readyState!=='loading')ensureUI();
})();