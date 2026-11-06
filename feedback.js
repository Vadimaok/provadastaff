/* Provoda Staff — secure employee feedback */
(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  function styles() {
    if ($('#provodaFeedbackStyles')) return;
    const style = document.createElement('style');
    style.id = 'provodaFeedbackStyles';
    style.textContent = '#provodaFeedbackCard{margin:16px 0 8px;padding:18px;border:1px solid var(--line);border-radius:22px;background:linear-gradient(145deg,rgba(124,92,255,.12),rgba(34,211,238,.045)),var(--card);box-shadow:var(--shadow)}#provodaFeedbackCard h2{margin:0 0 6px;font-size:16px}#provodaFeedbackCard p{margin:0;color:var(--muted);font-size:13px;line-height:1.5}#provodaFeedbackOpen{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;margin-top:14px;padding:13px 16px;border:1px solid rgba(124,92,255,.38);border-radius:14px;background:rgba(124,92,255,.15);color:var(--text);font:inherit;font-weight:750}.provoda-feedback-modal{position:fixed;inset:0;z-index:100050;display:grid;place-items:center;padding:16px;background:rgba(3,7,18,.82);backdrop-filter:blur(12px)}.provoda-feedback-panel{width:min(480px,100%);max-height:min(86vh,760px);overflow:auto;padding:22px;border:1px solid var(--line);border-radius:24px;background:linear-gradient(160deg,#172033,#0d1320);color:var(--text);box-shadow:0 28px 90px #0009}.provoda-feedback-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.provoda-feedback-head h2{margin:0;font-size:21px}.provoda-feedback-head p{margin:5px 0 0;color:var(--muted);font-size:13px}.provoda-feedback-close{width:36px;height:36px;flex:0 0 36px;border:1px solid var(--line);border-radius:12px;background:rgba(255,255,255,.05);color:var(--text);font-size:20px}.provoda-feedback-form{display:grid;gap:13px;margin-top:18px}.provoda-feedback-form label{display:grid;gap:7px;color:var(--text);font-size:13px;font-weight:650}.provoda-feedback-form select,.provoda-feedback-form textarea{width:100%;min-width:0;border:1px solid var(--line);border-radius:13px;padding:12px;background:#111925;color:var(--text);font:inherit}.provoda-feedback-form textarea{min-height:132px;resize:vertical;line-height:1.5}.provoda-feedback-help{color:var(--muted);font-size:11px;font-weight:400}.provoda-feedback-status{min-height:18px;margin:0;color:var(--muted);font-size:12px}.provoda-feedback-status[data-error=true]{color:#fda4af}.provoda-feedback-submit{width:100%;padding:13px 16px;border-radius:14px;background:linear-gradient(135deg,#7c5cff,#5968df);color:white;font:inherit;font-weight:800}.provoda-feedback-submit:disabled{opacity:.55;cursor:wait}.provoda-feedback-form select:focus-visible,.provoda-feedback-form textarea:focus-visible,.provoda-feedback-modal button:focus-visible{outline:2px solid var(--accent2);outline-offset:2}@media(max-width:420px){.provoda-feedback-panel{padding:18px;border-radius:20px}.provoda-feedback-form textarea{min-height:116px}}';
    document.head.appendChild(style);
  }
  function openModal() {
    if ($('#provodaFeedbackModal')) return;
    const overlay = document.createElement('div');
    overlay.id = 'provodaFeedbackModal';
    overlay.className = 'provoda-feedback-modal';
    overlay.innerHTML = '<section class="provoda-feedback-panel" role="dialog" aria-modal="true" aria-labelledby="provodaFeedbackTitle"><div class="provoda-feedback-head"><div><h2 id="provodaFeedbackTitle">Обратная связь</h2><p>Расскажи, что стоит исправить или улучшить в Provoda Staff.</p></div><button class="provoda-feedback-close" type="button" aria-label="Закрыть">×</button></div><form class="provoda-feedback-form" id="provodaFeedbackForm"><label>Тип обращения<select name="kind" required><option value="idea">Идея или улучшение</option><option value="bug">Ошибка или проблема</option><option value="other">Другое</option></select></label><label>Сообщение<textarea name="message" minlength="10" maxlength="2000" required placeholder="Опиши ситуацию: что произошло и как должно работать…"></textarea><span class="provoda-feedback-help">От 10 до 2000 символов. Не указывай пароли и коды доступа.</span></label><p class="provoda-feedback-status" id="provodaFeedbackStatus" role="status" aria-live="polite"></p><button class="provoda-feedback-submit" type="submit">Отправить обращение</button></form></section>';
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    $('.provoda-feedback-close', overlay).addEventListener('click', close);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
    $('textarea', overlay).focus();
    $('#provodaFeedbackForm', overlay).addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = $('.provoda-feedback-submit', form);
      const status = $('#provodaFeedbackStatus', form);
      const user = typeof cloudUser !== 'undefined' ? cloudUser : null;
      const client = typeof cloudClient !== 'undefined' ? cloudClient : null;
      const message = String(form.elements.message.value || '').trim();
      if (!user?.id || !client) {
        status.textContent = 'Не удалось определить аккаунт. Перезайди в приложение и попробуй ещё раз.';
        status.dataset.error = 'true';
        return;
      }
      if (message.length < 10 || message.length > 2000) {
        status.textContent = 'Сообщение должно содержать от 10 до 2000 символов.';
        status.dataset.error = 'true';
        return;
      }
      button.disabled = true;
      button.textContent = 'Отправляем…';
      status.textContent = 'Сохраняем обращение…';
      status.dataset.error = 'false';
      try {
        const { error } = await client.from('user_feedback').insert({
          user_id: user.id,
          kind: form.elements.kind.value,
          message,
          page: String(location.pathname || '/').slice(0, 200)
        });
        if (error) throw error;
        status.textContent = 'Готово. Спасибо! Обращение передано на рассмотрение.';
        form.reset();
        button.textContent = 'Отправлено';
        setTimeout(() => overlay.remove(), 1100);
      } catch (error) {
        console.error('Provoda feedback submit failed:', error);
        status.textContent = error?.code === '42P01' || /user_feedback|relation.*does not exist/i.test(error?.message || '')
          ? 'Таблица обратной связи ещё не подключена администратором.'
          : 'Не удалось отправить обращение. Проверь интернет и попробуй ещё раз.';
        status.dataset.error = 'true';
        button.disabled = false;
        button.textContent = 'Повторить отправку';
      }
    });
  }
  function mount() {
    if (typeof cloudUser === 'undefined' || !cloudUser?.id) return;
    const host = $('#dashboardTiles');
    if (!host || $('#provodaFeedbackCard')) return;
    styles();
    const card = document.createElement('section');
    card.id = 'provodaFeedbackCard';
    card.className = 'card';
    card.innerHTML = '<h2>Есть идея или заметил ошибку?</h2><p>Помоги сделать Provoda Staff удобнее. Каждое обращение попадёт на рассмотрение.</p><button id="provodaFeedbackOpen" type="button">Оставить отзыв или предложение</button>';
    host.appendChild(card);
    $('#provodaFeedbackOpen', card).addEventListener('click', openModal);
  }
  window.addEventListener('provoda-user-ready', mount);
  document.addEventListener('DOMContentLoaded', mount);
  window.addEventListener('load', mount, { once: true });
})();
