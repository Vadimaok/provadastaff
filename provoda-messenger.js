/* Provoda Staff — secure direct messenger */
(() => {
  'use strict';
  const $=(s,r=document)=>r.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let enabled=false,users=[],conversations=[],activeUser=null,activeConversation=null,channel=null,poll=null,activeMessages=[],replyTarget=null,longPressTimer=null,pointerStart=null,presenceMap={},presenceTimer=null,presenceHeartbeat=null,messagesLoading=new Set(),messagesRequestSeq=0,lastRenderedConversation=null,syncListTimer=null;
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
      .pm-messages{display:flex;flex:1;flex-direction:column;gap:10px;overflow:auto;padding:18px 16px;touch-action:pan-y;overscroll-behavior:contain}.pm-chat{touch-action:pan-y}
      .pm-empty{margin:auto;max-width:280px;text-align:center;color:#94a3b8;font-size:13px;line-height:1.5}
      .pm-bubble{max-width:min(78%,520px);padding:10px 12px;border:1px solid #ffffff12;border-radius:16px;background:#ffffff0c;overflow-wrap:anywhere;align-self:flex-start}
      .pm-bubble.mine{align-self:flex-end;background:linear-gradient(135deg,#6250c9,#3f54a9);border-color:#ffffff18}
      .pm-bubble p{margin:0;font-size:13px;white-space:pre-wrap;line-height:1.45}.pm-bubble time{display:block;margin-top:5px;text-align:right;font-size:9px;color:#c3cce0}.pm-edited{display:block;margin-top:4px;text-align:right;font-size:9px;color:#b7aaff}
      .pm-image{display:block;max-width:min(100%,360px);max-height:340px;margin:0 0 6px;border-radius:10px;object-fit:contain;background:#080d14}
      .pm-image{cursor:zoom-in;transition:filter .18s ease}.pm-image:hover{filter:brightness(1.06)}
      .pm-image-retry{display:block;max-width:100%;padding:10px 12px;border:1px solid #fb718555;border-radius:12px;background:#fb71851a;color:#fecdd3;text-align:left;font:inherit;font-size:12px;cursor:pointer}
      .pm-gallery-shade,.pm-lightbox{position:fixed;inset:0;z-index:1450;display:flex;align-items:center;justify-content:center;background:rgba(2,6,15,.9);backdrop-filter:blur(18px);padding:16px;animation:pmFadeIn .18s ease both}
      .pm-gallery-card{width:min(480px,100%);max-height:92dvh;overflow:auto;padding:18px;border:1px solid #ffffff22;border-radius:24px;background:#121c2a;color:#eef4ff;box-shadow:0 24px 90px #0009;animation:pmGalleryIn .22s ease both}
      .pm-gallery-title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.pm-gallery-title h3{margin:0;font-size:17px}.pm-gallery-close{width:38px;height:38px;border:1px solid #ffffff22;border-radius:12px;background:#ffffff0a;color:inherit;font-size:21px}
      .pm-gallery-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.pm-gallery-choice{min-height:120px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;border:1px solid #ffffff1f;border-radius:18px;background:#ffffff08;color:inherit;font:inherit;font-size:13px}.pm-gallery-choice:first-child{background:linear-gradient(145deg,#7259f2,#4f46c8);border-color:#a99aff66}.pm-gallery-icon{font-size:30px}.pm-gallery-note{font-size:11px;line-height:1.5;color:#9eabc0;margin:13px 2px 0}
      .pm-lightbox{z-index:1500;padding:12px;flex-direction:column;gap:12px}.pm-lightbox-image-wrap{display:flex;align-items:center;justify-content:center;min-height:0;flex:1;width:100%;overflow:hidden}.pm-lightbox-image{max-width:100%;max-height:calc(100dvh - 125px);object-fit:contain;border-radius:12px;box-shadow:0 12px 60px #0008}.pm-lightbox-toolbar{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:9px;width:100%}.pm-lightbox-toolbar button,.pm-lightbox-toolbar a{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:42px;padding:0 15px;border:1px solid #ffffff25;border-radius:13px;background:#ffffff12;color:#fff;text-decoration:none;font:inherit;font-size:13px}.pm-lightbox-toolbar .pm-lightbox-save{background:linear-gradient(135deg,#7c5cff,#4f46e5);border-color:transparent}.pm-lightbox-close{position:absolute;top:calc(12px + env(safe-area-inset-top));right:12px;width:44px;height:44px;border-radius:50%;border:1px solid #ffffff30;background:#ffffff16;color:#fff;font-size:25px}
      @keyframes pmFadeIn{from{opacity:0}to{opacity:1}}@keyframes pmGalleryIn{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
      body.light-theme .pm-gallery-card{background:#fff;color:#172033;border-color:#17203320}body.light-theme .pm-gallery-note{color:#667085}body.light-theme .pm-gallery-choice{border-color:#17203320;background:#17203308}body.light-theme .pm-gallery-choice:first-child{background:linear-gradient(145deg,#7259f2,#4f46c8);color:#fff}
      @media(prefers-reduced-motion:reduce){.pm-gallery-shade,.pm-gallery-card,.pm-lightbox{animation:none!important;transition:none!important}}

      .pm-compose{display:flex;align-items:flex-end;gap:8px;padding:12px;border-top:1px solid #ffffff16;background:#111a26}
      .pm-compose textarea{flex:1;min-width:0;max-height:120px;min-height:44px;resize:vertical;padding:11px 13px;border:1px solid #ffffff20;border-radius:14px;background:#ffffff0a;color:#fff;font:inherit;font-size:13px}
      .pm-attach,.pm-send{width:44px;height:44px;flex:0 0 44px;border:1px solid #ffffff20;border-radius:14px;background:#ffffff0a;color:#fff;font-size:18px}.pm-send{background:linear-gradient(135deg,#7c5cff,#4f46e5);font-size:16px;font-weight:800}
      .pm-status{min-height:18px;padding:0 14px 7px;color:#aab6c8;font-size:11px}
      .pm-bubble{position:relative;touch-action:pan-y;transition:transform .2s cubic-bezier(.2,.8,.2,1),opacity .2s ease;will-change:transform}
      .pm-bubble.pm-swipe-reply{transform:translateX(16px);opacity:.92}
      #provodaMessengerModal{opacity:0;transition:opacity .2s ease}
      #provodaMessengerModal.open{opacity:1}
      #provodaMessengerModal .pm-shell{transform:translateY(12px) scale(.985);opacity:.96;transition:transform .24s cubic-bezier(.2,.8,.2,1),opacity .2s ease}
      #provodaMessengerModal.open .pm-shell{transform:translateY(0) scale(1);opacity:1}
      #provodaMessengerModal.pm-closing{opacity:0}
      #provodaMessengerModal.pm-closing .pm-shell{transform:translateY(14px) scale(.985);opacity:0}
      .pm-reply-bar{transform:translateY(8px);opacity:0;transition:transform .2s ease,opacity .2s ease}
      .pm-reply-bar.active{transform:translateY(0);opacity:1}
      .pm-chat-head{touch-action:pan-y}
      .pm-close,.pm-back,.pm-attach,.pm-send,.pm-reply-cancel{min-width:42px;min-height:42px;touch-action:manipulation}
      @media(prefers-reduced-motion:reduce){#provodaMessengerModal,#provodaMessengerModal .pm-shell,.pm-bubble,.pm-reply-bar{transition:none!important;animation:none!important}}
      .pm-bubble.pm-selected{outline:2px solid #8b7bff;outline-offset:2px}
      .pm-reply-quote{display:block;margin:0 0 7px;padding:7px 9px;border-left:3px solid #a99aff;border-radius:7px;background:#ffffff12;color:#d9d4ff;font-size:11px;line-height:1.4}
      .pm-forwarded{display:block;margin:0 0 5px;color:#c4b5fd;font-size:10px;font-weight:750}
      .pm-reactions{display:flex;flex-wrap:wrap;gap:3px;margin-top:5px;align-items:center}
      .pm-reaction{min-width:25px;padding:2px 6px;border:1px solid #ffffff1c;border-radius:99px;background:#ffffff0d;color:inherit;font-size:10px;line-height:1.25;display:inline-flex;align-items:center;justify-content:center;gap:3px}
      .pm-reaction.mine{border-color:#a99aff;background:#7c5cff35}
      .pm-action-menu,.pm-photo-menu,.pm-forward-picker{position:fixed;z-index:1405;min-width:210px;padding:7px;border:1px solid #ffffff24;border-radius:16px;background:#172131;color:#eef4ff;box-shadow:0 18px 55px #0008;backdrop-filter:blur(18px)}
      .pm-action-menu button,.pm-photo-menu button,.pm-forward-picker button{display:flex;align-items:center;gap:10px;width:100%;padding:11px;border:0;border-radius:10px;background:transparent;color:inherit;text-align:left;font:inherit;font-size:13px}
      .pm-action-menu button:hover,.pm-photo-menu button:hover,.pm-forward-picker button:hover{background:#ffffff12}
      .pm-emoji-row{display:flex;justify-content:space-between;gap:3px;padding:7px 4px 3px;border-top:1px solid #ffffff16;margin-top:5px}
      .pm-emoji-row button{justify-content:center;padding:7px 4px;font-size:19px}
      .pm-action-menu .pm-menu-divider{height:1px;margin:5px 4px;background:#ffffff18}.pm-online-dot{display:inline-block;width:7px;height:7px;margin-right:6px;border-radius:50%;background:#64748b;vertical-align:middle}.pm-online-dot.online{background:#22c55e;box-shadow:0 0 0 3px #22c55e20}.pm-chat-title small .pm-online-dot{width:7px;height:7px}
      .pm-bubble{-webkit-touch-callout:none;user-select:none}.pm-bubble p{user-select:text}
      .pm-reply-bar{display:none;align-items:center;gap:10px;padding:9px 12px;border-top:1px solid #ffffff16;background:#ffffff08}
      .pm-reply-bar.active{display:flex}
      .pm-reply-copy{flex:1;min-width:0;font-size:11px;color:#c4b5fd;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .pm-reply-cancel{width:30px;height:30px;border-radius:9px;background:#ffffff12;color:inherit}
      .pm-picker-shade{position:fixed;inset:0;z-index:1404;background:#02061788;display:flex;align-items:flex-end;justify-content:center;padding:14px}
      .pm-picker-card{width:min(440px,100%);padding:16px;border:1px solid #ffffff20;border-radius:22px;background:#172131;color:#eef4ff;box-shadow:0 20px 70px #0009}
      .pm-picker-card h3{margin:0 0 12px;font-size:16px}.pm-picker-card textarea{display:block;width:100%;box-sizing:border-box;resize:vertical;padding:12px;border:1px solid #ffffff24;border-radius:12px;background:#ffffff0a;color:inherit;font:inherit;font-size:13px;outline:none}.pm-picker-card button{padding:10px 14px;border:1px solid #ffffff20;border-radius:11px;background:#ffffff0b;color:inherit;font:inherit;font-size:12px}.pm-picker-card button[data-edit-save]{background:#6554d9;border-color:#8778ff;color:#fff}.pm-picker-card button.pm-danger-button{background:#b42335;border-color:#e45b6c;color:#fff}.pm-picker-card button:disabled{opacity:.55}
      body.light-theme .pm-action-menu,body.light-theme .pm-photo-menu,body.light-theme .pm-forward-picker,body.light-theme .pm-picker-card{background:#fff;color:#172033;border-color:#17203320}
      body.light-theme .pm-reply-quote{color:#51439a;background:#6250c910}
      @media(min-width:651px){.pm-action-menu{min-width:225px}}
      @media(max-width:650px){.pm-picker-shade{align-items:flex-end;padding:10px}.pm-action-menu{position:fixed;left:10px!important;right:10px;bottom:10px;top:auto!important;width:auto;border-radius:20px}.pm-action-menu button{padding:13px}.pm-emoji-row button{font-size:22px}}
      body.light-theme #provodaMessengerModal{background:rgba(25,35,55,.45)}body.light-theme .pm-shell{background:#fff;color:#172033}body.light-theme .pm-sidebar{background:#f7f9fd;border-color:#17203318}body.light-theme .pm-person{color:#172033}body.light-theme .pm-person:hover,body.light-theme .pm-person.active{background:#1720330a}body.light-theme .pm-person-copy small,body.light-theme .pm-person-copy em,body.light-theme .pm-chat-title small{color:#667085}body.light-theme .pm-chat{background:#f2f5fb}body.light-theme .pm-bubble{background:#fff;color:#172033;border-color:#17203315}body.light-theme .pm-bubble.mine{background:#6250c9;color:#fff}body.light-theme .pm-compose{background:#fff;border-color:#17203315}body.light-theme .pm-compose textarea{background:#f8f9fc;color:#172033;border-color:#17203320}body.light-theme .pm-close,body.light-theme .pm-back,body.light-theme .pm-attach{color:#172033;border-color:#17203320;background:#17203308}
      @media(max-width:650px){#provodaMessengerModal{padding:0}.pm-shell{width:100%;height:100dvh;max-height:100dvh;border:0;border-radius:0;grid-template-columns:1fr}.pm-sidebar{grid-column:1;grid-row:1;border-right:0}.pm-chat{display:none;grid-column:1;grid-row:1}.pm-shell.chat-open .pm-sidebar{display:none}.pm-shell.chat-open .pm-chat{display:flex}.pm-sidebar-head,.pm-chat-head{min-height:64px}.pm-messages{padding:14px 12px}.pm-bubble{max-width:88%}}
    `;
    document.head.appendChild(s);
  }
  function ensureModal(){
    if($('#provodaMessengerModal'))return;
    const modal=document.createElement('div');modal.id='provodaMessengerModal';modal.setAttribute('aria-hidden','true');
    modal.innerHTML='<section class="pm-shell" role="dialog" aria-modal="true" aria-label="Внутренний мессенджер"><aside class="pm-sidebar"><header class="pm-sidebar-head"><h2>Мессенджер</h2><button type="button" class="pm-close" data-pm-close aria-label="Закрыть">×</button></header><input class="pm-search" id="pmSearch" type="search" placeholder="Найти сотрудника…"><div class="pm-people" id="pmPeople"><div class="pm-empty">Загружаю пользователей…</div></div></aside><section class="pm-chat"><header class="pm-chat-head"><button type="button" class="pm-back" data-pm-back aria-label="К списку чатов">‹</button><span class="pm-avatar" id="pmChatAvatar">?</span><span class="pm-chat-title"><strong id="pmChatName">Выбери сотрудника</strong><small id="pmChatRole">Личный чат</small></span></header><div class="pm-messages" id="pmMessages"><div class="pm-empty">Выбери сотрудника слева, чтобы начать переписку.</div></div><div class="pm-status" id="pmStatus" role="status" aria-live="polite"></div><div class="pm-reply-bar" id="pmReplyBar"><span class="pm-reply-copy" id="pmReplyCopy"></span><button type="button" class="pm-reply-cancel" id="pmReplyCancel" aria-label="Отменить ответ">×</button></div><form class="pm-compose" id="pmCompose"><input type="file" id="pmFile" accept="image/*" multiple hidden><input type="file" id="pmCamera" accept="image/*" capture="environment" hidden><button class="pm-attach" type="button" id="pmAttach" title="Добавить фото" aria-label="Добавить фото">＋</button><textarea id="pmText" rows="1" maxlength="8000" placeholder="Написать сообщение…" disabled></textarea><button class="pm-send" type="submit" id="pmSend" disabled aria-label="Отправить">➤</button></form></section></section>';
    modal.addEventListener('click',e=>{if(e.target===modal||e.target.closest('[data-pm-close]'))close();});
    modal.addEventListener('click',e=>{if(e.target.closest('[data-pm-back]'))backToPeople();});
    const chatPane=modal.querySelector('.pm-chat');
    let chatTouchStart=null;chatPane.addEventListener('touchstart',e=>{const t=e.touches?.[0];if(!t||e.target.closest('.pm-compose,.pm-action-menu,.pm-picker-shade,button,input,textarea'))return;if(!$('#provodaMessengerModal .pm-shell')?.classList.contains('chat-open'))return;chatTouchStart={x:t.clientX,y:t.clientY};},{passive:true});chatPane.addEventListener('touchend',e=>{if(!chatTouchStart)return;const t=e.changedTouches?.[0],s=chatTouchStart;chatTouchStart=null;if(!t)return;const dx=t.clientX-s.x,dy=t.clientY-s.y;if(dx>68&&dx>Math.abs(dy)*1.25)backToPeople();},{passive:true});chatPane.addEventListener('touchcancel',()=>{chatTouchStart=null;},{passive:true});
    chatPane.addEventListener('pointerdown',onChatSwipeStart,{passive:true});
    chatPane.addEventListener('pointerup',onChatSwipeEnd,{passive:true});
    chatPane.addEventListener('pointercancel',()=>{chatSwipeStart=null;},{passive:true});
    document.body.appendChild(modal);
    $('#pmCompose').addEventListener('submit',sendMessage);
    $('#pmAttach').addEventListener('click',showPhotoMenu);
    $('#pmFile').addEventListener('change',sendImage);$('#pmCamera').addEventListener('change',sendImage);
    $('#pmReplyCancel').addEventListener('click',clearReply);
    $('#pmMessages').addEventListener('contextmenu',onMessageContextMenu);
    $('#pmMessages').addEventListener('pointerdown',onMessagePointerDown);
    $('#pmMessages').addEventListener('pointermove',onMessagePointerMove);
    $('#pmMessages').addEventListener('pointerup',onMessagePointerUp);
    $('#pmMessages').addEventListener('pointercancel',cancelLongPress);
    $('#pmMessages').addEventListener('click',onMessageClick);$('#pmMessages').addEventListener('click',onImageClick);
    $('#pmSearch').addEventListener('input',renderPeople);
    document.addEventListener('keydown',e=>{if(e.key!=='Escape'||!modal.classList.contains('open'))return;e.preventDefault();e.stopImmediatePropagation();const shell=$('#provodaMessengerModal .pm-shell');if(shell?.classList.contains('chat-open')||activeConversation){backToPeople();}else{setStatus('');$('#pmMessages').innerHTML='<div class="pm-empty">Начните общаться — выберите сотрудника в списке слева.</div>'; }},true);
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
    await Promise.all([loadUsers(),loadConversations()]);startPresence();startListSync();
  }
  function backToPeople(){
    const shell=$('#provodaMessengerModal .pm-shell');if(!shell)return;
    shell.classList.add('pm-going-back');
    shell.classList.remove('chat-open');
    activeUser=null;activeConversation=null;replyTarget=null;messagesRequestSeq++;lastRenderedConversation=null;
    if(channel){cloudClient.removeChannel(channel);channel=null;}if(poll){clearInterval(poll);poll=null;}
    $('#pmText').value='';$('#pmText').disabled=true;$('#pmSend').disabled=true;clearReply();
    $('#pmChatName').textContent='Выбери сотрудника';$('#pmChatRole').textContent='Личный чат';$('#pmChatAvatar').textContent='?';
    $('#pmMessages').innerHTML='<div class="pm-empty">Начните общаться — выберите сотрудника в списке слева.</div>';
    setTimeout(()=>shell.classList.remove('pm-going-back'),240);
  }
  let chatSwipeStart=null;
  function onChatSwipeStart(e){
    if(e.pointerType==='mouse'||e.target.closest('.pm-compose,.pm-action-menu,.pm-picker-shade'))return;
    const shell=$('#provodaMessengerModal .pm-shell');
    if(!shell?.classList.contains('chat-open'))return;
    if(e.target.closest('.pm-compose,.pm-action-menu,.pm-picker-shade,button,input,textarea'))return;
    chatSwipeStart={x:e.clientX,y:e.clientY,id:e.pointerId};
  }
  function onChatSwipeEnd(e){
    if(!chatSwipeStart)return;
    const start=chatSwipeStart;chatSwipeStart=null;
    const dx=e.clientX-start.x,dy=e.clientY-start.y;
    if(dx>76&&dx>Math.abs(dy)*1.35)backToPeople();
  }
  function close(){
    const modal=$('#provodaMessengerModal');if(!modal)return;
    if(modal.classList.contains('pm-closing'))return;
    modal.classList.add('pm-closing');modal.setAttribute('aria-hidden','true');
    if(syncListTimer)clearInterval(syncListTimer);syncListTimer=null;messagesRequestSeq++;
    if(channel){cloudClient.removeChannel(channel);channel=null;}if(poll){clearInterval(poll);poll=null;}
    activeUser=null;activeConversation=null;replyTarget=null;
    setTimeout(()=>{modal.classList.remove('open','pm-closing');},210);
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
      const online=!!presenceMap[u.user_id];return '<button type="button" class="pm-person '+(activeUser?.user_id===u.user_id?'active':'')+'" data-pm-user="'+esc(u.user_id)+'">'+avatar(u)+'<span class="pm-person-copy"><strong><i class="pm-online-dot '+(online?'online':'')+'"></i>'+esc(u.name||'Сотрудник')+'</strong><small>'+esc(roleIcon(u))+'</small><em>'+esc(conv?.last_message||'Открыть личный чат')+'</em></span></button>';
    }).join(''):'<div class="pm-empty">Пользователи не найдены.</div>';
    box.querySelectorAll('[data-pm-user]').forEach(b=>b.addEventListener('click',()=>openUser(b.dataset.pmUser)));
  }
  async function openUser(userId){
    const person=users.find(u=>u.user_id===userId);if(!person)return;
    activeUser=person;setStatus('Открываю чат…');
    try{
      const {data,error}=await cloudClient.rpc('messenger_open_conversation',{p_target_user_id:userId});if(error)throw error;
      activeConversation=data;messagesRequestSeq++;lastRenderedConversation=null;$('#pmChatAvatar').innerHTML=person.avatar_data?'<img src="'+esc(person.avatar_data)+'" alt="">':esc((person.name||'?').slice(0,1).toUpperCase());
      $('#pmChatName').textContent=person.name||'Сотрудник';$('#pmChatRole').innerHTML='<i class="pm-online-dot '+(presenceMap[userId]?'online':'')+'"></i>'+(presenceMap[userId]?'В сети':'Не в сети');
      $('#pmText').disabled=false;$('#pmSend').disabled=false;
      $('#provodaMessengerModal .pm-shell').classList.add('chat-open');
      await loadMessages();
      if(channel){cloudClient.removeChannel(channel);channel=null;}
      const conversationId=activeConversation;channel=cloudClient.channel('provoda-messenger-'+conversationId).on('postgres_changes',{event:'*',schema:'public',table:'messenger_messages',filter:'conversation_id=eq.'+conversationId},()=>{if(activeConversation!==conversationId)return;loadMessages();loadConversations().then(renderPeople);}).subscribe(status=>{if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){setStatus('Связь обновлений прервалась. Включена авто-синхронизация.',true);}else if(status==='SUBSCRIBED'){setStatus('');}});
      if(poll)clearInterval(poll);poll=setInterval(()=>{if(activeConversation===conversationId&&document.visibilityState==='visible')loadMessages();},4000);
      setStatus('');
    }catch(e){setStatus(e.message||'Не удалось открыть чат.',true);}
    renderPeople();
  }
  async function loadMessages(){
    const conversationId=activeConversation;if(!conversationId||messagesLoading.has(conversationId))return;
    messagesLoading.add(conversationId);const requestId=++messagesRequestSeq;
    const box=$('#pmMessages'),oldHeight=box.scrollHeight,oldTop=box.scrollTop;
    const stickToBottom=lastRenderedConversation!==conversationId||box.scrollHeight-box.scrollTop-box.clientHeight<120;
    try{
      const {data,error}=await cloudClient.rpc('messenger_list_messages',{p_conversation_id:conversationId,p_limit:150});if(error)throw error;
      if(activeConversation!==conversationId||requestId!==messagesRequestSeq)return;
      const messages=Array.isArray(data)?data:[];activeMessages=messages;
      box.innerHTML=messages.length?'':'<div class="pm-empty">Это начало переписки. Напиши первое сообщение.</div>';
      for(const m of messages){
        const mine=m.sender_id===cloudUser.id;
        let imageHtml='';
        if(m.attachment_path){
          try{const {data:signed,error:signError}=await cloudClient.storage.from('provoda-messenger').createSignedUrl(m.attachment_path,3600);if(signError)throw signError;if(signed?.signedUrl)imageHtml='<img class="pm-image" src="'+esc(signed.signedUrl)+'" data-photo-url="'+esc(signed.signedUrl)+'" data-photo-name="'+esc(m.attachment_path.split('/').pop()||'provoda-photo.jpg')+'" alt="Фото из сообщения" loading="lazy">';else throw new Error('Не удалось создать ссылку');}
          catch(e){console.info('Messenger image unavailable',e?.message||e);imageHtml='<button type="button" class="pm-image-retry" data-photo-retry="'+esc(m.id)+'">Фото не открылось · повторить</button>';}
        }
        const date=m.created_at?new Date(m.created_at).toLocaleString('ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'';
        const article=document.createElement('article');article.className='pm-bubble'+(mine?' mine':'');
        const replyHtml=m.reply_preview?'<div class="pm-reply-quote">'+(m.reply_preview.sender_id===cloudUser.id?'Вы':'Ответ')+': '+esc(m.reply_preview.body|| (m.reply_preview.has_attachment?'Фотография':''))+'</div>':'';
        const reactions=(m.reactions||[]).map(r=>'<button type="button" class="pm-reaction '+(r.mine?'mine':'')+'" data-reaction="'+esc(r.emoji)+'" data-message-id="'+esc(m.id)+'">'+esc(r.emoji)+' '+esc(r.count)+'</button>').join('');
        article.dataset.messageId=m.id;
        article.innerHTML=(m.forwarded_from_message_id?'<span class="pm-forwarded">↗ Пересланное сообщение</span>':'')+replyHtml+imageHtml+(m.body?'<p>'+esc(m.body)+'</p>':'')+(m.edited_at?'<small class="pm-edited">изменено</small>':'')+(reactions?'<div class="pm-reactions">'+reactions+'</div>':'')+'<time>'+esc(date)+'</time>';box.appendChild(article);
      }
      if(stickToBottom)box.scrollTop=box.scrollHeight;else box.scrollTop=oldTop+Math.max(0,box.scrollHeight-oldHeight);lastRenderedConversation=conversationId;
    }catch(e){if(activeConversation===conversationId)setStatus(e.message||'Не удалось загрузить сообщения.',true);}
    finally{messagesLoading.delete(conversationId);}
  }
  async function sendMessage(event){
    event.preventDefault();if(!activeConversation)return;
    const input=$('#pmText'),body=input.value.trim();if(!body)return;
    $('#pmSend').disabled=true;
    try{const {error}=await cloudClient.rpc('messenger_send_message',{p_conversation_id:activeConversation,p_body:body,p_attachment_path:null,p_attachment_mime:null,p_reply_to_message_id:replyTarget?.id||null,p_forwarded_from_message_id:null});if(error)throw error;input.value='';clearReply();await loadMessages();await loadConversations();renderPeople();setStatus('');}
    catch(e){setStatus(e.message||'Не удалось отправить сообщение.',true);}
    finally{$('#pmSend').disabled=false;input.focus();}
  }
  async function sendImage(){
    const fileInput=$('#pmFile'),cameraInput=$('#pmCamera'),files=[...(fileInput.files||[]),...(cameraInput.files||[])];if(!files.length)return;
    if(!activeConversation||!activeUser){setStatus('Сначала открой чат.',true);return;}
    const allowed=new Set(['image/jpeg','image/png','image/webp','image/heic']),selected=files.filter(f=>f.type.startsWith('image/')&&allowed.has(f.type)&&f.size<=12*1024*1024);
    if(!selected.length){setStatus(files.some(f=>f.size>12*1024*1024)?'Фото больше 12 МБ. Выбери файл поменьше.':'Формат не поддерживается. Используй JPG, PNG, WebP или HEIC.',true);fileInput.value='';cameraInput.value='';return;}
    if(selected.length<files.length)setStatus('Некоторые фото пропущены: нужен JPG, PNG, WebP или HEIC до 12 МБ.',true);
    $('#pmAttach').disabled=true;$('#pmSend').disabled=true;const body=$('#pmText').value.trim();let sent=0;
    try{
      for(let i=0;i<selected.length;i++){
        const file=selected[i],ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/heic':'heic'})[file.type],nonce=(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)),path=activeConversation+'/'+cloudUser.id+'/'+nonce+'.'+ext;
        setStatus('Отправляю фото '+(i+1)+' из '+selected.length+'…');
        const {data:sessionData,error:sessionError}=await cloudClient.auth.getSession();
        if(sessionError)throw new Error('Не удалось проверить авторизацию: '+sessionError.message);
        const token=sessionData?.session?.access_token;
        if(!token)throw new Error('Сессия истекла. Войди в приложение заново.');
        // Use the Supabase Storage SDK so browser File uploads are sent as multipart/form-data.
        // This also preserves SDK URL encoding and returns structured Storage errors instead of proxy HTML.
        const {data:uploaded,error:uploadError}=await cloudClient.storage.from('provoda-messenger').upload(path,file,{contentType:file.type,cacheControl:'3600',upsert:false});
        if(uploadError){
          const details=[uploadError.message,uploadError.error,uploadError.statusCode?'HTTP '+uploadError.statusCode:''].filter(Boolean).join(' · ');
          throw new Error('Не удалось загрузить фото в хранилище'+(details?': '+details:''));
        }
        if(!uploaded?.path)throw new Error('Хранилище не подтвердило загрузку фотографии.');
        const {error:signError}=await cloudClient.storage.from('provoda-messenger').createSignedUrl(path,60);
        if(signError){await cloudClient.storage.from('provoda-messenger').remove([path]);throw new Error('Фото загрузилось, но не открывается: '+(signError.message||'не удалось создать ссылку'));}
        const {error}=await cloudClient.rpc('messenger_send_message',{p_conversation_id:activeConversation,p_body:i===0?body:'',p_attachment_path:path,p_attachment_mime:file.type,p_reply_to_message_id:i===0?(replyTarget?.id||null):null,p_forwarded_from_message_id:null});
        if(error){await cloudClient.storage.from('provoda-messenger').remove([path]);throw new Error('Фото загружено, но сообщение не сохранилось: '+(error.message||'ошибка отправки'));}
        sent++;
      }
      $('#pmText').value='';clearReply();await loadMessages();await loadConversations();renderPeople();setStatus('Отправлено фото: '+sent);
      setTimeout(()=>{if($('#pmStatus')?.textContent==='Отправлено фото: '+sent)setStatus('');},1800);
    }catch(e){setStatus((e?.message||'Не удалось отправить фото.')+(sent?' Отправлено: '+sent+'. Остальные фото можно отправить повторно.':''),true);}
    finally{$('#pmAttach').disabled=false;$('#pmSend').disabled=false;fileInput.value='';cameraInput.value='';}
  }
  function clearReply(){replyTarget=null;const bar=$('#pmReplyBar');bar?.classList.remove('active');if($('#pmReplyCopy'))$('#pmReplyCopy').textContent='';}
  function setReply(message){replyTarget=message;const bar=$('#pmReplyBar');if(bar){$('#pmReplyCopy').textContent='Ответ на: '+(message.body|| (message.attachment_path?'Фотография':'Сообщение'));bar.classList.add('active');}$('#pmText')?.focus();}
  function messageById(id){return activeMessages.find(m=>m.id===id);}
  function closeActionMenu(){document.querySelectorAll('.pm-action-menu,.pm-picker-shade,.pm-forward-picker,.pm-photo-menu,.pm-gallery-shade,.pm-lightbox').forEach(n=>n.remove());}
  function showPhotoMenu(){
    closeActionMenu();const shade=document.createElement('div');shade.className='pm-gallery-shade';
    shade.innerHTML='<section class="pm-gallery-card" role="dialog" aria-modal="true" aria-label="Выбор фотографий"><div class="pm-gallery-title"><h3>Фото и камера</h3><button type="button" data-photo-cancel aria-label="Закрыть" class="pm-gallery-close">×</button></div><div class="pm-gallery-grid"><button type="button" class="pm-gallery-choice" data-photo-camera><span class="pm-gallery-icon">◎</span><strong>Камера</strong><span>Сделать снимок</span></button><button type="button" class="pm-gallery-choice" data-photo-gallery><span class="pm-gallery-icon">▧</span><strong>Галерея</strong><span>Выбрать фото</span></button></div><p class="pm-gallery-note">Откроется системная галерея устройства. Можно выбрать несколько фотографий. Доступ предоставляется только к выбранным изображениям.</p></section>';
    shade.addEventListener('click',e=>{if(e.target===shade||e.target.closest('[data-photo-cancel]')){shade.remove();return;}if(e.target.closest('[data-photo-gallery]')){shade.remove();$('#pmFile').click();}if(e.target.closest('[data-photo-camera]')){shade.remove();$('#pmCamera').click();}});
    $('#provodaMessengerModal').appendChild(shade);
  }
  function onImageClick(e){
    const retry=e.target.closest('[data-photo-retry]');
    if(retry){const msg=messageById(retry.dataset.photoRetry);if(msg?.attachment_path)openPhoto(null,msg.attachment_path.split('/').pop(),msg.attachment_path);return;}
    const img=e.target.closest('.pm-image');if(img){e.preventDefault();openPhoto(img.dataset.photoUrl||img.src,img.dataset.photoName||'provoda-photo.jpg');}
  }
  async function openPhoto(url,name,path){
    if(path){try{const {data,error}=await cloudClient.storage.from('provoda-messenger').createSignedUrl(path,3600);if(error)throw error;url=data?.signedUrl;}catch(err){setStatus('Не удалось открыть фото: '+(err.message||'ошибка доступа'),true);return;}}
    if(!url)return;closeActionMenu();const shade=document.createElement('div');shade.className='pm-lightbox';
    shade.innerHTML='<button type="button" class="pm-lightbox-close" aria-label="Закрыть">×</button><div class="pm-lightbox-image-wrap"><img class="pm-lightbox-image" alt="Фотография" src="'+esc(url)+'"></div><div class="pm-lightbox-toolbar"><button type="button" class="pm-lightbox-save">↓　Сохранить фото</button><a href="'+esc(url)+'" target="_blank" rel="noopener">↗　Открыть отдельно</a></div>';
    shade.querySelector('.pm-lightbox-close').addEventListener('click',()=>shade.remove());shade.addEventListener('click',e=>{if(e.target===shade)shade.remove();});
    shade.querySelector('.pm-lightbox-save').addEventListener('click',async e=>{
      const button=e.currentTarget;button.disabled=true;button.textContent='Подготовка…';
      try{const response=await fetch(url);if(!response.ok)throw new Error('HTTP '+response.status);const blob=await response.blob(),objectUrl=URL.createObjectURL(blob),a=document.createElement('a');a.href=objectUrl;a.download=(name||'provoda-photo.jpg').replace(/[^a-zA-Z0-9._-]/g,'_');document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),1500);button.textContent='✓　Сохранено';}
      catch(err){button.disabled=false;button.textContent='↓　Сохранить фото';setStatus('Не удалось сохранить фото: '+(err.message||'ошибка загрузки'),true);}
    });$('#provodaMessengerModal').appendChild(shade);
  }
  function showMessageMenu(message,x,y){
    closeActionMenu();const menu=document.createElement('div');menu.className='pm-action-menu';const mine=message.sender_id===cloudUser.id;menu.innerHTML='<button type="button" data-action-reply>↩　Ответить</button><button type="button" data-action-forward>➦　Переслать</button>'+(mine?'<button type="button" data-action-edit>✎　Изменить</button><button type="button" data-action-delete>⌫　Удалить</button>':'')+'<div class="pm-menu-divider"></div><div class="pm-emoji-row">'+['❤️','👍','😂','🔥','😮','😢','👏','👎'].map(e=>'<button type="button" data-action-react="'+e+'" aria-label="Реакция '+e+'">'+e+'</button>').join('')+'</div>';
    menu.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;menu.remove();if(b.hasAttribute('data-action-reply'))setReply(message);else if(b.hasAttribute('data-action-forward'))showForwardPicker(message);else if(b.hasAttribute('data-action-edit'))editMessage(message);else if(b.hasAttribute('data-action-delete'))deleteMessage(message);else if(b.dataset.actionReact)await toggleReaction(message,b.dataset.actionReact);});
    $('#provodaMessengerModal').appendChild(menu);
    if(innerWidth>650){menu.style.left=Math.max(8,Math.min(x,innerWidth-245))+'px';menu.style.top=Math.max(8,Math.min(y,innerHeight-180))+'px';}
  }
  function onMessageContextMenu(e){const article=e.target.closest('.pm-bubble[data-message-id]');if(!article)return;e.preventDefault();e.stopPropagation();const m=messageById(article.dataset.messageId);if(m)showMessageMenu(m,e.clientX,e.clientY);}
  function onMessagePointerDown(e){const article=e.target.closest('.pm-bubble[data-message-id]');if(!article||e.pointerType==='mouse')return;cancelLongPress();pointerStart={x:e.clientX,y:e.clientY,id:article.dataset.messageId,done:false};longPressTimer=setTimeout(()=>{const m=messageById(pointerStart?.id);if(m){pointerStart.done=true;article.classList.add('pm-selected');showMessageMenu(m,e.clientX,e.clientY);setTimeout(()=>article.classList.remove('pm-selected'),900);}},520);}
  function onMessagePointerMove(e){
    if(!pointerStart)return;
    const dx=e.clientX-pointerStart.x,dy=e.clientY-pointerStart.y;
    if(Math.abs(dx)>12||Math.abs(dy)>12)cancelLongPress();
    if(dx>8&&Math.abs(dx)>Math.abs(dy)*1.15){const article=$('#pmMessages [data-message-id="'+CSS.escape(pointerStart.id)+'"]');article?.classList.add('pm-swipe-reply');}
  }
  function onMessagePointerUp(e){
    if(!pointerStart)return;
    clearTimeout(longPressTimer);const start=pointerStart;pointerStart=null;
    const article=$('#pmMessages [data-message-id="'+CSS.escape(start.id)+'"]');article?.classList.remove('pm-swipe-reply');
    if(start.done)return;
    const dx=e.clientX-start.x,dy=e.clientY-start.y;
    if(dx>58&&dx>Math.abs(dy)*1.25){const m=messageById(start.id);if(m)setReply(m);}
  }
  function cancelLongPress(){if(longPressTimer)clearTimeout(longPressTimer);longPressTimer=null;}
  async function onMessageClick(e){const reaction=e.target.closest('[data-reaction]');if(reaction){e.stopPropagation();const m=messageById(reaction.dataset.messageId);if(m)await toggleReaction(m,reaction.dataset.reaction);}}
  async function toggleReaction(message,emoji){try{const {error}=await cloudClient.rpc('messenger_toggle_reaction',{p_message_id:message.id,p_emoji:emoji});if(error)throw error;await loadMessages();}catch(e){setStatus(e.message||'Не удалось поставить реакцию.',true);}}
  function showForwardPicker(message){
    closeActionMenu();const shade=document.createElement('div');shade.className='pm-picker-shade';const card=document.createElement('div');card.className='pm-picker-card';card.innerHTML='<h3>Переслать сообщение</h3><div class="pm-forward-list"></div><button type="button" data-forward-cancel style="justify-content:center;color:#aab6c8;margin-top:8px">Отмена</button>';
    const list=card.querySelector('.pm-forward-list');list.innerHTML=users.map(u=>'<button type="button" data-forward-user="'+esc(u.user_id)+'">'+esc(u.name||'Сотрудник')+' <small style="margin-left:auto;color:#9aa7bb">'+esc(u.role_label||'')+'</small></button>').join('')||'<p class="pm-empty">Нет доступных сотрудников</p>';
    card.addEventListener('click',async e=>{if(e.target.closest('[data-forward-cancel]')){shade.remove();return;}const b=e.target.closest('[data-forward-user]');if(b){shade.remove();await forwardMessageTo(message,b.dataset.forwardUser);}});
    shade.appendChild(card);shade.addEventListener('click',e=>{if(e.target===shade)shade.remove();});$('#provodaMessengerModal').appendChild(shade);
  }
  async function forwardMessageTo(message,userId){
    try{
      setStatus('Пересылаю сообщение…');
      const {data:conv,error:convError}=await cloudClient.rpc('messenger_open_conversation',{p_target_user_id:userId});if(convError)throw convError;
      let attachmentPath=null,attachmentMime=null,body=message.body||'';
      if(message.attachment_path){
        const {data:signed,error:signedError}=await cloudClient.storage.from('provoda-messenger').createSignedUrl(message.attachment_path,300);if(signedError)throw signedError;
        const response=await fetch(signed.signedUrl);if(!response.ok)throw new Error('Не удалось получить исходное фото');
        const blob=await response.blob();attachmentMime=message.attachment_mime||blob.type||'image/jpeg';
        const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/heic':'heic'})[attachmentMime]||'jpg';
        attachmentPath=conv+'/'+cloudUser.id+'/'+(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2))+'.'+ext;
        const {error:uploadError}=await cloudClient.storage.from('provoda-messenger').upload(attachmentPath,blob,{contentType:attachmentMime,upsert:false});if(uploadError)throw uploadError;
      }
      const {error}=await cloudClient.rpc('messenger_send_message',{p_conversation_id:conv,p_body:body,p_attachment_path:attachmentPath,p_attachment_mime:attachmentMime,p_reply_to_message_id:null,p_forwarded_from_message_id:message.id});if(error){if(attachmentPath)await cloudClient.storage.from('provoda-messenger').remove([attachmentPath]);throw error;}
      await loadConversations();renderPeople();setStatus('Сообщение переслано.');
      const target=users.find(u=>u.user_id===userId);if(target){activeUser=target;activeConversation=conv;$('#pmChatName').textContent=target.name||'Сотрудник';$('#pmChatRole').textContent=roleIcon(target);$('#pmChatAvatar').innerHTML=target.avatar_data?'<img src="'+esc(target.avatar_data)+'" alt="">':esc((target.name||'?').slice(0,1).toUpperCase());await loadMessages();}
    }catch(e){setStatus(e.message||'Не удалось переслать сообщение.',true);}
  }

  async function editMessage(message){
    if(message.sender_id!==cloudUser.id)return;
    const shade=document.createElement('div');shade.className='pm-picker-shade';const card=document.createElement('div');card.className='pm-picker-card';card.innerHTML='<h3>Изменить сообщение</h3><textarea class="pm-edit-text" maxlength="8000" rows="4"></textarea><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button type="button" data-edit-cancel>Отмена</button><button type="button" data-edit-save>Сохранить</button></div>';
    const input=card.querySelector('textarea');input.value=message.body||'';card.querySelector('[data-edit-cancel]').onclick=()=>shade.remove();card.querySelector('[data-edit-save]').onclick=async()=>{const body=input.value.trim();if(!body&&!message.attachment_path){setStatus('Сообщение не может быть пустым.',true);return;}const save=card.querySelector('[data-edit-save]');save.disabled=true;try{const {error}=await cloudClient.rpc('messenger_update_message',{p_message_id:message.id,p_body:body});if(error)throw error;shade.remove();await loadMessages();setStatus('Сообщение изменено.');}catch(e){save.disabled=false;setStatus(e.message||'Не удалось изменить сообщение.',true);}};
    shade.appendChild(card);shade.addEventListener('click',e=>{if(e.target===shade)shade.remove();});$('#provodaMessengerModal').appendChild(shade);input.focus();
  }
  async function deleteMessage(message){
    if(message.sender_id!==cloudUser.id)return;
    const shade=document.createElement('div');shade.className='pm-picker-shade';const card=document.createElement('div');card.className='pm-picker-card';card.innerHTML='<h3>Удалить сообщение?</h3><p style="margin:0;color:#aebbd0;font-size:13px;line-height:1.5">Сообщение исчезнет из переписки у обоих участников.</p><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px"><button type="button" data-delete-cancel>Отмена</button><button type="button" data-delete-confirm class="pm-danger-button">Удалить</button></div>';
    card.querySelector('[data-delete-cancel]').onclick=()=>shade.remove();card.querySelector('[data-delete-confirm]').onclick=async()=>{const b=card.querySelector('[data-delete-confirm]');b.disabled=true;try{const {data,error}=await cloudClient.rpc('messenger_delete_message',{p_message_id:message.id});if(error)throw error;if(data?.attachment_path)await cloudClient.storage.from('provoda-messenger').remove([data.attachment_path]);shade.remove();await loadMessages();await loadConversations();renderPeople();setStatus('Сообщение удалено.');}catch(e){b.disabled=false;setStatus(e.message||'Не удалось удалить сообщение.',true);}};
    shade.appendChild(card);shade.addEventListener('click',e=>{if(e.target===shade)shade.remove();});$('#provodaMessengerModal').appendChild(shade);
  }
  async function refreshPresence(){
    if(!cloudClient||!cloudUser)return;
    try{const {data,error}=await cloudClient.rpc('messenger_list_presence');if(error)throw error;const next={};(Array.isArray(data)?data:[]).forEach(p=>{next[p.user_id]=!!p.online;});presenceMap=next;renderPeople();if(activeUser){const online=!!presenceMap[activeUser.user_id];$('#pmChatRole').innerHTML='<i class="pm-online-dot '+(online?'online':'')+'"></i>'+(online?'В сети':'Не в сети');}}
    catch(e){console.info('Messenger presence unavailable',e?.message||e);}
  }
  async function sendPresence(){if(!cloudClient||!cloudUser||document.visibilityState==='hidden')return;try{const {error}=await cloudClient.rpc('messenger_presence_ping');if(error)throw error;}catch(e){console.info('Messenger heartbeat:',e?.message||e);}}
  function startPresence(){stopPresence();sendPresence();refreshPresence();presenceHeartbeat=setInterval(sendPresence,20000);presenceTimer=setInterval(refreshPresence,10000);document.addEventListener('visibilitychange',onPresenceVisibility);}
  function stopPresence(){if(presenceHeartbeat)clearInterval(presenceHeartbeat);if(presenceTimer)clearInterval(presenceTimer);presenceHeartbeat=presenceTimer=null;document.removeEventListener('visibilitychange',onPresenceVisibility);}
  function onPresenceVisibility(){if(document.visibilityState==='visible'){sendPresence();refreshPresence();if(activeConversation)loadMessages();if($('#provodaMessengerModal')?.classList.contains('open')){loadConversations();loadUsers();}}}
  function startListSync(){if(syncListTimer)clearInterval(syncListTimer);syncListTimer=setInterval(()=>{if(document.visibilityState==='visible'&&$('#provodaMessengerModal')?.classList.contains('open')){loadConversations();loadUsers();refreshPresence();}},15000);}
  function init(){
    styles();ensureModal();
    window.addEventListener('provoda-user-ready',()=>{refreshAccess();startPresence();});
    window.addEventListener('provoda-user-deactivated',()=>{enabled=false;installHeaderButton();stopPresence();presenceMap={};close();});
    refreshAccess();if(typeof cloudUser!=='undefined'&&cloudUser)startPresence();
    window.setInterval(()=>{if(typeof cloudUser!=='undefined'&&cloudUser)refreshAccess();},12000);
    window.openProvodaMessenger=open;
    window.openProvodaMessengerWithUser=async userId=>{await open();const person=users.find(u=>u.user_id===userId);if(person)await openUser(userId);};
    window.setInterval(()=>{if(typeof cloudClient!=='undefined'&&cloudClient&&typeof cloudUser!=='undefined'&&cloudUser&&document.visibilityState==='visible'){if(typeof loadNotificationCenter==='function')loadNotificationCenter();}},30000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();