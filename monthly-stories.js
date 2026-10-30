/* Provoda Staff — monthly employee stories inside Admin > Development */
(() => {
  'use strict';
  const $ = (selector, root=document) => root.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const money = value => new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(Number(value)||0)+' ₽';
  const monthNow = () => { const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); };
  let stories=[], activeMonth=monthNow(), loading=false;

  function installStyles(){
    if($('#monthlyStoriesStyles'))return;
    const style=document.createElement('style');style.id='monthlyStoriesStyles';
    style.textContent=\`
      .monthly-story-nav{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px}
      .monthly-story-nav button{padding:9px 13px;border:1px solid var(--line);border-radius:12px;background:rgba(255,255,255,.025);color:var(--muted);font-size:12px;font-weight:750}
      .monthly-story-nav button.active{background:rgba(124,92,255,.13);border-color:rgba(124,92,255,.42);color:var(--text)}
      .monthly-stories-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px}
      .monthly-stories-toolbar h3{margin:0 0 4px;font-size:17px}.monthly-stories-toolbar p{margin:0;color:var(--muted);font-size:12px}
      .monthly-stories-toolbar input{width:auto;min-width:150px;max-width:190px;padding:9px 11px;border:1px solid var(--line);border-radius:11px;background:var(--card2);color:var(--text);font:inherit}
      .monthly-story-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:14px}
      .monthly-story-button{display:flex;flex-direction:column;align-items:center;gap:8px;min-width:0;padding:10px 6px;border:0;background:transparent;color:var(--text);cursor:pointer}
      .monthly-story-ring{width:82px;height:82px;padding:3px;border-radius:50%;background:linear-gradient(135deg,#7c5cff,#22d3ee 52%,#f43f8e);box-shadow:0 7px 22px rgba(34,211,238,.12);transition:transform .18s,filter .18s}
      .monthly-story-button:hover .monthly-story-ring{transform:translateY(-2px) scale(1.035);filter:brightness(1.12)}
      .monthly-story-avatar{width:100%;height:100%;display:grid;place-items:center;overflow:hidden;border:3px solid var(--card);border-radius:50%;background:linear-gradient(145deg,rgba(124,92,255,.28),rgba(34,211,238,.18));font-size:25px;font-weight:850}
      .monthly-story-avatar img{width:100%;height:100%;object-fit:cover}
      .monthly-story-name{max-width:100%;font-size:12px;font-weight:750;text-align:center;overflow-wrap:anywhere;line-height:1.3}
      .monthly-story-views{font-size:10px;color:var(--muted);text-align:center}
      .monthly-story-empty{grid-column:1/-1;padding:28px 12px;text-align:center;color:var(--muted);font-size:13px;border:1px dashed var(--line);border-radius:16px}
      #monthlyStoryModal{position:fixed;inset:0;z-index:1200;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(2,6,15,.84);backdrop-filter:blur(14px)}
      #monthlyStoryModal.open{display:flex}
      .monthly-story-modal-card{position:relative;width:min(520px,100%);max-height:min(90vh,850px);overflow:auto;border:1px solid rgba(148,163,184,.22);border-radius:28px;padding:22px;background:radial-gradient(500px 220px at 100% 0%,rgba(124,92,255,.22),transparent 70%),linear-gradient(160deg,#182334,#0e141e);box-shadow:0 30px 100px rgba(0,0,0,.55);color:#eef4ff}
      .monthly-story-modal-top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:20px}
      .monthly-story-modal-top small{font-size:10px;letter-spacing:.16em;color:#a5b4fc;font-weight:850}
      .monthly-story-close{width:38px;height:38px;border:1px solid #ffffff22;border-radius:12px;background:#ffffff0c;color:#fff;font-size:22px}
      .monthly-story-identity{display:flex;align-items:center;gap:13px;margin-bottom:18px}
      .monthly-story-identity .monthly-story-ring{width:68px;height:68px;flex:0 0 68px}
      .monthly-story-identity h3{margin:0 0 4px;font-size:21px;letter-spacing:-.035em}
      .monthly-story-identity p{margin:0;color:#aab6c8;font-size:12px;overflow-wrap:anywhere}
      .monthly-story-hero{padding:18px;border:1px solid #ffffff18;border-radius:20px;background:linear-gradient(135deg,#7c5cff30,#22d3ee16);margin-bottom:12px}
      .monthly-story-hero span{display:block;color:#b8c4d8;font-size:11px}.monthly-story-hero strong{display:block;margin:5px 0;font-size:34px;letter-spacing:-.045em}
      .monthly-story-metrics{display:grid;grid-template-columns:1fr 1fr;gap:9px}
      .monthly-story-metric{padding:13px;border:1px solid #ffffff16;border-radius:16px;background:#ffffff08;min-width:0}
      .monthly-story-metric span{display:block;color:#aab6c8;font-size:10px;line-height:1.35}
      .monthly-story-metric strong{display:block;margin-top:6px;font-size:20px;letter-spacing:-.03em;overflow-wrap:anywhere}
      .monthly-story-metric small{display:block;margin-top:4px;color:#aab6c8;font-size:10px}
      .monthly-story-progress{height:7px;overflow:hidden;margin-top:9px;border-radius:99px;background:#ffffff19}
      .monthly-story-progress i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#7c5cff,#22d3ee)}
      .monthly-story-viewers{margin-top:16px;padding-top:14px;border-top:1px solid #ffffff18}
      .monthly-story-viewers h4{margin:0 0 9px;font-size:12px}
      .monthly-story-viewer{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid #ffffff10;font-size:11px}
      .monthly-story-viewer span:last-child{color:#aab6c8;text-align:right}
      .monthly-story-note{margin-top:10px;color:#8e9bb0;font-size:10px;line-height:1.45}
      @media(max-width:420px){.monthly-story-list{grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.monthly-story-ring{width:72px;height:72px}.monthly-story-modal-card{padding:17px;border-radius:23px}.monthly-story-metric{padding:11px}.monthly-story-metric strong{font-size:18px}}
      body.light-theme .monthly-story-nav button{background:rgba(28,41,64,.035)}
    \`;
    document.head.appendChild(style);
  }

  function installUI(){
    const root=$('#adminDevelopmentView');
    if(!root||$('#adminMonthlyStoriesView'))return;
    const devLayout=$('.admin-dev-layout',root);
    if(!devLayout)return;
    const nav=document.createElement('nav');
    nav.className='monthly-story-nav';nav.setAttribute('aria-label','Разделы разработки');
    nav.innerHTML='<button type="button" class="active" data-monthly-subtab="tasks">Задачи и блокнот</button><button type="button" data-monthly-subtab="stories">Итоги месяца</button>';
    devLayout.insertAdjacentElement('beforebegin',nav);
    const view=document.createElement('section');view.id='adminMonthlyStoriesView';view.className='hidden';
    view.innerHTML='<div class="admin-card"><div class="monthly-stories-toolbar"><div><h3>Итоги месяца</h3><p>Открой круглую историю сотрудника, чтобы посмотреть статистику и список просмотров</p></div><input id="monthlyStoriesMonth" type="month" aria-label="Месяц итогов"></div><p id="monthlyStoriesStatus" class="admin-status" role="status" aria-live="polite">Загружаю статистику…</p><div id="monthlyStoriesList" class="monthly-story-list"><div class="monthly-story-empty">Подготавливаю истории сотрудников…</div></div></div>';
    devLayout.insertAdjacentElement('afterend',view);
    const month=$('#monthlyStoriesMonth');if(month)month.value=activeMonth;
    nav.addEventListener('click',event=>{
      const button=event.target.closest('[data-monthly-subtab]');if(!button)return;
      const tab=button.dataset.monthlySubtab;
      nav.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===button));
      devLayout.classList.toggle('hidden',tab!=='tasks');view.classList.toggle('hidden',tab!=='stories');
      if(tab==='stories')loadStories();
    });
    $('#monthlyStoriesMonth')?.addEventListener('change',event=>{activeMonth=event.target.value||monthNow();loadStories();});
    $('#monthlyStoriesList')?.addEventListener('click',event=>{const button=event.target.closest('[data-monthly-story]');if(button)openStory(button.dataset.monthlyStory);});
    if(!$('#monthlyStoryModal')){
      const modal=document.createElement('div');modal.id='monthlyStoryModal';modal.setAttribute('aria-hidden','true');
      modal.addEventListener('click',event=>{if(event.target===modal)closeStory();});document.body.appendChild(modal);
      document.addEventListener('keydown',event=>{if(event.key==='Escape')closeStory();});
    }
  }
  function setStatus(message,error=false){const el=$('#monthlyStoriesStatus');if(el){el.textContent=message;el.style.color=error?'var(--bad)':'var(--muted)';}}
  function monthLabel(){const [year,month]=activeMonth.split('-').map(Number);return new Date(year,month-1,1).toLocaleDateString('ru-RU',{month:'long',year:'numeric'});}
  function avatarMarkup(story){const name=story.name||'Сотрудник';const content=story.avatar_data?'<img src="'+esc(story.avatar_data)+'" alt="">':esc(name.trim().slice(0,1).toUpperCase()||'С');return '<div class="monthly-story-ring"><div class="monthly-story-avatar">'+content+'</div></div>';}
  function renderStories(){
    const list=$('#monthlyStoriesList');if(!list)return;
    if(!stories.length){list.innerHTML='<div class="monthly-story-empty">Аккаунтов для итогов пока нет.</div>';return;}
    list.innerHTML=stories.map(story=>{
      const viewers=Array.isArray(story.viewers)?story.viewers.length:0;
      return '<button type="button" class="monthly-story-button" data-monthly-story="'+esc(story.user_id)+'" aria-label="Открыть итоги: '+esc(story.name)+'">'+avatarMarkup(story)+'<span class="monthly-story-name">'+esc(story.name||'Сотрудник')+'</span><span class="monthly-story-views">'+(viewers?viewers+' просмотров':'Новые итоги')+'</span></button>';
    }).join('');
  }
  async function loadStories(){
    if(loading)return;
    if(typeof cloudClient==='undefined'||!cloudClient){setStatus('Сначала войди в аккаунт.',true);return;}
    loading=true;setStatus('Загружаю итоги за '+monthLabel()+'…');
    const list=$('#monthlyStoriesList');if(list)list.innerHTML='<div class="monthly-story-empty">Загружаю истории сотрудников…</div>';
    try{
      const {data,error}=await cloudClient.rpc('admin_monthly_stories',{p_month_start:activeMonth+'-01'});
      if(error)throw error;stories=Array.isArray(data?.stories)?data.stories:[];renderStories();
      setStatus('Итоги за '+monthLabel()+' · аккаунтов: '+stories.length+'. Просмотры сохраняются при открытии истории.');
    }catch(error){stories=[];renderStories();setStatus((error?.message||'Не удалось загрузить статистику')+'. Проверь миграцию monthly_employee_stories.',true);}
    finally{loading=false;}
  }
  function renderViewers(viewers){
    if(!viewers.length)return '<div class="monthly-story-note">Пока никто не открывал эти итоги.</div>';
    return viewers.map(viewer=>'<div class="monthly-story-viewer"><strong>'+esc(viewer.name||viewer.email||'Аккаунт')+'</strong><span>'+esc(viewer.viewed_at?new Date(viewer.viewed_at).toLocaleString('ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'Время неизвестно')+'</span></div>').join('');
  }
  function showStory(story){
    const modal=$('#monthlyStoryModal');if(!modal)return;
    const spent=Number(story.spent)||0,budget=Number(story.budget)||0,done=Number(story.tasks_done)||0,total=Number(story.tasks_total)||0;
    const spendPct=budget>0?Math.round(spent/budget*100):0,taskPct=total>0?Math.round(done/total*100):0;
    const viewers=Array.isArray(story.viewers)?story.viewers:[];
    modal.innerHTML='<article class="monthly-story-modal-card" role="dialog" aria-modal="true" aria-label="Итоги месяца '+esc(story.name)+'">'+
      '<header class="monthly-story-modal-top"><div><small>PROVODA STAFF · MONTHLY RECAP</small><div style="font-size:12px;color:#aab6c8;margin-top:4px">'+esc(monthLabel())+'</div></div><button class="monthly-story-close" type="button" aria-label="Закрыть" data-monthly-close>×</button></header>'+
      '<div class="monthly-story-identity">'+avatarMarkup(story)+'<div><h3>'+esc(story.name||'Сотрудник')+'</h3><p>'+esc(story.email||'Аккаунт сотрудника')+'</p></div></div>'+
      '<section class="monthly-story-hero"><span>Потрачено за месяц</span><strong>'+money(spent)+'</strong><span>'+(budget>0?'Использовано '+spendPct+'% месячного бюджета':'Месячный бюджет не задан')+'</span><div class="monthly-story-progress"><i style="width:'+Math.min(100,Math.max(0,spendPct))+'%"></i></div></section>'+
      '<div class="monthly-story-metrics">'+
      '<div class="monthly-story-metric"><span>Выполнено задач</span><strong>'+done+' / '+total+'</strong><small>'+taskPct+'% выполнено</small><div class="monthly-story-progress"><i style="width:'+Math.min(100,Math.max(0,taskPct))+'%"></i></div></div>'+
      '<div class="monthly-story-metric"><span>Остаток бюджета</span><strong>'+(budget>0?money(budget-spent):'—')+'</strong><small>'+(budget>0?(budget-spent>=0?'Осталось':'Превышение бюджета'):'Бюджет не задан')+'</small></div>'+
      '<div class="monthly-story-metric"><span>Сменные отчёты</span><strong>'+Number(story.shift_reports||0)+'</strong><small>Отправлено за месяц</small></div>'+
      '<div class="monthly-story-metric"><span>Дни с покупками</span><strong>'+Number(story.expense_days||0)+'</strong><small>Активность по расходам</small></div></div>'+
      '<section class="monthly-story-viewers"><h4>Кто посмотрел итоги · '+viewers.length+'</h4>'+renderViewers(viewers)+'</section>'+
      '<p class="monthly-story-note">Просмотр фиксируется по аккаунту администратора. Повторное открытие обновляет время последнего просмотра.</p></article>';
    modal.classList.add('open');modal.setAttribute('aria-hidden','false');
    modal.querySelector('[data-monthly-close]')?.addEventListener('click',closeStory);
  }
  function closeStory(){const modal=$('#monthlyStoryModal');if(modal){modal.classList.remove('open');modal.setAttribute('aria-hidden','true');modal.innerHTML='';}}
  async function openStory(userId){
    if(typeof cloudClient==='undefined'||!cloudClient)return;
    try{
      const {error}=await cloudClient.rpc('admin_monthly_story_mark_viewed',{p_target_user_id:userId,p_month_start:activeMonth+'-01'});
      if(error)throw error;await loadStories();
      const story=stories.find(item=>item.user_id===userId);if(story)showStory(story);
    }catch(error){setStatus(error?.message||'Не удалось открыть историю.',true);}
  }
  function init(){
    installStyles();installUI();
    const root=$('#adminDevelopmentView');if(!root)return;
    const observer=new MutationObserver(()=>{if(!$('#adminMonthlyStoriesView'))installUI();});
    observer.observe(root,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
