class BrowserAssistant {
  constructor() {
    this.isOpen = false;
    this.dialog = null;
    this.shadowHost = null;
    this.shadowRoot = null;
    this.threadId = null;
    this.isListening = false;
    this.recognition = null;
    this.init();
  }

  init() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'toggleAssistant') {
        this.toggleAssistant();
        sendResponse({ success: true });
      } else if (request.action === 'analyzePage') {
        this.analyzeCurrentPage();
        sendResponse({ success: true });
      }
      return true;
    });

    this._createShadowHost();
    this._buildDialog();
  }

  /* Shadow DOM — изоляция от страницы */

  _createShadowHost() {
    this.shadowHost = document.createElement('div');
    this.shadowHost.id = 'ba-shadow-host';
    // Хост не виден и не занимает место до открытия диалога
    this.shadowHost.setAttribute('style', [
      'position:fixed',
      'top:0',
      'left:0',
      'width:0',
      'height:0',
      'z-index:2147483647',
      'pointer-events:none',
    ].join(';'));
    document.body.appendChild(this.shadowHost);
    this.shadowRoot = this.shadowHost.attachShadow({ mode: 'open' });
  }

  _buildDialog() {
    // Инжектируем стили в Shadow DOM
    const style = document.createElement('style');
    style.textContent = this._styles();
    this.shadowRoot.appendChild(style);

    // Сам диалог
    this.dialog = document.createElement('dialog');
    this.dialog.id = 'ba-dialog';
    this.dialog.setAttribute('aria-labelledby', 'ba-dialog-title');
    this.dialog.setAttribute('aria-modal', 'true');

    this.dialog.innerHTML = this._dialogTemplate();
    this.shadowRoot.appendChild(this.dialog);

    // Привязываем события после вставки в DOM
    this._bindEvents();
  }

  _dialogTemplate() {
    return `
      <div class="ba-panel" role="document">
        <header class="ba-header">
          <h1 class="ba-title" id="ba-dialog-title">Ассистент корпуса</h1>
          <button class="ba-close" id="ba-close" type="button"
                  aria-label="Закрыть ассистента">
            <svg aria-hidden="true" focusable="false" width="18" height="18"
                 viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </header>

        <!-- Живая область для статусных сообщений ассистента -->
        <div id="ba-status-live"
             class="ba-sr-only"
             role="status"
             aria-live="polite"
             aria-atomic="true"></div>

        <!-- Живая область для сообщений об ошибках -->
        <div id="ba-error-live"
             class="ba-sr-only"
             role="alert"
             aria-live="assertive"
             aria-atomic="true"></div>

        <!-- Статус микрофона (разрешение + промежуточный транскрипт) -->
        <div id="ba-mic-status"
             class="ba-mic-status"
             role="status"
             aria-live="polite"
             aria-atomic="false"
             hidden></div>

        <!-- Область сообщений чата -->
        <div id="ba-chat"
             class="ba-chat"
             role="log"
             aria-label="История диалога"
             aria-live="polite"
             aria-relevant="additions"
             tabindex="0"></div>

        <!-- Поле ввода -->
        <footer class="ba-footer">
          <div class="ba-input-row">
            <label class="ba-sr-only" for="ba-input">Сообщение ассистенту</label>
            <input type="text"
                   id="ba-input"
                   class="ba-input"
                   placeholder="Введите вопрос или запрос…"
                   autocomplete="off"
                   aria-describedby="ba-input-hint">
            <button id="ba-voice" type="button" class="ba-btn-icon ba-btn-voice"
                    aria-label="Голосовой ввод"
                    aria-pressed="false">
              <svg id="ba-mic-svg" aria-hidden="true" focusable="false"
                   width="20" height="20" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 14C13.66 14 15 12.66 15 11V5C15 3.34 13.66 2 12 2C10.34 2 9 3.34 9 5V11C9 12.66 10.34 14 12 14Z"/>
                <path d="M19 11V13C19 16.31 16.31 19 13 19H11C7.69 19 5 16.31 5 13V11"/>
                <path d="M12 19V22"/>
                <path d="M8 22H16"/>
              </svg>
            </button>
            <button id="ba-send" type="button" class="ba-btn-send"
                    aria-label="Отправить сообщение">
              Отправить
            </button>
          </div>
          <div id="ba-input-hint" class="ba-input-hint">
            Нажмите Enter или кнопку «Отправить» для отправки.
            Кнопка микрофона запускает голосовой ввод на русском языке.
          </div>
        </footer>
      </div>
    `;
  }

  _styles() {
    return `
      :host {
        all: initial;
      }

      /* Базовый сброс внутри Shadow DOM */
      *, *::before, *::after {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      /* Визуально скрытый, но доступный для AT */
      .ba-sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0,0,0,0);
        white-space: nowrap;
        border: 0;
      }

      /* <dialog> */
      dialog {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        left: auto;
        width: 420px;
        max-width: 100vw;
        height: 100vh;
        padding: 0;
        margin: 0;
        border: none;
        background: transparent;
        overflow: visible;
        /* Скрыт по умолчанию (атрибут open управляет видимостью) */
        display: none;
        /* Нет backdrop у нативного <dialog open>, панель сбоку */
      }

      dialog[open] {
        display: flex;
      }

      /* Панель */
      .ba-panel {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        background: #ffffff;
        border-left: 1px solid #d0d0d0;
        box-shadow: -3px 0 16px rgba(0,0,0,0.14);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        color: #1a1a1a;
        animation: ba-slide-in 0.25s ease;
      }

      @keyframes ba-slide-in {
        from { transform: translateX(100%); opacity: 0; }
        to   { transform: translateX(0);    opacity: 1; }
      }

      /* Заголовок */
      .ba-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px;
        background: #f4f6f8;
        border-bottom: 1px solid #d0d0d0;
        flex-shrink: 0;
      }

      .ba-title {
        font-size: 16px;
        font-weight: 700;
        color: #1a1a1a;
        line-height: 1.2;
      }

      /* Кнопка закрытия */
      .ba-close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        background: none;
        border: 2px solid transparent;
        border-radius: 4px;
        cursor: pointer;
        color: #555;
        transition: background 0.15s, color 0.15s;
      }

      .ba-close:hover {
        background: #e2e6ea;
        color: #1a1a1a;
      }

      .ba-close:focus-visible {
        outline: 3px solid #005fa3;
        outline-offset: 2px;
        border-color: transparent;
      }

      /* Статус микрофона */
      .ba-mic-status {
        padding: 8px 16px;
        font-size: 13px;
        background: #eaf4ff;
        color: #003f7a;
        border-bottom: 1px solid #b8d9f5;
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }

      .ba-mic-status.recording {
        background: #fff3e0;
        color: #7a3f00;
        border-color: #f5d0a8;
      }

      .ba-mic-status.error {
        background: #fde8e8;
        color: #7a1a1a;
        border-color: #f5b8b8;
      }

      /* Чат */
      .ba-chat {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        scroll-behavior: smooth;
      }

      .ba-chat:focus {
        outline: 2px solid #005fa3;
        outline-offset: -2px;
      }

      /* Полоса прокрутки */
      .ba-chat::-webkit-scrollbar { width: 6px; }
      .ba-chat::-webkit-scrollbar-track { background: #f1f1f1; }
      .ba-chat::-webkit-scrollbar-thumb { background: #b0b0b0; border-radius: 3px; }
      .ba-chat::-webkit-scrollbar-thumb:hover { background: #888; }

      /* Сообщения */
      .ba-msg {
        max-width: 85%;
        padding: 10px 14px;
        border-radius: 14px;
        line-height: 1.55;
        word-wrap: break-word;
        overflow-wrap: anywhere;
      }

      .ba-msg--user {
        background: #005fa3;
        color: #ffffff;
        align-self: flex-end;
        margin-left: auto;
        border-bottom-right-radius: 4px;
      }

      .ba-msg--assistant {
        background: #f1f3f5;
        color: #1a1a1a;
        align-self: flex-start;
        border-bottom-left-radius: 4px;
      }

      .ba-msg--loading {
        display: flex;
        align-items: center;
        gap: 10px;
        font-style: italic;
        color: #555;
      }

      /* Спиннер загрузки */
      .ba-spinner {
        width: 18px;
        height: 18px;
        border: 2px solid #d0d0d0;
        border-top-color: #005fa3;
        border-radius: 50%;
        animation: ba-spin 0.8s linear infinite;
        flex-shrink: 0;
      }

      @keyframes ba-spin {
        to { transform: rotate(360deg); }
      }

      /* Markdown-элементы внутри сообщений */
      .ba-msg h1 { font-size: 1.3em; font-weight: 700; margin: 0.4em 0; }
      .ba-msg h2 { font-size: 1.15em; font-weight: 700; margin: 0.35em 0; }
      .ba-msg h3 { font-size: 1.05em; font-weight: 600; margin: 0.3em 0; }
      .ba-msg strong { font-weight: 700; }
      .ba-msg em { font-style: italic; }
      .ba-msg code {
        background: #eef0f2;
        padding: 1px 5px;
        border-radius: 3px;
        font-family: 'Courier New', monospace;
        font-size: 0.9em;
        color: #c7254e;
      }
      .ba-msg pre {
        background: #f8f9fa;
        border: 1px solid #dee2e6;
        border-radius: 6px;
        padding: 10px 12px;
        overflow-x: auto;
        margin: 6px 0;
      }
      .ba-msg pre code { background: none; padding: 0; color: #333; }
      .ba-msg a { color: #005fa3; }
      .ba-msg a:focus { outline: 2px solid #005fa3; border-radius: 2px; }
      .ba-msg ul, .ba-msg ol { padding-left: 20px; margin: 6px 0; }
      .ba-msg li { margin: 3px 0; }

      /* Футер (поле ввода) */
      .ba-footer {
        padding: 12px 16px;
        border-top: 1px solid #d0d0d0;
        background: #f4f6f8;
        flex-shrink: 0;
      }

      .ba-input-row {
        display: flex;
        gap: 8px;
        align-items: center;
      }

      .ba-input {
        flex: 1;
        padding: 9px 12px;
        border: 2px solid #b0b8c1;
        border-radius: 22px;
        font-size: 13px;
        color: #1a1a1a;
        background: #fff;
        outline: none;
        transition: border-color 0.15s;
        min-width: 0;
      }

      .ba-input:focus {
        border-color: #005fa3;
        outline: 3px solid #005fa3;
        outline-offset: 1px;
      }

      .ba-input-hint {
        font-size: 11px;
        color: #666;
        margin-top: 6px;
        line-height: 1.4;
      }

      /* Кнопки действий */
      .ba-btn-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        background: #fff;
        border: 2px solid #b0b8c1;
        border-radius: 50%;
        cursor: pointer;
        color: #333;
        transition: background 0.15s, border-color 0.15s, color 0.15s;
        flex-shrink: 0;
      }

      .ba-btn-icon:focus-visible {
        outline: 3px solid #005fa3;
        outline-offset: 2px;
      }

      .ba-btn-icon:hover {
        background: #e8ecf0;
        border-color: #888;
      }

      /* Активное состояние: запись идёт */
      .ba-btn-voice[aria-pressed="true"] {
        background: #fff3e0;
        border-color: #d9730d;
        color: #b35900;
      }

      .ba-btn-send {
        padding: 9px 16px;
        background: #005fa3;
        color: #ffffff;
        border: 2px solid #005fa3;
        border-radius: 22px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        white-space: nowrap;
        min-height: 40px;
        transition: background 0.15s, border-color 0.15s;
      }

      .ba-btn-send:hover {
        background: #004880;
        border-color: #004880;
      }

      .ba-btn-send:focus-visible {
        outline: 3px solid #005fa3;
        outline-offset: 2px;
      }

      /* Скачать HTML (Mermaid) */
      .ba-download-wrap {
        border: 1px solid #d0d0d0;
        border-radius: 8px;
        padding: 14px;
        background: #f9fafb;
        text-align: center;
      }

      .ba-download-link {
        display: inline-block;
        padding: 9px 18px;
        background: #005fa3;
        color: #fff;
        text-decoration: none;
        border-radius: 6px;
        font-weight: 600;
        margin-top: 8px;
      }

      .ba-download-link:focus-visible {
        outline: 3px solid #005fa3;
        outline-offset: 2px;
      }
    `;
  }

  /* События */

  _bindEvents() {
    const s = (id) => this.shadowRoot.getElementById(id);

    s('ba-close').addEventListener('click', () => this.closeAssistant());
    s('ba-send').addEventListener('click', () => this.sendMessage());
    s('ba-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    s('ba-voice').addEventListener('click', () => {
      if (this.isListening) {
        this.stopVoiceInput();
      } else {
        this.startVoiceInput();
      }
    });

    // Закрыть по Escape
    this.dialog.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeAssistant();
    });
  }

  /* Открытие / закрытие */

  toggleAssistant() {
    if (this.isOpen) {
      this.closeAssistant();
    } else {
      this.openAssistant();
    }
  }

  openAssistant() {
    this.isOpen = true;
    // Разрешаем клики на хосте
    this.shadowHost.style.pointerEvents = 'auto';
    this.shadowHost.style.width = '420px';
    this.shadowHost.style.height = '100vh';
    this.shadowHost.style.right = '0';
    this.shadowHost.style.left = 'auto';

    // Используем showModal() для создания правильного стека диалогов
    // Но поскольку нам не нужен backdrop, используем open-атрибут вручную:
    this.dialog.setAttribute('open', '');
    this.dialog.style.display = 'flex';

    this.analyzeCurrentPage();
  }

  closeAssistant() {
    this.isOpen = false;
    if (this.isListening) this.stopVoiceInput();

    this.dialog.removeAttribute('open');
    this.dialog.style.display = 'none';

    this.shadowHost.style.pointerEvents = 'none';
    this.shadowHost.style.width = '0';
    this.shadowHost.style.height = '0';
  }

  /* Анализ страницы */

  async analyzeCurrentPage() {
    this._addMessage('assistant', 'Анализирую страницу…', true);
    this._announce('Выполняется анализ страницы');

    try {
      if (!chrome.runtime) throw new Error('Chrome runtime недоступен');

      const pageData = {
        url: window.location.href,
        title: document.title,
        content: document.body.innerText.substring(0, 5000),
        timestamp: new Date().toISOString()
      };

      const response = await chrome.runtime.sendMessage({ action: 'analyzePage', data: pageData });
      this._removeLastMessage();
      this._addMessage('assistant', response.summary || 'Анализ страницы завершён.');
      this._announce('Анализ страницы завершён');
    } catch (error) {
      console.error('Ошибка анализа страницы:', error);
      this._removeLastMessage();
      this._addMessage('assistant', this._mapError(error.message));
      this._announceError('Ошибка анализа страницы: ' + error.message);
    }
  }

  /* Отправка сообщения */

  async sendMessage() {
    const input = this.shadowRoot.getElementById('ba-input');
    const message = input.value.trim();
    if (!message) return;

    this._addMessage('user', message);
    input.value = '';
    input.setAttribute('aria-label', 'Сообщение ассистенту');
    this._addMessage('assistant', 'Обрабатываю запрос…', true);

    try {
      if (!chrome.runtime) throw new Error('Chrome runtime недоступен');

      if (!this.threadId) {
        this.threadId = 'thread_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      }

      const response = await chrome.runtime.sendMessage({
        action: 'chatMessage',
        message,
        threadId: this.threadId,
        pageData: {
          url: window.location.href,
          title: document.title,
          content: document.body.innerText.substring(0, 5000)
        }
      });

      this._removeLastMessage();
      this._addMessage('assistant', response.response || 'Извините, не удалось обработать запрос.');
    } catch (error) {
      console.error('Ошибка отправки сообщения:', error);
      this._removeLastMessage();
      this._addMessage('assistant', this._mapError(error.message));
      this._announceError('Ошибка: ' + error.message);
    }
  }

  /* Голосовой ввод */

  startVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this._addMessage('assistant',
        'Голосовой ввод не поддерживается в вашем браузере. Используйте браузер на основе Chromium.');
      this._announceError('Голосовой ввод не поддерживается');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'ru-RU';

    this.recognition.onstart = () => {
      this.isListening = true;
      this._setVoiceButtonState(true);
    };

    // Промежуточные и финальные результаты
    this.recognition.onresult = (event) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      // Финальный результат — вставляем в поле ввода и останавливаем запись
      if (final) {
        const input = this.shadowRoot.getElementById('ba-input');
        input.value = final;
        this.recognition.stop();
        this.sendMessage();
      }
    };

    // Ошибка
    this.recognition.onerror = (event) => {
      console.error('Ошибка распознавания речи:', event.error);
      let msg = 'Ошибка голосового ввода.';
      if (event.error === 'not-allowed' || event.error === 'permission-denied') {
        msg = 'Доступ к микрофону запрещён. Разрешите доступ в настройках браузера.';
      } else if (event.error === 'no-speech') {
        msg = 'Речь не обнаружена. Попробуйте ещё раз.';
      } else if (event.error === 'audio-capture') {
        msg = 'Микрофон не найден. Проверьте подключение.';
      } else if (event.error === 'network') {
        msg = 'Ошибка сети при распознавании речи.';
      }
      this._setMicStatus('⚠ ' + msg, 'error');
      this._announceError(msg);
    };

    // Запись завершена
    this.recognition.onend = () => {
      this.isListening = false;
      this._setVoiceButtonState(false);
      // Скрываем статус через 3 секунды
      setTimeout(() => this._hideMicStatus(), 3000);
    };

    try {
      this.recognition.start();
    } catch (e) {
      this._setMicStatus('⚠ Не удалось запустить распознавание: ' + e.message, 'error');
      this._announceError('Ошибка запуска распознавания: ' + e.message);
    }
  }

  stopVoiceInput() {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
    }
    this.isListening = false;
    this._setVoiceButtonState(false);
    this._hideMicStatus();
  }

  _setVoiceButtonState(isRecording) {
    const btn = this.shadowRoot.getElementById('ba-voice');
    if (!btn) return;
    btn.setAttribute('aria-pressed', isRecording ? 'true' : 'false');
    btn.setAttribute('aria-label', isRecording ? 'Остановить голосовой ввод' : 'Голосовой ввод');
  }

  _setMicStatus(text, type) {
    const el = this.shadowRoot.getElementById('ba-mic-status');
    if (!el) return;
    el.textContent = text;
    el.className = 'ba-mic-status' + (type && type !== 'default' ? ' ' + type : '');
    el.hidden = false;
  }

  _hideMicStatus() {
    const el = this.shadowRoot.getElementById('ba-mic-status');
    if (el) {
      el.hidden = true;
      el.textContent = '';
      el.className = 'ba-mic-status';
    }
  }

  /* Живые области (для скринридеров) */

  _announce(text) {
    const el = this.shadowRoot.getElementById('ba-status-live');
    if (el) { el.textContent = ''; setTimeout(() => { el.textContent = text; }, 50); }
  }

  _announceError(text) {
    const el = this.shadowRoot.getElementById('ba-error-live');
    if (el) { el.textContent = ''; setTimeout(() => { el.textContent = text; }, 50); }
  }

  /* Сообщения в чат */

  _addMessage(sender, content, isLoading = false) {
    const chat = this.shadowRoot.getElementById('ba-chat');
    const div = document.createElement('div');
    div.className = 'ba-msg ba-msg--' + sender;

    if (sender === 'assistant') {
      div.setAttribute('aria-label', 'Сообщение ассистента');
    } else {
      div.setAttribute('aria-label', 'Ваше сообщение');
    }

    if (isLoading) {
      div.classList.add('ba-msg--loading');
      const spinner = document.createElement('div');
      spinner.className = 'ba-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      div.appendChild(spinner);
      const text = document.createElement('span');
      text.textContent = content;
      div.appendChild(text);
    } else {
      if (sender === 'assistant') {
        const rendered = this._renderMarkdown(content);
        if (this._containsMermaid(content)) {
          div.innerHTML = this._mermaidDownloadBlock(rendered);
        } else {
          div.innerHTML = rendered;
        }
      } else {
        div.textContent = content;
      }
    }

    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }

  _removeLastMessage() {
    const chat = this.shadowRoot.getElementById('ba-chat');
    if (chat && chat.lastChild) chat.removeChild(chat.lastChild);
  }

  /* Markdown */

  _renderMarkdown(text) {
    if (!text) return '';

    const htmlBlock = text.match(/```html\s*([\s\S]*?)\s*```/);
    if (htmlBlock) return htmlBlock[1].trim();

    const codeBlock = text.match(/```\s*([\s\S]*?)\s*```/);
    if (codeBlock) {
      const c = codeBlock[1].trim();
      if (c.includes('<div') || c.includes('<script') || c.includes('<html') ||
          c.includes('<!DOCTYPE') || c.includes('<svg') || c.includes('class=')) {
        return c;
      }
    }

    if (text.includes('<div class="mermaid-diagram">') ||
        text.includes('<script>') || text.includes('<html>') || text.includes('<!DOCTYPE')) {
      return text;
    }

    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    html = html
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.*?)__/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/_(.*?)_/g, '<em>$1</em>')
      .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/\n/g, '<br>')
      .replace(/^\* (.*$)/gim, '<li>$1</li>')
      .replace(/^- (.*$)/gim, '<li>$1</li>')
      .replace(/^\d+\. (.*$)/gim, '<li>$1</li>');

    html = html.replace(/(<li>.*<\/li>)/g, (match) => {
      if (match.includes('<ul>') || match.includes('<ol>')) return match;
      return '<ul>' + match + '</ul>';
    });

    return html;
  }

  _containsMermaid(content) {
    return ['mermaid','graph','flowchart','sequenceDiagram','classDiagram',
            'stateDiagram','erDiagram','journey','gantt','pie','gitgraph']
      .some(kw => content.includes(kw));
  }

  _mermaidDownloadBlock(htmlContent) {
    const full = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Диаграмма Mermaid</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; background: #fff; padding: 20px; border-radius: 8px; }
  </style>
</head>
<body>
  <div class="container"><h1>Диаграмма</h1>${htmlContent}</div>
  <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
  <script>mermaid.initialize({ startOnLoad: true });</script>
</body>
</html>`;
    const blob = new Blob([full], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    return `<div class="ba-download-wrap">
      <p>Содержимое включает диаграмму Mermaid.</p>
      <a href="${url}" download="diagram.html" class="ba-download-link">
        💾 Скачать HTML с диаграммой
      </a>
    </div>`;
  }

  /* Локализованные сообщения об ошибках */

  _mapError(msg) {
    if (msg.includes('Could not establish connection'))
      return 'Не удалось подключиться к фоновому сервису. Перезагрузите расширение и попробуйте снова.';
    if (msg.includes('Chrome runtime not available') || msg.includes('недоступен'))
      return 'Runtime расширения недоступен. Убедитесь, что расширение правильно загружено.';
    if (msg.includes('Receiving end does not exist'))
      return 'Фоновый скрипт не запущен. Перезагрузите расширение.';
    return 'Произошла ошибка: ' + msg;
  }
}

/* Инициализация */

function initializeAssistant() {
  try {
    window.browserAssistant = new BrowserAssistant();
  } catch (error) {
    console.error('Content script: ошибка инициализации ассистента:', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeAssistant);
} else {
  initializeAssistant();
}

setTimeout(() => {
  if (!window.browserAssistant) initializeAssistant();
}, 1000);