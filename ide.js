'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const initialFiles = {
    'main.py': '# 每一个有趣的想法，都从这里开始。\n\n# 先和这个世界打个招呼 👋\nname = "Whale"\nmessage = "Hello, " + name + "!"\n\nprint(message)\n\n# 试试修改你的名字，再点击运行。\n# 一点小改变，也是创造的开始。\n',
    'practice.py': '# 你的练习空间\n\nplanet = "蓝色星球"\nprint("你好，" + planet)\n',
    'README.md': '# Hello, Whale 🐳\n\n欢迎来到你的第一个项目。\n\n1. 打开 main.py\n2. 修改 name 的值\n3. 点击运行，看看会发生什么\n\n保持好奇，慢慢来。\n',
    'whale.json': '{\n    "name": "hello-whale",\n    "language": "python",\n    "version": "0.1.0"\n}\n'
  };
  const storageKey = 'whale-studio-workspace-v1';
  let files = {...initialFiles}, active = 'main.py', opened = ['main.py','practice.py'], storageAvailable = true;
  function validName(name) { return typeof name === 'string' && /^[\p{L}\p{N}_. -]{1,64}$/u.test(name) && name !== '.' && name !== '..'; }
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey));
    if (stored && stored.files && typeof stored.files === 'object' && !Array.isArray(stored.files)) {
      const entries = Object.entries(stored.files).filter(([name, value]) => validName(name) && typeof value === 'string');
      if (entries.length) files = Object.fromEntries(entries);
      active = Object.hasOwn(files, stored.active) ? stored.active : Object.keys(files)[0];
      opened = [active, ...Object.keys(files).filter(n => n !== active).slice(0,1)];
    }
  } catch { storageAvailable = false; }
  let toastTimer, saveTimer, folderOpen = true, currentPage = 1;
  function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'),2600); }
  function save(notify = false) {
    files[active] = $('code-input').value;
    try { localStorage.setItem(storageKey, JSON.stringify({files,active})); storageAvailable = true; } catch { storageAvailable = false; }
    $('saved-label').innerHTML = storageAvailable ? '<i></i> 已保存' : '仅保存在内存';
    $('storage-status').textContent = storageAvailable ? '已保存在此设备' : '存储不可用，请导出';
    if (notify) toast(storageAvailable ? '已保存，灵感不会丢。' : '浏览器存储不可用，请导出文件保存。');
  }
  function type(name) { const ext = name.split('.').pop(); return ext === 'py' ? ['py','py','Python'] : ext === 'md' ? ['M↓','md','Markdown'] : ext === 'json' ? ['{}','json','JSON'] : ['≡','text','纯文本']; }
  function fileIcon(name) { const span = document.createElement('span'); const [label, cls] = type(name); span.className = 'file-type ' + cls; span.textContent = label; return span; }
  function renderFiles() {
    const list = $('file-list'); list.replaceChildren(); const query = $('file-search').value.toLowerCase(); let matched = 0;
    for (const name of Object.keys(files)) {
      if (!name.toLowerCase().includes(query)) continue;
      matched++; const button = document.createElement('button'); button.className = 'file-row' + (active === name ? ' active' : ''); button.setAttribute('aria-current',active === name ? 'true' : 'false');
      button.append(fileIcon(name),document.createTextNode(name)); const dot = document.createElement('span'); dot.className = 'file-dot'; button.append(dot);
      button.addEventListener('click',() => { openFile(name); goToPage(1); }); list.append(button);
    }
    list.hidden = !folderOpen && !query; $('file-empty').hidden = matched > 0; $('file-count').textContent = Object.keys(files).length;
  }
  function renderTabs() {
    const tabs = $('editor-tabs'); tabs.replaceChildren();
    for (const name of opened) {
      const button = document.createElement('button'); button.className = 'editor-tab' + (active === name ? ' active' : ''); button.setAttribute('aria-label','打开 ' + name); button.setAttribute('aria-pressed',String(active === name));
      button.append(fileIcon(name),document.createTextNode(name)); const mark = document.createElement('span'); mark.className = 'tab-mark'; mark.textContent = active === name ? '•' : '·'; button.append(mark); button.addEventListener('click',() => openFile(name)); tabs.append(button);
    }
  }
  function openFile(name) {
    if (!Object.hasOwn(files,name)) return;
    save(); active = name;
    if (!opened.includes(name)) { opened.push(name); if (opened.length > 3) opened.shift(); }
    $('code-input').value = files[name]; $('code-area').scrollTop = 0; $('code-area').scrollLeft = 0; $('breadcrumb-file').textContent = name; $('chat-context').textContent = name; $('language-label').textContent = type(name)[2];
    renderFiles(); renderTabs(); highlight(); cursor(); save();
  }
  function escapeHtml(value) { return value.replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function highlight() {
    const code = $('code-input').value;
    const regex = /(#.*$|\/\/.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\b(def|class|if|else|elif|for|while|return|import|from|as|in|True|False|None|and|or|not)\b|\b(\d+(?:\.\d+)?)\b|\b(print|input|range|len|str|int)\b/gm;
    let html = '', last = 0;
    for (const match of code.matchAll(regex)) { html += escapeHtml(code.slice(last,match.index)); const cls = match[1] ? 'comment' : match[2] ? 'string' : match[3] ? 'keyword' : match[4] ? 'number' : 'function'; html += '<span class="token-' + cls + '">' + escapeHtml(match[0]) + '</span>'; last = match.index + match[0].length; }
    $('code-highlight').innerHTML = html + escapeHtml(code.slice(last)) + '\n';
    $('line-numbers').textContent = Array.from({length:code.split('\n').length},(_,i) => i + 1).join('\n');
    const style = getComputedStyle($('code-input')); const container = $('code-input').parentElement;
    container.style.minHeight = (code.split('\n').length + 1) * parseFloat(style.lineHeight) + 'px';
    // Match the actual highlighted text width, including CJK and tab expansion.
    container.style.minWidth = '0px';
    container.style.minWidth = $('code-highlight').scrollWidth + 15 + 'px';
  }
  function cursor() { const before = $('code-input').value.slice(0,$('code-input').selectionStart); const lines = before.split('\n'); $('cursor-position').textContent = '行 ' + lines.length + '，列 ' + (lines.at(-1).length + 1); }
  $('code-input').addEventListener('input',() => { files[active] = $('code-input').value; highlight(); cursor(); $('saved-label').textContent = '保存中…'; clearTimeout(saveTimer); saveTimer = setTimeout(save,350); });
  ['click','keyup','select'].forEach(event => $('code-input').addEventListener(event,cursor));
  $('code-input').addEventListener('keydown',event => { if (event.key === 'Tab') { event.preventDefault(); const input = event.target; input.setRangeText('    ',input.selectionStart,input.selectionEnd,'end'); input.dispatchEvent(new Event('input')); } });
  $('file-search').addEventListener('input',renderFiles);
  $('folder-toggle').addEventListener('click',() => { folderOpen = !folderOpen; $('folder-toggle').setAttribute('aria-expanded',String(folderOpen)); $('folder-chevron').textContent = folderOpen ? '⌄' : '›'; renderFiles(); });
  $('save-button').addEventListener('click',() => save(true));
  $('new-file').addEventListener('click',() => { $('file-error').textContent = ''; $('new-file-name').value = ''; $('file-dialog').showModal(); });
  $('cancel-new').addEventListener('click',() => $('file-dialog').close());
  $('new-file-form').addEventListener('submit',event => {
    event.preventDefault(); const name = $('new-file-name').value.trim();
    if (!validName(name)) { $('file-error').textContent = '请使用文字、数字、空格、点、短横线或下划线。'; return; }
    if (Object.keys(files).some(n => n.toLowerCase() === name.toLowerCase())) { $('file-error').textContent = '这个文件已经存在，换个名字试试。'; return; }
    Object.defineProperty(files,name,{value:'',writable:true,enumerable:true,configurable:true}); openFile(name); $('file-dialog').close(); goToPage(1); toast('已创建 ' + name); $('code-input').focus();
  });
  $('download-button').addEventListener('click',() => {
    save();
    if (window.WhaleAndroid && typeof window.WhaleAndroid.exportFile === 'function') {
      window.WhaleAndroid.exportFile(active,files[active]);
      return;
    }
    const url = URL.createObjectURL(new Blob([files[active]],{type:'text/plain;charset=utf-8'}));
    const a = document.createElement('a'); a.href = url; a.download = active; a.click();
    setTimeout(() => URL.revokeObjectURL(url),1000); toast('已导出 ' + active);
  });
  $('help-button').addEventListener('click',() => $('help-dialog').showModal()); $('close-help').addEventListener('click',() => $('help-dialog').close());
  function log(text,cls = '') { const p = document.createElement('p'); p.textContent = text; p.className = cls; $('terminal-output').append(p); $('terminal-body').scrollTop = $('terminal-body').scrollHeight; }
  function expandTerminal() { document.querySelector('.terminal').classList.remove('collapsed'); $('toggle-terminal').setAttribute('aria-expanded','true'); $('toggle-terminal').textContent = '⌄'; }
  $('toggle-terminal').addEventListener('click',() => { const collapsed = document.querySelector('.terminal').classList.toggle('collapsed'); $('toggle-terminal').setAttribute('aria-expanded',String(!collapsed)); $('toggle-terminal').textContent = collapsed ? '⌃' : '⌄'; });
  $('clear-terminal').addEventListener('click',() => $('terminal-output').replaceChildren());
  // Bounded local demo: no eval/Function, system shell, or arbitrary code execution.
  function expression(source,vars) {
    const tokens = source.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[A-Za-z_]\w*|-?\d+(?:\.\d+)?|\+|\S/g) || [];
    let result, expectValue = true;
    for (const token of tokens) {
      if (!expectValue) { if (token !== '+') throw new Error('演示仅支持字符串、数字、变量及 + 拼接。'); expectValue = true; continue; }
      let value;
      if (/^["']/.test(token)) value = token.slice(1,-1).replace(/\\([ntr\\"'])/g,(_,c) => ({n:'\n',t:'\t',r:'\r'}[c] || c));
      else if (/^-?\d/.test(token)) value = Number(token);
      else if (Object.hasOwn(vars,token)) value = vars[token];
      else throw new Error('未定义的变量：' + token);
      if (result !== undefined && typeof result !== typeof value) throw new Error('字符串与数字不能直接相加。');
      result = result === undefined ? value : result + value; expectValue = false;
    }
    if (expectValue) throw new Error('表达式不完整。'); return result;
  }
  function runFile(name) {
    save(); expandTerminal(); goToPage(1); log('❯ python ' + name,'terminal-command-line');
    if (!Object.hasOwn(files,name)) { log('找不到文件：' + name,'terminal-error'); return; }
    if (!name.endsWith('.py')) { log('请选择 .py 文件。此演示仅支持基础 Python。','terminal-error'); return; }
    const vars = Object.create(null), lines = files[name].split('\n'); let lineNumber = 0;
    try {
      if (lines.length > 2000) throw new Error('演示最多运行 2000 行。');
      for (const line of lines) {
        lineNumber++; const text = line.trim(); if (!text || text.startsWith('#')) continue;
        const assignment = text.match(/^([A-Za-z_]\w*)\s*=\s*(.+)$/), print = text.match(/^print\s*\((.*)\)\s*$/);
        if (assignment) vars[assignment[1]] = expression(assignment[2],vars);
        else if (print) log(print[1].trim() ? String(expression(print[1],vars)) : '');
        else throw new Error('此语法超出演示范围，请使用变量赋值与 print。');
      }
      log('✓ 演示运行完成','terminal-success');
    } catch(error) { log('第 ' + lineNumber + ' 行 · ' + error.message,'terminal-error'); }
  }
  $('run-button').addEventListener('click',() => runFile(active));
  $('terminal-form').addEventListener('submit',event => {
    event.preventDefault(); const command = $('terminal-command').value.trim(); if (!command) return; $('terminal-command').value = '';
    const python = command.match(/^python(?:3)?\s+(.+)$/); if (python) { runFile(python[1]); return; }
    log('❯ ' + command,'terminal-command-line');
    if (command === 'clear') $('terminal-output').replaceChildren();
    else if (command === 'help') log('help       查看帮助\nls         列出文件\ncat 文件名  查看文件\npython 文件名  运行基础 Python 演示\nclear      清空终端\n\n此终端不连接系统 Shell。');
    else if (command === 'ls') log(Object.keys(files).join('\n'));
    else if (command.startsWith('cat ')) { const name = command.slice(4).trim(); log(Object.hasOwn(files,name) ? files[name] : '找不到文件：' + name); }
    else log('不支持的演示命令。输入 help 查看帮助。','terminal-error');
  });
  document.addEventListener('keydown',event => { if (event.ctrlKey || event.metaKey) { if (event.key.toLowerCase() === 's') { event.preventDefault(); save(true); } if (event.key === 'Enter' && !event.target.closest('dialog')) { event.preventDefault(); runFile(active); } } });
  const questions = [
    ['01 / PYTHON BASICS','字符串是什么？','字符串是被单引号或双引号包围的文字。例如："Hello, Whale!"。','字符串'],
    ['02 / THINK IN CODE','变量就像一个什么？','像一个带标签的盒子。name = "Whale" 把文字放进名为 name 的盒子里。','变量'],
    ['03 / SMALL DISCOVERIES','print() 会做什么？','把括号里的内容输出到终端。试试 print("你好，世界")，然后点击运行。','输出']
  ];
  const flippedCards = new Set(), flashcards = [];
  const cardWords = ['STRING','VARIABLE','PRINT'];
  let cardIndex = 0, changingCard = false;
  questions.forEach(([meta,question,answer,tag],index) => {
    const button = document.createElement('button'); button.className = 'flashcard'; button.type = 'button';
    // Match mobile.html's preserved-3D front/back flip instead of replacing text.
    button.innerHTML = '<span class="flashcard-inner"><span class="flashcard-face flashcard-front"><span class="flashcard-meta"></span><span class="flashcard-center"><span class="flashcard-symbol">✧</span><span class="flashcard-word"></span><strong></strong><span class="flashcard-topic"></span></span><span class="flashcard-foot">轻点揭晓 <span>↻</span></span></span><span class="flashcard-face flashcard-back"><span class="flashcard-meta"></span><span class="flashcard-center"><span class="flashcard-answer-label">原来如此。</span><strong></strong></span><span class="flashcard-foot">轻点回到问题 <span>↻</span></span></span></span>';
    button.querySelectorAll('.flashcard-meta').forEach(e => e.textContent = meta);
    button.querySelector('.flashcard-word').textContent = cardWords[index];
    button.querySelector('.flashcard-front strong').textContent = question;
    button.querySelector('.flashcard-topic').textContent = tag;
    button.querySelector('.flashcard-back strong').textContent = answer;
    button.addEventListener('click',() => {
      if (index !== cardIndex || changingCard) return;
      if (flippedCards.has(index)) flippedCards.delete(index); else flippedCards.add(index);
      renderCardStack();
    });
    flashcards.push(button); $('knowledge-cards').append(button);
  });
  function renderCardStack() {
    flashcards.forEach((button,index) => {
      const depth = (index - cardIndex + questions.length) % questions.length;
      const flipped = flippedCards.has(index);
      button.dataset.depth = depth; button.style.zIndex = questions.length - depth;
      button.classList.toggle('is-flipped',flipped);
      button.inert = depth !== 0; button.tabIndex = depth === 0 ? 0 : -1;
      button.setAttribute('aria-hidden',String(depth !== 0));
      button.setAttribute('aria-pressed',String(flipped));
      button.setAttribute('aria-label',flipped ? questions[index][2] + '，点击回到问题' : questions[index][1] + '，点击查看答案');
      button.querySelector('.flashcard-front').setAttribute('aria-hidden',String(flipped));
      button.querySelector('.flashcard-back').setAttribute('aria-hidden',String(!flipped));
    });
    $('card-position').textContent = '第 ' + (cardIndex + 1) + ' 张，共 ' + questions.length + ' 张';
  }
  async function changeCard(direction) {
    if (changingCard) return;
    changingCard = true;
    $('knowledge-cards').classList.add('is-changing-card');
    const outgoing = flashcards[cardIndex], hadFocus = document.activeElement === outgoing;
    const reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;
    try {
      if (!reduced) {
        const start = getComputedStyle(outgoing).transform;
        const animation = outgoing.animate([{transform:start,opacity:1},{transform:'translateX(' + (-direction * 125) + '%) rotate(' + (-direction * 19) + 'deg)',opacity:0}],{duration:230,easing:'cubic-bezier(.4,.1,.2,1)'});
        await animation.finished;
      }
      outgoing.style.transform = ''; outgoing.classList.remove('dragging');
      cardIndex = (cardIndex + direction + questions.length) % questions.length;
      renderCardStack();
      const incoming = flashcards[cardIndex];
      if (hadFocus) incoming.focus({preventScroll:true});
      if (!reduced) await incoming.animate([{transform:'translateY(18px) scale(.94) rotate(' + (direction * 3) + 'deg)'},{transform:'translateY(0) scale(1) rotate(0deg)'}],{duration:360,easing:'cubic-bezier(.2,.8,.2,1)'}).finished;
    } finally { outgoing.style.transform = ''; outgoing.classList.remove('dragging'); $('knowledge-cards').classList.remove('is-changing-card'); changingCard = false; }
  }
  $('cards-drawer').addEventListener('keydown',event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); changeCard(event.key === 'ArrowRight' ? 1 : -1); }
  });
  renderCardStack();
  let cardsOpen = false;
  function setCardsOpen(open, restoreFocus = true) {
    if (cardsOpen === open) return;
    cardsOpen = open;
    // Keep the chat mounted: its draft, conversation and scroll position survive.
    $('assistant').classList.toggle('drawer-open',open);
    $('cards-peek').setAttribute('aria-expanded',String(open));
    $('cards-drawer').setAttribute('aria-hidden',String(!open));
    $('cards-drawer').inert = !open;
    $('assistant-content').inert = open;
    $('cards-peek').inert = open;
    $('cards-backdrop').hidden = !open;
    if (open) $('close-cards').focus({preventScroll:true});
    else if (restoreFocus) $('cards-peek').focus({preventScroll:true});
    else if ($('cards-drawer').contains(document.activeElement)) document.activeElement.blur();
  }
  $('cards-peek').addEventListener('click',() => setCardsOpen(true));
  $('close-cards').addEventListener('click',() => setCardsOpen(false));
  $('cards-backdrop').addEventListener('click',() => setCardsOpen(false));
  document.addEventListener('keydown',event => {
    if (!cardsOpen) return;
    if (event.key === 'Escape') { event.preventDefault(); setCardsOpen(false); }
    if (event.key === 'Tab') {
      const buttons = [...$('cards-drawer').querySelectorAll('button')].filter(button => !button.inert && !button.disabled);
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  function ask(question) {
    if (!question.trim()) return;
    const user = document.createElement('div'); user.className = 'user-message'; user.textContent = question; $('chat-messages').append(user); let reply;
    if (/挑战|练习/.test(question)) reply = '来做一个小挑战吧：\n① 把 main.py 中的 name 改成你的名字。\n② 再加一行 print("今天也要保持好奇！")。\n③ 点击运行，看看终端里的问候。\n\n完成后，去知识卡片看看变量的小秘密。';
    else if (/报错|错误|调试/.test(question)) reply = '先检查这三件事：\n① 引号和括号是否成对？\n② 变量名是否和定义时一致？\n③ 字符串与数字是否被直接相加？\n\n终端的行号可以帮助定位问题。当前仅演示变量赋值、+ 和 print。';
    else if (/解释|代码|变量|print/.test(question)) {
      const code = files[active], assignments = (code.match(/^[A-Za-z_]\w*\s*=/gm) || []).length, prints = (code.match(/^\s*print\s*\(/gm) || []).length;
      reply = '一起看看 ' + active + '：\n\n' + (active.endsWith('.py') ? '这个文件中有 ' + assignments + ' 处变量赋值和 ' + prints + ' 处 print 输出。\n「=」把右边的值放进左边的变量；print() 把内容输出到下方终端。\n\n试着修改一处文字，再点运行，观察结果的变化。' : '这是一个 ' + type(active)[2] + ' 文件。你可以在编辑器中修改内容，用保存按钮留在本地，或导出成文件。');
    } else reply = '我收到了你的问题：「' + question.slice(0,150) + '」\n\n目前我是本地演示助手，还不能生成真实 AI 回答。你可以试试「解释这段代码」「给我一个小挑战」或「帮我检查报错」，也可以切换到知识卡片学习基础概念。';
    const response = document.createElement('div'); response.className = 'assistant-message'; const label = document.createElement('span'); label.className = 'message-label'; label.textContent = 'whale · 本地演示'; const p = document.createElement('p'); p.textContent = reply; response.append(label,p); $('chat-messages').append(response); $('chat-messages').scrollTop = $('chat-messages').scrollHeight; $('chat-input').value = '';
  }
  $('chat-form').addEventListener('submit',event => { event.preventDefault(); ask($('chat-input').value); });
  $('chat-input').addEventListener('keydown',event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !event.ctrlKey && !event.metaKey) { event.preventDefault(); ask($('chat-input').value); } });
  document.querySelectorAll('[data-question]').forEach(button => button.addEventListener('click',() => ask(button.dataset.question)));
  const deck = $('deck'), panels = [...deck.querySelectorAll('.panel')], mobile = matchMedia('(max-width:900px)');
  function updateNav(index) { if (index !== 2) setCardsOpen(false,false); currentPage = index; document.querySelectorAll('[data-page]').forEach((button,i) => { button.classList.toggle('active',i === index); if (i === index) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current'); }); }
  function goToPage(index,smooth = true) { if (index !== 2) setCardsOpen(false,false); updateNav(index); if (!mobile.matches) return; deck.scrollTo({left:panels[index].offsetLeft - panels[0].offsetLeft,behavior:smooth && !matchMedia('(prefers-reduced-motion:reduce)').matches ? 'smooth' : 'instant'}); }
  let scrollFrame, resizing = false;
  deck.addEventListener('scroll',() => { cancelAnimationFrame(scrollFrame); scrollFrame = requestAnimationFrame(() => { if (mobile.matches && !resizing) { const index = Math.round(deck.scrollLeft / (panels[0].getBoundingClientRect().width + 12)); updateNav(Math.max(0,Math.min(2,index))); } }); },{passive:true});
  document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click',() => goToPage(Number(button.dataset.page))));
  // The assistant is the last work card. A subsequent left swipe opens its drawer;
  // a right swipe first closes the drawer, then returns to the editor.
  // Pointer events support touch, pen and mouse while pan-y keeps vertical reading native.
  let gesture = null, suppressClickUntil = 0;
  $('assistant').addEventListener('pointerdown',event => {
    if (!event.isPrimary || event.button !== 0 || event.target.closest('input,textarea,a')) return;
    const lastCard = panels[2].getBoundingClientRect(), viewport = deck.getBoundingClientRect();
    const visibleWidth = Math.min(lastCard.right,viewport.right) - Math.max(lastCard.left,viewport.left);
    // WebView versions differ in trailing flex padding and scroll rounding.
    // Gate on the card actually being visible, rather than an exact scroll offset.
    if (mobile.matches && (currentPage !== 2 || visibleWidth < lastCard.width * .98)) return;
    const card = cardsOpen && event.target.closest('#knowledge-cards') ? flashcards[cardIndex] : null;
    if (card && changingCard) return;
    gesture = {id:event.pointerId,x:event.clientX,y:event.clientY,horizontal:false,card};
  });
  $('assistant').addEventListener('pointermove',event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (!gesture.horizontal && Math.abs(dy) > 12 && Math.abs(dy) >= Math.abs(dx)) { gesture = null; return; }
    if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.25) {
      gesture.horizontal = true;
      $('assistant').setPointerCapture(event.pointerId);
      event.preventDefault();
      if (gesture.card) {
        gesture.card.classList.add('dragging');
        gesture.card.style.transform = 'translateX(' + dx + 'px) rotate(' + (dx / 18) + 'deg)';
      }
    }
  });
  $('assistant').addEventListener('pointerup',event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x, horizontal = gesture.horizontal, card = gesture.card;
    gesture = null;
    if (!horizontal) return;
    suppressClickUntil = performance.now() + 400;
    if (card) {
      card.classList.remove('dragging');
      if (Math.abs(dx) >= Math.min(64,card.clientWidth * .22)) changeCard(dx < 0 ? 1 : -1);
      else card.style.transform = '';
      return;
    }
    if (Math.abs(dx) < 50) return;
    if (dx < 0 && !cardsOpen) setCardsOpen(true);
    else if (dx > 0 && cardsOpen) setCardsOpen(false);
    else if (dx > 0 && mobile.matches) goToPage(1);
  });
  $('assistant').addEventListener('pointercancel',() => { if (gesture?.card) { gesture.card.classList.remove('dragging'); gesture.card.style.transform = ''; } gesture = null; });
  $('assistant').addEventListener('click',event => {
    if (event.detail > 0 && performance.now() < suppressClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
  },true);
  let resizeTimer; window.addEventListener('resize',() => { resizing = true; clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { highlight(); goToPage(currentPage,false); resizing = false; },100); });
  window.addEventListener('pagehide',() => save());
  $('code-input').value = files[active]; $('breadcrumb-file').textContent = active; $('chat-context').textContent = active; $('language-label').textContent = type(active)[2];
  renderFiles(); renderTabs(); highlight(); cursor(); save(); requestAnimationFrame(() => goToPage(1,false));
})();
