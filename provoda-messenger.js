/* Provoda Staff — secure direct messenger */
(() => {
  'use strict';
  const $=(s,r=document)=>r.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let enabled=false,users=[],conversations=[],activeUser=null,activeConversation=null,channel=null,poll=null,loading=false;
  const roleIcon=person=>(person.role_label||'Сотрудник')+(person.shift_role?' · '+person.shift_role:'');
  function styles(){
    if($('#provodaMessengerStyles'))return;
    const s=document.createElement('style');s.id='provodaMessengerStyles';
    s.textContent=`
      .pm-header-button{position:relative;flex:0 0 42px;display:grid;place-items:center;color:var(--text,#eef4ff)}
      .pm-header-button svg{width:20px;height:20px;transition:transform .2s ease}
      .pm-header-button:hover svg{transform:scale(1.08)}
      #provodaMessengerModal{position:fixed;inset:0;z-index:1300;display:none;background:rgba(2,6,15,.84);backdrop-filter:blur(14px);padding:14px}
      #provodaMessengerModal.open{display:flex;align-items:center;justify-content:center}
      .pm-shell{width:min(920px,100%);height:min(780px,calc(100dvh - 28px));display:grid;grid-template-columns:320px minmax(0,1fr);overflow:hidden;border:1px solid rgba(148,163,184,.22);border-radius:25px;background:#111925;box-shadow:0 28px 90px rgba(0,0,0,.5);color:#eef4ff}
      .pm-sidebar{display:flex;flex-direction:column;min-width:0;border-right:1px solid #ffffff16;background:#141e2b}
      .pm-sidebar-head,.pm-chat-head{display:flex;align-items:center;gap:10px;padding:16px;border-bottom:1px solid #ffffff16;min-height:72px}
      .pm-sidebar-head{justify-content:space-between}.pm-sidebar-head h2{font-size:18px;margin:0}.pm-close,.pm-back{width:36px;height:36px;border:1px solid #ffffff20;border-radius:12px;background:#ffffff0a;color:#fff;font-size:19px}
      .pm-search{margin:12px 12px 8px;width:calc(100% - 24px);padding:11px 13px;border:1px solid #ffffff20;border-radius:13px;background:#ffffff0a;color:#fff;outline:0}
      .pm-people{flex:1;overflow:auto;padding:4px 8px 12px}
      .pm-person{display:flex;align-items:center;gap:11px;width:100%;padding:11px 9px;text-align:left;border:0;border-radius:13px;background:transparent;color:#eef4ff}
      .pm-person:hover,.pm-person.active{background:#ffffff0d}
      .pm-avatar{width:43px;height:43px;flex:0 0 43px;display:grid;place-items:center;overflow:hidden;border-radius:50%;background:linear-gradient(135deg,#7c5cff55,#22d3ee33);border:1px solid #ffffff20;font-weight:800}
      .pm-avatar img{width:100%;height:100%;object-fit:cover}
      .pm-person-copy{display:flex;flex:1;min-width:0;flex-direction:column;gap:4px}.pm-person-copy strong{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pm-person-copy small{font-size:11px;color:#aab6c8}.pm-person-copy em{font-size:11px;color:#8d9ab0;font-style:normal;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .pm-chat{display:flex;flex-direction:column;min-width:0;min-height:0;background:radial-gradient(500px 280px at 100% 0%,#7c5cff16,transparent 70%),#0e151f}
      .pm-chat-head{flex-shrink:0}.pm-chat-head .pm-avatar{width:40px;height:40px;flex-basis:40px}.pm-chat-title{display:flex;flex-direction:column;gap:3px;min-width:0}.pm-chat-title strong{font-size:14px}.pm-chat-title small{font-size:11px;color:#aab6c8}
      .pm-messages{display:flex;flex:1;flex-direction:column;gap:10px;overflow:auto;padding:18px 16px}
      .pm-empty{margin:auto;max-width:280px;text-align:center;color:#94a3b8;font-size:13px;line-height:1.5}
      .pm-bubble{max-width:min(78%,520px);padding:10px 12px;border:1px solid #ffffff12;border-radius:16px;background:#ffffff0c;overflow-wrap:anywhere;align-self:flex-start}
      .pm-bubble.mine{align-self:flex-end;background:linear-gradient(135deg,#6250c9,#3f54a9);border-color:#ffffff18}
      .pm-bubble p{margin:0;font-size:13px;white-space:pre-wrap;line-height:1.45}.pm-bubble time{display:block;margin-top:5px;text-align:right;font-size:9px;color:#c3cce0}
      .pm-image{display:block;max-width:min(100%,360px);max-height:340px;margin:0 0 6px;border-radius:10px;object-fit:contain;background:#080d14}
      .pm-compose{display:flex;align-items:flex-end;gap:8px;padding:12px;border-top:1px solid #ffffff16;background:#111a26}
      .pm-compose textarea{flex:1;min-width:0;max-height:120px;min-height:44px;resize:vertical;padding:11px 13px;border:1px solid #ffffff20;border-radius:14px;background:#ffffff0a;color:#fff;font:inherit;font-size:13px}
      .pm-attach,.pm-send{width:44px;height:44px;flex:0 0 44px;border:1px solid #ffffff20;border-radius:14px;background:#ffffff0a;color:#fff;font-size:18px}.pm-send{background:linear-gradient(135deg,#7c5cff,#4f46e5);font-size:16px;font-weight:800}
      .pm-status{min-height:18px;padding:0 14px 7px;color:#aab6c8;font-size:11px}
      body.light-theme #provodaMessengerModal{background:rgba(25,35,55,.45)}body.light-theme .pm-shell{background:#fff;color:#172033}body.light-theme .pm-sidebar{background:#f7f9fd;border-color:#17203318}body.light-theme .pm-person{color:#172033}body.light-theme .pm-person:hover,body.light-theme .pm-person.active{background:#1720330a}body.light-theme .pm-person-copy small,body.light-theme .pm-person-copy em,body.light-theme .pm-chat-title small{color:#667085}body.light-theme .pm-chat{background:#f2f5fb}body.light-theme .pm-bubble{background:#fff;color:#172033;border-color:#17203315}body.light-theme .pm-bubble.mine{background:#6250c9;color:#fff}body.light-theme .pm-compose{background:#fff;border-color:#17203315}body.light-theme .pm-compose textarea{background:#f8f9fc;color:#172033;border-color:#17203320}body.light-theme .pm-close,body.light-theme .pm-back,body.light-theme .pm-attach{color:#172033;border-color:#17203320;background:#17203308}
      @media(max-width:650px){#provodaMessengerModal{padding:0}.pm-shell{width:100%;height:100dvh;max-height:100dvh;border:0;border-radius:0;grid-template-columns:1fr}.pm-sidebar{grid-column:1;grid-row:1;border-right:0}.pm-chat{display:none;grid-column:1;grid-row:1}.pm-shell.chat-open .pm-sidebar{display:none}.pm-shell.chat-open .pm-chat{display:flex}.pm-sidebar-head,.pm-chat-head{min-height:64px}.pm-messages{padding:14px 12px}.pm-bubble{max-width:88%}}
    `;
    document.head.appendChild(s);
  }
  function ensureModal(){
    if($('#provodaMessengerModal'))return;
    const modal=document.createElement('div');modal.id='provodaMessengerModal';modal.setAttribute('aria-hidden','true');
    modal.innerHTML='<section class="pm-shell" role="dialog" aria-modal="true" aria-label="Внутренний мессенджер"><aside class="pm-sidebar"><header class="pm-sidebar-head"><h2>Мессенджер</h2><button type="button" class="pm-close" data-pm-close aria-label="Закрыть">×</button></header><input class="pm-search" id="pmSearch" type="search" placeholder="Найти сотрудника…"><div class="pm-people" id="pmPeople"><div class="pm-empty">Загружаю пользователей…</div></div></aside><section class="pm-chat"><header class="pm-chat-head"><button type="button" class="pm-back" data-pm-back aria-label="К списку чатов">‹</button><span class="pm-avatar" id="pmChatAvatar">?</span><span class="pm-chat-title"><strong id="pmChatName">Выбери сотрудника</strong><small id="pmChatRole">Личный чат</small></span></header><div class="pm-messages" id="pmMessages"><div class="pm-empty">Выбери сотрудника слева, чтобы начать переписку.</div></div><div class="pm-status" id="pmStatus" role="status" aria-live="polite"></div><form class="pm-compose" id="pmCompose"><input type="file" id="pmFile" accept="image/jpeg,image/png,image/webp,image/heic" hidden><button class="pm-attach" type="button" id="pmAttach" title="Отправить фото" aria-label="Отправить фото">＋</button><textarea id="pmText" rows="1" maxlength="8000" placeholder="Написать сообщение…" disabled></textarea><button class="pm-send" type="submit" id="pmSend" disabled aria-label="Отправить">➤</button></form></section></section>';
    modal.addEventListener('click',e=>{if(e.target===modal||e.target.closest('[data-pm-close]'))close();});
    modal.addEventListener('click',e=>{if(e.target.closest('[data-pm-back]'))$('#provodaMessengerModal .pm-shell').classList.remove('chat-open');});
    document.body.appendChild(modal);
    $('#pmCompose').addEventListener('submit',sendMessage);
    $('#pmAttach').addEventListener('click',()=>$('#pmFile').click());
    $('#pmFile').addEventListener('change',sendImage);
    $('#pmSearch').addEventListener('input',renderPeople);
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal.classList.contains('open'))close();});
  }
  function avatar(person){const content=person.avatar_data?'<img src="'+esc(person.avatar_data)+'" alt="">':esc((person.name||'?').trim().slice(0,1).toUpperCase()||'?');return '<span class="pm-avatar">'+content+'</span>';}
  function setStatus(message,error=false){const el=$('#pmStatus');if(el){el.textContent=message||'';el.style.color=error?'#fda4af':'';}}
  function installHeaderButton(){
    // Убираем старую плитку из главного экрана, если она осталась в DOM после обновления.
    $('#provodaMessengerTile')?.remove();
    const bell=$('#notificationBellBtn');
    if(!bell)return;
    let button=$('#provodaMessengerHeaderBtn');
    if(!button){
      button=document.createElement('button');
      button.type='button';
      button.id='provodaMessengerHeaderBtn';
      button.className='icon pm-header-button';
      button.setAttribute('aria-label','Открыть мессенджер');
      button.title='Мессенджер';
      button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/></svg>';
      button.addEventListener('click',open);
      bell.insertAdjacentElement('afterend',button);
    }
    button.classList.toggle('hidden',!enabled);
  }
  async function refreshAccess(){
    // Мессенджер — постоянная функция приложения: отдельный переключатель доступа не используется.
    enabled=typeof cloudClient!=='undefined'&&!!cloudClient&&typeof cloudUser!=='undefined'&&!!cloudUser;
    installHeaderButton();
  }
  async function open(){
    if(!cloudClient||!cloudUser){if(typeof toast==='function')toast('Войди в аккаунт, чтобы открыть мессенджер.');return;}
    ensureModal();$('#provodaMessengerModal').classList.add('open');$('#provodaMessengerModal').setAttribute('aria-hidden','false');
    $('#provodaMessengerModal .pm-shell').classList.remove('chat-open');$('#pmPeople').innerHTML='<div class="pm-empty">Загружаю пользователей…</div>';
    await Promise.all([loadUsers(),loadConversations()]);
  }
  function close(){
    const modal=$('#provodaMessengerModal');if(!modal)return;
    modal.classList.remove('open');modal.setAttribute('aria-hidden','true');
    if(channel){cloudClient.removeChannel(channel);channel=null;}if(poll){clearInterval(poll);poll=null;}
    activeUser=null;activeConversation=null;
  }
  async function loadUsers(){
    try{const {data,error}=await cloudClient.rpc('messenger_list_users');if(error)throw error;users=Array.isArray(data)?data:[];renderPeople();}
    catch(e){$('#pmPeople').innerHTML='<div class="pm-empty">Не удалось загрузить пользователей.<br>'+esc(e.message||'')+'</div>';}
  }
  async function loadConversations(){
    try{const {data,error}=await cloudClient.rpc('messenger_list_conversations');if(error)throw error;conversations=Array.isArray(data)?data:[];renderPeople();}
    catch(e){console.info('Messenger conversations:',e?.message||e);}
  }
  function renderPeople(){
    const box=$('#pmPeople');if(!box)return;
    const query=($('#pmSearch')?.value||'').trim().toLowerCase();
    const sorted=[...users].sort((a,b)=>{
      const ai=conversations.findIndex(c=>c.user_id===a.user_id),bi=conversations.findIndex(c=>c.user_id===b.user_id);
      return (ai<0?999:ai)-(bi<0?999:bi)||String(a.name).localeCompare(String(b.name),'ru');
    }).filter(u=>(u.name+' '+u.role_label).toLowerCase().includes(query));
    box.innerHTML=sorted.length?sorted.map(u=>{
      const conv=conversations.find(c=>c.user_id===u.user_id);
      return '<button type="button" class="pm-person '+(activeUser?.user_id===u.user_id?'active':'')+'" data-pm-user="'+esc(u.user_id)+'">'+avatar(u)+'<span class="pm-person-copy"><strong>'+esc(u.name||'Сотрудник')+'</strong><small>'+esc(roleIcon(u))+'</small><em>'+esc(conv?.last_message||'Открыть личный чат')+'</em></span></button>';
    }).join(''):'<div class="pm-empty">Пользователи не найдены.</div>';
    box.querySelectorAll('[data-pm-user]').forEach(b=>b.addEventListener('click',()=>openUser(b.dataset.pmUser)));
  }
  async function openUser(userId){
    const person=users.find(u=>u.user_id===userId);if(!person)return;
    activeUser=person;setStatus('Открываю чат…');
    try{
      const {data,error}=await cloudClient.rpc('messenger_open_conversation',{p_target_user_id:userId});if(error)throw error;
      activeConversation=data;$('#pmChatAvatar').innerHTML=person.avatar_data?'<img src="'+esc(person.avatar_data)+'" alt="">':esc((person.name||'?').slice(0,1).toUpperCase());
      $('#pmChatName').textContent=person.name||'Сотрудник';$('#pmChatRole').textContent=roleIcon(person);
      $('#pmText').disabled=false;$('#pmSend').disabled=false;
      $('#provodaMessengerModal .pm-shell').classList.add('chat-open');
      await loadMessages();
      if(channel){cloudClient.removeChannel(channel);channel=null;}
      channel=cloudClient.channel('provoda-messenger-'+activeConversation).on('postgres_changes',{event:'INSERT',schema:'public',table:'messenger_messages',filter:'conversation_id=eq.'+activeConversation},()=>{loadMessages();loadConversations().then(renderPeople);}).subscribe();
      if(poll)clearInterval(poll);poll=setInterval(()=>{if(activeConversation&&document.visibilityState==='visible')loadMessages();},12000);
      setStatus('');
    }catch(e){setStatus(e.message||'Не удалось открыть чат.',true);}
    renderPeople();
  }
  async function loadMessages(){
    if(!activeConversation||loading)return;loading=true;
    try{
      const {data,error}=await cloudClient.rpc('messenger_list_messages',{p_conversation_id:activeConversation,p_limit:150});if(error)throw error;
      const messages=Array.isArray(data)?data:[];
      const box=$('#pmMessages');box.innerHTML=messages.length?'':'<div class="pm-empty">Это начало переписки. Напиши первое сообщение.</div>';
      for(const m of messages){
        const mine=m.sender_id===cloudUser.id;
        let imageHtml='';
        if(m.attachment_path){
          try{const {data:signed,error:signError}=await cloudClient.storage.from('provoda-messenger').createSignedUrl(m.attachment_path,3600);if(!signError&&signed?.signedUrl)imageHtml='<a href="'+esc(signed.signedUrl)+'" target="_blank" rel="noopener"><img class="pm-image" src="'+esc(signed.signedUrl)+'" alt="Фото из сообщения" loading="lazy"></a>';}
          catch(e){console.info('Messenger image unavailable',e?.message||e);}
        }
        const date=m.created_at?new Date(m.created_at).toLocaleString('ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'';
        const article=document.createElement('article');article.className='pm-bubble'+(mine?' mine':'');
        article.innerHTML=imageHtml+(m.body?'<p>'+esc(m.body)+'</p>':'')+'<time>'+esc(date)+'</time>';box.appendChild(article);
      }
      box.scrollTop=box.scrollHeight;
    }catch(e){setStatus(e.message||'Не удалось загрузить сообщения.',true);}
    finally{loading=false;}
  }
  async function sendMessage(event){
    event.preventDefault();if(!activeConversation)return;
    const input=$('#pmText'),body=input.value.trim();if(!body)return;
    $('#pmSend').disabled=true;
    try{const {error}=await cloudClient.rpc('messenger_send_message',{p_conversation_id:activeConversation,p_body:body,p_attachment_path:null,p_attachment_mime:null});if(error)throw error;input.value='';await loadMessages();await loadConversations();renderPeople();setStatus('');}
    catch(e){setStatus(e.message||'Не удалось отправить сообщение.',true);}
    finally{$('#pmSend').disabled=false;input.focus();}
  }
  async function sendImage(){
    const file=$('#pmFile').files?.[0];if(!file)return;
    if(!file.type.startsWith('image/')){setStatus('Можно отправлять только изображения.',true);return;}
    if(file.size>12*1024*1024){setStatus('Фото больше 12 МБ. Выбери файл поменьше.',true);return;}
    if(!activeConversation||!activeUser){setStatus('Сначала открой чат.',true);return;}
    const ext=({ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/heic':'heic'})[file.type]||'jpg';
    const path=activeConversation+'/'+cloudUser.id+'/'+(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2))+'.'+ext;
    $('#pmAttach').disabled=true;setStatus('Отправляю фото…');
    try{
      const {error:uploadError}=await cloudClient.storage.from('provoda-messenger').upload(path,file,{contentType:file.type,upsert:false});if(uploadError)throw uploadError;
      const {error}=await cloudClient.rpc('messenger_send_message',{p_conversation_id:activeConversation,p_body:$('#pmText').value.trim(),p_attachment_path:path,p_attachment_mime:file.type});if(error){await cloudClient.storage.from('provoda-messenger').remove([path]);throw error;}
      $('#pmText').value='';await loadMessages();await loadConversations();renderPeople();setStatus('');
    }catch(e){setStatus(e.message||'Не удалось отправить фото.',true);}
    finally{$('#pmAttach').disabled=false;$('#pmFile').value='';}
  }
  function init(){
    styles();ensureModal();
    window.addEventListener('provoda-user-ready',refreshAccess);
    window.addEventListener('provoda-user-deactivated',()=>{enabled=false;installHeaderButton();close();});
    refreshAccess();
    window.setInterval(()=>{if(typeof cloudUser!=='undefined'&&cloudUser)refreshAccess();},12000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();